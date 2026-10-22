-- NONNUMBERED candidate61. Exact offline replay only; never production installation.
BEGIN;
SELECT hato_birth_undo.lock_domain();
DO $admit$ BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed measured-income boundary owner required';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('hato_quincena.assert_baseline()') AND md5(prosrc)='81691c5b9c41efebda4bbd7b6cfba266' AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed financial boundary dependency';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('hato_income_metadata.assert_baseline()') AND md5(prosrc)='24e3ed6fef7588b19cbadb2ac90a9792' AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed financial boundary dependency';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('hato_quincena.assert_controls()') AND md5(prosrc)='9d7d89d9a5e91506c7076703d4ca87b3' AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed financial boundary dependency';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('hato_income_metadata.assert_controls()') AND md5(prosrc)='e693e64ac1139a578d6e9065818468f7' AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed financial boundary dependency';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('invoice_upload.assert_controls()') AND md5(prosrc)='7f7fd5a41f3d923a5aa245cc58378427' AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed financial boundary dependency';END IF;
 PERFORM hato_income_metadata.assert_baseline();PERFORM invoice_upload.assert_controls();
END $admit$;
CREATE FUNCTION public.fn_hato_check_income_boundary(p_old uuid,p_new uuid,p_truncate boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- Every ordinary invocation gets a fresh command snapshot after the association lock.
 -- RR/serializable snapshots could predate a newly committed association and are refused.
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Measured income boundary requires a fresh read committed snapshot' USING ERRCODE='42501';END IF;
 PERFORM hato_quincena.actor();
 LOCK TABLE public.hato_produccion_quincenal IN SHARE MODE;
 PERFORM hato_income_metadata.assert_baseline();
 IF p_truncate OR EXISTS(SELECT 1 FROM public.hato_produccion_quincenal WHERE origen_dato='medido' AND fin_ingreso_id IN(p_old,p_new)) THEN RAISE EXCEPTION 'Measured income requires prepared Produccion or protected Finanzas metadata' USING ERRCODE='42501';END IF;
END $$;
REVOKE ALL ON FUNCTION public.fn_hato_check_income_boundary(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_hato_check_income_boundary(uuid,uuid,boolean) TO authenticated;
CREATE FUNCTION public.fn_hato_income_boundary_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_RELID<>'public.fin_ingresos'::regclass THEN RAISE EXCEPTION 'Income boundary target mismatch';END IF;
 -- Deliberately invoker: SECURITY DEFINER prepared operations execute as their pinned owner.
 -- Neither JWT claims, request headers, a custom GUC nor a caller argument grants exemption.
 IF current_user NOT IN('postgres','service_role') THEN
 IF NOT EXISTS(SELECT 1 FROM pg_proc f JOIN pg_language l ON l.oid=f.prolang WHERE f.oid=to_regprocedure('public.fn_hato_check_income_boundary(uuid,uuid,boolean)') AND md5(f.prosrc)='778e9ad6f8eaeb5fc02e2a710dcc83c5' AND f.prosecdef AND NOT f.proisstrict AND NOT f.proleakproof AND NOT f.proretset AND f.provolatile='v' AND f.proparallel='u' AND f.prokind='f' AND f.pronargdefaults=0 AND f.proargnames=ARRAY['p_old','p_new','p_truncate'] AND f.prorettype='pg_catalog.void'::regtype AND f.proconfig=ARRAY['search_path=pg_catalog'] AND l.lanname='plpgsql' AND pg_get_userbyid(f.proowner)='postgres' AND (SELECT count(*) FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))))=2 AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner)))a WHERE a.grantee NOT IN(f.proowner,'authenticated'::regrole) OR a.grantor<>f.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable)) THEN RAISE EXCEPTION 'Measured income helper binding drift' USING ERRCODE='42501';END IF;
  IF TG_LEVEL='STATEMENT' THEN PERFORM public.fn_hato_check_income_boundary(NULL,NULL,TG_OP='TRUNCATE');
  ELSE PERFORM public.fn_hato_check_income_boundary(CASE WHEN TG_OP<>'INSERT' THEN OLD.id END,CASE WHEN TG_OP<>'DELETE' THEN NEW.id END,false);END IF;
 END IF;
 IF TG_LEVEL='STATEMENT' THEN RETURN NULL;ELSIF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
