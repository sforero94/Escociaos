#!/usr/bin/env python3
"""Local synthetic PG17.6 unused-plan delete verification; no network/domain data."""
import importlib.util
import json
from pathlib import Path
import uuid
import concurrent.futures
import time
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('closure_fixture',ROOT/'scripts/security/application-closure-postgres.py')
f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
APP=f.APP;APP2=f.APP2;TASK=f.TASK;MIX='70000000-0000-4000-8000-000000000001'

def setup():
 f.sql(f.FIXTURE);f.sql(f.DEPENDENCY_FIXTURE)
 f.sql(f"CREATE TABLE auth.users(id uuid PRIMARY KEY); INSERT INTO auth.users VALUES ('{f.ACTOR}'),('{f.MANAGER}'); ALTER TABLE globalgap_correcciones ADD FOREIGN KEY(corregido_por) REFERENCES auth.users(id);")
 f.sql("""CREATE TABLE aplicaciones_compras(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),aplicacion_id uuid,producto_id uuid,cantidad_necesaria numeric);
 ALTER TABLE aplicaciones_compras ENABLE ROW LEVEL SECURITY;
 GRANT SELECT,INSERT,DELETE ON aplicaciones_compras TO authenticated;
 CREATE POLICY authenticated_select_aplicaciones_compras ON aplicaciones_compras FOR SELECT TO authenticated USING(true);
 CREATE POLICY authenticated_insert_aplicaciones_compras ON aplicaciones_compras FOR INSERT TO authenticated WITH CHECK(true);
 CREATE POLICY authenticated_delete_aplicaciones_compras ON aplicaciones_compras FOR DELETE TO authenticated USING((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['Gerencia'::rol_usuario, 'Administrador'::rol_usuario])));
 ALTER TABLE aplicaciones_lotes ADD FOREIGN KEY(aplicacion_id) REFERENCES aplicaciones(id) ON DELETE CASCADE;
 ALTER TABLE aplicaciones_mezclas ADD FOREIGN KEY(aplicacion_id) REFERENCES aplicaciones(id);
 ALTER TABLE aplicaciones_calculos ADD FOREIGN KEY(aplicacion_id) REFERENCES aplicaciones(id) ON DELETE CASCADE;
 ALTER TABLE aplicaciones_calculos ADD FOREIGN KEY(mezcla_id) REFERENCES aplicaciones_mezclas(id) ON DELETE CASCADE;
 ALTER TABLE aplicaciones_compras ADD FOREIGN KEY(aplicacion_id) REFERENCES aplicaciones(id) ON DELETE CASCADE;
 ALTER TABLE aplicaciones_productos ADD FOREIGN KEY(mezcla_id) REFERENCES aplicaciones_mezclas(id) ON DELETE CASCADE;
 ALTER TABLE movimientos_diarios ADD FOREIGN KEY(aplicacion_id) REFERENCES aplicaciones(id);
 """)
 sync=(ROOT/'src/sql/migrations/008_fix_sync_lotes_on_change.sql').read_text().split('CREATE OR REPLACE FUNCTION',1)[1].split('-- Add comment',1)[0]
 f.sql('CREATE OR REPLACE FUNCTION'+sync)
 # Actual repository correction function and child trigger declarations.
 gg=(ROOT/'src/sql/migrations/113_globalgap_correcciones.sql').read_text()
 func=gg.split('CREATE OR REPLACE FUNCTION public.fn_globalgap_registrar_correccion()',1)[1].split('-- Ni `anon`',1)[0]
 f.sql('CREATE OR REPLACE FUNCTION public.fn_globalgap_registrar_correccion()'+func)
 for t in ['aplicaciones_lotes','aplicaciones_productos','aplicaciones_calculos','aplicaciones_compras']:
  f.sql(f'CREATE TRIGGER trg_globalgap_correccion AFTER UPDATE OR DELETE ON {t} FOR EACH ROW EXECUTE FUNCTION fn_globalgap_registrar_correccion();')
 for signature in ['fn_application_plan_delete_snapshot(uuid)','fn_application_plan_delete(uuid,uuid,jsonb)','fn_application_plan_delete_status(uuid,uuid,jsonb)']:
  f.sql('CREATE FUNCTION public.'+signature+" RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;")
 f.sql((ROOT/'src/sql/security-candidates/application-plan-delete.sql').read_text())
 f.TABLES+=['aplicaciones_compras','application_plan_delete.requests']

