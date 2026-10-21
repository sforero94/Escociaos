#!/usr/bin/env python3
"""Emit prospective invoice-origin foundation from tracked SQL only; no exports."""
import hashlib,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
prior=(ROOT/'src/sql/security-candidates/measured-income-invoice.sql').read_text()
base=(ROOT/'src/sql/security-candidates/hato-income-metadata.sql').read_text()
def function(text,name):
 m=list(re.finditer(r'CREATE(?: OR REPLACE)? FUNCTION '+re.escape(name)+r'\([^;]*?AS \$\$([\s\S]*?)\$\$;',text));assert len(m)==1,name
 return m[0].group(0),m[0].group(1)
def md5(s):return hashlib.md5(s.encode()).hexdigest()
immutable="""
BEGIN RAISE EXCEPTION 'Immutable original measured invoice association';END """
web="""
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
END """
authority="""
BEGIN
 IF EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))r(role) WHERE has_table_privilege(r.role,'hato_income_metadata.invoice_origins','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege(r.role,'hato_income_metadata.invoice_origins','SELECT,INSERT,UPDATE,REFERENCES') OR has_schema_privilege(r.role,'hato_income_metadata','CREATE,USAGE')) THEN RAISE EXCEPTION 'Private measured invoice origin authority drift';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='hato_income_metadata.invoice_origins'::regclass AND relkind='r' AND relrowsecurity AND NOT relforcerowsecurity AND pg_get_userbyid(relowner)='postgres') OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='hato_income_metadata.invoice_origins'::regclass) OR EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class='hato_income_metadata.invoice_origins'::regclass) THEN RAISE EXCEPTION 'Private measured invoice origin relation drift';END IF;
 IF(SELECT jsonb_agg(jsonb_build_array(attname,format_type(atttypid,atttypmod),attnotnull,attgenerated,attidentity) ORDER BY attnum) FROM pg_attribute WHERE attrelid='hato_income_metadata.invoice_origins'::regclass AND attnum>0 AND NOT attisdropped) IS DISTINCT FROM '[["request_key","uuid",true,"",""],["owner_id","uuid",true,"",""],["income_id","uuid",true,"",""],["original","jsonb",true,"",""],["file_claims","jsonb",true,"",""],["identity","jsonb",true,"",""],["reservation","jsonb",true,"",""],["created_at","timestamp with time zone",true,"",""]]'::jsonb OR EXISTS(SELECT 1 FROM pg_attrdef WHERE adrelid='hato_income_metadata.invoice_origins'::regclass) OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid='hato_income_metadata.invoice_origins'::regclass OR inhparent='hato_income_metadata.invoice_origins'::regclass) THEN RAISE EXCEPTION 'Private measured invoice origin columns drift';END IF;
 IF(SELECT count(*) FROM pg_constraint WHERE conrelid='hato_income_metadata.invoice_origins'::regclass)<>2 OR EXISTS(SELECT 1 FROM(VALUES('invoice_origins_pkey','PRIMARY KEY (request_key)'),('invoice_origins_owner_id_income_id_key','UNIQUE (owner_id, income_id)'))e(name,definition) WHERE NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='hato_income_metadata.invoice_origins'::regclass AND conname=e.name AND pg_get_constraintdef(oid)=e.definition AND convalidated AND NOT condeferrable AND NOT condeferred)) OR(SELECT count(*) FROM pg_index WHERE indrelid='hato_income_metadata.invoice_origins'::regclass)<>2 OR EXISTS(SELECT 1 FROM pg_index WHERE indrelid='hato_income_metadata.invoice_origins'::regclass AND(NOT indisvalid OR NOT indisready OR NOT indislive OR NOT indisunique OR NOT indimmediate OR indnullsnotdistinct OR indexprs IS NOT NULL OR indpred IS NOT NULL OR indnatts<>indnkeyatts)) THEN RAISE EXCEPTION 'Private measured invoice origin constraints/indexes drift';END IF;
 IF(SELECT count(*) FROM pg_trigger WHERE tgrelid='hato_income_metadata.invoice_origins'::regclass AND NOT tgisinternal)<>2 OR EXISTS(SELECT 1 FROM(VALUES('immutable_invoice_origin',27),('no_truncate_invoice_origin',34))e(name,kind) WHERE NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='hato_income_metadata.invoice_origins'::regclass AND tgname=e.name AND tgtype=e.kind AND tgenabled='O' AND tgfoid='hato_income_metadata.immutable_invoice_origin()'::regprocedure AND NOT tgdeferrable AND NOT tginitdeferred AND tgqual IS NULL AND tgattr::text='' AND tgnargs=0)) THEN RAISE EXCEPTION 'Immutable measured invoice origin binding drift';END IF;
END """
controls_decl,controls_old=function(base,'hato_income_metadata.controls')
controls_new=controls_old.replace("'audit',(SELECT", "'invoiceOrigins',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_income_metadata.invoice_origins x),'audit',(SELECT")
lock_decl,lock_old=function(base,'hato_income_metadata.lock_source')
lock_new=lock_old.replace('LOCK TABLE hato_income_metadata.requests,hato_income_metadata.audit IN SHARE ROW EXCLUSIVE MODE;', 'LOCK TABLE hato_income_metadata.requests,hato_income_metadata.audit,hato_income_metadata.invoice_origins IN SHARE ROW EXCLUSIVE MODE;')
assert_decl,assert_old=function(prior,'hato_income_metadata.assert_controls')
assert_new=assert_old.replace('BEGIN\n','BEGIN\n PERFORM hato_income_metadata.assert_invoice_origins();\n',1).replace(md5(controls_old),md5(controls_new)).replace(md5(lock_old),md5(lock_new))
pins=[('hato_income_metadata.immutable_invoice_origin()',immutable,False),('hato_income_metadata.assert_invoice_origins()',authority,False),('public.fn_hato_income_invoice_origin_web(text,uuid,uuid,jsonb,jsonb,uuid)',web,True)]
assert_new=assert_new.replace("('hato_income_metadata.immutable()'",''.join("('%s','%s',%s),\n"%(sig,md5(body),str(sec).lower()) for sig,body,sec in pins)+"('hato_income_metadata.immutable()'")
assert controls_old!=controls_new and lock_old!=lock_new and assert_old!=assert_new
admit="DO $admit$ BEGIN\n"+'\n'.join("IF(SELECT md5(prosrc) FROM pg_proc WHERE oid='%s'::regprocedure) IS DISTINCT FROM '%s' THEN RAISE EXCEPTION 'Unreviewed measured invoice origin dependency';END IF;"%(sig,md5(body)) for sig,body in [('hato_income_metadata.controls()',controls_old),('hato_income_metadata.lock_source()',lock_old),('hato_income_metadata.assert_controls()',assert_old)])+'\nEND $admit$;\n'
create="""CREATE TABLE hato_income_metadata.invoice_origins(request_key uuid PRIMARY KEY,owner_id uuid NOT NULL,income_id uuid NOT NULL,original jsonb NOT NULL,file_claims jsonb NOT NULL,identity jsonb NOT NULL,reservation jsonb NOT NULL,created_at timestamptz NOT NULL,UNIQUE(owner_id,income_id));
ALTER TABLE hato_income_metadata.invoice_origins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE hato_income_metadata.invoice_origins FROM PUBLIC,anon,authenticated,service_role;
"""
def definition(name,args,body,sec=False):return 'CREATE FUNCTION '+name+'('+args+') RETURNS '+('trigger' if name.endswith('immutable_invoice_origin') else 'void' if name.endswith('assert_invoice_origins') else 'jsonb')+' LANGUAGE plpgsql '+('SECURITY DEFINER ' if sec else '')+'SET search_path=pg_catalog AS $$'+body+'$$;\n'
new=definition('hato_income_metadata.immutable_invoice_origin','',immutable)+definition('hato_income_metadata.assert_invoice_origins','',authority)+definition('public.fn_hato_income_invoice_origin_web','p_action text,p_request_key uuid,p_income_id uuid,p_observed jsonb,p_file jsonb,p_expected_owner uuid',web,True)
new+='''CREATE TRIGGER immutable_invoice_origin BEFORE UPDATE OR DELETE ON hato_income_metadata.invoice_origins FOR EACH ROW EXECUTE FUNCTION hato_income_metadata.immutable_invoice_origin();
CREATE TRIGGER no_truncate_invoice_origin BEFORE TRUNCATE ON hato_income_metadata.invoice_origins FOR EACH STATEMENT EXECUTE FUNCTION hato_income_metadata.immutable_invoice_origin();
REVOKE ALL ON FUNCTION hato_income_metadata.immutable_invoice_origin(),hato_income_metadata.assert_invoice_origins(),public.fn_hato_income_invoice_origin_web(text,uuid,uuid,jsonb,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_hato_income_invoice_origin_web(text,uuid,uuid,jsonb,jsonb,uuid) TO authenticated;
'''
for decl,old,body in [(controls_decl,controls_old,controls_new),(lock_decl,lock_old,lock_new),(assert_decl,assert_old,assert_new)]:new+=decl.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION',1).replace(old,body,1)+'\n'
result='-- LOCAL REVIEW ONLY. Immutable prospective measured invoice origin; no replacement/release or caller cutover.\nBEGIN;\nSELECT hato_birth_undo.lock_domain();\nSELECT hato_income_metadata.assert_baseline();\nSELECT invoice_upload.assert_controls();\n'+admit+create+new+'SELECT hato_income_metadata.assert_baseline();\nSELECT invoice_upload.assert_controls();\nCOMMIT;\n'
(ROOT/'src/sql/security-candidates/measured-income-invoice-origin.sql').write_text(result)
