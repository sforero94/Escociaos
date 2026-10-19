-- NONNUMBERED retained browser milk photo OCR outcome after48candidates. OFFLINE ONLY.
BEGIN;
SELECT hato_birth_undo.lock_domain();
SELECT hato_photo_upload.assert_observer_baseline();
CREATE SCHEMA hato_photo_preview;
REVOKE ALL ON SCHEMA hato_photo_preview FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE hato_photo_preview.requests(request_key uuid PRIMARY KEY REFERENCES hato_photo_upload.requests,owner_id uuid NOT NULL,permission_id uuid NOT NULL UNIQUE,actor jsonb NOT NULL,claimed_at timestamptz NOT NULL,source jsonb NOT NULL,capture_before jsonb NOT NULL,state text NOT NULL CHECK(state IN('held','ready')),outcome jsonb,capture_after jsonb,receipt jsonb,CHECK((state='ready')=(outcome IS NOT NULL AND capture_after IS NOT NULL AND receipt IS NOT NULL)));
CREATE TABLE hato_photo_preview.audit(request_key uuid PRIMARY KEY REFERENCES hato_photo_preview.requests,receipt jsonb NOT NULL);
ALTER TABLE hato_photo_preview.requests ENABLE ROW LEVEL SECURITY;ALTER TABLE hato_photo_preview.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA hato_photo_preview FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION hato_photo_preview.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='UPDATE' AND TG_TABLE_NAME='requests' AND OLD.state='held' AND NEW.state='ready' AND(to_jsonb(NEW)-'state'-'outcome'-'capture_after'-'receipt')=(to_jsonb(OLD)-'state'-'outcome'-'capture_after'-'receipt') THEN RETURN NEW;END IF;RAISE EXCEPTION 'Immutable original photo OCR proof';
END $$;
CREATE TRIGGER immutable_preview_request BEFORE UPDATE OR DELETE ON hato_photo_preview.requests FOR EACH ROW EXECUTE FUNCTION hato_photo_preview.immutable();
CREATE TRIGGER immutable_preview_audit BEFORE UPDATE OR DELETE ON hato_photo_preview.audit FOR EACH ROW EXECUTE FUNCTION hato_photo_preview.immutable();
CREATE TRIGGER no_truncate_preview_request BEFORE TRUNCATE ON hato_photo_preview.requests FOR EACH STATEMENT EXECUTE FUNCTION hato_photo_preview.immutable();
CREATE TRIGGER no_truncate_preview_audit BEFORE TRUNCATE ON hato_photo_preview.audit FOR EACH STATEMENT EXECUTE FUNCTION hato_photo_preview.immutable();
CREATE FUNCTION hato_photo_preview.controls() RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
SELECT jsonb_build_object('requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_photo_preview.requests x),'audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_photo_preview.audit x));
$$;
CREATE FUNCTION hato_photo_preview.source() RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
SELECT jsonb_build_object('rows',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_pesajes_leche x),'animals',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_animales x),'config',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY clave),'[]') FROM public.hato_config x));
$$;
CREATE FUNCTION hato_photo_preview.result(r hato_photo_upload.requests,q hato_photo_preview.requests,p_permit uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
SELECT jsonb_build_object('version',1,'upload',hato_photo_upload.result(r),'preview',CASE WHEN q.request_key IS NULL THEN NULL ELSE to_jsonb(q) END,'permit',p_permit);
$$;
CREATE FUNCTION public.fn_hato_photo_preview_service(p_action text,p_request_key uuid,p_owner uuid,p_payload jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r hato_photo_upload.requests;q hato_photo_preview.requests;expected hato_photo_preview.requests;written hato_photo_preview.requests;actor jsonb;permit uuid;before_domain jsonb;expected_domain jsonb;before_storage jsonb;parent_controls jsonb;before_controls jsonb;expected_controls jsonb;prior_foreign jsonb;after_foreign jsonb;capture jsonb;capture_after jsonb;row_written jsonb;outcome jsonb;receipt_value jsonb;a hato_photo_preview.audit;wa hato_photo_preview.audit;object jsonb;current_object jsonb;BEGIN
 IF auth.uid() IS NOT NULL OR p_owner IS NULL OR (p_action<>'recover' AND p_request_key IS NULL) THEN RAISE EXCEPTION 'Trusted original photo preview owner/key required' USING ERRCODE='42501';END IF;
 IF p_action IS NULL OR p_action NOT IN('recover','status','claim','record','acknowledge','cancel') OR(p_action<>'record' AND p_payload IS NOT NULL) THEN RAISE EXCEPTION 'Exact photo preview action required';END IF;
 actor=hato_photo_upload.actor(p_owner);PERFORM pg_advisory_xact_lock(hashtextextended('hato-photo-owner:'||p_owner::text,0));PERFORM hato_birth_undo.lock_domain();
 LOCK TABLE hato_photo_upload.requests,hato_photo_upload.audit,hato_photo_preview.requests,hato_photo_preview.audit IN SHARE ROW EXCLUSIVE MODE;LOCK TABLE storage.buckets,storage.objects IN SHARE ROW EXCLUSIVE MODE;
 PERFORM hato_photo_upload.assert_observer_baseline();
 IF p_action='recover' THEN SELECT * INTO r FROM hato_photo_upload.requests WHERE owner_id=p_owner AND NOT acknowledged AND state<>'canceled';IF NOT FOUND THEN RETURN NULL;END IF;
 ELSE SELECT * INTO r FROM hato_photo_upload.requests WHERE request_key=p_request_key;END IF;
 IF r.request_key IS NOT NULL AND r.owner_id IS DISTINCT FROM p_owner THEN RAISE EXCEPTION 'Original preview owner changed' USING ERRCODE='42501';END IF;
 IF r.request_key IS NULL THEN r.request_key=p_request_key;r.owner_id=p_owner;r.state='unknown';r.acknowledged=false;END IF;
 SELECT * INTO q FROM hato_photo_preview.requests WHERE request_key=r.request_key;
 IF q.request_key IS NOT NULL AND(q.owner_id<>p_owner OR(q.state='ready' AND NOT EXISTS(SELECT 1 FROM hato_photo_preview.audit WHERE request_key=q.request_key AND receipt=q.receipt))) THEN RAISE EXCEPTION 'Original photo preview proof missing';END IF;
 IF p_action IN('recover','status') THEN RETURN hato_photo_preview.result(r,q);END IF;
 IF p_action='cancel' THEN
  IF q.request_key IS NOT NULL THEN RAISE EXCEPTION 'Issued OCR claim cannot be canceled';END IF;
  PERFORM public.fn_hato_photo_upload_service('cancel',r.request_key,p_owner,NULL);SELECT * INTO r FROM hato_photo_upload.requests WHERE request_key=r.request_key;RETURN hato_photo_preview.result(r,q);
 END IF;
 IF p_action='acknowledge' THEN
  IF q.state IS DISTINCT FROM 'ready' THEN RAISE EXCEPTION 'Verify retained terminal preview first';END IF;
  PERFORM public.fn_hato_photo_upload_service('acknowledge',r.request_key,p_owner,NULL);SELECT * INTO r FROM hato_photo_upload.requests WHERE request_key=r.request_key;RETURN hato_photo_preview.result(r,q);
 END IF;
 IF r.state<>'verified' OR r.acknowledged THEN RAISE EXCEPTION 'Unacknowledged verified original photo required';END IF;
 IF p_action='claim' AND q.request_key IS NOT NULL THEN RETURN hato_photo_preview.result(r,q);END IF;
 IF p_action='record' AND q.state='ready' THEN
  IF p_payload IS NULL OR p_payload->'outcome' IS DISTINCT FROM q.outcome OR p_payload->>'permissionId' IS DISTINCT FROM q.permission_id::text THEN RAISE EXCEPTION 'Retained original OCR outcome cannot change';END IF;RETURN hato_photo_preview.result(r,q);
 END IF;
 SELECT to_jsonb(c) INTO capture FROM public.hato_capturas_foto c WHERE id=r.request_key;
 IF capture IS DISTINCT FROM r.receipt->'capture' THEN RAISE EXCEPTION 'Original verified capture changed before OCR outcome';END IF;
 IF(SELECT to_jsonb(b) FROM storage.buckets b WHERE id='hato-pesajes-fotos') IS DISTINCT FROM r.bucket THEN RAISE EXCEPTION 'Original OCR bucket changed';END IF;
 FOR object IN SELECT value FROM jsonb_array_elements(r.receipt->'objects') LOOP SELECT to_jsonb(o) INTO current_object FROM storage.objects o WHERE id=(object->'row'->>'id')::uuid;IF current_object IS DISTINCT FROM object->'row' THEN RAISE EXCEPTION 'Original OCR object changed';END IF;END LOOP;
 before_domain=hato_birth_undo.capture_domain();expected_domain=before_domain;before_storage=hato_photo_upload.storage_rows();parent_controls=hato_photo_upload.controls();before_controls=hato_photo_preview.controls();expected_controls=before_controls;prior_foreign=hato_photo_upload.other_controls()-'hato_photo_preview.requests'-'hato_photo_preview.audit';
 IF p_action='claim' THEN
  q.request_key=r.request_key;q.owner_id=p_owner;q.permission_id=gen_random_uuid();q.actor=actor;q.claimed_at=now();q.source=hato_photo_preview.source();q.capture_before=capture;q.state='held';expected=q;
  INSERT INTO hato_photo_preview.requests SELECT expected.* RETURNING * INTO written;permit=q.permission_id;
 ELSE
  IF q.state IS DISTINCT FROM 'held' OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_payload)k) IS DISTINCT FROM ARRAY['outcome','permissionId'] OR p_payload->>'permissionId' IS DISTINCT FROM q.permission_id::text OR hato_photo_preview.source() IS DISTINCT FROM q.source OR capture IS DISTINCT FROM q.capture_before THEN RAISE EXCEPTION 'Original OCR claim/source changed';END IF;
  outcome=p_payload->'outcome';
  IF octet_length(outcome::text)>2097152 OR jsonb_typeof(outcome) IS DISTINCT FROM 'object' OR jsonb_typeof(outcome->'ok') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Bounded known OCR outcome required';END IF;
  IF(outcome->>'ok')::boolean THEN
   IF(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(outcome)k) IS DISTINCT FROM ARRAY['ok','resultado'] OR jsonb_typeof(outcome->'resultado') IS DISTINCT FROM 'object' OR outcome->'resultado'->>'capturaId' IS DISTINCT FROM r.request_key::text OR outcome->'resultado'->'anio' IS DISTINCT FROM r.intent->'year' OR outcome->'resultado'->'mes' IS DISTINCT FROM r.intent->'month' OR jsonb_typeof(outcome->'resultado'->'diff') IS DISTINCT FROM 'array' OR jsonb_typeof(outcome->'resultado'->'ocr') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Original photo/period preview binding required';END IF;
   capture_after=capture||jsonb_build_object('actualizado_en',now(),'modelo',outcome->'resultado'->'ocr'->>'modelo','celdas_leidas_ocr',(SELECT count(*) FROM jsonb_array_elements(outcome->'resultado'->'diff')d WHERE d->'litrosAm'<>'null'::jsonb OR d->'litrosPm'<>'null'::jsonb));
  ELSE
   IF(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(outcome)k) IS DISTINCT FROM ARRAY['error','ok','status'] OR outcome->'status' NOT IN('422','500','502') OR jsonb_typeof(outcome->'error') IS DISTINCT FROM 'string' OR length(outcome->>'error') NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Known bounded OCR rejection required';END IF;
   capture_after=capture||jsonb_build_object('actualizado_en',now(),'desenlace',CASE WHEN outcome->'status'='500' THEN 'error' ELSE 'ocr_fallo' END,'detalle',outcome->>'error');
  END IF;
  UPDATE public.hato_capturas_foto SET actualizado_en=now(),modelo=capture_after->>'modelo',celdas_leidas_ocr=(capture_after->>'celdas_leidas_ocr')::int,desenlace=capture_after->>'desenlace',detalle=capture_after->>'detalle' WHERE id=r.request_key RETURNING to_jsonb(hato_capturas_foto.*) INTO row_written;
  IF NOT FOUND OR row_written IS DISTINCT FROM capture_after THEN RAISE EXCEPTION 'OCR capture outcome suppressed/mutated';END IF;
  expected_domain=hato_chequeo_integrity.patch(expected_domain,'hato_capturas_foto',jsonb_build_array(capture),jsonb_build_array(capture_after));
  receipt_value=jsonb_build_object('version',1,'requestKey',r.request_key,'owner',p_owner,'permissionId',q.permission_id,'actor',actor,'recordedAt',now(),'source',q.source,'outcome',outcome,'captureBefore',capture,'captureAfter',capture_after);
  a.request_key=r.request_key;a.receipt=receipt_value;INSERT INTO hato_photo_preview.audit SELECT a.* RETURNING * INTO wa;IF NOT FOUND OR to_jsonb(wa) IS DISTINCT FROM to_jsonb(a) THEN RAISE EXCEPTION 'OCR audit suppressed/mutated';END IF;
  expected=q;expected.state='ready';expected.outcome=outcome;expected.capture_after=capture_after;expected.receipt=receipt_value;
  UPDATE hato_photo_preview.requests SET state='ready',outcome=expected.outcome,capture_after=expected.capture_after,receipt=expected.receipt WHERE request_key=q.request_key RETURNING * INTO written;
  expected_controls=jsonb_set(expected_controls,'{audit}',(SELECT jsonb_agg(x ORDER BY x->>'request_key') FROM jsonb_array_elements((before_controls->'audit')||jsonb_build_array(to_jsonb(a)))x));
 END IF;
 IF NOT FOUND OR to_jsonb(written) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'OCR claim/control suppressed/mutated';END IF;
 expected_controls=jsonb_set(expected_controls,'{requests}',(SELECT jsonb_agg(x ORDER BY x->>'request_key') FROM jsonb_array_elements((SELECT coalesce(jsonb_agg(x),'[]') FROM jsonb_array_elements(before_controls->'requests')x WHERE x->>'request_key'<>r.request_key::text)||jsonb_build_array(to_jsonb(expected)))x));
 after_foreign=hato_photo_upload.other_controls()-'hato_photo_preview.requests'-'hato_photo_preview.audit';PERFORM hato_photo_upload.assert_observer_baseline();
 IF hato_photo_preview.controls() IS DISTINCT FROM expected_controls OR hato_birth_undo.capture_domain() IS DISTINCT FROM expected_domain OR hato_photo_upload.storage_rows() IS DISTINCT FROM before_storage OR hato_photo_upload.controls() IS DISTINCT FROM parent_controls OR prior_foreign IS DISTINCT FROM after_foreign OR actor IS DISTINCT FROM hato_photo_upload.actor(p_owner) THEN RAISE EXCEPTION 'OCR final domain/Storage/control/authority mismatch';END IF;
 RETURN hato_photo_preview.result(r,expected,permit);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hato_photo_preview FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_hato_photo_preview_service(text,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_hato_photo_preview_service(text,uuid,uuid,jsonb) TO service_role;
COMMIT;
