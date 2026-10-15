#!/usr/bin/env python3
"""Prepared atomic alert/secado response on four-export local replay only."""
import argparse
import concurrent.futures
import importlib.util
import json
import os
from pathlib import Path
spec=importlib.util.spec_from_file_location('clinical_alert',Path(__file__).with_name('clinical-alert-replay.py'))
a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
c,r,lit,js,u=a.c,a.r,a.lit,a.js,a.u
SOURCE=r.ROOT/'src/sql/security-candidates/alert-response.sql'
QUERY=Path(__file__).with_name('alert-response-baseline-query.sql')


def install(sql):
 a.install(sql);before=sql(a.t.t.CATALOG);checks=[]
 for label,drift in [('alert schema drift','ALTER TABLE hato_alertas ADD COLUMN synthetic_drift text;'),('event trigger drift','ALTER TABLE hato_eventos DISABLE TRIGGER USER;'),('actor config drift',"ALTER FUNCTION hato_treatment_creation.telegram_actor(bigint,bigint,bigint) SET work_mem='8MB';")]:
  result=sql('BEGIN;'+drift+r.transaction_body(SOURCE.read_text())+'COMMIT;',False)
  if result.returncode==0 or 'Unreviewed' not in result.stderr or sql(a.t.t.CATALOG)!=before:raise AssertionError(label)
  checks.append(label+' refuses with catalog rollback')
 sql(SOURCE.read_text());install.result=dict(admission_checks=checks)


