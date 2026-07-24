-- =====================================================================
-- 069: fn_hato_commit_chequeo -- wirear meses_prenez en el INSERT del RPC
-- Fecha: 2026-07-24
--
-- Renumerada 067 -> 069 durante la integración: 067 y 068 las tomaron
-- sesiones concurrentes (misma colisión de numeración que ya ocurrió antes
-- en el repo).
--
-- Follow-up de la migración 065. La columna `hato_chequeo_vacas.meses_prenez`
-- existe desde 053, pero el INSERT del commit path (065) nunca la incluyó en
-- su lista de columnas, así que la vía en vivo (`POST .../hato/chequeo/commit`
-- -> `fn_hato_commit_chequeo`) descartaba el valor en silencio.
--
-- El módulo puro `src/utils/importHato/commitChequeo.ts` YA deriva
-- `meses_prenez` (vía `calcularMesesPrenez`, el mismo motor que usa el resto
-- del módulo) y lo pone en cada objeto vaca del payload; `construirPayloadCommit`
-- pasa el arreglo `vacas` tal cual, así que el valor ya viaja en el jsonb. Esta
-- migración solo agrega la columna + su lectura `(v_vaca ->> 'meses_prenez')`
-- al INSERT. Todo lo demás es byte-idéntico a 065.
--
-- `meses_prenez` es NULL (nunca 0) cuando no hay servicio vigente o falta la
-- fecha del chequeo -- misma regla "sin dato != 0" del resto del hato.
--
-- CREATE OR REPLACE: seguro de re-ejecutar. Requiere redeploy de la edge
-- function (`npx supabase functions deploy make-server-1ccce916`) porque las
-- copias espejo de `commitChequeo.ts` cambiaron en el mismo cambio de S-B.
-- =====================================================================

CREATE OR REPLACE FUNCTION fn_hato_commit_chequeo(payload JSONB, p_created_by UUID)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
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
  v_filas_escritas INTEGER := 0;
  v_eventos_escritos INTEGER := 0;
  v_vaca_index INTEGER;
BEGIN
  IF v_fecha IS NULL THEN
    RAISE EXCEPTION 'fn_hato_commit_chequeo: payload.chequeo.fecha es requerido y debe ser una fecha válida (recibido: %)', payload -> 'chequeo' ->> 'fecha';
  END IF;

  -- -------------------------------------------------------------------
  -- 1. hato_chequeos -- find-or-create por fecha. Si ya existe una
  --    cabecera para esta fecha (re-aprobación de una corrección), se
  --    reutiliza; el veterinario se actualiza solo si el payload trae uno
  --    (nunca pisa un valor existente con NULL).
  -- -------------------------------------------------------------------
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

  -- -------------------------------------------------------------------
  -- 2. Limpieza idempotente SCOPEADA a este chequeo -- nunca a otro. Los
  --    eventos primero (FK hato_eventos.chequeo_vaca_id -> hato_chequeo_vacas
  --    sin ON DELETE CASCADE, migración 053), luego las vacas.
  -- -------------------------------------------------------------------
  DELETE FROM hato_eventos
  WHERE chequeo_vaca_id IN (SELECT id FROM hato_chequeo_vacas WHERE chequeo_id = v_chequeo_id);

  DELETE FROM hato_chequeo_vacas WHERE chequeo_id = v_chequeo_id;

  -- -------------------------------------------------------------------
  -- 3. Insertar las filas frescas de hato_chequeo_vacas, en el MISMO
  --    orden del arreglo "vacas" del payload -- ese orden es "vaca_index"
  --    para el paso 4. (069: se agrega meses_prenez a la lista.)
  -- -------------------------------------------------------------------
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

  -- -------------------------------------------------------------------
  -- 4. Insertar los eventos derivados, wireando chequeo_vaca_id contra el
  --    arreglo de ids que acabamos de crear ("vaca_index" es 0-based, los
  --    arreglos de Postgres son 1-based).
  -- -------------------------------------------------------------------
  FOR v_evento IN SELECT value FROM jsonb_array_elements(COALESCE(payload -> 'eventos', '[]'::jsonb))
  LOOP
    v_vaca_index := (v_evento ->> 'vaca_index')::INTEGER;
    -- COALESCE obligatorio: array_length de un arreglo vacío es NULL, y
    -- "0 >= NULL" es NULL (no TRUE), lo que saltaría la excepción en
    -- silencio si llegara un payload con eventos pero sin vacas.
    IF v_vaca_index IS NULL OR v_vaca_index < 0 OR v_vaca_index >= COALESCE(array_length(v_vaca_ids, 1), 0) THEN
      RAISE EXCEPTION 'fn_hato_commit_chequeo: evento con vaca_index % fuera de rango (vacas escritas: %)', v_vaca_index, COALESCE(array_length(v_vaca_ids, 1), 0);
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

  RETURN jsonb_build_object(
    'chequeoId', v_chequeo_id,
    'filasEscritas', v_filas_escritas,
    'eventosEscritos', v_eventos_escritos
  );
END;
$$;

-- CREATE OR REPLACE preserva los grants existentes, pero se re-emiten por
-- consistencia con 065 (mismo razonamiento de seguridad: la función no tiene
-- chequeo de rol interno; el endpoint hato-chequeo-commit.ts es el único gate).
REVOKE EXECUTE ON FUNCTION fn_hato_commit_chequeo(JSONB, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_hato_commit_chequeo(JSONB, UUID) TO service_role;

COMMENT ON FUNCTION fn_hato_commit_chequeo(JSONB, UUID) IS
  'SECURITY DEFINER: commit path del chequeo B0/V10 (paso "Aprobar"). Recibe '
  'el payload ya validado/construido por src/utils/importHato/commitChequeo.ts '
  '(el handler ya verificó rol Administrador/Gerencia y revalidó el diff contra '
  'el estado fresco antes de llamar). Todo-o-nada: una llamada = una transacción. '
  'Idempotente SCOPEADA a la fecha del chequeo del payload -- nunca toca otro '
  'chequeo ni otro animal. Nunca llamar directamente desde el cliente: el '
  'endpoint hato-chequeo-commit.ts es el único caller autorizado. '
  '069: persiste meses_prenez (antes se descartaba en el INSERT).';
