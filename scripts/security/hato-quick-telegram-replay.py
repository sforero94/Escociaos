#!/usr/bin/env python3
"""Native private-action quicks, on the four-export local replay only."""
import argparse
import concurrent.futures
import importlib.util
import json
import subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('cycle',Path(__file__).with_name('hato-birth-telegram-replay.py'))
t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
c,r,lit,js,u=t.c,t.r,t.lit,t.js,t.u
SOURCE=r.ROOT/'src/sql/security-candidates/hato-quick-telegram.sql'
def state_query(sql):return t.state_query(sql)
def install(sql):
 t.install(sql);query=state_query(sql);before=sql(query)
 for ddl,marker in (("ALTER TABLE hato_pajillas ADD COLUMN synthetic_unreviewed boolean;",'Unreviewed quick inventory graph'),("ALTER TABLE hato_toros ADD COLUMN synthetic_unreviewed boolean;",'Unreviewed quick source graph'),("ALTER TABLE hato_eventos FORCE ROW LEVEL SECURITY;",'Unreviewed quick source graph'),("ALTER FUNCTION hato_treatment_creation.telegram_actor(bigint,bigint,bigint) SET search_path=public;",'Unreviewed quick actor helper')):
  failure=sql('BEGIN;'+ddl+SOURCE.read_text(),False)
  if failure.returncode==0 or marker not in failure.stderr or sql(query)!=before or sql("SELECT to_regnamespace('hato_quick_telegram') IS NULL;")!='t':raise AssertionError('Quick admission rollback')
 sql(SOURCE.read_text())
 if sql(query)!=before:raise AssertionError('Quick install changed existing rows')
