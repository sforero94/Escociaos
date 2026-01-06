-- Migration 003: Add Unique Constraint to registros_trabajo
-- Required for duplicate prevention in auto-sync from movimientos
-- Ensures one worker (employee OR contractor) can only have one record per tarea/lote/date combination

-- Drop constraint if it exists (for idempotent migration)
ALTER TABLE registros_trabajo
DROP CONSTRAINT IF EXISTS registros_trabajo_unique_key;

-- Add unique constraint including both empleado_id and contratista_id
-- This prevents duplicate work records for the same worker on the same task/lote/date
ALTER TABLE registros_trabajo
ADD CONSTRAINT registros_trabajo_unique_key
UNIQUE (tarea_id, empleado_id, contratista_id, lote_id, fecha_trabajo);

-- Add comment for documentation
COMMENT ON CONSTRAINT registros_trabajo_unique_key ON registros_trabajo IS
'Prevents duplicate work records. One worker (employee OR contractor) per tarea/lote/date combination.';
