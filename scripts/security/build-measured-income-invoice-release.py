#!/usr/bin/env python3
"""Emit static terminal invoice DDL from tracked candidates; never private exports."""
import hashlib,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
prior=(ROOT/'src/sql/security-candidates/measured-income-invoice-origin.sql').read_text()
def function(name):
 m=list(re.finditer(r'CREATE(?: OR REPLACE)? FUNCTION '+re.escape(name)+r'\([^;]*?AS \$\$([\s\S]*?)\$\$;',prior));assert len(m)==1,name
 return m[0].group(0),m[0].group(1)
def md5(s):return hashlib.md5(s.encode()).hexdigest()
capture="""
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
END """
web="""
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
END """
release_authority="""
BEGIN
 IF EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))r(role) WHERE has_table_privilege(r.role,'hato_income_metadata.invoice_releases','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege(r.role,'hato_income_metadata.invoice_releases','SELECT,INSERT,UPDATE,REFERENCES')) OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='hato_income_metadata.invoice_releases'::regclass AND relkind='r' AND relrowsecurity AND NOT relforcerowsecurity AND pg_get_userbyid(relowner)='postgres') OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='hato_income_metadata.invoice_releases'::regclass) OR EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class='hato_income_metadata.invoice_releases'::regclass) THEN RAISE EXCEPTION 'Private invoice release authority drift';END IF;
 IF(SELECT jsonb_agg(jsonb_build_array(attname,format_type(atttypid,atttypmod),attnotnull,attgenerated,attidentity) ORDER BY attnum) FROM pg_attribute WHERE attrelid='hato_income_metadata.invoice_releases'::regclass AND attnum>0 AND NOT attisdropped) IS DISTINCT FROM '[["origin_key","uuid",true,"",""],["owner_id","uuid",true,"",""],["income_id","uuid",true,"",""],["receipt","jsonb",true,"",""]]'::jsonb OR EXISTS(SELECT 1 FROM pg_attrdef WHERE adrelid='hato_income_metadata.invoice_releases'::regclass) OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid='hato_income_metadata.invoice_releases'::regclass OR inhparent='hato_income_metadata.invoice_releases'::regclass) THEN RAISE EXCEPTION 'Private invoice release columns drift';END IF;
 IF(SELECT count(*) FROM pg_constraint WHERE conrelid='hato_income_metadata.invoice_releases'::regclass)<>2 OR EXISTS(SELECT 1 FROM(VALUES('invoice_releases_pkey','PRIMARY KEY (origin_key)'),('invoice_releases_origin_key_fkey','FOREIGN KEY (origin_key) REFERENCES hato_income_metadata.invoice_origins(request_key)'))e(name,definition) WHERE NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='hato_income_metadata.invoice_releases'::regclass AND conname=e.name AND pg_get_constraintdef(oid)=e.definition AND convalidated AND NOT condeferrable AND NOT condeferred)) OR(SELECT count(*) FROM pg_index WHERE indrelid='hato_income_metadata.invoice_releases'::regclass)<>1 OR EXISTS(SELECT 1 FROM pg_index WHERE indrelid='hato_income_metadata.invoice_releases'::regclass AND(NOT indisvalid OR NOT indisready OR NOT indislive OR NOT indisunique OR NOT indimmediate OR indnullsnotdistinct OR indexprs IS NOT NULL OR indpred IS NOT NULL OR indnatts<>indnkeyatts)) THEN RAISE EXCEPTION 'Private invoice release constraint/index drift';END IF;
 IF(SELECT count(*) FROM pg_trigger WHERE tgrelid='hato_income_metadata.invoice_releases'::regclass AND NOT tgisinternal)<>2 OR EXISTS(SELECT 1 FROM(VALUES('immutable_invoice_release',27),('no_truncate_invoice_release',34))e(name,kind) WHERE NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='hato_income_metadata.invoice_releases'::regclass AND tgname=e.name AND tgtype=e.kind AND tgenabled='O' AND tgfoid='hato_income_metadata.immutable_invoice_origin()'::regprocedure AND NOT tgdeferrable AND NOT tginitdeferred AND tgqual IS NULL AND tgattr::text='' AND tgnargs=0)) THEN RAISE EXCEPTION 'Immutable invoice release binding drift';END IF;
END """
changes={}
for name in ['hato_income_metadata.controls','hato_income_metadata.lock_source','hato_income_metadata.assert_invoice_origins','public.fn_hato_income_invoice_origin_web']:
 decl,body=function(name);new=body
 if name.endswith('.controls'):new=new.replace("'invoiceOrigins',", "'invoiceReleases',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY origin_key),'[]') FROM hato_income_metadata.invoice_releases x),'invoiceOrigins',")
 elif name.endswith('.lock_source'):new=new.replace('hato_income_metadata.invoice_origins IN SHARE', 'hato_income_metadata.invoice_origins,hato_income_metadata.invoice_releases IN SHARE')
 elif name.endswith('.assert_invoice_origins'):
  new=new.replace("<>2 OR EXISTS(SELECT 1 FROM(VALUES('invoice_origins_pkey','PRIMARY KEY (request_key)'),('invoice_origins_owner_id_income_id_key','UNIQUE (owner_id, income_id)'))", "<>1 OR EXISTS(SELECT 1 FROM(VALUES('invoice_origins_pkey','PRIMARY KEY (request_key)'))")
  new=new.replace("indrelid='hato_income_metadata.invoice_origins'::regclass)<>2", "indrelid='hato_income_metadata.invoice_origins'::regclass)<>1")
  new=new.replace('BEGIN\n','BEGIN\n PERFORM hato_income_metadata.assert_invoice_releases();\n',1)
 else:new=new.replace('FROM hato_income_metadata.invoice_origins WHERE owner_id=p_expected_owner AND income_id=p_income_id;', 'FROM hato_income_metadata.invoice_origins o WHERE owner_id=p_expected_owner AND income_id=p_income_id AND NOT EXISTS(SELECT 1 FROM hato_income_metadata.invoice_releases x WHERE x.origin_key=o.request_key);')
 assert body!=new,name;changes[name]=(decl,body,new)
