-- LOCAL REVIEW ONLY. Captured original terminal release; no file deletion or actual caller cutover.
BEGIN;
SELECT hato_birth_undo.lock_domain();
SELECT hato_income_metadata.assert_baseline();
SELECT invoice_upload.assert_controls();
DO $admit$ BEGIN
IF(SELECT md5(prosrc) FROM pg_proc WHERE oid='hato_income_metadata.controls()'::regprocedure) IS DISTINCT FROM 'a6887150eb1f451ba14969c909c8b596' THEN RAISE EXCEPTION 'Unreviewed invoice terminal dependency';END IF;
IF(SELECT md5(prosrc) FROM pg_proc WHERE oid='hato_income_metadata.lock_source()'::regprocedure) IS DISTINCT FROM 'b388ed8541dc2f41801dadf93fc9aa9d' THEN RAISE EXCEPTION 'Unreviewed invoice terminal dependency';END IF;
IF(SELECT md5(prosrc) FROM pg_proc WHERE oid='hato_income_metadata.assert_invoice_origins()'::regprocedure) IS DISTINCT FROM '98c0f962bad2385337cb00a267b7725a' THEN RAISE EXCEPTION 'Unreviewed invoice terminal dependency';END IF;
IF(SELECT md5(prosrc) FROM pg_proc WHERE oid='public.fn_hato_income_invoice_origin_web(text,uuid,uuid,jsonb,jsonb,uuid)'::regprocedure) IS DISTINCT FROM 'fecda06d78a28adc4cf392a32e99c28c' THEN RAISE EXCEPTION 'Unreviewed invoice terminal dependency';END IF;
IF(SELECT md5(prosrc) FROM pg_proc WHERE oid='hato_income_metadata.assert_controls()'::regprocedure) IS DISTINCT FROM 'ae3c2c32ca2350b40f8bd51072b557ef' THEN RAISE EXCEPTION 'Unreviewed invoice terminal dependency';END IF;
END $admit$;
CREATE TABLE hato_income_metadata.invoice_releases(origin_key uuid PRIMARY KEY REFERENCES hato_income_metadata.invoice_origins(request_key),owner_id uuid NOT NULL,income_id uuid NOT NULL,receipt jsonb NOT NULL);
ALTER TABLE hato_income_metadata.invoice_releases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE hato_income_metadata.invoice_releases FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable_invoice_release BEFORE UPDATE OR DELETE ON hato_income_metadata.invoice_releases FOR EACH ROW EXECUTE FUNCTION hato_income_metadata.immutable_invoice_origin();
CREATE TRIGGER no_truncate_invoice_release BEFORE TRUNCATE ON hato_income_metadata.invoice_releases FOR EACH STATEMENT EXECUTE FUNCTION hato_income_metadata.immutable_invoice_origin();
ALTER TABLE hato_income_metadata.invoice_origins DROP CONSTRAINT invoice_origins_owner_id_income_id_key;
CREATE FUNCTION hato_income_metadata.invoice_release_preview(p_origin_key uuid,p_owner uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE o hato_income_metadata.invoice_origins;r invoice_upload.requests;t invoice_upload.targets;executions jsonb;obj jsonb;refs jsonb;claims jsonb;disposition text='held';BEGIN
 SELECT * INTO o FROM hato_income_metadata.invoice_origins WHERE request_key=p_origin_key AND owner_id=p_owner;
 IF NOT FOUND THEN RAISE EXCEPTION 'Original invoice belongs to another owner or is missing' USING ERRCODE='42501';END IF;
 SELECT * INTO t FROM invoice_upload.targets WHERE owner=p_owner AND target_key=(o.identity->>'targetKey')::uuid FOR UPDATE;
 IF NOT FOUND OR t.generation::text IS DISTINCT FROM o.identity->>'generation' THEN RAISE EXCEPTION 'Original invoice target missing or changed';END IF;
 SELECT * INTO r FROM invoice_upload.requests WHERE owner=p_owner AND request_key=(o.identity->>'requestKey')::uuid FOR UPDATE;
 IF NOT FOUND OR r.identity IS DISTINCT FROM o.identity OR r.receipt_id::text IS DISTINCT FROM o.reservation->>'receiptId' OR r.path IS DISTINCT FROM o.reservation->>'path' OR(SELECT count(*) FROM invoice_upload.requests WHERE owner=p_owner AND identity->>'targetKey'=t.target_key::text)<>1 THEN RAISE EXCEPTION 'Exact exclusive original invoice request required';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY execution_id),'[]') INTO executions FROM invoice_upload.executions x WHERE owner=p_owner AND request_key=r.request_key;
 SELECT to_jsonb(x)-ARRAY['updated_at','last_accessed_at'] INTO obj FROM storage.objects x WHERE bucket_id='facturas' AND name=r.path;
 SELECT coalesce(jsonb_agg(x ORDER BY x::text),'[]') INTO refs FROM(
 SELECT jsonb_build_object('table','compras','row',to_jsonb(x)) x FROM public.compras x WHERE invoice_upload.canonical_path(url_factura)=r.path OR invoice_upload.canonical_path(link_factura)=r.path
 UNION ALL SELECT jsonb_build_object('table','fin_gastos','row',to_jsonb(x)) FROM public.fin_gastos x WHERE invoice_upload.canonical_path(url_factura)=r.path
 UNION ALL SELECT jsonb_build_object('table','fin_ingresos','row',to_jsonb(x)) FROM public.fin_ingresos x WHERE invoice_upload.canonical_path(url_factura)=r.path)q;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') INTO claims FROM hato_income_metadata.requests x WHERE NOT acknowledged AND state IN('pending','committed') AND intent->>'targetId'=o.income_id::text;
 IF jsonb_array_length(claims)=0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(executions)x WHERE x->'settled' IS DISTINCT FROM 'true'::jsonb) THEN
  IF r.state='committed' AND NOT r.cleanup_pending THEN disposition='committed_settled';
  ELSIF r.state='pending' AND NOT r.cleanup_pending AND r.reason IS NULL AND r.cleanup_observed_at IS NULL AND r.cleanup_observed_absent IS NULL AND jsonb_array_length(executions)=0 AND obj IS NULL AND jsonb_array_length(refs)=0 THEN disposition='unused_fenced';
  ELSIF r.state='quarantined' AND NOT r.cleanup_pending AND r.cleanup_observed_absent IS TRUE AND r.cleanup_observed_at IS NOT NULL AND obj IS NULL AND jsonb_array_length(refs)=0 THEN disposition='quarantine_settled_absent';END IF;
 END IF;
 RETURN jsonb_build_object('version',1,'owner',p_owner,'incomeId',o.income_id,'originKey',o.request_key,'origin',to_jsonb(o),'request',to_jsonb(r),'target',to_jsonb(t),'executions',executions,'object',obj,'references',refs,'metadataClaims',claims,'income',(SELECT to_jsonb(x) FROM public.fin_ingresos x WHERE id=o.income_id),'disposition',disposition);
