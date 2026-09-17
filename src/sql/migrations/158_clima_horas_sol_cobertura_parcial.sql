-- =============================================================================
-- 158_clima_horas_sol_cobertura_parcial.sql
--
-- Issue #268 / ESCO-108. `fn_clima_rollup_diario` (migracion 151) escribe
-- `horas_sol_duracion = 0.00` en dias de cobertura parcial
-- (`lecturas_count < 240`). El contrato de la 151 es NULL = sin dato,
-- nunca un 0 fabricado. La lluvia ya usa `v_min_lecturas`; el sol no.
--
-- Caso verificado 2026-09-17 contra produccion: 2026-09-16,
-- lecturas_count=11 (solo medianoche), horas_sol_duracion=0.00,
-- lluvia_confianza=cobertura_parcial. El rollup de esta noche sellaria
-- 2026-09-17 igual (corte de luz ~31 h, restaurado 13:25Z -- solo la
-- tarde de Bogota).
--
-- QUÉ CAMBIA (CREATE OR REPLACE de fn_clima_rollup_diario -- NUNCA se
-- edita el fichero 151, ya aplicado):
--   El CASE de horas_sol_duracion gana el brazo de cobertura:
--     WHEN COUNT(radiacion_wm2) = 0 THEN NULL
--     WHEN COUNT(*) < v_min_lecturas THEN NULL   -- el 240 del mismo CTE
--     ELSE ROUND(...)
--
-- Lo que NO cambia, a proposito:
--   * radiacion_wm2_avg / uv_index_max tienen el mismo defecto (un dia
--     de 11 lecturas nocturnas fabrica 0.00 W/m2 y UV). FUERA DE ALCANCE
--     -- decision aparte, no se arreglan aca.
--   * Lluvia, cobertura_corta, search_path, la poda de 24 h: intactos.
--   * No se inventan lecturas ni se llama al RPC sobre fechas
--     historicas (leccion de la 122: la poda es global).
--
-- DATOS: UPDATE clima_resumen_diario SET horas_sol_duracion = NULL
-- WHERE lecturas_count < 240 AND horas_sol_duracion IS NOT NULL.
-- No fabrica un valor: solo retira el 0 (o cualquier cifra) que la 151
-- sello sobre un dia incompleto. 2026-09-17 entra si el rollup de las
-- 05:15Z ya lo sello mal antes de aplicar esta migracion.
--
-- Precondicion: md5(prosrc) del cuerpo VIVO de la 151
-- `8ca02e657033b4fd273fdb06d52edb0f` (6009 bytes, verificado 2026-09-17).
-- Patron de la 143: si produccion diverio, abortar en vez de pisar.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. Guardas previas.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_src     text;
  v_col     integer;
  v_fn      integer;
  v_malos   integer;
BEGIN
  SELECT count(*) INTO v_col FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'clima_resumen_diario'
     AND column_name = 'horas_sol_duracion';
  IF v_col <> 1 THEN
    RAISE EXCEPTION 'Migracion 158 ABORTADA (pre): horas_sol_duracion no existe -- depende de la 151.';
  END IF;

  SELECT count(*) INTO v_fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_clima_rollup_diario';
  IF v_fn <> 1 THEN
    RAISE EXCEPTION 'Migracion 158 ABORTADA (pre): se esperaba 1 fn_clima_rollup_diario y hay %.', v_fn;
  END IF;

  SELECT p.prosrc INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_clima_rollup_diario';

  IF v_src ILIKE '%WHEN COUNT(*) < v_min_lecturas THEN NULL%' THEN
    RAISE EXCEPTION 'Migracion 158 ABORTADA (pre): fn_clima_rollup_diario YA tiene el brazo de cobertura del sol -- lo mas probable es que esta migracion ya se aplico. Revisar a mano antes de reintentar.';
  END IF;

  -- Nunca sobrescribir en silencio un cambio hecho fuera del repo (leccion
  -- de la 143): el hash es el prosrc vivo de la 151, medido 2026-09-17.
  IF md5(v_src) <> '8ca02e657033b4fd273fdb06d52edb0f' THEN
    RAISE EXCEPTION 'Migracion 158 ABORTADA (pre): fn_clima_rollup_diario difiere del cuerpo vivo revisado (md5 actual %). No sobrescribir un cambio vivo sin incorporarlo primero.', md5(v_src);
  END IF;

  SELECT count(*) INTO v_malos
    FROM public.clima_resumen_diario
   WHERE lecturas_count < 240
     AND horas_sol_duracion IS NOT NULL;
  PERFORM set_config('m158.malos_pre', v_malos::text, true);

  RAISE NOTICE 'Migracion 158: pre-condiciones OK -- md5 de la 151, % fila(s) con duracion fabricada sobre cobertura corta.', v_malos;