def exercise(sql,ctx):
 check,call=ctx['check'],ctx['call'];base=ctx['state_query']().rstrip(';')
 query="SELECT jsonb_build_object('base',("+base+"),'clinical_requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM clinical_step_confirmation.requests x),'clinical_audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM clinical_step_confirmation.audit x),'requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM alert_response.requests x),'audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM alert_response.audit x));"
 state=lambda:sql(query)
 def web(mode,key,intent=None,actor=c.OWNER,expected=None,ok=True):return call('fn_alert_response_web',[lit(mode),u(key),js(intent) if intent is not None else 'NULL::jsonb',u(expected or actor or c.OWNER)],actor=actor,ok=ok)
 def native(mode,message,intent=None,sender=789,chat=789,ok=True):return call('fn_alert_response_telegram',[lit(mode),str(sender),str(chat),str(message),js(intent) if intent is not None else 'NULL::jsonb'],actor=None,role='service_role',ok=ok)
 def refusal(label,fn,marker):
  before=state();result=fn();passed=result.returncode!=0 and marker.lower() in result.stderr.lower() and state()==before
  if not passed:
   fd=os.open('/tmp/escocia-alert-response-unexpected-private.log',os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW,0o600);os.fchmod(fd,0o600)
   with os.fdopen(fd,'w') as out:out.write(result.stderr)
  check(passed,label+' refuses with full domain/control/audit rollback')
 def fixture(kind='secado_due',answer='si'):
  animal,alert=c.uid(),c.uid();sql('INSERT INTO hato_animales(id,nombre,etapa,estado) VALUES('+u(animal)+",'Synthetic response animal','vaca','activa');INSERT INTO hato_alertas(id,tipo,animal_id,regla_clave,fecha_programada,estado) VALUES("+u(alert)+','+lit(kind)+','+u(animal)+','+lit('synthetic-response-'+alert)+",'2026-10-14','enviada');")
  return animal,alert,dict(version=1,alertId=alert,fecha='2026-10-14',respuesta=answer)
 animal,alert,intent=fixture();key=c.uid();before=state();unknown=web('status',key)
 check(unknown['state']=='unknown' and state()==before,'unknown web status is read-only')
 prepared=web('prepare',key,intent);before=state();check(web('prepare',key,intent)==prepared and state()==before,'same-key prepare preserves original source and never posts')
 refusal('owner switch before lookup',lambda:web('status',key,actor=c.OTHER,expected=c.OWNER,ok=False),'owner changed')
 refusal('prepare cannot change intent',lambda:web('prepare',key,{**intent,'respuesta':'no'},ok=False),'Changed original')
 refusal('post cannot replace intent',lambda:web('post',key,intent,ok=False),'cannot replace')
 def raw(drift,key=key,mode='post'):return sql('BEGIN;'+drift+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(c.OWNER)+";SELECT public.fn_alert_response_web("+lit(mode)+','+u(key)+',NULL::jsonb,'+u(c.OWNER)+');COMMIT;',False)
 for label,drift in [('stale alert',"UPDATE hato_alertas SET intentos=intentos+1 WHERE id="+u(alert)+';'),('changed animal',"UPDATE hato_animales SET nombre='Synthetic changed source' WHERE id="+u(animal)+';')]:refusal(label,lambda drift=drift:raw(drift),'graph changed')
 faults=[
 ('hato_eventos','BEFORE INSERT','RETURN NULL;','Secado event suppressed'),
 ('hato_eventos','BEFORE INSERT','NEW.created_by=NULL;RETURN NEW;','Secado event suppressed'),
 ('hato_eventos','AFTER INSERT',"UPDATE public.hato_animales SET nombre='Synthetic event side effect' WHERE id=NEW.animal_id;RETURN NULL;",'final domain mismatch'),
 ('hato_alertas','BEFORE UPDATE','RETURN NULL;','Alert response suppressed'),
 ('alert_response.audit','BEFORE INSERT','RETURN NULL;','audit suppressed'),
 ('alert_response.requests','BEFORE UPDATE',"IF NEW.state='committed' THEN RETURN NULL;END IF;RETURN NEW;",'committed request suppressed'),
 ('alert_response.audit','AFTER INSERT',"UPDATE public.hato_alertas SET respondida_por='Synthetic audit side effect' WHERE id="+u(alert)+';RETURN NULL;','final audit/domain mismatch')]
 for table,event,body,marker in faults:
  drift='CREATE FUNCTION public.synthetic_response_fault() RETURNS trigger LANGUAGE plpgsql AS $fault$ BEGIN '+body+' END $fault$;CREATE TRIGGER synthetic_response_fault '+event+' ON '+table+' FOR EACH ROW EXECUTE FUNCTION public.synthetic_response_fault();'
  refusal(table+' '+event+' fault',lambda drift=drift:raw(drift),marker)
 with concurrent.futures.ThreadPoolExecutor(2) as pool:
  x=pool.submit(web,'post',key);y=pool.submit(web,'post',key);posted=x.result();other=y.result()
 check(posted==other and posted['state']=='committed' and posted['receipt']['before']==prepared['original'],'concurrent same-key posts produce one exact atomic response receipt')
 events=posted['receipt']['after']['events'];check(len(events)==1 and events[0]['tipo']=='secado_real' and events[0]['alerta_id']==alert and events[0]['created_by']==c.OWNER and posted['receipt']['after']['alert']['respondida_por']=='owner@synthetic.invalid','secado event and response use trusted profile/link/date/label in same commit')
 check(sql('SELECT count(*) FROM alert_response.audit WHERE request_key='+u(key)+' AND receipt='+js(posted['receipt'])+';')=='1','independent durable audit equals receipt')
 before=state();check(web('post',key)==posted and web('status',key)==posted and web('resolve',key)==posted and state()==before,'lost response recovers immutable original receipt without repeated event')
 for table in ('audit','requests'):refusal('immutable '+table,lambda table=table:sql('DELETE FROM alert_response.'+table+' WHERE request_key='+u(key)+';',False),'Immutable')
 # A competing legacy secado is not adopted as prospective protocol provenance.
 _,existing,intent2=fixture();k2=c.uid();web('prepare',k2,intent2)
 drift='INSERT INTO hato_eventos(animal_id,tipo,fecha,fuente) SELECT animal_id,\'secado_real\',\'2026-10-14\',\'web\' FROM hato_alertas WHERE id='+u(existing)+';'
 refusal('late existing event',lambda:raw(drift,k2),'graph changed')
 for kind,answer in [('secado_due','no'),('parto_proximo','otro'),('rechequeo_due','si')]:
  _,id,p=fixture(kind,answer);k=c.uid();web('prepare',k,p);result=web('post',k)
  check(result['state']=='committed' and not result['receipt']['after']['events'] and result['receipt']['after']['alert']['respuesta']==answer,kind+' '+answer+' responds without an unrelated domain event')
 canceled=c.uid();result=web('resolve',canceled);before=state();check(result['state']=='canceled' and web('prepare',canceled,intent)['state']=='canceled' and state()==before,'cancel-before-prepare fences original web key without binding replacement intent')
 refusal('canceled post',lambda:web('post',canceled,ok=False),'Canceled')
 sql('UPDATE usuarios SET activo=false WHERE id='+u(c.OWNER)+';');refusal('revoked owner receipt',lambda:web('status',key,ok=False),'Active');sql('UPDATE usuarios SET activo=true WHERE id='+u(c.OWNER)+';')
 sql('UPDATE telegram_usuarios SET activo=true,usuario_id=NULL WHERE telegram_id=789;')
 _,_,p=fixture();reserved=native('prepare',301,p);committed=native('post',301);before=state()
 check(reserved['actor']['profileId'] is None and committed['state']=='committed' and native('status',301)==committed and state()==before,'allowed unlinked worker commits and independently recovers original private action without invented profile')
 refusal('forwarded native chat',lambda:native('status',301,chat=-789,ok=False),'private')
 sql('UPDATE telegram_usuarios SET usuario_id='+u(c.OWNER)+' WHERE telegram_id=789;');refusal('relinked native receipt',lambda:native('status',301,ok=False),'Changed original');sql('UPDATE telegram_usuarios SET usuario_id=NULL WHERE telegram_id=789;')
 canceled=native('resolve',302);before=state();check(canceled['state']=='canceled' and native('prepare',302,p)['state']=='canceled' and state()==before,'native cancellation before lost preparation durably fences original message')
 sql('UPDATE telegram_usuarios SET activo=false WHERE telegram_id=789;');refusal('revoked native receipt',lambda:native('status',301,ok=False),'Active')
 for role in ('anon','authenticated','service_role'):
  refusal(role+' protected attempt access',lambda role=role:sql('BEGIN;SET LOCAL ROLE '+role+';SELECT * FROM alert_response.requests;COMMIT;',False),'permission denied')
 exercise.result=dict(suppression_corruption_faults=len(faults),atomic_secado_response_and_trusted_audit_verified=True,independent_native_private_recovery_verified=True,actual_callers_not_integrated=True)


