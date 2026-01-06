-- Migration 002: Add Worker Tracking to Movimientos
-- Creates junction table for structured worker tracking (both employees and contractors)
-- Replaces the free-text 'personal' field with structured data

-- Create junction table for workers (employees + contractors) in daily movements
CREATE TABLE IF NOT EXISTS movimientos_diarios_trabajadores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  movimiento_diario_id UUID NOT NULL REFERENCES movimientos_diarios(id) ON DELETE CASCADE,
  empleado_id UUID REFERENCES empleados(id) ON DELETE CASCADE,
  contratista_id UUID REFERENCES contratistas(id) ON DELETE CASCADE,
  lote_id UUID NOT NULL REFERENCES lotes(id) ON DELETE CASCADE,
  fraccion_jornal NUMERIC(3,2) NOT NULL CHECK (fraccion_jornal IN (0.25, 0.5, 0.75, 1.0)),
  observaciones TEXT,
  valor_jornal_trabajador NUMERIC DEFAULT 0,
  costo_jornal NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- XOR constraint: must have exactly ONE of empleado_id OR contratista_id
  CONSTRAINT check_worker_type CHECK (
    (empleado_id IS NOT NULL AND contratista_id IS NULL) OR
    (empleado_id IS NULL AND contratista_id IS NOT NULL)
  ),

  -- Unique constraints depend on worker type
  UNIQUE(movimiento_diario_id, empleado_id, lote_id),
  UNIQUE(movimiento_diario_id, contratista_id, lote_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_movimientos_trabajadores_movimiento
ON movimientos_diarios_trabajadores(movimiento_diario_id);

CREATE INDEX IF NOT EXISTS idx_movimientos_trabajadores_empleado
ON movimientos_diarios_trabajadores(empleado_id);

CREATE INDEX IF NOT EXISTS idx_movimientos_trabajadores_contratista
ON movimientos_diarios_trabajadores(contratista_id);

-- Add comment for documentation
COMMENT ON TABLE movimientos_diarios_trabajadores IS
'Tracks both employees and contractors working on daily movements. Replaces the free-text personal field with structured data.';

COMMENT ON COLUMN movimientos_diarios_trabajadores.valor_jornal_trabajador IS
'Worker daily wage. For employees: monthly salary. For contractors: tarifa_jornal.';

COMMENT ON COLUMN movimientos_diarios.personal IS
'DEPRECATED: Use movimientos_diarios_trabajadores table instead. Kept for legacy data only.';
