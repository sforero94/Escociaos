#!/usr/bin/env python3
"""Bounded financial retirement admission on unchanged59 candidates; never production."""
import argparse,importlib.util,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('financial_retirement_prior',Path(__file__).with_name('measured-income-invoice-release-browser-replay.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
c,r,p=b.c,b.r,b.p
SCHEMA=Path(__file__).with_name('financial-writer-retirement-schema.sql')
INVENTORY=r.ROOT/'docs/security-integrity/financial-writer-retirement-callers.json'
def exercise(sql,ctx):
 b.exercise(sql,ctx);check=ctx['check'];query=p.query(sql);before=sql(query);schema=sql(SCHEMA.read_text());exercise.schema=json.loads(schema)
 owner=c.uid();sql('INSERT INTO auth.users VALUES('+p.u(owner)+');INSERT INTO usuarios(id,email,rol,activo) VALUES('+p.u(owner)+','+p.lit(owner+'@synthetic.invalid')+",'Gerencia',true);")
 pair=json.loads(sql("SELECT jsonb_build_object('production',to_jsonb(q),'income',to_jsonb(i)) FROM hato_produccion_quincenal q JOIN fin_ingresos i ON i.id=q.fin_ingreso_id WHERE q.origen_dato='medido' AND EXISTS(SELECT 1 FROM hato_quincena.audit a WHERE a.receipt->'after'->'production'->>'id'=q.id::text) ORDER BY q.id LIMIT 1;"));q,i=pair['production'],pair['income']
 def probe(label,mutation,verify):
  original=sql(query)
  out=sql('BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+p.lit(owner)+';'+mutation+'RESET ROLE;'+verify+'ROLLBACK;')
  check(out.splitlines()[-1]=='t' and sql(query)==original,label+' reproduced then rolled back with every domain/private/Storage/backup row unchanged')
 probe('ordinary direct measured-income financial bypass','UPDATE fin_ingresos SET valor=valor+1 WHERE id='+p.u(i['id'])+';',"SELECT (SELECT valor FROM fin_ingresos WHERE id="+p.u(i['id'])+')='+p.lit(str(i['valor']))+'::numeric+1;')
 probe('ordinary direct production source bypass','UPDATE hato_produccion_quincenal SET notas=\'Synthetic retirement admission\' WHERE id='+p.u(q['id'])+';',"SELECT (SELECT notas FROM hato_produccion_quincenal WHERE id="+p.u(q['id'])+")='Synthetic retirement admission';")
 payload=dict(quincena_id=q['id'],anio=q['anio'],mes=q['mes'],quincena=q['quincena'],fecha_inicio=q['fecha_inicio'],fecha_fin=q['fecha_fin'],litros_total=i['cantidad'],litros_pomar_confirmado=q['litros_pomar_confirmado'],num_vacas_ordeno=q['num_vacas_ordeno'],notas='Synthetic legacy bypass',fin_ingreso=dict(fecha=i['fecha'],valor_bruto=100000,region_id=i['region_id'],medio_pago_id=i['medio_pago_id'],comprador_id=i['comprador_id'],nombre='Synthetic legacy bypass'))
 probe('ordinary uncalled legacy save bypass','SELECT fn_hato_guardar_quincena_venta('+p.js(payload)+');',"SELECT (SELECT notas FROM hato_produccion_quincenal WHERE id="+p.u(q['id'])+")='Synthetic legacy bypass';")
 probe('ordinary uncalled legacy delete bypass','SELECT fn_hato_eliminar_quincena_venta('+p.u(q['id'])+');','SELECT NOT EXISTS(SELECT 1 FROM hato_produccion_quincenal WHERE id='+p.u(q['id'])+') AND NOT EXISTS(SELECT 1 FROM fin_ingresos WHERE id='+p.u(i['id'])+');')
 check(sql(SCHEMA.read_text())==schema,'admission preserves exact function/trigger/policy/table and column ACL metadata')
 # Remove only the explicitly synthetic fresh actor fixture by rollback-equivalent local cleanup.
 sql('DELETE FROM usuarios WHERE id='+p.u(owner)+';DELETE FROM auth.users WHERE id='+p.u(owner)+';')
 check(sql(query)==before,'all new admission probes and synthetic actor leave the complete prior graph unchanged')
def main():
 ap=argparse.ArgumentParser()
 for name in ['evidence-dir','runtime','client','output','private-diagnostics']:ap.add_argument('--'+name,type=Path,required=True)
 x=ap.parse_args();b.exercise.client=x.client.resolve();b.b.b.exercise.client=x.client.resolve();b.b.b.b.m.exercise.client=x.client.resolve();b.b.b.b.m.b.exercise.client=x.client.resolve()
 inv=json.loads(INVENTORY.read_text());assert all(r.p.digest((r.ROOT/k).read_bytes())==v for k,v in inv['source_hashes'].items())
 prior=json.loads((r.ROOT/'docs/security-integrity/measured-income-invoice-release-browser-replay.json').read_text());files=list(dict.fromkeys([Path(__file__),SCHEMA,INVENTORY,Path(__file__).with_name('financial-writer-retirement-inventory.mjs'),*[r.ROOT/k for k in json.loads(INVENTORY.read_text())['source_hashes']],*[r.ROOT/k for k in prior['source_hashes']]]));frozen={f:f.read_bytes() for f in files};base=b.b.b.b.m.b.p.p
 while not hasattr(base,'s'):base=base.p
 catalog,rls,storage,t,hashes,_=base.s.load(x.evidence_dir.resolve());base.install.inputs=(storage,t,rls,catalog)
 if x.output.resolve().is_relative_to(x.evidence_dir.resolve()) or x.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(x.runtime.resolve(),x.client.resolve(),x.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=b.b.install)
 if any(f.read_bytes()!=v for f,v in frozen.items()):raise ValueError('Changing financial retirement admission sources cannot be certified')
 result.update(coordinated_candidate_count=59,installed_sdk={'prior':b.b.b.b.m.exercise.sdk,'origin_caller':b.b.b.exercise.sdk,'terminal_caller':b.exercise.sdk},schema_admission=exercise.schema,runtime_candidates_callers_grants_unchanged=True,source_hashes={str(f.relative_to(r.ROOT)):r.p.digest(v) for f,v in frozen.items()},temporary_database_stopped_and_removed=True,limits=['Six approved local private structure exports and contained synthetic PostgreSQL only; never production.','Admission only: no application, candidate, grant or history change. Exact local effective ACLs and rolled-back counterexamples do not certify hosted or global/transitive reachability.'])
 x.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
