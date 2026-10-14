#!/usr/bin/env python3
"""Shared synthetic treatment assertions; invoked by treatment-trigger-replay.py.

The former partial historical fixture is superseded by verified full replay.
"""
import importlib.util,json,uuid,concurrent.futures
from pathlib import Path
spec=importlib.util.spec_from_file_location('manual',Path(__file__).with_name('manual-stock-postgres.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
m.NAME='escocia-hato-treatment-'+uuid.uuid4().hex[:12]
OWNER=m.OWNER;OTHER=m.OTHER;ANIMAL=m.PRODUCT

def literal(value):return m.literal(json.dumps(value))+'::jsonb'
def proposal(next_date='2026-10-15'):
 return dict(version=1,animalId=ANIMAL,nombre='Tratamiento de prueba',fechaInicio='2026-10-12',nota=None,fechaProximoPaso=next_date,descripcionPaso=None,observedAnimal=json.loads(m.sql(f"SELECT to_jsonb(a) FROM public.hato_animales a WHERE id='{ANIMAL}';")))
def web(p,key,action='prepare',actor=OWNER,role='authenticated',ok=True,expected_owner=OWNER):
 out=m.sql(f"BEGIN;SET LOCAL ROLE {role};SET LOCAL request.jwt.claim.sub={m.literal(actor or '')};SELECT public.fn_hato_treatment_create_web({m.literal(action) if action is not None else 'NULL'},{m.literal(key) if key else 'NULL'}::uuid,{literal(p)},{m.literal(expected_owner) if expected_owner else 'NULL'}::uuid);COMMIT;",ok);return json.loads(out) if ok else out

def telegram(p,action='prepare',sender=123,message=1,key=None,chat=None,role='service_role',ok=True):
 out=m.sql(f"BEGIN;SET LOCAL ROLE {role};SELECT public.fn_hato_treatment_create_telegram({m.literal(action) if action is not None else 'NULL'},{sender if sender is not None else 'NULL'},{chat if chat is not None else sender if sender is not None else 'NULL'},{message if message is not None else 'NULL'},{literal(p)},{m.literal(key) if key else 'NULL'}::uuid);COMMIT;",ok);return json.loads(out) if ok else out

def native(action='status',sender=123,message=1,role='service_role',ok=True):
 out=m.sql(f"BEGIN;SET LOCAL ROLE {role};SELECT public.fn_hato_treatment_create_telegram_action({m.literal(action) if action is not None else 'NULL'},{sender},{sender},{message});COMMIT;",ok);return json.loads(out) if ok else out

def state():return m.sql("SELECT jsonb_build_array((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.hato_tratamientos t),(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.hato_tratamiento_pasos t),(SELECT jsonb_agg(to_jsonb(t) ORDER BY request_key) FROM hato_treatment_creation.requests t),(SELECT jsonb_agg(to_jsonb(t) ORDER BY request_key) FROM hato_treatment_creation.audit t),(SELECT jsonb_agg(to_jsonb(t) ORDER BY sender,chat_id,message_id) FROM hato_treatment_creation.action_fences t),(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.hato_animales t),(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.usuarios t),(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.telegram_usuarios t),(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.hato_correcciones t));")
def reject(call,label):
 before=state();call();m.verify(state()==before,label)
def exercise():
 p=proposal();
 for action in ['prepare','post','status','resolve']:
  reject(lambda:web(p,str(uuid.uuid4()),action,expected_owner=OTHER,ok=False),'expected owner mismatch no effect '+action)
 reject(lambda:web(p,str(uuid.uuid4()),expected_owner=None,ok=False),'null expected owner refused')
 key=str(uuid.uuid4());r=web(p,key);m.verify(r['state']=='pending' and r['payload']==p,'human immutable proposal reservation');r=web(p,key,'post');m.verify(r['state']=='committed' and len(r['receipt']['after']['steps'])==1,'header plus mandatory requested pending step committed')
 before=state();m.verify(web(p,key,'post')==r and state()==before,'lost human response exact key replay no duplicate')
 q=proposal(None);k=str(uuid.uuid4());web(q,k);c=web(q,k,'post');m.verify(c['receipt']['after']['header']['estado']=='completado' and c['receipt']['after']['steps']==[],'no follow-up produces completed header with zero steps')
 t=telegram(p);m.verify(telegram(p)==t,'server action slot reuses same UUID after missing prepare response');tr=telegram(p,'post',key=t['requestKey']);m.verify(tr['receipt']['actor']['profileId']==OWNER and tr['receipt']['after']['header']['fuente']=='telegram','linked Telegram trusted source/creator receipt')
 unlinked=telegram(p,sender=456);ur=telegram(p,'post',sender=456,key=unlinked['requestKey']);m.verify(ur['receipt']['after']['header']['created_by'] is None and ur['actor']['registrationId'],'unlinked active Hato worker remains permitted and attributed by registration')
 # Admission, type/mode and original identity regression probes.
 for action in [None,'invalid']:
  reject(lambda:web(p,str(uuid.uuid4()),action,ok=False),'web invalid/null action refused')
  reject(lambda:telegram(p,action,message=300,ok=False),'Telegram invalid/null action refused')
 for field,value in [('version',None),('version','1'),('nombre',None),('nota',False),('fechaInicio','2026-02-30'),('fechaProximoPaso','2026-10-01'),('observedAnimal',None)]:
  bad=dict(p);bad[field]=value;reject(lambda:web(bad,str(uuid.uuid4()),ok=False),'invalid proposal '+field+' '+str(value))
 for role in ['Verificador']:
  m.sql("UPDATE public.usuarios SET rol="+(m.literal(role)+"::rol_usuario" if role else 'NULL')+f" WHERE id='{OWNER}';")
  reject(lambda:web(p,str(uuid.uuid4()),ok=False),'fresh valid non-manager human role refused')
 m.sql(f"UPDATE public.usuarios SET rol='Administrador',activo=false WHERE id='{OWNER}';")
 reject(lambda:web(p,str(uuid.uuid4()),ok=False),'inactive human refused')
 reject(lambda:telegram(p,message=301,ok=False),'inactive linked worker refused')
 m.sql(f"UPDATE public.usuarios SET activo=true WHERE id='{OWNER}';")
 reject(lambda:web(p,str(uuid.uuid4()),actor=None,ok=False),'missing human JWT refused')
 reject(lambda:telegram(p,message=302,role='authenticated',ok=False),'human cannot invoke service entry')
 reject(lambda:web(p,str(uuid.uuid4()),role='service_role',ok=False),'service cannot invoke human entry')
 reject(lambda:telegram(p,message=302,chat=-123,ok=False),'group/private mismatch refused')
 reject(lambda:telegram(p,message=302,key=str(uuid.uuid4()),ok=False),'first Telegram UUID server owned')
 for modules in ['NULL',"ARRAY[NULL]::text[]","ARRAY['other',NULL]::text[]"]:
  m.sql('UPDATE public.telegram_usuarios SET modulos_permitidos='+modules+' WHERE telegram_id=123;')
  reject(lambda:telegram(p,message=303,ok=False),'null/missing module refused '+modules)
 m.sql("UPDATE public.telegram_usuarios SET modulos_permitidos=ARRAY['hato_produccion'] WHERE telegram_id=123;")
 # Both historical human roles and Telegram non-manager linked worker lane.
 g=str(uuid.uuid4());web(p,g,actor=OTHER,expected_owner=OTHER);m.verify(web(p,g,'post',actor=OTHER,expected_owner=OTHER)['state']=='committed','Gerencia human creation remains allowed')
 m.sql(f"UPDATE public.usuarios SET rol='Verificador' WHERE id='{OWNER}';")
 field=telegram(p,message=304);m.verify(telegram(p,'post',message=304,key=field['requestKey'])['state']=='committed','linked Verificador Telegram lane remains allowed')
 m.sql(f"UPDATE public.usuarios SET rol='Administrador' WHERE id='{OWNER}';")
 reject(lambda:web(p,key,'status',actor=OTHER,expected_owner=OTHER,ok=False),'cross-human key refused')
 changed=dict(p);changed['nombre']='Changed'
 reject(lambda:web(changed,key,'status',ok=False),'same key changed original payload refused')
 reject(lambda:telegram(changed,message=1,ok=False),'same Telegram slot changed payload refused')
 reject(lambda:telegram(p,'post',message=1,key=str(uuid.uuid4()),ok=False),'substituted Telegram UUID refused')
 relink=telegram(p,message=305)
 m.sql(f"UPDATE public.telegram_usuarios SET usuario_id='{OTHER}' WHERE telegram_id=123;")
 reject(lambda:telegram(p,'post',message=305,key=relink['requestKey'],ok=False),'registration relink cannot transfer old attempt')
 m.sql(f"UPDATE public.telegram_usuarios SET usuario_id='{OWNER}' WHERE telegram_id=123;")
 # Original snapshot CAS and explicit cancellation fences.
 fresh=str(uuid.uuid4());web(p,fresh);m.sql(f"UPDATE public.hato_animales SET nombre='Changed' WHERE id='{ANIMAL}';")
 reject(lambda:web(p,fresh,'post',ok=False),'changed animal refuses pending post')
 reject(lambda:web(p,str(uuid.uuid4()),ok=False),'changed animal refuses prepare')
 m.verify(web(p,fresh,'resolve')['state']=='canceled','cancel original changed target remains possible')
 m.sql(f"UPDATE public.hato_animales SET nombre='Animal de prueba' WHERE id='{ANIMAL}';")
 absent=str(uuid.uuid4());m.verify(web(p,absent,'status')['state']=='unknown','absent status never creates cancellation')
 m.verify(web(p,absent,'resolve')['state']=='canceled' and web(p,absent)['state']=='canceled','human cancel before delayed first prepare is durable')
 reject(lambda:web(p,absent,'post',ok=False),'human canceled attempt cannot post')
 m.verify(telegram(p,'status',message=306)['state']=='unknown','absent Telegram slot status unknown')
 canceled=telegram(p,'resolve',message=306);m.verify(telegram(p,message=306)==canceled,'Telegram cancel fences delayed first prepare same server UUID')
 reject(lambda:telegram(p,'post',message=306,key=canceled['requestKey'],ok=False),'Telegram canceled attempt cannot post')
 m.verify(web(p,key,'resolve')==r,'committed cancel preserves original receipt')
 # Legitimate later correction/deletion never recreates immutable creation state.
 m.sql(f"UPDATE public.hato_tratamiento_pasos SET fecha_ejecutada='2026-10-15' WHERE tratamiento_id='{r['receipt']['after']['header']['id']}';")
 m.verify(web(p,key,'status')==r,'status returns original creation proof after later step execution')
 m.sql(f"DELETE FROM public.hato_tratamientos WHERE id='{r['receipt']['after']['header']['id']}';")
 before=state();m.verify(web(p,key,'post')==r and state()==before,'replay after legitimate deletion never recreates treatment')
 # Runtime fault triggers deliberately added after install, each entire write rolls back.
 faults=[('public.hato_tratamientos','INSERT','RETURN NULL;'),('public.hato_tratamientos','INSERT',"NEW.nombre='Mutated';RETURN NEW;"),('public.hato_tratamiento_pasos','INSERT','RETURN NULL;'),('public.hato_tratamiento_pasos','INSERT','NEW.requiere_confirmacion=false;RETURN NEW;'),('hato_treatment_creation.audit','INSERT','RETURN NULL;'),('hato_treatment_creation.audit','INSERT',"NEW.receipt='{}'::jsonb;RETURN NEW;"),('hato_treatment_creation.requests','UPDATE','RETURN NULL;'),('hato_treatment_creation.requests','UPDATE',"NEW.receipt='{}'::jsonb;RETURN NEW;"),('public.hato_tratamientos','INSERT',f"UPDATE public.usuarios SET activo=false WHERE id='{OWNER}';RETURN NEW;"),('public.hato_tratamientos','INSERT',f"UPDATE public.hato_animales SET nombre='Drift' WHERE id='{ANIMAL}';RETURN NEW;"),('public.hato_tratamiento_pasos','INSERT',"UPDATE public.hato_tratamientos SET nota='Side effect' WHERE id<>NEW.tratamiento_id;RETURN NEW;")]
 for table,event,body in faults:
  k=str(uuid.uuid4());web(p,k)
  m.sql('CREATE FUNCTION public.treatment_fault() RETURNS trigger LANGUAGE plpgsql AS $fault$BEGIN '+body+' END$fault$;CREATE TRIGGER treatment_fault BEFORE '+event+' ON '+table+' FOR EACH ROW EXECUTE FUNCTION public.treatment_fault();')
  reject(lambda:web(p,k,'post',ok=False),'atomic rollback fault '+table+' '+body)
  m.sql('DROP TRIGGER treatment_fault ON '+table+';DROP FUNCTION public.treatment_fault();')
 for body in ['RETURN NULL;',"NEW.state='canceled';RETURN NEW;"]:
  m.sql('CREATE FUNCTION public.treatment_fault() RETURNS trigger LANGUAGE plpgsql AS $fault$BEGIN '+body+' END$fault$;CREATE TRIGGER treatment_fault BEFORE INSERT ON hato_treatment_creation.requests FOR EACH ROW EXECUTE FUNCTION public.treatment_fault();')
  reject(lambda:web(p,str(uuid.uuid4()),ok=False),'reservation exact persisted proof '+body)
  m.sql('DROP TRIGGER treatment_fault ON hato_treatment_creation.requests;DROP FUNCTION public.treatment_fault();')
 # Same durable identities serialize concurrent prepare/post and cancellation.
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  a,b=[x.result() for x in [pool.submit(telegram,p,message=400),pool.submit(telegram,p,message=400)]]
  m.verify(a==b,'concurrent Telegram first prepare shares one server slot UUID')
  a,b=[x.result() for x in [pool.submit(telegram,p,'post',message=400,key=a['requestKey']),pool.submit(telegram,p,'post',message=400,key=a['requestKey'])]]
  m.verify(a==b and a['state']=='committed','concurrent same-slot posts share exact immutable receipt')
 race=str(uuid.uuid4());web(p,race)
 def racepost():
  try:return web(p,race,'post')['state']
  except AssertionError:return 'refused'
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  x,y=pool.submit(racepost),pool.submit(web,p,race,'resolve');x=x.result();y=y.result()
 final=web(p,race,'status');m.verify((final['state']=='committed' and x=='committed' and y['state']=='committed') or (final['state']=='canceled' and x=='refused' and y['state']=='canceled'),'post/cancel race chooses one durable terminal state')
 def snapshot(role='service_role',sender=123,ok=True):
  return m.sql(f"BEGIN;SET LOCAL ROLE {role};SELECT public.fn_hato_treatment_snapshot_telegram({sender},{sender},77,'{ANIMAL}');COMMIT;",ok)
 snap=json.loads(snapshot());m.verify(snap['animal']==p['observedAnimal'],'full original treatment snapshot under native authority')
 for role in ['anon','authenticated']:
  reject(lambda role=role:snapshot(role=role,ok=False),'snapshot denies ordinary caller '+role)
 m.sql('UPDATE public.usuarios SET activo=false;')
 reject(lambda:snapshot(ok=False),'snapshot refuses inactive linked profile before data disclosure')
 m.sql('UPDATE public.usuarios SET activo=true;')
 m.sql("UPDATE public.telegram_usuarios SET modulos_permitidos=ARRAY[]::text[] WHERE telegram_id=123;")
 reject(lambda:snapshot(ok=False),'snapshot refuses revoked Hato module')
 m.sql("UPDATE public.telegram_usuarios SET modulos_permitidos=ARRAY['hato_produccion'] WHERE telegram_id=123;")
 m.verify(json.loads(snapshot(sender=456))['actor']['profileId'] is None,'snapshot preserves unlinked active worker lane')
 unchanged=state();m.verify(native(message=600)['state']=='unknown' and state()==unchanged,'native unknown status has no writes')
 canceled=native('resolve',message=600);m.verify(canceled['state']=='canceled' and canceled['payload'] is None,'native cancellation reserves server UUID without caller proposal')
 delayed=telegram(p,message=600);m.verify(delayed['state']=='canceled' and delayed['requestKey']==canceled['requestKey'],'delayed first prepare binds original proposal to same canceled UUID')
 m.verify(native('post',message=600)['state']=='canceled','native canceled replay never posts')
 first=telegram(p,message=601);posted=native('post',message=601)
 m.verify(posted['state']=='committed' and posted['requestKey']==first['requestKey'],'native post recovers original server-owned proposal/key')
 m.verify(native(message=601)==posted and native('post',message=601)==posted and native('resolve',message=601)==posted,'native status/retry/cancel return original committed receipt')
 for role in ['anon','authenticated']:
  reject(lambda role=role:native(message=601,role=role,ok=False),'native recovery service-only '+role)
 for mode in [None,'prepare','forged']:
  reject(lambda mode=mode:native(mode,message=601,ok=False),'native malformed operation refuses without effects')
 m.sql(f"UPDATE public.telegram_usuarios SET usuario_id='{OTHER}' WHERE telegram_id=123;")
 reject(lambda:native(message=601,ok=False),'native relink cannot recover another actor original proof')
 m.sql(f"UPDATE public.telegram_usuarios SET usuario_id='{OWNER}' WHERE telegram_id=123;")
 m.sql('UPDATE public.usuarios SET activo=false;')
 reject(lambda:native(message=601,ok=False),'native linked revocation refuses committed disclosure')
 m.sql('UPDATE public.usuarios SET activo=true;')
 for fault in ['RETURN NULL;',"NEW.request_key=gen_random_uuid();RETURN NEW;",f"UPDATE public.usuarios SET activo=false WHERE id='{OWNER}';RETURN NEW;"]:
  m.sql('CREATE FUNCTION public.native_fault() RETURNS trigger LANGUAGE plpgsql AS $f$BEGIN '+fault+' END$f$;CREATE TRIGGER native_fault BEFORE INSERT ON hato_treatment_creation.action_fences FOR EACH ROW EXECUTE FUNCTION public.native_fault();')
  # UUID mutation is a mismatch against the exact expected server-owned row.
  reject(lambda:native('resolve',message=602,ok=False),'native fence trigger corruption/suppression rolls back')
  m.sql('DROP TRIGGER native_fault ON hato_treatment_creation.action_fences;DROP FUNCTION public.native_fault();')
 with concurrent.futures.ThreadPoolExecutor(2) as pool:
  prep,cancel=[f.result() for f in [pool.submit(telegram,p,message=603),pool.submit(native,'resolve',123,603)]]
 m.verify(native(message=603)['state']=='canceled' and prep['requestKey']==cancel['requestKey'],'native cancel/first prepare race shares original key and cancellation')
 m.verify(native('resolve',sender=456,message=604)['actor']['profileId'] is None,'native unlinked active Hato worker retained')
 m.sql(f"DELETE FROM hato_treatment_creation.action_fences WHERE message_id=604;",False);m.verify(True,'native fence cannot be deleted')
 for table in ['requests','audit','action_fences']:
  for role in ['anon','authenticated','service_role']:
   m.sql('BEGIN;SET LOCAL ROLE '+role+';SELECT * FROM hato_treatment_creation.'+table+';COMMIT;',False);m.verify(True,'protected '+table+' no direct '+role+' access')
 m.sql(f"UPDATE hato_treatment_creation.audit SET receipt='{{}}'::jsonb WHERE request_key='{g}';",False);m.verify(True,'original audit proof cannot be mutated')
 m.sql(f"DELETE FROM hato_treatment_creation.requests WHERE request_key='{g}';",False);m.verify(True,'terminal request cannot be deleted')
 # Corruption is introduced only inside a failing transaction; original audit
 # and enabled trigger must be restored before the rehearsal finishes.
 before=state()
 failure=m.sql(f"BEGIN;ALTER TABLE hato_treatment_creation.audit DISABLE TRIGGER immutable_creation_proof;DELETE FROM hato_treatment_creation.audit WHERE request_key='{g}';SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='{OTHER}';SELECT public.fn_hato_treatment_create_web('status','{g}',{literal(p)},'{OTHER}');ROLLBACK;",False)
 m.verify('Treatment committed audit proof missing' in failure and state()==before,'missing immutable audit refuses committed replay and rollback restores proof')

if __name__=='__main__':
 raise SystemExit('Historical fixture superseded: run treatment-trigger-replay.py on reconciled local exports')
