-- F1: guardados web de inventario atómicos y reintentables.
-- Aplicar ANTES del frontend. Sin backfill, cambios de políticas existentes,
-- triggers nuevos sobre tablas de dominio ni acceso a Storage.
-- INVOKER conserva las RLS actuales de productos/compras/movimientos.
-- La tabla de recibos es privada por usuario y solo admite roles de escritura.
BEGIN;

DO $pre$
BEGIN
  IF to_regclass('public.inventario_operaciones') IS NOT NULL OR
     to_regprocedure('public.fn_inventario_guardar(uuid,text,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION '185 abortada: los objetos nuevos ya existen; verificar el ledger antes de reintentar.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='get_user_role' AND p.prosecdef
        AND p.prosrc ~ 'activo\s*=\s*true') THEN
    RAISE EXCEPTION '185 abortada: get_user_role debe excluir cuentas inactivas.';
  END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('productos','compras','movimientos_inventario')
        AND c.relrowsecurity) <> 3 THEN
    RAISE EXCEPTION '185 abortada: las tres tablas deben conservar RLS.';
  END IF;
END $pre$;

CREATE TABLE public.inventario_operaciones (
  solicitud_id uuid PRIMARY KEY,
  usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operacion text NOT NULL CHECK (operacion IN ('movimiento', 'compra', 'eliminar_compra')),
  datos jsonb NOT NULL,
  resultado jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inventario_operaciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inventario_operaciones FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.inventario_operaciones TO authenticated;
CREATE POLICY inventario_operaciones_propias ON public.inventario_operaciones
  FOR ALL TO authenticated
  USING (usuario_id = (SELECT auth.uid()) AND
    (SELECT public.get_user_role()) IN ('Gerencia', 'Administrador'))
  WITH CHECK (usuario_id = (SELECT auth.uid()) AND
    (SELECT public.get_user_role()) IN ('Gerencia', 'Administrador'));

CREATE FUNCTION public.fn_inventario_guardar(
  p_solicitud_id uuid, p_operacion text, p_datos jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
DECLARE
  v_usuario uuid := auth.uid();
  v_recibo public.inventario_operaciones%ROWTYPE;
  v_producto public.productos%ROWTYPE;
  v_compra public.compras%ROWTYPE;
  v_item jsonb;
  v_producto_id uuid;
  v_compra_id uuid;
  v_movimiento_id uuid;
  v_ids jsonb := '[]'::jsonb;
  v_saldo numeric;
  v_nuevo numeric;
  v_cantidad numeric;
  v_costo numeric;
  v_precio numeric;
  v_tipo text;
  v_fecha date;
  v_email text := auth.jwt() ->> 'email';
  v_resultado jsonb;
BEGIN
  IF v_usuario IS NULL OR COALESCE(public.get_user_role()::text, '') NOT IN ('Gerencia', 'Administrador') THEN
    RAISE EXCEPTION 'Solo Gerencia o Administrador pueden guardar inventario.' USING ERRCODE = '42501';
  END IF;
  IF p_solicitud_id IS NULL OR p_operacion IS NULL OR
     p_operacion NOT IN ('movimiento', 'compra', 'eliminar_compra') OR
     p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object' THEN
    RAISE EXCEPTION 'Solicitud de inventario inválida.' USING ERRCODE = '22023';
  END IF;

  -- ON CONFLICT espera al primer intento concurrente. Si este falla, también
  -- se revierte su recibo; si confirma, devolvemos exactamente su resultado.
  INSERT INTO public.inventario_operaciones(solicitud_id, usuario_id, operacion, datos)
    VALUES (p_solicitud_id, v_usuario, p_operacion, p_datos)
    ON CONFLICT (solicitud_id) DO NOTHING;
  SELECT * INTO v_recibo FROM public.inventario_operaciones
    WHERE solicitud_id = p_solicitud_id FOR UPDATE;
  IF NOT FOUND OR v_recibo.usuario_id <> v_usuario THEN
    RAISE EXCEPTION 'Solicitud de inventario no disponible.' USING ERRCODE = '42501';
  END IF;
  IF v_recibo.operacion IS DISTINCT FROM p_operacion OR v_recibo.datos IS DISTINCT FROM p_datos THEN
    RAISE EXCEPTION 'No se puede reutilizar una solicitud para otros datos.' USING ERRCODE = '22023';
  END IF;
  IF v_recibo.resultado IS NOT NULL THEN RETURN v_recibo.resultado; END IF;
  v_fecha := (p_datos ->> 'fecha')::date;
  IF v_fecha IS NULL THEN
    RAISE EXCEPTION 'La fecha es obligatoria.' USING ERRCODE = '22023';
  END IF;

  IF p_operacion = 'compra' THEN
    IF jsonb_typeof(p_datos -> 'productos') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'La compra requiere productos.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(p_datos -> 'productos') = 0 THEN
      RAISE EXCEPTION 'La compra debe tener al menos un producto.' USING ERRCODE = '22023';
    END IF;
    -- Mismo orden entre compras de varios productos, incluso si sus líneas
    -- vienen invertidas. Cada línea relee el saldo ya bloqueado y actualizado.
    PERFORM id FROM public.productos WHERE id IN (
      SELECT (item ->> 'producto_id')::uuid
      FROM jsonb_array_elements(p_datos -> 'productos') item
    ) ORDER BY id FOR UPDATE;
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_datos -> 'productos') LOOP
      v_producto_id := (v_item ->> 'producto_id')::uuid;
      SELECT * INTO v_producto FROM public.productos WHERE id = v_producto_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Producto no disponible.'; END IF;
      v_cantidad := round((v_item ->> 'cantidad')::numeric, 2);
      v_costo := round((v_item ->> 'costo_total')::numeric, 2);
      v_precio := round((v_item ->> 'costo_unitario')::numeric, 2);
      IF v_cantidad IS NULL OR v_costo IS NULL OR v_precio IS NULL OR
         v_cantidad <= 0 OR v_costo <= 0 OR v_precio <= 0 OR
         v_cantidad::text IN ('NaN','Infinity','-Infinity') OR
         v_costo::text IN ('NaN','Infinity','-Infinity') OR
         v_precio::text IN ('NaN','Infinity','-Infinity') THEN
        RAISE EXCEPTION 'Cantidad y costos deben ser positivos y finitos.' USING ERRCODE = '22023';
      END IF;
      IF (v_item ->> 'unidad') IS DISTINCT FROM v_producto.unidad_medida::text THEN
        RAISE EXCEPTION 'La unidad de compra no coincide con la unidad del producto.' USING ERRCODE = '22023';
      END IF;
      -- Las columnas vivas son NUMERIC(12,2): normalizar antes de sumar
      -- evita diferencias entre redondear el movimiento y redondear el saldo.
      v_saldo := COALESCE(v_producto.cantidad_actual, 0);
      v_nuevo := v_saldo + v_cantidad;
      INSERT INTO public.compras (
        fecha_compra, proveedor, proveedor_id, numero_factura, producto_id,
        cantidad, unidad, numero_lote_producto, fecha_vencimiento,
        costo_unitario, costo_total, url_factura, usuario_registro
      ) VALUES (
        v_fecha, p_datos ->> 'proveedor', (p_datos ->> 'proveedor_id')::uuid,
        p_datos ->> 'numero_factura', v_producto_id, v_cantidad, v_producto.unidad_medida,
        NULLIF(v_item ->> 'numero_lote', ''), NULLIF(v_item ->> 'fecha_vencimiento', '')::date,
        v_precio, v_costo, NULLIF(p_datos ->> 'url_factura', ''), v_email
      ) RETURNING id INTO v_compra_id;
      UPDATE public.productos SET cantidad_actual = v_nuevo, precio_unitario = v_precio,
        activo = CASE WHEN v_nuevo > 0 THEN true ELSE activo END WHERE id = v_producto_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo actualizar el producto.' USING ERRCODE = '42501'; END IF;
      INSERT INTO public.movimientos_inventario (
        fecha_movimiento, producto_id, tipo_movimiento, cantidad, unidad, factura,
        saldo_anterior, saldo_nuevo, valor_movimiento, responsable, observaciones, provisional
      ) VALUES (
        v_fecha, v_producto_id, 'Entrada', v_cantidad, v_producto.unidad_medida,
        p_datos ->> 'numero_factura', v_saldo, v_nuevo, v_costo, v_email,
        v_item ->> 'observaciones', false
      );
      v_ids := v_ids || jsonb_build_array(v_compra_id);
    END LOOP;
    v_resultado := jsonb_build_object('compras', v_ids);
  ELSE
    IF p_operacion = 'eliminar_compra' THEN
      v_compra_id := (p_datos ->> 'compra_id')::uuid;
      SELECT producto_id INTO v_producto_id FROM public.compras WHERE id = v_compra_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'La compra ya no existe. Recarga el historial.'; END IF;
    ELSE
      v_producto_id := (p_datos ->> 'producto_id')::uuid;
    END IF;
    SELECT * INTO v_producto FROM public.productos WHERE id = v_producto_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Producto no disponible.'; END IF;
    v_saldo := COALESCE(v_producto.cantidad_actual, 0);

    IF p_operacion = 'eliminar_compra' THEN
      SELECT * INTO v_compra FROM public.compras WHERE id = v_compra_id FOR UPDATE;
      IF NOT FOUND OR v_compra.producto_id <> v_producto_id THEN
        RAISE EXCEPTION 'La compra cambió. Recarga el historial.';
      END IF;
      v_cantidad := v_compra.cantidad;
      v_nuevo := v_saldo - v_cantidad;
      IF v_nuevo < 0 THEN RAISE EXCEPTION 'No se puede eliminar la compra porque resultaría en inventario negativo'; END IF;
      SELECT costo_unitario INTO v_precio FROM public.compras
        WHERE producto_id = v_producto_id AND id <> v_compra_id
        ORDER BY fecha_compra DESC, created_at DESC, id DESC LIMIT 1;
      -- Conserva el convenio histórico de la compensación de una compra:
      -- cantidad positiva; la salida queda expresada por tipo y saldos.
      INSERT INTO public.movimientos_inventario (
        fecha_movimiento, producto_id, tipo_movimiento, cantidad, unidad,
        saldo_anterior, saldo_nuevo, valor_movimiento, responsable, observaciones, provisional
      ) VALUES (
        v_fecha, v_producto_id, 'Salida Otros', v_cantidad, v_producto.unidad_medida,
        v_saldo, v_nuevo, v_compra.costo_total, v_email,
        'Ajuste por eliminación de compra - Factura: ' || COALESCE(v_compra.numero_factura, 'N/A') ||
        ' - Proveedor: ' || COALESCE(v_compra.proveedor, '') || ' - Fecha original: ' || v_compra.fecha_compra, false
      );
      UPDATE public.productos SET cantidad_actual = v_nuevo, precio_unitario = v_precio WHERE id = v_producto_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo actualizar el producto.' USING ERRCODE = '42501'; END IF;
      PERFORM public.fn_cleanup_compra_dependencies(v_compra_id);
      DELETE FROM public.compras WHERE id = v_compra_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo eliminar la compra.' USING ERRCODE = '42501'; END IF;
      v_resultado := jsonb_build_object('compra_id', v_compra_id);
    ELSE
      v_tipo := p_datos ->> 'tipo_movimiento';
      v_cantidad := round((p_datos ->> 'cantidad')::numeric, 2);
      IF v_tipo IS NULL OR v_tipo NOT IN ('Entrada','Salida Otros','Ajuste') OR
         v_cantidad IS NULL OR v_cantidad < 0 OR v_cantidad::text IN ('NaN','Infinity','-Infinity') THEN
        RAISE EXCEPTION 'Tipo o cantidad de movimiento inválidos.' USING ERRCODE = '22023';
      END IF;
      IF v_tipo = 'Ajuste' THEN
        -- Un conteo absoluto no puede pisar un movimiento ocurrido desde que
        -- se eligió el producto: exige revisar de nuevo el saldo mostrado.
        IF (p_datos ->> 'saldo_esperado')::numeric IS DISTINCT FROM v_saldo THEN
          RAISE EXCEPTION 'El saldo cambió. Vuelve a seleccionar el producto antes de ajustar.' USING ERRCODE = '40001';
        END IF;
        v_nuevo := v_cantidad;
        v_cantidad := v_nuevo - v_saldo;
      ELSE
        IF v_tipo = 'Salida Otros' THEN v_cantidad := -v_cantidad; END IF;
        v_nuevo := v_saldo + v_cantidad;
      END IF;
      IF v_nuevo < 0 THEN RAISE EXCEPTION 'La cantidad no puede ser mayor al stock actual (%)', v_saldo; END IF;
      -- CASE usa etiquetas literales del enum existente; no requiere conocer
      -- su nombre desde el frontend ni permitir tipos nuevos.
      IF v_tipo = 'Entrada' THEN
        INSERT INTO public.movimientos_inventario (fecha_movimiento, producto_id, tipo_movimiento,
          cantidad, unidad, saldo_anterior, saldo_nuevo, responsable, observaciones, provisional)
        VALUES (v_fecha, v_producto_id, 'Entrada', v_cantidad, v_producto.unidad_medida,
          v_saldo, v_nuevo, v_email, NULLIF(p_datos ->> 'observaciones',''), false)
        RETURNING id INTO v_movimiento_id;
      ELSIF v_tipo = 'Salida Otros' THEN
        INSERT INTO public.movimientos_inventario (fecha_movimiento, producto_id, tipo_movimiento,
          cantidad, unidad, saldo_anterior, saldo_nuevo, responsable, observaciones, provisional)
        VALUES (v_fecha, v_producto_id, 'Salida Otros', v_cantidad, v_producto.unidad_medida,
          v_saldo, v_nuevo, v_email, NULLIF(p_datos ->> 'observaciones',''), false)
        RETURNING id INTO v_movimiento_id;
      ELSE
        INSERT INTO public.movimientos_inventario (fecha_movimiento, producto_id, tipo_movimiento,
          cantidad, unidad, saldo_anterior, saldo_nuevo, responsable, observaciones, provisional)
        VALUES (v_fecha, v_producto_id, 'Ajuste', v_cantidad, v_producto.unidad_medida,
          v_saldo, v_nuevo, v_email, NULLIF(p_datos ->> 'observaciones',''), false)
        RETURNING id INTO v_movimiento_id;
      END IF;
      UPDATE public.productos SET cantidad_actual = v_nuevo,
        activo = CASE WHEN v_nuevo > 0 THEN true ELSE activo END WHERE id = v_producto_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo actualizar el producto.' USING ERRCODE = '42501'; END IF;
      v_resultado := jsonb_build_object('movimiento_id', v_movimiento_id, 'saldo_nuevo', v_nuevo);
    END IF;
  END IF;
  UPDATE public.inventario_operaciones SET resultado = v_resultado WHERE solicitud_id = p_solicitud_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo confirmar la solicitud.' USING ERRCODE = '42501'; END IF;
  RETURN v_resultado;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_inventario_guardar(uuid,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_inventario_guardar(uuid,text,jsonb) TO authenticated;
DO $post$
DECLARE v_rpc oid := 'public.fn_inventario_guardar(uuid,text,jsonb)'::regprocedure;
BEGIN
  IF (SELECT prosecdef FROM pg_proc WHERE oid=v_rpc) OR
     has_function_privilege('anon',v_rpc,'EXECUTE') OR
     NOT has_function_privilege('authenticated',v_rpc,'EXECUTE') OR
     NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.inventario_operaciones'::regclass) OR
     has_table_privilege('anon','public.inventario_operaciones','SELECT,INSERT,UPDATE,DELETE') OR
     has_table_privilege('authenticated','public.inventario_operaciones','DELETE') THEN
    RAISE EXCEPTION '185 abortada: postcondición de permisos o RLS incumplida.';
  END IF;
END $post$;
COMMIT;
