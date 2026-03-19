-- Migration 001: Link Aplicaciones to Tareas
-- Add foreign key from aplicaciones to tareas (1:1 relationship)
-- This enables automatic creation of tareas when aplicaciones are created

-- Add tarea_id column to aplicaciones table
ALTER TABLE aplicaciones
ADD COLUMN IF NOT EXISTS tarea_id UUID REFERENCES tareas(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_aplicaciones_tarea_id ON aplicaciones(tarea_id);

-- Create unique index to enforce 1:1 relationship
-- Allows NULL values (for legacy aplicaciones without linked tareas)
CREATE UNIQUE INDEX IF NOT EXISTS idx_aplicaciones_tarea_unique
ON aplicaciones(tarea_id)
WHERE tarea_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN aplicaciones.tarea_id IS
'Auto-created labor task linked to this aplicacion. NULL for legacy records created before this feature.';