END $$;
CREATE FUNCTION hato_income_metadata.assert_invoice_releases() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))r(role) WHERE has_table_privilege(r.role,'hato_income_metadata.invoice_releases','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege(r.role,'hato_income_metadata.invoice_releases','SELECT,INSERT,UPDATE,REFERENCES')) OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='hato_income_metadata.invoice_releases'::regclass AND relkind='r' AND relrowsecurity AND NOT relforcerowsecurity AND pg_get_userbyid(relowner)='postgres') OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='hato_income_metadata.invoice_releases'::regclass) OR EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class='hato_income_metadata.invoice_releases'::regclass) THEN RAISE EXCEPTION 'Private invoice release authority drift';END IF;
 IF(SELECT jsonb_agg(jsonb_build_array(attname,format_type(atttypid,atttypmod),attnotnull,attgenerated,attidentity) ORDER BY attnum) FROM pg_attribute WHERE attrelid='hato_income_metadata.invoice_releases'::regclass AND attnum>0 AND NOT attisdropped) IS DISTINCT FROM '[["origin_key","uuid",true,"",""],["owner_id","uuid",true,"",""],["income_id","uuid",true,"",""],["receipt","jsonb",true,"",""]]'::jsonb OR EXISTS(SELECT 1 FROM pg_attrdef WHERE adrelid='hato_income_metadata.invoice_releases'::regclass) OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid='hato_income_metadata.invoice_releases'::regclass OR inhparent='hato_income_metadata.invoice_releases'::regclass) THEN RAISE EXCEPTION 'Private invoice release columns drift';END IF;
 IF(SELECT count(*) FROM pg_constraint WHERE conrelid='hato_income_metadata.invoice_releases'::regclass)<>2 OR EXISTS(SELECT 1 FROM(VALUES('invoice_releases_pkey','PRIMARY KEY (origin_key)'),('invoice_releases_origin_key_fkey','FOREIGN KEY (origin_key) REFERENCES hato_income_metadata.invoice_origins(request_key)'))e(name,definition) WHERE NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='hato_income_metadata.invoice_releases'::regclass AND conname=e.name AND pg_get_constraintdef(oid)=e.definition AND convalidated AND NOT condeferrable AND NOT condeferred)) OR(SELECT count(*) FROM pg_index WHERE indrelid='hato_income_metadata.invoice_releases'::regclass)<>1 OR EXISTS(SELECT 1 FROM pg_index WHERE indrelid='hato_income_metadata.invoice_releases'::regclass AND(NOT indisvalid OR NOT indisready OR NOT indislive OR NOT indisunique OR NOT indimmediate OR indnullsnotdistinct OR indexprs IS NOT NULL OR indpred IS NOT NULL OR indnatts<>indnkeyatts)) THEN RAISE EXCEPTION 'Private invoice release constraint/index drift';END IF;
 IF(SELECT count(*) FROM pg_trigger WHERE tgrelid='hato_income_metadata.invoice_releases'::regclass AND NOT tgisinternal)<>2 OR EXISTS(SELECT 1 FROM(VALUES('immutable_invoice_release',27),('no_truncate_invoice_release',34))e(name,kind) WHERE NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='hato_income_metadata.invoice_releases'::regclass AND tgname=e.name AND tgtype=e.kind AND tgenabled='O' AND tgfoid='hato_income_metadata.immutable_invoice_origin()'::regprocedure AND NOT tgdeferrable AND NOT tginitdeferred AND tgqual IS NULL AND tgattr::text='' AND tgnargs=0)) THEN RAISE EXCEPTION 'Immutable invoice release binding drift';END IF;
