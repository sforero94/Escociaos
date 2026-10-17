#!/usr/bin/env python3
"""Prepared bull edit/caller replay; four private local exports, no hosted transport."""
import argparse,concurrent.futures,importlib.util,json,subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('prior_edit',Path(__file__).with_name('hato-catalog-creation-browser-replay.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
c,r,lit,js,u=p.c,p.r,p.lit,p.js,p.u
SOURCE=r.ROOT/'src/sql/security-candidates/hato-catalog-edit.sql'
def install(sql):
 p.install(sql);existing=p.query(sql);before=sql(existing)
 for ddl,marker in [("ALTER TABLE hato_toros FORCE ROW LEVEL SECURITY;",'source graph'),("ALTER TABLE hato_toros ADD COLUMN synthetic_edit text;",'source graph'),("ALTER FUNCTION hato_pajilla_use.inventory() SET search_path=public;",'inventory snapshot helper')]:
  failed=sql('BEGIN;'+ddl+SOURCE.read_text(),False)
  if failed.returncode==0 or marker not in failed.stderr or sql(existing)!=before or sql("SELECT to_regnamespace('hato_catalog_edit') IS NULL;")!='t':raise AssertionError('Bull edit admission rollback '+marker)
 sql(SOURCE.read_text())
 if sql(existing)!=before:raise AssertionError('Edit installation changed existing rows')
def exercise(sql,ctx):
 p.exercise.client=exercise.client;p.exercise(sql,ctx);exercise.parent_sdk=p.exercise.sdk;exercise.registration_sdk=p.exercise.parent_sdk
 check,call=ctx['check'],ctx['call'];state=lambda:sql(p.query(sql));bull=c.uid();sql('INSERT INTO hato_toros(id,nombre,tipo,raza,activo,created_by) VALUES('+u(bull)+",'Synthetic editable bull','monta','Original breed',true,"+u(c.OTHER)+');')
 full=json.loads(sql('SELECT to_jsonb(t) FROM hato_toros t WHERE id='+u(bull)+';'));observed={k:full[k] for k in ['id','nombre','tipo','raza','activo']};intent=dict(version=1,bullId=bull,observedBull=observed,changes=dict(nombre='Reviewed renamed bull',tipo='inseminacion',raza=None,activo=False));key=c.uid()
 def action(mode,payload=None,k=key,owner=c.OWNER,ok=True):return call('fn_hato_catalog_edit_web',[lit(mode),u(k),js(payload) if payload is not None else 'NULL::jsonb',u(owner)],actor=owner,ok=ok)
 def refuse(label,ddl='',mode='post',payload=None,k=key,marker=None):
  before=state();failed=sql('BEGIN;'+ddl+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(c.OWNER)+';SELECT fn_hato_catalog_edit_web('+lit(mode)+','+u(k)+','+(js(payload) if payload is not None else 'NULL::jsonb')+','+u(c.OWNER)+');COMMIT;',False)
  if failed.returncode==0 or (marker and marker.lower() not in failed.stderr.lower()) or state()!=before:
   dest=Path('/tmp/escocia-bull-edit-unexpected-private.log');dest.touch(mode=0o600,exist_ok=True);dest.write_text(failed.stderr);raise AssertionError(label+' refusal/rollback; private diagnostic saved')
  check(True,label+' refuses with full-state rollback')
 before=state();check(action('status')['state']=='unknown' and before==state(),'bull edit unknown status read only')
 refuse('stale visible row before review','UPDATE hato_toros SET raza=\'Competing\' WHERE id='+u(bull)+';',mode='prepare',payload=intent,marker='Observed bull')
 refuse('injected actor field',mode='prepare',payload=dict(intent,created_by=c.OWNER),marker='Exact original')
 prepared=action('prepare',intent);check(prepared['plan']['row']==dict(full,**intent['changes']) and prepared['original']['toros'] and prepared['state']=='pending','exact edit plan preserves full original creation metadata')
 check(action('prepare',intent)==prepared,'same original prepare returns immutable plan')
 refuse('competing selected edit','UPDATE hato_toros SET activo=false WHERE id='+u(bull)+';',marker='source/day')
 refuse('competing catalog creation',"INSERT INTO hato_toros(nombre,activo) VALUES('Competing catalog',true);",marker='source/day')
 refuse('competing lot creation','INSERT INTO hato_pajillas(toro_id,cantidad_inicial) VALUES('+u(bull)+',0);',marker='source/day')
 refuse('expired review','ALTER TABLE hato_catalog_edit.requests DISABLE TRIGGER immutable_registration_request;UPDATE hato_catalog_edit.requests SET effective_date=effective_date-1 WHERE request_key='+u(key)+';',marker='source/day')
 for label,ddl in [('inactive actor','UPDATE usuarios SET activo=false WHERE id='+u(c.OWNER)+';'),('demoted actor',"UPDATE usuarios SET rol='Verificador' WHERE id="+u(c.OWNER)+';')]:refuse(label,ddl,marker='active')
 for table,op,body,marker in [('public.hato_toros','BEFORE UPDATE','RETURN NULL;','suppressed'),('public.hato_toros','BEFORE UPDATE',"NEW.nombre='Injected';RETURN NEW;",'suppressed'),('hato_catalog_edit.audit','BEFORE INSERT','RETURN NULL;','audit suppressed'),('hato_catalog_edit.requests','BEFORE UPDATE','RETURN NULL;','control suppressed'),('hato_catalog_edit.audit','AFTER INSERT',"UPDATE public.fin_gastos SET estado='Pendiente';RETURN NEW;",'readback mismatch'),('hato_catalog_edit.requests','AFTER UPDATE','UPDATE public.usuarios SET activo=false WHERE id='+u(c.OWNER)+';RETURN NEW;','readback mismatch')]:
  refuse('suppression/mutation '+table+' '+op,'CREATE FUNCTION public.synthetic_edit_fault() RETURNS trigger LANGUAGE plpgsql AS $fault$ BEGIN '+body+' END $fault$;CREATE TRIGGER synthetic_edit_fault '+op+' ON '+table+' FOR EACH ROW EXECUTE FUNCTION public.synthetic_edit_fault();',marker=marker)
 for mode in ['status','resolve','acknowledge']:
  refuse('inactive actor '+mode,'UPDATE usuarios SET activo=false WHERE id='+u(c.OWNER)+';',mode=mode,marker='active')
 before=state();denied=sql("SET ROLE anon;SELECT public.fn_hato_catalog_edit_web('status',"+u(key)+',NULL,'+u(c.OWNER)+');',False);check(denied.returncode!=0 and state()==before,'anonymous ordinary role cannot execute edit entry')
 for role in ['anon','authenticated','service_role']:
  denied=sql('SET ROLE '+role+';SELECT * FROM hato_catalog_edit.requests;',False);check(denied.returncode!=0,'private edit control unreadable to '+role)
 refuse('replacement pending',mode='prepare',payload=intent,k=c.uid(),marker='Recover original')
 before=state();check(action('status',owner=c.OTHER,ok=False).returncode!=0 and state()==before,'another active owner cannot access original')
 before=json.loads(state())
 with concurrent.futures.ThreadPoolExecutor(2) as pool:
  a=pool.submit(action,'post');b=pool.submit(action,'post');posted=a.result();check(posted==b.result(),'concurrent same-key posts return one original edit')
 after=json.loads(state());allowed={'public.hato_toros','hato_catalog_edit.requests','hato_catalog_edit.audit'};check(all(v==after[k] for k,v in before.items() if k not in allowed),'edit preserves unrelated domain/backup/financial/private rows')
 row=json.loads(sql('SELECT to_jsonb(t) FROM hato_toros t WHERE id='+u(bull)+';'));audit=json.loads(sql('SELECT receipt FROM hato_catalog_edit.audit WHERE request_key='+u(key)+';'))
 check(row==prepared['plan']['row']==posted['receipt']['after'] and audit==posted['receipt'] and audit['before']==full and audit['actor']==dict(origin='web',profileId=c.OWNER),'independent native exact before/after/current actor/audit proof')
 before=state();check(action('post')==posted and action('status')==posted and state()==before,'immutable edit retry read only')
 refuse('replacement uncertain commit',mode='prepare',payload=intent,k=c.uid(),marker='Recover original')
 check(call('fn_hato_catalog_edit_recover_web',[u(c.OWNER)],actor=c.OWNER)==posted,'owner storage-loss recovery returns original committed edit')
 ack=action('acknowledge');check(ack['acknowledged'] and ack['receipt']==audit,'terminal acknowledgment preserves original receipt')
 sql("UPDATE hato_toros SET nombre='Later independent edit' WHERE id="+u(bull)+';');before=state();check(action('post')==ack and state()==before,'original committed retry never overwrites later edits')
 cancel=c.uid();check(action('resolve',k=cancel)['state']=='canceled' and action('prepare',intent,k=cancel)['state']=='canceled','cancellation before delayed prepare fences original')
 # Two genuine active owners prepare the same original; only one competing post may win.
 current=json.loads(sql('SELECT to_jsonb(t) FROM hato_toros t WHERE id='+u(bull)+';'));obs={k:current[k] for k in ['id','nombre','tipo','raza','activo']};keys=[c.uid(),c.uid()];owners=[c.OWNER,c.OTHER]
 for i in range(2):action('prepare',dict(intent,observedBull=obs,changes=dict(intent['changes'],nombre='Concurrent edit '+str(i))),k=keys[i],owner=owners[i])
 with concurrent.futures.ThreadPoolExecutor(2) as pool:
  futures=[pool.submit(action,'post',k=keys[i],owner=owners[i],ok=False) for i in range(2)];outcomes=[f.result() for f in futures]
 check(sum(v.returncode==0 for v in outcomes)==1 and all(v.returncode==0 or 'source/day changed' in v.stderr for v in outcomes),'competing active-owner original posts serialize and exactly one source-CAS wins')
 for i,v in enumerate(outcomes):
  if v.returncode:action('resolve',k=keys[i],owner=owners[i])
  action('acknowledge',k=keys[i],owner=owners[i])
 check(sql('SELECT count(*)=2 FROM hato_catalog_edit.audit WHERE request_key IN('+u(key)+','+u(keys[0])+','+u(keys[1])+');')=='t','competing retry has exactly one additional immutable trusted audit')
 proc=subprocess.run(['node',str(Path(__file__).with_name('hato-catalog-edit-native.mjs'))],input=json.dumps(dict(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),owner=c.OWNER,bull=bull,stateQuery=p.query(sql))),text=True,capture_output=True,cwd=r.ROOT,timeout=90)
 if proc.returncode:
  dest=Path('/tmp/escocia-bull-edit-sdk-private.log');dest.touch(mode=0o600,exist_ok=True);dest.write_text(proc.stderr);raise AssertionError('Bull edit SDK proof failed; private diagnostics saved')
 exercise.sdk=json.loads(proc.stdout);check(exercise.sdk['assertions']>=12,'actual bull edit browser adapter/strict SDK native proof')
def main():
 parser=argparse.ArgumentParser()
 for name in ('evidence-dir','runtime','client','output','private-diagnostics'):parser.add_argument('--'+name,type=Path,required=True)
 a=parser.parse_args();exercise.client=a.client.resolve();files=[*sorted((r.ROOT/'src/sql/security-candidates').glob('*.sql')),*sorted((r.ROOT/'src/utils/hato').glob('*Catalog*.ts')),r.ROOT/'src/components/hato/hooks/useCatalogEdit.ts',r.ROOT/'src/components/hato/components/ToroFormDialog.tsx',r.ROOT/'src/components/hato/hooks/useHatoToros.ts',r.ROOT/'src/__tests__/hatoCatalogEdit.test.tsx',Path(__file__),Path(__file__).with_name('hato-catalog-edit-native.mjs'),Path(__file__).with_name('hato-catalog-creation-browser-replay.py'),Path(__file__).with_name('hato-catalog-creation-browser-native.mjs')];files=list(dict.fromkeys([*files,*[r.ROOT/k for k in json.loads((r.ROOT/'docs/security-integrity/hato-catalog-creation-browser-replay.json').read_text())['source_hashes']]]));sources={f:f.read_bytes() for f in files};catalog,rls,hashes=r.load(a.evidence_dir.resolve())
 if a.output.resolve().is_relative_to(a.evidence_dir.resolve()) or a.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(a.runtime.resolve(),a.client.resolve(),a.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(f.read_bytes()!=v for f,v in sources.items()):raise ValueError('Changing bull edit sources cannot be certified')
 result.update(coordinated_candidate_count=39,admission_rollback_probes=3,sdk_proof=exercise.sdk,catalog_creation_sdk_proof=exercise.parent_sdk,registration_sdk_proof=exercise.registration_sdk,source_hashes={str(f.relative_to(r.ROOT)):r.p.digest(v) for f,v in sources.items()},temporary_database_stopped_and_removed=True,limits=['Four local private metadata exports/synthetic Auth/private socket/Web Locks stub only; never production.','Bull editing and actual caller only; direct grants/service/import creation/global/hosted/capacity/recovery remain open.'])
 a.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
