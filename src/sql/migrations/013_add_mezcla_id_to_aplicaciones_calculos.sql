-- Migration 013: Add mezcla_id to aplicaciones_calculos
-- Links each lote calculation to its corresponding mezcla
-- Date: 2026-01-06
--
-- PROBLEM:
-- - During wizard, user assigns lotes to each mezcla (mezcla.lotes_asignados)
-- - This relationship is NOT saved to database
-- - Result: Cannot filter products by lote's mezcla in DailyMovementForm
--
-- SOLUTION:
-- - Add mezcla_id column to aplicaciones_calculos
-- - This creates the missing link: lote → mezcla

-- Add mezcla_id column
ALTER TABLE aplicaciones_calculos
ADD COLUMN IF NOT EXISTS mezcla_id UUID REFERENCES aplicaciones_mezclas(id) ON DELETE CASCADE;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_aplicaciones_calculos_mezcla
ON aplicaciones_calculos(mezcla_id);

-- Add comment
COMMENT ON COLUMN aplicaciones_calculos.mezcla_id IS
'References the mezcla used for this lote calculation. Links lote → mezcla relationship.';
