-- Migration 006: Auto-Create registros_trabajo from Movimientos
-- Automatically syncs worker time from movimientos to labores module
-- Handles both employees and contractors with type-aware processing

-- Create function to auto-create registro_trabajo from movimiento worker
CREATE OR REPLACE FUNCTION auto_create_registro_trabajo_from_movimiento()
RETURNS TRIGGER AS $$
DECLARE
  aplicacion_tarea_id UUID;
  movimiento_fecha DATE;
BEGIN
  -- Get linked tarea_id and fecha_movimiento from the aplicación
  SELECT a.tarea_id, md.fecha_movimiento
  INTO aplicacion_tarea_id, movimiento_fecha
  FROM aplicaciones a
  JOIN movimientos_diarios md ON md.aplicacion_id = a.id
  WHERE md.id = NEW.movimiento_diario_id;

  -- Skip if no linked tarea (legacy aplicaciones)
  IF aplicacion_tarea_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- UPSERT registro_trabajo (handles both employees and contractors)
  INSERT INTO registros_trabajo (
    tarea_id,
    empleado_id,
    contratista_id,
    lote_id,
    fecha_trabajo,
    fraccion_jornal,
    observaciones,
    valor_jornal_empleado,
    costo_jornal
  )
  VALUES (
    aplicacion_tarea_id,
    NEW.empleado_id,              -- NULL if contractor
    NEW.contratista_id,           -- NULL if employee
    NEW.lote_id,
    movimiento_fecha,
    NEW.fraccion_jornal::TEXT,
    NEW.observaciones,
    NEW.valor_jornal_trabajador,  -- Works for both types
    NEW.costo_jornal
  )
  ON CONFLICT (tarea_id, empleado_id, contratista_id, lote_id, fecha_trabajo) DO UPDATE
  SET
    fraccion_jornal = EXCLUDED.fraccion_jornal::TEXT,
    observaciones = EXCLUDED.observaciones,
    valor_jornal_empleado = EXCLUDED.valor_jornal_empleado,
    costo_jornal = EXCLUDED.costo_jornal;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_auto_create_registro_trabajo ON movimientos_diarios_trabajadores;

-- Create trigger to fire AFTER INSERT OR UPDATE
CREATE TRIGGER trigger_auto_create_registro_trabajo
  AFTER INSERT OR UPDATE ON movimientos_diarios_trabajadores
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_registro_trabajo_from_movimiento();

-- Add comment for documentation
COMMENT ON FUNCTION auto_create_registro_trabajo_from_movimiento() IS
'Automatically creates/updates work records (registros_trabajo) when workers are registered in daily movements. Handles both employees and contractors. Uses UPSERT to prevent duplicates.';
