#!/usr/bin/env python3
"""Actual browser/HTTP/pipeline + retained OCR on contained exact Storage/domain replay."""
import argparse,importlib.util,json,subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('prior_browser_photo',Path(__file__).with_name('hato-photo-observer-replay.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
c,r,u,lit,js=p.c,p.r,p.u,p.lit,p.js
SOURCE=r.ROOT/'src/sql/security-candidates/hato-photo-preview.sql';FIXTURE=r.ROOT/'src/__tests__/fixtures/hatoPhotoPreview.json'
def install(sql):
 p.install(sql);existing=p.p.query(sql);before=sql(existing);sql(SOURCE.read_text())
 if sql(existing)!=before:raise AssertionError('Preview installation changed existing rows')
 if sql('SELECT(SELECT count(*) FROM hato_photo_preview.requests)+(SELECT count(*) FROM hato_photo_preview.audit);')!='0':raise AssertionError('Preview controls installed nonempty')
def exercise(sql,ctx):
 p.exercise.client=exercise.client;p.exercise(sql,ctx);check,call=ctx['check'],ctx['call'];owner=c.OTHER;animal=c.uid()
 sql('UPDATE usuarios SET activo=true WHERE id='+u(owner)+";INSERT INTO hato_config(clave,valor) VALUES('dia_pesaje_semanal','{\"iso\":3}') ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor;INSERT INTO hato_animales(id,nombre,numero,sexo,etapa,estado,origen,created_by) VALUES("+u(animal)+",'Synthetic browser milk cow',89312,'hembra','vaca','activa','compra',"+u(owner)+');')
 # Reuse verified exact Storage and all48application candidates before new actual caller.
 before=sql(p.p.query(sql))
 for role in ['anon','authenticated']:
  failed=call('fn_hato_photo_preview_service',[lit('recover'),'NULL::uuid',u(owner),'NULL::jsonb'],actor=owner,role=role,ok=False);check(failed.returncode!=0 and sql(p.p.query(sql))==before,role+' cannot enter trusted preview service')
 proc=subprocess.run(['node',str(Path(__file__).with_name('hato-photo-browser-native.mjs'))],input=json.dumps(dict(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),owner=owner,animal=animal,stateQuery=p.p.query(sql))),text=True,capture_output=True,cwd=r.ROOT,timeout=90)
 if proc.returncode:
  f=Path('/tmp/escocia-photo-browser-sdk-private.log');f.touch(mode=0o600,exist_ok=True);f.write_text(proc.stderr);raise AssertionError('Actual browser HTTP replay failed; private diagnostics saved')
 proof=json.loads(proc.stdout);exercise.fixture=proof.pop('fixture');exercise.sdk=proof;check(proof['assertions']>=10,'actual durable browser/handler/pipeline/SDK retains original preview without repeat I/O')
def main():
 a=argparse.ArgumentParser()
 for name in ('evidence-dir','runtime','client','output','private-diagnostics'):a.add_argument('--'+name,type=Path,required=True)
 x=a.parse_args();exercise.client=x.client.resolve();files=[Path(__file__),SOURCE,Path(__file__).with_name('hato-photo-browser-native.mjs'),*[r.ROOT/k for k in json.loads((r.ROOT/'docs/security-integrity/hato-photo-observer-replay.json').read_text())['source_hashes']]]
 for root in ['src/utils/hato','src/supabase/functions/server','supabase/functions/make-server-1ccce916']:
  for name in ['hatoPhotoPreviewProtocol','hatoPhotoBrowserServer','hatoPhotoBrowserAttempt']:
   f=r.ROOT/root/(name+'.ts')
   if f.exists():files.append(f)
 for root in ['src/supabase/functions/server','supabase/functions/make-server-1ccce916']:
  files.extend(r.ROOT/root/n for n in ['hato-pesaje-foto.ts','hato-pesaje-pipeline.ts'])
 files.extend(r.ROOT/n for n in ['src/components/hato/hooks/useSubirPesajeFoto.ts','src/components/hato/components/SubirPesajeFoto.tsx']);files.extend(sorted((r.ROOT/'src/__tests__').glob('hatoPhoto*.test.ts')))
 if FIXTURE.exists():files.append(FIXTURE)
 files=list(dict.fromkeys(files));sources={f:f.read_bytes() for f in files};catalog,rls,storage,t,hashes,admission=p.p.s.load(x.evidence_dir.resolve());p.p.install.inputs=(storage,t,rls,catalog)
 if x.output.resolve().is_relative_to(x.evidence_dir.resolve()) or x.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(x.runtime.resolve(),x.client.resolve(),x.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(f.read_bytes()!=v for f,v in sources.items()):raise ValueError('Changing browser photo sources cannot be certified')
 if not FIXTURE.exists():FIXTURE.write_text(json.dumps(exercise.fixture,indent=2)+'\n')
 result.update(coordinated_candidate_count=49,sdk_proof=exercise.sdk,source_hashes={str(f.relative_to(r.ROOT)):r.p.digest(v) for f,v in sources.items()},temporary_database_stopped_and_removed=True,limits=['Six local private exports; synthetic Auth/private Unix PG and intercepted Storage/model bytes only. No hosted/runtime/paid API certification.','Browser photo cutover only; Telegram upload and legacy discard/direct grants unchanged; global/capacity/recovery gates remain.'])
 x.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
