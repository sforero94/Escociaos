-- =====================================================================
-- 046: Columnas de calidad en produccion (exportacion / nacional)
--
-- Agrega dos columnas opcionales a la tabla `produccion`:
--   kg_exportacion  — kg destinados a exportación en esa cosecha
--   kg_nacional     — kg destinados a mercado nacional
--
-- Ambas son NULL para filas históricas (compatibilidad hacia atrás).
-- Cuando ambas están presentes se valida que sumen exactamente
-- kg_totales; la UI es responsable de computar kg_totales como la
-- suma antes de guardar, por lo que se usa igualdad exacta.
--
-- Idempotente: seguro de re-ejecutar (IF NOT EXISTS / IF EXISTS).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Nuevas columnas (nullable para filas históricas)
-- ---------------------------------------------------------------------

ALTER TABLE produccion
  ADD COLUMN IF NOT EXISTS kg_exportacion NUMERIC(12, 2)
    CHECK (kg_exportacion IS NULL OR kg_exportacion >= 0),
  ADD COLUMN IF NOT EXISTS kg_nacional NUMERIC(12, 2)
    CHECK (kg_nacional IS NULL OR kg_nacional >= 0);

-- ---------------------------------------------------------------------
-- 2. Constraint de tabla: cuando ambas son no-NULL deben sumar
--    exactamente kg_totales. La UI computa kg_totales = kg_exportacion
--    + kg_nacional antes de insertar/actualizar.
-- ---------------------------------------------------------------------

ALTER TABLE produccion
  DROP CONSTRAINT IF EXISTS chk_produccion_calidad_suma,
  ADD CONSTRAINT chk_produccion_calidad_suma CHECK (
    kg_exportacion IS NULL
    OR kg_nacional IS NULL
    OR (kg_exportacion + kg_nacional = kg_totales)
  );

-- ---------------------------------------------------------------------
-- 3. Comentarios
-- ---------------------------------------------------------------------

COMMENT ON COLUMN produccion.kg_exportacion IS
  'KG destinados a exportación en esta cosecha. NULL para registros históricos sin desglose de calidad.';

COMMENT ON COLUMN produccion.kg_nacional IS
  'KG destinados a mercado nacional en esta cosecha. NULL para registros históricos sin desglose de calidad.';
