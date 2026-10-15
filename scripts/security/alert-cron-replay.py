#!/usr/bin/env python3
"""Source-bound cron reservation/plan/outbox foundation, synthetic local replay only."""
import argparse
import concurrent.futures
import importlib.util
import json
import os
from pathlib import Path
spec=importlib.util.spec_from_file_location('management',Path(__file__).with_name('alert-management-replay.py'))
t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
c,r,lit,js,u=t.c,t.r,t.lit,t.js,t.u
SOURCE=r.ROOT/'src/sql/security-candidates/alert-cron.sql'
def install(sql):
 t.install(sql);sql(SOURCE.read_text())
def exercise(sql,ctx):
 check,call=ctx['check'],ctx['call'];base=ctx['state_query']().rstrip(';')
 schemas=('clinical_step_confirmation','alert_response','alert_management','alert_cron')
 tables=[(s,n) for s in schemas for n in (('runs','deliveries','audit') if s=='alert_cron' else ('requests','audit'))]
 query="SELECT jsonb_build_object('base',("+base+")"+''.join(","+lit(s+'.'+n)+",(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]') FROM "+s+'.'+n+' x)' for s,n in tables)+');'
 state=lambda:sql(query)
 def service(mode,key=None,payload=None,ok=True):return call('fn_alert_cron_service',[lit(mode),u(key) if key else 'NULL::uuid',js(payload) if payload is not None else 'NULL::jsonb'],actor=None,role='service_role',ok=ok)
 def web(mode,key,actor=c.OWNER,expected=None,ok=True):return call('fn_alert_cron_web',[lit(mode),u(key),u(expected or actor)],actor=actor,ok=ok)
 def refuse(label,fn,marker):
  before=state();failure=fn();passed=failure.returncode!=0 and marker.lower() in failure.stderr.lower() and state()==before
  if not passed:
   fd=os.open('/tmp/escocia-alert-cron-unexpected-private.log',os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW,0o600);os.fchmod(fd,0o600)
   with os.fdopen(fd,'w') as out:out.write(failure.stderr)
  check(passed,label+' refuses with complete state rollback')
 key=c.uid();refuse('Admin manual initiator',lambda:web('prepare',key,ok=False),'Gerencia')
 sql("UPDATE usuarios SET rol='Gerencia' WHERE id="+u(c.OWNER)+';UPDATE telegram_usuarios SET activo=true,usuario_id=NULL WHERE telegram_id=789;')
 # Config/subscription fixtures have no captured production rows.
 sql("INSERT INTO hato_alertas_config(tipo,horas_escalamiento,activo) VALUES('secado_due',48,true) ON CONFLICT(tipo) DO UPDATE SET activo=true;")
 sql("INSERT INTO alertas_catalogo(clave,modulo,nombre,descripcion) VALUES('hato.secado_due','hato','Synthetic cron','Synthetic fixture') ON CONFLICT(clave) DO NOTHING;")
 registration=sql('SELECT id FROM telegram_usuarios WHERE telegram_id=789;')
 sql('INSERT INTO telegram_alertas_suscripciones(telegram_usuario_id,alerta_clave,recibe,escalamiento) VALUES('+u(registration)+",'hato.secado_due',true,true) ON CONFLICT(telegram_usuario_id,alerta_clave) DO UPDATE SET recibe=true,escalamiento=true;")
 manual=web('prepare',key);before=state();check(web('prepare',key)==manual and state()==before,'manual reservation preserves original key/source/actor without domain mutation')
 refuse('owner switch',lambda:web('status',key,actor=c.OTHER,expected=c.OWNER,ok=False),'owner/key')
 refuse('ordinary arbitrary job plan',lambda:call('fn_alert_cron_service',[lit('post'),u(manual['id']),js({'generate':[],'updates':[],'deliveries':[]})],ok=False),'permission denied')
 canceled=c.uid();fence=web('cancel',canceled);before=state();check(fence['state']=='canceled' and web('prepare',canceled)==fence and state()==before,'manual cancel before prepare keeps original durable fence')
 sql('UPDATE usuarios SET activo=false WHERE id='+u(c.OWNER)+';');refuse('revoked manual status',lambda:web('status',key,ok=False),'Gerencia');sql('UPDATE usuarios SET activo=true WHERE id='+u(c.OWNER)+';')
 run=service('prepare');before=state();check(service('prepare')==run and state()==before and run['actor']=={'origin':'cron','principal':'service_role','job':'hato_alertas_tick'},'scheduled retry recovers server-owned daily job with service principal and no invented human')
 plan=dict(generate=[dict(tipo='secado_due',animal_id=ctx['treated']['payload']['animalId'],paso_id=None,regla_clave='synthetic-cron-rule',fecha_programada='2026-10-15',datos={'mensaje':'Synthetic frozen alert'})],updates=[],deliveries=[dict(reglaClave='synthetic-cron-rule',registrationId=registration,phase='delivery',text='Synthetic frozen alert')])
 plan['generate']=[{**plan['generate'][0],'regla_clave':'synthetic-cron-rule'+suffix} for suffix in ('','-2','-3','-4')]
 plan['deliveries']=[{**plan['deliveries'][0],'reglaClave':g['regla_clave']} for g in plan['generate']]
 def raw(drift,mode='post',id=run['id'],payload=plan):return sql('BEGIN;'+drift+'SET LOCAL ROLE service_role;SELECT public.fn_alert_cron_service('+lit(mode)+','+u(id)+','+js(payload)+');COMMIT;',False)
 refuse('changed original config',lambda:raw("UPDATE hato_alertas_config SET horas_escalamiento=49 WHERE tipo='secado_due';"),'source changed')
 for table,event,body,marker in [('hato_alertas','BEFORE INSERT','RETURN NULL;','Generated alert suppressed'),('alert_cron.deliveries','BEFORE INSERT','RETURN NULL;','Frozen delivery suppressed'),('alert_cron.audit','BEFORE INSERT','RETURN NULL;','audit suppressed'),('alert_cron.runs','BEFORE UPDATE','RETURN NULL;','committed control suppressed')]:
  ddl='CREATE FUNCTION public.synthetic_cron_fault() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN '+body+' END $f$;CREATE TRIGGER synthetic_cron_fault '+event+' ON '+table+' FOR EACH ROW EXECUTE FUNCTION public.synthetic_cron_fault();'
  refuse(table+' fault',lambda ddl=ddl:raw(ddl),marker)
 receipt=service('post',run['id'],plan);before=state();check(service('post',run['id'],plan)==receipt and state()==before,'atomic generation/outbox/audit recovers immutable original plan receipt without duplicates')
 delivery=receipt['deliveries'][0];check(delivery['state']=='queued' and delivery['body']['text']=='Synthetic frozen alert' and delivery['recipient']==789,'frozen delivery binds current unlinked recipient and exact body')
 refuse('revoked delivery recipient',lambda:raw('UPDATE telegram_usuarios SET activo=false WHERE id='+u(registration)+';',mode='claim',id=delivery['id'],payload={'claimKey':c.uid()}),'recipient')
 refuse('changed delivery date',lambda:raw("UPDATE hato_alertas SET fecha_programada='2026-10-16' WHERE id="+u(delivery['alert_id'])+';',mode='claim',id=delivery['id'],payload={'claimKey':c.uid()}),'frozen delivery source changed')
 claim=c.uid()
 with concurrent.futures.ThreadPoolExecutor(2) as pool:
  x=pool.submit(service,'claim',delivery['id'],{'claimKey':claim});y=pool.submit(service,'claim',delivery['id'],{'claimKey':claim});claims=[x.result(),y.result()]
 check(sum(x['sendPermission'] for x in claims)==1,'concurrent same delivery claim grants physical send permission exactly once')
 before=state();retry=service('claim',delivery['id'],{'claimKey':c.uid()});check(not retry['sendPermission'] and state()==before,'lost claim result cannot reacquire permission with original or replacement nonce')
 refuse('malformed sent proof',lambda:service('settle',delivery['id'],{'claimKey':claim,'outcome':{'outcome':'sent','ok':True}},ok=False),'Exact verified')
 result={'outcome':'unknown','ok':False,'error':'Synthetic response loss'};settled=service('settle',delivery['id'],{'claimKey':claim,'outcome':result});before=state()
 check(settled['delivery']['state']=='unknown' and service('settle',delivery['id'],{'claimKey':claim,'outcome':result})==settled and state()==before,'unknown send outcome is durable and same-claim settlement retry is read-only')
 check(not service('claim',delivery['id'],{'claimKey':claim})['sendPermission'] and state()==before,'unknown outcome never silently permits resend')
 refuse('invented replacement outcome',lambda:service('settle',delivery['id'],{'claimKey':claim,'outcome':{'outcome':'sent','ok':True,'telegramMessageId':91}},ok=False),'terminal delivery outcome changed')
 for extra,outcome in zip(receipt['deliveries'][1:],[{'outcome':'sent','ok':True,'telegramMessageId':91},{'outcome':'rejected','ok':False,'errorCode':429,'error':'Synthetic rejection'},{'outcome':'not_attempted','ok':False,'error':'Synthetic missing token'}]):
  nonce=c.uid();claimed=service('claim',extra['id'],{'claimKey':nonce});check(claimed['sendPermission'],'fresh frozen delivery grants one permission for '+outcome['outcome'])
  settled2=service('settle',extra['id'],{'claimKey':nonce,'outcome':outcome});before=state();check(settled2['delivery']['state']==outcome['outcome'] and not service('claim',extra['id'],{'claimKey':nonce})['sendPermission'] and state()==before,'terminal '+outcome['outcome']+' keeps exact original outcome without resend')
 # A fresh manual run can retire the alert but cannot overwrite a newer source.
 second=web('prepare',c.uid());row=json.loads(sql("SELECT to_jsonb(a) FROM hato_alertas a WHERE regla_clave='synthetic-cron-rule';"));updates=dict(generate=[],updates=[dict(id=row['id'],patch={'estado':'expirada'})],deliveries=[])
 receipt2=service('post',second['id'],updates);check(receipt2['after']['domain']['alerts']!=receipt['after']['domain']['alerts'],'manual-initiated trusted executor lifecycle update commits exact audit/source')
 # Once a send has been granted, a later revocation cannot erase its observed outcome.
 recovery=web('prepare',c.uid());manual_plan=dict(generate=[dict(plan['generate'][0],regla_clave='synthetic-manual-cron')],updates=[],deliveries=[dict(plan['deliveries'][0],reglaClave='synthetic-manual-cron')]);manual_post=service('post',recovery['id'],manual_plan);md=manual_post['deliveries'][0];mk=c.uid();service('claim',md['id'],{'claimKey':mk})
 sql('UPDATE usuarios SET activo=false WHERE id='+u(c.OWNER)+';');observed=service('settle',md['id'],{'claimKey':mk,'outcome':{'outcome':'sent','ok':True,'telegramMessageId':92}})
 check(observed['delivery']['state']=='sent','executor records an already-granted known send after manual initiator revocation without granting another send')
 sql('UPDATE usuarios SET activo=true WHERE id='+u(c.OWNER)+';')
 for role in ('anon','authenticated','service_role'):
  refuse(role+' protected job reads',lambda role=role:sql('BEGIN;SET LOCAL ROLE '+role+';SELECT * FROM alert_cron.runs;COMMIT;',False),'permission denied')
 exercise.result=dict(one_time_send_permission_verified=True,unknown_outcome_preserved=True)
