#!/usr/bin/env python3
"""Native standalone event correction foundation, on the four-export local replay only."""
import argparse
import concurrent.futures
import importlib.util
import json
import subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('cycle',Path(__file__).with_name('hato-pajilla-use-replay.py'))
t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
c,r,lit,js,u=t.c,t.r,t.lit,t.js,t.u
SOURCE=r.ROOT/'src/sql/security-candidates/hato-event-correction.sql'
def state_query(sql):return t.state_query(sql)
def install(sql):
 t.install(sql);query=state_query(sql);before=sql(query)
 for ddl,marker in (("CREATE TABLE public.synthetic_event_reference(event_id uuid REFERENCES public.hato_eventos(id) ON DELETE CASCADE);",'Unreviewed incoming event FK boundary'),("ALTER TABLE hato_pajillas ADD COLUMN synthetic_unreviewed boolean;",'Unreviewed event correction inventory graph'),("ALTER TABLE hato_eventos FORCE ROW LEVEL SECURITY;",'Unreviewed event correction source graph'),("ALTER FUNCTION hato_treatment_creation.web_actor() SET search_path=public;",'Unreviewed event correction actor helper')):
  failure=sql('BEGIN;'+ddl+SOURCE.read_text(),False)
  if failure.returncode==0 or marker not in failure.stderr or sql(query)!=before or sql("SELECT to_regnamespace('hato_event_correction') IS NULL;")!='t':raise AssertionError('Event correction admission rollback')
 sql(SOURCE.read_text())
 if sql(query)!=before:raise AssertionError('Event correction install changed existing rows')
