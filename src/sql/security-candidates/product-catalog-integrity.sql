-- REVIEW CANDIDATE ONLY. No numbered migration or live application.
-- Installation gate: this candidate refuses any unreviewed user trigger on
-- products/ledger. Replace this zero-trigger baseline only after captured current
-- definitions and their dependencies are reviewed; historical SQL is no proof.
BEGIN;
LOCK TABLE public.productos,public.movimientos_inventario IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
 IF (SELECT array_agg(attname::text ORDER BY attname) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attnum>0 AND NOT attisdropped) IS DISTINCT FROM ARRAY['activo','azufre','blanco_biologico','boro','calcio','cantidad_actual','carbono_organico','categoria','cobre','concentracion_ia_1','concentracion_ia_2','concentracion_ia_3','created_at','epp_alto_nivel','estado','estado_fisico','fosforo','grupo','hierro','id','ingrediente_activo_1','ingrediente_activo_2','ingrediente_activo_3','link_ficha_tecnica','link_hoja_seguridad','magnesio','manganeso','molibdeno','nitrogeno','nombre','periodo_carencia_dias','periodo_reingreso_horas','permitido_gerencia','potasio','precio_por_presentacion','precio_unitario','presentacion_kg_l','registro_ica','riesgo_acuatico','riesgo_polinizador','riesgo_transeunte','riesgo_vida_silvestre','silicio','sodio','stock_minimo','tipo_aplicacion','unidad_medida','updated_at','updated_by','zinc']::text[] THEN RAISE EXCEPTION 'Catalog unsupported productos columns'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='id') <> 'uuid' THEN RAISE EXCEPTION 'Catalog unsupported productos.id type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='nombre') <> 'text' THEN RAISE EXCEPTION 'Catalog unsupported productos.nombre type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='categoria') <> 'categoria_producto' THEN RAISE EXCEPTION 'Catalog unsupported productos.categoria type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='grupo') <> 'grupo_producto' THEN RAISE EXCEPTION 'Catalog unsupported productos.grupo type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='registro_ica') <> 'text' THEN RAISE EXCEPTION 'Catalog unsupported productos.registro_ica type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='blanco_biologico') <> 'text' THEN RAISE EXCEPTION 'Catalog unsupported productos.blanco_biologico type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='ingrediente_activo_1') <> 'text' THEN RAISE EXCEPTION 'Catalog unsupported productos.ingrediente_activo_1 type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='concentracion_ia_1') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'Catalog unsupported productos.concentracion_ia_1 type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='ingrediente_activo_2') <> 'text' THEN RAISE EXCEPTION 'Catalog unsupported productos.ingrediente_activo_2 type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='concentracion_ia_2') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'Catalog unsupported productos.concentracion_ia_2 type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='ingrediente_activo_3') <> 'text' THEN RAISE EXCEPTION 'Catalog unsupported productos.ingrediente_activo_3 type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='concentracion_ia_3') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'Catalog unsupported productos.concentracion_ia_3 type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='periodo_reingreso_horas') <> 'integer' THEN RAISE EXCEPTION 'Catalog unsupported productos.periodo_reingreso_horas type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='periodo_carencia_dias') <> 'integer' THEN RAISE EXCEPTION 'Catalog unsupported productos.periodo_carencia_dias type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='tipo_aplicacion') <> 'tipo_aplicacion_producto' THEN RAISE EXCEPTION 'Catalog unsupported productos.tipo_aplicacion type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='estado_fisico') <> 'estado_fisico' THEN RAISE EXCEPTION 'Catalog unsupported productos.estado_fisico type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='permitido_gerencia') <> 'boolean' THEN RAISE EXCEPTION 'Catalog unsupported productos.permitido_gerencia type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='nitrogeno') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'Catalog unsupported productos.nitrogeno type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='fosforo') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'Catalog unsupported productos.fosforo type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='potasio') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'Catalog unsupported productos.potasio type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='calcio') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'Catalog unsupported productos.calcio type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='magnesio') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'Catalog unsupported productos.magnesio type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='azufre') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'Catalog unsupported productos.azufre type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='hierro') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'Catalog unsupported productos.hierro type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='manganeso') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'Catalog unsupported productos.manganeso type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='zinc') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'Catalog unsupported productos.zinc type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='cobre') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'Catalog unsupported productos.cobre type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='boro') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'Catalog unsupported productos.boro type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='molibdeno') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'Catalog unsupported productos.molibdeno type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='carbono_organico') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'Catalog unsupported productos.carbono_organico type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='silicio') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'Catalog unsupported productos.silicio type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='sodio') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'Catalog unsupported productos.sodio type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='epp_alto_nivel') <> 'boolean' THEN RAISE EXCEPTION 'Catalog unsupported productos.epp_alto_nivel type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='riesgo_acuatico') <> 'boolean' THEN RAISE EXCEPTION 'Catalog unsupported productos.riesgo_acuatico type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='riesgo_vida_silvestre') <> 'boolean' THEN RAISE EXCEPTION 'Catalog unsupported productos.riesgo_vida_silvestre type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='riesgo_polinizador') <> 'boolean' THEN RAISE EXCEPTION 'Catalog unsupported productos.riesgo_polinizador type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='riesgo_transeunte') <> 'boolean' THEN RAISE EXCEPTION 'Catalog unsupported productos.riesgo_transeunte type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='link_ficha_tecnica') <> 'text' THEN RAISE EXCEPTION 'Catalog unsupported productos.link_ficha_tecnica type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='link_hoja_seguridad') <> 'text' THEN RAISE EXCEPTION 'Catalog unsupported productos.link_hoja_seguridad type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='unidad_medida') <> 'unidad_medida' THEN RAISE EXCEPTION 'Catalog unsupported productos.unidad_medida type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='presentacion_kg_l') <> 'numeric(10,2)' THEN RAISE EXCEPTION 'Catalog unsupported productos.presentacion_kg_l type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='precio_por_presentacion') <> 'numeric(12,2)' THEN RAISE EXCEPTION 'Catalog unsupported productos.precio_por_presentacion type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='precio_unitario') <> 'numeric(12,2)' THEN RAISE EXCEPTION 'Catalog unsupported productos.precio_unitario type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='cantidad_actual') <> 'numeric(12,2)' THEN RAISE EXCEPTION 'Catalog unsupported productos.cantidad_actual type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='estado') <> 'estado_producto' THEN RAISE EXCEPTION 'Catalog unsupported productos.estado type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='stock_minimo') <> 'numeric(12,2)' THEN RAISE EXCEPTION 'Catalog unsupported productos.stock_minimo type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='activo') <> 'boolean' THEN RAISE EXCEPTION 'Catalog unsupported productos.activo type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='created_at') <> 'timestamp with time zone' THEN RAISE EXCEPTION 'Catalog unsupported productos.created_at type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='updated_at') <> 'timestamp with time zone' THEN RAISE EXCEPTION 'Catalog unsupported productos.updated_at type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attname='updated_by') <> 'uuid' THEN RAISE EXCEPTION 'Catalog unsupported productos.updated_by type'; END IF;
 IF (SELECT array_agg(attname::text ORDER BY attname) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attnum>0 AND NOT attisdropped) IS DISTINCT FROM ARRAY['aplicacion_id','cantidad','created_at','factura','fecha_movimiento','id','lote_aplicacion','notas','observaciones','producto_id','provisional','responsable','saldo_anterior','saldo_nuevo','tipo_movimiento','unidad','valor_movimiento']::text[] THEN RAISE EXCEPTION 'Catalog unsupported movimientos_inventario columns'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attname='id') <> 'uuid' THEN RAISE EXCEPTION 'Catalog unsupported movimientos_inventario.id type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attname='fecha_movimiento') <> 'date' THEN RAISE EXCEPTION 'Catalog unsupported movimientos_inventario.fecha_movimiento type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attname='producto_id') <> 'uuid' THEN RAISE EXCEPTION 'Catalog unsupported movimientos_inventario.producto_id type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attname='tipo_movimiento') <> 'tipo_movimiento' THEN RAISE EXCEPTION 'Catalog unsupported movimientos_inventario.tipo_movimiento type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attname='cantidad') <> 'numeric(12,2)' THEN RAISE EXCEPTION 'Catalog unsupported movimientos_inventario.cantidad type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attname='unidad') <> 'unidad_medida' THEN RAISE EXCEPTION 'Catalog unsupported movimientos_inventario.unidad type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attname='lote_aplicacion') <> 'text' THEN RAISE EXCEPTION 'Catalog unsupported movimientos_inventario.lote_aplicacion type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attname='aplicacion_id') <> 'uuid' THEN RAISE EXCEPTION 'Catalog unsupported movimientos_inventario.aplicacion_id type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attname='factura') <> 'text' THEN RAISE EXCEPTION 'Catalog unsupported movimientos_inventario.factura type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attname='saldo_anterior') <> 'numeric(12,2)' THEN RAISE EXCEPTION 'Catalog unsupported movimientos_inventario.saldo_anterior type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attname='saldo_nuevo') <> 'numeric(12,2)' THEN RAISE EXCEPTION 'Catalog unsupported movimientos_inventario.saldo_nuevo type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attname='valor_movimiento') <> 'numeric(12,2)' THEN RAISE EXCEPTION 'Catalog unsupported movimientos_inventario.valor_movimiento type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attname='responsable') <> 'text' THEN RAISE EXCEPTION 'Catalog unsupported movimientos_inventario.responsable type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attname='observaciones') <> 'text' THEN RAISE EXCEPTION 'Catalog unsupported movimientos_inventario.observaciones type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attname='provisional') <> 'boolean' THEN RAISE EXCEPTION 'Catalog unsupported movimientos_inventario.provisional type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attname='created_at') <> 'timestamp with time zone' THEN RAISE EXCEPTION 'Catalog unsupported movimientos_inventario.created_at type'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attname='notas') <> 'text' THEN RAISE EXCEPTION 'Catalog unsupported movimientos_inventario.notas type'; END IF;

 IF EXISTS(SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('public.productos'::regclass,'public.movimientos_inventario'::regclass)) THEN
  RAISE EXCEPTION 'Catalog installation requires reviewed current trigger baseline';
 END IF;
