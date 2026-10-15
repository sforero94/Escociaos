-- NONNUMBERED review candidate. After coordinated clinical UPDATE retirement.
-- Prospective audit storage only; no historical assertion or repair authorized.
BEGIN;
LOCK TABLE public.aplicaciones,public.aplicaciones_calculos,public.aplicaciones_compras,public.aplicaciones_lotes,public.aplicaciones_productos,public.hato_animales,public.hato_chequeo_vacas,public.hato_eventos,public.hato_pesajes_leche,public.hato_produccion_quincenal,public.movimientos_diarios,public.movimientos_diarios_empleados,public.movimientos_diarios_productos,public.movimientos_diarios_trabajadores IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.hato_correcciones,public.globalgap_correcciones IN ACCESS EXCLUSIVE MODE;
DO $admission$
DECLARE fingerprint text;
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed correction audit owner required';END IF;
 SELECT baseline INTO fingerprint FROM (SELECT md5(jsonb_agg(jsonb_build_object(
 'table',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
 'acl',(SELECT jsonb_agg(jsonb_build_array(CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable) ORDER BY CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable) FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))x),
 'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid),'collation',CASE WHEN a.attcollation=0 THEN NULL ELSE (SELECT n.nspname||'.'||co.collname FROM pg_collation co JOIN pg_namespace n ON n.oid=co.collnamespace WHERE co.oid=a.attcollation) END,'acl',(SELECT jsonb_agg(jsonb_build_array(CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable) ORDER BY CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable) FROM aclexplode(a.attacl)x)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(x.conname,pg_get_constraintdef(x.oid),x.convalidated,x.condeferrable,x.condeferred) ORDER BY x.conname) FROM pg_constraint x WHERE x.conrelid=c.oid),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready,i.indislive,i.indimmediate,i.indnullsnotdistinct) ORDER BY pg_get_indexdef(i.indexrelid)) FROM pg_index i WHERE i.indrelid=c.oid),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.policyname) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(pg_get_triggerdef(t.oid),t.tgenabled,t.tgtype,t.tgdeferrable,t.tginitdeferred,md5(f.prosrc),pg_get_userbyid(f.proowner),f.prosecdef,f.proconfig) ORDER BY t.tgname) FROM pg_trigger t JOIN pg_proc f ON f.oid=t.tgfoid WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),
 'inherits',(SELECT count(*) FROM pg_inherits WHERE inhrelid=c.oid OR inhparent=c.oid),
 'rules',(SELECT count(*) FROM pg_rewrite WHERE ev_class=c.oid)
) ORDER BY c.relname)::text) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN('hato_correcciones','globalgap_correcciones')) AS evidence(baseline);
 IF fingerprint IS DISTINCT FROM '95d1d270ab65d81e9e00f3b52bd489fc' THEN RAISE EXCEPTION 'Unreviewed correction audit schema';END IF;
 IF EXISTS(SELECT 1 FROM(VALUES('public.fn_globalgap_registrar_correccion()','b21c3326a874e3c541120c8973d5f8bc'),('public.fn_hato_registrar_correccion()','6c8470bf94a7e2437c08bf1df123ac03'))e(signature,body)
 WHERE NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(e.signature) AND md5(p.prosrc)=e.body
 AND p.prorettype='trigger'::regtype AND p.prosecdef AND p.proowner=(SELECT oid FROM pg_roles WHERE rolname='postgres')
 AND p.proconfig=ARRAY['search_path=public, pg_temp'])) THEN RAISE EXCEPTION 'Unreviewed correction audit writer';END IF;
 IF EXISTS(SELECT 1 FROM(VALUES
 ('aplicaciones','trg_globalgap_correccion','public.fn_globalgap_registrar_correccion()'),
 ('aplicaciones_calculos','trg_globalgap_correccion','public.fn_globalgap_registrar_correccion()'),
 ('aplicaciones_compras','trg_globalgap_correccion','public.fn_globalgap_registrar_correccion()'),
 ('aplicaciones_lotes','trg_globalgap_correccion','public.fn_globalgap_registrar_correccion()'),
 ('aplicaciones_productos','trg_globalgap_correccion','public.fn_globalgap_registrar_correccion()'),
 ('hato_animales','trg_hato_correccion','public.fn_hato_registrar_correccion()'),
 ('hato_chequeo_vacas','trg_hato_correccion','public.fn_hato_registrar_correccion()'),
 ('hato_eventos','trg_hato_correccion','public.fn_hato_registrar_correccion()'),
 ('hato_pesajes_leche','trg_hato_correccion','public.fn_hato_registrar_correccion()'),
 ('hato_produccion_quincenal','trg_hato_correccion','public.fn_hato_registrar_correccion()'),
 ('movimientos_diarios','trg_globalgap_correccion','public.fn_globalgap_registrar_correccion()'),
 ('movimientos_diarios_empleados','trg_globalgap_correccion','public.fn_globalgap_registrar_correccion()'),
 ('movimientos_diarios_productos','trg_globalgap_correccion','public.fn_globalgap_registrar_correccion()'),
 ('movimientos_diarios_trabajadores','trg_globalgap_correccion','public.fn_globalgap_registrar_correccion()'))e(relation,trigger_name,signature)
 WHERE NOT EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname=e.relation AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname='postgres')
 AND t.tgname=e.trigger_name AND t.tgfoid=to_regprocedure(e.signature) AND t.tgenabled='O' AND t.tgtype=25
 AND t.tgqual IS NULL AND t.tgattr::text='' AND t.tgnargs=0 AND NOT t.tgdeferrable AND NOT t.tginitdeferred))
 OR(SELECT count(*) FROM pg_trigger WHERE tgfoid IN('public.fn_hato_registrar_correccion()'::regprocedure,'public.fn_globalgap_registrar_correccion()'::regprocedure))<>14
 THEN RAISE EXCEPTION 'Unreviewed correction audit source binding';END IF;