def reset():
 f.reset()
 f.sql(f"DELETE FROM registros_trabajo WHERE tarea_id='{TASK}'; UPDATE aplicaciones SET estado='Calculada',fecha_inicio_ejecucion=NULL,fecha_fin_ejecucion=NULL,fecha_cierre=NULL WHERE id='{APP}'; INSERT INTO aplicaciones_mezclas(id,aplicacion_id) VALUES ('{MIX}','{APP}'); INSERT INTO aplicaciones_lotes(aplicacion_id,lote_id) VALUES ('{APP}','{TASK}'); INSERT INTO aplicaciones_productos(mezcla_id,producto_id) VALUES ('{MIX}','{f.P1}'); INSERT INTO aplicaciones_calculos(aplicacion_id,mezcla_id) VALUES ('{APP}','{MIX}'); INSERT INTO aplicaciones_compras(aplicacion_id,producto_id,cantidad_necesaria) VALUES ('{APP}','{f.P1}',2);")

def call(op='delete',e=None,key=None,actor=f.ACTOR,app=APP,role='authenticated',ok=True,expected_owner='actor'):
 name={'snapshot':'fn_application_plan_delete_snapshot','delete':'fn_application_plan_delete','status':'fn_application_plan_delete_status'}[op]
 args=f"'{app}'::uuid" if op=='snapshot' else f"'{key or str(uuid.uuid4())}'::uuid,'{app}'::uuid,{f.literal(json.dumps(e))}::jsonb"
 owner_sql=f.literal(actor if expected_owner=='actor' else expected_owner)+'::uuid' if (actor if expected_owner=='actor' else expected_owner) is not None else 'NULL::uuid'
 args+=','+owner_sql
 result=f.sql(f"BEGIN; SET LOCAL ROLE {role}; SET LOCAL request.jwt.claim.sub={f.literal(actor or '')}; SELECT {name}({args}); COMMIT;",ok)
 return json.loads(result) if ok else result

def snapshot():return call('snapshot')['expected']
def reject(label,op='delete',e=None,**kw):
 before=f.state();err=call(op,e if e is not None else snapshot(),ok=False,**kw)
 if any(word in err for word in ['ambiguous','syntax error','is not assigned yet']):raise AssertionError(err)
 f.verify(f.state()==before,label)

