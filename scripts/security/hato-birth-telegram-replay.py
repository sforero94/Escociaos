#!/usr/bin/env python3
"""Native private-action births, on the four-export local replay only."""
import argparse
import concurrent.futures
import importlib.util
import json
import subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('cycle',Path(__file__).with_name('hato-cycle-replay.py'))
t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
c,r,lit,js,u=t.c,t.r,t.lit,t.js,t.u
SOURCE=r.ROOT/'src/sql/security-candidates/hato-birth-telegram.sql'
def state_query(sql):return t.t.t.state_query(sql)
def install(sql):
 t.install(sql);query=state_query(sql);before=sql(query)
 for ddl,marker in (("ALTER TABLE hato_toros ADD COLUMN synthetic_unreviewed boolean;",'Unreviewed birth source graph'),("ALTER TABLE hato_eventos FORCE ROW LEVEL SECURITY;",'Unreviewed birth source graph'),("ALTER FUNCTION hato_treatment_creation.telegram_actor(bigint,bigint,bigint) SET search_path=public;",'Unreviewed birth actor helper')):
  failure=sql('BEGIN;'+ddl+SOURCE.read_text(),False)
  if failure.returncode==0 or marker not in failure.stderr or sql(query)!=before or sql("SELECT to_regnamespace('hato_birth_telegram') IS NULL;")!='t':raise AssertionError('Birth admission rollback')
 sql(SOURCE.read_text())
 if sql(query)!=before:raise AssertionError('Birth install changed existing rows')
