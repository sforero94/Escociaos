-- ============================================================
-- MIGRACIÓN: NORMALIZACIÓN DE UNIDADES DE MEDIDA
-- Sistema Escosia Hass
-- Fecha: 2025-11-25
-- ============================================================

-- Paso 1: Crear el ENUM para unidades de medida
-- ============================================================
CREATE TYPE unidad_medida AS ENUM ('Litros', 'Kilos', 'Unidades');

-- Paso 2: Normalizar datos existentes en todas las tablas
-- ============================================================

-- 2.1 Productos: normalizar unidad_medida
UPDATE productos
SET unidad_medida = CASE
  WHEN LOWER(unidad_medida) IN ('litros', 'l', 'litro') THEN 'Litros'
  WHEN LOWER(unidad_medida) IN ('kilos', 'kg', 'kilo', 'kilogramos') THEN 'Kilos'
  WHEN LOWER(unidad_medida) IN ('unidades', 'unidad', 'und', 'u') THEN 'Unidades'
  ELSE 'Unidades' -- Valor por defecto para casos no identificados
END;

-- 2.2 Movimientos diarios productos: normalizar unidad
UPDATE movimientos_diarios_productos
SET unidad = CASE
  WHEN LOWER(unidad) IN ('l', 'litros', 'litro', 'cc') THEN 'Litros'
  WHEN LOWER(unidad) IN ('kg', 'kilos', 'kilo', 'kilogramos', 'g', 'gramos') THEN 'Kilos'
  WHEN LOWER(unidad) IN ('unidades', 'unidad', 'und', 'u') THEN 'Unidades'
  ELSE 'Unidades'
END;

-- 2.3 Movimientos inventario: normalizar unidad
UPDATE movimientos_inventario
SET unidad = CASE
  WHEN LOWER(unidad) IN ('l', 'litros', 'litro', 'cc') THEN 'Litros'
  WHEN LOWER(unidad) IN ('kg', 'kilos', 'kilo', 'kilogramos', 'g', 'gramos') THEN 'Kilos'
  WHEN LOWER(unidad) IN ('unidades', 'unidad', 'und', 'u') THEN 'Unidades'
  ELSE 'Unidades'
END;

-- 2.4 Compras: normalizar unidad
UPDATE compras
SET unidad = CASE
  WHEN LOWER(unidad) IN ('l', 'litros', 'litro', 'cc') THEN 'Litros'
  WHEN LOWER(unidad) IN ('kg', 'kilos', 'kilo', 'kilogramos', 'g', 'gramos') THEN 'Kilos'
  WHEN LOWER(unidad) IN ('unidades', 'unidad', 'und', 'u') THEN 'Unidades'
  ELSE 'Unidades'
END;

-- 2.5 Aplicaciones productos: normalizar producto_unidad
UPDATE aplicaciones_productos
SET producto_unidad = CASE
  WHEN LOWER(producto_unidad) IN ('l', 'litros', 'litro', 'cc') THEN 'Litros'
  WHEN LOWER(producto_unidad) IN ('kg', 'kilos', 'kilo', 'kilogramos', 'g', 'gramos') THEN 'Kilos'
  WHEN LOWER(producto_unidad) IN ('unidades', 'unidad', 'und', 'u') THEN 'Unidades'
  ELSE 'Unidades'
END;

-- 2.6 Aplicaciones compras: normalizar unidad
UPDATE aplicaciones_compras
SET unidad = CASE
  WHEN LOWER(unidad) IN ('l', 'litros', 'litro', 'cc') THEN 'Litros'
  WHEN LOWER(unidad) IN ('kg', 'kilos', 'kilo', 'kilogramos', 'g', 'gramos') THEN 'Kilos'
  WHEN LOWER(unidad) IN ('unidades', 'unidad', 'und', 'u') THEN 'Unidades'
  ELSE 'Unidades'
END;

