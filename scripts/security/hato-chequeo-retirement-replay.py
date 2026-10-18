#!/usr/bin/env python3
"""Narrow obsolete chequeo RPC retirement; private local metadata only."""
import argparse,importlib.util,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('prior_retirement',Path(__file__).with_name('hato-chequeo-integrity-replay.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
c,r,u,lit,js=p.c,p.r,p.u,p.lit,p.js
SOURCE=r.ROOT/'src/sql/security-candidates/hato-chequeo-retirement.sql'
def legacy(sql):return sql("SELECT jsonb_build_object('body',md5(prosrc),'definer',prosecdef,'config',proconfig,'acl',proacl::text,'owner',pg_get_userbyid(proowner)) FROM pg_proc WHERE oid='fn_hato_commit_chequeo(jsonb,uuid)'::regprocedure;")
def table_acl(sql):return sql("SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relacl::text,(SELECT jsonb_agg(jsonb_build_array(attname,attacl::text) ORDER BY attnum) FROM pg_attribute WHERE attrelid=c.oid AND attnum>0 AND NOT attisdropped)) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','respaldos','hato_chequeo_integrity') AND c.relkind IN('r','p');")
def install(sql):
 p.install(sql);state=p.p.p.query(sql);before=sql(state);prior=legacy(sql);before_acl=table_acl(sql)
 for ddl,marker in [("ALTER FUNCTION fn_hato_commit_chequeo(jsonb,uuid) SET search_path=public;",'legacy chequeo function'),("GRANT EXECUTE ON FUNCTION fn_hato_commit_chequeo(jsonb,uuid) TO authenticated;",'legacy chequeo grants'),("ALTER FUNCTION fn_hato_chequeo_web(text,uuid,uuid) SET search_path=public;",'prepared chequeo helper/entry')]:
  failed=sql('BEGIN;'+ddl+SOURCE.read_text(),False)
  if failed.returncode==0 or marker not in failed.stderr or sql(state)!=before or legacy(sql)!=prior:raise AssertionError('Chequeo retirement admission full rollback '+marker)
 sql(SOURCE.read_text())
 if sql(state)!=before or table_acl(sql)!=before_acl:raise AssertionError('Retirement changed domain/control rows or table/column ACLs')

def exercise(sql,ctx):
 p.exercise.client=exercise.client;p.exercise(sql,ctx);exercise.sdk=p.exercise.sdk;check=ctx['check'];state=lambda:sql(p.p.p.query(sql));owner=c.OWNER
 for role in ['anon','authenticated','service_role']:
  before=state();failed=sql('BEGIN;SET LOCAL ROLE '+role+";SELECT fn_hato_commit_chequeo('{}'::jsonb,"+u(owner)+');COMMIT;',False);check(failed.returncode!=0 and state()==before,'obsolete chequeo execution denied for '+role+' with no row/control mutation')
 for ddl in ["GRANT EXECUTE ON FUNCTION fn_hato_commit_chequeo(jsonb,uuid) TO service_role;","GRANT EXECUTE ON FUNCTION fn_hato_commit_chequeo(jsonb,uuid) TO PUBLIC;","ALTER FUNCTION fn_hato_commit_chequeo(jsonb,uuid) SECURITY DEFINER;","ALTER FUNCTION fn_hato_commit_chequeo(jsonb,uuid) SET search_path=public;"]:
  before=state();prior=legacy(sql);failed=sql('BEGIN;'+ddl+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(owner)+";SELECT fn_hato_chequeo_web('status',"+u(c.uid())+','+u(owner)+');COMMIT;',False);check(failed.returncode!=0 and 'retired chequeo boundary' in failed.stderr and state()==before and legacy(sql)==prior,'restored legacy grants/definer/config refuse protected status and roll back catalog drift')
 before=state();prior=legacy(sql);failed=sql("BEGIN;GRANT EXECUTE ON FUNCTION fn_hato_commit_chequeo(jsonb,uuid) TO service_role;SET LOCAL ROLE service_role;SELECT fn_hato_commit_chequeo('{}'::jsonb,"+u(owner)+');COMMIT;',False);check(failed.returncode!=0 and 'Legacy chequeo RPC retired' in failed.stderr and state()==before and legacy(sql)==prior,'restored service grant alone still cannot execute retired body')
 # Reuse an existing synthetic animal for a no-event review; do not invent history.
 animal=json.loads(sql('SELECT to_jsonb(x) FROM hato_animales x ORDER BY id LIMIT 1;'));key=c.uid();source=json.loads(sql('SET ROLE service_role;SELECT fn_hato_chequeo_source_service('+u(owner)+');'))
 intent=dict(version=1,archivo='Synthetic retirement attempt',filas=[dict(fila=1)])
 payload=dict(chequeo=dict(fecha='2020-01-01',veterinario=None),vacas=[dict(animal_id=animal['id'],normalizacion_issues=[])],eventos=[])
 sql('SET ROLE service_role;SELECT fn_hato_chequeo_prepare_service('+','.join([u(owner),u(key),js(intent),js(source),js(payload)])+');')
 before=state();prior=legacy(sql);ddl="CREATE FUNCTION public.synthetic_chequeo_late_grant() RETURNS trigger LANGUAGE plpgsql AS $fault$ BEGIN GRANT EXECUTE ON FUNCTION public.fn_hato_commit_chequeo(jsonb,uuid) TO service_role;RETURN NEW;END $fault$;CREATE TRIGGER synthetic_chequeo_late_grant AFTER INSERT ON hato_chequeo_integrity.audit FOR EACH ROW EXECUTE FUNCTION public.synthetic_chequeo_late_grant();"
 failed=sql('BEGIN;'+ddl+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(owner)+";SELECT fn_hato_chequeo_web('post',"+u(key)+','+u(owner)+');COMMIT;',False);check(failed.returncode!=0 and 'retired chequeo boundary' in failed.stderr and state()==before and legacy(sql)==prior,'late audit-trigger legacy regrant rolls back all chequeo/domain/control/audit/catalog changes')
 check(ctx['call']('fn_hato_chequeo_web',[lit('post'),u(key),u(owner)],actor=owner)['state']=='committed','protected prepared chequeo remains compatible after late-drift refusal')
 exercise.proof=dict(legacy_service_rpc_retired=True,direct_table_grants_unchanged=True,protected_caller_compatible=True)
def main():
 parser=argparse.ArgumentParser()
 for name in ('evidence-dir','runtime','client','output','private-diagnostics'):parser.add_argument('--'+name,type=Path,required=True)
 a=parser.parse_args();exercise.client=a.client.resolve();inventory_path=r.ROOT/'docs/security-integrity/hato-chequeo-retirement-callers.json';inventory=json.loads(inventory_path.read_text());files=[Path(__file__),SOURCE,*[r.ROOT/k for k in json.loads((r.ROOT/'docs/security-integrity/hato-chequeo-integrity-replay.json').read_text())['source_hashes']]];files.extend([inventory_path,Path(__file__).with_name('hato-chequeo-caller-inventory.mjs'),*[r.ROOT/k for k in inventory['source_hashes']]]);files=list(dict.fromkeys(files));sources={f:f.read_bytes() for f in files};catalog,rls,hashes=r.load(a.evidence_dir.resolve());assert not inventory['legacy_literal_rpc_callers'];assert all(r.p.digest((r.ROOT/k).read_bytes())==v for k,v in inventory['source_hashes'].items())
 if a.output.resolve().is_relative_to(a.evidence_dir.resolve()) or a.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(a.runtime.resolve(),a.client.resolve(),a.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(f.read_bytes()!=v for f,v in sources.items()):raise ValueError('Changing retirement sources cannot be certified')
 result.update(coordinated_candidate_count=41,admission_rollback_probes=3,sdk_proof=exercise.sdk,proof=exercise.proof,source_hashes={str(f.relative_to(r.ROOT)):r.p.digest(v) for f,v in sources.items()},temporary_database_stopped_and_removed=True,limits=['Four local private metadata exports/synthetic Auth/service role/private socket only; never production.','Only obsolete chequeo RPC retired; direct catalog/service/import writers, hosted stale-version drain, ordinary-role/global/capacity/recovery remain open.'])
 a.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