END $admission$;
CREATE SCHEMA correction_audit_integrity;
REVOKE ALL ON SCHEMA correction_audit_integrity FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION correction_audit_integrity.guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Immutable correction audit';END IF;
 -- Existing reviewed source triggers enter as postgres; ordinary callers,
 -- direct owner INSERTs and a restored service grant cannot forge entries.
 IF current_user<>'postgres' OR pg_trigger_depth()<2 THEN RAISE EXCEPTION 'Trusted nested correction trigger required';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION correction_audit_integrity.guard() FROM PUBLIC,anon,authenticated,service_role;
DO $retire$
DECLARE target text;columns text;
BEGIN
 FOREACH target IN ARRAY ARRAY['hato_correcciones','globalgap_correcciones'] LOOP
  EXECUTE format('REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.%I FROM PUBLIC,anon,authenticated,service_role',target);
  SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO columns FROM pg_attribute WHERE attrelid=('public.'||target)::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE INSERT(%s),UPDATE(%s),REFERENCES(%s) ON TABLE public.%I FROM PUBLIC,anon,authenticated,service_role',columns,columns,columns,target);
  EXECUTE format('CREATE TRIGGER correction_audit_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION correction_audit_integrity.guard()',target);
  EXECUTE format('CREATE TRIGGER correction_audit_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION correction_audit_integrity.guard()',target);
 END LOOP;
 REVOKE ALL ON FUNCTION public.fn_hato_registrar_correccion(),public.fn_globalgap_registrar_correccion() FROM PUBLIC,anon,authenticated,service_role;
 IF EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))g(role)
 CROSS JOIN(VALUES('hato_correcciones'),('globalgap_correcciones'))t(name)
 WHERE has_table_privilege(g.role,'public.'||t.name,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
 OR has_any_column_privilege(g.role,'public.'||t.name,'INSERT,UPDATE,REFERENCES')) THEN RAISE EXCEPTION 'Correction audit writer grant drift';END IF;
END $retire$;
CREATE FUNCTION correction_audit_integrity.assert_boundary() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('correction_audit_integrity.guard()')
 AND md5(prosrc)='121cc6864f3d5b34c574368d1edd213f' AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog']
 AND proowner=(SELECT oid FROM pg_roles WHERE rolname='postgres'))
 OR EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))g(role)
 CROSS JOIN(VALUES('hato_correcciones'),('globalgap_correcciones'))t(name)
 WHERE has_table_privilege(g.role,'public.'||t.name,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
 OR has_any_column_privilege(g.role,'public.'||t.name,'INSERT,UPDATE,REFERENCES'))
 OR EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))g(role)
 WHERE has_schema_privilege(g.role,'correction_audit_integrity','USAGE')
 OR has_function_privilege(g.role,'correction_audit_integrity.guard()','EXECUTE')
 OR has_function_privilege(g.role,'correction_audit_integrity.assert_boundary()','EXECUTE')
 OR has_function_privilege(g.role,'public.fn_hato_registrar_correccion()','EXECUTE')
 OR has_function_privilege(g.role,'public.fn_globalgap_registrar_correccion()','EXECUTE'))
 OR EXISTS(SELECT 1 FROM(VALUES('hato_correcciones'),('globalgap_correcciones'))e(name)
 WHERE(SELECT count(*) FROM pg_trigger WHERE tgrelid=('public.'||e.name)::regclass AND NOT tgisinternal)<>2
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('public.'||e.name)::regclass AND tgname='correction_audit_guard' AND tgtype=31 AND tgenabled='O' AND tgqual IS NULL AND tgnargs=0 AND tgattr::text='' AND NOT tgdeferrable AND NOT tginitdeferred AND tgfoid='correction_audit_integrity.guard()'::regprocedure)
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('public.'||e.name)::regclass AND tgname='correction_audit_no_truncate' AND tgtype=34 AND tgenabled='O' AND tgqual IS NULL AND tgnargs=0 AND tgattr::text='' AND NOT tgdeferrable AND NOT tginitdeferred AND tgfoid='correction_audit_integrity.guard()'::regprocedure))
 THEN RAISE EXCEPTION 'Correction audit protection boundary drift';END IF;
END $$;
REVOKE ALL ON FUNCTION correction_audit_integrity.assert_boundary() FROM PUBLIC,anon,authenticated,service_role;
DO $coordinate$
DECLARE p pg_proc;body text;
BEGIN
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('application_plan_delete.assert_graph()');
 IF NOT FOUND OR md5(p.prosrc)<>'971dba42d8133e0ccc1bd284cb6d9c6d' OR p.prosecdef OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public']
 OR p.proowner<>(SELECT oid FROM pg_roles WHERE rolname='postgres') THEN RAISE EXCEPTION 'Unreviewed plan correction dependency guard';END IF;
 body=replace(p.prosrc,$old$OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=ANY(ARRAY['public.globalgap_correcciones'::regclass,'application_plan_delete.requests'::regclass]) AND NOT tgisinternal AND tgenabled<>'D')$old$,$new$OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='application_plan_delete.requests'::regclass AND NOT tgisinternal AND tgenabled<>'D')$new$);
 body=overlay(body placing E'BEGIN\n PERFORM correction_audit_integrity.assert_boundary();' from position('BEGIN' in body) for 5);
 EXECUTE format('CREATE OR REPLACE FUNCTION application_plan_delete.assert_graph() RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS %L',body);
 PERFORM correction_audit_integrity.assert_boundary();
END $coordinate$;
COMMIT;
