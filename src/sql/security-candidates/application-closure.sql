-- SI13 review candidate only; no numbered migration or automatic application.
-- The legacy invoker body is private after installation. Public CAS/receipt entry
-- points use a whole SECURITY DEFINER boundary with explicit captured-policy
-- equivalence and fresh active Administrador/Gerencia admission, not invoker RLS.
-- Global stock writer cutover remains required.
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

-- Explicit privileged protocol boundary.
-- Retire ownerless overloads: no current-session fallback is permitted.
DROP FUNCTION IF EXISTS public.fn_application_closure_snapshot(uuid);
DROP FUNCTION IF EXISTS public.fn_application_close(uuid,jsonb,jsonb);
DROP FUNCTION IF EXISTS public.fn_application_closure_status(uuid,jsonb,jsonb);
-- Retire the unversioned ordinary RPC.
CREATE TABLE application_closure.requests(
 actor uuid NOT NULL, request_key uuid NOT NULL, application_id uuid NOT NULL,
 payload jsonb NOT NULL, expected jsonb NOT NULL,
 state text NOT NULL CHECK(state IN ('started','committed','cancelled')),
 receipt jsonb, actual jsonb, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(actor,request_key)
);
ALTER TABLE application_closure.requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON application_closure.requests FROM PUBLIC,anon,authenticated,service_role;
-- This prospective proof intentionally has no cascading FK to deletable domain rows.
-- Retention and global deletion containment are coordinated-release requirements.
CREATE FUNCTION application_closure.assert_boundary() RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE policies jsonb; table_name text; role_helper record;
BEGIN
  SELECT p.prosecdef,p.proconfig,p.prosrc,p.proowner INTO role_helper FROM pg_proc p
  WHERE p.oid=to_regprocedure('public.get_user_role()');
  IF NOT FOUND OR NOT role_helper.prosecdef
    OR NOT ('search_path=public, pg_temp'=ANY(coalesce(role_helper.proconfig,ARRAY[]::text[])))
    OR lower(btrim(regexp_replace(role_helper.prosrc,'\s+',' ','g')))
       <> 'select rol from usuarios where id = auth.uid() and activo = true' THEN
    RAISE EXCEPTION 'Closure active-role policy helper drift';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('tablename',p.tablename,'policyname',p.policyname,
    'cmd',p.cmd,'permissive',p.permissive,'qual',p.qual,'with_check',p.with_check,'roles',p.roles)
    ORDER BY p.tablename COLLATE "C",p.policyname COLLATE "C"),'[]') INTO policies FROM pg_catalog.pg_policies p
    WHERE p.schemaname='public' AND p.tablename=ANY(ARRAY['aplicaciones','aplicaciones_calculos','aplicaciones_cierre','aplicaciones_lotes','aplicaciones_mezclas','aplicaciones_productos','contratistas','empleados','lotes','movimientos_diarios','movimientos_diarios_productos','movimientos_inventario','productos','registros_trabajo','tareas']);
  -- The only additionally accepted policy is the exact reviewed AND-only
  -- productos policy from active-account-rls.sql. No extra permission is allowed.
  SELECT coalesce(jsonb_agg(value ORDER BY (value->>'tablename') COLLATE "C",(value->>'policyname') COLLATE "C"),'[]') INTO policies
  FROM jsonb_array_elements(policies) WHERE value IS DISTINCT FROM
    '{"tablename":"productos","policyname":"active_account_required","cmd":"ALL","permissive":"RESTRICTIVE","roles":["authenticated"],"qual":"(( SELECT get_user_role() AS get_user_role) IS NOT NULL)","with_check":"(( SELECT get_user_role() AS get_user_role) IS NOT NULL)"}'::jsonb;
  IF policies IS DISTINCT FROM '[{"tablename": "aplicaciones", "policyname": "Administrador puede todo en aplicaciones", "cmd": "ALL", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Administrador''::rol_usuario)", "with_check": null, "roles": ["public"]}, {"tablename": "aplicaciones", "policyname": "Gerencia acceso total", "cmd": "ALL", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Gerencia''::rol_usuario)", "with_check": null, "roles": ["public"]}, {"tablename": "aplicaciones_calculos", "policyname": "authenticated_delete_aplicaciones_calculos", "cmd": "DELETE", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "with_check": null, "roles": ["authenticated"]}, {"tablename": "aplicaciones_calculos", "policyname": "authenticated_insert_aplicaciones_calculos", "cmd": "INSERT", "permissive": "PERMISSIVE", "qual": null, "with_check": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "roles": ["authenticated"]}, {"tablename": "aplicaciones_calculos", "policyname": "authenticated_select_aplicaciones_calculos", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "true", "with_check": null, "roles": ["authenticated"]}, {"tablename": "aplicaciones_cierre", "policyname": "Administrador puede todo en cierre", "cmd": "ALL", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Administrador''::rol_usuario)", "with_check": null, "roles": ["public"]}, {"tablename": "aplicaciones_cierre", "policyname": "Gerencia acceso total", "cmd": "ALL", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Gerencia''::rol_usuario)", "with_check": null, "roles": ["public"]}, {"tablename": "aplicaciones_lotes", "policyname": "authenticated_delete_aplicaciones_lotes", "cmd": "DELETE", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "with_check": null, "roles": ["authenticated"]}, {"tablename": "aplicaciones_lotes", "policyname": "authenticated_insert_aplicaciones_lotes", "cmd": "INSERT", "permissive": "PERMISSIVE", "qual": null, "with_check": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "roles": ["authenticated"]}, {"tablename": "aplicaciones_lotes", "policyname": "authenticated_select_aplicaciones_lotes", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "true", "with_check": null, "roles": ["authenticated"]}, {"tablename": "aplicaciones_mezclas", "policyname": "Administrador puede todo en mezclas", "cmd": "ALL", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Administrador''::rol_usuario)", "with_check": null, "roles": ["public"]}, {"tablename": "aplicaciones_mezclas", "policyname": "Gerencia acceso total", "cmd": "ALL", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Gerencia''::rol_usuario)", "with_check": null, "roles": ["public"]}, {"tablename": "aplicaciones_productos", "policyname": "authenticated_delete_aplicaciones_productos", "cmd": "DELETE", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "with_check": null, "roles": ["authenticated"]}, {"tablename": "aplicaciones_productos", "policyname": "authenticated_insert_aplicaciones_productos", "cmd": "INSERT", "permissive": "PERMISSIVE", "qual": null, "with_check": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "roles": ["authenticated"]}, {"tablename": "aplicaciones_productos", "policyname": "authenticated_select_aplicaciones_productos", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "true", "with_check": null, "roles": ["authenticated"]}, {"tablename": "contratistas", "policyname": "authenticated_delete_contratistas", "cmd": "DELETE", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "with_check": null, "roles": ["authenticated"]}, {"tablename": "contratistas", "policyname": "authenticated_insert_contratistas", "cmd": "INSERT", "permissive": "PERMISSIVE", "qual": null, "with_check": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "roles": ["authenticated"]}, {"tablename": "contratistas", "policyname": "authenticated_select_contratistas", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "with_check": null, "roles": ["authenticated"]}, {"tablename": "contratistas", "policyname": "authenticated_update_contratistas", "cmd": "UPDATE", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "with_check": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "roles": ["authenticated"]}, {"tablename": "empleados", "policyname": "Administrador insert access on empleados", "cmd": "INSERT", "permissive": "PERMISSIVE", "qual": null, "with_check": "(EXISTS ( SELECT 1\n   FROM usuarios\n  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ANY (ARRAY[''Administrador''::rol_usuario, ''Gerencia''::rol_usuario])) AND (usuarios.activo = true))))", "roles": ["authenticated"]}, {"tablename": "empleados", "policyname": "Administrador read access on empleados", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "(EXISTS ( SELECT 1\n   FROM usuarios\n  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ANY (ARRAY[''Administrador''::rol_usuario, ''Gerencia''::rol_usuario])) AND (usuarios.activo = true))))", "with_check": null, "roles": ["authenticated"]}, {"tablename": "empleados", "policyname": "Gerencia full access on empleados", "cmd": "ALL", "permissive": "PERMISSIVE", "qual": "(EXISTS ( SELECT 1\n   FROM usuarios\n  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ''Gerencia''::rol_usuario) AND (usuarios.activo = true))))", "with_check": "(EXISTS ( SELECT 1\n   FROM usuarios\n  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ''Gerencia''::rol_usuario) AND (usuarios.activo = true))))", "roles": ["authenticated"]}, {"tablename": "empleados", "policyname": "Verificador read active empleados", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "((estado = ''Activo''::estado_empleado) AND (EXISTS ( SELECT 1\n   FROM usuarios\n  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ANY (ARRAY[''Verificador''::rol_usuario, ''Administrador''::rol_usuario, ''Gerencia''::rol_usuario])) AND (usuarios.activo = true)))))", "with_check": null, "roles": ["authenticated"]}, {"tablename": "lotes", "policyname": "Administrador lee lotes", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Administrador''::rol_usuario)", "with_check": null, "roles": ["public"]}, {"tablename": "lotes", "policyname": "Gerencia acceso total", "cmd": "ALL", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Gerencia''::rol_usuario)", "with_check": null, "roles": ["public"]}, {"tablename": "lotes", "policyname": "Usuarios autenticados pueden actualizar lotes", "cmd": "UPDATE", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "with_check": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "roles": ["authenticated"]}, {"tablename": "lotes", "policyname": "Usuarios autenticados pueden eliminar lotes", "cmd": "DELETE", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "with_check": null, "roles": ["authenticated"]}, {"tablename": "lotes", "policyname": "Usuarios autenticados pueden insertar lotes", "cmd": "INSERT", "permissive": "PERMISSIVE", "qual": null, "with_check": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "roles": ["authenticated"]}, {"tablename": "lotes", "policyname": "Usuarios autenticados pueden leer lotes", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "true", "with_check": null, "roles": ["authenticated"]}, {"tablename": "movimientos_diarios", "policyname": "Usuarios autenticados pueden crear movimientos diarios", "cmd": "INSERT", "permissive": "PERMISSIVE", "qual": null, "with_check": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "roles": ["authenticated"]}, {"tablename": "movimientos_diarios", "policyname": "Usuarios autenticados pueden leer movimientos diarios", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "true", "with_check": null, "roles": ["authenticated"]}, {"tablename": "movimientos_diarios", "policyname": "Usuarios pueden actualizar sus propios movimientos", "cmd": "UPDATE", "permissive": "PERMISSIVE", "qual": "(created_by = ( SELECT auth.uid() AS uid))", "with_check": null, "roles": ["authenticated"]}, {"tablename": "movimientos_diarios", "policyname": "Usuarios pueden eliminar sus propios movimientos", "cmd": "DELETE", "permissive": "PERMISSIVE", "qual": "(created_by = ( SELECT auth.uid() AS uid))", "with_check": null, "roles": ["authenticated"]}, {"tablename": "movimientos_diarios_productos", "policyname": "authenticated_delete_movimientos_diarios_productos", "cmd": "DELETE", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "with_check": null, "roles": ["authenticated"]}, {"tablename": "movimientos_diarios_productos", "policyname": "authenticated_insert_movimientos_diarios_productos", "cmd": "INSERT", "permissive": "PERMISSIVE", "qual": null, "with_check": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "roles": ["authenticated"]}, {"tablename": "movimientos_diarios_productos", "policyname": "authenticated_select_movimientos_diarios_productos", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "true", "with_check": null, "roles": ["authenticated"]}, {"tablename": "movimientos_inventario", "policyname": "Administrador puede todo en movimientos", "cmd": "ALL", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Administrador''::rol_usuario)", "with_check": null, "roles": ["public"]}, {"tablename": "movimientos_inventario", "policyname": "Gerencia acceso total", "cmd": "ALL", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Gerencia''::rol_usuario)", "with_check": null, "roles": ["public"]}, {"tablename": "movimientos_inventario", "policyname": "Verificador lee movimientos", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Verificador''::rol_usuario)", "with_check": null, "roles": ["public"]}, {"tablename": "productos", "policyname": "Administrador actualiza productos", "cmd": "UPDATE", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Administrador''::rol_usuario)", "with_check": null, "roles": ["public"]}, {"tablename": "productos", "policyname": "Administrador escritura productos", "cmd": "INSERT", "permissive": "PERMISSIVE", "qual": null, "with_check": "(( SELECT get_user_role() AS get_user_role) = ''Administrador''::rol_usuario)", "roles": ["public"]}, {"tablename": "productos", "policyname": "Administrador lectura productos", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Administrador''::rol_usuario)", "with_check": null, "roles": ["public"]}, {"tablename": "productos", "policyname": "Gerencia acceso total", "cmd": "ALL", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Gerencia''::rol_usuario)", "with_check": null, "roles": ["public"]}, {"tablename": "productos", "policyname": "Permitir lectura de precios a usuarios autenticados", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "true", "with_check": null, "roles": ["authenticated"]}, {"tablename": "productos", "policyname": "Usuarios autenticados leen productos", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "true", "with_check": null, "roles": ["authenticated"]}, {"tablename": "productos", "policyname": "Verificador lee productos", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Verificador''::rol_usuario)", "with_check": null, "roles": ["public"]}, {"tablename": "registros_trabajo", "policyname": "Administrador access registros_trabajo", "cmd": "ALL", "permissive": "PERMISSIVE", "qual": "(EXISTS ( SELECT 1\n   FROM usuarios\n  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ANY (ARRAY[''Administrador''::rol_usuario, ''Gerencia''::rol_usuario])) AND (usuarios.activo = true))))", "with_check": null, "roles": ["authenticated"]}, {"tablename": "registros_trabajo", "policyname": "Gerencia full access on registros_trabajo", "cmd": "ALL", "permissive": "PERMISSIVE", "qual": "(EXISTS ( SELECT 1\n   FROM usuarios\n  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ''Gerencia''::rol_usuario) AND (usuarios.activo = true))))", "with_check": null, "roles": ["authenticated"]}, {"tablename": "registros_trabajo", "policyname": "Verificador read registros_trabajo", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "(EXISTS ( SELECT 1\n   FROM usuarios\n  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ''Verificador''::rol_usuario) AND (usuarios.activo = true))))", "with_check": null, "roles": ["authenticated"]}, {"tablename": "registros_trabajo", "policyname": "authenticated_insert_registros_trabajo", "cmd": "INSERT", "permissive": "PERMISSIVE", "qual": null, "with_check": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "roles": ["authenticated"]}, {"tablename": "registros_trabajo", "policyname": "authenticated_select_registros_trabajo", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "true", "with_check": null, "roles": ["authenticated"]}, {"tablename": "registros_trabajo", "policyname": "authenticated_update_registros_trabajo", "cmd": "UPDATE", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "with_check": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "roles": ["authenticated"]}, {"tablename": "tareas", "policyname": "Administrador delete own tareas", "cmd": "DELETE", "permissive": "PERMISSIVE", "qual": "((EXISTS ( SELECT 1\n   FROM usuarios\n  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ''Administrador''::rol_usuario) AND (usuarios.activo = true)))) AND ((created_by = ( SELECT auth.uid() AS uid)) OR (created_by IS NULL)))", "with_check": null, "roles": ["authenticated"]}, {"tablename": "tareas", "policyname": "Administrador insert tareas", "cmd": "INSERT", "permissive": "PERMISSIVE", "qual": null, "with_check": "(EXISTS ( SELECT 1\n   FROM usuarios\n  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ANY (ARRAY[''Administrador''::rol_usuario, ''Gerencia''::rol_usuario])) AND (usuarios.activo = true))))", "roles": ["authenticated"]}, {"tablename": "tareas", "policyname": "Administrador read tareas", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "(EXISTS ( SELECT 1\n   FROM usuarios\n  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ANY (ARRAY[''Administrador''::rol_usuario, ''Gerencia''::rol_usuario])) AND (usuarios.activo = true))))", "with_check": null, "roles": ["authenticated"]}, {"tablename": "tareas", "policyname": "Administrador update tareas", "cmd": "UPDATE", "permissive": "PERMISSIVE", "qual": "(EXISTS ( SELECT 1\n   FROM usuarios\n  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ANY (ARRAY[''Administrador''::rol_usuario, ''Gerencia''::rol_usuario])) AND (usuarios.activo = true))))", "with_check": null, "roles": ["authenticated"]}, {"tablename": "tareas", "policyname": "Gerencia full access on tareas", "cmd": "ALL", "permissive": "PERMISSIVE", "qual": "(EXISTS ( SELECT 1\n   FROM usuarios\n  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ''Gerencia''::rol_usuario) AND (usuarios.activo = true))))", "with_check": null, "roles": ["authenticated"]}, {"tablename": "tareas", "policyname": "Verificador read tareas", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "(EXISTS ( SELECT 1\n   FROM usuarios\n  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ''Verificador''::rol_usuario) AND (usuarios.activo = true))))", "with_check": null, "roles": ["authenticated"]}]'::jsonb THEN RAISE EXCEPTION 'Closure policy boundary drift; coordinated review required'; END IF;
  FOREACH table_name IN ARRAY ARRAY['aplicaciones','aplicaciones_calculos','aplicaciones_cierre','aplicaciones_lotes','aplicaciones_mezclas','aplicaciones_productos','contratistas','empleados','lotes','movimientos_diarios','movimientos_diarios_productos','movimientos_inventario','productos','registros_trabajo','tareas'] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c WHERE c.oid=('public.'||table_name)::regclass
      AND c.relrowsecurity AND NOT c.relforcerowsecurity)
      OR NOT has_table_privilege('authenticated','public.'||table_name,'SELECT')
      OR NOT has_table_privilege('authenticated','public.'||table_name,'INSERT')
      OR NOT has_table_privilege('authenticated','public.'||table_name,'UPDATE')
      OR NOT has_table_privilege('authenticated','public.'||table_name,'DELETE') THEN
      RAISE EXCEPTION 'Closure grant or RLS prerequisite drift: %',table_name;
    END IF;
  END LOOP;
