#!/usr/bin/env python3
"""Unused clinical creation/deletion lane retirement on local private replay."""
import argparse
import importlib.util
import json
from pathlib import Path

spec=importlib.util.spec_from_file_location('stock_retirement',Path(__file__).with_name('coordinated-writer-retirement-replay.py'))
t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
c,r,lit,js,u=t.c,t.r,t.lit,t.js,t.u
SOURCE=r.ROOT/'src/sql/security-candidates/clinical-creation-retirement.sql'


def install(sql):
 sql('BEGIN;'+r.transaction_body(t.SOURCE.read_text())+'COMMIT;')
 before=sql(t.READS);other="SELECT jsonb_agg(jsonb_build_array(c.oid,c.relacl,a.attnum,a.attacl) ORDER BY c.oid,a.attnum) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 WHERE n.nspname IN('public','respaldos') AND c.relkind IN('r','v') AND NOT(n.nspname='public' AND c.relname IN('hato_tratamientos','hato_tratamiento_pasos'));"
 untouched=sql(other);baseline=sql(t.CATALOG);checks=[];source=r.transaction_body(SOURCE.read_text())
 for label,drift,marker in [
  ('inherited clinical creator',"CREATE ROLE synthetic_clinical_writer;GRANT INSERT ON hato_tratamientos TO synthetic_clinical_writer;GRANT synthetic_clinical_writer TO authenticated;",'effective grant/view'),
  ('changed invoker177',"ALTER FUNCTION public.fn_hato_confirmar_paso_tratamiento(uuid,uuid,date,text) SECURITY DEFINER;",'invoker177'),
  ('writable clinical view',"CREATE VIEW public.synthetic_clinical_view AS SELECT * FROM hato_tratamientos;GRANT INSERT ON synthetic_clinical_view TO authenticated;",'effective grant/view')]:
  result=sql('BEGIN;'+drift+source+'COMMIT;',False)
  if result.returncode==0 or marker not in result.stderr or sql(t.CATALOG)!=baseline:raise AssertionError(label)
  checks.append(label+' refuses with full catalog rollback');print('PASS',checks[-1],flush=True)
 sql('BEGIN;'+source+'COMMIT;')
 if sql(t.READS)!=before or sql(other)!=untouched:raise AssertionError('Changed readers or nonclinical ACLs')
 install.result=dict(installation_checks=checks,all_domain_read_privileges_preserved=True,nonclinical_relation_column_acls_preserved=True)