def main():
 a=argparse.ArgumentParser(description=__doc__);a.add_argument('evidence_dir',type=Path)
 for n in ('runtime','client','output','private-diagnostics'):a.add_argument('--'+n,type=Path,required=True)
 args=a.parse_args();evidence=args.evidence_dir.resolve();output=args.output.resolve()
 if output.is_relative_to(evidence) or output.name.endswith('-private.json'):raise ValueError('Cannot overwrite private evidence')
 files=[SOURCE,Path(__file__),Path(__file__).with_name('alert-cron-baseline-query.sql'),*[r.ROOT/'src/supabase/functions/server/telegram'/n for n in ('sendOutcome.ts','enviar.ts','alertCronDelivery.ts')]];sources={p:p.read_bytes() for p in files};catalog,rls,hashes=r.load(evidence)
 with r.database(args.runtime.resolve(),args.client.resolve(),args.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(p.read_bytes()!=b for p,b in sources.items()):raise ValueError('Source changed during cron replay')
 result.update(exercise.result,source_hashes={str(p.relative_to(r.ROOT)):r.p.digest(b) for p,b in sources.items()},temporary_database_stopped_and_removed=True)
 result['limits']=['SQL foundation only; actual tick not cut over and legacy delivery metadata/private callback integration remain open.','Synthetic local replay only; no hosted scheduler, Telegram transport or production certification.']
 output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
