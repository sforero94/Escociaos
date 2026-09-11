-- Migración 143: separar el nombre visible del correo de trazabilidad de la ronda
--
-- Hallazgo #63 del barrido de mantenimiento (2026-09-11), P2, clase ddl_aditivo.
--
-- `fn_ronda_actor_nombre` (126) tiene un contrato de presentación: prefiere
-- `telegram_usuarios.nombre_display`, luego `usuarios.nombre_completo/email`.
-- También lo usa Telegram para mostrar quién propuso un ajuste. La migración
-- rechazada 142 cambiaba ese helper compartido para corregir otra necesidad:
-- `movimientos_inventario.responsable` debe guardar el correo que identifica la
-- cuenta, no un nombre para mostrar que puede corresponder a varias cuentas.
--
-- Esta migración separa los contratos. Conserva `fn_ronda_actor_nombre` sin
-- cambios, crea `fn_ronda_actor_correo`, y reemplaza solamente los dos RPC de la
-- ronda que escriben `movimientos_inventario.responsable`:
-- `fn_ronda_resolver_con_captura` y `fn_ronda_aplicar_ajuste`.
--
-- El helper nuevo resuelve, en orden:
--   1. `NULLIF(btrim(usuarios.email), '')`, por usuario directo o vínculo de
--      Telegram;
--   2. `telegram_usuarios.nombre_display`, sólo como respaldo si Telegram no
--      tiene una cuenta con correo utilizable;
--   3. 'Ronda de inventario'.
--
-- No hay UPDATE, DELETE, ALTER ni DROP. La fila histórica que ya contiene un
-- nombre visible no cambia. `CREATE OR REPLACE` conserva OID, dueño y ACL de los
-- dos RPC porque sus firmas no cambian. Las guardas verifican esos metadatos y
-- los cuerpos esperados antes y después del cambio.

-- ---------------------------------------------------------------------------
-- PRECONDICIONES
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_nombre_def    TEXT;
  v_resolver_def  TEXT;
  v_aplicar_def   TEXT;
  v_malos         INTEGER;
