-- Migración 025: Create climate readings table
-- Tabla principal para almacenar lecturas de la estación meteorológica Ecowitt

CREATE TABLE clima_lecturas (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  timestamp       timestamptz NOT NULL,
  created_at      timestamptz DEFAULT now(),
  station_id      text NOT NULL,

  -- Temperatura exterior (°C, convertido de °F)
  temp_c          numeric(5,2),

  -- Humedad relativa exterior (%)
  humedad_pct     numeric(5,2),

  -- Viento (km/h y grados, convertido de mph)
  viento_kmh      numeric(6,2),
  rafaga_kmh      numeric(6,2),
  viento_dir      numeric(5,1),

  -- Precipitación (mm, convertido de pulgadas)
  lluvia_tasa_mm_hr   numeric(8,2),
  lluvia_evento_mm    numeric(8,2),
  lluvia_diaria_mm    numeric(8,2),

  -- Radiación y UV
  radiacion_wm2   numeric(8,2),
  uv_index        smallint,

  -- Constraint: Unicidad para evitar duplicados si el dispositivo re-envía
  CONSTRAINT clima_lecturas_station_ts_unique UNIQUE (station_id, timestamp)
);

-- Índices optimizados para queries de rango temporal
CREATE INDEX clima_lecturas_timestamp_idx ON clima_lecturas (timestamp DESC);
CREATE INDEX clima_lecturas_dia_idx ON clima_lecturas (
  (DATE(timestamp AT TIME ZONE 'America/Bogota')),
  lluvia_diaria_mm
);

-- RLS: solo usuarios autenticados pueden leer; solo service role puede escribir
ALTER TABLE clima_lecturas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clima_select_authenticated"
  ON clima_lecturas FOR SELECT TO authenticated USING (true);
