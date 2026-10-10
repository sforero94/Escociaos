-- SI13 review candidate only; no numbered migration or automatic application.
-- Keeps caller signature and invoker RLS. Global stock writer cutover remains required.
BEGIN;
DO $$
DECLARE specification text[];
BEGIN
  FOREACH specification SLICE 1 IN ARRAY ARRAY[
    ['productos','cantidad_actual'],['productos','precio_unitario'],
    ['movimientos_inventario','cantidad'],['movimientos_inventario','saldo_anterior'],
    ['movimientos_inventario','saldo_nuevo'],['movimientos_inventario','valor_movimiento'],
    ['aplicaciones_cierre','valor_jornal']]
  LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute
      WHERE attrelid=('public.'||specification[1])::regclass AND attname=specification[2]
        AND pg_catalog.format_type(atttypid,atttypmod)='numeric(12,2)' AND NOT attisdropped) THEN
      RAISE EXCEPTION 'Closure precision prerequisite missing: %.%',specification[1],specification[2];
    END IF;
  END LOOP;
END $$;
CREATE SCHEMA application_closure;
REVOKE ALL ON SCHEMA application_closure FROM PUBLIC, anon, service_role;
GRANT USAGE ON SCHEMA application_closure TO authenticated;
CREATE FUNCTION application_closure.authorize() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE profile public.usuarios%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Human authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO profile FROM public.usuarios WHERE id=auth.uid() FOR SHARE;
  IF NOT FOUND OR profile.activo IS DISTINCT FROM true OR profile.rol IS NULL OR profile.rol::text NOT IN ('Administrador','Gerencia') THEN
    RAISE EXCEPTION 'Current active Administrador or Gerencia required' USING ERRCODE='42501';
  END IF;
  RETURN profile.email;
