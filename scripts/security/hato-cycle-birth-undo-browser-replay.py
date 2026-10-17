#!/usr/bin/env python3
"""Protected retained-birth/intact-calf undo on four local metadata exports only."""
import argparse
import concurrent.futures
import importlib.util
import json
import subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('prior',Path(__file__).with_name('hato-birth-undo-replay.py'))
t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
c,r,lit,js,u=t.c,t.r,t.lit,t.js,t.u
SOURCE=r.ROOT/'src/sql/security-candidates/hato-cycle-birth-undo.sql'
def state_query(sql):return t.state_query(sql)
def install(sql):
 t.install(sql);query=state_query(sql);before=sql(query)
 for ddl,marker in [("ALTER TABLE hato_eventos FORCE ROW LEVEL SECURITY;",'source graph'),("CREATE TABLE public.synthetic_calf_ref(id uuid REFERENCES hato_animales(id));",'domain inventory'),("ALTER TABLE hato_pesajes_leche DROP CONSTRAINT hato_pesajes_leche_animal_id_fkey;",'incoming FK inventory'),("ALTER FUNCTION hato_cycle.snapshot(uuid) SET search_path=public;",'hato_cycle.snapshot(uuid)')]:
  fail=sql('BEGIN;'+ddl+SOURCE.read_text(),False)
  if fail.returncode==0 or marker not in fail.stderr or sql(query)!=before or sql("SELECT to_regnamespace('hato_cycle_birth_undo') IS NULL;")!='t':
   p=Path('/tmp/escocia-birth-undo-admission-private.log');p.touch(mode=0o600,exist_ok=True);p.write_text(fail.stderr);raise AssertionError('Birth undo admission rollback '+marker)
 sql(SOURCE.read_text())
 if sql(query)!=before:raise AssertionError('Birth undo installation changed existing rows')
