#!/usr/bin/env python3
"""Ordinary catalog writer retirement; four private local exports only."""
import argparse,importlib.util,json,subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('prior_catalog_retirement',Path(__file__).with_name('hato-chequeo-retirement-replay.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
c,r,u,lit,js=p.c,p.r,p.u,p.lit,p.js
SOURCE=r.ROOT/'src/sql/security-candidates/hato-catalog-retirement.sql'
def state_query(sql):return p.p.p.p.query(sql)
def privileges(sql):return sql("SELECT jsonb_agg(jsonb_build_array(r.role,c.relname,p.privilege,has_table_privilege(r.role,c.oid,p.privilege)) ORDER BY r.role,c.relname,p.privilege) FROM(VALUES('service_role'))r(role) CROSS JOIN pg_class c CROSS JOIN(VALUES('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'))p(privilege) WHERE c.oid IN('hato_toros'::regclass,'hato_pajillas'::regclass);")
def install(sql):
 p.install(sql);before=sql(state_query(sql));service=privileges(sql)
 for ddl,marker in [("GRANT UPDATE(nombre) ON hato_toros TO authenticated;",'table/column authority'),("ALTER TABLE hato_pajillas FORCE ROW LEVEL SECURITY;",'table/column authority'),("ALTER FUNCTION fn_hato_catalog_edit_web(text,uuid,jsonb,uuid) SET search_path=public;",'prepared catalog entry')]:
  failed=sql('BEGIN;'+ddl+SOURCE.read_text(),False)
  if failed.returncode==0 or marker not in failed.stderr or sql(state_query(sql))!=before:raise AssertionError('Catalog retirement admission rollback '+marker)
 sql(SOURCE.read_text())
 if sql(state_query(sql))!=before or privileges(sql)!=service:raise AssertionError('Retirement changed rows or service privileges')
def exercise(sql,ctx):
 p.exercise.client=exercise.client;p.exercise(sql,ctx);exercise.chequeo_sdk=p.exercise.sdk
 check=ctx['check'];state=lambda:sql(state_query(sql));owner=c.OWNER;bull=c.uid()
 # Historical importer uses service INSERT after its own SELECT; preserve this exact SQL lane.
 sql('SET ROLE service_role;INSERT INTO hato_toros(id,nombre) VALUES('+u(bull)+",'Synthetic preserved historical import');")
 check(sql('SELECT count(*) FROM hato_toros WHERE id='+u(bull)+';')=='1','service historical import bull INSERT remains available')
 for role in ['anon','authenticated']:
  for table in ['hato_toros','hato_pajillas']:
   for action in ['INSERT','UPDATE','DELETE','TRUNCATE']:
    statement={'INSERT':"INSERT INTO "+table+" DEFAULT VALUES;",'UPDATE':'UPDATE '+table+' SET id=id;', 'DELETE':'DELETE FROM '+table+';', 'TRUNCATE':'TRUNCATE '+table+' CASCADE;'}[action]
    before=state();failed=sql('BEGIN;SET LOCAL ROLE '+role+';'+statement+'COMMIT;',False)
    check(failed.returncode!=0 and 'permission denied' in failed.stderr and state()==before,role+' direct '+table+' '+action+' denied without mutation')
  check(sql("SELECT has_table_privilege("+lit(role)+",'hato_toros','SELECT') AND has_table_privilege("+lit(role)+",'hato_pajillas','SELECT');")=='t',role+' catalog SELECT grants preserved')
 def drift(ddl,label):
  before=state();acl=p.table_acl(sql);failed=sql('BEGIN;'+ddl+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(owner)+";SELECT fn_hato_catalog_creation_web('status',"+u(c.uid())+',NULL,'+u(owner)+');COMMIT;',False)
  check(failed.returncode!=0 and 'Retired catalog writer privilege restored' in failed.stderr and state()==before and p.table_acl(sql)==acl,label+' refuses with full-state/ACL rollback')
 for table,column in [('hato_toros','nombre'),('hato_pajillas','activa')]:
  for privilege in ['INSERT','UPDATE','DELETE','TRUNCATE']:drift('GRANT '+privilege+' ON '+table+' TO authenticated;',table+' restored '+privilege)
  for privilege in ['INSERT','UPDATE']:drift('GRANT '+privilege+'('+column+') ON '+table+' TO anon;',table+' restored column '+privilege)
 drift('GRANT UPDATE ON hato_toros TO PUBLIC;','PUBLIC writer')
 drift('CREATE ROLE synthetic_catalog_writer;GRANT synthetic_catalog_writer TO authenticated;GRANT INSERT ON hato_toros TO synthetic_catalog_writer;','inherited writer')
 # Actual SDK/native browser adapters on the fully coordinated graph with retirement installed.
 exercise.sdk={}
 for name in ['hato-catalog-creation-browser-native.mjs','hato-catalog-edit-native.mjs']:
  proc=subprocess.run(['node',str(Path(__file__).with_name(name))],input=json.dumps(dict(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),owner=owner,bull=bull,stateQuery=state_query(sql))),text=True,capture_output=True,cwd=r.ROOT,timeout=90)
  if proc.returncode:
   dest=Path('/tmp/escocia-catalog-retirement-sdk-private.log');dest.touch(mode=0o600,exist_ok=True);dest.write_text(proc.stderr);raise AssertionError('Catalog actual SDK replay failed; private diagnostics saved')
  exercise.sdk[name]=json.loads(proc.stdout);check(exercise.sdk[name]['assertions']>=12,name+' actual durable original SDK recovery and native audit pass')
 # Late grant after domain/audit writes must roll back the entire confirmed original.
 for kind in ['creation','edit']:
  key=c.uid();row=json.loads(sql('SELECT to_jsonb(x) FROM hato_toros x WHERE id='+u(bull)+';'))
  intent=dict(version=1,kind='toro',input=dict(nombre='Synthetic late grant original',tipo=None,raza=None,activo=True)) if kind=='creation' else dict(version=1,bullId=bull,observedBull={k:row[k] for k in ['id','nombre','tipo','raza','activo']},changes=dict(nombre='Synthetic late edit original',tipo=None,raza=None,activo=True))
  fn='fn_hato_catalog_'+kind+'_web';args=lambda mode: [lit(mode),u(key),js(intent) if mode=='prepare' else 'NULL::jsonb',u(owner)]
  ctx['call'](fn,args('prepare'),actor=owner);before=state();acl=p.table_acl(sql)
  ddl='CREATE FUNCTION public.synthetic_catalog_late_grant() RETURNS trigger LANGUAGE plpgsql AS $fault$ BEGIN GRANT UPDATE(nombre) ON public.hato_toros TO authenticated;RETURN NEW;END $fault$;CREATE TRIGGER synthetic_catalog_late_grant AFTER INSERT ON hato_catalog_'+kind+'.audit FOR EACH ROW EXECUTE FUNCTION public.synthetic_catalog_late_grant();'
  failed=sql('BEGIN;'+ddl+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(owner)+';SELECT '+fn+'('+','.join(args('post'))+');COMMIT;',False)
  check(failed.returncode!=0 and 'Retired catalog writer privilege restored' in failed.stderr and state()==before and p.table_acl(sql)==acl,kind+' late audit column regrant rolls back rows/control/audit/ACL')
  check(ctx['call'](fn,args('post'),actor=owner)['state']=='committed',kind+' original commits after known late-drift rollback')
  ctx['call'](fn,args('acknowledge'),actor=owner)
 exercise.proof=dict(service_import_preserved=True,ordinary_catalog_writes_retired=True,actual_callers_compatible=True)
def main():
 parser=argparse.ArgumentParser()
 for name in ('evidence-dir','runtime','client','output','private-diagnostics'):parser.add_argument('--'+name,type=Path,required=True)
 a=parser.parse_args();exercise.client=a.client.resolve();inventory=r.ROOT/'docs/security-integrity/hato-catalog-retirement-callers.json';inv=json.loads(inventory.read_text());assert inv['catalog_direct_literal_writers']==[dict(file='scripts/import-hato/load.ts',line=233,method='insert')]
 files=list(dict.fromkeys([Path(__file__),SOURCE,inventory,Path(__file__).with_name('hato-catalog-caller-inventory.mjs'),*[r.ROOT/k for k in json.loads((r.ROOT/'docs/security-integrity/hato-chequeo-retirement-replay.json').read_text())['source_hashes']],*[r.ROOT/k for k in inv['source_hashes']]]));sources={f:f.read_bytes() for f in files};assert all(r.p.digest((r.ROOT/k).read_bytes())==v for k,v in inv['source_hashes'].items());catalog,rls,hashes=r.load(a.evidence_dir.resolve())
 if a.output.resolve().is_relative_to(a.evidence_dir.resolve()) or a.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(a.runtime.resolve(),a.client.resolve(),a.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(f.read_bytes()!=v for f,v in sources.items()):raise ValueError('Changing catalog retirement sources cannot be certified')
 result.update(coordinated_candidate_count=42,admission_rollback_probes=3,sdk_proof=exercise.sdk,chequeo_sdk_proof=exercise.chequeo_sdk,proof=exercise.proof,source_hashes={str(f.relative_to(r.ROOT)):r.p.digest(v) for f,v in sources.items()},temporary_database_stopped_and_removed=True,limits=['Four local private metadata exports/synthetic Auth/private socket only; never production.','Only ordinary catalog INSERT/UPDATE/DELETE/TRUNCATE and column INSERT/UPDATE retired. Service historical import preserved; REFERENCES/TRIGGER/MAINTAIN, dynamic functions, hosted drain/global/runtime/capacity/recovery remain separate.'])
 a.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
