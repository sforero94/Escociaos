#!/usr/bin/env python3
"""Prepared clinical confirmation/audit proof on four-export local replay only."""
import argparse
import concurrent.futures
import importlib.util
import json
import os
from pathlib import Path
import time

spec=importlib.util.spec_from_file_location('clinical',Path(__file__).with_name('clinical-creation-retirement-replay.py'))
t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
c,r,lit,js,u=t.c,t.r,t.lit,t.js,t.u
SOURCE=r.ROOT/'src/sql/security-candidates/clinical-step-confirmation.sql'
QUERY=r.ROOT/'scripts/security/clinical-confirmation-baseline-query.sql'


def install(sql):
 sql('BEGIN;'+r.transaction_body(t.t.SOURCE.read_text())+r.transaction_body(t.SOURCE.read_text())+'COMMIT;')
 source=r.transaction_body(SOURCE.read_text());baseline=sql(t.t.CATALOG);checks=[]
 for label,drift in [
  ('clinical RLS drift','ALTER TABLE hato_tratamientos DISABLE ROW LEVEL SECURITY;'),
  ('alert column drift','ALTER TABLE hato_alertas ADD COLUMN synthetic_drift text;'),
  ('timestamp helper drift','ALTER FUNCTION public.update_updated_at_column() RESET ALL;'),
  ('trusted actor config drift','ALTER FUNCTION hato_treatment_creation.web_actor() SET work_mem=\'8MB\';')]:
  result=sql('BEGIN;'+drift+source+'COMMIT;',False)
  if result.returncode==0 or 'Unreviewed clinical' not in result.stderr or sql(t.t.CATALOG)!=baseline or sql("SELECT to_regnamespace('clinical_step_confirmation') IS NULL;")!='t':raise AssertionError(label)
  checks.append(label+' refuses with complete catalog rollback');print('PASS',checks[-1],flush=True)
 sql('BEGIN;'+source+'COMMIT;')
 install.result=dict(admission_checks=checks,admission_fingerprint=sql(QUERY.read_text()))


