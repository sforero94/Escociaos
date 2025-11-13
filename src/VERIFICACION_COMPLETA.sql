-- ============================================================================
-- VERIFICACIÓN COMPLETA POST-MIGRACIÓN
-- Ejecuta este script para confirmar que todo está correcto
-- ============================================================================

-- 1. Verificar que todas las aplicaciones fueron eliminadas
SELECT 
  'aplicaciones' as tabla, 
  COUNT(*) as registros,
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ OK - Tabla vacía'
    ELSE '⚠️ ADVERTENCIA - Aún hay registros'
  END as estado
FROM aplicaciones
UNION ALL
SELECT 
  'movimientos_diarios', 
  COUNT(*),
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ OK - Tabla vacía'
    ELSE '⚠️ ADVERTENCIA - Aún hay registros'
  END
FROM movimientos_diarios;

-- 2. Verificar estructura de movimientos_diarios
SELECT 
  column_name, 
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'movimientos_diarios'
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- 3. Verificar que numero_canecas existe
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'movimientos_diarios' 
        AND column_name = 'numero_canecas'
        AND table_schema = 'public'
    ) 
    THEN '✅ La columna numero_canecas EXISTE en movimientos_diarios'
    ELSE '❌ ERROR: La columna numero_canecas NO EXISTE'
  END as verificacion_numero_canecas;

-- 4. Verificar que columnas antiguas no existen
SELECT 
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'movimientos_diarios' 
        AND column_name IN ('producto_id', 'producto_nombre', 'cantidad_utilizada')
        AND table_schema = 'public'
    ) 
    THEN '✅ Columnas antiguas de productos fueron ELIMINADAS correctamente'
    ELSE '❌ ERROR: Aún existen columnas antiguas de productos'
  END as verificacion_columnas_eliminadas;

-- 5. Verificar estructura de movimientos_diarios_productos
SELECT 
  column_name, 
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'movimientos_diarios_productos'
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- 6. Verificar foreign keys
SELECT
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'movimientos_diarios_productos'
  AND tc.table_schema = 'public';

-- 7. Verificar índices
SELECT 
  indexname as nombre_indice,
  indexdef as definicion
FROM pg_indexes
WHERE tablename = 'movimientos_diarios_productos'
  AND schemaname = 'public'
ORDER BY indexname;

-- 8. Verificar constraints de CHECK
SELECT 
  tc.table_name as tabla,
  tc.constraint_name as nombre_constraint
FROM information_schema.table_constraints tc
WHERE tc.constraint_type = 'CHECK'
  AND tc.table_name IN ('movimientos_diarios', 'movimientos_diarios_productos')
  AND tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_name;

-- 9. Conteo de columnas en cada tabla
SELECT 
  'movimientos_diarios' as tabla,
  COUNT(*) as total_columnas
FROM information_schema.columns
WHERE table_name = 'movimientos_diarios'
  AND table_schema = 'public'
UNION ALL
SELECT 
  'movimientos_diarios_productos',
  COUNT(*)
FROM information_schema.columns
WHERE table_name = 'movimientos_diarios_productos'
  AND table_schema = 'public';

-- 10. Resumen final simple
SELECT '✅ VERIFICACIÓN COMPLETADA - Revisa los resultados arriba' as resultado;
