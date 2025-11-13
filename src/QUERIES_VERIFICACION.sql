-- ============================================================================
-- QUERIES DE VERIFICACIÓN - SISTEMA DE APLICACIONES E INVENTARIO
-- ============================================================================
-- Fecha: 2024-11-13
-- Propósito: Validar correcciones de errores críticos #8, #4, #1, #3
-- ============================================================================

-- ============================================================================
-- 1. DIAGNÓSTICO RÁPIDO DE INVENTARIO
-- ============================================================================

-- 1.1 Ver últimos movimientos de inventario (entradas y salidas)
SELECT 
  mi.fecha_movimiento,
  mi.tipo_movimiento,
  p.nombre AS producto,
  mi.cantidad,
  mi.unidad,
  mi.saldo_anterior,
  mi.saldo_nuevo,
  mi.saldo_nuevo - mi.saldo_anterior AS diferencia,
  CASE 
    WHEN mi.aplicacion_id IS NOT NULL 
    THEN CONCAT('Aplicación: ', a.nombre_aplicacion)
    ELSE COALESCE(mi.observaciones, 'Sin observaciones')
  END AS origen,
  mi.responsable,
  mi.created_at
FROM movimientos_inventario mi
LEFT JOIN productos p ON mi.producto_id = p.id
LEFT JOIN aplicaciones a ON mi.aplicacion_id = a.id
ORDER BY mi.created_at DESC
LIMIT 20;

-- ============================================================================
-- 2. VALIDACIÓN DE APLICACIÓN ESPECÍFICA
-- ============================================================================

-- 2.1 Buscar aplicación por nombre
-- REEMPLAZAR 'TEST_INVENTARIO_001' con el nombre de tu aplicación
SELECT 
  id,
  codigo_aplicacion,
  nombre_aplicacion,
  tipo_aplicacion,
  estado,
  fecha_inicio_planeada,
  fecha_inicio_ejecucion,
  fecha_fin_ejecucion,
  fecha_cierre,
  costo_total_insumos,
  costo_total_mano_obra,
  costo_total,
  created_at,
  updated_at
FROM aplicaciones
WHERE nombre_aplicacion = 'TEST_INVENTARIO_001';

-- 2.2 Ver movimientos de inventario de una aplicación específica
-- REEMPLAZAR el nombre de la aplicación
SELECT 
  mi.fecha_movimiento,
  mi.tipo_movimiento,
  p.nombre AS producto,
  mi.cantidad,
  mi.unidad,
  mi.saldo_anterior,
  mi.saldo_nuevo,
  mi.valor_movimiento,
  mi.observaciones
FROM movimientos_inventario mi
JOIN productos p ON mi.producto_id = p.id
WHERE mi.aplicacion_id = (
  SELECT id FROM aplicaciones WHERE nombre_aplicacion = 'TEST_INVENTARIO_001'
)
ORDER BY p.nombre;

-- ============================================================================
-- 3. TRAZABILIDAD COMPLETA: MOVIMIENTOS DIARIOS → INVENTARIO
-- ============================================================================

