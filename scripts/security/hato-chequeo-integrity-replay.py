#!/usr/bin/env python3
"""Coordinated chequeo replacement on four local private exports only."""
import argparse,concurrent.futures,importlib.util,json,subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('prior',Path(__file__).with_name('hato-catalog-edit-replay.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
c,r,u,lit,js=p.c,p.r,p.u,p.lit,p.js
SOURCE=r.ROOT/'src/sql/security-candidates/hato-chequeo-integrity.sql'
def install(sql):
 p.install(sql);existing=p.p.query(sql);before=sql(existing)
 for ddl,marker in [("ALTER TABLE hato_chequeo_vacas ADD COLUMN synthetic_unreviewed text;",'source graph'),("ALTER TABLE hato_eventos FORCE ROW LEVEL SECURITY;",'source graph')]:
  failed=sql('BEGIN;'+ddl+SOURCE.read_text(),False)
  if failed.returncode==0 or marker not in failed.stderr or sql(existing)!=before:raise AssertionError('Chequeo installation drift rollback '+marker)
 sql(SOURCE.read_text())
 if sql(existing)!=before:raise AssertionError('Chequeo installation changed existing rows')
def exercise(sql,ctx):
 check=ctx['check'];owner=c.OWNER;mother,calf,header,detail,event,manual=[c.uid() for _ in range(6)];day='2026-10-10'
 sql('INSERT INTO hato_animales(id,nombre,sexo,etapa,estado,origen,created_by) VALUES('+u(mother)+",'Synthetic mother','hembra','vaca','activa','compra',"+u(owner)+');INSERT INTO hato_animales(id,nombre,sexo,etapa,estado,origen,madre_id,fecha_nacimiento,created_by) VALUES('+u(calf)+",'Synthetic original calf','hembra','ternera','activa','nacimiento',"+u(mother)+",'2026-10-01',"+u(owner)+');INSERT INTO hato_chequeos(id,fecha,estado,fuente,created_by) VALUES('+u(header)+','+lit(day)+",'cerrado','web',"+u(owner)+');INSERT INTO hato_chequeo_vacas(id,chequeo_id,animal_id) VALUES('+u(detail)+','+u(header)+','+u(mother)+');INSERT INTO hato_eventos(id,animal_id,tipo,fecha,fecha_confianza,cria_destino,cria_id,chequeo_vaca_id,fuente,created_by) VALUES('+u(event)+','+u(mother)+",'parto','2026-10-01','exacta','retenida',"+u(calf)+','+u(detail)+",'chequeo',"+u(owner)+');INSERT INTO hato_eventos(id,animal_id,tipo,fecha,fecha_confianza,fuente,created_by) VALUES('+u(manual)+','+u(mother)+",'celo','2026-10-02','exacta','web',"+u(owner)+');')
 state=lambda:sql(p.p.query(sql))
 def service(fn,args,ok=True):return sql('SET ROLE service_role;SELECT '+fn+'('+','.join(args)+');',ok)
 def source():return json.loads(service('fn_hato_chequeo_source_service',[u(owner)]))
 key=c.uid();intent=dict(version=1,archivo='Synthetic reviewed input',chequeo=dict(fecha=day,veterinario=None),filas=[dict(fila=1,numero=123)])
 payload=dict(chequeo=dict(fecha=day,veterinario=None),vacas=[dict(animal_id=mother,normalizacion_issues=[])],eventos=[dict(vaca_index=0,tipo='parto',fecha='2026-10-01',fecha_confianza='exacta',toro_nombre=None,tipo_servicio=None,cria_destino='retenida',sx_raw=None,datos=None),dict(vaca_index=0,tipo='servicio',fecha='2026-10-05',fecha_confianza='exacta',toro_nombre='New atomic chequeo bull',tipo_servicio='monta',cria_destino=None,sx_raw=None,datos=None)])
 def prepare(k=key,payload_value=payload,original=None):return json.loads(service('fn_hato_chequeo_prepare_service',[u(owner),u(k),js(intent),js(original if original is not None else source()),js(payload_value)]))
 def action(mode,k=key,actor=owner,ok=True):return ctx['call']('fn_hato_chequeo_web',[lit(mode),u(k),u(actor)],actor=actor,ok=ok)
 before=state();original=source();check(state()==before,'service source snapshot is read only')
 for label,changed in [('omitted',dict(payload,eventos=payload['eventos'][1:])),('changed',dict(payload,eventos=[dict(payload['eventos'][0],fecha='2026-10-02')]))]:
  failed=service('fn_hato_chequeo_prepare_service',[u(owner),u(c.uid()),js(intent),js(original),js(changed)],False);check(failed.returncode!=0 and 'Santiago review' in failed.stderr and state()==before,label+' linked birth refuses full prepare without bull/domain/control mutation')
 prepared=prepare(original=original);check(prepared['state']=='pending' and prepared['plan']['events'][0]['id']==event and prepared['plan']['events'][0]['cria_id']==calf,'prepared linked birth keeps exact original UUID and calf link')
 check(len(prepared['plan']['bulls'])==1 and sql("SELECT count(*)=0 FROM hato_toros WHERE nombre='New atomic chequeo bull';")=='t','bull reserved in plan without pre-RPC creation')
 def refuse(label,ddl,marker):
  before=state();failed=sql('BEGIN;'+ddl+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(owner)+";SELECT fn_hato_chequeo_web('post',"+u(key)+','+u(owner)+');COMMIT;',False)
  if failed.returncode==0 or marker.lower() not in failed.stderr.lower() or state()!=before:
   f=Path('/tmp/escocia-chequeo-integrity-unexpected-private.log');f.touch(mode=0o600,exist_ok=True);f.write_text(failed.stderr);raise AssertionError(label+' rollback/marker mismatch')
  check(True,label+' refuses/rolls back complete state')
 refuse('competing calf edit','UPDATE hato_animales SET nombre=\'Competing calf\' WHERE id='+u(calf)+';','source/day')
 refuse('competing same-count detail edit','UPDATE hato_chequeo_vacas SET toro=\'Changed\' WHERE id='+u(detail)+';','source/day')
 refuse('inactive actor','UPDATE usuarios SET activo=false WHERE id='+u(owner)+';','active')
 for table,op,body,marker in [('public.hato_toros','BEFORE INSERT','RETURN NULL;','bull suppressed'),('public.hato_chequeo_vacas','BEFORE INSERT','RETURN NULL;','detail insert suppressed'),('public.hato_eventos','BEFORE UPDATE','RETURN NULL;','reassociation suppressed'),('hato_chequeo_integrity.audit','BEFORE INSERT','RETURN NULL;','operation audit suppressed'),('hato_chequeo_integrity.requests','BEFORE UPDATE','RETURN NULL;','committed control suppressed'),('public.hato_chequeos','BEFORE DELETE','RETURN NULL;','staging cleanup suppressed')]:
  refuse(table+' '+op,'CREATE FUNCTION public.synthetic_chequeo_fault() RETURNS trigger LANGUAGE plpgsql AS $fault$ BEGIN '+body+' END $fault$;CREATE TRIGGER synthetic_chequeo_fault '+op+' ON '+table+' FOR EACH ROW EXECUTE FUNCTION public.synthetic_chequeo_fault();',marker)
 before=json.loads(state())
 with concurrent.futures.ThreadPoolExecutor(2) as pool:
  a=pool.submit(action,'post');b=pool.submit(action,'post');posted=a.result();check(posted==b.result(),'concurrent same-key posts return one exact chequeo receipt')
 after=json.loads(state());allowed={'public.hato_chequeos','public.hato_chequeo_vacas','public.hato_eventos','public.hato_toros','public.hato_correcciones','hato_chequeo_integrity.requests','hato_chequeo_integrity.audit'}
 check(all(v==after[k] for k,v in before.items() if k not in allowed),'all calves/manual financial backup and unrelated private rows preserved')
 actual_birth=json.loads(sql('SELECT to_jsonb(t) FROM hato_eventos t WHERE id='+u(event)+';'));old_birth=next(x for x in original['events'] if x['id']==event)
 check({k:v for k,v in actual_birth.items() if k!='chequeo_vaca_id'}=={k:v for k,v in old_birth.items() if k!='chequeo_vaca_id'} and actual_birth['chequeo_vaca_id']!=detail,'original linked birth changes only association to new detail')
 check(sql('SELECT NOT EXISTS(SELECT 1 FROM hato_chequeos WHERE id='+u(prepared['plan']['stagingHeaderId'])+');')=='t','temporary header removed before commit')
 audit=json.loads(sql('SELECT receipt FROM hato_chequeo_integrity.audit WHERE request_key='+u(key)+';'));check(audit==posted['receipt'] and audit['actor']==dict(origin='web',profileId=owner),'independent immutable operation audit equals receipt/current actor')
 before=state();check(action('post')==posted and action('status')==posted and state()==before,'lost-response original retry does not replace detail/events/bulls again')
 recovered=ctx['call']('fn_hato_chequeo_recover_web',[u(owner)],actor=owner);check(recovered==posted,'independent owner recovery returns original committed chequeo')
 acknowledged=action('acknowledge');check(acknowledged['acknowledged'] and acknowledged['receipt']==audit,'verified terminal acknowledgment preserves immutable audit')
 proc=subprocess.run(['node',str(Path(__file__).with_name('hato-chequeo-integrity-native.mjs'))],input=json.dumps(dict(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),owner=owner,stateQuery=p.p.query(sql),fixture=str(r.ROOT/'src/__tests__/fixtures/hatoChequeo.json'))),text=True,capture_output=True,cwd=r.ROOT,timeout=90)
 if proc.returncode:
  f=Path('/tmp/escocia-chequeo-integrity-sdk-private.log');f.touch(mode=0o600,exist_ok=True);f.write_text(proc.stderr);raise AssertionError('Actual chequeo handler/SDK proof failed; private diagnostics saved')
 exercise.sdk=json.loads(proc.stdout);check(exercise.sdk['assertions']>=12,'actual handler/builder/strict SDK/durable adapter native proof')
 exercise.proof=dict(linked_birth_preserved=True,calves_untouched=True,atomic_bull=True,same_key_single_commit=True,temporary_header_removed=True)
def main():
 parser=argparse.ArgumentParser()
 for name in ('evidence-dir','runtime','client','output','private-diagnostics'):parser.add_argument('--'+name,type=Path,required=True)
 a=parser.parse_args();exercise.client=a.client.resolve();files=[Path(__file__),SOURCE,*[r.ROOT/k for k in json.loads((r.ROOT/'docs/security-integrity/hato-catalog-edit-replay.json').read_text())['source_hashes']]];files.extend([*sorted((r.ROOT/'src/utils/importHato').glob('*.ts')),*sorted((r.ROOT/'src/supabase/functions/server/importHato').glob('*.ts')),*sorted((r.ROOT/'supabase/functions/make-server-1ccce916/importHato').glob('*.ts')),r.ROOT/'src/utils/hato/hatoChequeoBrowserAttempt.ts',r.ROOT/'src/components/hato/hooks/useChequeo.ts',r.ROOT/'src/components/hato/hooks/useSubirChequeoExcel.ts',r.ROOT/'src/components/hato/components/ChequeoConfirmationPanel.tsx',r.ROOT/'src/components/hato/components/SubirChequeoExcel.tsx',r.ROOT/'src/supabase/functions/server/hato-chequeo-commit.ts',r.ROOT/'supabase/functions/make-server-1ccce916/hato-chequeo-commit.ts',r.ROOT/'docs/hato/regenerar-copias-importhato.py',Path(__file__).with_name('hato-chequeo-integrity-native.mjs')]);fixture=r.ROOT/'src/__tests__/fixtures/hatoChequeo.json';files.extend([fixture] if fixture.exists() else []);files.extend([r.ROOT/'src/__tests__/hatoChequeoPrepared.test.tsx',r.ROOT/'src/__tests__/hatoCapturasFoto.test.ts',r.ROOT/'src/__tests__/hatoChequeoHistoricoPaginadoGuard.test.ts',r.ROOT/'src/utils/calculosHato.ts',r.ROOT/'src/utils/hatoConfigDesdeTabla.ts',r.ROOT/'src/supabase/functions/server/calculos-hato.ts',r.ROOT/'src/supabase/functions/server/hato-config-desde-tabla.ts',r.ROOT/'src/supabase/functions/server/perfilAplicacionActivo.ts',r.ROOT/'supabase/functions/make-server-1ccce916/calculos-hato.ts',r.ROOT/'supabase/functions/make-server-1ccce916/hato-config-desde-tabla.ts',r.ROOT/'supabase/functions/make-server-1ccce916/perfilAplicacionActivo.ts']);files=list(dict.fromkeys(files));sources={f:f.read_bytes() for f in files};catalog,rls,hashes=r.load(a.evidence_dir.resolve())
 if a.output.resolve().is_relative_to(a.evidence_dir.resolve()) or a.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(a.runtime.resolve(),a.client.resolve(),a.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(f.read_bytes()!=v for f,v in sources.items()):raise ValueError('Changing chequeo source cannot be certified')
 result.update(coordinated_candidate_count=40,admission_rollback_probes=2,proof=exercise.proof,sdk_proof=exercise.sdk,source_hashes={str(f.relative_to(r.ROOT)):r.p.digest(v) for f,v in sources.items()},temporary_database_stopped_and_removed=True,limits=['Local synthetic Auth/service role/private socket; four private metadata exports only; never production.','Actual prepared import caller/builder/strict SDK/durable recovery validated locally; direct grants/legacy RPC remain separate retirement gates. Synthetic Auth and Web Locks stub, not hosted parity or capacity/recovery certification.'])
 a.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
