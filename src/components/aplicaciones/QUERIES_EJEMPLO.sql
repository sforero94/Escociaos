-- ==========================================
-- QUERIES DE EJEMPLO
-- Consultas útiles para trabajar con aplicaciones guardadas
-- ==========================================

-- ==========================================
-- 1. VER APLICACIÓN COMPLETA POR ID
-- ==========================================

-- Aplicación base
SELECT * 
FROM aplicaciones 
WHERE id = 'TU_UUID_AQUI';

-- ==========================================
-- 2. VER APLICACIÓN CON TODOS SUS DATOS (QUERY COMPLETO)
-- ==========================================

-- Aplicación + Lotes + Mezclas + Productos + Cálculos + Compras
WITH aplicacion_base AS (
  SELECT * FROM aplicaciones WHERE id = 'TU_UUID_AQUI'
),
lotes AS (
  SELECT 
    al.*,
    l.nombre AS lote_nombre_actual
  FROM aplicaciones_lotes al
    LEFT JOIN lotes l ON al.lote_id = l.id
  WHERE al.aplicacion_id = 'TU_UUID_AQUI'
),
mezclas AS (
  SELECT * FROM aplicaciones_mezclas
  WHERE aplicacion_id = 'TU_UUID_AQUI'
),
productos AS (
  SELECT 
    ap.*,
    am.nombre AS mezcla_nombre
  FROM aplicaciones_productos ap
    JOIN aplicaciones_mezclas am ON ap.mezcla_id = am.id
  WHERE am.aplicacion_id = 'TU_UUID_AQUI'
),
calculos AS (
  SELECT * FROM aplicaciones_calculos
  WHERE aplicacion_id = 'TU_UUID_AQUI'
),
compras AS (
  SELECT * FROM aplicaciones_compras
  WHERE aplicacion_id = 'TU_UUID_AQUI'
)
SELECT 
  (SELECT row_to_json(aplicacion_base.*) FROM aplicacion_base) AS aplicacion,
  (SELECT json_agg(lotes.*) FROM lotes) AS lotes,
  (SELECT json_agg(mezclas.*) FROM mezclas) AS mezclas,
  (SELECT json_agg(productos.*) FROM productos) AS productos,
  (SELECT json_agg(calculos.*) FROM calculos) AS calculos,
  (SELECT json_agg(compras.*) FROM compras) AS compras;

-- ==========================================
-- 3. LISTAR TODAS LAS APLICACIONES (RESUMEN)
-- ==========================================

SELECT 
  a.id,
  a.codigo_aplicacion,
  a.nombre_aplicacion,
  a.tipo_aplicacion,
  a.estado,
  a.fecha_recomendacion,
  a.agronomo_responsable,
  a.created_at,
  -- Contar lotes
  (SELECT COUNT(*) FROM aplicaciones_lotes WHERE aplicacion_id = a.id) AS num_lotes,
  -- Contar productos
  (
    SELECT COUNT(DISTINCT ap.producto_id)
    FROM aplicaciones_productos ap
      JOIN aplicaciones_mezclas am ON ap.mezcla_id = am.id
    WHERE am.aplicacion_id = a.id
  ) AS num_productos,
  -- Costo total estimado
  (SELECT SUM(costo_estimado) FROM aplicaciones_compras WHERE aplicacion_id = a.id) AS costo_total_estimado
FROM aplicaciones a
ORDER BY a.created_at DESC;

-- ==========================================
-- 4. BUSCAR APLICACIONES POR FILTROS
-- ==========================================

-- Por tipo
SELECT * FROM aplicaciones
WHERE tipo_aplicacion = 'fumigacion' -- o 'fertilizacion'
ORDER BY fecha_recomendacion DESC;

-- Por estado
SELECT * FROM aplicaciones
WHERE estado = 'Calculada' -- o 'En Ejecución', 'Completada'
ORDER BY created_at DESC;

-- Por rango de fechas
SELECT * FROM aplicaciones
WHERE fecha_recomendacion BETWEEN '2025-11-01' AND '2025-11-30'
ORDER BY fecha_recomendacion ASC;