END $$;
CREATE SCHEMA product_catalog_integrity;
REVOKE ALL ON SCHEMA product_catalog_integrity FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE product_catalog_integrity.requests (
 actor uuid NOT NULL, request_key uuid NOT NULL, payload jsonb NOT NULL,
 canceled boolean NOT NULL, result jsonb, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(actor,request_key), CHECK ((canceled AND result IS NULL) OR (NOT canceled AND result IS NOT NULL))
);
-- Transactional trusted catalog before/after audit; no ordinary-role raw access.
CREATE TABLE product_catalog_integrity.audit (
 actor uuid NOT NULL,request_key uuid NOT NULL,product_id uuid NOT NULL,mode text NOT NULL,
 before_row jsonb,after_row jsonb NOT NULL,origin text NOT NULL,created_at timestamptz NOT NULL,
 PRIMARY KEY(actor,request_key)
);
-- An explicit zero opening is evidence; it creates no fictitious ledger entry.
CREATE TABLE product_catalog_integrity.openings (
 actor uuid NOT NULL,request_key uuid NOT NULL,product_id uuid NOT NULL UNIQUE,
 product_snapshot jsonb NOT NULL,movement_id uuid UNIQUE,movement_snapshot jsonb,
 quantity_before numeric NOT NULL,quantity_after numeric NOT NULL,PRIMARY KEY(actor,request_key)
);
ALTER TABLE product_catalog_integrity.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_catalog_integrity.audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_catalog_integrity.openings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA product_catalog_integrity FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION product_catalog_integrity.authorize() RETURNS public.usuarios
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE u public.usuarios; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Human account required'; END IF;
 SELECT * INTO u FROM public.usuarios WHERE id=auth.uid() FOR SHARE;
 IF NOT FOUND OR u.activo IS DISTINCT FROM true OR u.rol IS NULL OR u.rol::text NOT IN ('Administrador','Gerencia') OR u.email IS NULL OR btrim(u.email)='' THEN
  RAISE EXCEPTION 'Active Administrador or Gerencia required';
 END IF; RETURN u;
