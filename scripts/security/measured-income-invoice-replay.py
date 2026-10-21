#!/usr/bin/env python3
"""Prepared measured invoice caller on the exact contained57-candidate graph."""
import argparse,importlib.util,json,subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('invoice_base',Path(__file__).with_name('invoice-combined-integrity-replay.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
c,r,p=b.c,b.r,b.p
SOURCE=r.ROOT/'src/sql/security-candidates/measured-income-invoice.sql'
def install(sql):
 b.install.derive=False;b.install(sql);query=p.query(sql);before=sql(query)
 failed=sql("BEGIN;ALTER FUNCTION hato_income_metadata.validate(jsonb,boolean) SET search_path=public;"+r.transaction_body(SOURCE.read_text())+'COMMIT;',False)
 if failed.returncode==0 or sql(query)!=before:raise AssertionError('Measured invoice dependency drift must refuse without changing rows')
 sql(SOURCE.read_text())
 if sql(query)!=before:raise AssertionError('Measured invoice installation changed existing rows')
def exercise(sql,ctx):
 b.exercise(sql,ctx);owner=c.uid();sql('INSERT INTO auth.users VALUES('+p.u(owner)+');INSERT INTO usuarios(id,email,rol,activo) VALUES('+p.u(owner)+",'measured-invoice@synthetic.invalid','Gerencia',true);")
 pair=json.loads(sql("SELECT jsonb_build_object('income',i.id,'qid',q.id) FROM fin_ingresos i JOIN hato_produccion_quincenal q ON q.fin_ingreso_id=i.id WHERE q.origen_dato='medido' ORDER BY i.id LIMIT 1;"))
 args=dict(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),owner=owner,**pair)
 proc=subprocess.run(['node',str(Path(__file__).with_name('measured-income-invoice-native.mjs'))],input=json.dumps(args),text=True,capture_output=True,cwd=r.ROOT,timeout=90)
 if proc.returncode:
  f=Path('/tmp/escocia-measured-invoice-sdk-private.log');f.touch(mode=0o600,exist_ok=True);f.write_text(proc.stderr);raise AssertionError('Measured invoice SDK failed; private diagnostics outside repository')
 result=json.loads(proc.stdout);exercise.sdk={k:v for k,v in result.items() if k!='fixture'};exercise.fixture=result['fixture']
 check,call=ctx['check'],ctx['call'];intent=result['fixture']['intent'];attachment=intent['attachment'];draft={k:v for k,v in intent.items() if k not in ['observed','observedAttachment']}
 source=call('fn_hato_income_metadata_source_web',[p.js(draft),p.u(owner)],actor=owner);fresh=dict(draft,observed=source['source'],observedAttachment=source['observedAttachment']);key=c.uid();pending=call('fn_hato_income_metadata_web',[p.lit('prepare'),p.u(key),p.js(fresh),p.u(owner)],actor=owner)
 query=p.query(sql)
 def refuse(ddl,label):
  before=sql(query);failed=sql('BEGIN;'+ddl+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+p.lit(owner)+';SELECT fn_hato_income_metadata_web(\'post\','+p.u(key)+',NULL,'+p.u(owner)+');COMMIT;',False)
  if failed.returncode==0 or sql(query)!=before:raise AssertionError(label+' must refuse with whole-state rollback')
  if any(x in failed.stderr for x in ['syntax error','does not exist','ambiguous','is not assigned']):raise AssertionError('Unexpected SQL fixture defect')
  check(True,label+' refuses with whole-state rollback')
 refuse('UPDATE storage.objects SET metadata=metadata||\'{"changed":"synthetic"}\'::jsonb WHERE bucket_id=\'facturas\' AND name='+p.lit(attachment['path'])+';','changed captured Storage identity')
 refuse('UPDATE invoice_upload.targets SET active=false WHERE owner='+p.u(owner)+' AND target_key='+p.u(attachment['identity']['targetKey'])+';','closed original upload target')
 refuse('UPDATE usuarios SET activo=false WHERE id='+p.u(owner)+';','revoked current metadata actor')
 call('fn_hato_income_metadata_web',[p.lit('resolve'),p.u(key),'NULL::jsonb',p.u(owner)],actor=owner);call('fn_hato_income_metadata_web',[p.lit('acknowledge'),p.u(key),'NULL::jsonb',p.u(owner)],actor=owner)
 check(True,'actual prepared verified attachment and immutable original recovery complete on57candidate graph')
def main():
 ap=argparse.ArgumentParser()
 for name in ['evidence-dir','runtime','client','output','private-diagnostics']:ap.add_argument('--'+name,type=Path,required=True)
 x=ap.parse_args();exercise.client=x.client.resolve();b.exercise.client=x.client.resolve();prior=json.loads((r.ROOT/'docs/security-integrity/invoice-combined-integrity-replay.json').read_text())
 extra=[SOURCE,Path(__file__),Path(__file__).with_name('measured-income-invoice-native.mjs'),Path(__file__).with_name('build-measured-income-invoice.py')]
 extra += [r.ROOT/k for k in ['src/utils/hato/hatoIncomeInvoiceAttempt.ts','src/utils/hato/hatoIncomeInvoiceProof.ts','src/components/hato/components/MeasuredIncomeInvoiceUploader.tsx','src/__tests__/measuredIncomeInvoice.test.tsx']]
 files=list(dict.fromkeys([*extra,*[r.ROOT/k for k in prior['source_hashes']]]));frozen={f:f.read_bytes() for f in files};base=b.p.p
 while not hasattr(base,'s'):base=base.p
 catalog,rls,storage,t,hashes,_=base.s.load(x.evidence_dir.resolve());base.install.inputs=(storage,t,rls,catalog)
 if x.output.resolve().is_relative_to(x.evidence_dir.resolve()) or x.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(x.runtime.resolve(),x.client.resolve(),x.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(f.read_bytes()!=v for f,v in frozen.items()):raise ValueError('Changing measured invoice sources cannot be certified')
 fixture=r.ROOT/'src/__tests__/fixtures/measuredIncomeInvoice.json';fixture.write_text(json.dumps(exercise.fixture,indent=2)+'\n');frozen[fixture]=fixture.read_bytes()
 result.update(coordinated_candidate_count=57,installed_sdk=exercise.sdk,source_hashes={str(f.relative_to(r.ROOT)):r.p.digest(v) for f,v in frozen.items()},temporary_database_stopped_and_removed=True,limits=['Six approved local private structure snapshots/contained synthetic PostgreSQL only; never production.','Actual measured invoice caller; financial legacy/direct writer retirement and hosted Auth/Storage/Deno/pinned SDK/global/recovery gates remain.'])
 x.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
