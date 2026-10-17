#!/usr/bin/env python3
"""Per-event cycle-member correction compatibility, local private metadata only."""
import argparse
import concurrent.futures
import importlib.util
import json
import subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('prior',Path(__file__).with_name('hato-cycle-birth-undo-replay.py'))
t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
c,r,lit,js,u=t.c,t.r,t.lit,t.js,t.u
SOURCE=r.ROOT/'src/sql/security-candidates/hato-animal-registration.sql'
def install(sql):
 t.install(sql);query=t.state_query(sql);before=sql(query)
 for ddl,marker in [("ALTER TABLE hato_eventos FORCE ROW LEVEL SECURITY;",'source graph'),("ALTER TABLE hato_animales ADD COLUMN synthetic_unreviewed text;",'source graph'),("CREATE TABLE public.synthetic_registration_ref(id uuid);",'domain inventory'),("ALTER FUNCTION hato_birth_undo.capture_domain() SET search_path=public;",'capture_domain helper')]:
  failed=sql('BEGIN;'+ddl+SOURCE.read_text(),False)
  if failed.returncode==0 or marker not in failed.stderr or sql(query)!=before or sql("SELECT to_regnamespace('hato_animal_registration') IS NULL;")!='t':raise AssertionError('Registration admission rollback '+marker)
 sql(SOURCE.read_text())
 if sql(query)!=before:raise AssertionError('Registration installation changed existing rows')