END $$;
CREATE FUNCTION public.fn_hato_income_invoice_release_web(p_action text,p_origin_key uuid,p_income_id uuid,p_preview jsonb,p_expected_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a jsonb;v jsonb;old_domain jsonb;old_foreign jsonb;old_controls jsonb;expected_foreign jsonb;expected_controls jsonb;t jsonb;row_value hato_income_metadata.invoice_releases;written hato_income_metadata.invoice_releases;BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner OR p_income_id IS NULL OR p_action IS NULL OR p_action NOT IN('preview','release','recover') THEN RAISE EXCEPTION 'Current original release owner required' USING ERRCODE='42501';END IF;
 a=hato_income_metadata.actor();PERFORM hato_income_metadata.assert_baseline();PERFORM invoice_upload.assert_controls();
 IF(p_action IN('preview','release') AND p_origin_key IS NULL) OR(p_action<>'release' AND p_preview IS NOT NULL) OR(p_action='release' AND(jsonb_typeof(p_preview) IS DISTINCT FROM 'object' OR octet_length(p_preview::text)>4194304)) THEN RAISE EXCEPTION 'Exact captured original release required';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('hato-quincena-owner:'||p_expected_owner::text,0));PERFORM hato_income_metadata.lock_source();
 SELECT * INTO row_value FROM hato_income_metadata.invoice_releases WHERE owner_id=p_expected_owner AND income_id=p_income_id AND(p_origin_key IS NULL OR origin_key=p_origin_key) ORDER BY(receipt->>'recordedAt')::timestamptz DESC,origin_key DESC LIMIT 1;
 IF p_action='recover' THEN RETURN row_value.receipt;END IF;
 IF row_value.origin_key IS NOT NULL THEN IF p_action='release' AND row_value.receipt->'preview'=p_preview THEN RETURN row_value.receipt;END IF;RAISE EXCEPTION 'Original already released; recover its immutable receipt';END IF;
 v=hato_income_metadata.invoice_release_preview(p_origin_key,p_expected_owner);
 IF v->>'incomeId' IS DISTINCT FROM p_income_id::text OR octet_length(v::text)>4194304 THEN RAISE EXCEPTION 'Bounded original release income required';END IF;
 IF p_action='preview' THEN RETURN v;END IF;
 IF v IS DISTINCT FROM p_preview OR v->>'disposition'='held' THEN RAISE EXCEPTION 'Displayed original changed or outcome/permission remains uncertain';END IF;
 old_domain=hato_birth_undo.capture_domain();old_foreign=hato_income_metadata.foreign_controls();old_controls=hato_income_metadata.controls();t=(v->'target')||jsonb_build_object('active',false);
 UPDATE invoice_upload.targets SET active=false WHERE owner=p_expected_owner AND target_key=(v->'target'->>'target_key')::uuid;
 IF NOT EXISTS(SELECT 1 FROM invoice_upload.targets x WHERE to_jsonb(x)=t) THEN RAISE EXCEPTION 'Original release target fence suppressed/mutated';END IF;
 row_value.origin_key=p_origin_key;row_value.owner_id=p_expected_owner;row_value.income_id=p_income_id;
 row_value.receipt=jsonb_build_object('version',1,'owner',p_expected_owner,'incomeId',p_income_id,'originKey',p_origin_key,'actor',a,'recordedAt',now(),'disposition',v->'disposition','preview',v,'afterTarget',t,'beforeDomainSha256',encode(sha256(convert_to(old_domain::text,'UTF8')),'hex'),'beforePrivateSha256',encode(sha256(convert_to(jsonb_build_array(old_foreign,old_controls)::text,'UTF8')),'hex'));
 INSERT INTO hato_income_metadata.invoice_releases SELECT row_value.* RETURNING * INTO written;
 IF NOT FOUND OR to_jsonb(written) IS DISTINCT FROM to_jsonb(row_value) THEN RAISE EXCEPTION 'Original release audit suppressed/mutated';END IF;
 expected_foreign=jsonb_set(old_foreign,ARRAY['invoice_upload.targets'],(SELECT jsonb_agg(x ORDER BY x::text) FROM jsonb_array_elements((SELECT coalesce(jsonb_agg(x),'[]') FROM jsonb_array_elements(old_foreign->'invoice_upload.targets')x WHERE x IS DISTINCT FROM v->'target')||jsonb_build_array(t))x));
 expected_controls=jsonb_set(old_controls,'{invoiceReleases}',(SELECT jsonb_agg(x ORDER BY x->>'origin_key') FROM jsonb_array_elements(old_controls->'invoiceReleases'||jsonb_build_array(to_jsonb(row_value)))x));
 PERFORM hato_income_metadata.assert_baseline();PERFORM invoice_upload.assert_controls();
 IF hato_birth_undo.capture_domain() IS DISTINCT FROM old_domain OR hato_income_metadata.foreign_controls() IS DISTINCT FROM expected_foreign OR hato_income_metadata.controls() IS DISTINCT FROM expected_controls OR a IS DISTINCT FROM hato_income_metadata.actor() THEN RAISE EXCEPTION 'Original release exact domain/private/authority readback failed';END IF;
 RETURN written.receipt;
