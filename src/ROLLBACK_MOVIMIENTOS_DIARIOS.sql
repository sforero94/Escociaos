-- ============================================================================
-- ROLLBACK: Sistema de Movimientos Diarios
-- Fecha: 2025-11-13
-- Propósito: Revertir cambios si algo sale mal
-- ============================================================================
-- 
-- IMPORTANTE: Solo ejecutar si necesitas revertir la migración
-- ============================================================================

-- ============================================================================
-- OPCIÓN 1: ROLLBACK COMPLETO (Volver al estado original)
-- ============================================================================

-- 1.1. Eliminar tabla nueva
DROP TABLE IF EXISTS movimientos_diarios_productos CASCADE;
SELECT '✅ Tabla movimientos_diarios_productos eliminada' as paso;

-- 1.2. Revertir cambios en movimientos_diarios
-- (Eliminar columna nueva)
ALTER TABLE movimientos_diarios 
DROP COLUMN IF EXISTS numero_canecas;
SELECT '✅ Columna numero_canecas eliminada' as paso;

-- 1.3. Restaurar columnas originales
ALTER TABLE movimientos_diarios 
ADD COLUMN IF NOT EXISTS producto_id uuid;

ALTER TABLE movimientos_diarios 
ADD COLUMN IF NOT EXISTS producto_nombre text;

ALTER TABLE movimientos_diarios 
ADD COLUMN IF NOT EXISTS producto_categoria text;

ALTER TABLE movimientos_diarios 
ADD COLUMN IF NOT EXISTS producto_unidad text;

ALTER TABLE movimientos_diarios 
ADD COLUMN IF NOT EXISTS cantidad_utilizada numeric;

SELECT '✅ Columnas originales restauradas' as paso;

-- 1.4. Restaurar constraints
ALTER TABLE movimientos_diarios
ADD CONSTRAINT fk_movimientos_producto 
FOREIGN KEY (producto_id) 
REFERENCES productos(id) 
ON DELETE RESTRICT;

ALTER TABLE movimientos_diarios
ADD CONSTRAINT check_cantidad_positiva 
CHECK (cantidad_utilizada > 0);

SELECT '✅ Constraints restaurados' as paso;

-- 1.5. Restaurar datos desde backup (si existe)
/*
INSERT INTO aplicaciones 
SELECT * FROM backup_aplicaciones_20251113;

INSERT INTO movimientos_diarios 
SELECT * FROM backup_movimientos_diarios_20251113;

SELECT '✅ Datos restaurados desde backup' as paso;
*/

-- ============================================================================
-- OPCIÓN 2: ROLLBACK PARCIAL (Solo eliminar la nueva tabla)
-- ============================================================================

/*
-- Mantener movimientos_diarios modificada pero eliminar la nueva tabla
DROP TABLE IF EXISTS movimientos_diarios_productos CASCADE;
SELECT '✅ Solo tabla movimientos_diarios_productos eliminada' as paso;
*/

-- ============================================================================
-- VERIFICACIÓN POST-ROLLBACK
-- ============================================================================

-- Verificar estructura de movimientos_diarios
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_name = 'movimientos_diarios'
ORDER BY ordinal_position;

-- Verificar que la tabla nueva no existe
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_name = 'movimientos_diarios_productos'
    ) 
    THEN '❌ La tabla movimientos_diarios_productos aún existe'
    ELSE '✅ La tabla movimientos_diarios_productos fue eliminada correctamente'
  END as verificacion;

-- ============================================================================
-- FIN DEL ROLLBACK
-- ============================================================================

SELECT '
🔄 ROLLBACK COMPLETADO

Si necesitas restaurar datos:
1. Descomentar sección de restauración desde backup
2. Verificar que los datos se restauraron correctamente

' as resultado;