def tests():
 setup();reset();e=snapshot()
 for owner in [None,f.MANAGER]:
  for op in ['delete','status','snapshot']:
   before=f.state();error=call(op,e,ok=False,expected_owner=owner)
   f.verify('Operation owner mismatch' in error and f.state()==before,'null/mismatched owner refuses '+op+' with zero effect '+str(owner))
 for signature in ['fn_application_plan_delete_snapshot(uuid)','fn_application_plan_delete(uuid,uuid,jsonb)','fn_application_plan_delete_status(uuid,uuid,jsonb)']:
  f.verify(f.sql('SELECT to_regprocedure('+f.literal('public.'+signature)+') IS NULL;')=='t','ownerless overload retired '+signature)
 reset();e=snapshot();key=str(uuid.uuid4());before=f.sql('SELECT application_plan_delete.retained();')
 r=call(e=e,key=key)
 for owner in [None,f.MANAGER]:
  for op in ['delete','status']:
   before_state=f.state();error=call(op,e,key,ok=False,expected_owner=owner)
   f.verify('Operation owner mismatch' in error and f.state()==before_state,'owner guard prevents committed plan replay/disclosure '+op+' '+str(owner))

 f.verify(r['receipt']['preserved_task_id']==TASK and all(len(ids)==1 for ids in r['receipt']['deleted'].values()),'unused Calculada plan deletes exact reviewed IDs and retains task')
 f.verify(f.sql('SELECT application_plan_delete.retained();')==before,'all stock ledger task work daily closure unchanged')
 f.verify(f.sql(f"SELECT count(*)=5 FROM globalgap_correcciones WHERE operacion='delete' AND corregido_por='{f.ACTOR}';")=='t','each audited plan table has actual original delete correction')
 before=f.state();f.verify(call(e=e,key=key)==r and f.state()==before,'identical deletion retries exact receipt without mutations')
 f.verify(call('status',e,key)['receipt']==r['receipt'],'status recovers lost delete receipt')
 reject('changed original cannot replay committed key',e=dict(e,forged=True),key=key)
 reject('other actor cannot receive original receipt',e=e,key=key,actor=f.MANAGER)
 f.sql(f"UPDATE usuarios SET activo=false WHERE id='{f.ACTOR}';");reject('revoked actor cannot replay receipt',e=e,key=key)
 reset();e=snapshot();key=str(uuid.uuid4());r=call('status',e,key)
 f.verify(r['state']=='cancelled','absent status cancels key without deleting business state');reject('delayed cancelled delete fenced',e=e,key=key)
 before=f.state();f.verify(call('status',e,key)==r and f.state()==before,'cancelled status repeats stable outcome')
 reset();e=snapshot();f.verify(call(e=e,actor=f.MANAGER)['receipt']['actor']==f.MANAGER,'active Gerencia preserves authorized deletion')
 for actor in [f.INACTIVE,f.VIEWER,None]:
  reset();reject('unauthorized delete '+str(actor),actor=actor);call('snapshot',actor=actor,ok=False)
 reset();reject('service-role execute denied',role='service_role');reject('anonymous execute denied',role='anon')
 for column in ['activo','rol']:
  reset();e=snapshot();f.sql(f"UPDATE usuarios SET {column}=NULL WHERE id='{f.ACTOR}';");reject('nullable actor '+column,e=e)
 for state in ['En ejecución','Cerrada']:
  reset();e=snapshot();f.sql(f"UPDATE aplicaciones SET estado='{state}' WHERE id='{APP}';");reject('execution state rejects '+state,e=e)
 for table,mutation in [
 ('daily',f"INSERT INTO movimientos_diarios(aplicacion_id) VALUES ('{APP}')"),
 ('work',f"INSERT INTO registros_trabajo(tarea_id,fecha_trabajo,fraccion_jornal,costo_jornal) VALUES ('{TASK}','2026-01-01','1',1)"),
 ('ledger',f"INSERT INTO movimientos_inventario(aplicacion_id,fecha_movimiento,producto_id,provisional) VALUES ('{APP}','2026-01-01','{f.P1}',NULL)"),
 ('closure',f"INSERT INTO aplicaciones_cierre(aplicacion_id,fecha_cierre) VALUES ('{APP}','2026-01-01')")]:
  reset();e=snapshot();f.sql(mutation+';');reject('actual '+table+' prevents deleting unused-looking plan',e=e);call('snapshot',ok=False)
 reset();e=snapshot();f.sql(f"UPDATE aplicaciones SET tarea_id='{TASK}' WHERE id='{APP2}';");reject('shared task source scope refuses',e=e);call('snapshot',ok=False)
 reset();e=snapshot();f.sql(f"INSERT INTO aplicaciones_calculos(aplicacion_id,mezcla_id) VALUES ('{APP2}','{MIX}');");reject('cross-application calculation refuses',e=e);call('snapshot',ok=False)
 reset();e=snapshot();f.sql(f"INSERT INTO aplicaciones_compras(aplicacion_id) VALUES ('{APP}');");reject('inserted planned child invalidates exact original',e=e)
 reset();e=snapshot();f.sql("CREATE TABLE synthetic_finance(id uuid,application_id uuid REFERENCES aplicaciones(id));");reject('unknown finance FK/schema refuses runtime',e=e);f.sql('DROP TABLE synthetic_finance;')
 reset();e=snapshot();f.sql('CREATE TABLE synthetic_unlinked_reference(id uuid,aplicacion_id uuid);');reject('unknown semantic reference refuses runtime',e=e);f.sql('DROP TABLE synthetic_unlinked_reference;')
 reset();e=snapshot();f.sql('ALTER TABLE aplicaciones_lotes DROP CONSTRAINT aplicaciones_lotes_aplicacion_id_fkey;');reject('missing task-preserving cascade refuses',e=e);f.sql('ALTER TABLE aplicaciones_lotes ADD FOREIGN KEY(aplicacion_id) REFERENCES aplicaciones(id) ON DELETE CASCADE;')
 reset();e=snapshot();f.sql('CREATE RULE synthetic_plan_delete_rule AS ON DELETE TO aplicaciones_compras DO INSTEAD NOTHING;');reject('rewrite rule drift refuses',e=e);f.sql('DROP RULE synthetic_plan_delete_rule ON aplicaciones_compras;')
 reset();e=snapshot();f.suppress('aplicaciones_compras','DELETE');reject('unknown suppressing delete trigger refuses without partial deletion',e=e);f.unsuppress('aplicaciones_compras')
 reset();e=snapshot();f.sql('ALTER TABLE aplicaciones_lotes DISABLE TRIGGER trg_globalgap_correccion;');reject('disabled correction refuses',e=e);f.sql('ALTER TABLE aplicaciones_lotes ENABLE TRIGGER trg_globalgap_correccion;')
 reset();e=snapshot();f.suppress('application_plan_delete.requests','INSERT');reject('proof trigger drift fails before mutation',e=e);f.unsuppress('application_plan_delete.requests')
 reset();e=snapshot();f.suppress('globalgap_correcciones','INSERT');reject('audit trigger suppression refuses before deletion',e=e);f.unsuppress('globalgap_correcciones')
 reset();e=snapshot();f.sql('REVOKE DELETE ON aplicaciones_compras FROM authenticated;');reject('purchase-plan grant drift refuses',e=e);f.sql('GRANT DELETE ON aplicaciones_compras TO authenticated;')
 # Prospective closure proof survives and prevents a forged-open plan from deletion.
 f.sql('CREATE SCHEMA application_closure; CREATE TABLE application_closure.requests(actor uuid,request_key uuid,application_id uuid,state text);')
 reset();e=snapshot();f.sql(f"INSERT INTO application_closure.requests VALUES ('{f.ACTOR}','{uuid.uuid4()}','{APP}','committed');");reject('committed closure proof prevents deletion despite Calculada state',e=e)
 f.sql('TRUNCATE application_closure.requests;')
 reset();e=snapshot()
 def writer():
  return f.docker(['exec','-i','-u','postgres',f.CONTAINER,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-d','postgres'],f"BEGIN;SET application_name='plan_source_hold';INSERT INTO registros_trabajo(tarea_id,fecha_trabajo,fraccion_jornal,costo_jornal) VALUES ('{TASK}','2026-01-01','1',1);SELECT pg_sleep(.5);COMMIT;",False)
 with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
  held=pool.submit(writer)
  for _ in range(50):
   if f.sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='plan_source_hold' AND state='active');")=='t':break
   time.sleep(.01)
  error=call(e=e,ok=False);f.verify(held.result().returncode==0 and 'plan cambió' in error,'concurrent work insertion commits before deletion locks and CAS refuses')
 f.verify(f.sql(f"SELECT EXISTS(SELECT 1 FROM aplicaciones WHERE id='{APP}') AND (SELECT count(*)=0 FROM application_plan_delete.requests);")=='t','source race retains application and creates no deletion proof')
 reset();e=snapshot();key=str(uuid.uuid4())
 def raw(op):
  return f.docker(['exec','-i','-u','postgres',f.CONTAINER,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-d','postgres'],f"BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='{f.ACTOR}';SELECT fn_application_plan_delete{'_status' if op=='status' else ''}('{key}','{APP}',{f.literal(json.dumps(e))},'{f.ACTOR}'::uuid);COMMIT;",False)
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:out=list(pool.map(raw,['delete','status']))
 f.verify(out[1].returncode==0 and (out[0].returncode==0 or 'cancelled' in out[0].stderr),'delete/status race serializes to committed or cancelled')
 f.verify(f.sql("SELECT count(*)=1 AND bool_and(state IN ('committed','cancelled')) FROM application_plan_delete.requests;")=='t','one terminal prospective deletion proof after race')
 reset();e=snapshot();key=str(uuid.uuid4())
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:out=list(pool.map(raw,['delete','delete']))
 f.verify(all(x.returncode==0 for x in out) and out[0].stdout==out[1].stdout,'concurrent exact deletes return one matching receipt')
 f.verify(f.sql('SELECT count(*)=1 FROM application_plan_delete.requests;')=='t','concurrent exact delete archives once')

def main():
 f.docker(['info','--format','{{.ServerVersion}}']);f.CONTAINER='escociaos-plan-delete-'+uuid.uuid4().hex
 try:
  f.docker(['run','-d','--name',f.CONTAINER,'--pull=never','--network=none','--read-only','--tmpfs','/var/lib/postgresql/data:rw,size=256m','--tmpfs','/var/run/postgresql:rw,size=16m','--tmpfs','/tmp:rw,size=16m','--memory=512m','--cpus=2','--security-opt=no-new-privileges','-e','POSTGRES_HOST_AUTH_METHOD=trust',f.IMAGE])
  c=json.loads(f.docker(['inspect','--format','{{json .HostConfig}}',f.CONTAINER]).stdout)
  f.verify(c['NetworkMode']=='none' and not c['Binds'] and not c['PortBindings'],'network none no binds or ports')
  for _ in range(120):
   if f.docker(['exec',f.CONTAINER,'cat','/proc/1/comm'],check=False).stdout.strip()=='postgres' and f.docker(['exec','-u','postgres',f.CONTAINER,'pg_isready'],check=False).returncode==0:break
   time.sleep(.25)
  else:raise AssertionError('PG startup failed')
  tests();print(f'{f.CHECKS} synthetic assertions passed; no production calls or deployment.',flush=True)
 finally:
  f.docker(['rm','-f','-v',f.CONTAINER],check=False)
  f.verify(f.docker(['inspect',f.CONTAINER],check=False).returncode!=0,'container/tmpfs cleanup verified')
if __name__=='__main__':main()
