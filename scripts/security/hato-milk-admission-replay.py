#!/usr/bin/env python3
"""Milk writer admission only; unchanged42candidates, four private local exports."""
import argparse,importlib.util,json,subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('prior_milk',Path(__file__).with_name('hato-catalog-retirement-replay.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
c,r,u,lit,js=p.c,p.r,p.u,p.lit,p.js

def exercise(sql,ctx):
 check,call=ctx['check'],ctx['call'];state=lambda:sql(p.state_query(sql));owner=c.uid()
 sql('INSERT INTO auth.users VALUES('+u(owner)+');INSERT INTO usuarios(id,email,rol,activo) VALUES('+u(owner)+",'milk-manager@synthetic.invalid','Gerencia',true);")
 # Independent synthetic dimensions; no domain/Auth rows read from exports.
 business,category,region,medium,animal,first,second=[c.uid() for _ in range(7)]
 sql('INSERT INTO fin_negocios(id,nombre) VALUES('+u(business)+",'Hato Lechero') ON CONFLICT(nombre) DO NOTHING;")
 business=sql("SELECT id FROM fin_negocios WHERE nombre='Hato Lechero';")
 sql('INSERT INTO fin_categorias_ingresos(id,nombre,negocio_id,activo) VALUES('+u(category)+",'Synthetic leche',"+u(business)+",true);INSERT INTO fin_regiones(id,nombre) VALUES("+u(region)+",'Synthetic milk region');INSERT INTO fin_medios_pago(id,nombre) VALUES("+u(medium)+",'Synthetic milk medium');INSERT INTO hato_config(clave,valor) VALUES('retencion_ica_leche','0.0225'),('dia_pesaje_semanal','{\"iso\":3}') ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor;")
 payload=dict(quincena_id=None,anio=2026,mes=10,quincena=1,fecha_inicio='2026-10-01',fecha_fin='2026-10-15',litros_total=100,litros_pomar_confirmado=100,num_vacas_ordeno=1,notas='Synthetic original',fin_ingreso=dict(fecha='2026-10-15',valor_bruto=1000,region_id=region,medio_pago_id=medium,comprador_id=None,nombre='Synthetic milk income'))
 created=call('fn_hato_guardar_quincena_venta',[js(payload)],actor=owner);key=created['quincenaId'];income=created['finIngresoId'];payload['quincena_id']=key
 check(float(sql('SELECT valor FROM fin_ingresos WHERE id='+u(income)+';'))==977.5,'legacy quincena creates paired measured income using current ICA')
 def probe(setup,mutation,condition,label):
  before=state();result=sql('BEGIN;'+setup+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(owner)+';DO $probe$ BEGIN PERFORM '+mutation+';IF ('+condition+") IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Admission observation mismatch';END IF;END $probe$;ROLLBACK;")
  check(state()==before,label+' reproduced and full domain/control/audit graph restored')
 probe('UPDATE hato_produccion_quincenal SET notas=\'Competing reviewed edit\' WHERE id='+u(key)+';','fn_hato_guardar_quincena_venta('+js(payload)+')',"(SELECT notas='Synthetic original' FROM hato_produccion_quincenal WHERE id="+u(key)+')','legacy quincena overwrites competing source without original CAS')
 changed=dict(payload,fin_ingreso=dict(payload['fin_ingreso'],valor_bruto=2000),notas='Suppression probe')
 probe("CREATE FUNCTION public.synthetic_milk_income_suppress() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL;END $$;CREATE TRIGGER synthetic_milk_income_suppress BEFORE UPDATE ON fin_ingresos FOR EACH ROW EXECUTE FUNCTION public.synthetic_milk_income_suppress();",'fn_hato_guardar_quincena_venta('+js(changed)+')','(SELECT valor=977.5 FROM fin_ingresos WHERE id='+u(income)+') AND (SELECT precio_bruto_litro=20 FROM hato_produccion_quincenal WHERE id='+u(key)+')','legacy quincena success pairs changed production with suppressed income')
 probe("CREATE FUNCTION public.synthetic_milk_delete_suppress() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL;END $$;CREATE TRIGGER synthetic_milk_delete_suppress BEFORE DELETE ON fin_ingresos FOR EACH ROW EXECUTE FUNCTION public.synthetic_milk_delete_suppress();",'fn_hato_eliminar_quincena_venta('+u(key)+')','NOT EXISTS(SELECT 1 FROM hato_produccion_quincenal WHERE id='+u(key)+') AND EXISTS(SELECT 1 FROM fin_ingresos WHERE id='+u(income)+')','legacy quincena deletion reports success with suppressed retained income')
 sql('INSERT INTO hato_animales(id,nombre,sexo,etapa,estado,origen,created_by) VALUES('+u(animal)+",'Synthetic milk cow','hembra','vaca','activa','compra',"+u(owner)+');INSERT INTO hato_pesajes_leche(id,animal_id,fecha,litros_am,litros_pm,litros_total,created_by) VALUES('+u(first)+','+u(animal)+",'2026-10-07',1,1,2,"+u(owner)+'),('+u(second)+','+u(animal)+",'2026-10-14',1,1,2,"+u(owner)+');')
 proc=subprocess.run(['node',str(Path(__file__).with_name('hato-milk-admission-native.mjs'))],input=json.dumps(dict(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),owner=owner,animal=animal,first=first,second=second)),text=True,capture_output=True,cwd=r.ROOT,timeout=90)
 if proc.returncode:
  f=Path('/tmp/escocia-milk-admission-caller-private.log');f.touch(mode=0o600,exist_ok=True);f.write_text(proc.stderr);raise AssertionError('Actual milk caller admission failed; private diagnostics saved')
 exercise.caller=json.loads(proc.stdout);check(exercise.caller['assertions']==2,'actual shared web/Telegram pesaje function partial-write/suppression probes reproduced')
def main():
 parser=argparse.ArgumentParser()
 for name in ('evidence-dir','runtime','client','output','private-diagnostics'):parser.add_argument('--'+name,type=Path,required=True)
 a=parser.parse_args();exercise.client=a.client.resolve();inventory=r.ROOT/'docs/security-integrity/hato-milk-admission-callers.json';inv=json.loads(inventory.read_text());files=[Path(__file__),Path(__file__).with_name('hato-milk-admission-native.mjs'),Path(__file__).with_name('hato-milk-caller-inventory.mjs'),inventory,r.ROOT/'src/supabase/functions/server/hato-capturas-foto.ts',r.ROOT/'docs/security-integrity/hato-milk-admission-schema.json',*[r.ROOT/k for k in json.loads((r.ROOT/'docs/security-integrity/hato-catalog-retirement-replay.json').read_text())['source_hashes']],*[r.ROOT/k for k in inv['source_hashes']],*sorted((r.ROOT/'src/supabase/functions/server/importHato').glob('*.ts'))];files=list(dict.fromkeys(files));sources={f:f.read_bytes() for f in files};assert all(r.p.digest((r.ROOT/k).read_bytes())==v for k,v in inv['source_hashes'].items());catalog,rls,hashes=r.load(a.evidence_dir.resolve())
 if a.output.resolve().is_relative_to(a.evidence_dir.resolve()) or a.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(a.runtime.resolve(),a.client.resolve(),a.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=p.install)
 if any(f.read_bytes()!=v for f,v in sources.items()):raise ValueError('Changing milk admission sources cannot be certified')
 assert all(path in [str(f.relative_to(r.ROOT)) for f in sources] for path in exercise.caller['loaded_sources'])
 result.update(coordinated_candidate_count=42,runtime_candidates_unchanged=True,actual_pesaje_caller=exercise.caller,source_hashes={str(f.relative_to(r.ROOT)):r.p.digest(v) for f,v in sources.items()},temporary_database_stopped_and_removed=True,limits=['Admission only: existing milk callers/RPCs/grants unchanged; no protected milk foundation or cutover certified.','Four private metadata exports and synthetic local SQL only; actual TS caller uses per-request SQL bridge, not hosted SDK/Auth/Storage. No production, historical repair or financial deletion authorized.'])
 a.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