END $$;
REVOKE ALL ON FUNCTION public.fn_hato_income_boundary_trigger() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER measured_income_statement_boundary BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.fin_ingresos FOR EACH STATEMENT EXECUTE FUNCTION public.fn_hato_income_boundary_trigger();
CREATE TRIGGER zz_measured_income_row_boundary BEFORE INSERT OR UPDATE OR DELETE ON public.fin_ingresos FOR EACH ROW EXECUTE FUNCTION public.fn_hato_income_boundary_trigger();
-- END NEW BOUNDARY
CREATE OR REPLACE FUNCTION hato_quincena.assert_baseline()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('hato_quincena.assert_retired_writers()') AND md5(prosrc)='5fcc85a3d56cd24212db3104ed0cc2f8' AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') OR EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))r(role) WHERE has_function_privilege(r.role,'hato_quincena.assert_retired_writers()','EXECUTE')) THEN RAISE EXCEPTION 'Quincena retirement binding drift';END IF;
 PERFORM hato_quincena.assert_retired_writers();

 PERFORM hato_upload_discard.assert_history_baseline();PERFORM hato_quincena.assert_controls();
 IF hato_quincena.baseline() IS DISTINCT FROM '6ec7585498da87fc1f979b1f341319b5' THEN RAISE EXCEPTION 'Unreviewed quincena financial source baseline';END IF;
END $function$;
CREATE OR REPLACE FUNCTION hato_income_metadata.assert_baseline()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
 PERFORM hato_quincena.assert_baseline();PERFORM hato_income_metadata.assert_controls();
 IF hato_income_metadata.baseline() IS DISTINCT FROM '6ec7585498da87fc1f979b1f341319b5' THEN RAISE EXCEPTION 'Unreviewed quincena financial source baseline';END IF;
