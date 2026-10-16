#!/usr/bin/env python3
"""Native browser standalone pajilla usage, on the four-export local replay only."""
import argparse
import concurrent.futures
import importlib.util
import json
import subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('cycle',Path(__file__).with_name('hato-quick-telegram-replay.py'))
t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
c,r,lit,js,u=t.c,t.r,t.lit,t.js,t.u
SOURCE=r.ROOT/'src/sql/security-candidates/hato-pajilla-use.sql'
def state_query(sql):return t.state_query(sql)
def install(sql):
 t.install(sql);query=state_query(sql);before=sql(query)
 for ddl,marker in (("ALTER TABLE hato_pajillas ADD COLUMN synthetic_unreviewed boolean;",'Unreviewed pajilla use inventory graph'),("ALTER TABLE hato_eventos FORCE ROW LEVEL SECURITY;",'Unreviewed pajilla use source graph'),("ALTER FUNCTION hato_treatment_creation.web_actor() SET search_path=public;",'Unreviewed pajilla use actor helper')):
  failure=sql('BEGIN;'+ddl+SOURCE.read_text(),False)
  if failure.returncode==0 or marker not in failure.stderr or sql(query)!=before or sql("SELECT to_regnamespace('hato_pajilla_use') IS NULL;")!='t':raise AssertionError('Pajilla use admission rollback')
 sql(SOURCE.read_text())
 if sql(query)!=before:raise AssertionError('Pajilla use install changed existing rows')
