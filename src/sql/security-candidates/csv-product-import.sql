-- REVIEW CANDIDATE ONLY. No numbered migration or live application.
-- Installation gate: this candidate refuses any unreviewed user trigger on
-- products/ledger. Replace this zero-trigger baseline only after captured current
-- definitions and their dependencies are reviewed; historical SQL is no proof.
BEGIN;
LOCK TABLE public.productos,public.movimientos_inventario IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
 IF (SELECT array_agg(attname::text ORDER BY attname) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attnum>0 AND NOT attisdropped) IS DISTINCT FROM ARRAY['activo','azufre','blanco_biologico','boro','calcio','cantidad_actual','carbono_organico','categoria','cobre','concentracion_ia_1','concentracion_ia_2','concentracion_ia_3','created_at','epp_alto_nivel','estado','estado_fisico','fosforo','grupo','hierro','id','ingrediente_activo_1','ingrediente_activo_2','ingrediente_activo_3','link_ficha_tecnica','link_hoja_seguridad','magnesio','manganeso','molibdeno','nitrogeno','nombre','periodo_carencia_dias','periodo_reingreso_horas','permitido_gerencia','potasio','precio_por_presentacion','precio_unitario','presentacion_kg_l','registro_ica','riesgo_acuatico','riesgo_polinizador','riesgo_transeunte','riesgo_vida_silvestre','silicio','sodio','stock_minimo','tipo_aplicacion','unidad_medida','updated_at','updated_by','zinc']::text[] THEN RAISE EXCEPTION 'CSV unsupported productos columns'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='id') <> 'uuid' THEN RAISE EXCEPTION 'CSV unsupported productos.id type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='nombre') <> 'text' THEN RAISE EXCEPTION 'CSV unsupported productos.nombre type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='categoria') <> 'categoria_producto' THEN RAISE EXCEPTION 'CSV unsupported productos.categoria type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='grupo') <> 'grupo_producto' THEN RAISE EXCEPTION 'CSV unsupported productos.grupo type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='registro_ica') <> 'text' THEN RAISE EXCEPTION 'CSV unsupported productos.registro_ica type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='blanco_biologico') <> 'text' THEN RAISE EXCEPTION 'CSV unsupported productos.blanco_biologico type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='ingrediente_activo_1') <> 'text' THEN RAISE EXCEPTION 'CSV unsupported productos.ingrediente_activo_1 type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='concentracion_ia_1') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'CSV unsupported productos.concentracion_ia_1 type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='ingrediente_activo_2') <> 'text' THEN RAISE EXCEPTION 'CSV unsupported productos.ingrediente_activo_2 type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='concentracion_ia_2') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'CSV unsupported productos.concentracion_ia_2 type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='ingrediente_activo_3') <> 'text' THEN RAISE EXCEPTION 'CSV unsupported productos.ingrediente_activo_3 type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='concentracion_ia_3') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'CSV unsupported productos.concentracion_ia_3 type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='periodo_reingreso_horas') <> 'integer' THEN RAISE EXCEPTION 'CSV unsupported productos.periodo_reingreso_horas type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='periodo_carencia_dias') <> 'integer' THEN RAISE EXCEPTION 'CSV unsupported productos.periodo_carencia_dias type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='tipo_aplicacion') <> 'tipo_aplicacion_producto' THEN RAISE EXCEPTION 'CSV unsupported productos.tipo_aplicacion type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='estado_fisico') <> 'estado_fisico' THEN RAISE EXCEPTION 'CSV unsupported productos.estado_fisico type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='permitido_gerencia') <> 'boolean' THEN RAISE EXCEPTION 'CSV unsupported productos.permitido_gerencia type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='nitrogeno') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'CSV unsupported productos.nitrogeno type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='fosforo') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'CSV unsupported productos.fosforo type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='potasio') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'CSV unsupported productos.potasio type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='calcio') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'CSV unsupported productos.calcio type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='magnesio') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'CSV unsupported productos.magnesio type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='azufre') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'CSV unsupported productos.azufre type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='hierro') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'CSV unsupported productos.hierro type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='manganeso') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'CSV unsupported productos.manganeso type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='zinc') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'CSV unsupported productos.zinc type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='cobre') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'CSV unsupported productos.cobre type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='boro') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'CSV unsupported productos.boro type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='molibdeno') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'CSV unsupported productos.molibdeno type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='carbono_organico') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'CSV unsupported productos.carbono_organico type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='silicio') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'CSV unsupported productos.silicio type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='sodio') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'CSV unsupported productos.sodio type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='epp_alto_nivel') <> 'boolean' THEN RAISE EXCEPTION 'CSV unsupported productos.epp_alto_nivel type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='riesgo_acuatico') <> 'boolean' THEN RAISE EXCEPTION 'CSV unsupported productos.riesgo_acuatico type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='riesgo_vida_silvestre') <> 'boolean' THEN RAISE EXCEPTION 'CSV unsupported productos.riesgo_vida_silvestre type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='riesgo_polinizador') <> 'boolean' THEN RAISE EXCEPTION 'CSV unsupported productos.riesgo_polinizador type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='riesgo_transeunte') <> 'boolean' THEN RAISE EXCEPTION 'CSV unsupported productos.riesgo_transeunte type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='link_ficha_tecnica') <> 'text' THEN RAISE EXCEPTION 'CSV unsupported productos.link_ficha_tecnica type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='link_hoja_seguridad') <> 'text' THEN RAISE EXCEPTION 'CSV unsupported productos.link_hoja_seguridad type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='unidad_medida') <> 'unidad_medida' THEN RAISE EXCEPTION 'CSV unsupported productos.unidad_medida type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='presentacion_kg_l') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'CSV unsupported productos.presentacion_kg_l type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='precio_por_presentacion') <> 'numeric(12,2)' THEN RAISE EXCEPTION 'CSV unsupported productos.precio_por_presentacion type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='precio_unitario') <> 'numeric(12,2)' THEN RAISE EXCEPTION 'CSV unsupported productos.precio_unitario type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='cantidad_actual') <> 'numeric(12,2)' THEN RAISE EXCEPTION 'CSV unsupported productos.cantidad_actual type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='estado') <> 'estado_producto' THEN RAISE EXCEPTION 'CSV unsupported productos.estado type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='stock_minimo') <> 'numeric(12,2)' THEN RAISE EXCEPTION 'CSV unsupported productos.stock_minimo type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='activo') <> 'boolean' THEN RAISE EXCEPTION 'CSV unsupported productos.activo type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='created_at') <> 'timestamp with time zone' THEN RAISE EXCEPTION 'CSV unsupported productos.created_at type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='updated_at') <> 'timestamp with time zone' THEN RAISE EXCEPTION 'CSV unsupported productos.updated_at type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='updated_by') <> 'uuid' THEN RAISE EXCEPTION 'CSV unsupported productos.updated_by type'; END IF;
 IF (SELECT array_agg(attname::text ORDER BY attname) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attnum>0 AND NOT attisdropped) IS DISTINCT FROM ARRAY['aplicacion_id','cantidad','created_at','factura','fecha_movimiento','id','lote_aplicacion','notas','observaciones','producto_id','provisional','responsable','saldo_anterior','saldo_nuevo','tipo_movimiento','unidad','valor_movimiento']::text[] THEN RAISE EXCEPTION 'CSV unsupported movimientos_inventario columns'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attname='id') <> 'uuid' THEN RAISE EXCEPTION 'CSV unsupported movimientos_inventario.id type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attname='fecha_movimiento') <> 'date' THEN RAISE EXCEPTION 'CSV unsupported movimientos_inventario.fecha_movimiento type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attname='producto_id') <> 'uuid' THEN RAISE EXCEPTION 'CSV unsupported movimientos_inventario.producto_id type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attname='tipo_movimiento') <> 'tipo_movimiento' THEN RAISE EXCEPTION 'CSV unsupported movimientos_inventario.tipo_movimiento type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attname='cantidad') <> 'numeric(12,2)' THEN RAISE EXCEPTION 'CSV unsupported movimientos_inventario.cantidad type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attname='unidad') <> 'unidad_medida' THEN RAISE EXCEPTION 'CSV unsupported movimientos_inventario.unidad type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attname='lote_aplicacion') <> 'text' THEN RAISE EXCEPTION 'CSV unsupported movimientos_inventario.lote_aplicacion type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attname='aplicacion_id') <> 'uuid' THEN RAISE EXCEPTION 'CSV unsupported movimientos_inventario.aplicacion_id type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attname='factura') <> 'text' THEN RAISE EXCEPTION 'CSV unsupported movimientos_inventario.factura type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attname='saldo_anterior') <> 'numeric(12,2)' THEN RAISE EXCEPTION 'CSV unsupported movimientos_inventario.saldo_anterior type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attname='saldo_nuevo') <> 'numeric(12,2)' THEN RAISE EXCEPTION 'CSV unsupported movimientos_inventario.saldo_nuevo type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attname='valor_movimiento') <> 'numeric(12,2)' THEN RAISE EXCEPTION 'CSV unsupported movimientos_inventario.valor_movimiento type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attname='responsable') <> 'text' THEN RAISE EXCEPTION 'CSV unsupported movimientos_inventario.responsable type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attname='observaciones') <> 'text' THEN RAISE EXCEPTION 'CSV unsupported movimientos_inventario.observaciones type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attname='provisional') <> 'boolean' THEN RAISE EXCEPTION 'CSV unsupported movimientos_inventario.provisional type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attname='created_at') <> 'timestamp with time zone' THEN RAISE EXCEPTION 'CSV unsupported movimientos_inventario.created_at type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attname='notas') <> 'text' THEN RAISE EXCEPTION 'CSV unsupported movimientos_inventario.notas type'; END IF;

 IF EXISTS(SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('public.productos'::regclass,'public.movimientos_inventario'::regclass)) THEN
  RAISE EXCEPTION 'CSV installation requires reviewed current trigger baseline';
 END IF;