END $$;
REVOKE ALL ON FUNCTION hato_income_metadata.invoice_release_preview(uuid,uuid),hato_income_metadata.assert_invoice_releases(),public.fn_hato_income_invoice_release_web(text,uuid,uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_hato_income_invoice_release_web(text,uuid,uuid,jsonb,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION hato_income_metadata.controls() RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_income_metadata.requests x),'invoiceReleases',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY origin_key),'[]') FROM hato_income_metadata.invoice_releases x),'invoiceOrigins',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_income_metadata.invoice_origins x),'audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_income_metadata.audit x));
$$;
CREATE OR REPLACE FUNCTION hato_income_metadata.lock_source() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE t record;BEGIN
 PERFORM hato_birth_undo.lock_domain();
 FOR t IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN('public','respaldos','storage','auth','information_schema','hato_income_metadata') AND n.nspname NOT LIKE 'pg_%' AND c.relkind IN('r','p') ORDER BY n.nspname,c.relname LOOP EXECUTE format('LOCK TABLE %I.%I IN SHARE MODE',t.nspname,t.relname);END LOOP;
 LOCK TABLE storage.buckets,storage.objects IN SHARE MODE;
 LOCK TABLE hato_income_metadata.requests,hato_income_metadata.audit,hato_income_metadata.invoice_origins,hato_income_metadata.invoice_releases IN SHARE ROW EXCLUSIVE MODE;
