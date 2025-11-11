-- ==========================================
-- VERIFICAR TABLAS CREADAS
-- Ejecuta estos queries para asegurar que todo esté correcto
-- ==========================================

-- ==========================================
-- 1. LISTAR TODAS LAS TABLAS DE APLICACIONES
-- ==========================================
SELECT 
  tablename,
  schemaname
FROM pg_tables
WHERE tablename LIKE 'aplicaciones%'
ORDER BY tablename;

-- Deberías ver:
-- aplicaciones
-- aplicaciones_calculos
-- aplicaciones_compras
-- aplicaciones_lotes
-- aplicaciones_mezclas
-- aplicaciones_productos

-- ==========================================
-- 2. VER ESTRUCTURA DE CADA TABLA
-- ==========================================
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name IN (
  'aplicaciones_lotes',
  'aplicaciones_mezclas',
  'aplicaciones_productos',
  'aplicaciones_calculos',
  'aplicaciones_compras'
)
ORDER BY table_name, ordinal_position;

-- ==========================================
-- 3. VER FOREIGN KEYS (RELACIONES)
-- ==========================================
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  tc.constraint_name
FROM information_schema.table_constraints AS tc
  JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name LIKE 'aplicaciones_%'
ORDER BY tc.table_name, kcu.column_name;

-- ==========================================
-- 4. VER ÍNDICES CREADOS
-- ==========================================
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename LIKE 'aplicaciones_%'
ORDER BY tablename, indexname;

-- ==========================================
-- 5. CONTAR REGISTROS (DEBE SER 0 SI ES NUEVA)
-- ==========================================
SELECT 
  'aplicaciones_lotes' AS tabla,
  COUNT(*) AS registros
FROM aplicaciones_lotes
UNION ALL
SELECT 
  'aplicaciones_mezclas',
  COUNT(*)
FROM aplicaciones_mezclas
UNION ALL
SELECT 
  'aplicaciones_productos',
  COUNT(*)
FROM aplicaciones_productos
UNION ALL
SELECT 
  'aplicaciones_calculos',
  COUNT(*)
FROM aplicaciones_calculos
UNION ALL
SELECT 
  'aplicaciones_compras',
  COUNT(*)
FROM aplicaciones_compras;

-- Todos deben mostrar 0 registros si son tablas nuevas

-- ==========================================
-- 6. PROBAR INSERT BÁSICO (SOLO PARA TESTING)
-- ==========================================
-- NO ejecutes esto en producción, es solo para probar

-- Primero, necesitas una aplicación de prueba
-- Reemplaza 'TU_UUID_AQUI' con un UUID real de la tabla aplicaciones

/*
-- Insertar lote de prueba
INSERT INTO aplicaciones_lotes (
  aplicacion_id,
  lote_id,
  arboles_grandes,
  arboles_medianos,
  arboles_pequenos,
  arboles_clonales,
  total_arboles
) VALUES (
  'TU_UUID_AQUI'::UUID, -- UUID de una aplicación existente
  (SELECT id FROM lotes LIMIT 1), -- Primer lote de la BD
  100, 50, 25, 10, 185
);

-- Ver el registro insertado
SELECT * FROM aplicaciones_lotes;

-- Eliminar el registro de prueba
DELETE FROM aplicaciones_lotes WHERE aplicacion_id = 'TU_UUID_AQUI'::UUID;
*/

-- ==========================================
-- 7. VERIFICAR QUE RLS ESTÉ DESACTIVADO
-- ==========================================
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename LIKE 'aplicaciones_%'
ORDER BY tablename;

-- Si rowsecurity = false, RLS está desactivado (correcto para desarrollo)
-- Si rowsecurity = true, RLS está activado (necesitas crear políticas)

-- ==========================================
-- 8. VER COMENTARIOS EN LAS TABLAS
-- ==========================================
SELECT
  c.relname AS table_name,
  d.description
FROM pg_class c
  LEFT JOIN pg_description d ON c.oid = d.objoid
WHERE c.relname LIKE 'aplicaciones_%'
  AND c.relkind = 'r'
  AND d.objsubid = 0
ORDER BY c.relname;

-- ==========================================
-- RESUMEN DE VERIFICACIÓN
-- ==========================================
-- ✅ Query 1: Muestra las 6 tablas (aplicaciones + 5 nuevas)
-- ✅ Query 2: Muestra todas las columnas de las 5 tablas
-- ✅ Query 3: Muestra las foreign keys configuradas
-- ✅ Query 4: Muestra los índices creados
-- ✅ Query 5: Muestra 0 registros en cada tabla
-- ✅ Query 6: (Opcional) Prueba de insert
-- ✅ Query 7: Verifica que RLS esté desactivado
-- ✅ Query 8: Muestra los comentarios de las tablas
