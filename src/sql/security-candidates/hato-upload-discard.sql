-- NONNUMBERED protected retained-evidence discard after50candidates. OFFLINE ONLY.
BEGIN;
SELECT hato_birth_undo.lock_domain();
SELECT hato_native_photo_upload.assert_observer_baseline();
CREATE SCHEMA hato_upload_discard;
REVOKE ALL ON SCHEMA hato_upload_discard FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE hato_upload_discard.requests(request_key uuid PRIMARY KEY,owner_id uuid NOT NULL,capture_id uuid,source jsonb,plan jsonb,state text NOT NULL CHECK(state IN('pending','committed','canceled')),receipt jsonb,acknowledged boolean NOT NULL DEFAULT false,CHECK((state='committed')=(receipt IS NOT NULL)),CHECK(state='canceled' OR capture_id IS NOT NULL AND source IS NOT NULL AND plan IS NOT NULL),CHECK(NOT acknowledged OR state IN('committed','canceled')));
CREATE UNIQUE INDEX one_discard_owner ON hato_upload_discard.requests(owner_id) WHERE NOT acknowledged;
CREATE UNIQUE INDEX one_discard_capture ON hato_upload_discard.requests(capture_id) WHERE state IN('pending','committed');
CREATE TABLE hato_upload_discard.audit(request_key uuid PRIMARY KEY REFERENCES hato_upload_discard.requests,receipt jsonb NOT NULL);
ALTER TABLE hato_upload_discard.requests ENABLE ROW LEVEL SECURITY;ALTER TABLE hato_upload_discard.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA hato_upload_discard FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable_discard BEFORE UPDATE OR DELETE ON hato_upload_discard.requests FOR EACH ROW EXECUTE FUNCTION hato_milk_week.immutable();
CREATE TRIGGER immutable_discard_audit BEFORE UPDATE OR DELETE ON hato_upload_discard.audit FOR EACH ROW EXECUTE FUNCTION hato_milk_week.immutable();
CREATE TRIGGER no_truncate_discard BEFORE TRUNCATE ON hato_upload_discard.requests FOR EACH STATEMENT EXECUTE FUNCTION hato_milk_week.immutable();
CREATE TRIGGER no_truncate_discard_audit BEFORE TRUNCATE ON hato_upload_discard.audit FOR EACH STATEMENT EXECUTE FUNCTION hato_milk_week.immutable();
CREATE FUNCTION hato_upload_discard.controls() RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$ SELECT jsonb_build_object('requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_upload_discard.requests x),'audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_upload_discard.audit x)); $$;
CREATE FUNCTION hato_upload_discard.foreign_controls() RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$ SELECT(hato_photo_upload.other_controls()-'hato_upload_discard.requests'-'hato_upload_discard.audit'-'hato_milk_week.requests'-'hato_milk_week.audit')||jsonb_build_object('web_upload',hato_photo_upload.controls()); $$;
CREATE FUNCTION hato_upload_discard.source(p_capture uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE uploads jsonb;previews jsonb;milks jsonb;u jsonb;q jsonb;m jsonb;capture jsonb;rows jsonb;old jsonb;ob jsonb;BEGIN
 PERFORM hato_native_photo_upload.assert_observer_baseline();PERFORM hato_milk_week.assert_baseline();
 SELECT to_jsonb(c) INTO capture FROM public.hato_capturas_foto c WHERE id=p_capture;
 SELECT coalesce(jsonb_agg(v),'[]') INTO uploads FROM(SELECT to_jsonb(r) v FROM hato_photo_upload.requests r WHERE request_key=p_capture UNION ALL SELECT to_jsonb(r) FROM hato_native_photo_upload.requests r WHERE request_key=p_capture)s;
 SELECT coalesce(jsonb_agg(v),'[]') INTO previews FROM(SELECT to_jsonb(r) v FROM hato_photo_preview.requests r WHERE request_key=p_capture AND EXISTS(SELECT 1 FROM hato_photo_preview.audit a WHERE a.request_key=r.request_key AND a.receipt=r.receipt) UNION ALL SELECT to_jsonb(r) FROM hato_native_photo_preview.requests r WHERE request_key=p_capture AND EXISTS(SELECT 1 FROM hato_native_photo_preview.audit a WHERE a.request_key=r.request_key AND a.receipt=r.receipt))s;
 SELECT coalesce(jsonb_agg(v),'[]') INTO milks FROM(SELECT to_jsonb(r) v FROM hato_milk_weighing.requests r WHERE r.intent->>'captureId'=p_capture::text AND r.state<>'canceled' UNION ALL SELECT to_jsonb(r) FROM hato_milk_telegram.requests r WHERE r.intent->>'captureId'=p_capture::text AND r.state<>'canceled')s;
 IF capture IS NULL OR jsonb_array_length(uploads)<>1 OR jsonb_array_length(previews)<>1 OR jsonb_array_length(milks)<>1 THEN RAISE EXCEPTION 'Unique protected upload/OCR/milk provenance required; legacy or ambiguous upload is ineligible';END IF;
 u=uploads->0;q=previews->0;m=milks->0;
 IF u->>'state'<>'verified' OR q->>'state'<>'ready' OR q->'outcome'->'ok' IS DISTINCT FROM 'true'::jsonb OR m->>'state'<>'committed' OR u->'owner_id' IS DISTINCT FROM q->'owner_id' OR u->'owner_id' IS DISTINCT FROM m->'owner_id' OR u->'receipt'->'capture' IS DISTINCT FROM q->'capture_before' OR q->'capture_after' IS DISTINCT FROM m->'receipt'->'capture'->'before' OR capture IS DISTINCT FROM m->'receipt'->'capture'->'after' OR m->'receipt'->'plan' IS DISTINCT FROM m->'plan' OR m->'receipt'->'intent' IS DISTINCT FROM m->'intent' THEN RAISE EXCEPTION 'Known exact original protected capture lineage required';END IF;
 IF NOT EXISTS(SELECT 1 FROM hato_milk_weighing.audit WHERE request_key=(m->>'request_key')::uuid AND receipt=m->'receipt') AND NOT EXISTS(SELECT 1 FROM hato_milk_telegram.audit WHERE request_key=(m->>'request_key')::uuid AND receipt=m->'receipt') THEN RAISE EXCEPTION 'Original milk audit missing';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(m->'plan'->'accepted')e WHERE e->'before' IS DISTINCT FROM 'null'::jsonb) THEN RAISE EXCEPTION 'Preexisting updated rows cannot be discarded';END IF;
 SELECT jsonb_agg((e->'after')||jsonb_build_object('created_at',m->'receipt'->'recordedAt') ORDER BY e->'after'->>'id') INTO rows FROM jsonb_array_elements(m->'plan'->'accepted')e;
 IF rows IS NULL OR jsonb_array_length(rows) NOT BETWEEN 1 AND 2000 OR jsonb_array_length(rows)<>(SELECT count(DISTINCT e->>'id') FROM jsonb_array_elements(rows)e) OR rows IS DISTINCT FROM(SELECT jsonb_agg(e ORDER BY e->>'id') FROM jsonb_array_elements(m->'receipt'->'after')e) THEN RAISE EXCEPTION 'Bounded exact original inserted rows required';END IF;
 FOR old IN SELECT value FROM jsonb_array_elements(rows) LOOP IF old IS DISTINCT FROM(SELECT to_jsonb(x) FROM public.hato_pesajes_leche x WHERE x.id=(old->>'id')::uuid) THEN RAISE EXCEPTION 'Original inserted milk row changed or missing';END IF;END LOOP;
 IF EXISTS(SELECT 1 FROM hato_milk_week.requests WHERE state='pending' AND EXISTS(SELECT 1 FROM jsonb_array_elements(plan->'changes')e JOIN jsonb_array_elements(rows)r ON e->'before'->>'id'=r->>'id')) THEN RAISE EXCEPTION 'Competing prepared week writer';END IF;
 IF u->'bucket' IS DISTINCT FROM(SELECT to_jsonb(b) FROM storage.buckets b WHERE id='hato-pesajes-fotos') THEN RAISE EXCEPTION 'Original retained photo bucket changed';END IF;
 FOR ob IN SELECT value FROM jsonb_array_elements(u->'receipt'->'objects') LOOP
 IF ob->'row' IS DISTINCT FROM(SELECT to_jsonb(o) FROM storage.objects o WHERE id=(ob->'row'->>'id')::uuid) OR EXISTS(SELECT 1 FROM public.hato_capturas_foto c WHERE c.id<>p_capture AND c.storage_bucket='hato-pesajes-fotos' AND ob->'row'->>'name'=ANY(c.storage_rutas)) THEN RAISE EXCEPTION 'Retained photo object identity ambiguous or changed';END IF;
 END LOOP;
 IF octet_length((u||q||m)::text)>8388608 THEN RAISE EXCEPTION 'Bounded discard evidence required';END IF;
 RETURN jsonb_build_object('capture',capture,'upload',u,'preview',q,'milk',m,'rows',rows);