END $$;
CREATE SCHEMA csv_product_import;
REVOKE ALL ON SCHEMA csv_product_import FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE csv_product_import.requests (
 actor uuid NOT NULL, request_key uuid NOT NULL, payload jsonb NOT NULL,
 canceled boolean NOT NULL, result jsonb, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(actor,request_key), CHECK ((canceled AND result IS NULL) OR (NOT canceled AND result IS NOT NULL))
);
CREATE TABLE csv_product_import.parsed (
 actor uuid NOT NULL, request_key uuid NOT NULL, payload jsonb NOT NULL,
 parser_version integer NOT NULL, csv_sha256 text NOT NULL CHECK(csv_sha256 ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(actor,request_key)
);
ALTER TABLE csv_product_import.parsed ENABLE ROW LEVEL SECURITY;
CREATE TABLE csv_product_import.openings (
 actor uuid NOT NULL, request_key uuid NOT NULL, ordinal int NOT NULL,
 product_id uuid NOT NULL UNIQUE, movement_id uuid UNIQUE,
 product_snapshot jsonb NOT NULL, movement_snapshot jsonb,
 quantity_before numeric(12,2) NOT NULL CHECK(quantity_before=0),
 quantity_after numeric(12,2) NOT NULL CHECK(quantity_after>=0),
 PRIMARY KEY(actor,request_key,ordinal),
 CHECK((quantity_after=0 AND movement_id IS NULL AND movement_snapshot IS NULL) OR
       (quantity_after>0 AND movement_id IS NOT NULL AND movement_snapshot IS NOT NULL))
);
REVOKE ALL ON ALL TABLES IN SCHEMA csv_product_import FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION csv_product_import.authorize() RETURNS public.usuarios
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE u public.usuarios; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Human account required'; END IF;
 SELECT * INTO u FROM public.usuarios WHERE id=auth.uid() FOR SHARE;
 IF NOT FOUND OR u.activo IS DISTINCT FROM true OR u.rol IS NULL OR u.rol::text NOT IN ('Administrador','Gerencia') OR u.email IS NULL OR btrim(u.email)='' THEN
  RAISE EXCEPTION 'Active Administrador or Gerencia required';
 END IF; RETURN u;
END $$;
CREATE FUNCTION csv_product_import.validate(p jsonb) RETURNS void
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE v jsonb; product public.productos; names text[]='{}'; BEGIN
 IF p IS NULL OR jsonb_typeof(p)<>'object' OR NOT (p ?& ARRAY['raw_csv','parser_version','products']) OR (SELECT count(*) FROM jsonb_object_keys(p))<>3 THEN RAISE EXCEPTION 'Invalid CSV payload'; END IF;
 IF jsonb_typeof(p->'raw_csv')<>'string' OR btrim(p->>'raw_csv')='' OR octet_length(p->>'raw_csv')>1048576 OR p->'parser_version'<>'1'::jsonb
    OR jsonb_typeof(p->'products')<>'array' THEN RAISE EXCEPTION 'Invalid CSV payload'; END IF;
 IF jsonb_array_length(p->'products') NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'CSV row cap'; END IF;
 FOR v IN SELECT value FROM jsonb_array_elements(p->'products') LOOP
  IF jsonb_typeof(v)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(v) k WHERE NOT k=ANY(ARRAY['nombre','categoria','grupo','registro_ica','blanco_biologico','ingrediente_activo_1','concentracion_ia_1','ingrediente_activo_2','concentracion_ia_2','ingrediente_activo_3','concentracion_ia_3','periodo_reingreso_horas','periodo_carencia_dias','tipo_aplicacion','estado_fisico','permitido_gerencia','nitrogeno','fosforo','potasio','calcio','magnesio','azufre','hierro','manganeso','zinc','cobre','boro','molibdeno','carbono_organico','silicio','sodio','epp_alto_nivel','riesgo_acuatico','riesgo_vida_silvestre','riesgo_polinizador','riesgo_transeunte','link_ficha_tecnica','link_hoja_seguridad','unidad_medida','presentacion_kg_l','precio_por_presentacion','precio_unitario','cantidad_actual','stock_minimo','activo'])) THEN RAISE EXCEPTION 'Unsupported CSV fields'; END IF;
  IF v ? 'nombre' AND (jsonb_typeof(v->'nombre') <> 'string' OR btrim(v->>'nombre') = '') THEN RAISE EXCEPTION 'Invalid CSV field nombre'; END IF;
  IF v ? 'categoria' AND (jsonb_typeof(v->'categoria') <> 'string' OR btrim(v->>'categoria') = '') THEN RAISE EXCEPTION 'Invalid CSV field categoria'; END IF;
  IF v ? 'grupo' AND (jsonb_typeof(v->'grupo') <> 'string' OR btrim(v->>'grupo') = '') THEN RAISE EXCEPTION 'Invalid CSV field grupo'; END IF;
  IF v ? 'registro_ica' AND (jsonb_typeof(v->'registro_ica') <> 'string' OR btrim(v->>'registro_ica') = '') THEN RAISE EXCEPTION 'Invalid CSV field registro_ica'; END IF;
  IF v ? 'blanco_biologico' AND (jsonb_typeof(v->'blanco_biologico') <> 'string' OR btrim(v->>'blanco_biologico') = '') THEN RAISE EXCEPTION 'Invalid CSV field blanco_biologico'; END IF;
  IF v ? 'ingrediente_activo_1' AND (jsonb_typeof(v->'ingrediente_activo_1') <> 'string' OR btrim(v->>'ingrediente_activo_1') = '') THEN RAISE EXCEPTION 'Invalid CSV field ingrediente_activo_1'; END IF;
  IF v ? 'concentracion_ia_1' AND (jsonb_typeof(v->'concentracion_ia_1') <> 'number' OR (v->>'concentracion_ia_1')::numeric < 0 OR (v->>'concentracion_ia_1')::numeric > 99999999.99 OR (v->>'concentracion_ia_1')::numeric <> round((v->>'concentracion_ia_1')::numeric,2)) THEN RAISE EXCEPTION 'Invalid CSV field concentracion_ia_1'; END IF;
  IF v ? 'ingrediente_activo_2' AND (jsonb_typeof(v->'ingrediente_activo_2') <> 'string' OR btrim(v->>'ingrediente_activo_2') = '') THEN RAISE EXCEPTION 'Invalid CSV field ingrediente_activo_2'; END IF;
  IF v ? 'concentracion_ia_2' AND (jsonb_typeof(v->'concentracion_ia_2') <> 'number' OR (v->>'concentracion_ia_2')::numeric < 0 OR (v->>'concentracion_ia_2')::numeric > 99999999.99 OR (v->>'concentracion_ia_2')::numeric <> round((v->>'concentracion_ia_2')::numeric,2)) THEN RAISE EXCEPTION 'Invalid CSV field concentracion_ia_2'; END IF;
  IF v ? 'ingrediente_activo_3' AND (jsonb_typeof(v->'ingrediente_activo_3') <> 'string' OR btrim(v->>'ingrediente_activo_3') = '') THEN RAISE EXCEPTION 'Invalid CSV field ingrediente_activo_3'; END IF;
  IF v ? 'concentracion_ia_3' AND (jsonb_typeof(v->'concentracion_ia_3') <> 'number' OR (v->>'concentracion_ia_3')::numeric < 0 OR (v->>'concentracion_ia_3')::numeric > 99999999.99 OR (v->>'concentracion_ia_3')::numeric <> round((v->>'concentracion_ia_3')::numeric,2)) THEN RAISE EXCEPTION 'Invalid CSV field concentracion_ia_3'; END IF;
  IF v ? 'periodo_reingreso_horas' AND (jsonb_typeof(v->'periodo_reingreso_horas') <> 'number' OR (v->>'periodo_reingreso_horas')::numeric < 0 OR (v->>'periodo_reingreso_horas')::numeric>2147483647 OR (v->>'periodo_reingreso_horas')::numeric <> trunc((v->>'periodo_reingreso_horas')::numeric)) THEN RAISE EXCEPTION 'Invalid CSV field periodo_reingreso_horas'; END IF;
  IF v ? 'periodo_carencia_dias' AND (jsonb_typeof(v->'periodo_carencia_dias') <> 'number' OR (v->>'periodo_carencia_dias')::numeric < 0 OR (v->>'periodo_carencia_dias')::numeric>2147483647 OR (v->>'periodo_carencia_dias')::numeric <> trunc((v->>'periodo_carencia_dias')::numeric)) THEN RAISE EXCEPTION 'Invalid CSV field periodo_carencia_dias'; END IF;
  IF v ? 'tipo_aplicacion' AND (jsonb_typeof(v->'tipo_aplicacion') <> 'string' OR btrim(v->>'tipo_aplicacion') = '') THEN RAISE EXCEPTION 'Invalid CSV field tipo_aplicacion'; END IF;
  IF v ? 'estado_fisico' AND (jsonb_typeof(v->'estado_fisico') <> 'string' OR btrim(v->>'estado_fisico') = '') THEN RAISE EXCEPTION 'Invalid CSV field estado_fisico'; END IF;
  IF v ? 'permitido_gerencia' AND (jsonb_typeof(v->'permitido_gerencia') <> 'boolean') THEN RAISE EXCEPTION 'Invalid CSV field permitido_gerencia'; END IF;
  IF v ? 'nitrogeno' AND (jsonb_typeof(v->'nitrogeno') <> 'number' OR (v->>'nitrogeno')::numeric < 0 OR (v->>'nitrogeno')::numeric > 100 OR (v->>'nitrogeno')::numeric <> round((v->>'nitrogeno')::numeric,2)) THEN RAISE EXCEPTION 'Invalid CSV field nitrogeno'; END IF;
  IF v ? 'fosforo' AND (jsonb_typeof(v->'fosforo') <> 'number' OR (v->>'fosforo')::numeric < 0 OR (v->>'fosforo')::numeric > 100 OR (v->>'fosforo')::numeric <> round((v->>'fosforo')::numeric,2)) THEN RAISE EXCEPTION 'Invalid CSV field fosforo'; END IF;
  IF v ? 'potasio' AND (jsonb_typeof(v->'potasio') <> 'number' OR (v->>'potasio')::numeric < 0 OR (v->>'potasio')::numeric > 100 OR (v->>'potasio')::numeric <> round((v->>'potasio')::numeric,2)) THEN RAISE EXCEPTION 'Invalid CSV field potasio'; END IF;
  IF v ? 'calcio' AND (jsonb_typeof(v->'calcio') <> 'number' OR (v->>'calcio')::numeric < 0 OR (v->>'calcio')::numeric > 100 OR (v->>'calcio')::numeric <> round((v->>'calcio')::numeric,2)) THEN RAISE EXCEPTION 'Invalid CSV field calcio'; END IF;
  IF v ? 'magnesio' AND (jsonb_typeof(v->'magnesio') <> 'number' OR (v->>'magnesio')::numeric < 0 OR (v->>'magnesio')::numeric > 100 OR (v->>'magnesio')::numeric <> round((v->>'magnesio')::numeric,2)) THEN RAISE EXCEPTION 'Invalid CSV field magnesio'; END IF;
  IF v ? 'azufre' AND (jsonb_typeof(v->'azufre') <> 'number' OR (v->>'azufre')::numeric < 0 OR (v->>'azufre')::numeric > 100 OR (v->>'azufre')::numeric <> round((v->>'azufre')::numeric,2)) THEN RAISE EXCEPTION 'Invalid CSV field azufre'; END IF;
  IF v ? 'hierro' AND (jsonb_typeof(v->'hierro') <> 'number' OR (v->>'hierro')::numeric < 0 OR (v->>'hierro')::numeric > 99999999.99 OR (v->>'hierro')::numeric <> round((v->>'hierro')::numeric,2)) THEN RAISE EXCEPTION 'Invalid CSV field hierro'; END IF;
  IF v ? 'manganeso' AND (jsonb_typeof(v->'manganeso') <> 'number' OR (v->>'manganeso')::numeric < 0 OR (v->>'manganeso')::numeric > 99999999.99 OR (v->>'manganeso')::numeric <> round((v->>'manganeso')::numeric,2)) THEN RAISE EXCEPTION 'Invalid CSV field manganeso'; END IF;
  IF v ? 'zinc' AND (jsonb_typeof(v->'zinc') <> 'number' OR (v->>'zinc')::numeric < 0 OR (v->>'zinc')::numeric > 99999999.99 OR (v->>'zinc')::numeric <> round((v->>'zinc')::numeric,2)) THEN RAISE EXCEPTION 'Invalid CSV field zinc'; END IF;
  IF v ? 'cobre' AND (jsonb_typeof(v->'cobre') <> 'number' OR (v->>'cobre')::numeric < 0 OR (v->>'cobre')::numeric > 99999999.99 OR (v->>'cobre')::numeric <> round((v->>'cobre')::numeric,2)) THEN RAISE EXCEPTION 'Invalid CSV field cobre'; END IF;
  IF v ? 'boro' AND (jsonb_typeof(v->'boro') <> 'number' OR (v->>'boro')::numeric < 0 OR (v->>'boro')::numeric > 99999999.99 OR (v->>'boro')::numeric <> round((v->>'boro')::numeric,2)) THEN RAISE EXCEPTION 'Invalid CSV field boro'; END IF;
  IF v ? 'molibdeno' AND (jsonb_typeof(v->'molibdeno') <> 'number' OR (v->>'molibdeno')::numeric < 0 OR (v->>'molibdeno')::numeric > 99999999.99 OR (v->>'molibdeno')::numeric <> round((v->>'molibdeno')::numeric,2)) THEN RAISE EXCEPTION 'Invalid CSV field molibdeno'; END IF;
  IF v ? 'carbono_organico' AND (jsonb_typeof(v->'carbono_organico') <> 'number' OR (v->>'carbono_organico')::numeric < 0 OR (v->>'carbono_organico')::numeric > 99999999.99 OR (v->>'carbono_organico')::numeric <> round((v->>'carbono_organico')::numeric,2)) THEN RAISE EXCEPTION 'Invalid CSV field carbono_organico'; END IF;
  IF v ? 'silicio' AND (jsonb_typeof(v->'silicio') <> 'number' OR (v->>'silicio')::numeric < 0 OR (v->>'silicio')::numeric > 99999999.99 OR (v->>'silicio')::numeric <> round((v->>'silicio')::numeric,2)) THEN RAISE EXCEPTION 'Invalid CSV field silicio'; END IF;
  IF v ? 'sodio' AND (jsonb_typeof(v->'sodio') <> 'number' OR (v->>'sodio')::numeric < 0 OR (v->>'sodio')::numeric > 99999999.99 OR (v->>'sodio')::numeric <> round((v->>'sodio')::numeric,2)) THEN RAISE EXCEPTION 'Invalid CSV field sodio'; END IF;
  IF v ? 'epp_alto_nivel' AND (jsonb_typeof(v->'epp_alto_nivel') <> 'boolean') THEN RAISE EXCEPTION 'Invalid CSV field epp_alto_nivel'; END IF;
  IF v ? 'riesgo_acuatico' AND (jsonb_typeof(v->'riesgo_acuatico') <> 'boolean') THEN RAISE EXCEPTION 'Invalid CSV field riesgo_acuatico'; END IF;
  IF v ? 'riesgo_vida_silvestre' AND (jsonb_typeof(v->'riesgo_vida_silvestre') <> 'boolean') THEN RAISE EXCEPTION 'Invalid CSV field riesgo_vida_silvestre'; END IF;
  IF v ? 'riesgo_polinizador' AND (jsonb_typeof(v->'riesgo_polinizador') <> 'boolean') THEN RAISE EXCEPTION 'Invalid CSV field riesgo_polinizador'; END IF;
  IF v ? 'riesgo_transeunte' AND (jsonb_typeof(v->'riesgo_transeunte') <> 'boolean') THEN RAISE EXCEPTION 'Invalid CSV field riesgo_transeunte'; END IF;
  IF v ? 'link_ficha_tecnica' AND (jsonb_typeof(v->'link_ficha_tecnica') <> 'string' OR btrim(v->>'link_ficha_tecnica') = '') THEN RAISE EXCEPTION 'Invalid CSV field link_ficha_tecnica'; END IF;
  IF v ? 'link_hoja_seguridad' AND (jsonb_typeof(v->'link_hoja_seguridad') <> 'string' OR btrim(v->>'link_hoja_seguridad') = '') THEN RAISE EXCEPTION 'Invalid CSV field link_hoja_seguridad'; END IF;
  IF v ? 'unidad_medida' AND (jsonb_typeof(v->'unidad_medida') <> 'string' OR btrim(v->>'unidad_medida') = '') THEN RAISE EXCEPTION 'Invalid CSV field unidad_medida'; END IF;
  IF v ? 'presentacion_kg_l' AND (jsonb_typeof(v->'presentacion_kg_l') <> 'number' OR (v->>'presentacion_kg_l')::numeric < 0 OR (v->>'presentacion_kg_l')::numeric > 99999999.99 OR (v->>'presentacion_kg_l')::numeric <> round((v->>'presentacion_kg_l')::numeric,2)) THEN RAISE EXCEPTION 'Invalid CSV field presentacion_kg_l'; END IF;
  IF v ? 'precio_por_presentacion' AND (jsonb_typeof(v->'precio_por_presentacion') <> 'number' OR (v->>'precio_por_presentacion')::numeric < 0 OR (v->>'precio_por_presentacion')::numeric > 9999999999.99 OR (v->>'precio_por_presentacion')::numeric <> round((v->>'precio_por_presentacion')::numeric,2)) THEN RAISE EXCEPTION 'Invalid CSV field precio_por_presentacion'; END IF;
  IF v ? 'precio_unitario' AND (jsonb_typeof(v->'precio_unitario') <> 'number' OR (v->>'precio_unitario')::numeric < 0 OR (v->>'precio_unitario')::numeric > 9999999999.99 OR (v->>'precio_unitario')::numeric <> round((v->>'precio_unitario')::numeric,2)) THEN RAISE EXCEPTION 'Invalid CSV field precio_unitario'; END IF;
  IF v ? 'cantidad_actual' AND (jsonb_typeof(v->'cantidad_actual') <> 'number' OR (v->>'cantidad_actual')::numeric < 0 OR (v->>'cantidad_actual')::numeric > 9999999999.99 OR (v->>'cantidad_actual')::numeric <> round((v->>'cantidad_actual')::numeric,2)) THEN RAISE EXCEPTION 'Invalid CSV field cantidad_actual'; END IF;
  IF v ? 'stock_minimo' AND (jsonb_typeof(v->'stock_minimo') <> 'number' OR (v->>'stock_minimo')::numeric < 0 OR (v->>'stock_minimo')::numeric > 9999999999.99 OR (v->>'stock_minimo')::numeric <> round((v->>'stock_minimo')::numeric,2)) THEN RAISE EXCEPTION 'Invalid CSV field stock_minimo'; END IF;
  IF v ? 'activo' AND (jsonb_typeof(v->'activo') <> 'boolean') THEN RAISE EXCEPTION 'Invalid CSV field activo'; END IF;
  IF NOT (v ?& ARRAY['nombre','categoria','grupo','unidad_medida','activo']) OR coalesce((v->>'cantidad_actual')::numeric,0)<0 THEN RAISE EXCEPTION 'Required CSV fields or opening balance'; END IF;
  IF v->>'nombre'=ANY(names) THEN RAISE EXCEPTION 'Duplicate CSV product name'; END IF;
  names=array_append(names,v->>'nombre');
  SELECT * INTO product FROM jsonb_populate_record(NULL::public.productos, '{"nombre": null, "categoria": null, "grupo": null, "registro_ica": null, "blanco_biologico": null, "ingrediente_activo_1": null, "concentracion_ia_1": null, "ingrediente_activo_2": null, "concentracion_ia_2": null, "ingrediente_activo_3": null, "concentracion_ia_3": null, "periodo_reingreso_horas": null, "periodo_carencia_dias": null, "tipo_aplicacion": null, "estado_fisico": null, "permitido_gerencia": false, "nitrogeno": null, "fosforo": null, "potasio": null, "calcio": null, "magnesio": null, "azufre": null, "hierro": null, "manganeso": null, "zinc": null, "cobre": null, "boro": null, "molibdeno": null, "carbono_organico": null, "silicio": null, "sodio": null, "epp_alto_nivel": false, "riesgo_acuatico": false, "riesgo_vida_silvestre": false, "riesgo_polinizador": false, "riesgo_transeunte": false, "link_ficha_tecnica": null, "link_hoja_seguridad": null, "unidad_medida": null, "presentacion_kg_l": null, "precio_por_presentacion": null, "precio_unitario": null, "cantidad_actual": 0, "estado": "OK", "stock_minimo": 0, "activo": true}'::jsonb || v);
 END LOOP;
