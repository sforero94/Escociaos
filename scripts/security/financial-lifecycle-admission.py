#!/usr/bin/env python3
"""Read-only61-candidate admission plus fully rolled-back synthetic writer probes."""
import hashlib,importlib.util,json,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('financial_lifecycle_prior',Path(__file__).with_name('measured-income-boundary-replay.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
r,p=b.r,b.p
ROOT=r.ROOT
SCHEMA=Path(__file__).with_name('financial-lifecycle-schema.sql')
PROBES=Path(__file__).with_name('financial-lifecycle-probes.sql')
INVENTORY=ROOT/'docs/security-integrity/financial-lifecycle-callers.json'
original_exercise=b.exercise

def exercise(sql,ctx):
 original_exercise(sql,ctx)
 check=ctx['check'];query=p.query(sql);before=sql(query);catalog=sql(SCHEMA.read_text());exercise.schema=json.loads(catalog)
 program=PROBES.read_text().replace('{{DOMAIN_QUERY}}',query.rstrip(';'))
 for key in ['OWNER','ANIMAL','SALEKEY','TX','INCOME']:program=program.replace('{{'+key+'}}',p.u(b.c.uid()))
 exercise.admission=json.loads(sql(program))
 check(sql(query)==before,'entire new admission fixtures/protected sale receipts/counterexamples rolled back without domain/private/Storage/backup history changes')
 check(sql(SCHEMA.read_text())==catalog,'admission preserves exact table/column ACLs, functions, triggers, RLS and incoming/outgoing FK metadata')
 for fact in exercise.admission['checks']:check(True,'admission: '+fact)
 # Exact snapshot has no movement FK on retained weight history; never infer its provenance.
 history=[f for f in exercise.schema['outgoing_fks'] if f['from']=='gan_pesos_historico']
 check(not any(f['to']=='gan_movimientos' for f in history),'retained weight history has no movement FK; matching date/potrero/weight cannot establish ownership')

def main():
 # Extend the published runner followup; installation, deadlines and SDK proof stay unchanged.
 inv=json.loads(INVENTORY.read_text());assert all(hashlib.sha256((ROOT/k).read_bytes()).hexdigest()==v for k,v in inv['source_hashes'].items())
 files=[Path(__file__),SCHEMA,PROBES,INVENTORY,Path(__file__).with_name('financial-lifecycle-inventory.mjs'),*[ROOT/k for k in inv['source_hashes']]]
 frozen={f:f.read_bytes() for f in files};b.exercise=exercise;b.main()
 if any(f.read_bytes()!=data for f,data in frozen.items()):raise ValueError('Changing financial lifecycle sources cannot be certified')
 output=Path(sys.argv[sys.argv.index('--output')+1]);result=json.loads(output.read_text())
 result.update(financial_lifecycle_admission=exercise.admission,schema_admission=exercise.schema,application_candidates_grants_unchanged=True)
 result['source_hashes'].update({str(f.relative_to(ROOT)):hashlib.sha256(data).hexdigest() for f,data in frozen.items()})
 result['limits'].append('General/shared/ganado admission only. All new fixtures/protected receipt/counterexample rows roll back. No history repair, inferred weight provenance, financial/grant/application change or hosted/transitive reachability certification.')
 output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