def exercise(sql,ctx):
 check,call=ctx['check'],ctx['call'];query=t.state_query(sql);state=lambda:sql(query)
 sql('UPDATE usuarios SET activo=true WHERE id='+u(c.OTHER)+';')
 key=c.uid();intent=dict(version=1,input=dict(numero=None,nombre='Synthetic registration',etapa='ternera',raza=None,fecha_nacimiento='2026-01-03',origen='compra'))
 def action(mode,payload=None,k=key,owner=c.OWNER,ok=True):return call('fn_hato_animal_registration_web',[lit(mode),u(k),js(payload) if payload is not None else 'NULL::jsonb',u(owner)],actor=owner,ok=ok)
 def refuse(label,ddl,mode='post',marker=None,k=key,payload=None):
  before=state();result=sql('BEGIN;'+ddl+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(c.OWNER)+";SELECT fn_hato_animal_registration_web("+lit(mode)+','+u(k)+','+(js(payload) if payload is not None else 'NULL::jsonb')+','+u(c.OWNER)+');COMMIT;',False)
  if result.returncode==0 or (marker and marker.lower() not in result.stderr.lower()) or state()!=before:
   p=Path('/tmp/escocia-registration-unexpected-private.log');p.touch(mode=0o600,exist_ok=True);p.write_text(result.stderr);raise AssertionError(label+' refusal/rollback; private diagnostics saved')
  check(True,label+' refuses with full-state rollback')
 check(sql("SELECT NOT has_function_privilege('anon','fn_hato_animal_registration_web(text,uuid,jsonb,uuid)','EXECUTE') AND NOT has_function_privilege('service_role','fn_hato_animal_registration_web(text,uuid,jsonb,uuid)','EXECUTE') AND NOT has_table_privilege('authenticated','hato_animal_registration.requests','SELECT');")=='t','anonymous/service/direct control access stays revoked')
 before=state();unknown=action('status');check(unknown['state']=='unknown' and state()==before,'unknown original status is read only')
 prepared=action('prepare',intent);check(prepared['state']=='pending' and prepared['plan']['created_by']==c.OWNER and prepared['plan']['sexo']=='hembra' and prepared['plan']['created_at'] is None,'prepare exact fixed semantics and trusted actor without animal mutation')
 check(action('prepare',intent)==prepared,'same original preparation repeats reserved UUID')
 recovery=call('fn_hato_animal_registration_recover_web',[u(c.OWNER)],actor=c.OWNER);check(recovery==prepared,'owner can recover pending original without browser key')
 for label,ddl,marker in [('competing herd revision',"UPDATE hato_animales SET notas='Observed later';",'source/day changed'),('inactive actor','UPDATE usuarios SET activo=false WHERE id='+u(c.OWNER)+';','active'),('demoted actor',"UPDATE usuarios SET rol='Verificador' WHERE id="+u(c.OWNER)+';','active'),('new domain table','CREATE TABLE public.synthetic_registration_ref(id uuid);','domain inventory')]:refuse(label,ddl,marker=marker)
 for table,op,body,marker in [('public.hato_animales','BEFORE INSERT','RETURN NULL;','animal suppressed'),('public.hato_animales','BEFORE INSERT',"NEW.nombre='Changed by trigger';RETURN NEW;",'animal suppressed'),('public.hato_animales','AFTER INSERT',"UPDATE public.fin_gastos SET estado='Pendiente';RETURN NEW;",'readback mismatch'),('hato_animal_registration.audit','BEFORE INSERT','RETURN NULL;','audit suppressed'),('hato_animal_registration.requests','BEFORE UPDATE','RETURN NULL;','control suppressed'),('hato_animal_registration.audit','AFTER INSERT','UPDATE public.usuarios SET activo=false WHERE id='+u(c.OWNER)+';RETURN NEW;','readback mismatch'),('hato_animal_registration.requests','AFTER UPDATE',"UPDATE public.fin_gastos SET estado='Pendiente';RETURN NEW;",'readback mismatch')]:
  refuse(table+' '+op,'CREATE FUNCTION public.synthetic_registration_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN '+body+' END $$;CREATE TRIGGER synthetic_registration_fault '+op+' ON '+table+' FOR EACH ROW EXECUTE FUNCTION public.synthetic_registration_fault();',marker=marker)
 refuse('expired prepared review day','ALTER TABLE hato_animal_registration.requests DISABLE TRIGGER immutable_registration_request;UPDATE hato_animal_registration.requests SET effective_date=effective_date-1 WHERE request_key='+u(key)+';',marker='source/day changed')
 replacement=c.uid();refuse('replacement while pending','',mode='prepare',k=replacement,payload=intent,marker='Recover original')
 before=state();missing=action('status',owner=c.uid(),ok=False);check(missing.returncode!=0 and 'active' in missing.stderr.lower() and state()==before,'missing profile refuses without mutation');other=action('status',owner=c.OTHER,ok=False);check(other.returncode!=0 and state()==before,'different genuine owner cannot disclose original')
 with concurrent.futures.ThreadPoolExecutor(2) as pool:
  a=pool.submit(action,'post');b=pool.submit(action,'post');posted=a.result();check(posted==b.result(),'two simultaneous posts commit one original animal')
 after=json.loads(state());before_json=json.loads(before);allowed={'public.hato_animales','hato_animal_registration.requests','hato_animal_registration.audit'}
 check(all(v==after[k] for k,v in before_json.items() if k not in allowed),'registration preserves every other domain/backup/financial/private row')
 row=json.loads(sql('SELECT to_jsonb(x) FROM hato_animales x WHERE id='+u(prepared['plan']['id'])+';'));check(row==posted['receipt']['after'] and row==dict(prepared['plan'],created_at=posted['receipt']['recordedAt']),'independent native row equals full prepared plan plus exact commit time')
 audit=json.loads(sql('SELECT receipt FROM hato_animal_registration.audit WHERE request_key='+u(key)+';'));check(audit==posted['receipt'] and audit['before'] is None,'immutable trusted creation audit has null before and exact after/current actor')
 before=state();check(action('status')==posted and action('post')==posted and state()==before,'original committed retry/status never inserts again')
 refuse('replacement after unknown committed reply','',mode='prepare',k=replacement,payload=intent,marker='Recover original')
 check(call('fn_hato_animal_registration_recover_web',[u(c.OWNER)],actor=c.OWNER)==posted,'storage-loss original recovery returns committed proof')
 acknowledged=action('acknowledge');check(acknowledged['acknowledged'] and acknowledged['receipt']==posted['receipt'],'explicit terminal acknowledgment preserves original proof')
 # A later valid correction must not make original create retry overwrite or recreate the target.
 sql('UPDATE hato_animales SET nombre=\'Later correction\' WHERE id='+u(row['id'])+';')
 before=state();check(action('post')==acknowledged and state()==before,'original creation never overwrites later reviewed edits')
 sql('DELETE FROM hato_animales WHERE id='+u(row['id'])+';');before=state();check(action('post')==acknowledged and action('status')==acknowledged and state()==before,'original creation proof survives target disappearance without recreation')
 newkey=c.uid();action('prepare',intent,k=newkey);check(action('resolve',k=newkey)['state']=='canceled','explicit original cancellation frees pending slot')
 cancelkey=c.uid();check(action('resolve',k=cancelkey)['state']=='canceled' and action('prepare',intent,k=cancelkey)['state']=='canceled','cancellation-before-prepare fences delayed original reservation')
 for bad in [dict(intent,created_by=c.OTHER),dict(intent,input=dict(intent['input'],estado='vendida')),dict(intent,input=dict(intent['input'],numero=900)),dict(intent,input=dict(intent['input'],numero=1.5)),dict(intent,input=dict(intent['input'],fecha_nacimiento='2026-02-30')),dict(intent,input=dict(intent['input'],origen='importacion_historica'))]:refuse('invalid or injected registration','',mode='prepare',k=c.uid(),payload=bad)
 # Actual strict installed SDK, independent rows and lost original reply recovery.
 proc=subprocess.run(['node',str(Path(__file__).with_name('hato-animal-registration-browser-native.mjs'))],input=json.dumps(dict(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),owner=c.OWNER,stateQuery=query)),text=True,capture_output=True,cwd=r.ROOT,timeout=90)
 if proc.returncode:
  p=Path('/tmp/escocia-registration-sdk-private.log');p.touch(mode=0o600,exist_ok=True);p.write_text(proc.stderr);raise AssertionError('Registration SDK failed; private diagnostics saved')
 exercise.sdk=json.loads(proc.stdout);check(exercise.sdk['assertions']>=10,'actual strict installed SDK original recovery proof equals native rows/audit')
