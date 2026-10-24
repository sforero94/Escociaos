#!/usr/bin/env python3
"""Prospective independent/shared-monthly financial correction; no inferred history."""
import hashlib,importlib.util,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('routing_builder',Path(__file__).with_name('build-financial-sale-correction-browser.py'));prior=importlib.util.module_from_spec(spec);spec.loader.exec_module(prior)
def md5(v):return hashlib.md5(v.encode()).hexdigest()
def build():
 old=(ROOT/'src/sql/security-candidates/financial-sale-correction.sql').read_text();s=old[:old.index('CREATE FUNCTION financial_sale_correction.assert_controls()')].replace('financial_sale_correction','financial_general_correction').replace('saleFinancial','generalFinancial').replace('financial-sale-correction-','financial-general-correction-').replace('candidate62; Santiago Option2.','candidate64; independent/shared-monthly financial correction.')
 def body(name,value):
  nonlocal s
  fn,oldbody=prior.function(s,name);s=s.replace(fn,fn.replace(oldbody,value))
 body('financial_general_correction.lock_source','\nBEGIN PERFORM financial_sale_correction.lock_source();LOCK TABLE financial_general_correction.requests,financial_general_correction.audit IN SHARE ROW EXCLUSIVE MODE;END ')
 body('financial_general_correction.assert_baseline','\nBEGIN PERFORM financial_sale_correction.assert_baseline();PERFORM financial_general_correction.assert_controls();END ')
 # The private requests/audit DDL is identical by namespace. Canonicalize only its
 # reviewed namespace spelling in the metadata JSON, then use the existing exact
 # structural hash. This is deterministic, not learned from an installed database.
 fn,meta=prior.function(s,'financial_general_correction.metadata');replacement=meta.replace("SELECT md5(jsonb_build_object(","SELECT md5(replace(jsonb_build_object(").replace("::text);","::text,'financial_general_correction','financial_sale_correction'));")
 assert replacement!=meta;s=s.replace(fn,fn.replace(meta,replacement))
 # Capture all shared aliases; changing any one invalidates the original source.
 source=(ROOT/'scripts/security/financial-general-correction-source.sql').read_text();body('financial_general_correction.source',source)
 funcs=[]
 for m in re.finditer(r'CREATE FUNCTION ([\w.]+)\(([^;]*?)\) RETURNS ([^;]*?)AS (\$[a-z_]*\$)([\s\S]*?)\4;',s):
  name,args,header,_,code=m.groups();types=[a.strip().split()[-1] for a in args.split(',')] if args else [];funcs.append((name+'('+','.join(types)+')',md5(code),'SECURITY DEFINER' in header))
 oldcontrol,controlbody=prior.function(old,'financial_sale_correction.assert_controls');control=oldcontrol.replace('financial_sale_correction','financial_general_correction')
 values=','.join("('%s','%s',%s)"%(name,sha,str(sec).lower()) for name,sha,sec in funcs)
 control=re.sub(r'FOR f IN SELECT \* FROM\(VALUES .*?\)pin\(signature,body,secdef\)',lambda _: 'FOR f IN SELECT * FROM(VALUES '+values+')pin(signature,body,secdef)',control)
 s+=control+'\nREVOKE ALL ON ALL FUNCTIONS IN SCHEMA financial_general_correction FROM PUBLIC,anon,authenticated,service_role;\n'
 for name,_,sec in funcs:
  if sec and name.startswith('public.fn_financial_general_correction'):s+='REVOKE ALL ON FUNCTION '+name+' FROM PUBLIC,anon,authenticated,service_role;GRANT EXECUTE ON FUNCTION '+name+' TO authenticated;\n'
 route=(ROOT/'src/sql/security-candidates/financial-sale-correction-browser.sql').read_text();shared,oldbody=prior.function(route,'hato_income_metadata.assert_controls');_,newcontrol=prior.function(s,'financial_general_correction.assert_controls')
 guard=""" IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('financial_general_correction.assert_controls()') AND md5(prosrc)='PIN' AND NOT prosecdef AND NOT proisstrict AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') OR EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))r(role) WHERE has_function_privilege(r.role,'financial_general_correction.assert_controls()','EXECUTE')) THEN RAISE EXCEPTION 'General correction guard binding drift';END IF;
 PERFORM financial_general_correction.assert_controls();
""".replace('PIN',md5(newcontrol))
 s+="DO $admission$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('hato_income_metadata.assert_controls()') AND md5(prosrc)='%s' AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed general financial dependency';END IF;END $admission$;\n"%md5(oldbody)
 s+=shared.replace(oldbody,oldbody.replace('BEGIN','BEGIN\n'+guard,1))+'\nSELECT financial_general_correction.assert_baseline();\nCOMMIT;\n'
 return s
if __name__=='__main__':(ROOT/'src/sql/security-candidates/financial-general-correction.sql').write_text(build())
