#!/usr/bin/env python3
"""Cached pinned PG17.6, isolated synthetic manual movement validation."""
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import time
import uuid
ROOT=Path(__file__).resolve().parents[2]
IMAGE='postgres@sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929'
NAME='escocia-manual-stock-'+uuid.uuid4().hex[:12]
OWNER='11111111-1111-4111-8111-111111111111'
OTHER='22222222-2222-4222-8222-222222222222'
PRODUCT='33333333-3333-4333-8333-333333333333'
ENV=os.environ.copy()
for k in ('DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'): ENV.pop(k,None)
CHECKS=0

def docker(args,data=None,check=True):
 return subprocess.run(['docker','--host=unix:///var/run/docker.sock']+args,input=data,text=True,capture_output=True,env=ENV,timeout=60,check=check)
def sql(source,ok=True):
 r=docker(['exec','-i','-u','postgres',NAME,'psql','-X','-qAt','-v','ON_ERROR_STOP=1'],source,False)
 if ok and r.returncode: raise AssertionError(r.stderr)
 if not ok and not r.returncode: raise AssertionError('Expected rejection')
 if not ok and any(s in r.stderr for s in ('ambiguous','syntax error','is not assigned')): raise AssertionError(r.stderr)
 return r.stdout.strip() if ok else r.stderr

def literal(s): return "'"+s.replace("'","''")+"'"
def verify(condition,label):
 global CHECKS
 if not condition: raise AssertionError(label)
 CHECKS+=1; print('PASS',label,flush=True)
def payload(tipo='Entrada',quantity=2.345):
 row=json.loads(sql(f"SELECT jsonb_build_object('quantity',cantidad_actual,'revision',updated_at) FROM public.productos WHERE id='{PRODUCT}';"))
 return dict(producto_id=PRODUCT,tipo=tipo,quantity=quantity,observed_quantity=row['quantity'],observed_revision=row['revision'],fecha='2026-10-10',observaciones='Synthetic note')
def call(body,key=None,actor=OWNER,role='authenticated',ok=True):
 r=sql(f"BEGIN; SET LOCAL ROLE {role}; SET LOCAL request.jwt.claim.sub={literal(actor or '')}; SELECT public.fn_manual_stock_movement('{key or uuid.uuid4()}',{literal(json.dumps(body))}::jsonb); COMMIT;",ok)
 return json.loads(r) if ok else r

def status(body,key,ok=True,actor=OWNER):
 r=sql(f"BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub={literal(actor)}; SELECT public.fn_manual_stock_request_status('{key}',{literal(json.dumps(body))}::jsonb); COMMIT;",ok)
 return json.loads(r) if ok else r

def state():
 return sql("SELECT jsonb_build_array((SELECT jsonb_agg(to_jsonb(t)) FROM public.productos t),(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.movimientos_inventario t),(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY actor,request_key),'[]') FROM manual_stock.requests t));")
def rejects(body,label,key=None,actor=OWNER,role='authenticated'):
 before=state();call(body,key,actor,role,False);verify(state()==before,label)
