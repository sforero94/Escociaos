#!/usr/bin/env python3
"""Owner-approved prospective manual clinical linkage on four-export local replay."""
import argparse
import importlib.util
import json
from pathlib import Path
spec=importlib.util.spec_from_file_location('foundation',Path(__file__).with_name('alert-response-replay.py'))
t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
c,r,lit,js,u=t.c,t.r,t.lit,t.js,t.u
SOURCE=r.ROOT/'src/sql/security-candidates/manual-clinical-alert-link.sql'
def install(sql):
 t.install(sql);sql(SOURCE.read_text())
def exercise(sql,ctx):
 check=ctx['check'];base=ctx['state_query']().rstrip(';')
 query="SELECT jsonb_build_object('base',("+base+"),'clinical_requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM clinical_step_confirmation.requests x),'clinical_audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM clinical_step_confirmation.audit x),'response_requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM alert_response.requests x),'response_audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM alert_response.audit x));"
 state=lambda:sql(query)
 animal,other=c.uid(),c.uid();sql('INSERT INTO hato_animales(id,nombre,etapa,estado) VALUES('+u(animal)+",'Synthetic manual clinical animal','vaca','activa'),("+u(other)+",'Synthetic other animal','vaca','activa');")
 animal_row=json.loads(sql('SELECT to_jsonb(x) FROM hato_animales x WHERE id='+u(animal)+';'))
 payload=dict(version=1,animalId=animal,nombre='Synthetic pending treatment',fechaInicio='2026-10-14',nota=None,fechaProximoPaso='2026-10-14',descripcionPaso='Synthetic existing step',observedAnimal=animal_row)
 key=c.uid();args=[lit('prepare'),u(key),js(payload),u(c.OWNER)];ctx['call']('fn_hato_treatment_create_web',args);args[0]=lit('post');created=ctx['call']('fn_hato_treatment_create_web',args);step=created['receipt']['after']['steps'][0]['id'];header=created['receipt']['after']['header']['id']
 def insert(alert,step_id=step,animal_id=animal,kind='tratamiento_paso'):
  return 'INSERT INTO hato_alertas(id,tipo,animal_id,paso_id,regla_clave,fecha_programada,estado,datos) VALUES('+u(alert)+','+lit(kind)+','+u(animal_id)+','+(u(step_id) if step_id else 'NULL')+','+lit('manual:synthetic:'+alert)+",'2026-10-14','pendiente','{\"origen\":\"manual\"}');"
 def human(body,actor=c.OWNER):return 'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(actor)+';'+body
 def refuse(label,body,marker='Existing pending',actor=c.OWNER):
  before=state();result=sql('BEGIN;'+human(body,actor)+'COMMIT;',False);check(result.returncode!=0 and marker.lower() in result.stderr.lower() and state()==before,label+' refuses with complete rollback')
 refuse('missing step',insert(c.uid(),None));refuse('wrong animal',insert(c.uid(),animal_id=other));refuse('missing target',insert(c.uid(),c.uid()))
 linked=c.uid();sql('BEGIN;'+human(insert(linked))+'COMMIT;');check(sql('SELECT paso_id FROM hato_alertas WHERE id='+u(linked)+';')==step,'manual alert links existing pending step without inventing a clinical record')
 before=state();refuse('retarget to another animal','UPDATE hato_alertas SET animal_id='+u(other)+' WHERE id='+u(linked)+';')
 for role in ('anon','authenticated','service_role'):
  result=sql('BEGIN;SET LOCAL ROLE '+role+';SELECT manual_clinical_alert.require_pending_step();COMMIT;',False);check(result.returncode!=0 and 'permission denied' in result.stderr.lower() and state()==before,role+' cannot directly invoke private guard')
 sql('UPDATE usuarios SET activo=false WHERE id='+u(c.OWNER)+';');refuse('revoked owner',insert(c.uid()),'Active');sql('UPDATE usuarios SET activo=true WHERE id='+u(c.OWNER)+';')
 # Only synthetic fixture construction simulates a pre-candidate unlinked row.
 legacy=c.uid();sql('BEGIN;ALTER TABLE hato_alertas DISABLE TRIGGER require_manual_pending_clinical_step;'+insert(legacy,None)+'ALTER TABLE hato_alertas ENABLE TRIGGER require_manual_pending_clinical_step;COMMIT;')
 old=sql('SELECT to_jsonb(x) FROM hato_alertas x WHERE id='+u(legacy)+';');sql('BEGIN;'+human("UPDATE hato_alertas SET datos=datos||'{\"nota\":\"Synthetic metadata edit\"}' WHERE id="+u(legacy)+';')+'COMMIT;');check(sql('SELECT paso_id IS NULL FROM hato_alertas WHERE id='+u(legacy)+';')=='t','legacy unlinked alert metadata edit preserves missing linkage without historical repair')
 refuse('legacy unlinked phantom confirmation',"UPDATE hato_alertas SET estado='confirmada',respuesta='si' WHERE id="+u(legacy)+';','matching executed')
 intent=dict(version=1,stepId=step,fechaEjecutada='2026-10-14',alertId=linked);confirm=c.uid();args=[lit('prepare'),u(confirm),js(intent),u(c.OWNER)];prepared=ctx['call']('fn_clinical_step_web',args);args[0]=lit('post');args[2]='NULL::jsonb';posted=ctx['call']('fn_clinical_step_web',args)
 check(prepared['state']=='pending' and posted['state']=='committed' and posted['receipt']['after']['steps'][0]['fecha_ejecutada']=='2026-10-14' and any(a['id']==linked and a['estado']=='confirmada' for a in posted['receipt']['after']['alerts']),'Si uses existing prepared clinical protocol to execute selected step and confirm linked manual alert')
 before=state();args[0]=lit('status');check(ctx['call']('fn_clinical_step_web',args)==posted and state()==before,'original clinical status recovers exact durable receipt without repeated execution')
 refuse('already executed step',insert(c.uid()))
 check(sql('SELECT paso_id IS NULL FROM hato_alertas WHERE id='+u(legacy)+';')=='t','execution leaves existing unlinked alert unchanged')
 nonclinical=c.uid();sql('BEGIN;'+human(insert(nonclinical,None,kind='secado_due'))+'COMMIT;');check(sql('SELECT tipo FROM hato_alertas WHERE id='+u(nonclinical)+';')=='secado_due','nonclinical manual alert creation remains compatible')
 exercise.result=dict(existing_unlinked_rows_preserved=True,prepared_clinical_execution_verified=True)
def main():
 a=argparse.ArgumentParser(description=__doc__);a.add_argument('evidence_dir',type=Path)
 for name in ('runtime','client','output','private-diagnostics'):a.add_argument('--'+name,type=Path,required=True)
 args=a.parse_args();evidence=args.evidence_dir.resolve();output=args.output.resolve()
 if output.is_relative_to(evidence) or output.name.endswith('-private.json'):raise ValueError('Cannot overwrite private evidence')
 sources={p:p.read_bytes() for p in [SOURCE,Path(__file__)]};catalog,rls,hashes=r.load(evidence)
 with r.database(args.runtime.resolve(),args.client.resolve(),args.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(p.read_bytes()!=b for p,b in sources.items()):raise ValueError('Source changed during replay')
 result.update(exercise.result,source_hashes={str(p.relative_to(r.ROOT)):r.p.digest(b) for p,b in sources.items()},temporary_database_stopped_and_removed=True)
 result['limits']=['Local synthetic eighteen-candidate replay only; no production query or history rewrite.','Manual retry/audit/CAS caller integration, edit/bulk/cron, remaining writers/readers/runtime/global/recovery remain open.']
 output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
