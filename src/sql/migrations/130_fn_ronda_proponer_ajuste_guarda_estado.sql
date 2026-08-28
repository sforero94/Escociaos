-- Migración 130: fn_ronda_proponer_ajuste -- la guarda de estado que faltaba
--
-- Hallazgo del orquestador durante la revisión de Fase 4 (Telegram, David y
-- Santiago) de docs/brief_tecnico_verificacion_inventario.md §13, 2026-08-28.
-- `fn_ronda_proponer_ajuste` (migración 126, ya aplicada a producción) es la
-- ÚNICA de las diez RPC de la ronda de inventario que NO revalida el
-- `estado` actual de la excepción antes de escribir -- sólo exige
-- `explicacion_david_en IS NOT NULL`, una condición que, una vez cierta,
-- queda cierta para siempre. Las otras cuatro RPC del mismo ciclo sí tienen
-- su propia guarda de estado, verificado contra el cuerpo vivo de cada una:
--   - fn_ronda_explicacion_david: estado IN ('reportada','explicacion_precargada')
--   - fn_ronda_resolver_con_captura: estado = 'explicada'
--   - fn_ronda_decidir_ajuste: estado = 'ajuste_propuesto'
--   - fn_ronda_aplicar_ajuste: estado = 'ajuste_aprobado', con FOR UPDATE,
--     documentado LITERAL en su propio comentario como "doble aplicación
--     imposible"
--
-- CONSECUENCIA del hueco. Un `callback_data` de Telegram de "Confirmar
-- propuesta" (`rpa:<excepcion_id>:c<indice>:ok`, `bot.ts`, Fase 4) que quede
-- vivo después de que la excepción ya avanzó -- por ejemplo, dos corridas de
-- `/proponer` sobre la misma excepción antes de completar la primera, o un
-- mensaje de Telegram viejo reabierto días después, ambos casos reales
-- porque Telegram nunca expira un `callback_data` por sí solo -- puede
-- volver a llamar `fn_ronda_proponer_ajuste` cuando el estado real ya es
-- 'ajuste_propuesto', 'ajuste_aprobado', 'ajuste_desestimado' o incluso
-- 'ajuste_aplicado'. Hoy eso RESETEA `estado` a 'ajuste_propuesto' en
-- silencio, dejando las columnas `decision_*`/`aplicacion_movimiento_id` de
-- una decisión previa intactas pero huérfanas de un estado que ya no las
-- referencia -- y si la excepción "reaparece" en la lista de `/aprobar` y
-- Santiago vuelve a aprobarla, `fn_ronda_aplicar_ajuste` se ejecuta una
-- SEGUNDA vez sobre el mismo hecho: un segundo movimiento de inventario, un
-- segundo delta aplicado al mismo saldo.
--
-- Es exactamente el riesgo que P-1 (Deshacer, §15.1 del brief técnico) ya
-- identificó para este tipo de botón -- "un callback_data se puede reenviar,
-- así que la autorización no está en el botón sino en el RPC" -- y que las
-- otras cuatro RPC de este ciclo ya cierran. Esta migración cierra la
-- quinta. No es una reinterpretación de B-5 (David o Uriel proponen, nunca
-- Santiago) ni de ninguna otra regla de negocio: la autorización, el cálculo
-- del delta y el resto del contrato de la 126 quedan exactamente iguales.
--
-- Verificado contra la función viva ANTES de escribir esto
-- (pg_get_functiondef): el cuerpo de producción no tiene ningún IF sobre
-- `v_excepcion.estado`, y el único trigger de `rondas_excepciones` es el
-- genérico `update_updated_at_column` -- no hay ninguna otra capa que ya
-- esté cerrando este hueco por otro lado.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'fn_ronda_proponer_ajuste'
  ) THEN
    RAISE EXCEPTION '130 ABORTADA (pre): fn_ronda_proponer_ajuste no existe -- esta migración depende de que la 126 ya esté aplicada.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'fn_ronda_proponer_ajuste'
       AND pg_get_functiondef(p.oid) ILIKE '%v_excepcion.estado <> ''explicada''%'
  ) THEN
    RAISE EXCEPTION '130 ABORTADA (pre): fn_ronda_proponer_ajuste YA tiene la guarda de estado -- la causa más probable es que esta migración ya se aplicó. Revisar a mano antes de reintentar.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION fn_ronda_proponer_ajuste(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor_usuario  UUID := NULLIF(payload ->> 'actor_usuario_id', '')::UUID;
  v_actor_telegram UUID := NULLIF(payload ->> 'actor_telegram_usuario_id', '')::UUID;
  v_excepcion_id   UUID := NULLIF(payload ->> 'excepcion_id', '')::UUID;
  v_causa_clave    TEXT := payload ->> 'propuesta_causa';
  v_nota           TEXT := NULLIF(payload ->> 'propuesta_nota', '');
  v_excepcion      RECORD;
  v_causa          RECORD;
  v_delta          NUMERIC;
  v_modulo_intento TEXT;
  v_autorizado     BOOLEAN := FALSE;
  v_ultimo_error   TEXT;