BEGIN
  IF to_regprocedure('public.fn_ronda_actor_nombre(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION '143 ABORTADA (pre): fn_ronda_actor_nombre(uuid, uuid) no existe -- depende de la migración 126.';
  END IF;
  IF to_regprocedure('public.fn_ronda_resolver_con_captura(jsonb)') IS NULL THEN
    RAISE EXCEPTION '143 ABORTADA (pre): fn_ronda_resolver_con_captura(jsonb) no existe -- depende de la migración 126.';
  END IF;
  IF to_regprocedure('public.fn_ronda_aplicar_ajuste(jsonb)') IS NULL THEN
    RAISE EXCEPTION '143 ABORTADA (pre): fn_ronda_aplicar_ajuste(jsonb) no existe -- depende de la migración 126.';
  END IF;
  IF to_regprocedure('public.fn_ronda_actor_correo(uuid, uuid)') IS NOT NULL THEN
    RAISE EXCEPTION '143 ABORTADA (pre): fn_ronda_actor_correo(uuid, uuid) ya existe. Revisar si esta migración ya fue aplicada antes de reintentar.';
  END IF;

  SELECT count(*) INTO v_malos
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('fn_ronda_actor_nombre', 'fn_ronda_resolver_con_captura', 'fn_ronda_aplicar_ajuste');
  IF v_malos <> 3 THEN
    RAISE EXCEPTION '143 ABORTADA (pre): se esperaban exactamente tres funciones sin sobrecargas (actor_nombre, resolver_con_captura, aplicar_ajuste); se encontraron %.', v_malos;
  END IF;

  SELECT p.prosrc INTO v_nombre_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_ronda_actor_nombre';
  IF v_nombre_def NOT ILIKE '%t.nombre_display%'
     OR v_nombre_def NOT ILIKE '%COALESCE(u.nombre_completo, u.email)%'
     OR position('t.nombre_display' IN lower(v_nombre_def))
        > position('coalesce(u.nombre_completo, u.email)' IN lower(v_nombre_def)) THEN
    RAISE EXCEPTION '143 ABORTADA (pre): fn_ronda_actor_nombre no conserva el contrato nombre-visible-primero de la 126. Cuerpo actual: %', v_nombre_def;
  END IF;

  SELECT count(*) INTO v_malos
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
   WHERE n.nspname = 'public'
     AND p.proname = 'fn_ronda_actor_nombre'
     AND p.prosecdef IS FALSE
     AND p.provolatile = 's'
     AND l.lanname = 'sql'
     AND 'search_path=public, pg_temp' = ANY(COALESCE(p.proconfig, ARRAY[]::TEXT[]))
     AND p.proacl::TEXT LIKE '%authenticated=X%'
     AND p.proacl::TEXT LIKE '%service_role=X%'
     AND p.proacl::TEXT NOT LIKE '%anon%';
  IF v_malos <> 1 THEN
    RAISE EXCEPTION '143 ABORTADA (pre): fn_ronda_actor_nombre no conserva seguridad, volatilidad, lenguaje, search_path o ACL de la 126.';
  END IF;

  SELECT p.prosrc INTO v_resolver_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_ronda_resolver_con_captura';
  SELECT p.prosrc INTO v_aplicar_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_ronda_aplicar_ajuste';

  -- Estos hashes son los `prosrc` verificados contra el catálogo vivo el
  -- 2026-09-11. Producción conserva cuatro mensajes RAISE más cortos que el
  -- fichero 126; los cuerpos de abajo preservan esa versión viva literal.
  -- Cualquier cambio posterior debe abortar en vez de quedar sobrescrito.
  IF md5(v_resolver_def) <> 'f8d94a74b48b21a3ecd6de4602d787bf' THEN
    RAISE EXCEPTION '143 ABORTADA (pre): fn_ronda_resolver_con_captura difiere del cuerpo vivo revisado (md5 actual %). No sobrescribir un cambio vivo sin incorporarlo primero.', md5(v_resolver_def);
  END IF;
  IF md5(v_aplicar_def) <> 'ced4d81b768c82d21bfbd452e975a6d7' THEN
    RAISE EXCEPTION '143 ABORTADA (pre): fn_ronda_aplicar_ajuste difiere del cuerpo vivo revisado (md5 actual %). No sobrescribir un cambio vivo sin incorporarlo primero.', md5(v_aplicar_def);
  END IF;

  IF v_resolver_def NOT ILIKE '%fn_ronda_actor_nombre(v_actor_usuario, v_actor_telegram)%'
     OR v_resolver_def ILIKE '%fn_ronda_actor_correo%' THEN
    RAISE EXCEPTION '143 ABORTADA (pre): fn_ronda_resolver_con_captura no tiene el consumidor exacto que esta migración reemplaza.';
  END IF;
  IF v_aplicar_def NOT ILIKE '%fn_ronda_actor_nombre(v_actor_usuario, v_actor_telegram)%'
     OR v_aplicar_def ILIKE '%fn_ronda_actor_correo%' THEN
    RAISE EXCEPTION '143 ABORTADA (pre): fn_ronda_aplicar_ajuste no tiene el consumidor exacto que esta migración reemplaza.';
  END IF;

  SELECT count(*) INTO v_malos
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
   WHERE n.nspname = 'public'
     AND p.proname IN ('fn_ronda_resolver_con_captura', 'fn_ronda_aplicar_ajuste')
     AND p.prosecdef IS FALSE
     AND p.provolatile = 'v'
     AND l.lanname = 'plpgsql'
     AND 'search_path=public, pg_temp' = ANY(COALESCE(p.proconfig, ARRAY[]::TEXT[]))
     AND p.proacl::TEXT LIKE '%authenticated=X%'
     AND p.proacl::TEXT LIKE '%service_role=X%'
     AND p.proacl::TEXT NOT LIKE '%anon%';
  IF v_malos <> 2 THEN
    RAISE EXCEPTION '143 ABORTADA (pre): los dos RPC consumidores no conservan seguridad, volatilidad, lenguaje, search_path o ACL de la 126.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'usuarios'
       AND column_name = 'email' AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION '143 ABORTADA (pre): usuarios.email no existe como columna NOT NULL.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policy pol
     WHERE COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '') LIKE '%fn_ronda_actor_nombre%'
        OR COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), '') LIKE '%fn_ronda_actor_nombre%'
        OR COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '') LIKE '%fn_ronda_resolver_con_captura%'
        OR COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), '') LIKE '%fn_ronda_resolver_con_captura%'
        OR COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '') LIKE '%fn_ronda_aplicar_ajuste%'
        OR COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), '') LIKE '%fn_ronda_aplicar_ajuste%'
  ) THEN
    RAISE EXCEPTION '143 ABORTADA (pre): una política RLS depende de una función que esta migración toca. Revisar el cambio como contrato de autorización.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- HELPER DE TRAZABILIDAD. El helper visible de la 126 queda intacto.