def exercise(sql,ctx):
 check,call=ctx['check'],ctx['call'];target=ctx['treated']['payload']['animalId'];query=state_query(sql);state=lambda:sql(query)
 # Genuine synthetic unlinked field worker. No fabricated profile/Auth UID.
 reg=c.uid();sender=98765
 sql('INSERT INTO telegram_usuarios(id,telegram_id,nombre_display,activo,modulos_permitidos,usuario_id) VALUES('+u(reg)+","+str(sender)+",'Synthetic field birth',true,ARRAY['hato_produccion'],NULL);INSERT INTO hato_config(clave,valor) VALUES('meses_gestacion_default','9'::jsonb) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor;")
 def birth(mode,message,intent=None,who=sender,chat=None,ok=True):return call('fn_hato_birth_telegram',[lit(mode),str(who)+'::bigint',str(chat if chat is not None else who)+'::bigint',str(message)+'::bigint',js(intent) if intent is not None else 'NULL::jsonb'],actor=None,role='service_role',ok=ok)
 animal=json.loads(sql('SELECT to_jsonb(x) FROM hato_animales x WHERE id='+u(target)+';'));day=sql("SELECT to_char((now() AT TIME ZONE 'America/Bogota')::date,'YYYY-MM-DD');")
 intent=dict(version=1,animalId=target,fecha=day,criaDestino='retenida',observedAnimal=animal);message=701;prepared=birth('prepare',message,intent)
 check(prepared['state']=='pending' and prepared['actor']['profileId'] is None and prepared['plan']['calf']['created_by'] is None,'original private action reserves genuine unlinked-worker event/calf with protected registration audit')
 before=state();check(birth('prepare',message,intent)==prepared and state()==before,'same native action never replaces original key/source/event/calf plan')
 def refuse(label,fn,marker):
  before=state();failure=fn()
  if failure.returncode==0 or marker.lower() not in failure.stderr.lower() or state()!=before:
   p=Path('/tmp/escocia-birth-unexpected-private.log');p.touch(mode=0o600,exist_ok=True);p.write_text(failure.stderr);raise AssertionError(label+' refusal/rollback; private diagnostics saved')
  check(True,label+' refuses with complete rollback')
 def raw(ddl,msg=message):return sql('BEGIN;'+ddl+"SET LOCAL ROLE service_role;SELECT fn_hato_birth_telegram('post',"+str(sender)+','+str(sender)+','+str(msg)+',NULL::jsonb);COMMIT;',False)
 refuse('group action',lambda:birth('prepare',702,intent,chat=-100,ok=False),'private')
 refuse('missing registration',lambda:birth('status',message,who=87654,ok=False),'registration')
 refuse('stale mother',lambda:raw("UPDATE hato_animales SET notas='Competing source' WHERE id="+u(target)+';'),'graph changed')
 refuse('revoked worker',lambda:raw('UPDATE telegram_usuarios SET activo=false WHERE id='+u(reg)+';'),'registration')
 refuse('module loss',lambda:raw("UPDATE telegram_usuarios SET modulos_permitidos=ARRAY[]::text[] WHERE id="+u(reg)+';'),'registration')
 refuse('rebound registration',lambda:raw('UPDATE telegram_usuarios SET usuario_id='+u(c.OWNER)+' WHERE id='+u(reg)+';'),'actor changed')
 for table,event,body,marker in [('public.hato_animales','BEFORE INSERT','RETURN NULL;','calf suppressed'),('public.hato_eventos','BEFORE INSERT','RETURN NULL;','event suppressed'),('hato_birth_telegram.audit','BEFORE INSERT','RETURN NULL;','audit suppressed'),('hato_birth_telegram.requests','BEFORE UPDATE','RETURN NULL;','control suppressed')]:
  ddl='CREATE FUNCTION public.synthetic_birth_fault() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN '+body+' END $f$;CREATE TRIGGER synthetic_birth_fault '+event+' ON '+table+' FOR EACH ROW EXECUTE FUNCTION public.synthetic_birth_fault();';refuse(table+' suppression',lambda ddl=ddl:raw(ddl),marker)
 for label,ddl,marker in [('calf corruption',"CREATE FUNCTION public.synthetic_birth_fault() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN NEW.nombre='Wrong calf';RETURN NEW;END $f$;CREATE TRIGGER synthetic_birth_fault BEFORE INSERT ON hato_animales FOR EACH ROW EXECUTE FUNCTION synthetic_birth_fault();",'calf suppressed'),('late worker revocation',"CREATE FUNCTION public.synthetic_birth_fault() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN UPDATE public.telegram_usuarios SET activo=false WHERE id="+u(reg)+";RETURN NEW;END $f$;CREATE TRIGGER synthetic_birth_fault AFTER INSERT ON hato_eventos FOR EACH ROW EXECUTE FUNCTION synthetic_birth_fault();",'registration')]:refuse(label,lambda ddl=ddl:raw(ddl),marker)
 competing=703;refuse('replacement private preparation',lambda:birth('prepare',competing,intent,ok=False),'original protected action');before=json.loads(state())
 with concurrent.futures.ThreadPoolExecutor(2) as pool:
  a=pool.submit(birth,'post',message);b=pool.submit(birth,'post',message);posted=a.result();other=b.result()
 after=json.loads(state());allowed={'public.hato_animales','public.hato_eventos','hato_birth_telegram.requests','hato_birth_telegram.audit'}
 check(all(v==after[k] for k,v in before.items() if k not in allowed),'atomic private birth preserves all unrelated financial/backup/clinical/correction/private rows')
 check(posted==other and posted['state']=='committed' and posted['receipt']['after']['animal']==animal,'concurrent native post creates one exact calf/event/registration audit without changing mother')
 refuse('unprepared replacement post',lambda:birth('post',competing,ok=False),'prepared birth')
 before=state();check(birth('status',message)==posted and birth('post',message)==posted and state()==before,'original private action recovers original receipt/IDs without session or repeat mutation')
 check(posted['receipt']['calf']['created_by'] is None and next(e for e in posted['receipt']['after']['events'] if e['id']==posted['plan']['events'][0]['id']).get('created_by') is None,'unlinked field worker never invents a profile creator')
 check(json.loads(sql('SELECT receipt FROM hato_birth_telegram.audit WHERE request_key='+u(posted['requestKey'])+';'))==posted['receipt'],'independent protected registration audit equals recovered receipt')
 fence=birth('resolve',704);check(fence['state']=='canceled' and birth('prepare',704,intent)==fence,'cancel before preparation permanently fences original native action')
 for role in ('anon','authenticated','service_role'):refuse(role+' private proof',lambda role=role:sql('BEGIN;SET LOCAL ROLE '+role+';SELECT * FROM hato_birth_telegram.requests;COMMIT;',False),'permission denied')
 for role in ('anon','authenticated'):refuse(role+' native impersonation',lambda role=role:sql('BEGIN;SET LOCAL ROLE '+role+";SELECT fn_hato_birth_telegram('status',"+str(sender)+','+str(sender)+',701,NULL::jsonb);COMMIT;',False),'permission denied')
 # Existing native nullable destination remains a birth without a calf/income.
 p=birth('prepare',705,dict(intent,fecha='2026-10-01',criaDestino=None));q=birth('post',705);check(p['plan']['calf'] is None and q['receipt']['calf'] is None,'unknown destination preserves null without inventing retained calf or sale')
 # Existing native births are never adopted as prospective proof or given another calf.
 refuse('replacement after committed birth',lambda:birth('prepare',706,intent,ok=False),'original protected action')
 sql('INSERT INTO hato_eventos(animal_id,tipo,fecha,fecha_confianza,fuente) VALUES('+u(target)+",'parto','2026-09-19','exacta','telegram');")
 refuse('legacy manual birth is never adopted',lambda:birth('prepare',708,dict(intent,fecha='2026-09-19'),ok=False),'Existing manual birth')
 linked_sender=87654;linked_reg=c.uid()
 sql('INSERT INTO telegram_usuarios(id,telegram_id,nombre_display,activo,modulos_permitidos,usuario_id) VALUES('+u(linked_reg)+","+str(linked_sender)+",'Synthetic linked birth',true,ARRAY['hato_produccion'],"+u(c.OWNER)+');')
 linked_intent=dict(intent,fecha='2026-09-20');birth('prepare',707,linked_intent,who=linked_sender);linked=birth('post',707,who=linked_sender)
 check(linked['actor']['profileId']==c.OWNER and linked['receipt']['calf']['created_by']==c.OWNER,'genuine linked active profile is preserved in calf/event registration proof')
 refused_profile='BEGIN;UPDATE usuarios SET activo=false WHERE id='+u(c.OWNER)+";SET LOCAL ROLE service_role;SELECT fn_hato_birth_telegram('status',"+str(linked_sender)+','+str(linked_sender)+',707,NULL::jsonb);COMMIT;'
 refuse('revoked linked profile recovery',lambda:sql(refused_profile,False),'linked profile')
 sdk_animal=c.uid();sql('INSERT INTO hato_animales(id,numero,nombre,etapa,estado) VALUES('+u(sdk_animal)+",77,'Synthetic native birth mother','vaca','activa');")
 data=dict(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),sender=sender,registration=reg,animal=sdk_animal,day=day,stateQuery=query)
 proc=subprocess.run(['node',str(Path(__file__).with_name('hato-birth-telegram-native.mjs'))],input=json.dumps(data),text=True,capture_output=True,cwd=r.ROOT,timeout=90)
 if proc.returncode:
  p=Path('/tmp/escocia-birth-sdk-private.log');p.touch(mode=0o600,exist_ok=True);p.write_text(proc.stderr);raise ValueError('Actual birth native SDK failed; private diagnostics saved')
 exercise.sdk=json.loads(proc.stdout);check(exercise.sdk['assertions']>=15,'actual conversation/private recovery SDK agrees with independent native calf/event/audit')
