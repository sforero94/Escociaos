#!/usr/bin/env python3
"""Focused caller proof on full63-candidate installation; prior suites remain separately certified."""
import argparse,hashlib,importlib.util,json,subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('sale_browser_prior',Path(__file__).with_name('financial-sale-correction-replay.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
r,p,c=b.r,b.p,b.b.b.c
ROOT=r.ROOT
SOURCE=ROOT/'src/sql/security-candidates/financial-sale-correction-browser.sql'
REPORT=ROOT/'docs/security-integrity/financial-sale-correction-replay.json'
SCHEMA=b.b.SCHEMA
FILES=['scripts/security/build-financial-sale-correction-browser.py','scripts/security/financial-sale-correction-browser-source.sql','scripts/security/financial-sale-correction-browser-native.mjs','scripts/security/financial-sale-correction-browser-replay.py','src/sql/security-candidates/financial-sale-correction-browser.sql','src/__tests__/financialSaleCorrection.test.tsx','src/__tests__/fixtures/financialSaleCorrection.ts','src/components/finanzas/components/IngresoForm.tsx','src/components/hato/components/SaleCorrectionConfirmationPanel.tsx','src/components/hato/hooks/useSaleCorrectionConfirmation.ts','src/components/hato/hooks/useFinancialIncomeRoute.ts','src/utils/hato/financialSaleCorrectionBrowserAttempt.ts','src/utils/hato/financialSaleCorrectionForm.ts','src/utils/hato/financialSaleCorrectionProtocol.ts']
def install(sql):
 b.install(sql);before=sql(p.query(sql));authority=sql(SCHEMA.read_text());sql(SOURCE.read_text())
 after=json.loads(sql(SCHEMA.read_text()));old=json.loads(authority)
 if sql(p.query(sql))!=before:raise AssertionError('Routing installation changed existing rows')
 for section in old:
  if section!='functions' and old[section]!=after[section]:raise AssertionError('Changed preserved financial authority: '+section)
 prior_functions={f['identity']:f for f in old['functions']};new_functions={f['identity']:f for f in after['functions']}
 if set(new_functions)-set(prior_functions)!={'fn_financial_income_route_web(uuid,uuid)'} or set(prior_functions)-set(new_functions):raise AssertionError('Unexpected public financial function set change')
 for name,meta in prior_functions.items():
  current=new_functions[name]
  if name=='hato_income_metadata.assert_controls()':
   meta=dict(meta,body_md5=current['body_md5'])
  if meta!=current:raise AssertionError('Unexpected existing financial function change: '+name)
 print('PASS candidate63 routing installed; complete rows/existing table-column ACLs/policies/FKs/triggers unchanged',flush=True)
def exercise(sql,ctx):
 check=ctx['check'];authority=sql(SCHEMA.read_text());query=p.query(sql)
 sql("INSERT INTO fin_negocios(nombre) SELECT 'Hato Lechero' WHERE NOT EXISTS(SELECT 1 FROM fin_negocios WHERE nombre='Hato Lechero' AND activo IS TRUE);INSERT INTO fin_regiones(nombre) VALUES('Synthetic protected region');INSERT INTO fin_medios_pago(nombre) VALUES('Synthetic protected medium');")
 fixture=(ROOT/'scripts/security/financial-lifecycle-probes.sql').read_text();fixture=fixture[:fixture.index(" facts=facts||jsonb_build_array('genuine")]
 fixture+=" INSERT INTO lifecycle_admission_result VALUES(jsonb_build_object('owner',owner_id,'income',income_id,'sale',sale_key));END $admission$;SELECT value FROM lifecycle_admission_result;COMMIT;"
 fixture=fixture.replace('{{DOMAIN_QUERY}}',query.rstrip(';'))
 for key in ['OWNER','ANIMAL','SALEKEY','TX','INCOME']:fixture=fixture.replace('{{'+key+'}}',p.u(c.uid()))
 data=json.loads(sql(fixture));owner=data['owner'];income=data['income']
 business,category,region,medium,buyer=[c.uid() for _ in range(5)]
 sql('INSERT INTO fin_negocios(id,nombre) VALUES('+p.u(business)+",'Synthetic reviewed business');INSERT INTO fin_categorias_ingresos(id,negocio_id,nombre) VALUES("+p.u(category)+','+p.u(business)+",'Synthetic reviewed category');INSERT INTO fin_regiones(id,nombre) VALUES("+p.u(region)+",'Synthetic reviewed region');INSERT INTO fin_medios_pago(id,nombre) VALUES("+p.u(medium)+",'Synthetic reviewed medium');INSERT INTO fin_compradores(id,nombre) VALUES("+p.u(buyer)+",'Synthetic reviewed buyer');")
 data.update(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),fields=dict(date='2051-02-03',businessId=business,categoryId=category,name='Synthetic actual browser correction',regionId=region,mediumId=medium,buyerId=buyer,value='999.50'))
 proc=subprocess.run(['node',str(Path(__file__).with_name('financial-sale-correction-browser-native.mjs'))],input=json.dumps(data),text=True,capture_output=True,cwd=ROOT,timeout=60)
 if proc.returncode:
  dest=Path('/tmp/escocia-sale-correction-browser-sdk-private.log');dest.touch(mode=0o600,exist_ok=True);dest.write_text(proc.stderr);raise AssertionError('Actual sale correction SDK/caller failed; inspect external diagnostics')
 exercise.sdk=json.loads(proc.stdout)
 for label in exercise.sdk['checks']:check(True,'sale browser: '+label)
 check(sql(SCHEMA.read_text())==authority,'caller mutations preserve original table/column grants, policies, FKs and triggers')
 # Every drift is a separate rolled-back transaction, never a replacement of retained proof.
 for ddl,label in [("ALTER FUNCTION fn_financial_income_route_web(uuid,uuid) SET search_path=public;",'search_path'),("ALTER FUNCTION fn_financial_income_route_web(uuid,uuid) STRICT;",'strictness'),("GRANT EXECUTE ON FUNCTION fn_financial_income_route_web(uuid,uuid) TO anon;",'anonymous execute')]:
  before=sql(query);out=sql('BEGIN;'+ddl+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+p.lit(owner)+';SELECT fn_financial_income_route_web('+p.u(income)+','+p.u(owner)+');COMMIT;',False)
  check(out.returncode!=0 and 'Financial income routing binding drift' in out.stderr and sql(query)==before and sql(SCHEMA.read_text())==authority,'routing '+label+' drift refuses with complete row/catalog rollback')
 before=sql(query);out=sql('BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+p.lit(owner)+';SELECT fn_financial_income_route_web('+p.u(c.uid())+','+p.u(owner)+');COMMIT;',False)
 check(out.returncode!=0 and 'Original financial target missing' in out.stderr and sql(query)==before,'missing original cannot classify as general finance')
 sql('SELECT financial_sale_correction.assert_baseline();SELECT hato_income_metadata.assert_baseline();')
def main():
 a=argparse.ArgumentParser()
 for name in ['evidence-dir','runtime','client','output','private-diagnostics']:a.add_argument('--'+name,type=Path,required=True)
 x=a.parse_args();exercise.client=x.client.resolve();prior=json.loads(REPORT.read_text())
 changed=[k for k,v in prior['source_hashes'].items() if hashlib.sha256((ROOT/k).read_bytes()).hexdigest()!=v]
 if changed!=['src/components/finanzas/components/IngresoForm.tsx']:raise ValueError('Unexpected prior source changes: '+str(changed))
 files=list(dict.fromkeys([REPORT,*[ROOT/k for k in prior['source_hashes']],*[ROOT/k for k in FILES]]));frozen={f:f.read_bytes() for f in files}
 boundary=b.b.b;base=boundary.b.b.b.b.b.m.b.p.p
 while not hasattr(base,'s'):base=base.p
 catalog,rls,storage,t,hashes,_=base.s.load(x.evidence_dir.resolve());base.install.inputs=(storage,t,rls,catalog)
 if hashes!=prior['snapshot_hashes']:raise ValueError('Private snapshot provenance mismatch')
 if x.output.resolve().is_relative_to(x.evidence_dir.resolve()) or x.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(x.runtime.resolve(),x.client.resolve(),x.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(f.read_bytes()!=v for f,v in frozen.items()):raise ValueError('Changing sale browser sources cannot be certified')
 result.update(coordinated_candidate_count=63,installed_sdk=exercise.sdk,source_hashes={str(f.relative_to(ROOT)):hashlib.sha256(v).hexdigest() for f,v in frozen.items()},temporary_database_stopped_and_removed=True,prior_foundation_report_sha256=hashlib.sha256(frozen[REPORT]).hexdigest(),reviewed_prior_source_changes=changed,limits=['Six approved local structure snapshots; synthetic contained PostgreSQL/Auth only, never production.','Full63-candidate installation and base combined mutations plus focused new actual SDK/caller proof. Inherited269native/91SDK foundation suites are separately published evidence, not rerun here.','Ordinary general/shared financial writers, coupled ganado, direct-writer retirement, hosted/transitive/runtime/reader/capacity/recovery/release remain open.'])
 x.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
