-- =============================================================================
-- 151_clima_horas_sol_duracion.sql
--
-- Issue #249. La cifra que la UI llamaba "horas-sol" NUNCA fue duracion de
-- sol: es energia diaria kWh/m2 = (radiacion_wm2_avg × 24) / 1000. El sensor
-- esta bien (picos 1000-1200 W/m2). Lo que faltaba es la duracion (horas con
-- radiacion >= 120 W/m2, umbral WMO) persistida en el rollup diario.
--
-- `clima_lecturas` es una ventana rodante de ~24 h. Sin esta columna, el
-- historico no puede mostrar tiempo de sol: las lecturas de 5 min ya no
-- existen. La energia sigue saliendo de radiacion_wm2_avg (serie intacta).
--
-- -----------------------------------------------------------------------------
-- LO QUE ESTA MIGRACION NO HACE
-- -----------------------------------------------------------------------------
-- No llama a fn_clima_rollup_diario sobre fechas historicas: esa funcion
-- termina con DELETE FROM clima_lecturas WHERE timestamp < now() - 24h
-- GLOBAL, y un backfill paralelo ya borro lecturas vivas (leccion de la 122).
-- El UPDATE de duracion usa SOLO las lecturas que todavia viven.
--
-- No reescribe energia ni radiacion_wm2_avg. No toca ingest/MAC.
--
-- Historia anterior a la ventana viva queda horas_sol_duracion = NULL hasta
-- que alguien dispare POST /clima/backfill en serie (despues de aplicar).
-- El codigo de la app reintenta el SELECT sin la columna (PGRST204), asi
-- que desplegar la app ANTES de aplicar no tumba clima.
--
-- Umbral 120 y cadencia 5 min: mismos literales que
-- src/utils/calculosRadiacion.ts (UMBRAL_TIEMPO_SOL_WM2, INTERVALO_LECTURA_MINUTOS).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. Guardas previas.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_col integer;
  v_fn  integer;
  v_fn_def text;
  v_total_pre integer;
BEGIN
  SELECT count(*) INTO v_col FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'clima_resumen_diario'
     AND column_name = 'horas_sol_duracion';
  IF v_col <> 0 THEN
    RAISE EXCEPTION 'Migracion 151: horas_sol_duracion ya existe -- ya se corrio. ABORTA.';
  END IF;

  SELECT count(*) INTO v_fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_clima_rollup_diario';
  IF v_fn <> 1 THEN
    RAISE EXCEPTION 'Migracion 151: se esperaba 1 fn_clima_rollup_diario y hay %. ABORTA.', v_fn;
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_fn_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_clima_rollup_diario';
  IF v_fn_def NOT LIKE '%lluvia_evento_mm%' OR v_fn_def NOT LIKE '%v_tolerancia_mm%' THEN
    RAISE EXCEPTION 'Migracion 151: fn_clima_rollup_diario viva no es la de la 122. ABORTA para no pisar un cuerpo desconocido.';
  END IF;
  IF v_fn_def LIKE '%horas_sol_duracion%' THEN
    RAISE EXCEPTION 'Migracion 151: la funcion ya menciona horas_sol_duracion y la columna no. Estado inconsistente. ABORTA.';
  END IF;

  SELECT count(*) INTO v_total_pre FROM public.clima_resumen_diario;
  PERFORM set_config('m151.total_pre', v_total_pre::text, true);

  RAISE NOTICE 'Migracion 151: pre-condiciones OK -- % filas al arrancar.', v_total_pre;
END $$;


-- -----------------------------------------------------------------------------
-- 1. Columna aditiva. NULL = sin dato (historia previa a esta migracion, o
--    un dia sin ninguna lectura con radiacion_wm2). 0 = dia nublado real.
-- -----------------------------------------------------------------------------
ALTER TABLE public.clima_resumen_diario
  ADD COLUMN IF NOT EXISTS horas_sol_duracion numeric(5,2);

COMMENT ON COLUMN public.clima_resumen_diario.horas_sol_duracion IS
  'Tiempo de sol del dia en horas: conteo de lecturas de 5 min con radiacion_wm2 >= 120 (umbral WMO) × 5/60. Distinto de la energia diaria (radiacion_wm2_avg × 24 / 1000 kWh/m2). NULL = sin dato, nunca un 0 fabricado. Migracion 151 / issue #249.';


