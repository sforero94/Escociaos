#!/usr/bin/env python3
"""Source-pinned authenticated classification bound into reviewed financial guards."""
import hashlib,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def md5(x):return hashlib.md5(x.encode()).hexdigest()
def function(text,name):
 m=re.search(r'CREATE(?: OR REPLACE)? FUNCTION '+re.escape(name)+r'\([^;]*?AS (\$[a-z_]*\$)([\s\S]*?)\1;',text);assert m,name;return m[0],m[2]
def build():
 old=(ROOT/'src/sql/security-candidates/financial-sale-correction.sql').read_text();classifier=(ROOT/'scripts/security/financial-sale-correction-browser-source.sql').read_text();_,body=function(classifier,'public.fn_financial_income_route_web')
 control,cb=function(old,'financial_sale_correction.assert_controls');shared,sb=function(old,'hato_income_metadata.assert_controls')
 binding="""
 IF NOT EXISTS(SELECT 1 FROM pg_proc f JOIN pg_language l ON l.oid=f.prolang WHERE f.oid=to_regprocedure('public.fn_financial_income_route_web(uuid,uuid)') AND md5(f.prosrc)='BODY' AND f.prosecdef AND NOT f.proisstrict AND NOT f.proleakproof AND NOT f.proretset AND f.provolatile='v' AND f.proparallel='u' AND f.prokind='f' AND f.pronargdefaults=0 AND f.proargnames=ARRAY['p_income_id','p_expected_owner'] AND f.prorettype='pg_catalog.jsonb'::regtype AND f.proconfig=ARRAY['search_path=pg_catalog'] AND l.lanname='plpgsql' AND pg_get_userbyid(f.proowner)='postgres' AND (SELECT count(*) FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))))=2 AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner)))a WHERE a.grantee NOT IN(f.proowner,'authenticated'::regrole) OR a.grantor<>f.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable)) THEN RAISE EXCEPTION 'Financial income routing binding drift' USING ERRCODE='42501';END IF;
""".replace('BODY',md5(body)).replace('pg_proc f ','pg_proc route_proc ').replace('f.','route_proc.')
 cb2=cb.replace('BEGIN','BEGIN\n'+binding,1);sb2=sb.replace(md5(cb),md5(cb2));assert sb2!=sb
 admission="DO $admit$ BEGIN IF current_user<>'postgres' OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('hato_income_metadata.assert_controls()') AND md5(prosrc)='%s' AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed financial routing dependency';END IF;END $admit$;\n"%md5(sb)
 return '-- NONNUMBERED candidate63. Read-only routing; no table/column grants or history change.\nBEGIN;\nSELECT financial_sale_correction.lock_source();SELECT financial_sale_correction.assert_baseline();\n'+admission+classifier+"REVOKE ALL ON FUNCTION public.fn_financial_income_route_web(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;\nGRANT EXECUTE ON FUNCTION public.fn_financial_income_route_web(uuid,uuid) TO authenticated;\n"+control.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION',1).replace(cb,cb2)+'\n'+shared.replace(sb,sb2)+'\nSELECT financial_sale_correction.assert_baseline();\nCOMMIT;\n'
if __name__=='__main__':(ROOT/'src/sql/security-candidates/financial-sale-correction-browser.sql').write_text(build())
