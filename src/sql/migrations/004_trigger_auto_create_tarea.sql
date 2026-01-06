-- Migration 004: Auto-Create Tarea on Aplicación Creation
-- Automatically creates a linked labor task when a new aplicación is created
-- The tarea inherits dates, lotes, and other details from the aplicación

-- Create function to auto-create tarea
CREATE OR REPLACE FUNCTION auto_create_tarea_for_aplicacion()
RETURNS TRIGGER AS $$
DECLARE
  new_tarea_id UUID;
  tipo_tarea_id UUID;
BEGIN
  -- Only create if estado='Calculada' AND no existing tarea
  IF NEW.estado = 'Calculada' AND NEW.tarea_id IS NULL THEN

    -- Get or create "Aplicación Fitosanitaria" tipo_tarea
    SELECT id INTO tipo_tarea_id
    FROM tipos_tareas
    WHERE nombre = 'Aplicación Fitosanitaria'
    LIMIT 1;

    IF tipo_tarea_id IS NULL THEN
      INSERT INTO tipos_tareas (nombre, categoria, descripcion, activo)
      VALUES (
        'Aplicación Fitosanitaria',
        'Aplicaciones',
        'Auto-generada para aplicaciones',
        true
      )
      RETURNING id INTO tipo_tarea_id;
    END IF;

    -- Create tarea with data from aplicación
    INSERT INTO tareas (
      codigo_tarea,
      nombre,
      tipo_tarea_id,
      descripcion,
      lote_ids,
      estado,
      prioridad,
      fecha_estimada_inicio,
      fecha_estimada_fin,
      observaciones
    )
    VALUES (
      'TAR-' || UPPER(SUBSTRING(NEW.codigo_aplicacion FROM 5)),
      NEW.nombre_aplicacion,
      tipo_tarea_id,
      'Auto-generada: ' || NEW.tipo_aplicacion || ' - ' || COALESCE(NEW.proposito, ''),
      (SELECT ARRAY_AGG(lote_id) FROM aplicaciones_lotes WHERE aplicacion_id = NEW.id),
      'Programada',
      'Media',
      NEW.fecha_inicio_planeada,
      NEW.fecha_fin_planeada,
      'Auto-generada desde aplicación ' || NEW.codigo_aplicacion
    )
    RETURNING id INTO new_tarea_id;

    -- Link back to aplicación
    NEW.tarea_id = new_tarea_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_auto_create_tarea_aplicacion ON aplicaciones;

-- Create trigger to fire BEFORE INSERT
CREATE TRIGGER trigger_auto_create_tarea_aplicacion
  BEFORE INSERT ON aplicaciones
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_tarea_for_aplicacion();

-- Add comment for documentation
COMMENT ON FUNCTION auto_create_tarea_for_aplicacion() IS
'Automatically creates a labor task (tarea) when a new aplicación is created. The tarea inherits dates, lotes, and other details from the aplicación.';