def exercise(sql,ctx):
 check,call=ctx['check'],ctx['call'];target=ctx['treated']['payload']['animalId'];query=state_query(sql);state=lambda:sql(query)
 reg=c.uid();sender=98765;bull=c.uid();lot=c.uid()
 config=dict(razas=['jersey'],meses_secado_por_raza=dict(jersey=2,_default=2),meses_gestacion_default=9,umbral_partos_reemplazo=9,ventana_proxima_secar_dias=30,ventana_proximo_parir_dias=30,dias_parto_proximo_alerta=14,dias_servicio_sin_confirmacion=45,dias_rechequeo_due=60,dias_espera_voluntaria_post_parto=90)
 for key,value in config.items():sql('INSERT INTO hato_config(clave,valor) VALUES('+lit(key)+','+js(value)+') ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor;')
 sql('INSERT INTO telegram_usuarios(id,telegram_id,nombre_display,activo,modulos_permitidos,usuario_id) VALUES('+u(reg)+","+str(sender)+",'Synthetic field worker',true,ARRAY['hato_produccion'],NULL);INSERT INTO hato_toros(id,nombre,tipo,activo) VALUES("+u(bull)+",'Synthetic AI bull','inseminacion',true);INSERT INTO hato_pajillas(id,toro_id,cantidad_inicial) VALUES("+u(lot)+','+u(bull)+',0);')
 def quick(mode,message,intent=None,who=sender,chat=None,ok=True):return call('fn_hato_quick_telegram',[lit(mode),str(who)+'::bigint',str(chat if chat is not None else who)+'::bigint',str(message)+'::bigint',js(intent) if intent is not None else 'NULL::jsonb'],actor=None,role='service_role',ok=ok)
 animal=json.loads(sql('SELECT to_jsonb(x) FROM hato_animales x WHERE id='+u(target)+';'));day=sql("SELECT to_char((now() AT TIME ZONE 'America/Bogota')::date,'YYYY-MM-DD');")
 intent=dict(version=1,animalId=target,fecha=day,kind='inseminacion',toroId=bull,pajillaId=lot,observedAnimal=animal);message=701;prepared=quick('prepare',message,intent)
 check(prepared['state']=='pending' and prepared['actor']['profileId'] is None and prepared['plan']['usage']['created_by'] is None,'unlinked worker reserves exact event and optional usage without fabricated profile')
 before=state();check(quick('prepare',message,intent)==prepared and state()==before,'same original action retains key and full source plan')
 def refuse(label,fn,marker):
  before=state();failure=fn()
  if failure.returncode==0 or marker.lower() not in failure.stderr.lower() or state()!=before:
   p=Path('/tmp/escocia-quick-unexpected-private.log');p.touch(mode=0o600,exist_ok=True);p.write_text(failure.stderr);raise AssertionError(label+' refusal/rollback; private diagnostics saved')
  check(True,label+' refuses with complete rollback')
 def raw(ddl,msg=message):return sql('BEGIN;'+ddl+"SET LOCAL ROLE service_role;SELECT fn_hato_quick_telegram('post',"+str(sender)+','+str(sender)+','+str(msg)+',NULL::jsonb);COMMIT;',False)
 for label,ddl,marker in [
 ('stale mother',"UPDATE hato_animales SET notas='Competing source' WHERE id="+u(target)+';','graph changed'),
 ('stale lot','UPDATE hato_pajillas SET cantidad_inicial=8 WHERE id='+u(lot)+';','graph changed'),
 ('retired bull','UPDATE hato_toros SET activo=false WHERE id='+u(bull)+';','graph changed'),
 ('competing usage','INSERT INTO hato_pajillas_uso(pajilla_id,fecha_uso) VALUES('+u(lot)+",'2026-10-01');",'graph changed'),
 ('revoked worker','UPDATE telegram_usuarios SET activo=false WHERE id='+u(reg)+';','registration'),
 ('module loss',"UPDATE telegram_usuarios SET modulos_permitidos=ARRAY[]::text[] WHERE id="+u(reg)+';','registration'),
 ('rebound worker','UPDATE telegram_usuarios SET usuario_id='+u(c.OWNER)+' WHERE id='+u(reg)+';','actor changed')]:refuse(label,lambda ddl=ddl:raw(ddl),marker)
 refuse('group action',lambda:quick('prepare',702,intent,chat=-100,ok=False),'private')
 refuse('missing registration',lambda:quick('status',message,who=87654,ok=False),'registration')
 for table,event,body,marker in [('public.hato_pajillas_uso','BEFORE INSERT','RETURN NULL;','usage suppressed'),('public.hato_eventos','BEFORE INSERT','RETURN NULL;','event suppressed'),('hato_quick_telegram.audit','BEFORE INSERT','RETURN NULL;','audit suppressed'),('hato_quick_telegram.requests','BEFORE UPDATE','RETURN NULL;','control suppressed'),('public.hato_eventos','BEFORE INSERT',"NEW.datos='{}';RETURN NEW;",'event suppressed'),('public.hato_pajillas_uso','BEFORE INSERT',"NEW.fecha_uso=NEW.fecha_uso-1;RETURN NEW;",'usage suppressed'),('public.hato_eventos','AFTER INSERT','UPDATE public.telegram_usuarios SET activo=false WHERE id='+u(reg)+';RETURN NEW;','registration'),('public.hato_eventos','AFTER INSERT','UPDATE public.hato_pajillas SET cantidad_inicial=9 WHERE id='+u(lot)+';RETURN NEW;','inventory mismatch')]:
  ddl='CREATE FUNCTION public.synthetic_quick_fault() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN '+body+' END $f$;CREATE TRIGGER synthetic_quick_fault '+event+' ON '+table+' FOR EACH ROW EXECUTE FUNCTION public.synthetic_quick_fault();';refuse(table+' '+body[:35],lambda ddl=ddl:raw(ddl),marker)
 refuse('replacement private preparation',lambda:quick('prepare',703,intent,ok=False),'original protected action')
 before=json.loads(state())
 with concurrent.futures.ThreadPoolExecutor(2) as pool:
  a=pool.submit(quick,'post',message);b=pool.submit(quick,'post',message);posted=a.result();other=b.result()
 after=json.loads(state());allowed={'public.hato_eventos','public.hato_pajillas_uso','hato_quick_telegram.requests','hato_quick_telegram.audit'}
 check(all(v==after[k] for k,v in before.items() if k not in allowed),'atomic event/usage leaves unrelated public/private financial/backup/clinical records exact')
 check(posted==other and posted['state']=='committed' and posted['receipt']['after']['animal']==animal,'concurrent original post creates exactly one linked event/usage/audit')
 check(sql('SELECT cantidad_actual FROM v_hato_pajillas_stock WHERE pajilla_id='+u(lot)+';')=='-1','zero stock warns only; successful explicit usage may make stock negative')
 check(posted['plan']['events'][0]['datos']['pajilla_uso_id']==posted['plan']['usage']['id'],'link is reserved in original event insert, never a separate update')
 before=state();check(quick('status',message)==posted and quick('post',message)==posted and state()==before,'original status/post recovers immutable receipt without repeated deduction')
 check(json.loads(sql('SELECT receipt FROM hato_quick_telegram.audit WHERE request_key='+u(posted['requestKey'])+';'))==posted['receipt'],'independent trusted audit equals original receipt')
 refuse('replacement after committed event',lambda:quick('prepare',706,intent,ok=False),'original protected action')
 fence=quick('resolve',704);check(fence['state']=='canceled' and quick('prepare',704,intent)==fence,'cancel before preparation fences original private action')
 for role in ('anon','authenticated','service_role'):refuse(role+' private proof',lambda role=role:sql('BEGIN;SET LOCAL ROLE '+role+';SELECT * FROM hato_quick_telegram.requests;COMMIT;',False),'permission denied')
 for role in ('anon','authenticated'):refuse(role+' native impersonation',lambda role=role:sql('BEGIN;SET LOCAL ROLE '+role+";SELECT fn_hato_quick_telegram('status',"+str(sender)+','+str(sender)+',701,NULL::jsonb);COMMIT;',False),'permission denied')
 for i,kind in enumerate(['secado','aborto']):
  p=quick('prepare',710+i,dict(intent,kind=kind,toroId=None,pajillaId=None));q=quick('post',710+i);check(p['plan']['usage'] is None and q['receipt']['usage'] is None,kind+' has no invented bull or inventory deduction')
 sql('INSERT INTO hato_eventos(animal_id,tipo,fecha,fecha_confianza,fuente) VALUES('+u(target)+",'aborto','2026-09-19','exacta','telegram');")
 refuse('legacy manual event is not adopted',lambda:quick('prepare',708,dict(intent,fecha='2026-09-19',kind='aborto',toroId=None,pajillaId=None),ok=False),'Existing manual event')
 monta=c.uid();sql('INSERT INTO hato_toros(id,nombre,tipo,activo) VALUES('+u(monta)+",'Synthetic natural service','monta',true);")
 quick('prepare',712,dict(intent,kind='monta',toroId=monta,pajillaId=None));natural=quick('post',712)
 check(natural['receipt']['usage'] is None and natural['plan']['events'][0]['toro_id']==monta,'natural service preserves selected active catalog bull without invented usage')
 quick('prepare',713,dict(intent,fecha='2026-09-21',pajillaId=None));no_lot=quick('post',713)
 check(no_lot['receipt']['usage'] is None,'insemination without selected lot never invents an inventory deduction')
 linked_sender=87654;linked_reg=c.uid();sql('INSERT INTO telegram_usuarios(id,telegram_id,nombre_display,activo,modulos_permitidos,usuario_id) VALUES('+u(linked_reg)+","+str(linked_sender)+",'Synthetic linked worker',true,ARRAY['hato_produccion'],"+u(c.OWNER)+');')
 quick('prepare',714,dict(intent,fecha='2026-09-22'),who=linked_sender);linked=quick('post',714,who=linked_sender)
 check(linked['receipt']['usage']['created_by']==c.OWNER and linked['plan']['events'][0]['created_by']==c.OWNER,'genuine active linked profile attributes both atomic records')
 refuse('revoked linked profile recovery',lambda:sql('BEGIN;UPDATE usuarios SET activo=false WHERE id='+u(c.OWNER)+";SET LOCAL ROLE service_role;SELECT fn_hato_quick_telegram('status',"+str(linked_sender)+','+str(linked_sender)+',714,NULL::jsonb);COMMIT;',False),'linked profile')
 data=dict(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),sender=sender,registration=reg,animal=target,bull=bull,lot=lot,day='2026-09-20',stateQuery=query,cases=[701,710,711,712,713])
 proc=subprocess.run(['node',str(Path(__file__).with_name('hato-quick-telegram-native.mjs'))],input=json.dumps(data),text=True,capture_output=True,cwd=r.ROOT,timeout=90)
 if proc.returncode:
  p=Path('/tmp/escocia-quick-sdk-private.log');p.touch(mode=0o600,exist_ok=True);p.write_text(proc.stderr);raise ValueError('Actual quick native SDK failed; private diagnostics saved')
 exercise.sdk=json.loads(proc.stdout);check(exercise.sdk['assertions']>=15,'actual conversation/private recovery SDK agrees with independent native event/usage/audit')
