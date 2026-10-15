#!/usr/bin/env python3
"""Atomic manual create/edit/discard on the four-export local replay."""
import argparse
import concurrent.futures
import importlib.util
import json
import subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('linkage',Path(__file__).with_name('manual-clinical-alert-link-replay.py'))
t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
c,r,lit,js,u=t.c,t.r,t.lit,t.js,t.u
SOURCE=r.ROOT/'src/sql/security-candidates/alert-management.sql'
def install(sql):
 t.install(sql);sql(SOURCE.read_text())
def exercise(sql,ctx):
 check,call=ctx['check'],ctx['call'];base=ctx['state_query']().rstrip(';')
 query="SELECT jsonb_build_object('base',("+base+"),'clinical_requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM clinical_step_confirmation.requests x),'clinical_audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM clinical_step_confirmation.audit x),'response_requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM alert_response.requests x),'response_audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM alert_response.audit x),'requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM alert_management.requests x),'audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM alert_management.audit x));"
 state=lambda:sql(query)
 def web(mode,key,intent=None,actor=c.OWNER,expected=None,ok=True):return call('fn_alert_management_web',[lit(mode),u(key),js(intent) if intent is not None else 'NULL::jsonb',u(expected or actor or c.OWNER)],actor=actor,ok=ok)
 def refuse(label,fn,marker):
  before=state();failure=fn();check(failure.returncode!=0 and marker.lower() in failure.stderr.lower() and state()==before,label+' refuses with complete rollback')
 def raw(body,key):return sql('BEGIN;'+body+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(c.OWNER)+';SELECT public.fn_alert_management_web(\'post\','+u(key)+',NULL::jsonb,'+u(c.OWNER)+');COMMIT;',False)
 animal=c.uid();sql('INSERT INTO hato_animales(id,nombre,etapa,estado) VALUES('+u(animal)+",'Synthetic managed animal','vaca','activa');")
 intent=dict(version=1,kind='create',tipo='secado_due',animalId=animal,pasoId=None,fechaProgramada='2026-10-14',nota='Synthetic manual note');key=c.uid();prepared=web('prepare',key,intent);target=prepared['original']['targetId'];before=state();check(web('prepare',key,intent)==prepared and state()==before and not prepared['original']['targets'],'prepare reserves one original server alert ID without domain mutation')
 refuse('expected owner switch',lambda:web('status',key,actor=c.OTHER,expected=c.OWNER,ok=False),'owner changed')
 refuse('changed intent',lambda:web('prepare',key,{**intent,'nota':'Changed'},ok=False),'Changed original')
 refuse('post intent replacement',lambda:web('post',key,intent,ok=False),'cannot replace')
 refuse('changed source animal',lambda:raw("UPDATE hato_animales SET nombre='Changed synthetic' WHERE id="+u(animal)+';',key),'source graph changed')
 faults=[('hato_alertas','BEFORE INSERT','RETURN NULL;','insert suppressed'),('hato_alertas','BEFORE INSERT','NEW.created_by=NULL;RETURN NEW;','insert suppressed'),('hato_alertas','AFTER INSERT',"UPDATE public.hato_animales SET nombre='Synthetic side effect' WHERE id=NEW.animal_id;RETURN NULL;",'final domain'),('alert_management.audit','BEFORE INSERT','RETURN NULL;','audit suppressed'),('alert_management.requests','BEFORE UPDATE',"IF NEW.state='committed' THEN RETURN NULL;END IF;RETURN NEW;",'committed request suppressed')]
 for table,event,body,marker in faults:
  ddl='CREATE FUNCTION public.synthetic_management_fault() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN '+body+' END $f$;CREATE TRIGGER synthetic_management_fault '+event+' ON '+table+' FOR EACH ROW EXECUTE FUNCTION public.synthetic_management_fault();'
  refuse(table+' '+event,lambda ddl=ddl:raw(ddl,key),marker)
 with concurrent.futures.ThreadPoolExecutor(2) as pool:
  x=pool.submit(web,'post',key);y=pool.submit(web,'post',key);posted=x.result();other=y.result()
 check(posted==other and posted['state']=='committed','same-key concurrent create posts exactly one receipt')
 row=posted['receipt']['after']['targets'][0]['alert'];check(row['id']==target and row['created_by']==c.OWNER and row['datos']=={'origen':'manual','nota':'Synthetic manual note'} and row['created_at']==posted['receipt']['recordedAt'],'manual alert uses reserved ID and trusted current actor/time/note')
 before=state();check(web('post',key)==posted and web('status',key)==posted and web('resolve',key)==posted and state()==before,'lost create response recovers same immutable receipt without duplicate alert')
 check(sql('SELECT count(*) FROM alert_management.audit WHERE request_key='+u(key)+' AND receipt='+js(posted['receipt'])+';')=='1','independent immutable audit equals exact receipt')
 edit=dict(version=1,kind='edit',alerts=[row],fechaProgramada='2026-10-15',nota='Synthetic changed note');ek=c.uid();web('prepare',ek,edit)
 refuse('stale editor',lambda:raw('UPDATE hato_alertas SET intentos=intentos+1 WHERE id='+u(target)+';',ek),'source graph changed')
 edited=web('post',ek);updated=edited['receipt']['after']['targets'][0]['alert'];check(updated['fecha_programada']=='2026-10-15' and updated['datos']=={**row['datos'],'nota_gestor':'Synthetic changed note'},'edit preserves original JSONB and changes only reviewed schedule/note/time')
 refuse('stale prepare original',lambda:web('prepare',c.uid(),edit,ok=False),'Observed active alert changed')
 # Whole-batch discard: a late target failure must undo every earlier row.
 second=c.uid();p2=web('prepare',second,{**intent,'nota':'Second synthetic'});second_post=web('post',second);row2=second_post['receipt']['after']['targets'][0]['alert'];bulk=dict(version=1,kind='discard',alerts=sorted([updated,row2],key=lambda x:x['id']));bk=c.uid();web('prepare',bk,bulk)
 ddl="CREATE FUNCTION public.synthetic_management_bulk_fault() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN IF NEW.id="+u(bulk['alerts'][-1]['id'])+" THEN RETURN NULL;END IF;RETURN NEW;END $f$;CREATE TRIGGER synthetic_management_bulk_fault BEFORE UPDATE ON hato_alertas FOR EACH ROW EXECUTE FUNCTION public.synthetic_management_bulk_fault();"
 refuse('late bulk target suppression',lambda:raw(ddl,bk),'update suppressed')
 bulk_post=web('post',bk);check(all(x['alert']['estado']=='descartada' and x['alert']['respondida_por']=='owner@synthetic.invalid' for x in bulk_post['receipt']['after']['targets']),'bulk discard posts all captured originals with trusted attribution in one transaction')
 before=state();check(web('post',bk)==bulk_post and state()==before,'bulk retry never repeats side effects')
 canceled=c.uid();fence=web('resolve',canceled);before=state();check(fence['state']=='canceled' and web('prepare',canceled,intent)==fence and state()==before,'cancel before prepare fences original key without adopting intent')
 sql('UPDATE usuarios SET activo=false WHERE id='+u(c.OWNER)+';');refuse('revoked owner receipt',lambda:web('status',key,ok=False),'Active');sql('UPDATE usuarios SET activo=true WHERE id='+u(c.OWNER)+';')
 for role in ('anon','authenticated','service_role'):
  refuse(role+' private request access',lambda role=role:sql('BEGIN;SET LOCAL ROLE '+role+';SELECT * FROM alert_management.requests;COMMIT;',False),'permission denied')

 # The actual management RPC must preserve owner Option1, not just direct INSERT.
 observed=json.loads(sql('SELECT to_jsonb(a) FROM hato_animales a WHERE id='+u(animal)+';'))
 clinical_payload=dict(version=1,animalId=animal,nombre='Synthetic managed treatment',fechaInicio='2026-10-14',nota=None,fechaProximoPaso='2026-10-14',descripcionPaso='Selected existing managed step',observedAnimal=observed)
 creation=c.uid();args=[lit('prepare'),u(creation),js(clinical_payload),u(c.OWNER)];call('fn_hato_treatment_create_web',args);args[0]=lit('post');created=call('fn_hato_treatment_create_web',args);step=created['receipt']['after']['steps'][0]['id']
 clinical_intent={**intent,'tipo':'tratamiento_paso','pasoId':step};ck=c.uid();web('prepare',ck,clinical_intent);manual_clinical=web('post',ck);linked=manual_clinical['receipt']['after']['targets'][0]['alert']
 check(linked['paso_id']==step and manual_clinical['receipt']['after']['clinical']['steps'][0]['fecha_ejecutada'] is None,'managed manual clinical creation links existing pending step without executing it')
 confirmation=dict(version=1,stepId=step,fechaEjecutada='2026-10-14',alertId=linked['id']);confirm_key=c.uid();args=[lit('prepare'),u(confirm_key),js(confirmation),u(c.OWNER)];call('fn_clinical_step_web',args);args[0]=lit('post');args[2]='NULL::jsonb';confirmed=call('fn_clinical_step_web',args)
 check(confirmed['state']=='committed' and confirmed['receipt']['after']['steps'][0]['fecha_ejecutada']=='2026-10-14','Si after managed creation uses existing prepared clinical execution')
 # Actual browser adapter plus installed SDK over synthetic HTTP/private Unix socket.
 sdk=[]
 for mode in ('lost-post','owner-switch'):
  data=dict(mode=mode,socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),owner=c.OWNER,other=c.OTHER,intent={**intent,'nota':'Synthetic SDK '+mode},stateQuery=query)
  proc=subprocess.run(['node',str(Path(__file__).with_name('alert-management-browser-native.mjs'))],input=json.dumps(data),text=True,capture_output=True,cwd=r.ROOT,timeout=60)
  if proc.returncode:raise ValueError('Local management SDK proof failed: '+proc.stderr[:1200])
  proof=json.loads(proc.stdout);sdk.append(dict(mode=mode,**proof));check(proof['assertions']>=5,'actual browser installed SDK '+mode+' verifies strict management proof')
 exercise.sdk=sdk
 exercise.result=dict(atomic_create_edit_bulk_verified=True)
