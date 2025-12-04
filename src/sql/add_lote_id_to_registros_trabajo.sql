-- Migration: Add lote_id column to registros_trabajo table for granular lot tracking
-- Date: 2025-12-04
-- Purpose: Enable tracking work by specific lot within multi-lot tasks

-- Add lote_id column as nullable foreign key to lotes table
ALTER TABLE registros_trabajo
ADD COLUMN lote_id UUID REFERENCES lotes(id);

-- Add index for performance on lote_id queries
CREATE INDEX idx_registros_trabajo_lote_id ON registros_trabajo(lote_id);

-- Add comment for documentation
COMMENT ON COLUMN registros_trabajo.lote_id IS 'Specific lote where the work was performed (for multi-lot tasks). Nullable for backward compatibility.';

-- Verification query
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'registros_trabajo'
AND column_name = 'lote_id';