def exercise(sql,ctx):
 check,call=ctx['check'],ctx['call'];target=ctx['treated']['payload']['animalId'];query=state_query(sql);state=lambda:sql(query)
 bull=c.uid();lot=c.uid();sql('INSERT INTO hato_toros(id,nombre,tipo,activo) VALUES('+u(bull)+",'Synthetic browser bull','inseminacion',true);INSERT INTO hato_pajillas(id,toro_id,cantidad_inicial) VALUES("+u(lot)+','+u(bull)+',0);UPDATE usuarios SET activo=true WHERE id='+u(c.OTHER)+';')
 def use(mode,key,intent=None,who=c.OWNER,expected='self',role='authenticated',ok=True):return call('fn_hato_pajilla_use_web',[lit(mode),u(key),js(intent) if intent is not None else 'NULL::jsonb',u(who) if expected=='self' else (u(expected) if expected else 'NULL::uuid')],actor=who,role=role,ok=ok)
 day=sql("SELECT to_char((now() AT TIME ZONE 'America/Bogota')::date,'YYYY-MM-DD');")
 intent=dict(version=1,pajillaId=lot,fechaUso=day,animalId=target);key=c.uid();prepared=use('prepare',key,intent)
 check(prepared['state']=='pending' and prepared['plan']['created_by']==c.OWNER and prepared['original']['stock']['cantidad_actual']==0,'owner-bound preparation captures actual lot/bull/animal/source/stock without posting')
 before=state();check(use('prepare',key,intent)==prepared and state()==before,'same original UUID retains immutable source and planned usage ID')
 before=state();check(call('fn_hato_pajilla_use_recover_web',[u(c.OWNER)],actor=c.OWNER)==prepared and state()==before,'read-only owner recovery returns exact pending original without allocating IDs')
 check(sql('BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(c.OTHER)+';SELECT public.fn_hato_pajilla_use_recover_web('+u(c.OTHER)+') IS NULL;COMMIT;')=='t','another active owner cannot recover private original proof')
 def refuse(label,fn,marker):
  before=state();failure=fn()
  if failure.returncode==0 or marker.lower() not in failure.stderr.lower() or state()!=before:
   p=Path('/tmp/escocia-pajilla-use-unexpected-private.log');p.touch(mode=0o600,exist_ok=True);p.write_text(failure.stderr);raise AssertionError(label+' refusal/rollback; private diagnostics saved')
  check(True,label+' refuses with complete rollback')
 def raw(ddl,mode='post',request=key,intent=None):return sql('BEGIN;'+ddl+"SELECT set_config('request.jwt.claim.sub',"+lit(c.OWNER)+",true);SET LOCAL ROLE authenticated;SELECT fn_hato_pajilla_use_web("+lit(mode)+','+u(request)+','+(js(intent) if intent else 'NULL::jsonb')+','+u(c.OWNER)+');COMMIT;',False)
 refuse('cross-owner recovery expectation',lambda:call('fn_hato_pajilla_use_recover_web',[u(c.OTHER)],actor=c.OWNER,ok=False),'recovery owner')
 refuse('missing expected owner',lambda:use('status',key,expected=None,ok=False),'owner/key')
 refuse('cross-owner key',lambda:use('status',key,who=c.OTHER,ok=False),'owner changed')
 refuse('stale Auth owner',lambda:use('status',key,expected=c.OTHER,ok=False),'owner/key')
 refuse('missing profile',lambda:use('prepare',c.uid(),intent,who=c.uid(),ok=False),'active')
 for label,ddl,marker in [
 ('stale animal',"UPDATE hato_animales SET notas='Competing source' WHERE id="+u(target)+';','graph changed'),
 ('stale lot','UPDATE hato_pajillas SET cantidad_inicial=8 WHERE id='+u(lot)+';','graph changed'),
 ('retired lot','UPDATE hato_pajillas SET activa=false WHERE id='+u(lot)+';','graph changed'),
 ('bull rename',"UPDATE hato_toros SET nombre='Changed bull' WHERE id="+u(bull)+';','graph changed'),
 ('competing usage','INSERT INTO hato_pajillas_uso(pajilla_id,fecha_uso) VALUES('+u(lot)+",'2026-10-01');",'graph changed'),
 ('inactive owner','UPDATE usuarios SET activo=false WHERE id='+u(c.OWNER)+';','active')]:refuse(label,lambda ddl=ddl:raw(ddl),marker)
 for table,event,body,marker in [('public.hato_pajillas_uso','BEFORE INSERT','RETURN NULL;','usage suppressed'),('hato_pajilla_use.audit','BEFORE INSERT','RETURN NULL;','audit suppressed'),('hato_pajilla_use.requests','BEFORE UPDATE','RETURN NULL;','control suppressed'),('public.hato_pajillas_uso','BEFORE INSERT',"NEW.animal_id=NULL;RETURN NEW;",'usage suppressed'),('public.hato_pajillas_uso','AFTER INSERT','UPDATE public.usuarios SET activo=false WHERE id='+u(c.OWNER)+';RETURN NEW;','active'),('public.hato_pajillas_uso','AFTER INSERT','UPDATE public.hato_pajillas SET cantidad_inicial=9 WHERE id='+u(lot)+';RETURN NEW;','inventory mismatch'),('public.hato_pajillas_uso','AFTER INSERT',"UPDATE public.hato_animales SET notas='Unexpected side effect' WHERE id="+u(target)+';RETURN NEW;','inventory mismatch')]:
  ddl='CREATE FUNCTION public.synthetic_pajilla_fault() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN '+body+' END $f$;CREATE TRIGGER synthetic_pajilla_fault '+event+' ON '+table+' FOR EACH ROW EXECUTE FUNCTION public.synthetic_pajilla_fault();';refuse(table+' '+body[:35],lambda ddl=ddl:raw(ddl),marker)
 refuse('pending UUID replacement',lambda:use('prepare',c.uid(),intent,ok=False),'original unfinished action')
 second=c.uid();use('prepare',second,intent,who=c.OTHER)
 before=json.loads(state())
 with concurrent.futures.ThreadPoolExecutor(2) as pool:
  a=pool.submit(use,'post',key);b=pool.submit(use,'post',key);posted=a.result();other=b.result()
 after=json.loads(state());allowed={'public.hato_pajillas_uso','hato_pajilla_use.requests','hato_pajilla_use.audit'}
 check(all(v==after[k] for k,v in before.items() if k not in allowed),'standalone usage leaves all clinical/event/animal/financial/backup/unrelated private records exact')
 check(posted==other and posted['state']=='committed','concurrent original post deducts once with one usage/audit')
 check(posted['receipt']['after']['stock']['cantidad_actual']==-1,'zero stock warning does not block actual usage into negative stock')
 refuse('competing owner prepared source',lambda:use('post',second,who=c.OTHER,ok=False),'graph changed')
 check(use('resolve',second,who=c.OTHER)['state']=='canceled','competing original action can be explicitly canceled without writes')
 before=state();check(use('status',key)==posted and use('post',key)==posted and state()==before,'original recovery/status never repeats usage deduction')
 check(json.loads(sql('SELECT receipt FROM hato_pajilla_use.audit WHERE request_key='+u(key)+';'))==posted['receipt'],'independent trusted audit equals immutable recovered receipt')
 refuse('existing animal usage never adopted',lambda:use('prepare',c.uid(),intent,ok=False),'Existing usage')
 unknown=c.uid();before=state();check(use('status',unknown)['state']=='unknown' and state()==before,'unknown status allocates no replacement usage or reservation')
 fence=use('resolve',unknown);check(fence['state']=='canceled' and use('prepare',unknown,intent)==fence,'cancellation before prepare fences original UUID')
 for role in ('anon','authenticated','service_role'):refuse(role+' private proof',lambda role=role:sql('BEGIN;SET LOCAL ROLE '+role+';SELECT * FROM hato_pajilla_use.requests;COMMIT;',False),'permission denied')
 for role in ('anon','service_role'):refuse(role+' web impersonation',lambda role=role:use('status',key,role=role,ok=False),'permission denied')
 for p,marker in [(dict(intent,animalId=c.uid()),'Selected active animal'),(dict(intent,pajillaId=c.uid()),'lot/bull missing'),(dict(intent,created_by=c.OTHER),'bounded'),(dict(intent,fechaUso='2099-01-01'),'Future usage')]:refuse('invalid reference/intent '+marker,lambda p=p:use('prepare',c.uid(),p,ok=False),marker)
 for body,marker in [('RETURN NULL;','completion suppressed'),('NEW.owner_id='+u(c.OTHER)+';RETURN NEW;','completion suppressed'),('UPDATE public.hato_pajillas SET cantidad_inicial=9 WHERE id='+u(lot)+';RETURN NEW;','inventory mismatch')]:
  when='AFTER' if body.startswith('UPDATE') else 'BEFORE';ddl='CREATE FUNCTION public.synthetic_ack_fault() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN '+body+' END $f$;CREATE TRIGGER synthetic_ack_fault '+when+' INSERT ON hato_pajilla_use.finished FOR EACH ROW EXECUTE FUNCTION public.synthetic_ack_fault();';refuse('completion '+body[:25],lambda ddl=ddl:raw(ddl,mode='finish'),marker)
 check(use('finish',key)==posted,'explicit terminal completion acknowledges original without changing its receipt')
 refuse('completion proof mutation',lambda:sql('BEGIN;UPDATE hato_pajilla_use.finished SET owner_id='+u(c.OTHER)+' WHERE request_key='+u(key)+';COMMIT;',False),'Immutable')
 # No animal means no inferred duplicate identity: two explicitly separate real uses remain possible.
 nullable=dict(intent,animalId=None);null_key=c.uid();p=use('prepare',null_key,nullable);q=use('post',null_key)
 check(p['original']['graph'] is None and q['receipt']['usage']['animal_id'] is None,'unknown animal remains null with no clinical event creation')
 refuse('unacknowledged committed replacement',lambda:use('prepare',c.uid(),nullable,ok=False),'original unfinished action')
 check(call('fn_hato_pajilla_use_recover_web',[u(c.OWNER)],actor=c.OWNER)==q,'owner-only server recovery returns committed original after browser storage loss')
 use('finish',null_key)
 next_key=c.uid();use('prepare',next_key,nullable);next_use=use('post',next_key)
 check(next_use['plan']['id']!=q['plan']['id'] and next_use['receipt']['after']['stock']['cantidad_actual']==-3,'distinct reviewed no-animal uses on same day are not silently deduplicated')
 use('finish',next_key)
 # Retired catalog references were previously selectable: preserve that existing lane with explicit captured preview.
 sql('UPDATE hato_pajillas SET activa=false WHERE id='+u(lot)+';UPDATE hato_toros SET activo=false WHERE id='+u(bull)+';')
 old=c.uid();use('prepare',old,dict(nullable,fechaUso='2026-09-20'));historic=use('post',old)
 check(not historic['original']['lot']['activa'] and not historic['original']['toro']['activo'],'existing inactive catalog references remain explicit, never silently replaced or fabricated')
 use('finish',old)
 data=dict(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),owner=c.OWNER,other=c.OTHER,lot=lot,animal=target,day='2026-09-21',stateQuery=query)
 proc=subprocess.run(['node',str(Path(__file__).with_name('hato-pajilla-use-native.mjs'))],input=json.dumps(data),text=True,capture_output=True,cwd=r.ROOT,timeout=90)
 if proc.returncode:
  p=Path('/tmp/escocia-pajilla-use-sdk-private.log');p.touch(mode=0o600,exist_ok=True);p.write_text(proc.stderr);raise ValueError('Actual pajilla use SDK failed; private diagnostics saved')
 exercise.sdk=json.loads(proc.stdout);check(exercise.sdk['assertions']>=12,'actual browser SDK agrees with independent native usage/inventory/audit')
def main():
 a=argparse.ArgumentParser();a.add_argument('--evidence-dir',type=Path,required=True)
 for n in ('runtime','client','output','private-diagnostics'):a.add_argument('--'+n,type=Path,required=True)
 args=a.parse_args();exercise.client=args.client.resolve();files=[*sorted((r.ROOT/'src/sql/security-candidates').glob('*.sql')),Path(__file__),Path(__file__).with_name('hato-pajilla-use-native.mjs'),Path(__file__).with_name('hato-quick-telegram-replay.py')]
 files.extend(r.ROOT/'src/utils/hato'/name for name in ('hatoPajillaUseProtocol.ts','hatoPajillaUseBrowserAttempt.ts','alertResponseProtocol.ts'))
 files.extend(r.ROOT/name for name in ('src/components/hato/hooks/usePajillaUse.ts','src/components/hato/hooks/useHatoPajillas.ts','src/components/hato/components/PajillaUsoDialog.tsx','src/components/hato/PajillasView.tsx','src/hooks/useFormDraft.ts','src/utils/draftStorage.ts'))
 sources={p:p.read_bytes() for p in files};catalog,rls,hashes=r.load(args.evidence_dir.resolve())
 if args.output.resolve().is_relative_to(args.evidence_dir.resolve()) or args.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(args.runtime.resolve(),args.client.resolve(),args.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(p.read_bytes()!=b for p,b in sources.items()):raise ValueError('Changing pajilla use source cannot be certified')
 result.update(coordinated_candidate_count=31,admission_rollback_probes=3,sdk_proof=exercise.sdk,source_hashes={str(p.relative_to(r.ROOT)):r.p.digest(b) for p,b in sources.items()},temporary_database_stopped_and_removed=True,limits=['Four local private metadata exports and synthetic Auth/private socket only; never production.','Event corrections/coupled undo/pajilla purchase/catalog/generic grant retirement/hosted drain/readers/runtime/global/capacity/recovery remain open.'])
 args.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
