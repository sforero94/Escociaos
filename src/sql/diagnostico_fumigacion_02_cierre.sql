-- ============================================================================
-- DIAGNÓSTICO FUMIGACIÓN 01 - INVESTIGACIÓN CIERRE
-- Aplicación: 3bea3a70-4ca7-49ca-ac6b-9a2a443a5390
-- Objetivo: Investigar por qué no hay datos en aplicaciones_cierre
-- ============================================================================

-- ============================================================================
-- SECCIÓN 1: Verificar si existe registro en aplicaciones_cierre
-- ============================================================================

SELECT 
    'VERIFICAR CIERRE' as concepto,
    CASE 
        WHEN c.id IS NULL THEN 'NO EXISTE CIERRE'
        ELSE 'CIERRE EXISTE'
    END as estado,
    c.id as cierre_id,
    c.aplicacion_id,
    c.fecha_cierre,
    c.dias_aplicacion,
    c.valor_jornal,
    c.observaciones_generales,
    c.created_at,
    c.updated_at
FROM aplicaciones a
LEFT JOIN aplicaciones_cierre c ON a.id = c.aplicacion_id
WHERE a.id = '3bea3a70-4ca7-49ca-ac6b-9a2a443a5390';

-- ============================================================================
-- SECCIÓN 2: Si NO existe cierre, verificar estado de la aplicación
-- ============================================================================

SELECT 
    'ESTADO APLICACION' as concepto,
    a.id,
    a.nombre as nombre_aplicacion,
    a.estado,
    a.costo_total,
    a.created_at,
    a.updated_at
FROM aplicaciones a
WHERE a.id = '3bea3a70-4ca7-49ca-ac6b-9a2a443a5390';

-- ============================================================================
-- SECCIÓN 3: Calcular costos reales desde movimientos_diarios_productos
-- (Alternativa si no hay cierre)
-- ============================================================================

SELECT 
    'COSTOS DESDE MOVIMIENTOS' as concepto,
    m.lote_id,
    l.nombre as lote_nombre,
    SUM(md.costo_total_mezcla) as costo_mezcla_total,
    SUM(md.costo_total_mezcla) / NULLIF(SUM(md.numero_canecas), 0) as costo_por_caneca,
    SUM(md.numero_canecas) as total_canecas_movimientos
FROM movimientos_diarios m
JOIN lotes l ON m.lote_id = l.id
LEFT JOIN (
    -- Sumarizar productos por movimiento para obtener costo de mezcla
    SELECT 
        movimiento_id,
        SUM(cantidad_utilizada * (
            SELECT precio_unitario FROM productos p WHERE p.id = producto_id
        )) as costo_total_mezcla,
        MAX(numero_canecas) as numero_canecas
    FROM movimientos_diarios_productos mdp
    JOIN movimientos_diarios md2 ON mdp.movimiento_id = md2.id
    WHERE md2.aplicacion_id = '3bea3a70-4ca7-49ca-ac6b-9a2a443a5390'
    GROUP BY movimiento_id
) md ON m.id = md.movimiento_id
WHERE m.aplicacion_id = '3bea3a70-4ca7-49ca-ac6b-9a2a443a5390'
GROUP BY m.lote_id, l.nombre;

-- ============================================================================
-- SECCIÓN 4: Verificar costo por producto real usado (con precio actual)
-- ============================================================================

SELECT 
    'COSTO REAL POR PRODUCTO' as concepto,
    m.lote_id,
    l.nombre as lote_nombre,
    p.nombre as producto_nombre,
    mdp.cantidad_utilizada,
    mdp.unidad,
    COALESCE(p.precio_unitario, 0) as precio_unitario_actual,
    (mdp.cantidad_utilizada * COALESCE(p.precio_unitario, 0)) as costo_calculado
