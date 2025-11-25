-- ============================================================
-- ROLLBACK: NORMALIZACIÓN DE UNIDADES DE MEDIDA
-- Sistema Escosia Hass
-- Fecha: 2025-11-25
-- ============================================================
-- ADVERTENCIA: Este script revierte los cambios de la migración
-- Solo ejecutar si es absolutamente necesario
-- ============================================================

-- Paso 1: Convertir columnas ENUM de vuelta a TEXT
-- ============================================================

ALTER TABLE productos
ALTER COLUMN unidad_medida TYPE text;

ALTER TABLE movimientos_diarios_productos
ALTER COLUMN unidad TYPE text;

-- Restaurar constraint original
ALTER TABLE movimientos_diarios_productos
ADD CONSTRAINT movimientos_diarios_productos_unidad_check 
CHECK (unidad IN ('cc', 'L', 'g', 'Kg'));

ALTER TABLE movimientos_inventario
ALTER COLUMN unidad TYPE text;

ALTER TABLE compras
ALTER COLUMN unidad TYPE text;

ALTER TABLE aplicaciones_productos
ALTER COLUMN producto_unidad TYPE text;

ALTER TABLE aplicaciones_compras
ALTER COLUMN unidad TYPE text;

ALTER TABLE aplicaciones_productos_planificado
ALTER COLUMN unidad TYPE text;

ALTER TABLE aplicaciones_productos_real
ALTER COLUMN unidad TYPE text;

-- Paso 2: Eliminar el ENUM
-- ============================================================
DROP TYPE IF EXISTS unidad_medida;

-- ============================================================
-- FIN DE ROLLBACK
-- ============================================================
