-- Migration 005: Auto-Update Tarea on Aplicación Edits
-- Syncs changes from aplicación to linked tarea (dates, lotes, name)
-- Safety: If tarea has registered work, only dates are synced (lotes frozen)

-- Create function to sync tarea when aplicación is edited
CREATE OR REPLACE FUNCTION sync_tarea_on_aplicacion_edit()
RETURNS TRIGGER AS $$
DECLARE
  has_trabajo BOOLEAN;
BEGIN
  -- Skip if no linked tarea
  IF NEW.tarea_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if tarea has registered work
  SELECT EXISTS (
    SELECT 1
    FROM registros_trabajo
    WHERE tarea_id = NEW.tarea_id
  ) INTO has_trabajo;

  IF has_trabajo THEN
    -- Safety: Only update dates (lotes frozen to preserve work records)
    UPDATE tareas
    SET
      fecha_estimada_inicio = NEW.fecha_inicio_planeada,
      fecha_estimada_fin = NEW.fecha_fin_planeada,
      updated_at = NOW()
    WHERE id = NEW.tarea_id;
  ELSE
    -- Full sync: dates + lotes + nombre
    UPDATE tareas
    SET
      nombre = NEW.nombre_aplicacion,
      fecha_estimada_inicio = NEW.fecha_inicio_planeada,
      fecha_estimada_fin = NEW.fecha_fin_planeada,
      lote_ids = (
        SELECT ARRAY_AGG(lote_id)
        FROM aplicaciones_lotes
        WHERE aplicacion_id = NEW.id
      ),
      updated_at = NOW()
    WHERE id = NEW.tarea_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_sync_tarea_aplicacion ON aplicaciones;

-- Create trigger to fire AFTER UPDATE
CREATE TRIGGER trigger_sync_tarea_aplicacion
  AFTER UPDATE ON aplicaciones
  FOR EACH ROW
  WHEN (
    OLD.fecha_inicio_planeada IS DISTINCT FROM NEW.fecha_inicio_planeada OR
    OLD.fecha_fin_planeada IS DISTINCT FROM NEW.fecha_fin_planeada OR
    OLD.nombre_aplicacion IS DISTINCT FROM NEW.nombre_aplicacion
  )
  EXECUTE FUNCTION sync_tarea_on_aplicacion_edit();

-- Add comment for documentation
COMMENT ON FUNCTION sync_tarea_on_aplicacion_edit() IS
'Syncs changes from aplicación to linked tarea. If tarea has registered work, only dates are synced (lotes frozen for safety).';