-- Por código
SELECT * FROM aplicaciones
WHERE codigo_aplicacion LIKE 'APL-20251111%'
ORDER BY created_at DESC;

-- Búsqueda de texto
SELECT * FROM aplicaciones
WHERE nombre_aplicacion ILIKE '%trips%'
   OR proposito ILIKE '%trips%'
   OR blanco_biologico ILIKE '%trips%'
ORDER BY created_at DESC;

-- ==========================================
-- 5. VER LOTES DE UNA APLICACIÓN
-- ==========================================

SELECT 
  al.id,
  al.aplicacion_id,
  l.nombre AS lote_nombre,
  al.arboles_grandes,
  al.arboles_medianos,
  al.arboles_pequenos,
  al.arboles_clonales,
  al.total_arboles,
  al.calibracion_litros_arbol,
  al.tamano_caneca,
  al.sublotes_ids
FROM aplicaciones_lotes al
  JOIN lotes l ON al.lote_id = l.id
WHERE al.aplicacion_id = 'TU_UUID_AQUI';

-- ==========================================
-- 6. VER MEZCLAS Y PRODUCTOS DE UNA APLICACIÓN
-- ==========================================

SELECT 
  am.nombre AS mezcla,
  am.numero_orden,
  ap.producto_nombre,
  ap.producto_categoria,
  ap.dosis_por_caneca,
  ap.unidad_dosis,
  ap.dosis_grandes,
  ap.dosis_medianos,
  ap.dosis_pequenos,
  ap.dosis_clonales,
  ap.cantidad_total_necesaria,
  ap.producto_unidad
FROM aplicaciones_mezclas am
  JOIN aplicaciones_productos ap ON am.id = ap.mezcla_id
WHERE am.aplicacion_id = 'TU_UUID_AQUI'
ORDER BY am.numero_orden, ap.producto_nombre;

-- ==========================================
-- 7. VER CÁLCULOS POR LOTE
-- ==========================================

SELECT 
  ac.lote_nombre,
  ac.total_arboles,
  ac.litros_mezcla,
  ac.numero_canecas,
  ac.kilos_totales,
  ac.numero_bultos,
  ac.kilos_grandes,
  ac.kilos_medianos,
  ac.kilos_pequenos,
  ac.kilos_clonales
FROM aplicaciones_calculos ac
WHERE ac.aplicacion_id = 'TU_UUID_AQUI'
ORDER BY ac.lote_nombre;

-- ==========================================
-- 8. VER LISTA DE COMPRAS
-- ==========================================

-- Solo productos a comprar (con faltante)
SELECT 
  ac.producto_nombre,
  ac.producto_categoria,
  ac.inventario_actual,
  ac.cantidad_necesaria,
  ac.cantidad_faltante,
  ac.unidades_a_comprar,
  ac.presentacion_comercial,
  ac.precio_unitario,
  ac.costo_estimado,
  ac.alerta
FROM aplicaciones_compras ac
WHERE ac.aplicacion_id = 'TU_UUID_AQUI'
  AND ac.cantidad_faltante > 0
ORDER BY ac.costo_estimado DESC NULLS LAST;

-- Todos los productos (incluyendo disponibles)
SELECT 
  ac.producto_nombre,
  ac.producto_categoria,
  ac.inventario_actual,
  ac.cantidad_necesaria,
  ac.cantidad_faltante,
  ac.unidades_a_comprar,
  ac.costo_estimado,
  CASE 
    WHEN ac.cantidad_faltante = 0 THEN 'Disponible'
    WHEN ac.cantidad_faltante > 0 THEN 'A Comprar'
  END AS estado
FROM aplicaciones_compras ac
WHERE ac.aplicacion_id = 'TU_UUID_AQUI'
ORDER BY ac.cantidad_faltante DESC;

-- ==========================================
-- 9. REPORTES Y ESTADÍSTICAS
-- ==========================================