-- 3.1 Consolidación de productos usados en campo vs descontados de inventario
-- REEMPLAZAR el nombre de la aplicación
WITH aplicacion_info AS (
  SELECT id, nombre_aplicacion, estado 
  FROM aplicaciones 
  WHERE nombre_aplicacion = 'TEST_INVENTARIO_001'
),
-- Sumar todos los productos usados en movimientos diarios
movimientos_diarios_consolidado AS (
  SELECT 
    mdp.producto_id,
    p.nombre AS producto_nombre,
    -- Convertir a unidad base (L o Kg)
    SUM(
      CASE 
        WHEN mdp.unidad = 'cc' THEN mdp.cantidad_utilizada / 1000.0
        WHEN mdp.unidad = 'g' THEN mdp.cantidad_utilizada / 1000.0
        ELSE mdp.cantidad_utilizada
      END
    ) AS total_usado_campo,
    p.unidad_medida
  FROM movimientos_diarios md
  JOIN movimientos_diarios_productos mdp ON md.id = mdp.movimiento_diario_id
  JOIN productos p ON mdp.producto_id = p.id
  WHERE md.aplicacion_id = (SELECT id FROM aplicacion_info)
  GROUP BY mdp.producto_id, p.nombre, p.unidad_medida
),
-- Sumar salidas de inventario
movimientos_inventario_consolidado AS (
  SELECT 
    mi.producto_id,
    p.nombre AS producto_nombre,
    mi.cantidad AS total_descontado_inventario,
    p.unidad_medida
  FROM movimientos_inventario mi
  JOIN productos p ON mi.producto_id = p.id
  WHERE mi.aplicacion_id = (SELECT id FROM aplicacion_info)
    AND mi.tipo_movimiento = 'Salida'
)
-- Comparar
SELECT 
  COALESCE(md.producto_nombre, mi.producto_nombre) AS producto,
  md.total_usado_campo,
  mi.total_descontado_inventario,
  ROUND(
    COALESCE(md.total_usado_campo, 0) - COALESCE(mi.total_descontado_inventario, 0), 
    2
  ) AS diferencia,
  COALESCE(md.unidad_medida, mi.unidad_medida) AS unidad,
  CASE 
    WHEN ROUND(COALESCE(md.total_usado_campo, 0) - COALESCE(mi.total_descontado_inventario, 0), 2) = 0 
    THEN '✅ OK'
    ELSE '❌ DESCUADRE'
  END AS estado_trazabilidad
FROM movimientos_diarios_consolidado md
FULL OUTER JOIN movimientos_inventario_consolidado mi 
  ON md.producto_id = mi.producto_id
ORDER BY producto;

-- ============================================================================
-- 4. VERIFICACIÓN DE STOCKS ACTUALES
-- ============================================================================

-- 4.1 Ver inventario actual de productos con alertas
SELECT 
  nombre,
  categoria,
  cantidad_actual,
  unidad_medida,
  precio_unitario,
  CASE 
    WHEN cantidad_actual <= 0 THEN '🔴 AGOTADO'
    WHEN cantidad_actual < 10 THEN '🟡 BAJO STOCK'
    ELSE '🟢 STOCK OK'
  END AS estado_stock,
  CASE 
    WHEN precio_unitario IS NULL OR precio_unitario = 0 THEN '❌ SIN PRECIO'
    ELSE CONCAT('$', TO_CHAR(precio_unitario, 'FM999,999,999'))
  END AS precio,
  presentacion_comercial,
  updated_at AS ultima_actualizacion
FROM productos
WHERE activo = true
ORDER BY 
  CASE 
    WHEN cantidad_actual <= 0 THEN 1
    WHEN cantidad_actual < 10 THEN 2
    ELSE 3
  END,
  nombre;

-- 4.2 Productos sin precio (bloqueará cierre de aplicaciones)
SELECT 
  id,
  nombre,
  categoria,
  cantidad_actual,
  unidad_medida,
  presentacion_comercial
FROM productos
WHERE activo = true
  AND (precio_unitario IS NULL OR precio_unitario = 0)
ORDER BY nombre;

-- ============================================================================
-- 5. AUDITORÍA DE MOVIMIENTOS POR PRODUCTO
-- ============================================================================

-- 5.1 Historial completo de un producto específico
-- REEMPLAZAR 'Producto A' con el nombre del producto
SELECT 
  mi.fecha_movimiento,
  mi.tipo_movimiento,
  mi.cantidad,
  mi.unidad,
  mi.saldo_anterior,
  mi.saldo_nuevo,
  mi.valor_movimiento,
  CASE 
    WHEN mi.aplicacion_id IS NOT NULL 
    THEN CONCAT('🌱 Aplicación: ', a.nombre_aplicacion)
    WHEN mi.factura IS NOT NULL
    THEN CONCAT('📦 Compra: ', mi.factura)
    ELSE '🔧 ' || COALESCE(mi.observaciones, 'Sin detalles')
  END AS detalle,
  mi.responsable,
  mi.created_at
FROM movimientos_inventario mi
LEFT JOIN aplicaciones a ON mi.aplicacion_id = a.id
WHERE mi.producto_id = (
  SELECT id FROM productos WHERE nombre = 'Producto A'
)
ORDER BY mi.fecha_movimiento DESC, mi.created_at DESC
LIMIT 50;

-- ============================================================================
-- 6. VALIDACIÓN DE APLICACIONES CERRADAS
-- ============================================================================

