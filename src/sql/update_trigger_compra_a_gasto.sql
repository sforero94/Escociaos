-- ===========================================
-- ACTUALIZAR TRIGGER PARA COPIAR URL_FACTURA
-- ===========================================
-- Created: 2025-12-16
-- Purpose: Actualizar trigger para copiar url_factura de compras a gastos pendientes
-- ===========================================

-- Drop existing trigger
DROP TRIGGER IF EXISTS trigger_compra_a_gasto ON compras;

-- Actualizar función para incluir url_factura
CREATE OR REPLACE FUNCTION crear_gasto_pendiente_de_compra()
RETURNS TRIGGER AS $$
DECLARE
    negocio_default_id UUID;
    region_default_id UUID;
    categoria_default_id UUID;
    concepto_default_id UUID;
    medio_pago_default_id UUID;
BEGIN
    -- Obtener valores por defecto (primeros activos)
    SELECT id INTO negocio_default_id FROM fin_negocios WHERE activo = true ORDER BY nombre LIMIT 1;
    SELECT id INTO region_default_id FROM fin_regiones WHERE activo = true ORDER BY nombre LIMIT 1;
    SELECT id INTO categoria_default_id FROM fin_categorias_gastos WHERE activo = true ORDER BY nombre LIMIT 1;
    SELECT id INTO medio_pago_default_id FROM fin_medios_pago WHERE activo = true ORDER BY nombre LIMIT 1;

    -- Obtener concepto por defecto de la categoría
    SELECT id INTO concepto_default_id
    FROM fin_conceptos_gastos
    WHERE categoria_id = categoria_default_id AND activo = true
    ORDER BY nombre LIMIT 1;

    -- Validar que tengamos todos los valores necesarios
    IF negocio_default_id IS NULL OR region_default_id IS NULL OR
       categoria_default_id IS NULL OR concepto_default_id IS NULL OR
       medio_pago_default_id IS NULL THEN
        RAISE EXCEPTION 'No se encontraron catálogos activos necesarios para crear el gasto';
    END IF;

    -- Crear gasto pendiente con url_factura
    INSERT INTO fin_gastos (
        fecha,
        negocio_id,
        region_id,
        categoria_id,
        concepto_id,
        nombre,
        proveedor_id,
        valor,
        medio_pago_id,
        observaciones,
        estado,
        url_factura,
        compra_id,
        created_at,
        updated_at
    ) VALUES (
        NEW.fecha_compra,
        negocio_default_id,
        region_default_id,
        categoria_default_id,
        concepto_default_id,
        'Compra: ' || COALESCE(NEW.proveedor, 'Sin proveedor') || ' - Factura: ' || NEW.numero_factura,
        NEW.proveedor_id,
        NEW.costo_total,
        medio_pago_default_id,
        'Gasto generado automáticamente desde compra. Requiere confirmación manual.',
        'Pendiente',
        NEW.url_factura, -- NUEVO: Copiar url_factura de la compra
        NEW.id, -- Reference to the purchase
        NOW(),
        NOW()
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recrear el trigger
CREATE TRIGGER trigger_compra_a_gasto
    AFTER INSERT ON compras
    FOR EACH ROW
    EXECUTE FUNCTION crear_gasto_pendiente_de_compra();

-- Comentarios para documentación
COMMENT ON FUNCTION crear_gasto_pendiente_de_compra() IS 'Crea automáticamente un gasto pendiente cuando se registra una compra. Incluye copia de url_factura.';
COMMENT ON TRIGGER trigger_compra_a_gasto ON compras IS 'Trigger que genera gastos pendientes desde compras para integración financiera. Copia la factura adjunta.';

-- ===========================================
-- SUCCESS MESSAGE
-- ===========================================

DO $$
BEGIN
    RAISE NOTICE 'Trigger actualizado exitosamente!';
    RAISE NOTICE '';
    RAISE NOTICE 'Cambios aplicados:';
    RAISE NOTICE '✓ El trigger ahora copia url_factura de compras a gastos';
    RAISE NOTICE '✓ Las facturas adjuntas en compras aparecerán en gastos pendientes';
    RAISE NOTICE '✓ Se agregó referencia compra_id para trazabilidad';
    RAISE NOTICE '';
    RAISE NOTICE 'Flujo completo:';
    RAISE NOTICE '1. Usuario sube factura en NewPurchase → guarda en compras.url_factura';
    RAISE NOTICE '2. Trigger se ejecuta automáticamente → copia a fin_gastos.url_factura';
    RAISE NOTICE '3. Factura aparece en el gasto pendiente automáticamente';
END $$;
