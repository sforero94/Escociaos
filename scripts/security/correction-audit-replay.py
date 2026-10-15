#!/usr/bin/env python3
"""Prospective correction-audit storage protection on local metadata replay."""
import argparse
import importlib.util
import json
from pathlib import Path

spec=importlib.util.spec_from_file_location('clinical_retirement',Path(__file__).with_name('clinical-update-retirement-replay.py'))
t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
c,r,lit,js,u=t.c,t.r,t.lit,t.js,t.u
SOURCE=r.ROOT/'src/sql/security-candidates/correction-audit-integrity.sql'
QUERY=Path(__file__).with_name('correction-audit-baseline-query.sql')
TABLES=('hato_correcciones','globalgap_correcciones')
ROLES=('anon','authenticated','service_role')


def install(sql):
 t.install(sql)
 before=sql(t.CATALOG);checks=[];bypasses=[]
 for table,source in zip(TABLES,('hato_animales','aplicaciones')):
  key=c.uid()
  body='INSERT INTO '+table+'(id,tabla,fila_id,operacion,datos_anteriores) VALUES('+u(key)+','+lit(source)+','+u(c.uid())+",'update','{}');UPDATE "+table+" SET datos_nuevos='{\"synthetic_forgery\":true}' WHERE id="+u(key)+';DELETE FROM '+table+' WHERE id='+u(key)+';'
  result=sql('BEGIN;SET LOCAL ROLE service_role;'+body+'ROLLBACK;',False)
  if result.returncode:raise AssertionError('Expected local service audit bypass')
  bypasses.append(table+' service INSERT/UPDATE/DELETE reproduced and rolled back')
  print('PASS',bypasses[-1],flush=True)
 for label,drift in [
  ('audit schema drift','ALTER TABLE hato_correcciones ADD COLUMN synthetic_unreviewed text;'),
  ('audit RLS drift','ALTER TABLE globalgap_correcciones DISABLE ROW LEVEL SECURITY;'),
  ('audit writer config drift',"ALTER FUNCTION public.fn_hato_registrar_correccion() SET work_mem='8MB';"),
  ('audit writer ownership mode drift','ALTER FUNCTION public.fn_globalgap_registrar_correccion() SECURITY INVOKER;'),
  ('missing source binding','DROP TRIGGER trg_hato_correccion ON hato_animales;'),
  ('plan graph config drift',"ALTER FUNCTION application_plan_delete.assert_graph() SET work_mem='8MB';")]:
  result=sql('BEGIN;'+drift+r.transaction_body(SOURCE.read_text())+'COMMIT;',False)
  if result.returncode==0 or 'Unreviewed' not in result.stderr or sql(t.CATALOG)!=before:raise AssertionError(label)
  checks.append(label+' refuses with catalog rollback');print('PASS',checks[-1],flush=True)
 reads=sql(t.READS)
 rows=sql("SELECT jsonb_build_array((SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM hato_correcciones x),(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM globalgap_correcciones x));")
 sql(SOURCE.read_text())
 if sql(t.READS)!=reads:raise AssertionError('Audit reader changes')
 if sql("SELECT jsonb_build_array((SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM hato_correcciones x),(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM globalgap_correcciones x));")!=rows:raise AssertionError('Audit history changed')
 install.result=dict(installation_checks=checks,pre_retirement_local_bypasses=bypasses,all_reader_privileges_preserved=True,existing_audit_rows_unchanged=True)