FROM movimientos_diarios_productos mdp
JOIN movimientos_diarios m ON mdp.movimiento_id = m.id
JOIN lotes l ON m.lote_id = l.id
LEFT JOIN productos p ON mdp.producto_id = p.id
WHERE m.aplicacion_id = '3bea3a70-4ca7-49ca-ac6b-9a2a443a5390'
ORDER BY m.lote_id, p.nombre;

-- ============================================================================
-- SECCIÓN 5: Sumarizar costos reales por lote (desde productos)
-- ============================================================================

SELECT 
    'RESUMEN COSTOS REALES POR LOTE' as concepto,
    sub.lote_id,
    sub.lote_nombre,
    sub.total_productos,
    ROUND(sub.costo_insumos_total::numeric, 2) as costo_insumos_real,
    ROUND((sub.costo_insumos_total / NULLIF(sub.total_arboles, 0))::numeric, 2) as costo_por_arbol
FROM (
    SELECT 
        m.lote_id,
        l.nombre as lote_nombre,
        COUNT(DISTINCT mdp.producto_id) as total_productos,
        SUM(mdp.cantidad_utilizada * COALESCE(p.precio_unitario, 0)) as costo_insumos_total,
        MAX(l.numero_arboles) as total_arboles
    FROM movimientos_diarios_productos mdp
    JOIN movimientos_diarios m ON mdp.movimiento_id = m.id
    JOIN lotes l ON m.lote_id = l.id
    LEFT JOIN productos p ON mdp.producto_id = p.id
    WHERE m.aplicacion_id = '3bea3a70-4ca7-49ca-ac6b-9a2a443a5390'
    GROUP BY m.lote_id, l.nombre
) sub
ORDER BY sub.lote_nombre;

-- ============================================================================
-- SECCIÓN 6: Calcular costo total real de insumos (sin cierre)
-- ============================================================================

SELECT 
    'COSTO TOTAL INSUMOS REAL' as concepto,
    ROUND(SUM(mdp.cantidad_utilizada * COALESCE(p.precio_unitario, 0))::numeric, 2) as costo_insumos_total,
    ROUND((SELECT costo_total FROM aplicaciones WHERE id = '3bea3a70-4ca7-49ca-ac6b-9a2a443a5390')::numeric, 2) as costo_total_aplicacion,
    ROUND((
        (SELECT costo_total FROM aplicaciones WHERE id = '3bea3a70-4ca7-49ca-ac6b-9a2a443a5390') 
        - SUM(mdp.cantidad_utilizada * COALESCE(p.precio_unitario, 0))
    )::numeric, 2) as diferencia_costo_mano_obra
FROM movimientos_diarios_productos mdp
JOIN movimientos_diarios m ON mdp.movimiento_id = m.id
LEFT JOIN productos p ON mdp.producto_id = p.id
WHERE m.aplicacion_id = '3bea3a70-4ca7-49ca-ac6b-9a2a443a5390';

-- ============================================================================
-- SECCIÓN 7: Verificar si hay cierres en otras aplicaciones (para comparar)
-- ============================================================================

SELECT 
    'EJEMPLOS CIERRES EXISTENTES' as concepto,
    a.id as aplicacion_id,
    a.nombre as aplicacion_nombre,
    CASE 
        WHEN c.id IS NOT NULL THEN 'CON CIERRE'
        ELSE 'SIN CIERRE'
    END as estado_cierre,
    c.id as cierre_id,
    c.fecha_cierre
FROM aplicaciones a
LEFT JOIN aplicaciones_cierre c ON a.id = c.aplicacion_id
WHERE a.estado = 'Cerrada'
ORDER BY a.created_at DESC
LIMIT 5;

-- ============================================================================
-- NOTAS
-- ============================================================================

-- Este script investiga:
-- 1. Si existe un cierre para la fumigación 01
-- 2. Si no existe, calcula costos reales desde movimientos_diarios_productos
-- 3. Compara costo calculado vs costo_total en aplicaciones
-- 4. Identifica cuánto del costo_total corresponde a mano de obra