def main():
 a=argparse.ArgumentParser(description=__doc__);a.add_argument('evidence_dir',type=Path)
 for name in ('runtime','client','output','private-diagnostics'):a.add_argument('--'+name,type=Path,required=True)
 args=a.parse_args();evidence=args.evidence_dir.resolve();output=args.output.resolve();exercise.client=args.client.resolve()
 if output.is_relative_to(evidence) or output.name.endswith('-private.json'):raise ValueError('Cannot overwrite private evidence')
 files=[SOURCE,Path(__file__),Path(__file__).with_name('alert-management-browser-native.mjs'),*[r.ROOT/'src/utils/hato'/n for n in ('alertManagementProtocol.ts','alertManagementBrowserAttempt.ts','alertResponseProtocol.ts','clinicalStepConfirmationProtocol.ts')],*[r.ROOT/'src/components/hato'/n for n in ('AlertasView.tsx','hooks/useAlertManagement.ts','components/AlertManagementDialog.tsx')]];sources={p:p.read_bytes() for p in files};catalog,rls,hashes=r.load(evidence)
 with r.database(args.runtime.resolve(),args.client.resolve(),args.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(p.read_bytes()!=b for p,b in sources.items()):raise ValueError('Source changed during replay')
 result.update(exercise.result,sdk_proofs=exercise.sdk,native_sdk_assertions=sum(p['assertions'] for p in exercise.sdk),source_hashes={str(p.relative_to(r.ROOT)):r.p.digest(b) for p,b in sources.items()},temporary_database_stopped_and_removed=True)
 result['limits']=['Synthetic local nineteen-candidate replay only; no production query/change.','Browser protocol/SDK plus synthetic Auth/private socket only; hosted JWT/session/deployed parity unverified. Cron and direct writer retirement, ordinary-role/runtime/global/recovery remain open.']
 output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