-- 6.1 Aplicaciones cerradas sin movimientos de inventario (ERROR CRÍTICO)
SELECT 
  a.codigo_aplicacion,
  a.nombre_aplicacion,
  a.fecha_cierre,
  a.costo_total_insumos,
  COUNT(mi.id) AS num_movimientos_inventario
FROM aplicaciones a
LEFT JOIN movimientos_inventario mi ON a.id = mi.aplicacion_id 
  AND mi.tipo_movimiento = 'Salida'
WHERE a.estado = 'Cerrada'
  AND a.fecha_cierre IS NOT NULL
GROUP BY a.id, a.codigo_aplicacion, a.nombre_aplicacion, a.fecha_cierre, a.costo_total_insumos
HAVING COUNT(mi.id) = 0
ORDER BY a.fecha_cierre DESC;

-- ⚠️ Si esta query devuelve filas, indica aplicaciones cerradas SIN actualizar inventario

-- 6.2 Aplicaciones cerradas CON movimientos de inventario (CORRECTO)
SELECT 
  a.codigo_aplicacion,
  a.nombre_aplicacion,
  a.fecha_cierre,
  a.costo_total_insumos,
  COUNT(mi.id) AS num_productos_descontados,
  SUM(mi.valor_movimiento) AS valor_total_movimientos
FROM aplicaciones a
INNER JOIN movimientos_inventario mi ON a.id = mi.aplicacion_id 
  AND mi.tipo_movimiento = 'Salida'
WHERE a.estado = 'Cerrada'
  AND a.fecha_cierre >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY a.id, a.codigo_aplicacion, a.nombre_aplicacion, a.fecha_cierre, a.costo_total_insumos
ORDER BY a.fecha_cierre DESC;

-- ============================================================================
-- 7. REPORTE DE APLICACIONES ACTIVAS
-- ============================================================================

-- 7.1 Aplicaciones en ejecución con movimientos registrados
SELECT 
  a.codigo_aplicacion,
  a.nombre_aplicacion,
  a.tipo_aplicacion,
  a.fecha_inicio_ejecucion,
  COUNT(DISTINCT md.id) AS movimientos_diarios_registrados,
  COUNT(DISTINCT mdp.producto_id) AS productos_utilizados,
  SUM(
    CASE 
      WHEN mdp.unidad = 'cc' THEN mdp.cantidad_utilizada / 1000.0
      WHEN mdp.unidad = 'g' THEN mdp.cantidad_utilizada / 1000.0
      ELSE mdp.cantidad_utilizada
    END
  ) AS total_productos_usados
FROM aplicaciones a
LEFT JOIN movimientos_diarios md ON a.id = md.aplicacion_id
LEFT JOIN movimientos_diarios_productos mdp ON md.id = mdp.movimiento_diario_id
WHERE a.estado = 'En ejecución'
GROUP BY a.id, a.codigo_aplicacion, a.nombre_aplicacion, a.tipo_aplicacion, a.fecha_inicio_ejecucion
ORDER BY a.fecha_inicio_ejecucion DESC;

