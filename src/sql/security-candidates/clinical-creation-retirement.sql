-- NONNUMBERED review candidate. Install after coordinated-writer-retirement.sql.
-- Protected creation/undo own prospective clinical INSERT/DELETE. Keep current
-- step/header UPDATE lanes, including service-only invoker177, for their separate
-- atomic confirmation/audit cutover. No production application authorization.
BEGIN;
LOCK TABLE public.hato_tratamientos,public.hato_tratamiento_pasos IN ACCESS EXCLUSIVE MODE;
DO $clinical$
DECLARE target text; columns text;
BEGIN
 IF has_function_privilege('authenticated','public.fn_hato_registrar_tratamiento(uuid,text,date,text,date,text,text,uuid)','EXECUTE')
 OR has_function_privilege('service_role','public.fn_hato_registrar_tratamiento(uuid,text,date,text,date,text,text,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'Retire legacy treatment creation RPC first'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.fn_hato_confirmar_paso_tratamiento(uuid,uuid,date,text)')
   AND md5(prosrc)='ca3a7e740d6eeb20fe0c48c10531adf4' AND NOT prosecdef
   AND proowner=(SELECT oid FROM pg_roles WHERE rolname='postgres') AND proconfig=ARRAY['search_path=public, pg_temp'])
 THEN RAISE EXCEPTION 'Unreviewed invoker177 clinical writer'; END IF;
 FOREACH target IN ARRAY ARRAY['hato_tratamientos','hato_tratamiento_pasos'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=('public.'||target)::regclass AND relkind='r'
    AND relowner=(SELECT oid FROM pg_roles WHERE rolname='postgres') AND relrowsecurity AND NOT relforcerowsecurity)
  OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('public.'||target)::regclass AND NOT tgisinternal)
  OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid=('public.'||target)::regclass OR inhparent=('public.'||target)::regclass)
  THEN RAISE EXCEPTION 'Unreviewed clinical ownership/RLS/trigger/inheritance boundary'; END IF;
  EXECUTE format('REVOKE INSERT,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.%I FROM PUBLIC,anon,authenticated,service_role',target);
  SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO columns FROM pg_attribute
   WHERE attrelid=('public.'||target)::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE INSERT(%s),REFERENCES(%s) ON TABLE public.%I FROM PUBLIC,anon,authenticated,service_role',columns,columns,target);
 END LOOP;
 IF EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated'),('service_role'))g(role)
  CROSS JOIN(VALUES('hato_tratamientos'),('hato_tratamiento_pasos'))t(name)
  WHERE NOT has_table_privilege(g.role,'public.'||t.name,'SELECT')
   OR NOT has_table_privilege(g.role,'public.'||t.name,'UPDATE')
   OR has_table_privilege(g.role,'public.'||t.name,'INSERT,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
   OR has_any_column_privilege(g.role,'public.'||t.name,'INSERT,REFERENCES'))
 OR EXISTS(SELECT 1 FROM pg_class v JOIN pg_namespace n ON n.oid=v.relnamespace
  CROSS JOIN(VALUES('anon'),('authenticated'),('service_role'))g(role)
  WHERE n.nspname IN('public','respaldos') AND v.relkind='v' AND (pg_relation_is_updatable(v.oid,true)&28)<>0
   AND (has_table_privilege(g.role,v.oid,'INSERT,UPDATE,DELETE') OR has_any_column_privilege(g.role,v.oid,'INSERT,UPDATE')))
 THEN RAISE EXCEPTION 'Clinical creation retirement effective grant/view boundary drift'; END IF;
END $clinical$;
COMMIT;
