#!/usr/bin/env python3
"""Remaining lifecycle counterexamples after all15 candidates; local only."""
import argparse
import importlib.util
import json
from pathlib import Path
spec=importlib.util.spec_from_file_location('readbacks',Path(__file__).with_name('correction-audit-readback-replay.py'))
t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
c,r,lit,js,u=t.c,t.r,t.lit,t.js,t.u


def exercise(sql,ctx):
 check,call=ctx['check'],ctx['call'];animal=ctx['treated']['payload']['animalId']
 base=ctx['state_query']().rstrip(';')
 query="SELECT jsonb_build_object('base',("+base+"),'requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM clinical_step_confirmation.requests x),'audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM clinical_step_confirmation.audit x));"
 state=lambda:sql(query)
 witnesses=[]
 def probe(label,body,predicate,role='authenticated'):
  before=state();result=sql('BEGIN;SET LOCAL ROLE '+role+';SET LOCAL request.jwt.claim.sub='+lit(c.OWNER if role=='authenticated' else '')+';'+body+'RESET ROLE;SELECT '+predicate+';ROLLBACK;',False)
  if result.returncode:raise AssertionError('Invalid lifecycle fixture: '+label)
  check(result.stdout.strip()=='t' and state()==before,label+' reproduced only inside rolled-back local transaction')
  witnesses.append(label)
 original=json.loads(sql('SELECT to_jsonb(a) FROM hato_animales a WHERE id='+u(animal)+';'))
 p=dict(version=1,animalId=animal,nombre='Synthetic remaining lifecycle',fechaInicio='2026-10-14',nota=None,fechaProximoPaso='2026-10-14',descripcionPaso='Synthetic pending lifecycle step',observedAnimal=original)
 key=c.uid();args=[lit('prepare'),u(key),js(p),u(c.OWNER)];call('fn_hato_treatment_create_web',args);args[0]=lit('post');created=call('fn_hato_treatment_create_web',args);step=created['receipt']['after']['steps'][0]['id']
 alert=c.uid();sql('INSERT INTO hato_alertas(id,tipo,animal_id,regla_clave,fecha_programada,estado,paso_id) VALUES('+u(alert)+",'tratamiento_paso',"+u(animal)+','+lit('synthetic-lifecycle-'+alert)+",'2026-10-14','enviada',"+u(step)+');')
 proof_count=sql('SELECT count(*) FROM clinical_step_confirmation.audit;')
 probe('direct clinical alert phantom confirmation',"UPDATE hato_alertas SET estado='confirmada',respuesta='si',respondida_por='Synthetic forged attribution' WHERE id="+u(alert)+';',"(SELECT estado='confirmada' AND respondida_por='Synthetic forged attribution' FROM hato_alertas WHERE id="+u(alert)+') AND(SELECT fecha_ejecutada IS NULL FROM hato_tratamiento_pasos WHERE id='+u(step)+') AND(SELECT count(*)='+proof_count+' FROM clinical_step_confirmation.audit)')
 secado=c.uid();sql('INSERT INTO hato_alertas(id,tipo,animal_id,regla_clave,fecha_programada,estado) VALUES('+u(secado)+",'secado_due',"+u(animal)+','+lit('synthetic-secado-'+secado)+",'2026-10-14','enviada');")
 events=sql('SELECT count(*) FROM hato_eventos WHERE animal_id='+u(animal)+';')
 probe('split secado claim without domain event',"UPDATE hato_alertas SET estado='confirmada',respuesta='si',respondida_por='Synthetic stale label' WHERE id="+u(secado)+';',"(SELECT estado='confirmada' FROM hato_alertas WHERE id="+u(secado)+') AND(SELECT count(*)='+events+' FROM hato_eventos WHERE animal_id='+u(animal)+')')
 def event(id,kind='muerte',actor=c.OWNER):return 'INSERT INTO hato_eventos(id,animal_id,tipo,fecha,fecha_confianza,fuente,created_by) VALUES('+u(id)+','+u(animal)+','+lit(kind)+",'2026-10-14','exacta','web',"+u(actor)+');'
 death=c.uid();probe('split death event without animal status',event(death),"EXISTS(SELECT 1 FROM hato_eventos WHERE id="+u(death)+" AND tipo='muerte') AND(SELECT estado='activa' FROM hato_animales WHERE id="+u(animal)+')')
 first,second=c.uid(),c.uid();before_duplicate=state();duplicate=sql('BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(c.OWNER)+';'+event(first)+event(second)+'COMMIT;',False)
 check(duplicate.returncode!=0 and 'duplicate key' in duplicate.stderr.lower() and state()==before_duplicate,'captured manual-event unique index refuses exact duplicate retry with complete rollback')
 forged=c.uid();probe('human event INSERT accepts supplied actor',event(forged,actor=c.OTHER),'(SELECT created_by='+u(c.OTHER)+' FROM hato_eventos WHERE id='+u(forged)+')')
 audit_count=sql('SELECT count(*) FROM hato_correcciones;')
 probe('stale animal edit overwrites newer value with no CAS',"UPDATE hato_animales SET nombre='Synthetic winning newer edit' WHERE id="+u(animal)+";UPDATE hato_animales SET nombre='Synthetic stale editor replacement' WHERE id="+u(animal)+';',"(SELECT nombre='Synthetic stale editor replacement' FROM hato_animales WHERE id="+u(animal)+') AND(SELECT count(*)='+str(int(audit_count)+2)+' FROM hato_correcciones)')
 probe('NULL-UID service animal correction has no legacy audit',"UPDATE hato_animales SET nombre='Synthetic unaudited service edit' WHERE id="+u(animal)+';',"(SELECT nombre='Synthetic unaudited service edit' FROM hato_animales WHERE id="+u(animal)+') AND(SELECT count(*)='+audit_count+' FROM hato_correcciones)',role='service_role')
 before=state();result=sql('BEGIN;SET LOCAL ROLE service_role;DELETE FROM hato_animales WHERE id='+u(animal)+';COMMIT;',False)
 check(result.returncode!=0 and 'foreign key' in result.stderr.lower() and state()==before,'live treatment animal FK blocks parent deletion and preserves whole graph')
 roles="(VALUES('anon'),('authenticated'),('service_role'))g(role)"
 matrix=json.loads(sql("SELECT jsonb_agg(jsonb_build_object('table',c.relname,'role',g.role,'read',has_table_privilege(g.role,c.oid,'SELECT'),'insert',has_table_privilege(g.role,c.oid,'INSERT'),'update',has_table_privilege(g.role,c.oid,'UPDATE'),'delete',has_table_privilege(g.role,c.oid,'DELETE'),'column_update',has_any_column_privilege(g.role,c.oid,'UPDATE')) ORDER BY c.relname,g.role) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN "+roles+" WHERE n.nspname='public' AND c.relname IN('hato_animales','hato_eventos','hato_alertas','hato_correcciones','globalgap_correcciones','hato_tratamientos','hato_tratamiento_pasos');"))
 exercise.result=dict(remaining_rolled_back_lifecycle_witnesses=witnesses,selected_effective_role_matrix=matrix,parent_clinical_fk_preservation_verified=True)


def main():
 a=argparse.ArgumentParser(description=__doc__);a.add_argument('evidence_dir',type=Path)
 for name in ('runtime','client','output','private-diagnostics'):a.add_argument('--'+name,type=Path,required=True)
 args=a.parse_args();evidence=args.evidence_dir.resolve();output=args.output.resolve()
 if output.is_relative_to(evidence) or output.name.endswith('-private.json') or args.private_diagnostics.resolve().is_relative_to(evidence):raise ValueError('Cannot overwrite private evidence')
 files=[Path(__file__),t.SOURCE,t.s.SOURCE];source_bytes={p:p.read_bytes() for p in files}
 catalog,rls,hashes=r.load(evidence)
 with r.database(args.runtime.resolve(),args.client.resolve(),args.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=t.install)
 if any(p.read_bytes()!=v for p,v in source_bytes.items()):raise ValueError('Source changed during replay')
 result.update(exercise.result,source_hashes={str(p.relative_to(r.ROOT)):r.p.digest(v) for p,v in source_bytes.items()},temporary_database_stopped_and_removed=True)
 result['limits']=['All witnesses use synthetic rows and roll back; no production or hosted incident is inferred.','Sequential stale-editor reproduction, not a newly observed competing-lock race.','Diagnostic lifecycle unit; compatible actor-bound CAS/retry/atomic callers and reader/global/runtime review remain open.']
 output.write_text(json.dumps(result,indent=2)+'\n')

if __name__=='__main__':main()
