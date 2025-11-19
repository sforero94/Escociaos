-- ============================================
-- SCRIPT: Configuración Completa de Lotes y Sublotes
-- SISTEMA: Escosia Hass - Gestión Aguacate
-- PROPÓSITO: Setup completo en un solo script
-- ============================================

-- 🗑️ PASO 1: LIMPIAR DATOS PLACEHOLDER
-- Eliminar registros relacionados (respetando foreign keys)
DELETE FROM monitoreos;
DELETE FROM aplicaciones_lotes;
DELETE FROM sublotes;
DELETE FROM lotes;

-- ============================================
-- 📍 PASO 2: INSERTAR LOTES REALES (12)
-- ============================================

INSERT INTO lotes (nombre, numero_orden, area_hectareas, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales, activo) VALUES
  ('1. Piedra Paula', 1, NULL, 0, 0, 0, 0, true),
  ('2. Salto de Tequendama', 2, NULL, 0, 0, 0, 0, true),
  ('3. Australia', 3, NULL, 0, 0, 0, 0, true),
  ('4. La Vega', 4, NULL, 0, 0, 0, 0, true),
  ('5. Pedregal', 5, NULL, 0, 0, 0, 0, true),
  ('6. La Unión', 6, NULL, 0, 0, 0, 0, true),
  ('7. El Triunfo', 7, NULL, 0, 0, 0, 0, true),
  ('8. Irlanda', 8, NULL, 0, 0, 0, 0, true),
  ('8. Irlanda - clonales', 9, NULL, 0, 0, 0, 0, true),
  ('9. Acueducto', 10, NULL, 0, 0, 0, 0, true),
  ('9. Acueducto - clonales', 11, NULL, 0, 0, 0, 0, true),
  ('10. Santa Rosa', 12, NULL, 0, 0, 0, 0, true);

-- ============================================
-- 📍 PASO 3: INSERTAR SUBLOTES (36 = 12 × 3)
-- ============================================

-- Función helper para insertar 3 sublotes por lote
DO $$
DECLARE
  lote_record RECORD;
BEGIN
  -- Iterar sobre cada lote
  FOR lote_record IN (SELECT id, nombre FROM lotes ORDER BY numero_orden)
  LOOP
    -- Insertar 3 sublotes por lote
    INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
    VALUES
      (lote_record.id, 'Sublote 1', 1, 0, 0, 0, 0),
      (lote_record.id, 'Sublote 2', 2, 0, 0, 0, 0),
      (lote_record.id, 'Sublote 3', 3, 0, 0, 0, 0);
    
    RAISE NOTICE 'Creados 3 sublotes para: %', lote_record.nombre;
  END LOOP;
END $$;

-- ============================================
-- ✅ VERIFICACIÓN FINAL
-- ============================================

-- Verificar lotes insertados
SELECT 
  '📍 LOTES CREADOS' as seccion,
  numero_orden,
  nombre,
  total_arboles,
  activo
FROM lotes
ORDER BY numero_orden;

-- Verificar sublotes por lote
SELECT 
  '📍 SUBLOTES POR LOTE' as seccion,
  l.nombre AS lote,
  s.numero_sublote,
  s.nombre AS sublote,
  s.total_arboles
FROM lotes l
INNER JOIN sublotes s ON l.id = s.lote_id
ORDER BY l.numero_orden, s.numero_sublote;

-- Resumen de conteo
SELECT 
  '📊 RESUMEN' as seccion,
  'LOTES' as tipo,
  COUNT(*) as total
FROM lotes
UNION ALL
SELECT 
  '📊 RESUMEN' as seccion,
  'SUBLOTES' as tipo,
  COUNT(*) as total
FROM sublotes;

-- Verificar que cada lote tiene 3 sublotes
SELECT 
  '🔍 VERIFICACIÓN INTEGRIDAD' as seccion,
  l.nombre AS lote,
  COUNT(s.id) AS cantidad_sublotes,
  CASE 
    WHEN COUNT(s.id) = 3 THEN '✅ OK'
    ELSE '❌ ERROR'
  END as estado
FROM lotes l
LEFT JOIN sublotes s ON l.id = s.lote_id
GROUP BY l.nombre, l.numero_orden
ORDER BY l.numero_orden;

-- ============================================
-- 📝 RESULTADO ESPERADO
-- ============================================
-- 
-- ✅ 12 lotes insertados
-- ✅ 36 sublotes insertados (3 por lote)
-- ✅ Todos los lotes tienen estado "activo"
-- ✅ Todos los conteos en 0 (se actualizan después)
--
-- PRÓXIMOS PASOS:
-- 
-- 1. Recarga tu aplicación web (F5)
-- 2. Ve a /monitoreo
-- 3. Haz clic en "Cargar Monitoreos"
-- 4. Selecciona tu CSV
-- 5. Revisa los logs en consola
-- 6. Haz clic en "Cargar X registros"
-- 7. ¡Listo! ✅
--
-- ============================================
