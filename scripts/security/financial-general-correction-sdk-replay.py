#!/usr/bin/env python3
"""Strict general correction installed SDK/recovery layer; actual form remains a separate gate."""
import argparse,hashlib,importlib.util,json,subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('general_sdk_prior',Path(__file__).with_name('financial-general-correction-replay.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
r,p,c,ROOT=b.r,b.p,b.c,b.ROOT
REPORT=ROOT/'docs/security-integrity/financial-general-correction-replay.json'
FILES=['scripts/security/financial-general-correction-sdk-replay.py','scripts/security/financial-general-correction-sdk-native.mjs','src/utils/hato/financialGeneralCorrectionProtocol.ts','src/utils/hato/financialGeneralCorrectionBrowserAttempt.ts','src/components/hato/hooks/useGeneralCorrectionConfirmation.ts','src/__tests__/financialGeneralCorrection.test.tsx','src/__tests__/fixtures/financialGeneralCorrection.ts']
def exercise(sql,ctx):
 b.exercise.client=exercise.client;b.exercise(sql,ctx)
 owner,other,target=[c.uid() for _ in range(3)]
 for uid in [owner,other]:sql('INSERT INTO auth.users VALUES('+p.u(uid)+');INSERT INTO usuarios(id,email,rol,activo) VALUES('+p.u(uid)+','+p.lit(uid+'@synthetic.invalid')+",'Gerencia',true);")
 income=json.loads(sql('SELECT to_jsonb(i) FROM fin_ingresos i ORDER BY id LIMIT 1;'));income.update(id=target,created_by=owner,updated_by=owner,nombre='Synthetic SDK general source')
 sql('INSERT INTO fin_ingresos SELECT x.* FROM jsonb_populate_record(NULL::fin_ingresos,'+p.js(income)+')x;')
 for month in [1,2]:sql('INSERT INTO hato_produccion_quincenal(id,anio,mes,quincena,litros_total,origen_dato,created_by,fin_ingreso_id) VALUES('+p.u(c.uid())+',2095,'+str(month)+",1,4,'derivado_mensual',"+p.u(owner)+','+p.u(target)+');')
 args=dict(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),owner=owner,other=other,income=target,fields=dict(date=income['fecha'],businessId=income['negocio_id'],categoryId=income['categoria_id'],name='Synthetic SDK reviewed correction',regionId=income['region_id'],mediumId=income['medio_pago_id'],buyerId=income['comprador_id'],value='1001.25'))
 proc=subprocess.run(['node',str(Path(__file__).with_name('financial-general-correction-sdk-native.mjs'))],input=json.dumps(args),text=True,capture_output=True,cwd=ROOT,timeout=60)
 if proc.returncode:
  dest=Path('/tmp/escocia-general-sdk-private.log');dest.touch(mode=0o600,exist_ok=True);dest.write_text(proc.stderr);raise AssertionError('Strict general SDK proof failed; inspect external diagnostics')
 exercise.sdk=json.loads(proc.stdout)
 for label in exercise.sdk['checks']:ctx['check'](True,'general SDK: '+label)
def main():
 a=argparse.ArgumentParser()
 for name in ['evidence-dir','runtime','client','output','private-diagnostics']:a.add_argument('--'+name,type=Path,required=True)
 x=a.parse_args();exercise.client=x.client.resolve();prior=json.loads(REPORT.read_text())
 if any(hashlib.sha256((ROOT/k).read_bytes()).hexdigest()!=v for k,v in prior['source_hashes'].items()):raise ValueError('Published foundation sources changed')
 files=list(dict.fromkeys([REPORT,*[ROOT/k for k in prior['source_hashes']],*[ROOT/k for k in FILES]]));frozen={f:f.read_bytes() for f in files}
 boundary=b.b.b.b.b;base=boundary.b.b.b.b.b.m.b.p.p
 while not hasattr(base,'s'):base=base.p
 catalog,rls,storage,t,hashes,_=base.s.load(x.evidence_dir.resolve());base.install.inputs=(storage,t,rls,catalog)
 if hashes!=prior['snapshot_hashes']:raise ValueError('Private provenance mismatch')
 if x.output.resolve().is_relative_to(x.evidence_dir.resolve()) or x.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(x.runtime.resolve(),x.client.resolve(),x.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=b.install)
 if any(f.read_bytes()!=v for f,v in frozen.items()):raise ValueError('Changing SDK sources cannot be certified')
 result.update(coordinated_candidate_count=64,installed_sdk=dict(sale=b.b.exercise.sdk,general=exercise.sdk),native_general_races=b.exercise.races,source_hashes={str(f.relative_to(ROOT)):hashlib.sha256(v).hexdigest() for f,v in frozen.items()},temporary_database_stopped_and_removed=True,limits=['Six approved private structure snapshots and contained synthetic Auth/PG only;never production.','Strict installed-SDK/owner recovery layer only;actual general form,quantity/metadata/invoice/creation/deletion compatibility remain separate. Existing UI,SQL candidates,grants,imports/service/history unchanged.','Coordinated ganado,writer/reader/runtime/global/capacity/recovery/release remain open.'])
 x.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
