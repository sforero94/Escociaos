#!/usr/bin/env python3
"""Protected week milk lifecycle; four private metadata exports, synthetic local PG only."""
import argparse,concurrent.futures,importlib.util,json,subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('prior_milk_week',Path(__file__).with_name('hato-milk-weighing-telegram-replay.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
c,r,u,lit,js=p.c,p.r,p.u,p.lit,p.js
SOURCE=r.ROOT/'src/sql/security-candidates/hato-milk-week.sql';FIXTURE=r.ROOT/'src/__tests__/fixtures/hatoMilkWeek.json'
def query(sql):return 'SELECT ('+p.query(sql).removesuffix(';')+")||jsonb_build_object('hato_milk_week.requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_milk_week.requests x),'hato_milk_week.audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_milk_week.audit x));"
def install(sql):
 p.install(sql);existing=p.query(sql);before=sql(existing)
 for ddl in ['ALTER TABLE hato_pesajes_leche FORCE ROW LEVEL SECURITY;','CREATE TABLE public.synthetic_milk_child(id uuid REFERENCES hato_pesajes_leche ON DELETE CASCADE);']:
  failed=sql('BEGIN;'+ddl+SOURCE.read_text(),False)
  if failed.returncode==0 or sql(existing)!=before or sql("SELECT to_regnamespace('hato_milk_week') IS NULL;")!='t':raise AssertionError('Milk week admission rollback')
 sql(SOURCE.read_text())
 if sql(existing)!=before:raise AssertionError('Milk week installation changed existing rows')
 if sql('SELECT (SELECT count(*) FROM hato_milk_week.requests)+(SELECT count(*) FROM hato_milk_week.audit);')!='0':raise AssertionError('Milk week installed nonempty controls')
def exercise(sql,ctx):
 check,call=ctx['check'],ctx['call'];state=lambda:sql(query(sql));owner=c.OTHER;animal=c.uid();key=c.uid()
 sql('UPDATE usuarios SET activo=true WHERE id='+u(owner)+';INSERT INTO hato_animales(id,nombre,numero,sexo,etapa,estado,origen,created_by) VALUES('+u(animal)+",'Synthetic week milk cow',88993,'hembra','vaca','activa','compra',"+u(c.OWNER)+');')
 ids=[c.uid() for _ in range(3)]
 for i,(day,am,pm,total) in enumerate([('2026-10-07','1','2','3'),('2026-10-08','NULL','NULL','8'),('2026-10-09','1','NULL','1')]):sql('INSERT INTO hato_pesajes_leche(id,animal_id,fecha,litros_am,litros_pm,litros_total,fuente,created_by) VALUES('+','.join([u(ids[i]),u(animal),lit(day),am,pm,total,lit('historico'),u(c.OWNER)])+');')
 def action(mode,payload=None,k=key,actor=owner):return call('fn_hato_milk_week_web',[lit(mode),u(k),js(payload) if payload is not None else 'NULL::jsonb',u(actor)],actor=actor)
 def source():return call('fn_hato_milk_week_source_web',[u(owner),lit('2026-10-05'),lit('2026-10-11')],actor=owner)
 original=source();intent=dict(version=1,start='2026-10-05',end='2026-10-11',observed=original['rows'],changes=[dict(id=ids[0],remove=False,am=3,pm=4,total=7),dict(id=ids[1],remove=False,am=None,pm=None,total=9),dict(id=ids[2],remove=True,am=None,pm=None,total=None)])
 def refuse(label,ddl='',mode='post',payload=None,k=key,actor=owner,role='authenticated'):
  before=state();failed=sql('BEGIN;'+ddl+'SET LOCAL ROLE '+role+';SET LOCAL request.jwt.claim.sub='+lit(actor)+';SELECT fn_hato_milk_week_web('+','.join([lit(mode),u(k),js(payload) if payload is not None else 'NULL::jsonb',u(actor)])+');COMMIT;',False);check(failed.returncode!=0 and state()==before,label+' refuses with complete week/domain/control rollback')
 before=state();check(action('status')['state']=='unknown' and state()==before,'unknown original week status is read only')
 refuse('Admin cannot write Gerencia week',mode='prepare',payload=intent,actor=c.OWNER)
 refuse('stale displayed row','UPDATE hato_pesajes_leche SET fuente=\'changed\' WHERE id='+u(ids[0])+';',mode='prepare',payload=intent)
 refuse('truncated displayed week',mode='prepare',payload=dict(intent,observed=intent['observed'][:1]))
 refuse('duplicate selected target',mode='prepare',payload=dict(intent,changes=[intent['changes'][0]]*2))
 refuse('injected identity',mode='prepare',payload=dict(intent,created_by=owner))
 bad=dict(intent['changes'][0],total=99);refuse('forged turn arithmetic',mode='prepare',payload=dict(intent,changes=[bad]))
 prepared=action('prepare',intent);check(prepared['state']=='pending' and len(prepared['plan']['changes'])==3,'mixed shift/legacy total/delete are captured without mutation')
 check(action('prepare',intent)==prepared,'same original week preparation is stable')
 refuse('replacement while pending',mode='prepare',payload=intent,k=c.uid())
 for label,ddl in [('concurrent milk cell','UPDATE hato_pesajes_leche SET litros_total=99 WHERE id='+u(ids[0])+';'),('concurrent roster source','UPDATE hato_animales SET notas=\'changed\' WHERE id='+u(animal)+';'),('new row in captured week','INSERT INTO hato_pesajes_leche(animal_id,fecha,litros_total) VALUES('+u(animal)+",'2026-10-10',1);"),('late FK cascade dependency','CREATE TABLE public.synthetic_milk_child(id uuid REFERENCES hato_pesajes_leche ON DELETE CASCADE);'),('revoked actor','UPDATE usuarios SET activo=false WHERE id='+u(owner)+';')]:refuse(label,ddl)
 for table,event,body in [('public.hato_pesajes_leche','BEFORE UPDATE','RETURN NULL;'),('public.hato_pesajes_leche','BEFORE DELETE','RETURN NULL;'),('public.hato_pesajes_leche','BEFORE UPDATE','NEW.fuente=\'changed\';RETURN NEW;'),('public.hato_correcciones','BEFORE INSERT','RETURN NULL;'),('hato_milk_week.audit','BEFORE INSERT','RETURN NULL;'),('hato_milk_week.requests','BEFORE UPDATE','RETURN NULL;'),('hato_milk_week.audit','AFTER INSERT','UPDATE public.usuarios SET activo=false WHERE id='+u(owner)+';RETURN NEW;')]:refuse(table+' '+event,'CREATE FUNCTION public.synthetic_week_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN '+body+'END$$;CREATE TRIGGER synthetic_week_fault '+event+' ON '+table+' FOR EACH ROW EXECUTE FUNCTION public.synthetic_week_fault();')
 before=json.loads(state())
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(lambda _:action('post'),range(2)))
 posted=results[0];check(results[0]==results[1] and posted['state']=='committed','same-original concurrent mixed edit/delete posts return one receipt')
 audit=json.loads(sql('SELECT receipt FROM hato_milk_week.audit WHERE request_key='+u(key)+';'));rows=json.loads(sql("SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM hato_pesajes_leche x WHERE animal_id="+u(animal)+';'))
 check(audit==posted['receipt'] and len(rows)==2 and sorted(rows,key=lambda x:x['id'])==sorted(audit['after'],key=lambda x:x['id']),'independent native rows/deletions equal immutable receipt')
 check(audit['actor']==dict(origin='web',profileId=owner) and len(audit['corrections'])==3 and all(x['corregido_por']==owner for x in audit['corrections']) and all(x['created_by']==c.OWNER and x['fuente']=='historico' for x in rows),'trusted current Gerencia corrections preserve creation/source identity and total-only history')
 after=json.loads(state());allowed={'public.hato_pesajes_leche','public.hato_correcciones','hato_milk_week.requests','hato_milk_week.audit'};check(all(k in allowed or after[k]==v for k,v in before.items()),'week changes preserve every photo/Storage metadata/financial/backup/private proof row')
 before=state();check(action('post')==posted and action('status')==posted and call('fn_hato_milk_week_recover_web',[u(owner)],actor=owner)==posted and state()==before,'original lost response/status/owner recovery never overwrites or repeats deletion')
 action('acknowledge');fence=c.uid();action('resolve',k=fence);before=state();check(action('prepare',intent,k=fence)['state']=='canceled' and state()==before,'canceled week original permanently fences delayed preparation')
 for role in ['anon','service_role']:refuse(role+' week entry denied',mode='prepare',payload=intent,k=c.uid(),role=role)
 # Two current Gerencia owners prepare the same source before genuinely concurrent posts.
 sql('UPDATE usuarios SET rol=\'Gerencia\' WHERE id='+u(c.OWNER)+';INSERT INTO hato_pesajes_leche(animal_id,fecha,litros_total,fuente,created_by) VALUES('+u(animal)+",'2026-10-21',5,'synthetic-race',"+u(owner)+');')
 race_source=call('fn_hato_milk_week_source_web',[u(owner),lit('2026-10-19'),lit('2026-10-25')],actor=owner);target=race_source['rows'][0]['id'];keys=[c.uid(),c.uid()];owners=[owner,c.OWNER]
 for i in range(2):action('prepare',dict(version=1,start='2026-10-19',end='2026-10-25',observed=race_source['rows'],changes=[dict(id=target,remove=False,am=None,pm=None,total=6+i)]),k=keys[i],actor=owners[i])
 def race(i):return call('fn_hato_milk_week_web',[lit('post'),u(keys[i]),'NULL::jsonb',u(owners[i])],actor=owners[i],ok=False)
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:attempts=list(pool.map(race,range(2)))
 winners=[i for i,v in enumerate(attempts) if v.returncode==0];check(len(winners)==1 and all(v.returncode==0 or 'source/day changed' in v.stderr for v in attempts),'two current owners competing on one captured source produce one winner and one stale original')
 winner=winners[0];loser=1-winner;value=sql('SELECT litros_total FROM hato_pesajes_leche WHERE id='+u(target)+';');check(value==str(6+winner),'independent competing-owner native value equals only the winning reviewed total')
 before=state();check(action('post',k=keys[winner],actor=owners[winner])['state']=='committed' and state()==before,'winning original recovers without reapplying after competing refusal')
 action('resolve',k=keys[loser],actor=owners[loser]);action('acknowledge',k=keys[winner],actor=owners[winner]);sql('UPDATE usuarios SET rol=\'Administrador\' WHERE id='+u(c.OWNER)+';')
 # Actual installed SDK/durable adapter uses a separate synthetic week.
 for day,am,pm,total in [('2026-10-14','1','2','3'),('2026-10-15','NULL','NULL','6'),('2026-10-16','4','NULL','4')]:sql('INSERT INTO hato_pesajes_leche(animal_id,fecha,litros_am,litros_pm,litros_total,fuente,created_by) VALUES('+','.join([u(animal),lit(day),am,pm,total,lit('synthetic-original'),u(c.OWNER)])+');')
 args=dict(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),owner=owner,animal=animal,stateQuery=query(sql).removesuffix(';')+' AS jsonb_object_agg;',golden=json.loads(FIXTURE.read_text()) if FIXTURE.exists() else None)
 proc=subprocess.run(['node',str(Path(__file__).with_name('hato-milk-week-native.mjs'))],input=json.dumps(args),text=True,capture_output=True,cwd=r.ROOT,timeout=90)
 if proc.returncode:
  f=Path('/tmp/escocia-milk-week-sdk-private.log');f.touch(mode=0o600,exist_ok=True);f.write_text(proc.stderr);raise AssertionError('Actual week SDK failed; private diagnostic saved')
 proof=json.loads(proc.stdout);exercise.fixture=proof.pop('fixture');exercise.sdk=proof;check(proof['assertions']>=12,'actual installed SDK/durable original browser recovery independently equals native mixed edit/delete proof')
