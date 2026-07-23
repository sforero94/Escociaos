-- =====================================================================
-- 065: fn_hato_commit_chequeo -- commit path del chequeo (B0/V10, paso
-- "Aprobar")
-- Fecha: 2026-07-22
--
-- Cierra el B0/V10 (migración 053+, `hato-chequeo-preview.ts`): ese
-- endpoint SOLO devuelve un diff para aprobar, nunca comete un
-- INSERT/UPDATE. Esta migración agrega la ÚNICA vía de escritura del
-- commit -- `POST .../hato/chequeo/commit` (`hato-chequeo-commit.ts`) llama
-- a esta función UNA vez, con el payload ya construido por el módulo puro
-- `src/utils/importHato/commitChequeo.ts` (validado, sin filas 'nuevo' ni
-- 'no_reconocido' -- ver esa cabecera para la regla dura de alcance).
--
-- Por qué SECURITY DEFINER: mismo precedente que
-- `crear_gasto_pendiente_de_compra()` (038) y `fn_cleanup_compra_dependencies()`
-- (039) -- el handler ya verificó rol Administrador/Gerencia ANTES de
-- llamar a esta función (mismo gate que `hato-chequeo-preview.ts`), así que
-- la función puede escribir sin depender de que la RLS de escritura de
-- `hato_chequeos`/`hato_chequeo_vacas`/`hato_eventos` (patrón 044,
-- Administrador+Gerencia) se re-evalúe fila por fila dentro de la
-- transacción -- una sola verificación de rol en el borde (el endpoint), no
-- una por INSERT.
--
-- Todo-o-nada: UNA llamada de función = UNA transacción de Postgres (una
-- función plpgsql corre implícitamente dentro de la transacción del
-- statement que la invoca). Si cualquier INSERT falla (ej. un animal_id que
-- dejó de existir entre la validación en TypeScript y la llamada a esta
-- función -- carrera de baja probabilidad pero real), toda la función
-- revierte: nunca queda un chequeo a medio escribir.
--
-- Idempotencia SCOPEADA a la fecha del chequeo que se está aprobando (nunca
-- a todo el módulo, a diferencia de `scripts/import-hato/load.ts` que limpia
-- TODO el histórico de importación): si Martha corrige un archivo y lo
-- vuelve a aprobar para la MISMA fecha, esta función reutiliza la cabecera
-- de `hato_chequeos` existente y reemplaza SOLO las filas de
-- `hato_chequeo_vacas` (y los `hato_eventos` que colgaban de ellas) que
-- pertenecen a ESE chequeo -- nunca toca otro chequeo ni otro animal.
--
-- Forma del payload (jsonb), construido por `construirPayloadCommit`
-- (src/utils/importHato/commitChequeo.ts):
--   {
--     "chequeo": { "fecha": "2026-07-09", "veterinario": "Dr. X" | null },
--     "vacas": [
--       { "animal_id": uuid, "pl_raw": text|null, ..., "estado": text|null,
--         "normalizacion_issues": jsonb|null },
--       ...
--     ],
--     "eventos": [
--       { "vaca_index": int,  -- posición 0-based dentro de "vacas" de
--                             -- arriba; las filas de hato_chequeo_vacas
--                             -- todavía no existen cuando el módulo TS
--                             -- construye el payload, así que los eventos
--                             -- no pueden traer un chequeo_vaca_id real
--                             -- todavía -- esta función lo resuelve al
--                             -- insertar.
--         "tipo": text, "fecha": date, "fecha_confianza": text,
--         "tipo_servicio": text|null, "toro_id": uuid|null,
--         "cria_destino": text|null, "sx_raw": text|null,
--         "datos": jsonb|null },
--       ...
--     ]
--   }
--
-- `toro_id` ya viene RESUELTO por el handler (SELECT-o-INSERT en
-- hato_toros, I/O -- esta función nunca toca hato_toros ni resuelve nombres
-- de toro).
--
-- Idempotente de re-crear (CREATE OR REPLACE): seguro de re-ejecutar esta
-- migración.
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
  --    para el paso 4.
  -- -------------------------------------------------------------------
  FOR v_vaca IN SELECT value FROM jsonb_array_elements(COALESCE(payload -> 'vacas', '[]'::jsonb))
  LOOP
    INSERT INTO hato_chequeo_vacas (
      chequeo_id, animal_id,
      pl_raw, np_raw, ultima_cria_raw, sx_raw, fecha_servicio_raw, toro_raw, tp_raw, estado_raw, secar_raw, pp_raw, ttto_raw,
      pl, num_partos, fecha_servicio, toro, tipo_servicio, fecha_secar, fecha_probable_parto, estado, normalizacion_issues
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
    IF v_vaca_index IS NULL OR v_vaca_index < 0 OR v_vaca_index >= array_length(v_vaca_ids, 1) THEN
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

GRANT EXECUTE ON FUNCTION fn_hato_commit_chequeo(JSONB, UUID) TO authenticated;

COMMENT ON FUNCTION fn_hato_commit_chequeo(JSONB, UUID) IS
  'SECURITY DEFINER: commit path del chequeo B0/V10 (paso "Aprobar"). Recibe '
  'el payload ya validado/construido por src/utils/importHato/commitChequeo.ts '
  '(el handler ya verificó rol Administrador/Gerencia y revalidó el diff contra '
  'el estado fresco antes de llamar). Todo-o-nada: una llamada = una transacción. '
  'Idempotente SCOPEADA a la fecha del chequeo del payload -- nunca toca otro '
  'chequeo ni otro animal. Nunca llamar directamente desde el cliente: el '
  'endpoint hato-chequeo-commit.ts es el único caller autorizado.';
