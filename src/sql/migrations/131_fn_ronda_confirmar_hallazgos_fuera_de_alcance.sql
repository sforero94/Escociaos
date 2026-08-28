-- Migración 131: fn_ronda_confirmar_hallazgos -- CA-4, producto en cero
--
-- Hallazgo real de Santiago probando en vivo en producción (2026-08-28,
-- primera ronda real de la finca): narró por voz "15-15-15, tres bultos de
-- 50 kilos" -- un fertilizante que SÍ existe en `productos`
-- (id a8aa8dcd-651f-46ce-ab50-803b171aa866, categoría Fertilizante) pero con
-- `cantidad_actual = 0` y `activo = false`, así que `fn_ronda_abrir` (126)
-- nunca lo congeló en `rondas_inventario_alcance` -- esa función sólo
-- selecciona `WHERE cantidad_actual > 0`. El intérprete de voz marcaba el
-- hallazgo "no identificado" una y otra vez, sin importar cuántas veces se
-- corrigiera por texto: el producto es estructuralmente imposible de
-- resolver contra un alcance que nunca lo incluyó.
--
-- El brief de producto YA contempla exactamente este caso -- CA-4, literal:
-- "El alcance por defecto de la ronda son los productos con existencia > 0
-- al momento de abrirla... Los productos en cero no entran solos; Uriel
-- puede reportar uno igual si lo encuentra." La implementación de la Fase 1
-- (migración 126) no lo cubría: es un gap real entre el brief de producto y
-- el código, no una reinterpretación de la regla.
--
-- Distinto de P-3 (§15.3 del brief técnico, decisión del dueño (a)): un
-- producto que pasa de 0 a >0 DURANTE una ronda abierta por una COMPRA
-- normal (NewPurchase.tsx) se queda deliberadamente fuera del alcance y
-- aparece en el reporte de cierre como "movimiento con la ronda abierta".
-- Esta migración NO toca ese caso ni ese camino -- el que cubre es distinto:
-- un producto que YA estaba en cero cuando la ronda abrió, y que Uriel
-- encuentra físicamente al contar, narrado por voz como cualquier otro
-- hallazgo. La vía de entrada es literalmente distinta (voz + confirmación
-- de Uriel, nunca una compra), así que no hay superposición posible con P-3.
--
-- QUÉ CAMBIA (sólo fn_ronda_confirmar_hallazgos, CREATE OR REPLACE -- nunca
-- se edita 126, que ya está aplicada): cuando un hallazgo del payload trae
-- `fuera_de_alcance: true` (puesto por `resolverHallazgos.ts`, TS -- ver esa
-- función para el porqué), el RPC:
--   1. Re-verifica server-side, SIEMPRE, que el producto exista y tenga
--      `cantidad_actual <= 0` -- nunca confía en la bandera que manda el
--      cliente (mismo criterio que la re-derivación de `via_propuesta`
--      contra `inventario_causas_raiz`, ya establecido en esta misma
--      función). Si el producto ya tiene existencia > 0 en el sistema, este
--      NO es un caso CA-4 -- es un P-3 (algo entró después) o un dato viejo
--      del cliente, y se aborta con un mensaje que lo distingue.
--   2. Si pasa la verificación, INSERTA una fila en
--      `rondas_inventario_alcance` para esta ronda + este producto, con
--      `cantidad_teorica = 0` (nunca 0 inventado -- el propio filtro que lo
--      trajo hasta acá exige `cantidad_actual <= 0`), `unidad`/`precio_unitario`/
--      `nombre_producto` leídos en vivo de `productos` -- MISMO patrón,
--      MISMAS columnas que `fn_ronda_abrir` (126) ya usa para congelar el
--      resto del alcance. `ON CONFLICT (ronda_id, producto_id) DO NOTHING`
--      (la PK de la tabla): si Uriel narra el mismo producto en dos
--      transcritos de la misma ronda, la segunda vez no revienta.
--   3. El resto de la función sigue exactamente igual -- lee
--      `cantidad_teorica` de `rondas_inventario_alcance` como siempre (que
--      ahora sí encuentra la fila, recién insertada) y crea la excepción con
--      el mismo camino de código que cualquier hallazgo del alcance
--      original. No hay una segunda vía de escritura para
--      `rondas_excepciones` -- una excepción "fuera de alcance" es, desde
--      ese punto en adelante, indistinguible de cualquier otra.
--
-- Un hallazgo SIN `fuera_de_alcance` (el caso de siempre, el 99% de las
-- rondas) no cambia de comportamiento en absoluto: la rama nueva es un IF
-- que sólo se activa cuando el payload lo pide explícitamente.
--
-- Verificado contra el catálogo vivo antes de escribir esto: la PK de
-- `rondas_inventario_alcance` es `(ronda_id, producto_id)` (sirve tal cual
-- para el ON CONFLICT); `fn_ronda_abrir` usa exactamente
-- `p.cantidad_actual, p.unidad_medida, p.precio_unitario, p.nombre` para
-- popular las mismas columnas -- este archivo copia ese patrón literal, no
-- inventa uno nuevo.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'fn_ronda_confirmar_hallazgos'
  ) THEN
    RAISE EXCEPTION '131 ABORTADA (pre): fn_ronda_confirmar_hallazgos no existe -- depende de que 126 ya esté aplicada.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'fn_ronda_confirmar_hallazgos'
       AND pg_get_functiondef(p.oid) ILIKE '%v_fuera_de_alcance%'
  ) THEN
    RAISE EXCEPTION '131 ABORTADA (pre): fn_ronda_confirmar_hallazgos YA tiene la rama de CA-4 -- la causa más probable es que esta migración ya se aplicó. Revisar a mano antes de reintentar.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION fn_ronda_confirmar_hallazgos(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor_usuario  UUID := NULLIF(payload ->> 'actor_usuario_id', '')::UUID;
  v_actor_telegram UUID := NULLIF(payload ->> 'actor_telegram_usuario_id', '')::UUID;
  v_transcrito_id  UUID := NULLIF(payload ->> 'transcrito_id', '')::UUID;
  v_transcrito     RECORD;
  v_hallazgos      JSONB := COALESCE(payload -> 'hallazgos', '[]'::jsonb);
  v_h              JSONB;
  v_indice         INTEGER := 0;
  v_producto_id    UUID;
  v_cantidad_fisica NUMERIC;
  v_fisico_origen  TEXT;
  v_teorico        NUMERIC;
  v_observacion    TEXT;
  v_explicacion_citada TEXT;
  v_causa_clave    TEXT;
  v_causa_confianza TEXT;
  v_causa_sugerida TEXT;
  v_via            TEXT;
  v_estado_inicial estado_excepcion_inventario;
  v_creadas        INTEGER := 0;
  v_ids            UUID[] := ARRAY[]::UUID[];
  v_excepcion_id   UUID;
  -- ═══ NUEVO (131) -- CA-4 ═════════════════════════════════════════════
  v_fuera_de_alcance BOOLEAN;
  v_producto_vivo    RECORD;