END $function$;
CREATE OR REPLACE FUNCTION hato_quincena.assert_controls() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE f record;BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc boundary_proc JOIN pg_language l ON l.oid=boundary_proc.prolang WHERE boundary_proc.oid=to_regprocedure('public.fn_hato_check_income_boundary(uuid,uuid,boolean)') AND md5(boundary_proc.prosrc)='778e9ad6f8eaeb5fc02e2a710dcc83c5' AND boundary_proc.prosecdef AND NOT boundary_proc.proisstrict AND NOT boundary_proc.proleakproof AND NOT boundary_proc.proretset AND boundary_proc.provolatile='v' AND boundary_proc.proparallel='u' AND boundary_proc.prokind='f' AND boundary_proc.pronargdefaults=0 AND boundary_proc.proargnames=ARRAY['p_old','p_new','p_truncate'] AND boundary_proc.prorettype='pg_catalog.void'::regtype AND boundary_proc.proconfig=ARRAY['search_path=pg_catalog'] AND l.lanname='plpgsql' AND pg_get_userbyid(boundary_proc.proowner)='postgres' AND (SELECT count(*) FROM aclexplode(coalesce(boundary_proc.proacl,acldefault('f',boundary_proc.proowner))))=2 AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(boundary_proc.proacl,acldefault('f',boundary_proc.proowner)))a WHERE a.grantee NOT IN(boundary_proc.proowner,'authenticated'::regrole) OR a.grantor<>boundary_proc.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable)) THEN RAISE EXCEPTION 'Measured income helper binding drift' USING ERRCODE='42501';END IF;

 IF EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))r(role) CROSS JOIN(VALUES('hato_quincena.requests'::regclass),('hato_quincena.audit'::regclass))t(target) WHERE has_table_privilege(r.role,t.target,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege(r.role,t.target,'SELECT,INSERT,UPDATE,REFERENCES')) OR EXISTS(SELECT 1 FROM pg_class WHERE oid IN('hato_quincena.requests'::regclass,'hato_quincena.audit'::regclass) AND(NOT relrowsecurity OR relforcerowsecurity OR pg_get_userbyid(relowner)<>'postgres')) THEN RAISE EXCEPTION 'Private quincena control authority drift';END IF;
 FOR f IN SELECT * FROM(VALUES
('public.fn_hato_check_income_boundary(uuid,uuid,boolean)','778e9ad6f8eaeb5fc02e2a710dcc83c5',true),('public.fn_hato_income_boundary_trigger()','6975f2778af082539b482cfc572d5fb9',false),
('invoice_upload.assert_controls()','b66a316a1887aae8b049417636210e4c',false),('hato_quincena.assert_retired_writers()','5fcc85a3d56cd24212db3104ed0cc2f8',false),('hato_quincena.assert_baseline()','52a981f876019dfcf5e15e7ba269a626',false),('hato_income_metadata.assert_baseline()','194877e26e13bdd2be0a11f86299b15b',false),
('hato_quincena.immutable()','f1071b1c13456df84eea7e1655b57f78',false),
('hato_quincena.controls()','6241844ce6d339af0a282e7cd7d1d865',false),
('hato_quincena.foreign_controls()','faaeb2d8c8ffd24a6f29d4095bc24f7f',false),
('hato_quincena.lock_source()','ccd46d04571598cf2ea982a385db4a35',false),
('hato_quincena.actor()','385f4c9c1d309b0a5df0f70ecd58d907',false),
('hato_quincena.result(hato_quincena.requests)','ac0cc6016799b1654e0f5f294e9ddc16',false),
('hato_quincena.validate(jsonb,boolean)','62c000fdf74ffe8982c54606d10ed78a',false),
('hato_quincena.source(jsonb)','7b26364778fd4514d31338d6b15adfcb',false),
('hato_quincena.plan(jsonb,jsonb,uuid)','76264aa015b9f8f66b69e62ff01b90bc',false),
('public.fn_hato_quincena_source_web(jsonb,uuid)','982468a5b18742beec5fc0c0929c2e94',true),
('public.fn_hato_quincena_web(text,uuid,jsonb,uuid)','58fd2dd83e5f48ee4d72f3a3a1c44a50',true),
('public.fn_hato_quincena_recover_web(uuid)','da453030de673b9e9232ae40fdfcb0e4',true),
('hato_quincena.baseline()','cc1ef953a4213ec1a4d3b2b405fa8222',false))pin(signature,body,secdef) LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure(f.signature) AND md5(prosrc)=f.body AND prosecdef=f.secdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed quincena core: %',f.signature;END IF;
 IF NOT f.secdef AND EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))r(role) WHERE has_function_privilege(r.role,f.signature,'EXECUTE')) THEN RAISE EXCEPTION 'Private quincena core grant drift';END IF;
 IF f.secdef AND(has_function_privilege('anon',f.signature,'EXECUTE') OR has_function_privilege('service_role',f.signature,'EXECUTE') OR NOT has_function_privilege('authenticated',f.signature,'EXECUTE')) THEN RAISE EXCEPTION 'Quincena web entry authority drift';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM(VALUES('requests','immutable_quincena_request',27),('audit','immutable_quincena_audit',27),('requests','no_truncate_quincena_request',34),('audit','no_truncate_quincena_audit',34))e(relation,name,kind) WHERE NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('hato_quincena.'||e.relation)::regclass AND tgname=e.name AND tgtype=e.kind AND tgenabled='O' AND tgfoid='hato_quincena.immutable()'::regprocedure AND NOT tgdeferrable AND NOT tginitdeferred AND tgqual IS NULL AND tgattr::text='' AND tgnargs=0)) THEN RAISE EXCEPTION 'Quincena immutable control binding drift';END IF;
 PERFORM hato_income_metadata.assert_controls();
