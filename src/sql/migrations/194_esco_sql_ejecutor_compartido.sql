-- 194: Esco SQL — ejecutor compartido de consultas estructuradas.
-- ESCRITA, SIN APLICAR. Revisión D2 aprobada para implementación local el 2026-11-09.
-- Aplicación, deploy, secretos y ventana de indisponibilidad necesitan aprobación propia.
-- Preflight 2026-11-09: 294 ramas, ledger y respaldos sin ocupación de 194.
BEGIN;
CREATE SCHEMA esco_sql_privado;
ALTER DEFAULT PRIVILEGES IN SCHEMA esco_sql_privado REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
REVOKE ALL ON SCHEMA esco_sql_privado FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA esco_sql_privado TO authenticated, service_role;

CREATE FUNCTION esco_sql_privado.catalogo() RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $catalogo$
-- CATALOGO_GENERADO_INICIO
SELECT '{"version":1,"views":[{"name":"v_esco_aplicaciones","columns":[{"name":"aplicacion_id","type":"uuid","sql_type":"uuid"},{"name":"codigo_aplicacion","type":"text","sql_type":"text"},{"name":"nombre_aplicacion","type":"text","sql_type":"text"},{"name":"tipo","type":"text","sql_type":"text"},{"name":"estado","type":"text","sql_type":"text"},{"name":"estado_pantalla","type":"text","sql_type":"text"},{"name":"fecha_inicio_planeada","type":"date","sql_type":"date"},{"name":"fecha_fin_planeada","type":"date","sql_type":"date"},{"name":"fecha_inicio_ejecucion","type":"date","sql_type":"date"},{"name":"fecha_fin_ejecucion","type":"date","sql_type":"date"},{"name":"fecha_cierre","type":"date","sql_type":"date"},{"name":"lotes_planeados","type":"text","sql_type":"text"},{"name":"lotes_ejecutados","type":"text","sql_type":"text"},{"name":"costo_total_insumos","type":"numeric","sql_type":"numeric"},{"name":"costo_total_mano_obra","type":"numeric","sql_type":"numeric"},{"name":"costo_total","type":"numeric","sql_type":"numeric"},{"name":"jornales_utilizados","type":"numeric","sql_type":"numeric"}]},{"name":"v_esco_aplicaciones_productos","columns":[{"name":"aplicacion_id","type":"uuid","sql_type":"uuid"},{"name":"nombre_aplicacion","type":"text","sql_type":"text"},{"name":"estado","type":"text","sql_type":"text"},{"name":"producto_id","type":"uuid","sql_type":"uuid"},{"name":"producto","type":"text","sql_type":"text"},{"name":"unidad","type":"text","sql_type":"text"},{"name":"cantidad_planeada","type":"numeric","sql_type":"numeric"},{"name":"cantidad_real","type":"numeric","sql_type":"numeric"},{"name":"primera_fecha_real","type":"date","sql_type":"date"},{"name":"ultima_fecha_real","type":"date","sql_type":"date"}]},{"name":"v_esco_clima_diario","columns":[{"name":"fecha","type":"date","sql_type":"date"},{"name":"station_id","type":"text","sql_type":"text"},{"name":"temp_c_min","type":"numeric","sql_type":"numeric(5,2)"},{"name":"temp_c_max","type":"numeric","sql_type":"numeric(5,2)"},{"name":"temp_c_avg","type":"numeric","sql_type":"numeric(5,2)"},{"name":"humedad_pct_avg","type":"numeric","sql_type":"numeric(5,2)"},{"name":"lluvia_mm","type":"numeric","sql_type":"numeric"},{"name":"lluvia_estado","type":"text","sql_type":"text"},{"name":"viento_kmh_avg","type":"numeric","sql_type":"numeric(6,2)"},{"name":"rafaga_kmh_max","type":"numeric","sql_type":"numeric(6,2)"},{"name":"radiacion_wm2_avg","type":"numeric","sql_type":"numeric(8,2)"},{"name":"horas_sol_duracion","type":"numeric","sql_type":"numeric(5,2)"},{"name":"tiene_fila","type":"boolean","sql_type":"boolean"}]},{"name":"v_esco_gastos","columns":[{"name":"id","type":"uuid","sql_type":"uuid"},{"name":"fecha","type":"date","sql_type":"date"},{"name":"valor","type":"numeric","sql_type":"numeric"},{"name":"nombre","type":"text","sql_type":"text"},{"name":"negocio","type":"text","sql_type":"text"},{"name":"region","type":"text","sql_type":"text"},{"name":"categoria","type":"text","sql_type":"text"},{"name":"concepto","type":"text","sql_type":"text"},{"name":"proveedor","type":"text","sql_type":"text"}]},{"name":"v_esco_hato","columns":[{"name":"animal_id","type":"uuid","sql_type":"uuid"},{"name":"chapeta","type":"integer","sql_type":"integer"},{"name":"nombre","type":"text","sql_type":"text"},{"name":"etapa","type":"text","sql_type":"text"},{"name":"raza","type":"text","sql_type":"text"},{"name":"estado","type":"text","sql_type":"text"},{"name":"fecha_nacimiento","type":"date","sql_type":"date"},{"name":"num_partos","type":"bigint","sql_type":"bigint"},{"name":"ultimo_parto_fecha","type":"date","sql_type":"date"},{"name":"ultimo_servicio_fecha","type":"date","sql_type":"date"},{"name":"ultimo_tipo_servicio","type":"text","sql_type":"text"},{"name":"ultima_confirmacion_prenez_fecha","type":"date","sql_type":"date"},{"name":"ultima_confirmacion_prenez_metodo","type":"text","sql_type":"text"},{"name":"ultimo_aborto_fecha","type":"date","sql_type":"date"},{"name":"fecha_probable_parto","type":"date","sql_type":"date"},{"name":"fecha_secar","type":"date","sql_type":"date"},{"name":"ultimo_secado_real_fecha","type":"date","sql_type":"date"},{"name":"ultimo_estado_chequeo","type":"text","sql_type":"text"},{"name":"ultimo_chequeo_fecha","type":"date","sql_type":"date"},{"name":"pl","type":"numeric","sql_type":"numeric"},{"name":"estado_reproductivo","type":"text","sql_type":"text"},{"name":"estado_pantalla","type":"text","sql_type":"text"}]},{"name":"v_esco_hato_eventos","columns":[{"name":"evento_id","type":"uuid","sql_type":"uuid"},{"name":"animal_id","type":"uuid","sql_type":"uuid"},{"name":"chapeta","type":"integer","sql_type":"integer"},{"name":"nombre","type":"text","sql_type":"text"},{"name":"tipo","type":"text","sql_type":"text"},{"name":"fecha","type":"date","sql_type":"date"},{"name":"fecha_confianza","type":"text","sql_type":"text"},{"name":"tipo_servicio","type":"text","sql_type":"text"},{"name":"toro","type":"text","sql_type":"text"},{"name":"fuente","type":"text","sql_type":"text"}]},{"name":"v_esco_hato_pesajes","columns":[{"name":"pesaje_id","type":"uuid","sql_type":"uuid"},{"name":"animal_id","type":"uuid","sql_type":"uuid"},{"name":"chapeta","type":"integer","sql_type":"integer"},{"name":"nombre","type":"text","sql_type":"text"},{"name":"fecha","type":"date","sql_type":"date"},{"name":"litros","type":"numeric","sql_type":"numeric"},{"name":"fuente","type":"text","sql_type":"text"}]},{"name":"v_esco_hato_produccion_quincenal","columns":[{"name":"anio","type":"integer","sql_type":"integer"},{"name":"mes","type":"integer","sql_type":"integer"},{"name":"quincena","type":"integer","sql_type":"integer"},{"name":"fecha_inicio","type":"date","sql_type":"date"},{"name":"fecha_fin","type":"date","sql_type":"date"},{"name":"litros","type":"numeric","sql_type":"numeric"},{"name":"num_vacas_ordeno","type":"integer","sql_type":"integer"},{"name":"origen_dato","type":"text","sql_type":"text"}]},{"name":"v_esco_ingresos","columns":[{"name":"id","type":"uuid","sql_type":"uuid"},{"name":"fecha","type":"date","sql_type":"date"},{"name":"valor","type":"numeric","sql_type":"numeric"},{"name":"nombre","type":"text","sql_type":"text"},{"name":"negocio","type":"text","sql_type":"text"},{"name":"region","type":"text","sql_type":"text"},{"name":"categoria","type":"text","sql_type":"text"},{"name":"cantidad","type":"numeric","sql_type":"numeric"},{"name":"precio_unitario","type":"numeric","sql_type":"numeric(15,2)"},{"name":"cosecha","type":"text","sql_type":"text"},{"name":"cliente","type":"text","sql_type":"text"},{"name":"finca","type":"text","sql_type":"text"},{"name":"cabezas","type":"integer","sql_type":"integer"},{"name":"es_venta","type":"boolean","sql_type":"boolean"},{"name":"origen","type":"text","sql_type":"text"}]},{"name":"v_esco_inventario","columns":[{"name":"producto_id","type":"uuid","sql_type":"uuid"},{"name":"nombre","type":"text","sql_type":"text"},{"name":"categoria","type":"text","sql_type":"text"},{"name":"unidad","type":"text","sql_type":"text"},{"name":"cantidad_actual","type":"numeric","sql_type":"numeric(12,2)"},{"name":"stock_minimo","type":"numeric","sql_type":"numeric(12,2)"},{"name":"precio_unitario","type":"numeric","sql_type":"numeric(12,2)"},{"name":"estado","type":"text","sql_type":"text"},{"name":"activo","type":"boolean","sql_type":"boolean"}]},{"name":"v_esco_jornales","columns":[{"name":"registro_id","type":"uuid","sql_type":"uuid"},{"name":"fecha","type":"date","sql_type":"date"},{"name":"lote_id","type":"uuid","sql_type":"uuid"},{"name":"lote","type":"text","sql_type":"text"},{"name":"tarea_id","type":"uuid","sql_type":"uuid"},{"name":"tarea","type":"text","sql_type":"text"},{"name":"tipo_tarea","type":"text","sql_type":"text"},{"name":"tipo_persona","type":"text","sql_type":"text"},{"name":"persona","type":"text","sql_type":"text"},{"name":"jornales","type":"numeric","sql_type":"numeric"},{"name":"costo","type":"numeric","sql_type":"numeric"}]},{"name":"v_esco_monitoreo","columns":[{"name":"ronda_id","type":"uuid","sql_type":"uuid"},{"name":"ronda","type":"text","sql_type":"text"},{"name":"ronda_inicio","type":"date","sql_type":"date"},{"name":"ronda_fin","type":"date","sql_type":"date"},{"name":"lote_id","type":"uuid","sql_type":"uuid"},{"name":"lote","type":"text","sql_type":"text"},{"name":"sublote_id","type":"uuid","sql_type":"uuid"},{"name":"sublote","type":"text","sql_type":"text"},{"name":"plaga_enfermedad_id","type":"uuid","sql_type":"uuid"},{"name":"plaga","type":"text","sql_type":"text"},{"name":"tipo_plaga","type":"text","sql_type":"text"},{"name":"fecha_primera","type":"date","sql_type":"date"},{"name":"fecha_ultima","type":"date","sql_type":"date"},{"name":"arboles_afectados","type":"bigint","sql_type":"bigint"},{"name":"arboles_monitoreados","type":"bigint","sql_type":"bigint"},{"name":"incidencia_pct","type":"numeric","sql_type":"numeric"},{"name":"n_observaciones","type":"bigint","sql_type":"bigint"},{"name":"ronda_orden","type":"integer","sql_type":"integer"},{"name":"es_ultima_ronda","type":"boolean","sql_type":"boolean"}]},{"name":"v_esco_monitoreo_ronda_plaga","columns":[{"name":"ronda_id","type":"uuid","sql_type":"uuid"},{"name":"ronda","type":"text","sql_type":"text"},{"name":"ronda_inicio","type":"date","sql_type":"date"},{"name":"ronda_fin","type":"date","sql_type":"date"},{"name":"ronda_orden","type":"integer","sql_type":"integer"},{"name":"es_ultima_ronda","type":"boolean","sql_type":"boolean"},{"name":"plaga_enfermedad_id","type":"uuid","sql_type":"uuid"},{"name":"plaga","type":"text","sql_type":"text"},{"name":"tipo_plaga","type":"text","sql_type":"text"},{"name":"arboles_afectados","type":"numeric","sql_type":"numeric"},{"name":"arboles_monitoreados","type":"numeric","sql_type":"numeric"},{"name":"incidencia_pct","type":"numeric","sql_type":"numeric"},{"name":"n_lotes","type":"bigint","sql_type":"bigint"},{"name":"n_observaciones","type":"numeric","sql_type":"numeric"}]},{"name":"v_esco_produccion","columns":[{"name":"lote_id","type":"uuid","sql_type":"uuid"},{"name":"lote","type":"text","sql_type":"text"},{"name":"ano","type":"integer","sql_type":"integer"},{"name":"cosecha_tipo","type":"text","sql_type":"text"},{"name":"kg_totales","type":"numeric","sql_type":"numeric"},{"name":"arboles_registrados","type":"bigint","sql_type":"bigint"},{"name":"kg_por_arbol","type":"numeric","sql_type":"numeric"},{"name":"kg_exportacion","type":"numeric","sql_type":"numeric"},{"name":"kg_nacional","type":"numeric","sql_type":"numeric"},{"name":"nivel","type":"text","sql_type":"text"}]}]}'::jsonb;
-- CATALOGO_GENERADO_FIN
$catalogo$;