BEGIN
  PERFORM fn_ronda_validar_actor(v_actor_usuario, v_actor_telegram, 'inventario_ronda');

  IF v_transcrito_id IS NULL THEN
    RAISE EXCEPTION 'fn_ronda_confirmar_hallazgos: transcrito_id es requerido.';
  END IF;

  SELECT * INTO v_transcrito FROM rondas_transcritos WHERE id = v_transcrito_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_ronda_confirmar_hallazgos: no existe rondas_transcritos %.', v_transcrito_id;
  END IF;
  IF v_transcrito.estado <> 'preview_pendiente' THEN
    RAISE EXCEPTION 'fn_ronda_confirmar_hallazgos: el transcrito % no está pendiente de confirmación (estado actual: %). Un doble toque de Confirmar no duplica excepciones.', v_transcrito_id, v_transcrito.estado;
  END IF;

  IF jsonb_typeof(v_hallazgos) <> 'array' THEN
    RAISE EXCEPTION 'fn_ronda_confirmar_hallazgos: "hallazgos" debe ser un arreglo JSON.';
  END IF;

  FOR v_h IN SELECT * FROM jsonb_array_elements(v_hallazgos) LOOP
    v_indice := v_indice + 1;

    v_producto_id := NULLIF(v_h ->> 'producto_id', '')::UUID;
    IF v_producto_id IS NULL THEN
      RAISE EXCEPTION 'fn_ronda_confirmar_hallazgos: hallazgo % sin producto_id resuelto (CA-32) -- no se puede confirmar un hallazgo "no identificado".', v_indice;
    END IF;

    v_cantidad_fisica := (v_h ->> 'cantidad_fisica')::NUMERIC;
    IF v_cantidad_fisica IS NULL THEN
      RAISE EXCEPTION 'fn_ronda_confirmar_hallazgos: hallazgo % sin cantidad_fisica.', v_indice;
    END IF;

    v_fisico_origen := v_h ->> 'fisico_origen';
    IF v_fisico_origen NOT IN ('dictado', 'derivado') THEN
      RAISE EXCEPTION 'fn_ronda_confirmar_hallazgos: hallazgo % con fisico_origen inválido (%). Debe ser "dictado" o "derivado" (R-19/CA-31).', v_indice, v_fisico_origen;
    END IF;

    -- ═══ NUEVO (131) -- CA-4: "los productos en cero no entran solos;
    -- Uriel puede reportar uno igual si lo encuentra". Sólo se activa si el
    -- cliente lo pide explícitamente -- el camino de siempre (hallazgo del
    -- alcance original) no pasa por acá.
    v_fuera_de_alcance := COALESCE((v_h ->> 'fuera_de_alcance')::BOOLEAN, FALSE);
    IF v_fuera_de_alcance THEN
      -- Re-verifica server-side, SIEMPRE -- nunca confía en la bandera del
      -- cliente (mismo criterio que la re-derivación de via_propuesta más
      -- abajo). Si el producto no existe, o ya tiene existencia > 0 (P-3:
      -- algo entró después, o un dato viejo del cliente), aborta con un
      -- mensaje que distingue el caso -- nunca agrega al alcance en silencio.
      SELECT id, cantidad_actual, unidad_medida, precio_unitario, nombre
        INTO v_producto_vivo
        FROM productos WHERE id = v_producto_id
        FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'fn_ronda_confirmar_hallazgos: hallazgo % marcado fuera_de_alcance pero el producto % no existe.', v_indice, v_producto_id;
      END IF;
      IF v_producto_vivo.cantidad_actual > 0 THEN
        RAISE EXCEPTION 'fn_ronda_confirmar_hallazgos: hallazgo % marcado fuera_de_alcance pero el producto % ya tiene existencia > 0 en el sistema (%) -- no es un caso CA-4 (producto en cero); puede ser P-3 (algo entró después) y no corresponde agregarlo acá.', v_indice, v_producto_id, v_producto_vivo.cantidad_actual;
      END IF;

      -- Mismo patrón LITERAL que fn_ronda_abrir (126) usa para congelar el
      -- resto del alcance -- las mismas cuatro columnas, la misma fuente.
      INSERT INTO rondas_inventario_alcance (ronda_id, producto_id, cantidad_teorica, unidad, precio_unitario, nombre_producto)
      VALUES (v_transcrito.ronda_id, v_producto_vivo.id, 0, v_producto_vivo.unidad_medida, v_producto_vivo.precio_unitario, v_producto_vivo.nombre)
      ON CONFLICT (ronda_id, producto_id) DO NOTHING;
    END IF;

    SELECT cantidad_teorica INTO v_teorico
      FROM rondas_inventario_alcance
     WHERE ronda_id = v_transcrito.ronda_id AND producto_id = v_producto_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'fn_ronda_confirmar_hallazgos: hallazgo % -- el producto % no está en el alcance congelado de la ronda % (P-3).', v_indice, v_producto_id, v_transcrito.ronda_id;
    END IF;

    v_observacion := NULLIF(v_h ->> 'observacion_uriel', '');
    v_explicacion_citada := NULLIF(v_h ->> 'explicacion_citada', '');
    v_causa_clave := NULLIF(v_h ->> 'causa_clave', '');
    v_causa_confianza := COALESCE(v_h ->> 'causa_confianza', 'ninguna');
    IF v_causa_confianza NOT IN ('alta', 'baja', 'ninguna') THEN
      v_causa_confianza := 'ninguna';
    END IF;

    v_via := NULL;
    v_causa_sugerida := NULL;
    IF v_causa_clave IS NOT NULL THEN
      SELECT clave INTO v_causa_sugerida FROM inventario_causas_raiz WHERE clave = v_causa_clave;
    END IF;
    IF v_causa_confianza = 'alta' AND v_causa_clave IS NOT NULL THEN
      SELECT via INTO v_via FROM inventario_causas_raiz WHERE clave = v_causa_clave AND activo;
    END IF;
    IF v_via IS NULL THEN
      v_via := 'aprobacion_gerencia';
    END IF;

    v_estado_inicial := CASE
      WHEN v_explicacion_citada IS NOT NULL THEN 'explicacion_precargada'::estado_excepcion_inventario
      ELSE 'reportada'::estado_excepcion_inventario
    END;

    INSERT INTO rondas_excepciones (
      ronda_id, transcrito_id, producto_id, estado,
      cantidad_fisica, fisico_origen, teorico_conteo, observacion_uriel,
      reportada_por_usuario, reportada_por_telegram,
      explicacion_citada,
      via_propuesta, causa_sugerida, interprete_confianza
    ) VALUES (
      v_transcrito.ronda_id, v_transcrito_id, v_producto_id, v_estado_inicial,
      v_cantidad_fisica, v_fisico_origen, v_teorico, v_observacion,
      v_actor_usuario, v_actor_telegram,
      v_explicacion_citada,
      v_via, v_causa_sugerida, v_causa_confianza::TEXT
    ) RETURNING id INTO v_excepcion_id;

    v_ids := array_append(v_ids, v_excepcion_id);
    v_creadas := v_creadas + 1;
  END LOOP;

  UPDATE rondas_transcritos SET estado = 'confirmado', confirmado_en = now() WHERE id = v_transcrito_id;

  RETURN jsonb_build_object(
    'transcrito_id', v_transcrito_id,
    'excepciones_creadas', v_creadas,
    'excepcion_ids', to_jsonb(v_ids)
  );
