-- LOCAL REVIEW ONLY. Prospective verified measured-income invoice after56candidates.
BEGIN;
SELECT hato_birth_undo.lock_domain();
SELECT hato_income_metadata.assert_baseline();
SELECT invoice_upload.assert_controls();
DO $admit$ BEGIN
IF(SELECT md5(prosrc) FROM pg_proc WHERE oid='hato_income_metadata.validate(jsonb,boolean)'::regprocedure) IS DISTINCT FROM '08e05d9bd6a47b2f4575642e4cec4a9b' THEN RAISE EXCEPTION 'Unreviewed original measured invoice function';END IF;
IF(SELECT md5(prosrc) FROM pg_proc WHERE oid='public.fn_hato_income_metadata_source_web(jsonb,uuid)'::regprocedure) IS DISTINCT FROM 'e95c016561f1ef1cc9b22b193e4e2867' THEN RAISE EXCEPTION 'Unreviewed original measured invoice function';END IF;
IF(SELECT md5(prosrc) FROM pg_proc WHERE oid='public.fn_hato_income_metadata_web(text,uuid,jsonb,uuid)'::regprocedure) IS DISTINCT FROM '54bf34680257c5b548af758de3d18bcd' THEN RAISE EXCEPTION 'Unreviewed original measured invoice function';END IF;
IF(SELECT md5(prosrc) FROM pg_proc WHERE oid='hato_income_metadata.assert_controls()'::regprocedure) IS DISTINCT FROM '09eb8553146e37e63cde9219d5817342' THEN RAISE EXCEPTION 'Unreviewed original measured invoice function';END IF;
END $admit$;
CREATE FUNCTION hato_income_metadata.capture_attachment(p jsonb,p_owner uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE proof jsonb=p->'attachment';t invoice_upload.targets;r invoice_upload.requests;o jsonb;BEGIN
 IF NOT(p?'attachment') THEN RETURN NULL;END IF;
 PERFORM invoice_upload.assert_controls();
 SELECT * INTO t FROM invoice_upload.targets WHERE owner=p_owner AND target_key=(proof->'identity'->>'targetKey')::uuid FOR SHARE;
 IF NOT FOUND OR NOT t.active OR t.generation::text IS DISTINCT FROM proof->'identity'->>'generation' THEN RAISE EXCEPTION 'Original invoice target is no longer active';END IF;
 SELECT * INTO r FROM invoice_upload.requests WHERE owner=p_owner AND request_key=(proof->'identity'->>'requestKey')::uuid FOR SHARE;
 IF NOT FOUND OR r.state<>'committed' OR r.cleanup_pending OR invoice_upload.response(r) IS DISTINCT FROM proof OR r.path IS DISTINCT FROM p->'fields'->>'invoice' OR r.identity->>'tipo'<>'venta' THEN RAISE EXCEPTION 'Current owner committed invoice byte receipt required';END IF;
 SELECT to_jsonb(x)-ARRAY['updated_at','last_accessed_at'] INTO o FROM storage.objects x WHERE bucket_id='facturas' AND name=r.path FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Original verified invoice object is missing';END IF;
 RETURN jsonb_build_object('receipt',invoice_upload.response(r),'storageFingerprint',encode(sha256(convert_to(o::text,'UTF8')),'hex'),'targetGeneration',t.generation);
END $$;
REVOKE ALL ON FUNCTION hato_income_metadata.capture_attachment(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION hato_income_metadata.validate(p jsonb,observed boolean) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE v jsonb;expected text[];BEGIN
 expected=CASE WHEN observed THEN ARRAY['fields','kind','observed','targetId','version'] ELSE ARRAY['fields','kind','targetId','version'] END;
 IF p?'attachment' THEN expected=expected||ARRAY['attachment'];IF observed THEN expected=expected||ARRAY['observedAttachment'];END IF;END IF;
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p)k) IS DISTINCT FROM(SELECT array_agg(k ORDER BY k) FROM unnest(expected)k) OR p->'version' IS DISTINCT FROM '1'::jsonb OR p->>'kind' IS DISTINCT FROM 'metadata' OR jsonb_typeof(p->'targetId') IS DISTINCT FROM 'string' OR(p->>'targetId')::uuid::text IS DISTINCT FROM p->>'targetId' OR(observed AND jsonb_typeof(p->'observed') IS DISTINCT FROM 'object') OR octet_length(p::text)>2097152 THEN RAISE EXCEPTION 'Exact measured income metadata intent required';END IF;
 IF jsonb_typeof(p->'fields') IS DISTINCT FROM 'object' OR(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p->'fields')k) IS DISTINCT FROM ARRAY['invoice','observations'] THEN RAISE EXCEPTION 'Only observations and invoice metadata allowed';END IF;
 FOR v IN SELECT p->'fields'->'observations' UNION ALL SELECT p->'fields'->'invoice' LOOP IF jsonb_typeof(v) NOT IN('null','string') OR(jsonb_typeof(v)='string' AND length(v#>>'{}')>8000) THEN RAISE EXCEPTION 'Bounded optional metadata text required';END IF;END LOOP;
 IF p?'attachment' THEN
  IF jsonb_typeof(p->'attachment') IS DISTINCT FROM 'object' OR p->'attachment'->>'state' IS DISTINCT FROM 'committed' OR p->'attachment'->>'path' IS DISTINCT FROM p->'fields'->>'invoice' THEN RAISE EXCEPTION 'Exact original invoice receipt required';END IF;
  IF observed AND(jsonb_typeof(p->'observedAttachment') IS DISTINCT FROM 'object' OR(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p->'observedAttachment')k) IS DISTINCT FROM ARRAY['receipt','storageFingerprint','targetGeneration'] OR p->'observedAttachment'->'receipt' IS DISTINCT FROM p->'attachment' OR(p->'observedAttachment'->>'storageFingerprint')!~'^[a-f0-9]{64}$' OR p->'observedAttachment'->>'targetGeneration' IS DISTINCT FROM p->'attachment'->'identity'->>'generation') THEN RAISE EXCEPTION 'Captured invoice identity required';END IF;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.fn_hato_income_metadata_source_web(p_draft jsonb,p_expected_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor jsonb;s jsonb;BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Current quincena source owner required' USING ERRCODE='42501';END IF;
 actor=hato_income_metadata.actor();PERFORM hato_income_metadata.validate(p_draft,false);PERFORM hato_income_metadata.lock_source();PERFORM hato_income_metadata.assert_baseline();s=hato_income_metadata.source(p_draft);
 IF octet_length(s::text)>2097152 THEN RAISE EXCEPTION 'Bounded quincena source exceeded';END IF;
 IF actor IS DISTINCT FROM hato_income_metadata.actor() THEN RAISE EXCEPTION 'Quincena source actor changed';END IF;
 RETURN jsonb_build_object('version',1,'owner',p_expected_owner,'source',s,'effectiveDate',(now() AT TIME ZONE 'America/Bogota')::date)||CASE WHEN p_draft?'attachment' THEN jsonb_build_object('observedAttachment',hato_income_metadata.capture_attachment(p_draft,p_expected_owner)) ELSE '{}'::jsonb END;
END $$;
CREATE OR REPLACE FUNCTION public.fn_hato_income_metadata_web(p_action text,p_request_key uuid,p_intent jsonb,p_expected_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor jsonb;r hato_income_metadata.requests;expected hato_income_metadata.requests;before_domain jsonb;expected_domain jsonb;before_foreign jsonb;before_controls jsonb;expected_controls jsonb;s jsonb;old_q jsonb;old_income jsonb;new_q jsonb;new_income jsonb;written jsonb;qrow public.hato_produccion_quincenal;irow public.fin_ingresos;traces jsonb;receipt_value jsonb;a hato_income_metadata.audit;wa hato_income_metadata.audit;
BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner OR p_request_key IS NULL THEN RAISE EXCEPTION 'Original quincena owner/key required' USING ERRCODE='42501';END IF;
 actor=hato_income_metadata.actor();PERFORM hato_income_metadata.assert_baseline();
 IF p_action IS NULL OR p_action NOT IN('prepare','post','status','resolve','acknowledge') OR(p_action<>'prepare' AND p_intent IS NOT NULL) THEN RAISE EXCEPTION 'Invalid original quincena action';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('hato-quincena-owner:'||p_expected_owner::text,0));PERFORM pg_advisory_xact_lock(hashtextextended('hato-quincena-key:'||p_request_key::text,0));
 PERFORM hato_income_metadata.lock_source();SELECT * INTO r FROM hato_income_metadata.requests WHERE request_key=p_request_key FOR UPDATE;
 IF FOUND AND r.owner_id IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Original quincena belongs to another owner' USING ERRCODE='42501';END IF;
 IF r.state='committed' AND NOT EXISTS(SELECT 1 FROM hato_income_metadata.audit WHERE request_key=p_request_key AND receipt=r.receipt) THEN RAISE EXCEPTION 'Original quincena audit missing';END IF;
 IF p_action='status' THEN IF r.request_key IS NULL THEN r.request_key=p_request_key;r.owner_id=p_expected_owner;r.state='unknown';r.acknowledged=false;END IF;RETURN hato_income_metadata.result(r);END IF;
 before_domain=hato_birth_undo.capture_domain();expected_domain=before_domain;before_foreign=hato_income_metadata.foreign_controls();before_controls=hato_income_metadata.controls();expected_controls=before_controls;
 IF p_action='prepare' THEN
 PERFORM hato_income_metadata.validate(p_intent,true);
 IF r.request_key IS NOT NULL THEN IF r.intent IS NOT NULL AND r.intent IS DISTINCT FROM p_intent THEN RAISE EXCEPTION 'Original quincena intent changed';END IF;RETURN hato_income_metadata.result(r);END IF;
 IF EXISTS(SELECT 1 FROM hato_income_metadata.requests WHERE owner_id=p_expected_owner AND NOT acknowledged AND state IN('pending','committed')) THEN RAISE EXCEPTION 'Recover original quincena before replacement';END IF;
 s=hato_income_metadata.source(p_intent);IF s IS DISTINCT FROM p_intent->'observed' THEN RAISE EXCEPTION 'Displayed quincena financial source changed';END IF;
 IF p_intent?'attachment' AND hato_income_metadata.capture_attachment(p_intent,p_expected_owner) IS DISTINCT FROM p_intent->'observedAttachment' THEN RAISE EXCEPTION 'Displayed invoice identity changed';END IF;
 r.request_key=p_request_key;r.owner_id=p_expected_owner;r.intent=p_intent;r.original=s;r.plan=hato_income_metadata.plan(p_intent,s,p_expected_owner);r.effective_date=(now() AT TIME ZONE 'America/Bogota')::date;r.state='pending';r.acknowledged=false;expected=r;
 INSERT INTO hato_income_metadata.requests SELECT expected.* RETURNING * INTO r;IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Quincena preparation suppressed/mutated';END IF;
 ELSIF p_action='resolve' THEN
 IF r.request_key IS NULL THEN r.request_key=p_request_key;r.owner_id=p_expected_owner;r.state='canceled';r.acknowledged=false;expected=r;INSERT INTO hato_income_metadata.requests SELECT expected.* RETURNING * INTO r;
 ELSIF r.state='pending' THEN expected=r;expected.state='canceled';UPDATE hato_income_metadata.requests SET state='canceled' WHERE request_key=p_request_key RETURNING * INTO r;ELSE RETURN hato_income_metadata.result(r);END IF;
 IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Quincena cancellation suppressed/mutated';END IF;
 ELSIF p_action='acknowledge' THEN
 IF r.state IS NULL OR r.state NOT IN('committed','canceled') THEN RAISE EXCEPTION 'Terminal original quincena required';END IF;IF r.acknowledged THEN RETURN hato_income_metadata.result(r);END IF;
 expected=r;expected.acknowledged=true;UPDATE hato_income_metadata.requests SET acknowledged=true WHERE request_key=p_request_key RETURNING * INTO r;IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Quincena acknowledgment suppressed/mutated';END IF;
 ELSIF p_action='post' THEN
 IF r.state IS NULL THEN RAISE EXCEPTION 'Original prepared quincena required';END IF;IF r.state='committed' THEN RETURN hato_income_metadata.result(r);ELSIF r.state<>'pending' THEN RAISE EXCEPTION 'Canceled quincena cannot post';END IF;
 s=hato_income_metadata.source(r.intent);IF s IS DISTINCT FROM r.original OR r.effective_date IS DISTINCT FROM(now() AT TIME ZONE 'America/Bogota')::date THEN RAISE EXCEPTION 'Original quincena source/day changed; resolve original';END IF;
 old_q=r.plan->'beforeProduction';old_income=r.plan->'beforeIncome';new_q=r.plan->'afterProduction';new_income=r.plan->'afterIncome';
 IF r.intent->'fields'->'invoice' IS DISTINCT FROM old_income->'url_factura' AND r.intent->'fields'->'invoice'<>'null'::jsonb AND NOT(r.intent?'attachment') THEN RAISE EXCEPTION 'Verified original invoice receipt required for a new reference';END IF;
 IF r.intent?'attachment' AND hato_income_metadata.capture_attachment(r.intent,p_expected_owner) IS DISTINCT FROM r.intent->'observedAttachment' THEN RAISE EXCEPTION 'Original invoice identity changed; resolve original';END IF;
 new_income=new_income||jsonb_build_object('updated_at',now());
 UPDATE public.fin_ingresos SET observaciones=r.intent->'fields'->>'observations',url_factura=r.intent->'fields'->>'invoice',updated_by=p_expected_owner WHERE id=(old_income->>'id')::uuid RETURNING to_jsonb(fin_ingresos.*) INTO written;
 IF NOT FOUND OR written IS DISTINCT FROM new_income THEN RAISE EXCEPTION 'Income metadata write suppressed/mutated';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]') INTO traces FROM public.hato_correcciones t WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(before_domain->'public.hato_correcciones')x WHERE x->>'id'=t.id::text);
 IF jsonb_array_length(traces)<>(CASE WHEN old_q<>'null'::jsonb AND old_q IS DISTINCT FROM new_q THEN 1 ELSE 0 END) THEN RAISE EXCEPTION 'Exact quincena correction count required';END IF;
 IF jsonb_array_length(traces)=1 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(traces)t WHERE t->>'tabla'='hato_produccion_quincenal' AND t->>'operacion'=CASE WHEN new_q='null'::jsonb THEN 'delete' ELSE 'update' END AND t->'datos_anteriores'=old_q AND t->'datos_nuevos'=new_q AND t->>'fila_id'=old_q->>'id' AND t->'animal_id'='null'::jsonb AND t->>'corregido_por'=p_expected_owner::text AND(t->>'corregido_en')::timestamptz=now() AND t->'motivo'='null'::jsonb) THEN RAISE EXCEPTION 'Exact trusted quincena correction required';END IF;
 expected_domain=hato_chequeo_integrity.patch(expected_domain,'hato_produccion_quincenal',CASE WHEN old_q='null'::jsonb THEN '[]'::jsonb ELSE jsonb_build_array(old_q) END,CASE WHEN new_q='null'::jsonb THEN '[]'::jsonb ELSE jsonb_build_array(new_q) END);
 expected_domain=hato_chequeo_integrity.patch(expected_domain,'fin_ingresos',CASE WHEN old_income='null'::jsonb THEN '[]'::jsonb ELSE jsonb_build_array(old_income) END,CASE WHEN new_income='null'::jsonb THEN '[]'::jsonb ELSE jsonb_build_array(new_income) END);expected_domain=hato_chequeo_integrity.patch(expected_domain,'hato_correcciones','[]',traces);
 receipt_value=jsonb_build_object('version',1,'requestKey',r.request_key,'owner',p_expected_owner,'actor',actor,'intent',r.intent,'original',r.original,'plan',r.plan,'effectiveDate',r.effective_date,'recordedAt',now(),'before',jsonb_build_object('production',old_q,'income',old_income),'after',jsonb_build_object('production',new_q,'income',new_income),'corrections',traces,'footprints',jsonb_build_object('before',encode(sha256(convert_to(before_domain::text,'UTF8')),'hex'),'after',encode(sha256(convert_to(expected_domain::text,'UTF8')),'hex')));
 a.request_key=r.request_key;a.receipt=receipt_value;INSERT INTO hato_income_metadata.audit SELECT a.* RETURNING * INTO wa;IF NOT FOUND OR to_jsonb(wa) IS DISTINCT FROM to_jsonb(a) THEN RAISE EXCEPTION 'Quincena trusted audit suppressed/mutated';END IF;
 expected=r;expected.state='committed';expected.receipt=receipt_value;UPDATE hato_income_metadata.requests SET state='committed',receipt=receipt_value WHERE request_key=p_request_key RETURNING * INTO r;IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Quincena committed control suppressed/mutated';END IF;
 expected_controls=jsonb_set(expected_controls,'{audit}',(SELECT jsonb_agg(x ORDER BY x->>'request_key') FROM jsonb_array_elements((expected_controls->'audit')||jsonb_build_array(to_jsonb(a)))x));
 END IF;
 expected_controls=jsonb_set(expected_controls,'{requests}',(SELECT jsonb_agg(x ORDER BY x->>'request_key') FROM jsonb_array_elements((SELECT coalesce(jsonb_agg(x),'[]') FROM jsonb_array_elements(before_controls->'requests')x WHERE x->>'request_key'<>p_request_key::text)||jsonb_build_array(to_jsonb(expected)))x));
 PERFORM hato_income_metadata.assert_baseline();
 IF hato_income_metadata.controls() IS DISTINCT FROM expected_controls OR hato_birth_undo.capture_domain() IS DISTINCT FROM expected_domain OR hato_income_metadata.foreign_controls() IS DISTINCT FROM before_foreign OR hato_income_metadata.actor() IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Quincena final authority/domain/foreign-control mismatch';END IF;
 RETURN hato_income_metadata.result(r);
