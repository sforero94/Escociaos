-- =============================================================================
-- 183_clima_contador_lluvia_medianoche.sql -- ESCO-155 (P3, clase ddl_aditivo)
-- =============================================================================
-- ESCRITA, SIN APLICAR. La aplica Santiago (o una sesion en vivo con su go)
-- con apply_migration. Antes de escribir "Aplicada" en CLAUDE.md, verificar
-- contra supabase_migrations.schema_migrations, nunca contra esta cabecera.
--
-- PROBLEMA: `fn_clima_rollup_diario` toma
--   lluvia_contador = MAX(lluvia_diaria_mm)
-- sobre TODAS las lecturas cuya hora de Bogota cae en el dia. El sync corre
-- a hh:00:02 y el contador diario de Ecowitt llega ~20 s viejo, asi que la
-- lectura de las 00:00:02 todavia trae el total de AYER. Verificado en
-- clima_lecturas 2026-10-15: 05:00:02Z lluvia_diaria_mm = 2,54 con
-- lluvia_diaria_actualizada_en = 04:59:40Z (23:59:40 del 10-14); 05:05:02Z
-- lluvia_diaria_mm = 0,00.
--
-- EFECTO: si el total de ayer cae dentro de la tolerancia del evento de hoy,
-- el dia se sella 'ok' con el contador de AYER (2026-09-20: 0,25 mm en un dia
-- seco; 2026-09-24: 0,76 contra 0,51). Si no, el valor guardado es correcto
-- (sale del evento) pero la etiqueta 'reconstruido' sobra (6 de 13 dias de
-- octubre). Caso latente peor: un dia sin lluvia_evento_mm (n_evento = 0)
-- escribiria el total de ayer como el de hoy -- la clase de duplicado
-- fabricado que cerro la 068.
--
-- QUE CAMBIA (CREATE OR REPLACE -- nunca se editan 122/151/158/159):
--   UNA linea del CTE `agregado`:
--     ROUND(MAX(lluvia_diaria_mm) FILTER (
--       WHERE lluvia_diaria_actualizada_en IS NULL
--          OR (lluvia_diaria_actualizada_en AT TIME ZONE 'America/Bogota')::date = fecha
--     ), 2) AS lluvia_contador
--   Una lectura cuyo contador se actualizo OTRO dia no entra al MAX.
--
-- POR QUE `IS NULL` ENTRA: las filas del backfill de la History API
-- (`parseEcowittHistory`, clima.tsx) no traen lluvia_diaria_actualizada_en.
-- Excluirlas dejaria a los dias recuperados sin contador. Con el filtro asi,
-- un backfill da exactamente el mismo resultado que hoy.
--
-- SI TODAS LAS LECTURAS QUEDAN FUERA (contador congelado todo el dia):
-- lluvia_contador = NULL. Con senal de evento -> 'reconstruido' con el valor
-- del evento (igual que hoy, porque el contador viejo no coincidia). Sin
-- senal -> la rama existente: frescura_vencida -> NULL. Nunca se fabrica
-- un cero ni se copia el total de ayer.
--
-- QUE NO CAMBIA: frescura_vencida, tolerancias, cobertura por hueco (159),
-- horas de sol (151/158), poda de 24 h, SECURITY INVOKER, search_path.
-- No reescribe ninguna fila historica: la correccion de 2026-09-20 y
-- 2026-09-24 es clase datos y necesita un go aparte (ver ESCO-155).
--
-- PRECONDICION: md5(prosrc) del cuerpo VIVO = f5b7950c34e02959c542eab08cbb7e73
-- (verificado 2026-10-18). Patron 143: si produccion diverge, aborta.
--
-- ROLLBACK: CREATE OR REPLACE con el cuerpo anterior (identico a este salvo
-- la linea de lluvia_contador, que vuelve a ROUND(MAX(lluvia_diaria_mm), 2)).
--
-- NO trae BEGIN;/COMMIT; -- apply_migration ya envuelve en una transaccion.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. Guardas previas.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(prosrc) INTO v_md5
    FROM pg_proc
   WHERE proname = 'fn_clima_rollup_diario'
     AND pronamespace = 'public'::regnamespace;
  IF v_md5 IS NULL THEN
    RAISE EXCEPTION '183 ABORTADA (pre): fn_clima_rollup_diario no existe.';
  END IF;
  IF v_md5 <> 'f5b7950c34e02959c542eab08cbb7e73' THEN
    RAISE EXCEPTION '183 ABORTADA (pre): el cuerpo vivo cambio (md5 %). Revisar antes de pisar.', v_md5;
  END IF;
