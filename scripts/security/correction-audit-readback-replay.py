#!/usr/bin/env python3
"""Prospective correction source audit/readback checks on local replay only."""
import argparse
import importlib.util
import json
from pathlib import Path
spec=importlib.util.spec_from_file_location('storage',Path(__file__).with_name('correction-audit-replay.py'))
s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)
t,c,r,lit,js,u=s.t,s.c,s.r,s.lit,s.js,s.u
SOURCE=r.ROOT/'src/sql/security-candidates/correction-audit-readbacks.sql'


def install(sql):
 s.install(sql)
 before=sql(t.CATALOG)
 result=sql("BEGIN;ALTER FUNCTION public.fn_hato_registrar_correccion() SECURITY INVOKER;"+r.transaction_body(SOURCE.read_text())+'COMMIT;',False)
 if result.returncode==0 or 'Unreviewed correction source writer' not in result.stderr or sql(t.CATALOG)!=before:raise AssertionError('source admission drift')
 sql(SOURCE.read_text())


def exercise(sql,ctx):
 check=ctx['check'];base=ctx['state_query']().rstrip(';')
 state=lambda:sql("SELECT jsonb_build_object('base',("+base+"),'requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM clinical_step_confirmation.requests x),'audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM clinical_step_confirmation.audit x));")
 animal=ctx['treated']['payload']['animalId'];app=sql('SELECT id FROM aplicaciones ORDER BY id LIMIT 1;')
 for domain,table,id,column in [('hato','hato_animales',animal,'nombre'),('globalgap','aplicaciones',app,'proposito')]:
  audit=domain+'_correcciones'
  for label,body in [('suppression','RETURN NULL;'),('actor corruption','NEW.corregido_por=NULL;RETURN NEW;'),('timestamp corruption',"NEW.corregido_en=NEW.corregido_en-interval '1 second';RETURN NEW;"),('source corruption',"NEW.datos_anteriores='{}';RETURN NEW;")]:
   before=state();fault='CREATE FUNCTION public.synthetic_readback_fault() RETURNS trigger LANGUAGE plpgsql AS $fault$ BEGIN '+body+' END $fault$;CREATE TRIGGER synthetic_readback_fault BEFORE INSERT ON '+audit+' FOR EACH ROW EXECUTE FUNCTION public.synthetic_readback_fault();'
   result=sql('BEGIN;'+fault+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(c.OWNER)+';UPDATE '+table+' SET '+column+"='Synthetic refused readback' WHERE id="+u(id)+';COMMIT;',False)
   check(result.returncode!=0 and 'Correction audit insert suppressed or changed' in result.stderr and state()==before,domain+' '+label+' aborts source/domain/control/audit together')
  original=json.loads(sql('SELECT to_jsonb(x) FROM '+table+' x WHERE id='+u(id)+';'))
  sql('BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(c.OWNER)+';UPDATE '+table+' SET '+column+"='Synthetic exact readback' WHERE id="+u(id)+';COMMIT;')
  actual=json.loads(sql('SELECT to_jsonb(x) FROM '+table+' x WHERE id='+u(id)+';'))
  proof=json.loads(sql('SELECT to_jsonb(x) FROM '+audit+' x WHERE fila_id='+u(id)+' ORDER BY corregido_en DESC,id DESC LIMIT 1;'))
  check(proof['corregido_por']==c.OWNER and proof['datos_anteriores']==original and proof['datos_nuevos']==actual,domain+' exact source correction independently matches durable audit')
  before=state();update='UPDATE '+table+' SET '+column+"='Synthetic exact readback' WHERE id="+u(id)+';'
  # The application timestamp trigger makes a later transaction a real change.
  # Within one transaction its second identical UPDATE is a genuine no-op.
  result=sql('BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(c.OWNER)+';'+update+'DO $noop$ DECLARE n bigint;BEGIN SELECT count(*) INTO n FROM '+audit+';'+update+'IF (SELECT count(*) FROM '+audit+")<>n THEN RAISE EXCEPTION 'No-op created audit';END IF;END $noop$;ROLLBACK;",False)
  check(result.returncode==0 and state()==before,domain+' actual same-transaction no-op adds no audit; rolled-back fixture preserves full state')
 exercise.result=dict(source_suppression_and_corruption_cases=8,legacy_null_uid_service_lane_unchanged=True)


def main():
 a=argparse.ArgumentParser(description=__doc__);a.add_argument('evidence_dir',type=Path)
 for name in ('runtime','client','output','private-diagnostics'):a.add_argument('--'+name,type=Path,required=True)
 args=a.parse_args();evidence=args.evidence_dir.resolve();output=args.output.resolve()
 if output.is_relative_to(evidence) or output.name.endswith('-private.json') or args.private_diagnostics.resolve().is_relative_to(evidence):raise ValueError('Cannot overwrite private evidence')
 files=[SOURCE,Path(__file__),s.SOURCE];source_bytes={p:p.read_bytes() for p in files}
 catalog,rls,hashes=r.load(evidence)
 with r.database(args.runtime.resolve(),args.client.resolve(),args.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(p.read_bytes()!=v for p,v in source_bytes.items()):raise ValueError('Source changed during replay')
 result.update(exercise.result,source_hashes={str(p.relative_to(r.ROOT)):r.p.digest(v) for p,v in source_bytes.items()},temporary_database_stopped_and_removed=True)
 result['assertions']+=1+len(s.install.result['installation_checks'])+len(s.install.result['pre_retirement_local_bypasses'])
 result['limits']=['Local synthetic Auth/data only; no hosted/global certificate.','Exact prospective human correction audit/readbacks; service NULL-UID audit omission and lifecycle CAS/retry/callers remain open.']
 output.write_text(json.dumps(result,indent=2)+'\n')

if __name__=='__main__':main()
