-- NONNUMBERED review candidate; no production application authorization.
-- After nine protocols, stock/creation retirements, clinical confirmation and
-- validated browser/Telegram caller cutover. Drain old callers/in-flight work.
BEGIN;
LOCK TABLE public.hato_tratamientos,public.hato_tratamiento_pasos IN ACCESS EXCLUSIVE MODE;
DO $admission$
DECLARE fingerprint text;
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed installation owner required';END IF;
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
WHERE n.nspname='public' AND c.relname IN('hato_animales','hato_tratamientos','hato_tratamiento_pasos','hato_alertas','usuarios','telegram_usuarios')) AS evidence(baseline);
 IF fingerprint IS DISTINCT FROM 'bd3b53e6dc7d4934eca9e196391315ee' THEN RAISE EXCEPTION 'Unreviewed clinical retirement schema';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.fn_hato_confirmar_paso_tratamiento(uuid,uuid,date,text)')
 AND md5(prosrc)='ca3a7e740d6eeb20fe0c48c10531adf4' AND NOT prosecdef
 AND proowner=(SELECT oid FROM pg_roles WHERE rolname='postgres') AND proconfig=ARRAY['search_path=public, pg_temp'])
 THEN RAISE EXCEPTION 'Unreviewed legacy clinical confirmer';END IF;
 IF EXISTS(SELECT 1 FROM(VALUES
 ('clinical_step_confirmation.immutable()','c50bc6bf86418404bb603854a89846ee',false),
 ('clinical_step_confirmation.intent(jsonb)','55231a3b2fe8d0084ee5b6da2bdf813f',false),
 ('clinical_step_confirmation.snapshot(uuid)','19b293527a004556d299c2810b44dd11',false),
 ('clinical_step_confirmation.domain_state()','925667b807e5a8855453182acbfb3adf',false),
 ('clinical_step_confirmation.response(clinical_step_confirmation.requests)','4fd3e962b879c72a971e58f88bc7bd10',false),
 ('clinical_step_confirmation.dispatch(jsonb,text,uuid,jsonb,bigint,bigint,bigint)','e7d9a408a1260d6703f4dfeea7f8636f',false),
 ('public.fn_clinical_step_web(text,uuid,jsonb,uuid)','1f60ead61f393b32fc8d106117951ff8',true),
 ('public.fn_clinical_step_telegram(text,bigint,bigint,bigint,jsonb)','0e201fea416d841dd66f9f53f9fdb5c5',true))e(signature,body,definer)
 WHERE NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(e.signature) AND md5(p.prosrc)=e.body
 AND p.prosecdef=e.definer AND p.proowner=(SELECT oid FROM pg_roles WHERE rolname='postgres') AND p.proconfig=ARRAY['search_path=pg_catalog']))
 THEN RAISE EXCEPTION 'Unreviewed prepared clinical function';END IF;
END $admission$;
CREATE FUNCTION clinical_step_confirmation.assert_retired_writers() RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))g(role)
 CROSS JOIN(VALUES('hato_tratamientos'),('hato_tratamiento_pasos'))t(name)
 WHERE NOT has_table_privilege(g.role,'public.'||t.name,'SELECT')
 OR has_table_privilege(g.role,'public.'||t.name,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
 OR has_any_column_privilege(g.role,'public.'||t.name,'INSERT,UPDATE,REFERENCES'))
 OR EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))g(role)
 WHERE has_function_privilege(g.role,'public.fn_hato_confirmar_paso_tratamiento(uuid,uuid,date,text)','EXECUTE')
 OR has_schema_privilege(g.role,'clinical_step_confirmation','USAGE'))
 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 CROSS JOIN(VALUES('anon'),('authenticated'),('service_role'))g(role)
 WHERE n.nspname='clinical_step_confirmation' AND c.relkind='r' AND
 (has_table_privilege(g.role,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege(g.role,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
 OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 CROSS JOIN(VALUES('anon'),('authenticated'),('service_role'))g(role)
 WHERE n.nspname='clinical_step_confirmation' AND has_function_privilege(g.role,p.oid,'EXECUTE'))
 OR EXISTS(SELECT 1 FROM pg_class v JOIN pg_namespace n ON n.oid=v.relnamespace
 CROSS JOIN(VALUES('anon'),('authenticated'),('service_role'))g(role)
 WHERE n.nspname IN('public','respaldos') AND v.relkind='v' AND (pg_relation_is_updatable(v.oid,true)&28)<>0
 AND (has_table_privilege(g.role,v.oid,'INSERT,UPDATE,DELETE') OR has_any_column_privilege(g.role,v.oid,'INSERT,UPDATE')))
 THEN RAISE EXCEPTION 'Clinical retired writer boundary drift';END IF;
END $$;
REVOKE ALL ON FUNCTION clinical_step_confirmation.assert_retired_writers() FROM PUBLIC,anon,authenticated,service_role;
DO $retirement$
DECLARE target text;columns text;definition text;
BEGIN
 FOREACH target IN ARRAY ARRAY['hato_tratamientos','hato_tratamiento_pasos'] LOOP
  EXECUTE format('REVOKE UPDATE ON TABLE public.%I FROM PUBLIC,anon,authenticated,service_role',target);
  SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO columns FROM pg_attribute WHERE attrelid=('public.'||target)::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE UPDATE(%s) ON TABLE public.%I FROM PUBLIC,anon,authenticated,service_role',columns,target);
 END LOOP;
 REVOKE ALL ON FUNCTION public.fn_hato_confirmar_paso_tratamiento(uuid,uuid,date,text) FROM PUBLIC,anon,authenticated,service_role;
 -- Modify only the exact pinned repository-owned dispatcher, retaining all
 -- existing actor, CAS, proof/readback and cancellation behavior.
 SELECT pg_get_functiondef('clinical_step_confirmation.dispatch(jsonb,text,uuid,jsonb,bigint,bigint,bigint)'::regprocedure) INTO definition;
 IF position(E'\nBEGIN\n' IN definition)=0 THEN RAISE EXCEPTION 'Clinical dispatcher entry not found';END IF;
 definition=replace(definition,E'\nBEGIN\n',E'\nBEGIN\n PERFORM clinical_step_confirmation.assert_retired_writers();\n');
 EXECUTE definition;
 PERFORM clinical_step_confirmation.assert_retired_writers();
END $retirement$;
COMMIT;
