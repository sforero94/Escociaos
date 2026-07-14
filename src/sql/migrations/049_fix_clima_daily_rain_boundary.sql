-- Migration 049: Fix clima_resumen_diario.lluvia_total_mm double-counting
-- across day boundaries.
--
-- Root cause: lluvia_total_mm was computed as MAX(lluvia_diaria_mm) per
-- Bogotá calendar day (migrations 035/036), where lluvia_diaria_mm is the
-- Ecowitt station's own daily rain accumulator. That formula is only
-- correct if the station resets its accumulator exactly at Bogotá midnight.
-- If the station's configured timezone doesn't match America/Bogota, the
-- accumulator stays elevated past Bogotá midnight until the station's own
-- reset catches up — so the following day's readings inherit (and MAX()
-- re-reports) the same total, producing a phantom duplicate-day rain value
-- (observed: 2026-07-09 real rain, 2026-07-10 identical phantom).
--
-- Fix: reconstruct daily rainfall from reading-to-reading deltas (LAG)
-- instead of a raw MAX. Any decrease in the accumulator is treated as a
-- device reset (the post-reset value itself is counted as new rain, not
-- the drop). This is agnostic to wherever the device's own reset boundary
-- falls, so it stays correct regardless of station timezone configuration.

CREATE OR REPLACE FUNCTION fn_rollup_clima_dia(p_fecha date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
    p_fecha,
    l.station_id,
    ROUND(MIN(l.temp_c), 2),
    ROUND(MAX(l.temp_c), 2),
    ROUND(AVG(l.temp_c), 2),
    ROUND(MIN(l.humedad_pct), 2),
    ROUND(MAX(l.humedad_pct), 2),
    ROUND(AVG(l.humedad_pct), 2),
    ROUND(SUM(d.delta), 2),
    ROUND(AVG(l.viento_kmh), 2),
    ROUND(MAX(l.rafaga_kmh), 2),
    ROUND(
      DEGREES(
        ATAN2(
          AVG(SIN(RADIANS(l.viento_dir))),
          AVG(COS(RADIANS(l.viento_dir)))
        )
      )::numeric % 360, 1
    ),
    ROUND(AVG(l.radiacion_wm2), 2),
    ROUND(MAX(l.radiacion_wm2), 2),
    MAX(l.uv_index),
    COUNT(*)
  FROM clima_lecturas l
  JOIN (
    -- Delta per reading across the FULL ordered history (not just p_fecha),
    -- so the first reading of the day is diffed against the last reading
    -- of the previous day rather than against nothing.
    SELECT
      timestamp,
      station_id,
      CASE
        WHEN LAG(lluvia_diaria_mm) OVER w IS NULL THEN 0
        WHEN lluvia_diaria_mm >= LAG(lluvia_diaria_mm) OVER w
          THEN lluvia_diaria_mm - LAG(lluvia_diaria_mm) OVER w
        ELSE lluvia_diaria_mm
      END AS delta
    FROM clima_lecturas
    WINDOW w AS (PARTITION BY station_id ORDER BY timestamp)
  ) d ON d.station_id = l.station_id AND d.timestamp = l.timestamp
  WHERE DATE(l.timestamp AT TIME ZONE 'America/Bogota') = p_fecha
  GROUP BY l.station_id
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
END;
$$;

-- Replace the daily rollup cron job to call the new function instead of
-- inlining the (buggy) MAX-based aggregate. cron.schedule() with an
-- existing job_name updates that job's command in place.
SELECT cron.schedule(
  'clima-daily-rollup',
  '15 5 * * *',
  $$
  SELECT fn_rollup_clima_dia(CURRENT_DATE - 1);
  DELETE FROM clima_lecturas WHERE timestamp < now() - interval '24 hours';
  $$
);