END $$;
SELECT application_closure.assert_boundary();
CREATE FUNCTION application_closure.snapshot(application_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object(
 'aplicacion',(SELECT to_jsonb(a) FROM public.aplicaciones a WHERE a.id=application_id),
 'tarea',(SELECT to_jsonb(t) FROM public.tareas t JOIN public.aplicaciones a ON a.tarea_id=t.id WHERE a.id=application_id),
 'registros_trabajo',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]') FROM public.registros_trabajo r JOIN public.aplicaciones a ON a.tarea_id=r.tarea_id WHERE a.id=application_id),
 'aplicaciones_cierre',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.id),'[]') FROM public.aplicaciones_cierre c WHERE c.aplicacion_id=application_id),
 'movimientos_inventario',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.id),'[]') FROM public.movimientos_inventario m WHERE m.aplicacion_id=application_id),
 'movimientos_diarios',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.id),'[]') FROM public.movimientos_diarios m WHERE m.aplicacion_id=application_id),
 'movimientos_diarios_productos',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]') FROM public.movimientos_diarios_productos p JOIN public.movimientos_diarios m ON m.id=p.movimiento_diario_id WHERE m.aplicacion_id=application_id),
 'productos',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]') FROM public.productos p WHERE p.id IN(SELECT mp.producto_id FROM public.movimientos_diarios_productos mp JOIN public.movimientos_diarios m ON m.id=mp.movimiento_diario_id WHERE m.aplicacion_id=application_id)),
 'aplicaciones_lotes',(SELECT coalesce(jsonb_agg(to_jsonb(al) ORDER BY al.id),'[]') FROM public.aplicaciones_lotes al WHERE al.aplicacion_id=application_id),
 'lotes',(SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.id),'[]') FROM public.lotes l WHERE l.id IN(SELECT al.lote_id FROM public.aplicaciones_lotes al WHERE al.aplicacion_id=application_id)),
 'empleados',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.id),'[]') FROM public.empleados e),
 'contratistas',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.id),'[]') FROM public.contratistas c),
 'aplicaciones_calculos',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.id),'[]') FROM public.aplicaciones_calculos c WHERE c.aplicacion_id=application_id),
 'aplicaciones_mezclas',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.id),'[]') FROM public.aplicaciones_mezclas m WHERE m.aplicacion_id=application_id),
 'aplicaciones_productos',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]') FROM public.aplicaciones_productos p JOIN public.aplicaciones_mezclas m ON m.id=p.mezcla_id WHERE m.aplicacion_id=application_id)
 )