CREATE FUNCTION esco_sql_privado.claves(p jsonb, permitidas text[], requeridas text[]) RETURNS void
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $fn$
BEGIN
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'nodo_no_admitido' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT FROM jsonb_object_keys(p) k WHERE NOT k = ANY(permitidas))
    OR EXISTS (SELECT FROM unnest(requeridas) k WHERE NOT p ? k) THEN
    RAISE EXCEPTION 'nodo_no_admitido' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT FROM jsonb_each(p) e WHERE e.key = ANY(ARRAY['kind','type','name','alias','fn','op','to','field','unit','direction','nulls']) AND jsonb_typeof(e.value) IS DISTINCT FROM 'string') THEN
    RAISE EXCEPTION 'tipo_no_admitido' USING ERRCODE='22023';
  END IF;
END $fn$;

CREATE FUNCTION esco_sql_privado.identificador(p text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $fn$
BEGIN
  IF p IS NULL OR p='' OR octet_length(p)>63 OR p ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'nodo_no_admitido' USING ERRCODE='22023'; END IF;
  RETURN quote_ident(p);
END $fn$;

CREATE FUNCTION esco_sql_privado.tipo(p text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE t text;
BEGIN
  t := CASE p WHEN 'boolean' THEN 'bool' WHEN 'integer' THEN 'int4' WHEN 'bigint' THEN 'int8'
    WHEN 'numeric' THEN 'numeric' WHEN 'text' THEN 'text' WHEN 'date' THEN 'date'
    WHEN 'timestamptz' THEN 'timestamptz' WHEN 'timestamp' THEN 'timestamp' WHEN 'uuid' THEN 'uuid' WHEN 'interval' THEN 'interval' END;
  IF t IS NULL THEN RAISE EXCEPTION 'tipo_no_admitido' USING ERRCODE='22023'; END IF;
  RETURN 'pg_catalog.' || t;
END $fn$;

CREATE FUNCTION esco_sql_privado.estructura(p jsonb, profundidad integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = pg_catalog, esco_sql_privado, pg_temp AS $fn$
DECLARE n integer:=0; c integer:=0; r integer:=0; v jsonb; s jsonb;
BEGIN
  IF profundidad>12 THEN RAISE EXCEPTION 'limite_excedido' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(p)='object' THEN
    n:=1;
    IF jsonb_typeof(p->'with')='array' THEN c:=jsonb_array_length(p->'with'); END IF;
    IF p->>'kind' IN ('view','cte','subquery') THEN r:=1; END IF;
    FOR v IN SELECT value FROM jsonb_each(p) LOOP
      s:=esco_sql_privado.estructura(v,profundidad+1); n:=n+(s->>'n')::integer; c:=c+(s->>'c')::integer; r:=r+(s->>'r')::integer;
    END LOOP;
  ELSIF jsonb_typeof(p)='array' THEN
    FOR v IN SELECT value FROM jsonb_array_elements(p) LOOP
      s:=esco_sql_privado.estructura(v,profundidad); n:=n+(s->>'n')::integer; c:=c+(s->>'c')::integer; r:=r+(s->>'r')::integer;
    END LOOP;
  END IF;
  IF n>256 OR c>4 OR r>8 THEN RAISE EXCEPTION 'limite_excedido' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('n',n,'c',c,'r',r);
END $fn$;

CREATE FUNCTION esco_sql_privado.parametros(p jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = pg_catalog, esco_sql_privado, pg_temp AS $fn$
DECLARE e jsonb; t text; v text; numero numeric; fecha date; instante timestamptz; sin_zona timestamp; id uuid;
BEGIN
  IF jsonb_typeof(p) IS DISTINCT FROM 'array' OR jsonb_array_length(p)>200 THEN RAISE EXCEPTION 'limite_excedido' USING ERRCODE='22023'; END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(p) LOOP
    PERFORM esco_sql_privado.claves(e,ARRAY['type','value'],ARRAY['type','value']);
    t:=e->>'type'; PERFORM esco_sql_privado.tipo(t);
    IF t='boolean' THEN
      IF jsonb_typeof(e->'value') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'tipo_no_admitido' USING ERRCODE='22023'; END IF;
    ELSIF t='interval' THEN
      PERFORM esco_sql_privado.claves(e->'value',ARRAY['quantity','unit'],ARRAY['quantity','unit']);
      IF e->'value'->>'unit' NOT IN ('year','month','week','day','hour','minute','second') OR jsonb_typeof(e->'value'->'quantity') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'tipo_no_admitido' USING ERRCODE='22023'; END IF;
      v:=e->'value'->>'quantity';
      IF length(v)>50 OR v !~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]{1,3})?$' THEN RAISE EXCEPTION 'tipo_no_admitido' USING ERRCODE='22023'; END IF;
      numero:=v::numeric;
      IF abs(numero)>1000000 THEN RAISE EXCEPTION 'limite_excedido' USING ERRCODE='22023'; END IF;
    ELSE
      IF jsonb_typeof(e->'value') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'tipo_no_admitido' USING ERRCODE='22023'; END IF;
      v:=e->>'value';
      IF length(v)>4000 THEN RAISE EXCEPTION 'limite_excedido' USING ERRCODE='22023'; END IF;
      IF t IN ('integer','bigint','numeric') THEN
        IF length(v)>100 OR v !~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]{1,3})?$' THEN RAISE EXCEPTION 'tipo_no_admitido' USING ERRCODE='22023'; END IF;
        numero:=v::numeric;
        IF abs(numero)>1e100 THEN RAISE EXCEPTION 'limite_excedido' USING ERRCODE='22023'; END IF;
        IF t IN ('integer','bigint') AND v !~ '^[+-]?[0-9]+$' THEN RAISE EXCEPTION 'tipo_no_admitido' USING ERRCODE='22023'; END IF;
        IF t='integer' THEN
          IF numero<>trunc(numero) OR numero< -2147483648 OR numero>2147483647 THEN RAISE EXCEPTION 'tipo_no_admitido' USING ERRCODE='22023'; END IF;
        ELSIF t='bigint' THEN
          IF numero<>trunc(numero) OR numero< -9223372036854775808 OR numero>9223372036854775807 THEN RAISE EXCEPTION 'tipo_no_admitido' USING ERRCODE='22023'; END IF;
        END IF;
      ELSIF t='date' THEN
        IF v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'tipo_no_admitido' USING ERRCODE='22023'; END IF;
        fecha:=v::date;
      ELSIF t='timestamp' THEN
        IF v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?$' THEN RAISE EXCEPTION 'tipo_no_admitido' USING ERRCODE='22023'; END IF;
        sin_zona:=v::timestamp;
      ELSIF t='timestamptz' THEN
        IF v !~* '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' THEN RAISE EXCEPTION 'tipo_no_admitido' USING ERRCODE='22023'; END IF;
        instante:=v::timestamptz;
      ELSIF t='uuid' THEN
        IF v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'tipo_no_admitido' USING ERRCODE='22023'; END IF;
        id:=v::uuid;
      END IF;
    END IF;
  END LOOP;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow OR invalid_datetime_format THEN
  RAISE EXCEPTION 'tipo_no_admitido' USING ERRCODE='22023';
