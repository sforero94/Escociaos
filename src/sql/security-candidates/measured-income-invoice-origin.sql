-- LOCAL REVIEW ONLY. Immutable prospective measured invoice origin; no replacement/release or caller cutover.
BEGIN;
SELECT hato_birth_undo.lock_domain();
SELECT hato_income_metadata.assert_baseline();
SELECT invoice_upload.assert_controls();
DO $admit$ BEGIN
IF(SELECT md5(prosrc) FROM pg_proc WHERE oid='hato_income_metadata.controls()'::regprocedure) IS DISTINCT FROM 'b4e5af5fa984a8e8613e591fe5446e95' THEN RAISE EXCEPTION 'Unreviewed measured invoice origin dependency';END IF;
IF(SELECT md5(prosrc) FROM pg_proc WHERE oid='hato_income_metadata.lock_source()'::regprocedure) IS DISTINCT FROM 'af14b761ddc1d4a974344646f3061f91' THEN RAISE EXCEPTION 'Unreviewed measured invoice origin dependency';END IF;
IF(SELECT md5(prosrc) FROM pg_proc WHERE oid='hato_income_metadata.assert_controls()'::regprocedure) IS DISTINCT FROM '19ffa5a090f1bdf76e74aa71d0ce3cc5' THEN RAISE EXCEPTION 'Unreviewed measured invoice origin dependency';END IF;
END $admit$;
CREATE TABLE hato_income_metadata.invoice_origins(request_key uuid PRIMARY KEY,owner_id uuid NOT NULL,income_id uuid NOT NULL,original jsonb NOT NULL,file_claims jsonb NOT NULL,identity jsonb NOT NULL,reservation jsonb NOT NULL,created_at timestamptz NOT NULL,UNIQUE(owner_id,income_id));
ALTER TABLE hato_income_metadata.invoice_origins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE hato_income_metadata.invoice_origins FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION hato_income_metadata.immutable_invoice_origin() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Immutable original measured invoice association';END $$;
CREATE FUNCTION hato_income_metadata.assert_invoice_origins() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))r(role) WHERE has_table_privilege(r.role,'hato_income_metadata.invoice_origins','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege(r.role,'hato_income_metadata.invoice_origins','SELECT,INSERT,UPDATE,REFERENCES') OR has_schema_privilege(r.role,'hato_income_metadata','CREATE,USAGE')) THEN RAISE EXCEPTION 'Private measured invoice origin authority drift';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='hato_income_metadata.invoice_origins'::regclass AND relkind='r' AND relrowsecurity AND NOT relforcerowsecurity AND pg_get_userbyid(relowner)='postgres') OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='hato_income_metadata.invoice_origins'::regclass) OR EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class='hato_income_metadata.invoice_origins'::regclass) THEN RAISE EXCEPTION 'Private measured invoice origin relation drift';END IF;
 IF(SELECT jsonb_agg(jsonb_build_array(attname,format_type(atttypid,atttypmod),attnotnull,attgenerated,attidentity) ORDER BY attnum) FROM pg_attribute WHERE attrelid='hato_income_metadata.invoice_origins'::regclass AND attnum>0 AND NOT attisdropped) IS DISTINCT FROM '[["request_key","uuid",true,"",""],["owner_id","uuid",true,"",""],["income_id","uuid",true,"",""],["original","jsonb",true,"",""],["file_claims","jsonb",true,"",""],["identity","jsonb",true,"",""],["reservation","jsonb",true,"",""],["created_at","timestamp with time zone",true,"",""]]'::jsonb OR EXISTS(SELECT 1 FROM pg_attrdef WHERE adrelid='hato_income_metadata.invoice_origins'::regclass) OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid='hato_income_metadata.invoice_origins'::regclass OR inhparent='hato_income_metadata.invoice_origins'::regclass) THEN RAISE EXCEPTION 'Private measured invoice origin columns drift';END IF;
 IF(SELECT count(*) FROM pg_constraint WHERE conrelid='hato_income_metadata.invoice_origins'::regclass)<>2 OR EXISTS(SELECT 1 FROM(VALUES('invoice_origins_pkey','PRIMARY KEY (request_key)'),('invoice_origins_owner_id_income_id_key','UNIQUE (owner_id, income_id)'))e(name,definition) WHERE NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='hato_income_metadata.invoice_origins'::regclass AND conname=e.name AND pg_get_constraintdef(oid)=e.definition AND convalidated AND NOT condeferrable AND NOT condeferred)) OR(SELECT count(*) FROM pg_index WHERE indrelid='hato_income_metadata.invoice_origins'::regclass)<>2 OR EXISTS(SELECT 1 FROM pg_index WHERE indrelid='hato_income_metadata.invoice_origins'::regclass AND(NOT indisvalid OR NOT indisready OR NOT indislive OR NOT indisunique OR NOT indimmediate OR indnullsnotdistinct OR indexprs IS NOT NULL OR indpred IS NOT NULL OR indnatts<>indnkeyatts)) THEN RAISE EXCEPTION 'Private measured invoice origin constraints/indexes drift';END IF;
 IF(SELECT count(*) FROM pg_trigger WHERE tgrelid='hato_income_metadata.invoice_origins'::regclass AND NOT tgisinternal)<>2 OR EXISTS(SELECT 1 FROM(VALUES('immutable_invoice_origin',27),('no_truncate_invoice_origin',34))e(name,kind) WHERE NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='hato_income_metadata.invoice_origins'::regclass AND tgname=e.name AND tgtype=e.kind AND tgenabled='O' AND tgfoid='hato_income_metadata.immutable_invoice_origin()'::regprocedure AND NOT tgdeferrable AND NOT tginitdeferred AND tgqual IS NULL AND tgattr::text='' AND tgnargs=0)) THEN RAISE EXCEPTION 'Immutable measured invoice origin binding drift';END IF;