def exercise(sql,ctx):
 check,call=ctx['check'],ctx['call']
 base=ctx['state_query']().rstrip(';')
 state_query="SELECT jsonb_build_object('base',("+base+"),'requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM clinical_step_confirmation.requests x),'audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM clinical_step_confirmation.audit x));"
 def state():return sql(state_query)
 def web(action,key,intent=None,actor=c.OWNER,expected=None,ok=True,role='authenticated'):
  return call('fn_clinical_step_web',[lit(action),u(key),js(intent) if intent is not None else 'NULL::jsonb',u(expected or actor or c.OWNER)],actor=actor,role=role,ok=ok)
 def telegram(action,message,intent=None,sender=789,chat=789,ok=True):
  return call('fn_clinical_step_telegram',[lit(action),str(sender),str(chat),str(message),js(intent) if intent is not None else 'NULL::jsonb'],actor=None,role='service_role',ok=ok)
 def refusal(label,fn,marker=None):
  before=state();result=fn()
  passed=result.returncode!=0 and (marker is None or marker.lower() in result.stderr.lower()) and state()==before
  if not passed:
   fd=os.open('/tmp/escocia-clinical-unexpected-private.log',os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW,0o600);os.fchmod(fd,0o600)
   with os.fdopen(fd,'w') as out:out.write(result.stderr)
  check(passed,label+' refuses with full domain/request/audit rollback')
  if any(x in result.stderr.lower() for x in ('syntax error','ambiguous','is not assigned','does not exist','invalid input value for enum')):raise AssertionError('SQL defect in refusal: '+label)
 animal=ctx['treated']['payload']['animalId']
 def fixture(name):
  original=json.loads(sql('SELECT to_jsonb(a) FROM hato_animales a WHERE id='+u(animal)+';'))
  payload=dict(version=1,animalId=animal,nombre=name,fechaInicio='2026-10-14',nota=None,fechaProximoPaso='2026-10-14',descripcionPaso='Synthetic observed step',observedAnimal=original)
  key=c.uid();args=[lit('prepare'),u(key),js(payload),u(c.OWNER)];call('fn_hato_treatment_create_web',args);args[0]=lit('post');created=call('fn_hato_treatment_create_web',args)
  header=created['receipt']['after']['header']['id'];step=created['receipt']['after']['steps'][0]['id'];alert=c.uid()
  sql("INSERT INTO hato_alertas(id,tipo,animal_id,regla_clave,fecha_programada,estado,paso_id) VALUES("+u(alert)+",'tratamiento_paso',"+u(animal)+','+lit('synthetic-'+alert)+",'2026-10-14','enviada',"+u(step)+');')
  return header,step,alert,dict(version=1,stepId=step,fechaEjecutada='2026-10-14',alertId=alert)
 before=state();unknown=web('status',c.uid());check(unknown['state']=='unknown' and state()==before,'unknown web status is read-only without creating a replacement reservation')
 header,step,alert,intent=fixture('Synthetic prepared confirmation')
 for event,body,marker in [
  ('BEFORE INSERT','RETURN NULL;','reservation suppressed'),
  ('AFTER INSERT',"UPDATE public.hato_animales SET nombre='Synthetic reservation corruption' WHERE id="+u(animal)+';RETURN NULL;','preparation target mismatch')]:
  drift='CREATE FUNCTION public.synthetic_prepare_fault() RETURNS trigger LANGUAGE plpgsql AS $fault$ BEGIN '+body+' END $fault$;CREATE TRIGGER synthetic_prepare_fault '+event+' ON clinical_step_confirmation.requests FOR EACH ROW EXECUTE FUNCTION public.synthetic_prepare_fault();'
  refusal('prepared request '+event+' fault',lambda drift=drift:sql('BEGIN;'+drift+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(c.OWNER)+";SELECT public.fn_clinical_step_web('prepare',"+u(c.uid())+','+js(intent)+','+u(c.OWNER)+');COMMIT;',False),marker)
 key=c.uid();prepared=web('prepare',key,intent)
 check(prepared['state']=='pending' and prepared['original']['header']['id']==header and prepared['original']['steps'][0]['id']==step and prepared['original']['alerts'][0]['id']==alert,'prepare captures complete animal/header/steps/alert originals before confirmation')
 before=state();check(web('prepare',key,intent)==prepared and state()==before,'same-key prepare never refreshes the reviewed original')
 refusal('changed original intent',lambda:web('prepare',key,{**intent,'fechaEjecutada':'2026-10-13'},ok=False),'Changed original')
 refusal('owner switch before status',lambda:web('status',key,actor=c.OTHER,expected=c.OWNER,ok=False),'owner changed')
 refusal('post cannot replace prepared intent',lambda:web('post',key,intent,ok=False),'cannot replace')
 def raw_post(drift,key=key):
  return sql('BEGIN;'+drift+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(c.OWNER)+";SELECT public.fn_clinical_step_web('post',"+u(key)+',NULL::jsonb,'+u(c.OWNER)+');COMMIT;',False)
 for label,drift in [
  ('changed animal original','UPDATE hato_animales SET nombre=\'Synthetic changed original\' WHERE id='+u(animal)+';'),
  ('changed header original','UPDATE hato_tratamientos SET nota=\'Synthetic changed original\' WHERE id='+u(header)+';'),
  ('changed step original','UPDATE hato_tratamiento_pasos SET descripcion=\'Synthetic changed original\' WHERE id='+u(step)+';'),
  ('changed alert original','UPDATE hato_alertas SET intentos=intentos+1 WHERE id='+u(alert)+';'),
  ('late child step','INSERT INTO hato_tratamiento_pasos(tratamiento_id,paso_num,fecha_programada) VALUES('+u(header)+",2,'2026-10-15');")]:
  refusal(label,lambda drift=drift:raw_post(drift),'Original clinical graph changed')
 for table,event,body,marker in [
  ('public.hato_tratamiento_pasos','BEFORE UPDATE','RETURN NULL;','step suppressed'),
  ('public.hato_tratamientos','BEFORE UPDATE','RETURN NULL;','header suppressed'),
  ('public.hato_alertas','BEFORE UPDATE','RETURN NULL;','alert suppressed'),
  ('clinical_step_confirmation.audit','BEFORE INSERT','RETURN NULL;','audit suppressed'),
  ('clinical_step_confirmation.requests','BEFORE UPDATE',"IF NEW.state='committed' THEN RETURN NULL;END IF;RETURN NEW;",'committed request suppressed'),
  ('public.hato_tratamiento_pasos','AFTER UPDATE',"IF pg_trigger_depth()=1 THEN UPDATE public.hato_tratamiento_pasos SET fecha_ejecutada=fecha_ejecutada+1 WHERE id=NEW.id;END IF;RETURN NULL;",'final domain mismatch'),
  ('clinical_step_confirmation.audit','AFTER INSERT',"UPDATE public.hato_animales SET nombre='Synthetic audit corruption' WHERE id="+u(animal)+';RETURN NULL;','final target graph mismatch')]:
  drift='CREATE FUNCTION public.synthetic_clinical_fault() RETURNS trigger LANGUAGE plpgsql AS $fault$ BEGIN '+body+' END $fault$;CREATE TRIGGER synthetic_clinical_fault '+event+' ON '+table+' FOR EACH ROW EXECUTE FUNCTION public.synthetic_clinical_fault();'
  refusal(table+' '+event+' fault',lambda drift=drift:raw_post(drift),marker)
 with concurrent.futures.ThreadPoolExecutor(2) as pool:
  first=pool.submit(web,'post',key);second=pool.submit(web,'post',key);committed=first.result();other=second.result()
 check(committed==other and sql('SELECT count(*) FROM clinical_step_confirmation.audit WHERE request_key='+u(key)+';')=='1','concurrent same-key posts commit one exact clinical audit/receipt')
 check(committed['state']=='committed' and committed['receipt']['before']==prepared['original'] and committed['receipt']['after']['header']['estado']=='completado' and committed['receipt']['after']['steps'][0]['fecha_ejecutada']=='2026-10-14' and committed['receipt']['after']['alerts'][0]['respondida_por']=='owner@synthetic.invalid','post commits exact step/header/alert state with trusted actor and immutable before/after receipt')
 check(sql('SELECT count(*) FROM clinical_step_confirmation.audit WHERE request_key='+u(key)+' AND actor='+js(committed['actor'])+' AND receipt='+js(committed['receipt'])+';')=='1','independent durable audit readback matches original receipt exactly')
 before=state();check(web('post',key)==committed and web('status',key)==committed and web('resolve',key)==committed and state()==before,'post/status/cancel after lost response recover original committed receipt with no new writes')
 refusal('immutable committed audit',lambda:sql('UPDATE clinical_step_confirmation.audit SET intent=\'{}\' WHERE request_key='+u(key)+';',False),'Immutable')
 refusal('immutable committed request',lambda:sql("UPDATE clinical_step_confirmation.requests SET state='canceled',receipt=NULL WHERE request_key="+u(key)+';',False),'Immutable')
 pending_cancel=c.uid();web('prepare',pending_cancel,fixture('Synthetic cancel proof')[3])
 for event,body,marker in [
  ('BEFORE UPDATE',"IF NEW.state='canceled' THEN RETURN NULL;END IF;RETURN NEW;",'cancellation suppressed'),
  ('AFTER UPDATE',"UPDATE public.hato_tratamientos SET nota='Synthetic cancellation corruption' WHERE id="+u(header)+';RETURN NULL;','control changed domain')]:
  drift='CREATE FUNCTION public.synthetic_cancel_fault() RETURNS trigger LANGUAGE plpgsql AS $fault$ BEGIN '+body+' END $fault$;CREATE TRIGGER synthetic_cancel_fault '+event+' ON clinical_step_confirmation.requests FOR EACH ROW EXECUTE FUNCTION public.synthetic_cancel_fault();'
  refusal('cancellation '+event+' fault',lambda drift=drift:sql('BEGIN;'+drift+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(c.OWNER)+";SELECT public.fn_clinical_step_web('resolve',"+u(pending_cancel)+',NULL::jsonb,'+u(c.OWNER)+');COMMIT;',False),marker)
 check(web('resolve',pending_cancel)['state']=='canceled','prepared cancellation remains durable after rollback probes')
 canceled=c.uid();resolved=web('resolve',canceled);before=state()
 check(resolved['state']=='canceled' and web('prepare',canceled,intent)['state']=='canceled' and state()==before,'cancel-before-prepare durably fences lost web preparation without rebinding intent')
 refusal('canceled web post',lambda:web('post',canceled,ok=False),'Canceled')
 sql('UPDATE usuarios SET activo=false WHERE id='+u(c.OWNER)+';')
 refusal('revoked owner committed status',lambda:web('status',key,ok=False),'Active')
 sql('UPDATE usuarios SET activo=true WHERE id='+u(c.OWNER)+';UPDATE usuarios SET activo=true WHERE id='+u(c.OTHER)+';')
 header2,step2,alert2,intent2=fixture('Synthetic native private confirmation')
 tg=telegram('prepare',91,intent2);posted=telegram('post',91)
 check(tg['state']=='pending' and posted['state']=='committed' and posted['actor']['profileId']==c.OTHER and posted['actor']['origin']=='telegram','native private confirmation derives current linked actor and commits exact clinical action')
 before=state();check(telegram('status',91)==posted and telegram('post',91)==posted and state()==before,'native action-only recovery needs no browser payload or client-generated replacement key')
 refusal('forwarded group confirmation',lambda:telegram('status',91,chat=-789,ok=False),'private')
 sql('UPDATE telegram_usuarios SET usuario_id='+u(c.OWNER)+' WHERE telegram_id=789;')
 refusal('relinked committed receipt disclosure',lambda:telegram('status',91,ok=False),'Changed original')
 sql('UPDATE telegram_usuarios SET usuario_id='+u(c.OTHER)+' WHERE telegram_id=789;UPDATE usuarios SET activo=false WHERE id='+u(c.OTHER)+';')
 refusal('revoked linked committed receipt disclosure',lambda:telegram('status',91,ok=False),'Active')
 sql('UPDATE usuarios SET activo=true WHERE id='+u(c.OTHER)+';')
 canceled_tg=telegram('resolve',92);before=state()
 check(canceled_tg['state']=='canceled' and telegram('prepare',92,intent2)['state']=='canceled' and state()==before,'native cancellation-before-prepare fences original private action')
 header3,step3,alert3,intent3=fixture('Synthetic unlinked worker confirmation')
 sql('UPDATE telegram_usuarios SET usuario_id=NULL WHERE telegram_id=789;')
 worker=telegram('prepare',93,intent3);worker_post=telegram('post',93)
 check(worker_post['state']=='committed' and worker['actor']['profileId'] is None and worker_post['actor']['registrationId']==worker['actor']['registrationId'],'saved active unlinked Hato worker lane retains registration identity without invented human linkage')
 sql('UPDATE telegram_usuarios SET usuario_id='+u(c.OTHER)+' WHERE telegram_id=789;')
 # Ordinary readers cannot access protected requests/audit/helpers directly.
 denied=sql("SELECT NOT EXISTS(SELECT 1 FROM pg_class c CROSS JOIN(VALUES('anon'),('authenticated'),('service_role'))g(role) WHERE c.relnamespace='clinical_step_confirmation'::regnamespace AND c.relkind='r' AND (has_table_privilege(g.role,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege(g.role,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')));")
 helpers=sql("SELECT NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN(VALUES('anon'),('authenticated'),('service_role'))g(role) WHERE p.pronamespace='clinical_step_confirmation'::regnamespace AND has_function_privilege(g.role,p.oid,'EXECUTE'));")
 check(denied=='t' and helpers=='t','protected confirmation tables/columns/helpers deny all direct ordinary and service privileges')
 observed=[]
 def function(name,args):return 'DO $call$ BEGIN PERFORM public.'+name+'('+','.join(args)+');END $call$;'
 service="SET LOCAL ROLE service_role;SET LOCAL request.jwt.claim.sub='';"
 human='SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(c.OWNER)+';'
 def race(label,winner,contender,marker):
  tag='clinical_race_'+c.uid().replace('-','')
  def wait(suffix,condition):
   end=time.monotonic()+8
   while time.monotonic()<end:
    if sql('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='+lit(tag+suffix)+' AND '+condition+');')=='t':return
    time.sleep(.02)
   raise AssertionError('Required observed barrier missing: '+label)
  with concurrent.futures.ThreadPoolExecutor(2) as pool:
   won=pool.submit(sql,'BEGIN;SET LOCAL application_name='+lit(tag+'_winner')+';'+winner+'RESET ROLE;'+state_query+'SELECT pg_sleep(4);COMMIT;')
   wait('_winner',"wait_event='PgSleep'")
   lost=pool.submit(sql,'BEGIN;SET LOCAL application_name='+lit(tag+'_contender')+';'+contender+'COMMIT;',False)
   wait('_contender',"wait_event_type='Lock'")
   winner_state=won.result();failure=lost.result()
  if failure.returncode==0 or marker.lower() not in failure.stderr.lower():
   fd=os.open('/tmp/escocia-clinical-race-unexpected-private.log',os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW,0o600);os.fchmod(fd,0o600)
   with os.fdopen(fd,'w') as out:out.write(failure.stderr)
  check(failure.returncode!=0 and marker.lower() in failure.stderr.lower(),label+' refuses after observed lock wait')
  check(state()==winner_state,label+' preserves exact winning domain/request/audit state')
  observed.append(label)
 h,s,a,i=fixture('Synthetic competing177 original');k=c.uid();web('prepare',k,i)
 race('invoker177 versus prepared confirmation',service+function('fn_hato_confirmar_paso_tratamiento',[u(animal),u(s),"'2026-10-14'::date",lit('Synthetic legacy writer')]),human+function('fn_clinical_step_web',[lit('post'),u(k),'NULL::jsonb',u(c.OWNER)]),'Original clinical graph changed')
 def undo_fixture(message):
  animal_row=json.loads(sql('SELECT to_jsonb(a) FROM hato_animales a WHERE id='+u(animal)+';'))
  p=dict(version=1,animalId=animal,nombre='Synthetic confirmation undo race',fechaInicio='2026-10-14',nota=None,fechaProximoPaso='2026-10-14',descripcionPaso='Synthetic raced step',observedAnimal=animal_row)
  args=[lit('prepare'),'789','789',str(message),js(p),'NULL::uuid'];reserved=call('fn_hato_treatment_create_telegram',args,actor=None,role='service_role');args[0]=lit('post');args[5]=u(reserved['requestKey']);created=call('fn_hato_treatment_create_telegram',args,actor=None,role='service_role')
  h=created['receipt']['after']['header']['id'];s=created['receipt']['after']['steps'][0]['id'];intent=dict(version=1,stepId=s,fechaEjecutada='2026-10-14',alertId=None)
  telegram('prepare',message,intent)
  review=call('fn_hato_undo_review_begin',['789',lit('treatment'),u(h)],actor=None,role='service_role')
  delivery=['789',lit('treatment'),u(review['key']),'789',str(message+100)]
  call('fn_hato_undo_review_deliver',delivery+['true'],actor=None,role='service_role')
  return delivery+[lit('confirm')]
 undo=undo_fixture(201)
 race('clinical confirmation versus delivered undo review',service+function('fn_clinical_step_telegram',[lit('post'),'789','789','201','NULL::jsonb']),service+function('fn_hato_undo_review_action',undo),'Standalone active Telegram treatment required')
 undo=undo_fixture(202)
 race('confirmed undo versus pending clinical confirmation',service+function('fn_hato_undo_review_action',undo),service+function('fn_clinical_step_telegram',[lit('post'),'789','789','202','NULL::jsonb']),'Clinical step missing')
 exercise.result=dict(observed_lock_races=observed,prepared_snapshot_and_atomic_audit_passed=True,suppression_corruption_faults=7,native_private_recovery_passed=True,unlinked_worker_lane_preserved=True)


