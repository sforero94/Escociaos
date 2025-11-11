-- ==================================================================
-- Función: registrar_salida_inventario
-- Descripción: Registra una salida de inventario con validación
--              de stock insuficiente
-- ==================================================================
--
-- Esta función debe ejecutarse en Supabase SQL Editor
--
-- Uso desde TypeScript:
-- const { data, error } = await supabase.rpc('registrar_salida_inventario', {
--   p_producto_id: 1,
--   p_cantidad: 5.5,
--   p_tipo_referencia: 'aplicacion',
--   p_referencia_id: 123,
--   p_notas: 'Aplicación en lote 10',
--   p_user_id: 'uuid-del-usuario'
-- });
-- ==================================================================

CREATE OR REPLACE FUNCTION registrar_salida_inventario(
  p_producto_id INTEGER,
  p_cantidad NUMERIC,
  p_tipo_referencia TEXT DEFAULT 'manual',
  p_referencia_id INTEGER DEFAULT NULL,
  p_notas TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_cantidad_actual NUMERIC;
  v_cantidad_nueva NUMERIC;
  v_producto_nombre TEXT;
  v_unidad_medida TEXT;
  v_movimiento_id INTEGER;
  v_resultado JSONB;
BEGIN
  -- ============================================
  -- VALIDACIONES PREVIAS
  -- ============================================

  -- Validar que la cantidad sea positiva
  IF p_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor a 0';
  END IF;

  -- Obtener información del producto
  SELECT cantidad_actual, nombre, unidad_medida
  INTO v_cantidad_actual, v_producto_nombre, v_unidad_medida
  FROM productos
  WHERE id = p_producto_id AND activo = true;

  -- Validar que el producto existe
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El producto con ID % no existe o no está activo', p_producto_id;
  END IF;

  -- ============================================
  -- VALIDACIÓN CRÍTICA: STOCK INSUFICIENTE
  -- ============================================

  IF v_cantidad_actual < p_cantidad THEN
    RAISE EXCEPTION 'Stock insuficiente para %. Disponible: % %, Solicitado: % %',
      v_producto_nombre,
      v_cantidad_actual,
      v_unidad_medida,
      p_cantidad,
      v_unidad_medida;
  END IF;

  -- Calcular nueva cantidad
  v_cantidad_nueva := v_cantidad_actual - p_cantidad;

  -- ============================================
  -- EJECUTAR OPERACIONES
  -- ============================================

  -- 1. Actualizar cantidad en productos
  UPDATE productos
  SET cantidad_actual = v_cantidad_nueva,
      updated_at = NOW()
  WHERE id = p_producto_id;

  -- 2. Registrar movimiento de inventario
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
    p_producto_id,
    'salida',
    p_cantidad,
    v_cantidad_actual,
    v_cantidad_nueva,
    p_referencia_id,
    p_tipo_referencia,
    p_notas,
    p_user_id,
    NOW()
  ) RETURNING id INTO v_movimiento_id;

  -- ============================================
  -- RESULTADO EXITOSO
  -- ============================================

  v_resultado := jsonb_build_object(
    'success', true,
    'movimiento_id', v_movimiento_id,
    'producto_id', p_producto_id,
    'producto_nombre', v_producto_nombre,
    'cantidad_anterior', v_cantidad_actual,
    'cantidad_retirada', p_cantidad,
    'cantidad_nueva', v_cantidad_nueva,
    'unidad_medida', v_unidad_medida,
    'message', 'Salida registrada exitosamente'
  );

  RETURN v_resultado;

EXCEPTION
  WHEN OTHERS THEN
    -- En caso de error, la transacción se revierte automáticamente
    RAISE EXCEPTION 'Error al registrar salida: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==================================================================
-- PERMISOS
-- ==================================================================
GRANT EXECUTE ON FUNCTION registrar_salida_inventario TO authenticated;

-- ==================================================================
-- COMENTARIOS
-- ==================================================================
COMMENT ON FUNCTION registrar_salida_inventario IS 'Registra una salida de inventario validando que haya stock suficiente. Si no hay stock, lanza excepción con mensaje descriptivo.';