def main():
 parser=argparse.ArgumentParser()
 for name in ('evidence-dir','runtime','client','output','private-diagnostics'):parser.add_argument('--'+name,type=Path,required=True)
 a=parser.parse_args();exercise.client=a.client.resolve();files=[Path(__file__),SOURCE,Path(__file__).with_name('hato-milk-week-native.mjs'),*[r.ROOT/k for k in json.loads((r.ROOT/'docs/security-integrity/hato-milk-weighing-telegram-replay.json').read_text())['source_hashes']],*[r.ROOT/k for k in ['src/utils/hato/hatoMilkWeekProtocol.ts','src/utils/hato/hatoMilkWeekBrowserAttempt.ts','src/components/hato/hooks/useMilkWeek.ts','src/components/hato/hooks/useDetallePesajeSemana.ts','src/components/hato/components/DetallePesajeSemanalDialog.tsx','src/components/hato/components/MilkWeekConfirmationPanel.tsx']],*sorted((r.ROOT/'src/__tests__').glob('hatoMilkWeek*.test.tsx'))];files=list(dict.fromkeys(files+([FIXTURE] if FIXTURE.exists() else [])));sources={f:f.read_bytes() for f in files};catalog,rls,hashes=r.load(a.evidence_dir.resolve())
 if a.output.resolve().is_relative_to(a.evidence_dir.resolve()) or a.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(a.runtime.resolve(),a.client.resolve(),a.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(f.read_bytes()!=v for f,v in sources.items()):raise ValueError('Changing milk week sources cannot be certified')
 if not FIXTURE.exists():FIXTURE.write_text(json.dumps(exercise.fixture,indent=2)+'\n')
 result.update(coordinated_candidate_count=46,admission_rollback_probes=2,sdk_proof=exercise.sdk,source_hashes={str(f.relative_to(r.ROOT)):r.p.digest(v) for f,v in sources.items()},temporary_database_stopped_and_removed=True,limits=['Four local metadata exports/synthetic Auth/private socket/Web Locks stub only; no hosted Auth/Storage/browser runtime certification.','Upload discard/capture/Storage/financial/backfill writers and grants unchanged; no production.'])
 a.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
