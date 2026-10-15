#!/usr/bin/env python3
"""Actual source-planned tick and frozen-message callers: four-export local replay only."""
import argparse
import importlib.util
import json
import os
import subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('cron',Path(__file__).with_name('alert-cron-replay.py'))
t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
c,r,lit,js,u=t.c,t.r,t.lit,t.js,t.u
SOURCE=r.ROOT/'src/sql/security-candidates/alert-cron-callers.sql'
def install(sql):
 t.install(sql)
 baseline=Path(__file__).with_name('alert-cron-callers-baseline-query.sql').read_text();before=sql(baseline)
 for drift,marker in [("ALTER TABLE hato_alertas_envios ALTER COLUMN message_id SET DEFAULT 0;",'Unreviewed delivery mapping graph'),("ALTER FUNCTION alert_cron.delivery(text,uuid,jsonb) SET search_path=public;",'Unreviewed original cron function')]:
  failed=sql('BEGIN;'+drift+SOURCE.read_text(),False)
  if failed.returncode==0 or marker not in failed.stderr or sql(baseline)!=before or sql("SELECT to_regclass('alert_cron.delivery_evidence') IS NULL;")!='t':raise ValueError('Caller candidate admission failed rollback verification')
 sql(SOURCE.read_text())
def exercise(sql,ctx):
 check,call=ctx['check'],ctx['call']
 sql('UPDATE usuarios SET rol=\'Gerencia\' WHERE id='+u(c.OWNER)+';UPDATE telegram_usuarios SET activo=true,usuario_id=NULL WHERE telegram_id=789;')
 config=dict(razas=['jersey'],meses_secado_por_raza={'jersey':2,'_default':2},meses_gestacion_default=9,umbral_partos_reemplazo=9,ventana_proxima_secar_dias=30,ventana_proximo_parir_dias=30,dias_parto_proximo_alerta=14,dias_servicio_sin_confirmacion=45,dias_espera_voluntaria_post_parto=60,dias_rechequeo_due=60)
 for key,value in config.items():sql('INSERT INTO hato_config(clave,valor) VALUES('+lit(key)+','+js(value)+') ON CONFLICT(clave) DO UPDATE SET valor=EXCLUDED.valor;')
 registration=sql('SELECT id FROM telegram_usuarios WHERE telegram_id=789;')
 sql("INSERT INTO hato_alertas_config(tipo,horas_escalamiento,activo) VALUES('secado_due',48,true) ON CONFLICT(tipo) DO UPDATE SET activo=true;INSERT INTO alertas_catalogo(clave,modulo,nombre,descripcion) VALUES('hato.secado_due','hato','Synthetic cron','Fixture') ON CONFLICT(clave) DO NOTHING;")
 sql('INSERT INTO telegram_alertas_suscripciones(telegram_usuario_id,alerta_clave,recibe,escalamiento) VALUES('+u(registration)+",'hato.secado_due',true,true) ON CONFLICT(telegram_usuario_id,alerta_clave) DO UPDATE SET recibe=true,escalamiento=true;")
 alert=c.uid();animal=ctx['treated']['payload']['animalId']
 sql('INSERT INTO hato_alertas(id,tipo,animal_id,regla_clave,fecha_programada,datos) VALUES('+u(alert)+",'secado_due',"+u(animal)+",'manual:synthetic-cron-callers',(now() AT TIME ZONE 'America/Bogota')::date,'{\"mensaje\":\"Synthetic frozen caller alert\"}');")
 today=sql("SELECT to_char(now() AT TIME ZONE 'America/Bogota','YYYY-MM-DD');")
 observed=json.loads(sql('SELECT to_jsonb(a) FROM hato_animales a WHERE id='+u(animal)+';'))
 creation=dict(version=1,animalId=animal,nombre='Synthetic cron clinical',fechaInicio=today,nota=None,fechaProximoPaso=today,descripcionPaso='Existing source-bound step',observedAnimal=observed);ck=c.uid()
 call('fn_hato_treatment_create_web',[lit('prepare'),u(ck),js(creation),u(c.OWNER)])
 created=call('fn_hato_treatment_create_web',[lit('post'),u(ck),js(creation),u(c.OWNER)]);step=created['receipt']['after']['steps'][0]['id']
 sql("INSERT INTO hato_alertas_config(tipo,horas_escalamiento,activo) VALUES('tratamiento_paso',48,true) ON CONFLICT(tipo) DO UPDATE SET activo=true;INSERT INTO alertas_catalogo(clave,modulo,nombre,descripcion) VALUES('hato.tratamiento_paso','hato','Synthetic clinical cron','Fixture') ON CONFLICT(clave) DO NOTHING;")
 sql('INSERT INTO telegram_alertas_suscripciones(telegram_usuario_id,alerta_clave,recibe,escalamiento) VALUES('+u(registration)+",'hato.tratamiento_paso',true,true) ON CONFLICT(telegram_usuario_id,alerta_clave) DO UPDATE SET recibe=true,escalamiento=true;")
 legacy,expired,escalated,fact=[c.uid() for _ in range(4)]
 sql('INSERT INTO hato_alertas(id,tipo,animal_id,regla_clave,fecha_programada,estado,intentos,datos) VALUES('+u(legacy)+",'secado_due',"+u(animal)+",'secado:synthetic-old-granularity',current_date,'pendiente',0,'{}'),("+u(expired)+",'secado_due',"+u(animal)+",'manual:synthetic-expiration',current_date-30,'pendiente',0,'{}'),("+u(escalated)+",'secado_due',"+u(animal)+",'manual:synthetic-escalation',current_date,'enviada',1,jsonb_build_object('mensaje','Synthetic escalation','enviada_en',now()-interval '72 hours'));")
 sql('INSERT INTO hato_eventos(animal_id,tipo,fecha,fuente) VALUES('+u(animal)+",'parto',current_date-1,'telegram');INSERT INTO hato_alertas(id,tipo,animal_id,regla_clave,fecha_programada,datos) VALUES("+u(fact)+",'parto_proximo',"+u(animal)+",'parto:synthetic-source:'||to_char(current_date-60,'YYYY-MM-DD'),current_date,jsonb_build_object('fecha_servicio',to_char(current_date-60,'YYYY-MM-DD')));")
 data=dict(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),owner=c.OWNER,key=c.uid(),alert=alert,step=step,legacy=legacy,expired=expired,escalated=escalated,fact=fact)
 proc=subprocess.run(['node',str(Path(__file__).with_name('alert-cron-callers-native.mjs'))],input=json.dumps(data),text=True,capture_output=True,cwd=r.ROOT,timeout=90)
 if proc.returncode:
  fd=os.open('/tmp/escocia-cron-callers-native-private.log',os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW,0o600)
  with os.fdopen(fd,'w') as out:out.write(proc.stderr)
  raise ValueError('Actual caller native replay failed; private diagnostics saved')
 proof=json.loads(proc.stdout);check(proof['assertions']>=8,'actual source-planned tick uses installed SDK/native job/send/metadata recovery');exercise.proof=proof
 # Independent SQL fault/source/recovery proofs after the actual installed-SDK caller.
 base=ctx['state_query']().rstrip(';')
 query="SELECT jsonb_build_object('base',("+base+")"+''.join(","+lit('cron.'+name)+",(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]') FROM alert_cron."+name+' x)' for name in ('runs','deliveries','audit','delivery_evidence'))+",'mappings',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY alerta_id,telegram_id),'[]') FROM public.hato_alertas_envios x));"
 state=lambda:sql(query)
 def service(mode,key,payload=None,ok=True):return call('fn_alert_cron_service',[lit(mode),u(key),js(payload) if payload is not None else 'NULL::jsonb'],actor=None,role='service_role',ok=ok)
 def refuse(label,operation,marker):
  before=state();failure=operation();check(failure.returncode!=0 and marker.lower() in failure.stderr.lower() and state()==before,label+' refuses with all source/control/audit/mappings unchanged')
 def reserve():return call('fn_alert_cron_web',[lit('prepare'),u(c.uid()),u(c.OWNER)],actor=c.OWNER)
 run=reserve();plan=dict(generate=[dict(tipo='secado_due',animal_id=animal,paso_id=None,regla_clave='synthetic-proof-'+c.uid(),fecha_programada=sql("SELECT to_char(now() AT TIME ZONE 'America/Bogota','YYYY-MM-DD');"),datos={'mensaje':'Synthetic exact original message'})],updates=[],deliveries=[])
 plan['deliveries']=[dict(reglaClave=plan['generate'][0]['regla_clave'],registrationId=registration,phase='delivery',text='Synthetic exact original message')]
 posted=service('post',run['id'],plan);d=posted['deliveries'][0];nonce=c.uid();service('claim',d['id'],{'claimKey':nonce})
 outcome={'outcome':'sent','ok':True,'telegramMessageId':701};payload={'claimKey':nonce,'outcome':outcome}
 def raw_settle(ddl):return sql('BEGIN;'+ddl+'SET LOCAL ROLE service_role;SELECT public.fn_alert_cron_service('+lit('settle')+','+u(d['id'])+','+js(payload)+');COMMIT;',False)
 for table,event,body,marker in [('alert_cron.delivery_evidence','BEFORE INSERT','RETURN NULL;','evidence suppressed'),('hato_alertas','BEFORE UPDATE','RETURN NULL;','metadata suppressed'),('hato_alertas_envios','BEFORE INSERT','RETURN NULL;','mapping suppressed'),('alert_cron.audit','BEFORE INSERT',"IF NEW.event='delivery_evidence' THEN RETURN NULL;END IF;RETURN NEW;",'audit suppressed')]:
  ddl='CREATE FUNCTION public.synthetic_cron_caller_fault() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN '+body+' END $f$;CREATE TRIGGER synthetic_cron_caller_fault '+event+' ON '+table+' FOR EACH ROW EXECUTE FUNCTION public.synthetic_cron_caller_fault();'
  refuse(table+' '+event,lambda ddl=ddl:raw_settle(ddl),marker)
 settled=service('settle',d['id'],payload);before=state();check(service('settle',d['id'],payload)==settled and state()==before,'accepted result and exact metadata/evidence are recovered without duplicate writes')
 check(sql('SELECT count(*) FROM hato_alertas_envios WHERE alerta_id='+u(d['alert_id'])+" AND telegram_id='789' AND message_id=701;")=='1','accepted metadata has the original recipient and message ID')
 def callback(id=d['id'],sender=789,chat=789,message=701,text='Synthetic exact original message',ok=True):return call('fn_alert_cron_private_callback',[u(id),str(sender),str(chat),str(message),lit(text)],actor=None,role='service_role',ok=ok)
 for label,kwargs,marker in [('forwarded private control',{'chat':800},'private'),('different accepted message',{'message':702},'accepted message'),('different frozen text',{'text':'Changed'},'frozen private')]:refuse(label,lambda kwargs=kwargs:callback(**kwargs,ok=False),marker)
 original=callback();before=state();check(callback()==original and state()==before,'original private callback independently recovers immutable accepted proof')
 # Unknown transport result stays immutable; its independently delivered native action adds separate evidence.
 second=reserve();rule='synthetic-unknown-'+c.uid();plan2=dict(generate=[dict(plan['generate'][0],regla_clave=rule)],updates=[],deliveries=[dict(plan['deliveries'][0],reglaClave=rule)]);pd=service('post',second['id'],plan2)['deliveries'][0];claim=c.uid();service('claim',pd['id'],{'claimKey':claim});service('settle',pd['id'],{'claimKey':claim,'outcome':{'outcome':'unknown','ok':False,'error':'Synthetic response loss'}})
 held=reserve();repeat=dict(generate=[],updates=[],deliveries=[dict(plan['deliveries'][0],reglaClave=rule)])
 refuse('unknown replacement send',lambda:service('post',held['id'],repeat,ok=False),'unresolved delivery held')
 recovered=callback(id=pd['id'],message=703);check(recovered['evidence']['kind']=='original_private_callback' and service('delivery_status',pd['id'])['delivery']['state']=='unknown','original private callback adds independent known-delivery evidence without rewriting the unknown outcome or resending')
 # Changed human target after the physical send is preserved while known acceptance is still recorded.
 third=reserve();rule3='synthetic-changed-'+c.uid();plan3=dict(generate=[dict(plan['generate'][0],regla_clave=rule3)],updates=[],deliveries=[dict(plan['deliveries'][0],reglaClave=rule3)]);cd=service('post',third['id'],plan3)['deliveries'][0];claim3=c.uid();service('claim',cd['id'],{'claimKey':claim3});sql("UPDATE hato_alertas SET estado='descartada' WHERE id="+u(cd['alert_id'])+';');observed=sql('SELECT to_jsonb(a) FROM hato_alertas a WHERE id='+u(cd['alert_id'])+';');service('settle',cd['id'],{'claimKey':claim3,'outcome':{'outcome':'sent','ok':True,'telegramMessageId':704}})
 check(sql('SELECT to_jsonb(a) FROM hato_alertas a WHERE id='+u(cd['alert_id'])+';')==observed,'late accepted outcome records evidence/mapping without overwriting the newer human result')
 for role in ('anon','authenticated','service_role'):refuse(role+' immutable evidence access',lambda role=role:sql('BEGIN;SET LOCAL ROLE '+role+';SELECT * FROM alert_cron.delivery_evidence;COMMIT;',False),'permission denied')
 exercise.result=dict(actual_tick_cutover_verified=True)