END $$;
CREATE FUNCTION product_catalog_integrity.validate(p jsonb) RETURNS void
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE v jsonb; product public.productos;original public.productos; expected_keys text[];BEGIN
 IF p IS NULL OR jsonb_typeof(p)<>'object' OR NOT(p ?& ARRAY['mode','product_id','original','fields']) OR (SELECT count(*) FROM jsonb_object_keys(p))<>4
  OR p->>'mode' NOT IN ('create','edit') OR jsonb_typeof(p->'fields')<>'object' THEN RAISE EXCEPTION 'Invalid catalog payload'; END IF;
 v:=p->'fields';
 IF p->>'mode'='create' THEN
  IF p->'product_id'<>'null'::jsonb OR p->'original'<>'null'::jsonb OR v->'activo' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Invalid catalog create';END IF;
  expected_keys:=ARRAY['nombre','categoria','grupo','unidad_medida','presentacion_kg_l','precio_por_presentacion','precio_unitario','cantidad_actual','stock_minimo','estado','registro_ica','blanco_biologico','ingrediente_activo_1','concentracion_ia_1','ingrediente_activo_2','concentracion_ia_2','ingrediente_activo_3','concentracion_ia_3','periodo_reingreso_horas','periodo_carencia_dias','tipo_aplicacion','estado_fisico','permitido_gerencia','nitrogeno','fosforo','potasio','calcio','magnesio','azufre','hierro','manganeso','zinc','cobre','boro','molibdeno','carbono_organico','silicio','sodio','epp_alto_nivel','riesgo_acuatico','riesgo_vida_silvestre','riesgo_polinizador','riesgo_transeunte','link_ficha_tecnica','link_hoja_seguridad','activo'];
 ELSE
  IF jsonb_typeof(p->'product_id')<>'string' OR jsonb_typeof(p->'original')<>'object' THEN RAISE EXCEPTION 'Original catalog snapshot required';END IF;
  IF (p->>'product_id')::uuid IS NULL THEN RAISE EXCEPTION 'Product identity required';END IF;
  SELECT * INTO original FROM jsonb_populate_record(NULL::public.productos,p->'original');
  IF original.id IS DISTINCT FROM (p->>'product_id')::uuid OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p->'original') k)
   IS DISTINCT FROM (SELECT array_agg(attname::text ORDER BY attname) FROM pg_attribute WHERE attrelid='public.productos'::regclass AND attnum>0 AND NOT attisdropped) THEN
   RAISE EXCEPTION 'Complete original catalog snapshot required';END IF;
  expected_keys:=ARRAY['nombre','categoria','grupo','unidad_medida','presentacion_kg_l','precio_por_presentacion','precio_unitario','stock_minimo','estado','registro_ica','blanco_biologico','ingrediente_activo_1','concentracion_ia_1','ingrediente_activo_2','concentracion_ia_2','ingrediente_activo_3','concentracion_ia_3','periodo_reingreso_horas','periodo_carencia_dias','tipo_aplicacion','estado_fisico','permitido_gerencia','nitrogeno','fosforo','potasio','calcio','magnesio','azufre','hierro','manganeso','zinc','cobre','boro','molibdeno','carbono_organico','silicio','sodio','epp_alto_nivel','riesgo_acuatico','riesgo_vida_silvestre','riesgo_polinizador','riesgo_transeunte','link_ficha_tecnica','link_hoja_seguridad'];
 END IF;
 IF NOT(v ?& expected_keys) OR (SELECT count(*) FROM jsonb_object_keys(v))<>cardinality(expected_keys) THEN RAISE EXCEPTION 'Complete supported catalog fields required';END IF;
  IF v ? 'nombre' AND v->'nombre'<>'null'::jsonb AND (jsonb_typeof(v->'nombre') <> 'string' OR btrim(v->>'nombre') = '') THEN RAISE EXCEPTION 'Invalid catalog field nombre'; END IF;
  IF v ? 'categoria' AND v->'categoria'<>'null'::jsonb AND (jsonb_typeof(v->'categoria') <> 'string' OR btrim(v->>'categoria') = '') THEN RAISE EXCEPTION 'Invalid catalog field categoria'; END IF;
  IF v ? 'grupo' AND v->'grupo'<>'null'::jsonb AND (jsonb_typeof(v->'grupo') <> 'string' OR btrim(v->>'grupo') = '') THEN RAISE EXCEPTION 'Invalid catalog field grupo'; END IF;
  IF v ? 'registro_ica' AND v->'registro_ica'<>'null'::jsonb AND (jsonb_typeof(v->'registro_ica') <> 'string' OR btrim(v->>'registro_ica') = '') THEN RAISE EXCEPTION 'Invalid catalog field registro_ica'; END IF;
  IF v ? 'blanco_biologico' AND v->'blanco_biologico'<>'null'::jsonb AND (jsonb_typeof(v->'blanco_biologico') <> 'string' OR btrim(v->>'blanco_biologico') = '') THEN RAISE EXCEPTION 'Invalid catalog field blanco_biologico'; END IF;
  IF v ? 'ingrediente_activo_1' AND v->'ingrediente_activo_1'<>'null'::jsonb AND (jsonb_typeof(v->'ingrediente_activo_1') <> 'string' OR btrim(v->>'ingrediente_activo_1') = '') THEN RAISE EXCEPTION 'Invalid catalog field ingrediente_activo_1'; END IF;
  IF v ? 'concentracion_ia_1' AND v->'concentracion_ia_1'<>'null'::jsonb AND (jsonb_typeof(v->'concentracion_ia_1') <> 'number' OR (v->>'concentracion_ia_1')::numeric < 0 OR (v->>'concentracion_ia_1')::numeric > 99999999.99 OR (v->>'concentracion_ia_1')::numeric <> round((v->>'concentracion_ia_1')::numeric,2)) THEN RAISE EXCEPTION 'Invalid catalog field concentracion_ia_1'; END IF;
  IF v ? 'ingrediente_activo_2' AND v->'ingrediente_activo_2'<>'null'::jsonb AND (jsonb_typeof(v->'ingrediente_activo_2') <> 'string' OR btrim(v->>'ingrediente_activo_2') = '') THEN RAISE EXCEPTION 'Invalid catalog field ingrediente_activo_2'; END IF;
  IF v ? 'concentracion_ia_2' AND v->'concentracion_ia_2'<>'null'::jsonb AND (jsonb_typeof(v->'concentracion_ia_2') <> 'number' OR (v->>'concentracion_ia_2')::numeric < 0 OR (v->>'concentracion_ia_2')::numeric > 99999999.99 OR (v->>'concentracion_ia_2')::numeric <> round((v->>'concentracion_ia_2')::numeric,2)) THEN RAISE EXCEPTION 'Invalid catalog field concentracion_ia_2'; END IF;
  IF v ? 'ingrediente_activo_3' AND v->'ingrediente_activo_3'<>'null'::jsonb AND (jsonb_typeof(v->'ingrediente_activo_3') <> 'string' OR btrim(v->>'ingrediente_activo_3') = '') THEN RAISE EXCEPTION 'Invalid catalog field ingrediente_activo_3'; END IF;
  IF v ? 'concentracion_ia_3' AND v->'concentracion_ia_3'<>'null'::jsonb AND (jsonb_typeof(v->'concentracion_ia_3') <> 'number' OR (v->>'concentracion_ia_3')::numeric < 0 OR (v->>'concentracion_ia_3')::numeric > 99999999.99 OR (v->>'concentracion_ia_3')::numeric <> round((v->>'concentracion_ia_3')::numeric,2)) THEN RAISE EXCEPTION 'Invalid catalog field concentracion_ia_3'; END IF;
  IF v ? 'periodo_reingreso_horas' AND v->'periodo_reingreso_horas'<>'null'::jsonb AND (jsonb_typeof(v->'periodo_reingreso_horas') <> 'number' OR (v->>'periodo_reingreso_horas')::numeric < 0 OR (v->>'periodo_reingreso_horas')::numeric>2147483647 OR (v->>'periodo_reingreso_horas')::numeric <> trunc((v->>'periodo_reingreso_horas')::numeric)) THEN RAISE EXCEPTION 'Invalid catalog field periodo_reingreso_horas'; END IF;
  IF v ? 'periodo_carencia_dias' AND v->'periodo_carencia_dias'<>'null'::jsonb AND (jsonb_typeof(v->'periodo_carencia_dias') <> 'number' OR (v->>'periodo_carencia_dias')::numeric < 0 OR (v->>'periodo_carencia_dias')::numeric>2147483647 OR (v->>'periodo_carencia_dias')::numeric <> trunc((v->>'periodo_carencia_dias')::numeric)) THEN RAISE EXCEPTION 'Invalid catalog field periodo_carencia_dias'; END IF;
  IF v ? 'tipo_aplicacion' AND v->'tipo_aplicacion'<>'null'::jsonb AND (jsonb_typeof(v->'tipo_aplicacion') <> 'string' OR btrim(v->>'tipo_aplicacion') = '') THEN RAISE EXCEPTION 'Invalid catalog field tipo_aplicacion'; END IF;
  IF v ? 'estado_fisico' AND v->'estado_fisico'<>'null'::jsonb AND (jsonb_typeof(v->'estado_fisico') <> 'string' OR btrim(v->>'estado_fisico') = '') THEN RAISE EXCEPTION 'Invalid catalog field estado_fisico'; END IF;
  IF v ? 'permitido_gerencia' AND v->'permitido_gerencia'<>'null'::jsonb AND (jsonb_typeof(v->'permitido_gerencia') <> 'boolean') THEN RAISE EXCEPTION 'Invalid catalog field permitido_gerencia'; END IF;
  IF v ? 'nitrogeno' AND v->'nitrogeno'<>'null'::jsonb AND (jsonb_typeof(v->'nitrogeno') <> 'number' OR (v->>'nitrogeno')::numeric < 0 OR (v->>'nitrogeno')::numeric > 100 OR (v->>'nitrogeno')::numeric <> round((v->>'nitrogeno')::numeric,2)) THEN RAISE EXCEPTION 'Invalid catalog field nitrogeno'; END IF;
  IF v ? 'fosforo' AND v->'fosforo'<>'null'::jsonb AND (jsonb_typeof(v->'fosforo') <> 'number' OR (v->>'fosforo')::numeric < 0 OR (v->>'fosforo')::numeric > 100 OR (v->>'fosforo')::numeric <> round((v->>'fosforo')::numeric,2)) THEN RAISE EXCEPTION 'Invalid catalog field fosforo'; END IF;
  IF v ? 'potasio' AND v->'potasio'<>'null'::jsonb AND (jsonb_typeof(v->'potasio') <> 'number' OR (v->>'potasio')::numeric < 0 OR (v->>'potasio')::numeric > 100 OR (v->>'potasio')::numeric <> round((v->>'potasio')::numeric,2)) THEN RAISE EXCEPTION 'Invalid catalog field potasio'; END IF;
  IF v ? 'calcio' AND v->'calcio'<>'null'::jsonb AND (jsonb_typeof(v->'calcio') <> 'number' OR (v->>'calcio')::numeric < 0 OR (v->>'calcio')::numeric > 100 OR (v->>'calcio')::numeric <> round((v->>'calcio')::numeric,2)) THEN RAISE EXCEPTION 'Invalid catalog field calcio'; END IF;
  IF v ? 'magnesio' AND v->'magnesio'<>'null'::jsonb AND (jsonb_typeof(v->'magnesio') <> 'number' OR (v->>'magnesio')::numeric < 0 OR (v->>'magnesio')::numeric > 100 OR (v->>'magnesio')::numeric <> round((v->>'magnesio')::numeric,2)) THEN RAISE EXCEPTION 'Invalid catalog field magnesio'; END IF;
  IF v ? 'azufre' AND v->'azufre'<>'null'::jsonb AND (jsonb_typeof(v->'azufre') <> 'number' OR (v->>'azufre')::numeric < 0 OR (v->>'azufre')::numeric > 100 OR (v->>'azufre')::numeric <> round((v->>'azufre')::numeric,2)) THEN RAISE EXCEPTION 'Invalid catalog field azufre'; END IF;
  IF v ? 'hierro' AND v->'hierro'<>'null'::jsonb AND (jsonb_typeof(v->'hierro') <> 'number' OR (v->>'hierro')::numeric < 0 OR (v->>'hierro')::numeric > 99999999.99 OR (v->>'hierro')::numeric <> round((v->>'hierro')::numeric,2)) THEN RAISE EXCEPTION 'Invalid catalog field hierro'; END IF;
  IF v ? 'manganeso' AND v->'manganeso'<>'null'::jsonb AND (jsonb_typeof(v->'manganeso') <> 'number' OR (v->>'manganeso')::numeric < 0 OR (v->>'manganeso')::numeric > 99999999.99 OR (v->>'manganeso')::numeric <> round((v->>'manganeso')::numeric,2)) THEN RAISE EXCEPTION 'Invalid catalog field manganeso'; END IF;
  IF v ? 'zinc' AND v->'zinc'<>'null'::jsonb AND (jsonb_typeof(v->'zinc') <> 'number' OR (v->>'zinc')::numeric < 0 OR (v->>'zinc')::numeric > 99999999.99 OR (v->>'zinc')::numeric <> round((v->>'zinc')::numeric,2)) THEN RAISE EXCEPTION 'Invalid catalog field zinc'; END IF;
  IF v ? 'cobre' AND v->'cobre'<>'null'::jsonb AND (jsonb_typeof(v->'cobre') <> 'number' OR (v->>'cobre')::numeric < 0 OR (v->>'cobre')::numeric > 99999999.99 OR (v->>'cobre')::numeric <> round((v->>'cobre')::numeric,2)) THEN RAISE EXCEPTION 'Invalid catalog field cobre'; END IF;
  IF v ? 'boro' AND v->'boro'<>'null'::jsonb AND (jsonb_typeof(v->'boro') <> 'number' OR (v->>'boro')::numeric < 0 OR (v->>'boro')::numeric > 99999999.99 OR (v->>'boro')::numeric <> round((v->>'boro')::numeric,2)) THEN RAISE EXCEPTION 'Invalid catalog field boro'; END IF;
  IF v ? 'molibdeno' AND v->'molibdeno'<>'null'::jsonb AND (jsonb_typeof(v->'molibdeno') <> 'number' OR (v->>'molibdeno')::numeric < 0 OR (v->>'molibdeno')::numeric > 99999999.99 OR (v->>'molibdeno')::numeric <> round((v->>'molibdeno')::numeric,2)) THEN RAISE EXCEPTION 'Invalid catalog field molibdeno'; END IF;
  IF v ? 'carbono_organico' AND v->'carbono_organico'<>'null'::jsonb AND (jsonb_typeof(v->'carbono_organico') <> 'number' OR (v->>'carbono_organico')::numeric < 0 OR (v->>'carbono_organico')::numeric > 99999999.99 OR (v->>'carbono_organico')::numeric <> round((v->>'carbono_organico')::numeric,2)) THEN RAISE EXCEPTION 'Invalid catalog field carbono_organico'; END IF;
  IF v ? 'silicio' AND v->'silicio'<>'null'::jsonb AND (jsonb_typeof(v->'silicio') <> 'number' OR (v->>'silicio')::numeric < 0 OR (v->>'silicio')::numeric > 99999999.99 OR (v->>'silicio')::numeric <> round((v->>'silicio')::numeric,2)) THEN RAISE EXCEPTION 'Invalid catalog field silicio'; END IF;
  IF v ? 'sodio' AND v->'sodio'<>'null'::jsonb AND (jsonb_typeof(v->'sodio') <> 'number' OR (v->>'sodio')::numeric < 0 OR (v->>'sodio')::numeric > 99999999.99 OR (v->>'sodio')::numeric <> round((v->>'sodio')::numeric,2)) THEN RAISE EXCEPTION 'Invalid catalog field sodio'; END IF;
  IF v ? 'epp_alto_nivel' AND v->'epp_alto_nivel'<>'null'::jsonb AND (jsonb_typeof(v->'epp_alto_nivel') <> 'boolean') THEN RAISE EXCEPTION 'Invalid catalog field epp_alto_nivel'; END IF;
  IF v ? 'riesgo_acuatico' AND v->'riesgo_acuatico'<>'null'::jsonb AND (jsonb_typeof(v->'riesgo_acuatico') <> 'boolean') THEN RAISE EXCEPTION 'Invalid catalog field riesgo_acuatico'; END IF;
  IF v ? 'riesgo_vida_silvestre' AND v->'riesgo_vida_silvestre'<>'null'::jsonb AND (jsonb_typeof(v->'riesgo_vida_silvestre') <> 'boolean') THEN RAISE EXCEPTION 'Invalid catalog field riesgo_vida_silvestre'; END IF;
  IF v ? 'riesgo_polinizador' AND v->'riesgo_polinizador'<>'null'::jsonb AND (jsonb_typeof(v->'riesgo_polinizador') <> 'boolean') THEN RAISE EXCEPTION 'Invalid catalog field riesgo_polinizador'; END IF;
  IF v ? 'riesgo_transeunte' AND v->'riesgo_transeunte'<>'null'::jsonb AND (jsonb_typeof(v->'riesgo_transeunte') <> 'boolean') THEN RAISE EXCEPTION 'Invalid catalog field riesgo_transeunte'; END IF;
  IF v ? 'link_ficha_tecnica' AND v->'link_ficha_tecnica'<>'null'::jsonb AND (jsonb_typeof(v->'link_ficha_tecnica') <> 'string' OR btrim(v->>'link_ficha_tecnica') = '') THEN RAISE EXCEPTION 'Invalid catalog field link_ficha_tecnica'; END IF;
  IF v ? 'link_hoja_seguridad' AND v->'link_hoja_seguridad'<>'null'::jsonb AND (jsonb_typeof(v->'link_hoja_seguridad') <> 'string' OR btrim(v->>'link_hoja_seguridad') = '') THEN RAISE EXCEPTION 'Invalid catalog field link_hoja_seguridad'; END IF;
  IF v ? 'unidad_medida' AND v->'unidad_medida'<>'null'::jsonb AND (jsonb_typeof(v->'unidad_medida') <> 'string' OR btrim(v->>'unidad_medida') = '') THEN RAISE EXCEPTION 'Invalid catalog field unidad_medida'; END IF;
  IF v ? 'presentacion_kg_l' AND v->'presentacion_kg_l'<>'null'::jsonb AND (jsonb_typeof(v->'presentacion_kg_l') <> 'number' OR (v->>'presentacion_kg_l')::numeric < 0 OR (v->>'presentacion_kg_l')::numeric > 99999999.99 OR (v->>'presentacion_kg_l')::numeric <> round((v->>'presentacion_kg_l')::numeric,2)) THEN RAISE EXCEPTION 'Invalid catalog field presentacion_kg_l'; END IF;
  IF v ? 'precio_por_presentacion' AND v->'precio_por_presentacion'<>'null'::jsonb AND (jsonb_typeof(v->'precio_por_presentacion') <> 'number' OR (v->>'precio_por_presentacion')::numeric < 0 OR (v->>'precio_por_presentacion')::numeric > 9999999999.99 OR (v->>'precio_por_presentacion')::numeric <> round((v->>'precio_por_presentacion')::numeric,2)) THEN RAISE EXCEPTION 'Invalid catalog field precio_por_presentacion'; END IF;
  IF v ? 'precio_unitario' AND v->'precio_unitario'<>'null'::jsonb AND (jsonb_typeof(v->'precio_unitario') <> 'number' OR (v->>'precio_unitario')::numeric < 0 OR (v->>'precio_unitario')::numeric > 9999999999.99 OR (v->>'precio_unitario')::numeric <> round((v->>'precio_unitario')::numeric,2)) THEN RAISE EXCEPTION 'Invalid catalog field precio_unitario'; END IF;
  IF v ? 'cantidad_actual' AND v->'cantidad_actual'<>'null'::jsonb AND (jsonb_typeof(v->'cantidad_actual') <> 'number' OR (v->>'cantidad_actual')::numeric < 0 OR (v->>'cantidad_actual')::numeric > 9999999999.99 OR (v->>'cantidad_actual')::numeric <> round((v->>'cantidad_actual')::numeric,2)) THEN RAISE EXCEPTION 'Invalid catalog field cantidad_actual'; END IF;
  IF v ? 'stock_minimo' AND v->'stock_minimo'<>'null'::jsonb AND (jsonb_typeof(v->'stock_minimo') <> 'number' OR (v->>'stock_minimo')::numeric < 0 OR (v->>'stock_minimo')::numeric > 9999999999.99 OR (v->>'stock_minimo')::numeric <> round((v->>'stock_minimo')::numeric,2)) THEN RAISE EXCEPTION 'Invalid catalog field stock_minimo'; END IF;
  IF v ? 'activo' AND v->'activo'<>'null'::jsonb AND (jsonb_typeof(v->'activo') <> 'boolean') THEN RAISE EXCEPTION 'Invalid catalog field activo'; END IF;
 IF v->'estado'<>'null'::jsonb AND jsonb_typeof(v->'estado')<>'string' THEN RAISE EXCEPTION 'Invalid catalog estado';END IF;

 IF EXISTS(SELECT 1 FROM unnest(ARRAY['nombre','categoria','grupo','unidad_medida']) f WHERE v->f='null'::jsonb) THEN RAISE EXCEPTION 'Required catalog fields';END IF;
 SELECT * INTO product FROM jsonb_populate_record(NULL::public.productos,v);
