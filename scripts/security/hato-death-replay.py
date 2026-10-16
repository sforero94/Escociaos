#!/usr/bin/env python3
"""Atomic prospective death, on the four-export local schema only."""
import argparse
import concurrent.futures
import importlib.util
import json
import subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('operations',Path(__file__).with_name('alert-cron-operations-replay.py'))
t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
c,r,lit,js,u=t.c,t.r,t.lit,t.js,t.u
SOURCE=r.ROOT/'src/sql/security-candidates/hato-death.sql'
def install(sql):
 t.install(sql)
 if sql(Path(__file__).with_name('hato-death-baseline-query.sql').read_text())!='e38c55e63d4edead8ad75bb4907bdbbf':raise AssertionError('Death reviewed thirteen-relation baseline')
 for drift in ("ALTER TABLE public.hato_animales ADD COLUMN synthetic_unreviewed boolean;","ALTER TABLE public.hato_eventos ENABLE ROW LEVEL SECURITY;ALTER TABLE public.hato_eventos FORCE ROW LEVEL SECURITY;"):
  failed=sql('BEGIN;'+drift+SOURCE.read_text(),False)
  if failed.returncode==0 or 'Unreviewed death source graph' not in failed.stderr or sql("SELECT to_regnamespace('hato_death') IS NULL;")!='t':
   path=Path('/tmp/escocia-death-admission-private.log');path.touch(mode=0o600,exist_ok=True);path.write_text(failed.stderr);raise AssertionError('Death admission rollback; private diagnostics saved')
 sql(SOURCE.read_text())
def exercise(sql,ctx):
 check,call=ctx['check'],ctx['call'];target=ctx['treated']['payload']['animalId']
 tables=json.loads(sql("SELECT jsonb_agg(jsonb_build_array(schemaname,tablename) ORDER BY schemaname,tablename) FROM pg_tables WHERE schemaname<>'information_schema' AND schemaname NOT LIKE 'pg_%';"))
 base="SELECT jsonb_object_agg(name,rows) FROM ("+' UNION ALL '.join('SELECT '+lit(a+'.'+b)+" name,(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]') FROM "+r.q(a)+'.'+r.q(b)+' x) rows' for a,b in tables)+') snapshot'
 query="SELECT jsonb_build_object('base',("+base+"),'source',alert_cron.source(),'requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_death.requests x),'audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_death.audit x));"
 state=lambda:sql(query)
 def death(mode,key,intent=None,owner=c.OWNER,expected=None,ok=True):return call('fn_hato_death_web',[lit(mode),u(key),js(intent) if intent is not None else 'NULL::jsonb',u(expected or owner)],actor=owner,ok=ok)
 animal=json.loads(sql('SELECT to_jsonb(x) FROM hato_animales x WHERE id='+u(target)+';'))
 day=sql("SELECT to_char((now() AT TIME ZONE 'America/Bogota')::date,'YYYY-MM-DD');")
 intent=dict(version=1,animalId=target,date=day,cause='Synthetic observed death',observedAnimal=animal)
 key=c.uid();prepared=death('prepare',key,intent)
 check(prepared['state']=='pending' and prepared['original']['animal']==animal,'original active animal and related graph reserved without domain mutation')
 before=state();check(death('prepare',key,intent)==prepared and state()==before,'same-key preparation preserves original reserved event')
 def refuse(label,fn,marker):
  before=state();failure=fn()
  if failure.returncode==0 or marker.lower() not in failure.stderr.lower() or state()!=before:
   Path('/tmp/escocia-death-unexpected-private.log').touch(mode=0o600,exist_ok=True);Path('/tmp/escocia-death-unexpected-private.log').write_text(failure.stderr);raise AssertionError(label+' refusal/rollback; private diagnostics saved')
  check(True,label+' refuses with complete rollback')
 def raw(ddl):return sql('BEGIN;'+ddl+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(c.OWNER)+';SELECT fn_hato_death_web('+lit('post')+','+u(key)+',NULL::jsonb,'+u(c.OWNER)+');COMMIT;',False)
 refuse('cross owner',lambda:death('status',key,owner=c.OTHER,expected=c.OWNER,ok=False),'owner')
 refuse('late source change',lambda:raw('UPDATE hato_animales SET notas=\'Synthetic competing edit\' WHERE id='+u(target)+';'),'graph changed')
 for table,event,body,marker in [('public.hato_eventos','BEFORE INSERT','RETURN NULL;','event suppressed'),('public.hato_animales','BEFORE UPDATE','RETURN NULL;','state suppressed'),('public.hato_correcciones','BEFORE INSERT','RETURN NULL;','correction audit'),('hato_death.audit','BEFORE INSERT','RETURN NULL;','audit suppressed'),('hato_death.requests','BEFORE UPDATE','RETURN NULL;','control suppressed')]:
  ddl='CREATE FUNCTION public.synthetic_death_fault() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN '+body+' END $f$;CREATE TRIGGER synthetic_death_fault '+event+' ON '+table+' FOR EACH ROW EXECUTE FUNCTION public.synthetic_death_fault();'
  refuse(table+' suppression',lambda ddl=ddl:raw(ddl),marker)
 # A distinct reviewed key competes for exactly the same still-active source.
 competing=c.uid();death('prepare',competing,intent)
 for label,ddl,marker in [('event actor mutation',"CREATE FUNCTION public.synthetic_death_mutate() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN NEW.created_by=NULL;RETURN NEW;END $f$;CREATE TRIGGER synthetic_death_mutate BEFORE INSERT ON hato_eventos FOR EACH ROW EXECUTE FUNCTION synthetic_death_mutate();",'event suppressed'),('late unrelated profile edit',"CREATE FUNCTION public.synthetic_death_mutate() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN UPDATE public.usuarios SET activo=NOT activo WHERE id="+u(c.OTHER)+";RETURN NEW;END $f$;CREATE TRIGGER synthetic_death_mutate AFTER INSERT ON hato_eventos FOR EACH ROW EXECUTE FUNCTION synthetic_death_mutate();",'source mismatch')]:refuse(label,lambda ddl=ddl:raw(ddl),marker)
 before_post=json.loads(state())['base']
 with concurrent.futures.ThreadPoolExecutor(2) as pool:
  x=pool.submit(death,'post',key);y=pool.submit(death,'post',key);posted=x.result();other=y.result()
 refuse('competing prepared death',lambda:death('post',competing,ok=False),'graph changed')
 after_post=json.loads(state())['base'];allowed={'public.hato_animales','public.hato_eventos','public.hato_correcciones','hato_death.requests','hato_death.audit'}
 check(all(v==after_post[k] for k,v in before_post.items() if k not in allowed),'all other public/backup/financial/clinical/private evidence remains byte-identical')
 check(posted==other and posted['state']=='committed','concurrent original post produces one event/state/trusted receipt')
 before=state();check(death('status',key)==posted and death('post',key)==posted and state()==before,'lost response recovers original receipt without repeat mutation')
 check(json.loads(sql('SELECT receipt FROM hato_death.audit WHERE request_key='+u(key)+';'))==posted['receipt'],'independent trusted audit equals returned proof')
 fencekey=c.uid();fence=death('resolve',fencekey);check(fence['state']=='canceled' and death('prepare',fencekey,intent)==fence,'cancel before prepare permanently fences original key')
 for role in ('anon','authenticated','service_role'):refuse(role+' private proof',lambda role=role:sql('BEGIN;SET LOCAL ROLE '+role+';SELECT * FROM hato_death.requests;COMMIT;',False),'permission denied')
 sql('UPDATE usuarios SET activo=false WHERE id='+u(c.OWNER)+';');refuse('revoked status',lambda:death('status',key,ok=False),'active');sql('UPDATE usuarios SET activo=true WHERE id='+u(c.OWNER)+';')
 # A separate synthetic active animal exercises the actual installed SDK/browser.
 sdk_animal=c.uid();sql('INSERT INTO hato_animales SELECT (jsonb_populate_record(NULL::hato_animales,'+js(dict(animal,id=sdk_animal,numero=None,nombre='Synthetic SDK death'))+')).*;')
 data=dict(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),owner=c.OWNER,other=c.OTHER,animal=sdk_animal,day=day)
 proc=subprocess.run(['node',str(Path(__file__).with_name('hato-death-native.mjs'))],input=json.dumps(data),text=True,capture_output=True,cwd=r.ROOT,timeout=90)
 if proc.returncode:
  path=Path('/tmp/escocia-death-sdk-private.log');path.touch(mode=0o600,exist_ok=True);path.write_text(proc.stderr);raise ValueError('Actual death SDK replay failed; private diagnostics saved')
 exercise.sdk=json.loads(proc.stdout);check(exercise.sdk['assertions']>=12,'actual installed SDK/browser proves original recovery and independent native audit')
 exercise.result=dict(asserted_atomic_death=True)
