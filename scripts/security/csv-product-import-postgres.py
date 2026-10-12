#!/usr/bin/env python3
"""Local synthetic PG only; pinned cached image, network none/tmpfs, finally cleanup."""
import importlib.util,json,uuid,hashlib
from pathlib import Path
spec=importlib.util.spec_from_file_location('manual_harness',Path(__file__).with_name('manual-stock-postgres.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
m.NAME='escocia-csv-import-'+uuid.uuid4().hex[:12]
ROOT=m.ROOT
OWNER=m.OWNER
OTHER=m.OTHER

def body(products=None,raw='synthetic CSV'):
 return dict(raw_csv=raw,parser_version=1,products=products or [dict(nombre='Synthetic '+uuid.uuid4().hex,categoria='Fertilizante',grupo='Agroinsumos',unidad_medida='Kilos',activo=True,cantidad_actual=2.35)])
def register(p,key,actor=OWNER,role='service_role',ok=True):
 out=m.sql(f"BEGIN;SET LOCAL ROLE {role};SELECT public.fn_csv_product_import_register('{actor}','{key}',{m.literal(json.dumps(p))}::jsonb);COMMIT;",ok)
 return json.loads(out) if ok else out

def call(p,key=None,actor=OWNER,role='authenticated',ok=True,name='fn_csv_product_import',registered=True):
 key=key or str(uuid.uuid4())
 if registered and ok and role=='authenticated' and name=='fn_csv_product_import':register(p,key,actor)
 out=m.sql(f"BEGIN;SET LOCAL ROLE {role};SET LOCAL request.jwt.claim.sub={m.literal(actor or '')};SELECT public.{name}('{key}',{m.literal(json.dumps(p))}::jsonb);COMMIT;",ok)
 return json.loads(out) if ok else out

def status_proof(p,key,committed,result,actor=OWNER):
 return dict(actor=actor,requestKey=key,parserVersion=1,csvSha256=hashlib.sha256(p['raw_csv'].encode()).hexdigest(),committed=committed,result=result)
def state():
 return m.sql("SELECT jsonb_build_array((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.productos t),(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.movimientos_inventario t),(SELECT jsonb_agg(to_jsonb(t) ORDER BY actor,request_key) FROM csv_product_import.requests t),(SELECT jsonb_agg(to_jsonb(t) ORDER BY actor,request_key,ordinal) FROM csv_product_import.openings t),(SELECT jsonb_agg(to_jsonb(t) ORDER BY actor,request_key) FROM csv_product_import.parsed t));")
def rejects(p,label,key=None,actor=OWNER,role='authenticated',name='fn_csv_product_import'):
 key=key or str(uuid.uuid4())
 if name=='fn_csv_product_import' and role=='authenticated' and actor:
  before_registration=state()
  try:register(p,key,actor)
  except AssertionError as error:
   if any(x in str(error) for x in ('syntax error','column reference','is not assigned yet')):raise
   assert state()==before_registration,'rejected registration changed state'
 before=state();call(p,key,actor,role,False,name,registered=False);m.verify(state()==before,label)
def provenance_checks():
 p=body();key=str(uuid.uuid4());before=state()
 call(p,key,ok=False,registered=False)
 m.verify(state()==before,'direct human unregistered raw/products cannot mutate')
 for role in ('anon','authenticated'):
  before=state();register(p,key,role=role,ok=False)
  m.verify(state()==before,role+' cannot register client-claimed parsed proof or actor')
 registered=register(p,key)
 m.verify(registered==dict(actor=OWNER,requestKey=key,parserVersion=1,csvSha256=hashlib.sha256(p['raw_csv'].encode()).hexdigest(),payload=p),'service registration binds exact raw/parser/products/verified actor')
 m.verify(register(p,key)==registered,'trusted parser registration idempotent exact replay')
 m.sql(f"ALTER TABLE public.usuarios ALTER COLUMN rol DROP NOT NULL; UPDATE public.usuarios SET rol=NULL WHERE id='{OWNER}';")
 before=state();register(body(),str(uuid.uuid4()),ok=False)
 m.verify(state()==before,'NULL profile role cannot register trusted parser proof')
 before=state();call(p,key,ok=False,registered=False);call(p,key,ok=False,name='fn_csv_product_import_status')
 m.verify(state()==before,'NULL profile role cannot post or resolve existing parsed proof')
 m.sql(f"UPDATE public.usuarios SET rol='Administrador' WHERE id='{OWNER}'; ALTER TABLE public.usuarios ALTER COLUMN rol SET NOT NULL;")
 for patch,label in [(dict(raw_csv='forged raw'),'raw'),(dict(products=[dict(p['products'][0],cantidad_actual=8)]),'products'),(dict(parser_version=2),'version')]:
  before=state();call(dict(p,**patch),key,ok=False,registered=False)
  register(dict(p,**patch),key,ok=False)
  m.verify(state()==before,'direct human/service conflicting '+label+' refuses registered proof replacement')
 result=call(p,key,registered=False)
 m.verify(result['actor']==OWNER,'human domain RPC consumes exact trusted registered payload')
 m.sql(f"UPDATE csv_product_import.parsed SET csv_sha256=repeat('0',64) WHERE request_key='{key}';")
 before=state();call(p,key,ok=False,registered=False);call(p,key,ok=False,name='fn_csv_product_import_status')
 m.verify(state()==before,'corrupted parser proof refuses committed replay/status')
 m.sql(f"UPDATE csv_product_import.parsed SET csv_sha256='{registered['csvSha256']}' WHERE request_key='{key}';")
 p=body();key=str(uuid.uuid4());call(p,key,name='fn_csv_product_import_status')
 before=state();register(p,key,ok=False)
 m.verify(state()==before,'cancellation before registration fences delayed trusted parser')
 for table,timing,code in [('csv_product_import.parsed','BEFORE','RETURN NULL;'),('csv_product_import.parsed','BEFORE',"NEW.csv_sha256=repeat('0',64);RETURN NEW;"),('csv_product_import.parsed','AFTER','DELETE FROM csv_product_import.parsed WHERE actor=NEW.actor AND request_key=NEW.request_key;RETURN NEW;')]:
  p=body();key=str(uuid.uuid4())
  m.sql(f"CREATE FUNCTION public.fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN {code} END$$;CREATE TRIGGER fault {timing} INSERT ON {table} FOR EACH ROW EXECUTE FUNCTION public.fault();")
  before=state();register(p,key,ok=False);m.verify(state()==before,'registration '+timing+' exact readback rolls back suppression/corruption/deletion')
  m.sql(f'DROP TRIGGER fault ON {table};DROP FUNCTION public.fault();')
 for code,label in [("UPDATE csv_product_import.parsed SET created_at=created_at-interval '1 day' WHERE request_key='{key}';RETURN NEW;",'metadata corruption'),
  ("UPDATE csv_product_import.parsed SET payload=jsonb_set(payload,'{raw_csv}','\"forged\"'::jsonb) WHERE request_key='{key}';RETURN NEW;",'payload corruption'),
  ("DELETE FROM csv_product_import.parsed WHERE request_key='{key}';RETURN NEW;",'deletion')]:
  p=body();key=str(uuid.uuid4());register(p,key)
  code=code.replace('{key}',key)
  m.sql(f"CREATE FUNCTION public.fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN {code} END$$;CREATE TRIGGER fault AFTER INSERT ON csv_product_import.requests FOR EACH ROW EXECUTE FUNCTION public.fault();")
  before=state();call(p,key,ok=False,registered=False)
  m.verify(state()==before,'post final parser proof CAS rejects '+label)
  m.sql('DROP TRIGGER fault ON csv_product_import.requests;DROP FUNCTION public.fault();')
 p=body();key=str(uuid.uuid4());register(p,key)
 m.sql(f"UPDATE usuarios SET activo=false WHERE id='{OWNER}';")
 before=state();register(p,key,ok=False);call(p,key,ok=False,registered=False)
 m.verify(state()==before,'registered proof cannot bypass profile revocation on register or human post')
 m.sql(f"UPDATE usuarios SET activo=true WHERE id='{OWNER}';")


def registration_order_checks():
 import concurrent.futures,time
 # Wait for the real registration INSERT trigger to sleep: it already holds
 # the actor/key lock, so these exercise lock ordering rather than scheduler luck.
 for follower in ('fn_csv_product_import','fn_csv_product_import_status'):
  p=body();key=str(uuid.uuid4())
  m.sql("CREATE FUNCTION public.fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN PERFORM pg_sleep(1);RETURN NEW;END$$;CREATE TRIGGER fault BEFORE INSERT ON csv_product_import.parsed FOR EACH ROW EXECUTE FUNCTION public.fault();")
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
   registration=pool.submit(register,p,key)
   deadline=time.monotonic()+10
   while m.sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event='PgSleep' AND query LIKE '%fn_csv_product_import_register%');")!='t':
    if registration.done():registration.result();raise AssertionError('registration lock wait was not observed')
    if time.monotonic()>deadline:raise AssertionError('registration lock observation timeout')
    time.sleep(.01)
   following=pool.submit(call,p,key,name=follower,registered=False)
   proof=registration.result();result=following.result()
  m.sql('DROP TRIGGER fault ON csv_product_import.parsed;DROP FUNCTION public.fault();')
  m.verify(proof['payload']==p and ((follower=='fn_csv_product_import' and result['success']) or
   (follower=='fn_csv_product_import_status' and result==status_proof(p,key,False,None))),
   'registration lock serializes delayed '+follower)
  if follower=='fn_csv_product_import_status':
   before=state();register(p,key,ok=False);call(p,key,ok=False,registered=False)
   m.verify(state()==before,'status after registration fences delayed registration replay and post')
 # Status takes the same lock first and must durably prevent later registration.
 p=body();key=str(uuid.uuid4())
 m.sql("CREATE FUNCTION public.fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN PERFORM pg_sleep(1);RETURN NEW;END$$;CREATE TRIGGER fault BEFORE INSERT ON csv_product_import.requests FOR EACH ROW EXECUTE FUNCTION public.fault();")
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  cancellation=pool.submit(call,p,key,name='fn_csv_product_import_status')
  deadline=time.monotonic()+10
  while m.sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event='PgSleep' AND query LIKE '%fn_csv_product_import_status%');")!='t':
   if cancellation.done():cancellation.result();raise AssertionError('status lock wait was not observed')
   if time.monotonic()>deadline:raise AssertionError('status lock observation timeout')
   time.sleep(.01)
  late_registration=pool.submit(register,p,key,ok=False)
  result=cancellation.result();error=late_registration.result()
 m.sql('DROP TRIGGER fault ON csv_product_import.requests;DROP FUNCTION public.fault();')
 m.verify(result==status_proof(p,key,False,None) and 'Canceled or changed CSV request' in error and
  m.sql(f"SELECT count(*) FROM csv_product_import.parsed WHERE request_key='{key}';")=='0',
  'status lock first refuses concurrently delayed service registration')


