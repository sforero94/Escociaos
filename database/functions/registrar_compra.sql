-- ==================================================================
-- Función: registrar_compra
-- Descripción: Registra una compra de productos de manera atómica
--              con validaciones y actualización automática de inventario
-- ==================================================================
--
-- Esta función debe ejecutarse en Supabase SQL Editor
--
-- Uso desde TypeScript:
-- const { data, error } = await supabase.rpc('registrar_compra', {
--   p_fecha: '2025-11-11',
--   p_proveedor: 'Proveedor ABC',
--   p_numero_factura: 'F-001',
--   p_total: 500000,
--   p_items: [
--     {
--       producto_id: 1,
--       cantidad: 10.5,
--       precio_unitario: 1000,
--       lote_producto: 'L-2025-001',
--       fecha_vencimiento: '2026-11-11',
--       permitido_gerencia: true
--     }
--   ],
--   p_user_id: 'uuid-del-usuario'
-- });
-- ==================================================================

CREATE OR REPLACE FUNCTION registrar_compra(
  p_fecha DATE,
  p_proveedor TEXT,
  p_numero_factura TEXT,
  p_total NUMERIC,
  p_items JSONB,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_compra_id INTEGER;
  v_item JSONB;
  v_producto_id INTEGER;
  v_cantidad NUMERIC;
  v_precio_unitario NUMERIC;
  v_lote_producto TEXT;
  v_fecha_vencimiento DATE;
  v_permitido_gerencia BOOLEAN;
  v_cantidad_anterior NUMERIC;
  v_cantidad_nueva NUMERIC;
  v_subtotal NUMERIC;
  v_producto_nombre TEXT;
  v_items_procesados INTEGER := 0;
  v_resultado JSONB;
BEGIN
  -- ============================================
  -- VALIDACIONES PREVIAS
  -- ============================================

  -- Validar que el proveedor no esté vacío
  IF p_proveedor IS NULL OR TRIM(p_proveedor) = '' THEN
    RAISE EXCEPTION 'El proveedor es obligatorio';
  END IF;

  -- Validar que el número de factura no esté vacío
  IF p_numero_factura IS NULL OR TRIM(p_numero_factura) = '' THEN
    RAISE EXCEPTION 'El número de factura es obligatorio';
  END IF;

  -- Validar que haya al menos un item
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Debe incluir al menos un producto en la compra';
  END IF;

  -- Validar unicidad de factura (mismo proveedor y número)
  IF EXISTS (
    SELECT 1 FROM compras
    WHERE proveedor = p_proveedor
    AND numero_factura = p_numero_factura
  ) THEN
    RAISE EXCEPTION 'Ya existe una compra registrada con el número de factura % del proveedor %',
      p_numero_factura, p_proveedor;
  END IF;

  -- ============================================
  -- INICIAR TRANSACCIÓN (implícita en función)
  -- ============================================

  -- 1. Insertar registro de compra
  INSERT INTO compras (
    fecha,
    proveedor,
    numero_factura,
    total,
    estado,
    created_by,
    created_at
  ) VALUES (
    p_fecha,
    p_proveedor,
    p_numero_factura,
    p_total,
    'completada',
    p_user_id,
    NOW()
  ) RETURNING id INTO v_compra_id;

  -- 2. Procesar cada item de la compra
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- Extraer datos del item
    v_producto_id := (v_item->>'producto_id')::INTEGER;
    v_cantidad := (v_item->>'cantidad')::NUMERIC;
    v_precio_unitario := (v_item->>'precio_unitario')::NUMERIC;
    v_lote_producto := v_item->>'lote_producto';
    v_fecha_vencimiento := (v_item->>'fecha_vencimiento')::DATE;
    v_permitido_gerencia := (v_item->>'permitido_gerencia')::BOOLEAN;
    v_subtotal := v_cantidad * v_precio_unitario;

    -- Validar que el producto existe y está activo
    SELECT nombre INTO v_producto_nombre
    FROM productos
    WHERE id = v_producto_id AND activo = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'El producto con ID % no existe o no está activo', v_producto_id;
    END IF;

    -- Validar cantidad positiva
    IF v_cantidad <= 0 THEN
      RAISE EXCEPTION 'La cantidad para % debe ser mayor a 0', v_producto_nombre;
    END IF;

    -- Validar precio positivo
    IF v_precio_unitario <= 0 THEN
      RAISE EXCEPTION 'El precio unitario para % debe ser mayor a 0', v_producto_nombre;
    END IF;

    -- 2a. Insertar detalle de compra
    INSERT INTO detalles_compra (
      compra_id,
      producto_id,
      cantidad,
      precio_unitario,
      subtotal,
      lote_producto,
      fecha_vencimiento,
      permitido_gerencia,
      created_at
    ) VALUES (
      v_compra_id,
      v_producto_id,
      v_cantidad,
      v_precio_unitario,
      v_subtotal,
      v_lote_producto,
      v_fecha_vencimiento,
      v_permitido_gerencia,
      NOW()
    );

    -- 2b. Obtener cantidad actual del producto
    SELECT cantidad_actual INTO v_cantidad_anterior
    FROM productos
    WHERE id = v_producto_id;

    -- Calcular nueva cantidad
    v_cantidad_nueva := v_cantidad_anterior + v_cantidad;

    -- 2c. Actualizar cantidad en productos
    UPDATE productos
    SET cantidad_actual = v_cantidad_nueva,
        updated_at = NOW()
    WHERE id = v_producto_id;

    -- 2d. Registrar movimiento de inventario
    INSERT INTO movimientos_inventario (
      producto_id,
      tipo_movimiento,
      cantidad,
      cantidad_anterior,
      cantidad_nueva,
      referencia_id,
      tipo_referencia,
      notas,
      created_by,
      created_at
    ) VALUES (
      v_producto_id,
      'entrada',
      v_cantidad,
      v_cantidad_anterior,
      v_cantidad_nueva,
      v_compra_id,
      'compra',
      'Compra #' || p_numero_factura || ' - ' || p_proveedor,
      p_user_id,
      NOW()
    );

    -- Incrementar contador de items procesados
    v_items_procesados := v_items_procesados + 1;
  END LOOP;

  -- ============================================
  -- RESULTADO EXITOSO
  -- ============================================

  v_resultado := jsonb_build_object(
    'success', true,
    'compra_id', v_compra_id,
    'items_procesados', v_items_procesados,
    'numero_factura', p_numero_factura,
    'proveedor', p_proveedor,
    'total', p_total,
    'message', 'Compra registrada exitosamente'
  );

  RETURN v_resultado;

EXCEPTION
  WHEN OTHERS THEN
    -- En caso de error, la transacción se revierte automáticamente
    RAISE EXCEPTION 'Error al registrar compra: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==================================================================
-- PERMISOS
-- ==================================================================
-- Permitir ejecutar la función a usuarios autenticados
GRANT EXECUTE ON FUNCTION registrar_compra TO authenticated;

-- ==================================================================
-- COMENTARIOS
-- ==================================================================
COMMENT ON FUNCTION registrar_compra IS 'Registra una compra de productos de manera atómica con validaciones y actualización automática de inventario. Ejecuta todas las operaciones en una transacción, si algo falla se revierte todo.';