BEGIN
  -- Autorización: SIN CAMBIOS respecto a la 126 (B-5, "David o Uriel", nunca
  -- Santiago -- ver el comentario de esa migración).
  FOREACH v_modulo_intento IN ARRAY ARRAY['inventario_ronda', 'inventario_explicacion'] LOOP
    BEGIN
      PERFORM fn_ronda_validar_actor(v_actor_usuario, v_actor_telegram, v_modulo_intento);
      v_autorizado := TRUE;
      EXIT;
    EXCEPTION WHEN OTHERS THEN
      v_ultimo_error := SQLERRM;
    END;
  END LOOP;
  IF NOT v_autorizado THEN
    RAISE EXCEPTION 'fn_ronda_proponer_ajuste: actor no autorizado -- debe tener el módulo inventario_ronda (Uriel) o inventario_explicacion (David), nunca inventario_aprobacion (B-5: Santiago no propone, sólo decide). Último error: %', v_ultimo_error;
  END IF;

  IF v_excepcion_id IS NULL THEN
    RAISE EXCEPTION 'fn_ronda_proponer_ajuste: excepcion_id es requerido.';
  END IF;
  IF v_causa_clave IS NULL OR v_causa_clave = '' THEN
    RAISE EXCEPTION 'fn_ronda_proponer_ajuste: propuesta_causa es requerida.';
  END IF;

  SELECT * INTO v_causa FROM inventario_causas_raiz WHERE clave = v_causa_clave AND activo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_ronda_proponer_ajuste: "%" no es una causa raíz activa del catálogo (R-7).', v_causa_clave;
  END IF;
  IF v_causa.exige_nota AND v_nota IS NULL THEN
    RAISE EXCEPTION 'fn_ronda_proponer_ajuste: la causa "%s" exige una nota (R-7, "Otro (con nota)") y propuesta_nota vino vacía.', v_causa.etiqueta;
  END IF;

  SELECT * INTO v_excepcion FROM rondas_excepciones WHERE id = v_excepcion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_ronda_proponer_ajuste: no existe rondas_excepciones %.', v_excepcion_id;
  END IF;
  IF v_excepcion.explicacion_david_en IS NULL THEN
    RAISE EXCEPTION 'fn_ronda_proponer_ajuste: la excepción % todavía no tiene explicación de David -- no se puede proponer un ajuste antes de esa palabra (CA-38).', v_excepcion_id;
  END IF;
  -- ═══ GUARDA NUEVA (130) ═══════════════════════════════════════════════
  -- Sólo se puede proponer sobre una excepción 'explicada' -- el mismo
  -- patrón que ya usan las otras cuatro RPC del ciclo. Sin esto, un
  -- `callback_data` reenviado (P-1) puede resetear una excepción YA
  -- decidida/aplicada de vuelta a 'ajuste_propuesto' y abrir la puerta a una
  -- segunda decisión y una segunda aplicación sobre el mismo hecho.
  IF v_excepcion.estado <> 'explicada' THEN
    RAISE EXCEPTION 'fn_ronda_proponer_ajuste: la excepción % no está en estado "explicada" (estado actual: %) -- no se puede proponer, ni volver a proponer, un ajuste sobre ella. Un callback_data reenviado no puede reabrir una excepción ya propuesta, decidida o aplicada.', v_excepcion_id, v_excepcion.estado;
  END IF;

  v_delta := v_excepcion.cantidad_fisica - v_excepcion.teorico_conteo;

  UPDATE rondas_excepciones SET
    estado = 'ajuste_propuesto',
    propuesta_delta = v_delta,
    propuesta_causa = v_causa_clave,
    propuesta_nota = v_nota,
    propuesta_en = now(),
    propuesta_por_usuario = v_actor_usuario,
    propuesta_por_telegram = v_actor_telegram
  WHERE id = v_excepcion_id;

  RETURN jsonb_build_object('excepcion_id', v_excepcion_id, 'estado', 'ajuste_propuesto', 'propuesta_delta', v_delta);