def run():
 m.docker(['image','inspect',m.IMAGE])
 try:
  m.docker(['run','-d','--pull=never','--name',m.NAME,'--network=none','--tmpfs','/var/lib/postgresql/data:rw','--tmpfs','/var/run/postgresql:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust',m.IMAGE])
  import time
  deadline=time.monotonic()+30
  while m.docker(['exec',m.NAME,'cat','/proc/1/comm'],check=False).stdout.strip()!='postgres' or m.docker(['exec','-u','postgres',m.NAME,'pg_isready'],check=False).returncode:
   if time.monotonic()>deadline:raise AssertionError('PG readiness timeout')
   time.sleep(.1)
  info=json.loads(m.docker(['inspect',m.NAME]).stdout)[0]
  m.verify(info['HostConfig']['NetworkMode']=='none' and not info['HostConfig']['Binds'] and not info['HostConfig']['PortBindings'] and all(x['Type']=='tmpfs' for x in info['Mounts']),'isolated tmpfs no binds ports network')
  m.verify(m.sql('SHOW server_version;').startswith('17.6'),'pinned PG17.6')
  outer=json.loads((ROOT/'docs/security-integrity/live-catalog-private.json').read_text());cols=json.loads(outer['content'][0]['text'])['data']['results'][0]['response']['data']['result'];cols=json.loads(cols) if isinstance(cols,str) else cols
  enums={'rol_usuario':['Administrador','Gerencia','Verificador','Monitor'],'categoria_producto':['Fertilizante','Fungicida','Insecticida','Acaricida','Insecticida - Acaricida','Herbicida','Biocontrolador','Biológicos','Coadyuvante','Regulador','Fitorregulador','Desinfectante','Enmienda','Enmienda - regulador','Herramienta','Equipo','Maquinaria','Otros'],'grupo_producto':['Agroinsumos','Herramientas','Maquinaria y equipo'],'tipo_aplicacion_producto':['Foliar','Edáfico','Drench'],'estado_fisico':['Líquido','Sólido'],'unidad_medida':['Litros','Kilos','Unidades'],'estado_producto':['OK'],'tipo_movimiento':['Entrada','Salida Otros','Ajuste']}
  schema="CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;"
  for enum,labels in enums.items():schema+=f"CREATE TYPE public.{enum} AS ENUM ({','.join(m.literal(x) for x in labels)});"
  for table in ['productos','movimientos_inventario','usuarios']:
   defs=[]
   for c in cols:
    if c['table_name']!=table:continue
    typ=c['udt_name'];typ=f"numeric({c['numeric_precision']},{c['numeric_scale']})" if typ=='numeric' else typ
    definition=c['column_name']+' '+typ
    if c['column_name']=='id':definition+=' PRIMARY KEY'
    elif c['is_nullable']=='NO':definition+=' NOT NULL'
    if table=='productos' and c['column_name']=='nombre':definition+=' UNIQUE'
    default=c['column_default'];default='gen_random_uuid()' if default and 'uuid_generate' in default else default
    if default:definition+=' DEFAULT '+default
    defs.append(definition)
   schema+=f"CREATE TABLE public.{table}({','.join(defs)});"
  schema+=f"INSERT INTO public.usuarios(id,email,rol,activo) VALUES('{OWNER}','owner@synthetic.invalid','Administrador',true),('{OTHER}','other@synthetic.invalid','Gerencia',true);"
  m.sql(schema)
  candidate=(ROOT/'src/sql/security-candidates/csv-product-import.sql').read_text()
  m.sql("CREATE FUNCTION public.baseline_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW;END$$;CREATE TRIGGER baseline_fault BEFORE INSERT ON public.productos FOR EACH ROW EXECUTE FUNCTION public.baseline_fault();")
  m.sql(candidate,False);m.verify(m.sql("SELECT to_regnamespace('csv_product_import') IS NULL;")=='t','unreviewed current trigger baseline refuses installation')
  m.sql('DROP TRIGGER baseline_fault ON public.productos;DROP FUNCTION public.baseline_fault();');m.sql(candidate)
  p=body();key=str(uuid.uuid4());r=call(p,key)
  m.verify(r['total']==1 and r['products'][0]['opening_quantity']==2.35,'atomic opening receipt')
  pid=r['products'][0]['product_id'];mid=r['products'][0]['movement_id']
  m.verify(m.sql(f"SELECT cantidad=2.35 AND saldo_anterior=0 AND saldo_nuevo=2.35 AND tipo_movimiento='Entrada' AND valor_movimiento IS NULL AND responsable='owner@synthetic.invalid' AND fecha_movimiento=(created_at AT TIME ZONE 'America/Bogota')::date FROM public.movimientos_inventario WHERE id='{mid}';")=='t','opening Entrada null valuation trusted Bogota date and owner email')
  before=state();m.verify(call(p,key)==r and state()==before,'exact replay one batch no extra stock ledger')
  rejects(body(raw='changed raw'),'same key changed exact raw identity',key)
  m.verify(call(p,key,name='fn_csv_product_import_status')==status_proof(p,key,True,r),'status committed exact receipt')
  zero=body();zero['products'][0].pop('cantidad_actual');z=call(zero)
  m.verify(z['products'][0]['opening_quantity']==0 and z['products'][0]['movement_id'] is None and m.sql(f"SELECT count(*) FROM public.movimientos_inventario WHERE producto_id='{z['products'][0]['product_id']}';")=='0','blank zero default explicit proof without zero ledger')
  fields=body();fields['products'][0].update(ingrediente_activo_3='Third',concentracion_ia_3=250,permitido_gerencia=True,activo=False,periodo_reingreso_horas=12,nitrogeno=2.25,precio_unitario=100.25)
  f=call(fields,actor=OTHER);m.verify(all(f['products'][0]['product'][k]==v for k,v in fields['products'][0].items()),'Gerencia all optional business fields preserved incl third ingredient explicit inactive')
  explicit_zero=body();explicit_zero['products'][0]['cantidad_actual']=0
  ez=call(explicit_zero);m.verify(ez['products'][0]['opening_quantity']==0 and ez['products'][0]['movement_id'] is None,'explicit zero opening has no fictitious ledger row')
  owner_bound=body();owner_key=str(uuid.uuid4());or1=call(owner_bound,owner_key)
  different=body();or2=call(different,owner_key,actor=OTHER)
  m.verify(or1['actor']==OWNER and or2['actor']==OTHER and or1['products'][0]['product_id']!=or2['products'][0]['product_id'],'same request key isolated by verified owner')
  rejects(dict(owner_bound,products=different['products']),'same owner key parsed batch identity bound',owner_key)
  for patch,label in [(dict(parser_version=2),'parser version'),(dict(products=[]),'empty batch'),(dict(raw_csv='x'*1048577),'raw cap'),(dict(products=[p['products'][0]]*501),'row cap')]:rejects(dict(body(),**patch),label+' rejected whole transaction')
  for field,value in [('cantidad_actual',-1),('cantidad_actual',1.001),('cantidad_actual',10000000000),('precio_unitario','1'),('nitrogeno',100000000),('periodo_carencia_dias',1.5),('activo','true'),('nitrogeno',101),('presentacion_kg_l',-1),('concentracion_ia_3',-1),('precio_por_presentacion',-1),('stock_minimo',-1),('periodo_reingreso_horas',-1),('created_at','2000-01-01'),('categoria','bogus')]:
   invalid=body();invalid['products'][0][field]=value;rejects(invalid,field+' invalid full field preflight')
  batch=body();batch['products'].append(dict(batch['products'][0],nombre=p['products'][0]['nombre']));rejects(batch,'existing duplicate rolls back whole batch')
  batch=body();batch['products'].append(dict(batch['products'][0]));rejects(batch,'duplicate within batch preflight')
  for actor,role,label in [('', 'authenticated','missing human'),(OWNER,'anon','anon ACL'),(OWNER,'service_role','service role ACL')]:rejects(body(),label,actor=actor,role=role)
  m.sql(f"UPDATE public.usuarios SET activo=false WHERE id='{OWNER}';");rejects(body(),'fresh disabled profile');m.sql(f"UPDATE public.usuarios SET activo=true,rol='Verificador' WHERE id='{OWNER}';");rejects(body(),'fresh wrong role');m.sql(f"UPDATE public.usuarios SET rol='Administrador' WHERE id='{OWNER}';")
  cancel=body();ck=str(uuid.uuid4());m.verify(call(cancel,ck,name='fn_csv_product_import_status')==status_proof(cancel,ck,False,None),'durable cancellation fences absent request')
  rejects(cancel,'delayed original after cancellation cannot commit',ck)
  m.verify(call(cancel,ck,name='fn_csv_product_import_status')==status_proof(cancel,ck,False,None),'cancellation status replay')
  rejects(dict(cancel,raw_csv='changed'),'cancelled request payload bound',ck,name='fn_csv_product_import_status')
  faults=[('public.productos','BEFORE','RETURN NULL;'),('public.productos','BEFORE',"NEW.precio_unitario=999;RETURN NEW;"),('public.productos','AFTER',"DELETE FROM public.productos WHERE id=NEW.id;RETURN NEW;"),('public.movimientos_inventario','BEFORE','RETURN NULL;'),('public.movimientos_inventario','AFTER',"UPDATE public.productos SET cantidad_actual=999 WHERE id=NEW.producto_id;RETURN NEW;"),('csv_product_import.openings','BEFORE','RETURN NULL;'),('csv_product_import.openings','AFTER',"DELETE FROM csv_product_import.openings WHERE product_id=NEW.product_id;RETURN NEW;"),('csv_product_import.requests','BEFORE','RETURN NULL;'),('csv_product_import.requests','AFTER',"UPDATE public.productos SET cantidad_actual=999 WHERE id IN(SELECT product_id FROM csv_product_import.openings WHERE actor=NEW.actor AND request_key=NEW.request_key);RETURN NEW;")]
  for table,timing,code in faults:
   m.sql(f"CREATE FUNCTION public.fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN {code} END$$;CREATE TRIGGER fault {timing} INSERT ON {table} FOR EACH ROW EXECUTE FUNCTION public.fault();")
   rejects(body(),table+' '+timing+' suppression mutation final readback')
   if table=='csv_product_import.requests' and timing=='BEFORE':rejects(body(),table+' '+timing+' cancellation readback',name='fn_csv_product_import_status')
   m.sql(f'DROP TRIGGER fault ON {table};DROP FUNCTION public.fault();')
  for code,label in [("IF NEW.nombre='Second synthetic' THEN RETURN NULL;END IF;RETURN NEW;",'second catalog row suppressed rolls back first product opening and proof'),("IF NEW.nombre='Second synthetic' THEN UPDATE public.productos SET stock_minimo=999 WHERE nombre='First synthetic';END IF;RETURN NEW;",'late batch cross-product mutation detected in final readback')]:
   m.sql(f"CREATE FUNCTION public.fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN {code} END$$;CREATE TRIGGER fault BEFORE INSERT ON public.productos FOR EACH ROW EXECUTE FUNCTION public.fault();")
   batch=body();batch['products'][0]['nombre']='First synthetic';batch['products'].append(dict(batch['products'][0],nombre='Second synthetic'))
   rejects(batch,label)
   m.sql('DROP TRIGGER fault ON public.productos;DROP FUNCTION public.fault();')
  m.sql("CREATE FUNCTION public.fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN DELETE FROM csv_product_import.requests WHERE actor=NEW.actor AND request_key=NEW.request_key;RETURN NEW;END$$;CREATE TRIGGER fault AFTER INSERT ON csv_product_import.requests FOR EACH ROW EXECUTE FUNCTION public.fault();")
  rejects(body(),'AFTER cancellation deletion refuses absence proof',name='fn_csv_product_import_status')
  m.sql('DROP TRIGGER fault ON csv_product_import.requests;DROP FUNCTION public.fault();')
  import concurrent.futures
  concurrent_body=body();concurrent_key=str(uuid.uuid4())
  with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:results=list(pool.map(lambda _:call(concurrent_body,concurrent_key),range(6)))
  m.verify(all(r==results[0] for r in results),'six concurrent same-key requests one canonical batch')
  m.verify(m.sql(f"SELECT count(*) FROM public.productos WHERE nombre={m.literal(concurrent_body['products'][0]['nombre'])};")=='1','concurrent replay single catalog row')
  m.sql(f"UPDATE public.usuarios SET activo=false WHERE id='{OWNER}';")
  rejects(concurrent_body,'exact replay requires fresh active actor',concurrent_key)
  m.sql(f"UPDATE public.usuarios SET activo=true WHERE id='{OWNER}';")
  race=body();race_key=str(uuid.uuid4())
  # Barrier-free simultaneous calls must serialize; whichever wins determines
  # committed vs cancelled, while delayed originals after cancelled are tested above.
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
   fs=[pool.submit(call,race,race_key),pool.submit(call,race,race_key,name='fn_csv_product_import_status')]
   results=[]
   for f in fs:
    try:results.append(f.result())
    except AssertionError as e:
     if 'Canceled or changed CSV request' not in str(e):raise
     results.append(None)
  status_result=results[1]
  m.verify((status_result['committed'] and results[0]==status_result['result']) or (not status_result['committed'] and results[0] is None),'posting/status race committed receipt or durable canceled refusal')
  provenance_checks()
  registration_order_checks()
  for table in ['csv_product_import.requests','csv_product_import.openings','csv_product_import.parsed']:
   m.sql(f'BEGIN;SET LOCAL ROLE authenticated;SELECT * FROM {table};ROLLBACK;',False);m.verify(True,'protected evidence table denied '+table)
  print('CSV PG checks:',m.CHECKS,flush=True)
 finally:
  m.docker(['rm','-f',m.NAME],check=False)
  m.verify(m.docker(['inspect',m.NAME],check=False).returncode!=0,'finally cleanup verified')
if __name__=='__main__':run()
