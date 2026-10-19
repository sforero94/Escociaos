#!/usr/bin/env python3
"""Actual browser/HTTP/pipeline + retained OCR on contained exact Storage/domain replay."""
import argparse,importlib.util,json,subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('prior_upload_history',Path(__file__).with_name('hato-upload-discard-replay.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
c,r,u,lit,js=p.c,p.r,p.u,p.lit,p.js
SOURCE=r.ROOT/'src/sql/security-candidates/hato-upload-history.sql'
def query(sql):return p.p.p.p.p.query(sql)
def install(sql):
 p.install(sql);existing=query(sql);before=sql(existing);sql(SOURCE.read_text())
 if sql(existing)!=before:raise AssertionError('History installation changed existing rows')
def exercise(sql,ctx):
 p.exercise.client=exercise.client;p.exercise(sql,ctx);check,call=ctx['check'],ctx['call'];owner=sql("SELECT id FROM usuarios WHERE email='native-photo@synthetic.invalid';");capture=sql("SELECT capture_id FROM hato_upload_discard.requests WHERE state='committed';")
 before=sql(query(sql))
 for role in ['anon','service_role']:
  failed=call('fn_hato_upload_discard_history_web',['2026','10',u(owner)],actor=owner,role=role,ok=False);check(failed.returncode!=0 and sql(query(sql))==before,role+' cannot enter history reader')
 for label,ddl,actor in [('inactive reader','UPDATE usuarios SET activo=false WHERE id='+u(owner)+';',owner),('missing profile','',c.uid()),('wrong expected owner','',c.OWNER),('changed capture reader policy',"ALTER POLICY hato_capturas_foto_select_authenticated ON hato_capturas_foto USING(false);",owner),('changed proof writer config',"ALTER FUNCTION public.fn_hato_upload_discard_web(text,uuid,uuid,uuid) SET search_path=public;",owner)]:
  old=sql(query(sql));failed=sql("BEGIN;"+ddl+"SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub',"+lit(actor)+",true);SELECT fn_hato_upload_discard_history_web(2026,10,"+u(owner if label!='missing profile' else actor)+");COMMIT;",False);check(failed.returncode!=0 and sql(query(sql))==old,label+' refuses without state change')
 reader=c.uid();sql('INSERT INTO auth.users VALUES('+u(reader)+');INSERT INTO usuarios(id,email,rol,activo) VALUES('+u(reader)+",'history-reader@synthetic.invalid','Verificador',true);")
 visible=call('fn_hato_upload_discard_history_web',['2026','10',u(reader)],actor=reader,role='authenticated');check(len(visible['entries'])==1 and list(visible['entries'][0].keys())!=[],'active ordinary capture reader sees only bounded disposition metadata')
 sql("INSERT INTO hato_capturas_foto(tipo,origen,desenlace,anio,mes,created_by,fotos_recibidas,storage_ok,storage_bucket,storage_prefijo) SELECT 'pesaje','web','pendiente',2026,10,"+u(owner)+",1,false,'hato-pesajes-fotos','synthetic-legacy-'||generate_series::text FROM generate_series(1,1001);")
 count=int(sql("SELECT count(*) FROM hato_capturas_foto WHERE tipo='pesaje' AND anio=2026 AND mes=10;"))
 proc=subprocess.run(['node',str(Path(__file__).with_name('hato-upload-history-native.mjs'))],input=json.dumps(dict(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),owner=owner,capture=capture,captureCount=count,stateQuery=query(sql))),text=True,capture_output=True,cwd=r.ROOT,timeout=90)
 if proc.returncode:
  f=Path('/tmp/escocia-upload-history-sdk-private.log');f.touch(mode=0o600,exist_ok=True);f.write_text(proc.stderr);raise AssertionError('Actual history caller failed; private diagnostics saved')
 proof=json.loads(proc.stdout);exercise.fixture=proof.pop('fixture');exercise.sdk=proof;check(proof['assertions']>=7,'actual history caller pagination/current-owner/disposition proof')
def main():
 a=argparse.ArgumentParser()
 for name in ('evidence-dir','runtime','client','output','private-diagnostics'):a.add_argument('--'+name,type=Path,required=True)
 x=a.parse_args();exercise.client=x.client.resolve();files=[Path(__file__),SOURCE,Path(__file__).with_name('hato-upload-history-native.mjs'),r.ROOT/'scripts/security/hato-upload-writer-inventory.mjs',r.ROOT/'src/utils/hato/hatoUploadHistory.ts',r.ROOT/'src/utils/supabase/fetchAll.ts',*[r.ROOT/k for k in json.loads((r.ROOT/'docs/security-integrity/hato-upload-discard-replay.json').read_text())['source_hashes']]]
 files.extend(sorted((r.ROOT/'src/__tests__').glob('hatoUploadHistory*.test.ts*')))
 files=list(dict.fromkeys(files));sources={f:f.read_bytes() for f in files};catalog,rls,storage,t,hashes,admission=p.p.p.p.p.s.load(x.evidence_dir.resolve());p.p.p.p.p.install.inputs=(storage,t,rls,catalog)
 if x.output.resolve().is_relative_to(x.evidence_dir.resolve()) or x.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(x.runtime.resolve(),x.client.resolve(),x.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(f.read_bytes()!=v for f,v in sources.items()):raise ValueError('Changing upload history sources cannot be certified')
 result.update(coordinated_candidate_count=52,sdk_proof=exercise.sdk,source_hashes={str(f.relative_to(r.ROOT)):r.p.digest(v) for f,v in sources.items()},temporary_database_stopped_and_removed=True,limits=['Six local private exports; synthetic Auth/private Unix PG and intercepted Storage/model bytes only. No hosted/runtime/paid API certification.','Authoritative retained-discard history read/browser cutover plus bounded writer inventory; no retirement or physical deletion. Direct grants and hosted/runtime/global/capacity/recovery gates remain.'])
 x.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
