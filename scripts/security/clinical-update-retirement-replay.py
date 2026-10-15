#!/usr/bin/env python3
"""Retire direct clinical UPDATE/177 on four-export local replay only."""
import argparse
import concurrent.futures
import importlib.util
import json
from pathlib import Path


def module(name,file):
 spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

t=module('confirmation','clinical-step-confirmation-replay.py')
n=module('telegram_sdk','clinical-telegram-native-replay.py')
b=module('browser_sdk','clinical-browser-native-replay.py')
c,r,lit,js,u=t.c,t.r,t.lit,t.js,t.u
SOURCE=r.ROOT/'src/sql/security-candidates/clinical-update-retirement.sql'
LEGACY='public.fn_hato_confirmar_paso_tratamiento(uuid,uuid,date,text)'
ROLES=('anon','authenticated','service_role')
TABLES=('hato_tratamientos','hato_tratamiento_pasos')
CATALOG=t.t.t.CATALOG.replace("'application_plan_delete'","'application_plan_delete','clinical_step_confirmation'")
READS=t.t.t.READS
OTHER_ACLS="""SELECT md5(jsonb_build_object('tables',(SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relacl) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','respaldos') AND c.relname NOT IN('hato_tratamientos','hato_tratamiento_pasos')),'columns',(SELECT jsonb_agg(jsonb_build_array(a.attrelid,a.attnum,a.attacl) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','respaldos') AND c.relname NOT IN('hato_tratamientos','hato_tratamiento_pasos')))::text);"""


def install(sql):
 sql('BEGIN;'+''.join(r.transaction_body(p.read_text()) for p in (t.t.t.SOURCE,t.t.SOURCE,t.SOURCE))+'COMMIT;')
 baseline=sql(CATALOG);checks=[]
 for label,drift in [
  ('clinical column ACL drift','GRANT UPDATE(fecha_ejecutada) ON hato_tratamiento_pasos TO authenticated;'),
  ('legacy177 definer drift','ALTER FUNCTION '+LEGACY+' SECURITY DEFINER;'),
  ('prepared RPC config drift',"ALTER FUNCTION public.fn_clinical_step_web(text,uuid,jsonb,uuid) SET work_mem='8MB';"),
  ('clinical reader loss','REVOKE SELECT ON hato_tratamientos FROM anon;')]:
  result=sql('BEGIN;'+drift+r.transaction_body(SOURCE.read_text())+'COMMIT;',False)
  if result.returncode==0 or 'Unreviewed' not in result.stderr or sql(CATALOG)!=baseline:raise AssertionError(label)
  checks.append(label+' refuses with full catalog rollback');print('PASS',checks[-1],flush=True)
 reads,acls=sql(READS),sql(OTHER_ACLS)
 sql(SOURCE.read_text())
 if sql(READS)!=reads or sql(OTHER_ACLS)!=acls:raise AssertionError('Retirement changed readers/nonclinical ACLs')
 install.result=dict(installation_checks=checks,readers_and_nonclinical_acls_preserved=True)