def main():
 a=argparse.ArgumentParser(description=__doc__);a.add_argument('evidence_dir',type=Path)
 for name in ('runtime','client','output','private-diagnostics'):a.add_argument('--'+name,type=Path,required=True)
 args=a.parse_args();evidence=args.evidence_dir.resolve();output=args.output.resolve()
 if output.is_relative_to(evidence) or output.name.endswith('-private.json') or args.private_diagnostics.resolve().is_relative_to(evidence):raise ValueError('Cannot overwrite private evidence')
 tracked_inputs=(SOURCE,QUERY,Path(__file__))
 source_bytes={p:p.read_bytes() for p in tracked_inputs}
 catalog,rls,hashes=r.load(evidence)
 with r.database(args.runtime.resolve(),args.client.resolve(),args.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(p.read_bytes()!=b for p,b in source_bytes.items()):raise ValueError('Source changed during replay; fresh run required')
 result.update(install.result,**exercise.result,confirmation_candidate_sha256=r.p.digest(SOURCE.read_bytes()),admission_query_sha256=r.p.digest(QUERY.read_bytes()),extension_sha256=r.p.digest(Path(__file__).read_bytes()),temporary_database_stopped_and_removed=True)
 result['assertions']+=len(install.result['admission_checks']);result['limits']=['Local prepared SQL foundation and synthetic Auth/data only; actual browser/bot/conversation callers are not integrated.','Direct UPDATE/old177 remain unchanged pending compatible caller cutover; no full clinical/global/hosted certificate.']
 output.write_text(json.dumps(result,indent=2)+'\n')

if __name__=='__main__':main()
