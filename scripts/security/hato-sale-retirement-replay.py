#!/usr/bin/env python3
"""Additive sale tombstone, on local structure-only four-export replay."""
import argparse
import importlib.util
import json
import subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('sale',Path(__file__).with_name('hato-sale-replay.py'))
t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
c,r,lit,js,u=t.c,t.r,t.lit,t.js,t.u
SOURCE=r.ROOT/'src/sql/security-candidates/hato-sale-retirement.sql'
QUERY=Path(__file__).with_name('hato-sale-retirement-baseline-query.sql')
def state_query(sql):
 tables=json.loads(sql("SELECT jsonb_agg(jsonb_build_array(schemaname,tablename) ORDER BY schemaname,tablename) FROM pg_tables WHERE schemaname<>'information_schema' AND schemaname NOT LIKE 'pg_%';"))
 return "SELECT jsonb_object_agg(name,rows) FROM ("+' UNION ALL '.join('SELECT '+lit(a+'.'+b)+" name,(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]') FROM "+r.q(a)+'.'+r.q(b)+' x) rows' for a,b in tables)+') snapshot;'
def public_call(sql,fn,args,owner,ok=True):
 result=sql('BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(owner)+';SELECT public.'+fn+'('+','.join(args)+');COMMIT;',ok);return json.loads(result) if ok else result

def install(sql):
 t.install(sql)
 baseline=sql(QUERY.read_text());Path('/tmp/escocia-sale-retirement-baseline-hash.txt').write_text(baseline)
 # Seed a genuine prepared receipt under25candidates; retirement must not rewrite it.
 owner,animal,key,negocio,category,region,medio=[c.uid() for _ in range(7)];install.dims=[negocio,category,region,medio];install.owner=owner;install.key=key
 sql('INSERT INTO auth.users VALUES('+u(owner)+');INSERT INTO usuarios(id,email,rol,activo) VALUES('+u(owner)+",'retirement@synthetic.invalid','Gerencia',true);INSERT INTO hato_animales(id,numero,nombre,etapa,estado) VALUES("+u(animal)+",795,'Synthetic pre-retirement sale','vaca','activa');INSERT INTO fin_negocios(id,nombre) VALUES("+u(negocio)+",'Hato Lechero');INSERT INTO fin_categorias_ingresos(id,negocio_id,nombre) VALUES("+u(category)+','+u(negocio)+",'Venta de Terneros');INSERT INTO fin_regiones(id,nombre) VALUES("+u(region)+",'Synthetic sale region');INSERT INTO fin_medios_pago(id,nombre) VALUES("+u(medio)+",'Synthetic sale payment');")
 day=sql("SELECT to_char((now() AT TIME ZONE 'America/Bogota')::date,'YYYY-MM-DD');")
 intent=dict(version=1,tipo='terneros',cabezas=1,valor='98765',fecha=day,regionId=region,medioPagoId=medio,compradorId=None,nombre='Synthetic pre-retirement receipt',animals=[dict(id=animal,numero=795,nombre='Synthetic pre-retirement sale')],refs=dict(region=dict(id=region,nombre='Synthetic sale region'),medio=dict(id=medio,nombre='Synthetic sale payment'),comprador=None))
 args=lambda mode,payload=None:[lit(mode),u(key),js(payload) if payload is not None else 'NULL::jsonb',u(owner)]
 public_call(sql,'fn_hato_sale_web',args('prepare',intent),owner);install.receipt=public_call(sql,'fn_hato_sale_web',args('post'),owner)
 before=sql(state_query(sql));source=SOURCE.read_text().replace('RETIREMENT_BASELINE_PENDING',baseline)
 for drift in ("ALTER FUNCTION public.fn_hato_registrar_venta_animales(jsonb) SECURITY DEFINER;","GRANT EXECUTE ON FUNCTION public.fn_hato_registrar_venta_animales(jsonb) TO anon;","ALTER FUNCTION public.fn_hato_sale_web(text,uuid,jsonb,uuid) SET search_path=public;"):
  failed=sql('BEGIN;'+drift+source,False)
  if failed.returncode==0 or 'Unreviewed sale retirement graph' not in failed.stderr or sql(QUERY.read_text())!=baseline or sql(state_query(sql))!=before:raise AssertionError('Sale retirement admission/catalog/domain rollback')
 sql(source)
 if sql(state_query(sql))!=before:raise AssertionError('Retirement installation changed existing domain/private rows')
 install.preserved=True

def exercise(sql,ctx):
 check=ctx['check'];ctx=dict(ctx,sale_dimensions=install.dims)
 check(install.preserved,'additive retirement preserves every existing domain/financial/backup/private proof row')
 call=lambda mode:public_call(sql,'fn_hato_sale_web',[lit(mode),u(install.key),'NULL::jsonb',u(install.owner)],install.owner)
 before=sql(state_query(sql));check(call('status')==install.receipt and call('post')==install.receipt and sql(state_query(sql))==before,'original25-candidate receipt/income/event IDs recover unchanged under26candidates')
 def refuse(label,source,marker):
  before=sql(state_query(sql));failed=sql(source,False)
  if failed.returncode==0 or marker.lower() not in failed.stderr.lower() or sql(state_query(sql))!=before:
   p=Path('/tmp/escocia-sale-retirement-unexpected-private.log');p.touch(mode=0o600,exist_ok=True);p.write_text(failed.stderr);raise AssertionError(label+' refusal/rollback; private diagnostics saved')
  check(True,label+' refuses without any domain/financial/private mutation')
 for role in ('anon','authenticated','service_role'):
  refuse(role+' old070','BEGIN;SET LOCAL ROLE '+role+';SET LOCAL request.jwt.claim.sub='+lit(install.owner)+";SELECT public.fn_hato_registrar_venta_animales('{}'::jsonb);COMMIT;",'permission denied')
  check(sql("SELECT has_function_privilege("+lit(role)+",'public.fn_hato_registrar_venta_animales(jsonb)','EXECUTE');")=='f',role+' has no inherited old070 execution')
 refuse('privileged stale old070',"SELECT public.fn_hato_registrar_venta_animales('{}'::jsonb);",'Legacy sale RPC retired')
 for role in ('anon','authenticated','service_role'):
  refuse(role+' forced regrant tombstone','BEGIN;GRANT EXECUTE ON FUNCTION public.fn_hato_registrar_venta_animales(jsonb) TO '+role+';SET LOCAL ROLE '+role+";SELECT public.fn_hato_registrar_venta_animales('{}'::jsonb);COMMIT;",'Legacy sale RPC retired')
 for ddl in ("GRANT EXECUTE ON FUNCTION public.fn_hato_registrar_venta_animales(jsonb) TO authenticated;","ALTER FUNCTION public.fn_hato_registrar_venta_animales(jsonb) SECURITY DEFINER;","ALTER FUNCTION public.fn_hato_registrar_venta_animales(jsonb) SET search_path=public;"):
  refuse('prepared API detects retired drift','BEGIN;'+ddl+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(install.owner)+';SELECT public.fn_hato_sale_web('+lit('status')+','+u(install.key)+',NULL::jsonb,'+u(install.owner)+');COMMIT;','Unreviewed retired sale boundary')
 # Reuse the validated actual caller/native SDK exercise with this retirement installed.
 t.exercise.client=exercise.client;t.exercise(sql,ctx);exercise.sdk=t.exercise.sdk
 proc=subprocess.run(['node',str(Path(__file__).with_name('hato-sale-retirement-inventory.mjs'))],capture_output=True,text=True,cwd=r.ROOT,timeout=30)
 if proc.returncode:raise AssertionError('Actual caller inventory failed')
 exercise.inventory=json.loads(proc.stdout);check(exercise.inventory['legacySaleCalls']==0,'845-file actual source-call inventory has no obsolete RPC/helper invocation')

def main():
 a=argparse.ArgumentParser();a.add_argument('--evidence-dir',type=Path,required=True)
 for n in ('runtime','client','output','private-diagnostics'):a.add_argument('--'+n,type=Path,required=True)
 args=a.parse_args();exercise.client=args.client.resolve();files=[*sorted((r.ROOT/'src/sql/security-candidates').glob('*.sql')),Path(__file__),QUERY,Path(__file__).with_name('hato-sale-replay.py'),Path(__file__).with_name('hato-sale-native.mjs'),Path(__file__).with_name('hato-sale-retirement-inventory.mjs'),r.ROOT/'src/components/hato/hooks/useRegistrarSalidaHato.ts',r.ROOT/'src/components/hato/hooks/useVentaAnimalesHato.ts',r.ROOT/'src/components/hato/components/VentaAnimalesHatoDialog.tsx',*[r.ROOT/'src/utils/hato'/n for n in ('hatoSaleProtocol.ts','hatoSaleBrowserAttempt.ts')]];sources={p:p.read_bytes() for p in files};catalog,rls,hashes=r.load(args.evidence_dir.resolve())
 if args.output.resolve().is_relative_to(args.evidence_dir.resolve()) or args.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(args.runtime.resolve(),args.client.resolve(),args.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(p.read_bytes()!=b for p,b in sources.items()) or 'RETIREMENT_BASELINE_PENDING' in SOURCE.read_text():raise ValueError('Changing/provisional retirement source cannot be certified')
 result.update(coordinated_candidate_count=26,admission_rollback_probes=3,sdk_proof=exercise.sdk,caller_inventory=exercise.inventory,source_hashes={str(p.relative_to(r.ROOT)):r.p.digest(b) for p,b in sources.items()},temporary_database_stopped_and_removed=True,limits=['Synthetic private Unix socket/Auth/HTTP only; never production.','Generic direct grants, stale deployed direct-table clients and remaining lifecycle/reader/runtime/global/capacity/recovery gates remain open.'])
 args.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
