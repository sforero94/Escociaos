-- Migration 011: Fix calcular_costo_jornal trigger to handle contractors
-- Updates the trigger function to calculate costs for both employees and contractors
-- Date: 2026-01-06

-- Drop and recreate the trigger function with contractor support
CREATE OR REPLACE FUNCTION calcular_costo_jornal()
RETURNS TRIGGER AS $$
DECLARE
  salario_empleado NUMERIC;
  prestaciones NUMERIC;
  auxilios NUMERIC;
  horas_semanales NUMERIC;
  tarifa_contratista NUMERIC;
  costo_calculado NUMERIC;
BEGIN
  -- Only calculate if costo_jornal is not already provided
  IF NEW.costo_jornal IS NULL THEN

    -- Handle EMPLOYEE records
    IF NEW.empleado_id IS NOT NULL THEN
      -- Get employee salary info
      SELECT
        COALESCE(salario, 0),
        COALESCE(prestaciones_sociales, 0),
        COALESCE(auxilios_no_salariales, 0),
        COALESCE(horas_semanales, 48)
      INTO salario_empleado, prestaciones, auxilios, horas_semanales
      FROM empleados
      WHERE id = NEW.empleado_id;

      -- Calculate employee cost
      -- Formula: (salary + benefits + allowances) / (weeklyHours * 4.33) * 8 * fractionWorked
      costo_calculado := (salario_empleado + prestaciones + auxilios)
                        / (horas_semanales * 4.33)
                        * 8
                        * NEW.fraccion_jornal::text::numeric;

      NEW.costo_jornal := ROUND(costo_calculado, 2);
      NEW.valor_jornal_empleado := salario_empleado;

    -- Handle CONTRACTOR records
    ELSIF NEW.contratista_id IS NOT NULL THEN
      -- Get contractor tarifa
      SELECT COALESCE(tarifa_jornal, 0)
      INTO tarifa_contratista
      FROM contratistas
      WHERE id = NEW.contratista_id;

      -- Calculate contractor cost
      -- Formula: tarifa_jornal * fraction_worked
      NEW.costo_jornal := ROUND(tarifa_contratista * NEW.fraccion_jornal::text::numeric, 2);
      NEW.valor_jornal_empleado := NULL; -- Contractors don't have valor_jornal_empleado
    END IF;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger (in case it was dropped)
DROP TRIGGER IF EXISTS trigger_calcular_costo_jornal ON registros_trabajo;
CREATE TRIGGER trigger_calcular_costo_jornal
  BEFORE INSERT OR UPDATE ON registros_trabajo
  FOR EACH ROW
  EXECUTE FUNCTION calcular_costo_jornal();

-- Update existing contractor records with missing costs
UPDATE registros_trabajo rt
SET costo_jornal = (c.tarifa_jornal * rt.fraccion_jornal::text::numeric)
FROM contratistas c
WHERE rt.contratista_id = c.id
  AND rt.contratista_id IS NOT NULL
  AND (rt.costo_jornal = 0 OR rt.costo_jornal IS NULL);

-- Verification query
-- SELECT
--   rt.id,
--   rt.fecha_trabajo,
--   COALESCE(e.nombre, c.nombre) as trabajador,
--   c.tarifa_jornal,
--   rt.fraccion_jornal,
--   rt.costo_jornal,
--   (CASE
--     WHEN rt.contratista_id IS NOT NULL THEN c.tarifa_jornal * rt.fraccion_jornal::text::numeric
--     ELSE NULL
--   END) as costo_esperado
-- FROM registros_trabajo rt
-- LEFT JOIN empleados e ON rt.empleado_id = e.id
-- LEFT JOIN contratistas c ON rt.contratista_id = c.id
-- ORDER BY rt.created_at DESC
-- LIMIT 10;
