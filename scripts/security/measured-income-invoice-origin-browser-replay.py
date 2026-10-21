#!/usr/bin/env python3
"""Actual origin caller/handler replay on the exact contained58-candidate graph."""
import argparse,importlib.util,json,subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('browser_origin_prior',Path(__file__).with_name('measured-income-invoice-origin-replay.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
c,r,p=b.c,b.r,b.p
def exercise(sql,ctx):
 b.exercise(sql,ctx);owners=[c.uid(),c.uid()]
 for owner in owners:sql('INSERT INTO auth.users VALUES('+p.u(owner)+');INSERT INTO usuarios(id,email,rol,activo) VALUES('+p.u(owner)+','+p.lit(owner+'@synthetic.invalid')+",'Gerencia',true);")
 income=sql("SELECT q.fin_ingreso_id FROM hato_produccion_quincenal q JOIN fin_ingresos i ON i.id=q.fin_ingreso_id WHERE q.origen_dato='medido' ORDER BY i.id LIMIT 1;")
 args=dict(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),owner=owners[0],other=owners[1],income=income)
 proc=subprocess.run(['node',str(Path(__file__).with_name('measured-income-invoice-origin-browser-native.mjs'))],input=json.dumps(args),text=True,capture_output=True,cwd=r.ROOT,timeout=90)
 if proc.returncode:
  f=Path('/tmp/escocia-origin-caller-sdk-private.log');f.touch(mode=0o600,exist_ok=True);f.write_text(proc.stderr);raise AssertionError('Origin caller SDK failed; private diagnostics outside repository')
 exercise.sdk=json.loads(proc.stdout);ctx['check'](True,'actual origin caller recovers pre-metadata storage loss and unknown dispatch on58candidate graph')
def main():
 ap=argparse.ArgumentParser()
 for name in ['evidence-dir','runtime','client','output','private-diagnostics']:ap.add_argument('--'+name,type=Path,required=True)
 x=ap.parse_args();exercise.client=x.client.resolve();b.m.exercise.client=x.client.resolve();b.m.b.exercise.client=x.client.resolve()
 prior=json.loads((r.ROOT/'docs/security-integrity/measured-income-invoice-origin-replay.json').read_text())
 extra=[Path(__file__),Path(__file__).with_name('measured-income-invoice-origin-browser-native.mjs')]+[r.ROOT/k for k in ['src/utils/hato/hatoIncomeInvoiceOriginBrowserAttempt.ts','src/utils/hato/hatoIncomeInvoiceOriginProtocol.ts','src/__tests__/measuredIncomeInvoiceOrigin.test.ts']]
 files=list(dict.fromkeys([*extra,*[r.ROOT/k for k in prior['source_hashes']]]));frozen={f:f.read_bytes() for f in files};base=b.m.b.p.p
 while not hasattr(base,'s'):base=base.p
 catalog,rls,storage,t,hashes,_=base.s.load(x.evidence_dir.resolve());base.install.inputs=(storage,t,rls,catalog)
 if x.output.resolve().is_relative_to(x.evidence_dir.resolve()) or x.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(x.runtime.resolve(),x.client.resolve(),x.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=b.install)
 if any(f.read_bytes()!=v for f,v in frozen.items()):raise ValueError('Changing origin caller sources cannot be certified')
 result.update(coordinated_candidate_count=58,installed_sdk={'prior':b.m.exercise.sdk,'origin_caller':exercise.sdk},source_hashes={str(f.relative_to(r.ROOT)):r.p.digest(v) for f,v in frozen.items()},temporary_database_stopped_and_removed=True,limits=['Six approved local private structure snapshots/contained synthetic PostgreSQL only; never production.','Actual prospective origin caller; terminal release/replacement, unassociated legacy history, financial writer retirement and hosted/runtime/global/recovery gates remain.'])
 x.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