def exercise(sql,ctx):
 check,call=ctx['check'],ctx['call'];target=ctx['treated']['payload']['animalId'];query=state_query(sql);state=lambda:sql(query)
 event=c.uid();delete_event=c.uid();sql('INSERT INTO hato_eventos(id,animal_id,tipo,fecha,fecha_confianza,fuente,datos) VALUES('+u(event)+','+u(target)+",'celo','2026-08-01','exacta','web',"+js(dict(nota='Original note',motivo_correccion='Original reason',sentinel=dict(keep=True)))+'),('+u(delete_event)+','+u(target)+",'aborto','2026-08-02','exacta','telegram',NULL);UPDATE usuarios SET activo=true WHERE id="+u(c.OTHER)+';')
 def correction(mode,key,intent=None,who=c.OWNER,expected='self',role='authenticated',ok=True):return call('fn_hato_event_correction_web',[lit(mode),u(key),js(intent) if intent is not None else 'NULL::jsonb',u(who) if expected=='self' else (u(expected) if expected else 'NULL::uuid')],actor=who,role=role,ok=ok)
 observed=json.loads(sql('SELECT to_jsonb(x) FROM hato_eventos x WHERE id='+u(event)+';'))
 changes=dict(fecha='2026-08-03',fecha_confianza='aproximada',tipo_servicio=None,toro_id=None,cria_destino=None,nota='Reviewed correction',motivo='Actual observed date')
 intent=dict(version=1,eventId=event,mode='edit',observedEvent=observed,changes=changes);key=c.uid();prepared=correction('prepare',key,intent)
 check(prepared['state']=='pending' and prepared['plan']['event']['id']==event and prepared['plan']['event']['created_by']==observed['created_by'],'prepared correction preserves actual event identity/source/creation attribution')
 before=state();check(correction('prepare',key,intent)==prepared and state()==before,'same key preserves exact original correction plan')
 def refuse(label,fn,marker):
  before=state();failure=fn()
  if failure.returncode==0 or marker.lower() not in failure.stderr.lower() or state()!=before:
   p=Path('/tmp/escocia-event-correction-unexpected-private.log');p.touch(mode=0o600,exist_ok=True);p.write_text(failure.stderr);raise AssertionError(label+' refusal/rollback; private diagnostics saved')
  check(True,label+' refuses with complete rollback')
 def raw(ddl,request=key,who=c.OWNER):return sql('BEGIN;'+ddl+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(who)+";SELECT fn_hato_event_correction_web('post',"+u(request)+',NULL::jsonb,'+u(who)+');COMMIT;',False)
 refuse('cross-owner correction key',lambda:correction('status',key,who=c.OTHER,ok=False),'owner changed')
 refuse('missing expected owner',lambda:correction('status',key,expected=None,ok=False),'owner/key')
 for label,ddl,marker in [('stale event',"UPDATE hato_eventos SET fecha='2026-08-04' WHERE id="+u(event)+';','graph changed'),('stale related animal',"UPDATE hato_animales SET notas='Competing source' WHERE id="+u(target)+';','graph changed'),('revoked actor','UPDATE usuarios SET activo=false WHERE id='+u(c.OWNER)+';','active')]:refuse(label,lambda ddl=ddl:raw(ddl),marker)
 refuse('new incoming cascade boundary',lambda:raw('CREATE TABLE public.synthetic_event_reference(event_id uuid REFERENCES public.hato_eventos(id) ON DELETE CASCADE);'),'incoming event FK boundary')
 for table,operation,body,marker in [('public.hato_eventos','BEFORE UPDATE','RETURN NULL;','target suppressed'),('public.hato_correcciones','BEFORE INSERT','RETURN NULL;','suppressed'),('hato_event_correction.audit','BEFORE INSERT','RETURN NULL;','audit suppressed'),('hato_event_correction.requests','BEFORE UPDATE','RETURN NULL;','control suppressed'),('public.hato_eventos','BEFORE UPDATE',"NEW.fuente='telegram';RETURN NEW;",'target suppressed'),('public.hato_eventos','AFTER UPDATE','UPDATE public.usuarios SET activo=false WHERE id='+u(c.OWNER)+';RETURN NEW;','active'),('public.hato_eventos','AFTER UPDATE',"UPDATE public.hato_animales SET notas='Unexpected side effect' WHERE id="+u(target)+';RETURN NEW;','trace required')]:
  ddl='CREATE FUNCTION public.synthetic_correction_fault() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN '+body+' END $f$;CREATE TRIGGER synthetic_correction_fault '+operation+' ON '+table+' FOR EACH ROW EXECUTE FUNCTION public.synthetic_correction_fault();';refuse(table+' '+body[:25],lambda ddl=ddl:raw(ddl),marker)
 competitor=c.uid();correction('prepare',competitor,intent,who=c.OTHER)
 before=json.loads(state())
 with concurrent.futures.ThreadPoolExecutor(2) as pool:
  a=pool.submit(correction,'post',key);b=pool.submit(correction,'post',key);posted=a.result();other=b.result()
 after=json.loads(state());allowed={'public.hato_eventos','public.hato_correcciones','hato_event_correction.requests','hato_event_correction.audit'}
 check(all(v==after[k] for k,v in before.items() if k not in allowed),'correction leaves every unrelated financial/backup/clinical/inventory/private record exact')
 check(posted==other and posted['state']=='committed','concurrent same-key correction records one exact event edit/human trace/operation audit')
 check(posted['receipt']['correction']['motivo']=='Actual observed date' and posted['plan']['event']['datos']['sentinel']==dict(keep=True),'trusted trace records actual actor/time/reason and preserves unknown metadata')
 refuse('competing original correction',lambda:correction('post',competitor,who=c.OTHER,ok=False),'graph changed')
 before=state();check(correction('status',key)==posted and correction('post',key)==posted and state()==before,'original edited receipt survives retries without another human trace')
 deleting=json.loads(sql('SELECT to_jsonb(x) FROM hato_eventos x WHERE id='+u(delete_event)+';'));delete_intent=dict(version=1,eventId=delete_event,mode='delete',observedEvent=deleting,changes=None);dk=c.uid();refuse('Administrator deletion bypass',lambda:correction('prepare',dk,delete_intent,ok=False),'Fresh Gerencia');correction('prepare',dk,delete_intent,who=c.OTHER)
 refuse('demoted Gerencia deletion',lambda:raw("UPDATE usuarios SET rol='Administrador' WHERE id="+u(c.OTHER)+';',dk,who=c.OTHER),'Fresh Gerencia')
 ddl='CREATE FUNCTION public.synthetic_delete_fault() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RETURN NULL;END $f$;CREATE TRIGGER synthetic_delete_fault BEFORE DELETE ON hato_eventos FOR EACH ROW EXECUTE FUNCTION public.synthetic_delete_fault();';refuse('suppressed delete',lambda:raw(ddl,dk,who=c.OTHER),'delete suppressed')
 deleted=correction('post',dk,who=c.OTHER);check(deleted['receipt']['after']['event'] is None and deleted['receipt']['correction']['datos_nuevos'] is None,'deletion removes only selected event and retains exact old-row human/operation proof')
 before=state();check(correction('post',dk,who=c.OTHER)==deleted and correction('status',dk,who=c.OTHER)==deleted and state()==before,'lost deletion receipt recovers after target no longer exists')
 # Unsupported coupled facts refuse without adopting or rewriting a link.
 for i,fields in enumerate([dict(tipo='venta'),dict(tipo='muerte'),dict(tipo='parto',cria_destino='retenida'),dict(tipo='servicio',tipo_servicio='inseminacion'),dict(tipo='celo',datos=dict(pajilla_uso_id='unknown'))]):
  eid=c.uid();vals=dict(id=eid,animal_id=target,tipo=fields.pop('tipo'),fecha='2026-07-'+str(10+i).zfill(2),fecha_confianza='exacta',fuente='web',**fields);sql('INSERT INTO hato_eventos SELECT (jsonb_populate_record(NULL::hato_eventos,'+js(vals)+"||jsonb_build_object('created_at',now()))).*;")
  row=json.loads(sql('SELECT to_jsonb(x) FROM hato_eventos x WHERE id='+u(eid)+';'));p=dict(delete_intent,eventId=eid,observedEvent=row);refuse('coupled legacy '+str(i),lambda p=p:correction('prepare',c.uid(),p,who=c.OTHER,ok=False),'coordinated lifecycle')
 fence=c.uid();canceled=correction('resolve',fence);check(correction('prepare',fence,intent)==canceled,'cancel-before-prepare fences original correction key')
 for role in ('anon','authenticated','service_role'):refuse(role+' private correction controls',lambda role=role:sql('BEGIN;SET LOCAL ROLE '+role+';SELECT * FROM hato_event_correction.requests;COMMIT;',False),'permission denied')
 for role in ('anon','service_role'):refuse(role+' correction impersonation',lambda role=role:correction('status',key,role=role,ok=False),'permission denied')
 data=dict(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),owner=c.OWNER,other=c.OTHER,event=event,deleted=delete_event,stateQuery=query)
 proc=subprocess.run(['node',str(Path(__file__).with_name('hato-event-correction-native.mjs'))],input=json.dumps(data),text=True,capture_output=True,cwd=r.ROOT,timeout=90)
 if proc.returncode:
  p=Path('/tmp/escocia-event-correction-sdk-private.log');p.touch(mode=0o600,exist_ok=True);p.write_text(proc.stderr);raise ValueError('Event correction native SDK failed; private diagnostics saved')
 exercise.sdk=json.loads(proc.stdout);check(exercise.sdk['assertions']>=8,'strict installed SDK correction protocol equals independent native event/trace/audit state')
