#!/usr/bin/env python3
"""Unapplied catalog candidate, cached isolated synthetic PG17.6 only."""
import importlib.util,json,uuid,re,concurrent.futures
from pathlib import Path
spec=importlib.util.spec_from_file_location('manual_harness',Path(__file__).with_name('manual-stock-postgres.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
m.NAME='escocia-product-catalog-'+uuid.uuid4().hex[:12]
ROOT=m.ROOT;OWNER=m.OWNER;OTHER=m.OTHER

def fields():
 source=(ROOT/'src/components/inventory/ProductForm.tsx').read_text()
 initial=re.search(r'const initialFormData: ProductData = \{(.*?)\n\};',source,re.S).group(1)
 f={key:None for key in re.findall(r'^  (\w+):',initial,re.M)}
 f.update(nombre='Synthetic '+uuid.uuid4().hex,categoria='Fertilizante',grupo='Agroinsumos',unidad_medida='Kilos',estado='OK',activo=True,cantidad_actual=2.35,
  epp_alto_nivel=False,riesgo_acuatico=False,riesgo_vida_silvestre=False,riesgo_polinizador=False,riesgo_transeunte=False)
 return f

def create():return dict(mode='create',product_id=None,original=None,fields=fields())
def edit(row):
 f={key:row[key] for key in fields() if key not in ('activo','cantidad_actual')}
 return dict(mode='edit',product_id=row['id'],original=json.loads(json.dumps(row)),fields=f)
def call(p,key=None,actor=OWNER,role='authenticated',ok=True,name='fn_product_catalog_post'):
 out=m.sql(f"BEGIN;SET LOCAL ROLE {role};SET LOCAL request.jwt.claim.sub={m.literal(actor or '')};SELECT public.{name}('{key or uuid.uuid4()}',{m.literal(json.dumps(p))}::jsonb);COMMIT;",ok)
 return json.loads(out) if ok else out
def state():
 ts=['public.productos','public.movimientos_inventario','product_catalog_integrity.requests','product_catalog_integrity.openings','product_catalog_integrity.audit']
 return m.sql('SELECT jsonb_build_array('+','.join(f"(SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM {t} t)" for t in ts)+');')
def rejects(p,label,expected=None,**options):
 before=state();error=call(p,ok=False,**options);m.verify(state()==before and (expected is None or expected in error),label)
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
  candidate=(ROOT/'src/sql/security-candidates/product-catalog-integrity.sql').read_text()
  m.sql("CREATE FUNCTION public.baseline_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW;END$$;CREATE TRIGGER baseline_fault BEFORE INSERT ON public.productos FOR EACH ROW EXECUTE FUNCTION public.baseline_fault();")
  m.sql(candidate,False);m.verify(m.sql("SELECT to_regnamespace('product_catalog_integrity') IS NULL;")=='t','unreviewed current trigger baseline refuses installation')
  m.sql('DROP TRIGGER baseline_fault ON public.productos;DROP FUNCTION public.baseline_fault();');m.sql(candidate)
  p=create();key=str(uuid.uuid4());r=call(p,key);row=r['product'];mid=r['movement_id']
  m.verify(row['cantidad_actual']==2.35 and row['updated_by']==OWNER and r['audit']['before_row'] is None,'create trusted row and transactional before/after audit')
  m.verify(m.sql(f"SELECT cantidad=2.35 AND saldo_anterior=0 AND saldo_nuevo=2.35 AND valor_movimiento IS NULL AND responsable='owner@synthetic.invalid' AND fecha_movimiento=(created_at AT TIME ZONE 'America/Bogota')::date FROM movimientos_inventario WHERE id='{mid}';")=='t','positive opening Entrada null valuation trusted actor/date')
  m.verify(r['opening']['product_snapshot']==row,'protected opening exact snapshot')
  before=state();m.verify(call(p,key)==r and state()==before,'exact same key replay no extra catalog/ledger/audit')
  m.verify(call(p,key,name='fn_product_catalog_status')['result']==r,'committed exact status')
  changed=json.loads(json.dumps(p));changed['fields']['nombre']='Changed';rejects(changed,'changed payload bound',key=key)
  for quantity in (None,0):
   z=create();z['fields']['cantidad_actual']=quantity;zr=call(z)
   m.verify(zr['product']['cantidad_actual']==0 and zr['opening']['quantity_after']==0 and zr['movement_id'] is None,'null/zero opening protected proof no fake movement')
  full=create();full['fields'].update(ingrediente_activo_1='A',ingrediente_activo_2='B',ingrediente_activo_3='C',concentracion_ia_1=250,concentracion_ia_2=200,concentracion_ia_3=150,
   permitido_gerencia=None,precio_unitario=1.25,precio_por_presentacion=2.5,presentacion_kg_l=2,periodo_carencia_dias=2,nitrogeno=100)
  fr=call(full,actor=OTHER);m.verify(all(fr['product'][k]==v for k,v in full['fields'].items()),'Gerencia nullable and optional ProductData business fields exact')
  e=edit(row);e['fields'].update(precio_unitario=9.25,ingrediente_activo_3='Third',concentracion_ia_3=200)
  er=call(e);m.verify(er['product']['cantidad_actual']==row['cantidad_actual'] and er['movement_id'] is None and er['opening'] is None and er['audit']['before_row']==row,'edit metadata exact original CAS preserves stock no new opening')
  rejects(e,'stale complete original price/revision snapshot refuses overwrite')
  clear=edit(er['product']);clear['fields'].update(precio_unitario=None,ingrediente_activo_3=None,concentracion_ia_3=None)
  cr=call(clear);m.verify(all(cr['product'][k] is None for k in ('precio_unitario','ingrediente_activo_3','concentracion_ia_3')),'edit explicit null clears optional business fields')
  for key_name,new in [('cantidad_actual',99),('updated_by',OTHER),('activo',False)]:
   bad=edit(cr['product']);bad['fields'][key_name]=new;rejects(bad,'edit unsupported stock/attribution/activation field '+key_name)
  bad=edit(cr['product']);bad['original'].pop('created_at');rejects(bad,'partial original snapshot refused')
  bad=edit(cr['product']);bad['fields']['unidad_medida']='Litros';rejects(bad,'unit change with opening stock/history refused')
  zero=create();zero['fields']['cantidad_actual']=0;zr=call(zero);ze=edit(zr['product']);ze['fields']['unidad_medida']='Litros';zer=call(ze)
  m.verify(zer['product']['unidad_medida']=='Litros','unit edit with zero stock and no history permitted')
  m.sql(f"INSERT INTO movimientos_inventario(id,fecha_movimiento,unidad,producto_id,tipo_movimiento,cantidad) VALUES(gen_random_uuid(),current_date,'Litros','{zer['product']['id']}','Entrada',1);")
  hist=edit(zer['product']);hist['fields']['unidad_medida']='Kilos';rejects(hist,'unit edit even zero stock with ledger history refused')
  for mode in (None,3,{},[]):
   bad=edit(cr['product']);bad['mode']=mode;rejects(bad,'strict discriminated mode refuses '+str(mode),expected='Invalid catalog payload')
  active=dict(mode='activation',product_id=cr['product']['id'],original=cr['product'],fields=dict(activo=False))
  ak=str(uuid.uuid4());ar=call(active,ak)
  m.verify(ar['product']['activo'] is False and all(ar['product'][k]==cr['product'][k] for k in cr['product'] if k not in ('activo','updated_at','updated_by')) and ar['movement_id'] is None and ar['opening'] is None,'activation changes active/attribution only preserves all metadata and stock')
  m.verify(ar['audit']['before_row']==cr['product'] and ar['audit']['after_row']==ar['product'] and ar['audit']['origin']=='catalog_rpc','activation trusted full before/after audit')
  before=state();m.verify(call(active,ak)==ar and state()==before,'activation exact replay no extra audit/stock')
  rejects(active,'activation full original stale refusal')
  for field,value in [('activo',None),('cantidad_actual',99),('precio_unitario',99),('unidad_medida','Litros')]:
   bad=dict(active,original=ar['product'],fields=dict(activo=True));bad['fields'][field]=value;rejects(bad,'activation strict one boolean allowlist '+field)
  m.sql(f"UPDATE productos SET activo=NULL WHERE id='{ar['product']['id']}';")
  nullrow=json.loads(m.sql(f"SELECT to_jsonb(p) FROM productos p WHERE id='{ar['product']['id']}';"))
  nr=call(dict(active,original=nullrow,fields=dict(activo=True)));m.verify(nr['audit']['before_row']['activo'] is None and nr['product']['activo'] is True,'null original active preserved explicitly then deliberate activation')
  ac=dict(active,original=nr['product'],fields=dict(activo=False));ack=str(uuid.uuid4());call(ac,ack,name='fn_product_catalog_status');rejects(ac,'activation cancellation fence delayed post',key=ack)
  cr['product']=nr['product']
  for f in ['precio_unitario','precio_por_presentacion','cantidad_actual','stock_minimo','presentacion_kg_l','concentracion_ia_1','concentracion_ia_2','concentracion_ia_3','nitrogeno','fosforo','potasio','calcio','magnesio','azufre','hierro','manganeso','zinc','cobre','boro','molibdeno','carbono_organico','silicio','sodio','periodo_carencia_dias','periodo_reingreso_horas']:
   bad=create();bad['fields'][f]=-0.001;rejects(bad,'negative full field validation '+f)
  for f,value in [('precio_unitario',1.001),('cantidad_actual',10000000000),('concentracion_ia_3',100000000),('periodo_carencia_dias',1.5),('nitrogeno',101),('estado','Bogus'),('categoria','Bogus'),('unidad_medida','Bogus'),('nombre',None),('epp_alto_nivel','true')]:
   bad=create();bad['fields'][f]=value;rejects(bad,'precision/type/enum bound '+f)
  for actor,role,label in [('', 'authenticated','missing human'),(OWNER,'anon','anon'),(OWNER,'service_role','service')]:rejects(create(),label+' execution ACL',actor=actor,role=role)
  for column,value in [('activo','false'),('rol',"'Verificador'"),('rol','NULL'),('email',"''")]:
   if value=='NULL':m.sql('ALTER TABLE usuarios ALTER COLUMN rol DROP NOT NULL;')
   m.sql(f"UPDATE usuarios SET {column}={value} WHERE id='{OWNER}';");rejects(create(),'fresh profile gate '+column)
   m.sql(f"UPDATE usuarios SET activo=true,rol='Administrador',email='owner@synthetic.invalid' WHERE id='{OWNER}';")
   if value=='NULL':m.sql('ALTER TABLE usuarios ALTER COLUMN rol SET NOT NULL;')
  cancel=create();ck=str(uuid.uuid4());status=call(cancel,ck,name='fn_product_catalog_status')
  m.verify(status==dict(actor=OWNER,request_key=ck,payload=cancel,committed=False,result=None),'durable exact cancellation fence')
  rejects(cancel,'delayed original canceled refusal',key=ck)
  faults=[('public.productos','BEFORE','INSERT','RETURN NULL;'),('public.productos','BEFORE','INSERT','NEW.precio_unitario=999;RETURN NEW;'),('public.productos','AFTER','INSERT','DELETE FROM public.productos WHERE id=NEW.id;RETURN NEW;'),
   ('public.movimientos_inventario','BEFORE','INSERT','RETURN NULL;'),('public.movimientos_inventario','AFTER','INSERT','UPDATE public.productos SET cantidad_actual=999 WHERE id=NEW.producto_id;RETURN NEW;'),
   ('product_catalog_integrity.openings','BEFORE','INSERT','RETURN NULL;'),('product_catalog_integrity.audit','BEFORE','INSERT','RETURN NULL;'),('product_catalog_integrity.audit','AFTER','INSERT','DELETE FROM product_catalog_integrity.audit WHERE actor=NEW.actor AND request_key=NEW.request_key;RETURN NEW;'),
   ('product_catalog_integrity.requests','BEFORE','INSERT','RETURN NULL;'),('product_catalog_integrity.requests','AFTER','INSERT','UPDATE public.productos SET precio_unitario=999 WHERE id=(NEW.result->\'product\'->>\'id\')::uuid;RETURN NEW;'),
   ('public.productos','BEFORE','UPDATE','RETURN NULL;'),('product_catalog_integrity.audit','AFTER','INSERT','UPDATE product_catalog_integrity.audit SET before_row=after_row WHERE actor=NEW.actor AND request_key=NEW.request_key;RETURN NEW;')]
  for table,timing,event,code in faults:
   m.sql(f"CREATE FUNCTION public.fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN {code} END$$;CREATE TRIGGER fault {timing} {event} ON {table} FOR EACH ROW EXECUTE FUNCTION public.fault();")
   rejects(edit(cr['product']) if event=='UPDATE' else create(),table+' '+timing+' '+event+' trigger atomicity',expected='did not persist exactly')
   if table=='product_catalog_integrity.requests' and timing=='BEFORE':rejects(create(),'status cancellation suppression',name='fn_product_catalog_status')
   m.sql(f'DROP TRIGGER fault ON {table};DROP FUNCTION public.fault();')
  for code,label in [("INSERT INTO public.movimientos_inventario(id,fecha_movimiento,producto_id,tipo_movimiento,cantidad,unidad) VALUES(gen_random_uuid(),current_date,NEW.id,'Entrada',1,NEW.unidad_medida);RETURN NEW;",'extra edit ledger'),
   ("UPDATE product_catalog_integrity.openings SET quantity_after=999 WHERE product_id=NEW.id;RETURN NEW;",'changed original opening proof')]:
   m.sql(f"CREATE FUNCTION public.fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN {code} END$$;CREATE TRIGGER fault AFTER UPDATE ON public.productos FOR EACH ROW EXECUTE FUNCTION public.fault();")
   rejects(edit(cr['product']),label+' final history comparison rolls back',expected='altered inventory history')
   m.sql('DROP TRIGGER fault ON public.productos;DROP FUNCTION public.fault();')
  for timing,table,code,expected_error in [('BEFORE','public.productos','RETURN NULL;','did not persist exactly'),
   ('AFTER','product_catalog_integrity.requests',"UPDATE public.productos SET precio_unitario=999 WHERE id=(NEW.result->'product'->>'id')::uuid;RETURN NEW;",'did not persist exactly'),
   ('AFTER','public.productos',"INSERT INTO public.movimientos_inventario(id,fecha_movimiento,producto_id,tipo_movimiento,cantidad,unidad) VALUES(gen_random_uuid(),current_date,NEW.id,'Entrada',1,NEW.unidad_medida);RETURN NEW;",'altered inventory history')]:
   event='UPDATE' if table=='public.productos' else 'INSERT'
   m.sql(f"CREATE FUNCTION public.fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN {code} END$$;CREATE TRIGGER fault {timing} {event} ON {table} FOR EACH ROW EXECUTE FUNCTION public.fault();")
   ap=dict(mode='activation',product_id=cr['product']['id'],original=cr['product'],fields=dict(activo=False))
   rejects(ap,'activation '+timing+' '+table+' fault preserves stock/metadata/history/audit',expected=expected_error)
   m.sql(f'DROP TRIGGER fault ON {table};DROP FUNCTION public.fault();')
  concurrent_payload=create();concurrent_key=str(uuid.uuid4())
  with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:results=list(pool.map(lambda _:call(concurrent_payload,concurrent_key),range(6)))
  m.verify(all(x==results[0] for x in results),'six concurrent create replays one canonical receipt')
  concurrent_edit=edit(results[0]['product']);concurrent_edit['fields']['precio_unitario']=10
  def attempt():
   try:return call(concurrent_edit)
   except AssertionError as error:
    if 'Catalog changed since original review' not in str(error):raise
    return None
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:edits=list(pool.map(lambda _:attempt(),range(2)))
  m.verify(sum(x is not None for x in edits)==1,'two keys same original edit only one succeeds')
  race=create();race_key=str(uuid.uuid4())
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
   a=pool.submit(call,race,race_key);b=pool.submit(call,race,race_key,name='fn_product_catalog_status');st=b.result()
   try:posted=a.result()
   except AssertionError as error:
    if 'Canceled or changed catalog request' not in str(error):raise
    posted=None
  m.verify((st['committed'] and st['result']==posted) or (not st['committed'] and posted is None),'post/status serializes committed or canceled')
  for table in ('requests','audit','openings'):
   m.sql(f'BEGIN;SET LOCAL ROLE authenticated;SELECT * FROM product_catalog_integrity.{table};ROLLBACK;',False);m.verify(True,'protected evidence ACL '+table)
  print('Catalog PG checks:',m.CHECKS,flush=True)
 finally:
  m.docker(['rm','-f',m.NAME],check=False)
  m.verify(m.docker(['inspect',m.NAME],check=False).returncode!=0,'finally cleanup verified')
if __name__=='__main__':run()
