#!/usr/bin/env python3
"""Actual browser/HTTP/pipeline + retained OCR on contained exact Storage/domain replay."""
import argparse,importlib.util,json,subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('prior_upload_discard',Path(__file__).with_name('hato-photo-telegram-replay.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
c,r,u,lit,js=p.c,p.r,p.u,p.lit,p.js
SOURCE=r.ROOT/'src/sql/security-candidates/hato-upload-discard.sql'
def install(sql):
 p.install(sql);existing=p.p.p.p.query(sql);before=sql(existing);sql(SOURCE.read_text())
 if sql(existing)!=before:raise AssertionError('Discard installation changed existing rows')
 if sql('SELECT(SELECT count(*) FROM hato_upload_discard.requests)+(SELECT count(*) FROM hato_upload_discard.audit);')!='0':raise AssertionError('Discard controls installed nonempty')
def exercise(sql,ctx):
 p.exercise.client=exercise.client;p.exercise(sql,ctx);check,call=ctx['check'],ctx['call'];owner=sql("SELECT id FROM usuarios WHERE email='native-photo@synthetic.invalid';")
 original=json.loads(sql('SELECT intent FROM hato_milk_telegram.requests WHERE owner_id='+u(owner)+" AND state='pending';"))
 for mode in ['resolve','acknowledge']:call('fn_hato_milk_weighing_telegram',[lit(mode),'892211::bigint','892211::bigint','1904::bigint','NULL::jsonb'],actor=None,role='service_role')
 original['cells'].append(dict(original['cells'][0],date='2026-10-14',am=5,pm=6,observed=None))
 call('fn_hato_milk_weighing_telegram',[lit('prepare'),'892211::bigint','892211::bigint','1905::bigint',js(original)],actor=None,role='service_role')
 call('fn_hato_milk_weighing_telegram',[lit('post'),'892211::bigint','892211::bigint','1905::bigint','NULL::jsonb'],actor=None,role='service_role')
 capture=sql("SELECT (intent->>'captureId') FROM hato_milk_telegram.requests WHERE owner_id="+u(owner)+" AND state='committed';");key=c.uid()
 def action(mode,target=None,ok=True):return call('fn_hato_upload_discard_web',[lit(mode),u(key),u(target) if target else 'NULL::uuid',u(owner)],actor=owner,role='authenticated',ok=ok)
 for label,target in [('legacy/unlinked capture',c.uid()),('unknown original OCR',sql("SELECT request_key FROM hato_native_photo_preview.requests WHERE state='held' LIMIT 1;"))]:
  old=sql(p.p.p.p.query(sql));failed=action('prepare',target,False);check(failed.returncode!=0 and sql(p.p.p.p.query(sql))==old,label+' cannot authorize discard')
 before=sql(p.p.p.p.query(sql));prepared=action('prepare',capture);check(prepared['state']=='pending' and sql('SELECT count(*) FROM hato_upload_discard.audit;')=='0','discard preparation retains rows/photos without posting')
 for label,ddl in [('changed milk',"UPDATE hato_pesajes_leche SET litros_am=99,litros_total=103 WHERE id=(SELECT id FROM hato_pesajes_leche WHERE created_by="+u(owner)+" LIMIT 1);"),('revoked Gerencia','UPDATE usuarios SET activo=false WHERE id='+u(owner)+';'),('suppressed delete',"CREATE FUNCTION public.synthetic_discard_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NULL;END$$;CREATE TRIGGER synthetic_discard_fault BEFORE DELETE ON hato_pesajes_leche FOR EACH ROW EXECUTE FUNCTION public.synthetic_discard_fault();"),('second-week suppressed delete',"CREATE FUNCTION public.synthetic_discard_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF OLD.fecha>='2026-10-14'::date THEN RETURN NULL;END IF;RETURN OLD;END$$;CREATE TRIGGER synthetic_discard_fault BEFORE DELETE ON hato_pesajes_leche FOR EACH ROW EXECUTE FUNCTION public.synthetic_discard_fault();"),('suppressed outer audit',"CREATE FUNCTION public.synthetic_discard_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NULL;END$$;CREATE TRIGGER synthetic_discard_fault BEFORE INSERT ON hato_upload_discard.audit FOR EACH ROW EXECUTE FUNCTION public.synthetic_discard_fault();"),('late revocation',"CREATE FUNCTION public.synthetic_discard_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN UPDATE public.usuarios SET activo=false WHERE id="+u(owner)+";RETURN NEW;END$$;CREATE TRIGGER synthetic_discard_fault AFTER INSERT ON hato_upload_discard.audit FOR EACH ROW EXECUTE FUNCTION public.synthetic_discard_fault();")]:
  old=sql(p.p.p.p.query(sql));failed=sql("BEGIN;"+ddl+"SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub',"+lit(owner)+",true);SELECT fn_hato_upload_discard_web('post',"+u(key)+",NULL,"+u(owner)+");COMMIT;",False);check(failed.returncode!=0 and sql(p.p.p.p.query(sql))==old,label+' refuses with complete rollback')
 proc=subprocess.run(['node',str(Path(__file__).with_name('hato-upload-discard-native.mjs'))],input=json.dumps(dict(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),owner=owner,key=key,capture=capture)),text=True,capture_output=True,cwd=r.ROOT,timeout=90)
 if proc.returncode:
  f=Path('/tmp/escocia-upload-discard-sdk-private.log');f.touch(mode=0o600,exist_ok=True);f.write_text(proc.stderr);raise AssertionError('Actual discard caller failed; private diagnostics saved')
 proof=json.loads(proc.stdout);exercise.fixture=proof.pop('fixture');exercise.sdk=proof;check(proof['assertions']>=8,'actual browser original discard recovery retains all raw history')
def main():
 a=argparse.ArgumentParser()
 for name in ('evidence-dir','runtime','client','output','private-diagnostics'):a.add_argument('--'+name,type=Path,required=True)
 x=a.parse_args();exercise.client=x.client.resolve();files=[Path(__file__),SOURCE,r.ROOT/'src/__tests__/subidasPesajeMes.test.tsx',r.ROOT/'src/__tests__/subidasPesajeDescarteSobrescrito.test.ts',Path(__file__).with_name('hato-upload-discard-native.mjs'),r.ROOT/'src/utils/hato/hatoUploadDiscard.ts',r.ROOT/'src/components/hato/hooks/useSubidasPesajeMes.ts',r.ROOT/'src/components/hato/components/SubidasPesajeMes.tsx',*[r.ROOT/k for k in json.loads((r.ROOT/'docs/security-integrity/hato-photo-telegram-replay.json').read_text())['source_hashes']]]
 for root in ['src/supabase/functions/server','supabase/functions/make-server-1ccce916']:
  files.extend(r.ROOT/root/n for n in ['hatoPhotoUploadProtocol.ts','hatoPhotoPreviewProtocol.ts','hato-pesaje-telegram.ts','telegram/milkPhoto.ts','telegram/bot.ts','telegram/conversations/pesajeLeche.ts'])
 files.extend(sorted((r.ROOT/'src/__tests__').glob('hatoPhoto*.test.ts')))
 fixture=r.ROOT/'src/__tests__/fixtures/hatoUploadDiscard.json'
 if fixture.exists():files.append(fixture)
 files.extend(sorted((r.ROOT/'src/__tests__').glob('hatoUploadDiscard*.test.ts*')))
 files=list(dict.fromkeys(files));sources={f:f.read_bytes() for f in files};catalog,rls,storage,t,hashes,admission=p.p.p.p.s.load(x.evidence_dir.resolve());p.p.p.p.install.inputs=(storage,t,rls,catalog)
 if x.output.resolve().is_relative_to(x.evidence_dir.resolve()) or x.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(x.runtime.resolve(),x.client.resolve(),x.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(f.read_bytes()!=v for f,v in sources.items()):raise ValueError('Changing protected discard sources cannot be certified')
 if not fixture.exists():fixture.write_text(json.dumps(exercise.fixture,indent=2)+'\n')
 result.update(coordinated_candidate_count=51,sdk_proof=exercise.sdk,source_hashes={str(f.relative_to(r.ROOT)):r.p.digest(v) for f,v in sources.items()},temporary_database_stopped_and_removed=True,limits=['Six local private exports; synthetic Auth/private Unix PG and intercepted Storage/model bytes only. No hosted/runtime/paid API certification.','Retained-evidence discard SQL/browser cutover; no physical Storage/capture deletion. Direct grants and hosted/runtime/global/capacity/recovery gates remain.'])
 x.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
