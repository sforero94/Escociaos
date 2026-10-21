#!/usr/bin/env python3
"""Prospective origin reservation on exact approved contained58-candidate graph."""
import argparse,concurrent.futures,importlib.util,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('origin_prior',Path(__file__).with_name('measured-income-invoice-replay.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
c,r,p=m.c,m.r,m.p
SOURCE=r.ROOT/'src/sql/security-candidates/measured-income-invoice-origin.sql'
SIGNATURE='public.fn_hato_income_invoice_origin_web(text,uuid,uuid,jsonb,jsonb,uuid)'
def install(sql):
 m.install(sql);query=p.query(sql);before=sql(query)
 failed=sql('BEGIN;ALTER FUNCTION hato_income_metadata.controls() SET search_path=public;'+r.transaction_body(SOURCE.read_text())+'COMMIT;',False)
 if failed.returncode==0 or sql(query)!=before:raise AssertionError('Origin dependency drift must refuse with complete rollback')
 sql(SOURCE.read_text())
 if sql(query)!=before or sql('SELECT count(*) FROM hato_income_metadata.invoice_origins;')!='0':raise AssertionError('Origin installation changed existing rows or seeded associations')
 for f in m.b.functions(sql):
  if f['args']==0 and f['returns']=='void' and f['name'].startswith('assert_'):sql('SELECT '+f['signature']+';')
def exercise(sql,ctx):
 m.exercise(sql,ctx);check,call=ctx['check'],ctx['call'];owner=c.uid();other=c.uid()
 for actor in [owner,other]:sql('INSERT INTO auth.users VALUES('+p.u(actor)+');INSERT INTO usuarios(id,email,rol,activo) VALUES('+p.u(actor)+','+p.lit(actor+'@synthetic.invalid')+",'Gerencia',true);")
 income=sql("SELECT q.fin_ingreso_id FROM hato_produccion_quincenal q JOIN fin_ingresos i ON i.id=q.fin_ingreso_id WHERE q.origen_dato='medido' ORDER BY i.id LIMIT 1;")
 draft=dict(version=1,kind='metadata',targetId=income,fields=dict(observations=None,invoice=None));source=call('fn_hato_income_metadata_source_web',[p.js(draft),p.u(owner)],actor=owner)['source']
 file=dict(mime='image/png',extension='png',sourceExtension='png',size=67,sha256='a'*64);key=c.uid();query=p.query(sql)
 def args(mode,k=None,obs=None,f=None,actor=owner,target=income):return [p.lit(mode),p.u(k) if k else 'NULL::uuid',p.u(target),p.js(obs) if obs is not None else 'NULL::jsonb',p.js(f) if f is not None else 'NULL::jsonb',p.u(actor)]
 def action(mode,k=None,obs=None,f=None,actor=owner,ok=True):
  result=sql('BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+p.lit(actor)+";SELECT coalesce(fn_hato_income_invoice_origin_web("+','.join(args(mode,k,obs,f,actor))+"),'null'::jsonb)::text;COMMIT;",ok)
  return json.loads(result) if ok else result
 def refuse(label,mode='reserve',k=key,obs=source,f=file,actor=owner,role='authenticated',ddl=''):
  before=sql(query);failed=sql('BEGIN;'+ddl+'SET LOCAL ROLE '+role+';SET LOCAL request.jwt.claim.sub='+p.lit(actor)+';SELECT fn_hato_income_invoice_origin_web('+','.join(args(mode,k,obs,f,actor))+');COMMIT;',False)
  if failed.returncode==0 or sql(query)!=before:raise AssertionError(label+' must refuse with complete rollback')
  if any(x in failed.stderr for x in ['syntax error','does not exist','ambiguous','is not assigned']):raise AssertionError('Unexpected origin fixture defect: '+label)
  check(True,label+' refuses with complete rollback')
 check(action('recover') is None,'fresh original recovery is nonallocating and does not fabricate an association')
 refuse('anon origin entry',role='anon');refuse('service origin entry',role='service_role')
 refuse('inactive origin owner',ddl='UPDATE usuarios SET activo=false WHERE id='+p.u(owner)+';')
 refuse('non-Gerencia origin owner',ddl="UPDATE usuarios SET rol='Administrador' WHERE id="+p.u(owner)+';')
 refuse('stale displayed income source',obs=dict(source,income=dict(source['income'],valor=1)))
 refuse('invalid byte claims after target allocation',f=dict(file,size=0))
 domain=sql('SELECT hato_birth_undo.capture_domain();');original=action('reserve',key,source,file)
 check(original['owner']==owner and original['incomeId']==income and original['requestKey']==key and original['invoice']['state']=='pending' and original['original']['source']==source,'reservation binds fresh owner/source and server-generated original target/request before byte transport')
 check(sql('SELECT hato_birth_undo.capture_domain();')==domain,'reservation changes no domain/financial/backup rows')
 before=sql(query);check(action('recover')==original and action('reserve',key,source,file)==original and sql(query)==before,'lost reservation reply and exact retry recover the same immutable original with no new permission or target')
 refuse('competing original key',k=c.uid());refuse('changed original byte claims',f=dict(file,sha256='b'*64));refuse('changed original source',obs=dict(source,unexpected=True))
 for label,ddl in [('origin column ACL','GRANT UPDATE(identity) ON hato_income_metadata.invoice_origins TO authenticated;'),('origin read grant','GRANT SELECT ON hato_income_metadata.invoice_origins TO service_role;'),('origin RLS disabled','ALTER TABLE hato_income_metadata.invoice_origins DISABLE ROW LEVEL SECURITY;'),('origin immutable binding disabled','ALTER TABLE hato_income_metadata.invoice_origins DISABLE TRIGGER immutable_invoice_origin;'),('origin column definition','ALTER TABLE hato_income_metadata.invoice_origins ADD COLUMN injected text;'),('origin entry search path','ALTER FUNCTION '+SIGNATURE+' SET search_path=public;'),('invoice authority drift','GRANT UPDATE ON invoice_upload.requests TO service_role;')]:refuse(label,mode='recover',k=None,obs=None,f=None,ddl=ddl)
 for verb in ['DELETE FROM hato_income_metadata.invoice_origins;','UPDATE hato_income_metadata.invoice_origins SET income_id=gen_random_uuid();','TRUNCATE hato_income_metadata.invoice_origins;']:
  before=sql(query);failed=sql('BEGIN;'+verb+'COMMIT;',False);check(failed.returncode!=0 and sql(query)==before,'immutable original rejects '+verb.split()[0].lower()+' without historical rewrite')
 identity=original['original']['identity'];execution=c.uid();call('fn_invoice_upload_step',[p.u(owner),p.lit('write-claim'),p.js(identity),p.lit(execution)],role='service_role',actor=owner)
 before=sql(query);check(action('recover')==original and sql(query)==before,'unknown in-flight original execution survives recovery without settlement or replacement')
 check(action('recover',actor=other) is None,'another owner cannot discover original income attachment association')
 keys=[c.uid(),c.uid()]
 def compete(k):return action('reserve',k,source,file,actor=other,ok=False)
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(compete,keys))
 check(sum(x.returncode==0 for x in results)==1,'same-owner competing reservation keys produce exactly one original winner')
 winner=action('recover',actor=other);check(winner['requestKey'] in keys and winner['original']['identity']!=identity,'owner-bound independent recovery returns the competing winner without exposing another owner original')
 # Existing financial protocols must retain the new non-owning origin evidence exactly.
 observed=call('fn_hato_income_metadata_source_web',[p.js(draft),p.u(owner)],actor=owner);metadata_key=c.uid();intent=dict(draft,observed=observed['source']);saved=sql('SELECT jsonb_agg(to_jsonb(x) ORDER BY request_key) FROM hato_income_metadata.invoice_origins x;')
 call('fn_hato_income_metadata_web',[p.lit('prepare'),p.u(metadata_key),p.js(intent),p.u(owner)],actor=owner);call('fn_hato_income_metadata_web',[p.lit('post'),p.u(metadata_key),'NULL::jsonb',p.u(owner)],actor=owner)
 check(sql('SELECT jsonb_agg(to_jsonb(x) ORDER BY request_key) FROM hato_income_metadata.invoice_origins x;')==saved,'actual protected metadata posting preserves all immutable non-owning origin evidence')
 check(action('recover')==original,'original remains independently recoverable after later metadata correction without source adoption')

def main():
 ap=argparse.ArgumentParser()
 for name in ['evidence-dir','runtime','client','output','private-diagnostics']:ap.add_argument('--'+name,type=Path,required=True)
 x=ap.parse_args();m.exercise.client=x.client.resolve();m.b.exercise.client=x.client.resolve();prior=json.loads((r.ROOT/'docs/security-integrity/measured-income-invoice-recovery-replay.json').read_text())
 files=list(dict.fromkeys([SOURCE,Path(__file__),Path(__file__).with_name('build-measured-income-invoice-origin.py'),*[r.ROOT/k for k in prior['source_hashes']]]));frozen={f:f.read_bytes() for f in files};base=m.b.p.p
 while not hasattr(base,'s'):base=base.p
 catalog,rls,storage,t,hashes,_=base.s.load(x.evidence_dir.resolve());base.install.inputs=(storage,t,rls,catalog)
 if x.output.resolve().is_relative_to(x.evidence_dir.resolve()) or x.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(x.runtime.resolve(),x.client.resolve(),x.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(f.read_bytes()!=v for f,v in frozen.items()):raise ValueError('Changing measured invoice origin sources cannot be certified')
 result.update(coordinated_candidate_count=58,installed_sdk=m.exercise.sdk,source_hashes={str(f.relative_to(r.ROOT)):r.p.digest(v) for f,v in frozen.items()},temporary_database_stopped_and_removed=True,limits=['Six approved local private structure snapshots/contained synthetic PostgreSQL only; never production.','SQL origin reservation/recovery foundation only; actual upload caller cutover and terminal release/replacement lifecycle remain separate. Existing unassociated historical uploads are not adopted.'])
 x.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
