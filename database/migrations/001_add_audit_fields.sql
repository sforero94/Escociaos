-- ==================================================================
-- Migración: Agregar campos de auditoría a tablas principales
-- Fecha: 2025-11-11
-- Descripción: Agrega campos updated_at y updated_by para trazabilidad
-- ==================================================================

-- ============================================
-- 1. Agregar campos a tabla productos
-- ============================================

-- Verificar si ya existen las columnas antes de agregarlas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'productos' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE productos ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'productos' AND column_name = 'updated_by'
  ) THEN
    ALTER TABLE productos ADD COLUMN updated_by UUID REFERENCES auth.users(id);
  END IF;
END $$;

-- ============================================
-- 2. Agregar campos a tabla compras
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'compras' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE compras ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'compras' AND column_name = 'updated_by'
  ) THEN
    ALTER TABLE compras ADD COLUMN updated_by UUID REFERENCES auth.users(id);
  END IF;
END $$;

-- ============================================
-- 3. Crear función para actualizar updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 4. Crear triggers para productos
-- ============================================

DROP TRIGGER IF EXISTS set_updated_at_productos ON productos;
CREATE TRIGGER set_updated_at_productos
BEFORE UPDATE ON productos
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 5. Crear triggers para compras
-- ============================================

DROP TRIGGER IF EXISTS set_updated_at_compras ON compras;
CREATE TRIGGER set_updated_at_compras
BEFORE UPDATE ON compras
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 6. Agregar índices para mejorar rendimiento
-- ============================================

-- Índice para búsquedas por producto y tipo de movimiento
CREATE INDEX IF NOT EXISTS idx_movimientos_producto_tipo
ON movimientos_inventario(producto_id, tipo_movimiento);

-- Índice para filtrado por fechas
CREATE INDEX IF NOT EXISTS idx_movimientos_created_at
ON movimientos_inventario(created_at DESC);

-- Índice compuesto para consultas específicas de producto
CREATE INDEX IF NOT EXISTS idx_movimientos_producto_created
ON movimientos_inventario(producto_id, created_at DESC);

-- Índice para productos activos
CREATE INDEX IF NOT EXISTS idx_productos_activo_nombre
ON productos(activo, nombre) WHERE activo = true;

-- ============================================
-- 7. Comentarios descriptivos
-- ============================================

COMMENT ON COLUMN productos.updated_at IS 'Fecha y hora de la última actualización del producto';
COMMENT ON COLUMN productos.updated_by IS 'ID del usuario que realizó la última actualización';
COMMENT ON COLUMN compras.updated_at IS 'Fecha y hora de la última actualización de la compra';
COMMENT ON COLUMN compras.updated_by IS 'ID del usuario que realizó la última actualización';

-- ============================================
-- 8. Actualizar datos existentes (opcional)
-- ============================================

-- Establecer updated_at para registros existentes
UPDATE productos SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE compras SET updated_at = created_at WHERE updated_at IS NULL;

-- ==================================================================
-- FIN DE MIGRACIÓN
-- ==================================================================

-- Verificar que todo se ejecutó correctamente
DO $$
BEGIN
  RAISE NOTICE 'Migración completada exitosamente';
  RAISE NOTICE 'Campos de auditoría agregados a productos y compras';
  RAISE NOTICE 'Triggers configurados correctamente';
  RAISE NOTICE 'Índices creados para optimizar consultas';
END $$;