END $fn$;

CREATE FUNCTION esco_sql_privado.expresion(p jsonb, ambito jsonb, parametros jsonb, salidas jsonb, permite_salida boolean, permite_agregado boolean, profundidad integer DEFAULT 0) RETURNS text
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog, esco_sql_privado, pg_temp AS $fn$
DECLARE k text; op text; fn text; a text; b text; s text; argumentos text[]:=ARRAY[]::text[]; e jsonb; i integer; j jsonb; alias text;
BEGIN
  IF profundidad>12 THEN RAISE EXCEPTION 'limite_excedido' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'nodo_no_admitido' USING ERRCODE='22023'; END IF;
  k:=p->>'kind';
  CASE k
  WHEN 'column' THEN
    PERFORM esco_sql_privado.claves(p,ARRAY['kind','source','name'],ARRAY['kind','source','name']);
    IF jsonb_typeof(p->'source') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'tipo_no_admitido' USING ERRCODE='22023'; END IF;
    IF NOT (ambito ? (p->>'source')) OR NOT (ambito->(p->>'source') ? (p->>'name')) THEN RAISE EXCEPTION 'columna_no_admitida' USING ERRCODE='22023'; END IF;
    RETURN esco_sql_privado.identificador(p->>'source')||'.'||esco_sql_privado.identificador(p->>'name');
  WHEN 'output' THEN
    PERFORM esco_sql_privado.claves(p,ARRAY['kind','name'],ARRAY['kind','name']);
    IF NOT permite_salida OR NOT (salidas ? (p->>'name')) THEN RAISE EXCEPTION 'columna_no_admitida' USING ERRCODE='22023'; END IF;
    RETURN esco_sql_privado.identificador(p->>'name');
  WHEN 'null' THEN
    PERFORM esco_sql_privado.claves(p,ARRAY['kind'],ARRAY['kind']); RETURN 'NULL';
  WHEN 'param' THEN
    PERFORM esco_sql_privado.claves(p,ARRAY['kind','index'],ARRAY['kind','index']);
    IF jsonb_typeof(p->'index') IS DISTINCT FROM 'number' OR (p->>'index')::numeric<>trunc((p->>'index')::numeric) OR (p->>'index')::numeric<0 OR (p->>'index')::numeric>=jsonb_array_length(parametros) THEN RAISE EXCEPTION 'tipo_no_admitido' USING ERRCODE='22023'; END IF;
    i:=(p->>'index')::integer; j:=parametros->i;
    IF j->>'type'='interval' THEN RETURN format('((($1::pg_catalog.jsonb -> %s -> ''value'' ->> ''quantity'')::pg_catalog.numeric) OPERATOR(pg_catalog.*) INTERVAL %L)',i,'1 '||(j->'value'->>'unit')); END IF;
    RETURN format('(($1::pg_catalog.jsonb -> %s ->> ''value'')::%s)',i,esco_sql_privado.tipo(j->>'type'));
  WHEN 'binary' THEN
    PERFORM esco_sql_privado.claves(p,ARRAY['kind','op','left','right'],ARRAY['kind','op','left','right']);
    op:=p->>'op';
    IF op NOT IN ('=','<>','<','<=','>','>=','+','-','*','/','%','and','or','like','not like','ilike','not ilike') OR op IS NULL THEN RAISE EXCEPTION 'nodo_no_admitido' USING ERRCODE='22023'; END IF;
    a:=esco_sql_privado.expresion(p->'left',ambito,parametros,salidas,permite_salida,permite_agregado,profundidad+1);
    b:=esco_sql_privado.expresion(p->'right',ambito,parametros,salidas,permite_salida,permite_agregado,profundidad+1);
    IF op IN ('and','or') THEN RETURN '('||a||' '||upper(op)||' '||b||')'; END IF;
    op:=CASE op WHEN 'like' THEN '~~' WHEN 'not like' THEN '!~~' WHEN 'ilike' THEN '~~*' WHEN 'not ilike' THEN '!~~*' ELSE op END;
    RETURN '('||a||' OPERATOR(pg_catalog.'||op||') '||b||')';
  WHEN 'unary' THEN
    PERFORM esco_sql_privado.claves(p,ARRAY['kind','op','arg'],ARRAY['kind','op','arg']); op:=p->>'op';
    IF op NOT IN ('not','+','-') OR op IS NULL THEN RAISE EXCEPTION 'nodo_no_admitido' USING ERRCODE='22023'; END IF;
    a:=esco_sql_privado.expresion(p->'arg',ambito,parametros,salidas,permite_salida,permite_agregado,profundidad+1);
    IF op='not' THEN RETURN '(NOT '||a||')'; END IF;
    RETURN '( OPERATOR(pg_catalog.'||op||') '||a||')';
  WHEN 'is_null' THEN
    PERFORM esco_sql_privado.claves(p,ARRAY['kind','arg','not'],ARRAY['kind','arg','not']);
    IF jsonb_typeof(p->'not') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'tipo_no_admitido' USING ERRCODE='22023'; END IF;
    RETURN '('||esco_sql_privado.expresion(p->'arg',ambito,parametros,salidas,permite_salida,permite_agregado,profundidad+1)||CASE WHEN (p->>'not')::boolean THEN ' IS NOT NULL)' ELSE ' IS NULL)' END;
  WHEN 'in' THEN
    PERFORM esco_sql_privado.claves(p,ARRAY['kind','arg','values','not'],ARRAY['kind','arg','values','not']);
    IF jsonb_typeof(p->'not') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p->'values') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'values')<1 OR jsonb_array_length(p->'values')>200 THEN RAISE EXCEPTION 'nodo_no_admitido' USING ERRCODE='22023'; END IF;
    a:=esco_sql_privado.expresion(p->'arg',ambito,parametros,salidas,permite_salida,permite_agregado,profundidad+1);
    FOR e IN SELECT value FROM jsonb_array_elements(p->'values') LOOP argumentos:=array_append(argumentos,esco_sql_privado.expresion(e,ambito,parametros,salidas,permite_salida,permite_agregado,profundidad+1)); END LOOP;
    RETURN '('||a||CASE WHEN (p->>'not')::boolean THEN ' NOT IN (' ELSE ' IN (' END||array_to_string(argumentos,',')||'))';
  WHEN 'case' THEN
    PERFORM esco_sql_privado.claves(p,ARRAY['kind','branches','else'],ARRAY['kind','branches','else']);
    IF jsonb_typeof(p->'branches') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'branches')<1 OR jsonb_array_length(p->'branches')>32 THEN RAISE EXCEPTION 'nodo_no_admitido' USING ERRCODE='22023'; END IF;
    s:='CASE';
    FOR e IN SELECT value FROM jsonb_array_elements(p->'branches') LOOP
      PERFORM esco_sql_privado.claves(e,ARRAY['when','then'],ARRAY['when','then']);
      s:=s||' WHEN '||esco_sql_privado.expresion(e->'when',ambito,parametros,salidas,permite_salida,permite_agregado,profundidad+1)||' THEN '||esco_sql_privado.expresion(e->'then',ambito,parametros,salidas,permite_salida,permite_agregado,profundidad+1);
    END LOOP;
    RETURN '('||s||' ELSE '||esco_sql_privado.expresion(p->'else',ambito,parametros,salidas,permite_salida,permite_agregado,profundidad+1)||' END)';
  WHEN 'call' THEN
    PERFORM esco_sql_privado.claves(p,ARRAY['kind','fn','args'],ARRAY['kind','fn','args']); fn:=p->>'fn';
    IF fn NOT IN ('abs','round','lower','upper','btrim','coalesce','nullif') OR fn IS NULL OR jsonb_typeof(p->'args') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'nodo_no_admitido' USING ERRCODE='22023'; END IF;
    i:=jsonb_array_length(p->'args');
    IF (fn IN ('abs','lower','upper') AND i<>1) OR (fn IN ('round','btrim') AND i NOT IN (1,2)) OR (fn='nullif' AND i<>2) OR (fn='coalesce' AND (i<2 OR i>32)) THEN RAISE EXCEPTION 'nodo_no_admitido' USING ERRCODE='22023'; END IF;
    FOR e IN SELECT value FROM jsonb_array_elements(p->'args') LOOP argumentos:=array_append(argumentos,esco_sql_privado.expresion(e,ambito,parametros,salidas,permite_salida,permite_agregado,profundidad+1)); END LOOP;
    RETURN CASE WHEN fn IN ('coalesce','nullif') THEN upper(fn) ELSE 'pg_catalog.'||fn END||'('||array_to_string(argumentos,',')||')';
  WHEN 'aggregate' THEN
    PERFORM esco_sql_privado.claves(p,ARRAY['kind','fn','args','star','distinct','filter'],ARRAY['kind','fn','args','star','distinct']); fn:=p->>'fn';
    IF NOT permite_agregado OR fn NOT IN ('count','sum','avg','min','max') OR fn IS NULL OR jsonb_typeof(p->'args') IS DISTINCT FROM 'array' OR jsonb_typeof(p->'star') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p->'distinct') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'nodo_no_admitido' USING ERRCODE='22023'; END IF;
    IF (p->>'star')::boolean THEN
      IF fn<>'count' OR (p->>'distinct')::boolean OR jsonb_array_length(p->'args')<>0 THEN RAISE EXCEPTION 'nodo_no_admitido' USING ERRCODE='22023'; END IF;
      s:='pg_catalog.count(*)';
    ELSE
      IF jsonb_array_length(p->'args')<>1 THEN RAISE EXCEPTION 'nodo_no_admitido' USING ERRCODE='22023'; END IF;
      s:='pg_catalog.'||fn||'('||CASE WHEN (p->>'distinct')::boolean THEN 'DISTINCT ' ELSE '' END||esco_sql_privado.expresion(p->'args'->0,ambito,parametros,salidas,false,false,profundidad+1)||')';
    END IF;
    IF p ? 'filter' THEN s:=s||' FILTER (WHERE '||esco_sql_privado.expresion(p->'filter',ambito,parametros,salidas,false,false,profundidad+1)||')'; END IF;
    RETURN s;
  WHEN 'cast' THEN
    PERFORM esco_sql_privado.claves(p,ARRAY['kind','arg','to'],ARRAY['kind','arg','to']);
    IF p->>'to'='interval' THEN RAISE EXCEPTION 'tipo_no_admitido' USING ERRCODE='22023'; END IF;
    RETURN 'CAST('||esco_sql_privado.expresion(p->'arg',ambito,parametros,salidas,permite_salida,permite_agregado,profundidad+1)||' AS '||esco_sql_privado.tipo(p->>'to')||')';
  WHEN 'date_trunc' THEN
    PERFORM esco_sql_privado.claves(p,ARRAY['kind','unit','arg'],ARRAY['kind','unit','arg']);
    IF p->>'unit' NOT IN ('year','quarter','month','week','day','hour','minute','second') OR p->>'unit' IS NULL THEN RAISE EXCEPTION 'tipo_no_admitido' USING ERRCODE='22023'; END IF;
    RETURN format('pg_catalog.date_trunc(%L,%s)',p->>'unit',esco_sql_privado.expresion(p->'arg',ambito,parametros,salidas,permite_salida,permite_agregado,profundidad+1));
  WHEN 'extract' THEN
    PERFORM esco_sql_privado.claves(p,ARRAY['kind','field','arg'],ARRAY['kind','field','arg']);
    IF p->>'field' NOT IN ('year','quarter','month','week','day','dow','doy','hour','minute','second','epoch') OR p->>'field' IS NULL THEN RAISE EXCEPTION 'tipo_no_admitido' USING ERRCODE='22023'; END IF;
    RETURN 'EXTRACT('||upper(p->>'field')||' FROM '||esco_sql_privado.expresion(p->'arg',ambito,parametros,salidas,permite_salida,permite_agregado,profundidad+1)||')';
  ELSE RAISE EXCEPTION 'nodo_no_admitido' USING ERRCODE='22023';
  END CASE;
