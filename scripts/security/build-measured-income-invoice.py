#!/usr/bin/env python3
"""Emit source-owned static metadata receipt integration, never read private exports."""
import hashlib,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
text=(ROOT/'src/sql/security-candidates/hato-income-metadata.sql').read_text()
def original(name):
 found=list(re.finditer(r'CREATE(?: OR REPLACE)? FUNCTION '+re.escape(name)+r'\([^;]*?AS \$\$([\s\S]*?)\$\$;',text));assert len(found)==1,name
 return found[0].group(0),found[0].group(1)
def digest(x):return hashlib.md5(x.encode()).hexdigest()
name='hato_income_metadata.capture_attachment'
capture="""
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
END """
validate="""
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
END """
changes={'hato_income_metadata.validate':validate}
_,source=original('public.fn_hato_income_metadata_source_web')
old="RETURN jsonb_build_object('version',1,'owner',p_expected_owner,'source',s,'effectiveDate',(now() AT TIME ZONE 'America/Bogota')::date);"
assert old in source
changes['public.fn_hato_income_metadata_source_web']=source.replace(old,old[:-1]+"||CASE WHEN p_draft?'attachment' THEN jsonb_build_object('observedAttachment',hato_income_metadata.capture_attachment(p_draft,p_expected_owner)) ELSE '{}'::jsonb END;")
_,web=original('public.fn_hato_income_metadata_web')
marker="r.request_key=p_request_key;r.owner_id=p_expected_owner;r.intent=p_intent;"
assert marker in web
web=web.replace(marker,"IF p_intent?'attachment' AND hato_income_metadata.capture_attachment(p_intent,p_expected_owner) IS DISTINCT FROM p_intent->'observedAttachment' THEN RAISE EXCEPTION 'Displayed invoice identity changed';END IF;\n "+marker)
line=next(x for x in web.splitlines() if 'New invoice attachment requires coordinated verified-byte reference admission' in x)
web=web.replace(line," IF r.intent->'fields'->'invoice' IS DISTINCT FROM old_income->'url_factura' AND r.intent->'fields'->'invoice'<>'null'::jsonb AND NOT(r.intent?'attachment') THEN RAISE EXCEPTION 'Verified original invoice receipt required for a new reference';END IF;\n IF r.intent?'attachment' AND hato_income_metadata.capture_attachment(r.intent,p_expected_owner) IS DISTINCT FROM r.intent->'observedAttachment' THEN RAISE EXCEPTION 'Original invoice identity changed; resolve original';END IF;")
changes['public.fn_hato_income_metadata_web']=web
_,controls=original('hato_income_metadata.assert_controls')
for n,b in changes.items():controls=controls.replace(digest(original(n)[1]),digest(b))
marker="('hato_income_metadata.immutable()'"
assert marker in controls
controls=controls.replace(marker,"('hato_income_metadata.capture_attachment(jsonb,uuid)','"+digest(capture)+"',false),\n"+marker)
changes['hato_income_metadata.assert_controls']=controls
admit=[];definitions=[]
for n,b in changes.items():
 declaration,oldbody=original(n);sig=declaration.split(' RETURNS')[0].split('FUNCTION ')[1]
 # Stable explicit signatures, without parameter names.
 signatures={'hato_income_metadata.validate':'hato_income_metadata.validate(jsonb,boolean)','public.fn_hato_income_metadata_source_web':'public.fn_hato_income_metadata_source_web(jsonb,uuid)','public.fn_hato_income_metadata_web':'public.fn_hato_income_metadata_web(text,uuid,jsonb,uuid)','hato_income_metadata.assert_controls':'hato_income_metadata.assert_controls()'}
 admit.append("IF(SELECT md5(prosrc) FROM pg_proc WHERE oid='"+signatures[n]+"'::regprocedure) IS DISTINCT FROM '"+digest(oldbody)+"' THEN RAISE EXCEPTION 'Unreviewed original measured invoice function';END IF;")
 definitions.append(declaration.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION',1).replace(oldbody,b,1))
result="-- LOCAL REVIEW ONLY. Prospective verified measured-income invoice after56candidates.\nBEGIN;\nSELECT hato_birth_undo.lock_domain();\nSELECT hato_income_metadata.assert_baseline();\nSELECT invoice_upload.assert_controls();\nDO $admit$ BEGIN\n"+'\n'.join(admit)+"\nEND $admit$;\nCREATE FUNCTION "+name+"(p jsonb,p_owner uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$"+capture+"$$;\nREVOKE ALL ON FUNCTION "+name+"(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;\n"+'\n'.join(definitions)+"\nSELECT hato_income_metadata.assert_baseline();\nSELECT invoice_upload.assert_controls();\nCOMMIT;\n"
(ROOT/'src/sql/security-candidates/measured-income-invoice.sql').write_text(result)