def main():
 a=argparse.ArgumentParser();a.add_argument('--evidence-dir',type=Path,required=True)
 for n in ('runtime','client','output','private-diagnostics'):a.add_argument('--'+n,type=Path,required=True)
 args=a.parse_args();exercise.client=args.client.resolve();evidence=args.evidence_dir.resolve();files=[*sorted((r.ROOT/'src/sql/security-candidates').glob('*.sql')),Path(__file__),Path(__file__).with_name('hato-death-native.mjs'),Path(__file__).with_name('hato-death-baseline-query.sql'),*[r.ROOT/'src/utils/hato'/n for n in ('hatoDeathProtocol.ts','hatoDeathBrowserAttempt.ts')],r.ROOT/'src/components/hato/components/MuerteAnimalDialog.tsx',r.ROOT/'src/components/hato/hooks/useDeath.ts',r.ROOT/'src/components/hato/HojaDeVida.tsx',r.ROOT/'src/components/hato/hooks/useRegistrarSalidaHato.ts'];sources={p:p.read_bytes() for p in files};catalog,rls,hashes=r.load(evidence)
 if args.output.resolve().is_relative_to(evidence) or args.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(args.runtime.resolve(),args.client.resolve(),args.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(p.read_bytes()!=b for p,b in sources.items()):raise ValueError('Death sources changed during replay')
 result.update(exercise.result,coordinated_candidate_count=23,admission_rollback_probes=2,limits=['Local synthetic Auth/private Unix socket only; never production.','Remaining lifecycle writers, direct grants, deployed JWT/runtime parity and coherent restore are not certified.'],sdk_proof=exercise.sdk,source_hashes={str(p.relative_to(r.ROOT)):r.p.digest(b) for p,b in sources.items()},temporary_database_stopped_and_removed=True)
 args.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