END $fn$;

CREATE FUNCTION esco_sql_privado.fuente(p jsonb, ctes jsonb, parametros jsonb, profundidad integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog, esco_sql_privado, pg_temp AS $fn$
DECLARE k text; n text; a text; vista jsonb; c jsonb; columnas jsonb:='[]'::jsonb; proyecciones text[]:=ARRAY[]::text[]; q jsonb; s text;
BEGIN
  IF profundidad>12 THEN RAISE EXCEPTION 'limite_excedido' USING ERRCODE='22023'; END IF;
  k:=p->>'kind'; a:=esco_sql_privado.identificador(p->>'alias');
  IF k='view' THEN
    PERFORM esco_sql_privado.claves(p,ARRAY['kind','name','alias'],ARRAY['kind','name','alias']); n:=p->>'name';
    SELECT value INTO vista FROM jsonb_array_elements(esco_sql_privado.catalogo()->'views') WHERE value->>'name'=n;
    IF vista IS NULL THEN RAISE EXCEPTION 'relacion_no_admitida' USING ERRCODE='22023'; END IF;
    FOR c IN SELECT value FROM jsonb_array_elements(vista->'columns') LOOP
      IF NOT EXISTS (SELECT FROM pg_attribute att JOIN pg_class rel ON rel.oid=att.attrelid JOIN pg_namespace ns ON ns.oid=rel.relnamespace WHERE ns.nspname='public' AND rel.relname=n AND rel.relkind='v' AND rel.reloptions @> ARRAY['security_invoker=true'] AND att.atttypid=to_regtype(esco_sql_privado.tipo(c->>'type')) AND att.attname=c->>'name' AND att.attnum>0 AND NOT att.attisdropped) THEN RAISE EXCEPTION 'columna_no_admitida' USING ERRCODE='22023'; END IF;
      columnas:=columnas||jsonb_build_array(c->>'name');
      proyecciones:=array_append(proyecciones,format('CAST(%I AS %s) AS %I',c->>'name',esco_sql_privado.tipo(c->>'type'),c->>'name'));
    END LOOP;
    s:='(SELECT '||array_to_string(proyecciones,',')||' FROM public.'||quote_ident(n)||') AS '||a;
  ELSIF k='cte' THEN
    PERFORM esco_sql_privado.claves(p,ARRAY['kind','name','alias'],ARRAY['kind','name','alias']); n:=p->>'name';
    IF NOT ctes ? n THEN RAISE EXCEPTION 'relacion_no_admitida' USING ERRCODE='22023'; END IF;
    columnas:=ctes->n; s:=esco_sql_privado.identificador(n)||' AS '||a;
  ELSIF k='subquery' THEN
    PERFORM esco_sql_privado.claves(p,ARRAY['kind','query','alias'],ARRAY['kind','query','alias']);
    q:=esco_sql_privado.consulta(p->'query',ctes,parametros,profundidad+1); columnas:=q->'columns'; s:='('||(q->>'sql')||') AS '||a;
  ELSE RAISE EXCEPTION 'nodo_no_admitido' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('sql',s,'columns',columnas,'alias',p->>'alias');
END $fn$;

CREATE FUNCTION esco_sql_privado.consulta(p jsonb, ctes_externas jsonb, parametros jsonb, profundidad integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog, esco_sql_privado, pg_temp AS $fn$
DECLARE ctes jsonb:=ctes_externas; ambito jsonb:='{}'::jsonb; salidas jsonb:='[]'::jsonb; body jsonb; e jsonb; q jsonb; f jsonb; izq jsonb; der jsonb; con text[]:=ARRAY[]::text[]; proyecciones text[]:=ARRAY[]::text[]; grupos text[]:=ARRAY[]::text[]; ordenes text[]:=ARRAY[]::text[]; s text; nombre text; direccion text; nulos text; n numeric;
BEGIN
  IF profundidad>12 THEN RAISE EXCEPTION 'limite_excedido' USING ERRCODE='22023'; END IF;
  PERFORM esco_sql_privado.claves(p,ARRAY['with','body','orderBy','limit','offset'],ARRAY['with','body','orderBy']);
  IF jsonb_typeof(p->'with') IS DISTINCT FROM 'array' OR jsonb_typeof(p->'orderBy') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'nodo_no_admitido' USING ERRCODE='22023'; END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(p->'with') LOOP
    PERFORM esco_sql_privado.claves(e,ARRAY['name','query'],ARRAY['name','query']); nombre:=e->>'name'; PERFORM esco_sql_privado.identificador(nombre);
    IF ctes ? nombre THEN RAISE EXCEPTION 'nodo_no_admitido' USING ERRCODE='22023'; END IF;
    q:=esco_sql_privado.consulta(e->'query',ctes,parametros,profundidad+1);
    ctes:=ctes||jsonb_build_object(nombre,q->'columns'); con:=array_append(con,quote_ident(nombre)||' AS ('||(q->>'sql')||')');
  END LOOP;
  body:=p->'body';
  IF body->>'kind'='select' THEN
    PERFORM esco_sql_privado.claves(body,ARRAY['kind','distinct','columns','from','joins','where','groupBy','having'],ARRAY['kind','distinct','columns','joins','groupBy']);
    IF jsonb_typeof(body->'distinct') IS DISTINCT FROM 'boolean' OR jsonb_typeof(body->'columns') IS DISTINCT FROM 'array' OR jsonb_array_length(body->'columns')<1 OR jsonb_array_length(body->'columns')>32 OR jsonb_typeof(body->'joins') IS DISTINCT FROM 'array' OR jsonb_typeof(body->'groupBy') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'nodo_no_admitido' USING ERRCODE='22023'; END IF;
    s:='';
    IF body ? 'from' THEN
      f:=esco_sql_privado.fuente(body->'from',ctes,parametros,profundidad+1); ambito:=jsonb_build_object(f->>'alias',f->'columns'); s:=' FROM '||(f->>'sql');
    ELSIF jsonb_array_length(body->'joins')>0 THEN RAISE EXCEPTION 'nodo_no_admitido' USING ERRCODE='22023'; END IF;
    FOR e IN SELECT value FROM jsonb_array_elements(body->'joins') LOOP
      PERFORM esco_sql_privado.claves(e,ARRAY['type','source','on'],ARRAY['type','source','on']);
      IF e->>'type' NOT IN ('inner','left') OR e->>'type' IS NULL THEN RAISE EXCEPTION 'nodo_no_admitido' USING ERRCODE='22023'; END IF;
      f:=esco_sql_privado.fuente(e->'source',ctes,parametros,profundidad+1);
      IF ambito ? (f->>'alias') THEN RAISE EXCEPTION 'nodo_no_admitido' USING ERRCODE='22023'; END IF;
      ambito:=ambito||jsonb_build_object(f->>'alias',f->'columns');
      s:=s||' '||upper(e->>'type')||' JOIN '||(f->>'sql')||' ON '||esco_sql_privado.expresion(e->'on',ambito,parametros,'[]',false,false,profundidad+1);
    END LOOP;
    FOR e IN SELECT value FROM jsonb_array_elements(body->'columns') LOOP
      PERFORM esco_sql_privado.claves(e,ARRAY['expr','alias'],ARRAY['expr','alias']); nombre:=e->>'alias'; PERFORM esco_sql_privado.identificador(nombre);
      IF salidas ? nombre THEN RAISE EXCEPTION 'nodo_no_admitido' USING ERRCODE='22023'; END IF;
      salidas:=salidas||jsonb_build_array(nombre);
      proyecciones:=array_append(proyecciones,esco_sql_privado.expresion(e->'expr',ambito,parametros,'[]',false,true,profundidad+1)||' AS '||quote_ident(nombre));
    END LOOP;
    s:='SELECT '||CASE WHEN (body->>'distinct')::boolean THEN 'DISTINCT ' ELSE '' END||array_to_string(proyecciones,',')||s;
    IF body ? 'where' THEN s:=s||' WHERE '||esco_sql_privado.expresion(body->'where',ambito,parametros,'[]',false,false,profundidad+1); END IF;
    FOR e IN SELECT value FROM jsonb_array_elements(body->'groupBy') LOOP grupos:=array_append(grupos,esco_sql_privado.expresion(e,ambito,parametros,salidas,true,false,profundidad+1)); END LOOP;
    IF cardinality(grupos)>0 THEN s:=s||' GROUP BY '||array_to_string(grupos,','); END IF;
    IF body ? 'having' THEN s:=s||' HAVING '||esco_sql_privado.expresion(body->'having',ambito,parametros,'[]',false,true,profundidad+1); END IF;
  ELSIF body->>'kind'='union_all' THEN
    PERFORM esco_sql_privado.claves(body,ARRAY['kind','left','right'],ARRAY['kind','left','right']);
    izq:=esco_sql_privado.consulta(body->'left',ctes,parametros,profundidad+1); der:=esco_sql_privado.consulta(body->'right',ctes,parametros,profundidad+1);
    IF jsonb_array_length(izq->'columns')<>jsonb_array_length(der->'columns') THEN RAISE EXCEPTION 'nodo_no_admitido' USING ERRCODE='22023'; END IF;
    salidas:=izq->'columns'; s:='SELECT * FROM (('||(izq->>'sql')||') UNION ALL ('||(der->>'sql')||')) AS "__esco_union"';
  ELSE RAISE EXCEPTION 'nodo_no_admitido' USING ERRCODE='22023'; END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(p->'orderBy') LOOP
    PERFORM esco_sql_privado.claves(e,ARRAY['expr','direction','nulls'],ARRAY['expr','direction','nulls']); direccion:=e->>'direction'; nulos:=e->>'nulls';
    IF direccion NOT IN ('asc','desc') OR direccion IS NULL OR nulos NOT IN ('first','last') OR nulos IS NULL THEN RAISE EXCEPTION 'nodo_no_admitido' USING ERRCODE='22023'; END IF;
    ordenes:=array_append(ordenes,esco_sql_privado.expresion(e->'expr',ambito,parametros,salidas,true,true,profundidad+1)||' '||upper(direccion)||' NULLS '||upper(nulos));
  END LOOP;
  IF cardinality(ordenes)>0 THEN s:=s||' ORDER BY '||array_to_string(ordenes,','); END IF;
  IF p ? 'limit' THEN
    n:=(p->>'limit')::numeric;
    IF jsonb_typeof(p->'limit') IS DISTINCT FROM 'number' OR n<0 OR n>501 OR n<>trunc(n) THEN RAISE EXCEPTION 'limite_excedido' USING ERRCODE='22023'; END IF;
    s:=s||' LIMIT '||n::integer;
  END IF;
  IF p ? 'offset' THEN
    n:=(p->>'offset')::numeric;
    IF jsonb_typeof(p->'offset') IS DISTINCT FROM 'number' OR n<0 OR n>100000 OR n<>trunc(n) THEN RAISE EXCEPTION 'limite_excedido' USING ERRCODE='22023'; END IF;
    s:=s||' OFFSET '||n::integer;
  END IF;
  IF cardinality(con)>0 THEN s:='WITH '||array_to_string(con,',')||' '||s; END IF;
  RETURN jsonb_build_object('sql',s,'columns',salidas);
END $fn$;

CREATE FUNCTION esco_sql_privado.compilar_consulta(p_consulta jsonb) RETURNS text
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog, esco_sql_privado, pg_temp AS $fn$
BEGIN
  IF octet_length(p_consulta::text)>65536 THEN RAISE EXCEPTION 'limite_excedido' USING ERRCODE='22023'; END IF;
  PERFORM esco_sql_privado.claves(p_consulta,ARRAY['version','query','params'],ARRAY['version','query','params']);
  IF p_consulta->'version' IS DISTINCT FROM '1'::jsonb THEN RAISE EXCEPTION 'version_no_admitida' USING ERRCODE='22023'; END IF;
  PERFORM esco_sql_privado.estructura(p_consulta);
  PERFORM esco_sql_privado.parametros(p_consulta->'params');
  RETURN esco_sql_privado.consulta(p_consulta->'query','{}',p_consulta->'params')->>'sql';
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow OR invalid_datetime_format THEN
  RAISE EXCEPTION 'tipo_no_admitido' USING ERRCODE='22023';
END $fn$;

CREATE FUNCTION public.esco_sql_consultar_v1(p_consulta jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, esco_sql_privado, pg_temp AS $fn$
DECLARE sql_compilado text; filas jsonb; n integer;
BEGIN
  IF (SELECT public.get_user_role()) IS DISTINCT FROM 'Gerencia' THEN RAISE EXCEPTION 'solo_gerencia_activa' USING ERRCODE='42501'; END IF;
  sql_compilado:=esco_sql_privado.compilar_consulta(p_consulta);
  SET LOCAL transaction_read_only=on;
  EXECUTE 'SELECT coalesce(jsonb_agg(to_jsonb(f)),''[]''::jsonb) FROM (SELECT * FROM ('||sql_compilado||') AS q LIMIT 501) AS f'
    INTO filas USING p_consulta->'params';
  n:=jsonb_array_length(filas);
  IF n>500 THEN filas:=filas-500; END IF;
  RETURN jsonb_build_object('filas',filas,'n_filas',least(n,500),'truncado',n>500);
END $fn$;

CREATE FUNCTION public.esco_sql_consultar_actor_v1(p_usuario uuid,p_consulta jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE rol_anterior text:=current_user; claims_anteriores text:=current_setting('request.jwt.claims',true); sub_anterior text:=current_setting('request.jwt.claim.sub',true); role_anterior text:=current_setting('request.jwt.claim.role',true); resultado jsonb;
BEGIN
  IF current_user<>'service_role' OR p_usuario IS NULL THEN RAISE EXCEPTION 'solo_servicio' USING ERRCODE='42501'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_usuario,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',p_usuario::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  SET LOCAL ROLE authenticated;
  resultado:=public.esco_sql_consultar_v1(p_consulta);
  PERFORM set_config('role',rol_anterior,true);
  PERFORM set_config('request.jwt.claims',coalesce(claims_anteriores,''),true);
  PERFORM set_config('request.jwt.claim.sub',coalesce(sub_anterior,''),true);
  PERFORM set_config('request.jwt.claim.role',coalesce(role_anterior,''),true);
  RETURN resultado;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('role',rol_anterior,true);
  PERFORM set_config('request.jwt.claims',coalesce(claims_anteriores,''),true);
  PERFORM set_config('request.jwt.claim.sub',coalesce(sub_anterior,''),true);
  PERFORM set_config('request.jwt.claim.role',coalesce(role_anterior,''),true);
  RAISE;
END $fn$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA esco_sql_privado FROM PUBLIC, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA esco_sql_privado TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.esco_sql_consultar_v1(jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.esco_sql_consultar_v1(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.esco_sql_consultar_actor_v1(uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.esco_sql_consultar_actor_v1(uuid,jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.esco_sql_lectura(text) FROM PUBLIC, anon, authenticated, service_role;

DO $post$
DECLARE v jsonb; c jsonb;
BEGIN
  FOR v IN SELECT value FROM jsonb_array_elements(esco_sql_privado.catalogo()->'views') LOOP
    IF NOT EXISTS (SELECT FROM pg_class r JOIN pg_namespace ns ON ns.oid=r.relnamespace WHERE ns.nspname='public' AND r.relname=v->>'name' AND r.relkind='v' AND r.reloptions @> ARRAY['security_invoker=true']) THEN RAISE EXCEPTION '194: vista catalogada sin security_invoker'; END IF;
    FOR c IN SELECT value FROM jsonb_array_elements(v->'columns') LOOP
      IF NOT EXISTS (SELECT FROM pg_attribute a JOIN pg_class r ON r.oid=a.attrelid JOIN pg_namespace ns ON ns.oid=r.relnamespace WHERE ns.nspname='public' AND r.relname=v->>'name' AND a.atttypid=to_regtype(esco_sql_privado.tipo(c->>'type')) AND a.attname=c->>'name' AND a.attnum>0 AND NOT a.attisdropped) THEN RAISE EXCEPTION '194: columna catalogada ausente'; END IF;
    END LOOP;
  END LOOP;
  IF has_function_privilege('authenticated','public.esco_sql_lectura(text)','EXECUTE') OR has_function_privilege('service_role','public.esco_sql_lectura(text)','EXECUTE') OR has_function_privilege('anon','public.esco_sql_consultar_v1(jsonb)','EXECUTE') OR has_function_privilege('authenticated','public.esco_sql_consultar_actor_v1(uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION '194: ACL incorrecta'; END IF;
END $post$;
COMMIT;
-- REVERSIÓN SEGURA (con aprobación; nunca reabre esco_sql_lectura):
-- DROP FUNCTION public.esco_sql_consultar_actor_v1(uuid,jsonb);
-- DROP FUNCTION public.esco_sql_consultar_v1(jsonb);
-- DROP SCHEMA esco_sql_privado CASCADE;
-- La captura/alertas permanecen operativas; consultas SQL quedan indisponibles hasta corrección.
