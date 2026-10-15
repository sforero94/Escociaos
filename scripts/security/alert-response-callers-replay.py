#!/usr/bin/env python3
"""Actual browser/native alert response callers and installed SDK on local replay only."""
import argparse
import importlib.util
import json
from pathlib import Path
import subprocess
spec=importlib.util.spec_from_file_location('foundation',Path(__file__).with_name('alert-response-replay.py'))
t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
c,r,lit,u=t.c,t.r,t.lit,t.u
SCRIPTS=[Path(__file__).with_name('alert-response-'+kind+'-native.mjs') for kind in ('browser','telegram')]
CLIENT_FILES=[r.ROOT/'src/utils/hato'/name for name in ('alertResponseProtocol.ts','alertResponseBrowserAttempt.ts')]+[r.ROOT/'src/supabase/functions/server/telegram'/name for name in ('alertResponse.ts','alertResponseProtocol.ts','bot.ts','types.ts')]+[r.ROOT/'src/components/hato'/name for name in ('AlertasView.tsx','components/AlertResponseDialog.tsx','hooks/useAlertResponse.ts','hooks/useHatoAlertas.ts')]


def exercise(sql,ctx):
 results=[];base=ctx['state_query']().rstrip(';')
 state_query="SELECT jsonb_build_object('base',("+base+"),'clinical_requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM clinical_step_confirmation.requests x),'clinical_audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM clinical_step_confirmation.audit x),'requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM alert_response.requests x),'audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM alert_response.audit x));"
 sql('UPDATE telegram_usuarios SET activo=true,usuario_id=NULL WHERE telegram_id=789;')
 for mode in ('lost-post','owner-switch','private-recovery'):
  animal,alert=c.uid(),c.uid();name='Synthetic native Telegram' if mode=='private-recovery' else 'Synthetic installed browser'
  sql('INSERT INTO hato_animales(id,nombre,etapa,estado) VALUES('+u(animal)+','+lit(name)+",'vaca','activa');INSERT INTO hato_alertas(id,tipo,animal_id,regla_clave,fecha_programada,estado) VALUES("+u(alert)+",'secado_due',"+u(animal)+','+lit('synthetic-callers-'+alert)+",'2026-10-14','enviada');")
  data=dict(mode=mode,socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),owner=c.OWNER,other=c.OTHER,intent=dict(version=1,alertId=alert,respuesta='si',fecha='2026-10-14'),stateQuery=state_query)
  script=SCRIPTS[1 if mode=='private-recovery' else 0]
  proc=subprocess.run(['node',str(script)],input=json.dumps(data),text=True,capture_output=True,cwd=r.ROOT,timeout=60)
  if proc.returncode:raise ValueError('Local caller proof failed: '+proc.stderr[:1200])
  result=json.loads(proc.stdout);results.append(dict(mode=mode,**result));ctx['check'](result['assertions']>=5,'actual alert response caller/native '+mode+' passes exact source receiver')
 exercise.result=results


def main():
 a=argparse.ArgumentParser(description=__doc__);a.add_argument('evidence_dir',type=Path)
 for name in ('runtime','client','output','private-diagnostics'):a.add_argument('--'+name,type=Path,required=True)
 args=a.parse_args();evidence=args.evidence_dir.resolve();output=args.output.resolve();exercise.client=args.client.resolve()
 if output.is_relative_to(evidence) or output.name.endswith('-private.json') or args.private_diagnostics.resolve().is_relative_to(evidence):raise ValueError('Cannot overwrite private evidence')
 files=[*SCRIPTS,Path(__file__),t.SOURCE,*CLIENT_FILES];sources={p:p.read_bytes() for p in files}
 catalog,rls,hashes=r.load(evidence)
 with r.database(args.runtime.resolve(),exercise.client,args.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=t.install)
 if any(p.read_bytes()!=b for p,b in sources.items()):raise ValueError('Source changed during caller replay')
 result.update(sdk_proofs=exercise.result,source_hashes={str(p.relative_to(r.ROOT)):r.p.digest(b) for p,b in sources.items()},temporary_database_stopped_and_removed=True)
 result['native_sdk_assertions']=sum(p['assertions'] for p in exercise.result)
 result['limits']=['Installed SDK/actual caller source/local PG only; mocked HTTP and synthetic Auth do not certify hosted JWT/webhook or conversation persistence.','Direct alert/event grants unchanged; manual/edit/bulk/cron and other lifecycle/writer/reader/global/runtime/recovery review remain open.']
 output.write_text(json.dumps(result,indent=2)+'\n')

if __name__=='__main__':main()
