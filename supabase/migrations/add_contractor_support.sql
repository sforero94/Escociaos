-- Migration: Add Contractor Support
-- Description: Add support for tracking external contractors (Jornal and Contrato) alongside regular employees
-- Date: 2026-01-06

-- =====================================================
-- 1. CREATE CONTRATISTAS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS contratistas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre VARCHAR(255) NOT NULL,
  tipo_contrato VARCHAR(20) NOT NULL CHECK (tipo_contrato IN ('Jornal', 'Contrato')),
  tarifa_jornal NUMERIC NOT NULL CHECK (tarifa_jornal >= 0),
  cedula VARCHAR(50),
  telefono VARCHAR(50),
  estado VARCHAR(20) DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Inactivo')),
  fecha_inicio DATE,
  fecha_fin DATE,
  observaciones TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comments for documentation
COMMENT ON TABLE contratistas IS 'External contractors who work under Jornal (day work) or Contrato (contract) modalities';
COMMENT ON COLUMN contratistas.nombre IS 'Full name of the contractor';
COMMENT ON COLUMN contratistas.tipo_contrato IS 'Type of contractor: Jornal (day work) or Contrato (contract work)';
COMMENT ON COLUMN contratistas.tarifa_jornal IS 'Fixed daily rate in COP for 1 full jornal (8 hours)';
COMMENT ON COLUMN contratistas.cedula IS 'National ID number';
COMMENT ON COLUMN contratistas.telefono IS 'Phone number';
COMMENT ON COLUMN contratistas.estado IS 'Active or Inactive status';
COMMENT ON COLUMN contratistas.fecha_inicio IS 'Contract start date';
COMMENT ON COLUMN contratistas.fecha_fin IS 'Contract end date';
COMMENT ON COLUMN contratistas.observaciones IS 'Additional notes about the contractor';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_contratistas_estado ON contratistas(estado);
CREATE INDEX IF NOT EXISTS idx_contratistas_tipo ON contratistas(tipo_contrato);
CREATE INDEX IF NOT EXISTS idx_contratistas_nombre ON contratistas(nombre);

-- =====================================================
-- 2. MODIFY REGISTROS_TRABAJO TABLE
-- =====================================================

-- Add contratista_id column
ALTER TABLE registros_trabajo
ADD COLUMN IF NOT EXISTS contratista_id UUID REFERENCES contratistas(id) ON DELETE RESTRICT;

-- Add check constraint to ensure each record has EITHER empleado OR contratista (not both, not neither)
-- Drop the constraint first if it exists (for idempotency)
ALTER TABLE registros_trabajo
DROP CONSTRAINT IF EXISTS check_worker_type;

ALTER TABLE registros_trabajo
ADD CONSTRAINT check_worker_type CHECK (
  (empleado_id IS NOT NULL AND contratista_id IS NULL) OR
  (empleado_id IS NULL AND contratista_id IS NOT NULL)
);

COMMENT ON COLUMN registros_trabajo.contratista_id IS 'Foreign key to contratistas table. Each work record must have either empleado_id OR contratista_id, but not both.';

-- Create index for contractor work records
CREATE INDEX IF NOT EXISTS idx_registros_trabajo_contratista ON registros_trabajo(contratista_id);

-- =====================================================
-- 3. CREATE UPDATED_AT TRIGGER FOR CONTRATISTAS
-- =====================================================

-- Create trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS set_updated_at ON contratistas;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON contratistas
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 4. GRANT PERMISSIONS (adjust as needed for your setup)
-- =====================================================

-- Grant permissions to authenticated users (Supabase default role)
-- GRANT ALL ON contratistas TO authenticated;
-- GRANT ALL ON registros_trabajo TO authenticated;

-- =====================================================
-- 5. VERIFICATION QUERIES
-- =====================================================

-- Uncomment to run verification after migration:

-- Check contratistas table structure
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'contratistas'
-- ORDER BY ordinal_position;

-- Check registros_trabajo modifications
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'registros_trabajo' AND column_name IN ('empleado_id', 'contratista_id')
-- ORDER BY ordinal_position;

-- Check constraints
-- SELECT constraint_name, constraint_type
-- FROM information_schema.table_constraints
-- WHERE table_name IN ('contratistas', 'registros_trabajo')
-- ORDER BY table_name, constraint_name;

-- =====================================================
-- ROLLBACK SCRIPT (if needed)
-- =====================================================

-- To rollback this migration, run:
-- DROP TRIGGER IF EXISTS set_updated_at ON contratistas;
-- DROP INDEX IF EXISTS idx_contratistas_estado;
-- DROP INDEX IF EXISTS idx_contratistas_tipo;
-- DROP INDEX IF EXISTS idx_contratistas_nombre;
-- DROP INDEX IF EXISTS idx_registros_trabajo_contratista;
-- ALTER TABLE registros_trabajo DROP CONSTRAINT IF EXISTS check_worker_type;
-- ALTER TABLE registros_trabajo DROP COLUMN IF EXISTS contratista_id;
-- DROP TABLE IF EXISTS contratistas;
