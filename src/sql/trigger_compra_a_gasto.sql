-- Trigger para crear gastos pendientes automáticamente desde compras
-- Se ejecuta después de insertar una compra para crear un gasto pendiente

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_compra_a_gasto ON compras;

CREATE OR REPLACE FUNCTION crear_gasto_pendiente_de_compra()
RETURNS TRIGGER AS $$
DECLARE
    negocio_default_id UUID;
    region_default_id UUID;
    categoria_default_id UUID;
    concepto_default_id UUID;
BEGIN
    -- Obtener valores por defecto (primeros activos)
    SELECT id INTO negocio_default_id FROM fin_negocios WHERE activo = true ORDER BY nombre LIMIT 1;
    SELECT id INTO region_default_id FROM fin_regiones WHERE activo = true ORDER BY nombre LIMIT 1;
    SELECT id INTO categoria_default_id FROM fin_categorias_gastos WHERE activo = true ORDER BY nombre LIMIT 1;

    -- Obtener concepto por defecto de la categoría
    SELECT id INTO concepto_default_id
    FROM fin_conceptos_gastos
    WHERE categoria_id = categoria_default_id AND activo = true
    ORDER BY nombre LIMIT 1;

    -- Crear gasto pendiente
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
        created_at,
        updated_at
    )
    SELECT
        NEW.fecha_compra,
        COALESCE(negocio_default_id, fin_negocios.id),
        COALESCE(region_default_id, fin_regiones.id),
        COALESCE(categoria_default_id, fin_categorias_gastos.id),
        COALESCE(concepto_default_id, fin_conceptos_gastos.id),
        'Compra: ' || NEW.proveedor || ' - Factura: ' || NEW.numero_factura,
        NEW.proveedor_id, -- Copy proveedor_id from purchase
        NEW.costo_total,
        (SELECT id FROM fin_medios_pago WHERE activo = true ORDER BY nombre LIMIT 1), -- medio de pago por defecto
        'Gasto generado automáticamente desde compra. Requiere confirmación manual.',
        'Pendiente',
        NOW(),
        NOW()
    FROM fin_negocios, fin_regiones, fin_categorias_gastos, fin_conceptos_gastos
    WHERE fin_negocios.activo = true
      AND fin_regiones.activo = true
      AND fin_categorias_gastos.activo = true
      AND fin_conceptos_gastos.activo = true
    LIMIT 1;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear el trigger
CREATE TRIGGER trigger_compra_a_gasto
    AFTER INSERT ON compras
    FOR EACH ROW
    EXECUTE FUNCTION crear_gasto_pendiente_de_compra();

-- Comentarios para documentación
COMMENT ON FUNCTION crear_gasto_pendiente_de_compra() IS 'Crea automáticamente un gasto pendiente cuando se registra una compra';
COMMENT ON TRIGGER trigger_compra_a_gasto ON compras IS 'Trigger que genera gastos pendientes desde compras para integración financiera';