def exercise(sql,ctx):
 check,state,call=ctx['check'],ctx['state'],ctx['call'];animal=ctx['treated']['payload']['animalId'];before=state()
 for role in t.ROLES:
  for table in ('hato_tratamientos','hato_tratamiento_pasos'):
   for verb,statement in [('INSERT','INSERT INTO '+table+' DEFAULT VALUES;'),('DELETE','DELETE FROM '+table+' WHERE false;')]:
    result=sql('BEGIN;SET LOCAL ROLE '+role+';SET LOCAL request.jwt.claim.sub='+lit(c.OWNER)+';'+statement+'ROLLBACK;',False)
    check(result.returncode!=0 and 'permission denied' in result.stderr.lower() and state()==before,role+' direct '+table+' '+verb+' refuses without state changes')
 matrix=json.loads(sql("SELECT jsonb_agg(jsonb_build_array(g.role,t.name,p,has_table_privilege(g.role,'public.'||t.name,p)) ORDER BY g.role,t.name,p) FROM(VALUES('anon'),('authenticated'),('service_role'))g(role) CROSS JOIN(VALUES('hato_tratamientos'),('hato_tratamiento_pasos'))t(name) CROSS JOIN unnest(ARRAY['INSERT','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'])p;"))
 check(all(not x[3] for x in matrix),'all36 effective clinical creation/deletion/maintenance privileges denied')
 original=json.loads(sql('SELECT to_jsonb(a) FROM hato_animales a WHERE id='+u(animal)+';'))
 payload=dict(version=1,animalId=animal,nombre='Synthetic retained step lane',fechaInicio='2026-10-14',nota=None,fechaProximoPaso='2026-10-14',descripcionPaso=None,observedAnimal=original)
 key=c.uid();args=[lit('prepare'),u(key),js(payload),u(c.OWNER)];call('fn_hato_treatment_create_web',args);args[0]=lit('post');created=call('fn_hato_treatment_create_web',args)
 header=created['receipt']['after']['header']['id'];step=created['receipt']['after']['steps'][0]['id']
 result=call('fn_hato_confirmar_paso_tratamiento',[u(animal),u(step),"'2026-10-14'::date",lit('Synthetic confirmer')],actor=None,role='service_role')
 check(result['ya_confirmado'] is False and sql('SELECT estado FROM hato_tratamientos WHERE id='+u(header)+';')=='completado','invoker177 retains required step/header UPDATE after INSERT/DELETE retirement')
 before=state();result=call('fn_hato_confirmar_paso_tratamiento',[u(animal),u(step),"'2026-10-14'::date",lit('Synthetic confirmer')],actor=None,role='service_role')
 check(result['ya_confirmado'] is True and state()==before,'invoker177 same-date retry preserves full combined state')
 # Actual remaining browser/bot UPDATE shape remains compatible. This is a
 # known untrusted-audit lane, NOT proof that clinical mutation is now closed.
 key=c.uid();payload['nombre']='Synthetic direct update witness';args=[lit('prepare'),u(key),js(payload),u(c.OWNER)];call('fn_hato_treatment_create_web',args);args[0]=lit('post');created=call('fn_hato_treatment_create_web',args)
 step=created['receipt']['after']['steps'][0]['id'];before=state()
 result=sql('BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(c.OWNER)+";UPDATE hato_tratamiento_pasos SET fecha_ejecutada='2026-10-14' WHERE id="+u(step)+" AND fecha_ejecutada IS NULL;RESET ROLE;SELECT fecha_ejecutada='2026-10-14' FROM hato_tratamiento_pasos WHERE id="+u(step)+';ROLLBACK;',False)
 check(result.returncode==0 and result.stdout.strip()=='t' and state()==before,'remaining authenticated direct step UPDATE reproduced and rolled back; audit cutover still required')
 # Reuse all observed source/identity/clinical races after narrowing privileges.
 race_spec=importlib.util.spec_from_file_location('clinical_races',Path(__file__).with_name('combined-writer-races.py'));races=importlib.util.module_from_spec(race_spec);race_spec.loader.exec_module(races);races.exercise(sql,ctx)
 exercise.result=dict(clinical_table_writer_matrix=matrix,invoker177_preserved=True,remaining_direct_step_update_confirmed=True,observed_lock_races=races.exercise.observed)


def main():
 a=argparse.ArgumentParser(description=__doc__);a.add_argument('evidence_dir',type=Path)
 for name in ('runtime','client','output','private-diagnostics'):a.add_argument('--'+name,type=Path,required=True)
 args=a.parse_args();evidence=args.evidence_dir.resolve();output=args.output.resolve()
 if output.is_relative_to(evidence) or output.name.endswith('-private.json') or args.private_diagnostics.resolve().is_relative_to(evidence):raise ValueError('Cannot overwrite private evidence')
 catalog,rls,hashes=r.load(evidence)
 with r.database(args.runtime.resolve(),args.client.resolve(),args.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 result.update(install.result,**exercise.result,clinical_candidate_sha256=r.p.digest(SOURCE.read_bytes()),stock_retirement_sha256=r.p.digest(t.SOURCE.read_bytes()),extension_sha256=r.p.digest(Path(__file__).read_bytes()),temporary_database_stopped_and_removed=True)
 result['assertions']+=len(install.result['installation_checks']);result['limits']=['Local synthetic data/Auth only; no hosted/release certification.','Clinical UPDATE lanes including invoker177 remain open for subsequent atomic trusted-audit cutover; no complete cattle/global writer certificate.']
 output.write_text(json.dumps(result,indent=2)+'\n')

if __name__=='__main__':main()
