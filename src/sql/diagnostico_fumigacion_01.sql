-- Diagnóstico específico para Fumigación 01
-- ID: 3bea3a70-4ca7-49ca-ac6b-9a2a443a5390

-- =====================================================
-- 1. COSTOS TOTALES DE LA APLICACIÓN
-- =====================================================
SELECT 
  id,
  nombre_aplicacion,
  codigo_aplicacion,
  costo_total,
  costo_total_insumos,
  costo_total_mano_obra,
  jornales_utilizados,
  valor_jornal,
  fecha_cierre
FROM aplicaciones
WHERE id = '3bea3a70-4ca7-49ca-ac6b-9a2a443a5390';

-- =====================================================
-- 2. COSTOS REALES POR LOTE (desde aplicaciones_lotes_real)
-- =====================================================
WITH cierre_app AS (
  SELECT id 
  FROM aplicaciones_cierre 
  WHERE aplicacion_id = '3bea3a70-4ca7-49ca-ac6b-9a2a443a5390'
)
SELECT 
  alr.lote_id,
  l.nombre as lote_nombre,
  alr.costo_insumos,
  alr.costo_mano_obra,
  alr.costo_total as costo_total_lote,
  alr.jornales_total,
  (alr.canecas_20l + alr.canecas_200l + alr.canecas_500l + alr.canecas_1000l) as total_canecas
FROM aplicaciones_lotes_real alr
JOIN cierre_app c ON alr.cierre_id = c.id
JOIN lotes l ON alr.lote_id = l.id
ORDER BY l.nombre;

-- =====================================================
-- 3. CANTIDADES PLANEADAS POR LOTE (desde aplicaciones_calculos)
-- =====================================================
SELECT 
  ac.lote_id,
  l.nombre as lote_nombre,
  ac.litros_mezcla,
  ac.numero_canecas,
  ac.total_arboles
FROM aplicaciones_calculos ac
JOIN lotes l ON ac.lote_id = l.id
WHERE ac.aplicacion_id = '3bea3a70-4ca7-49ca-ac6b-9a2a443a5390'
ORDER BY l.nombre;

-- =====================================================
-- 4. PRODUCTOS PLANIFICADOS CON PRECIOS
-- =====================================================
WITH mezclas AS (
  SELECT id 
  FROM aplicaciones_mezclas 
  WHERE aplicacion_id = '3bea3a70-4ca7-49ca-ac6b-9a2a443a5390'
)
SELECT 
  ap.producto_nombre,
  ap.cantidad_total_necesaria,
  ap.producto_unidad,
  p.precio_unitario,
  p.precio_por_presentacion,
  (ap.cantidad_total_necesaria * COALESCE(p.precio_unitario, 0)) as costo_calculado,
  CASE 
    WHEN p.precio_unitario IS NULL OR p.precio_unitario = 0 THEN 'SIN PRECIO'
    ELSE 'OK'
  END as estado_precio
FROM aplicaciones_productos ap
LEFT JOIN productos p ON ap.producto_id = p.id
WHERE ap.mezcla_id IN (SELECT id FROM mezclas)
ORDER BY ap.producto_nombre;

-- =====================================================
-- 5. MOVIMIENTOS DIARIOS CON PRODUCTOS
-- =====================================================
SELECT 
  md.id as movimiento_id,
  md.lote_id,
  l.nombre as lote_nombre,
  md.numero_canecas,
  mdp.producto_nombre,
  mdp.cantidad_utilizada,
  mdp.unidad
FROM movimientos_diarios md
LEFT JOIN movimientos_diarios_productos mdp ON md.id = mdp.movimiento_diario_id
JOIN lotes l ON md.lote_id = l.id
WHERE md.aplicacion_id = '3bea3a70-4ca7-49ca-ac6b-9a2a443a5390'
  AND mdp.id IS NOT NULL
ORDER BY l.nombre, mdp.producto_nombre;

-- =====================================================
-- 6. RESUMEN COMPARATIVO: PLAN vs REAL
-- =====================================================
WITH 
costos_reales AS (
  SELECT 
    alr.lote_id,
    SUM(alr.costo_total) as costo_real,
    SUM(alr.costo_insumos) as insumos_real,
    SUM(alr.costo_mano_obra) as mo_real
  FROM aplicaciones_lotes_real alr
  JOIN aplicaciones_cierre ac ON alr.cierre_id = ac.id
  WHERE ac.aplicacion_id = '3bea3a70-4ca7-49ca-ac6b-9a2a443a5390'
  GROUP BY alr.lote_id
),
cantidades_plan AS (
  SELECT 
    lote_id,
    SUM(litros_mezcla) as litros_plan,
    SUM(numero_canecas) as canecas_plan
  FROM aplicaciones_calculos
  WHERE aplicacion_id = '3bea3a70-4ca7-49ca-ac6b-9a2a443a5390'
  GROUP BY lote_id
)
SELECT 
  l.id as lote_id,
  l.nombre as lote_nombre,
  COALESCE(cp.litros_plan, 0) as litros_plan,
  COALESCE(cp.canecas_plan, 0) as canecas_plan,
  COALESCE(cr.costo_real, 0) as costo_real,
  COALESCE(cr.insumos_real, 0) as insumos_real,
  COALESCE(cr.mo_real, 0) as mo_real
FROM lotes l
LEFT JOIN costos_reales cr ON l.id = cr.lote_id
LEFT JOIN cantidades_plan cp ON l.id = cp.lote_id
WHERE cr.costo_real IS NOT NULL OR cp.litros_plan > 0
ORDER BY l.nombre;

-- =====================================================
-- 7. VERIFICACIÓN: SUMA DE COSTOS REALES
-- =====================================================
WITH cierre AS (
  SELECT id FROM aplicaciones_cierre 
  WHERE aplicacion_id = '3bea3a70-4ca7-49ca-ac6b-9a2a443a5390'
)
SELECT 
  'SUMA COSTOS REALES' as concepto,
  SUM(costo_total) as total,
  (SELECT costo_total FROM aplicaciones WHERE id = '3bea3a70-4ca7-49ca-ac6b-9a2a443a5390') as costo_total_app,
  CASE 
    WHEN ABS(SUM(costo_total) - (SELECT costo_total FROM aplicaciones WHERE id = '3bea3a70-4ca7-49ca-ac6b-9a2a443a5390')) < 1000 THEN 'OK'
    ELSE 'DISCREPANCIA'
  END as estado
FROM aplicaciones_lotes_real
WHERE cierre_id = (SELECT id FROM cierre);