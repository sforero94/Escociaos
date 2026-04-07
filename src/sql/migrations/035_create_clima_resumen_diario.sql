-- Migration 035: Create clima_resumen_diario table + backfill from existing readings
-- Daily aggregated weather data; keeps the DB light while clima_lecturas
-- is pruned to a rolling 24-hour window by the companion cron job (migration 036).

CREATE TABLE clima_resumen_diario (
  fecha           date        NOT NULL,
  station_id      text        NOT NULL,

  -- Temperature (°C)
  temp_c_min      numeric(5,2),
  temp_c_max      numeric(5,2),
  temp_c_avg      numeric(5,2),

  -- Humidity (%)
  humedad_pct_min numeric(5,2),
  humedad_pct_max numeric(5,2),
  humedad_pct_avg numeric(5,2),

  -- Rainfall (mm) — MAX of Ecowitt daily accumulator = total for the day
  lluvia_total_mm numeric(8,2),

  -- Wind (km/h)
  viento_kmh_avg  numeric(6,2),
  rafaga_kmh_max  numeric(6,2),

  -- Wind direction (degrees) — circular mean of 5-min readings
  viento_dir_predominante numeric(5,1),

  -- Solar radiation (W/m²)
  radiacion_wm2_avg numeric(8,2),
  radiacion_wm2_max numeric(8,2),

  -- UV index
  uv_index_max    smallint,

  -- Metadata
  lecturas_count  integer     NOT NULL DEFAULT 0,
  created_at      timestamptz DEFAULT now(),

  PRIMARY KEY (fecha, station_id)
);

-- Index for date-range queries
CREATE INDEX clima_resumen_diario_fecha_idx ON clima_resumen_diario (fecha DESC);

-- RLS: authenticated users can read; only service role can write
ALTER TABLE clima_resumen_diario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clima_resumen_select_authenticated"
  ON clima_resumen_diario FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- Backfill: aggregate all existing clima_lecturas into daily summaries
-- ============================================================================

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
  -- Circular mean for wind direction
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
-- Exclude today (still accumulating)
WHERE DATE(timestamp AT TIME ZONE 'America/Bogota') < CURRENT_DATE
GROUP BY DATE(timestamp AT TIME ZONE 'America/Bogota'), station_id
ON CONFLICT (fecha, station_id) DO NOTHING;

-- Prune old 5-min readings (keep only last 24 hours)
DELETE FROM clima_lecturas
WHERE timestamp < now() - interval '24 hours';