END
$$;


-- -----------------------------------------------------------------------------
-- 1. Funcion.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_clima_rollup_diario(p_fecha date DEFAULT (((now() AT TIME ZONE 'America/Bogota'::text))::date - 1))
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tolerancia_mm  CONSTANT numeric  := 0.5;
  v_tolerancia_pct CONSTANT numeric  := 0.10;
  v_hueco_max_cobertura CONSTANT numeric := 45;
  v_umbral_sol_wm2 CONSTANT numeric  := 120;
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
        - LAG(lluvia_evento_mm) OVER (PARTITION BY station_id ORDER BY timestamp) AS d_evento,
      EXTRACT(EPOCH FROM (
        timestamp - LAG(timestamp) OVER (
          PARTITION BY station_id, (timestamp AT TIME ZONE 'America/Bogota')::date
          ORDER BY timestamp)
      )) / 60.0 AS d_min
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
      ROUND(MAX(lluvia_diaria_mm) FILTER (
        WHERE lluvia_diaria_actualizada_en IS NULL
           OR (lluvia_diaria_actualizada_en AT TIME ZONE 'America/Bogota')::date = fecha
      ), 2) AS lluvia_contador,
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
      COUNT(radiacion_wm2) AS n_radiacion,
      COUNT(*) FILTER (WHERE radiacion_wm2 >= v_umbral_sol_wm2) AS n_sol,
      MAX(uv_index) AS uv_index_max,
      COUNT(*) AS lecturas_count,
      (ARRAY_AGG(lluvia_diaria_actualizada_en ORDER BY timestamp DESC))[1] AS ultima_actualizacion_lluvia,
      MIN(timestamp) AS primera_lectura_en,
      MAX(timestamp) AS ultima_lectura_en,
      MAX(d_min) AS hueco_interno_min,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY d_min::double precision) AS mediana_min
    FROM base
    WHERE fecha = p_fecha
    GROUP BY fecha, station_id
  ),
  cobertura AS (
    SELECT
      a.*,
      EXTRACT(EPOCH FROM (
        (a.primera_lectura_en AT TIME ZONE 'America/Bogota') - a.fecha::timestamp
      )) / 60.0 AS hueco_inicio_min,
      EXTRACT(EPOCH FROM (
        (a.fecha::timestamp + interval '1 day') - (a.ultima_lectura_en AT TIME ZONE 'America/Bogota')
      )) / 60.0 AS hueco_fin_min
    FROM agregado a
  ),
  senales AS (
    SELECT
      c.*,
      GREATEST(
        c.hueco_inicio_min,
        c.hueco_fin_min,
        COALESCE(c.hueco_interno_min, 1440)
      ) AS hueco_max_min,
      (c.n_evento > 0) AS hay_senal,
      (c.ultima_actualizacion_lluvia IS NOT NULL
       AND (c.ultima_actualizacion_lluvia AT TIME ZONE 'America/Bogota')::date < c.fecha
      ) AS frescura_vencida,
      (c.lluvia_contador IS NOT NULL
       AND ABS(c.lluvia_contador - c.lluvia_evento)
           <= GREATEST(v_tolerancia_mm, c.lluvia_contador * v_tolerancia_pct)
      ) AS coincide,
      CASE
        WHEN c.mediana_min IS NULL                        THEN NULL
        WHEN c.mediana_min >= 4  AND c.mediana_min <= 7   THEN 5
        WHEN c.mediana_min >= 25 AND c.mediana_min <= 35  THEN 30
        ELSE NULL
      END::numeric AS intervalo_min
    FROM cobertura c
  ),
  evaluado AS (
    SELECT
      s.*,
      (s.hueco_max_min > v_hueco_max_cobertura) AS cobertura_corta,
      CASE
        WHEN NOT s.hay_senal THEN
          CASE
            WHEN s.hueco_max_min > v_hueco_max_cobertura   THEN 'cobertura_parcial'
            WHEN s.ultima_actualizacion_lluvia IS NULL     THEN 'sin_time_piezo'
            WHEN s.frescura_vencida                        THEN 'contador_congelado'
            ELSE 'ok'
          END
        WHEN s.hueco_max_min > v_hueco_max_cobertura       THEN 'cobertura_parcial'
        WHEN s.coincide                                    THEN 'ok'
        ELSE 'reconstruido'
      END AS lluvia_confianza,
      CASE
        WHEN NOT s.hay_senal THEN
          CASE
            WHEN s.hueco_max_min > v_hueco_max_cobertura
              OR s.frescura_vencida                        THEN NULL
            ELSE s.lluvia_contador
          END
        WHEN s.hueco_max_min > v_hueco_max_cobertura       THEN s.lluvia_evento
        WHEN s.coincide                                    THEN s.lluvia_contador
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
    ultima_lectura_en,
    cobertura_hueco_max_min
  )
  SELECT
    fecha, station_id,
    CASE WHEN cobertura_corta THEN NULL ELSE temp_c_min END,
    CASE WHEN cobertura_corta THEN NULL ELSE temp_c_max END,
    temp_c_avg,
    humedad_pct_min, humedad_pct_max, humedad_pct_avg,
    lluvia_total_mm_final,
    lluvia_confianza,
    CASE WHEN hay_senal THEN lluvia_evento ELSE NULL END,
    viento_kmh_avg, rafaga_kmh_max,
    viento_dir_predominante,
    CASE WHEN cobertura_corta THEN NULL ELSE radiacion_wm2_avg END,
    CASE WHEN cobertura_corta THEN NULL ELSE radiacion_wm2_max END,
    CASE
      WHEN cobertura_corta          THEN NULL
      WHEN n_radiacion = 0          THEN NULL
      WHEN intervalo_min IS NULL    THEN NULL
      ELSE ROUND(n_sol::numeric * intervalo_min / 60.0, 2)
    END,
    CASE WHEN cobertura_corta THEN NULL ELSE uv_index_max END,
    lecturas_count,
    ultima_lectura_en,
    ROUND(hueco_max_min, 2)
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
    ultima_lectura_en = EXCLUDED.ultima_lectura_en,
    cobertura_hueco_max_min = EXCLUDED.cobertura_hueco_max_min;

  DELETE FROM clima_lecturas
  WHERE timestamp < now() - interval '24 hours';
