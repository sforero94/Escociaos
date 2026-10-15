#!/usr/bin/env python3
"""Clinical alert executed-step invariant on verified local replay only."""
import argparse
import importlib.util
import json
from pathlib import Path
spec=importlib.util.spec_from_file_location('lifecycle',Path(__file__).with_name('lifecycle-writer-replay.py'))
l=importlib.util.module_from_spec(spec);spec.loader.exec_module(l)
t,c,r,lit,js,u=l.t,l.c,l.r,l.lit,l.js,l.u
SOURCE=r.ROOT/'src/sql/security-candidates/clinical-alert-integrity.sql'
QUERY=Path(__file__).with_name('clinical-alert-baseline-query.sql')
n=l.t.s.t.n;b=l.t.s.t.b


def install(sql):
 t.install(sql);before=sql(t.t.CATALOG);checks=[]
 for label,drift in [('alert column drift','ALTER TABLE hato_alertas ADD COLUMN synthetic_drift text;'),('clinical reader loss','REVOKE SELECT ON hato_tratamiento_pasos FROM authenticated;')]:
  result=sql('BEGIN;'+drift+r.transaction_body(SOURCE.read_text())+'COMMIT;',False)
  if result.returncode==0 or 'Unreviewed clinical alert' not in result.stderr or sql(t.t.CATALOG)!=before:raise AssertionError(label)
  checks.append(label+' refuses with catalog rollback')
 sql(SOURCE.read_text());install.result=dict(admission_checks=checks)


def exercise(sql,ctx):
 check,call=ctx['check'],ctx['call'];base=ctx['state_query']().rstrip(';')
 state=lambda:sql("SELECT jsonb_build_object('base',("+base+"),'requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM clinical_step_confirmation.requests x),'audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM clinical_step_confirmation.audit x));")
 n.exercise.client=exercise.client;n.exercise(sql,ctx)
 animal=ctx['treated']['payload']['animalId'];original=json.loads(sql('SELECT to_jsonb(a) FROM hato_animales a WHERE id='+u(animal)+';'))
 p=dict(version=1,animalId=animal,nombre='Synthetic clinical alert invariant',fechaInicio='2026-10-14',nota=None,fechaProximoPaso='2026-10-14',descripcionPaso='Synthetic invariant step',observedAnimal=original)
 key=c.uid();args=[lit('prepare'),u(key),js(p),u(c.OWNER)];call('fn_hato_treatment_create_web',args);args[0]=lit('post');created=call('fn_hato_treatment_create_web',args);step=created['receipt']['after']['steps'][0]['id'];alert=c.uid()
 sql('INSERT INTO hato_alertas(id,tipo,animal_id,regla_clave,fecha_programada,estado,paso_id) VALUES('+u(alert)+",'tratamiento_paso',"+u(animal)+','+lit('synthetic-invariant-'+alert)+",'2026-10-14','enviada',"+u(step)+');')
 for role in ('anon','authenticated','service_role'):
  before=state();result=sql('BEGIN;SET LOCAL ROLE '+role+';SET LOCAL request.jwt.claim.sub='+lit(c.OWNER if role=='authenticated' else '')+";UPDATE hato_alertas SET estado='confirmada',respuesta='si' WHERE id="+u(alert)+' RETURNING id;COMMIT;',False)
  check(state()==before and ((result.returncode!=0 and ('Clinical alert requires matching executed step' in result.stderr or 'Clinical alert writer authority required' in result.stderr)) or (result.returncode==0 and result.stdout.strip()=='')),role+' cannot falsely confirm a pending clinical alert')
 for context,actor,setup in [('missing UID',None,''),('missing profile',c.uid(),''),('inactive profile',c.OWNER,'UPDATE usuarios SET activo=false WHERE id='+u(c.OWNER)+';'),('reader role',c.OWNER,"UPDATE usuarios SET rol='Verificador' WHERE id="+u(c.OWNER)+';')]:
  for target in (step,c.uid()):
   before=state();new_id=c.uid();body='INSERT INTO hato_alertas(id,tipo,animal_id,regla_clave,fecha_programada,estado,paso_id) VALUES('+u(new_id)+",'tratamiento_paso',"+u(animal)+','+lit('synthetic-authority-'+new_id)+",'2026-10-14','confirmada',"+u(target)+');'
   result=sql('BEGIN;'+setup+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(actor or '')+';'+body+'COMMIT;',False)
   check(result.returncode!=0 and 'Clinical alert writer authority required' in result.stderr and state()==before,context+' refuses before known/unknown clinical step lookup')
 for column,value in [('paso_id','NULL'),('animal_id','NULL')]:
  before=state();result=sql("BEGIN;SET LOCAL ROLE service_role;UPDATE hato_alertas SET estado='confirmada',"+column+'='+value+' WHERE id='+u(alert)+';COMMIT;',False)
  check(result.returncode!=0 and 'Clinical alert requires matching executed step' in result.stderr and state()==before,'missing '+column+' refuses clinical confirmation with full rollback')
 for label,statement in [('negative response',"UPDATE hato_alertas SET estado='respondida',respuesta='no' WHERE id="+u(alert)+';'),('notification metadata',"UPDATE hato_alertas SET intentos=intentos+1 WHERE id="+u(alert)+';'),('discard lifecycle',"UPDATE hato_alertas SET estado='descartada' WHERE id="+u(alert)+';')]:
  before=state();result=sql('BEGIN;SET LOCAL ROLE service_role;'+statement+'ROLLBACK;',False)
  check(result.returncode==0 and state()==before,label+' remains compatible without a clinical write')
 intent=dict(version=1,stepId=step,fechaEjecutada='2026-10-14',alertId=alert);key=c.uid();call('fn_clinical_step_web',[lit('prepare'),u(key),js(intent),u(c.OWNER)]);posted=call('fn_clinical_step_web',[lit('post'),u(key),'NULL::jsonb',u(c.OWNER)])
 check(posted['state']=='committed' and posted['receipt']['after']['alerts'][0]['estado']=='confirmada','protected confirmation updates step then alert atomically with new invariant')
 # Existing executed steps need no invented prospective confirmation receipt.
 legacy_alert=c.uid();before_audits=sql('SELECT count(*) FROM clinical_step_confirmation.audit;')
 sql('INSERT INTO hato_alertas(id,tipo,animal_id,regla_clave,fecha_programada,estado,paso_id) VALUES('+u(legacy_alert)+",'tratamiento_paso',"+u(animal)+','+lit('synthetic-legacy-close-'+legacy_alert)+",'2026-10-14','enviada',"+u(step)+');')
 result=sql("BEGIN;SET LOCAL ROLE service_role;UPDATE hato_alertas SET estado='confirmada' WHERE id="+u(legacy_alert)+';COMMIT;',False)
 check(result.returncode==0 and sql('SELECT count(*) FROM clinical_step_confirmation.audit;')==before_audits,'cron-shaped closure of already executed step stays compatible without inventing audit')
 before=state();result=sql("BEGIN;SET LOCAL ROLE service_role;UPDATE hato_alertas SET animal_id=NULL WHERE id="+u(legacy_alert)+';COMMIT;',False)
 check(result.returncode!=0 and 'Clinical alert requires matching executed step' in result.stderr and state()==before,'confirmed clinical alert cannot detach its matching animal')
 b.exercise.client=exercise.client;b.exercise(sql,ctx)
 exercise.result=dict(telegram_sdk_proofs=n.exercise.result,browser_sdk_proofs=b.exercise.result)


