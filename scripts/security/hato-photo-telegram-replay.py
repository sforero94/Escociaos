#!/usr/bin/env python3
"""Actual browser/HTTP/pipeline + retained OCR on contained exact Storage/domain replay."""
import argparse,importlib.util,json,subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('prior_native_photo',Path(__file__).with_name('hato-photo-browser-replay.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
c,r,u,lit,js=p.c,p.r,p.u,p.lit,p.js
SOURCE=r.ROOT/'src/sql/security-candidates/hato-photo-telegram.sql'
def install(sql):
 p.install(sql);existing=p.p.p.query(sql);before=sql(existing);sql(SOURCE.read_text())
 if sql(existing)!=before:raise AssertionError('Native photo installation changed existing rows')
 if sql('SELECT(SELECT count(*) FROM hato_native_photo_upload.requests)+(SELECT count(*) FROM hato_native_photo_upload.audit)+(SELECT count(*) FROM hato_native_photo_upload.actions)+(SELECT count(*) FROM hato_native_photo_preview.requests)+(SELECT count(*) FROM hato_native_photo_preview.audit);')!='0':raise AssertionError('Native photo controls installed nonempty')
def exercise(sql,ctx):
 p.exercise.client=exercise.client;p.exercise(sql,ctx);check,call=ctx['check'],ctx['call'];owner,reg=c.uid(),c.uid();sender=892211
 sql("INSERT INTO auth.users VALUES("+u(owner)+");INSERT INTO usuarios(id,email,rol,activo) VALUES("+u(owner)+",'native-photo@synthetic.invalid','Gerencia',true);INSERT INTO telegram_usuarios(id,telegram_id,nombre_display,activo,modulos_permitidos,usuario_id) VALUES("+u(reg)+","+str(sender)+",'Synthetic native photo',true,ARRAY['hato_produccion'],"+u(owner)+');')
 animal=sql("SELECT id FROM hato_animales WHERE nombre='Synthetic browser milk cow';")
 state=p.p.p.query(sql);before=sql(state)
 for role in ['anon','authenticated']:
  failed=call('fn_hato_photo_telegram',[lit('preview'),lit('status'),str(sender)+'::bigint',str(sender)+'::bigint','1901::bigint','NULL::jsonb'],actor=owner,role=role,ok=False);check(failed.returncode!=0 and sql(state)==before,role+' cannot enter native photo service')
 for name,args in [('fn_hato_native_photo_upload_service',[lit('status'),u(c.uid()),u(owner),'NULL::jsonb']),('fn_hato_native_photo_preview_service',[lit('status'),u(c.uid()),u(owner),'NULL::jsonb'])]:
  failed=call(name,args,actor=None,role='service_role',ok=False);check(failed.returncode!=0 and sql(state)==before,'service cannot bypass original native wrapper: '+name)
 proc=subprocess.run(['node',str(Path(__file__).with_name('hato-photo-telegram-native.mjs'))],input=json.dumps(dict(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),owner=owner,other=c.OTHER,animal=animal,sender=sender,stateQuery=state)),text=True,capture_output=True,cwd=r.ROOT,timeout=90)
 if proc.returncode:
  f=Path('/tmp/escocia-photo-telegram-sdk-private.log');f.touch(mode=0o600,exist_ok=True);f.write_text(proc.stderr);raise AssertionError('Actual native photo replay failed; private diagnostics saved')
 exercise.sdk=json.loads(proc.stdout);check(exercise.sdk['assertions']>=15,'actual native photo original recovery and prepared milk handoff')
def main():
 a=argparse.ArgumentParser()
 for name in ('evidence-dir','runtime','client','output','private-diagnostics'):a.add_argument('--'+name,type=Path,required=True)
 x=a.parse_args();exercise.client=x.client.resolve();files=[Path(__file__),SOURCE,Path(__file__).with_name('hato-photo-telegram-native.mjs'),*[r.ROOT/k for k in json.loads((r.ROOT/'docs/security-integrity/hato-photo-browser-replay.json').read_text())['source_hashes']]]
 for root in ['src/supabase/functions/server','supabase/functions/make-server-1ccce916']:
  files.extend(r.ROOT/root/n for n in ['hatoPhotoUploadProtocol.ts','hatoPhotoPreviewProtocol.ts','hato-pesaje-telegram.ts','telegram/milkPhoto.ts','telegram/bot.ts','telegram/conversations/pesajeLeche.ts'])
 files.extend(sorted((r.ROOT/'src/__tests__').glob('hatoPhoto*.test.ts')))
 files=list(dict.fromkeys(files));sources={f:f.read_bytes() for f in files};catalog,rls,storage,t,hashes,admission=p.p.p.s.load(x.evidence_dir.resolve());p.p.p.install.inputs=(storage,t,rls,catalog)
 if x.output.resolve().is_relative_to(x.evidence_dir.resolve()) or x.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(x.runtime.resolve(),x.client.resolve(),x.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(f.read_bytes()!=v for f,v in sources.items()):raise ValueError('Changing browser photo sources cannot be certified')
 result.update(coordinated_candidate_count=50,sdk_proof=exercise.sdk,source_hashes={str(f.relative_to(r.ROOT)):r.p.digest(v) for f,v in sources.items()},temporary_database_stopped_and_removed=True,limits=['Six local private exports; synthetic Auth/private Unix PG and intercepted Storage/model bytes only. No hosted/runtime/paid API certification.','Browser/native Telegram photo cutover; legacy discard/direct grants unchanged; global/capacity/recovery gates remain.'])
 x.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
