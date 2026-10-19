#!/usr/bin/env python3
"""Trusted service byte observer/installed SDK on exact local Storage +48candidates."""
import argparse,importlib.util,json,subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('prior_photo_observer',Path(__file__).with_name('hato-photo-upload-replay.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
c,r,u,lit,js=p.c,p.r,p.u,p.lit,p.js
SOURCE=r.ROOT/'src/sql/security-candidates/hato-photo-upload-inspection.sql';FIXTURE=r.ROOT/'src/__tests__/fixtures/hatoPhotoUpload.json'
def install(sql):
 p.install(sql);existing=p.query(sql);before=sql(existing)
 for ddl in ["ALTER FUNCTION public.fn_hato_photo_upload_service(text,uuid,uuid,jsonb) SET search_path=public;","GRANT EXECUTE ON FUNCTION public.fn_hato_photo_upload_service(text,uuid,uuid,jsonb) TO authenticated;"]:
  failed=sql('BEGIN;'+ddl+SOURCE.read_text(),False)
  if failed.returncode==0 or 'Unreviewed' not in failed.stderr or sql(existing)!=before or sql("SELECT to_regprocedure('public.fn_hato_photo_upload_inspect_service(uuid,uuid)') IS NULL;")!='t':raise AssertionError('Observer installation drift rollback')
 sql(SOURCE.read_text())
 if sql(existing)!=before:raise AssertionError('Observer installation changed existing rows')
def exercise(sql,ctx):
 p.exercise(sql,ctx);check,call=ctx['check'],ctx['call'];owner=c.OWNER;key=c.uid();state=lambda:sql(p.query(sql))
 before=state()
 for role in ['anon','authenticated']:
  failed=call('fn_hato_photo_upload_inspect_service',[u(key),u(owner)],actor=owner,role=role,ok=False);check(failed.returncode!=0 and state()==before,role+' cannot inspect service Storage originals')
 failed=call('fn_hato_photo_upload_inspect_service',[u(key),u(owner)],actor=None,role='service_role',ok=False);check(failed.returncode!=0 and state()==before,'unknown inspection refuses without mutation')
 proc=subprocess.run(['node',str(Path(__file__).with_name('hato-photo-observer-native.mjs'))],input=json.dumps(dict(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),owner=owner)),text=True,capture_output=True,cwd=r.ROOT,timeout=90)
 if proc.returncode:
  f=Path('/tmp/escocia-photo-observer-sdk-private.log');f.touch(mode=0o600,exist_ok=True);f.write_text(proc.stderr);raise AssertionError('Actual observer SDK failed; private diagnostics saved')
 proof=json.loads(proc.stdout);exercise.fixture=proof.pop('fixture');exercise.sdk=proof;check(proof['assertions']>=20,'actual installed service SDK validates bytes/receipts and preserves original no-resend outcomes')
def main():
 parser=argparse.ArgumentParser()
 for name in ('evidence-dir','runtime','client','output','private-diagnostics'):parser.add_argument('--'+name,type=Path,required=True)
 a=parser.parse_args();exercise.client=a.client.resolve();files=[Path(__file__),SOURCE,Path(__file__).with_name('hato-photo-observer-native.mjs'),*[r.ROOT/k for k in json.loads((r.ROOT/'docs/security-integrity/hato-photo-upload-replay.json').read_text())['source_hashes']]]
 for root in ['src/utils/hato','src/supabase/functions/server','supabase/functions/make-server-1ccce916']:
  files.extend(r.ROOT/root/(name+'.ts') for name in ['hatoPhotoBytes','hatoPhotoUploadProtocol','hatoPhotoUploadService'])
 files.extend(sorted((r.ROOT/'src/__tests__').glob('hatoPhoto*.test.ts')))
 if FIXTURE.exists():files.append(FIXTURE)
 files=list(dict.fromkeys(files));sources={f:f.read_bytes() for f in files};catalog,rls,storage,t,hashes,admission=p.s.load(a.evidence_dir.resolve());p.install.inputs=(storage,t,rls,catalog)
 if a.output.resolve().is_relative_to(a.evidence_dir.resolve()) or a.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(a.runtime.resolve(),a.client.resolve(),a.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(f.read_bytes()!=v for f,v in sources.items()):raise ValueError('Changing photo observer sources cannot be certified')
 if not FIXTURE.exists():FIXTURE.write_text(json.dumps(exercise.fixture,indent=2)+'\n')
 result.update(coordinated_candidate_count=48,storage_baseline=p.install.baseline,admission_rollback_probes=6,sdk_proof=exercise.sdk,source_hashes={str(f.relative_to(r.ROOT)):r.p.digest(v) for f,v in sources.items()},temporary_database_stopped_and_removed=True,limits=['Six local private exports/synthetic Auth and intercepted SDK Storage byte map only. No hosted Storage/API/physical byte certification.','Prepared server service adapter and inspector only. Actual HTTP/browser/Telegram/OCR/discard callers and existing grants unchanged; legacy provenance unknown.'])
 a.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
