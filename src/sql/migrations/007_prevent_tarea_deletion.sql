-- Migration 007: Prevent Linked Tarea Deletion
-- Safety constraint to prevent accidental deletion of tareas linked to aplicaciones
-- Users must delete the aplicación first (which will set tarea_id to NULL via ON DELETE SET NULL)

-- Create function to prevent deletion of linked tareas
CREATE OR REPLACE FUNCTION prevent_linked_tarea_deletion()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if tarea is linked to any aplicación
  IF EXISTS (
    SELECT 1
    FROM aplicaciones
    WHERE tarea_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'No se puede eliminar una tarea vinculada a una aplicación. Elimine primero la aplicación.';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_prevent_linked_tarea_deletion ON tareas;

-- Create trigger to fire BEFORE DELETE
CREATE TRIGGER trigger_prevent_linked_tarea_deletion
  BEFORE DELETE ON tareas
  FOR EACH ROW
  EXECUTE FUNCTION prevent_linked_tarea_deletion();

-- Add comment for documentation
COMMENT ON FUNCTION prevent_linked_tarea_deletion() IS
'Prevents deletion of tareas that are linked to aplicaciones. Users must delete the aplicación first.';