def run():
 docker(['image','inspect',IMAGE])
 try:
  docker(['run','-d','--pull=never','--name',NAME,'--network=none','--tmpfs','/var/lib/postgresql/data:rw','--tmpfs','/var/run/postgresql:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust',IMAGE])
  d=json.loads(docker(['inspect',NAME]).stdout)[0]
  verify(d['HostConfig']['NetworkMode']=='none' and not d['HostConfig']['Binds'] and not d['HostConfig']['PortBindings'] and all(m['Type']=='tmpfs' for m in d['Mounts']),'network none, tmpfs only, no ports or binds')
  deadline=time.monotonic()+30
  while (docker(['exec',NAME,'cat','/proc/1/comm'],check=False).stdout.strip()!='postgres' or docker(['exec','-u','postgres',NAME,'pg_isready'],check=False).returncode):
   if time.monotonic()>deadline: raise AssertionError('readiness timeout')
   time.sleep(.1)
  verify(sql('SHOW server_version;').startswith('17.6'),'pinned PostgreSQL17.6')
  outer=json.loads((ROOT/'docs/security-integrity/live-catalog-private.json').read_text());c=json.loads(outer['content'][0]['text'])['data']['results'][0]['response']['data']['result'];c=json.loads(c) if isinstance(c,str) else c
  for table,cols in {'productos':{'id':'uuid','cantidad_actual':'numeric','updated_at':'timestamptz','updated_by':'uuid'},'movimientos_inventario':{'producto_id':'uuid','cantidad':'numeric','saldo_anterior':'numeric','saldo_nuevo':'numeric','responsable':'text'},'usuarios':{'id':'uuid','email':'text','rol':'rol_usuario','activo':'bool'}}.items():
   verify(all(any(r['table_name']==table and r['column_name']==col and r['udt_name']==typ for r in c) for col,typ in cols.items()),table+' required types match metadata-only local catalog')
  sql(f"""
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE TYPE public.rol_usuario AS ENUM ('Administrador','Gerencia','Verificador','Monitor');
 CREATE TYPE public.tipo_movimiento AS ENUM ('Entrada','Salida Otros','Ajuste');
 CREATE TYPE public.unidad_medida AS ENUM ('Kilos','Litros');
 CREATE TABLE public.usuarios(id uuid PRIMARY KEY,email text NOT NULL,rol public.rol_usuario NOT NULL,activo bool);
 CREATE TABLE public.productos(id uuid PRIMARY KEY,cantidad_actual numeric(12,2),unidad_medida public.unidad_medida NOT NULL,activo bool,updated_at timestamptz,updated_by uuid,nombre text);
 CREATE TABLE public.movimientos_inventario(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),fecha_movimiento date NOT NULL,producto_id uuid NOT NULL REFERENCES public.productos,tipo_movimiento public.tipo_movimiento NOT NULL,cantidad numeric(12,2) NOT NULL,unidad public.unidad_medida NOT NULL,saldo_anterior numeric(12,2),saldo_nuevo numeric(12,2),responsable text,observaciones text,provisional bool DEFAULT false,created_at timestamptz DEFAULT now());
 INSERT INTO public.usuarios VALUES('{OWNER}','owner@synthetic.invalid','Administrador',true),('{OTHER}','other@synthetic.invalid','Gerencia',true);
 INSERT INTO public.productos VALUES('{PRODUCT}',10,'Kilos',true,now(),NULL,'Synthetic');
 """)
  for table,columns in {'productos':['cantidad_actual'],'movimientos_inventario':['cantidad','saldo_anterior','saldo_nuevo']}.items():
   verify(all(any(r['table_name']==table and r['column_name']==col and r.get('numeric_precision')==12 and r.get('numeric_scale')==2 for r in c) for col in columns),table+' quantity precision matches numeric(12,2) catalog')
  sql((ROOT/'src/sql/security-candidates/manual-stock-movement.sql').read_text())
  b=payload();key=str(uuid.uuid4());r=call(b,key)
  verify(r['quantity_before']==10 and r['quantity_after']==12.35 and r['delta']==2.35,'positive normalization and atomic signed entry')
  before=state();verify(call(b,key)==r and state()==before,'lost response replay exact receipt no second stock write')
  rejects(dict(b,quantity=3),'same owner key changed payload blocked',key)
  b=payload('Salida Otros',1);r=call(b);verify(r['delta']==-1 and r['quantity_after']==11.35,'exit signed ledger reduces current locked stock')
  b=payload('Ajuste',0);r=call(b);verify(r['delta']==-11.35 and r['quantity_after']==0,'zero correction target remains valid')
  b=payload('Ajuste',0);key=str(uuid.uuid4());before=state();r=call(b,key)
  verify(r['noop'] and r['movement_id'] is None and r['delta']==0,'equal correction returns explicit no-op without invented ledger')
  verify(sql('SELECT count(*) FROM public.movimientos_inventario;')=='3','no-op adds no ledger row')
  before=state();verify(call(b,key)==r and state()==before,'no-op retry is exact and single receipt')
  verify(status(b,key)=={'committed':True,'result':r},'status resolves committed no-op receipt exactly')
  stale=payload('Ajuste',5);stale['observed_quantity']=999;cancel_key=str(uuid.uuid4())
  rejects(stale,'stale correction failed before any receipt',cancel_key)
  verify(status(stale,cancel_key)=={'committed':False,'result':None},'status atomically fences proved-unposted request')
  rejects(stale,'late retry cannot post a canceled request key',cancel_key)
  verify(status(stale,cancel_key)=={'committed':False,'result':None},'cancellation status is idempotent')
  valid=payload();late_key=str(uuid.uuid4());verify(status(valid,late_key)=={'committed':False,'result':None},'absence proof fences a valid delayed operation')
  rejects(valid,'valid late operation cannot commit after safe cancellation',late_key)
  before=state();status(dict(stale,quantity=6),cancel_key,False);verify(state()==before,'canceled key exact payload remains bound')
  for timing,action in [('BEFORE','RETURN NULL;'),('AFTER',"DELETE FROM manual_stock.requests WHERE actor=NEW.actor AND request_key=NEW.request_key; RETURN NEW;")]:
   sql(f'CREATE FUNCTION public.fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN {action} END $$; CREATE TRIGGER fault {timing} INSERT ON manual_stock.requests FOR EACH ROW EXECUTE FUNCTION public.fault();')
   before=state();status(payload(),str(uuid.uuid4()),False);verify(state()==before,timing+' cancellation suppression cannot claim safe absence')
   sql('DROP TRIGGER fault ON manual_stock.requests; DROP FUNCTION public.fault();')
  sql('UPDATE public.productos SET cantidad_actual=10,updated_at=clock_timestamp();')
  for invalid in ('NULL',"'NaN'::numeric",'-1'):
   sql('UPDATE public.productos SET cantidad_actual='+invalid+';');rejects(dict(payload(),observed_quantity=10),'invalid existing balance rejects all writes')
  sql('UPDATE public.productos SET cantidad_actual=10;')
  for quantity in (-1,0,0.004,10000000000): rejects(payload(quantity=quantity),'entry invalid or rounded-zero quantity rejects')
  for quantity in ('2',None): rejects(payload(quantity=quantity),'non-numeric quantity rejects')
  rejects(payload('Salida Otros',11),'insufficient stock rejects all writes')
  for field,value in [('observed_quantity',9),('observed_revision','2000-01-01T00:00:00Z'),('observed_revision',None)]: rejects(dict(payload('Ajuste',5),**{field:value}),'stale correction '+field+' rejects')
  for actor,role in [(None,'authenticated'),(OWNER,'anon'),(OWNER,'service_role')]: rejects(payload(),'untrusted actor/role blocked',actor=actor,role=role)
  sql(f"ALTER TABLE public.usuarios ALTER COLUMN rol DROP NOT NULL; UPDATE public.usuarios SET rol=NULL WHERE id='{OWNER}';")
  rejects(payload(),'NULL profile role cannot post through privileged RPC')
  before=state();status(payload(),str(uuid.uuid4()),False);verify(state()==before,'NULL profile role cannot resolve or create cancellation evidence')
  sql(f"UPDATE public.usuarios SET rol='Administrador' WHERE id='{OWNER}'; ALTER TABLE public.usuarios ALTER COLUMN rol SET NOT NULL;")
  for mutation,restore in [("activo=false","activo=true"),("rol='Verificador'","rol='Administrador'")]:
   sql(f"UPDATE public.usuarios SET {mutation} WHERE id='{OWNER}';");rejects(payload(),'fresh inactive/demoted actor blocked');sql(f"UPDATE public.usuarios SET {restore} WHERE id='{OWNER}';")
  for table,event in [('public.movimientos_inventario','INSERT'),('public.productos','UPDATE'),('manual_stock.requests','INSERT'),('manual_stock.requests','UPDATE')]:
   for timing,action in [('BEFORE','RETURN NULL;'),('BEFORE',"RAISE EXCEPTION 'synthetic fault';")]:
    sql(f'CREATE FUNCTION public.fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN {action} END $$; CREATE TRIGGER fault {timing} {event} ON {table} FOR EACH ROW EXECUTE FUNCTION public.fault();')
    rejects(payload(),table+' '+event+' suppression/error atomic');sql(f'DROP TRIGGER fault ON {table}; DROP FUNCTION public.fault();')
  for table,event,field,value in [('public.productos','UPDATE','cantidad_actual','999'),('public.movimientos_inventario','INSERT','cantidad','999'),('manual_stock.requests','UPDATE','result',"'{{}}'::jsonb")]:
   for timing in ('BEFORE','AFTER'):
    where='id=NEW.id' if table!='manual_stock.requests' else 'actor=NEW.actor AND request_key=NEW.request_key'
    action=f'NEW.{field}:={value};' if timing=='BEFORE' else f'UPDATE {table} SET {field}={value} WHERE {where};'
    sql(f'CREATE FUNCTION public.fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF pg_trigger_depth()>1 THEN RETURN NEW; END IF; {action} RETURN NEW; END $$; CREATE TRIGGER fault {timing} {event} ON {table} FOR EACH ROW EXECUTE FUNCTION public.fault();')
    rejects(payload(),timing+' persisted '+field+' mutation atomic');sql(f'DROP TRIGGER fault ON {table}; DROP FUNCTION public.fault();')
  for table,event,field,value in [('public.movimientos_inventario','INSERT','responsable',"'spoof'"),('public.movimientos_inventario','INSERT','unidad',"'Litros'"),('public.movimientos_inventario','INSERT','saldo_anterior','999'),('public.movimientos_inventario','INSERT','created_at',"NEW.created_at+interval '1 second'"),('public.productos','UPDATE','nombre',"'altered'"),('manual_stock.requests','INSERT','payload',"'{}'::jsonb"),('manual_stock.requests','UPDATE','canceled','true')]:
   for timing in ('BEFORE','AFTER'):
    where='id=NEW.id' if table!='manual_stock.requests' else 'actor=NEW.actor AND request_key=NEW.request_key'
    action=f'NEW.{field}:={value};' if timing=='BEFORE' else f'UPDATE {table} SET {field}={value} WHERE {where};'
    sql(f'CREATE FUNCTION public.fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF pg_trigger_depth()>1 THEN RETURN NEW; END IF; {action} RETURN NEW; END $$; CREATE TRIGGER fault {timing} {event} ON {table} FOR EACH ROW EXECUTE FUNCTION public.fault();')
    rejects(payload(),timing+' trusted '+field+' mutation atomic');sql(f'DROP TRIGGER fault ON {table}; DROP FUNCTION public.fault();')
  for table,event in [('public.movimientos_inventario','INSERT'),('manual_stock.requests','UPDATE')]:
   where='id=NEW.id' if table!='manual_stock.requests' else 'actor=NEW.actor AND request_key=NEW.request_key'
   sql(f'CREATE FUNCTION public.fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN DELETE FROM {table} WHERE {where}; RETURN NEW; END $$; CREATE TRIGGER fault AFTER {event} ON {table} FOR EACH ROW EXECUTE FUNCTION public.fault();')
   rejects(payload(),'AFTER '+table+' deletion refuses success');sql(f'DROP TRIGGER fault ON {table}; DROP FUNCTION public.fault();')
  sql("CREATE FUNCTION public.fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE public.movimientos_inventario SET responsable='late spoof'; RETURN NEW; END $$; CREATE TRIGGER fault AFTER UPDATE ON manual_stock.requests FOR EACH ROW EXECUTE FUNCTION public.fault();")
  rejects(payload(),'late receipt trigger changing earlier ledger detected');sql('DROP TRIGGER fault ON manual_stock.requests; DROP FUNCTION public.fault();')
  b=payload();key=str(uuid.uuid4())
  with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool: results=list(pool.map(lambda _:call(b,key),range(6)))
  verify(all(r==results[0] for r in results),'six concurrent same-key calls return one canonical movement')
  before=state();sql(f"UPDATE public.usuarios SET activo=false WHERE id='{OWNER}';");rejects(b,'replay requires fresh active actor',key);sql(f"UPDATE public.usuarios SET activo=true WHERE id='{OWNER}';")
  with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool: list(pool.map(lambda _:call(payload(quantity=1)),range(6)))
  verify(sql('SELECT cantidad_actual FROM public.productos;')=='18.35','six distinct concurrent entries serialize current stock')
  b=payload('Ajuste',7)
  sql("UPDATE public.productos SET cantidad_actual=cantidad_actual+1; UPDATE public.productos SET cantidad_actual=cantidad_actual-1,updated_at=clock_timestamp();")
  rejects(b,'same stock with newer revision refuses stale correction')
  for table in ('public.productos','public.movimientos_inventario','manual_stock.requests'):
   verify('permission denied' in sql('SET ROLE authenticated; UPDATE '+table+' SET '+('cantidad_actual=0' if table=='public.productos' else 'cantidad=0' if table=='public.movimientos_inventario' else "result='{}'")+';',False),'fixture authenticated has no direct DML '+table)
  print(json.dumps(dict(checks=CHECKS,postgres='17.6',live_requests=0)),flush=True)
 finally:
  docker(['rm','-f',NAME],check=False)
  verify(docker(['inspect',NAME],check=False).returncode!=0,'owned container cleanup verified')
if __name__=='__main__': run()