END $$;
CREATE FUNCTION public.fn_hato_income_invoice_origin_web(p_action text,p_request_key uuid,p_income_id uuid,p_observed jsonb,p_file jsonb,p_expected_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a jsonb;old_domain jsonb;old_foreign jsonb;old_controls jsonb;expected_foreign jsonb;expected_controls jsonb;r hato_income_metadata.invoice_origins;expected hato_income_metadata.invoice_origins;s jsonb;t jsonb;v jsonb;ir invoice_upload.requests;target_row jsonb;written jsonb;BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner OR p_income_id IS NULL OR p_action IS NULL OR p_action NOT IN('reserve','recover') THEN RAISE EXCEPTION 'Current original measured invoice owner required' USING ERRCODE='42501';END IF;
 a=hato_income_metadata.actor();PERFORM hato_income_metadata.assert_baseline();PERFORM invoice_upload.assert_controls();
 IF p_action='recover' AND(p_request_key IS NOT NULL OR p_observed IS NOT NULL OR p_file IS NOT NULL) THEN RAISE EXCEPTION 'Recovery accepts income identity only';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('hato-quincena-owner:'||p_expected_owner::text,0));PERFORM hato_income_metadata.lock_source();
 SELECT * INTO r FROM hato_income_metadata.invoice_origins WHERE owner_id=p_expected_owner AND income_id=p_income_id;
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
CREATE TRIGGER immutable_invoice_origin BEFORE UPDATE OR DELETE ON hato_income_metadata.invoice_origins FOR EACH ROW EXECUTE FUNCTION hato_income_metadata.immutable_invoice_origin();
CREATE TRIGGER no_truncate_invoice_origin BEFORE TRUNCATE ON hato_income_metadata.invoice_origins FOR EACH STATEMENT EXECUTE FUNCTION hato_income_metadata.immutable_invoice_origin();
REVOKE ALL ON FUNCTION hato_income_metadata.immutable_invoice_origin(),hato_income_metadata.assert_invoice_origins(),public.fn_hato_income_invoice_origin_web(text,uuid,uuid,jsonb,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_hato_income_invoice_origin_web(text,uuid,uuid,jsonb,jsonb,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION hato_income_metadata.controls() RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_income_metadata.requests x),'invoiceOrigins',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_income_metadata.invoice_origins x),'audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_income_metadata.audit x));
$$;
CREATE OR REPLACE FUNCTION hato_income_metadata.lock_source() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE t record;BEGIN
 PERFORM hato_birth_undo.lock_domain();
 FOR t IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN('public','respaldos','storage','auth','information_schema','hato_income_metadata') AND n.nspname NOT LIKE 'pg_%' AND c.relkind IN('r','p') ORDER BY n.nspname,c.relname LOOP EXECUTE format('LOCK TABLE %I.%I IN SHARE MODE',t.nspname,t.relname);END LOOP;
 LOCK TABLE storage.buckets,storage.objects IN SHARE MODE;
 LOCK TABLE hato_income_metadata.requests,hato_income_metadata.audit,hato_income_metadata.invoice_origins IN SHARE ROW EXCLUSIVE MODE;
END $$;
CREATE OR REPLACE FUNCTION hato_income_metadata.assert_controls() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE f record;BEGIN
 PERFORM hato_income_metadata.assert_invoice_origins();
 IF EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))r(role) CROSS JOIN(VALUES('hato_income_metadata.requests'::regclass),('hato_income_metadata.audit'::regclass))t(target) WHERE has_table_privilege(r.role,t.target,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege(r.role,t.target,'SELECT,INSERT,UPDATE,REFERENCES')) OR EXISTS(SELECT 1 FROM pg_class WHERE oid IN('hato_income_metadata.requests'::regclass,'hato_income_metadata.audit'::regclass) AND(NOT relrowsecurity OR relforcerowsecurity OR pg_get_userbyid(relowner)<>'postgres')) THEN RAISE EXCEPTION 'Private quincena control authority drift';END IF;
 FOR f IN SELECT * FROM(VALUES
('hato_quincena.source(jsonb)','7b26364778fd4514d31338d6b15adfcb',false),
('hato_quincena.assert_controls()','27b7a8f0674dd430162d724e992bd5cc',false),
('hato_income_metadata.capture_attachment(jsonb,uuid)','d358a56454fed478285661c726bddae9',false),
('hato_income_metadata.immutable_invoice_origin()','e6f5d14395531109d99160195d7ef02b',false),
('hato_income_metadata.assert_invoice_origins()','98c0f962bad2385337cb00a267b7725a',false),
('public.fn_hato_income_invoice_origin_web(text,uuid,uuid,jsonb,jsonb,uuid)','fecda06d78a28adc4cf392a32e99c28c',true),
('hato_income_metadata.immutable()','f1071b1c13456df84eea7e1655b57f78',false),
('hato_income_metadata.controls()','a6887150eb1f451ba14969c909c8b596',false),
('hato_income_metadata.foreign_controls()','806a48677f4a224ba533f5e3c94594e1',false),
('hato_income_metadata.lock_source()','b388ed8541dc2f41801dadf93fc9aa9d',false),
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