def exercise(sql,ctx):
 check,call=ctx['check'],ctx['call']
 base=ctx['state_query']().rstrip(';')
 state_query="SELECT jsonb_build_object('base',("+base+"),'requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM clinical_step_confirmation.requests x),'audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM clinical_step_confirmation.audit x));"
 state=lambda:sql(state_query)
 def refusal(label,statement,marker='permission denied'):
  before=state();result=sql(statement,False)
  check(result.returncode!=0 and marker.lower() in result.stderr.lower() and state()==before,label+' refuses preserving full domain/request/audit state')
 matrix=json.loads(sql("SELECT jsonb_agg(jsonb_build_array(g.role,t.name,p,has_table_privilege(g.role,'public.'||t.name,p)) ORDER BY g.role,t.name,p) FROM(VALUES('anon'),('authenticated'),('service_role'))g(role) CROSS JOIN(VALUES('hato_tratamientos'),('hato_tratamiento_pasos'))t(name) CROSS JOIN unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'])p;"))
 check(len(matrix)==42 and all(not x[3] for x in matrix),'all42 effective clinical table writer privileges denied')
 columns=json.loads(sql("SELECT jsonb_agg(jsonb_build_array(g.role,t.name,has_any_column_privilege(g.role,'public.'||t.name,'INSERT,UPDATE,REFERENCES'))) FROM(VALUES('anon'),('authenticated'),('service_role'))g(role) CROSS JOIN(VALUES('hato_tratamientos'),('hato_tratamiento_pasos'))t(name);"))
 check(all(not x[2] for x in columns),'all clinical effective column writer privileges denied')
 for role in ROLES:
  for table in TABLES:
   column='nota' if table=='hato_tratamientos' else 'fecha_ejecutada'
   refusal(role+' direct '+table+' UPDATE','BEGIN;SET LOCAL ROLE '+role+';SET LOCAL request.jwt.claim.sub='+lit(c.OWNER)+';UPDATE '+table+' SET '+column+'=NULL WHERE false;ROLLBACK;')
  refusal(role+' legacy177 EXECUTE','BEGIN;SET LOCAL ROLE '+role+';SELECT public.fn_hato_confirmar_paso_tratamiento(NULL,NULL,NULL,NULL);ROLLBACK;')
 # Genuine Telegram helper/SDK proof runs before other confirmation audits so
 # its independent exact single-audit assertion remains meaningful.
 n.exercise.client=exercise.client;n.exercise(sql,ctx)
 sql('UPDATE usuarios SET activo=true WHERE id='+u(c.OTHER)+';')
 animal=ctx['treated']['payload']['animalId']
 original=json.loads(sql('SELECT to_jsonb(a) FROM hato_animales a WHERE id='+u(animal)+';'))
 p=dict(version=1,animalId=animal,nombre='Synthetic retired clinical writer',fechaInicio='2026-10-14',nota=None,fechaProximoPaso='2026-10-14',descripcionPaso='Synthetic retired step',observedAnimal=original)
 key=c.uid();args=[lit('prepare'),u(key),js(p),u(c.OWNER)];call('fn_hato_treatment_create_web',args);args[0]=lit('post');created=call('fn_hato_treatment_create_web',args)
 step=created['receipt']['after']['steps'][0]['id'];intent=dict(version=1,stepId=step,fechaEjecutada='2026-10-14',alertId=None);key=c.uid()
 def web(mode):return call('fn_clinical_step_web',[lit(mode),u(key),'NULL::jsonb',u(c.OWNER)])
 prepared=call('fn_clinical_step_web',[lit('prepare'),u(key),js(intent),u(c.OWNER)])
 def raw(mode,drift):return 'BEGIN;'+drift+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(c.OWNER)+";SELECT public.fn_clinical_step_web("+lit(mode)+','+u(key)+',NULL::jsonb,'+u(c.OWNER)+');COMMIT;'
 for label,drift in [
  ('restored table UPDATE','GRANT UPDATE ON hato_tratamientos TO service_role;'),
  ('restored column UPDATE','GRANT UPDATE(fecha_ejecutada) ON hato_tratamiento_pasos TO authenticated;'),
  ('restored PUBLIC UPDATE','GRANT UPDATE ON hato_tratamientos TO PUBLIC;'),
  ('restored legacy177 EXECUTE','GRANT EXECUTE ON FUNCTION '+LEGACY+' TO service_role;'),
  ('lost selected reader','REVOKE SELECT ON hato_tratamiento_pasos FROM anon;'),
  ('protected audit grant','GRANT SELECT ON clinical_step_confirmation.audit TO authenticated;'),
  ('protected helper EXECUTE','GRANT EXECUTE ON FUNCTION clinical_step_confirmation.intent(jsonb) TO service_role;')]:
  refusal(label,raw('post',drift),'Clinical retired writer boundary drift')
 fault="CREATE FUNCTION public.synthetic_retired_audit_fault() RETURNS trigger LANGUAGE plpgsql AS $fault$ BEGIN RETURN NULL;END $fault$;CREATE TRIGGER synthetic_retired_audit_fault BEFORE INSERT ON clinical_step_confirmation.audit FOR EACH ROW EXECUTE FUNCTION public.synthetic_retired_audit_fault();"
 refusal('late suppressed clinical audit',raw('post',fault),'audit suppressed')
 with concurrent.futures.ThreadPoolExecutor(2) as pool:
  a=pool.submit(web,'post');bpost=pool.submit(web,'post');posted=a.result();other=bpost.result()
 check(posted==other and posted['state']=='committed' and posted['receipt']['before']==prepared['original'],'protected clinical web still atomically commits once after full writer retirement')
 before=state();check(web('status')==posted and web('post')==posted and state()==before,'original web status/post retry preserve complete graph after retirement')
 check(sql('SELECT count(*) FROM clinical_step_confirmation.audit WHERE request_key='+u(key)+' AND receipt='+js(posted['receipt'])+';')=='1','independent protected web audit equals original committed proof')
 b.exercise.client=exercise.client;b.exercise(sql,ctx)
 exercise.result=dict(effective_table_matrix=matrix,column_writers_denied=True,telegram_sdk_proofs=n.exercise.result,browser_sdk_proofs=b.exercise.result)


def main():
 a=argparse.ArgumentParser(description=__doc__);a.add_argument('evidence_dir',type=Path)
 for name in ('runtime','client','output','private-diagnostics'):a.add_argument('--'+name,type=Path,required=True)
 args=a.parse_args();evidence=args.evidence_dir.resolve();output=args.output.resolve();exercise.client=args.client.resolve()
 if output.is_relative_to(evidence) or output.name.endswith('-private.json') or args.private_diagnostics.resolve().is_relative_to(evidence):raise ValueError('Cannot overwrite private evidence')
 files=[SOURCE,Path(__file__),t.SOURCE,t.QUERY,n.SCRIPT,b.SCRIPT,*n.CLIENT_FILES,*b.CLIENT_FILES];source_bytes={p:p.read_bytes() for p in files}
 catalog,rls,hashes=r.load(evidence)
 with r.database(args.runtime.resolve(),exercise.client,args.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(p.read_bytes()!=v for p,v in source_bytes.items()):raise ValueError('Source changed during replay')
 result.update(install.result,**exercise.result,source_hashes={str(p.relative_to(r.ROOT)):r.p.digest(v) for p,v in source_bytes.items()},temporary_database_stopped_and_removed=True)
 result['assertions']+=len(install.result['installation_checks']);result['nested_sdk_assertions']=sum(p['assertions'] for p in n.exercise.result+b.exercise.result)
 result['limits']=['Local synthetic Auth/data/mock HTTP only; no hosted/deployment certification.','Retires selected clinical UPDATE/177 only; other lifecycle, reader restrictions and global writers remain open.']
 output.write_text(json.dumps(result,indent=2)+'\n')

if __name__=='__main__':main()
