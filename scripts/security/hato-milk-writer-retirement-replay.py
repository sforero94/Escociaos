#!/usr/bin/env python3
"""Ordinary milk/capture writer retirement on six-export exact local replay only."""
import argparse,importlib.util,json,subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('history_retirement',Path(__file__).with_name('hato-upload-history-replay.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
c,r,u,lit,js=p.c,p.r,p.u,p.lit,p.js
SOURCE=r.ROOT/'src/sql/security-candidates/hato-milk-writer-retirement.sql'
def authority(sql):return sql("SELECT jsonb_agg(jsonb_build_array(c.relname,c.relacl,(SELECT jsonb_agg(jsonb_build_array(attname,attacl) ORDER BY attnum) FROM pg_attribute WHERE attrelid=c.oid AND attnum>0 AND NOT attisdropped)) ORDER BY c.relname) FROM pg_class c WHERE c.oid IN('hato_pesajes_leche'::regclass,'hato_capturas_foto'::regclass);")
def service(sql):return sql("SELECT jsonb_agg(jsonb_build_array(c.relname,p.privilege,has_table_privilege('service_role',c.oid,p.privilege)) ORDER BY c.relname,p.privilege) FROM pg_class c CROSS JOIN(VALUES('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN'))p(privilege) WHERE c.oid IN('hato_pesajes_leche'::regclass,'hato_capturas_foto'::regclass);")
def install(sql):
 p.install(sql);before=sql(p.query(sql));acl=authority(sql);svc=service(sql)
 for ddl in ['GRANT UPDATE(litros_total) ON hato_pesajes_leche TO authenticated;','GRANT INSERT ON hato_capturas_foto TO anon;','ALTER FUNCTION hato_milk_weighing.assert_baseline() SET search_path=public;']:
  failed=sql('BEGIN;'+ddl+SOURCE.read_text(),False)
  if failed.returncode==0 or sql(p.query(sql))!=before or authority(sql)!=acl or sql("SELECT to_regprocedure('hato_milk_weighing.assert_retired_writers()') IS NULL;")!='t':raise AssertionError('Retirement admission did not roll back exact prior state/authority')
 sql(SOURCE.read_text())
 if sql(p.query(sql))!=before or service(sql)!=svc:raise AssertionError('Retirement changed existing rows/service authority')
 if sql('SELECT hato_photo_upload.baseline();')!='39b8de1ede1283e2e57a93b9e6291c21':raise AssertionError('Exact reduced capture ACL fingerprint mismatch')
def exercise(sql,ctx):
 p.exercise.client=exercise.client;p.exercise(sql,ctx);exercise.history_sdk=p.exercise.sdk;check,call=ctx['check'],ctx['call'];state=lambda:sql(p.query(sql));owner=c.OWNER
 for role in ['anon','authenticated']:
  for table in ['hato_pesajes_leche','hato_capturas_foto']:
   for action in ['INSERT','UPDATE','DELETE','TRUNCATE']:
    stmt={'INSERT':'INSERT INTO '+table+' DEFAULT VALUES;','UPDATE':'UPDATE '+table+' SET id=id;','DELETE':'DELETE FROM '+table+';','TRUNCATE':'TRUNCATE '+table+' CASCADE;'}[action];before=state();failed=sql('BEGIN;SET LOCAL ROLE '+role+';SET LOCAL request.jwt.claim.sub='+lit(owner)+';'+stmt+'COMMIT;',False);check(failed.returncode!=0 and 'permission denied' in failed.stderr and state()==before,role+' '+table+' direct '+action+' refused without mutation')
 check(sql("SELECT count(*) FROM pg_attribute a CROSS JOIN(VALUES('anon'),('authenticated'))r(role) CROSS JOIN(VALUES('INSERT'),('UPDATE'))p(privilege) WHERE a.attrelid IN('hato_pesajes_leche'::regclass,'hato_capturas_foto'::regclass) AND a.attnum>0 AND NOT a.attisdropped AND has_column_privilege(r.role,a.attrelid,a.attnum,p.privilege);")=='0','all ordinary column INSERT/UPDATE authority retired')
 check(sql("SELECT has_table_privilege('authenticated','hato_pesajes_leche','SELECT') AND has_table_privilege('authenticated','hato_capturas_foto','SELECT') AND has_table_privilege('anon','hato_pesajes_leche','SELECT');")=='t','prior ordinary table SELECT grants preserved')
 def drift(ddl,label):
  before=state();acl=authority(sql);failed=sql('BEGIN;'+ddl+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(owner)+";SELECT fn_hato_milk_weighing_web('status',"+u(c.uid())+',NULL,'+u(owner)+');COMMIT;',False);check(failed.returncode!=0 and 'Retired milk/capture writer privilege restored' in failed.stderr and state()==before and authority(sql)==acl,label+' refused with exact full-state/authority rollback')
 for table,col in [('hato_pesajes_leche','litros_total'),('hato_capturas_foto','desenlace')]:
  for privilege in ['INSERT','UPDATE','DELETE','TRUNCATE']:drift('GRANT '+privilege+' ON '+table+' TO authenticated;',table+' restored '+privilege)
  for privilege in ['INSERT','UPDATE']:drift('GRANT '+privilege+'('+col+') ON '+table+' TO anon;',table+' restored column '+privilege)
 drift('GRANT UPDATE ON hato_pesajes_leche TO PUBLIC;','PUBLIC writer')
 drift('CREATE ROLE synthetic_milk_writer;GRANT synthetic_milk_writer TO authenticated;GRANT UPDATE ON hato_capturas_foto TO synthetic_milk_writer;','inherited writer')
 # Preserve actual service/import insert-update-delete lanes, including another capture type.
 animal=c.uid();capture=c.uid();milk=c.uid();sql('INSERT INTO hato_animales(id,nombre,numero,sexo,etapa,estado,origen,created_by) VALUES('+u(animal)+",'Synthetic retired-grant milk cow',89971,'hembra','vaca','activa','compra',"+u(owner)+');')
 sql('BEGIN;SET LOCAL ROLE service_role;INSERT INTO hato_capturas_foto(id,tipo,origen,fecha,created_by,storage_bucket,storage_prefijo) VALUES('+u(capture)+",'chequeo','web','2026-10-19',"+u(owner)+",'hato-chequeos-fotos','synthetic-preserved-service');UPDATE hato_capturas_foto SET desenlace='ocr_fallo' WHERE id="+u(capture)+';INSERT INTO hato_pesajes_leche(id,animal_id,fecha,litros_total,fuente,created_by) VALUES('+u(milk)+','+u(animal)+",'2026-10-07',2,'historico',"+u(owner)+');UPDATE hato_pesajes_leche SET litros_total=3 WHERE id='+u(milk)+';COMMIT;')
 check(sql('SELECT desenlace FROM hato_capturas_foto WHERE id='+u(capture)+';')=='ocr_fallo' and sql('SELECT litros_total FROM hato_pesajes_leche WHERE id='+u(milk)+';')=='3','shared chequeo capture and historical milk service INSERT/UPDATE preserved')
 sql('BEGIN;SET LOCAL ROLE service_role;DELETE FROM hato_capturas_foto WHERE id='+u(capture)+';DELETE FROM hato_pesajes_leche WHERE id='+u(milk)+';COMMIT;');check(sql('SELECT count(*) FROM hato_capturas_foto WHERE id='+u(capture)+';')=='0','service delete lane remains available without changing historical import files')
 # Actual browser manual/photo durable adapter with grants removed.
 reader=c.uid();photo=c.uid();sql('INSERT INTO auth.users VALUES('+u(reader)+');INSERT INTO usuarios(id,email,rol,activo) VALUES('+u(reader)+",'milk-retirement@synthetic.invalid','Gerencia',true);INSERT INTO hato_capturas_foto(id,tipo,origen,desenlace,anio,mes,created_by,fotos_recibidas,storage_bucket,storage_prefijo) VALUES("+u(photo)+",'pesaje','web','pendiente',2026,10,"+u(reader)+",1,'hato-pesajes-fotos','synthetic-browser-retirement');")
 proc=subprocess.run(['node',str(Path(__file__).with_name('hato-milk-weighing-browser-native.mjs'))],input=json.dumps(dict(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),owner=reader,animal=animal,capture=photo,stateQuery=p.query(sql).removesuffix(';')+' AS jsonb_object_agg;')),text=True,capture_output=True,cwd=r.ROOT,timeout=90)
 if proc.returncode:
  dest=Path('/tmp/escocia-milk-retirement-sdk-private.log');dest.touch(mode=0o600,exist_ok=True);dest.write_text(proc.stderr);raise AssertionError('Actual milk caller failed; see external diagnostics')
 proof=json.loads(proc.stdout);proof.pop('fixtures');exercise.browser_sdk=proof;check(proof['assertions']>=24,'actual browser manual/photo strict original recovery remains compatible after ordinary retirement')
 # Late regrant inside trusted audit must roll back the whole protected mutation.
 key=c.uid();intent=dict(version=1,year=2026,month=10,captureId=None,cells=[dict(animalId=animal,date='2026-10-28',am=4,pm=5,observed=None)])
 args=lambda mode:[lit(mode),u(key),js(intent) if mode=='prepare' else 'NULL::jsonb',u(reader)]
 call('fn_hato_milk_weighing_web',args('prepare'),actor=reader);before=state();acl=authority(sql)
 ddl="CREATE FUNCTION public.synthetic_milk_late_grant() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN GRANT UPDATE(litros_total) ON public.hato_pesajes_leche TO authenticated;RETURN NEW;END$$;CREATE TRIGGER synthetic_milk_late_grant AFTER INSERT ON hato_milk_weighing.audit FOR EACH ROW EXECUTE FUNCTION public.synthetic_milk_late_grant();"
 failed=sql('BEGIN;'+ddl+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(reader)+';SELECT fn_hato_milk_weighing_web('+','.join(args('post'))+');COMMIT;',False);check(failed.returncode!=0 and 'Retired milk/capture writer privilege restored' in failed.stderr and state()==before and authority(sql)==acl,'late trusted audit column regrant rolls back domain/control/audit/ACL')
 check(call('fn_hato_milk_weighing_web',args('post'),actor=reader)['state']=='committed','same original commits after known late-grant rollback');call('fn_hato_milk_weighing_web',args('acknowledge'),actor=reader)
def main():
 a=argparse.ArgumentParser()
 for name in ('evidence-dir','runtime','client','output','private-diagnostics'):a.add_argument('--'+name,type=Path,required=True)
 x=a.parse_args();exercise.client=x.client.resolve();inv=json.loads((r.ROOT/'docs/security-integrity/hato-milk-retirement-callers.json').read_text());assert not any(t['table']=='hato_pesajes_leche' and t['file'].startswith('src/') for t in inv['direct_literal_writers']);assert not any(t['helper']=='ejecutarCommitPesaje' for t in inv['shared_capture_or_milk_helper_calls']);assert all(r.p.digest((r.ROOT/k).read_bytes())==v for k,v in inv['source_hashes'].items())
 files=list(dict.fromkeys([Path(__file__),SOURCE,r.ROOT/'docs/security-integrity/hato-milk-retirement-callers.json',r.ROOT/'src/__tests__/hatoMilkRetirement.test.ts',*[r.ROOT/k for k in json.loads((r.ROOT/'docs/security-integrity/hato-upload-history-replay.json').read_text())['source_hashes']],*[r.ROOT/k for k in inv['source_hashes']]]));sources={f:f.read_bytes() for f in files};catalog,rls,storage,t,hashes,admission=p.p.p.p.p.p.s.load(x.evidence_dir.resolve());p.p.p.p.p.p.install.inputs=(storage,t,rls,catalog)
 if x.output.resolve().is_relative_to(x.evidence_dir.resolve()) or x.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(x.runtime.resolve(),x.client.resolve(),x.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(f.read_bytes()!=v for f,v in sources.items()):raise ValueError('Changing retirement sources cannot be certified')
 result.update(coordinated_candidate_count=53,admission_rollback_probes=3,browser_sdk_proof=exercise.browser_sdk,history_sdk_proof=exercise.history_sdk,source_hashes={str(f.relative_to(r.ROOT)):r.p.digest(v) for f,v in sources.items()},temporary_database_stopped_and_removed=True,limits=['Six local private structure exports/synthetic private PG/intercepted SDK only; no production.','Only ordinary milk/capture DML and column INSERT/UPDATE plus legacy HTTP/shared per-cell writer retired. Service/import/shared chequeo/quincena preserved. REFERENCES/TRIGGER/MAINTAIN, Storage direct grants, dynamic/legacy RPC/global reachability, hosted/runtime/capacity/recovery remain open.'])
 x.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
