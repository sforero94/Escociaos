#!/usr/bin/env python3
"""Prospective photo upload control on exact Storage +46candidates; local only."""
import argparse,concurrent.futures,importlib.util,json
from pathlib import Path

def module(name,file):
 spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
p=module('prior_photo_week','hato-milk-week-replay.py');s=module('photo_storage','storage-schema-replay.py')
c,r,u,lit,js=p.c,p.r,p.u,p.lit,p.js
SOURCE=r.ROOT/'src/sql/security-candidates/hato-photo-upload.sql';BASELINE=Path(__file__).with_name('hato-photo-upload-baseline.sql')
def query(sql):
 return 'SELECT ('+p.query(sql).removesuffix(';')+")||jsonb_build_object('photo_controls',hato_photo_upload.controls(),'storage',hato_photo_upload.storage_rows());"
def install(sql):
 p.install(sql);existing=p.query(sql);before=sql(existing);s.install(*install.inputs,sql)
 if sql(existing)!=before:raise AssertionError('Storage installation changed existing rows')
 baseline=s.verify(install.inputs[0],install.inputs[1],install.inputs[2],sql)
 if not baseline['passed']:raise AssertionError('Exact Storage baseline failed')
 install.baseline=baseline
 for table in install.inputs[0]['relations']:
  if sql('SELECT count(*) FROM storage.'+r.q(table['table'])+';')!='0':raise AssertionError('Storage installation created rows')
 baseline_query='BEGIN;SET LOCAL search_path=pg_catalog;'+BASELINE.read_text()+'COMMIT;'
 digest=sql(baseline_query)
 if BASELINE.read_text().strip() not in SOURCE.read_text():raise AssertionError('Candidate and derived fingerprint query differ')
 if 'BASELINE_DIGEST' in SOURCE.read_text():
  Path('/tmp/escocia-photo-upload-baseline-digest.txt').write_text(digest+'\n');raise ValueError('Derived baseline digest saved; freeze reviewed source before certification')
 for ddl in ['ALTER TABLE storage.objects ADD COLUMN synthetic_photo_drift text;',"ALTER TABLE storage.objects DISABLE TRIGGER ALL;",'ALTER TABLE hato_capturas_foto ADD COLUMN synthetic_photo_drift text;',"CREATE FUNCTION public.synthetic_photo_admission() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW;END$$;CREATE TRIGGER protected_photo_provenance BEFORE INSERT ON storage.objects FOR EACH ROW EXECUTE FUNCTION public.synthetic_photo_admission();"]:
  failed=sql('BEGIN;'+ddl+'SET LOCAL ROLE postgres;'+r.transaction_body(SOURCE.read_text())+'COMMIT;',False,bootstrap=True)
  if failed.returncode==0 or 'Unreviewed photo/Storage baseline' not in failed.stderr or sql(existing)!=before or sql("SELECT to_regnamespace('hato_photo_upload') IS NULL;")!='t' or sql(baseline_query)!=digest:raise AssertionError('Photo admission did not fully roll back')
 sql(SOURCE.read_text())
 if sql(existing)!=before or sql('SELECT count(*) FROM hato_photo_upload.requests;')!='0' or sql('SELECT count(*) FROM hato_photo_upload.audit;')!='0':raise AssertionError('Photo installation changed existing rows/created evidence')
