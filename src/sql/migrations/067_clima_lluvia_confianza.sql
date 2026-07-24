-- Migration 067: staleness-aware rainfall aggregation for clima
--
-- Bug: Ecowitt's rainfall_piezo.daily.value is a cumulative counter that is
-- supposed to reset to 0 at the station's local midnight. When the sensor
-- fails to reset (a known WS90/GW2000 firmware quirk), the API keeps
-- returning the previous day's frozen total, and the nightly rollup
-- (migration 036) faithfully wrote that stale number into
-- clima_resumen_diario as if it were a fresh reading — producing two
-- consecutive days with an identical, and frequently wrong, rain total.
-- Confirmed in production: ≥22 occurrences since 2026-03, including
-- 2026-07-20/21 (both 15.75mm; 07-21 had a completely normal, distinct
-- temperature curve, so the station was fine — only the rain counter was
-- stuck).
--
-- Fix, two independent signals (either is enough to distrust a day):
--   1. Ecowitt tells us, per field, when that value was last updated
--      (rainfall_piezo.daily.time). clima.tsx now captures this into
--      clima_lecturas.lluvia_diaria_actualizada_en. If the freshest
--      reading of a day never got a same-day update, the counter never
--      moved — the day's total is unknown, not a number.
--   2. Semantics-independent safety net: if a day's raw total is non-zero
--      and exactly matches the prior day's stored total, that is the
--      empirical fingerprint of this bug — flag it even if signal #1 is
--      unavailable for some reason.
--
-- A day caught by either check is stored as lluvia_confianza =
-- 'contador_congelado' with lluvia_total_mm = NULL — "sin dato", never a
-- fabricated duplicate, matching the "missing row ≠ 0" rule used
-- everywhere else in this codebase (monitoreo, hato). Days where Ecowitt
-- never sends a per-field time at all keep the old behavior (trust the raw
-- max) — we have no basis to second-guess them, and this preserves
-- pre-migration behavior when the freshness signal is absent for reasons
-- unrelated to this bug.

-- ============================================================================
-- Step 1: capture the raw freshness signal per 5-min reading
-- ============================================================================

ALTER TABLE clima_lecturas
  ADD COLUMN lluvia_diaria_actualizada_en timestamptz;

COMMENT ON COLUMN clima_lecturas.lluvia_diaria_actualizada_en IS
  'Timestamp Ecowitt reporta como última actualización del contador rainfall_piezo.daily (rain.daily.time). NULL si la API no lo envió.';

-- ============================================================================
-- Step 2: confidence flag on the daily rollup
-- ============================================================================

ALTER TABLE clima_resumen_diario
  ADD COLUMN lluvia_confianza text NOT NULL DEFAULT 'ok'
    CHECK (lluvia_confianza IN ('ok', 'contador_congelado', 'sin_time_piezo'));

COMMENT ON COLUMN clima_resumen_diario.lluvia_confianza IS
  'ok = contador verificado fresco ese día. contador_congelado = el contador de Ecowitt no se reinició (lluvia_total_mm queda NULL, nunca un duplicado). sin_time_piezo = Ecowitt no envió la señal de frescura; se confía en el valor crudo como antes de esta migración.';