END $$;


-- -----------------------------------------------------------------------------
-- 1. El rollup de la 151, mas el brazo de cobertura en horas_sol_duracion.
--
-- Cuerpo de la 151 con UN cambio: el CASE del sol consulta v_min_lecturas
-- (240), el mismo umbral que ya alimenta lluvia_confianza. Lluvia,
-- cobertura, search_path y la poda de 24 h se conservan.
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
        WHEN COUNT(*) < v_min_lecturas THEN NULL
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
  'Rollup nocturno de clima_lecturas -> clima_resumen_diario. Lluvia: contador vs reconstruccion por evento (122), cobertura 103/115. horas_sol_duracion: horas con radiacion >= 120 W/m2 × 5/60; NULL si COUNT(*) < 240 (158, nunca un 0 fabricado). p_fecha por defecto: ayer (Bogota). NO llamar en paralelo sobre fechas historicas: la poda de 24 h es global.';


-- -----------------------------------------------------------------------------
-- 2. Retirar duraciones fabricadas sobre dias incompletos. No inventa
--    lecturas: solo NULL. radiacion_wm2_avg / uv_index_max no se tocan.
-- -----------------------------------------------------------------------------
UPDATE public.clima_resumen_diario
   SET horas_sol_duracion = NULL
 WHERE lecturas_count < 240
   AND horas_sol_duracion IS NOT NULL;


-- -----------------------------------------------------------------------------
-- 3. Post-condiciones.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_src      text;
  v_fn_cfg   text;
  v_secdef   boolean;
  v_malos    integer;
  v_0916     numeric;
BEGIN
  SELECT p.prosrc, array_to_string(p.proconfig, ','), p.prosecdef
    INTO v_src, v_fn_cfg, v_secdef
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_clima_rollup_diario';

  IF v_src NOT ILIKE '%WHEN COUNT(*) < v_min_lecturas THEN NULL%' THEN
    RAISE EXCEPTION 'Migracion 158 ABORTADA (post): el CASE del sol no quedo con el brazo de cobertura.';
  END IF;
  IF v_src NOT ILIKE '%WHEN COUNT(radiacion_wm2) = 0 THEN NULL%'
     OR v_src NOT ILIKE '%v_umbral_sol_wm2%'
     OR v_src NOT ILIKE '%lluvia_evento_mm%' THEN
    RAISE EXCEPTION 'Migracion 158 ABORTADA (post): se perdio el cuerpo de la 151 (umbral 120 o reconstruccion de lluvia).';
  END IF;
  IF v_src LIKE '%IS NOT DISTINCT FROM y.lluvia_total_mm%' THEN
    RAISE EXCEPTION 'Migracion 158 ABORTADA (post): la funcion volvio a comparar el total de hoy contra el de ayer.';
  END IF;
  IF v_secdef IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'Migracion 158 ABORTADA (post): la funcion quedo SECURITY DEFINER -- debia seguir INVOKER.';
  END IF;
  IF v_fn_cfg IS NULL OR v_fn_cfg !~ 'search_path=public,\s*pg_temp' THEN
    RAISE EXCEPTION 'Migracion 158 ABORTADA (post): fn_clima_rollup_diario perdio el search_path pineado (encontrado: %).', v_fn_cfg;
  END IF;

  SELECT count(*) INTO v_malos
    FROM public.clima_resumen_diario
   WHERE lecturas_count < 240
     AND horas_sol_duracion IS NOT NULL;
  IF v_malos <> 0 THEN
    RAISE EXCEPTION 'Migracion 158 ABORTADA (post): quedan % filas con duracion sobre lecturas_count < 240.', v_malos;
  END IF;

  SELECT horas_sol_duracion INTO v_0916
    FROM public.clima_resumen_diario
   WHERE fecha = DATE '2026-09-16'
   LIMIT 1;
  IF FOUND AND v_0916 IS NOT NULL THEN
    RAISE EXCEPTION 'Migracion 158 ABORTADA (post): 2026-09-16 sigue con horas_sol_duracion = % -- el caso que motivo el hallazgo.', v_0916;
  END IF;

  RAISE NOTICE 'Migracion 158: post-condiciones OK -- brazo de cobertura en el sol, search_path pineado, 0 filas con duracion fabricada (pre: %).',
    current_setting('m158.malos_pre', true);
END $$;


-- =============================================================================
-- ROLLBACK (manual)
-- =============================================================================
-- Restaurar la funcion de la 151 (su paso 2 tal cual) y, si hace falta
-- reponer el 0.00 de 2026-09-16, eso es re-fabricar el defecto -- no hay
-- rollback de dato que no sea peor que dejar NULL.
-- =============================================================================
