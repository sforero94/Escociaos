#!/usr/bin/env python3
"""Observed lock contention and full winner-state preservation on local replay."""
import argparse
import concurrent.futures
import importlib.util
import json
from pathlib import Path
import time

spec=importlib.util.spec_from_file_location('combined',Path(__file__).with_name('combined-mutation-replay.py'))
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
r,lit,js,uid,u=c.r,c.lit,c.js,c.uid,c.uuid_sql
OWNER,OTHER=c.OWNER,c.OTHER


def exercise(sql,ctx):
    check,state,call,request=ctx['check'],ctx['state'],ctx['call'],ctx['request']
    observed=[]
    def function(fn,args):
        return 'DO $race$ BEGIN PERFORM public.'+fn+'('+','.join(args)+'); END $race$;'
    def wait_for(tag,condition):
        deadline=time.monotonic()+8
        while time.monotonic()<deadline:
            if sql('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='+lit(tag)+' AND '+condition+');')=='t':return
            time.sleep(.02)
        raise AssertionError('Required local concurrency barrier was not observed: '+tag)
    def race(label,winner,contender,message):
        tag='escocia_race_'+uid().replace('-','')
        def hold():
            return sql('BEGIN;SET LOCAL application_name='+lit(tag+'_winner')+';'+winner+'RESET ROLE;'+ctx['state_query']()+"SELECT pg_sleep(4);COMMIT;")
        def lose():
            return sql('BEGIN;SET LOCAL application_name='+lit(tag+'_contender')+';'+contender+'COMMIT;',False)
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            won=pool.submit(hold)
            wait_for(tag+'_winner',"wait_event='PgSleep'")
            lost=pool.submit(lose)
            wait_for(tag+'_contender',"wait_event_type='Lock'")
            expected=won.result();failure=lost.result()
        check(failure.returncode!=0 and message in failure.stderr,label+' refuses after observed lock wait')
        check(state()==expected,label+' preserves exact winning state across all captured tables')
        observed.append(label)
    human="SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub="+lit(OWNER)+';'
    service="SET LOCAL ROLE service_role;SET LOCAL request.jwt.claim.sub='';"
    sql('UPDATE usuarios SET activo=true WHERE id='+u(OTHER)+';')
    # Both stock CAS and catalog full-row originals must survive waiting for
    # competing protected writers, rather than silently taking a new baseline.
    stale=ctx['manual']('Ajuste',20)
    purchase=ctx['purchase'](2,'Synthetic source race')
    race('purchase versus original stock adjustment',
         human+function('fn_purchase_post',[u(uid()),js(purchase),u(OWNER)]),
         human+function('fn_manual_stock_movement',[u(uid()),js(stale),u(OWNER)]),'Stock changed; review')
    original=ctx['row']();fields={k:original[k] for k in c.product.fields() if k not in ('activo','cantidad_actual')};fields['precio_unitario']=5
    edit=dict(mode='edit',product_id=ctx['pid'],original=original,fields=fields)
    race('manual stock write versus original catalog edit',
         human+function('fn_manual_stock_movement',[u(uid()),js(ctx['manual']()),u(OWNER)]),
         human+function('fn_product_catalog_post',[u(uid()),js(edit),u(OWNER)]),'Catalog changed since original review')
    # Source edits have their own current graph; create a real open application
    # with generated tree counts and required daily/product descriptions.
    app,task,lot,daily=uid(),uid(),uid(),uid();pid=ctx['pid'];name=ctx['row']()['nombre']
    sql('INSERT INTO tareas(id,nombre) VALUES('+u(task)+",'Synthetic race task');INSERT INTO aplicaciones(id,nombre_aplicacion,tipo_aplicacion,estado,tarea_id) VALUES("+u(app)+",'Synthetic source race','Fumigación','En ejecución',"+u(task)+');INSERT INTO lotes(id,nombre,arboles_grandes,arboles_medianos,arboles_pequenos,arboles_clonales) VALUES('+u(lot)+",'Synthetic race lot',100,0,0,0);INSERT INTO aplicaciones_lotes(aplicacion_id,lote_id) VALUES("+u(app)+','+u(lot)+');INSERT INTO movimientos_diarios(id,aplicacion_id,lote_id,fecha_movimiento,responsable,lote_nombre) VALUES('+u(daily)+','+u(app)+','+u(lot)+",'2026-10-14','owner@synthetic.invalid','Synthetic race lot');INSERT INTO movimientos_diarios_productos(movimiento_diario_id,producto_id,producto_nombre,producto_categoria,cantidad_utilizada,unidad) VALUES("+u(daily)+','+u(pid)+','+lit(name)+",'Fertilizante',2,'Kilos');")
    original=call('fn_application_closure_snapshot',[u(app),u(OWNER)])['expected']
    payload=dict(aplicacion_id=app,fecha_cierre='2026-10-14',fecha_inicio_ejecucion='2026-10-14',fecha_fin_ejecucion='2026-10-14',dias_aplicacion=1,jornales_utilizados=0,valor_jornal=0,observaciones_cierre='Synthetic race',observaciones_generales='Synthetic race',costo_total_insumos=4,costo_total_mano_obra=0,costo_total=4,costo_por_arbol=.04,lote_aplicacion='Synthetic race lot',registros_trabajo=[],insumos_aplicados=[dict(producto_id=pid,cantidad=2,producto_nombre=name)])
    race('daily source edit versus closure original',
         'UPDATE movimientos_diarios_productos SET cantidad_utilizada=3 WHERE movimiento_diario_id='+u(daily)+';',
         human+function('fn_application_close',[u(uid()),js(payload),js(original),u(OWNER)]),'Closure original changed')
    app,task,mix=uid(),uid(),uid()
    sql('INSERT INTO tareas(id,nombre) VALUES('+u(task)+",'Synthetic plan race task');INSERT INTO aplicaciones(id,tipo_aplicacion,estado,tarea_id) VALUES("+u(app)+",'Fumigación','Calculada',"+u(task)+');INSERT INTO aplicaciones_mezclas(id,aplicacion_id,numero_mezcla) VALUES('+u(mix)+','+u(app)+',1);')
    original=call('fn_application_plan_delete_snapshot',[u(app),u(OWNER)])['expected']
    race('late planned reference versus unused deletion original',
         'INSERT INTO aplicaciones_lotes_planificado(aplicacion_id,lote_id,mezcla_id) VALUES('+u(app)+','+u(lot)+','+u(mix)+');',
         human+function('fn_application_plan_delete',[u(uid()),u(app),js(original),u(OWNER)]),'Sus registros se conservaron')
    animal=uid();sql('INSERT INTO hato_animales(id,numero,nombre,etapa,estado) VALUES('+u(animal)+",2,'Synthetic race animal','vaca','activa');")
    def prepare(message):
        original=json.loads(sql('SELECT to_jsonb(a) FROM hato_animales a WHERE id='+u(animal)+';'))
        payload=dict(version=1,animalId=animal,nombre='Synthetic race treatment',fechaInicio='2026-10-14',nota=None,fechaProximoPaso='2026-10-15',descripcionPaso=None,observedAnimal=original)
        return call('fn_hato_treatment_create_telegram',[lit('prepare'),'789','789',str(message),js(payload),'NULL::uuid'],actor=None,role='service_role')
    def native(action,message):
        return call('fn_hato_treatment_create_telegram_action',[lit(action),'789','789',str(message)],actor=None,role='service_role')
    prepare(60)
    race('animal source edit versus pending treatment post',
         human+'UPDATE hato_animales SET nombre=\'Synthetic changed race animal\' WHERE id='+u(animal)+';',
         service+function('fn_hato_treatment_create_telegram_action',[lit('post'),'789','789','60']),'Original animal changed')
    race('registration relink versus committed native recovery',
         'UPDATE telegram_usuarios SET usuario_id='+u(OWNER)+' WHERE telegram_id=789;',
         service+function('fn_hato_treatment_create_telegram_action',[lit('status'),'789','789','50']),'Changed original treatment recovery actor')
    sql('UPDATE telegram_usuarios SET usuario_id='+u(OTHER)+' WHERE telegram_id=789;')
    race('profile deactivation versus committed stock receipt recovery',
         'UPDATE usuarios SET activo=false WHERE id='+u(OWNER)+';',
         human+function('fn_manual_stock_request_status',[u(ctx['mk']),js(ctx['mp']),u(OWNER)]),'Current active administrator required')
    sql('UPDATE usuarios SET activo=true WHERE id='+u(OWNER)+';')
    def review(message):
        prepare(message);created=native('post',message);header=created['receipt']['after']['header'];step=created['receipt']['after']['steps'][0]
        review=call('fn_hato_undo_review_begin',['789',lit('treatment'),u(header['id'])],actor=None,role='service_role')
        delivery=['789',lit('treatment'),u(review['key']),'789',str(message+100)]
        call('fn_hato_undo_review_deliver',delivery+['true'],actor=None,role='service_role')
        return header,step,delivery+[lit('confirm')]
    header,step,args=review(61)
    race('direct step execution versus original undo review',
         'UPDATE hato_tratamiento_pasos SET fecha_ejecutada=\'2026-10-15\' WHERE id='+u(step['id'])+';',
         service+function('fn_hato_undo_review_action',args),'Executed treatment step must be preserved')
    header,step,args=review(62)
    race('confirmed undo versus delayed direct child insertion',
         service+function('fn_hato_undo_review_action',args),
         'INSERT INTO hato_tratamiento_pasos(tratamiento_id,paso_num,fecha_programada) VALUES('+u(header['id'])+",2,'2026-10-16');",'violates foreign key constraint')
    exercise.observed=observed


def main():
    a=argparse.ArgumentParser(description=__doc__);a.add_argument('evidence_dir',type=Path)
    for name in ('runtime','client','output','private-diagnostics'):a.add_argument('--'+name,type=Path,required=True)
    args=a.parse_args();evidence=args.evidence_dir.resolve();output=args.output.resolve()
    if output.is_relative_to(evidence) or output.name.endswith('-private.json') or args.private_diagnostics.resolve().is_relative_to(evidence):raise ValueError('Cannot overwrite private evidence')
    catalog,rls,hashes=r.load(evidence)
    with r.database(args.runtime.resolve(),args.client.resolve(),args.private_diagnostics.resolve()) as sql:
        result=c.run(catalog,rls,hashes,sql,followup=exercise)
    result.update(extension_sha256=r.p.digest(Path(__file__).read_bytes()),observed_lock_races=exercise.observed,temporary_database_stopped_and_removed=True)
    result['limits']=['Synthetic local data/Auth only; no production/hosted certification.','Nine observed lock races cover selected source/direct/protocol writers, not every writer, resource limit or ordinary-role path.','Backup063 provenance unknown; no historical repair.']
    output.write_text(json.dumps(result,indent=2)+'\n')


if __name__=='__main__':main()