def main():
 a=argparse.ArgumentParser(description=__doc__);a.add_argument('evidence_dir',type=Path)
 for n in ('runtime','client','output','private-diagnostics'):a.add_argument('--'+n,type=Path,required=True)
 args=a.parse_args();exercise.client=args.client.resolve();evidence=args.evidence_dir.resolve();output=args.output.resolve()
 if output.is_relative_to(evidence) or output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 files=[SOURCE,Path(__file__),Path(__file__).with_name('alert-cron-callers-baseline-query.sql'),Path(__file__).with_name('alert-cron-callers-native.mjs'),*[r.ROOT/'src/supabase/functions/server'/n for n in ('hato-alertas-tick.ts','alertCronPlan.ts','alertCronJob.ts','telegram/alertCronDelivery.ts','telegram/alertCronCallback.ts','telegram/bot.ts','telegram/enviar.ts')]]
 sources={p:p.read_bytes() for p in files};catalog,rls,hashes=r.load(evidence)
 with r.database(args.runtime.resolve(),args.client.resolve(),args.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(p.read_bytes()!=b for p,b in sources.items()):raise ValueError('Caller source changed during native replay')
 result.update(exercise.result,sdk_proof=exercise.proof,source_hashes={str(p.relative_to(r.ROOT)):r.p.digest(b) for p,b in sources.items()},temporary_database_stopped_and_removed=True)
 result['limits']=['Local synthetic Auth/HTTP/Telegram only; no hosted JWT/scheduler/webhook or production certification.','Explicit stale-job/operator resolution and remaining writer/reader/runtime/global/recovery work remain open.']
 output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
