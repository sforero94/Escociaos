#!/usr/bin/env python3
"""Extend the reviewed general protocol without rebinding version-one originals."""
import hashlib, importlib.util, re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('general_builder',Path(__file__).with_name('build-financial-general-correction.py'))
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
def md5(value):return hashlib.md5(value.encode()).hexdigest()
def build():
 prior=(ROOT/'src/sql/security-candidates/financial-general-correction.sql').read_text()
 changes={}
 def change(name,transform):
  fn,body=b.prior.function(prior,name);new=transform(body)
  assert new!=body,name
  changes[name]=(body,new)
  return fn.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION',1).replace(body,new)
 validation="""
 IF p->'version'='2'::jsonb THEN
  v=p->'fields'->'quantity';
  IF v<>'null'::jsonb AND(jsonb_typeof(v) IS DISTINCT FROM 'string' OR v#>>'{}' !~ '^(0|[1-9][0-9]{0,12})([.][0-9]{1,6})?$') THEN RAISE EXCEPTION 'Exact nonnegative bounded quantity required';END IF;
  IF v<>'null'::jsonb AND(v#>>'{}')::numeric>0 AND round((p->'fields'->>'value')::numeric/(v#>>'{}')::numeric,2)>=10000000000000 THEN RAISE EXCEPTION 'Calculated unit price exceeds stored precision';END IF;
  v=p->'fields'->'observations';IF v<>'null'::jsonb AND(jsonb_typeof(v) IS DISTINCT FROM 'string' OR length(v#>>'{}')>8000) THEN RAISE EXCEPTION 'Bounded nullable observations required';END IF;
  v=p->'fields'->'invoice';IF v<>'null'::jsonb AND(jsonb_typeof(v) IS DISTINCT FROM 'string' OR length(v#>>'{}') NOT BETWEEN 1 AND 4000) THEN RAISE EXCEPTION 'Bounded nullable invoice reference required';END IF;
 END IF;
"""
 def validate(body):
  body=body.replace("p->'version' IS DISTINCT FROM '1'::jsonb","p->'version' NOT IN('1'::jsonb,'2'::jsonb)")
  body=body.replace("ARRAY['businessId','buyerId','categoryId','date','mediumId','name','regionId','value']", "(CASE WHEN p->'version'='2'::jsonb THEN ARRAY['businessId','buyerId','categoryId','date','invoice','mediumId','name','observations','quantity','regionId','value'] ELSE ARRAY['businessId','buyerId','categoryId','date','mediumId','name','regionId','value'] END)")
  return body.rsplit('END ',1)[0]+validation+'END '
 sql=change('financial_general_correction.validate',validate)
 def source(body):
  return body.replace(" IF EXISTS(SELECT 1 FROM public.hato_produccion_quincenal", " IF p->'version'='2'::jsonb AND p->'fields'->'invoice' IS DISTINCT FROM income->'url_factura' AND p->'fields'->'invoice'<>'null'::jsonb THEN RAISE EXCEPTION 'New general invoice requires protected original attachment admission; retain original';END IF;\n IF EXISTS(SELECT 1 FROM public.hato_produccion_quincenal",1)
 sql+=change('financial_general_correction.source',source)
 def plan(body):
  return body.replace(",'tax',NULL);", "||(CASE WHEN p->'version'='2'::jsonb THEN jsonb_build_object('cantidad',(p->'fields'->>'quantity')::numeric,'precio_unitario',CASE WHEN(p->'fields'->>'quantity')::numeric>0 THEN round((p->'fields'->>'value')::numeric/(p->'fields'->>'quantity')::numeric,2) ELSE NULL END,'observaciones',p->'fields'->'observations','url_factura',p->'fields'->'invoice') ELSE '{}'::jsonb END),'tax',NULL);")
 sql+=change('financial_general_correction.plan',plan)
 def web(body):
  old=" UPDATE public.fin_ingresos SET fecha="
  start=body.index(old);end=body.index('\n IF NOT FOUND OR written',start)
  oldwrite=body[start:end]
  extra="cantidad=(new_income->>'cantidad')::numeric,precio_unitario=(new_income->>'precio_unitario')::numeric,observaciones=new_income->>'observaciones',url_factura=new_income->>'url_factura',"
  newwrite=oldwrite.replace('SET fecha=', 'SET '+extra+'fecha=')
  return body[:start]+" IF r.intent->'version'='2'::jsonb THEN\n"+newwrite+"\n ELSE\n"+oldwrite+"\n END IF;"+body[end:]
 sql+=change('public.fn_financial_general_correction_web',web)
 guard,oldguard=b.prior.function(prior,'financial_general_correction.assert_controls')
 newguard=oldguard
 for old,new in changes.values():
  assert md5(old) in newguard
  newguard=newguard.replace(md5(old),md5(new))
 sql+=guard.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION',1).replace(oldguard,newguard)
 shared,sharedbody=b.prior.function(prior,'hato_income_metadata.assert_controls')
 assert md5(oldguard) in sharedbody
 sql+=shared.replace('CREATE OR REPLACE FUNCTION','CREATE FUNCTION',1).replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION',1).replace(md5(oldguard),md5(newguard))
 return '-- LOCAL REVIEW ONLY. Candidate65; version2 general editor quantity/metadata. New invoice origin is a separate gate.\nBEGIN;\nSELECT financial_general_correction.lock_source();\nSELECT hato_income_metadata.assert_baseline();\nSELECT financial_general_correction.assert_baseline();\n'+sql+'\nSELECT hato_income_metadata.assert_baseline();\nSELECT financial_general_correction.assert_baseline();\nCOMMIT;\n'
if __name__=='__main__':(ROOT/'src/sql/security-candidates/financial-general-editor.sql').write_text(build())
