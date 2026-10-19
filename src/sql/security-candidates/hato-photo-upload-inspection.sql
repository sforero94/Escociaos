-- NONNUMBERED trusted upload observer after47candidates. OFFLINE REVIEW ONLY.
BEGIN;
SELECT hato_birth_undo.lock_domain();
DO $$ BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed photo observer installation owner required';END IF;
 PERFORM hato_photo_upload.assert_baseline();
END $$;
CREATE FUNCTION hato_photo_upload.assert_observer_baseline() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE f record;BEGIN
 PERFORM hato_photo_upload.assert_baseline();
 FOR f IN SELECT * FROM (VALUES
('hato_photo_upload.immutable()','d966dfa7162790dee21c58b20333849b',false),
('hato_photo_upload.baseline()','62ab7a509bd6629558d56aebc4bb2a77',false),
('hato_photo_upload.assert_baseline()','551a953f4319a73063e5169c55ec3506',false),
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
REVOKE ALL ON FUNCTION hato_photo_upload.assert_observer_baseline() FROM PUBLIC,anon,authenticated,service_role;
SELECT hato_photo_upload.assert_observer_baseline();
CREATE FUNCTION public.fn_hato_photo_upload_inspect_service(p_request_key uuid,p_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor jsonb;r hato_photo_upload.requests;objects jsonb;bucket jsonb;before_domain jsonb;before_storage jsonb;before_controls jsonb;before_foreign jsonb;BEGIN
 IF auth.uid() IS NOT NULL OR p_owner IS NULL OR p_request_key IS NULL THEN RAISE EXCEPTION 'Trusted original photo inspector required' USING ERRCODE='42501';END IF;
 actor=hato_photo_upload.actor(p_owner);
 PERFORM pg_advisory_xact_lock(hashtextextended('hato-photo-owner:'||p_owner::text,0));
 PERFORM hato_birth_undo.lock_domain();LOCK TABLE hato_photo_upload.requests,hato_photo_upload.audit IN SHARE ROW EXCLUSIVE MODE;
 LOCK TABLE storage.buckets,storage.objects IN SHARE ROW EXCLUSIVE MODE;
 PERFORM hato_photo_upload.assert_observer_baseline();
 SELECT * INTO r FROM hato_photo_upload.requests WHERE request_key=p_request_key FOR SHARE;
 IF NOT FOUND OR r.owner_id IS DISTINCT FROM p_owner OR r.state NOT IN('held','verified') THEN RAISE EXCEPTION 'Original held/verified owner-bound photo required' USING ERRCODE='42501';END IF;
 before_domain=hato_birth_undo.capture_domain();before_storage=hato_photo_upload.storage_rows();before_controls=hato_photo_upload.controls();before_foreign=hato_photo_upload.other_controls();
 SELECT to_jsonb(b) INTO bucket FROM storage.buckets b WHERE id='hato-pesajes-fotos';
 IF bucket IS DISTINCT FROM r.bucket THEN RAISE EXCEPTION 'Original photo bucket changed';END IF;
 SELECT jsonb_agg(jsonb_build_object('page',p.ordinality,'row',(SELECT to_jsonb(o) FROM storage.objects o WHERE o.bucket_id='hato-pesajes-fotos' AND o.name=p.path)) ORDER BY p.ordinality) INTO objects FROM jsonb_array_elements_text(r.paths) WITH ORDINALITY p(path,ordinality);
 IF hato_birth_undo.capture_domain() IS DISTINCT FROM before_domain OR hato_photo_upload.storage_rows() IS DISTINCT FROM before_storage OR hato_photo_upload.controls() IS DISTINCT FROM before_controls OR hato_photo_upload.other_controls() IS DISTINCT FROM before_foreign OR hato_photo_upload.actor(p_owner) IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Photo inspection changed authority or state';END IF;
 RETURN jsonb_build_object('version',1,'original',hato_photo_upload.result(r),'bucket',bucket,'objects',objects);
END $$;
REVOKE ALL ON FUNCTION public.fn_hato_photo_upload_inspect_service(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_hato_photo_upload_inspect_service(uuid,uuid) TO service_role;
COMMIT;
