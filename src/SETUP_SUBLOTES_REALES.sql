-- ============================================
-- SCRIPT: Configuración de Sublotes Reales
-- SISTEMA: Escosia Hass - Gestión Aguacate
-- PROPÓSITO: Insertar sublotes para cada lote (hasta 3 por lote)
-- ============================================

-- ⚠️ PREREQUISITO: Debes haber ejecutado SETUP_LOTES_REALES.sql primero

-- ============================================
-- 📍 INSERTAR SUBLOTES POR LOTE
-- ============================================

-- Lote 1: Piedra Paula
INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
SELECT 
  l.id,
  'Sublote 1',
  1,
  0, 0, 0, 0
FROM lotes l
WHERE l.nombre = '1. Piedra Paula';

INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
SELECT 
  l.id,
  'Sublote 2',
  2,
  0, 0, 0, 0
FROM lotes l
WHERE l.nombre = '1. Piedra Paula';

INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
SELECT 
  l.id,
  'Sublote 3',
  3,
  0, 0, 0, 0
FROM lotes l
WHERE l.nombre = '1. Piedra Paula';

-- Lote 2: Salto de Tequendama
INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
SELECT 
  l.id,
  'Sublote 1',
  1,
  0, 0, 0, 0
FROM lotes l
WHERE l.nombre = '2. Salto de Tequendama';

INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
SELECT 
  l.id,
  'Sublote 2',
  2,
  0, 0, 0, 0
FROM lotes l
WHERE l.nombre = '2. Salto de Tequendama';

INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
SELECT 
  l.id,
  'Sublote 3',
  3,
  0, 0, 0, 0
FROM lotes l
WHERE l.nombre = '2. Salto de Tequendama';

-- Lote 3: Australia
INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
SELECT 
  l.id,
  'Sublote 1',
  1,
  0, 0, 0, 0
FROM lotes l
WHERE l.nombre = '3. Australia';

INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
SELECT 
  l.id,
  'Sublote 2',
  2,
  0, 0, 0, 0
FROM lotes l
WHERE l.nombre = '3. Australia';

INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
SELECT 
  l.id,
  'Sublote 3',
  3,
  0, 0, 0, 0
FROM lotes l
WHERE l.nombre = '3. Australia';

-- Lote 4: La Vega
INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
SELECT 
  l.id,
  'Sublote 1',
  1,
  0, 0, 0, 0
FROM lotes l
WHERE l.nombre = '4. La Vega';

INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
SELECT 
  l.id,
  'Sublote 2',
  2,
  0, 0, 0, 0
FROM lotes l
WHERE l.nombre = '4. La Vega';

INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
SELECT 
  l.id,
  'Sublote 3',
  3,
  0, 0, 0, 0
FROM lotes l
WHERE l.nombre = '4. La Vega';

-- Lote 5: Pedregal
INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
SELECT 
  l.id,
  'Sublote 1',
  1,
  0, 0, 0, 0
FROM lotes l
WHERE l.nombre = '5. Pedregal';

INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
SELECT 
  l.id,
  'Sublote 2',
  2,
  0, 0, 0, 0
FROM lotes l
WHERE l.nombre = '5. Pedregal';

INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
SELECT 
  l.id,
  'Sublote 3',
  3,
  0, 0, 0, 0
FROM lotes l
WHERE l.nombre = '5. Pedregal';

-- Lote 6: La Unión
INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
SELECT 
  l.id,
  'Sublote 1',
  1,
  0, 0, 0, 0
FROM lotes l
WHERE l.nombre = '6. La Unión';

INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
SELECT 
  l.id,
  'Sublote 2',
  2,
  0, 0, 0, 0
FROM lotes l
WHERE l.nombre = '6. La Unión';

INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
SELECT 
  l.id,
  'Sublote 3',
  3,
  0, 0, 0, 0
FROM lotes l
WHERE l.nombre = '6. La Unión';

-- Lote 7: El Triunfo
INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
SELECT 
  l.id,
  'Sublote 1',
  1,
  0, 0, 0, 0
FROM lotes l
WHERE l.nombre = '7. El Triunfo';

INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
SELECT 
  l.id,
  'Sublote 2',
  2,
  0, 0, 0, 0
FROM lotes l
WHERE l.nombre = '7. El Triunfo';

INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
SELECT 
  l.id,
  'Sublote 3',
  3,
  0, 0, 0, 0
FROM lotes l
WHERE l.nombre = '7. El Triunfo';

-- Lote 8: Irlanda
INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
SELECT 
  l.id,
  'Sublote 1',
  1,
  0, 0, 0, 0
