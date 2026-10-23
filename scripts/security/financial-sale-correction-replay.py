#!/usr/bin/env python3
"""Option2 prospective sale financial correction on exact local62-candidate graph."""
import hashlib,importlib.util,json,sys,subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('sale_correction_prior',Path(__file__).with_name('financial-lifecycle-admission.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
r,p=b.r,b.p
SOURCE=r.ROOT/'src/sql/security-candidates/financial-sale-correction.sql'
PROBES=Path(__file__).with_name('financial-sale-correction-probes.sql')
old_install=b.b.install;old_exercise=b.exercise

def install(sql):
 old_install(sql);query=p.query(sql);before=sql(query);authority=sql(b.SCHEMA.read_text())
 sql(SOURCE.read_text())
 if sql(query)!=before:raise AssertionError('Sale correction installation changed existing rows')
 before_metadata=json.loads(authority);after_metadata=json.loads(sql(b.SCHEMA.read_text()))
 for section in ['relations','effective_table_acl','effective_column_acl','policies','incoming_fks','outgoing_fks','trigger_bindings']:
  if before_metadata[section]!=after_metadata[section]:raise AssertionError('Changed preserved sale/general authority: '+section)
 print('PASS candidate62 financial-only sale correction installed without existing row/grant/policy/link/trigger changes',flush=True)

def exercise(sql,ctx):
 old_exercise(sql,ctx);before=sql(p.query(sql));authority=sql(b.SCHEMA.read_text())
 program=PROBES.read_text().replace('{{DOMAIN_QUERY}}',p.query(sql).rstrip(';'))
 for key in ['OWNER','ANIMAL','SALEKEY','TX','INCOME']:program=program.replace('{{'+key+'}}',p.u(b.b.c.uid()))
 exercise.proof=json.loads(sql(program))
 ctx['check'](sql(p.query(sql))==before,'new sale correction fixtures/receipts/audits and adversarial probes entirely rolled back')
 ctx['check'](sql(b.SCHEMA.read_text())==authority,'sale correction proof preserves original exact financial/caller schema baseline')
 for label in exercise.proof['checks']:ctx['check'](True,'sale correction: '+label)


 # Fresh committed synthetic original is used only for real multi-session races.
 fixture=(r.ROOT/'scripts/security/financial-lifecycle-probes.sql').read_text();fixture=fixture[:fixture.index(" facts=facts||jsonb_build_array('genuine")]
 fixture+=" INSERT INTO lifecycle_admission_result VALUES(jsonb_build_object('owner',owner_id,'income',income_id));END $admission$;SELECT value FROM lifecycle_admission_result;COMMIT;"
 fixture=fixture.replace('{{DOMAIN_QUERY}}',p.query(sql).rstrip(';'))
 for key in ['OWNER','ANIMAL','SALEKEY','TX','INCOME']:fixture=fixture.replace('{{'+key+'}}',p.u(b.b.c.uid()))
 context=json.loads(sql(fixture));context.update(socket=sql('SHOW unix_socket_directories;'),client=str(Path(sys.argv[sys.argv.index('--client')+1]).resolve()),stateQuery=p.query(sql))
 proc=subprocess.run(['node',str(Path(__file__).with_name('financial-sale-correction-native.mjs'))],input=json.dumps(context),text=True,capture_output=True,timeout=60)
 if proc.returncode:
  dest=Path('/tmp/escocia-sale-correction-races-private.log');dest.touch(mode=0o600,exist_ok=True);dest.write_text(proc.stderr);raise AssertionError('Local sale correction race failed; inspect external diagnostics')
 exercise.proof['native_races']=json.loads(proc.stdout)
 for label in exercise.proof['native_races']['checks']:ctx['check'](True,'sale correction race: '+label)
 ctx['check'](sql(b.SCHEMA.read_text())==authority,'new correction race final exact financial schema/authority unchanged')

def main():
 files=[Path(__file__),SOURCE,PROBES,Path(__file__).with_name('build-financial-sale-correction.py'),Path(__file__).with_name('financial-sale-correction-native.mjs'),r.ROOT/'docs/security-integrity/financial-lifecycle-admission.json'];frozen={f:f.read_bytes() for f in files}
 b.b.install=install;b.exercise=exercise;b.main()
 if any(f.read_bytes()!=v for f,v in frozen.items()):raise ValueError('Changing sale correction sources cannot be certified')
 output=Path(sys.argv[sys.argv.index('--output')+1]);x=json.loads(output.read_text());x.update(coordinated_candidate_count=62,sale_financial_correction=exercise.proof)
 x.pop('application_candidates_grants_unchanged',None)
 x.update(application_sources_unchanged=True,existing_table_column_grants_preserved=True,sale_correction_candidate_installed=True)
 x['limits']=[('Inherited candidate61 admission phase: '+limit) if limit.startswith('General/shared/ganado admission only.') else limit for limit in x['limits']]
 x['candidate_hashes'][str(SOURCE.relative_to(r.ROOT))]=hashlib.sha256(frozen[SOURCE]).hexdigest();x['source_hashes'].update({str(f.relative_to(r.ROOT)):hashlib.sha256(v).hexdigest() for f,v in frozen.items()})
 x['limits'].append('Option2 linked protected-sale financial correction foundation only; no deletion/event/animal-state/history mutation. Actual caller, direct-writer retirement, general/shared finance and coupled ganado remain separate gates.')
 output.write_text(json.dumps(x,indent=2)+'\n')
if __name__=='__main__':main()