-- Aplicaciones por mes
SELECT 
  DATE_TRUNC('month', fecha_recomendacion) AS mes,
  COUNT(*) AS total_aplicaciones,
  SUM(CASE WHEN tipo_aplicacion = 'fumigacion' THEN 1 ELSE 0 END) AS fumigaciones,
  SUM(CASE WHEN tipo_aplicacion = 'fertilizacion' THEN 1 ELSE 0 END) AS fertilizaciones
FROM aplicaciones
WHERE fecha_recomendacion >= DATE_TRUNC('year', CURRENT_DATE)
GROUP BY DATE_TRUNC('month', fecha_recomendacion)
ORDER BY mes DESC;

-- Productos más usados
SELECT 
  ap.producto_nombre,
  ap.producto_categoria,
  COUNT(DISTINCT am.aplicacion_id) AS veces_usado,
  SUM(ap.cantidad_total_necesaria) AS cantidad_total,
  ap.producto_unidad
FROM aplicaciones_productos ap
  JOIN aplicaciones_mezclas am ON ap.mezcla_id = am.id
GROUP BY ap.producto_nombre, ap.producto_categoria, ap.producto_unidad
ORDER BY veces_usado DESC
LIMIT 10;

-- Lotes más tratados
SELECT 
  l.nombre AS lote,
  COUNT(DISTINCT al.aplicacion_id) AS num_aplicaciones,
  SUM(al.total_arboles) AS arboles_tratados_acumulado
FROM aplicaciones_lotes al
  JOIN lotes l ON al.lote_id = l.id
GROUP BY l.id, l.nombre
ORDER BY num_aplicaciones DESC;

-- Inversión por mes
SELECT 
  DATE_TRUNC('month', a.fecha_recomendacion) AS mes,
  SUM(ac.costo_estimado) AS inversion_total,
  COUNT(DISTINCT a.id) AS num_aplicaciones,
  AVG(ac.costo_estimado) AS costo_promedio_producto
FROM aplicaciones a
  LEFT JOIN aplicaciones_compras ac ON a.id = ac.aplicacion_id
WHERE a.fecha_recomendacion >= DATE_TRUNC('year', CURRENT_DATE)
GROUP BY DATE_TRUNC('month', a.fecha_recomendacion)
ORDER BY mes DESC;

-- Estado de aplicaciones
SELECT 
  estado,
  COUNT(*) AS total,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) AS porcentaje
FROM aplicaciones
GROUP BY estado
ORDER BY total DESC;

-- ==========================================
-- 10. QUERIES PARA EL FRONTEND (React)
-- ==========================================

-- Listar aplicaciones para tabla
-- (Usar en /aplicaciones)
SELECT 
  a.id,
  a.codigo_aplicacion,
  a.nombre_aplicacion,
  a.tipo_aplicacion,
  a.estado,
  a.fecha_recomendacion,
  a.agronomo_responsable,
  (SELECT COUNT(*) FROM aplicaciones_lotes WHERE aplicacion_id = a.id) AS num_lotes,
  (
    SELECT COALESCE(SUM(costo_estimado), 0) 
    FROM aplicaciones_compras 
    WHERE aplicacion_id = a.id AND cantidad_faltante > 0
  ) AS inversion_estimada
FROM aplicaciones a
ORDER BY a.created_at DESC
LIMIT 50;

