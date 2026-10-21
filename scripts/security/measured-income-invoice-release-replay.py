#!/usr/bin/env python3
"""Exact local59-candidate terminal release proof; no production transport."""
import argparse,concurrent.futures,importlib.util,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('release_prior',Path(__file__).with_name('measured-income-invoice-origin-browser-replay.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
c,r,p=b.c,b.r,b.p
SOURCE=r.ROOT/'src/sql/security-candidates/measured-income-invoice-release.sql'
def install(sql):
 b.b.install(sql)
 # Retained synthetic private history predates this installation; no domain provenance is claimed.
 sql('INSERT INTO hato_income_metadata.invoice_origins VALUES('+','.join([p.u(c.uid()),p.u(c.uid()),p.u(c.uid()),p.js({'synthetic':'retained installation fixture'}),p.js({}),p.js({}),p.js({}),p.lit('2026-10-01T00:00:00Z')+'::timestamptz'])+');')
 query=p.query(sql);before=sql(query)
 failed=sql('BEGIN;ALTER FUNCTION hato_income_metadata.controls() SET search_path=public;'+r.transaction_body(SOURCE.read_text())+'COMMIT;',False)
 if failed.returncode==0 or sql(query)!=before:raise AssertionError('Release dependency drift must refuse without partial DDL/row changes')
 sql(SOURCE.read_text())
 if sql(query)!=before or sql('SELECT count(*) FROM hato_income_metadata.invoice_releases;')!='0':raise AssertionError('Terminal installation changed retained rows or seeded releases')
 for f in b.b.m.b.functions(sql):
  if f['args']==0 and f['returns']=='void' and f['name'].startswith('assert_'):sql('SELECT '+f['signature']+';')
def exercise(sql,ctx):
 b.exercise(sql,ctx);check,call=ctx['check'],ctx['call'];query=p.query(sql)
 row=json.loads(sql("SELECT jsonb_build_object('owner',o.owner_id,'income',o.income_id,'key',o.request_key) FROM hato_income_metadata.invoice_origins o JOIN invoice_upload.requests r ON r.owner=o.owner_id AND r.request_key=(o.identity->>'requestKey')::uuid WHERE r.state='committed' ORDER BY o.created_at DESC,o.request_key DESC LIMIT 1;"));owner,income,key=row['owner'],row['income'],row['key']
 def args(mode,k=key,preview=None,actor=owner):return [p.lit(mode),p.u(k) if k else 'NULL::uuid',p.u(income),p.js(preview) if preview is not None else 'NULL::jsonb',p.u(actor)]
 def action(mode,k=key,preview=None,actor=owner,ok=True):
  result=sql('BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+p.lit(actor)+";SELECT coalesce(fn_hato_income_invoice_release_web("+','.join(args(mode,k,preview,actor))+"),'null'::jsonb)::text;COMMIT;",ok);return json.loads(result) if ok else result
 def refuse(label,preview,k=key,actor=owner,role='authenticated',ddl=''):
  before=sql(query);failed=sql('BEGIN;'+ddl+'SET LOCAL ROLE '+role+';SET LOCAL request.jwt.claim.sub='+p.lit(actor)+';SELECT fn_hato_income_invoice_release_web('+','.join(args('release',k,preview,actor))+');COMMIT;',False)
  if failed.returncode==0 or sql(query)!=before:raise AssertionError(label+' must refuse with whole-state rollback')
  if any(x in failed.stderr for x in ['syntax error','does not exist','ambiguous','is not assigned']):raise AssertionError('Unexpected release fixture defect: '+label)
  check(True,label+' refuses with whole-state rollback')
 check(action('recover',k=None) is None,'terminal recovery before release allocates nothing')
 preview=action('preview');check(preview['disposition']=='held' and len(preview['metadataClaims'])>0,'unacknowledged metadata original blocks terminal release')
 refuse('unacknowledged metadata claim',preview)
 claims=json.loads(sql('SELECT coalesce(jsonb_agg(jsonb_build_object(\'owner\',owner_id,\'key\',request_key,\'state\',state)),\'[]\') FROM hato_income_metadata.requests WHERE NOT acknowledged AND state IN(\'pending\',\'committed\') AND intent->>\'targetId\'='+p.lit(income)+';'))
 for claim in claims:
  if claim['state']=='pending':call('fn_hato_income_metadata_web',[p.lit('resolve'),p.u(claim['key']),'NULL::jsonb',p.u(claim['owner'])],actor=claim['owner'])
  call('fn_hato_income_metadata_web',[p.lit('acknowledge'),p.u(claim['key']),'NULL::jsonb',p.u(claim['owner'])],actor=claim['owner'])
 preview=action('preview');check(preview['disposition']=='committed_settled' and all(x['settled'] for x in preview['executions']),'captured committed release requires settled original permissions and no metadata claim')
 refuse('anon release',preview,role='anon');refuse('service release',preview,role='service_role');refuse('revoked release owner',preview,ddl='UPDATE usuarios SET activo=false WHERE id='+p.u(owner)+';')
 path=preview['request']['path'];request=preview['request']['request_key']
 refuse('changed displayed Storage identity',preview,ddl='UPDATE storage.objects SET metadata=metadata||\'{"release_drift":true}\'::jsonb WHERE bucket_id=\'facturas\' AND name='+p.lit(path)+';')
 refuse('late unknown write permission',preview,ddl='INSERT INTO invoice_upload.executions VALUES('+p.u(owner)+','+p.u(request)+','+p.u(c.uid())+',false);')
 for label,ddl in [('release column ACL','GRANT UPDATE(receipt) ON hato_income_metadata.invoice_releases TO authenticated;'),('release immutable binding','ALTER TABLE hato_income_metadata.invoice_releases DISABLE TRIGGER immutable_invoice_release;'),('release entry config','ALTER FUNCTION fn_hato_income_invoice_release_web(text,uuid,uuid,jsonb,uuid) SET search_path=public;')]:refuse(label,preview,ddl=ddl)
 before=sql(query);failed=sql('BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+p.lit(owner)+';SELECT fn_hato_income_invoice_release_web('+','.join(args('release',preview=preview))+');SELECT 1/0;COMMIT;',False)
 check(failed.returncode!=0 and sql(query)==before,'post-RPC transaction fault restores target fence and release audit together')
 domain=sql('SELECT hato_birth_undo.capture_domain();');history=sql('SELECT to_jsonb(x) FROM hato_income_metadata.invoice_origins x WHERE request_key='+p.u(key)+';');stored=sql('SELECT to_jsonb(x) FROM storage.objects x WHERE bucket_id=\'facturas\' AND name='+p.lit(path)+';')
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:receipts=list(pool.map(lambda _:action('release',preview=preview),range(2)))
 receipt=receipts[0];check(receipts[1]==receipt and receipt['afterTarget']['active'] is False,'concurrent release replies return exactly one immutable original receipt')
 before=sql(query);check(action('release',preview=preview)==receipt and action('recover',k=None)==receipt and sql(query)==before,'lost release reply and independent income recovery preserve exact original without allocating')
 check(sql('SELECT hato_birth_undo.capture_domain();')==domain and sql('SELECT to_jsonb(x) FROM hato_income_metadata.invoice_origins x WHERE request_key='+p.u(key)+';')==history and sql('SELECT to_jsonb(x) FROM storage.objects x WHERE bucket_id=\'facturas\' AND name='+p.lit(path)+';')==stored,'release retains exact financial/domain/origin/raw Storage evidence')
 draft=dict(version=1,kind='metadata',targetId=income,fields=dict(observations='After retained release',invoice=preview['income']['url_factura']));source=call('fn_hato_income_metadata_source_web',[p.js(draft),p.u(owner)],actor=owner)['source'];file=dict(mime='image/png',extension='png',sourceExtension='png',size=67,sha256='a'*64)
 def reserve(k,actor=owner,ok=True):return call('fn_hato_income_invoice_origin_web',[p.lit('reserve'),p.u(k),p.u(income),p.js(source),p.js(file),p.u(actor)],actor=actor,ok=ok)
 keys=[c.uid(),c.uid()]
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:winners=list(pool.map(lambda k:reserve(k,ok=False),keys))
 check(sum(x.returncode==0 for x in winners)==1,'after definitive release competing replacements create exactly one new original')
 active=call('fn_hato_income_invoice_origin_web',[p.lit('recover'),'NULL::uuid',p.u(income),'NULL::jsonb','NULL::jsonb',p.u(owner)],actor=owner)
 check(active['requestKey'] in keys and active['original']['identity']!=preview['origin']['identity'] and action('recover',k=key)==receipt,'new active reservation preserves independent released-original recovery')
 before=sql(query);failure=reserve(key,ok=False);check(failure.returncode!=0 and sql(query)==before,'released historical key cannot be reused or silently repaired')
 for verb in ['DELETE FROM hato_income_metadata.invoice_releases;','UPDATE hato_income_metadata.invoice_releases SET receipt=\'{}\';','TRUNCATE hato_income_metadata.invoice_releases;']:
  before=sql(query);failed=sql('BEGIN;'+verb+'COMMIT;',False);check(failed.returncode!=0 and sql(query)==before,'immutable release history rejects '+verb.split()[0].lower())
 fresh=c.uid();sql('INSERT INTO auth.users VALUES('+p.u(fresh)+');INSERT INTO usuarios(id,email,rol,activo) VALUES('+p.u(fresh)+','+p.lit(fresh+'@synthetic.invalid')+",'Gerencia',true);")
 unused=reserve(c.uid(),actor=fresh);unused_key=unused['requestKey'];unused_preview=action('preview',k=unused_key,actor=fresh)
 check(unused_preview['disposition']=='unused_fenced' and unused_preview['executions']==[],'unused preview proves zero issued write permissions and no object/reference')
 before=sql(query);malformed=sql('BEGIN;UPDATE invoice_upload.requests SET cleanup_pending=true WHERE owner='+p.u(fresh)+' AND request_key='+p.u(unused['original']['identity']['requestKey'])+';SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+p.lit(fresh)+';SELECT fn_hato_income_invoice_release_web(\'release\','+p.u(unused_key)+','+p.u(income)+',fn_hato_income_invoice_release_web(\'preview\','+p.u(unused_key)+','+p.u(income)+',NULL,'+p.u(fresh)+'),'+p.u(fresh)+');COMMIT;',False)
 check(malformed.returncode!=0 and sql(query)==before,'contradictory pending cleanup evidence remains held even with a freshly captured preview')
 released=action('release',k=unused_key,preview=unused_preview,actor=fresh);identity=unused['original']['identity'];before=sql(query)
 late=call('fn_invoice_upload_step',[p.u(fresh),p.lit('write-claim'),p.js(identity),p.lit(c.uid())],role='service_role',actor=fresh,ok=False)
 check(late.returncode!=0 and sql(query)==before and released['disposition']=='unused_fenced','unused release atomic fence prevents a delayed original from obtaining any write permission')
 # A real issued but unsettled original permission remains held even after target closure.
 unknown=reserve(c.uid(),actor=fresh);unknown_identity=unknown['original']['identity'];call('fn_invoice_upload_step',[p.u(fresh),p.lit('write-claim'),p.js(unknown_identity),p.lit(c.uid())],role='service_role',actor=fresh)
 call('fn_invoice_upload_target',[p.u(fresh),p.u(unknown_identity['targetKey']),p.lit('invalidate')],role='service_role',actor=fresh)
 held=action('preview',k=unknown['requestKey'],actor=fresh);check(held['disposition']=='held' and not held['target']['active'] and held['object'] is None,'target closure and object absence do not settle an issued uncertain permission')
 refuse('closed uncertain original',held,k=unknown['requestKey'],actor=fresh)
 before=sql(query);failed=reserve(c.uid(),actor=fresh,ok=False);check(failed.returncode!=0 and sql(query)==before,'uncertain original cannot allocate a replacement despite browser/target absence')
 check(action('recover',k=key,actor=fresh) is None,'another owner cannot recover a released original')
 # All known settled quarantine facts are required; no cleanup/delete is performed here.
 quarantine_owner=c.uid();sql('INSERT INTO auth.users VALUES('+p.u(quarantine_owner)+');INSERT INTO usuarios(id,email,rol,activo) VALUES('+p.u(quarantine_owner)+','+p.lit(quarantine_owner+'@synthetic.invalid')+",'Gerencia',true);")
 q=reserve(c.uid(),actor=quarantine_owner);qi=q['original']['identity'];call('fn_invoice_upload_step',[p.u(quarantine_owner),p.lit('quarantine'),p.js(qi),'NULL::text'],role='service_role',actor=quarantine_owner)
 qp=action('preview',k=q['requestKey'],actor=quarantine_owner);check(qp['disposition']=='held','quarantine alone without definitive original cleanup evidence remains held')
 call('fn_invoice_upload_step',[p.u(quarantine_owner),p.lit('cleanup-observed'),p.js(qi),p.lit('absent')],role='service_role',actor=quarantine_owner)
 qp=action('preview',k=q['requestKey'],actor=quarantine_owner);qr=action('release',k=q['requestKey'],preview=qp,actor=quarantine_owner)
 check(qr['disposition']=='quarantine_settled_absent','definitively reconciled original quarantine can release without new Storage deletion')

def main():
 ap=argparse.ArgumentParser()
 for name in ['evidence-dir','runtime','client','output','private-diagnostics']:ap.add_argument('--'+name,type=Path,required=True)
 x=ap.parse_args();b.exercise.client=x.client.resolve();b.b.m.exercise.client=x.client.resolve();b.b.m.b.exercise.client=x.client.resolve()
 prior=json.loads((r.ROOT/'docs/security-integrity/measured-income-invoice-origin-browser-replay.json').read_text());files=list(dict.fromkeys([SOURCE,Path(__file__),Path(__file__).with_name('build-measured-income-invoice-release.py'),*[r.ROOT/k for k in prior['source_hashes']]]));frozen={f:f.read_bytes() for f in files};base=b.b.m.b.p.p
 while not hasattr(base,'s'):base=base.p
 catalog,rls,storage,t,hashes,_=base.s.load(x.evidence_dir.resolve());base.install.inputs=(storage,t,rls,catalog)
 if x.output.resolve().is_relative_to(x.evidence_dir.resolve()) or x.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(x.runtime.resolve(),x.client.resolve(),x.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(f.read_bytes()!=v for f,v in frozen.items()):raise ValueError('Changing invoice terminal sources cannot be certified')
 result.update(coordinated_candidate_count=59,installed_sdk={'prior':b.b.m.exercise.sdk,'origin_caller':b.exercise.sdk},source_hashes={str(f.relative_to(r.ROOT)):r.p.digest(v) for f,v in frozen.items()},temporary_database_stopped_and_removed=True,limits=['Six approved local private structure exports and contained synthetic PostgreSQL only; never production.','SQL terminal foundation only; actual terminal caller/strict protocol integration remains separate, followed by compatible financial writer retirement and hosted/runtime/global/recovery gates.'])
 x.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
