#!/usr/bin/env python3
"""Emit reviewed quincena retirement from tracked candidates, not private exports."""
import hashlib,re,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
FINGERPRINT='f08caad547cd3e323371669cdb9260cc'
INVOICE_FINGERPRINT='317d851139b2c8691bfd6d739be72215'
def md5(s):return hashlib.md5(s.encode()).hexdigest()
def function(file,name):
 text=(ROOT/'src/sql/security-candidates'/file).read_text();matches=list(re.finditer(r'CREATE(?: OR REPLACE)? FUNCTION '+re.escape(name)+r'\([^;]*?AS (\$[a-z_]*\$)([\s\S]*?)\1;',text));assert matches,name
 return matches[-1].group(0),matches[-1].group(2)
old_q,body_q=function('invoice-combined-integrity.sql','hato_quincena.assert_baseline')
old_m,body_m=function('invoice-combined-integrity.sql','hato_income_metadata.assert_baseline')
old_c,body_c=function('hato-income-metadata.sql','hato_quincena.assert_controls')
old_mc,body_mc=function('measured-income-invoice-release.sql','hato_income_metadata.assert_controls')
old_i,body_i=function('invoice-combined-integrity.sql','invoice_upload.assert_controls')
new_i_body=body_i.replace('4939b69a474a3669b4c0ae38ebe2ccd1',INVOICE_FINGERPRINT)
stub="BEGIN RAISE EXCEPTION 'Legacy quincena RPC retired; use prepared original lifecycle' USING ERRCODE='42501';END"
helper="""
BEGIN
 IF EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'))r(role) CROSS JOIN(VALUES('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'))p(privilege) WHERE has_table_privilege(r.role,'public.hato_produccion_quincenal',p.privilege))
 OR EXISTS(SELECT 1 FROM pg_attribute a CROSS JOIN(VALUES('anon'),('authenticated'))r(role) CROSS JOIN(VALUES('INSERT'),('UPDATE'))p(privilege) WHERE a.attrelid='public.hato_produccion_quincenal'::regclass AND a.attnum>0 AND NOT a.attisdropped AND has_column_privilege(r.role,a.attrelid,a.attnum,p.privilege))
 OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.hato_produccion_quincenal'::regclass AND relacl::text='{postgres=arwdDxtm/postgres,anon=rxtm/postgres,authenticated=rxtm/postgres,service_role=arwdDxtm/postgres}')
 OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.hato_produccion_quincenal'::regclass AND attnum>0 AND NOT attisdropped AND attacl IS NOT NULL) THEN RAISE EXCEPTION 'Retired quincena writer authority restored' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM(VALUES('public.fn_hato_guardar_quincena_venta(jsonb)','payload'),('public.fn_hato_eliminar_quincena_venta(uuid)','p_quincena_id'))e(signature,arg) WHERE NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure(e.signature) AND md5(p.prosrc)='STUB_HASH' AND NOT p.prosecdef AND NOT p.proisstrict AND NOT p.proleakproof AND p.provolatile='v' AND p.proparallel='u' AND p.prokind='f' AND NOT p.proretset AND p.pronargdefaults=0 AND p.proargnames=ARRAY[e.arg] AND p.proconfig=ARRAY['search_path=pg_catalog'] AND l.lanname='plpgsql' AND pg_get_userbyid(p.proowner)='postgres' AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a WHERE a.grantee<>p.proowner)))
 OR EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))r(role) CROSS JOIN(VALUES('public.fn_hato_guardar_quincena_venta(jsonb)'),('public.fn_hato_eliminar_quincena_venta(uuid)'))f(signature) WHERE has_function_privilege(r.role,f.signature,'EXECUTE')) THEN RAISE EXCEPTION 'Retired quincena RPC restored' USING ERRCODE='42501';END IF;
END """.replace('STUB_HASH',md5(stub))
guard=""" IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('hato_quincena.assert_retired_writers()') AND md5(prosrc)='HELPER_HASH' AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') OR EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))r(role) WHERE has_function_privilege(r.role,'hato_quincena.assert_retired_writers()','EXECUTE')) THEN RAISE EXCEPTION 'Quincena retirement binding drift';END IF;
 PERFORM hato_quincena.assert_retired_writers();
""".replace('HELPER_HASH',md5(helper))
new_q_body=body_q.replace('BEGIN','BEGIN\n'+guard,1).replace('9fdd55c45b5c4b66d41442f3e7e81a83',FINGERPRINT)
new_m_body=body_m.replace('9fdd55c45b5c4b66d41442f3e7e81a83',FINGERPRINT)
new_c_body=body_c.replace("FOR f IN SELECT * FROM(VALUES", "FOR f IN SELECT * FROM(VALUES\n"+','.join("('%s','%s',false)"%(name,md5(body)) for name,body in [('invoice_upload.assert_controls()',new_i_body),('hato_quincena.assert_retired_writers()',helper),('hato_quincena.assert_baseline()',new_q_body),('hato_income_metadata.assert_baseline()',new_m_body)])+',')
new_mc_body=body_mc.replace(md5(body_c),md5(new_c_body));assert new_mc_body!=body_mc
sql='''-- NONNUMBERED candidate60; exact local review only. Never production installation.
BEGIN;
SELECT hato_birth_undo.lock_domain();
DO $admit$ BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed quincena retirement owner required';END IF;
'''
for name,body in [('hato_quincena.assert_baseline()',body_q),('hato_income_metadata.assert_baseline()',body_m),('hato_quincena.assert_controls()',body_c),('hato_income_metadata.assert_controls()',body_mc),('invoice_upload.assert_controls()',body_i)]:
 sql+=" IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('%s') AND md5(prosrc)='%s' AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed quincena retirement dependency';END IF;\n"%(name,md5(body))
