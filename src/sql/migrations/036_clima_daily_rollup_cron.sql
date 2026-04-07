-- Migration 036: Daily rollup cron job for clima data
-- Runs at 00:15 Bogotá (05:15 UTC) every day:
--   1. Aggregates yesterday's 5-min readings into clima_resumen_diario
--   2. Deletes clima_lecturas older than 24 hours

SELECT cron.schedule(
  'clima-daily-rollup',
  '15 5 * * *',
  $$
  -- Step 1: Aggregate yesterday into daily summary
  INSERT INTO clima_resumen_diario (
    fecha, station_id,
    temp_c_min, temp_c_max, temp_c_avg,
    humedad_pct_min, humedad_pct_max, humedad_pct_avg,
    lluvia_total_mm,
    viento_kmh_avg, rafaga_kmh_max,
    viento_dir_predominante,
    radiacion_wm2_avg, radiacion_wm2_max,
    uv_index_max,
    lecturas_count
  )
  SELECT
    DATE(timestamp AT TIME ZONE 'America/Bogota') AS fecha,
    station_id,
    ROUND(MIN(temp_c), 2),
    ROUND(MAX(temp_c), 2),
    ROUND(AVG(temp_c), 2),
    ROUND(MIN(humedad_pct), 2),
    ROUND(MAX(humedad_pct), 2),
    ROUND(AVG(humedad_pct), 2),
    ROUND(MAX(lluvia_diaria_mm), 2),
    ROUND(AVG(viento_kmh), 2),
    ROUND(MAX(rafaga_kmh), 2),
    ROUND(
      DEGREES(
        ATAN2(
          AVG(SIN(RADIANS(viento_dir))),
          AVG(COS(RADIANS(viento_dir)))
        )
      )::numeric % 360, 1
    ),
    ROUND(AVG(radiacion_wm2), 2),
    ROUND(MAX(radiacion_wm2), 2),
    MAX(uv_index),
    COUNT(*)
  FROM clima_lecturas
  WHERE DATE(timestamp AT TIME ZONE 'America/Bogota') = CURRENT_DATE - 1
  GROUP BY DATE(timestamp AT TIME ZONE 'America/Bogota'), station_id
  ON CONFLICT (fecha, station_id) DO UPDATE SET
    temp_c_min      = EXCLUDED.temp_c_min,
    temp_c_max      = EXCLUDED.temp_c_max,
    temp_c_avg      = EXCLUDED.temp_c_avg,
    humedad_pct_min = EXCLUDED.humedad_pct_min,
    humedad_pct_max = EXCLUDED.humedad_pct_max,
    humedad_pct_avg = EXCLUDED.humedad_pct_avg,
    lluvia_total_mm = EXCLUDED.lluvia_total_mm,
    viento_kmh_avg  = EXCLUDED.viento_kmh_avg,
    rafaga_kmh_max  = EXCLUDED.rafaga_kmh_max,
    viento_dir_predominante = EXCLUDED.viento_dir_predominante,
    radiacion_wm2_avg = EXCLUDED.radiacion_wm2_avg,
    radiacion_wm2_max = EXCLUDED.radiacion_wm2_max,
    uv_index_max    = EXCLUDED.uv_index_max,
    lecturas_count  = EXCLUDED.lecturas_count;

  -- Step 2: Prune old 5-min readings (keep rolling 24h window)
  DELETE FROM clima_lecturas
  WHERE timestamp < now() - interval '24 hours';
  $$
);
