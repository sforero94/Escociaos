#!/usr/bin/env python3
"""Protected operator recovery/monitoring on local four-export graph only."""
import argparse
import concurrent.futures
import importlib.util
import json
import os
import subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('callers',Path(__file__).with_name('alert-cron-callers-replay.py'))
t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
c,r,lit,js,u=t.c,t.r,t.lit,t.js,t.u
SOURCE=r.ROOT/'src/sql/security-candidates/alert-cron-operations.sql'
def install(sql):
 t.install(sql)
 before=sql(Path(__file__).with_name('alert-cron-operations-baseline-query.sql').read_text())
 for drift in ("GRANT USAGE ON SCHEMA alert_cron TO authenticated;","ALTER FUNCTION alert_cron.post(uuid,jsonb) SET search_path=public;"):
  failed=sql('BEGIN;'+drift+SOURCE.read_text(),False)
  if failed.returncode==0 or 'Unreviewed original cron operations graph' not in failed.stderr or sql(Path(__file__).with_name('alert-cron-operations-baseline-query.sql').read_text())!=before or sql("SELECT to_regclass('alert_cron.operator_requests') IS NULL;")!='t':raise ValueError('Operator admission/catalog rollback failed')
 sql(SOURCE.read_text())
def exercise(sql,ctx):
 check,call=ctx['check'],ctx['call'];base=ctx['state_query']().rstrip(';')
 names=('runs','deliveries','audit','delivery_evidence','operator_requests','operator_audit','replacement_links','run_metrics')
 query="SELECT jsonb_build_object('base',("+base+")"+''.join(","+lit('cron.'+n)+",(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]') FROM alert_cron."+n+' x)' for n in names)+');'
 state=lambda:sql(query)
 def ops(mode,key,intent=None,owner=c.OWNER,expected=None,ok=True):return call('fn_alert_cron_operator',[lit(mode),u(key),js(intent) if intent is not None else 'NULL::jsonb',u(expected or owner)],actor=owner,ok=ok)
 def monitor(owner=c.OWNER,run=None,before=None,ok=True):return call('fn_alert_cron_monitor',[u(owner),js(before) if before is not None else 'NULL::jsonb',u(run) if run else 'NULL::uuid'],actor=owner,ok=ok)
 def service(mode,key=None,payload=None,ok=True):return call('fn_alert_cron_service',[lit(mode),u(key) if key else 'NULL::uuid',js(payload) if payload is not None else 'NULL::jsonb'],actor=None,role='service_role',ok=ok)
 def refuse(label,fn,marker):
  before=state();failure=fn()
  if not(failure.returncode!=0 and marker.lower() in failure.stderr.lower() and state()==before):
   fd=os.open('/tmp/escocia-cron-ops-unexpected-private.log',os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW,0o600)
   with os.fdopen(fd,'w') as out:out.write(failure.stderr)
   raise AssertionError(label+' refusal/rollback failed; private diagnostics saved')
  check(True,label+' refuses with full source/control/audit rollback')
 refuse('non-Gerencia monitor',lambda:monitor(ok=False),'Gerencia')
 sql("UPDATE usuarios SET rol='Gerencia' WHERE id="+u(c.OWNER)+';')
 config=dict(razas=['jersey'],meses_secado_por_raza={'_default':2},meses_gestacion_default=9,umbral_partos_reemplazo=9,ventana_proxima_secar_dias=30,ventana_proximo_parir_dias=30,dias_parto_proximo_alerta=14,dias_servicio_sin_confirmacion=45,dias_espera_voluntaria_post_parto=60,dias_rechequeo_due=60)
 for key,value in config.items():sql('INSERT INTO hato_config(clave,valor) VALUES('+lit(key)+','+js(value)+') ON CONFLICT(clave) DO UPDATE SET valor=EXCLUDED.valor;')
 run=service('prepare');sql("UPDATE hato_config SET valor='10' WHERE clave='meses_gestacion_default';")
 snapshot=monitor(run=run['id']);observed=snapshot['runs'][0]
 check(observed['sourceChanged'] and not snapshot['deliveries'],'monitor shows stale source without exposing a reserved domain source or body')
 key=c.uid();intent=dict(kind='replan_run',targetId=run['id'],observed=observed,reason='Synthetic reviewed stale job');prepared=ops('prepare',key,intent)
 before=state();check(ops('prepare',key,intent)==prepared and state()==before,'original operator prepare preserves key/source without canceling or allocating a replacement')
 refuse('owner switch',lambda:ops('status',key,owner=c.OTHER,expected=c.OWNER,ok=False),'owner')
 def raw(ddl):return sql('BEGIN;'+ddl+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(c.OWNER)+';SELECT public.fn_alert_cron_operator('+lit('post')+','+u(key)+',NULL::jsonb,'+u(c.OWNER)+');COMMIT;',False)
 refuse('source changed after review',lambda:raw("UPDATE hato_config SET valor='11' WHERE clave='meses_gestacion_default';"),'stale source/review')
 for table,event,body,marker in [('alert_cron.runs','BEFORE UPDATE','RETURN NULL;','cancellation suppressed'),('alert_cron.replacement_links','BEFORE INSERT','RETURN NULL;','link suppressed'),('alert_cron.operator_audit','BEFORE INSERT','RETURN NULL;','audit suppressed'),('alert_cron.operator_requests','BEFORE UPDATE',"IF NEW.state='committed' THEN RETURN NULL;END IF;RETURN NEW;",'committed control suppressed')]:
  ddl='CREATE FUNCTION public.synthetic_operator_fault() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN '+body+' END $f$;CREATE TRIGGER synthetic_operator_fault '+event+' ON '+table+' FOR EACH ROW EXECUTE FUNCTION public.synthetic_operator_fault();'
  refuse(table+' suppression',lambda ddl=ddl:raw(ddl),marker)
 with concurrent.futures.ThreadPoolExecutor(2) as pool:
  x=pool.submit(ops,'post',key);y=pool.submit(ops,'post',key);posted=x.result();other=y.result()
 check(posted==other and posted['state']=='committed','concurrent original operator post cancels once and creates one linked replacement')
 replacement=posted['receipt']['replacement'];before=state();check(ops('post',key)==posted and ops('status',key)==posted and state()==before,'lost replan result recovers original immutable receipt without another reservation')
 execution=ops('execute',key);check(execution['run']['id']==replacement['id'] and execution['run']['state']=='prepared','original committed replan alone exposes its original prepared job for trusted execution')
 check(sql('SELECT count(*) FROM alert_cron.replacement_links WHERE original_id='+u(run['id'])+';')=='1','independent native replacement link is unique')
 cancellation=c.uid();fence=ops('cancel',cancellation);before=state();check(fence['state']=='canceled' and ops('prepare',cancellation,intent)==fence and state()==before,'operator cancel before preparation durably fences the original key')
 sql('UPDATE usuarios SET activo=false WHERE id='+u(c.OWNER)+';');refuse('revoked operator read',lambda:monitor(ok=False),'Gerencia');refuse('revoked execution',lambda:ops('execute',key,ok=False),'Gerencia');sql('UPDATE usuarios SET activo=true WHERE id='+u(c.OWNER)+';')
 # Native SQL setup for held/queued delivery controls.
 sql("UPDATE telegram_usuarios SET activo=true,usuario_id=NULL WHERE telegram_id=789;INSERT INTO hato_alertas_config(tipo,horas_escalamiento,activo) VALUES('secado_due',48,true) ON CONFLICT(tipo) DO UPDATE SET activo=true;INSERT INTO alertas_catalogo(clave,modulo,nombre,descripcion) VALUES('hato.secado_due','hato','Synthetic operations','Fixture') ON CONFLICT(clave) DO NOTHING;")
 registration=sql('SELECT id FROM telegram_usuarios WHERE telegram_id=789;')
 sql('INSERT INTO telegram_alertas_suscripciones(telegram_usuario_id,alerta_clave,recibe,escalamiento) VALUES('+u(registration)+",'hato.secado_due',true,true) ON CONFLICT(telegram_usuario_id,alerta_clave) DO UPDATE SET recibe=true,escalamiento=true;")
 def manual():return call('fn_alert_cron_web',[lit('prepare'),u(c.uid()),u(c.OWNER)],actor=c.OWNER)
 def allocate(rule):
  job=manual();plan=dict(generate=[dict(tipo='secado_due',animal_id=ctx['treated']['payload']['animalId'],paso_id=None,regla_clave=rule,fecha_programada=sql("SELECT to_char(now() AT TIME ZONE 'America/Bogota','YYYY-MM-DD');"),datos={'mensaje':'Synthetic held original'})],updates=[],deliveries=[dict(reglaClave=rule,registrationId=registration,phase='delivery',text='Synthetic held original')]);return job,service('post',job['id'],plan)['deliveries'][0]
 job,delivery=allocate('synthetic-operator-queued');observed=monitor(run=job['id'])['deliveries'][0];qk=c.uid();qi=dict(kind='cancel_delivery',targetId=delivery['id'],observed=observed,reason='Synthetic queued containment');ops('prepare',qk,qi);cancel=ops('post',qk)
 check(cancel['receipt']['after']['state']=='canceled' and not service('claim',delivery['id'],{'claimKey':c.uid()})['sendPermission'],'queued cancellation fences physical permission permanently')
 job2,d=allocate('synthetic-operator-unknown');nonce=c.uid();service('claim',d['id'],{'claimKey':nonce});service('settle',d['id'],{'claimKey':nonce,'outcome':{'outcome':'unknown','ok':False,'error':'Synthetic transport loss'}})
 obs=monitor(run=job2['id'])['deliveries'][0];hk=c.uid();hi=dict(kind='acknowledge_hold',targetId=d['id'],observed=obs,reason='Unknown delivery retained; no resend');ops('prepare',hk,hi);held=ops('post',hk)
 check(held['receipt']['after']['state']=='unknown' and held['receipt']['after']['acknowledged'] and not service('claim',d['id'],{'claimKey':c.uid()})['sendPermission'],'held acknowledgement preserves unknown result and never grants another permission')
 bad=c.uid();badintent=dict(kind='cancel_delivery',targetId=d['id'],observed=monitor(run=job2['id'])['deliveries'][0],reason='Synthetic cannot cancel granted send');ops('prepare',bad,badintent);refuse('already granted cancellation',lambda:ops('post',bad,ok=False),'unclaimed queued')
 for role in ('anon','authenticated','service_role'):refuse(role+' operator proof read',lambda role=role:sql('BEGIN;SET LOCAL ROLE '+role+';SELECT * FROM alert_cron.operator_requests;COMMIT;',False),'permission denied')
 # Competing claim/cancel remains one physical permission at most.
 race_job,race_delivery=allocate('synthetic-operator-race');race_key=c.uid();race_intent=dict(kind='cancel_delivery',targetId=race_delivery['id'],observed=monitor(run=race_job['id'])['deliveries'][0],reason='Synthetic simultaneous containment');ops('prepare',race_key,race_intent)
 with concurrent.futures.ThreadPoolExecutor(2) as pool:
  cancel_future=pool.submit(ops,'post',race_key,ok=False);claim_future=pool.submit(service,'claim',race_delivery['id'],{'claimKey':c.uid()});cancel_result=cancel_future.result();claim_result=claim_future.result()
 final=service('delivery_status',race_delivery['id'])['delivery'];check((final['state']=='canceled' and cancel_result.returncode==0 and not claim_result['sendPermission']) or (final['state']=='sending' and cancel_result.returncode!=0 and claim_result['sendPermission']),'concurrent queued cancellation/claim permits exactly one winning transition and never restores permission')
 committed_key=c.uid();committed_intent=dict(kind='replan_run',targetId=job2['id'],observed=monitor(run=job2['id'])['runs'][0],reason='Synthetic no replacement after uncertainty');ops('prepare',committed_key,committed_intent);refuse('committed uncertain job replacement',lambda:ops('post',committed_key,ok=False),'unused unposted')
 # Same-timestamp keyset pages must not silently skip reservations.
 sql('BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(c.OWNER)+';'+''.join('SELECT public.fn_alert_cron_web('+lit('prepare')+','+u(c.uid())+','+u(c.OWNER)+');' for _ in range(55))+'COMMIT;')
 page1=monitor();page2=monitor(before=page1['before']);check(page1['more'] and len(page1['runs'])==50 and page2['runs'] and not(set(x['id'] for x in page1['runs'])&set(x['id'] for x in page2['runs'])),'bounded composite-cursor monitoring preserves same-timestamp jobs across pages without duplicates')
 exercise.result=dict(stale_replan_unique=True,unknown_outcome_not_replaced=True)
 sql("INSERT INTO hato_alertas(tipo,animal_id,regla_clave,fecha_programada,datos) VALUES('secado_due',"+u(ctx['treated']['payload']['animalId'])+",'manual:synthetic-operator-execution',(now() AT TIME ZONE 'America/Bogota')::date,'{\"mensaje\":\"Synthetic operator execution notification\"}');")
 data=dict(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),owner=c.OWNER,other=c.OTHER,target=replacement['id'])
 proc=subprocess.run(['node',str(Path(__file__).with_name('alert-cron-operations-native.mjs'))],input=json.dumps(data),text=True,capture_output=True,cwd=r.ROOT,timeout=90)
 if proc.returncode:
  fd=os.open('/tmp/escocia-cron-ops-sdk-private.log',os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW,0o600)
  with os.fdopen(fd,'w') as out:out.write(proc.stderr)
  raise ValueError('Actual operator SDK/edge replay failed; inspect private diagnostics')
 exercise.sdk=json.loads(proc.stdout);check(exercise.sdk['assertions']>=14,'actual browser/installed SDK and linked edge execution verify original recovery/monitor/coverage')
