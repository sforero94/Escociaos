#!/usr/bin/env python3
"""Prepared sale on the four-export synthetic local graph only."""
import argparse
import concurrent.futures
import importlib.util
import json
import subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('reactivation',Path(__file__).with_name('hato-reactivation-replay.py'))
t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
c,r,lit,js,u=t.c,t.r,t.lit,t.js,t.u
SOURCE=r.ROOT/'src/sql/security-candidates/hato-sale.sql'
def install(sql):
 t.install(sql)
 baseline=sql(Path(__file__).with_name('hato-sale-baseline-query.sql').read_text())
 if baseline!='69463f3ecb18f1ffee565aafda0bb50b':raise AssertionError('Unreviewed sale twenty-seven-relation baseline')
 for drift,marker in (("ALTER TABLE fin_ingresos ADD COLUMN synthetic_unreviewed boolean;","Unreviewed sale source graph"),("ALTER TABLE hato_animales FORCE ROW LEVEL SECURITY;","Unreviewed sale source graph"),("ALTER FUNCTION hato_death.snapshot(uuid) SET search_path=public;","Unreviewed sale snapshot helper")):
  failed=sql('BEGIN;'+drift+SOURCE.read_text(),False)
  if failed.returncode==0 or marker not in failed.stderr or sql("SELECT to_regnamespace('hato_sale') IS NULL;")!='t':raise AssertionError('Sale admission/catalog rollback')
 sql(SOURCE.read_text())

