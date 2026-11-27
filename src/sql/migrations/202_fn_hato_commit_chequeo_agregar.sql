-- =====================================================================
-- 202: fn_hato_commit_chequeo_agregar -- ESCRITA, SIN APLICAR.
-- Aplicar solo con el sí explícito de Santiago.
-- Fecha: 2026-11-26 (ESCO-190)
--
-- Problema: un chequeo veterinario siempre ocupa 2 o 3 páginas. La carga
-- por foto sube una tanda y aprueba; si la segunda página se aprueba
-- aparte, `fn_hato_commit_chequeo` (065/069) encuentra la cabecera de esa
-- fecha y BORRA todas sus filas y eventos antes de insertar los nuevos.
-- La segunda página reemplaza a la primera. Caso real: el chequeo del
-- 2026-11-24 (b327f463) quedó con 13 vacas de ~33, y 20 vacas activas
-- siguen mostrando el chequeo del 2026-09-08.
--
-- Qué hace esta migración: crea una función NUEVA,
-- `fn_hato_commit_chequeo_agregar(payload, p_created_by)`, con el mismo
-- cuerpo que la función viva de 069, salvo el paso 2: la limpieza borra
-- SOLO las filas (y sus eventos derivados) de los animales que trae el
-- payload. Las filas de las demás vacas del mismo chequeo se conservan.
-- Así se fusiona por animal: una vaca que ya estaba y viene otra vez se
-- actualiza con la lectura nueva; una vaca que no estaba se agrega.
--
-- Qué NO hace:
--   - No toca `fn_hato_commit_chequeo`. "Reemplazar todo" sigue igual. Una
--     guarda fija el md5 de su cuerpo vivo antes y después.
--   - No toca ninguna fila de dominio. Filas afectadas: cero.
--   - No agrega un índice único sobre hato_chequeos.fecha.
--
-- Por qué una función aparte y no un parámetro de modo: la edge function
-- llama la función nueva desde una ruta nueva (/hato/chequeo/agregar).
-- En cualquier orden de despliegue el fallo es cerrado: sin esta
-- migración la ruta nueva da 500 y no escribe nada; un cliente viejo
-- sigue llamando /commit (reemplazar) como antes.
--
-- Concurrencia: dos páginas aprobadas a la vez para la misma fecha sin
-- cabecera podrían crear dos cabeceras (no hay índice único por fecha).
-- La función toma `LOCK TABLE hato_chequeos IN SHARE ROW EXCLUSIVE MODE`
-- (modo que choca consigo mismo), así dos commits de agregar se ejecutan
-- en serie. Es raro y corto; no se usa pg_advisory_* para que la
-- migración se pueda ensayar con po_sonda (170 rechaza pg_advisory_*).
--
-- Seguridad: igual que 065/069. SECURITY DEFINER sin chequeo de rol
-- interno; EXECUTE solo para service_role. El único llamante autorizado
-- es el endpoint hato-chequeo-commit.ts, que verifica Administrador o
-- Gerencia y revalida el diff antes de llamar.
--
-- Orden: migración primero, `functions deploy` después (desde el Mac de
-- Santiago; el deploy en la nube devuelve 413).
-- =====================================================================

SET LOCAL lock_timeout = '2s';

-- ---------------------------------------------------------------------
-- 0. Pre-guardas
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_md5 TEXT;
BEGIN
  SELECT md5(p.prosrc) INTO v_md5
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'fn_hato_commit_chequeo'
    AND pg_get_function_identity_arguments(p.oid) = 'payload jsonb, p_created_by uuid';

  IF v_md5 IS NULL THEN
    RAISE EXCEPTION '202: fn_hato_commit_chequeo(jsonb, uuid) no existe';
  END IF;
  IF v_md5 <> 'da542ea9e2b976a5ac89348b0cd35376' THEN
    RAISE EXCEPTION '202: el cuerpo vivo de fn_hato_commit_chequeo cambió (md5 %); no adivinar', v_md5;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_hato_commit_chequeo_agregar'
  ) THEN
    RAISE EXCEPTION '202: fn_hato_commit_chequeo_agregar ya existe; no reejecutar';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.hato_chequeo_vacas'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%(chequeo_id, animal_id)%'
  ) THEN
    RAISE EXCEPTION '202: falta UNIQUE(chequeo_id, animal_id) en hato_chequeo_vacas';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1. Función nueva
-- ---------------------------------------------------------------------
CREATE FUNCTION public.fn_hato_commit_chequeo_agregar(payload JSONB, p_created_by UUID)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  v_fecha DATE := (payload -> 'chequeo' ->> 'fecha')::DATE;
  v_veterinario TEXT := payload -> 'chequeo' ->> 'veterinario';
  v_chequeo_id UUID;
  v_vaca JSONB;
  v_evento JSONB;
  v_nuevo_id UUID;
  v_vaca_ids UUID[] := '{}';
  v_animal_ids UUID[];
  v_filas_escritas INTEGER := 0;
  v_eventos_escritos INTEGER := 0;
  v_filas_conservadas INTEGER := 0;
  v_vaca_index INTEGER;