-- -----------------------------------------------------------------------------
-- 2. El rollup de la 122, mas horas_sol_duracion en el agregado.
--
-- Cuerpo de la 122 con UN cambio estructural: el CTE `agregado` calcula la
-- duracion y el INSERT/UPDATE la persiste. Lluvia, cobertura, search_path y
-- la poda de 24 h se conservan. SET search_path = public, pg_temp -- lo
-- pineo la 082 y un CREATE OR REPLACE sin el lo perderia.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_clima_rollup_diario(p_fecha date DEFAULT (now() AT TIME ZONE 'America/Bogota')::date - 1)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_margen_fin_dia CONSTANT interval := interval '30 minutes';
  v_tolerancia_mm  CONSTANT numeric  := 0.5;
  v_tolerancia_pct CONSTANT numeric  := 0.10;
  v_min_lecturas   CONSTANT integer  := 240;
  -- WMO-style sunshine duration (global radiation). Keep in sync with
  -- src/utils/calculosRadiacion.ts UMBRAL_TIEMPO_SOL_WM2.
  v_umbral_sol_wm2 CONSTANT numeric  := 120;
  -- Ecowitt ingest cadence (migracion 030). Keep in sync with
  -- INTERVALO_LECTURA_MINUTOS.
  v_intervalo_min  CONSTANT numeric  := 5;