END $$;
CREATE OR REPLACE FUNCTION hato_income_metadata.assert_invoice_origins() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 PERFORM hato_income_metadata.assert_invoice_releases();
 IF EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))r(role) WHERE has_table_privilege(r.role,'hato_income_metadata.invoice_origins','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege(r.role,'hato_income_metadata.invoice_origins','SELECT,INSERT,UPDATE,REFERENCES') OR has_schema_privilege(r.role,'hato_income_metadata','CREATE,USAGE')) THEN RAISE EXCEPTION 'Private measured invoice origin authority drift';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='hato_income_metadata.invoice_origins'::regclass AND relkind='r' AND relrowsecurity AND NOT relforcerowsecurity AND pg_get_userbyid(relowner)='postgres') OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='hato_income_metadata.invoice_origins'::regclass) OR EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class='hato_income_metadata.invoice_origins'::regclass) THEN RAISE EXCEPTION 'Private measured invoice origin relation drift';END IF;
 IF(SELECT jsonb_agg(jsonb_build_array(attname,format_type(atttypid,atttypmod),attnotnull,attgenerated,attidentity) ORDER BY attnum) FROM pg_attribute WHERE attrelid='hato_income_metadata.invoice_origins'::regclass AND attnum>0 AND NOT attisdropped) IS DISTINCT FROM '[["request_key","uuid",true,"",""],["owner_id","uuid",true,"",""],["income_id","uuid",true,"",""],["original","jsonb",true,"",""],["file_claims","jsonb",true,"",""],["identity","jsonb",true,"",""],["reservation","jsonb",true,"",""],["created_at","timestamp with time zone",true,"",""]]'::jsonb OR EXISTS(SELECT 1 FROM pg_attrdef WHERE adrelid='hato_income_metadata.invoice_origins'::regclass) OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid='hato_income_metadata.invoice_origins'::regclass OR inhparent='hato_income_metadata.invoice_origins'::regclass) THEN RAISE EXCEPTION 'Private measured invoice origin columns drift';END IF;
 IF(SELECT count(*) FROM pg_constraint WHERE conrelid='hato_income_metadata.invoice_origins'::regclass)<>1 OR EXISTS(SELECT 1 FROM(VALUES('invoice_origins_pkey','PRIMARY KEY (request_key)'))e(name,definition) WHERE NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='hato_income_metadata.invoice_origins'::regclass AND conname=e.name AND pg_get_constraintdef(oid)=e.definition AND convalidated AND NOT condeferrable AND NOT condeferred)) OR(SELECT count(*) FROM pg_index WHERE indrelid='hato_income_metadata.invoice_origins'::regclass)<>1 OR EXISTS(SELECT 1 FROM pg_index WHERE indrelid='hato_income_metadata.invoice_origins'::regclass AND(NOT indisvalid OR NOT indisready OR NOT indislive OR NOT indisunique OR NOT indimmediate OR indnullsnotdistinct OR indexprs IS NOT NULL OR indpred IS NOT NULL OR indnatts<>indnkeyatts)) THEN RAISE EXCEPTION 'Private measured invoice origin constraints/indexes drift';END IF;
 IF(SELECT count(*) FROM pg_trigger WHERE tgrelid='hato_income_metadata.invoice_origins'::regclass AND NOT tgisinternal)<>2 OR EXISTS(SELECT 1 FROM(VALUES('immutable_invoice_origin',27),('no_truncate_invoice_origin',34))e(name,kind) WHERE NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='hato_income_metadata.invoice_origins'::regclass AND tgname=e.name AND tgtype=e.kind AND tgenabled='O' AND tgfoid='hato_income_metadata.immutable_invoice_origin()'::regprocedure AND NOT tgdeferrable AND NOT tginitdeferred AND tgqual IS NULL AND tgattr::text='' AND tgnargs=0)) THEN RAISE EXCEPTION 'Immutable measured invoice origin binding drift';END IF;
