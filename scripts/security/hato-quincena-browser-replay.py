#!/usr/bin/env python3
"""Protected measured quincena-income on exact six-export local replay only."""
import argparse,importlib.util,json,subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('prior_quincena_integrity',Path(__file__).with_name('hato-quincena-integrity-replay.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
c,r,u,lit,js=p.c,p.r,p.u,p.lit,p.js
FILES=['scripts/security/hato-quincena-browser-native.mjs','src/__tests__/hatoQuincenaBrowser.test.tsx','src/utils/hato/hatoQuincenaProtocol.ts','src/utils/hato/hatoQuincenaBrowserAttempt.ts','src/components/hato/hooks/useQuincenaConfirmation.ts','src/components/hato/hooks/useProduccionHato.ts','src/components/hato/components/ProduccionQuincenalDialog.tsx','src/components/hato/components/QuincenaConfirmationPanel.tsx']
def exercise(sql,ctx):
 p.exercise(sql,ctx);owner=c.uid()
 sql('INSERT INTO auth.users VALUES('+u(owner)+');INSERT INTO usuarios(id,email,rol,activo) VALUES('+u(owner)+",'quincena-browser@synthetic.invalid','Gerencia',true);")
 region=sql("SELECT id FROM fin_regiones WHERE nombre='Synthetic protected region';");medium=sql("SELECT id FROM fin_medios_pago WHERE nombre='Synthetic protected medium';")
 params=dict(quincenaId=None,anio=2026,mes=11,quincena=1,fechaInicio='2026-11-01',fechaFin='2026-11-15',litrosTotal=100,litrosPomarConfirmado=100,numVacasOrdeno=1,notas='Synthetic reviewed browser',finIngreso=dict(fecha='2026-11-15',valorBruto=1000,regionId=region,medioPagoId=medium,compradorId=None,nombre=None))
 args=dict(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),owner=owner,params=params)
 proc=subprocess.run(['node',str(Path(__file__).with_name('hato-quincena-browser-native.mjs'))],input=json.dumps(args),text=True,capture_output=True,cwd=r.ROOT,timeout=90)
 if proc.returncode:
  f=Path('/tmp/escocia-quincena-browser-sdk-private.log');f.touch(mode=0o600,exist_ok=True);f.write_text(proc.stderr);raise AssertionError('Actual quincena browser SDK failed; private diagnostics '+str(f))
 data=json.loads(proc.stdout);exercise.sdk={k:v for k,v in data.items() if k!='fixtures'};exercise.proof=p.exercise.proof
 fixture=r.ROOT/'src/__tests__/fixtures/hatoQuincena.json';fixture.write_text(json.dumps(data['fixtures'],indent=2)+'\n')
def main():
 a=argparse.ArgumentParser()
 for name in ('evidence-dir','runtime','client','output','private-diagnostics'):a.add_argument('--'+name,type=Path,required=True)
 x=a.parse_args();exercise.client=x.client;
 base=p
 while not hasattr(base,'s'):base=base.p
 files=list(dict.fromkeys([Path(__file__),*[r.ROOT/k for k in FILES],*[r.ROOT/k for k in json.loads((r.ROOT/'docs/security-integrity/hato-quincena-integrity-replay.json').read_text())['source_hashes']]]));sources={f:f.read_bytes() for f in files};catalog,rls,storage,t,hashes,admission=base.s.load(x.evidence_dir.resolve());base.install.inputs=(storage,t,rls,catalog)
 if x.output.resolve().is_relative_to(x.evidence_dir.resolve()) or x.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(x.runtime.resolve(),x.client.resolve(),x.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=p.install)
 if any(f.read_bytes()!=v for f,v in sources.items()):raise ValueError('Changing quincena browser sources cannot be certified')
 sources[r.ROOT/'src/__tests__/fixtures/hatoQuincena.json']=(r.ROOT/'src/__tests__/fixtures/hatoQuincena.json').read_bytes()
 result.update(coordinated_candidate_count=54,proof=exercise.proof,installed_sdk=exercise.sdk,source_hashes={str(f.relative_to(r.ROOT)):r.p.digest(v) for f,v in sources.items()},temporary_database_stopped_and_removed=True,limits=['Six local private structure snapshots and synthetic contained PG only; never production.','Actual browser caller only. Financial callers/legacy RPC/direct grants and service/import/capture lanes unchanged; hosted/runtime/global/capacity/coherent recovery remain gates.'])
 x.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
