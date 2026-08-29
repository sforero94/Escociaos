-- Migración 132: fn_ronda_proponer_ajuste -- cantidad física SIEMPRE
-- reconfirmada a mano antes de proponer un ajuste sin respaldo
--
-- Hallazgo real de Santiago probando en vivo en producción (2026-08-28,
-- misma sesión de la migración 131/CA-4): narró por voz "tres bultos de 50
-- kilos de 15-15-15" -- el intérprete de voz extrajo `cantidad_fisica = 3`
-- (el número de bultos, sin multiplicar por el peso de cada uno) en vez de
-- 150. El caso llegó a un desenlace correcto de pura casualidad: la
-- excepción tomó la vía CON respaldo (`fn_ronda_resolver_con_captura`), que
-- YA exige que David teclee la cantidad real a mano (CA-8) -- ahí el "3"
-- mal interpretado nunca llegó al inventario. Pero la vía SIN respaldo
-- (`fn_ronda_proponer_ajuste` -> `fn_ronda_decidir_ajuste` ->
-- `fn_ronda_aplicar_ajuste`) no tenía ningún punto equivalente: el delta se
-- calculaba directo de `rondas_excepciones.cantidad_fisica`, el valor
-- congelado que puso el intérprete al reportar, sin que NADIE lo
-- reconfirmara antes de aplicarlo al inventario real. Si el mismo hallazgo
-- hubiera ido por esa vía, el "3" habría llegado tal cual a
-- `movimientos_inventario` -- ni David ni Uriel ni Santiago lo habrían
-- vuelto a ver como número antes de que se aplicara.
--
-- Decisión del dueño (2026-08-28, elegida entre tres opciones -- explicar/
-- proponer/aprobar): la reconfirmación va AL PROPONER. Quien propone el
-- ajuste (David o Uriel, B-5) tiene que teclear la cantidad física real --
-- no elegir la causa y listo -- mismo nivel de fricción deliberada que ya
-- tiene la vía con respaldo (CA-8: David teclea tipo/cantidad/fecha a
-- mano). El corrector fue el prompt de `interpretarNota.ts` (regla 4 nueva:
-- "N bultos/sacos de X kilos" se multiplica) -- pero un prompt de lenguaje
-- natural nunca es una garantía; esta migración es la garantía estructural.
--
-- QUÉ CAMBIA (sólo fn_ronda_proponer_ajuste, CREATE OR REPLACE -- nunca se
-- edita 126/130, ya aplicadas): el payload ahora EXIGE
-- `cantidad_fisica_confirmada` (NUMERIC, >= 0 -- un físico de cero es un
-- valor real, "no queda nada" es una respuesta válida, no un dato
-- faltante). La función:
--   1. Rechaza el payload si el campo falta o es negativo -- nunca infiere
--      ni reusa el valor congelado en silencio.
--   2. Calcula el delta contra la cantidad CONFIRMADA, nunca contra la que
--      puso el intérprete: `v_delta := v_cantidad_confirmada -
--      v_excepcion.teorico_conteo` (antes: `v_excepcion.cantidad_fisica -
--      v_excepcion.teorico_conteo`).
--   3. Sobrescribe `rondas_excepciones.cantidad_fisica` con el valor
--      confirmado -- el registro que queda para el reporte de cierre y el
--      historial refleja lo que un humano confirmó, no lo que el modelo
--      entendió. (El valor original que puso el intérprete no se preserva
--      en una columna aparte -- decisión deliberada para no ampliar el
--      esquema en esta migración; si hace falta auditar la divergencia
--      intérprete-vs-confirmado más adelante, es una migración propia.)
--
-- El resto del contrato -- autorización (David o Uriel, nunca Santiago),
-- la guarda de estado de la 130, la causa raíz activa, la nota exigida por
-- R-7 -- no cambia.
--
-- Verificado contra el catálogo vivo antes de escribir esto
-- (pg_get_functiondef): el cuerpo de producción es exactamente el que dejó
-- la 130, sin ningún cambio posterior.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'fn_ronda_proponer_ajuste'
  ) THEN
    RAISE EXCEPTION '132 ABORTADA (pre): fn_ronda_proponer_ajuste no existe -- depende de que 126/130 ya estén aplicadas.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'fn_ronda_proponer_ajuste'
       AND pg_get_functiondef(p.oid) ILIKE '%v_cantidad_confirmada%'
  ) THEN
    RAISE EXCEPTION '132 ABORTADA (pre): fn_ronda_proponer_ajuste YA exige cantidad_fisica_confirmada -- la causa más probable es que esta migración ya se aplicó. Revisar a mano antes de reintentar.';
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
  v_cantidad_confirmada NUMERIC := (payload ->> 'cantidad_fisica_confirmada')::NUMERIC;
  v_excepcion      RECORD;
  v_causa          RECORD;
  v_delta          NUMERIC;
  v_modulo_intento TEXT;
  v_autorizado     BOOLEAN := FALSE;
  v_ultimo_error   TEXT;
