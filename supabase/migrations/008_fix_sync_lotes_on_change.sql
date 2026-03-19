-- Migration 008: Fix Lote Synchronization for Existing Tareas and Add Trigger
-- Part 1: Sync all existing tareas with their linked applications' lotes
-- Part 2: Add trigger to sync lotes when aplicaciones_lotes changes

-- ============================================================================
-- PART 1: One-time fix for existing tareas
-- ============================================================================

-- Update all existing tareas that are linked to aplicaciones
-- Pull lote_ids from their linked application's aplicaciones_lotes
UPDATE tareas
SET
  lote_ids = (
    SELECT ARRAY_AGG(al.lote_id)
    FROM aplicaciones a
    JOIN aplicaciones_lotes al ON al.aplicacion_id = a.id
    WHERE a.tarea_id = tareas.id
  ),
  updated_at = NOW()
WHERE id IN (
  SELECT tarea_id
  FROM aplicaciones
  WHERE tarea_id IS NOT NULL
)
AND observaciones LIKE '%Auto-generada desde aplicación%';

-- ============================================================================
-- PART 2: Add trigger to sync lotes when aplicaciones_lotes changes
-- ============================================================================

-- Function to sync tarea lotes when aplicaciones_lotes is modified
CREATE OR REPLACE FUNCTION sync_tarea_lotes_on_aplicaciones_lotes_change()
RETURNS TRIGGER AS $$
DECLARE
  linked_tarea_id UUID;
  has_trabajo BOOLEAN;
BEGIN
  -- Get the linked tarea_id for this aplicacion
  SELECT tarea_id INTO linked_tarea_id
  FROM aplicaciones
  WHERE id = COALESCE(NEW.aplicacion_id, OLD.aplicacion_id);

  -- Skip if no linked tarea
  IF linked_tarea_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Check if tarea has registered work
  SELECT EXISTS (
    SELECT 1
    FROM registros_trabajo
    WHERE tarea_id = linked_tarea_id
  ) INTO has_trabajo;

  -- Only sync if tarea has no registered work (safety check)
  IF NOT has_trabajo THEN
    UPDATE tareas
    SET
      lote_ids = (
        SELECT ARRAY_AGG(lote_id)
        FROM aplicaciones_lotes
        WHERE aplicacion_id = COALESCE(NEW.aplicacion_id, OLD.aplicacion_id)
      ),
      updated_at = NOW()
    WHERE id = linked_tarea_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_sync_tarea_lotes_on_aplicaciones_lotes_change ON aplicaciones_lotes;

-- Create trigger to fire AFTER INSERT, UPDATE, or DELETE on aplicaciones_lotes
CREATE TRIGGER trigger_sync_tarea_lotes_on_aplicaciones_lotes_change
  AFTER INSERT OR UPDATE OR DELETE ON aplicaciones_lotes
  FOR EACH ROW
  EXECUTE FUNCTION sync_tarea_lotes_on_aplicaciones_lotes_change();

-- Add comment for documentation
COMMENT ON FUNCTION sync_tarea_lotes_on_aplicaciones_lotes_change() IS
'Syncs lote_ids from aplicaciones_lotes to linked tarea whenever lotes are added, removed, or modified. Only syncs if tarea has no registered work (safety).';

-- ============================================================================
-- Verification Query
-- ============================================================================

-- Run this to verify the sync worked:
-- SELECT
--   t.codigo_tarea,
--   t.nombre,
--   t.lote_ids as tarea_lotes,
--   (
--     SELECT ARRAY_AGG(al.lote_id)
--     FROM aplicaciones a
--     JOIN aplicaciones_lotes al ON al.aplicacion_id = a.id
--     WHERE a.tarea_id = t.id
--   ) as aplicacion_lotes
-- FROM tareas t
-- WHERE observaciones LIKE '%Auto-generada desde aplicación%';
