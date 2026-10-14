-- Review candidate only: install LAST after all nine coordinated writer candidates.
-- No numbered migration, production application or caller deployment authorization.
-- Drain legacy callers/in-flight requests before an approved maintenance install.
-- Stock reads and clinical step/alert writers retain their current permissions.
BEGIN;
LOCK TABLE public.productos,public.movimientos_inventario,public.compras IN ACCESS EXCLUSIVE MODE;
DO $retirement$
DECLARE spec record; fn record; body text; columns text; table_name text;
  original_clause text := $old$OR NOT has_table_privilege('authenticated','public.'||table_name,'INSERT')
      OR NOT has_table_privilege('authenticated','public.'||table_name,'UPDATE')
      OR NOT has_table_privilege('authenticated','public.'||table_name,'DELETE')$old$;
  retired_clause text := $new$OR (table_name<>ALL(ARRAY['productos','movimientos_inventario']) AND (
        NOT has_table_privilege('authenticated','public.'||table_name,'INSERT')
        OR NOT has_table_privilege('authenticated','public.'||table_name,'UPDATE')
        OR NOT has_table_privilege('authenticated','public.'||table_name,'DELETE')))$new$;
  stock_checks text := $stock$
  -- Complete post-cutover boundary; restoring even one old writer grant refuses.
  IF EXISTS (
    SELECT 1 FROM (VALUES('anon'),('authenticated'),('service_role')) g(role)
    CROSS JOIN (VALUES('productos'),('movimientos_inventario'),('compras')) t(name)
    WHERE NOT has_table_privilege(g.role,'public.'||t.name,'SELECT')
      OR EXISTS (SELECT 1 FROM unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
        WHERE has_table_privilege(g.role,'public.'||t.name,p))
      OR EXISTS (SELECT 1 FROM unnest(ARRAY['INSERT','UPDATE','REFERENCES']) p
        WHERE has_any_column_privilege(g.role,'public.'||t.name,p))
      OR has_function_privilege(g.role,'public.fn_hato_registrar_tratamiento(uuid,text,date,text,date,text,text,uuid)','EXECUTE')
  ) OR EXISTS (
    SELECT 1 FROM pg_class v JOIN pg_namespace n ON n.oid=v.relnamespace
    CROSS JOIN (VALUES('anon'),('authenticated'),('service_role')) g(role)
    WHERE n.nspname IN ('public','respaldos') AND v.relkind='v'
      AND (pg_relation_is_updatable(v.oid,true)&28)<>0
      AND (has_table_privilege(g.role,v.oid,'INSERT,UPDATE,DELETE')
        OR has_any_column_privilege(g.role,v.oid,'INSERT,UPDATE'))
  ) THEN RAISE EXCEPTION 'Stock retirement grant/legacy RPC/view boundary drift'; END IF;
$stock$;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.fn_hato_registrar_tratamiento(uuid,text,date,text,date,text,text,uuid)')
    AND md5(prosrc)='5504439a268818623461faa6ba669481'
    AND NOT prosecdef AND proowner=(SELECT oid FROM pg_roles WHERE rolname='postgres')
    AND proconfig=ARRAY['search_path=public, pg_temp']) THEN
    RAISE EXCEPTION 'Unreviewed legacy treatment RPC baseline'; END IF;
  -- Refuse inherited/column-only or partially retired baselines rather than
  -- silently inferring the intended rights. Native effective checks include PUBLIC.
  IF EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated'),('service_role')) g(role)
    CROSS JOIN (VALUES('productos'),('movimientos_inventario'),('compras')) t(name)
    CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
    WHERE NOT has_table_privilege(g.role,'public.'||t.name,p)) THEN
    RAISE EXCEPTION 'Stock retirement initial effective grant baseline drift'; END IF;
  IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN('productos','movimientos_inventario','compras')
      AND (c.relkind<>'r' OR c.relowner<>(SELECT oid FROM pg_roles WHERE rolname='postgres')
        OR NOT c.relrowsecurity OR c.relforcerowsecurity)) THEN
    RAISE EXCEPTION 'Stock retirement ownership/RLS baseline drift'; END IF;
  -- Patch ONLY these exact reviewed public-source guard bodies. Retain every
  -- policy, active-role, precision, RLS and non-stock grant requirement unchanged.
  FOR spec IN SELECT * FROM (VALUES
    ('application_closure','a8b6071c624f5820ba5f257af98619ce'),
    ('application_plan_delete','5444a7064d48039792f8c2dc5dae8e34')
  ) s(namespace,body_md5) LOOP
    SELECT p.*,l.lanname INTO fn FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
      WHERE p.oid=to_regprocedure(spec.namespace||'.assert_boundary()');
    IF NOT FOUND OR md5(fn.prosrc)<>spec.body_md5 OR fn.prosecdef OR fn.lanname<>'plpgsql'
      OR fn.proowner<>(SELECT oid FROM pg_roles WHERE rolname='postgres')
      OR fn.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public']
      OR EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated'),('service_role')) g(role)
        WHERE has_function_privilege(g.role,fn.oid,'EXECUTE'))
      OR length(fn.prosrc)-length(replace(fn.prosrc,original_clause,''))<>length(original_clause) THEN
      RAISE EXCEPTION 'Unreviewed closure/plan guard baseline: %',spec.namespace; END IF;
    body:=replace(fn.prosrc,original_clause,retired_clause);
    body:=overlay(body placing ('BEGIN'||stock_checks) from position('BEGIN' in body) for 5);
    EXECUTE format('CREATE OR REPLACE FUNCTION %I.assert_boundary() RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS %L',spec.namespace,body);
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY['productos','movimientos_inventario','compras'] LOOP
    EXECUTE format('REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.%I FROM PUBLIC,anon,authenticated,service_role',table_name);
    SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO columns
      FROM pg_attribute WHERE attrelid=('public.'||table_name)::regclass AND attnum>0 AND NOT attisdropped;
    EXECUTE format('REVOKE INSERT(%s),UPDATE(%s),REFERENCES(%s) ON TABLE public.%I FROM PUBLIC,anon,authenticated,service_role',columns,columns,columns,table_name);
  END LOOP;
  REVOKE ALL ON FUNCTION public.fn_hato_registrar_tratamiento(uuid,text,date,text,date,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
  PERFORM application_closure.assert_boundary();
  PERFORM application_plan_delete.assert_boundary();
END $retirement$;
COMMIT;
