-- ===========================================
-- AGREGAR COLUMNA URL_FACTURA A TABLAS DE FINANZAS
-- ===========================================
-- Created: 2025-12-16
-- Purpose: Agregar campo para almacenar URLs de facturas en Supabase Storage
-- ===========================================

-- Agregar columna url_factura a fin_gastos
ALTER TABLE fin_gastos
ADD COLUMN IF NOT EXISTS url_factura TEXT;

-- Agregar columna url_factura a fin_ingresos
ALTER TABLE fin_ingresos
ADD COLUMN IF NOT EXISTS url_factura TEXT;
    
-- Comentarios para documentación
COMMENT ON COLUMN fin_gastos.url_factura IS 'Path relativo del archivo de factura en Storage privado (ej: facturas_compra/12345-abc.pdf). NO es una URL pública.';
COMMENT ON COLUMN fin_ingresos.url_factura IS 'Path relativo del archivo de factura en Storage privado (ej: facturas_venta/12345-abc.pdf). NO es una URL pública.';

-- ===========================================
-- SUCCESS MESSAGE
-- ===========================================

DO $$
BEGIN
    RAISE NOTICE 'Columna url_factura agregada exitosamente a fin_gastos y fin_ingresos!';
    RAISE NOTICE 'Siguiente paso:';
    RAISE NOTICE '1. Crear bucket PRIVADO "facturas" en Supabase Storage';
    RAISE NOTICE '2. Las carpetas se crearán automáticamente (facturas_compra y facturas_venta)';
    RAISE NOTICE '3. Ejecutar create_storage_policies_facturas.sql para configurar RLS en Storage';
    RAISE NOTICE '4. Este sistema usa signed URLs temporales (1 hora) para máxima seguridad';
END $$;
