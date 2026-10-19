-- NONNUMBERED compatible milk/capture writer retirement after52candidates. OFFLINE ONLY.
BEGIN;
SELECT hato_birth_undo.lock_domain();
DO $admit$ BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed milk retirement owner required';END IF;
 PERFORM hato_upload_discard.assert_history_baseline();
 IF EXISTS(SELECT 1 FROM(VALUES
 ('public.hato_pesajes_leche'::regclass,'{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'),
 ('public.hato_capturas_foto'::regclass,'{postgres=arwdDxtm/postgres,authenticated=rdxtm/postgres,service_role=arwdDxtm/postgres}'))e(target,acl) WHERE NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=e.target AND relkind='r' AND pg_get_userbyid(relowner)='postgres' AND relrowsecurity AND NOT relforcerowsecurity AND relacl::text=e.acl))
 OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid IN('public.hato_pesajes_leche'::regclass,'public.hato_capturas_foto'::regclass) AND attnum>0 AND NOT attisdropped AND attacl IS NOT NULL) THEN RAISE EXCEPTION 'Unreviewed milk/capture table/column authority';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='hato_milk_weighing.assert_baseline()'::regprocedure AND md5(prosrc)='a2198f74fc950038ededba77aa28a1f4' AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed milk baseline binding';END IF;
END $admit$;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.hato_pesajes_leche,public.hato_capturas_foto FROM PUBLIC,anon,authenticated;
DO $columns$ DECLARE target regclass;names text;BEGIN
 FOREACH target IN ARRAY ARRAY['public.hato_pesajes_leche'::regclass,'public.hato_capturas_foto'::regclass] LOOP
 SELECT string_agg(format('%I',attname),',' ORDER BY attnum) INTO names FROM pg_attribute WHERE attrelid=target AND attnum>0 AND NOT attisdropped;
 EXECUTE format('REVOKE INSERT (%s),UPDATE (%s) ON %s FROM PUBLIC,anon,authenticated',names,names,target);
 END LOOP;
END $columns$;
CREATE FUNCTION hato_milk_weighing.assert_retired_writers() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'))r(role) CROSS JOIN(VALUES('public.hato_pesajes_leche'::regclass),('public.hato_capturas_foto'::regclass))t(target) CROSS JOIN(VALUES('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'))p(privilege) WHERE has_table_privilege(r.role,t.target,p.privilege))
 OR EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'))r(role) CROSS JOIN pg_attribute a CROSS JOIN(VALUES('INSERT'),('UPDATE'))p(privilege) WHERE a.attrelid IN('public.hato_pesajes_leche'::regclass,'public.hato_capturas_foto'::regclass) AND a.attnum>0 AND NOT a.attisdropped AND has_column_privilege(r.role,a.attrelid,a.attnum,p.privilege))
 OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))x WHERE c.oid IN('public.hato_pesajes_leche'::regclass,'public.hato_capturas_foto'::regclass) AND x.grantee=0 AND x.privilege_type IN('INSERT','UPDATE','DELETE','TRUNCATE'))
 OR EXISTS(SELECT 1 FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl)x WHERE a.attrelid IN('public.hato_pesajes_leche'::regclass,'public.hato_capturas_foto'::regclass) AND a.attnum>0 AND NOT a.attisdropped AND x.grantee=0 AND x.privilege_type IN('INSERT','UPDATE')) THEN RAISE EXCEPTION 'Retired milk/capture writer privilege restored' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM(VALUES
 ('public.hato_pesajes_leche'::regclass,'{postgres=arwdDxtm/postgres,anon=rxtm/postgres,authenticated=rxtm/postgres,service_role=arwdDxtm/postgres}'),
 ('public.hato_capturas_foto'::regclass,'{postgres=arwdDxtm/postgres,authenticated=rxtm/postgres,service_role=arwdDxtm/postgres}'))e(target,acl) WHERE NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=e.target AND relacl::text=e.acl)) THEN RAISE EXCEPTION 'Unreviewed retired milk/capture ACL';END IF;
END $$;
REVOKE ALL ON FUNCTION hato_milk_weighing.assert_retired_writers() FROM PUBLIC,anon,authenticated,service_role;
-- Bind the same effective ordinary authority check before/after protected writers.
DO $bind$ DECLARE definition text;patched text;BEGIN
 definition=pg_get_functiondef('hato_milk_weighing.assert_baseline()'::regprocedure);
 patched=regexp_replace(definition,'BEGIN','BEGIN PERFORM hato_milk_weighing.assert_retired_writers();');
 IF patched=definition THEN RAISE EXCEPTION 'Milk retirement binding missing';END IF;EXECUTE patched;
END $bind$;
-- Only the exactly admitted capture ACL changes in the existing full fingerprint.
-- Derived locally on the verified six-export replay; all Storage metadata stays pinned.
CREATE OR REPLACE FUNCTION hato_photo_upload.assert_baseline() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 PERFORM hato_milk_week.assert_baseline();
 IF hato_photo_upload.baseline() IS DISTINCT FROM '39b8de1ede1283e2e57a93b9e6291c21' THEN RAISE EXCEPTION 'Unreviewed photo/Storage baseline';END IF;
