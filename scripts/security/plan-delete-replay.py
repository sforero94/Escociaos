#!/usr/bin/env python3
"""Current purchase-plan policy/atomic deletion on synthetic local replay only."""
import argparse
import importlib.util
import json
from pathlib import Path
import uuid

spec = importlib.util.spec_from_file_location('product',Path(__file__).with_name('product-trigger-replay.py'))
product = importlib.util.module_from_spec(spec)
spec.loader.exec_module(product)
r, lit, OWNER, OTHER = product.r, product.lit, product.OWNER, product.OTHER
VIEWER = '10000000-0000-4000-8000-000000000003'
BACKUPS = ('backup_063_movimiento_responsable','backup_107_responsable_movimientos','backup_118_entrada_duplicada','backup_119_sulcamag_huerfana','backup_150_15_15_15_prueba')


def run(catalog,rls,hashes,sql):
    checks=[]
    def check(value,label):
        if not value:raise AssertionError(label)
        checks.append(label);print('PASS',label,flush=True)
    keys,cons,idx,_=r.recreate(catalog,rls,sql)
    check(r.verify(catalog,rls,keys,cons,idx,sql)['exported_property_parity_passed'],'initial complete exported-property parity')
    candidate=(r.ROOT/'src/sql/security-candidates/application-plan-delete.sql').read_text()
    sql(candidate)
    sql("INSERT INTO auth.users VALUES('"+OWNER+"'),('"+OTHER+"'),('"+VIEWER+"'); INSERT INTO usuarios(id,email,rol,activo) VALUES('"+OWNER+"','owner@synthetic.invalid','Administrador',true),('"+OTHER+"','other@synthetic.invalid','Gerencia',true),('"+VIEWER+"','viewer@synthetic.invalid','Verificador',true);")
    def call(op,app,expected=None,key=None,actor=OWNER,owner=OWNER,ok=True):
        args=lit(app)+'::uuid'
        if op!='snapshot':args=lit(key or str(uuid.uuid4()))+'::uuid,'+args+','+lit(json.dumps(expected))+'::jsonb'
        args+=','+('NULL' if owner is None else lit(owner)+'::uuid')
        out=sql('BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(actor)+";SELECT public.fn_application_plan_delete"+('_snapshot' if op=='snapshot' else '_status' if op=='status' else '')+'('+args+');COMMIT;',ok)
        return json.loads(out) if ok else out
    def state():
        tables=['aplicaciones','aplicaciones_mezclas','aplicaciones_productos','aplicaciones_calculos','aplicaciones_compras','aplicaciones_lotes','aplicaciones_lotes_planificado','focos','productos','movimientos_inventario','tareas','registros_trabajo','movimientos_diarios','globalgap_correcciones','application_plan_delete.requests']+['respaldos.'+t for t in BACKUPS]
        return sql('SELECT jsonb_build_array('+','.join("(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') FROM "+t+' t)' for t in tables)+');')
    def reject(label,op,app,expected=None,**kw):
        before=state();result=call(op,app,expected,ok=False,**kw)
        check(result.returncode!=0 and state()==before,label)
    # The boundary must reject reintroduction of the old unrestricted INSERT.
    mutations={
        'old unrestricted INSERT': 'ALTER POLICY authenticated_insert_aplicaciones_compras ON public.aplicaciones_compras WITH CHECK (true)',
        'unrestricted DELETE': 'ALTER POLICY authenticated_delete_aplicaciones_compras ON public.aplicaciones_compras USING (true)',
        'extra permissive policy': 'CREATE POLICY synthetic_extra ON public.aplicaciones_compras FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        'RLS disable':'ALTER TABLE public.aplicaciones_compras DISABLE ROW LEVEL SECURITY',
        'missing DELETE grant':'REVOKE DELETE ON public.aplicaciones_compras FROM authenticated'}
    for label,mutation in mutations.items():
        result=sql('BEGIN;'+mutation+';SELECT application_plan_delete.assert_graph();ROLLBACK;',False)
        check(result.returncode!=0 and 'Unsupported purchase-plan policy/grant schema' in result.stderr,label+' refuses boundary and rolls back')
    for label,mutation,message in (
        ('unknown archive reference','CREATE TABLE respaldos.synthetic_unreviewed(id uuid,aplicacion_id uuid)','Unsupported application reference'),
        ('unreviewed reference column','ALTER TABLE respaldos.backup_063_movimiento_responsable ADD COLUMN application_id uuid','Unsupported application reference'),
        ('live FK from historical copy','ALTER TABLE respaldos.backup_063_movimiento_responsable ADD CONSTRAINT synthetic_live_fk FOREIGN KEY(aplicacion_id) REFERENCES public.aplicaciones(id)','Unsupported plan-delete relationship'),
        ('changed correction body',"CREATE OR REPLACE FUNCTION public.fn_globalgap_registrar_correccion() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN RETURN coalesce(NEW,OLD);END$$",'Unsupported plan-delete trigger')):
        result=sql('BEGIN;'+mutation+';SELECT application_plan_delete.assert_graph();ROLLBACK;',False)
        check(result.returncode!=0 and message in result.stderr,label+' refuses graph and rolls back')
    # Seed an unused plan with a pre-linked task; do not suppress any trigger.
    # The captured auto-task creation path has a separate stale enum literal.
    app,mix,prod,lot,task=[str(uuid.uuid4()) for _ in range(5)]
    sql('INSERT INTO productos(id,nombre,categoria,grupo,unidad_medida,cantidad_actual) VALUES('+lit(prod)+",'Synthetic plan product','Fertilizante','Agroinsumos','Kilos',2.35); INSERT INTO lotes(id,nombre) VALUES("+lit(lot)+",'Synthetic plan lot'); INSERT INTO tareas(id,nombre) VALUES("+lit(task)+",'Synthetic retained task');INSERT INTO aplicaciones(id,tipo_aplicacion,estado,tarea_id) VALUES("+lit(app)+",'Fumigación','Calculada',"+lit(task)+"); INSERT INTO aplicaciones_mezclas(id,aplicacion_id,numero_mezcla) VALUES("+lit(mix)+','+lit(app)+',1); INSERT INTO aplicaciones_productos(mezcla_id,producto_id,producto_nombre,producto_categoria,producto_unidad) VALUES('+lit(mix)+','+lit(prod)+",'Synthetic plan product','Fertilizante','Kilos'); INSERT INTO aplicaciones_lotes(aplicacion_id,lote_id) VALUES("+lit(app)+','+lit(lot)+');')
    purchase='INSERT INTO aplicaciones_compras(aplicacion_id,producto_id,producto_nombre,producto_categoria,unidad,inventario_actual,cantidad_necesaria) VALUES('+lit(app)+','+lit(prod)+",'Synthetic plan product','Fertilizante','Kilos',2.35,1)"
    denied=sql('BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(VIEWER)+';'+purchase+';ROLLBACK;',False)
    check(denied.returncode!=0,'ordinary active Verificador cannot INSERT purchase-plan row under actual tightened RLS')
    sql('BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(OWNER)+';'+purchase+';COMMIT;')
    check(True,'ordinary active Administrador can INSERT purchase-plan row under actual RLS')
    expected=call('snapshot',app)['expected']
    # Owner Option1: actual matching synthetic backup rows do not prevent deletion.
    for table in BACKUPS:
        sql('INSERT INTO respaldos.'+r.q(table)+'(id,aplicacion_id) VALUES('+lit(str(uuid.uuid4()))+','+lit(app)+');')
    archive_before={t:sql('SELECT jsonb_agg(to_jsonb(b) ORDER BY to_jsonb(b)::text) FROM respaldos.'+r.q(t)+' b;') for t in BACKUPS}
    # Planned/focus references remain live and block disclosure/mutation, unlike
    # the five explicitly approved historical non-FK copies.
    blocked,bmix,btask=[str(uuid.uuid4()) for _ in range(3)]
    sql('INSERT INTO tareas(id,nombre) VALUES('+lit(btask)+",'Synthetic blocked task'); INSERT INTO aplicaciones(id,tipo_aplicacion,estado,tarea_id) VALUES("+lit(blocked)+",'Fumigación','Calculada',"+lit(btask)+");INSERT INTO aplicaciones_mezclas(id,aplicacion_id,numero_mezcla) VALUES("+lit(bmix)+','+lit(blocked)+',1);')
    clean=call('snapshot',blocked)['expected']
    sql('INSERT INTO aplicaciones_lotes_planificado(aplicacion_id,lote_id,mezcla_id) VALUES('+lit(blocked)+','+lit(lot)+','+lit(bmix)+');INSERT INTO focos(fecha_aplicacion,lote_id,aplicacion_id) VALUES(current_date,'+lit(lot)+','+lit(blocked)+');')
    reject('live planned/focus references block snapshot without changing records','snapshot',blocked)
    reject('late live references invalidate earlier original and preserve every row','delete',blocked,clean)
    retained=sql('SELECT application_plan_delete.retained();')
    check(call('snapshot',app,actor=OTHER,owner=OTHER)['expected']==expected,'active Gerencia obtains the same full original under preserved role intersection')
    reject('Verificador cannot snapshot/delete through privileged protocol','snapshot',app,actor=VIEWER,owner=VIEWER)
    reject('mismatched expected owner cannot snapshot plan','snapshot',app,owner=OTHER)
    reject('null expected owner cannot snapshot plan','snapshot',app,owner=None)
    sql("ALTER TABLE public.globalgap_correcciones ADD CONSTRAINT synthetic_audit_failure CHECK(operacion<>'delete');")
    before=state();failure=call('delete',app,expected,ok=False)
    check(failure.returncode!=0 and 'synthetic_audit_failure' in failure.stderr and state()==before,
          'audit insertion fault after deletion starts rolls back every plan/archive/audit/receipt change')
    sql('ALTER TABLE public.globalgap_correcciones DROP CONSTRAINT synthetic_audit_failure;')
    key=str(uuid.uuid4());deleted=call('delete',app,expected,key)
    check(sql('SELECT application_plan_delete.retained();')==retained,'unused deletion preserves all stock/ledger/tasks/work/daily/closure fingerprints')
    check(sql('SELECT count(*) FROM aplicaciones WHERE id='+lit(app)+'::uuid;')=='0','actual parent and planned child deletion commits')
    for table in BACKUPS:
        check(sql('SELECT jsonb_agg(to_jsonb(b) ORDER BY to_jsonb(b)::text) FROM respaldos.'+r.q(table)+' b;')==archive_before[table]
              and sql('SELECT count(*) FROM respaldos.'+r.q(table)+' WHERE aplicacion_id='+lit(app)+'::uuid;')=='1',
              table+' full rows and original deleted application ID remain intact')
    check(sql("SELECT count(*) FROM globalgap_correcciones WHERE operacion='delete' AND corregido_por="+lit(OWNER)+'::uuid;')!='0','actual globalgap trigger records trusted actor deletion corrections')
    before=state();check(call('delete',app,expected,key)==deleted and state()==before,'lost deletion response returns original receipt without repeated deletes/audit')
    reject('mismatched owner cannot disclose committed deletion','status',app,expected,key=key,owner=OTHER)
    sql('UPDATE public.usuarios SET activo=false WHERE id='+lit(OWNER)+'::uuid;')
    reject('revoked actor cannot disclose/replay committed deletion','status',app,expected,key=key)
    sql('UPDATE public.usuarios SET activo=true WHERE id='+lit(OWNER)+'::uuid;')
    # A current policy drift must also refuse already committed receipt recovery.
    source='BEGIN;ALTER POLICY authenticated_insert_aplicaciones_compras ON public.aplicaciones_compras WITH CHECK(true);SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(OWNER)+';SELECT public.fn_application_plan_delete_status('+lit(key)+'::uuid,'+lit(app)+'::uuid,'+lit(json.dumps(expected))+'::jsonb,'+lit(OWNER)+'::uuid);ROLLBACK;'
    result=sql(source,False);check(result.returncode!=0 and state()==before,'runtime graph drift refuses committed receipt and restores all state')
    return {'snapshot_hashes':hashes,'candidate_sha256':r.p.digest(candidate.encode()),'assertions':len(checks),'checks':checks,
            'owner_contract':'Option1: five historical copies and original IDs retained unchanged;063 provenance unknown.',
            'limits':['Synthetic data/Auth on local reconciled replay only; no hosted/global-writer/concurrency certificate.']}


def main():
    a=argparse.ArgumentParser(description=__doc__);a.add_argument('evidence_dir',type=Path)
    for name in ('runtime','client','output','private-diagnostics'):a.add_argument('--'+name,type=Path,required=True)
    args=a.parse_args();evidence=args.evidence_dir.resolve();output=args.output.resolve()
    if output.is_relative_to(evidence) or output.name.endswith('-private.json') or args.private_diagnostics.resolve().is_relative_to(evidence):raise ValueError('Cannot overwrite private evidence')
    c,rls,h=r.load(evidence)
    with r.database(args.runtime.resolve(),args.client.resolve(),args.private_diagnostics.resolve()) as sql:result=run(c,rls,h,sql)
    result['temporary_database_stopped_and_removed']=True;output.write_text(json.dumps(result,indent=2)+'\n')


if __name__=='__main__':main()
