#!/usr/bin/env python3
"""Real installed SDK and prepared browser protocol against local PG only."""
import argparse
import importlib.util
import json
from pathlib import Path
import subprocess

spec=importlib.util.spec_from_file_location('confirmation',Path(__file__).with_name('clinical-step-confirmation-replay.py'))
t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
c,r,lit,js,u=t.c,t.r,t.lit,t.js,t.u
SCRIPT=Path(__file__).with_name('clinical-browser-native.mjs')
CLIENT_FILES=[r.ROOT/'src/utils/hato'/n for n in ('clinicalStepConfirmationProtocol.ts','clinicalStepBrowserAttempt.ts')]


def install(sql):
 sql('BEGIN;'+''.join(r.transaction_body(p.read_text()) for p in (t.t.t.SOURCE,t.t.SOURCE,t.SOURCE))+'COMMIT;')


def exercise(sql,ctx):
 results=[];base=ctx['state_query']().rstrip(';')
 state_query="SELECT jsonb_build_object('base',("+base+"),'requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM clinical_step_confirmation.requests x),'audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM clinical_step_confirmation.audit x));"
 animal=ctx['treated']['payload']['animalId']
 for mode in ('lost-post','owner-switch'):
  animal_row=json.loads(sql('SELECT to_jsonb(a) FROM hato_animales a WHERE id='+u(animal)+';'))
  p=dict(version=1,animalId=animal,nombre='Synthetic installed SDK '+mode,fechaInicio='2026-10-14',nota=None,fechaProximoPaso='2026-10-14',descripcionPaso='Synthetic native SDK step',observedAnimal=animal_row)
  key=c.uid();args=[lit('prepare'),u(key),js(p),u(c.OWNER)];ctx['call']('fn_hato_treatment_create_web',args);args[0]=lit('post');created=ctx['call']('fn_hato_treatment_create_web',args)
  step=created['receipt']['after']['steps'][0]['id'];alert=c.uid()
  sql('INSERT INTO hato_alertas(id,tipo,animal_id,regla_clave,fecha_programada,estado,paso_id) VALUES('+u(alert)+",'tratamiento_paso',"+u(animal)+','+lit('synthetic-sdk-'+alert)+",'2026-10-14','enviada',"+u(step)+');')
  data=dict(mode=mode,socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),owner=c.OWNER,other=c.OTHER,intent=dict(version=1,stepId=step,fechaEjecutada='2026-10-14',alertId=alert),stateQuery=state_query)
  proc=subprocess.run(['node',str(SCRIPT)],input=json.dumps(data),text=True,capture_output=True,cwd=r.ROOT,timeout=60)
  if proc.returncode:raise ValueError('Local SDK proof failed: '+proc.stderr[:1000])
  result=json.loads(proc.stdout);results.append(dict(mode=mode,**result));ctx['check'](result['assertions']>=5,'installed SDK/native '+mode+' proof passes with exact source receiver')
 exercise.result=results


def main():
 a=argparse.ArgumentParser(description=__doc__);a.add_argument('evidence_dir',type=Path)
 for name in ('runtime','client','output','private-diagnostics'):a.add_argument('--'+name,type=Path,required=True)
 args=a.parse_args();evidence=args.evidence_dir.resolve();output=args.output.resolve();exercise.client=args.client.resolve()
 if output.is_relative_to(evidence) or output.name.endswith('-private.json') or args.private_diagnostics.resolve().is_relative_to(evidence):raise ValueError('Cannot overwrite private evidence')
 files=[SCRIPT,Path(__file__),t.SOURCE,*CLIENT_FILES];sources={p:p.read_bytes() for p in files}
 catalog,rls,hashes=r.load(evidence)
 with r.database(args.runtime.resolve(),exercise.client,args.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(p.read_bytes()!=b for p,b in sources.items()):raise ValueError('Source changed during SDK replay')
 result.update(sdk_proofs=exercise.result,source_hashes={str(p.relative_to(r.ROOT)):r.p.digest(b) for p,b in sources.items()},temporary_database_stopped_and_removed=True)
 result['native_sdk_assertions']=sum(p['assertions'] for p in exercise.result)
 result['limits']=['Actual installed SDK/protocol and local PG; mocked HTTP transport/synthetic Auth, not hosted JWT verification or deployment certification.','Browser only; bot/native conversation callers and direct UPDATE/177 retirement remain open.']
 output.write_text(json.dumps(result,indent=2)+'\n')

if __name__=='__main__':main()