END $$;
CREATE OR REPLACE FUNCTION hato_photo_upload.assert_observer_baseline() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE f record;BEGIN
 PERFORM hato_photo_upload.assert_baseline();
 FOR f IN SELECT * FROM (VALUES
('hato_photo_upload.immutable()','d966dfa7162790dee21c58b20333849b',false),
('hato_photo_upload.baseline()','62ab7a509bd6629558d56aebc4bb2a77',false),
('hato_photo_upload.assert_baseline()','79b6742528594b668c8f1edd4e40edb8',false),
('hato_photo_upload.actor(uuid)','d31d72c323243c962b2dd79ca896e42b',false),
('hato_photo_upload.controls()','33f8a7fa3ba62e853cabe6687473cd24',false),
('hato_photo_upload.storage_rows()','46db6bef292e64bc82cd2dff4b4f302c',false),
('hato_photo_upload.other_controls()','c238f4c6d7c22b2c8dd4ad03ca029d61',false),
('hato_photo_upload.result(hato_photo_upload.requests,uuid)','d7eecd63d4a4d88de37d483e90b46e9a',false),
('hato_photo_upload.validate(jsonb)','3094c7514adbeeaf3079270a055803b1',false),
('public.fn_hato_photo_upload_service(text,uuid,uuid,jsonb)','51687054a3fa6ee9f72ec44953f2516b',true),
('public.fn_hato_photo_upload_recover_web(uuid)','eaa59962b8dc91e961f537c82661d9cf',true)
 ) pin(signature,body,secdef) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(f.signature) AND md5(p.prosrc)=f.body AND p.prosecdef=f.secdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed photo upload function: %',f.signature;END IF;
 END LOOP;
 IF has_function_privilege('anon','public.fn_hato_photo_upload_service(text,uuid,uuid,jsonb)','EXECUTE') OR has_function_privilege('authenticated','public.fn_hato_photo_upload_service(text,uuid,uuid,jsonb)','EXECUTE') OR NOT has_function_privilege('service_role','public.fn_hato_photo_upload_service(text,uuid,uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Unreviewed upload service authority';END IF;
END $$;
CREATE OR REPLACE FUNCTION hato_native_photo_upload.assert_baseline() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 PERFORM hato_milk_week.assert_baseline();
 IF hato_native_photo_upload.baseline() IS DISTINCT FROM '39b8de1ede1283e2e57a93b9e6291c21' THEN RAISE EXCEPTION 'Unreviewed photo/Storage baseline';END IF;
END $$;
CREATE OR REPLACE FUNCTION hato_native_photo_upload.assert_observer_baseline() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE f record;BEGIN
 PERFORM hato_photo_upload.assert_observer_baseline();PERFORM hato_native_photo_upload.assert_baseline();
 FOR f IN SELECT * FROM(VALUES
('hato_native_photo_upload.immutable()','d966dfa7162790dee21c58b20333849b',false),
('hato_native_photo_upload.baseline()','62ab7a509bd6629558d56aebc4bb2a77',false),
('hato_native_photo_upload.assert_baseline()','9c08913ceadd02cadc67078612f1b3b3',false),
('hato_native_photo_upload.actor(uuid)','b51dca3e2e6d28e3c4f2d3eecfe6b16f',false),
('hato_native_photo_upload.controls()','94f8abdd80170b98ca43da5c03544d13',false),
('hato_native_photo_upload.storage_rows()','46db6bef292e64bc82cd2dff4b4f302c',false),
('hato_native_photo_upload.other_controls()','22bd79d38f029517545ee8b0d4b6c8fe',false),
('hato_native_photo_upload.result(hato_native_photo_upload.requests,uuid)','d7eecd63d4a4d88de37d483e90b46e9a',false),
('hato_native_photo_upload.validate(jsonb)','3094c7514adbeeaf3079270a055803b1',false),
('public.fn_hato_native_photo_upload_service(text,uuid,uuid,jsonb)','02c216cc09c6855755924a00ee07e1d7',true),
('public.fn_hato_native_photo_upload_inspect_service(uuid,uuid)','462ee73dcacec2b8c3bc5d866b68a9f7',true),
('hato_native_photo_preview.immutable()','3aab8f3f90fcff21d583ff8c39344088',false),
('hato_native_photo_preview.controls()','5f362aa4e2a0cf482888f16e35b47a7d',false),
('hato_native_photo_preview.source()','73f1ee19eba48fd09731d0a081a0f15a',false),
('hato_native_photo_preview.result(hato_native_photo_upload.requests,hato_native_photo_preview.requests,uuid)','7c652df9efacaacff99ffb2ae3496cd2',false),
('public.fn_hato_native_photo_preview_service(text,uuid,uuid,jsonb)','c6a414fabdd6b828adb609182ded3e03',true)) pin(signature,body,secdef) LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(f.signature) AND md5(p.prosrc)=f.body AND p.prosecdef=f.secdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed native photo core: %',f.signature;END IF;
 IF has_function_privilege('anon',f.signature,'EXECUTE') OR has_function_privilege('authenticated',f.signature,'EXECUTE') OR has_function_privilege('service_role',f.signature,'EXECUTE') THEN RAISE EXCEPTION 'Native core must remain private';END IF;
 END LOOP;
END $$;
SELECT hato_upload_discard.assert_history_baseline();
SELECT hato_milk_weighing.assert_retired_writers();
COMMIT;