def exercise(sql,ctx):
 check,call=ctx['check'],ctx['call'];owner=c.OWNER;key=c.uid();state=lambda:sql(query(sql))
 sql("INSERT INTO storage.buckets(id,name,public) VALUES('hato-pesajes-fotos','hato-pesajes-fotos',false);",bootstrap=True)
 intent=dict(version=1,year=2026,month=10,files=[dict(page=1,sha256='a'*64,size=123,mime='image/jpeg',extension='jpg'),dict(page=2,sha256='b'*64,size=234,mime='image/png',extension='png')])
 def action(mode,payload=None,k=key,actor=owner,role='service_role',jwt=None,ok=True):return call('fn_hato_photo_upload_service',[lit(mode),u(k),u(actor),js(payload) if payload is not None else 'NULL::jsonb'],actor=jwt,role=role,ok=ok)
 def refuse(label,ddl='',mode='claim',payload=None,k=key,actor=owner,role='service_role',jwt=None):
  before=state();failed=sql('BEGIN;'+ddl+'SET LOCAL ROLE '+role+';SET LOCAL request.jwt.claim.sub='+lit(jwt or '')+';SELECT fn_hato_photo_upload_service('+','.join([lit(mode),u(k),u(actor),js(payload) if payload is not None else 'NULL::jsonb'])+');COMMIT;',False)
  if failed.returncode==0 or state()!=before:raise AssertionError(label+' did not roll back complete domain/Storage/control')
  if any(x in failed.stderr for x in ['syntax error','ambiguous','does not exist','is not assigned']):
   path=Path('/tmp/escocia-photo-upload-refusal-private.log');path.touch(mode=0o600,exist_ok=True);path.write_text(failed.stderr);raise AssertionError(label+' unexpected SQL defect (private diagnostic)')
  check(True,label+' refuses with complete rollback')
 before=state();check(action('status')['state']=='unknown' and state()==before,'unknown photo status is read only')
 for role in ['anon','authenticated']:refuse(role+' cannot attest server bytes',mode='reserve',payload=intent,role=role,jwt=owner)
 refuse('human JWT cannot enter service lane',mode='reserve',payload=intent,jwt=owner)
 refuse('missing actor',mode='reserve',payload=intent,actor=c.uid())
 refuse('inactive actor','UPDATE usuarios SET activo=false WHERE id='+u(owner)+';',mode='reserve',payload=intent)
 for label,bad in [('injected provenance',dict(intent,paths=['legacy'])),('fractional month',dict(intent,month=1.5)),('duplicate page',dict(intent,files=[intent['files'][0]]*2)),('mismatched extension',dict(intent,files=[dict(intent['files'][0],extension='png')])),('oversized photo',dict(intent,files=[dict(intent['files'][0],size=15728641)])),('noncanonical digest',dict(intent,files=[dict(intent['files'][0],sha256='A'*64)]))]:refuse(label,mode='reserve',payload=bad)
 refuse('public bucket',"UPDATE storage.buckets SET public=true WHERE id='hato-pesajes-fotos';",mode='reserve',payload=intent)
 reserved=action('reserve',intent);check(reserved['state']=='reserved' and reserved['permit'] is None and reserved['permissionId'] is None and len(reserved['paths'])==2,'manifest reserved before any object or capture')
 check(sql('SELECT count(*) FROM hato_capturas_foto WHERE id='+u(key)+';')=='0' and sql("SELECT count(*) FROM storage.objects;")=='0','reservation creates no guessed capture or Storage object')
 before=state();check(action('reserve',intent)==reserved and state()==before,'same original reservation stable without repeated audit')
 refuse('changed original manifest',mode='reserve',payload=dict(intent,month=9))
 refuse('replacement original',mode='reserve',payload=intent,k=c.uid())
 refuse('different active genuine owner','UPDATE usuarios SET activo=true WHERE id='+u(c.OTHER)+';',mode='status',actor=c.OTHER)
 refuse('bucket CAS before permission',"UPDATE storage.buckets SET file_size_limit=99 WHERE id='hato-pesajes-fotos';")
 for table,event,body in [('hato_photo_upload.requests','BEFORE UPDATE','RETURN NULL;'),('hato_photo_upload.audit','BEFORE INSERT','RETURN NULL;'),('hato_photo_upload.audit','AFTER INSERT','UPDATE public.usuarios SET activo=false WHERE id='+u(owner)+';RETURN NEW;')]:refuse(table+' '+event,'CREATE FUNCTION public.synthetic_photo_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN '+body+'END$$;CREATE TRIGGER synthetic_photo_fault '+event+' ON '+table+' FOR EACH ROW EXECUTE FUNCTION public.synthetic_photo_fault();')
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:claims=list(pool.map(lambda _:action('claim'),range(2)))
 issued=[v for v in claims if v['permit'] is not None];check(len(issued)==1 and len({x['permissionId'] for x in claims})==1,'competing same-original claims issue exactly one upload permission')
 held=action('status');check(held['state']=='held' and held['permit'] is None and issued[0]['permit']==held['permissionId'],'lost permission reply recovers held original without upload authorization')
 before=state();check(action('claim')==held and state()==before,'known or unknown upload failure cannot reissue permission')
 refuse('cancel held original',mode='cancel');refuse('replace held original',mode='reserve',payload=intent,k=c.uid())
 check(call('fn_hato_photo_upload_recover_web',[u(owner)],actor=owner)==held,'independent human owner recovery cannot mint an upload permission')
 # Synthetic objects represent local metadata only, never uploaded bytes or hosted API.
 obs=[]
 for f,path in zip(intent['files'],held['paths']):
  row=json.loads(sql('INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('+lit('hato-pesajes-fotos')+','+lit(path)+','+js(dict(size=f['size'],mimetype=f['mime']))+') RETURNING to_jsonb(objects.*);',bootstrap=True))
  obs.append(dict(page=f['page'],row=row,sha256=f['sha256'],size=f['size'],mime=f['mime']))
 observation=dict(permissionId=held['permissionId'],objects=obs)
 refuse('incomplete readback',mode='observe',payload=dict(observation,objects=obs[:1]))
 refuse('changed actual bytes',mode='observe',payload=dict(observation,objects=[dict(obs[0],sha256='c'*64),obs[1]]))
 refuse('changed full object identity','UPDATE storage.objects SET metadata=\'{"changed":true}\' WHERE id='+u(obs[0]['row']['id'])+';',mode='observe',payload=observation)
 refuse('bucket changed after upload',"UPDATE storage.buckets SET public=true WHERE id='hato-pesajes-fotos';",mode='observe',payload=observation)
 refuse('legacy duplicate path claim',"INSERT INTO hato_capturas_foto(tipo,origen,anio,mes,storage_bucket,storage_prefijo,storage_rutas,created_by) VALUES('pesaje','web',2026,10,'hato-pesajes-fotos','synthetic-legacy',ARRAY["+lit(held['paths'][0])+"],"+u(owner)+");",mode='observe',payload=observation)
 refuse('revoked observer',"UPDATE usuarios SET activo=false WHERE id="+u(owner)+';',mode='observe',payload=observation)
 refuse('unknown permission',mode='observe',payload=dict(observation,permissionId=c.uid()))
 for table,event,body in [('public.hato_capturas_foto','BEFORE INSERT','RETURN NULL;'),('public.hato_capturas_foto','BEFORE INSERT',"NEW.storage_ok=false;RETURN NEW;"),('public.hato_capturas_foto','AFTER INSERT',"UPDATE storage.objects SET metadata='{}';RETURN NEW;"),('hato_photo_upload.audit','BEFORE INSERT','RETURN NULL;'),('hato_photo_upload.requests','BEFORE UPDATE','RETURN NULL;'),('hato_photo_upload.audit','AFTER INSERT','UPDATE public.usuarios SET activo=false WHERE id='+u(owner)+';RETURN NEW;')]:refuse('verification '+table+' '+event,'CREATE FUNCTION public.synthetic_photo_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN '+body+'END$$;CREATE TRIGGER synthetic_photo_fault '+event+' ON '+table+' FOR EACH ROW EXECUTE FUNCTION public.synthetic_photo_fault();',mode='observe',payload=observation)
 before=json.loads(state());verified=action('observe',observation);after=json.loads(state());capture=json.loads(sql('SELECT to_jsonb(x) FROM hato_capturas_foto x WHERE id='+u(key)+';'))
 check(verified['state']=='verified' and verified['permit'] is None and verified['receipt']['capture']==capture and verified['receipt']['objects']==obs,'native full capture/object rows agree with immutable verified receipt')
 check(capture['created_by']==owner and capture['storage_rutas']==held['paths'] and capture['desenlace']=='pendiente' and capture['storage_ok'] and capture['celdas_confirmadas'] is None and capture['filas_escritas'] is None,'verified capture carries exact original paths/current actor and no invented weighing/history')
 check(all(k in ['public.hato_capturas_foto','photo_controls','hato_photo_upload.requests','hato_photo_upload.audit'] or v==after[k] for k,v in before.items()),'verification preserves every Storage/domain/backup/financial/prior proof row')
 before=state();check(action('observe',observation)==verified and action('status')==verified and state()==before,'lost verification reply recovers original capture without repeat insertion')
 ack=action('acknowledge');check(ack['acknowledged'] and ack['receipt']==verified['receipt'],'terminal acknowledgment preserves full original evidence')
 fence=c.uid();action('cancel',k=fence);before=state();check(action('reserve',intent,k=fence)['state']=='canceled' and state()==before,'cancellation before reserve permanently fences delayed upload')
 for role in ['anon','authenticated','service_role']:
  for table in ['requests','audit']:
   before=state();failed=sql('BEGIN;SET LOCAL ROLE '+role+';SELECT * FROM hato_photo_upload.'+table+';COMMIT;',False);check(failed.returncode!=0 and state()==before,role+' private '+table+' denied')
 for ddl in ['DELETE FROM hato_photo_upload.audit;','TRUNCATE hato_photo_upload.requests CASCADE;','UPDATE hato_photo_upload.requests SET permission_id=gen_random_uuid() WHERE request_key='+u(key)+';']:
  before=state();failed=sql('BEGIN;'+ddl+'COMMIT;',False);check(failed.returncode!=0 and state()==before,'immutable evidence cannot be deleted/truncated/rekeyed')
 exercise.proof=dict(assertions=len(ctx.get('checks',[])),capture_verified=True,physical_bytes_certified=False,issued_permission_count=1)