def exercise(sql,ctx):
 check,call=ctx['check'],ctx['call'];animal=ctx['treated']['payload']['animalId']
 base=ctx['state_query']().rstrip(';')
 query="SELECT jsonb_build_object('base',("+base+"),'requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM clinical_step_confirmation.requests x),'audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM clinical_step_confirmation.audit x));"
 state=lambda:sql(query)
 def refuse(label,statement,marker):
  before=state();result=sql(statement,False)
  if result.returncode==0 or marker.lower() not in result.stderr.lower():raise AssertionError(label)
  check(state()==before,label+' refuses preserving complete domain/control/audit state')
 matrix=json.loads(sql("SELECT jsonb_agg(jsonb_build_array(g.role,t.name,p,has_table_privilege(g.role,'public.'||t.name,p)) ORDER BY g.role,t.name,p) FROM(VALUES('anon'),('authenticated'),('service_role'))g(role) CROSS JOIN(VALUES('hato_correcciones'),('globalgap_correcciones'))t(name) CROSS JOIN unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'])p;"))
 check(len(matrix)==42 and all(not x[3] for x in matrix),'all42 ordinary/service audit table writer privileges denied')
 for role in ROLES:
  for table in TABLES:
   for operation,body in [('INSERT','INSERT INTO '+table+' DEFAULT VALUES;'),('UPDATE','UPDATE '+table+" SET operacion='update' WHERE false;"),('DELETE','DELETE FROM '+table+' WHERE false;'),('TRUNCATE','TRUNCATE '+table+';')]:
    refuse(role+' '+table+' '+operation,'BEGIN;SET LOCAL ROLE '+role+';'+body+'ROLLBACK;','permission denied')
 check(sql("SELECT NOT EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))g(role) CROSS JOIN(VALUES('hato_correcciones'),('globalgap_correcciones'))t(name) WHERE has_any_column_privilege(g.role,'public.'||t.name,'INSERT,UPDATE,REFERENCES'));")=='t','all audit effective column writers denied')
 check(sql("SELECT NOT EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))g(role) CROSS JOIN(VALUES('public.fn_hato_registrar_correccion()'),('public.fn_globalgap_registrar_correccion()'))f(signature) WHERE has_function_privilege(g.role,f.signature,'EXECUTE'));")=='t','source audit trigger EXECUTE denied to all ordinary/service roles')
 # Real authorized source updates must retain their transactional definer audits.
 original=json.loads(sql('SELECT to_jsonb(a) FROM hato_animales a WHERE id='+u(animal)+';'))
 sql('BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(c.OWNER)+";UPDATE hato_animales SET nombre='Synthetic protected correction' WHERE id="+u(animal)+';COMMIT;')
 audit=json.loads(sql('SELECT to_jsonb(a) FROM hato_correcciones a WHERE fila_id='+u(animal)+' ORDER BY corregido_en DESC,id DESC LIMIT 1;'))
 actual=json.loads(sql('SELECT to_jsonb(a) FROM hato_animales a WHERE id='+u(animal)+';'))
 check(audit['corregido_por']==c.OWNER and audit['datos_anteriores']==original and audit['datos_nuevos']==actual,'current human source trigger still records exact trusted actor/before/after after EXECUTE retirement')
 app=sql('SELECT id FROM aplicaciones ORDER BY id LIMIT 1;');old=json.loads(sql('SELECT to_jsonb(a) FROM aplicaciones a WHERE id='+u(app)+';'))
 sql('BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(c.OWNER)+";UPDATE aplicaciones SET proposito='Synthetic protected global correction' WHERE id="+u(app)+';COMMIT;')
 audit_global=json.loads(sql('SELECT to_jsonb(a) FROM globalgap_correcciones a WHERE fila_id='+u(app)+' ORDER BY corregido_en DESC,id DESC LIMIT 1;'))
 actual_global=json.loads(sql('SELECT to_jsonb(a) FROM aplicaciones a WHERE id='+u(app)+';'))
 check(audit_global['corregido_por']==c.OWNER and audit_global['datos_anteriores']==old and audit_global['datos_nuevos']==actual_global,'GlobalGAP source trigger retains exact correction audit with all candidates co-installed')
 for table,audit_row in [(TABLES[0],audit),(TABLES[1],audit_global)]:
  for operation,statement in [('UPDATE','UPDATE '+table+" SET datos_anteriores='{}' WHERE id="+u(audit_row['id'])+';'),('DELETE','DELETE FROM '+table+' WHERE id='+u(audit_row['id'])+';'),('TRUNCATE','TRUNCATE '+table+';')]:
   refuse('owner '+table+' immutable '+operation,'BEGIN;'+statement+'ROLLBACK;','Immutable correction audit')
  columns='tabla,fila_id,operacion,datos_anteriores'
  body='INSERT INTO '+table+'('+columns+') VALUES('+lit(audit_row['tabla'])+','+u(c.uid())+",'update','{}');"
  refuse('restored service '+table+' INSERT','BEGIN;GRANT INSERT ON '+table+' TO service_role;SET LOCAL ROLE service_role;'+body+'ROLLBACK;','Trusted nested correction trigger required')
  refuse('direct owner '+table+' INSERT','BEGIN;'+body+'ROLLBACK;','Trusted nested correction trigger required')
 # Faulted audit insert must abort its source change, with complete rollback.
 fault="CREATE FUNCTION public.synthetic_correction_fault() RETURNS trigger LANGUAGE plpgsql AS $fault$ BEGIN RAISE EXCEPTION 'Synthetic correction failure';END $fault$;CREATE TRIGGER synthetic_correction_fault BEFORE INSERT ON hato_correcciones FOR EACH ROW EXECUTE FUNCTION public.synthetic_correction_fault();"
 refuse('source plus late audit fault','BEGIN;'+fault+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(c.OWNER)+";UPDATE hato_animales SET nombre='Synthetic refused source' WHERE id="+u(animal)+';COMMIT;','Synthetic correction failure')
 for label,drift in [
  ('restored audit writer grant','GRANT UPDATE ON globalgap_correcciones TO service_role;'),
  ('disabled immutable trigger','ALTER TABLE globalgap_correcciones DISABLE TRIGGER correction_audit_guard;'),
  ('changed private guard config',"ALTER FUNCTION correction_audit_integrity.guard() SET work_mem='8MB';"),
  ('restored source function execute','GRANT EXECUTE ON FUNCTION public.fn_globalgap_registrar_correccion() TO authenticated;')]:
  refuse('plan '+label,'BEGIN;'+drift+'SELECT application_plan_delete.assert_graph();ROLLBACK;','Correction audit protection boundary drift')
 # Explicitly preserve the known service-lane audit limitation as an open gate.
 before_service=state();count=sql('SELECT count(*) FROM hato_correcciones;')
 result=sql("BEGIN;SET LOCAL ROLE service_role;SET LOCAL request.jwt.claim.sub='';UPDATE hato_animales SET nombre='Synthetic unaudited service witness' WHERE id="+u(animal)+';RESET ROLE;SELECT (SELECT count(*)='+count+' FROM hato_correcciones) AND (SELECT nombre=\'Synthetic unaudited service witness\' FROM hato_animales WHERE id='+u(animal)+');ROLLBACK;',False)
 check(result.returncode==0 and result.stdout.strip()=='t' and state()==before_service,'remaining service source UPDATE skips legacy correction audit; reproduced only in rolled-back local transaction')
 exercise.result=dict(effective_audit_table_writer_matrix=matrix,existing_source_audits_preserved=True,legacy_service_audit_gap_remains=True)


def main():
 a=argparse.ArgumentParser(description=__doc__);a.add_argument('evidence_dir',type=Path)
 for name in ('runtime','client','output','private-diagnostics'):a.add_argument('--'+name,type=Path,required=True)
 args=a.parse_args();evidence=args.evidence_dir.resolve();output=args.output.resolve()
 if output.is_relative_to(evidence) or output.name.endswith('-private.json') or args.private_diagnostics.resolve().is_relative_to(evidence):raise ValueError('Cannot overwrite private evidence')
 files=[SOURCE,QUERY,Path(__file__),t.SOURCE];source_bytes={p:p.read_bytes() for p in files}
 catalog,rls,hashes=r.load(evidence)
 with r.database(args.runtime.resolve(),args.client.resolve(),args.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(p.read_bytes()!=v for p,v in source_bytes.items()):raise ValueError('Source changed during replay')
 result.update(install.result,**exercise.result,source_hashes={str(p.relative_to(r.ROOT)):r.p.digest(v) for p,v in source_bytes.items()},temporary_database_stopped_and_removed=True)
 result['assertions']+=len(install.result['installation_checks'])+len(install.result['pre_retirement_local_bypasses'])
 result['limits']=['Local synthetic metadata replay only; no hosted/global certification.','Prospective correction storage protection, not certification of historical audit provenance.','Service source writes with NULL UID still skip legacy audit; remaining lifecycle/reader/global review is open.']
 output.write_text(json.dumps(result,indent=2)+'\n')

if __name__=='__main__':main()
