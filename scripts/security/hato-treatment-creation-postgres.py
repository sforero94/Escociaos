#!/usr/bin/env python3
"""Synthetic historical-DDL PG17.6 only. Cached image, no network/data/exports."""
import importlib.util,json,uuid,time,concurrent.futures,re
from pathlib import Path
spec=importlib.util.spec_from_file_location('manual',Path(__file__).with_name('manual-stock-postgres.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
m.NAME='escocia-hato-treatment-'+uuid.uuid4().hex[:12]
OWNER=m.OWNER;OTHER=m.OTHER;ANIMAL=m.PRODUCT

def literal(value):return m.literal(json.dumps(value))+'::jsonb'
def proposal(next_date='2026-10-15'):
 return dict(version=1,animalId=ANIMAL,nombre='Tratamiento de prueba',fechaInicio='2026-10-12',nota=None,fechaProximoPaso=next_date,descripcionPaso=None,observedAnimal=json.loads(m.sql(f"SELECT to_jsonb(a) FROM public.hato_animales a WHERE id='{ANIMAL}';")))
def web(p,key,action='prepare',actor=OWNER,role='authenticated',ok=True):
 out=m.sql(f"BEGIN;SET LOCAL ROLE {role};SET LOCAL request.jwt.claim.sub={m.literal(actor or '')};SELECT public.fn_hato_treatment_create_web({m.literal(action) if action is not None else 'NULL'},{m.literal(key) if key else 'NULL'}::uuid,{literal(p)});COMMIT;",ok);return json.loads(out) if ok else out

def telegram(p,action='prepare',sender=123,message=1,key=None,chat=None,role='service_role',ok=True):
 out=m.sql(f"BEGIN;SET LOCAL ROLE {role};SELECT public.fn_hato_treatment_create_telegram({m.literal(action) if action is not None else 'NULL'},{sender if sender is not None else 'NULL'},{chat if chat is not None else sender if sender is not None else 'NULL'},{message if message is not None else 'NULL'},{literal(p)},{m.literal(key) if key else 'NULL'}::uuid);COMMIT;",ok);return json.loads(out) if ok else out

def state():return m.sql("SELECT jsonb_build_array((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.hato_tratamientos t),(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.hato_tratamiento_pasos t),(SELECT jsonb_agg(to_jsonb(t) ORDER BY request_key) FROM hato_treatment_creation.requests t),(SELECT jsonb_agg(to_jsonb(t) ORDER BY request_key) FROM hato_treatment_creation.audit t),(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.hato_animales t),(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.usuarios t));")
def reject(call,label):
 before=state();call();m.verify(state()==before,label)
def fixture():
 m.sql(f"""
 CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;
 CREATE TYPE public.rol_usuario AS ENUM('Administrador','Gerencia','Campo');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE TABLE auth.users(id uuid PRIMARY KEY);INSERT INTO auth.users VALUES('{OWNER}'),('{OTHER}');
 CREATE TABLE public.usuarios(id uuid PRIMARY KEY REFERENCES auth.users(id),rol rol_usuario,activo boolean);
 INSERT INTO public.usuarios VALUES('{OWNER}','Administrador',true),('{OTHER}','Gerencia',true);
 CREATE TABLE public.telegram_usuarios(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),telegram_id bigint UNIQUE,usuario_id uuid REFERENCES public.usuarios(id),activo boolean,modulos_permitidos text[],nombre_display text);
 INSERT INTO public.telegram_usuarios(telegram_id,usuario_id,activo,modulos_permitidos,nombre_display) VALUES(123,'{OWNER}',true,ARRAY['hato_produccion'],'Creación vinculada'),(456,NULL,true,ARRAY['hato_produccion'],'Campo sin vínculo');
 CREATE TABLE public.hato_toros(id uuid PRIMARY KEY);CREATE TABLE public.gan_fincas(id uuid PRIMARY KEY);CREATE TABLE public.hato_chequeos(id uuid PRIMARY KEY);
 """)
 source=(m.ROOT/'src/sql/migrations/053_create_hato_core.sql').read_text();table=re.search(r'CREATE TABLE IF NOT EXISTS hato_animales \([\s\S]*?\n\);',source).group();m.sql(table)
 m.sql((m.ROOT/'src/sql/migrations/055_create_hato_tratamientos.sql').read_text());m.sql((m.ROOT/'src/sql/migrations/140_hato_registrar_tratamiento.sql').read_text())
 m.sql(f"INSERT INTO public.hato_animales(id,numero,nombre,etapa,estado) VALUES('{ANIMAL}',1,'Animal de prueba','vaca','activa');GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role;GRANT SELECT ON public.usuarios TO authenticated;GRANT SELECT,INSERT,UPDATE,DELETE ON public.hato_tratamientos,public.hato_tratamiento_pasos TO authenticated,service_role;")

INSTALL_FINGERPRINT="""SELECT md5(jsonb_agg(jsonb_build_object('table',c.relname,'owner',pg_get_userbyid(c.relowner),'kind',c.relkind,'rls',c.relrowsecurity,
 'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_object('name',conname,'type',contype,'validated',convalidated,'deferred',condeferrable,'initiallyDeferred',condeferred,'definition',pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid=c.oid),
 'policies',(SELECT jsonb_agg(jsonb_build_object('name',polname,'command',polcmd,'permissive',polpermissive,'roles',(SELECT jsonb_agg(rolname ORDER BY rolname) FROM pg_roles WHERE oid=ANY(polroles)),'using',pg_get_expr(polqual,polrelid),'check',pg_get_expr(polwithcheck,polrelid)) ORDER BY polname) FROM pg_policy WHERE polrelid=c.oid),
 'grants',(SELECT jsonb_agg(jsonb_build_object('grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,'privilege',x.privilege_type,'grantable',x.is_grantable) ORDER BY x.grantee,x.privilege_type) FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x)) ORDER BY c.relname)::text)
 FROM pg_class c WHERE c.oid IN('public.hato_tratamientos'::regclass,'public.hato_tratamiento_pasos'::regclass);"""

def run():
 m.docker(['image','inspect',m.IMAGE])
 try:
  m.docker(['run','-d','--pull=never','--name',m.NAME,'--network=none','--tmpfs','/var/lib/postgresql/data:rw','--tmpfs','/var/run/postgresql:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust',m.IMAGE])
  deadline=time.monotonic()+30
  while m.docker(['exec',m.NAME,'cat','/proc/1/comm'],check=False).stdout.strip()!='postgres' or m.docker(['exec','-u','postgres',m.NAME,'pg_isready'],check=False).returncode:
   if time.monotonic()>deadline:raise AssertionError('readiness timeout')
   time.sleep(.1)
  config=json.loads(m.docker(['inspect',m.NAME]).stdout)[0];m.verify(config['HostConfig']['NetworkMode']=='none' and not config['HostConfig']['Binds'] and not config['HostConfig']['PortBindings'] and all(x['Type']=='tmpfs' for x in config['Mounts']),'isolated cached tmpfs network-none no binds/ports');m.verify(m.sql('SHOW server_version;').startswith('17.6'),'pinned PG17.6')
  fixture();print('Synthetic identity fingerprint',m.sql(INSTALL_FINGERPRINT.replace("'public.hato_tratamientos'::regclass,'public.hato_tratamiento_pasos'::regclass","'public.hato_animales'::regclass,'public.usuarios'::regclass,'public.telegram_usuarios'::regclass")),flush=True);print('Synthetic install fingerprint',m.sql(INSTALL_FINGERPRINT),flush=True);candidate=(m.ROOT/'src/sql/security-candidates/hato-treatment-creation.sql').read_text();m.sql(candidate)
  # Exercise installation gate independently without reinstalling protected schema.
  gate=candidate.split('CREATE SCHEMA hato_treatment_creation;')[0].replace('BEGIN;','',1)
  drift=["ALTER TABLE public.hato_tratamientos ADD COLUMN unexpected text", "ALTER TABLE public.hato_tratamientos ALTER COLUMN fecha_inicio DROP NOT NULL", "ALTER TABLE public.hato_tratamientos ALTER COLUMN estado SET DEFAULT 'completado'", "ALTER TABLE public.hato_tratamientos DROP CONSTRAINT hato_tratamientos_animal_id_fkey", "GRANT SELECT ON public.hato_tratamientos TO anon", "ALTER TABLE public.hato_tratamiento_pasos DISABLE ROW LEVEL SECURITY", "ALTER TABLE public.telegram_usuarios DROP CONSTRAINT telegram_usuarios_telegram_id_key", "ALTER TABLE public.usuarios ADD COLUMN unexpected text", "ALTER TABLE public.hato_animales ADD COLUMN unexpected text", "ALTER TABLE public.telegram_usuarios ALTER COLUMN activo SET DEFAULT true"]
  for mutation in drift:
   m.sql('BEGIN;'+mutation+';'+gate+'ROLLBACK;',False);m.verify(True,'installation refuses shape drift '+mutation)
  p=proposal();key=str(uuid.uuid4());r=web(p,key);m.verify(r['state']=='pending' and r['payload']==p,'human immutable proposal reservation');r=web(p,key,'post');m.verify(r['state']=='committed' and len(r['receipt']['after']['steps'])==1,'header plus mandatory requested pending step committed')
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
  for role in ['Campo',None]:
   m.sql("UPDATE public.usuarios SET rol="+(m.literal(role)+"::rol_usuario" if role else 'NULL')+f" WHERE id='{OWNER}';")
   reject(lambda:web(p,str(uuid.uuid4()),ok=False),'fresh wrong/null human role refused')
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
  g=str(uuid.uuid4());web(p,g,actor=OTHER);m.verify(web(p,g,'post',actor=OTHER)['state']=='committed','Gerencia human creation remains allowed')
  m.sql(f"UPDATE public.usuarios SET rol='Campo' WHERE id='{OWNER}';")
  field=telegram(p,message=304);m.verify(telegram(p,'post',message=304,key=field['requestKey'])['state']=='committed','linked Campo Telegram lane remains allowed')
  m.sql(f"UPDATE public.usuarios SET rol='Administrador' WHERE id='{OWNER}';")
  reject(lambda:web(p,key,'status',actor=OTHER,ok=False),'cross-human key refused')
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
  for table in ['requests','audit']:
   for role in ['anon','authenticated','service_role']:
    m.sql('BEGIN;SET LOCAL ROLE '+role+';SELECT * FROM hato_treatment_creation.'+table+';COMMIT;',False);m.verify(True,'protected '+table+' no direct '+role+' access')
  m.sql(f"UPDATE hato_treatment_creation.audit SET receipt='{{}}'::jsonb WHERE request_key='{g}';",False);m.verify(True,'original audit proof cannot be mutated')
  m.sql(f"DELETE FROM hato_treatment_creation.requests WHERE request_key='{g}';",False);m.verify(True,'terminal request cannot be deleted')
  # Corrupt durable proof is never accepted on committed replay.
  m.sql("ALTER TABLE hato_treatment_creation.audit DISABLE TRIGGER immutable_creation_proof;")
  m.sql(f"DELETE FROM hato_treatment_creation.audit WHERE request_key='{g}';")
  reject(lambda:web(p,g,'status',actor=OTHER,ok=False),'missing immutable audit refuses committed replay')
  print('Treatment foundation assertions',m.CHECKS,flush=True)
 finally:
  m.docker(['rm','-f',m.NAME],check=False);m.verify(m.docker(['inspect',m.NAME],check=False).returncode!=0,'finally cleanup verified')
if __name__=='__main__':run()
