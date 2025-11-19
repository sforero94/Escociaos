-- ============================================
-- SCRIPT: Configuración de Lotes Reales
-- SISTEMA: Escosia Hass - Gestión Aguacate
-- PROPÓSITO: Eliminar placeholders e insertar lotes reales del cultivo
-- ============================================

-- 🗑️ PASO 1: LIMPIAR DATOS PLACEHOLDER
-- Eliminar registros relacionados (respetando foreign keys)
DELETE FROM monitoreos;
DELETE FROM aplicaciones_lotes;
DELETE FROM sublotes;
DELETE FROM lotes;

-- ============================================
-- 📍 PASO 2: INSERTAR LOTES REALES
-- ============================================

INSERT INTO lotes (
  nombre,
  numero_orden,
  area_hectareas,
  arboles_grandes,
  arboles_medianos,
  arboles_pequenos,
  arboles_clonales,
  activo
) VALUES
  -- Lote 1: Piedra Paula
  ('1. Piedra Paula', 1, NULL, 0, 0, 0, 0, true),
  
  -- Lote 2: Salto de Tequendama
  ('2. Salto de Tequendama', 2, NULL, 0, 0, 0, 0, true),
  
  -- Lote 3: Australia
  ('3. Australia', 3, NULL, 0, 0, 0, 0, true),
  
  -- Lote 4: La Vega
  ('4. La Vega', 4, NULL, 0, 0, 0, 0, true),
  
  -- Lote 5: Pedregal
  ('5. Pedregal', 5, NULL, 0, 0, 0, 0, true),
  
  -- Lote 6: La Unión
  ('6. La Unión', 6, NULL, 0, 0, 0, 0, true),
  
  -- Lote 7: El Triunfo
  ('7. El Triunfo', 7, NULL, 0, 0, 0, 0, true),
  
  -- Lote 8: Irlanda
  ('8. Irlanda', 8, NULL, 0, 0, 0, 0, true),
  
  -- Lote 8B: Irlanda - clonales
  ('8. Irlanda - clonales', 9, NULL, 0, 0, 0, 0, true),
  
  -- Lote 9: Acueducto
  ('9. Acueducto', 10, NULL, 0, 0, 0, 0, true),
  
  -- Lote 9B: Acueducto - clonales
  ('9. Acueducto - clonales', 11, NULL, 0, 0, 0, 0, true),
  
  -- Lote 10: Santa Rosa
  ('10. Santa Rosa', 12, NULL, 0, 0, 0, 0, true);

-- ============================================
-- ✅ VERIFICACIÓN
-- ============================================

-- Verificar lotes insertados
SELECT 
  numero_orden,
  nombre,
  total_arboles,
  activo
FROM lotes
ORDER BY numero_orden;

-- ============================================
-- 📝 NOTAS IMPORTANTES
-- ============================================
-- 
-- 1. Los lotes se nombran con número al inicio para mantener compatibilidad con tu CSV
-- 2. El campo `total_arboles` es un GENERATED column que suma automáticamente:
--    arboles_grandes + arboles_medianos + arboles_pequenos + arboles_clonales
-- 3. Todos los lotes están activos por defecto
-- 4. Los valores NULL en area_hectareas y conteos de árboles se pueden actualizar después
-- 5. Los lotes clonales tienen su propio registro separado
--
-- PRÓXIMOS PASOS OPCIONALES:
-- 
-- Si deseas agregar áreas y conteos de árboles, ejecuta:
-- 
-- UPDATE lotes 
-- SET 
--   area_hectareas = X.X,
--   arboles_grandes = XXX,
--   arboles_medianos = XXX,
--   arboles_pequenos = XXX,
--   arboles_clonales = XXX
-- WHERE nombre = 'X. Nombre del Lote';
--
-- ============================================