-- ============================================================================
-- Step 3: replace the nightly rollup with a staleness-aware function
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_clima_rollup_diario(p_fecha date DEFAULT (now() AT TIME ZONE 'America/Bogota')::date - 1)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  WITH agregado AS (
    SELECT
      DATE(timestamp AT TIME ZONE 'America/Bogota') AS fecha,
      station_id,
      ROUND(MIN(temp_c), 2) AS temp_c_min,
      ROUND(MAX(temp_c), 2) AS temp_c_max,
      ROUND(AVG(temp_c), 2) AS temp_c_avg,
      ROUND(MIN(humedad_pct), 2) AS humedad_pct_min,
      ROUND(MAX(humedad_pct), 2) AS humedad_pct_max,
      ROUND(AVG(humedad_pct), 2) AS humedad_pct_avg,
      ROUND(MAX(lluvia_diaria_mm), 2) AS lluvia_max_dia,
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
      MAX(uv_index) AS uv_index_max,
      COUNT(*) AS lecturas_count,
      -- Freshness of the rain counter: Ecowitt's own "last updated" time for
      -- the chronologically last reading of the day.
      (ARRAY_AGG(lluvia_diaria_actualizada_en ORDER BY timestamp DESC))[1] AS ultima_actualizacion_lluvia
    FROM clima_lecturas
    WHERE DATE(timestamp AT TIME ZONE 'America/Bogota') = p_fecha
    GROUP BY 1, 2
  ),
  evaluado AS (
    SELECT
      a.*,
      CASE
        WHEN a.ultima_actualizacion_lluvia IS NULL THEN 'sin_time_piezo'
        WHEN DATE(a.ultima_actualizacion_lluvia AT TIME ZONE 'America/Bogota') < a.fecha THEN 'contador_congelado'
        WHEN a.lluvia_max_dia IS NOT NULL AND a.lluvia_max_dia > 0
             AND a.lluvia_max_dia IS NOT DISTINCT FROM y.lluvia_total_mm THEN 'contador_congelado'
        ELSE 'ok'
      END AS lluvia_confianza
    FROM agregado a
    LEFT JOIN clima_resumen_diario y
      ON y.fecha = a.fecha - 1 AND y.station_id = a.station_id
  )
  INSERT INTO clima_resumen_diario (
    fecha, station_id,
    temp_c_min, temp_c_max, temp_c_avg,
    humedad_pct_min, humedad_pct_max, humedad_pct_avg,
    lluvia_total_mm, lluvia_confianza,
    viento_kmh_avg, rafaga_kmh_max,
    viento_dir_predominante,
    radiacion_wm2_avg, radiacion_wm2_max,
    uv_index_max,
    lecturas_count
  )
  SELECT
    fecha, station_id,
    temp_c_min, temp_c_max, temp_c_avg,
    humedad_pct_min, humedad_pct_max, humedad_pct_avg,
    CASE WHEN lluvia_confianza = 'contador_congelado' THEN NULL ELSE lluvia_max_dia END,
    lluvia_confianza,
    viento_kmh_avg, rafaga_kmh_max,
    viento_dir_predominante,
    radiacion_wm2_avg, radiacion_wm2_max,
    uv_index_max,
    lecturas_count
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
    viento_kmh_avg  = EXCLUDED.viento_kmh_avg,
    rafaga_kmh_max  = EXCLUDED.rafaga_kmh_max,
    viento_dir_predominante = EXCLUDED.viento_dir_predominante,
    radiacion_wm2_avg = EXCLUDED.radiacion_wm2_avg,
    radiacion_wm2_max = EXCLUDED.radiacion_wm2_max,
    uv_index_max    = EXCLUDED.uv_index_max,
    lecturas_count  = EXCLUDED.lecturas_count;

  -- Prune old 5-min readings (keep rolling 24h window) — same as before.
  DELETE FROM clima_lecturas
  WHERE timestamp < now() - interval '24 hours';
END;
$$;

COMMENT ON FUNCTION fn_clima_rollup_diario IS
  'Rollup nocturno de clima_lecturas -> clima_resumen_diario con detección de contador de lluvia congelado (migración 067). p_fecha por defecto: ayer (Bogotá).';

-- ============================================================================
-- Step 4: reschedule the cron job to call the new function
-- (cron.schedule upserts by job name — same jobid, new command)
-- ============================================================================

SELECT cron.schedule(
  'clima-daily-rollup',
  '15 5 * * *',
  $$ SELECT fn_clima_rollup_diario(); $$
);

-- ============================================================================
-- Step 5: retroactively flag existing rows matching the confirmed bug
-- signature. Metadata only — lluvia_total_mm is NOT modified here, so the
-- raw historical number stays intact/auditable. Because the frontend now
-- renders lluvia_diaria_mm as NULL whenever lluvia_confianza =
-- 'contador_congelado' (resumenDiarioToAgregada), flagging these rows is
-- enough to stop the chart from showing them as real going forward. A true
-- correction of these historical days (re-pulling from Ecowitt's history
-- API via /clima/backfill) is a separate, deliberate follow-up — not run
-- automatically here.
-- ============================================================================

UPDATE clima_resumen_diario hoy
SET lluvia_confianza = 'contador_congelado'
FROM clima_resumen_diario ayer
WHERE ayer.station_id = hoy.station_id
  AND ayer.fecha = hoy.fecha - 1
  AND hoy.lluvia_total_mm IS NOT NULL
  AND hoy.lluvia_total_mm > 0
  AND hoy.lluvia_total_mm = ayer.lluvia_total_mm
  AND hoy.lluvia_confianza = 'ok';