-- ============================================================================
-- 8. VERIFICACIÓN DE CALIBRACIONES (ERROR #1)
-- ============================================================================

-- 8.1 Lotes sin calibración configurada
SELECT 
  l.id,
  l.nombre,
  l.area_hectareas,
  COUNT(DISTINCT al.aplicacion_id) AS num_aplicaciones_fumigacion,
  -- Verificar si tiene calibración en alguna aplicación de fumigación
  BOOL_OR(
    al.calibracion_litros_arbol IS NOT NULL 
    AND al.tamano_caneca IS NOT NULL
  ) AS tiene_calibracion
FROM lotes l
LEFT JOIN aplicaciones_lotes al ON l.id = al.lote_id
LEFT JOIN aplicaciones a ON al.aplicacion_id = a.id 
  AND a.tipo_aplicacion = 'Fumigación'
GROUP BY l.id, l.nombre, l.area_hectareas
HAVING BOOL_OR(
  al.calibracion_litros_arbol IS NOT NULL 
  AND al.tamano_caneca IS NOT NULL
) = FALSE OR COUNT(DISTINCT al.aplicacion_id) = 0
ORDER BY l.nombre;

-- ============================================================================
-- 9. ESTADÍSTICAS GENERALES
-- ============================================================================

-- 9.1 Resumen de movimientos de inventario por tipo
SELECT 
  tipo_movimiento,
  COUNT(*) AS total_movimientos,
  COUNT(DISTINCT producto_id) AS productos_afectados,
  SUM(cantidad) AS cantidad_total,
  SUM(valor_movimiento) AS valor_total,
  MIN(fecha_movimiento) AS fecha_primer_movimiento,
  MAX(fecha_movimiento) AS fecha_ultimo_movimiento
FROM movimientos_inventario
WHERE fecha_movimiento >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY tipo_movimiento
ORDER BY tipo_movimiento;

-- 9.2 Top 10 productos más utilizados (últimos 30 días)
SELECT 
  p.nombre,
  p.categoria,
  COUNT(DISTINCT mi.aplicacion_id) AS num_aplicaciones,
  SUM(mi.cantidad) AS total_utilizado,
  p.unidad_medida,
  p.cantidad_actual AS stock_actual,
  CASE 
    WHEN p.cantidad_actual <= 0 THEN '🔴 REORDENAR'
    WHEN p.cantidad_actual < 20 THEN '🟡 MONITOREAR'
    ELSE '🟢 OK'
  END AS alerta
FROM movimientos_inventario mi
JOIN productos p ON mi.producto_id = p.id
WHERE mi.tipo_movimiento = 'Salida'
  AND mi.fecha_movimiento >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY p.id, p.nombre, p.categoria, p.unidad_medida, p.cantidad_actual
ORDER BY total_utilizado DESC
LIMIT 10;

-- ============================================================================
-- 10. QUERIES DE LIMPIEZA (USAR CON CUIDADO)
-- ============================================================================

-- ⚠️ SOLO PARA DESARROLLO/TESTING - NO USAR EN PRODUCCIÓN

-- 10.1 Eliminar aplicación de prueba y sus relaciones
-- DESCOMENTAR Y REEMPLAZAR EL NOMBRE PARA USAR
/*
DO $$
DECLARE
  v_aplicacion_id uuid;
BEGIN
  -- Obtener ID de aplicación
  SELECT id INTO v_aplicacion_id 
  FROM aplicaciones 
  WHERE nombre_aplicacion = 'TEST_INVENTARIO_001';
  
  IF v_aplicacion_id IS NOT NULL THEN
    -- Eliminar en orden para respetar foreign keys
    DELETE FROM movimientos_inventario WHERE aplicacion_id = v_aplicacion_id;
    DELETE FROM aplicaciones_compras WHERE aplicacion_id = v_aplicacion_id;
    DELETE FROM aplicaciones_calculos WHERE aplicacion_id = v_aplicacion_id;
    
    DELETE FROM aplicaciones_productos 
    WHERE mezcla_id IN (
      SELECT id FROM aplicaciones_mezclas WHERE aplicacion_id = v_aplicacion_id
    );
    
    DELETE FROM aplicaciones_mezclas WHERE aplicacion_id = v_aplicacion_id;
    
    DELETE FROM movimientos_diarios_productos 
    WHERE movimiento_diario_id IN (
      SELECT id FROM movimientos_diarios WHERE aplicacion_id = v_aplicacion_id
    );
    
    DELETE FROM movimientos_diarios WHERE aplicacion_id = v_aplicacion_id;
    DELETE FROM aplicaciones_lotes WHERE aplicacion_id = v_aplicacion_id;
    DELETE FROM aplicaciones WHERE id = v_aplicacion_id;
    
    RAISE NOTICE 'Aplicación eliminada exitosamente';
  ELSE
    RAISE NOTICE 'Aplicación no encontrada';
  END IF;
END $$;
*/

-- 10.2 Resetear inventario de un producto (restaurar a valor anterior)
-- DESCOMENTAR Y REEMPLAZAR VALORES PARA USAR
/*
UPDATE productos 
SET cantidad_actual = 100.0  -- REEMPLAZAR con cantidad deseada
WHERE nombre = 'Producto A'; -- REEMPLAZAR con nombre del producto
*/

-- ============================================================================
-- FIN DE QUERIES DE VERIFICACIÓN
-- ============================================================================
