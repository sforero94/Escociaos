-- NONNUMBERED retirement after validated prepared sale caller;26candidates total. Offline only.
BEGIN;
DO $admission$ DECLARE baseline text;BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed sale retirement owner required';END IF;
 SELECT md5(jsonb_build_object(
 'namespace',(SELECT jsonb_build_array(pg_get_userbyid(nspowner),nspacl::text) FROM pg_namespace WHERE nspname='hato_sale'),
 'functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',md5(pg_get_functiondef(p.oid)),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text) ORDER BY p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='hato_sale' OR p.oid IN(to_regprocedure('public.fn_hato_registrar_venta_animales(jsonb)'),to_regprocedure('public.fn_hato_sale_web(text,uuid,jsonb,uuid)'))),
 'relations',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'owner',pg_get_userbyid(c.relowner),'kind',c.relkind,'acl',c.relacl::text,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,a.attacl::text,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid),convalidated,condeferrable,condeferred) ORDER BY conname) FROM pg_constraint WHERE conrelid=c.oid),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(pg_get_indexdef(indexrelid),indisvalid,indisready,indislive,indimmediate,indnullsnotdistinct) ORDER BY pg_get_indexdef(indexrelid)) FROM pg_index WHERE indrelid=c.oid),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(pg_get_triggerdef(t.oid),t.tgenabled,md5(pg_get_functiondef(t.tgfoid))) ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE p.schemaname='hato_sale' AND p.tablename=c.relname),
 'rules',(SELECT count(*) FROM pg_rewrite WHERE ev_class=c.oid),'inherits',(SELECT count(*) FROM pg_inherits WHERE inhrelid=c.oid OR inhparent=c.oid)) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='hato_sale' AND c.relkind IN('r','p','v','m'))
)::text) INTO baseline;

 IF baseline IS DISTINCT FROM '83c98cb81e0c0c986d8dbba13f62bfe9' THEN RAISE EXCEPTION 'Unreviewed sale retirement graph';END IF;
END $admission$;
SELECT hato_sale.lock_source();
CREATE OR REPLACE FUNCTION public.fn_hato_registrar_venta_animales(payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$BEGIN RAISE EXCEPTION 'Legacy sale RPC retired; use prepared sale lifecycle' USING ERRCODE='42501';END$$;
REVOKE ALL ON FUNCTION public.fn_hato_registrar_venta_animales(jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION hato_sale.assert_retired() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('public.fn_hato_registrar_venta_animales(jsonb)') AND md5(p.prosrc)='e0c94150bc437a5426c86afa32b95b42' AND NOT p.prosecdef AND NOT p.proisstrict AND NOT p.proleakproof AND p.provolatile='v' AND p.proparallel='u' AND p.prokind='f' AND NOT p.proretset AND p.pronargdefaults=0 AND p.proargnames=ARRAY['payload'] AND p.proconfig=ARRAY['search_path=pg_catalog'] AND l.lanname='plpgsql' AND pg_get_userbyid(p.proowner)='postgres'
 AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a WHERE a.grantee<>p.proowner))
 OR EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))v(role) WHERE has_function_privilege(v.role,'public.fn_hato_registrar_venta_animales(jsonb)','EXECUTE'))
 THEN RAISE EXCEPTION 'Unreviewed retired sale boundary' USING ERRCODE='42501';END IF;
END $$;
REVOKE ALL ON FUNCTION hato_sale.assert_retired() FROM PUBLIC,anon,authenticated,service_role;
DO $bind$ DECLARE definition text;patched text;BEGIN
 definition=pg_get_functiondef('public.fn_hato_sale_web(text,uuid,jsonb,uuid)'::regprocedure);
 patched=replace(definition,'actor=hato_sale.actor();','PERFORM hato_sale.assert_retired();actor=hato_sale.actor();');
 IF patched=definition THEN RAISE EXCEPTION 'Prepared sale retirement binding missing';END IF;
 EXECUTE patched;
END $bind$;
SELECT hato_sale.assert_retired();
COMMIT;