def main():
 parser=argparse.ArgumentParser()
 for name in ('evidence-dir','runtime','client','output','private-diagnostics'):parser.add_argument('--'+name,type=Path,required=True)
 a=parser.parse_args();files=list(dict.fromkeys([Path(__file__),SOURCE,BASELINE,*[r.ROOT/k for k in json.loads((r.ROOT/'docs/security-integrity/hato-milk-week-replay.json').read_text())['source_hashes']],*[r.ROOT/k for k in json.loads((r.ROOT/'docs/security-integrity/storage-schema-replay.json').read_text())['source_hashes']]]));sources={f:f.read_bytes() for f in files}
 catalog,rls,storage,t,hashes,admission=s.load(a.evidence_dir.resolve());install.inputs=(storage,t,rls,catalog)
 if a.output.resolve().is_relative_to(a.evidence_dir.resolve()) or a.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(a.runtime.resolve(),a.client.resolve(),a.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(f.read_bytes()!=v for f,v in sources.items()):raise ValueError('Changing photo upload sources cannot be certified')
 result.update(coordinated_candidate_count=47,storage_baseline=install.baseline,admission_rollback_probes=4,source_hashes={str(f.relative_to(r.ROOT)):r.p.digest(v) for f,v in sources.items()},temporary_database_stopped_and_removed=True,limits=['Six local private metadata exports and synthetic local Auth/Storage rows only. No hosted Storage bytes/API/runtime certification.','Service-only web upload foundation; actual server/browser/Telegram callers and grants unchanged. No legacy provenance inference or discard authorization.'])
 a.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