END $$;

COMMENT ON FUNCTION fn_ronda_confirmar_hallazgos(JSONB) IS
  'Creada por la migración 126, corregida por la 131 (2026-08-28): agrega '
  'CA-4 -- un hallazgo marcado fuera_de_alcance se re-verifica server-side '
  '(existe, cantidad_actual <= 0) y se INSERTA en rondas_inventario_alcance '
  'con teórico 0 antes de crear la excepción, mismo patrón de columnas que '
  'fn_ronda_abrir. El resto del contrato (CA-32, doble-toque, re-derivación '
  'de via) no cambia.';

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
   WHERE n.nspname = 'public' AND p.proname = 'fn_ronda_confirmar_hallazgos';

  IF v_def NOT ILIKE '%v_fuera_de_alcance%' THEN
    RAISE EXCEPTION '131 ABORTADA (post): la rama de CA-4 no quedó en el cuerpo de la función.';
  END IF;
  IF v_def NOT ILIKE '%ON CONFLICT (ronda_id, producto_id) DO NOTHING%' THEN
    RAISE EXCEPTION '131 ABORTADA (post): el INSERT a rondas_inventario_alcance no quedó con su guarda de idempotencia.';
  END IF;
  IF v_secdef IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION '131 ABORTADA (post): la función quedó SECURITY DEFINER -- debía seguir SECURITY INVOKER (prosecdef=false).';
  END IF;
  IF NOT ('search_path=public, pg_temp' = ANY(COALESCE(v_searchp, ARRAY[]::TEXT[]))) THEN
    RAISE EXCEPTION '131 ABORTADA (post): el search_path pineado no sobrevivió al CREATE OR REPLACE. proconfig actual: %', v_searchp;
  END IF;
  IF v_acl IS NULL OR v_acl NOT LIKE '%authenticated=X%' OR v_acl NOT LIKE '%service_role=X%' OR v_acl LIKE '%anon%' THEN
    RAISE EXCEPTION '131 ABORTADA (post): el ACL de la función cambió respecto al esperado (authenticated+service_role, nunca anon). ACL actual: %', v_acl;
  END IF;
END $$;

-- ROLLBACK (no ejecutar salvo instrucción explícita del dueño): restaurar el
-- cuerpo previo -- el que aplicó la 126 -- con un segundo CREATE OR REPLACE
-- FUNCTION fn_ronda_confirmar_hallazgos(payload JSONB) reproduciendo ese
-- cuerpo literal (ver src/sql/migrations/126_ronda_inventario_rpcs.sql).
-- Revertir esto vuelve a hacer imposible reportar un producto en cero --
-- CA-4 deja de cumplirse -- no hacerlo sin una razón explícita.
