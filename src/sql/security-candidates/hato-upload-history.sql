-- NONNUMBERED retained-discard history visibility after51candidates. OFFLINE ONLY.
BEGIN;
SELECT hato_birth_undo.lock_domain();
SELECT hato_native_photo_upload.assert_observer_baseline();
CREATE FUNCTION hato_upload_discard.assert_history_baseline() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE f record;BEGIN
 PERFORM hato_native_photo_upload.assert_observer_baseline();PERFORM hato_milk_week.assert_baseline();
 FOR f IN SELECT * FROM(VALUES
('hato_upload_discard.controls()','9988a10fb05bbe329407874e824918e0',false),
('hato_upload_discard.foreign_controls()','03ded0262468c4cd9b626ef38c381520',false),
('hato_upload_discard.source(uuid)','ba7ce8cbaec29709fbb822b2a6692ada',false),
('hato_upload_discard.result(hato_upload_discard.requests)','603e4a0e64a42b015c143923591769d0',false),
('public.fn_hato_upload_discard_web(text,uuid,uuid,uuid)','2708ab18ccc8a661ee2dd1ca36f4c76b',true),
('public.fn_hato_upload_discard_recover_web(uuid)','e56656df89e11a2885c9aed2c81860d6',true)) pin(signature,body,secdef) LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(f.signature) AND md5(p.prosrc)=f.body AND p.prosecdef=f.secdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed discard proof writer: %',f.signature;END IF;
 END LOOP;
 IF has_table_privilege('authenticated','hato_upload_discard.requests','SELECT') OR has_table_privilege('authenticated','hato_upload_discard.audit','SELECT') THEN RAISE EXCEPTION 'Private discard controls must remain private';END IF;
END $$;
REVOKE ALL ON FUNCTION hato_upload_discard.assert_history_baseline() FROM PUBLIC,anon,authenticated,service_role;
SELECT hato_upload_discard.assert_history_baseline();
CREATE FUNCTION public.fn_hato_upload_discard_history_web(p_year integer,p_month integer,p_expected_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE profile public.usuarios;before_controls jsonb;before_domain jsonb;before_storage jsonb;entries jsonb;BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner OR p_year IS NULL OR p_year NOT BETWEEN 2020 AND 2100 OR p_month IS NULL OR p_month NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'Exact current reader/month required' USING ERRCODE='42501';END IF;
 SELECT * INTO profile FROM public.usuarios WHERE id=p_expected_owner FOR SHARE;
 IF NOT FOUND OR profile.activo IS DISTINCT FROM true OR profile.rol IS NULL THEN RAISE EXCEPTION 'Current active application reader required' USING ERRCODE='42501';END IF;
 -- Existing capture SELECT is authenticated/TRUE, pinned by the photo baseline.
 -- This adds active-profile enforcement without exposing private proof bodies.
 PERFORM hato_birth_undo.lock_domain();LOCK TABLE hato_upload_discard.requests,hato_upload_discard.audit IN SHARE MODE;LOCK TABLE storage.buckets,storage.objects IN SHARE MODE;
 PERFORM hato_upload_discard.assert_history_baseline();
 before_controls=hato_upload_discard.controls();before_domain=hato_birth_undo.capture_domain();before_storage=hato_photo_upload.storage_rows();
 IF EXISTS(SELECT 1 FROM hato_upload_discard.requests r JOIN public.hato_capturas_foto c ON c.id=r.capture_id WHERE r.state='committed' AND c.tipo='pesaje' AND c.anio=p_year AND c.mes=p_month AND(NOT EXISTS(SELECT 1 FROM hato_upload_discard.audit a WHERE a.request_key=r.request_key AND a.receipt=r.receipt) OR r.receipt->'retained' IS DISTINCT FROM 'true'::jsonb OR r.receipt->'source' IS DISTINCT FROM r.source OR r.receipt->'plan' IS DISTINCT FROM r.plan OR r.receipt->>'requestKey' IS DISTINCT FROM r.request_key::text OR r.receipt->>'owner' IS DISTINCT FROM r.owner_id::text OR r.receipt->'removed' IS DISTINCT FROM r.source->'rows')) THEN RAISE EXCEPTION 'Retained discard audit mismatch';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('captureId',r.capture_id,'discardedAt',r.receipt->'recordedAt','removedCount',jsonb_array_length(r.receipt->'removed'),'retained',true) ORDER BY r.capture_id),'[]') INTO entries FROM hato_upload_discard.requests r JOIN public.hato_capturas_foto c ON c.id=r.capture_id WHERE r.state='committed' AND c.tipo='pesaje' AND c.anio=p_year AND c.mes=p_month;
 IF jsonb_array_length(entries)>5000 OR octet_length(entries::text)>2097152 THEN RAISE EXCEPTION 'Bounded upload history exceeded; do not show incomplete history';END IF;
 IF hato_upload_discard.controls() IS DISTINCT FROM before_controls OR hato_birth_undo.capture_domain() IS DISTINCT FROM before_domain OR hato_photo_upload.storage_rows() IS DISTINCT FROM before_storage OR NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=p_expected_owner AND activo IS TRUE AND rol IS NOT NULL AND to_jsonb(usuarios.*)=to_jsonb(profile)) THEN RAISE EXCEPTION 'History read changed current authority/state';END IF;
 RETURN jsonb_build_object('version',1,'owner',p_expected_owner,'year',p_year,'month',p_month,'entries',entries);
END $$;
REVOKE ALL ON FUNCTION public.fn_hato_upload_discard_history_web(integer,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_hato_upload_discard_history_web(integer,integer,uuid) TO authenticated;
COMMIT;
