-- ===========================================
-- AGREGAR COLUMNA URL_FACTURA A TABLA COMPRAS
-- ===========================================
-- Created: 2025-12-16
-- Purpose: Agregar campo para almacenar facturas en compras de inventario
-- ===========================================

-- Agregar columna url_factura a compras
ALTER TABLE compras
ADD COLUMN IF NOT EXISTS url_factura TEXT;

-- Comentario para documentación
COMMENT ON COLUMN compras.url_factura IS 'Path relativo del archivo de factura en Storage privado (ej: facturas_compra/12345-abc.pdf). NO es una URL pública. Se copia automáticamente al gasto pendiente mediante trigger.';

-- ===========================================
-- SUCCESS MESSAGE
-- ===========================================

DO $$
BEGIN
    RAISE NOTICE 'Columna url_factura agregada exitosamente a la tabla compras!';
    RAISE NOTICE 'Siguiente paso:';
    RAISE NOTICE '1. Ejecutar update_trigger_compra_a_gasto.sql para actualizar el trigger';
    RAISE NOTICE '2. Las facturas se guardarán en facturas_compra/ del bucket privado';
    RAISE NOTICE '3. Se copiarán automáticamente a los gastos pendientes';
END $$;