END $$;
CREATE OR REPLACE FUNCTION hato_income_metadata.assert_controls() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE f record;BEGIN
 PERFORM hato_income_metadata.assert_invoice_origins();
 IF EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))r(role) CROSS JOIN(VALUES('hato_income_metadata.requests'::regclass),('hato_income_metadata.audit'::regclass))t(target) WHERE has_table_privilege(r.role,t.target,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege(r.role,t.target,'SELECT,INSERT,UPDATE,REFERENCES')) OR EXISTS(SELECT 1 FROM pg_class WHERE oid IN('hato_income_metadata.requests'::regclass,'hato_income_metadata.audit'::regclass) AND(NOT relrowsecurity OR relforcerowsecurity OR pg_get_userbyid(relowner)<>'postgres')) THEN RAISE EXCEPTION 'Private quincena control authority drift';END IF;
 FOR f IN SELECT * FROM(VALUES
('hato_quincena.source(jsonb)','7b26364778fd4514d31338d6b15adfcb',false),
('hato_quincena.assert_controls()','4bd7ea1704f18a3ede3c788b4c8445ed',false),
('hato_income_metadata.capture_attachment(jsonb,uuid)','d358a56454fed478285661c726bddae9',false),
('hato_income_metadata.invoice_release_preview(uuid,uuid)','199bf1b02133f2a6ecb2ef42a6a74a8f',false),
('hato_income_metadata.assert_invoice_releases()','c6187fbf6752d997a1beb6e788b6a152',false),
('public.fn_hato_income_invoice_release_web(text,uuid,uuid,jsonb,uuid)','ac7921aa540401dd542285ab5f1159cb',true),
('hato_income_metadata.immutable_invoice_origin()','e6f5d14395531109d99160195d7ef02b',false),
('hato_income_metadata.assert_invoice_origins()','d6ee616ab0f25cc5acd874059ab83056',false),
('public.fn_hato_income_invoice_origin_web(text,uuid,uuid,jsonb,jsonb,uuid)','b6077948cf92ac02fbe4b59b152c1a36',true),
('hato_income_metadata.immutable()','f1071b1c13456df84eea7e1655b57f78',false),
('hato_income_metadata.controls()','7b9600b73ecdc15fe454ae8d3ed047d8',false),
('hato_income_metadata.foreign_controls()','806a48677f4a224ba533f5e3c94594e1',false),
('hato_income_metadata.lock_source()','bd55361232101caf3d3f555157dca2ee',false),
('hato_income_metadata.actor()','385f4c9c1d309b0a5df0f70ecd58d907',false),
('hato_income_metadata.result(hato_income_metadata.requests)','ac0cc6016799b1654e0f5f294e9ddc16',false),
('hato_income_metadata.validate(jsonb,boolean)','f1176b3ad0c46a1e27d073ba52077a33',false),
('hato_income_metadata.source(jsonb)','234b1ad7248bc4d6891947243ea9fbb2',false),
('hato_income_metadata.plan(jsonb,jsonb,uuid)','2e7acd023aa14b80fd78094574c29248',false),
('public.fn_hato_income_metadata_source_web(jsonb,uuid)','4b37cd095547da518aab7bc3c85629f8',true),
('public.fn_hato_income_metadata_web(text,uuid,jsonb,uuid)','c30c67d3b644eeab1f43f7586daa22f6',true),
('public.fn_hato_income_metadata_recover_web(uuid)','a922f160af4c3a636b9b99e055b0d826',true),
('public.fn_hato_income_metadata_classify_web(uuid,uuid)','5118af86ac1a959bbf90d831e475d8d6',true),
('hato_income_metadata.baseline()','cc1ef953a4213ec1a4d3b2b405fa8222',false))pin(signature,body,secdef) LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure(f.signature) AND md5(prosrc)=f.body AND prosecdef=f.secdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed quincena core: %',f.signature;END IF;
 IF NOT f.secdef AND EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))r(role) WHERE has_function_privilege(r.role,f.signature,'EXECUTE')) THEN RAISE EXCEPTION 'Private quincena core grant drift';END IF;
 IF f.secdef AND(has_function_privilege('anon',f.signature,'EXECUTE') OR has_function_privilege('service_role',f.signature,'EXECUTE') OR NOT has_function_privilege('authenticated',f.signature,'EXECUTE')) THEN RAISE EXCEPTION 'Quincena web entry authority drift';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM(VALUES('requests','immutable_quincena_request',27),('audit','immutable_quincena_audit',27),('requests','no_truncate_quincena_request',34),('audit','no_truncate_quincena_audit',34))e(relation,name,kind) WHERE NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('hato_income_metadata.'||e.relation)::regclass AND tgname=e.name AND tgtype=e.kind AND tgenabled='O' AND tgfoid='hato_income_metadata.immutable()'::regprocedure AND NOT tgdeferrable AND NOT tginitdeferred AND tgqual IS NULL AND tgattr::text='' AND tgnargs=0)) THEN RAISE EXCEPTION 'Quincena immutable control binding drift';END IF;