END $$;
CREATE FUNCTION hato_upload_discard.result(r hato_upload_discard.requests) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$ SELECT to_jsonb(r); $$;
CREATE FUNCTION public.fn_hato_upload_discard_web(p_action text,p_request_key uuid,p_capture uuid,p_expected_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor jsonb;r hato_upload_discard.requests;e hato_upload_discard.requests;w hato_upload_discard.requests;a hato_upload_discard.audit;wa hato_upload_discard.audit;before_domain jsonb;expected_domain jsonb;before_storage jsonb;foreign_before jsonb;own_before jsonb;own_expected jsonb;week_before jsonb;week_expected jsonb;plan jsonb='[]';week text;entry jsonb;week_source jsonb;intent jsonb;part jsonb;posted jsonb;ack jsonb;receipts jsonb='[]';traces jsonb='[]';rows jsonb;receipt_value jsonb;BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner OR p_request_key IS NULL OR p_action IS NULL OR p_action NOT IN('prepare','post','status','resolve','acknowledge') OR(p_action<>'prepare' AND p_capture IS NOT NULL) THEN RAISE EXCEPTION 'Exact owner-bound discard action required' USING ERRCODE='42501';END IF;
 actor=hato_milk_week.actor();PERFORM pg_advisory_xact_lock(hashtextextended('hato-discard-owner:'||p_expected_owner::text,0));PERFORM hato_birth_undo.lock_domain();LOCK TABLE hato_upload_discard.requests,hato_upload_discard.audit,hato_milk_week.requests,hato_milk_week.audit IN SHARE ROW EXCLUSIVE MODE;LOCK TABLE storage.buckets,storage.objects IN SHARE ROW EXCLUSIVE MODE;
 PERFORM hato_native_photo_upload.assert_observer_baseline();PERFORM hato_milk_week.assert_baseline();
 SELECT * INTO r FROM hato_upload_discard.requests WHERE request_key=p_request_key;
 IF FOUND AND r.owner_id IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Discard original owner changed';END IF;
 IF r.state='committed' AND NOT EXISTS(SELECT 1 FROM hato_upload_discard.audit WHERE request_key=r.request_key AND receipt=r.receipt) THEN RAISE EXCEPTION 'Discard audit missing';END IF;
 IF p_action='status' THEN IF r.request_key IS NULL THEN RETURN NULL;END IF;RETURN to_jsonb(r);END IF;
 before_domain=hato_birth_undo.capture_domain();before_storage=hato_photo_upload.storage_rows();foreign_before=hato_upload_discard.foreign_controls();own_before=hato_upload_discard.controls();own_expected=own_before;week_before=hato_milk_week.controls();week_expected=week_before;
 IF p_action='prepare' THEN
 IF p_capture IS NULL THEN RAISE EXCEPTION 'Original capture required';END IF;
 IF r.request_key IS NOT NULL THEN IF r.capture_id IS DISTINCT FROM p_capture THEN RAISE EXCEPTION 'Discard target changed';END IF;RETURN to_jsonb(r);END IF;
 r.request_key=p_request_key;r.owner_id=p_expected_owner;r.capture_id=p_capture;r.source=hato_upload_discard.source(p_capture);
 FOR week IN SELECT DISTINCT date_trunc('week',(x->>'fecha')::date)::date::text FROM jsonb_array_elements(r.source->'rows')x ORDER BY 1 LOOP plan=plan||jsonb_build_array(jsonb_build_object('key',gen_random_uuid(),'start',week,'end',(week::date+6)::text));END LOOP;
 r.plan=plan;r.state='pending';r.acknowledged=false;e=r;INSERT INTO hato_upload_discard.requests SELECT e.* RETURNING * INTO w;
 ELSIF p_action='resolve' THEN
 IF r.request_key IS NULL THEN r.request_key=p_request_key;r.owner_id=p_expected_owner;r.state='canceled';r.acknowledged=false;e=r;INSERT INTO hato_upload_discard.requests SELECT e.* RETURNING * INTO w;
 ELSIF r.state='pending' THEN e=r;e.state='canceled';UPDATE hato_upload_discard.requests SET state='canceled' WHERE request_key=p_request_key RETURNING * INTO w;ELSE RETURN to_jsonb(r);END IF;
 ELSIF p_action='acknowledge' THEN
 IF r.state IS NULL OR r.state='pending' THEN RAISE EXCEPTION 'Terminal discard required';END IF;IF r.acknowledged THEN RETURN to_jsonb(r);END IF;e=r;e.acknowledged=true;UPDATE hato_upload_discard.requests SET acknowledged=true WHERE request_key=p_request_key RETURNING * INTO w;
 ELSE
 IF r.state IS NULL THEN RAISE EXCEPTION 'Prepared discard required';END IF;IF r.state IN('committed','canceled') THEN RETURN to_jsonb(r);END IF;
 IF hato_upload_discard.source(r.capture_id) IS DISTINCT FROM r.source THEN RAISE EXCEPTION 'Captured discard source changed';END IF;
 rows=r.source->'rows';expected_domain=before_domain;
 FOR entry IN SELECT value FROM jsonb_array_elements(r.plan) LOOP
 week_source=hato_milk_week.snapshot(entry->>'start',entry->>'end');
 SELECT jsonb_build_object('version',1,'start',entry->>'start','end',entry->>'end','observed',week_source->'rows','changes',jsonb_agg(jsonb_build_object('id',x->>'id','remove',true,'am',NULL,'pm',NULL,'total',NULL) ORDER BY x->>'id')) INTO intent FROM jsonb_array_elements(rows)x WHERE(x->>'fecha')::date BETWEEN(entry->>'start')::date AND(entry->>'end')::date;
 part=public.fn_hato_milk_week_web('prepare',(entry->>'key')::uuid,intent,p_expected_owner);posted=public.fn_hato_milk_week_web('post',(entry->>'key')::uuid,NULL,p_expected_owner);ack=public.fn_hato_milk_week_web('acknowledge',(entry->>'key')::uuid,NULL,p_expected_owner);
 IF posted->>'state'<>'committed' OR ack->'acknowledged' IS DISTINCT FROM 'true'::jsonb OR (ack-'acknowledged') IS DISTINCT FROM(posted-'acknowledged') THEN RAISE EXCEPTION 'Nested week discard proof mismatch';END IF;
 receipts=receipts||jsonb_build_array(posted->'receipt');traces=traces||(posted->'receipt'->'corrections');
 week_expected=jsonb_set(week_expected,'{requests}',(SELECT jsonb_agg(x ORDER BY x->>'request_key') FROM jsonb_array_elements((week_expected->'requests')||jsonb_build_array(jsonb_build_object('request_key',ack->'requestKey','owner_id',ack->'owner','intent',ack->'intent','original',ack->'original','plan',ack->'plan','effective_date',ack->'effectiveDate','state',ack->'state','receipt',ack->'receipt','acknowledged',true)))x));week_expected=jsonb_set(week_expected,'{audit}',(SELECT jsonb_agg(x ORDER BY x->>'request_key') FROM jsonb_array_elements((week_expected->'audit')||jsonb_build_array(jsonb_build_object('request_key',entry->>'key','receipt',posted->'receipt')))x));
 END LOOP;
 expected_domain=hato_chequeo_integrity.patch(expected_domain,'hato_pesajes_leche',rows,'[]');expected_domain=hato_chequeo_integrity.patch(expected_domain,'hato_correcciones','[]',traces);
 IF hato_birth_undo.capture_domain() IS DISTINCT FROM expected_domain THEN RAISE EXCEPTION 'Discard exact domain/capture retention mismatch';END IF;
 receipt_value=jsonb_build_object('version',1,'requestKey',r.request_key,'owner',p_expected_owner,'actor',actor,'source',r.source,'plan',r.plan,'removed',rows,'weekReceipts',receipts,'corrections',traces,'retained',true,'recordedAt',now());a.request_key=r.request_key;a.receipt=receipt_value;INSERT INTO hato_upload_discard.audit SELECT a.* RETURNING * INTO wa;IF NOT FOUND OR to_jsonb(wa) IS DISTINCT FROM to_jsonb(a) THEN RAISE EXCEPTION 'Discard trusted audit suppressed/mutated';END IF;
 e=r;e.state='committed';e.receipt=receipt_value;UPDATE hato_upload_discard.requests SET state='committed',receipt=e.receipt WHERE request_key=p_request_key RETURNING * INTO w;
 own_expected=jsonb_set(own_expected,'{audit}',(SELECT jsonb_agg(x ORDER BY x->>'request_key') FROM jsonb_array_elements((own_expected->'audit')||jsonb_build_array(to_jsonb(a)))x));
 END IF;
 IF NOT FOUND OR to_jsonb(w) IS DISTINCT FROM to_jsonb(e) THEN RAISE EXCEPTION 'Discard control suppressed/mutated';END IF;
 own_expected=jsonb_set(own_expected,'{requests}',(SELECT jsonb_agg(x ORDER BY x->>'request_key') FROM jsonb_array_elements((SELECT coalesce(jsonb_agg(x),'[]') FROM jsonb_array_elements(own_before->'requests')x WHERE x->>'request_key'<>p_request_key::text)||jsonb_build_array(to_jsonb(e)))x));
 PERFORM hato_native_photo_upload.assert_observer_baseline();PERFORM hato_milk_week.assert_baseline();
 IF hato_upload_discard.controls() IS DISTINCT FROM own_expected OR hato_milk_week.controls() IS DISTINCT FROM week_expected OR hato_photo_upload.storage_rows() IS DISTINCT FROM before_storage OR hato_upload_discard.foreign_controls() IS DISTINCT FROM foreign_before OR hato_birth_undo.capture_domain() IS DISTINCT FROM coalesce(expected_domain,before_domain) OR hato_milk_week.actor() IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Discard final domain/Storage/control/authority mismatch';END IF;RETURN to_jsonb(e);
END $$;
CREATE FUNCTION public.fn_hato_upload_discard_recover_web(p_expected_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE r hato_upload_discard.requests;BEGIN IF auth.uid() IS DISTINCT FROM p_expected_owner OR p_expected_owner IS NULL THEN RAISE EXCEPTION 'Current discard owner required';END IF;PERFORM hato_milk_week.actor();PERFORM pg_advisory_xact_lock(hashtextextended('hato-discard-owner:'||p_expected_owner::text,0));SELECT * INTO r FROM hato_upload_discard.requests WHERE owner_id=p_expected_owner AND NOT acknowledged;IF NOT FOUND THEN RETURN NULL;END IF;RETURN public.fn_hato_upload_discard_web('status',r.request_key,NULL,p_expected_owner);END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hato_upload_discard FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_hato_upload_discard_web(text,uuid,uuid,uuid),public.fn_hato_upload_discard_recover_web(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_hato_upload_discard_web(text,uuid,uuid,uuid),public.fn_hato_upload_discard_recover_web(uuid) TO authenticated;
COMMIT;