BEGIN
  -- Autorización: SIN CAMBIOS respecto a la 126/130 (B-5, "David o Uriel",
  -- nunca Santiago -- ver el comentario de la 126).
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
  -- ═══ GUARDA NUEVA (132) ═══════════════════════════════════════════════
  -- La cantidad física SIEMPRE se reconfirma a mano al proponer -- nunca se
  -- infiere del valor que congeló el intérprete. Un físico de 0 es un dato
  -- real (nunca se rechaza), pero el campo tiene que venir SIEMPRE.
  IF v_cantidad_confirmada IS NULL THEN
    RAISE EXCEPTION 'fn_ronda_proponer_ajuste: cantidad_fisica_confirmada es requerida -- quien propone el ajuste tiene que reconfirmar a mano la cantidad física, nunca se infiere del valor que puso el intérprete de voz.';
  END IF;
  IF v_cantidad_confirmada < 0 THEN
    RAISE EXCEPTION 'fn_ronda_proponer_ajuste: cantidad_fisica_confirmada no puede ser negativa (recibido %).', v_cantidad_confirmada;
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
  IF v_excepcion.estado <> 'explicada' THEN
    RAISE EXCEPTION 'fn_ronda_proponer_ajuste: la excepción % no está en estado "explicada" (estado actual: %) -- no se puede proponer, ni volver a proponer, un ajuste sobre ella. Un callback_data reenviado no puede reabrir una excepción ya propuesta, decidida o aplicada.', v_excepcion_id, v_excepcion.estado;
  END IF;

  -- Delta contra la cantidad CONFIRMADA, nunca contra la que puso el
  -- intérprete de voz (esa es exactamente la falla que esta migración cierra).
  v_delta := v_cantidad_confirmada - v_excepcion.teorico_conteo;

  UPDATE rondas_excepciones SET
    estado = 'ajuste_propuesto',
    cantidad_fisica = v_cantidad_confirmada,
    propuesta_delta = v_delta,
    propuesta_causa = v_causa_clave,
    propuesta_nota = v_nota,
    propuesta_en = now(),
    propuesta_por_usuario = v_actor_usuario,
    propuesta_por_telegram = v_actor_telegram
  WHERE id = v_excepcion_id;

  RETURN jsonb_build_object('excepcion_id', v_excepcion_id, 'estado', 'ajuste_propuesto', 'propuesta_delta', v_delta, 'cantidad_fisica_confirmada', v_cantidad_confirmada);
END $$;

COMMENT ON FUNCTION fn_ronda_proponer_ajuste(JSONB) IS
  'Creada por la migración 126, corregida por la 130 (guarda de estado) y '
  'por la 132 (2026-08-28): exige cantidad_fisica_confirmada -- quien '
  'propone reconfirma a mano la cantidad física, nunca se infiere del '
  'valor congelado por el intérprete de voz. El delta y '
  'rondas_excepciones.cantidad_fisica se recalculan/sobrescriben con el '
  'valor confirmado. El resto del contrato (autorización, guarda de '
  'estado, causa activa, nota R-7) no cambia.';

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

  IF v_def NOT ILIKE '%v_cantidad_confirmada%' THEN
    RAISE EXCEPTION '132 ABORTADA (post): la exigencia de cantidad_fisica_confirmada no quedó en el cuerpo de la función.';
  END IF;
  IF v_def NOT ILIKE '%cantidad_fisica = v_cantidad_confirmada%' THEN
    RAISE EXCEPTION '132 ABORTADA (post): el UPDATE no sobrescribe rondas_excepciones.cantidad_fisica con el valor confirmado.';
  END IF;
  IF v_def NOT ILIKE '%v_excepcion.estado <> ''explicada''%' THEN
    RAISE EXCEPTION '132 ABORTADA (post): la guarda de estado de la 130 se perdió en este reemplazo.';
  END IF;
  IF v_secdef IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION '132 ABORTADA (post): la función quedó SECURITY DEFINER -- debía seguir SECURITY INVOKER (prosecdef=false).';
  END IF;
  IF NOT ('search_path=public, pg_temp' = ANY(COALESCE(v_searchp, ARRAY[]::TEXT[]))) THEN
    RAISE EXCEPTION '132 ABORTADA (post): el search_path pineado no sobrevivió al CREATE OR REPLACE. proconfig actual: %', v_searchp;
  END IF;
  IF v_acl IS NULL OR v_acl NOT LIKE '%authenticated=X%' OR v_acl NOT LIKE '%service_role=X%' OR v_acl LIKE '%anon%' THEN
    RAISE EXCEPTION '132 ABORTADA (post): el ACL de la función cambió respecto al esperado (authenticated+service_role, nunca anon). ACL actual: %', v_acl;
  END IF;
END $$;

-- ROLLBACK (no ejecutar salvo instrucción explícita del dueño): restaurar el
-- cuerpo previo -- el que dejó la 130 -- con un segundo CREATE OR REPLACE
-- FUNCTION fn_ronda_proponer_ajuste(payload JSONB) reproduciendo ese cuerpo
-- literal (ver el bloque "verificado contra el catálogo vivo" al inicio de
-- este archivo). Revertir esto reabre el hueco: un ajuste sin respaldo
-- podría volver a aplicarse con la cantidad que puso el intérprete de voz,
-- sin que nadie la reconfirme -- no hacerlo sin una razón explícita.