END $$;
REVOKE ALL ON FUNCTION application_closure.authorize() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION application_closure.authorize() TO authenticated;
CREATE OR REPLACE FUNCTION public.fn_cerrar_aplicacion(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_aplicacion_id            UUID    := NULLIF(payload ->> 'aplicacion_id', '')::UUID;
  v_fecha_cierre             DATE    := NULLIF(payload ->> 'fecha_cierre', '')::DATE;
  v_fecha_inicio_ejecucion   DATE    := NULLIF(payload ->> 'fecha_inicio_ejecucion', '')::DATE;
  v_fecha_fin_ejecucion      DATE    := NULLIF(payload ->> 'fecha_fin_ejecucion', '')::DATE;
  v_dias_aplicacion          INTEGER := (payload ->> 'dias_aplicacion')::INTEGER;
  v_jornales_utilizados      NUMERIC := (payload ->> 'jornales_utilizados')::NUMERIC;
  v_valor_jornal             NUMERIC := (payload ->> 'valor_jornal')::NUMERIC;
  v_observaciones_cierre     TEXT    := payload ->> 'observaciones_cierre';
  v_observaciones_generales  TEXT    := NULLIF(payload ->> 'observaciones_generales', '');
  v_costo_total_insumos      NUMERIC := (payload ->> 'costo_total_insumos')::NUMERIC;
  v_costo_total_mano_obra    NUMERIC := (payload ->> 'costo_total_mano_obra')::NUMERIC;
  v_costo_total              NUMERIC := (payload ->> 'costo_total')::NUMERIC;
  v_costo_por_arbol          NUMERIC := (payload ->> 'costo_por_arbol')::NUMERIC;
  v_lote_aplicacion          TEXT    := payload ->> 'lote_aplicacion';
  v_registros                JSONB   := COALESCE(payload -> 'registros_trabajo', '[]'::jsonb);
  v_insumos                  JSONB   := COALESCE(payload -> 'insumos_aplicados', '[]'::jsonb);
  v_email                    TEXT;

  v_actor uuid;
  v_row jsonb;
  v_expected jsonb;
  v_proofs jsonb := '[]';
  v_proof jsonb;
  v_field text;
  v_number numeric;
  v_count integer;
  v_movements_before integer;
  v_work_before integer;
  v_aplicacion   RECORD;
  v_producto     RECORD;
  v_reg          JSONB;
  v_insumo       JSONB;
  v_cierre_id    UUID;
  v_n_eliminados INTEGER := 0;
  v_n_insertados INTEGER := 0;
  v_n_actualizados INTEGER := 0;
  v_n_productos  INTEGER := 0;
  v_producto_id  UUID;
  v_cantidad     NUMERIC;
  v_saldo_anterior NUMERIC;
  v_saldo_nuevo    NUMERIC;
BEGIN
  v_email := application_closure.authorize();
  v_actor := auth.uid();
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Closure object required'; END IF;
  -- Costs remain caller-derived; reject exceptional/negative numeric values.
  FOREACH v_field IN ARRAY ARRAY['jornales_utilizados','valor_jornal','costo_total_insumos',
    'costo_total_mano_obra','costo_total','costo_por_arbol'] LOOP
    v_number := (payload->>v_field)::numeric;
    IF v_number IS NOT NULL AND (v_number::text IN ('NaN','Infinity','-Infinity') OR v_number<0) THEN
      RAISE EXCEPTION 'Invalid closure numeric field %',v_field;
    END IF;
  END LOOP;
  IF v_dias_aplicacion < 0 THEN RAISE EXCEPTION 'Negative application days'; END IF;
  IF v_aplicacion_id IS NULL THEN
    RAISE EXCEPTION 'fn_cerrar_aplicacion: aplicacion_id es requerido';
  END IF;
  IF v_fecha_cierre IS NULL THEN
    RAISE EXCEPTION 'fn_cerrar_aplicacion: fecha_cierre es requerida';
  END IF;
  IF jsonb_typeof(v_registros) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'fn_cerrar_aplicacion: registros_trabajo debe ser un arreglo';
  END IF;
  IF jsonb_typeof(v_insumos) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'fn_cerrar_aplicacion: insumos_aplicados debe ser un arreglo';
  END IF;

  SELECT * INTO v_aplicacion
  FROM aplicaciones
  WHERE id = v_aplicacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_cerrar_aplicacion: la aplicación % no existe', v_aplicacion_id;
  END IF;
  IF v_aplicacion.estado = 'Cerrada' THEN
    RAISE EXCEPTION 'fn_cerrar_aplicacion: la aplicación % ya está Cerrada -- no se puede cerrar dos veces', v_aplicacion_id;
  END IF;

  SELECT count(*) INTO v_movements_before FROM public.movimientos_inventario WHERE aplicacion_id=v_aplicacion_id;
  SELECT count(*) INTO v_work_before FROM public.registros_trabajo WHERE tarea_id=v_aplicacion.tarea_id;
  IF EXISTS(SELECT 1 FROM public.aplicaciones_cierre WHERE aplicacion_id=v_aplicacion_id) THEN
    RAISE EXCEPTION 'Application already has a closure child';
  END IF;
  IF v_aplicacion.tarea_id IS NOT NULL THEN
    PERFORM id FROM public.tareas WHERE id=v_aplicacion.tarea_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Linked task missing or inaccessible'; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_insumos) GROUP BY (value->>'producto_id')::uuid HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Duplicate canonical product';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_registros) WHERE nullif(value->>'id','') IS NOT NULL
    GROUP BY (value->>'id')::uuid HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate canonical work record'; END IF;
  -- Lock all products in the same order across applications before any business writes.
  PERFORM id FROM public.productos WHERE id IN (SELECT (value->>'producto_id')::uuid
    FROM jsonb_array_elements(v_insumos)) ORDER BY id FOR UPDATE;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count <> jsonb_array_length(v_insumos) THEN RAISE EXCEPTION 'Missing or inaccessible product'; END IF;
  -- Validate every submitted work record, including unchanged records.
  FOR v_reg IN SELECT value FROM jsonb_array_elements(v_registros) LOOP
    IF jsonb_typeof(v_reg) IS DISTINCT FROM 'object' OR v_aplicacion.tarea_id IS NULL
      OR nullif(v_reg->>'tarea_id','')::uuid IS DISTINCT FROM v_aplicacion.tarea_id THEN
      RAISE EXCEPTION 'Work record must belong to actual application task';
    END IF;
    IF NOT coalesce((v_reg->>'_isNew')::boolean,false) THEN
      PERFORM id FROM public.registros_trabajo WHERE id=(v_reg->>'id')::uuid
        AND tarea_id=v_aplicacion.tarea_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Existing work record missing or belongs to another task'; END IF;
    ELSIF nullif(v_reg->>'id','') IS NOT NULL THEN
      RAISE EXCEPTION 'New work record cannot claim an existing ID';
    END IF;
    FOREACH v_field IN ARRAY ARRAY['costo_jornal','valor_jornal_empleado'] LOOP
      v_number := (v_reg->>v_field)::numeric;
      IF v_number IS NOT NULL AND (v_number::text IN ('NaN','Infinity','-Infinity') OR v_number<0) THEN
        RAISE EXCEPTION 'Invalid work numeric field';
      END IF;
    END LOOP;
  END LOOP;

  FOR v_insumo IN SELECT * FROM jsonb_array_elements(v_insumos) LOOP
    v_producto_id := (v_insumo ->> 'producto_id')::UUID;
    IF jsonb_typeof(v_insumo->'cantidad') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Numeric quantity required'; END IF;
    v_cantidad := round((v_insumo ->> 'cantidad')::numeric,2);
    IF v_cantidad IS NULL OR v_cantidad::text IN ('NaN','Infinity','-Infinity') OR v_cantidad<=0
      OR v_cantidad>9999999999.99 THEN RAISE EXCEPTION 'Finite positive representable quantity required'; END IF;

    IF v_producto_id IS NULL THEN
      RAISE EXCEPTION 'fn_cerrar_aplicacion: hay un insumo del cierre sin producto_id';
    END IF;

    SELECT cantidad_actual INTO v_saldo_anterior
    FROM productos
    WHERE id = v_producto_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'fn_cerrar_aplicacion: el producto % no existe', v_producto_id;
    END IF;

    IF v_saldo_anterior IS NOT NULL AND (v_saldo_anterior::text IN ('NaN','Infinity','-Infinity') OR v_saldo_anterior<0) THEN
      RAISE EXCEPTION 'Invalid persisted stock';
    END IF;
    IF COALESCE(v_saldo_anterior, 0) - v_cantidad < 0 THEN
      RAISE EXCEPTION
        'fn_cerrar_aplicacion: el cierre dejaría el inventario de "%" en negativo (saldo actual %, se intenta descontar %)',
        v_insumo ->> 'producto_nombre', v_saldo_anterior, v_cantidad;
    END IF;
  END LOOP;

  FOR v_reg IN SELECT * FROM jsonb_array_elements(v_registros) LOOP
    IF COALESCE((v_reg ->> '_deleted')::boolean, false)
       AND (v_reg ->> 'id') IS NOT NULL THEN
      DELETE FROM registros_trabajo WHERE id = (v_reg ->> 'id')::UUID AND tarea_id=v_aplicacion.tarea_id
        RETURNING to_jsonb(registros_trabajo) INTO v_row;
      IF NOT FOUND OR EXISTS(SELECT 1 FROM registros_trabajo WHERE id=(v_reg->>'id')::uuid) THEN
        RAISE EXCEPTION 'Work deletion not confirmed'; END IF;
      v_proofs := v_proofs || jsonb_build_array(jsonb_build_object('table','registros_trabajo','id',v_reg->>'id','deleted',true));
      v_n_eliminados := v_n_eliminados + 1;
    END IF;
  END LOOP;

  FOR v_reg IN SELECT * FROM jsonb_array_elements(v_registros) LOOP
    IF COALESCE((v_reg ->> '_isNew')::boolean, false)
       AND NOT COALESCE((v_reg ->> '_deleted')::boolean, false) THEN
      INSERT INTO registros_trabajo (
        tarea_id, empleado_id, contratista_id, lote_id, fecha_trabajo,
        fraccion_jornal, costo_jornal, valor_jornal_empleado, observaciones
      ) VALUES (
        NULLIF(v_reg ->> 'tarea_id', '')::UUID,
        NULLIF(v_reg ->> 'empleado_id', '')::UUID,
        NULLIF(v_reg ->> 'contratista_id', '')::UUID,
        NULLIF(v_reg ->> 'lote_id', '')::UUID,
        (v_reg ->> 'fecha_trabajo')::DATE,
        (v_reg ->> 'fraccion_jornal')::fraccion_jornal,
        (v_reg ->> 'costo_jornal')::NUMERIC,
        (v_reg ->> 'valor_jornal_empleado')::NUMERIC,
        NULLIF(v_reg ->> 'observaciones', '')
      ) RETURNING to_jsonb(registros_trabajo) INTO v_row;
      v_expected := jsonb_build_object('tarea_id',v_aplicacion.tarea_id,
        'empleado_id',nullif(v_reg->>'empleado_id','')::uuid,'contratista_id',nullif(v_reg->>'contratista_id','')::uuid,
        'lote_id',nullif(v_reg->>'lote_id','')::uuid,'fecha_trabajo',(v_reg->>'fecha_trabajo')::date,
        'fraccion_jornal',v_reg->>'fraccion_jornal','observaciones',nullif(v_reg->>'observaciones',''), 'registrado_por',v_actor);
      IF NOT FOUND OR NOT (v_row @> v_expected) OR (v_reg->>'costo_jornal' IS NOT NULL AND
        (v_row->>'costo_jornal')::numeric IS DISTINCT FROM (v_reg->>'costo_jornal')::numeric)
        OR (v_reg->>'costo_jornal' IS NOT NULL AND (v_row->>'valor_jornal_empleado')::numeric
          IS DISTINCT FROM (v_reg->>'valor_jornal_empleado')::numeric) THEN
        RAISE EXCEPTION 'Work insertion not confirmed'; END IF;
      FOREACH v_field IN ARRAY ARRAY['costo_jornal','valor_jornal_empleado'] LOOP
        v_number := (v_row->>v_field)::numeric;
        IF v_number IS NOT NULL AND (v_number::text IN ('NaN','Infinity','-Infinity') OR v_number<0) THEN
          RAISE EXCEPTION 'Invalid persisted work amount'; END IF;
      END LOOP;
      v_proofs := v_proofs || jsonb_build_array(jsonb_build_object('table','registros_trabajo','id',v_row->>'id','expected',v_row-'updated_at'));
      v_n_insertados := v_n_insertados + 1;
    END IF;
  END LOOP;

  FOR v_reg IN SELECT * FROM jsonb_array_elements(v_registros) LOOP
    IF COALESCE((v_reg ->> '_modified')::boolean, false)
       AND (v_reg ->> 'id') IS NOT NULL
       AND NOT COALESCE((v_reg ->> '_isNew')::boolean, false)
       AND NOT COALESCE((v_reg ->> '_deleted')::boolean, false) THEN
      SELECT to_jsonb(registros_trabajo) INTO v_expected FROM registros_trabajo WHERE id=(v_reg->>'id')::uuid;
      v_expected := v_expected-ARRAY['updated_at','fraccion_jornal','costo_jornal'];
      IF v_reg->>'costo_jornal' IS NULL THEN v_expected:=v_expected-'valor_jornal_empleado'; END IF;
      UPDATE registros_trabajo
      SET fraccion_jornal = (v_reg ->> 'fraccion_jornal')::fraccion_jornal,
          costo_jornal = (v_reg ->> 'costo_jornal')::NUMERIC
      WHERE id = (v_reg ->> 'id')::UUID AND tarea_id=v_aplicacion.tarea_id
      RETURNING to_jsonb(registros_trabajo) INTO v_row;
      IF NOT FOUND OR NOT(v_row @> v_expected) OR (v_row->>'id')::uuid IS DISTINCT FROM (v_reg->>'id')::uuid
        OR (v_row->>'tarea_id')::uuid IS DISTINCT FROM v_aplicacion.tarea_id
        OR v_row->>'fraccion_jornal' IS DISTINCT FROM v_reg->>'fraccion_jornal'
        OR (v_reg->>'costo_jornal' IS NOT NULL AND (v_row->>'costo_jornal')::numeric IS DISTINCT FROM (v_reg->>'costo_jornal')::numeric) THEN
        RAISE EXCEPTION 'Work update not confirmed'; END IF;
      FOREACH v_field IN ARRAY ARRAY['costo_jornal','valor_jornal_empleado'] LOOP
        v_number := (v_row->>v_field)::numeric;
        IF v_number IS NOT NULL AND (v_number::text IN ('NaN','Infinity','-Infinity') OR v_number<0) THEN
          RAISE EXCEPTION 'Invalid persisted work amount'; END IF;
      END LOOP;
      v_proofs := v_proofs || jsonb_build_array(jsonb_build_object('table','registros_trabajo','id',v_row->>'id','expected',v_row-'updated_at'));
      v_n_actualizados := v_n_actualizados + 1;
    END IF;
  END LOOP;

  INSERT INTO aplicaciones_cierre (
    aplicacion_id, fecha_cierre, dias_aplicacion, valor_jornal,
    observaciones_generales, cerrado_por
  ) VALUES (
    v_aplicacion_id, v_fecha_cierre, v_dias_aplicacion, v_valor_jornal,
    v_observaciones_generales, v_email
  )
  RETURNING to_jsonb(aplicaciones_cierre) INTO v_row;
  v_expected := jsonb_build_object('aplicacion_id',v_aplicacion_id,'fecha_cierre',v_fecha_cierre,
    'dias_aplicacion',v_dias_aplicacion,'valor_jornal',round(v_valor_jornal,2),
    'observaciones_generales',v_observaciones_generales,'cerrado_por',v_email);
  IF NOT FOUND OR NOT (v_row @> v_expected) THEN RAISE EXCEPTION 'Closure child insertion not confirmed'; END IF;
  v_cierre_id := (v_row->>'id')::uuid;
  v_proofs := v_proofs || jsonb_build_array(jsonb_build_object('table','aplicaciones_cierre','id',v_cierre_id,'expected',v_row));

  UPDATE aplicaciones
  SET estado = 'Cerrada',
      fecha_cierre = v_fecha_cierre,
      fecha_inicio_ejecucion = v_fecha_inicio_ejecucion,
      fecha_fin_ejecucion = v_fecha_fin_ejecucion,
      jornales_utilizados = v_jornales_utilizados,
      valor_jornal = v_valor_jornal,
      observaciones_cierre = v_observaciones_cierre,
      costo_total_insumos = v_costo_total_insumos,
      costo_total_mano_obra = v_costo_total_mano_obra,
      costo_total = v_costo_total,
      costo_por_arbol = v_costo_por_arbol
  WHERE id = v_aplicacion_id RETURNING to_jsonb(aplicaciones) INTO v_row;
  v_expected := (to_jsonb(v_aplicacion)-ARRAY['updated_at','estado','fecha_cierre','fecha_inicio_ejecucion',
    'fecha_fin_ejecucion','jornales_utilizados','valor_jornal','observaciones_cierre','costo_total_insumos',
    'costo_total_mano_obra','costo_total','costo_por_arbol']) || jsonb_build_object('estado','Cerrada','fecha_inicio_ejecucion',v_fecha_inicio_ejecucion,
    'fecha_fin_ejecucion',v_fecha_fin_ejecucion,'jornales_utilizados',v_jornales_utilizados,
    'valor_jornal',v_valor_jornal,'observaciones_cierre',v_observaciones_cierre,'costo_total_insumos',v_costo_total_insumos,
    'costo_total_mano_obra',v_costo_total_mano_obra,'costo_total',v_costo_total,'costo_por_arbol',v_costo_por_arbol,
    'tarea_id',v_aplicacion.tarea_id);
  IF NOT FOUND OR NOT (v_row @> v_expected) OR (v_row->>'fecha_cierre')::timestamptz IS DISTINCT FROM v_fecha_cierre::timestamptz THEN
    RAISE EXCEPTION 'Application closure update not confirmed'; END IF;
  v_proofs := v_proofs || jsonb_build_array(jsonb_build_object('table','aplicaciones','id',v_aplicacion_id,'expected',v_row-'updated_at'));

  IF v_aplicacion.tarea_id IS NOT NULL THEN
    SELECT to_jsonb(tareas)-ARRAY['updated_at','estado','fecha_fin_real'] INTO v_expected FROM tareas WHERE id=v_aplicacion.tarea_id;
    UPDATE tareas
    SET estado = 'Completada', fecha_fin_real = v_fecha_fin_ejecucion
    WHERE id = v_aplicacion.tarea_id RETURNING to_jsonb(tareas) INTO v_row;
    IF NOT FOUND OR NOT(v_row @> v_expected) OR v_row->>'estado' IS DISTINCT FROM 'Completada'
      OR (v_row->>'fecha_fin_real')::date IS DISTINCT FROM v_fecha_fin_ejecucion THEN RAISE EXCEPTION 'Task completion not confirmed'; END IF;
    v_proofs := v_proofs || jsonb_build_array(jsonb_build_object('table','tareas','id',v_aplicacion.tarea_id,'expected',v_row-'updated_at'));
  END IF;

  FOR v_insumo IN SELECT * FROM jsonb_array_elements(v_insumos) LOOP
    v_producto_id := (v_insumo ->> 'producto_id')::UUID;
    IF jsonb_typeof(v_insumo->'cantidad') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Numeric quantity required'; END IF;
    v_cantidad := round((v_insumo ->> 'cantidad')::numeric,2);
    IF v_cantidad IS NULL OR v_cantidad::text IN ('NaN','Infinity','-Infinity') OR v_cantidad<=0
      OR v_cantidad>9999999999.99 THEN RAISE EXCEPTION 'Finite positive representable quantity required'; END IF;

    SELECT * INTO v_producto
    FROM productos
    WHERE id = v_producto_id
    FOR UPDATE;

    IF v_producto.precio_unitario IS NOT NULL AND (v_producto.precio_unitario::text IN ('NaN','Infinity','-Infinity') OR v_producto.precio_unitario<0) THEN
      RAISE EXCEPTION 'Invalid persisted price'; END IF;
    v_saldo_anterior := COALESCE(v_producto.cantidad_actual, 0);
    v_saldo_nuevo := v_saldo_anterior - v_cantidad;

    UPDATE productos
    SET cantidad_actual = v_saldo_nuevo
    WHERE id = v_producto_id RETURNING to_jsonb(productos) INTO v_row;
    IF NOT FOUND OR NOT(v_row @> (to_jsonb(v_producto)-ARRAY['cantidad_actual','updated_at','updated_by']))
      OR (v_row->>'cantidad_actual')::numeric IS DISTINCT FROM v_saldo_nuevo THEN RAISE EXCEPTION 'Stock update not confirmed'; END IF;
    v_proofs := v_proofs || jsonb_build_array(jsonb_build_object('table','productos','id',v_producto_id,'expected',v_row-'updated_at'));

    INSERT INTO movimientos_inventario (
      fecha_movimiento, producto_id, tipo_movimiento, cantidad, unidad,
      lote_aplicacion, aplicacion_id, saldo_anterior, saldo_nuevo,
      valor_movimiento, responsable, observaciones, provisional
    ) VALUES (
      v_fecha_fin_ejecucion, v_producto_id, 'Salida por Aplicación', v_cantidad,
      v_producto.unidad_medida, v_lote_aplicacion, v_aplicacion_id,
      v_saldo_anterior, v_saldo_nuevo,
      v_cantidad * COALESCE(v_producto.precio_unitario, 0), v_email,
      'Cierre de aplicación: ' || COALESCE(v_lote_aplicacion, ''), false
    ) RETURNING to_jsonb(movimientos_inventario) INTO v_row;
    v_expected := jsonb_build_object('fecha_movimiento',v_fecha_fin_ejecucion,'producto_id',v_producto_id,
      'tipo_movimiento','Salida por Aplicación','cantidad',v_cantidad,'unidad',v_producto.unidad_medida,
      'lote_aplicacion',v_lote_aplicacion,'aplicacion_id',v_aplicacion_id,'saldo_anterior',v_saldo_anterior,
      'saldo_nuevo',v_saldo_nuevo,'valor_movimiento',round(v_cantidad*coalesce(v_producto.precio_unitario,0),2),
      'responsable',v_email,'observaciones','Cierre de aplicación: '||coalesce(v_lote_aplicacion,''),'provisional',false);
    IF NOT FOUND OR NOT (v_row @> v_expected) THEN RAISE EXCEPTION 'Inventory movement not confirmed'; END IF;
    v_proofs := v_proofs || jsonb_build_array(jsonb_build_object('table','movimientos_inventario','id',v_row->>'id','expected',v_row));

    v_n_productos := v_n_productos + 1;
  END LOOP;

  -- Recheck persisted results after ALL triggers/writes, including cross-table effects.
  FOR v_proof IN SELECT value FROM jsonb_array_elements(v_proofs) LOOP
    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1',v_proof->>'table')
      INTO v_row USING (v_proof->>'id')::uuid;
    IF coalesce((v_proof->>'deleted')::boolean,false) THEN
      IF v_row IS NOT NULL THEN RAISE EXCEPTION 'Deleted work record reappeared'; END IF;
    ELSIF v_row IS NULL OR NOT(v_row @> (v_proof->'expected')) THEN RAISE EXCEPTION 'Persisted closure result changed'; END IF;
  END LOOP;
  SELECT count(*) INTO v_count FROM public.aplicaciones_cierre WHERE aplicacion_id=v_aplicacion_id;
  IF v_count<>1 THEN RAISE EXCEPTION 'Closure child coherence failure'; END IF;
  SELECT count(*) INTO v_count FROM public.movimientos_inventario WHERE aplicacion_id=v_aplicacion_id;
  IF v_count<>v_movements_before+v_n_productos THEN RAISE EXCEPTION 'Unexpected application inventory posting'; END IF;
  SELECT count(*) INTO v_count FROM public.registros_trabajo WHERE tarea_id=v_aplicacion.tarea_id;
  IF v_count<>v_work_before-v_n_eliminados+v_n_insertados THEN RAISE EXCEPTION 'Unexpected task work posting'; END IF;
  RETURN jsonb_build_object(
    'aplicacionId', v_aplicacion_id,
    'cierreId', v_cierre_id,
    'registrosEliminados', v_n_eliminados,
    'registrosInsertados', v_n_insertados,
    'registrosActualizados', v_n_actualizados,
    'productosActualizados', v_n_productos
  );
END;
$function$
;
REVOKE ALL ON FUNCTION public.fn_cerrar_aplicacion(jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fn_cerrar_aplicacion(jsonb) TO authenticated;
COMMIT;
