#!/usr/bin/env python3
"""Synthetic isolated PG17.6 ACL/state tests; no live Storage/metadata requests."""
import importlib.util,json,uuid,concurrent.futures,time
from pathlib import Path
spec=importlib.util.spec_from_file_location('manual',Path(__file__).with_name('manual-stock-postgres.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
m.NAME='escocia-invoice-'+uuid.uuid4().hex[:12]
OWNER=m.OWNER;OTHER=m.OTHER

def identity(key=None,target=None,generation=None):return dict(requestKey=key or str(uuid.uuid4()),protocolVersion=1,targetKey=target or str(uuid.uuid4()),generation=generation or str(uuid.uuid4()),tipo='compra',sha256='a'*64,size=20,mime='application/pdf',extension='pdf',sourceExtension='pdf')
def sql_call(name,args,role='service_role',ok=True):
 out=m.sql(f'BEGIN;SET LOCAL ROLE {role};SELECT public.{name}({args});COMMIT;',ok);return json.loads(out) if ok else out

def target(t,action='activate',actor=OWNER,ok=True):return sql_call('fn_invoice_upload_target',f"'{actor}','{t}',{m.literal(action)}",ok=ok)
def step(p,action='reserve',actor=OWNER,sha=None,ok=True,role='service_role'):
 return sql_call('fn_invoice_upload_step',f"'{actor}',{m.literal(action)},{m.literal(json.dumps(p))}::jsonb,{m.literal(sha) if sha is not None else 'NULL'}",role,ok)
def prepare(actor=OWNER):
 p=identity();p['generation']=target(p['targetKey'],actor=actor)['generation'];return p

def state():return m.sql("SELECT jsonb_build_array((SELECT jsonb_agg(to_jsonb(r) ORDER BY owner,request_key) FROM invoice_upload.requests r),(SELECT jsonb_agg(to_jsonb(t) ORDER BY owner,target_key) FROM invoice_upload.targets t),(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM storage.objects o));")
def read(path,actor=OWNER):return m.sql(f"BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='{actor}';SELECT count(*) FROM storage.objects WHERE bucket_id='facturas' AND name={m.literal(path)};COMMIT;")
def reject(p,label,action='reserve',actor=OWNER,role='service_role'):
 before=state();step(p,action,actor,sha=p['sha256'] if action=='finalize' else None,ok=False,role=role);m.verify(state()==before,label)
def run():
 m.docker(['image','inspect',m.IMAGE])
 try:
  m.docker(['run','-d','--pull=never','--name',m.NAME,'--network=none','--tmpfs','/var/lib/postgresql/data:rw','--tmpfs','/var/run/postgresql:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust',m.IMAGE])
  deadline=time.monotonic()+30
  while m.docker(['exec',m.NAME,'cat','/proc/1/comm'],check=False).stdout.strip()!='postgres' or m.docker(['exec','-u','postgres',m.NAME,'pg_isready'],check=False).returncode:
   if time.monotonic()>deadline:raise AssertionError('readiness timeout')
   time.sleep(.1)
  config=json.loads(m.docker(['inspect',m.NAME]).stdout)[0]
  m.verify(config['HostConfig']['NetworkMode']=='none' and not config['HostConfig']['Binds'] and not config['HostConfig']['PortBindings'] and all(x['Type']=='tmpfs' for x in config['Mounts']),'isolated network-none tmpfs no binds/ports')
  m.verify(m.sql('SHOW server_version;').startswith('17.6'),'pinned PG17.6')
  m.sql(f"""
  CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE SCHEMA storage;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  CREATE TABLE public.usuarios(id uuid PRIMARY KEY,rol text,activo bool);
  INSERT INTO public.usuarios VALUES('{OWNER}','Administrador',true),('{OTHER}','Gerencia',true);
  CREATE TABLE public.compras(id uuid PRIMARY KEY,url_factura text,link_factura text);CREATE TABLE public.fin_gastos(id uuid PRIMARY KEY,url_factura text);CREATE TABLE public.fin_ingresos(id uuid PRIMARY KEY,url_factura text);
  CREATE TABLE storage.buckets(id text PRIMARY KEY,public bool);INSERT INTO storage.buckets VALUES('facturas',false),('other',false);
  CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text,owner_id text,UNIQUE(bucket_id,name));ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  GRANT USAGE ON SCHEMA storage,auth TO authenticated,service_role;GRANT SELECT ON public.usuarios TO authenticated;
  GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated,service_role;
  CREATE POLICY original_invoice_roles ON storage.objects FOR ALL TO authenticated USING(bucket_id='facturas' AND EXISTS(SELECT 1 FROM public.usuarios WHERE id=auth.uid() AND rol IN('Administrador','Gerencia'))) WITH CHECK(bucket_id='facturas' AND EXISTS(SELECT 1 FROM public.usuarios WHERE id=auth.uid() AND rol IN('Administrador','Gerencia')));
  CREATE POLICY original_other_bucket ON storage.objects FOR ALL TO authenticated USING(bucket_id='other') WITH CHECK(bucket_id='other');
  INSERT INTO storage.objects(bucket_id,name) VALUES('facturas','facturas_compra/legacy.pdf'),('other','old');
  """)
  candidate=(m.ROOT/'src/sql/security-candidates/invoice-server-validation.sql').read_text()
  m.sql("INSERT INTO storage.objects(bucket_id,name) VALUES('facturas','verified/collision.pdf');");m.sql(candidate,False);m.verify(m.sql("SELECT to_regnamespace('invoice_upload') IS NULL;")=='t','reserved namespace legacy collision refuses installation')
  m.sql("DELETE FROM storage.objects WHERE name='verified/collision.pdf';CREATE FUNCTION public.fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW;END$$;CREATE TRIGGER fault BEFORE INSERT ON storage.objects FOR EACH ROW EXECUTE FUNCTION public.fault();")
  m.sql(candidate,False);m.verify(m.sql("SELECT to_regnamespace('invoice_upload') IS NULL;")=='t','unreviewed current Storage trigger refuses installation')
  m.sql('DROP TRIGGER fault ON storage.objects;DROP FUNCTION public.fault();');m.sql(candidate)
  m.verify(read('facturas_compra/legacy.pdf')=='1' and read('facturas_compra/legacy.pdf',OTHER)=='1','legacy reader role parity preserved')
  p=prepare();r=step(p);path=r['path'];m.verify(r['state']=='pending' and path.startswith('verified/'),'durable owner target identity reservation')
  m.sql(f"BEGIN;SET LOCAL ROLE service_role;INSERT INTO storage.objects(bucket_id,name) VALUES('facturas',{m.literal(path)});COMMIT;")
  m.verify(m.sql(f"SELECT owner_id IS NULL FROM storage.objects WHERE name={m.literal(path)};")=='t','service upload does not fabricate human Storage owner_id')
  m.verify(read(path)=='0' and read(path,OTHER)=='0','pending blob cannot be listed/read by either business role')
  r=step(p,'uploaded');m.verify(r['state']=='uploaded' and read(path)=='0','uploaded readback remains invisible until finalize')
  r=step(p,'finalize',sha=p['sha256']);m.verify(r['state']=='committed' and read(path)=='1' and read(path,OTHER)=='1','fresh active current target commits visibility with role parity')
  before=state();m.verify(step(p)==r and state()==before,'same-key canonical replay no duplicate object receipt')
  reject(dict(p,sha256='b'*64),'changed digest same owner/key refuses');reject(p,'ordinary human cannot finalize directly','finalize',role='authenticated');reject(p,'anon cannot finalize directly','finalize',role='anon')
  for table in ['invoice_upload.targets','invoice_upload.requests','invoice_upload.executions']:
   m.sql(f'BEGIN;SET LOCAL ROLE authenticated;SELECT * FROM {table};ROLLBACK;',False);m.verify(True,'protected state denied '+table)
  missing=prepare();m.verify(step(missing,'status')['state']=='unknown','missing request status is unknown not canceled')
  close=str(uuid.uuid4());target(close,'invalidate');target(close,'activate',ok=False);m.verify(True,'close-before-late-activation target fence')
  revoked=prepare();rev=step(revoked);m.sql(f"INSERT INTO storage.objects(bucket_id,name) VALUES('facturas',{m.literal(rev['path'])});");step(revoked,'uploaded');m.sql(f"UPDATE public.usuarios SET activo=false WHERE id='{OWNER}';")
  qr=step(revoked,'finalize',sha=revoked['sha256']);m.verify(qr['state']=='quarantined' and qr['cleanupPending'] and read(rev['path'],OTHER)=='0','revocation between Storage and finalize fails closed quarantine')
  m.sql(f"UPDATE public.usuarios SET activo=true WHERE id='{OWNER}';")
  stale=prepare();sr=step(stale);step(stale,'uploaded');target(stale['targetKey'],'invalidate');m.verify(step(stale,'finalize',sha=stale['sha256'])['state']=='quarantined','current target invalidation cannot finalize late upload')
  mismatch=prepare();mr=step(mismatch);step(mismatch,'uploaded');m.verify(step(mismatch,'finalize',sha='b'*64)['state']=='quarantined','wrong actual byte hash cannot commit')
  step(mismatch,'cleanup-authorize');step(mismatch,'cleanup-observed',sha='absent');m.verify(m.sql(f"SELECT cleanup_pending AND cleanup_observed_absent FROM invoice_upload.requests WHERE request_key='{mismatch['requestKey']}';")=='f','no outstanding writes and explicit absence verifies cleanup without erasing tombstone')
  m.sql(f"INSERT INTO public.fin_gastos VALUES(gen_random_uuid(),{m.literal(mr['path'])});",False);m.verify(True,'quarantine reference cannot be attached')
  aliases=[path,'facturas/'+path,' https://example.invalid/storage/v1/object/sign/facturas/'+path+'?token=private ',path.replace('verified','%76erified'),path.replace('/','%252f'),'https://example.invalid/STORAGE/V1/OBJECT/SIGN/facturas/'+path,'facturas/other/../'+path,'https://example.invalid/storage/v1/render/image/authenticated/facturas/'+path]
  for alias in aliases:
   m.sql(f"INSERT INTO public.fin_gastos VALUES(gen_random_uuid(),{m.literal(alias)});");m.verify(True,'committed alias association allowed')
   bad=alias.replace(path,mr['path']).replace(path.replace('verified','%76erified'),mr['path'].replace('verified','%76erified')).replace(path.replace('/','%252f'),mr['path'].replace('/','%252f'))
   m.sql(f"INSERT INTO public.fin_ingresos VALUES(gen_random_uuid(),{m.literal(bad)});",False);m.verify(True,'uncommitted alias association denied')
  m.sql(f"ALTER TABLE public.fin_gastos DISABLE TRIGGER invoice_verified_reference;INSERT INTO public.fin_gastos VALUES(gen_random_uuid(),'https://example.invalid/storage/v1/object/sign/facturas/{mr['path']}?token=private');ALTER TABLE public.fin_gastos ENABLE TRIGGER invoice_verified_reference;")
  reject(mismatch,'even privileged historical alias reference forbids quarantine deletion','cleanup-authorize');m.sql(f"DELETE FROM public.fin_gastos WHERE invoice_upload.canonical_path(url_factura)={m.literal(mr['path'])};")
  reject(p,'committed bytes never authorize cleanup','cleanup-authorize')
  late=prepare();lr=step(late);execution=str(uuid.uuid4());step(late,'write-claim',sha=execution);target(late['targetKey'],'invalidate')
  step(late,'cleanup-observed',sha='absent');m.verify(m.sql(f"SELECT cleanup_pending AND cleanup_observed_absent FROM invoice_upload.requests WHERE request_key='{late['requestKey']}';")=='t','absence while delayed write outstanding cannot verify cleanup')
  reject(late,'quarantined attempt cannot claim another write','write-claim')
  step(late,'write-settled',sha=execution);step(late,'cleanup-observed',sha='absent');m.verify(m.sql(f"SELECT NOT cleanup_pending FROM invoice_upload.requests WHERE request_key='{late['requestKey']}';")=='t','definitive original execution settlement permits later absence proof')
  for field,value in [('size',0),('size',5242881),('size','20'),('sha256',None),('mime','text/html'),('sourceExtension','svg'),('protocolVersion',2)]:
   reject(dict(prepare(),**{field:value}),field+' malformed identity rejected before Storage')
  m.sql(f"INSERT INTO storage.objects(bucket_id,name) VALUES('facturas',{m.literal(mr['path'])});")
  m.verify(read(mr['path'])=='0' and read(mr['path'],OTHER)=='0','delayed Storage arrival after quarantine remains unreadable')
  qp=prepare();step(qp)
  m.sql("CREATE FUNCTION public.fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.state='committed';RETURN NEW;END$$;CREATE TRIGGER fault BEFORE UPDATE ON invoice_upload.requests FOR EACH ROW EXECUTE FUNCTION public.fault();")
  before=state();target(qp['targetKey'],'invalidate',ok=False);m.verify(state()==before,'target invalidation refuses a trigger turning quarantine into committed visibility')
  m.sql('DROP TRIGGER fault ON invoice_upload.requests;DROP FUNCTION public.fault();')
  for operation in ["INSERT INTO storage.objects(bucket_id,name) VALUES('facturas','bypass.pdf');", "UPDATE storage.objects SET name='replacement' WHERE bucket_id='facturas';", "UPDATE storage.objects SET bucket_id='facturas' WHERE bucket_id='other';"]:
   before=state();out=m.sql(f"BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='{OWNER}';{operation}COMMIT;",False if operation.startswith('INSERT') or "bucket_id='facturas' WHERE" in operation else True);m.verify(state()==before,'direct invoice insert/update/move cannot bypass server')
  m.sql(f"BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='{OWNER}';INSERT INTO storage.objects(bucket_id,name) VALUES('other','new');UPDATE storage.objects SET name='other-updated' WHERE name='new';COMMIT;");m.verify(m.sql("SELECT count(*) FROM storage.objects WHERE bucket_id='other' AND name='other-updated';")=='1','other bucket permissions unchanged')
  for timing,operation,code in [('BEFORE','INSERT','RETURN NULL;'),('BEFORE','INSERT',"NEW.state='committed';RETURN NEW;"),('AFTER','UPDATE',"UPDATE invoice_upload.targets SET active=false WHERE owner=NEW.owner AND target_key=(NEW.identity->>'targetKey')::uuid;RETURN NEW;"),('AFTER','UPDATE',"DELETE FROM invoice_upload.requests WHERE owner=NEW.owner AND request_key=NEW.request_key;RETURN NEW;")]:
   fp=prepare()
   if operation=='UPDATE':step(fp);step(fp,'uploaded')
   m.sql(f"CREATE FUNCTION public.fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN {code} END$$;CREATE TRIGGER fault {timing} {operation} ON invoice_upload.requests FOR EACH ROW EXECUTE FUNCTION public.fault();")
   reject(fp,'request '+timing+' '+operation+' fault rolls back exact state', 'finalize' if operation=='UPDATE' else 'reserve')
   m.sql('DROP TRIGGER fault ON invoice_upload.requests;DROP FUNCTION public.fault();')
  profile_fault=prepare();step(profile_fault);step(profile_fault,'uploaded')
  m.sql(f"CREATE FUNCTION public.fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN UPDATE public.usuarios SET activo=false WHERE id='{OWNER}';RETURN NEW;END$$;CREATE TRIGGER fault AFTER UPDATE ON invoice_upload.requests FOR EACH ROW EXECUTE FUNCTION public.fault();")
  reject(profile_fault,'late profile trigger revocation cannot publish committed receipt','finalize')
  m.sql('DROP TRIGGER fault ON invoice_upload.requests;DROP FUNCTION public.fault();')
  # A real row lock blocks profile revocation until the short transition ends.
  lockp=prepare();step(lockp);step(lockp,'uploaded')
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
   lock=pool.submit(m.sql,f"BEGIN;SELECT 1 FROM public.usuarios WHERE id='{OWNER}' FOR UPDATE;SELECT pg_sleep(0.3);UPDATE public.usuarios SET activo=false WHERE id='{OWNER}';COMMIT;")
   time.sleep(.05);finish=pool.submit(step,lockp,'finalize',sha=lockp['sha256']);lock.result();result=finish.result()
  m.verify(result['state']=='quarantined','finalization waits for locked current profile revocation and quarantines')
  m.sql(f"UPDATE public.usuarios SET activo=true WHERE id='{OWNER}';")
  concurrent_payload=prepare()
  with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:rs=list(pool.map(lambda _:step(concurrent_payload),range(6)))
  m.verify(all(x==rs[0] for x in rs),'six concurrent reserves one canonical request/path')
  race=prepare();step(race);step(race,'uploaded')
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
   fs=[pool.submit(step,race,'finalize',sha=race['sha256']),pool.submit(target,race['targetKey'],'invalidate')];results=[f.result() for f in fs]
  final=step(race,'status');m.verify(final['state'] in('committed','quarantined'),'finalize/invalidate serialize to committed-before-close or quarantined')
  print('Invoice PG checks:',m.CHECKS,flush=True)
 finally:
  m.docker(['rm','-f',m.NAME],check=False);m.verify(m.docker(['inspect',m.NAME],check=False).returncode!=0,'finally cleanup verified')
if __name__=='__main__':run()