FROM lotes l
WHERE l.nombre = '8. Irlanda';

INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
SELECT 
  l.id,
  'Sublote 2',
  2,
  0, 0, 0, 0
FROM lotes l
WHERE l.nombre = '8. Irlanda';

INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
SELECT 
  l.id,
  'Sublote 3',
  3,
  0, 0, 0, 0
FROM lotes l
WHERE l.nombre = '8. Irlanda';

-- Lote 8B: Irlanda - clonales
INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
SELECT 
  l.id,
  'Sublote 1',
  1,
  0, 0, 0, 0
FROM lotes l
WHERE l.nombre = '8. Irlanda - clonales';

INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
SELECT 
  l.id,
  'Sublote 2',
  2,
  0, 0, 0, 0
FROM lotes l
WHERE l.nombre = '8. Irlanda - clonales';

INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
SELECT 
  l.id,
  'Sublote 3',
  3,
  0, 0, 0, 0
FROM lotes l
WHERE l.nombre = '8. Irlanda - clonales';

-- Lote 9: Acueducto
INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
SELECT 
  l.id,
  'Sublote 1',
  1,
  0, 0, 0, 0
FROM lotes l
WHERE l.nombre = '9. Acueducto';

INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
SELECT 
  l.id,
  'Sublote 2',
  2,
  0, 0, 0, 0
FROM lotes l
WHERE l.nombre = '9. Acueducto';

INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
SELECT 
  l.id,
  'Sublote 3',
  3,
  0, 0, 0, 0
FROM lotes l
WHERE l.nombre = '9. Acueducto';

-- Lote 9B: Acueducto - clonales
INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
SELECT 
  l.id,
  'Sublote 1',
  1,
  0, 0, 0, 0
FROM lotes l
WHERE l.nombre = '9. Acueducto - clonales';

INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
SELECT 
  l.id,
  'Sublote 2',
  2,
  0, 0, 0, 0
FROM lotes l
WHERE l.nombre = '9. Acueducto - clonales';

INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
SELECT 
  l.id,
  'Sublote 3',
  3,
  0, 0, 0, 0
FROM lotes l
WHERE l.nombre = '9. Acueducto - clonales';

-- Lote 10: Santa Rosa
INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
SELECT 
  l.id,
  'Sublote 1',
  1,
  0, 0, 0, 0
FROM lotes l
WHERE l.nombre = '10. Santa Rosa';

INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
SELECT 
  l.id,
  'Sublote 2',
  2,
  0, 0, 0, 0
FROM lotes l
WHERE l.nombre = '10. Santa Rosa';

INSERT INTO sublotes (lote_id, nombre, numero_sublote, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales)
SELECT 
  l.id,
  'Sublote 3',
  3,
  0, 0, 0, 0
FROM lotes l
WHERE l.nombre = '10. Santa Rosa';

-- ============================================
-- ✅ VERIFICACIÓN
-- ============================================

-- Verificar sublotes insertados agrupados por lote
SELECT 
  l.nombre AS lote,
  s.numero_sublote,
  s.nombre AS sublote,
  s.total_arboles
FROM lotes l
LEFT JOIN sublotes s ON l.id = s.lote_id
ORDER BY l.numero_orden, s.numero_sublote;

-- Contar total de sublotes por lote
SELECT 
  l.nombre AS lote,
  COUNT(s.id) AS cantidad_sublotes
FROM lotes l
LEFT JOIN sublotes s ON l.id = s.lote_id
GROUP BY l.nombre, l.numero_orden
ORDER BY l.numero_orden;

-- ============================================
-- 📝 NOTAS IMPORTANTES
-- ============================================
-- 
-- 1. Se crearon 3 sublotes por cada lote (12 lotes × 3 = 36 sublotes)
-- 2. Los sublotes se nombran como "Sublote 1", "Sublote 2", "Sublote 3"
-- 3. El campo `total_arboles` es un GENERATED column que suma automáticamente:
--    arboles_grandes + arboles_medianos + arboles_pequenos + arboles_clonales
-- 4. Todos los conteos están en 0 por defecto
-- 5. Los valores NULL se pueden actualizar después con datos reales
--
-- PRÓXIMOS PASOS OPCIONALES:
-- 
-- Si deseas actualizar conteos de árboles por sublote:
-- 
-- UPDATE sublotes 
-- SET 
--   arboles_grandes = XXX,
--   arboles_medianos = XXX,
--   arboles_pequenos = XXX,
--   arboles_clonales = XXX
-- WHERE lote_id = (SELECT id FROM lotes WHERE nombre = 'X. Nombre del Lote')
--   AND numero_sublote = X;
--
-- ============================================
