-- NONNUMBERED ordinary catalog writer retirement after41candidates; OFFLINE REVIEW ONLY.
BEGIN;
SELECT hato_birth_undo.lock_domain();
DO $admit$ BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed catalog retirement owner required';END IF;
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN('hato_toros','hato_pajillas') AND c.relkind='r' AND pg_get_userbyid(c.relowner)='postgres' AND c.relrowsecurity AND NOT c.relforcerowsecurity AND c.relacl::text='{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}')<>2 OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid IN('public.hato_toros'::regclass,'public.hato_pajillas'::regclass) AND attnum>0 AND NOT attisdropped AND attacl IS NOT NULL) THEN RAISE EXCEPTION 'Unreviewed catalog table/column authority';END IF;
 IF EXISTS(SELECT 1 FROM(VALUES ('public.fn_hato_catalog_creation_web(text,uuid,jsonb,uuid)','fdc26b7c517734147cad758945073721'),('public.fn_hato_catalog_creation_recover_web(uuid)','ef0411c5c98fb179331a8930ab272a05'),('public.fn_hato_catalog_edit_web(text,uuid,jsonb,uuid)','e31685fb7367e630d6693e84575b4697'),('public.fn_hato_catalog_edit_recover_web(uuid)','c7c5d53fe730cb10beac46488ec40f86'))e(signature,body) WHERE NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure(e.signature) AND md5(prosrc)=e.body AND prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres')) THEN RAISE EXCEPTION 'Unreviewed prepared catalog entry';END IF;
 PERFORM hato_chequeo_integrity.assert_retired();
END $admit$;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.hato_toros,public.hato_pajillas FROM PUBLIC,anon,authenticated;
DO $columns$ DECLARE target regclass;names text;BEGIN
 FOREACH target IN ARRAY ARRAY['public.hato_toros'::regclass,'public.hato_pajillas'::regclass] LOOP
 SELECT string_agg(format('%I',attname),',' ORDER BY attnum) INTO names FROM pg_attribute WHERE attrelid=target AND attnum>0 AND NOT attisdropped;
 EXECUTE format('REVOKE INSERT (%s),UPDATE (%s) ON %s FROM PUBLIC,anon,authenticated',names,names,target);
 END LOOP;
END $columns$;
CREATE FUNCTION hato_catalog_creation.assert_retired_writers() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'))r(role) CROSS JOIN(VALUES('public.hato_toros'::regclass),('public.hato_pajillas'::regclass))t(target) CROSS JOIN(VALUES('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'))p(privilege) WHERE has_table_privilege(r.role,t.target,p.privilege))
 OR EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'))r(role) CROSS JOIN pg_attribute a CROSS JOIN(VALUES('INSERT'),('UPDATE'))p(privilege) WHERE a.attrelid IN('public.hato_toros'::regclass,'public.hato_pajillas'::regclass) AND a.attnum>0 AND NOT a.attisdropped AND has_column_privilege(r.role,a.attrelid,a.attnum,p.privilege))
 OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))x WHERE c.oid IN('public.hato_toros'::regclass,'public.hato_pajillas'::regclass) AND x.grantee=0 AND x.privilege_type IN('INSERT','UPDATE','DELETE','TRUNCATE'))
 OR EXISTS(SELECT 1 FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl)x WHERE a.attrelid IN('public.hato_toros'::regclass,'public.hato_pajillas'::regclass) AND a.attnum>0 AND NOT a.attisdropped AND x.grantee=0 AND x.privilege_type IN('INSERT','UPDATE')) THEN RAISE EXCEPTION 'Retired catalog writer privilege restored' USING ERRCODE='42501';END IF;
END $$;
REVOKE ALL ON FUNCTION hato_catalog_creation.assert_retired_writers() FROM PUBLIC,anon,authenticated,service_role;
DO $bind$ DECLARE signature text;definition text;patched text;BEGIN
 FOREACH signature IN ARRAY ARRAY['public.fn_hato_catalog_creation_web(text,uuid,jsonb,uuid)','public.fn_hato_catalog_edit_web(text,uuid,jsonb,uuid)','public.fn_hato_chequeo_web(text,uuid,uuid)','public.fn_hato_chequeo_prepare_service(uuid,uuid,jsonb,jsonb,jsonb)','public.fn_hato_chequeo_source_service(uuid)'] LOOP
 definition=pg_get_functiondef(to_regprocedure(signature));patched=regexp_replace(definition,'BEGIN','BEGIN PERFORM hato_catalog_creation.assert_retired_writers();');
 patched=replace(patched,'RETURN hato_catalog_creation.result(r);','PERFORM hato_catalog_creation.assert_retired_writers();RETURN hato_catalog_creation.result(r);');
 patched=replace(patched,'RETURN hato_catalog_edit.result(r);','PERFORM hato_catalog_creation.assert_retired_writers();RETURN hato_catalog_edit.result(r);');
 patched=replace(patched,'RETURN hato_chequeo_integrity.result(r);','PERFORM hato_catalog_creation.assert_retired_writers();RETURN hato_chequeo_integrity.result(r);');
 IF definition=patched THEN RAISE EXCEPTION 'Catalog retirement entry binding missing';END IF;EXECUTE patched;
 END LOOP;
END $bind$;
SELECT hato_catalog_creation.assert_retired_writers();
COMMIT;
