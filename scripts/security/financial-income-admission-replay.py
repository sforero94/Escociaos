#!/usr/bin/env python3
"""Bounded actual financial edit/delete admission on unchanged54 candidates; local only."""
import argparse,importlib.util,json,subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('prior_financial_admission',Path(__file__).with_name('hato-quincena-integrity-replay.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
c,r,u,lit,js=p.c,p.r,p.u,p.lit,p.js
SCHEMA=Path(__file__).with_name('hato-quincena-admission-schema.sql')
def exercise(sql,ctx):
 p.exercise(sql,ctx);check,call=ctx['check'],ctx['call'];before_schema=sql(SCHEMA.read_text());owner,inactive=c.uid(),c.uid()
 for uid,active,name in [(owner,True,'owner'),(inactive,False,'inactive')]:sql('INSERT INTO auth.users VALUES('+u(uid)+');INSERT INTO usuarios(id,email,rol,activo) VALUES('+u(uid)+",'financial-admission-"+name+"@synthetic.invalid','Gerencia',"+('true' if active else 'false')+');')
 business=sql("SELECT id FROM fin_negocios WHERE nombre='Hato Lechero';");category=sql("SELECT id FROM fin_categorias_ingresos WHERE nombre='Synthetic protected leche';");region=sql("SELECT id FROM fin_regiones WHERE nombre='Synthetic protected region';");medium=sql("SELECT id FROM fin_medios_pago WHERE nombre='Synthetic protected medium';")
 fields=dict(year=2032,month=2,quincena=1,liters=100,pomar=100,cows=1,notes='Synthetic financial admission pair',incomeDate='2032-02-15',gross=1000,regionId=region,mediumId=medium,buyerId=None,name='Synthetic protected financial pair')
 draft=dict(version=1,kind='save',targetId=None,fields=fields);source=call('fn_hato_quincena_source_web',[js(draft),u(owner)],actor=owner);intent=dict(draft,observed=source['source']);key=c.uid()
 call('fn_hato_quincena_web',[lit('prepare'),u(key),js(intent),u(owner)],actor=owner);posted=call('fn_hato_quincena_web',[lit('post'),u(key),'NULL::jsonb',u(owner)],actor=owner);call('fn_hato_quincena_web',[lit('acknowledge'),u(key),'NULL::jsonb',u(owner)],actor=owner)
 pair=posted['receipt']['after'];check(pair['income']['valor']==977.5,'synthetic protected measured income has reviewed original gross1000/ICA22.5/net977.5')
 monthly,free=c.uid(),c.uid()
 for uid,name in [(monthly,'Synthetic retained monthly income'),(free,'Synthetic independent income')]:sql('INSERT INTO fin_ingresos(id,fecha,negocio_id,region_id,categoria_id,nombre,valor,medio_pago_id,cantidad,precio_unitario,created_by) VALUES('+','.join([u(uid),lit('2031-02-28'),u(business),u(region),u(category),lit(name),'1000',u(medium),'100','10',u(owner)])+');')
 for half in [1,2]:sql('INSERT INTO hato_produccion_quincenal(id,anio,mes,quincena,litros_total,origen_dato,fin_ingreso_id,created_by) VALUES('+','.join([u(c.uid()),'2031','2',str(half),'50',lit('derivado_mensual'),u(monthly),u(owner)])+');')
 # Create a genuine protected sale: no fabricated protected provenance.
 sale_cat=c.uid();sql('INSERT INTO fin_categorias_ingresos(id,nombre,negocio_id) VALUES('+u(sale_cat)+",'Venta de Terneros',"+u(business)+') ON CONFLICT DO NOTHING;')
 animal=c.uid();sql('INSERT INTO hato_animales(id,nombre,numero,sexo,etapa,estado,origen,created_by) VALUES('+u(animal)+",'Synthetic financial sale animal',88321,'hembra','ternera','activa','compra',"+u(owner)+');')
 day=sql("SELECT to_char((now() AT TIME ZONE 'America/Bogota')::date,'YYYY-MM-DD');");a=json.loads(sql('SELECT to_jsonb(x) FROM hato_animales x WHERE id='+u(animal)+';'))
 sale_intent=dict(version=1,tipo='terneros',cabezas=1,valor='5000',fecha=day,regionId=region,medioPagoId=medium,compradorId=None,nombre='Synthetic protected sale financial admission',animals=[{k:a[k] for k in ('id','numero','nombre')}],refs=dict(region=dict(id=region,nombre='Synthetic protected region'),medio=dict(id=medium,nombre='Synthetic protected medium'),comprador=None));sale_key=c.uid()
 call('fn_hato_sale_web',[lit('prepare'),u(sale_key),js(sale_intent),u(owner)],actor=owner);sale=call('fn_hato_sale_web',[lit('post'),u(sale_key),'NULL::jsonb',u(owner)],actor=owner);check(sale['state']=='committed','synthetic event-linked income comes from actual protected sale, not invented provenance')
 form=dict(fecha='2032-02-15',negocio_id=business,region_id=region,categoria_id=category,nombre='Synthetic changed financial form',comprador_id='',valor=2000,cantidad=200,precio_unitario=10,medio_pago_id=medium,observaciones='Synthetic edit',url_factura='')
 args=dict(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),owner=owner,inactive=inactive,measured=pair['production']['id'],income=pair['income']['id'],requestKey=key,monthly=monthly,freeIncome=free,form=form,saleAnimal=animal,saleIncome=sale['plan']['incomeId'],saleEvent=sale['plan']['events'][0]['eventId'],saleKey=sale_key)
 tables=json.loads(sql("SELECT jsonb_agg(jsonb_build_array(schemaname,tablename) ORDER BY schemaname,tablename) FROM pg_tables WHERE schemaname<>'information_schema' AND schemaname NOT LIKE 'pg_%';"))
 graph_query="SELECT jsonb_object_agg(name,rows) FROM ("+' UNION ALL '.join('SELECT '+lit(a+'.'+b)+" name,(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]') FROM "+r.q(a)+'.'+r.q(b)+' x) rows' for a,b in tables)+') snapshot;'
 graph_before=json.loads(sql(graph_query))
 proc=subprocess.run(['node',str(Path(__file__).with_name('financial-income-admission-native.mjs'))],input=json.dumps(args),text=True,capture_output=True,cwd=r.ROOT,timeout=90)
 if proc.returncode:
  d=Path('/tmp/escocia-financial-income-sdk-private.log');d.touch(mode=0o600,exist_ok=True);d.write_text(proc.stderr);raise AssertionError('Financial actual-callback admission failed; private diagnostics '+str(d))
 graph_after=json.loads(sql(graph_query));allowed={'public.fin_ingresos','public.hato_eventos','public.hato_correcciones'}
 check(all(k in allowed or graph_after[k]==v for k,v in graph_before.items()),'financial caller admission preserves every quincena/animal/private proof/backup/Storage and unrelated domain row')
 exercise.sdk=json.loads(proc.stdout);check(exercise.sdk['assertions']>=14,'actual financial editor/list installed-SDK admission completed without application changes')
 check(sql(SCHEMA.read_text())==before_schema,'financial admission preserves exact current metadata/trigger/function/ACL baseline')
 exercise.schema=json.loads(before_schema)
def main():
 a=argparse.ArgumentParser()
 for name in ('evidence-dir','runtime','client','output','private-diagnostics'):a.add_argument('--'+name,type=Path,required=True)
 x=a.parse_args();exercise.client=x.client.resolve();inventory=r.ROOT/'docs/security-integrity/financial-income-admission-callers.json';inv=json.loads(inventory.read_text());assert all(r.p.digest((r.ROOT/k).read_bytes())==v for k,v in inv['source_hashes'].items())
 files=list(dict.fromkeys([Path(__file__),SCHEMA,inventory,Path(__file__).with_name('financial-income-admission-native.mjs'),Path(__file__).with_name('financial-income-caller-inventory.mjs'),*[r.ROOT/k for k in inv['source_hashes']],*[r.ROOT/k for k in json.loads((r.ROOT/'docs/security-integrity/hato-quincena-browser-replay.json').read_text())['source_hashes']]]));sources={f:f.read_bytes() for f in files};base=p
 while not hasattr(base,'s'):base=base.p
 catalog,rls,storage,t,hashes,admission=base.s.load(x.evidence_dir.resolve());base.install.inputs=(storage,t,rls,catalog)
 if x.output.resolve().is_relative_to(x.evidence_dir.resolve()) or x.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(x.runtime.resolve(),x.client.resolve(),x.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=p.install)
 if any(f.read_bytes()!=v for f,v in sources.items()):raise ValueError('Changing financial admission sources cannot be certified')
 result.update(coordinated_candidate_count=54,runtime_candidates_callers_grants_unchanged=True,actual_financial_callbacks_sdk=exercise.sdk,schema_admission=exercise.schema,source_hashes={str(f.relative_to(r.ROOT)):r.p.digest(v) for f,v in sources.items()},temporary_database_stopped_and_removed=True,limits=['Six local private structure exports/synthetic contained PG/intercepted installed SDK only; never production.','Admission counterexamples only; no existing financial/application/candidate/grant/import/service/backfill/shared capture/history changes.','Measured gross versus general financial net correction policy remains an owner contract; no inferred gross, redistributed monthly history, detached-history repair or deployed/global/recovery certification.'])
 x.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
