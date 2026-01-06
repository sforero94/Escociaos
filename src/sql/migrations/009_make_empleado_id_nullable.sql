-- Migration 009: Make empleado_id nullable for contractor support
-- This allows registros_trabajo to have EITHER empleado_id OR contratista_id
-- Date: 2026-01-06

-- Remove NOT NULL constraint from empleado_id
ALTER TABLE registros_trabajo
ALTER COLUMN empleado_id DROP NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN registros_trabajo.empleado_id IS 'Foreign key to empleados table. Nullable to support contractor work records. Each record must have either empleado_id OR contratista_id (enforced by check_worker_type constraint).';

-- Verification query
-- SELECT column_name, is_nullable, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'registros_trabajo'
-- AND column_name IN ('empleado_id', 'contratista_id')
-- ORDER BY column_name;