-- ---------------------------------------------------------------------------
CREATE FUNCTION fn_ronda_actor_correo(p_usuario UUID, p_telegram UUID)
RETURNS TEXT
LANGUAGE sql SECURITY INVOKER STABLE SET search_path = public, pg_temp AS $$
  SELECT COALESCE(
    (SELECT NULLIF(btrim(u.email), '')
       FROM usuarios u
      WHERE u.id = COALESCE(
              p_usuario,
              (SELECT t.usuario_id FROM telegram_usuarios t WHERE t.id = p_telegram)
            )),
    (SELECT t.nombre_display FROM telegram_usuarios t WHERE t.id = p_telegram),
    'Ronda de inventario'
  );
$$;

COMMENT ON FUNCTION fn_ronda_actor_correo(UUID, UUID) IS
  'Migración 143: identidad del actor para movimientos_inventario.responsable. '
  'Prefiere NULLIF(btrim(usuarios.email), '''') por usuario directo o por el '
  'vínculo de Telegram. nombre_display queda sólo como respaldo para Telegram '
  'sin correo utilizable; "Ronda de inventario" es el último recurso. El helper '
  'fn_ronda_actor_nombre conserva aparte su contrato de presentación.';

REVOKE EXECUTE ON FUNCTION fn_ronda_actor_correo(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_ronda_actor_correo(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION fn_ronda_actor_correo(UUID, UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- CONSUMIDOR 1/2. Cuerpo literal del catálogo vivo; sólo cambia actor_nombre
-- por actor_correo en movimientos_inventario.responsable. Los tres mensajes
-- RAISE que difieren del fichero 126 conservan la redacción viva más corta.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_ronda_resolver_con_captura(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor_usuario  UUID := NULLIF(payload ->> 'actor_usuario_id', '')::UUID;
  v_actor_telegram UUID := NULLIF(payload ->> 'actor_telegram_usuario_id', '')::UUID;
  v_excepcion_id   UUID := NULLIF(payload ->> 'excepcion_id', '')::UUID;
  v_tipo           TEXT := payload ->> 'tipo_movimiento';
  v_cantidad       NUMERIC := (payload ->> 'cantidad')::NUMERIC;
  v_fecha          DATE := NULLIF(payload ->> 'fecha_movimiento', '')::DATE;
  v_observaciones  TEXT := NULLIF(payload ->> 'observaciones', '');
  v_factura        TEXT := NULLIF(payload ->> 'factura', '');
  v_lote_aplicacion TEXT := NULLIF(payload ->> 'lote_aplicacion', '');
  v_aplicacion_id  UUID := NULLIF(payload ->> 'aplicacion_id', '')::UUID;

  v_excepcion      RECORD;
  v_producto       RECORD;
  v_saldo_anterior NUMERIC;
  v_saldo_nuevo    NUMERIC;
  v_movimiento_id  UUID;
BEGIN
  PERFORM fn_ronda_validar_actor(v_actor_usuario, v_actor_telegram, 'inventario_explicacion');

  IF v_excepcion_id IS NULL THEN
    RAISE EXCEPTION 'fn_ronda_resolver_con_captura: excepcion_id es requerido.';
  END IF;
  IF v_cantidad IS NULL OR v_cantidad <= 0 THEN
    RAISE EXCEPTION 'fn_ronda_resolver_con_captura: cantidad debe ser un número positivo (recibido %).', v_cantidad;
  END IF;
  IF v_fecha IS NULL THEN
    RAISE EXCEPTION 'fn_ronda_resolver_con_captura: fecha_movimiento es requerida -- CA-8 exige la fecha REAL del movimiento.';
  END IF;

  SELECT * INTO v_excepcion FROM rondas_excepciones WHERE id = v_excepcion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_ronda_resolver_con_captura: no existe rondas_excepciones %.', v_excepcion_id;
  END IF;
  IF v_excepcion.estado <> 'explicada' OR v_excepcion.explicacion_david_en IS NULL THEN
    RAISE EXCEPTION 'fn_ronda_resolver_con_captura: la excepción % no está "explicada" por David (estado: %, explicacion_david_en: %) -- CA-38.', v_excepcion_id, v_excepcion.estado, v_excepcion.explicacion_david_en;
  END IF;

  IF v_tipo NOT IN ('Entrada', 'Salida por Aplicación', 'Salida Otros') THEN
    RAISE EXCEPTION 'fn_ronda_resolver_con_captura: tipo_movimiento inválido (%) -- CA-8 exige el movimiento REAL que fue, nunca "Ajuste".', v_tipo;
  END IF;

  SELECT id, cantidad_actual, unidad_medida, precio_unitario, activo
    INTO v_producto FROM productos WHERE id = v_excepcion.producto_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_ronda_resolver_con_captura: no existe productos % (referenciado por la excepción).', v_excepcion.producto_id;
  END IF;

  v_saldo_anterior := COALESCE(v_producto.cantidad_actual, 0);
  IF v_tipo = 'Entrada' THEN
    v_saldo_nuevo := v_saldo_anterior + v_cantidad;
  ELSE
    v_saldo_nuevo := v_saldo_anterior - v_cantidad;
    IF v_saldo_nuevo < 0 THEN
      RAISE EXCEPTION 'fn_ronda_resolver_con_captura: % dejaría a % en saldo negativo (actual %, movimiento %).', v_tipo, v_producto.id, v_saldo_anterior, v_cantidad;
    END IF;
  END IF;

  INSERT INTO movimientos_inventario (
    producto_id, tipo_movimiento, cantidad, unidad, fecha_movimiento,
    saldo_anterior, saldo_nuevo, responsable, observaciones, factura,
    lote_aplicacion, aplicacion_id, provisional, valor_movimiento
  ) VALUES (
    v_producto.id, v_tipo::tipo_movimiento, v_cantidad, v_producto.unidad_medida, v_fecha,
    v_saldo_anterior, v_saldo_nuevo,
    fn_ronda_actor_correo(v_actor_usuario, v_actor_telegram),
    COALESCE(v_observaciones, 'Captura directa -- ronda de inventario, excepción ' || v_excepcion_id::TEXT),
    v_factura, v_lote_aplicacion, v_aplicacion_id, FALSE,
    v_cantidad * COALESCE(v_producto.precio_unitario, 0)
  ) RETURNING id INTO v_movimiento_id;

  UPDATE productos SET cantidad_actual = v_saldo_nuevo WHERE id = v_producto.id;

  UPDATE rondas_excepciones SET
    estado = 'resuelta_con_captura',
    captura_movimiento_id = v_movimiento_id,
    captura_en = now(),
    captura_por_usuario = v_actor_usuario,
    captura_por_telegram = v_actor_telegram
  WHERE id = v_excepcion_id;

  RETURN jsonb_build_object(
    'excepcion_id', v_excepcion_id,
    'movimiento_id', v_movimiento_id,
    'saldo_anterior', v_saldo_anterior,
    'saldo_nuevo', v_saldo_nuevo
  );
END $$;

COMMENT ON FUNCTION fn_ronda_resolver_con_captura(JSONB) IS
  'Fase 2, RPC 5/10 (§6.3), vía (a) de R-14. Registra el movimiento REAL que '
  'explica la diferencia (Entrada/Salida por Aplicación/Salida Otros, NUNCA '
  'Ajuste -- CA-8), ligado a la excepción, sin pasar por Santiago. Valida '
  'TODO antes de escribir nada (molde de la migración 106): estado '
  '"explicada" con FOR UPDATE, tipo_movimiento válido, saldo resultante >= 0 '
  'con FOR UPDATE sobre productos. cantidad se guarda como magnitud '
  'positiva (decisión documentada en la cabecera de la migración 126). La '
  'migración 143 atribuye responsable con fn_ronda_actor_correo.';

-- ---------------------------------------------------------------------------
-- CONSUMIDOR 2/2. Cuerpo literal del catálogo vivo; sólo cambia actor_nombre
-- por actor_correo en movimientos_inventario.responsable. El mensaje RAISE
-- que difiere del fichero 126 conserva la redacción viva más corta.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_ronda_aplicar_ajuste(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor_usuario  UUID := NULLIF(payload ->> 'actor_usuario_id', '')::UUID;
  v_actor_telegram UUID := NULLIF(payload ->> 'actor_telegram_usuario_id', '')::UUID;
  v_excepcion_id   UUID := NULLIF(payload ->> 'excepcion_id', '')::UUID;
  v_fecha          DATE := NULLIF(payload ->> 'fecha_movimiento', '')::DATE;
  v_confirmar_cambio BOOLEAN := COALESCE((payload ->> 'confirmar_cambio_teorico')::BOOLEAN, FALSE);

  v_modulo         TEXT;
  v_autorizado     BOOLEAN := FALSE;
  v_ultimo_error   TEXT;

  v_excepcion      RECORD;
  v_producto       RECORD;
  v_ronda          RECORD;
  v_causa          RECORD;
  v_delta          NUMERIC;
  v_vivo           NUMERIC;
  v_nuevo          NUMERIC;
  v_movimiento_id  UUID;
  v_observaciones  TEXT;
BEGIN
  IF v_excepcion_id IS NULL THEN
    RAISE EXCEPTION 'fn_ronda_aplicar_ajuste: excepcion_id es requerido.';
  END IF;
  IF v_fecha IS NULL THEN
    RAISE EXCEPTION 'fn_ronda_aplicar_ajuste: fecha_movimiento es requerida.';
  END IF;

  FOREACH v_modulo IN ARRAY ARRAY['inventario_ronda', 'inventario_explicacion', 'inventario_aprobacion'] LOOP
    BEGIN
      PERFORM fn_ronda_validar_actor(v_actor_usuario, v_actor_telegram, v_modulo);
      v_autorizado := TRUE;
      EXIT;
    EXCEPTION WHEN OTHERS THEN
      v_ultimo_error := SQLERRM;
    END;
  END LOOP;
  IF NOT v_autorizado THEN
    RAISE EXCEPTION 'fn_ronda_aplicar_ajuste: actor no autorizado -- no tiene ninguno de los tres módulos de la ronda. Último error: %', v_ultimo_error;
  END IF;

  SELECT * INTO v_excepcion FROM rondas_excepciones WHERE id = v_excepcion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_ronda_aplicar_ajuste: no existe rondas_excepciones %.', v_excepcion_id;
  END IF;
  IF v_excepcion.estado <> 'ajuste_aprobado' THEN
    RAISE EXCEPTION 'fn_ronda_aplicar_ajuste: la excepción % no tiene un ajuste APROBADO pendiente de aplicar (estado actual: %). Sin aprobación de Santiago, nadie puede aplicar (CA-9).', v_excepcion_id, v_excepcion.estado;
  END IF;

  v_delta := v_excepcion.cantidad_fisica - v_excepcion.teorico_conteo;

  SELECT id, cantidad_actual, unidad_medida, precio_unitario
    INTO v_producto FROM productos WHERE id = v_excepcion.producto_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_ronda_aplicar_ajuste: no existe productos % (referenciado por la excepción).', v_excepcion.producto_id;
  END IF;
  v_vivo := COALESCE(v_producto.cantidad_actual, 0);

  IF v_vivo IS DISTINCT FROM v_excepcion.teorico_conteo AND NOT v_confirmar_cambio THEN
    RETURN jsonb_build_object(
      'aplicado', FALSE,
      'motivo', 'teorico_cambio',
      'excepcion_id', v_excepcion_id,
      'teorico_al_conteo', v_excepcion.teorico_conteo,
      'teorico_hoy', v_vivo,
      'delta', v_delta
    );
  END IF;

  v_nuevo := v_vivo + v_delta;
  IF v_nuevo < 0 THEN
    RAISE EXCEPTION 'fn_ronda_aplicar_ajuste: aplicar el ajuste (delta %) dejaría a % en saldo negativo (vivo %).', v_delta, v_producto.id, v_vivo;
  END IF;

  SELECT r.*, c.etiqueta AS causa_etiqueta
    INTO v_ronda
    FROM rondas_inventario r
    LEFT JOIN inventario_causas_raiz c ON c.clave = v_excepcion.decision_causa
   WHERE r.id = v_excepcion.ronda_id;
  v_observaciones := 'Ronda ' || to_char(v_ronda.periodo, 'YYYY-MM')
    || COALESCE(' · ' || v_ronda.causa_etiqueta, '')
    || ' · excepción ' || v_excepcion_id::TEXT;

  INSERT INTO movimientos_inventario (
    producto_id, tipo_movimiento, cantidad, unidad, fecha_movimiento,
    saldo_anterior, saldo_nuevo, responsable, observaciones, provisional, valor_movimiento
  ) VALUES (
    v_producto.id, 'Ajuste'::tipo_movimiento, v_delta, v_producto.unidad_medida, v_fecha,
    v_vivo, v_nuevo,
    fn_ronda_actor_correo(v_actor_usuario, v_actor_telegram),
    v_observaciones, FALSE,
    ABS(v_delta) * COALESCE(v_producto.precio_unitario, 0)
  ) RETURNING id INTO v_movimiento_id;

  UPDATE productos SET cantidad_actual = v_nuevo WHERE id = v_producto.id;

  UPDATE rondas_excepciones SET
    estado = 'ajuste_aplicado',
    aplicacion_movimiento_id = v_movimiento_id,
    aplicacion_en = now(),
    aplicacion_por_usuario = v_actor_usuario,
    aplicacion_por_telegram = v_actor_telegram
  WHERE id = v_excepcion_id;

  RETURN jsonb_build_object(
    'aplicado', TRUE,
    'excepcion_id', v_excepcion_id,
    'movimiento_id', v_movimiento_id,
    'delta', v_delta,
    'saldo_anterior', v_vivo,
    'saldo_nuevo', v_nuevo
  );
END $$;

COMMENT ON FUNCTION fn_ronda_aplicar_ajuste(JSONB) IS
  'Fase 2, RPC 8/10 (§6.4). DELTA, nunca fijación: nuevo := vivo + delta, '
  'jamás nuevo := fisico. Si productos.cantidad_actual vivo difiere del '
  'teorico_conteo congelado en la excepción, informa ANTES de aplicar '
  '({aplicado:false, motivo:''teorico_cambio'', ...}) y no aplica en '
  'silencio (CA-2) -- salvo confirmar_cambio_teorico=true en el payload. '
  'Acepta los tres módulos de la ronda (David, Uriel o Santiago pueden '
  'ejecutar un ajuste YA aprobado -- B-7); lo que protege CA-9 es la guarda '
  'de estado = ajuste_aprobado, no el módulo del actor. La migración 143 '
  'atribuye responsable con fn_ronda_actor_correo.';

-- ---------------------------------------------------------------------------
-- POSTCONDICIONES
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_nombre_def    TEXT;
  v_correo_def    TEXT;
  v_resolver_def  TEXT;
  v_aplicar_def   TEXT;
  v_malos         BIGINT;
BEGIN
  SELECT p.prosrc INTO v_nombre_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_ronda_actor_nombre';
  IF v_nombre_def NOT ILIKE '%t.nombre_display%'
     OR v_nombre_def NOT ILIKE '%COALESCE(u.nombre_completo, u.email)%'
     OR position('t.nombre_display' IN lower(v_nombre_def))
        > position('coalesce(u.nombre_completo, u.email)' IN lower(v_nombre_def)) THEN
    RAISE EXCEPTION '143 ABORTADA (post): fn_ronda_actor_nombre perdió el contrato nombre-visible-primero de la 126.';
  END IF;

  SELECT count(*) INTO v_malos
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_ronda_actor_correo';
  IF v_malos <> 1 OR to_regprocedure('public.fn_ronda_actor_correo(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION '143 ABORTADA (post): fn_ronda_actor_correo debe existir una sola vez con firma (uuid, uuid); conteo actual %.', v_malos;
  END IF;

  SELECT p.prosrc INTO v_correo_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_ronda_actor_correo';
  IF v_correo_def NOT ILIKE '%NULLIF(btrim(u.email), '''')%'
     OR v_correo_def NOT ILIKE '%t.nombre_display%'
     OR position('nullif(btrim(u.email), '''')' IN lower(v_correo_def))
        > position('t.nombre_display' IN lower(v_correo_def)) THEN
    RAISE EXCEPTION '143 ABORTADA (post): fn_ronda_actor_correo no conserva correo-recortado-primero y nombre_display como respaldo. Cuerpo actual: %', v_correo_def;
  END IF;

  SELECT count(*) INTO v_malos
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
   WHERE n.nspname = 'public'
     AND p.proname = 'fn_ronda_actor_correo'
     AND p.prosecdef IS FALSE
     AND p.provolatile = 's'
     AND l.lanname = 'sql'
     AND 'search_path=public, pg_temp' = ANY(COALESCE(p.proconfig, ARRAY[]::TEXT[]))
     AND p.proacl::TEXT LIKE '%authenticated=X%'
     AND p.proacl::TEXT LIKE '%service_role=X%'
     AND p.proacl::TEXT NOT LIKE '%anon%';
  IF v_malos <> 1 THEN
    RAISE EXCEPTION '143 ABORTADA (post): fn_ronda_actor_correo no quedó SECURITY INVOKER STABLE, LANGUAGE sql, con search_path pineado y ACL autenticado/service_role sin anon.';
  END IF;

  SELECT p.prosrc INTO v_resolver_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_ronda_resolver_con_captura';
  SELECT p.prosrc INTO v_aplicar_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_ronda_aplicar_ajuste';

  IF md5(v_resolver_def) <> 'e2b4878c163624f971b194075e0bb774' THEN
    RAISE EXCEPTION '143 ABORTADA (post): fn_ronda_resolver_con_captura no quedó con el cuerpo literal revisado (md5 actual %).', md5(v_resolver_def);
  END IF;
  IF md5(v_aplicar_def) <> 'b9e8e9d24585f571e1f9a2dd89d075b0' THEN
    RAISE EXCEPTION '143 ABORTADA (post): fn_ronda_aplicar_ajuste no quedó con el cuerpo literal revisado (md5 actual %).', md5(v_aplicar_def);
  END IF;

  IF v_resolver_def NOT ILIKE '%fn_ronda_actor_correo(v_actor_usuario, v_actor_telegram)%'
     OR v_resolver_def ILIKE '%fn_ronda_actor_nombre(v_actor_usuario, v_actor_telegram)%' THEN
    RAISE EXCEPTION '143 ABORTADA (post): fn_ronda_resolver_con_captura no usa exclusivamente fn_ronda_actor_correo para responsable.';
  END IF;
  IF v_aplicar_def NOT ILIKE '%fn_ronda_actor_correo(v_actor_usuario, v_actor_telegram)%'
     OR v_aplicar_def ILIKE '%fn_ronda_actor_nombre(v_actor_usuario, v_actor_telegram)%' THEN
    RAISE EXCEPTION '143 ABORTADA (post): fn_ronda_aplicar_ajuste no usa exclusivamente fn_ronda_actor_correo para responsable.';
  END IF;

  SELECT count(*) INTO v_malos
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
   WHERE n.nspname = 'public'
     AND p.proname IN ('fn_ronda_resolver_con_captura', 'fn_ronda_aplicar_ajuste')
     AND p.prosecdef IS FALSE
     AND p.provolatile = 'v'
     AND l.lanname = 'plpgsql'
     AND 'search_path=public, pg_temp' = ANY(COALESCE(p.proconfig, ARRAY[]::TEXT[]))
     AND p.proacl::TEXT LIKE '%authenticated=X%'
     AND p.proacl::TEXT LIKE '%service_role=X%'
     AND p.proacl::TEXT NOT LIKE '%anon%';
  IF v_malos <> 2 THEN
    RAISE EXCEPTION '143 ABORTADA (post): los dos RPC consumidores cambiaron seguridad, volatilidad, lenguaje, search_path o ACL.';
  END IF;

  SELECT count(*) INTO v_malos
    FROM usuarios u
   WHERE fn_ronda_actor_correo(u.id, NULL)
         IS DISTINCT FROM COALESCE(NULLIF(btrim(u.email), ''), 'Ronda de inventario');
  IF v_malos <> 0 THEN
    RAISE EXCEPTION '143 ABORTADA (post): % cuentas no resuelven según NULLIF(btrim(usuarios.email), '''') y el último recurso.', v_malos;
  END IF;

  SELECT count(*) INTO v_malos
    FROM telegram_usuarios t
    JOIN usuarios u ON u.id = t.usuario_id
   WHERE fn_ronda_actor_correo(NULL, t.id)
         IS DISTINCT FROM COALESCE(NULLIF(btrim(u.email), ''), t.nombre_display, 'Ronda de inventario');
  IF v_malos <> 0 THEN
    RAISE EXCEPTION '143 ABORTADA (post): % actores de Telegram vinculados no resuelven según NULLIF(btrim(usuarios.email), '''') y sus respaldos.', v_malos;
  END IF;

  SELECT count(*) INTO v_malos
    FROM telegram_usuarios t
   WHERE t.usuario_id IS NULL
     AND fn_ronda_actor_correo(NULL, t.id)
         IS DISTINCT FROM COALESCE(t.nombre_display, 'Ronda de inventario');
  IF v_malos <> 0 THEN
    RAISE EXCEPTION '143 ABORTADA (post): % actores de Telegram sin vínculo perdieron nombre_display como respaldo.', v_malos;
  END IF;

  IF fn_ronda_actor_correo(NULL, NULL) IS DISTINCT FROM 'Ronda de inventario' THEN
    RAISE EXCEPTION '143 ABORTADA (post): el último recurso de fn_ronda_actor_correo cambió (devolvió %).', fn_ronda_actor_correo(NULL, NULL);
  END IF;

  RAISE NOTICE '143 (post): OK. fn_ronda_actor_nombre conserva nombres visibles; sólo los dos RPC que escriben responsable usan fn_ronda_actor_correo.';
END $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (no ejecutar salvo instrucción explícita del dueño).
--
-- 1. Reemplazar en los dos cuerpos anteriores únicamente
--    `fn_ronda_actor_correo(v_actor_usuario, v_actor_telegram)` por
--    `fn_ronda_actor_nombre(v_actor_usuario, v_actor_telegram)`, mediante dos
--    CREATE OR REPLACE literales. Usar los cuerpos vivos que esta migración
--    reproduce sin otros cambios.
-- 2. DROP FUNCTION fn_ronda_actor_correo(UUID, UUID);
--
-- El orden es obligatorio: la función nueva no puede borrarse mientras los
-- dos RPC dependan de ella. El rollback restaura el defecto de atribución en
-- futuros movimientos; no reescribe filas históricas.
-- ---------------------------------------------------------------------------
