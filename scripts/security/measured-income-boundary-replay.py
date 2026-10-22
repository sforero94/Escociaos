#!/usr/bin/env python3
"""Ordinary measured-income row protection on contained61-candidate graph; never production."""
import argparse,importlib.util,json,subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('income_boundary_prior',Path(__file__).with_name('hato-quincena-retirement-replay.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
c,r,p=b.c,b.r,b.p
SOURCE=r.ROOT/'src/sql/security-candidates/measured-income-boundary.sql'
SCHEMA=b.SCHEMA
INVENTORY=b.INVENTORY

def install(sql):
 b.install(sql);print('CHECK candidate61 measured-income boundary',flush=True);query=p.query(sql);before=sql(query);authority=b.metadata(sql)
 for ddl in ['ALTER FUNCTION hato_income_metadata.assert_baseline() SET search_path=public;','GRANT UPDATE(notas) ON hato_produccion_quincenal TO anon;']:
  failed=sql('BEGIN;'+ddl+r.transaction_body(SOURCE.read_text())+'COMMIT;',False)
  if failed.returncode==0 or sql(query)!=before or b.metadata(sql)!=authority:raise AssertionError('Boundary admission drift failed to restore graph/catalog')
 sql(SOURCE.read_text());after=b.metadata(sql)
 if sql(query)!=before:raise AssertionError('Boundary installation changed existing rows')
 for section in ['relations','effective_table_acl','effective_column_acl','policies','incoming_fks']:
  if authority[section]!=after[section]:raise AssertionError('Boundary changed preserved authority or links: '+section)
 print('PASS candidate61 installed; all rows, table/column grants, policies and FKs preserved',flush=True)
 sql('SELECT hato_income_metadata.assert_baseline();SELECT invoice_upload.assert_controls();')
def exercise(sql,ctx):
 b.exercise(sql,ctx);check=ctx['check'];query=p.query(sql);owner=c.uid()
 sql('INSERT INTO auth.users VALUES('+p.u(owner)+');INSERT INTO usuarios(id,email,rol,activo) VALUES('+p.u(owner)+','+p.lit(owner+'@synthetic.invalid')+",'Gerencia',true);")
 pair=json.loads(sql("SELECT jsonb_build_object('production',to_jsonb(q),'income',to_jsonb(i)) FROM hato_produccion_quincenal q JOIN fin_ingresos i ON i.id=q.fin_ingreso_id WHERE q.origen_dato='medido' AND EXISTS(SELECT 1 FROM hato_quincena.audit a WHERE a.receipt->'after'->'production'->>'id'=q.id::text) ORDER BY q.id LIMIT 1;"));production,income=pair['production'],pair['income'];target=income['id'];authority=sql(SCHEMA.read_text())
 def deny(label,statement,prefix='',required='Measured income requires'):
  before=sql(query);out=sql('BEGIN;'+prefix+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+p.lit(owner)+';'+statement+'COMMIT;',False)
  expected=required if isinstance(required,tuple) else (required,)
  valid=out.returncode!=0 and any(text in out.stderr for text in expected) and sql(query)==before and sql(SCHEMA.read_text())==authority
  if not valid:
   dest=Path('/tmp/escocia-income-boundary-unexpected-denial-private.log');dest.touch(mode=0o600,exist_ok=True);dest.write_text(out.stderr)
  check(valid,label+' refuses with exact whole-state/catalog rollback')
 for label,setter in [('money','valor=valor+1'),('financial fields','fecha=fecha+1,cantidad=coalesce(cantidad,0)+1,precio_unitario=coalesce(precio_unitario,0)+1'),('description','nombre=\'Synthetic forbidden\''),('observations','observaciones=\'Synthetic forbidden\''),('invoice','url_factura=\'https://synthetic.invalid/forbidden\''),('identity','id='+p.u(c.uid()))]:
  deny('ordinary measured '+label,'UPDATE fin_ingresos SET '+setter+' WHERE id='+p.u(target)+';')
 deny('ordinary measured deletion','DELETE FROM fin_ingresos WHERE id='+p.u(target)+';')
 clone=dict(income,id=c.uid(),created_by=owner,updated_by=owner);newid=clone['id']
 seed=lambda row:'INSERT INTO fin_ingresos SELECT x.* FROM jsonb_populate_record(NULL::fin_ingresos,'+p.js(row)+')x WHERE true;'
 deny('ordinary measured upsert',seed(income)[:-1]+' ON CONFLICT(id) DO UPDATE SET valor=excluded.valor+1;')
 sql(seed(clone));authority=sql(SCHEMA.read_text())
 deny('mixed bulk write is atomic','UPDATE fin_ingresos SET valor=valor+1 WHERE id IN('+p.u(target)+','+p.u(newid)+');')
 deny('JWT/custom route flag cannot authorize measured write','UPDATE fin_ingresos SET valor=valor+1 WHERE id='+p.u(target)+';',"SET LOCAL request.jwt.claim.role='service_role';SET LOCAL hato.prepared='true';")
 # PostgreSQL checks CASCADE child privileges before executing the parent trigger.
 # Accept only the two exact retained incoming-FK targets, never a generic error.
 children=tuple('permission denied for table '+item['from'] for item in json.loads(authority)['incoming_fks'] if item['to']=='fin_ingresos')
 assert set(children)=={'permission denied for table hato_eventos','permission denied for table hato_produccion_quincenal'}
 deny('ordinary TRUNCATE CASCADE early child privilege','TRUNCATE fin_ingresos CASCADE;',required=children)
 deny('ordinary direct helper truncate guard','SELECT fn_hato_check_income_boundary(NULL,NULL,true);')
 deny('ordinary replica trigger bypass',"SET LOCAL session_replication_role='replica';UPDATE fin_ingresos SET valor=valor+1 WHERE id="+p.u(target)+';',required='permission denied')
 deny('ordinary owner role substitution',"SET LOCAL ROLE postgres;UPDATE fin_ingresos SET valor=valor+1 WHERE id="+p.u(target)+';',prefix='SET LOCAL SESSION AUTHORIZATION authenticated;',required='permission denied')
 deny('ordinary service role substitution',"SET LOCAL ROLE service_role;UPDATE fin_ingresos SET valor=valor+1 WHERE id="+p.u(target)+';',prefix='SET LOCAL SESSION AUTHORIZATION authenticated;',required='permission denied')
 deny('ordinary trigger disable','ALTER TABLE fin_ingresos DISABLE TRIGGER zz_measured_income_row_boundary;',required='must be owner')
 # Public helper cannot grant inactive/missing/foreign profiles a new association-lock capability.
 for kind in ['inactive','missing','other-role']:
  actor=c.uid();sql('INSERT INTO auth.users VALUES('+p.u(actor)+');')
  if kind!='missing':sql('INSERT INTO usuarios(id,email,rol,activo) VALUES('+p.u(actor)+','+p.lit(actor+'@synthetic.invalid')+','+p.lit('Gerencia' if kind=='inactive' else 'Administrador')+','+('false' if kind=='inactive' else 'true')+');')
  before=sql(query);out=sql('BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+p.lit(actor)+';SELECT fn_hato_check_income_boundary(NULL,NULL,false);COMMIT;',False)
  check(out.returncode!=0 and 'Fresh active Gerencia quincena owner required' in out.stderr and sql(query)==before,kind+' public helper refuses before association lock')
 # General browser/bulk-shaped INSERT/UPDATE/DELETE stays available; rollback proves retained history.
 before=sql(query);bulk=[dict(clone,id=c.uid()),dict(clone,id=c.uid())]
 stmt=''.join(seed(x) for x in bulk)+'UPDATE fin_ingresos SET observaciones=\'Synthetic general edit\',valor=valor+1 WHERE id='+p.u(newid)+';DELETE FROM fin_ingresos WHERE id='+p.u(newid)+';SELECT NOT EXISTS(SELECT 1 FROM fin_ingresos WHERE id='+p.u(newid)+');'
 out=sql('BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+p.lit(owner)+';'+stmt+'ROLLBACK;');check(out.splitlines()[-1]=='t' and sql(query)==before,'ordinary unmeasured general/bulk creation edit deletion preserved without history changes')
 # Shared derived-monthly association does not infer a measured ownership claim.
 derived=c.uid();sql('INSERT INTO hato_produccion_quincenal(id,anio,mes,quincena,litros_total,origen_dato,created_by,fin_ingreso_id) VALUES('+p.u(derived)+",2049,2,1,4,'derivado_mensual',"+p.u(owner)+','+p.u(newid)+');');before=sql(query)
 out=sql('BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+p.lit(owner)+";UPDATE fin_ingresos SET valor=valor+1 WHERE id="+p.u(newid)+' RETURNING id;ROLLBACK;');check(newid in out and sql(query)==before,'derived-monthly shared income edit remains compatible without inferred ownership')
 before=sql(query);out=sql('BEGIN;SET LOCAL ROLE service_role;SET LOCAL request.jwt.claim.sub='+p.lit(owner)+';UPDATE fin_ingresos SET valor=valor+1,observaciones=\'Synthetic retained service\' WHERE id='+p.u(target)+' RETURNING id;ROLLBACK;');check(target in out and sql(query)==before,'service/import measured row lane preserved and rolled back exactly')
 def drift(ddl,label):
  before=sql(query);acl=sql(SCHEMA.read_text());out=sql('BEGIN;'+ddl+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+p.lit(owner)+";SELECT fn_hato_quincena_web('status',"+p.u(c.uid())+',NULL,'+p.u(owner)+');COMMIT;',False)
  check(out.returncode!=0 and any(t in out.stderr for t in ['Unreviewed quincena','Quincena web entry authority drift','Private quincena core grant drift','Measured income helper binding drift']) and sql(query)==before and sql(SCHEMA.read_text())==acl,label+' detected with whole-state/catalog rollback')
 drift('ALTER TABLE fin_ingresos DISABLE TRIGGER zz_measured_income_row_boundary;','disabled row guard')
 drift('DROP TRIGGER measured_income_statement_boundary ON fin_ingresos;','missing statement guard')
 drift('ALTER FUNCTION fn_hato_income_boundary_trigger() SECURITY DEFINER;','invoker identity substitution')
 drift('ALTER FUNCTION fn_hato_check_income_boundary(uuid,uuid,boolean) SET search_path=public;','helper search_path substitution')
 drift('GRANT EXECUTE ON FUNCTION fn_hato_check_income_boundary(uuid,uuid,boolean) TO anon;','anonymous helper authority')
 drift('ALTER FUNCTION fn_hato_check_income_boundary(uuid,uuid,boolean) STRICT;','helper strict NULL-argument substitution')
 deny('ordinary helper no-op drift','UPDATE fin_ingresos SET valor=valor+1 WHERE id='+p.u(target)+';',"CREATE OR REPLACE FUNCTION fn_hato_check_income_boundary(p_old uuid,p_new uuid,p_truncate boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN RETURN;END$$;",required='Measured income helper binding drift')
 deny('ordinary helper STRICT drift','UPDATE fin_ingresos SET valor=valor WHERE false;','ALTER FUNCTION fn_hato_check_income_boundary(uuid,uuid,boolean) STRICT;',required='Measured income helper binding drift')
 drift('CREATE OR REPLACE FUNCTION fn_hato_check_income_boundary(p_old uuid,p_new uuid,p_truncate boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN RETURN;END$$;','helper no-op substitution')
 # A late trusted audit mutation of the new guard must roll back writes, receipt and catalog.
 call=ctx['call'];region=sql("SELECT id FROM fin_regiones WHERE nombre='Synthetic protected region';");medium=sql("SELECT id FROM fin_medios_pago WHERE nombre='Synthetic protected medium';")
 fields=dict(year=2052,month=5,quincena=1,liters=100,pomar=100,cows=1,notes='Synthetic late boundary drift',incomeDate='2052-05-15',gross=1000,regionId=region,mediumId=medium,buyerId=None,name=None)
 draft=dict(version=1,kind='save',targetId=None,fields=fields);source=call('fn_hato_quincena_source_web',[p.js(draft),p.u(owner)],actor=owner);key=c.uid()
 call('fn_hato_quincena_web',[p.lit('prepare'),p.u(key),p.js(dict(draft,observed=source['source'])),p.u(owner)],actor=owner);before=sql(query)
 ddl="CREATE FUNCTION public.synthetic_income_boundary_drift() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN ALTER TABLE public.fin_ingresos DISABLE TRIGGER zz_measured_income_row_boundary;RETURN NEW;END$$;CREATE TRIGGER synthetic_income_boundary_drift AFTER INSERT ON hato_quincena.audit FOR EACH ROW EXECUTE FUNCTION public.synthetic_income_boundary_drift();"
 failed=sql('BEGIN;'+ddl+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+p.lit(owner)+";SELECT fn_hato_quincena_web('post',"+p.u(key)+',NULL,'+p.u(owner)+');COMMIT;',False)
 check(failed.returncode!=0 and 'Unreviewed quincena' in failed.stderr and sql(query)==before and sql(SCHEMA.read_text())==authority,'late audit guard disable restores every domain/private/Storage/backup row and exact authority')
 check(call('fn_hato_quincena_web',[p.lit('post'),p.u(key),'NULL::jsonb',p.u(owner)],actor=owner)['state']=='committed','same original posts once after known boundary drift rollback')
 call('fn_hato_quincena_web',[p.lit('acknowledge'),p.u(key),'NULL::jsonb',p.u(owner)],actor=owner)
 # Two real concurrent association/writer lock orderings; synthetic fixtures only.
 incomes=[];productions=[]
 for n in range(2):
  item=dict(clone,id=c.uid());sql(seed(item));incomes.append(item['id']);productions.append(dict(production,id=c.uid(),fin_ingreso_id=item['id'],anio=2050,mes=3+n,quincena=1,fecha_inicio=f'2050-{3+n:02d}-01',fecha_fin=f'2050-{3+n:02d}-15',created_by=owner,updated_by=owner))
 proc=subprocess.run(['node',str(Path(__file__).with_name('measured-income-boundary-native.mjs'))],input=json.dumps(dict(socket=sql('SHOW unix_socket_directories;'),client=str(b.exercise.client),owner=owner,incomes=incomes,production=productions)),text=True,capture_output=True,cwd=r.ROOT,timeout=60)
 if proc.returncode:
  dest=Path('/tmp/escocia-income-boundary-races-private.log');dest.touch(mode=0o600,exist_ok=True);dest.write_text(proc.stderr);raise AssertionError('Local income association race failed; inspect private diagnostics')
 exercise.evidence=json.loads(proc.stdout);check(exercise.evidence['observed_lock_races']==2,'two observed income/association lock races preserve boundary and valid shared ordering')
 sql('SELECT hato_income_metadata.assert_baseline();SELECT invoice_upload.assert_controls();');check(sql(SCHEMA.read_text())==authority,'all boundary probes retain exact coordinated catalog/authority')

def main():
 ap=argparse.ArgumentParser()
 for name in ['evidence-dir','runtime','client','output','private-diagnostics']:ap.add_argument('--'+name,type=Path,required=True)
 x=ap.parse_args()
 for entry in [b.exercise,b.b.exercise,b.b.b.b.exercise,b.b.b.b.b.m.exercise,b.b.b.b.b.m.b.exercise]:entry.client=x.client.resolve()
 inv=json.loads(INVENTORY.read_text());assert not any(x['rpc'] in ['fn_hato_guardar_quincena_venta','fn_hato_eliminar_quincena_venta'] for x in inv['rpcs']);assert not any('hato_produccion_quincenal' in x['targets'] for x in inv['writers'] if not x['file'].startswith('scripts/import-hato/'));assert all(r.p.digest((r.ROOT/k).read_bytes())==v for k,v in inv['source_hashes'].items())
 prior=json.loads((r.ROOT/'docs/security-integrity/hato-quincena-retirement-replay.json').read_text());files=list(dict.fromkeys([Path(__file__),SOURCE,Path(__file__).with_name('build-measured-income-boundary.py'),Path(__file__).with_name('measured-income-boundary-native.mjs'),SCHEMA,INVENTORY,Path(__file__).with_name('financial-writer-retirement-inventory.mjs'),*[r.ROOT/k for k in json.loads(INVENTORY.read_text())['source_hashes']],*[r.ROOT/k for k in prior['source_hashes']]]));frozen={f:f.read_bytes() for f in files};base=b.b.b.b.b.m.b.p.p
 while not hasattr(base,'s'):base=base.p
 catalog,rls,storage,t,hashes,_=base.s.load(x.evidence_dir.resolve());base.install.inputs=(storage,t,rls,catalog)
 if x.output.resolve().is_relative_to(x.evidence_dir.resolve()) or x.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(x.runtime.resolve(),x.client.resolve(),x.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(f.read_bytes()!=v for f,v in frozen.items()):raise ValueError('Changing measured income boundary sources cannot be certified')
 result.update(coordinated_candidate_count=61,installed_sdk={'prior':b.b.b.b.b.m.exercise.sdk,'origin_caller':b.b.b.b.exercise.sdk,'terminal_caller':b.b.exercise.sdk,'quincena_caller':b.exercise.sdk},boundary=exercise.evidence,source_hashes={str(f.relative_to(r.ROOT)):r.p.digest(v) for f,v in frozen.items()},temporary_database_stopped_and_removed=True,limits=['Six approved local private structure exports and contained synthetic PostgreSQL only; never production.','Ordinary measured-income row boundary only; privileged service/import and prepared callers preserved. Ordinary writes require READ COMMITTED. Global/transitive definer/runtime/reader/recovery and remaining financial lifecycle remain gates.'])
 x.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