assert_decl,assert_old=function('hato_income_metadata.assert_controls');assert_new=assert_old
for decl,old,new in changes.values():assert_new=assert_new.replace(md5(old),md5(new))
pins=[('hato_income_metadata.invoice_release_preview(uuid,uuid)',capture,False),('hato_income_metadata.assert_invoice_releases()',release_authority,False),('public.fn_hato_income_invoice_release_web(text,uuid,uuid,jsonb,uuid)',web,True)]
assert_new=assert_new.replace("('hato_income_metadata.immutable_invoice_origin()'",''.join("('%s','%s',%s),\n"%(sig,md5(body),str(sec).lower()) for sig,body,sec in pins)+"('hato_income_metadata.immutable_invoice_origin()'")
changes['hato_income_metadata.assert_controls']=(assert_decl,assert_old,assert_new)
signatures={'hato_income_metadata.controls':'()','hato_income_metadata.lock_source':'()','hato_income_metadata.assert_invoice_origins':'()','public.fn_hato_income_invoice_origin_web':'(text,uuid,uuid,jsonb,jsonb,uuid)','hato_income_metadata.assert_controls':'()'}
admit='DO $admit$ BEGIN\n'+'\n'.join("IF(SELECT md5(prosrc) FROM pg_proc WHERE oid='%s'::regprocedure) IS DISTINCT FROM '%s' THEN RAISE EXCEPTION 'Unreviewed invoice terminal dependency';END IF;"%(name+signatures[name],md5(old)) for name,(_,old,_) in changes.items())+'\nEND $admit$;\n'
new="""CREATE TABLE hato_income_metadata.invoice_releases(origin_key uuid PRIMARY KEY REFERENCES hato_income_metadata.invoice_origins(request_key),owner_id uuid NOT NULL,income_id uuid NOT NULL,receipt jsonb NOT NULL);
ALTER TABLE hato_income_metadata.invoice_releases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE hato_income_metadata.invoice_releases FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable_invoice_release BEFORE UPDATE OR DELETE ON hato_income_metadata.invoice_releases FOR EACH ROW EXECUTE FUNCTION hato_income_metadata.immutable_invoice_origin();
CREATE TRIGGER no_truncate_invoice_release BEFORE TRUNCATE ON hato_income_metadata.invoice_releases FOR EACH STATEMENT EXECUTE FUNCTION hato_income_metadata.immutable_invoice_origin();
ALTER TABLE hato_income_metadata.invoice_origins DROP CONSTRAINT invoice_origins_owner_id_income_id_key;
"""
for name,args,returns,body,sec in [('hato_income_metadata.invoice_release_preview','p_origin_key uuid,p_owner uuid','jsonb',capture,False),('hato_income_metadata.assert_invoice_releases','','void',release_authority,False),('public.fn_hato_income_invoice_release_web','p_action text,p_origin_key uuid,p_income_id uuid,p_preview jsonb,p_expected_owner uuid','jsonb',web,True)]:new+='CREATE FUNCTION '+name+'('+args+') RETURNS '+returns+' LANGUAGE plpgsql '+('SECURITY DEFINER ' if sec else '')+'SET search_path=pg_catalog AS $$'+body+'$$;\n'
new+='REVOKE ALL ON FUNCTION '+','.join(sig for sig,_,_ in pins)+' FROM PUBLIC,anon,authenticated,service_role;\nGRANT EXECUTE ON FUNCTION public.fn_hato_income_invoice_release_web(text,uuid,uuid,jsonb,uuid) TO authenticated;\n'
for decl,old,body in changes.values():new+=decl.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION',1).replace(old,body,1)+'\n'
(ROOT/'src/sql/security-candidates/measured-income-invoice-release.sql').write_text('-- LOCAL REVIEW ONLY. Captured original terminal release; no file deletion or actual caller cutover.\nBEGIN;\nSELECT hato_birth_undo.lock_domain();\nSELECT hato_income_metadata.assert_baseline();\nSELECT invoice_upload.assert_controls();\n'+admit+new+'SELECT hato_income_metadata.assert_baseline();\nSELECT invoice_upload.assert_controls();\nCOMMIT;\n')