$$;
CREATE FUNCTION public.fn_application_closure_snapshot(p_aplicacion_id uuid,p_expected_owner uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE original jsonb;
BEGIN
 PERFORM application_closure.authorize();
 IF p_expected_owner IS NULL OR p_expected_owner IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'Operation owner mismatch' USING ERRCODE='42501';
 END IF;
 PERFORM application_closure.assert_boundary();
 original:=application_closure.snapshot(p_aplicacion_id);
 IF original->'aplicacion'='null'::jsonb THEN RAISE EXCEPTION 'Application missing'; END IF;
 RETURN jsonb_build_object('aplicacion_id',p_aplicacion_id,'expected',original);
END $$;
CREATE FUNCTION application_closure.lock_sources() RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog SET lock_timeout='5s' AS $$
BEGIN
 -- Complete source/set CAS, including absent/new rows; broad locks are deliberate.
 LOCK TABLE public.aplicaciones,public.aplicaciones_calculos,public.aplicaciones_cierre,public.aplicaciones_lotes,public.aplicaciones_mezclas,public.aplicaciones_productos,public.contratistas,public.empleados,public.lotes,public.movimientos_diarios,public.movimientos_diarios_productos,public.movimientos_inventario,public.productos,public.registros_trabajo,public.tareas IN SHARE ROW EXCLUSIVE MODE;
END $$;
CREATE FUNCTION public.fn_application_close(p_request_key uuid,p_payload jsonb,p_expected jsonb,p_expected_owner uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
<<close_request>>
DECLARE actor uuid; application_id uuid; request application_closure.requests%ROWTYPE;
 original jsonb; final jsonb; result jsonb; baseline_products jsonb; final_products jsonb; work_original jsonb; work_final jsonb; work_edit jsonb; unchanged_fields text[]; n integer; costs numeric; labor numeric; jornales numeric; trees numeric;
BEGIN
 PERFORM application_closure.authorize();
 IF p_expected_owner IS NULL OR p_expected_owner IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'Operation owner mismatch' USING ERRCODE='42501';
 END IF;
 actor:=auth.uid();
 PERFORM application_closure.assert_boundary();
 application_id:=nullif(p_payload->>'aplicacion_id','')::uuid;
 IF p_request_key IS NULL OR application_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
   OR jsonb_typeof(p_expected) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Exact closure request required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('application-close:'||actor::text||':'||p_request_key::text,0));
 SELECT * INTO request FROM application_closure.requests r WHERE r.actor=close_request.actor AND r.request_key=p_request_key FOR UPDATE;
 IF FOUND THEN
   IF request.payload IS DISTINCT FROM p_payload OR request.expected IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Closure key original conflict'; END IF;
   IF request.state='cancelled' THEN RAISE EXCEPTION 'Closure request cancelled'; END IF;
   IF request.state<>'committed' OR request.receipt IS NULL OR request.actual IS NULL THEN RAISE EXCEPTION 'Incomplete closure proof'; END IF;
   RETURN jsonb_build_object('request_key',p_request_key,'receipt',request.receipt);
 END IF;
 PERFORM application_closure.lock_sources();
 original:=application_closure.snapshot(application_id);
 IF original IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Closure original changed; review current records'; END IF;
 -- Payload consumes exactly the actual captured per-product movements, not a caller total.
 WITH actual AS (SELECT mp.producto_id,round(sum(CASE WHEN mp.unidad::text IN ('cc','g') THEN mp.cantidad_utilizada/1000 ELSE mp.cantidad_utilizada END),2) quantity
  FROM public.movimientos_diarios_productos mp JOIN public.movimientos_diarios m ON m.id=mp.movimiento_diario_id
  WHERE m.aplicacion_id=application_id GROUP BY mp.producto_id), supplied AS (
  SELECT (value->>'producto_id')::uuid product,round((value->>'cantidad')::numeric,2) quantity FROM jsonb_array_elements(p_payload->'insumos_aplicados'))
 SELECT count(*) INTO n FROM actual FULL JOIN supplied ON actual.producto_id=supplied.product
 WHERE actual.producto_id IS NULL OR supplied.product IS NULL OR actual.quantity IS DISTINCT FROM supplied.quantity;
 IF n<>0 THEN RAISE EXCEPTION 'Closure consumption differs from actual movements'; END IF;
 INSERT INTO application_closure.requests(actor,request_key,application_id,payload,expected,state)
 VALUES(actor,p_request_key,application_id,p_payload,p_expected,'started') RETURNING * INTO request;
 IF NOT FOUND OR request.actor IS DISTINCT FROM actor OR request.request_key IS DISTINCT FROM p_request_key
   OR request.application_id IS DISTINCT FROM application_id OR request.receipt IS NOT NULL OR request.actual IS NOT NULL
   OR request.payload IS DISTINCT FROM p_payload OR request.expected IS DISTINCT FROM p_expected OR request.state<>'started' THEN RAISE EXCEPTION 'Closure request insertion suppressed or rewritten'; END IF;
 IF application_closure.snapshot(application_id) IS DISTINCT FROM original THEN RAISE EXCEPTION 'Request trigger changed closure sources'; END IF;
 result:=public.fn_cerrar_aplicacion(p_payload);
 -- Verify persisted business totals against actual final work, product prices and tree counts.
 SELECT coalesce(sum(mp.cantidad_utilizada*CASE WHEN mp.unidad::text IN ('cc','g') THEN .001 ELSE 1 END*coalesce(p.precio_unitario,0)),0)
 INTO costs FROM public.movimientos_diarios_productos mp JOIN public.movimientos_diarios m ON m.id=mp.movimiento_diario_id
 JOIN public.productos p ON p.id=mp.producto_id WHERE m.aplicacion_id=application_id;
 SELECT coalesce(sum(r.costo_jornal),0),coalesce(sum(r.fraccion_jornal::text::numeric),0) INTO labor,jornales
 FROM public.registros_trabajo r JOIN public.aplicaciones a ON a.tarea_id=r.tarea_id WHERE a.id=application_id;
 SELECT coalesce(sum(l.total_arboles),0) INTO trees FROM public.aplicaciones_lotes al JOIN public.lotes l ON l.id=al.lote_id WHERE al.aplicacion_id=application_id;
 IF costs::text IN ('NaN','Infinity','-Infinity') OR labor::text IN ('NaN','Infinity','-Infinity')
 OR round((p_payload->>'costo_total_insumos')::numeric,2) IS DISTINCT FROM round(costs,2)
 OR round((p_payload->>'costo_total_mano_obra')::numeric,2) IS DISTINCT FROM round(labor,2)
 OR round((p_payload->>'costo_total')::numeric,2) IS DISTINCT FROM round(costs+labor,2)
 OR (p_payload->>'jornales_utilizados')::numeric IS DISTINCT FROM jornales
 OR round((p_payload->>'valor_jornal')::numeric,4) IS DISTINCT FROM round(CASE WHEN jornales>0 THEN labor/jornales ELSE 0 END,4)
 OR round((p_payload->>'costo_por_arbol')::numeric,4) IS DISTINCT FROM round(CASE WHEN trees>0 THEN (costs+labor)/trees ELSE 0 END,4) THEN
  RAISE EXCEPTION 'Closure totals differ from actual persisted work and sources';
 END IF;
 final:=application_closure.snapshot(application_id);
 IF (final-ARRAY['aplicacion','tarea','registros_trabajo','aplicaciones_cierre','movimientos_inventario','productos'])
  IS DISTINCT FROM (original-ARRAY['aplicacion','tarea','registros_trabajo','aplicaciones_cierre','movimientos_inventario','productos']) THEN
  RAISE EXCEPTION 'Read-only closure source changed during writes'; END IF;
 SELECT jsonb_agg(value-ARRAY['cantidad_actual','updated_at','updated_by'] ORDER BY value->>'id') INTO baseline_products FROM jsonb_array_elements(original->'productos');
 SELECT jsonb_agg(value-ARRAY['cantidad_actual','updated_at','updated_by'] ORDER BY value->>'id') INTO final_products FROM jsonb_array_elements(final->'productos');
 IF baseline_products IS DISTINCT FROM final_products THEN RAISE EXCEPTION 'Unintended product fields changed'; END IF;
 IF ((final->'tarea')-ARRAY['estado','fecha_inicio_real','fecha_fin_real','updated_at'])
  IS DISTINCT FROM ((original->'tarea')-ARRAY['estado','fecha_inicio_real','fecha_fin_real','updated_at']) THEN RAISE EXCEPTION 'Unintended task fields changed'; END IF;
 FOR work_original IN SELECT value FROM jsonb_array_elements(original->'registros_trabajo') LOOP
  SELECT value INTO work_edit FROM jsonb_array_elements(p_payload->'registros_trabajo') WHERE (value->>'id')::uuid=(work_original->>'id')::uuid;
  SELECT value INTO work_final FROM jsonb_array_elements(final->'registros_trabajo') WHERE (value->>'id')::uuid=(work_original->>'id')::uuid;
  IF coalesce((work_edit->>'_deleted')::boolean,false) THEN
   IF work_final IS NOT NULL THEN RAISE EXCEPTION 'Deleted original work still exists'; END IF;
  ELSE
   unchanged_fields:=ARRAY['updated_at'];
   IF coalesce((work_edit->>'_modified')::boolean,false) THEN unchanged_fields:=unchanged_fields||ARRAY['fraccion_jornal','costo_jornal'];
    IF work_edit->>'costo_jornal' IS NULL THEN unchanged_fields:=unchanged_fields||ARRAY['valor_jornal_empleado']; END IF;
   END IF;
   IF work_final IS NULL OR (work_final-unchanged_fields) IS DISTINCT FROM (work_original-unchanged_fields) THEN RAISE EXCEPTION 'Unintended original work change'; END IF;
  END IF;
 END LOOP;
 UPDATE application_closure.requests SET state='committed',receipt=result,actual=final
 WHERE requests.actor=close_request.actor AND request_key=p_request_key AND state='started' RETURNING * INTO request;
 IF NOT FOUND OR request.state<>'committed' OR request.receipt IS DISTINCT FROM result OR request.actual IS DISTINCT FROM final
   OR request.actor IS DISTINCT FROM actor OR request.request_key IS DISTINCT FROM p_request_key OR request.application_id IS DISTINCT FROM application_id
   OR request.payload IS DISTINCT FROM p_payload OR request.expected IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Closure receipt suppressed or rewritten'; END IF;
 IF NOT EXISTS(SELECT 1 FROM application_closure.requests r WHERE r.actor=close_request.actor AND r.request_key=p_request_key
   AND to_jsonb(r)=to_jsonb(request)) THEN RAISE EXCEPTION 'Closure persisted proof changed'; END IF;
 IF application_closure.snapshot(application_id) IS DISTINCT FROM final THEN RAISE EXCEPTION 'Closure proof trigger changed business results'; END IF;
 RETURN jsonb_build_object('request_key',p_request_key,'receipt',result);
END $$;
CREATE FUNCTION public.fn_application_closure_status(p_request_key uuid,p_payload jsonb,p_expected jsonb,p_expected_owner uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
<<resolve_request>>
DECLARE actor uuid; application_id uuid; request application_closure.requests%ROWTYPE;
BEGIN
 PERFORM application_closure.authorize();
 IF p_expected_owner IS NULL OR p_expected_owner IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'Operation owner mismatch' USING ERRCODE='42501';
 END IF;
 actor:=auth.uid(); PERFORM application_closure.assert_boundary();
 application_id:=nullif(p_payload->>'aplicacion_id','')::uuid;
 IF p_request_key IS NULL OR application_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
 OR jsonb_typeof(p_expected) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Exact closure original required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('application-close:'||actor::text||':'||p_request_key::text,0));
 SELECT * INTO request FROM application_closure.requests r WHERE r.actor=resolve_request.actor AND r.request_key=p_request_key FOR UPDATE;
 IF FOUND THEN
  IF request.payload IS DISTINCT FROM p_payload OR request.expected IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Closure status original conflict'; END IF;
  IF request.state='committed' AND request.receipt IS NOT NULL AND request.actual IS NOT NULL THEN
   RETURN jsonb_build_object('state','committed','request_key',p_request_key,'receipt',request.receipt);
  END IF;
  IF request.state<>'cancelled' THEN RAISE EXCEPTION 'Incomplete closure outcome'; END IF;
 ELSE
  INSERT INTO application_closure.requests(actor,request_key,application_id,payload,expected,state)
  VALUES(actor,p_request_key,application_id,p_payload,p_expected,'cancelled') RETURNING * INTO request;
  IF NOT FOUND OR request.actor IS DISTINCT FROM actor OR request.request_key IS DISTINCT FROM p_request_key
  OR request.application_id IS DISTINCT FROM application_id OR request.payload IS DISTINCT FROM p_payload
  OR request.expected IS DISTINCT FROM p_expected OR request.state<>'cancelled' OR request.receipt IS NOT NULL OR request.actual IS NOT NULL THEN
   RAISE EXCEPTION 'Closure cancellation not confirmed'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM application_closure.requests r WHERE r.actor=resolve_request.actor AND r.request_key=p_request_key
 AND to_jsonb(r)=to_jsonb(request)) THEN RAISE EXCEPTION 'Closure cancellation changed after write'; END IF;
 RETURN jsonb_build_object('state','cancelled','request_key',p_request_key);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA application_closure FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_cerrar_aplicacion(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_application_closure_snapshot(uuid,uuid),public.fn_application_close(uuid,jsonb,jsonb,uuid),
 public.fn_application_closure_status(uuid,jsonb,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_application_closure_snapshot(uuid,uuid),public.fn_application_close(uuid,jsonb,jsonb,uuid),
 public.fn_application_closure_status(uuid,jsonb,jsonb,uuid) TO authenticated;
COMMIT;