END $$;
CREATE OR REPLACE FUNCTION hato_income_metadata.assert_controls() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE f record;BEGIN
 IF EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))r(role) CROSS JOIN(VALUES('hato_income_metadata.requests'::regclass),('hato_income_metadata.audit'::regclass))t(target) WHERE has_table_privilege(r.role,t.target,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege(r.role,t.target,'SELECT,INSERT,UPDATE,REFERENCES')) OR EXISTS(SELECT 1 FROM pg_class WHERE oid IN('hato_income_metadata.requests'::regclass,'hato_income_metadata.audit'::regclass) AND(NOT relrowsecurity OR relforcerowsecurity OR pg_get_userbyid(relowner)<>'postgres')) THEN RAISE EXCEPTION 'Private quincena control authority drift';END IF;
 FOR f IN SELECT * FROM(VALUES
('hato_quincena.source(jsonb)','7b26364778fd4514d31338d6b15adfcb',false),
('hato_quincena.assert_controls()','27b7a8f0674dd430162d724e992bd5cc',false),
('hato_income_metadata.capture_attachment(jsonb,uuid)','d358a56454fed478285661c726bddae9',false),
('hato_income_metadata.immutable()','f1071b1c13456df84eea7e1655b57f78',false),
('hato_income_metadata.controls()','b4e5af5fa984a8e8613e591fe5446e95',false),
('hato_income_metadata.foreign_controls()','806a48677f4a224ba533f5e3c94594e1',false),
('hato_income_metadata.lock_source()','af14b761ddc1d4a974344646f3061f91',false),
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
SELECT hato_income_metadata.assert_baseline();
SELECT invoice_upload.assert_controls();
COMMIT;