END;
$function$;


-- -----------------------------------------------------------------------------
-- 2. Guardas posteriores.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_src     text;
  v_secdef  boolean;
  v_config  text[];
BEGIN
  SELECT prosrc, prosecdef, proconfig INTO v_src, v_secdef, v_config
    FROM pg_proc
   WHERE proname = 'fn_clima_rollup_diario'
     AND pronamespace = 'public'::regnamespace;
  IF v_secdef THEN
    RAISE EXCEPTION '183 ABORTADA (post): la funcion quedo SECURITY DEFINER.';
  END IF;
  IF v_config IS NULL OR NOT ('search_path=public, pg_temp' = ANY (v_config)) THEN
    RAISE EXCEPTION '183 ABORTADA (post): search_path no quedo pineado (%).', v_config;
  END IF;
  IF position('lluvia_diaria_actualizada_en IS NULL' IN v_src) = 0 THEN
    RAISE EXCEPTION '183 ABORTADA (post): falta el filtro del contador.';
  END IF;
  IF position('ROUND(MAX(lluvia_diaria_mm), 2)' IN v_src) > 0 THEN
    RAISE EXCEPTION '183 ABORTADA (post): sigue el MAX sin filtro.';
  END IF;
  IF position('v_hueco_max_cobertura' IN v_src) = 0
     OR position('v_umbral_sol_wm2' IN v_src) = 0
     OR position('DELETE FROM clima_lecturas' IN v_src) = 0 THEN
    RAISE EXCEPTION '183 ABORTADA (post): se perdio parte del cuerpo de 159/151/122.';
  END IF;
  RAISE NOTICE '183 OK: md5 nuevo %.', md5(v_src);
END
$$;