def exercise(sql,ctx):
 check,call=ctx['check'],ctx['call'];query=state_query(sql);state=lambda:sql(query);animal=c.uid();keys={n:c.uid() for n in range(100,220)}
 sql('UPDATE usuarios SET activo=true WHERE id='+u(c.OTHER)+';INSERT INTO hato_animales(id,numero,nombre,etapa,estado) VALUES('+u(animal)+",780,'Synthetic browser retained birth mother','vaca','activa');INSERT INTO hato_config(clave,valor) VALUES('meses_gestacion_default','9'::jsonb) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor;")
 observed=json.loads(sql('SELECT to_jsonb(x) FROM hato_animales x WHERE id='+u(animal)+';'));day=sql("SELECT to_char((now() AT TIME ZONE 'America/Bogota')::date,'YYYY-MM-DD');")
 intent=dict(version=1,animalId=animal,observedAnimal=observed,input=dict(marca='parida',fecha=day,fechaConfianza='exacta',criaDestino='retenida',nota='',ancla=dict(modo='ninguna',fechaServicio=None,mesesPrenez=None)))
 def birth(mode,msg=101,p=None):return call('fn_hato_cycle_web',[lit(mode),u(keys[msg]),js(p) if p else 'NULL::jsonb',u(c.OTHER)],actor=c.OTHER,role='authenticated')
 birth('prepare',p=intent);created=birth('post');event=created['plan']['events'][0]['id'];calf=created['receipt']['calf']['id']
 def undo(mode,msg=201,target=None,who=c.OTHER,ok=True,role='authenticated',actor=c.OTHER):return call('fn_hato_cycle_birth_undo_web',[lit(mode),u(keys[msg]),u(target) if target else 'NULL::uuid',u(who)],actor=actor,role=role,ok=ok)
 before=state();alternate=sql('BEGIN;UPDATE usuarios SET rol=\'Gerencia\' WHERE id='+u(c.OWNER)+';SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(c.OWNER)+";SELECT fn_hato_cycle_birth_undo_web('prepare',"+u(keys[206])+','+u(event)+','+u(c.OWNER)+");SELECT fn_hato_cycle_birth_undo_web('post',"+u(keys[206])+",NULL::uuid,"+u(c.OWNER)+")->>'state';ROLLBACK;");check(alternate.splitlines()[-1]=='committed' and state()==before,'another current Gerencia may undo a protected birth without a creator-only policy')
 prepared=undo('prepare',target=event);check(prepared['state']=='pending' and prepared['original']['creation']==created,'exact protected birth receipt and intact automatic calf captured without historical adoption')
 before=state();check(undo('prepare',target=event)==prepared and state()==before,'original native action retains exact key/source; preparation never deletes')
 def refuse(label,fn,marker):
  before=state();f=fn()
  if f.returncode==0 or marker.lower() not in f.stderr.lower() or state()!=before:
   p=Path('/tmp/escocia-birth-undo-unexpected-private.log');p.touch(mode=0o600,exist_ok=True);p.write_text(f.stderr);raise AssertionError(label+' rollback/refusal; private diagnostics saved')
  check(True,label+' refuses with full state rollback')
 def raw(ddl,msg=201,mode='post',target=None):return sql('BEGIN;'+ddl+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(c.OTHER)+';SELECT fn_hato_cycle_birth_undo_web('+lit(mode)+','+u(keys[msg])+','+(u(target) if target else 'NULL::uuid')+','+u(c.OTHER)+');COMMIT;',False)
 refuse('replacement before original resolves',lambda:undo('prepare',202,event,ok=False),'original protected undo')
 refuse('wrong expected owner',lambda:undo('status',who=c.OWNER,ok=False),'current web owner')
 refuse('missing Auth identity',lambda:undo('status',actor=None,ok=False),'current web owner')
 missing=c.uid();refuse('missing current profile',lambda:undo('status',who=missing,actor=missing,ok=False),'active')
 refuse('another genuine Gerencia cannot recover owned key',lambda:sql('BEGIN;UPDATE usuarios SET rol=\'Gerencia\' WHERE id='+u(c.OWNER)+';SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(c.OWNER)+";SELECT fn_hato_cycle_birth_undo_web('status',"+u(keys[201])+',NULL::uuid,'+u(c.OWNER)+');COMMIT;',False),'owner changed')
 for label,ddl,marker in [('changed event',"UPDATE hato_eventos SET fecha=fecha-1 WHERE id="+u(event)+';','event/calf changed'),('renamed calf',"UPDATE hato_animales SET nombre='Named calf' WHERE id="+u(calf)+';','event/calf changed'),('edited calf',"UPDATE hato_animales SET notas='Work recorded' WHERE id="+u(calf)+';','event/calf changed'),('inactive calf',"UPDATE hato_animales SET estado='vendida' WHERE id="+u(calf)+';','event/calf changed'),('mother source',"UPDATE hato_animales SET notas='Competing edit' WHERE id="+u(animal)+';','clinical graph'),('revoked Gerencia',"UPDATE usuarios SET activo=false WHERE id="+u(c.OTHER)+';','Gerencia'),('demoted Gerencia',"UPDATE usuarios SET rol='Administrador' WHERE id="+u(c.OTHER)+';','Gerencia'),('new domain table','CREATE TABLE public.synthetic_calf_ref(id uuid);','domain inventory'),('new animal FK',"ALTER TABLE hato_pesajes_leche ADD CONSTRAINT synthetic_calf_fk FOREIGN KEY(animal_id) REFERENCES hato_animales(id) ON DELETE CASCADE;",'incoming FK inventory')]:refuse(label,lambda ddl=ddl:raw(ddl),marker)
 for label,ddl in [('backup retained calf history',"INSERT INTO respaldos.backup_153_hato_animales SELECT (jsonb_populate_record(NULL::respaldos.backup_153_hato_animales,(SELECT to_jsonb(x) FROM hato_animales x WHERE id="+u(calf)+"))).*;"),('backup original event history',"INSERT INTO respaldos.backup_153_hato_eventos SELECT (jsonb_populate_record(NULL::respaldos.backup_153_hato_eventos,(SELECT to_jsonb(x) FROM hato_eventos x WHERE id="+u(event)+"))).*;"),('child animal FK','INSERT INTO hato_animales(numero,nombre,etapa,estado,madre_id) VALUES(NULL,\'Synthetic descendant\',\'ternera\',\'activa\','+u(calf)+');'),('own clinical event FK','INSERT INTO hato_eventos(animal_id,tipo,fecha,fecha_confianza,fuente) VALUES('+u(calf)+",'rechequeo',current_date,'exacta','telegram');"),('non-FK financial history',"UPDATE fin_gastos SET observaciones="+lit('Synthetic retained history '+calf)+';'),('unrelated event JSON reference',"UPDATE hato_eventos SET datos=coalesce(datos,'{}')||jsonb_build_object('synthetic_reference',"+u(calf)+') WHERE id<> '+u(event)+';'),('event-only untyped reference',"UPDATE fin_gastos SET observaciones="+lit('Synthetic event history '+event)+';')]:refuse(label,lambda ddl=ddl:raw(ddl),'source changed' if label=='child animal FK' else 'Referenced calf/history')
 for table,operation,body,marker in [('public.hato_eventos','BEFORE DELETE','RETURN NULL;','event delete suppressed'),('public.hato_animales','BEFORE DELETE','RETURN NULL;','calf delete suppressed'),('public.hato_correcciones','BEFORE INSERT','RETURN NULL;','protection boundary drift'),('hato_cycle_birth_undo.audit','BEFORE INSERT','RETURN NULL;','audit suppressed'),('hato_cycle_birth_undo.requests','BEFORE UPDATE','RETURN NULL;','control suppressed'),('public.hato_eventos','AFTER DELETE','UPDATE public.usuarios SET activo=false WHERE id='+u(c.OTHER)+';RETURN OLD;','active'),('hato_cycle_birth_undo.requests','AFTER UPDATE',"UPDATE public.fin_gastos SET estado='Pendiente';RETURN NEW;",'whole-domain mismatch'),('hato_cycle_birth_undo.audit','AFTER INSERT',"UPDATE public.hato_animales SET notas='Late mutation' WHERE id="+u(animal)+';RETURN NEW;','whole-domain mismatch')]:
  ddl='CREATE FUNCTION public.synthetic_birth_undo_fault() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN '+body+' END $f$;CREATE TRIGGER synthetic_birth_undo_fault '+operation+' ON '+table+' FOR EACH ROW EXECUTE FUNCTION public.synthetic_birth_undo_fault();';refuse(table+' '+body[:20],lambda ddl=ddl:raw(ddl),marker)
 refuse('suppressed calf source trace',lambda:raw('ALTER TABLE public.hato_animales DISABLE TRIGGER trg_hato_correccion;'),'two trusted source correction traces')
 refuse('suppressed event source trace',lambda:raw('ALTER TABLE public.hato_eventos DISABLE TRIGGER trg_hato_correccion;'),'two trusted source correction traces')
 legacy=c.uid();refuse('legacy birth marker never establishes provenance',lambda:raw('INSERT INTO hato_eventos SELECT (jsonb_populate_record(NULL::hato_eventos,(SELECT to_jsonb(e) FROM hato_eventos e WHERE id='+u(event)+")||jsonb_build_object('id',"+u(legacy)+",'fecha','2026-08-01'))).*;",208,'prepare',legacy),'provenance')
 refuse('later mother work',lambda:raw('INSERT INTO hato_eventos(animal_id,tipo,fecha,fecha_confianza,fuente) VALUES('+u(animal)+",'rechequeo',current_date,'exacta','telegram');"),'clinical graph')
 refuse('immutable original birth audit',lambda:raw("UPDATE hato_cycle.audit SET receipt=receipt||'{\"forged\":true}'::jsonb;"),'immutable original cycle')
 before=json.loads(state());footprint=sql("SELECT encode(sha256(convert_to(hato_birth_undo.capture_domain()::text,'UTF8')),'hex');")
 with concurrent.futures.ThreadPoolExecutor(2) as pool:
  a=pool.submit(undo,'post');b=pool.submit(undo,'post');posted=a.result();duplicate=b.result()
 after=json.loads(state());allowed={'public.hato_eventos','public.hato_animales','public.hato_correcciones','hato_cycle_birth_undo.requests','hato_cycle_birth_undo.audit'}
 check(posted==duplicate and posted['state']=='committed','concurrent original posts remove exact retained pair once with two trusted human traces')
 check(all(after[k]==v for k,v in before.items() if k not in allowed),'all unrelated financial/backup/clinical/private records and original creation proof preserved')
 check(sql('SELECT count(*) FROM hato_eventos WHERE id='+u(event)+';')=='0' and sql('SELECT count(*) FROM hato_animales WHERE id='+u(calf)+';')=='0','both original public targets removed atomically')
 check(posted['receipt']['footprints']==dict(before=footprint,after=sql("SELECT encode(sha256(convert_to(hato_birth_undo.capture_domain()::text,'UTF8')),'hex');")),'independent whole-domain before/after digests equal immutable receipt')
 traces=posted['receipt']['corrections'];check(len(traces)==2 and {x['tabla'] for x in traces}=={'hato_eventos','hato_animales'} and all(x['corregido_por']==c.OTHER for x in traces),'two real current-Gerencia traces without fabricated Auth identity')
 before=state();check(undo('status')==posted and undo('post')==posted and state()==before,'original action recovers immutable proof after pair disappearance without recreation')
 check(birth('post')==created and birth('status')==created,'immutable creation proof remains readable and cannot recreate removed calf/event')
 refuse('revoked receipt recovery',lambda:raw('UPDATE usuarios SET activo=false WHERE id='+u(c.OTHER)+';',mode='status'),'Gerencia')
 refuse('replacement after committed undo',lambda:undo('prepare',202,event,ok=False),'original protected undo')
 fence=undo('resolve',203);check(undo('prepare',203,event)==fence,'cancel-before-prepare fences original private action')
 before=state();unknown=undo('status',204);check(unknown['state']=='unknown' and unknown['requestKey']==keys[204] and state()==before,'unknown status is read-only and allocates no replacement')
 for role in ('anon','authenticated','service_role'):refuse(role+' private controls',lambda role=role:sql('BEGIN;SET LOCAL ROLE '+role+';SELECT * FROM hato_cycle_birth_undo.requests;COMMIT;',False),'permission denied')
 for role in ('anon','service_role'):refuse(role+' web impersonation',lambda role=role:undo('status',role=role,ok=False),'permission denied')
 data=dict(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),animal=animal,day='2026-09-20',owner=c.OTHER,stateQuery=query)
 proc=subprocess.run(['node',str(Path(__file__).with_name('hato-cycle-birth-undo-browser-native.mjs'))],input=json.dumps(data),text=True,capture_output=True,cwd=r.ROOT,timeout=90)
 if proc.returncode:
  p=Path('/tmp/escocia-birth-undo-sdk-private.log');p.touch(mode=0o600,exist_ok=True);p.write_text(proc.stderr);raise AssertionError('Birth undo SDK failed; private diagnostics saved')
 exercise.sdk=json.loads(proc.stdout);check(exercise.sdk['assertions']>=20,'strict installed SDK retained-birth undo equals independent native pair/traces/audit')
def main():
 a=argparse.ArgumentParser();a.add_argument('--evidence-dir',type=Path,required=True)
 for name in ('runtime','client','output','private-diagnostics'):a.add_argument('--'+name,type=Path,required=True)
 args=a.parse_args();exercise.client=args.client.resolve();files=[*sorted((r.ROOT/'src/sql/security-candidates').glob('*.sql')),Path(__file__),Path(__file__).with_name('hato-cycle-birth-undo-browser-native.mjs'),Path(__file__).with_name('hato-quick-undo-replay.py')]
 files.extend(r.ROOT/'src/utils/hato'/name for name in ('hatoCycleBirthUndoProtocol.ts','hatoCycleProtocol.ts','hatoDeathProtocol.ts','criaAutomatica.ts','alertResponseProtocol.ts'));files.extend(r.ROOT/'src/utils'/name for name in ('hatoCicloManual.ts','calculosHato.ts'));files.extend(r.ROOT/name for name in ('src/utils/hato/hatoCycleBirthUndoBrowserAttempt.ts','src/components/hato/hooks/useCycleBirthUndo.ts','src/components/hato/components/CycleBirthUndoDialog.tsx','src/components/hato/components/EditarEventoDialog.tsx','src/components/hato/HojaDeVida.tsx'));sources={p:p.read_bytes() for p in files};catalog,rls,hashes=r.load(args.evidence_dir.resolve())
 if args.output.resolve().is_relative_to(args.evidence_dir.resolve()) or args.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(args.runtime.resolve(),args.client.resolve(),args.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(p.read_bytes()!=b for p,b in sources.items()):raise ValueError('Changing birth undo source cannot be certified')
 result.update(coordinated_candidate_count=35,admission_rollback_probes=4,sdk_proof=exercise.sdk,source_hashes={str(p.relative_to(r.ROOT)):r.p.digest(b) for p,b in sources.items()},temporary_database_stopped_and_removed=True,limits=['Four private local metadata exports and synthetic private socket only; never production.','Actual browser retained-calf caller/durable adapter verified locally; other cycle batches remain separate. Hosted browser/Auth/Web Locks/storage-loss acceptance remains open. Coarse locks/scans and hosted/capacity acceptance remain open.'])
 args.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