END $$;
CREATE OR REPLACE FUNCTION public.fn_hato_income_invoice_origin_web(p_action text,p_request_key uuid,p_income_id uuid,p_observed jsonb,p_file jsonb,p_expected_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a jsonb;old_domain jsonb;old_foreign jsonb;old_controls jsonb;expected_foreign jsonb;expected_controls jsonb;r hato_income_metadata.invoice_origins;expected hato_income_metadata.invoice_origins;s jsonb;t jsonb;v jsonb;ir invoice_upload.requests;target_row jsonb;written jsonb;BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner OR p_income_id IS NULL OR p_action IS NULL OR p_action NOT IN('reserve','recover') THEN RAISE EXCEPTION 'Current original measured invoice owner required' USING ERRCODE='42501';END IF;
 a=hato_income_metadata.actor();PERFORM hato_income_metadata.assert_baseline();PERFORM invoice_upload.assert_controls();
 IF p_action='recover' AND(p_request_key IS NOT NULL OR p_observed IS NOT NULL OR p_file IS NOT NULL) THEN RAISE EXCEPTION 'Recovery accepts income identity only';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('hato-quincena-owner:'||p_expected_owner::text,0));PERFORM hato_income_metadata.lock_source();
 SELECT * INTO r FROM hato_income_metadata.invoice_origins o WHERE owner_id=p_expected_owner AND income_id=p_income_id AND NOT EXISTS(SELECT 1 FROM hato_income_metadata.invoice_releases x WHERE x.origin_key=o.request_key);
 IF p_action='reserve' THEN
  IF p_request_key IS NULL OR jsonb_typeof(p_observed) IS DISTINCT FROM 'object' OR octet_length(p_observed::text)>2097152 OR jsonb_typeof(p_file) IS DISTINCT FROM 'object' OR(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_file)k) IS DISTINCT FROM ARRAY['extension','mime','sha256','size','sourceExtension'] THEN RAISE EXCEPTION 'Exact original source and bounded byte claims required';END IF;
  IF r.request_key IS NOT NULL THEN
   IF r.request_key IS DISTINCT FROM p_request_key OR r.original IS DISTINCT FROM p_observed OR r.file_claims IS DISTINCT FROM p_file THEN RAISE EXCEPTION 'Recover original measured invoice before replacement';END IF;
  ELSE
   IF EXISTS(SELECT 1 FROM hato_income_metadata.invoice_origins WHERE request_key=p_request_key) THEN RAISE EXCEPTION 'Original key belongs to another association' USING ERRCODE='42501';END IF;
   s=hato_income_metadata.source(jsonb_build_object('targetId',p_income_id));
   IF s IS DISTINCT FROM p_observed OR jsonb_array_length(s->'aliases')<>1 OR jsonb_array_length(s->'events')<>0 OR jsonb_array_length(s->'protectedClaims')<>0 THEN RAISE EXCEPTION 'Displayed exclusive measured income source changed';END IF;
   old_domain=hato_birth_undo.capture_domain();old_foreign=hato_income_metadata.foreign_controls();old_controls=hato_income_metadata.controls();
   expected.request_key=p_request_key;expected.owner_id=p_expected_owner;expected.income_id=p_income_id;expected.original=s;expected.file_claims=p_file;expected.created_at=now();
   t=public.fn_invoice_upload_target(p_expected_owner,gen_random_uuid(),'activate');
   expected.identity=p_file||jsonb_build_object('protocolVersion',1,'requestKey',gen_random_uuid(),'targetKey',t->'targetKey','generation',t->'generation','tipo','venta');
   v=public.fn_invoice_upload_step(p_expected_owner,'reserve',expected.identity,NULL);
   SELECT * INTO ir FROM invoice_upload.requests WHERE owner=p_expected_owner AND request_key=(expected.identity->>'requestKey')::uuid;
   IF NOT FOUND OR ir.identity IS DISTINCT FROM expected.identity OR ir.state<>'pending' OR invoice_upload.response(ir) IS DISTINCT FROM v THEN RAISE EXCEPTION 'Original invoice reservation readback failed';END IF;
   SELECT to_jsonb(x) INTO target_row FROM invoice_upload.targets x WHERE owner=p_expected_owner AND target_key=(expected.identity->>'targetKey')::uuid;
   IF target_row IS DISTINCT FROM jsonb_build_object('owner',p_expected_owner,'target_key',expected.identity->'targetKey','generation',expected.identity->'generation','active',true) THEN RAISE EXCEPTION 'Original invoice target readback failed';END IF;
   expected.reservation=v;
   INSERT INTO hato_income_metadata.invoice_origins SELECT expected.* RETURNING * INTO r;
   IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Original measured invoice association suppressed/mutated';END IF;
   expected_foreign=jsonb_set(old_foreign,ARRAY['invoice_upload.targets'],(SELECT jsonb_agg(x ORDER BY x::text) FROM jsonb_array_elements(old_foreign->'invoice_upload.targets'||jsonb_build_array(target_row))x));
   expected_foreign=jsonb_set(expected_foreign,ARRAY['invoice_upload.requests'],(SELECT jsonb_agg(x ORDER BY x::text) FROM jsonb_array_elements(old_foreign->'invoice_upload.requests'||jsonb_build_array(to_jsonb(ir)))x));
   expected_controls=jsonb_set(old_controls,'{invoiceOrigins}',(SELECT jsonb_agg(x ORDER BY x->>'request_key') FROM jsonb_array_elements(old_controls->'invoiceOrigins'||jsonb_build_array(to_jsonb(expected)))x));
   PERFORM hato_income_metadata.assert_baseline();PERFORM invoice_upload.assert_controls();
   IF hato_birth_undo.capture_domain() IS DISTINCT FROM old_domain OR hato_income_metadata.foreign_controls() IS DISTINCT FROM expected_foreign OR hato_income_metadata.controls() IS DISTINCT FROM expected_controls OR a IS DISTINCT FROM hato_income_metadata.actor() THEN RAISE EXCEPTION 'Original measured invoice domain/authority/control mismatch';END IF;
  END IF;
 END IF;
 IF r.request_key IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO ir FROM invoice_upload.requests WHERE owner=p_expected_owner AND request_key=(r.identity->>'requestKey')::uuid FOR SHARE;
 IF NOT FOUND OR ir.identity IS DISTINCT FROM r.identity THEN RAISE EXCEPTION 'Original invoice byte reservation missing or changed';END IF;
 PERFORM hato_income_metadata.assert_baseline();PERFORM invoice_upload.assert_controls();IF a IS DISTINCT FROM hato_income_metadata.actor() THEN RAISE EXCEPTION 'Original measured invoice actor changed';END IF;
 RETURN jsonb_build_object('version',1,'owner',r.owner_id,'incomeId',r.income_id,'requestKey',r.request_key,'original',jsonb_build_object('source',r.original,'file',r.file_claims,'identity',r.identity,'reservedAt',r.created_at,'reservation',r.reservation),'invoice',invoice_upload.response(ir));
END $$;
CREATE OR REPLACE FUNCTION hato_income_metadata.assert_controls() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE f record;BEGIN
 PERFORM hato_income_metadata.assert_invoice_origins();
 IF EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))r(role) CROSS JOIN(VALUES('hato_income_metadata.requests'::regclass),('hato_income_metadata.audit'::regclass))t(target) WHERE has_table_privilege(r.role,t.target,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege(r.role,t.target,'SELECT,INSERT,UPDATE,REFERENCES')) OR EXISTS(SELECT 1 FROM pg_class WHERE oid IN('hato_income_metadata.requests'::regclass,'hato_income_metadata.audit'::regclass) AND(NOT relrowsecurity OR relforcerowsecurity OR pg_get_userbyid(relowner)<>'postgres')) THEN RAISE EXCEPTION 'Private quincena control authority drift';END IF;
 FOR f IN SELECT * FROM(VALUES
('hato_quincena.source(jsonb)','7b26364778fd4514d31338d6b15adfcb',false),
('hato_quincena.assert_controls()','27b7a8f0674dd430162d724e992bd5cc',false),
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
SELECT hato_income_metadata.assert_baseline();
SELECT invoice_upload.assert_controls();
COMMIT;