BEGIN
  WITH base AS (
    SELECT
      timestamp,
      station_id,
      (timestamp AT TIME ZONE 'America/Bogota')::date AS fecha,
      temp_c, humedad_pct, viento_kmh, rafaga_kmh, viento_dir,
      radiacion_wm2, uv_index,
      lluvia_diaria_mm,
      lluvia_evento_mm,
      lluvia_tasa_mm_hr,
      lluvia_diaria_actualizada_en,
      lluvia_evento_mm
        - LAG(lluvia_evento_mm) OVER (PARTITION BY station_id ORDER BY timestamp) AS d_evento
    FROM clima_lecturas
  ),
  agregado AS (
    SELECT
      fecha,
      station_id,
      ROUND(MIN(temp_c), 2) AS temp_c_min,
      ROUND(MAX(temp_c), 2) AS temp_c_max,
      ROUND(AVG(temp_c), 2) AS temp_c_avg,
      ROUND(MIN(humedad_pct), 2) AS humedad_pct_min,
      ROUND(MAX(humedad_pct), 2) AS humedad_pct_max,
      ROUND(AVG(humedad_pct), 2) AS humedad_pct_avg,
      ROUND(MAX(lluvia_diaria_mm), 2) AS lluvia_contador,
      ROUND(SUM(GREATEST(COALESCE(d_evento, 0), 0)), 2) AS lluvia_evento,
      COUNT(lluvia_evento_mm) AS n_evento,
      ROUND(AVG(viento_kmh), 2) AS viento_kmh_avg,
      ROUND(MAX(rafaga_kmh), 2) AS rafaga_kmh_max,
      ROUND(
        DEGREES(
          ATAN2(
            AVG(SIN(RADIANS(viento_dir))),
            AVG(COS(RADIANS(viento_dir)))
          )
        )::numeric % 360, 1
      ) AS viento_dir_predominante,
      ROUND(AVG(radiacion_wm2), 2) AS radiacion_wm2_avg,
      ROUND(MAX(radiacion_wm2), 2) AS radiacion_wm2_max,
      CASE
        WHEN COUNT(radiacion_wm2) = 0 THEN NULL
        ELSE ROUND(
          (COUNT(*) FILTER (WHERE radiacion_wm2 >= v_umbral_sol_wm2))::numeric
          * v_intervalo_min / 60.0
        , 2)
      END AS horas_sol_duracion,
      MAX(uv_index) AS uv_index_max,
      COUNT(*) AS lecturas_count,
      (ARRAY_AGG(lluvia_diaria_actualizada_en ORDER BY timestamp DESC))[1] AS ultima_actualizacion_lluvia,
      MAX(timestamp) AS ultima_lectura_en
    FROM base
    WHERE fecha = p_fecha
    GROUP BY fecha, station_id
  ),
  senales AS (
    SELECT
      a.*,
      (a.n_evento > 0) AS hay_senal,
      (a.lecturas_count < v_min_lecturas
       OR (a.fecha + interval '1 day') - (a.ultima_lectura_en AT TIME ZONE 'America/Bogota') > v_margen_fin_dia
      ) AS cobertura_corta,
      (a.ultima_actualizacion_lluvia IS NOT NULL
       AND (a.ultima_actualizacion_lluvia AT TIME ZONE 'America/Bogota')::date < a.fecha
      ) AS frescura_vencida,
      (a.lluvia_contador IS NOT NULL
       AND ABS(a.lluvia_contador - a.lluvia_evento)
           <= GREATEST(v_tolerancia_mm, a.lluvia_contador * v_tolerancia_pct)
      ) AS coincide
    FROM agregado a
  ),
  evaluado AS (
    SELECT
      s.*,
      CASE
        WHEN NOT s.hay_senal THEN
          CASE
            WHEN s.cobertura_corta                          THEN 'cobertura_parcial'
            WHEN s.ultima_actualizacion_lluvia IS NULL      THEN 'sin_time_piezo'
            WHEN s.frescura_vencida                         THEN 'contador_congelado'
            ELSE 'ok'
          END
        WHEN s.cobertura_corta                              THEN 'cobertura_parcial'
        WHEN s.coincide                                     THEN 'ok'
        ELSE 'reconstruido'
      END AS lluvia_confianza,
      CASE
        WHEN NOT s.hay_senal THEN
          CASE
            WHEN s.cobertura_corta OR s.frescura_vencida    THEN NULL
            ELSE s.lluvia_contador
          END
        WHEN s.cobertura_corta                              THEN s.lluvia_evento
        WHEN s.coincide                                     THEN s.lluvia_contador
        ELSE s.lluvia_evento
      END AS lluvia_total_mm_final
    FROM senales s
  )
  INSERT INTO clima_resumen_diario (
    fecha, station_id,
    temp_c_min, temp_c_max, temp_c_avg,
    humedad_pct_min, humedad_pct_max, humedad_pct_avg,
    lluvia_total_mm, lluvia_confianza, lluvia_mm_evento,
    viento_kmh_avg, rafaga_kmh_max,
    viento_dir_predominante,
    radiacion_wm2_avg, radiacion_wm2_max,
    horas_sol_duracion,
    uv_index_max,
    lecturas_count,
    ultima_lectura_en
  )
  SELECT
    fecha, station_id,
    temp_c_min, temp_c_max, temp_c_avg,
    humedad_pct_min, humedad_pct_max, humedad_pct_avg,
    lluvia_total_mm_final,
    lluvia_confianza,
    CASE WHEN hay_senal THEN lluvia_evento ELSE NULL END,
    viento_kmh_avg, rafaga_kmh_max,
    viento_dir_predominante,
    radiacion_wm2_avg, radiacion_wm2_max,
    horas_sol_duracion,
    uv_index_max,
    lecturas_count,
    ultima_lectura_en
  FROM evaluado
  ON CONFLICT (fecha, station_id) DO UPDATE SET
    temp_c_min      = EXCLUDED.temp_c_min,
    temp_c_max      = EXCLUDED.temp_c_max,
    temp_c_avg      = EXCLUDED.temp_c_avg,
    humedad_pct_min = EXCLUDED.humedad_pct_min,
    humedad_pct_max = EXCLUDED.humedad_pct_max,
    humedad_pct_avg = EXCLUDED.humedad_pct_avg,
    lluvia_total_mm = EXCLUDED.lluvia_total_mm,
    lluvia_confianza = EXCLUDED.lluvia_confianza,
    lluvia_mm_evento = EXCLUDED.lluvia_mm_evento,
    viento_kmh_avg  = EXCLUDED.viento_kmh_avg,
    rafaga_kmh_max  = EXCLUDED.rafaga_kmh_max,
    viento_dir_predominante = EXCLUDED.viento_dir_predominante,
    radiacion_wm2_avg = EXCLUDED.radiacion_wm2_avg,
    radiacion_wm2_max = EXCLUDED.radiacion_wm2_max,
    horas_sol_duracion = EXCLUDED.horas_sol_duracion,
    uv_index_max    = EXCLUDED.uv_index_max,
    lecturas_count  = EXCLUDED.lecturas_count,
    ultima_lectura_en = EXCLUDED.ultima_lectura_en;

  DELETE FROM clima_lecturas
  WHERE timestamp < now() - interval '24 hours';
