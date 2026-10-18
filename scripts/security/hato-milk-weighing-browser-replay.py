#!/usr/bin/env python3
"""Actual browser milk caller/capture replay. Four private local exports only."""
import argparse,importlib.util,json,subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('prior_milk_browser',Path(__file__).with_name('hato-milk-weighing-replay.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
c,r,u,lit,js=p.c,p.r,p.u,p.lit,p.js
SOURCE=r.ROOT/'src/sql/security-candidates/hato-milk-weighing-browser.sql'
FIXTURE=r.ROOT/'src/__tests__/fixtures/hatoMilkWeighing.json'
def install(sql):
 p.install(sql);existing=p.query(sql);before=sql(existing)
 for ddl in ['ALTER FUNCTION fn_hato_milk_weighing_web(text,uuid,jsonb,uuid) SET search_path=public;','ALTER FUNCTION hato_milk_weighing.validate(jsonb) SET search_path=public;']:
  failed=sql('BEGIN;'+ddl+SOURCE.read_text(),False)
  if failed.returncode==0 or 'Unreviewed browser milk foundation' not in failed.stderr or sql(existing)!=before:raise AssertionError('Browser milk admission rollback')
 sql(SOURCE.read_text())
 if sql(existing)!=before:raise AssertionError('Browser milk installation changed rows')
def exercise(sql,ctx):
 p.exercise(sql,ctx);check,call=ctx['check'],ctx['call'];state=lambda:sql(p.query(sql));owner=c.OWNER;animal,existing,capture=[c.uid() for _ in range(3)]
 sql('INSERT INTO hato_animales(id,nombre,numero,sexo,etapa,estado,origen,created_by) VALUES('+u(animal)+",'Synthetic actual browser milk cow',88991,'hembra','vaca','activa','compra',"+u(owner)+');INSERT INTO hato_pesajes_leche(id,animal_id,fecha,litros_am,litros_pm,litros_total,fuente,created_by) VALUES('+u(existing)+','+u(animal)+",'2026-10-07',1,1,2,'historico',"+u(owner)+');INSERT INTO hato_capturas_foto(id,tipo,origen,desenlace,anio,mes,created_by,fotos_recibidas,storage_bucket,storage_prefijo) VALUES('+u(capture)+",'pesaje','web','pendiente',2026,10,"+u(owner)+",1,'hato-pesajes-fotos','synthetic-browser');")
 args=dict(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),owner=owner,animal=animal,capture=capture,stateQuery=p.query(sql).removesuffix(';')+' AS jsonb_object_agg;',goldenFixtures=json.loads(FIXTURE.read_text()) if FIXTURE.exists() else [])
 proc=subprocess.run(['node',str(Path(__file__).with_name('hato-milk-weighing-browser-native.mjs'))],input=json.dumps(args),text=True,capture_output=True,cwd=r.ROOT,timeout=90)
 if proc.returncode:
  f=Path('/tmp/escocia-milk-browser-sdk-private.log');f.touch(mode=0o600,exist_ok=True);f.write_text(proc.stderr);raise AssertionError('Actual milk browser SDK failed; private diagnostic saved')
 proof=json.loads(proc.stdout);exercise.fixtures=proof.pop('fixtures');exercise.sdk=proof;check(proof['assertions']>=24,'actual browser manual/photo installed SDK original recovery independently equals native row/audit/capture proof')
 second=c.uid();sql('INSERT INTO hato_capturas_foto(id,tipo,origen,desenlace,anio,mes,created_by,fotos_recibidas,storage_bucket,storage_prefijo) VALUES('+u(second)+",'pesaje','web','pendiente',2026,10,"+u(owner)+",1,'hato-pesajes-fotos','synthetic-browser');");key=c.uid();intent=dict(version=1,year=2026,month=10,captureId=second,cells=[dict(animalId=animal,date='2026-10-28',am=1,pm=2,observed=None)])
 before=state();failed=sql('BEGIN;UPDATE hato_capturas_foto SET created_by='+u(c.OTHER)+' WHERE id='+u(second)+';SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(owner)+';SELECT fn_hato_milk_weighing_web(\'prepare\','+u(key)+','+js(intent)+','+u(owner)+');COMMIT;',False);check(failed.returncode!=0 and state()==before,'another owner photo cannot be adopted at preparation')
 call('fn_hato_milk_weighing_web',[lit('prepare'),u(key),js(intent),u(owner)],actor=owner)
 for label,ddl in [('capture source drift','UPDATE hato_capturas_foto SET detalle=\'Changed\' WHERE id='+u(second)+';'),('suppressed photo outcome',"CREATE FUNCTION public.synthetic_milk_capture_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NULL;END$$;CREATE TRIGGER synthetic_milk_capture_fault BEFORE UPDATE ON hato_capturas_foto FOR EACH ROW EXECUTE FUNCTION public.synthetic_milk_capture_fault();"),('mutated photo outcome',"CREATE FUNCTION public.synthetic_milk_capture_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.filas_escritas=77;RETURN NEW;END$$;CREATE TRIGGER synthetic_milk_capture_fault BEFORE UPDATE ON hato_capturas_foto FOR EACH ROW EXECUTE FUNCTION public.synthetic_milk_capture_fault();")]:
  before=state();failed=sql('BEGIN;'+ddl+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(owner)+";SELECT fn_hato_milk_weighing_web('post',"+u(key)+',NULL,'+u(owner)+');COMMIT;',False);check(failed.returncode!=0 and state()==before,label+' rolls back rows/corrections/operation/capture')
 posted=call('fn_hato_milk_weighing_web',[lit('post'),u(key),'NULL::jsonb',u(owner)],actor=owner);check(posted['state']=='committed' and posted['receipt']['capture']['after']['desenlace']=='ok','same original photo action commits after known rollback without replacement')
 for role in ['anon','service_role']:
  before=state();failed=sql('BEGIN;SET LOCAL ROLE '+role+';SELECT fn_hato_milk_weighing_source_web('+u(owner)+');COMMIT;',False);check(failed.returncode!=0 and state()==before,role+' protected browser source entry denied')
def main():
 parser=argparse.ArgumentParser()
 for name in ('evidence-dir','runtime','client','output','private-diagnostics'):parser.add_argument('--'+name,type=Path,required=True)
 a=parser.parse_args();exercise.client=a.client.resolve();files=[Path(__file__),SOURCE,Path(__file__).with_name('hato-milk-weighing-browser-native.mjs'),*[r.ROOT/k for k in json.loads((r.ROOT/'docs/security-integrity/hato-milk-weighing-replay.json').read_text())['source_hashes']],r.ROOT/'src/utils/hato/hatoMilkWeighingProtocol.ts',r.ROOT/'src/utils/hato/hatoMilkWeighingBrowserAttempt.ts',r.ROOT/'src/components/hato/hooks/useMilkWeighing.ts',r.ROOT/'src/components/hato/hooks/useSubirPesajeFoto.ts',r.ROOT/'src/components/hato/components/SubirPesajeFoto.tsx',r.ROOT/'src/components/hato/components/MilkWeighingConfirmationPanel.tsx',*sorted((r.ROOT/'src/__tests__').glob('hatoMilkWeighing*.test.tsx'))];files=list(dict.fromkeys(files+([FIXTURE] if FIXTURE.exists() else [])));sources={f:f.read_bytes() for f in files};catalog,rls,hashes=r.load(a.evidence_dir.resolve())
 if a.output.resolve().is_relative_to(a.evidence_dir.resolve()) or a.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(a.runtime.resolve(),a.client.resolve(),a.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(f.read_bytes()!=v for f,v in sources.items()):raise ValueError('Changing browser milk sources cannot be certified')
 if not FIXTURE.exists():FIXTURE.write_text(json.dumps(exercise.fixtures,indent=2)+'\n')
 result.update(coordinated_candidate_count=44,admission_rollback_probes=2,sdk_proof=exercise.sdk,source_hashes={str(f.relative_to(r.ROOT)):r.p.digest(v) for f,v in sources.items()},temporary_database_stopped_and_removed=True,limits=['Four private metadata exports/synthetic Auth/private socket/Web Locks stub only; no hosted SDK/Auth/Storage/browser/runtime certification.','Actual browser photo/manual cutover only; native Telegram/week edit/discard/financial/backfill writers and direct grants unchanged. No production.'])
 a.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