def main():
 a=argparse.ArgumentParser();a.add_argument('--evidence-dir',type=Path,required=True)
 for n in ('runtime','client','output','private-diagnostics'):a.add_argument('--'+n,type=Path,required=True)
 args=a.parse_args();exercise.client=args.client.resolve();files=[*sorted((r.ROOT/'src/sql/security-candidates').glob('*.sql')),Path(__file__),Path(__file__).with_name('hato-quick-telegram-native.mjs'),Path(__file__).with_name('hato-birth-telegram-replay.py'),r.ROOT/'src/utils/hato/hatoQuickTelegramProtocol.ts',r.ROOT/'src/utils/hato/criaAutomatica.ts']
 for root in ('src/supabase/functions/server','supabase/functions/make-server-1ccce916'):
  files.extend(r.ROOT/root/'telegram'/name for name in ('quickCreation.ts','quickCreationProtocol.ts','bot.ts','types.ts','conversations/eventoHato.ts','alertResponseProtocol.ts'));files.extend(r.ROOT/root/name for name in ('calculos-hato.ts','hato-config-desde-tabla.ts'));files.append(r.ROOT/root/'telegram/fechaDDMM.ts')
 sources={p:p.read_bytes() for p in files};catalog,rls,hashes=r.load(args.evidence_dir.resolve())
 if args.output.resolve().is_relative_to(args.evidence_dir.resolve()) or args.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(args.runtime.resolve(),args.client.resolve(),args.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(p.read_bytes()!=b for p,b in sources.items()):raise ValueError('Changing quick source cannot be certified')
 result.update(coordinated_candidate_count=30,admission_rollback_probes=4,sdk_proof=exercise.sdk,source_hashes={str(p.relative_to(r.ROOT)):r.p.digest(b) for p,b in sources.items()},temporary_database_stopped_and_removed=True,limits=['Four local private metadata exports and synthetic Auth/private socket only; never production.','Browser standalone pajilla/corrections/generic grant retirement/hosted drain/readers/runtime/global/capacity/recovery remain open.'])
 args.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