END;
$$;

COMMENT ON FUNCTION public.fn_clima_rollup_diario IS
  'Rollup nocturno de clima_lecturas -> clima_resumen_diario. Lluvia: contador vs reconstruccion por evento (122), cobertura 103/115. horas_sol_duracion: horas con radiacion >= 120 W/m2 × 5/60 (151). p_fecha por defecto: ayer (Bogota). NO llamar en paralelo sobre fechas historicas: la poda de 24 h es global.';


-- -----------------------------------------------------------------------------
-- 3. Backfill SOLO desde lecturas vivas. No se llama al RPC.
-- -----------------------------------------------------------------------------
UPDATE public.clima_resumen_diario r
   SET horas_sol_duracion = s.duracion
  FROM (
    SELECT
      (timestamp AT TIME ZONE 'America/Bogota')::date AS fecha,
      station_id,
      CASE
        WHEN COUNT(radiacion_wm2) = 0 THEN NULL
        ELSE ROUND(
          (COUNT(*) FILTER (WHERE radiacion_wm2 >= 120))::numeric * 5.0 / 60.0
        , 2)
      END AS duracion
    FROM public.clima_lecturas
    GROUP BY 1, 2
  ) s
 WHERE r.fecha = s.fecha
   AND r.station_id = s.station_id;


-- -----------------------------------------------------------------------------
-- 4. Post-condiciones.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_col_tipo   text;
  v_fn_def     text;
  v_fn_cfg     text;
  v_total_post integer;
  v_total_pre  text;
BEGIN
  SELECT data_type INTO v_col_tipo FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'clima_resumen_diario'
     AND column_name = 'horas_sol_duracion';
  IF v_col_tipo IS NULL THEN
    RAISE EXCEPTION 'Migracion 151: horas_sol_duracion no quedo creada. ABORTA.';
  END IF;

  SELECT pg_get_functiondef(p.oid), array_to_string(p.proconfig, ',')
    INTO v_fn_def, v_fn_cfg
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_clima_rollup_diario';

  IF v_fn_def NOT LIKE '%horas_sol_duracion%'
     OR v_fn_def NOT LIKE '%v_umbral_sol_wm2%'
     OR v_fn_def NOT LIKE '%lluvia_evento_mm%' THEN
    RAISE EXCEPTION 'Migracion 151: la funcion no quedo con duracion + reconstruccion de lluvia. ABORTA.';
  END IF;
  IF v_fn_def LIKE '%IS NOT DISTINCT FROM y.lluvia_total_mm%' THEN
    RAISE EXCEPTION 'Migracion 151: la funcion volvio a comparar el total de hoy contra el de ayer. ABORTA.';
  END IF;
  IF v_fn_cfg IS NULL OR v_fn_cfg !~ 'search_path=public,\s*pg_temp' THEN
    RAISE EXCEPTION 'Migracion 151: fn_clima_rollup_diario perdio el search_path pineado (encontrado: %). ABORTA.', v_fn_cfg;
  END IF;

  SELECT count(*) INTO v_total_post FROM public.clima_resumen_diario;
  v_total_pre := current_setting('m151.total_pre', true);
  IF v_total_pre IS NULL OR v_total_pre = '' THEN
    RAISE EXCEPTION 'Migracion 151: no se encontro el conteo de partida. Correr el archivo como UNA transaccion.';
  END IF;
  IF v_total_post < v_total_pre::integer THEN
    RAISE EXCEPTION 'Migracion 151: clima_resumen_diario paso de % a % filas. Esta migracion no borra.',
      v_total_pre, v_total_post;
  END IF;

  RAISE NOTICE 'Migracion 151: post-condiciones OK -- columna creada, funcion con umbral 120 y search_path pineado, % filas (no bajaron).', v_total_post;
END $$;


-- =============================================================================
-- ROLLBACK (manual)
-- =============================================================================
-- Restaurar la funcion de la 122 (su paso 2 tal cual) y despues:
--   ALTER TABLE public.clima_resumen_diario DROP COLUMN IF EXISTS horas_sol_duracion;
-- =============================================================================
