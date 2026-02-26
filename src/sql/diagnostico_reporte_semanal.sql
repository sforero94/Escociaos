-- Script de Diagnóstico para Reporte Semanal
-- Ejecutar en Supabase Dashboard SQL Editor

-- =====================================================
-- PASO 1: Seleccionar una aplicación específica
-- =====================================================
-- Reemplaza 'APP_ID_AQUI' con el ID real de la aplicación que está fallando
-- O usa esta consulta para encontrar aplicaciones cerradas recientes:

-- SELECT id, nombre_aplicacion, codigo_aplicacion, costo_total, costo_total_insumos, costo_total_mano_obra
-- FROM aplicaciones
-- WHERE estado = 'Cerrada'
-- ORDER BY fecha_cierre DESC
-- LIMIT 5;

-- =====================================================
-- PASO 2: Ver costos REALES por lote (desde aplicaciones_lotes_real)
-- =====================================================
-- Este es el dato REAL que debería mostrarse
WITH app_cierre AS (
  SELECT id, aplicacion_id
  FROM aplicaciones_cierre
  WHERE aplicacion_id = 'APP_ID_AQUI' -- <-- REEMPLAZAR
)
SELECT 
  alr.lote_id,
  l.nombre as lote_nombre,
  alr.costo_insumos,
  alr.costo_mano_obra,
  alr.costo_total,
  alr.jornales_total,
  alr.canecas_20l,
  alr.canecas_200l,
  alr.canecas_500l,
  alr.canecas_1000l
FROM aplicaciones_lotes_real alr
JOIN app_cierre ac ON alr.cierre_id = ac.id
JOIN lotes l ON alr.lote_id = l.id
ORDER BY l.nombre;

-- =====================================================
-- PASO 3: Ver costos TOTALES de la aplicación
-- =====================================================
SELECT 
  id,
  nombre_aplicacion,
  codigo_aplicacion,
  costo_total,
  costo_total_insumos,
  costo_total_mano_obra,
  jornales_utilizados,
  valor_jornal
FROM aplicaciones
WHERE id = 'APP_ID_AQUI'; -- <-- REEMPLAZAR

-- =====================================================
-- PASO 4: Ver cantidades planeadas por lote (desde aplicaciones_calculos)
-- =====================================================
SELECT 
  ac.lote_id,
  l.nombre as lote_nombre,
  ac.kilos_totales,
  ac.litros_mezcla,
  ac.numero_canecas,
  ac.numero_bultos,
  ac.total_arboles
FROM aplicaciones_calculos ac
JOIN lotes l ON ac.lote_id = l.id
WHERE ac.aplicacion_id = 'APP_ID_AQUI' -- <-- REEMPLAZAR
ORDER BY l.nombre;

-- =====================================================
-- PASO 5: Ver productos planificados con precios
-- =====================================================
WITH mezclas_app AS (
  SELECT id 
  FROM aplicaciones_mezclas 
  WHERE aplicacion_id = 'APP_ID_AQUI' -- <-- REEMPLAZAR
)
SELECT 
  ap.producto_id,
  ap.producto_nombre,
  ap.cantidad_total_necesaria,
  p.precio_unitario,
  p.precio_por_presentacion,
  (ap.cantidad_total_necesaria * COALESCE(p.precio_unitario, 0)) as costo_calculado
FROM aplicaciones_productos ap
LEFT JOIN productos p ON ap.producto_id = p.id
WHERE ap.mezcla_id IN (SELECT id FROM mezclas_app)
ORDER BY ap.producto_nombre;

-- =====================================================
-- PASO 6: Verificar si hay movimientos diarios con productos
-- =====================================================
SELECT 
  md.id as movimiento_id,
  md.lote_id,
  l.nombre as lote_nombre,
  md.fecha_movimiento,
  md.numero_canecas,
  md.numero_bultos,
  COUNT(mdp.id) as num_productos_registrados
FROM movimientos_diarios md
LEFT JOIN movimientos_diarios_productos mdp ON md.id = mdp.movimiento_diario_id
JOIN lotes l ON md.lote_id = l.id
WHERE md.aplicacion_id = 'APP_ID_AQUI' -- <-- REEMPLAZAR
GROUP BY md.id, md.lote_id, l.nombre, md.fecha_movimiento, md.numero_canecas, md.numero_bultos
ORDER BY l.nombre, md.fecha_movimiento;

-- =====================================================
-- PASO 7: Ver productos reales usados (si existen)
-- =====================================================
SELECT 
  mdp.movimiento_diario_id,
  md.lote_id,
  l.nombre as lote_nombre,
  mdp.producto_nombre,
  mdp.cantidad_utilizada,
  mdp.unidad
FROM movimientos_diarios_productos mdp
JOIN movimientos_diarios md ON mdp.movimiento_diario_id = md.id
JOIN lotes l ON md.lote_id = l.id
WHERE md.aplicacion_id = 'APP_ID_AQUI' -- <-- REEMPLAZAR
ORDER BY l.nombre, mdp.producto_nombre;

-- =====================================================
-- RESUMEN COMPARATIVO
-- =====================================================
-- Esta consulta resume todo para ver las discrepancias
WITH 
-- Costos reales por lote
costos_reales AS (
  SELECT 
    alr.lote_id,
    SUM(alr.costo_total) as total_real
  FROM aplicaciones_lotes_real alr
  JOIN aplicaciones_cierre ac ON alr.cierre_id = ac.id
  WHERE ac.aplicacion_id = 'APP_ID_AQUI' -- <-- REEMPLAZAR
  GROUP BY alr.lote_id
),
-- Cantidades planeadas por lote
cantidades_plan AS (
  SELECT 
    lote_id,
    SUM(kilos_totales) as total_kilos_plan,
    SUM(litros_mezcla) as total_litros_plan
  FROM aplicaciones_calculos
  WHERE aplicacion_id = 'APP_ID_AQUI' -- <-- REEMPLAZAR
  GROUP BY lote_id
)
SELECT 
  l.id as lote_id,
  l.nombre as lote_nombre,
  COALESCE(cp.total_kilos_plan, 0) as kilos_plan,
  COALESCE(cp.total_litros_plan, 0) as litros_plan,
  COALESCE(cr.total_real, 0) as costo_real,
  (SELECT costo_total FROM aplicaciones WHERE id = 'APP_ID_AQUI') as costo_total_app
FROM lotes l
LEFT JOIN costos_reales cr ON l.id = cr.lote_id
LEFT JOIN cantidades_plan cp ON l.id = cp.lote_id
WHERE cr.total_real IS NOT NULL OR cp.total_kilos_plan IS NOT NULL
ORDER BY l.nombre;

-- Notas:
-- 1. Reemplaza 'APP_ID_AQUI' con el UUID real de la aplicación problemática
-- 2. Los costos reales deben sumar aproximadamente el costo_total de la aplicación
-- 3. Si costo_real es NULL, significa que no hay datos en aplicaciones_lotes_real
-- 4. Si kilos_plan es 0 pero hay costo_real, hay un problema de distribución