-- 2.7 Aplicaciones productos planificado: normalizar unidad
UPDATE aplicaciones_productos_planificado
SET unidad = CASE
  WHEN LOWER(unidad) IN ('l', 'litros', 'litro', 'cc') THEN 'Litros'
  WHEN LOWER(unidad) IN ('kg', 'kilos', 'kilo', 'kilogramos', 'g', 'gramos') THEN 'Kilos'
  WHEN LOWER(unidad) IN ('unidades', 'unidad', 'und', 'u') THEN 'Unidades'
  ELSE 'Unidades'
END;

-- 2.8 Aplicaciones productos real: normalizar unidad
UPDATE aplicaciones_productos_real
SET unidad = CASE
  WHEN LOWER(unidad) IN ('l', 'litros', 'litro', 'cc') THEN 'Litros'
  WHEN LOWER(unidad) IN ('kg', 'kilos', 'kilo', 'kilogramos', 'g', 'gramos') THEN 'Kilos'
  WHEN LOWER(unidad) IN ('unidades', 'unidad', 'und', 'u') THEN 'Unidades'
  ELSE 'Unidades'
END;

-- Paso 3: Modificar columnas para usar el ENUM
-- ============================================================

-- 3.1 Productos: cambiar unidad_medida a ENUM
ALTER TABLE productos
ALTER COLUMN unidad_medida TYPE unidad_medida USING unidad_medida::unidad_medida;

-- 3.2 Movimientos diarios productos: cambiar unidad a ENUM
-- Primero eliminar el constraint existente
ALTER TABLE movimientos_diarios_productos
DROP CONSTRAINT IF EXISTS movimientos_diarios_productos_unidad_check;

-- Cambiar a ENUM
ALTER TABLE movimientos_diarios_productos
ALTER COLUMN unidad TYPE unidad_medida USING unidad::unidad_medida;

-- 3.3 Movimientos inventario: cambiar unidad a ENUM
ALTER TABLE movimientos_inventario
ALTER COLUMN unidad TYPE unidad_medida USING unidad::unidad_medida;

-- 3.4 Compras: cambiar unidad a ENUM
ALTER TABLE compras
ALTER COLUMN unidad TYPE unidad_medida USING unidad::unidad_medida;

-- 3.5 Aplicaciones productos: cambiar producto_unidad a ENUM
ALTER TABLE aplicaciones_productos
ALTER COLUMN producto_unidad TYPE unidad_medida USING producto_unidad::unidad_medida;

-- 3.6 Aplicaciones compras: cambiar unidad a ENUM
ALTER TABLE aplicaciones_compras
ALTER COLUMN unidad TYPE unidad_medida USING unidad::unidad_medida;

-- 3.7 Aplicaciones productos planificado: cambiar unidad a ENUM
ALTER TABLE aplicaciones_productos_planificado
ALTER COLUMN unidad TYPE unidad_medida USING unidad::unidad_medida;

-- 3.8 Aplicaciones productos real: cambiar unidad a ENUM
ALTER TABLE aplicaciones_productos_real
ALTER COLUMN unidad TYPE unidad_medida USING unidad::unidad_medida;

-- NOTA: Las columnas de DOSIS (unidad_dosis) se mantienen como TEXT
-- porque contienen valores como 'cc/L', 'g/L', 'Kg/Ha', etc.
-- que son unidades compuestas para dosificación.

-- ============================================================
-- FIN DE MIGRACIÓN
-- ============================================================

-- Verificación: Contar registros por unidad en cada tabla
-- ============================================================
SELECT 'productos' as tabla, unidad_medida as unidad, COUNT(*) as total
FROM productos
GROUP BY unidad_medida
UNION ALL
SELECT 'movimientos_diarios_productos', unidad, COUNT(*)
FROM movimientos_diarios_productos
GROUP BY unidad
UNION ALL
SELECT 'movimientos_inventario', unidad, COUNT(*)
FROM movimientos_inventario
GROUP BY unidad
UNION ALL
SELECT 'compras', unidad, COUNT(*)
FROM compras
GROUP BY unidad
ORDER BY tabla, unidad;