def main():
 a=argparse.ArgumentParser(description=__doc__);a.add_argument('evidence_dir',type=Path)
 for name in ('runtime','client','output','private-diagnostics'):a.add_argument('--'+name,type=Path,required=True)
 args=a.parse_args();evidence=args.evidence_dir.resolve();output=args.output.resolve();exercise.client=args.client.resolve()
 if output.is_relative_to(evidence) or output.name.endswith('-private.json') or args.private_diagnostics.resolve().is_relative_to(evidence):raise ValueError('Cannot overwrite private evidence')
 files=[SOURCE,QUERY,Path(__file__),n.SCRIPT,b.SCRIPT,*n.CLIENT_FILES,*b.CLIENT_FILES];source_bytes={p:p.read_bytes() for p in files}
 catalog,rls,hashes=r.load(evidence)
 with r.database(args.runtime.resolve(),exercise.client,args.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(p.read_bytes()!=v for p,v in source_bytes.items()):raise ValueError('Source changed during replay')
 result.update(install.result,**exercise.result,source_hashes={str(p.relative_to(r.ROOT)):r.p.digest(v) for p,v in source_bytes.items()},temporary_database_stopped_and_removed=True)
 result['assertions']+=len(install.result['admission_checks']);result['nested_sdk_assertions']=sum(p['assertions'] for p in n.exercise.result+b.exercise.result)
 result['limits']=['Prospective alert/step consistency only; remaining alert actor/CAS/atomic lifecycle writers remain open.','Local synthetic Auth/mock HTTP only; no historical/hosted/global certificate.']
 output.write_text(json.dumps(result,indent=2)+'\n')

if __name__=='__main__':main()