def main():
 a=argparse.ArgumentParser();a.add_argument('--evidence-dir',type=Path,required=True)
 for n in ('runtime','client','output','private-diagnostics'):a.add_argument('--'+n,type=Path,required=True)
 args=a.parse_args();exercise.client=args.client.resolve();files=[*sorted((r.ROOT/'src/sql/security-candidates').glob('*.sql')),Path(__file__),Path(__file__).with_name('hato-event-correction-native.mjs'),Path(__file__).with_name('hato-pajilla-use-replay.py')]
 files.extend(r.ROOT/'src/utils/hato'/name for name in ('hatoEventCorrectionProtocol.ts','alertResponseProtocol.ts'))
 files.extend(r.ROOT/name for name in ('src/components/hato/hooks/useCorregirEventoHato.ts','src/components/hato/components/EditarEventoDialog.tsx'))
 sources={p:p.read_bytes() for p in files};catalog,rls,hashes=r.load(args.evidence_dir.resolve())
 if args.output.resolve().is_relative_to(args.evidence_dir.resolve()) or args.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(args.runtime.resolve(),args.client.resolve(),args.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(p.read_bytes()!=b for p,b in sources.items()):raise ValueError('Changing event correction source cannot be certified')
 result.update(coordinated_candidate_count=32,admission_rollback_probes=4,sdk_proof=exercise.sdk,source_hashes={str(p.relative_to(r.ROOT)):r.p.digest(b) for p,b in sources.items()},temporary_database_stopped_and_removed=True,limits=['Four local private metadata exports and synthetic Auth/private socket only; never production.','Actual event correction browser cutover/coupled undo/pajilla purchase/catalog/generic grant retirement/hosted drain/readers/runtime/global/capacity/recovery remain open.'])
 args.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