-- Detalle completo de aplicación
-- (Usar en /aplicaciones/:id)
SELECT 
  a.*,
  -- Lotes
  (
    SELECT json_agg(
      json_build_object(
        'id', al.id,
        'lote_id', al.lote_id,
        'lote_nombre', l.nombre,
        'arboles_grandes', al.arboles_grandes,
        'arboles_medianos', al.arboles_medianos,
        'arboles_pequenos', al.arboles_pequenos,
        'arboles_clonales', al.arboles_clonales,
        'total_arboles', al.total_arboles,
        'calibracion_litros_arbol', al.calibracion_litros_arbol,
        'tamano_caneca', al.tamano_caneca
      )
    )
    FROM aplicaciones_lotes al
      JOIN lotes l ON al.lote_id = l.id
    WHERE al.aplicacion_id = a.id
  ) AS lotes,
  -- Mezclas con productos
  (
    SELECT json_agg(
      json_build_object(
        'id', am.id,
        'nombre', am.nombre,
        'numero_orden', am.numero_orden,
        'productos', (
          SELECT json_agg(
            json_build_object(
              'id', ap.id,
              'producto_nombre', ap.producto_nombre,
              'producto_categoria', ap.producto_categoria,
              'dosis_por_caneca', ap.dosis_por_caneca,
              'unidad_dosis', ap.unidad_dosis,
              'dosis_grandes', ap.dosis_grandes,
              'dosis_medianos', ap.dosis_medianos,
              'dosis_pequenos', ap.dosis_pequenos,
              'dosis_clonales', ap.dosis_clonales,
              'cantidad_total_necesaria', ap.cantidad_total_necesaria,
              'producto_unidad', ap.producto_unidad
            )
          )
          FROM aplicaciones_productos ap
          WHERE ap.mezcla_id = am.id
        )
      )
      ORDER BY am.numero_orden
    )
    FROM aplicaciones_mezclas am
    WHERE am.aplicacion_id = a.id
  ) AS mezclas,
  -- Cálculos
  (
    SELECT json_agg(
      json_build_object(
        'lote_nombre', ac.lote_nombre,
        'total_arboles', ac.total_arboles,
        'litros_mezcla', ac.litros_mezcla,
        'numero_canecas', ac.numero_canecas,
        'kilos_totales', ac.kilos_totales,
        'numero_bultos', ac.numero_bultos,
        'kilos_grandes', ac.kilos_grandes,
        'kilos_medianos', ac.kilos_medianos,
        'kilos_pequenos', ac.kilos_pequenos,
        'kilos_clonales', ac.kilos_clonales
      )
    )
    FROM aplicaciones_calculos ac
    WHERE ac.aplicacion_id = a.id
  ) AS calculos,
  -- Lista de compras
  (
    SELECT json_agg(
      json_build_object(
        'producto_nombre', acom.producto_nombre,
        'producto_categoria', acom.producto_categoria,
        'inventario_actual', acom.inventario_actual,
        'cantidad_necesaria', acom.cantidad_necesaria,
        'cantidad_faltante', acom.cantidad_faltante,
        'unidades_a_comprar', acom.unidades_a_comprar,
        'costo_estimado', acom.costo_estimado,
        'alerta', acom.alerta
      )
    )
    FROM aplicaciones_compras acom
    WHERE acom.aplicacion_id = a.id
  ) AS lista_compras
FROM aplicaciones a
WHERE a.id = 'TU_UUID_AQUI';

-- ==========================================
-- 11. ELIMINAR APLICACIÓN (CASCADE AUTOMÁTICO)
-- ==========================================

-- Al eliminar la aplicación, se eliminan automáticamente:
-- - aplicaciones_lotes
-- - aplicaciones_mezclas
-- - aplicaciones_productos (vía mezclas)
-- - aplicaciones_calculos
-- - aplicaciones_compras

DELETE FROM aplicaciones WHERE id = 'TU_UUID_AQUI';

-- ==========================================
-- 12. ACTUALIZAR ESTADO DE APLICACIÓN
-- ==========================================

-- Cambiar de 'Calculada' a 'En Ejecución'
UPDATE aplicaciones
SET 
  estado = 'En Ejecución',
  fecha_inicio_ejecucion = CURRENT_DATE,
  updated_at = NOW()
WHERE id = 'TU_UUID_AQUI';

-- Cambiar de 'En Ejecución' a 'Completada'
UPDATE aplicaciones
SET 
  estado = 'Completada',
  fecha_fin_ejecucion = CURRENT_DATE,
  updated_at = NOW()
WHERE id = 'TU_UUID_AQUI';

-- ==========================================
-- FIN DE QUERIES DE EJEMPLO
-- ==========================================

-- NOTAS:
-- - Reemplaza 'TU_UUID_AQUI' con el UUID real de la aplicación
-- - Los queries con JSON son ideales para APIs REST
-- - Los queries con JOINS son mejores para reportes
-- - Usa LIMIT para paginación en listados grandes