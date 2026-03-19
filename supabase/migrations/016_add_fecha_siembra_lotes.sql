-- Migration 016: Add planting date (fecha_siembra) to lotes table
-- Enables age-based yield analysis

-- Add fecha_siembra column
ALTER TABLE lotes
ADD COLUMN IF NOT EXISTS fecha_siembra DATE;

-- Add index for age calculations
CREATE INDEX IF NOT EXISTS idx_lotes_fecha_siembra ON lotes(fecha_siembra);

-- Update existing lotes with planting dates based on business data
-- Using exact lote IDs from database

-- 1. Piedra Paula: 2019
UPDATE lotes SET fecha_siembra = '2019-01-01'
WHERE id = 'fffc5477-fe42-4660-8fd8-301f8d1a312b';

-- 2. Salto de Tequendama: 2020
UPDATE lotes SET fecha_siembra = '2020-01-01'
WHERE id = 'c3e1cf4f-5168-434e-b1f8-b630479c766e';

-- 3. Australia: 2020
UPDATE lotes SET fecha_siembra = '2020-01-01'
WHERE id = '5588e8c8-7519-472e-a78c-47b56216c24c';

-- 4. La Vega: 2020
UPDATE lotes SET fecha_siembra = '2020-01-01'
WHERE id = 'ee810553-4108-4a6e-8494-63491954d59b';

-- 5. Pedregal: 2021
UPDATE lotes SET fecha_siembra = '2021-01-01'
WHERE id = 'fa5864d0-85a7-4b6e-b222-c71417f5a6ee';

-- 6. La Union: 2021
UPDATE lotes SET fecha_siembra = '2021-01-01'
WHERE id = 'ccdd4075-6a24-4d19-b345-e21a47e6a81e';

-- 8. Irlanda: 2021
UPDATE lotes SET fecha_siembra = '2021-01-01'
WHERE id = 'c1ce4ce0-76a7-4d8f-a320-36c7395613df';

-- 9. Acueducto: 2021
UPDATE lotes SET fecha_siembra = '2021-01-01'
WHERE id = '95ce6644-2fbe-4ff8-b5b8-3a3ec57bc0b6';

-- 10. Santa Rosa (no historical data, set to 2022)
UPDATE lotes SET fecha_siembra = '2022-01-01'
WHERE id = '21da24a0-a420-4446-9b91-a59e234eb603';

-- Documentation
COMMENT ON COLUMN lotes.fecha_siembra IS 'Planting date for age-based yield calculations';
