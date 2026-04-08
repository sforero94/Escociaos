-- Migration 038: Fix trigger_compra_a_gasto to use SECURITY DEFINER
-- Date: 2026-04-08
-- Bug: Administrador users get "No se encontraron catálogos activos necesarios
--      para crear el gasto" when registering a purchase.
-- Root cause: The trigger function runs as SECURITY INVOKER (default), so its
--   internal SELECTs on catalog tables and INSERT into fin_gastos are subject
--   to the caller's RLS context.  Production catalog table policies are
--   Gerencia-only (es_usuario_gerencia), blocking non-Gerencia users.
-- Fix: SECURITY DEFINER makes the function run as its owner (postgres),
--   bypassing RLS.  This is correct because auto-creating a pending expense
--   from a purchase is a system-level operation, not a user-level one.

-- Drop existing trigger
DROP TRIGGER IF EXISTS trigger_compra_a_gasto ON compras;

-- Recreate function with SECURITY DEFINER
CREATE OR REPLACE FUNCTION crear_gasto_pendiente_de_compra()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
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
        NEW.url_factura,
        NEW.id,
        NOW(),
        NOW()
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER trigger_compra_a_gasto
    AFTER INSERT ON compras
    FOR EACH ROW
    EXECUTE FUNCTION crear_gasto_pendiente_de_compra();

COMMENT ON FUNCTION crear_gasto_pendiente_de_compra() IS 'Crea automáticamente un gasto pendiente cuando se registra una compra. SECURITY DEFINER para bypass RLS (operación de sistema).';
COMMENT ON TRIGGER trigger_compra_a_gasto ON compras IS 'Trigger que genera gastos pendientes desde compras para integración financiera.';