sql+=''' PERFORM hato_income_metadata.assert_baseline();
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.hato_produccion_quincenal'::regclass AND attnum>0 AND NOT attisdropped AND attacl IS NOT NULL) THEN RAISE EXCEPTION 'Unreviewed quincena column authority';END IF;
END $admit$;
'''
for name,args in [('fn_hato_guardar_quincena_venta','payload jsonb'),('fn_hato_eliminar_quincena_venta','p_quincena_id uuid')]:sql+='CREATE OR REPLACE FUNCTION public.'+name+'('+args+') RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$'+stub+'$$;\n'
sql+='''REVOKE ALL ON FUNCTION public.fn_hato_guardar_quincena_venta(jsonb),public.fn_hato_eliminar_quincena_venta(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.hato_produccion_quincenal FROM PUBLIC,anon,authenticated;
DO $columns$ DECLARE names text;BEGIN
 SELECT string_agg(format('%I',attname),',' ORDER BY attnum) INTO names FROM pg_attribute WHERE attrelid='public.hato_produccion_quincenal'::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE format('REVOKE INSERT(%s),UPDATE(%s) ON public.hato_produccion_quincenal FROM PUBLIC,anon,authenticated',names,names);
END $columns$;
CREATE FUNCTION hato_quincena.assert_retired_writers() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$'''+helper+'''$$;
REVOKE ALL ON FUNCTION hato_quincena.assert_retired_writers() FROM PUBLIC,anon,authenticated,service_role;
'''
for old,old_body,new_body in [(old_q,body_q,new_q_body),(old_m,body_m,new_m_body),(old_c,body_c,new_c_body),(old_mc,body_mc,new_mc_body),(old_i,body_i,new_i_body)]:sql+=old.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION').replace(old_body,new_body)+'\n'
sql+='SELECT hato_income_metadata.assert_baseline();\nSELECT invoice_upload.assert_controls();\nCOMMIT;\n'
if __name__=='__main__':
 verified={x['identity']:x['body_md5'] for x in json.loads((ROOT/'docs/security-integrity/financial-writer-retirement-admission.json').read_text())['schema_admission']['functions']}
 for name,body in [('hato_quincena.assert_baseline()',body_q),('hato_income_metadata.assert_baseline()',body_m),('hato_quincena.assert_controls()',body_c),('hato_income_metadata.assert_controls()',body_mc),('invoice_upload.assert_controls()',body_i)]:assert md5(body)==verified[name],name+' differs from verified prior admission'
 assert re.fullmatch('[0-9a-f]{32}',FINGERPRINT) and re.fullmatch('[0-9a-f]{32}',INVOICE_FINGERPRINT),'Derive the exact reviewed post-retirement fingerprint locally first'
 (ROOT/'src/sql/security-candidates/hato-quincena-retirement.sql').write_text(sql)