END $$;

COMMENT ON FUNCTION fn_ronda_proponer_ajuste(JSONB) IS
  'Creada por la migración 126, corregida por la 130 (2026-08-28): agrega '
  'la guarda "estado = explicada" que faltaba -- ver el encabezado de la '
  '130. El resto del contrato (autorización inventario_ronda/'
  'inventario_explicacion, delta server-side R-4, no toca inventario) no '
  'cambia.';

-- CREATE OR REPLACE preserva OID, dueño y ACL cuando la firma no cambia
-- (no hace falta repetir REVOKE/GRANT) -- pero se verifica igual, en vez de
-- confiar en la documentación de Postgres sin comprobarlo contra esta base.
DO $$
DECLARE
  v_def       TEXT;
  v_acl       TEXT;
  v_secdef    BOOLEAN;
  v_searchp   TEXT[];
BEGIN
  SELECT pg_get_functiondef(p.oid), p.proacl::TEXT, p.prosecdef, p.proconfig
    INTO v_def, v_acl, v_secdef, v_searchp
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_ronda_proponer_ajuste';

  IF v_def NOT ILIKE '%v_excepcion.estado <> ''explicada''%' THEN
    RAISE EXCEPTION '130 ABORTADA (post): la guarda de estado no quedó en el cuerpo de la función.';
  END IF;
  -- `prosecdef`/`proconfig` son columnas booleanas/array de pg_proc, no texto
  -- a adivinar: `pg_get_functiondef` OMITE "SECURITY INVOKER" del DDL cuando
  -- es el default (que es el bug exacto que abortó el primer intento de esta
  -- misma migración -- ver esa corrida).
  IF v_secdef IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION '130 ABORTADA (post): la función quedó SECURITY DEFINER -- debía seguir SECURITY INVOKER (prosecdef=false).';
  END IF;
  IF NOT ('search_path=public, pg_temp' = ANY(COALESCE(v_searchp, ARRAY[]::TEXT[]))) THEN
    RAISE EXCEPTION '130 ABORTADA (post): el search_path pineado no sobrevivió al CREATE OR REPLACE. proconfig actual: %', v_searchp;
  END IF;
  IF v_acl IS NULL OR v_acl NOT LIKE '%authenticated=X%' OR v_acl NOT LIKE '%service_role=X%' OR v_acl LIKE '%anon%' THEN
    RAISE EXCEPTION '130 ABORTADA (post): el ACL de la función cambió respecto al esperado (authenticated+service_role, nunca anon). ACL actual: %', v_acl;
  END IF;
END $$;

-- ROLLBACK (no ejecutar salvo instrucción explícita del dueño): restaurar el
-- cuerpo previo a esta migración -- el que aplicó la 126 -- con un segundo
-- CREATE OR REPLACE FUNCTION fn_ronda_proponer_ajuste(payload JSONB)
-- reproduciendo ese cuerpo literal (ver src/sql/migrations/126_ronda_inventario_rpcs.sql).
-- Revertir esto reabre el hueco descrito arriba -- no hacerlo sin una razón
-- explícita.