END $$;
-- This proof is trusted only because registration EXECUTE is service-only.
-- The edge passes actor from verified Auth.getUser and runs the real parser;
-- a human may not register its own client-claimed raw/product association.
CREATE FUNCTION csv_product_import.registered(a uuid,k uuid,p jsonb) RETURNS csv_product_import.parsed
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE r csv_product_import.parsed; BEGIN
 SELECT * INTO r FROM csv_product_import.parsed WHERE actor=a AND request_key=k FOR SHARE;
 IF NOT FOUND OR r.actor IS DISTINCT FROM a OR r.request_key IS DISTINCT FROM k OR r.payload IS DISTINCT FROM p
  OR r.parser_version IS DISTINCT FROM (p->>'parser_version')::integer
  OR r.csv_sha256 IS DISTINCT FROM encode(sha256(convert_to(p->>'raw_csv','UTF8')),'hex') THEN
  RAISE EXCEPTION 'Exact trusted server parsed registration required'; END IF;
 RETURN r;
END $$;
CREATE FUNCTION public.fn_csv_product_import_register(p_actor uuid,p_request_key uuid,p_payload jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE u public.usuarios; r csv_product_import.parsed; prior csv_product_import.requests; expected jsonb;
BEGIN
 IF p_actor IS NULL OR p_request_key IS NULL THEN RAISE EXCEPTION 'Verified human actor and request key required'; END IF;
 SELECT * INTO u FROM public.usuarios WHERE id=p_actor FOR SHARE;
 IF NOT FOUND OR u.activo IS DISTINCT FROM true OR u.rol IS NULL OR u.rol::text NOT IN ('Administrador','Gerencia') OR u.email IS NULL OR btrim(u.email)='' THEN
  RAISE EXCEPTION 'Active permitted verified actor required'; END IF;
 PERFORM csv_product_import.validate(p_payload);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text||':'||p_request_key::text,0));
 SELECT * INTO prior FROM csv_product_import.requests WHERE actor=p_actor AND request_key=p_request_key;
 IF FOUND AND (prior.canceled OR prior.payload IS DISTINCT FROM p_payload) THEN RAISE EXCEPTION 'Canceled or changed CSV request'; END IF;
 SELECT * INTO r FROM csv_product_import.parsed WHERE actor=p_actor AND request_key=p_request_key;
 IF NOT FOUND THEN
  IF prior.actor IS NOT NULL THEN RAISE EXCEPTION 'Committed request lacks trusted parser proof'; END IF;
  expected:=jsonb_build_object('actor',p_actor,'request_key',p_request_key,'payload',p_payload,'parser_version',p_payload->'parser_version',
   'csv_sha256',encode(sha256(convert_to(p_payload->>'raw_csv','UTF8')),'hex'),'created_at',now());
  INSERT INTO csv_product_import.parsed SELECT * FROM jsonb_populate_record(NULL::csv_product_import.parsed,expected);
  SELECT * INTO r FROM csv_product_import.parsed WHERE actor=p_actor AND request_key=p_request_key;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Trusted parser registration did not persist exactly'; END IF;
 END IF;
 r:=csv_product_import.registered(p_actor,p_request_key,p_payload);
 RETURN jsonb_build_object('actor',p_actor,'requestKey',p_request_key,'parserVersion',r.parser_version,'csvSha256',r.csv_sha256,'payload',r.payload);