def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('evidence_dir',type=Path)
 for name in ('runtime','client','output','private-diagnostics'):p.add_argument('--'+name,type=Path,required=True)
 args=p.parse_args();evidence=args.evidence_dir.resolve();output=args.output.resolve()
 if output.is_relative_to(evidence) or output.name.endswith('-private.json') or args.private_diagnostics.resolve().is_relative_to(evidence):raise ValueError('Cannot overwrite private evidence')
 files=[SOURCE,QUERY,Path(__file__)];source_bytes={p:p.read_bytes() for p in files}
 catalog,rls,hashes=r.load(evidence)
 with r.database(args.runtime.resolve(),args.client.resolve(),args.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(p.read_bytes()!=v for p,v in source_bytes.items()):raise ValueError('Source changed during replay')
 result.update(install.result,**exercise.result,source_hashes={str(p.relative_to(r.ROOT)):r.p.digest(v) for p,v in source_bytes.items()},temporary_database_stopped_and_removed=True)
 result['assertions']+=len(install.result['admission_checks']);result['limits']=['Prepared SQL foundation and synthetic Auth/data only; actual browser/bot alert callers are not integrated.','Manual/edit/bulk/cron writers, direct grants, other event/animal lifecycle, readers and global/hosted/recovery remain open.']
 output.write_text(json.dumps(result,indent=2)+'\n')

if __name__=='__main__':main()