def main():
 a=argparse.ArgumentParser();a.add_argument('--evidence-dir',type=Path,required=True)
 for n in ('runtime','client','output','private-diagnostics'):a.add_argument('--'+n,type=Path,required=True)
 args=a.parse_args();exercise.client=args.client.resolve();files=[*sorted((r.ROOT/'src/sql/security-candidates').glob('*.sql')),Path(__file__),Path(__file__).with_name('hato-birth-telegram-native.mjs'),Path(__file__).with_name('hato-cycle-replay.py'),r.ROOT/'src/utils/hato/hatoBirthTelegramProtocol.ts',r.ROOT/'src/utils/hato/criaAutomatica.ts']
 for root in ('src/supabase/functions/server','supabase/functions/make-server-1ccce916'):
  files.extend(r.ROOT/root/'telegram'/name for name in ('birthCreation.ts','birthCreationProtocol.ts','bot.ts','types.ts','conversations/eventoHato.ts','alertResponseProtocol.ts'));files.append(r.ROOT/root/'hato-cria-automatica.ts')
 sources={p:p.read_bytes() for p in files};catalog,rls,hashes=r.load(args.evidence_dir.resolve())
 if args.output.resolve().is_relative_to(args.evidence_dir.resolve()) or args.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(args.runtime.resolve(),args.client.resolve(),args.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(p.read_bytes()!=b for p,b in sources.items()):raise ValueError('Changing birth source cannot be certified')
 result.update(coordinated_candidate_count=29,admission_rollback_probes=3,sdk_proof=exercise.sdk,source_hashes={str(p.relative_to(r.ROOT)):r.p.digest(b) for p,b in sources.items()},temporary_database_stopped_and_removed=True,limits=['Four local private metadata exports and synthetic Auth/private socket only; never production.','Other quick events/pajilla/corrections/generic grant retirement/hosted drain/readers/runtime/global/capacity/recovery remain open.'])
 args.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
