#!/usr/bin/env python3
"""Co-installed stock/financial/cattle protocols, with synthetic data on local replay."""
import argparse
import concurrent.futures
import importlib.util
import json
from pathlib import Path
import uuid

spec=importlib.util.spec_from_file_location('product',Path(__file__).with_name('product-trigger-replay.py'))
product=importlib.util.module_from_spec(spec);spec.loader.exec_module(product)
r,lit,OWNER,OTHER=product.r,product.lit,product.OWNER,product.OTHER
ORDER=('purchase-integrity','manual-stock-movement','product-catalog-integrity','csv-product-import','application-closure','application-plan-delete','ronda-stock-integrity','hato-undo','hato-treatment-creation')
BACKUPS=('backup_063_movimiento_responsable','backup_107_responsable_movimientos','backup_118_entrada_duplicada','backup_119_sulcamag_huerfana','backup_150_15_15_15_prueba')


def uid():return str(uuid.uuid4())
def js(value):return lit(json.dumps(value))+'::jsonb'
def uuid_sql(value):return lit(value)+'::uuid'


def run(catalog,rls,hashes,sql,followup=None):
    checks=[]
    def check(value,label):
        if not value:raise AssertionError(label)
        checks.append(label);print('PASS',label,flush=True)
    keys,cons,idx,_=r.recreate(catalog,rls,sql)
    check(r.verify(catalog,rls,keys,cons,idx,sql)['exported_property_parity_passed'],'initial complete exported-property parity')
    sources={name:(r.ROOT/'src/sql/security-candidates'/f'{name}.sql').read_text() for name in ORDER}
    sql('BEGIN;'+'\n'.join(r.transaction_body(s) for s in sources.values())+'COMMIT;')
    check(True,'all nine candidates installed together before any synthetic mutation')
    tables=json.loads(sql("SELECT jsonb_agg(jsonb_build_array(schemaname,tablename) ORDER BY schemaname,tablename) FROM pg_tables WHERE schemaname IN('public','respaldos','purchase_integrity','manual_stock','product_catalog_integrity','csv_product_import','application_closure','application_plan_delete','ronda_stock_integrity','hato_undo','hato_treatment_creation');"))
    def state_query():
        return 'SELECT jsonb_object_agg(name,rows) FROM ('+' UNION ALL '.join('SELECT '+lit(s+'.'+t)+' name,(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),\'[]\') FROM '+r.q(s)+'.'+r.q(t)+' x) rows' for s,t in tables)+') snapshot;'
    def state():
        return sql(state_query())
    def call(fn,args,actor=OWNER,role='authenticated',ok=True):
        result=sql('BEGIN;SET LOCAL ROLE '+role+';SET LOCAL request.jwt.claim.sub='+lit(actor or '')+';SELECT public.'+fn+'('+','.join(args)+');COMMIT;',ok)
        return json.loads(result) if ok else result
    def request(fn,payload,key=None,actor=OWNER,ok=True):
        return call(fn,[uuid_sql(key or uid()),js(payload),uuid_sql(actor)],actor=actor,ok=ok)
    def refuse(fn,args,label,**kwargs):
        before=state();failure=call(fn,args,ok=False,**kwargs)
        check(failure.returncode!=0 and state()==before,label)
        if any(x in failure.stderr for x in ('syntax error','ambiguous','is not assigned','does not exist','invalid input value for enum')):raise AssertionError('Unexpected SQL defect in refusal probe')
    sql("INSERT INTO auth.users VALUES('"+OWNER+"'),('"+OTHER+"');INSERT INTO usuarios(id,email,rol,activo) VALUES('"+OWNER+"','owner@synthetic.invalid','Administrador',true),('"+OTHER+"','manager@synthetic.invalid','Gerencia',true);INSERT INTO telegram_usuarios(telegram_id,usuario_id,nombre_display,activo,modulos_permitidos) VALUES(789,'"+OTHER+"','Synthetic manager',true,ARRAY['hato_produccion']);")
    # Product opening, subsequent human stock writes and purchases all touch the
    # same actual product/ledger and execute the captured product actor triggers.
    fields=product.fields();fields['cantidad_actual']=10
    cp=dict(mode='create',product_id=None,original=None,fields=fields)
    ck=uid();created=request('fn_product_catalog_post',cp,ck);pid=created['product']['id']
    def row():return json.loads(sql('SELECT to_jsonb(p) FROM productos p WHERE id='+uuid_sql(pid)+';'))
    def stock():return row()['cantidad_actual']
    check(stock()==10 and row()['updated_by']==OWNER,'catalog creates one trusted opening on coordinated graph')
    before=state();check(request('fn_product_catalog_post',cp,ck)==created and state()==before,'catalog lost-response recovery preserves entire combined database')
    def manual(kind='Entrada',quantity=1):
        current=row();return dict(producto_id=pid,tipo=kind,quantity=quantity,observed_quantity=current['cantidad_actual'],observed_revision=current['updated_at'],fecha='2026-10-14',observaciones='Synthetic combined stock')
    mp=manual();mk=uid();mr=request('fn_manual_stock_movement',mp,mk)
    check(stock()==11 and mr['quantity_after']==11,'manual entry and captured actor/timestamp triggers coexist with catalog opening')
    before=state();check(request('fn_manual_stock_movement',mp,mk)==mr and state()==before,'manual lost response adds no domain/financial/cattle/proof rows')
    supplier=uid();sql('INSERT INTO fin_proveedores(id,nombre,activo) VALUES('+uuid_sql(supplier)+",'Synthetic supplier',true);")
    def purchase(quantity=2,invoice='Synthetic combined'):
        return dict(lines=[dict(producto_id=pid,fecha_compra='2026-10-14',proveedor='Synthetic supplier',proveedor_id=supplier,numero_factura=invoice,cantidad=quantity,unidad='Kilos',costo_unitario=2,costo_total=quantity*2,url_factura='synthetic://retained')])
    pp=purchase();pk=uid();pr=request('fn_purchase_post',pp,pk);buy=pr['purchases'][0]
    check(stock()==13,'purchase adds to current manual/catalog stock with actual purchase triggers')
    before=state();check(request('fn_purchase_post',pp,pk)==pr and state()==before,'purchase lost-response replay preserves complete combined state')
    # Seed real required financial dimensions, never relax their constraints.
    dims={t:uid() for t in ('fin_negocios','fin_regiones','fin_categorias_gastos','fin_conceptos_gastos','fin_medios_pago')}
    for table,key in dims.items():
        cols='id,nombre'+(',categoria_id' if table=='fin_conceptos_gastos' else '')
        vals=uuid_sql(key)+",'Synthetic dimension'"+(','+uuid_sql(dims['fin_categorias_gastos']) if table=='fin_conceptos_gastos' else '')
        sql('INSERT INTO '+table+'('+cols+') VALUES('+vals+');')
    for status in ('Pendiente','Confirmado'):
        sql('INSERT INTO fin_gastos(fecha,negocio_id,region_id,categoria_id,concepto_id,nombre,valor,medio_pago_id,compra_id,estado,created_by) VALUES(current_date,'+','.join(uuid_sql(dims[t]) for t in ('fin_negocios','fin_regiones','fin_categorias_gastos','fin_conceptos_gastos'))+",'Synthetic linked expense',4,"+uuid_sql(dims['fin_medios_pago'])+','+uuid_sql(buy['purchase_id'])+','+lit(status)+','+uuid_sql(OWNER)+');')
    expenses=json.loads(sql('SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM fin_gastos e;'))
    reverse=dict(purchase_id=buy['purchase_id'],expected=buy['expected']);rk=uid()
    # A post-detachment audit failure must restore purchase, both expenses,
    # stock/ledger and every protected proof across the co-installed package.
    sql("ALTER TABLE purchase_integrity.expense_links ADD CONSTRAINT synthetic_reversal_fault CHECK(after_snapshot IS NULL);")
    refuse('fn_purchase_reverse',[uuid_sql(rk),js(reverse),uuid_sql(OWNER)],'late financial association fault rolls back entire combined database')
    sql('ALTER TABLE purchase_integrity.expense_links DROP CONSTRAINT synthetic_reversal_fault;')
    rr=request('fn_purchase_reverse',reverse,rk)
    after_expenses=json.loads(sql('SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM fin_gastos e;'))
    omitted={'compra_id','updated_at','updated_by'}
    check(rr['preserved_expenses']==2 and len(after_expenses)==2 and all(a['compra_id'] is None and {k:v for k,v in a.items() if k not in omitted}=={k:v for k,v in b.items() if k not in omitted} for a,b in zip(after_expenses,expenses)),'reversal preserves pending and confirmed expenses and exact retained financial fields')
    check(stock()==11 and sql('SELECT count(*) FROM purchase_integrity.expense_links;')=='2','reversal removes only its posted stock and records both durable expense associations')
    before=state();check(request('fn_purchase_reverse',reverse,rk)==rr and state()==before,'lost reversal response never repeats ledger/deletion/expense detachment')
    refuse('fn_cleanup_compra_dependencies',[uuid_sql(buy['purchase_id'])],'retired legacy cleanup cannot delete preserved expenses')
    stale=manual('Ajuste',20)
    concurrent_manual=manual();concurrent_purchase=purchase(2,'Synthetic race')
    baseline=stock()
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        one=pool.submit(request,'fn_manual_stock_movement',concurrent_manual)
        two=pool.submit(request,'fn_purchase_post',concurrent_purchase)
        one.result();two.result()
    check(stock()==baseline+3,'concurrent purchase/manual writers serialize on current shared product without lost stock')
    refuse('fn_manual_stock_movement',[uuid_sql(uid()),js(stale),uuid_sql(OWNER)],'original stock revision refuses after competing purchase/manual writes with full rollback')
    # Trusted service parsing and human posting coexist with all stock writers.
    csv=dict(raw_csv='Synthetic combined CSV',parser_version=1,products=[dict(nombre='Synthetic combined CSV SKU',categoria='Fertilizante',grupo='Agroinsumos',unidad_medida='Kilos',activo=True,cantidad_actual=3.45)])
    csv_key=uid();call('fn_csv_product_import_register',[uuid_sql(OWNER),uuid_sql(csv_key),js(csv)],actor=None,role='service_role')
    csv_post=call('fn_csv_product_import',[uuid_sql(csv_key),js(csv)])
    check(sql("SELECT count(*) FROM productos WHERE nombre='Synthetic combined CSV SKU' AND cantidad_actual=3.45 AND updated_by="+uuid_sql(OWNER)+';')=='1','CSV trusted-parser/human posting creates exact durable opening on coordinated graph')
    before=state();check(call('fn_csv_product_import',[uuid_sql(csv_key),js(csv)])==csv_post and state()==before,'CSV original-key recovery preserves complete combined state')
    # Actual source quantities and prices determine closure totals; no work is
    # fabricated and no global fixture constraint/trigger is relaxed.
    close_app,close_task,lot,daily=uid(),uid(),uid(),uid()
    sql('INSERT INTO tareas(id,nombre,estado) VALUES('+uuid_sql(close_task)+",'Synthetic closure task','Programada');INSERT INTO aplicaciones(id,nombre_aplicacion,tipo_aplicacion,estado,tarea_id) VALUES("+uuid_sql(close_app)+",'Synthetic combined closure','Fumigación','En ejecución',"+uuid_sql(close_task)+');INSERT INTO lotes(id,nombre,arboles_grandes,arboles_medianos,arboles_pequenos,arboles_clonales,activo) VALUES('+uuid_sql(lot)+",'Synthetic closure lot',100,0,0,0,true);INSERT INTO aplicaciones_lotes(aplicacion_id,lote_id) VALUES("+uuid_sql(close_app)+','+uuid_sql(lot)+');INSERT INTO movimientos_diarios(id,aplicacion_id,lote_id,fecha_movimiento,responsable,lote_nombre) VALUES('+uuid_sql(daily)+','+uuid_sql(close_app)+','+uuid_sql(lot)+",'2026-10-14','owner@synthetic.invalid','Synthetic closure lot');INSERT INTO movimientos_diarios_productos(movimiento_diario_id,producto_id,producto_nombre,producto_categoria,cantidad_utilizada,unidad) VALUES("+uuid_sql(daily)+','+uuid_sql(pid)+','+lit(row()['nombre'])+",'Fertilizante',2,'Kilos');")
    close_payload=dict(aplicacion_id=close_app,fecha_cierre='2026-10-14',fecha_inicio_ejecucion='2026-10-14',fecha_fin_ejecucion='2026-10-14',dias_aplicacion=1,jornales_utilizados=0,valor_jornal=0,observaciones_cierre='Synthetic',observaciones_generales='Synthetic',costo_total_insumos=4,costo_total_mano_obra=0,costo_total=4,costo_por_arbol=.04,lote_aplicacion='Synthetic closure lot',registros_trabajo=[],insumos_aplicados=[dict(producto_id=pid,cantidad=2,producto_nombre=row()['nombre'])])
    close_original=call('fn_application_closure_snapshot',[uuid_sql(close_app),uuid_sql(OWNER)])['expected'];close_key=uid()
    sql("ALTER TABLE application_closure.requests ADD CONSTRAINT synthetic_closure_fault CHECK(receipt IS NULL);")
    refuse('fn_application_close',[uuid_sql(close_key),js(close_payload),js(close_original),uuid_sql(OWNER)],'late closure receipt fault restores all stock/work/financial/audit/proof state')
    sql('ALTER TABLE application_closure.requests DROP CONSTRAINT synthetic_closure_fault;')
    before_stock=stock();closed=call('fn_application_close',[uuid_sql(close_key),js(close_payload),js(close_original),uuid_sql(OWNER)])
    check(stock()==before_stock-2 and closed['receipt']['productosActualizados']==1,'actual closure debits shared stock once with exact source costs and correction audit')
    before=state();check(call('fn_application_close',[uuid_sql(close_key),js(close_payload),js(close_original),uuid_sql(OWNER)])==closed and state()==before,'closure retry preserves whole combined database and its original receipt')
    refuse('fn_application_plan_delete_snapshot',[uuid_sql(close_app),uuid_sql(OWNER)],'closed application and committed closure proof block unused-plan deletion')
    # Actual Ronda constraints require reported actor/provenance/decision fields;
    # they are supplied, never dropped to match the older narrow fixture.
    round_id,exception=uid(),uid();before_stock=stock()
    sql("INSERT INTO inventario_causas_raiz(clave,etiqueta,via,mueve_inventario,orden,activo) VALUES('synthetic_combined','Synthetic cause','aprobacion_gerencia',true,999,true);INSERT INTO rondas_inventario(id,periodo,estado) VALUES("+uuid_sql(round_id)+",'2026-10-01','en_curso');INSERT INTO rondas_excepciones(id,ronda_id,producto_id,estado,cantidad_fisica,fisico_origen,teorico_conteo,via_propuesta,interprete_confianza,reportada_por_usuario,explicacion_david_en,decision_en,decision_causa) VALUES("+uuid_sql(exception)+','+uuid_sql(round_id)+','+uuid_sql(pid)+",'ajuste_aprobado',"+str(before_stock+1)+",'dictado',"+str(before_stock)+",'aprobacion_gerencia','alta',"+uuid_sql(OWNER)+",now(),now(),'synthetic_combined');")
    rp=dict(actor_usuario_id=OWNER,actor_telegram_usuario_id=None,excepcion_id=exception,fecha_movimiento='2026-10-14')
    rounded=call('fn_ronda_aplicar_ajuste',[js(rp)])
    check(rounded['aplicado'] is True and stock()==before_stock+1,'Ronda adjustment preserves actual provenance constraints and posts once on shared product')
    before=state();check(call('fn_ronda_aplicar_ajuste',[js(rp)])==rounded and state()==before,'Ronda original exception proof replays without changing prior combined ledger')
    # Retain an otherwise eligible unused plan's historic backup references.
    app,task=uid(),uid()
    sql('INSERT INTO tareas(id,nombre) VALUES('+uuid_sql(task)+",'Synthetic retained task');INSERT INTO aplicaciones(id,tipo_aplicacion,estado,tarea_id) VALUES("+uuid_sql(app)+",'Fumigación','Calculada',"+uuid_sql(task)+');')
    for table in BACKUPS:sql('INSERT INTO respaldos.'+r.q(table)+'(id,aplicacion_id) VALUES('+uuid_sql(uid())+','+uuid_sql(app)+');')
    archives=sql('SELECT jsonb_build_array('+','.join("(SELECT jsonb_agg(to_jsonb(b) ORDER BY to_jsonb(b)::text) FROM respaldos."+r.q(t)+' b)' for t in BACKUPS)+');')
    expected=call('fn_application_plan_delete_snapshot',[uuid_sql(app),uuid_sql(OWNER)])['expected'];dk=uid()
    deleted=call('fn_application_plan_delete',[uuid_sql(dk),uuid_sql(app),js(expected),uuid_sql(OWNER)])
    check(sql('SELECT jsonb_build_array('+','.join("(SELECT jsonb_agg(to_jsonb(b) ORDER BY to_jsonb(b)::text) FROM respaldos."+r.q(t)+' b)' for t in BACKUPS)+');')==archives,'co-installed deletion preserves all five historical copies and original application IDs')
    before=state();check(call('fn_application_plan_delete',[uuid_sql(dk),uuid_sql(app),js(expected),uuid_sql(OWNER)])==deleted and state()==before,'co-installed deletion retry preserves all stock/financial/cattle state')
    # Create a prospective Telegram treatment and undo it through current linked
    # Gerencia, then recover the immutable original creation and undo receipts.
    animal=uid();sql('INSERT INTO hato_animales(id,numero,nombre,etapa,estado) VALUES('+uuid_sql(animal)+",1,'Synthetic combined animal','vaca','activa');")
    original=json.loads(sql('SELECT to_jsonb(a) FROM hato_animales a WHERE id='+uuid_sql(animal)+';'))
    tp=dict(version=1,animalId=animal,nombre='Synthetic combined treatment',fechaInicio='2026-10-14',nota=None,fechaProximoPaso='2026-10-15',descripcionPaso=None,observedAnimal=original)
    def native(action):return call('fn_hato_treatment_create_telegram_action',[lit(action),'789','789','50'],actor=None,role='service_role')
    prepared=call('fn_hato_treatment_create_telegram',[lit('prepare'),'789','789','50',js(tp),'NULL::uuid'],actor=None,role='service_role')
    treated=native('post');header=treated['receipt']['after']['header'];steps=treated['receipt']['after']['steps']
    check(header['created_by']==OTHER and header['fuente']=='telegram' and len(steps)==1,'co-installed Telegram creation binds Gerencia and exact pending step')
    review=call('fn_hato_undo_review_begin',['789',lit('treatment'),uuid_sql(header['id'])],actor=None,role='service_role')
    delivery=['789',lit('treatment'),uuid_sql(review['key']),'789','51']
    refuse('fn_hato_undo',['789',uuid_sql(review['key']),js(review['payload'])],'retired direct undo core refuses service caller',actor=None,role='service_role')
    call('fn_hato_undo_review_deliver',delivery+['true'],actor=None,role='service_role')
    undo_args=delivery+[lit('confirm')]
    undone=call('fn_hato_undo_review_action',undo_args,actor=None,role='service_role')
    check(sql('SELECT count(*) FROM hato_tratamientos WHERE id='+uuid_sql(header['id'])+';')=='0' and sql('SELECT count(*) FROM hato_tratamiento_pasos WHERE tratamiento_id='+uuid_sql(header['id'])+';')=='0','native undo removes only exact prospective treatment and pending step with audit')
    before=state();check(native('status')==treated and native('post')==treated and call('fn_hato_undo_review_action',undo_args,actor=None,role='service_role')==undone and state()==before,'creation and undo retries preserve both immutable receipts without recreating clinical rows')
    sql('UPDATE usuarios SET activo=false WHERE id='+uuid_sql(OTHER)+';')
    refuse('fn_hato_treatment_create_telegram_action',[lit('status'),'789','789','50'],'revoked Gerencia cannot disclose committed treatment creation',actor=None,role='service_role')
    refuse('fn_hato_undo_review_action',undo_args,'revoked Gerencia cannot replay undo receipt',actor=None,role='service_role')
    if followup is not None:
        followup(sql,dict(check=check,state=state,state_query=state_query,call=call,request=request,refuse=refuse,row=row,stock=stock,manual=manual,purchase=purchase,pid=pid,mp=mp,mk=mk,treated=treated))
    return {'snapshot_hashes':hashes,'candidate_hashes':{n:r.p.digest(s.encode()) for n,s in sources.items()},'runner_sha256':r.p.digest(Path(__file__).read_bytes()),'assertions':len(checks),'checks':checks,'limits':['Synthetic data/Auth only on verified local replay; no production or hosted certification.','All nine candidates exercised with selected mutations; broader competing writers, source/edit races, resource limits and ordinary-role matrix remain separate.','Backup063 provenance remains unknown.']}


def main():
    a=argparse.ArgumentParser(description=__doc__);a.add_argument('evidence_dir',type=Path)
    for name in ('runtime','client','output','private-diagnostics'):a.add_argument('--'+name,type=Path,required=True)
    args=a.parse_args();evidence=args.evidence_dir.resolve();output=args.output.resolve()
    if output.is_relative_to(evidence) or output.name.endswith('-private.json') or args.private_diagnostics.resolve().is_relative_to(evidence):raise ValueError('Cannot overwrite private evidence')
    c,rls,h=r.load(evidence)
    with r.database(args.runtime.resolve(),args.client.resolve(),args.private_diagnostics.resolve()) as sql:result=run(c,rls,h,sql)
    result['temporary_database_stopped_and_removed']=True;output.write_text(json.dumps(result,indent=2)+'\n')


if __name__=='__main__':main()