def exercise(sql,ctx):
 check,call=ctx['check'],ctx['call'];sql("UPDATE usuarios SET rol='Gerencia' WHERE id="+u(c.OWNER)+';')
 tables=json.loads(sql("SELECT jsonb_agg(jsonb_build_array(schemaname,tablename) ORDER BY schemaname,tablename) FROM pg_tables WHERE schemaname<>'information_schema' AND schemaname NOT LIKE 'pg_%';"))
 query="SELECT jsonb_object_agg(name,rows) FROM ("+' UNION ALL '.join('SELECT '+lit(a+'.'+b)+" name,(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]') FROM "+r.q(a)+'.'+r.q(b)+' x) rows' for a,b in tables)+') snapshot;'
 state=lambda:sql(query)
 def sale(mode,key,intent=None,owner=c.OWNER,ok=True):return call('fn_hato_sale_web',[lit(mode),u(key),js(intent) if intent is not None else 'NULL::jsonb',u(owner)],actor=owner,ok=ok)
 negocio,cat,region,medio=[c.uid() for _ in range(4)];sql('INSERT INTO fin_negocios(id,nombre) VALUES('+u(negocio)+",'Hato Lechero');INSERT INTO fin_categorias_ingresos(id,negocio_id,nombre) VALUES("+u(cat)+','+u(negocio)+",'Venta de Terneros');INSERT INTO fin_regiones(id,nombre) VALUES("+u(region)+",'Synthetic sale region');INSERT INTO fin_medios_pago(id,nombre) VALUES("+u(medio)+",'Synthetic sale payment');")
 target=ctx['treated']['payload']['animalId'];a=json.loads(sql('SELECT to_jsonb(x) FROM hato_animales x WHERE id='+u(target)+';'));day=sql("SELECT to_char((now() AT TIME ZONE 'America/Bogota')::date,'YYYY-MM-DD');")
 p=dict(version=1,tipo='terneros',cabezas=1,valor='123456',fecha=day,regionId=region,medioPagoId=medio,compradorId=None,nombre='Synthetic sale',animals=[{k:a[k] for k in ('id','numero','nombre')}],refs=dict(region=dict(id=region,nombre='Synthetic sale region'),medio=dict(id=medio,nombre='Synthetic sale payment'),comprador=None))
 key=c.uid();prepared=sale('prepare',key,p);check(prepared['state']=='pending','sale reserves original graph/income/event IDs without posting')
 def refuse(label,fn,marker):
  before=state();failed=fn()
  if failed.returncode==0 or marker.lower() not in failed.stderr.lower() or state()!=before:
   path=Path('/tmp/escocia-sale-unexpected-private.log');path.touch(mode=0o600,exist_ok=True);path.write_text(failed.stderr);raise AssertionError(label+' refusal/rollback; private diagnostics saved')
  check(True,label+' refuses with complete domain/financial/proof rollback')
 def raw(ddl,request_key=key):return sql('BEGIN;'+ddl+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(c.OWNER)+';SELECT fn_hato_sale_web('+lit('post')+','+u(request_key)+',NULL::jsonb,'+u(c.OWNER)+');COMMIT;',False)
 refuse('stale animal',lambda:raw('UPDATE hato_animales SET notas=\'Synthetic concurrent edit\' WHERE id='+u(target)+';'),'source graph changed')
 for table,event,body,marker in [('public.fin_ingresos','BEFORE INSERT','RETURN NULL;','income suppressed'),('public.hato_eventos','BEFORE INSERT','RETURN NULL;','event suppressed'),('public.hato_animales','BEFORE UPDATE','RETURN NULL;','animal suppressed'),('public.hato_correcciones','BEFORE INSERT','RETURN NULL;','correction'),('hato_sale.audit','BEFORE INSERT','RETURN NULL;','audit suppressed'),('hato_sale.requests','BEFORE UPDATE','RETURN NULL;','control suppressed')]:
  ddl='CREATE FUNCTION public.synthetic_sale_fault() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN '+body+' END $f$;CREATE TRIGGER synthetic_sale_fault '+event+' ON '+table+' FOR EACH ROW EXECUTE FUNCTION public.synthetic_sale_fault();';refuse(table,lambda ddl=ddl:raw(ddl),marker)
 # A late target failure must undo the already inserted income and earlier target.
 second=c.uid();second_row=dict(a,id=second,numero=796,nombre='Synthetic batch sale');sql('INSERT INTO hato_animales SELECT (jsonb_populate_record(NULL::hato_animales,'+js(second_row)+')).*;')
 bp=dict(p,cabezas=2,animals=sorted([p['animals'][0],{k:second_row[k] for k in ('id','numero','nombre')}],key=lambda v:v['id']));bk=c.uid();bulk=sale('prepare',bk,bp);late_id=bp['animals'][-1]['id']
 late='CREATE FUNCTION public.synthetic_sale_late() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN IF NEW.animal_id='+u(late_id)+' THEN RETURN NULL;END IF;RETURN NEW;END $f$;CREATE TRIGGER synthetic_sale_late BEFORE INSERT ON hato_eventos FOR EACH ROW EXECUTE FUNCTION synthetic_sale_late();'
 refuse('late batch target',lambda:raw(late,bk),'event suppressed')
 for label,ddl,marker in [('unrelated expense mutation',"CREATE FUNCTION public.synthetic_sale_mutate() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN UPDATE public.fin_gastos SET nombre=nombre||' unexpected' WHERE id=(SELECT id FROM public.fin_gastos ORDER BY id LIMIT 1);RETURN NEW;END $f$;CREATE TRIGGER synthetic_sale_mutate AFTER INSERT ON hato_eventos FOR EACH ROW EXECUTE FUNCTION synthetic_sale_mutate();",'financial mismatch'),('late income mutation',"CREATE FUNCTION public.synthetic_sale_mutate() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN UPDATE public.fin_ingresos SET valor=valor+1 WHERE id=(NEW.receipt->'plan'->>'incomeId')::uuid;RETURN NEW;END $f$;CREATE TRIGGER synthetic_sale_mutate AFTER INSERT ON hato_sale.audit FOR EACH ROW EXECUTE FUNCTION synthetic_sale_mutate();",'financial mismatch')]:refuse(label,lambda ddl=ddl:raw(ddl),marker)
 competing=c.uid();sale('prepare',competing,p)
 refuse('partial linked count',lambda:sale('prepare',c.uid(),dict(p,cabezas=2),ok=False),'heads/link')
 refuse('fractional peso amount',lambda:sale('prepare',c.uid(),dict(p,valor='123.45'),ok=False),'Exact bounded')
 refuse('stale selected catalog',lambda:raw("UPDATE fin_regiones SET nombre='Synthetic changed region' WHERE id="+u(region)+';'),'source graph changed')
 before=json.loads(state())
 with concurrent.futures.ThreadPoolExecutor(2) as pool:
  x=pool.submit(sale,'post',key);y=pool.submit(sale,'post',key);posted=x.result();other=y.result()
 refuse('competing original sale',lambda:sale('post',competing,ok=False),'source graph changed')
 check(posted==other and posted['state']=='committed','concurrent original sale posts one income/event/animal change and trusted proof')
 after=json.loads(state());allowed={'public.fin_ingresos','public.hato_animales','public.hato_eventos','public.hato_correcciones','hato_sale.requests','hato_sale.audit'};check(all(after[k]==v for k,v in before.items() if k not in allowed),'all other financial/stock/clinical/backup/private rows remain unchanged')
 before=state();check(sale('status',key)==posted and sale('post',key)==posted and state()==before,'lost sale response recovers original income/IDs without repeating mutation')
 check(json.loads(sql('SELECT receipt FROM hato_sale.audit WHERE request_key='+u(key)+';'))==posted['receipt'],'independent trusted audit matches returned sale receipt')
 empty=dict(p,animals=[],cabezas=3,nombre='Synthetic income only');ek=c.uid();sale('prepare',ek,empty);before=json.loads(sql('SELECT alert_response.domain_state();'));income_only=sale('post',ek);check(income_only['receipt']['income']['cabezas']==3 and json.loads(sql('SELECT alert_response.domain_state();'))==before,'income-only sale invents no animal/event and preserves the entire herd domain')
 fence=c.uid();check(sale('resolve',fence)['state']=='canceled' and sale('prepare',fence,p)['state']=='canceled','cancellation before prepare permanently fences original sale key')
 for role in ('anon','authenticated','service_role'):refuse(role+' protected proof',lambda role=role:sql('BEGIN;SET LOCAL ROLE '+role+';SELECT * FROM hato_sale.requests;COMMIT;',False),'permission denied')
 sql('UPDATE usuarios SET activo=false WHERE id='+u(c.OWNER)+';');refuse('revoked owner proof',lambda:sale('status',key,ok=False),'Gerencia');sql('UPDATE usuarios SET activo=true WHERE id='+u(c.OWNER)+';')
 sql("UPDATE usuarios SET rol='Administrador' WHERE id="+u(c.OWNER)+';');refuse('ordinary Admin financial proof',lambda:sale('status',key,ok=False),'Gerencia');sql("UPDATE usuarios SET rol='Gerencia' WHERE id="+u(c.OWNER)+';')
 sdk_animal=c.uid();sql('INSERT INTO hato_animales SELECT (jsonb_populate_record(NULL::hato_animales,'+js(dict(a,id=sdk_animal,numero=797,nombre='Synthetic SDK sale'))+')).*;')
 data=dict(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),owner=c.OWNER,other=c.OTHER,animal=sdk_animal,intent=p)
 proc=subprocess.run(['node',str(Path(__file__).with_name('hato-sale-native.mjs'))],input=json.dumps(data),text=True,capture_output=True,cwd=r.ROOT,timeout=90)
 if proc.returncode:
  path=Path('/tmp/escocia-sale-sdk-private.log');path.touch(mode=0o600,exist_ok=True);path.write_text(proc.stderr);raise ValueError('Actual sale browser/SDK failed; private diagnostics saved')
 exercise.sdk=json.loads(proc.stdout);check(exercise.sdk['assertions']>=13,'actual browser/installed SDK verifies original income/event recovery and independent audit/state')
