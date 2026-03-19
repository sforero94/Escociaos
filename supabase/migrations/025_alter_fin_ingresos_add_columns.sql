-- Migration 024: Add extra columns to fin_ingresos for dashboard detail views
-- These columns allow richer detail tables per negocio

ALTER TABLE fin_ingresos ADD COLUMN IF NOT EXISTS cantidad NUMERIC;
ALTER TABLE fin_ingresos ADD COLUMN IF NOT EXISTS precio_unitario NUMERIC(15,2);
ALTER TABLE fin_ingresos ADD COLUMN IF NOT EXISTS cosecha TEXT;
ALTER TABLE fin_ingresos ADD COLUMN IF NOT EXISTS alianza TEXT;
ALTER TABLE fin_ingresos ADD COLUMN IF NOT EXISTS cliente TEXT;
ALTER TABLE fin_ingresos ADD COLUMN IF NOT EXISTS finca TEXT;