def main():
 a=argparse.ArgumentParser(description=__doc__);a.add_argument('evidence_dir',type=Path)
 for n in ('runtime','client','output','private-diagnostics'):a.add_argument('--'+n,type=Path,required=True)
 args=a.parse_args();exercise.client=args.client.resolve();evidence=args.evidence_dir.resolve();output=args.output.resolve()
 if output.is_relative_to(evidence) or output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 files=[SOURCE,Path(__file__),Path(__file__).with_name('alert-cron-operations-baseline-query.sql'),Path(__file__).with_name('alert-cron-operations-native.mjs'),*[r.ROOT/'src/utils/hato'/n for n in ('alertCronOperationsProtocol.ts','alertCronOperationsBrowser.ts')],*[r.ROOT/'src/supabase/functions/server'/n for n in ('alertCronOperationsProtocol.ts','alertCronOperatorExecution.ts','alertCronExecution.ts','alertCronPlan.ts','hato-alertas-tick.ts')]]
 sources={p:p.read_bytes() for p in files};catalog,rls,hashes=r.load(evidence)
 with r.database(args.runtime.resolve(),args.client.resolve(),args.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(p.read_bytes()!=b for p,b in sources.items()):raise ValueError('Operator source changed during native replay')
 result.update(exercise.result,sdk_proof=exercise.sdk,source_hashes={str(p.relative_to(r.ROOT)):r.p.digest(b) for p,b in sources.items()},temporary_database_stopped_and_removed=True)
 result['limits']=['Local synthetic Auth/private Unix socket only; never production.','Hosted JWT/scheduler/webhook/Telegram, deployed parity and remaining review scope are not certified.']
 output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