BEGIN
  IF v_fecha IS NULL THEN
    RAISE EXCEPTION 'fn_hato_commit_chequeo_agregar: payload.chequeo.fecha es requerido y debe ser una fecha válida (recibido: %)', payload -> 'chequeo' ->> 'fecha';
  END IF;

  SELECT COALESCE(array_agg((value ->> 'animal_id')::UUID), '{}')
  INTO v_animal_ids
  FROM jsonb_array_elements(COALESCE(payload -> 'vacas', '[]'::jsonb));

  -- Agregar cero vacas no tiene sentido y crearía una cabecera vacía.
  IF COALESCE(array_length(v_animal_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'fn_hato_commit_chequeo_agregar: el payload no trae vacas';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_animal_ids) AS a(id) WHERE a.id IS NULL) THEN
    RAISE EXCEPTION 'fn_hato_commit_chequeo_agregar: una vaca del payload no trae animal_id';
  END IF;

  -- Serializa dos páginas aprobadas a la vez para la misma fecha.
  LOCK TABLE hato_chequeos IN SHARE ROW EXCLUSIVE MODE;

  -- 1. hato_chequeos -- find-or-create por fecha (igual que 069).
  SELECT id INTO v_chequeo_id
  FROM hato_chequeos
  WHERE fecha = v_fecha
  ORDER BY created_at
  LIMIT 1;

  IF v_chequeo_id IS NULL THEN
    INSERT INTO hato_chequeos (fecha, veterinario, estado, fuente, created_by)
    VALUES (v_fecha, v_veterinario, 'cerrado', 'web', p_created_by)
    RETURNING id INTO v_chequeo_id;
  ELSIF v_veterinario IS NOT NULL THEN
    UPDATE hato_chequeos SET veterinario = v_veterinario WHERE id = v_chequeo_id;
  END IF;

  -- 2. Limpieza SCOPEADA a este chequeo Y a los animales del payload. Esta
  --    es la única diferencia con fn_hato_commit_chequeo: las filas de las
  --    demás vacas del chequeo se conservan. Eventos primero (FK sin
  --    ON DELETE CASCADE, 053), luego las vacas.
  DELETE FROM hato_eventos
  WHERE chequeo_vaca_id IN (
    SELECT id FROM hato_chequeo_vacas
    WHERE chequeo_id = v_chequeo_id
      AND animal_id = ANY (v_animal_ids)
  );

  DELETE FROM hato_chequeo_vacas
  WHERE chequeo_id = v_chequeo_id
    AND animal_id = ANY (v_animal_ids);

  -- 3. Insertar las filas frescas (igual que 069).
  FOR v_vaca IN SELECT value FROM jsonb_array_elements(COALESCE(payload -> 'vacas', '[]'::jsonb))
  LOOP
    INSERT INTO hato_chequeo_vacas (
      chequeo_id, animal_id,
      pl_raw, np_raw, ultima_cria_raw, sx_raw, fecha_servicio_raw, toro_raw, tp_raw, estado_raw, secar_raw, pp_raw, ttto_raw,
      pl, num_partos, fecha_servicio, toro, tipo_servicio, fecha_secar, fecha_probable_parto, meses_prenez, estado, normalizacion_issues
    )
    VALUES (
      v_chequeo_id,
      (v_vaca ->> 'animal_id')::UUID,
      v_vaca ->> 'pl_raw',
      v_vaca ->> 'np_raw',
      v_vaca ->> 'ultima_cria_raw',
      v_vaca ->> 'sx_raw',
      v_vaca ->> 'fecha_servicio_raw',
      v_vaca ->> 'toro_raw',
      v_vaca ->> 'tp_raw',
      v_vaca ->> 'estado_raw',
      v_vaca ->> 'secar_raw',
      v_vaca ->> 'pp_raw',
      v_vaca ->> 'ttto_raw',
      (v_vaca ->> 'pl')::NUMERIC,
      (v_vaca ->> 'num_partos')::INTEGER,
      (v_vaca ->> 'fecha_servicio')::DATE,
      v_vaca ->> 'toro',
      v_vaca ->> 'tipo_servicio',
      (v_vaca ->> 'fecha_secar')::DATE,
      (v_vaca ->> 'fecha_probable_parto')::DATE,
      (v_vaca ->> 'meses_prenez')::NUMERIC,
      v_vaca ->> 'estado',
      v_vaca -> 'normalizacion_issues'
    )
    RETURNING id INTO v_nuevo_id;

    v_vaca_ids := array_append(v_vaca_ids, v_nuevo_id);
    v_filas_escritas := v_filas_escritas + 1;
  END LOOP;

  -- 4. Eventos derivados (igual que 069).
  FOR v_evento IN SELECT value FROM jsonb_array_elements(COALESCE(payload -> 'eventos', '[]'::jsonb))
  LOOP
    v_vaca_index := (v_evento ->> 'vaca_index')::INTEGER;
    IF v_vaca_index IS NULL OR v_vaca_index < 0 OR v_vaca_index >= COALESCE(array_length(v_vaca_ids, 1), 0) THEN
      RAISE EXCEPTION 'fn_hato_commit_chequeo_agregar: evento con vaca_index % fuera de rango (vacas escritas: %)', v_vaca_index, COALESCE(array_length(v_vaca_ids, 1), 0);
    END IF;

    INSERT INTO hato_eventos (
      animal_id, tipo, fecha, fecha_confianza, toro_id, tipo_servicio,
      cria_destino, sx_raw, chequeo_vaca_id, fuente, datos, created_by
    )
    SELECT
      cv.animal_id,
      v_evento ->> 'tipo',
      (v_evento ->> 'fecha')::DATE,
      COALESCE(v_evento ->> 'fecha_confianza', 'exacta'),
      NULLIF(v_evento ->> 'toro_id', '')::UUID,
      v_evento ->> 'tipo_servicio',
      v_evento ->> 'cria_destino',
      v_evento ->> 'sx_raw',
      cv.id,
      'chequeo',
      v_evento -> 'datos',
      p_created_by
    FROM hato_chequeo_vacas cv
    WHERE cv.id = v_vaca_ids[v_vaca_index + 1];

    v_eventos_escritos := v_eventos_escritos + 1;
  END LOOP;

  SELECT count(*) INTO v_filas_conservadas
  FROM hato_chequeo_vacas
  WHERE chequeo_id = v_chequeo_id
    AND NOT (animal_id = ANY (v_animal_ids));

  RETURN jsonb_build_object(
    'chequeoId', v_chequeo_id,
    'filasEscritas', v_filas_escritas,
    'eventosEscritos', v_eventos_escritos,
    'filasConservadas', v_filas_conservadas
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_hato_commit_chequeo_agregar(JSONB, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hato_commit_chequeo_agregar(JSONB, UUID) TO service_role;

COMMENT ON FUNCTION public.fn_hato_commit_chequeo_agregar(JSONB, UUID) IS
  'SECURITY DEFINER (202, ESCO-190): "Agregar al chequeo existente". Igual que '
  'fn_hato_commit_chequeo (069) salvo la limpieza: borra y reescribe SOLO las '
  'filas de los animales del payload; conserva las demás vacas del chequeo de '
  'esa fecha. Permite aprobar un chequeo de varias páginas página por página. '
  'Nunca llamar desde el cliente: el endpoint /hato/chequeo/agregar '
  '(hato-chequeo-commit.ts) es el único llamante autorizado.';

-- ---------------------------------------------------------------------
-- 2. Post-guardas
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_oid OID;
  v_prosecdef BOOLEAN;
  v_config TEXT[];
BEGIN
  SELECT p.oid, p.prosecdef, p.proconfig
  INTO v_oid, v_prosecdef, v_config
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_hato_commit_chequeo_agregar';

  IF v_oid IS NULL THEN
    RAISE EXCEPTION '202: la función nueva no quedó creada';
  END IF;
  IF NOT v_prosecdef THEN
    RAISE EXCEPTION '202: la función nueva no es SECURITY DEFINER';
  END IF;
  IF v_config IS NULL OR NOT ('search_path=public, pg_temp' = ANY (v_config)) THEN
    RAISE EXCEPTION '202: search_path no quedó pineado (%)', v_config;
  END IF;
  IF has_function_privilege('anon', v_oid, 'EXECUTE')
     OR has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION '202: anon o authenticated conservan EXECUTE';
  END IF;
  IF NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION '202: service_role no tiene EXECUTE';
  END IF;

  IF (
    SELECT md5(p.prosrc) FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_hato_commit_chequeo'
  ) <> 'da542ea9e2b976a5ac89348b0cd35376' THEN
    RAISE EXCEPTION '202: fn_hato_commit_chequeo cambió; debía quedar intacta';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- ROLLBACK (no se ejecuta). Antes, quitar la ruta /hato/chequeo/agregar
-- de la edge function o el botón "Agregar" quedará fallando con 500.
--
--   DROP FUNCTION public.fn_hato_commit_chequeo_agregar(JSONB, UUID);
-- ---------------------------------------------------------------------