END $$;
CREATE OR REPLACE FUNCTION invoice_upload.assert_controls() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $control$ BEGIN IF (SELECT md5(jsonb_build_array((WITH targets AS(SELECT c.oid,c.relname,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.oid IN ('storage.objects'::regclass,'storage.buckets'::regclass,'public.compras'::regclass,'public.fin_gastos'::regclass,'public.fin_ingresos'::regclass)),
sections AS(
 SELECT 'relations' label,jsonb_agg(jsonb_build_array(relname,pg_get_userbyid(relowner),relacl,relrowsecurity,relforcerowsecurity,relkind) ORDER BY relname) value FROM targets
 UNION ALL SELECT 'columns',jsonb_agg(jsonb_build_array(t.relname,a.attname,a.attnum,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attgenerated,a.attidentity,pg_get_expr(d.adbin,d.adrelid),a.attacl,a.attcollation::regcollation::text) ORDER BY t.relname,a.attnum) FROM targets t JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_attrdef d ON d.adrelid=t.oid AND d.adnum=a.attnum
 UNION ALL SELECT 'constraints',jsonb_agg(jsonb_build_array(t.relname,c.conname,pg_get_constraintdef(c.oid),c.convalidated,c.condeferrable,c.condeferred) ORDER BY t.relname,c.conname) FROM targets t JOIN pg_constraint c ON c.conrelid=t.oid
 UNION ALL SELECT 'indexes',jsonb_agg(jsonb_build_array(t.relname,pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready,i.indislive,i.indimmediate,i.indisunique,i.indisprimary,i.indnullsnotdistinct) ORDER BY t.relname,i.indexrelid::regclass::text) FROM targets t JOIN pg_index i ON i.indrelid=t.oid
 UNION ALL SELECT 'triggers',jsonb_agg(jsonb_build_array(t.relname,g.tgname,pg_get_triggerdef(g.oid),g.tgenabled) ORDER BY t.relname,g.tgname) FROM targets t JOIN pg_trigger g ON g.tgrelid=t.oid AND NOT g.tgisinternal
 UNION ALL SELECT 'policies',jsonb_agg(jsonb_build_array(p.tablename,p.policyname,p.permissive,p.roles,p.cmd,p.qual,p.with_check) ORDER BY p.tablename,p.policyname) FROM pg_policies p JOIN targets t ON t.relname=p.tablename AND p.schemaname=(SELECT ns.nspname FROM pg_class rel JOIN pg_namespace ns ON ns.oid=rel.relnamespace WHERE rel.oid=t.oid)
 UNION ALL SELECT 'functions',jsonb_agg(jsonb_build_array(n.nspname,f.proname,pg_get_function_identity_arguments(f.oid),pg_get_userbyid(f.proowner),f.prosecdef,f.proconfig,f.proacl,md5(f.prosrc),f.provolatile,f.prokind) ORDER BY n.nspname,f.proname,pg_get_function_identity_arguments(f.oid)) FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace WHERE (n.nspname='public' AND f.proname IN('fn_hato_guardar_quincena_venta','fn_hato_eliminar_quincena_venta')) OR f.oid IN(SELECT tgfoid FROM pg_trigger WHERE tgrelid IN(SELECT oid FROM targets) AND NOT tgisinternal)
 UNION ALL SELECT 'incoming_fk',jsonb_agg(jsonb_build_array(n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid),k.convalidated,k.condeferrable,k.condeferred) ORDER BY n.nspname,c.relname,k.conname) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE k.contype='f' AND k.confrelid IN(SELECT oid FROM targets)
 UNION ALL SELECT 'rules',coalesce(jsonb_agg(jsonb_build_array(t.relname,r.rulename,md5(pg_get_ruledef(r.oid))) ORDER BY t.relname,r.rulename),'[]') FROM pg_rewrite r JOIN targets t ON t.oid=r.ev_class
)
SELECT md5((SELECT jsonb_object_agg(label,value)::text FROM sections))),(WITH sections AS(
 SELECT 'schema' k,jsonb_agg(jsonb_build_array(pg_get_userbyid(nspowner),nspacl)) v FROM pg_namespace WHERE nspname='invoice_upload'
 UNION ALL SELECT 'tables',jsonb_agg(jsonb_build_array(c.relname,pg_get_userbyid(c.relowner),c.relacl,c.relrowsecurity,c.relforcerowsecurity,c.relkind) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='invoice_upload' AND c.relkind IN('r','p')
 UNION ALL SELECT 'columns',jsonb_agg(jsonb_build_array(c.relname,a.attname,a.attnum,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attacl,pg_get_expr(d.adbin,d.adrelid)) ORDER BY c.relname,a.attnum) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='invoice_upload' AND c.relkind IN('r','p')
 UNION ALL SELECT 'constraints',jsonb_agg(jsonb_build_array(c.relname,k.conname,pg_get_constraintdef(k.oid),k.convalidated,k.condeferrable,k.condeferred) ORDER BY c.relname,k.conname) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='invoice_upload'
 UNION ALL SELECT 'indexes',jsonb_agg(jsonb_build_array(c.relname,pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready,i.indislive) ORDER BY c.relname,i.indexrelid::regclass::text) FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='invoice_upload'
 UNION ALL SELECT 'triggers',coalesce(jsonb_agg(jsonb_build_array(c.relname,t.tgname,pg_get_triggerdef(t.oid),t.tgenabled) ORDER BY c.relname,t.tgname),'[]') FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='invoice_upload' AND NOT t.tgisinternal
 UNION ALL SELECT 'policies',coalesce(jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname),'[]') FROM pg_policies p WHERE schemaname='invoice_upload'
 UNION ALL SELECT 'functions',jsonb_agg(jsonb_build_array(n.nspname,f.proname,pg_get_function_identity_arguments(f.oid),pg_get_userbyid(f.proowner),f.proacl,f.prosecdef,f.proconfig,f.provolatile,f.proparallel,f.proisstrict,f.proleakproof,f.prorettype::regtype::text,f.proretset,f.proargnames,f.proargmodes,f.prokind,(SELECT lanname FROM pg_language WHERE oid=f.prolang),CASE WHEN n.nspname='invoice_upload' AND f.proname='assert_controls' THEN NULL ELSE md5(f.prosrc) END) ORDER BY n.nspname,f.proname,pg_get_function_identity_arguments(f.oid)) FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace WHERE n.nspname='invoice_upload' OR(n.nspname='public' AND f.proname IN('fn_invoice_upload_target','fn_invoice_upload_step','invoice_object_committed'))
 UNION ALL SELECT 'rules',coalesce(jsonb_agg(jsonb_build_array(c.relname,w.rulename,pg_get_ruledef(w.oid)) ORDER BY c.relname,w.rulename),'[]') FROM pg_rewrite w JOIN pg_class c ON c.oid=w.ev_class JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='invoice_upload'
) SELECT md5((SELECT jsonb_object_agg(k,v)::text FROM sections))))::text)) IS DISTINCT FROM 'e99ad6e933e03cbe419896411c40ee27' THEN RAISE EXCEPTION 'Unreviewed invoice private authority';END IF;END $control$;
SELECT hato_income_metadata.assert_baseline();SELECT invoice_upload.assert_controls();
COMMIT;
