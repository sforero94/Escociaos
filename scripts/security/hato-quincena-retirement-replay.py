#!/usr/bin/env python3
"""Narrow quincena retirement on exact contained60-candidate replay; never production."""
import argparse,importlib.util,json,subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('quincena_retirement_prior',Path(__file__).with_name('measured-income-invoice-release-browser-replay.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
c,r,p=b.c,b.r,b.p
SOURCE=r.ROOT/'src/sql/security-candidates/hato-quincena-retirement.sql'
SCHEMA=Path(__file__).with_name('financial-writer-retirement-schema.sql')
INVENTORY=r.ROOT/'docs/security-integrity/financial-writer-retirement-callers.json'
def metadata(sql):return json.loads(sql(SCHEMA.read_text()))
def install(sql):
 b.b.install(sql);print('PASS prior59 installed before narrow retirement',flush=True);query=p.query(sql);before=sql(query);authority=metadata(sql)
 for ddl in ['GRANT UPDATE(notas) ON hato_produccion_quincenal TO anon;','GRANT EXECUTE ON FUNCTION fn_hato_guardar_quincena_venta(jsonb) TO PUBLIC;','ALTER FUNCTION hato_quincena.assert_controls() SET search_path=public;']:
  print('CHECK installation drift '+ddl,flush=True);failed=sql('BEGIN;'+ddl+r.transaction_body(SOURCE.read_text())+'COMMIT;',False)
  if failed.returncode==0 or sql(query)!=before or metadata(sql)!=authority or sql("SELECT to_regprocedure('hato_quincena.assert_retired_writers()') IS NULL;")!='t':raise AssertionError('Retirement drift admission must restore full graph and authority')
 print('CHECK candidate60 installation',flush=True);sql(SOURCE.read_text());print('PASS candidate60 installed',flush=True);after=metadata(sql)
 if sql(query)!=before:raise AssertionError('Retirement installation changed existing rows')
 for section in ['relations','effective_table_acl','effective_column_acl']:
  keep=lambda rows:[x for x in rows if x.get('table')!='hato_produccion_quincenal' or x.get('role')=='service_role']
  if keep(authority[section])!=keep(after[section]):raise AssertionError('Shared/service financial authority changed')
 for section in ['policies','incoming_fks','trigger_bindings']:
  if authority[section]!=after[section]:raise AssertionError('Retirement changed shared triggers/policies/FKs')
 print('PASS no existing row or shared authority changes',flush=True)
 for f in b.b.b.b.m.b.functions(sql):
  if f['args']==0 and f['returns']=='void' and f['name'].startswith('assert_'):
   print('CHECK '+f['signature'],flush=True);sql('SELECT '+f['signature']+';')
def exercise(sql,ctx):
 b.exercise(sql,ctx);check,call=ctx['check'],ctx['call'];query=p.query(sql);authority=lambda:sql(SCHEMA.read_text());owner=c.uid()
 sql('INSERT INTO auth.users VALUES('+p.u(owner)+');INSERT INTO usuarios(id,email,rol,activo) VALUES('+p.u(owner)+','+p.lit(owner+'@synthetic.invalid')+",'Gerencia',true);")
 for role in ['anon','authenticated']:
  for action,stmt in [('INSERT','INSERT INTO hato_produccion_quincenal DEFAULT VALUES;'),('UPDATE','UPDATE hato_produccion_quincenal SET notas=notas;'),('DELETE','DELETE FROM hato_produccion_quincenal;'),('TRUNCATE','TRUNCATE hato_produccion_quincenal CASCADE;')]:
   before=sql(query);failed=sql('BEGIN;SET LOCAL ROLE '+role+';SET LOCAL request.jwt.claim.sub='+p.lit(owner)+';'+stmt+'COMMIT;',False);check(failed.returncode!=0 and 'permission denied' in failed.stderr and sql(query)==before,role+' ordinary quincena '+action+' denied without mutation')
  for sig,arg in [('fn_hato_guardar_quincena_venta','NULL::jsonb'),('fn_hato_eliminar_quincena_venta','NULL::uuid')]:
   before=sql(query);failed=sql('BEGIN;SET LOCAL ROLE '+role+';SELECT '+sig+'('+arg+');COMMIT;',False);check(failed.returncode!=0 and 'permission denied' in failed.stderr and sql(query)==before,role+' legacy '+sig+' denied')
 check(sql("SELECT count(*) FROM pg_attribute a CROSS JOIN(VALUES('anon'),('authenticated'))r(role) CROSS JOIN(VALUES('INSERT'),('UPDATE'))p(privilege) WHERE a.attrelid='hato_produccion_quincenal'::regclass AND a.attnum>0 AND NOT a.attisdropped AND has_column_privilege(r.role,a.attrelid,a.attnum,p.privilege);")=='0','all ordinary quincena column writes retired')
 check(sql("SELECT has_table_privilege('anon','hato_produccion_quincenal','SELECT') AND has_table_privilege('authenticated','hato_produccion_quincenal','SELECT');")=='t','ordinary prior SELECT authority preserved')
 for sig,arg in [('fn_hato_guardar_quincena_venta','NULL::jsonb'),('fn_hato_eliminar_quincena_venta','NULL::uuid')]:
  before=sql(query);failed=sql('BEGIN;SELECT '+sig+'('+arg+');COMMIT;',False);check(failed.returncode!=0 and 'Legacy quincena RPC retired' in failed.stderr and sql(query)==before,'legacy refusal stub '+sig+' refuses even owner execution')
 def drift(ddl,label):
  before=sql(query);acl=authority();failed=sql('BEGIN;'+ddl+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+p.lit(owner)+";SELECT fn_hato_quincena_web('status',"+p.u(c.uid())+',NULL,'+p.u(owner)+');COMMIT;',False)
  check(failed.returncode!=0 and any(x in failed.stderr for x in ['Retired quincena','retirement binding drift','Unreviewed quincena core']) and sql(query)==before and authority()==acl,label+' refuses with whole graph/authority rollback')
 for privilege in ['INSERT','UPDATE','DELETE','TRUNCATE']:drift('GRANT '+privilege+' ON hato_produccion_quincenal TO authenticated;','restored table '+privilege)
 for privilege in ['INSERT','UPDATE']:drift('GRANT '+privilege+'(notas) ON hato_produccion_quincenal TO anon;','restored column '+privilege)
 drift('GRANT UPDATE ON hato_produccion_quincenal TO PUBLIC;','PUBLIC writer')
 drift('CREATE ROLE synthetic_quincena_writer;GRANT synthetic_quincena_writer TO authenticated;GRANT UPDATE ON hato_produccion_quincenal TO synthetic_quincena_writer;','inherited writer')
 for sig in ['fn_hato_guardar_quincena_venta(jsonb)','fn_hato_eliminar_quincena_venta(uuid)']:drift('GRANT EXECUTE ON FUNCTION '+sig+' TO authenticated;','restored legacy RPC grant')
 drift('ALTER FUNCTION hato_quincena.assert_retired_writers() SET search_path=public;','retirement helper config')
 drift('CREATE OR REPLACE FUNCTION hato_quincena.assert_retired_writers() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$BEGIN RETURN;END$$;','retirement helper body')
 # Genuine service/import shape remains allowed; all new rows are synthetic and rolled back.
 before=sql(query);new_id=c.uid();income=sql("SELECT fin_ingreso_id FROM hato_produccion_quincenal WHERE origen_dato='medido' ORDER BY id LIMIT 1;");out=sql('BEGIN;SET LOCAL ROLE service_role;SET LOCAL request.jwt.claim.sub='+p.lit(owner)+';INSERT INTO hato_produccion_quincenal(id,anio,mes,quincena,litros_total,origen_dato,created_by,fin_ingreso_id) VALUES('+p.u(new_id)+",2048,1,1,4,'derivado_mensual',"+p.u(owner)+','+p.u(income)+');UPDATE hato_produccion_quincenal SET notas=\'Synthetic preserved service\' WHERE id='+p.u(new_id)+';DELETE FROM hato_produccion_quincenal WHERE id='+p.u(new_id)+';ROLLBACK;');check(sql(query)==before,'service/import/backfill derived-monthly INSERT/UPDATE/DELETE preserved without history mutation')
 region=sql("SELECT id FROM fin_regiones WHERE nombre='Synthetic protected region';");medium=sql("SELECT id FROM fin_medios_pago WHERE nombre='Synthetic protected medium';")
 params=dict(quincenaId=None,anio=2047,mes=11,quincena=1,fechaInicio='2047-11-01',fechaFin='2047-11-15',litrosTotal=100,litrosPomarConfirmado=100,numVacasOrdeno=1,notas='Synthetic retirement browser',finIngreso=dict(fecha='2047-11-15',valorBruto=1000,regionId=region,medioPagoId=medium,compradorId=None,nombre=None))
 proc=subprocess.run(['node',str(Path(__file__).with_name('hato-quincena-browser-native.mjs'))],input=json.dumps(dict(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),owner=owner,params=params)),text=True,capture_output=True,cwd=r.ROOT,timeout=90)
 if proc.returncode:
  dest=Path('/tmp/escocia-quincena-retirement-sdk-private.log');dest.touch(mode=0o600,exist_ok=True);dest.write_text(proc.stderr);raise AssertionError('Actual quincena caller failed; inspect external private diagnostics')
 exercise.sdk={k:v for k,v in json.loads(proc.stdout).items() if k!='fixtures'};check(exercise.sdk['assertions']>=20,'actual browser save/edit/delete captured original recovery remains compatible after retirement')
 # A late regrant from trusted audit must restore authority and every domain/private row.
 fields=dict(year=2046,month=12,quincena=1,liters=100,pomar=100,cows=1,notes='Synthetic late regrant',incomeDate='2046-12-15',gross=1000,regionId=region,mediumId=medium,buyerId=None,name=None)
 draft=dict(version=1,kind='save',targetId=None,fields=fields);source=call('fn_hato_quincena_source_web',[p.js(draft),p.u(owner)],actor=owner);intent=dict(draft,observed=source['source']);key=c.uid()
 call('fn_hato_quincena_web',[p.lit('prepare'),p.u(key),p.js(intent),p.u(owner)],actor=owner);before=sql(query);acl=authority()
 ddl="CREATE FUNCTION public.synthetic_quincena_late_grant() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN GRANT UPDATE(notas) ON public.hato_produccion_quincenal TO authenticated;RETURN NEW;END$$;CREATE TRIGGER synthetic_quincena_late_grant AFTER INSERT ON hato_quincena.audit FOR EACH ROW EXECUTE FUNCTION public.synthetic_quincena_late_grant();"
 failed=sql('BEGIN;'+ddl+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+p.lit(owner)+";SELECT fn_hato_quincena_web('post',"+p.u(key)+',NULL,'+p.u(owner)+');COMMIT;',False)
 check(failed.returncode!=0 and 'Retired quincena writer authority restored' in failed.stderr and sql(query)==before and authority()==acl,'late audit column regrant rolls back whole mutation/control/audit/authority')
 check(call('fn_hato_quincena_web',[p.lit('post'),p.u(key),'NULL::jsonb',p.u(owner)],actor=owner)['state']=='committed','same original posts after known late grant rollback')
 call('fn_hato_quincena_web',[p.lit('acknowledge'),p.u(key),'NULL::jsonb',p.u(owner)],actor=owner)
def main():
 ap=argparse.ArgumentParser()
 for name in ['evidence-dir','runtime','client','output','private-diagnostics']:ap.add_argument('--'+name,type=Path,required=True)
 x=ap.parse_args()
 for entry in [exercise,b.exercise,b.b.b.exercise,b.b.b.b.m.exercise,b.b.b.b.m.b.exercise]:entry.client=x.client.resolve()
 inv=json.loads(INVENTORY.read_text());assert not any(x['rpc'] in ['fn_hato_guardar_quincena_venta','fn_hato_eliminar_quincena_venta'] for x in inv['rpcs']);assert not any('hato_produccion_quincenal' in x['targets'] for x in inv['writers'] if not x['file'].startswith('scripts/import-hato/'));assert all(r.p.digest((r.ROOT/k).read_bytes())==v for k,v in inv['source_hashes'].items())
 prior=json.loads((r.ROOT/'docs/security-integrity/measured-income-invoice-release-browser-replay.json').read_text());files=list(dict.fromkeys([Path(__file__),SOURCE,Path(__file__).with_name('build-hato-quincena-retirement.py'),SCHEMA,INVENTORY,Path(__file__).with_name('financial-writer-retirement-inventory.mjs'),*[r.ROOT/k for k in json.loads(INVENTORY.read_text())['source_hashes']],*[r.ROOT/k for k in prior['source_hashes']]]));frozen={f:f.read_bytes() for f in files};base=b.b.b.b.m.b.p.p
 while not hasattr(base,'s'):base=base.p
 catalog,rls,storage,t,hashes,_=base.s.load(x.evidence_dir.resolve());base.install.inputs=(storage,t,rls,catalog)
 if x.output.resolve().is_relative_to(x.evidence_dir.resolve()) or x.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(x.runtime.resolve(),x.client.resolve(),x.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(f.read_bytes()!=v for f,v in frozen.items()):raise ValueError('Changing quincena retirement sources cannot be certified')
 result.update(coordinated_candidate_count=60,installed_sdk={'prior':b.b.b.b.m.exercise.sdk,'origin_caller':b.b.b.exercise.sdk,'terminal_caller':b.exercise.sdk,'quincena_caller':exercise.sdk},source_hashes={str(f.relative_to(r.ROOT)):r.p.digest(v) for f,v in frozen.items()},temporary_database_stopped_and_removed=True,limits=['Six approved local private structure exports and contained synthetic PostgreSQL only; never production.','Only old quincena RPCs and ordinary quincena DML/column writers retired. Shared financial/service/import/backfill/history preserved. Hosted/global/runtime/reader/recovery and remaining financial writers remain open.'])
 x.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