def main():
 p=argparse.ArgumentParser()
 for name in ('evidence-dir','runtime','client','output','private-diagnostics'):p.add_argument('--'+name,type=Path,required=True)
 args=p.parse_args();exercise.client=args.client.resolve();files=[r.ROOT/'src/utils/hato/hatoAnimalRegistrationBrowserAttempt.ts',r.ROOT/'src/components/hato/hooks/useAnimalRegistration.ts',r.ROOT/'src/components/hato/hooks/useCrearHatoAnimal.ts',r.ROOT/'src/components/hato/components/CrearAnimalDialog.tsx',r.ROOT/'src/hooks/useFormDraft.ts',r.ROOT/'src/__tests__/hatoAnimalRegistrationBrowser.test.tsx',r.ROOT/'src/__tests__/fixtures/hatoAnimalRegistration.ts',*sorted((r.ROOT/'src/sql/security-candidates').glob('*.sql')),Path(__file__),Path(__file__).with_name('hato-animal-registration-browser-native.mjs'),Path(__file__).with_name('hato-cycle-birth-undo-replay.py'),r.ROOT/'src/utils/hato/hatoAnimalRegistrationProtocol.ts',r.ROOT/'src/utils/hato/alertResponseProtocol.ts',r.ROOT/'src/__tests__/hatoAnimalRegistration.test.ts'];sources={p:p.read_bytes() for p in files};catalog,rls,hashes=r.load(args.evidence_dir.resolve())
 if args.output.resolve().is_relative_to(args.evidence_dir.resolve()) or args.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(args.runtime.resolve(),args.client.resolve(),args.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(p.read_bytes()!=v for p,v in sources.items()):raise ValueError('Changing registration sources cannot be certified')
 result.update(coordinated_candidate_count=36,admission_rollback_probes=4,sdk_proof=exercise.sdk,source_hashes={str(p.relative_to(r.ROOT)):r.p.digest(v) for p,v in sources.items()},temporary_database_stopped_and_removed=True,limits=['Four local private metadata exports only; synthetic Auth/private Unix socket; never production.','Actual durable browser adapter/caller source and mounted React checks; direct grants unchanged. Synthetic Web Locks stub, not hosted browser certification. Coarse170-table fences with clima_lecturas exclusion are not capacity/hosted/global recovery certification.'])
 args.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