END $$;
CREATE FUNCTION public.fn_csv_product_import(p_request_key uuid,p_payload jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE u public.usuarios; a uuid; existing csv_product_import.requests;
 v jsonb; expected public.productos; actual public.productos;
 expected_move public.movimientos_inventario; actual_move public.movimientos_inventario;
 registered csv_product_import.parsed; ordinal int=0; proof jsonb; proofs jsonb='[]'; receipts jsonb='[]'; result jsonb; actual_request csv_product_import.requests;
BEGIN
 u=csv_product_import.authorize();a=u.id;
 IF p_request_key IS NULL THEN RAISE EXCEPTION 'Request key required'; END IF;
 PERFORM csv_product_import.validate(p_payload);
 PERFORM pg_advisory_xact_lock(hashtextextended(a::text||':'||p_request_key::text,0));
 registered:=csv_product_import.registered(a,p_request_key,p_payload);
 SELECT * INTO existing FROM csv_product_import.requests WHERE actor=a AND request_key=p_request_key;
 IF FOUND THEN
  IF existing.payload IS DISTINCT FROM p_payload OR existing.canceled THEN RAISE EXCEPTION 'Canceled or changed CSV request'; END IF;
  RETURN existing.result;
 END IF;
 -- Whole batch preflight precedes writes. UNIQUE(nombre) also arbitrates races.
 IF EXISTS(SELECT 1 FROM public.productos p JOIN jsonb_array_elements(p_payload->'products') AS items(value) ON p.nombre=items.value->>'nombre') THEN RAISE EXCEPTION 'Product already exists'; END IF;
 FOR v IN SELECT value FROM jsonb_array_elements(p_payload->'products') LOOP
  ordinal=ordinal+1;
  SELECT * INTO expected FROM jsonb_populate_record(NULL::public.productos, '{"nombre": null, "categoria": null, "grupo": null, "registro_ica": null, "blanco_biologico": null, "ingrediente_activo_1": null, "concentracion_ia_1": null, "ingrediente_activo_2": null, "concentracion_ia_2": null, "ingrediente_activo_3": null, "concentracion_ia_3": null, "periodo_reingreso_horas": null, "periodo_carencia_dias": null, "tipo_aplicacion": null, "estado_fisico": null, "permitido_gerencia": false, "nitrogeno": null, "fosforo": null, "potasio": null, "calcio": null, "magnesio": null, "azufre": null, "hierro": null, "manganeso": null, "zinc": null, "cobre": null, "boro": null, "molibdeno": null, "carbono_organico": null, "silicio": null, "sodio": null, "epp_alto_nivel": false, "riesgo_acuatico": false, "riesgo_vida_silvestre": false, "riesgo_polinizador": false, "riesgo_transeunte": false, "link_ficha_tecnica": null, "link_hoja_seguridad": null, "unidad_medida": null, "presentacion_kg_l": null, "precio_por_presentacion": null, "precio_unitario": null, "cantidad_actual": 0, "estado": "OK", "stock_minimo": 0, "activo": true}'::jsonb || v ||
    jsonb_build_object('id',gen_random_uuid(),'created_at',now(),'updated_at',now(),'updated_by',a));
  INSERT INTO public.productos SELECT (expected).*;
  SELECT * INTO actual FROM public.productos WHERE id=expected.id;
  IF NOT FOUND OR to_jsonb(actual) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'CSV product write did not persist exactly'; END IF;
  expected_move=NULL;
  IF expected.cantidad_actual>0 THEN
   SELECT * INTO expected_move FROM jsonb_populate_record(NULL::public.movimientos_inventario,
    jsonb_build_object('id',gen_random_uuid(),'fecha_movimiento',(now() AT TIME ZONE 'America/Bogota')::date,
    'producto_id',expected.id,'tipo_movimiento','Entrada','cantidad',expected.cantidad_actual,'unidad',expected.unidad_medida,
    'saldo_anterior',0,'saldo_nuevo',expected.cantidad_actual,'responsable',u.email,
    'observaciones','Saldo de apertura de catálogo CSV; sin valoración de compra','provisional',false,'created_at',now()));
   INSERT INTO public.movimientos_inventario SELECT (expected_move).*;
   SELECT * INTO actual_move FROM public.movimientos_inventario WHERE id=expected_move.id;
   IF NOT FOUND OR to_jsonb(actual_move) IS DISTINCT FROM to_jsonb(expected_move) THEN RAISE EXCEPTION 'CSV opening ledger did not persist exactly'; END IF;
  END IF;
  proof=jsonb_build_object('actor',a,'request_key',p_request_key,'ordinal',ordinal,'product_id',expected.id,
    'movement_id',expected_move.id,'product_snapshot',to_jsonb(expected),
    'movement_snapshot',CASE WHEN expected_move.id IS NULL THEN NULL ELSE to_jsonb(expected_move) END,
    'quantity_before',0,'quantity_after',expected.cantidad_actual);
  INSERT INTO csv_product_import.openings SELECT * FROM jsonb_populate_record(NULL::csv_product_import.openings,proof);
  proofs=proofs||jsonb_build_array(proof);
  receipts=receipts||jsonb_build_array(jsonb_build_object('product_id',expected.id,'opening_quantity',expected.cantidad_actual,'movement_id',expected_move.id,'product',to_jsonb(expected)));
 END LOOP;
 result=jsonb_build_object('success',true,'actor',a,'requestKey',p_request_key,'parserVersion',1,
   'csvSha256',encode(sha256(convert_to(p_payload->>'raw_csv','UTF8')),'hex'),
   'total',ordinal,'importados',ordinal,'message','Todos los productos se importaron en una sola transacción','products',receipts);
 INSERT INTO csv_product_import.requests(actor,request_key,payload,canceled,result) VALUES(a,p_request_key,p_payload,false,result);
 -- Read every row again after ALL writes and their AFTER triggers, including
 -- cross-table mutation of earlier products/proofs and request suppression.
 FOR proof IN SELECT value FROM jsonb_array_elements(proofs) LOOP
  IF (SELECT to_jsonb(p) FROM public.productos p WHERE p.id=(proof->>'product_id')::uuid) IS DISTINCT FROM proof->'product_snapshot'
   OR (SELECT to_jsonb(o) FROM csv_product_import.openings o WHERE o.actor=a AND o.request_key=p_request_key AND o.ordinal=(proof->>'ordinal')::int) IS DISTINCT FROM proof
   OR (proof->>'movement_id' IS NOT NULL AND (SELECT to_jsonb(m) FROM public.movimientos_inventario m WHERE m.id=(proof->>'movement_id')::uuid) IS DISTINCT FROM proof->'movement_snapshot')
   OR (SELECT count(*) FROM public.movimientos_inventario m WHERE m.producto_id=(proof->>'product_id')::uuid) <> (CASE WHEN (proof->>'quantity_after')::numeric>0 THEN 1 ELSE 0 END) THEN
    RAISE EXCEPTION 'CSV final opening proof mismatch';
  END IF;
 END LOOP;
 IF (SELECT count(*) FROM csv_product_import.openings WHERE actor=a AND request_key=p_request_key)<>ordinal THEN RAISE EXCEPTION 'CSV proof count mismatch'; END IF;
 SELECT * INTO actual_request FROM csv_product_import.requests WHERE actor=a AND request_key=p_request_key;
 IF NOT FOUND OR actual_request.actor<>a OR actual_request.request_key<>p_request_key OR actual_request.payload IS DISTINCT FROM p_payload
  OR actual_request.canceled IS DISTINCT FROM false OR actual_request.result IS DISTINCT FROM result OR actual_request.created_at IS DISTINCT FROM now() THEN RAISE EXCEPTION 'CSV receipt did not persist exactly'; END IF;
 IF to_jsonb(csv_product_import.registered(a,p_request_key,p_payload)) IS DISTINCT FROM to_jsonb(registered) THEN
  RAISE EXCEPTION 'Trusted parser registration changed during import'; END IF;
 RETURN result;
END $$;
CREATE FUNCTION public.fn_csv_product_import_status(p_request_key uuid,p_payload jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE u public.usuarios; r csv_product_import.requests; registered csv_product_import.parsed; BEGIN
 u=csv_product_import.authorize();
 IF p_request_key IS NULL THEN RAISE EXCEPTION 'Request key required'; END IF;
 PERFORM csv_product_import.validate(p_payload);
 PERFORM pg_advisory_xact_lock(hashtextextended(u.id::text||':'||p_request_key::text,0));
 IF EXISTS(SELECT 1 FROM csv_product_import.parsed WHERE actor=u.id AND request_key=p_request_key) THEN
  registered:=csv_product_import.registered(u.id,p_request_key,p_payload);
 END IF;
 SELECT * INTO r FROM csv_product_import.requests WHERE actor=u.id AND request_key=p_request_key;
 IF FOUND THEN
  IF r.payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'Changed CSV request'; END IF;
  IF NOT r.canceled THEN PERFORM csv_product_import.registered(u.id,p_request_key,p_payload); END IF;
  RETURN jsonb_build_object('actor',u.id,'requestKey',p_request_key,'parserVersion',1,
    'csvSha256',encode(sha256(convert_to(p_payload->>'raw_csv','UTF8')),'hex'),'committed',NOT r.canceled,'result',r.result);
 END IF;
 INSERT INTO csv_product_import.requests(actor,request_key,payload,canceled,result) VALUES(u.id,p_request_key,p_payload,true,NULL);
 SELECT * INTO r FROM csv_product_import.requests WHERE actor=u.id AND request_key=p_request_key;
 IF NOT FOUND OR r.actor<>u.id OR r.request_key<>p_request_key OR r.payload IS DISTINCT FROM p_payload OR r.canceled IS DISTINCT FROM true OR r.result IS NOT NULL OR r.created_at IS DISTINCT FROM now() THEN
  RAISE EXCEPTION 'CSV cancellation fence did not persist exactly';
 END IF;
 IF registered.actor IS NOT NULL AND to_jsonb(csv_product_import.registered(u.id,p_request_key,p_payload)) IS DISTINCT FROM to_jsonb(registered) THEN RAISE EXCEPTION 'Parser proof changed during cancellation'; END IF;
 RETURN jsonb_build_object('actor',u.id,'requestKey',p_request_key,'parserVersion',1,
   'csvSha256',encode(sha256(convert_to(p_payload->>'raw_csv','UTF8')),'hex'),'committed',false,'result',NULL);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA csv_product_import FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_csv_product_import(uuid,jsonb),public.fn_csv_product_import_status(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_csv_product_import_register(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_csv_product_import_register(uuid,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_csv_product_import(uuid,jsonb),public.fn_csv_product_import_status(uuid,jsonb) TO authenticated;
COMMIT;