END $$;
CREATE FUNCTION public.fn_product_catalog_post(p_request_key uuid,p_payload jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE u public.usuarios;r product_catalog_integrity.requests;v jsonb;before_row public.productos;
 expected public.productos;actual public.productos;original public.productos;move public.movimientos_inventario;
 proof jsonb;aud jsonb;result jsonb;before_ledger jsonb;before_openings jsonb;BEGIN
 u:=product_catalog_integrity.authorize();
 IF p_request_key IS NULL THEN RAISE EXCEPTION 'Request key required';END IF;
 PERFORM product_catalog_integrity.validate(p_payload);
 PERFORM pg_advisory_xact_lock(hashtextextended(u.id::text||':'||p_request_key::text,0));
 SELECT * INTO r FROM product_catalog_integrity.requests WHERE actor=u.id AND request_key=p_request_key;
 IF FOUND THEN
  IF r.payload IS DISTINCT FROM p_payload OR r.canceled THEN RAISE EXCEPTION 'Canceled or changed catalog request';END IF;
  RETURN r.result;
 END IF;
 v:=p_payload->'fields';
 IF p_payload->>'mode'='create' THEN
  v:=jsonb_set(v,'{cantidad_actual}',coalesce(nullif(v->'cantidad_actual','null'::jsonb),'0'::jsonb));
  SELECT * INTO expected FROM jsonb_populate_record(NULL::public.productos,'{"nombre": null, "categoria": null, "grupo": null, "registro_ica": null, "blanco_biologico": null, "ingrediente_activo_1": null, "concentracion_ia_1": null, "ingrediente_activo_2": null, "concentracion_ia_2": null, "ingrediente_activo_3": null, "concentracion_ia_3": null, "periodo_reingreso_horas": null, "periodo_carencia_dias": null, "tipo_aplicacion": null, "estado_fisico": null, "permitido_gerencia": false, "nitrogeno": null, "fosforo": null, "potasio": null, "calcio": null, "magnesio": null, "azufre": null, "hierro": null, "manganeso": null, "zinc": null, "cobre": null, "boro": null, "molibdeno": null, "carbono_organico": null, "silicio": null, "sodio": null, "epp_alto_nivel": false, "riesgo_acuatico": false, "riesgo_vida_silvestre": false, "riesgo_polinizador": false, "riesgo_transeunte": false, "link_ficha_tecnica": null, "link_hoja_seguridad": null, "unidad_medida": null, "presentacion_kg_l": null, "precio_por_presentacion": null, "precio_unitario": null, "cantidad_actual": 0, "estado": "OK", "stock_minimo": 0, "activo": true}'::jsonb||v||
   jsonb_build_object('id',gen_random_uuid(),'created_at',now(),'updated_at',now(),'updated_by',u.id));
  INSERT INTO public.productos SELECT (expected).*;
  IF expected.cantidad_actual>0 THEN
   SELECT * INTO move FROM jsonb_populate_record(NULL::public.movimientos_inventario,
    jsonb_build_object('id',gen_random_uuid(),'fecha_movimiento',(now() AT TIME ZONE 'America/Bogota')::date,
     'producto_id',expected.id,'tipo_movimiento','Entrada','cantidad',expected.cantidad_actual,'unidad',expected.unidad_medida,
     'saldo_anterior',0,'saldo_nuevo',expected.cantidad_actual,'responsable',u.email,
     'observaciones','Saldo de apertura de catálogo; sin valoración de compra','provisional',false,'created_at',now()));
   INSERT INTO public.movimientos_inventario SELECT (move).*;
  END IF;
  proof:=jsonb_build_object('actor',u.id,'request_key',p_request_key,'product_id',expected.id,'product_snapshot',to_jsonb(expected),
   'movement_id',move.id,'movement_snapshot',CASE WHEN move.id IS NULL THEN NULL ELSE to_jsonb(move) END,'quantity_before',0,'quantity_after',expected.cantidad_actual);
  INSERT INTO product_catalog_integrity.openings SELECT * FROM jsonb_populate_record(NULL::product_catalog_integrity.openings,proof);
 ELSE
  SELECT * INTO before_row FROM public.productos WHERE id=(p_payload->>'product_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Catalog product missing';END IF;
  SELECT jsonb_agg(to_jsonb(m) ORDER BY id) INTO before_ledger FROM public.movimientos_inventario m WHERE producto_id=before_row.id;
  SELECT jsonb_agg(to_jsonb(o) ORDER BY request_key) INTO before_openings FROM product_catalog_integrity.openings o WHERE product_id=before_row.id;
  SELECT * INTO original FROM jsonb_populate_record(NULL::public.productos,p_payload->'original');
  IF to_jsonb(before_row) IS DISTINCT FROM to_jsonb(original) THEN RAISE EXCEPTION 'Catalog changed since original review';END IF;
  IF before_row.unidad_medida::text IS DISTINCT FROM v->>'unidad_medida' AND (coalesce(before_row.cantidad_actual,0)<>0
   OR EXISTS(SELECT 1 FROM public.movimientos_inventario WHERE producto_id=before_row.id)) THEN
   RAISE EXCEPTION 'Unit change requires reviewed inventory conversion';END IF;
  SELECT * INTO expected FROM jsonb_populate_record(NULL::public.productos,to_jsonb(before_row)||v||jsonb_build_object('updated_at',now(),'updated_by',u.id));
  UPDATE public.productos SET nombre=expected.nombre,categoria=expected.categoria,grupo=expected.grupo,unidad_medida=expected.unidad_medida,presentacion_kg_l=expected.presentacion_kg_l,precio_por_presentacion=expected.precio_por_presentacion,precio_unitario=expected.precio_unitario,stock_minimo=expected.stock_minimo,estado=expected.estado,registro_ica=expected.registro_ica,blanco_biologico=expected.blanco_biologico,ingrediente_activo_1=expected.ingrediente_activo_1,concentracion_ia_1=expected.concentracion_ia_1,ingrediente_activo_2=expected.ingrediente_activo_2,concentracion_ia_2=expected.concentracion_ia_2,ingrediente_activo_3=expected.ingrediente_activo_3,concentracion_ia_3=expected.concentracion_ia_3,periodo_reingreso_horas=expected.periodo_reingreso_horas,periodo_carencia_dias=expected.periodo_carencia_dias,tipo_aplicacion=expected.tipo_aplicacion,estado_fisico=expected.estado_fisico,permitido_gerencia=expected.permitido_gerencia,nitrogeno=expected.nitrogeno,fosforo=expected.fosforo,potasio=expected.potasio,calcio=expected.calcio,magnesio=expected.magnesio,azufre=expected.azufre,hierro=expected.hierro,manganeso=expected.manganeso,zinc=expected.zinc,cobre=expected.cobre,boro=expected.boro,molibdeno=expected.molibdeno,carbono_organico=expected.carbono_organico,silicio=expected.silicio,sodio=expected.sodio,epp_alto_nivel=expected.epp_alto_nivel,riesgo_acuatico=expected.riesgo_acuatico,riesgo_vida_silvestre=expected.riesgo_vida_silvestre,riesgo_polinizador=expected.riesgo_polinizador,riesgo_transeunte=expected.riesgo_transeunte,link_ficha_tecnica=expected.link_ficha_tecnica,link_hoja_seguridad=expected.link_hoja_seguridad,updated_at=expected.updated_at,updated_by=expected.updated_by WHERE id=before_row.id;
 END IF;
 aud:=jsonb_build_object('actor',u.id,'request_key',p_request_key,'product_id',expected.id,'mode',p_payload->>'mode',
  'origin','catalog_rpc','before_row',CASE WHEN before_row.id IS NULL THEN NULL ELSE to_jsonb(before_row) END,'after_row',to_jsonb(expected),'created_at',now());
 INSERT INTO product_catalog_integrity.audit SELECT * FROM jsonb_populate_record(NULL::product_catalog_integrity.audit,aud);
 result:=jsonb_build_object('actor',u.id,'request_key',p_request_key,'payload',p_payload,'product',to_jsonb(expected),'movement_id',move.id,'audit',aud,'opening',proof);
 INSERT INTO product_catalog_integrity.requests(actor,request_key,payload,canceled,result) VALUES(u.id,p_request_key,p_payload,false,result);
 SELECT * INTO actual FROM public.productos WHERE id=expected.id;
 IF NOT FOUND OR to_jsonb(actual) IS DISTINCT FROM to_jsonb(expected)
  OR (SELECT to_jsonb(a) FROM product_catalog_integrity.audit a WHERE a.actor=u.id AND a.request_key=p_request_key) IS DISTINCT FROM aud THEN
  RAISE EXCEPTION 'Catalog product or audit did not persist exactly';END IF;
 IF p_payload->>'mode'='create' AND ((SELECT to_jsonb(o) FROM product_catalog_integrity.openings o WHERE o.actor=u.id AND o.request_key=p_request_key) IS DISTINCT FROM proof
  OR (move.id IS NOT NULL AND (SELECT to_jsonb(m) FROM public.movimientos_inventario m WHERE m.id=move.id) IS DISTINCT FROM to_jsonb(move))
  OR (SELECT count(*) FROM public.movimientos_inventario WHERE producto_id=expected.id)<>CASE WHEN move.id IS NULL THEN 0 ELSE 1 END) THEN
  RAISE EXCEPTION 'Catalog opening did not persist exactly';END IF;
 IF p_payload->>'mode'='edit' AND ((SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM public.movimientos_inventario m WHERE producto_id=before_row.id) IS DISTINCT FROM before_ledger
  OR (SELECT jsonb_agg(to_jsonb(o) ORDER BY request_key) FROM product_catalog_integrity.openings o WHERE product_id=before_row.id) IS DISTINCT FROM before_openings) THEN RAISE EXCEPTION 'Catalog edit altered inventory history';END IF;
 SELECT * INTO r FROM product_catalog_integrity.requests WHERE actor=u.id AND request_key=p_request_key;
 IF NOT FOUND OR r.payload IS DISTINCT FROM p_payload OR r.canceled IS DISTINCT FROM false OR r.result IS DISTINCT FROM result OR r.created_at IS DISTINCT FROM now() THEN
  RAISE EXCEPTION 'Catalog receipt did not persist exactly';END IF;
 RETURN result;
END $$;
CREATE FUNCTION public.fn_product_catalog_status(p_request_key uuid,p_payload jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE u public.usuarios;r product_catalog_integrity.requests;BEGIN
 u:=product_catalog_integrity.authorize();
 IF p_request_key IS NULL THEN RAISE EXCEPTION 'Request key required';END IF;
 PERFORM product_catalog_integrity.validate(p_payload);
 PERFORM pg_advisory_xact_lock(hashtextextended(u.id::text||':'||p_request_key::text,0));
 SELECT * INTO r FROM product_catalog_integrity.requests WHERE actor=u.id AND request_key=p_request_key;
 IF NOT FOUND THEN
  INSERT INTO product_catalog_integrity.requests(actor,request_key,payload,canceled,result) VALUES(u.id,p_request_key,p_payload,true,NULL);
  SELECT * INTO r FROM product_catalog_integrity.requests WHERE actor=u.id AND request_key=p_request_key;
  IF NOT FOUND OR r.payload IS DISTINCT FROM p_payload OR r.canceled IS DISTINCT FROM true OR r.result IS NOT NULL OR r.created_at IS DISTINCT FROM now() THEN RAISE EXCEPTION 'Catalog cancellation did not persist exactly';END IF;
 ELSIF r.payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'Changed catalog request';END IF;
 RETURN jsonb_build_object('actor',u.id,'request_key',p_request_key,'payload',p_payload,'committed',NOT r.canceled,'result',r.result);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA product_catalog_integrity FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_product_catalog_post(uuid,jsonb),public.fn_product_catalog_status(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_product_catalog_post(uuid,jsonb),public.fn_product_catalog_status(uuid,jsonb) TO authenticated;
COMMIT;
