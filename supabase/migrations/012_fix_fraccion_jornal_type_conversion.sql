-- Migration 012: Fix fraccion_jornal type conversion in sync trigger
-- Fixes the auto-sync trigger to properly convert NUMERIC → ENUM fraccion_jornal
-- Date: 2026-01-06
--
-- PROBLEM:
-- - movimientos_diarios_trabajadores.fraccion_jornal is NUMERIC(3,2)
-- - registros_trabajo.fraccion_jornal is ENUM 'fraccion_jornal' ('0.25', '0.5', '0.75', '1.0')
-- - Previous trigger converted NUMERIC → TEXT, but PostgreSQL rejected TEXT for ENUM column
--
-- SOLUTION:
-- - Convert NUMERIC → ENUM using CASE statement
-- - Handle duplicate prevention by DELETE + INSERT instead of ON CONFLICT

-- Drop and recreate the trigger function with correct type conversion
CREATE OR REPLACE FUNCTION auto_create_registro_trabajo_from_movimiento()
RETURNS TRIGGER AS $$
DECLARE
  aplicacion_tarea_id UUID;
  movimiento_fecha DATE;
  fraccion_enum fraccion_jornal;
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

  -- Convert NUMERIC to ENUM fraccion_jornal
  fraccion_enum := CASE
    WHEN NEW.fraccion_jornal = 0.25 THEN '0.25'::fraccion_jornal
    WHEN NEW.fraccion_jornal = 0.5 THEN '0.5'::fraccion_jornal
    WHEN NEW.fraccion_jornal = 0.75 THEN '0.75'::fraccion_jornal
    WHEN NEW.fraccion_jornal = 1.0 THEN '1.0'::fraccion_jornal
    ELSE '0.25'::fraccion_jornal -- Default fallback
  END;

  -- Delete existing record if any (handles duplicates)
  DELETE FROM registros_trabajo
  WHERE tarea_id = aplicacion_tarea_id
    AND lote_id = NEW.lote_id
    AND fecha_trabajo = movimiento_fecha
    AND (
      (empleado_id = NEW.empleado_id AND NEW.empleado_id IS NOT NULL)
      OR
      (contratista_id = NEW.contratista_id AND NEW.contratista_id IS NOT NULL)
    );

  -- Insert new record
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
    NEW.empleado_id,
    NEW.contratista_id,
    NEW.lote_id,
    movimiento_fecha,
    fraccion_enum,
    NEW.observaciones,
    NEW.valor_jornal_trabajador,
    NEW.costo_jornal
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Comment for documentation
COMMENT ON FUNCTION auto_create_registro_trabajo_from_movimiento() IS
'Automatically creates/updates work records (registros_trabajo) when workers are registered in daily movements.
Handles both employees and contractors.
FIXED: Properly converts NUMERIC fraccion_jornal to ENUM and handles duplicates with DELETE+INSERT pattern.';