def main():
 a=argparse.ArgumentParser();a.add_argument('--evidence-dir',type=Path,required=True)
 for n in ('runtime','client','output','private-diagnostics'):a.add_argument('--'+n,type=Path,required=True)
 args=a.parse_args();exercise.client=args.client.resolve();files=[*sorted((r.ROOT/'src/sql/security-candidates').glob('*.sql')),Path(__file__),Path(__file__).with_name('hato-sale-baseline-query.sql'),Path(__file__).with_name('hato-sale-native.mjs'),*[r.ROOT/'src/utils/hato'/n for n in ('hatoSaleProtocol.ts','hatoSaleBrowserAttempt.ts','hatoDeathProtocol.ts')],r.ROOT/'src/components/hato/hooks/useSale.ts',r.ROOT/'src/components/hato/hooks/useVentaAnimalesHato.ts',r.ROOT/'src/components/hato/components/VentaAnimalesHatoDialog.tsx'];sources={p:p.read_bytes() for p in files};catalog,rls,hashes=r.load(args.evidence_dir.resolve())
 if args.output.resolve().is_relative_to(args.evidence_dir.resolve()) or args.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(args.runtime.resolve(),args.client.resolve(),args.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(p.read_bytes()!=b for p,b in sources.items()) or 'SALE_BASELINE_PENDING' in SOURCE.read_text():raise ValueError('Provisional source cannot be certified; pin reviewed baseline and rerun')
 result.update(limits=['Local synthetic Auth/private Unix socket only; never production.','Legacy RPC/direct grants, deployed JWT/runtime parity, remaining writer/reader/global/recovery gates are not certified.'],coordinated_candidate_count=25,admission_rollback_probes=3,sdk_proof=exercise.sdk,source_hashes={str(p.relative_to(r.ROOT)):r.p.digest(b) for p,b in sources.items()},temporary_database_stopped_and_removed=True)
 args.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
