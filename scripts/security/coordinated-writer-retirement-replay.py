#!/usr/bin/env python3
"""Install coordinated retirement in a disposable private local replay only."""
import argparse
import importlib.util
import json
from pathlib import Path

spec=importlib.util.spec_from_file_location('combined',Path(__file__).with_name('combined-mutation-replay.py'))
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
r,lit,js,u=c.r,c.lit,c.js,c.uuid_sql
SOURCE=r.ROOT/'src/sql/security-candidates/coordinated-writer-retirement.sql'
LEGACY='public.fn_hato_registrar_tratamiento(uuid,text,date,text,date,text,text,uuid)'
ROLES=('anon','authenticated','service_role')
TABLES=('productos','movimientos_inventario','compras')
# Hash private catalog fields locally; publish no captured body/ACL dumps.
CATALOG="""SELECT md5(jsonb_build_object(
 'relations',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_class t WHERE relnamespace IN(SELECT oid FROM pg_namespace WHERE nspname IN('public','respaldos','application_closure','application_plan_delete'))),
 'columns',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a WHERE attrelid IN(SELECT oid FROM pg_class WHERE relnamespace IN(SELECT oid FROM pg_namespace WHERE nspname IN('public','respaldos')))),
 'functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p WHERE pronamespace IN(SELECT oid FROM pg_namespace WHERE nspname IN('public','application_closure','application_plan_delete'))),
 'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.roleid,m.member) FROM pg_auth_members m),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p)
)::text);"""
READS="""SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,g.role,
 has_table_privilege(g.role,c.oid,'SELECT'),has_any_column_privilege(g.role,c.oid,'SELECT')) ORDER BY n.nspname,c.relname,g.role)
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN(VALUES('anon'),('authenticated'),('service_role'))g(role)
 WHERE n.nspname IN('public','respaldos') AND c.relkind IN('r','v');"""


def install(sql):
    source=r.transaction_body(SOURCE.read_text());baseline=sql(CATALOG);checks=[]
    def check(value,label):
        if not value:raise AssertionError(label)
        checks.append(label);print('PASS',label,flush=True)
    # Failure must occur for the intended reason and rollback every catalog edit.
    for label,drift,marker in [
        ('guard configuration drift',"ALTER FUNCTION application_closure.assert_boundary() RESET ALL;",'guard baseline'),
        ('stock RLS drift','ALTER TABLE productos DISABLE ROW LEVEL SECURITY;','ownership/RLS'),
        ('inherited writer grant',"CREATE ROLE synthetic_retirement_inherited;GRANT UPDATE ON productos TO synthetic_retirement_inherited;GRANT synthetic_retirement_inherited TO authenticated;",'boundary drift'),
        ('updatable view writer',"CREATE VIEW public.synthetic_stock_writer AS SELECT * FROM productos;GRANT UPDATE ON public.synthetic_stock_writer TO authenticated;",'boundary drift')
    ]:
        result=sql('BEGIN;'+drift+source+'COMMIT;',False)
        check(result.returncode!=0 and marker.lower() in result.stderr.lower() and sql(CATALOG)==baseline,label+' refuses installation with full catalog rollback')
    readers=sql(READS)
    # Exact untouched public/respaldos relation ACLs outside stock targets.
    unchanged="SELECT jsonb_agg(jsonb_build_array(c.oid,c.relacl,a.attnum,a.attacl) ORDER BY c.oid,a.attnum) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 WHERE n.nspname IN('public','respaldos') AND c.relkind IN('r','v') AND NOT(n.nspname='public' AND c.relname IN('productos','movimientos_inventario','compras'));"
    untouched=sql(unchanged)
    sql('BEGIN;'+source+'COMMIT;')
    check(sql(READS)==readers,'all captured domain and view effective SELECT privileges preserved exactly')
    check(sql(unchanged)==untouched,'every non-stock relation/column ACL including clinical writers remains unchanged')
    install.result=dict(installation_checks=checks,all_domain_read_privileges_preserved=True,non_stock_relation_column_acls_preserved=True)


def exercise(sql,ctx):
    check,state=ctx['check'],ctx['state'];before=state();denials=[]
    for role in ROLES:
        for table,column in [('productos','cantidad_actual'),('movimientos_inventario','cantidad'),('compras','cantidad')]:
            result=sql('BEGIN;SET LOCAL ROLE '+role+';SET LOCAL request.jwt.claim.sub='+lit(c.OWNER)+';UPDATE public.'+table+' SET '+column+'='+column+' WHERE false;ROLLBACK;',False)
            check(result.returncode!=0 and 'permission denied' in result.stderr.lower() and state()==before,role+' direct '+table+' UPDATE refuses without state changes')
            denials.append(role+':'+table)
        result=ctx['call']('fn_hato_registrar_tratamiento',['NULL::uuid',"'Synthetic retired'","'2026-10-14'::date",'NULL::text',"'2026-10-14'::date",'NULL::text',"'telegram'",u(c.OTHER)],role=role,actor=c.OWNER,ok=False)
        check(result.returncode!=0 and 'permission denied for function' in result.stderr.lower() and state()==before,role+' legacy treatment RPC EXECUTE refuses without state changes')
    matrix=json.loads(sql("SELECT jsonb_agg(jsonb_build_array(g.role,t.name,p,has_table_privilege(g.role,'public.'||t.name,p)) ORDER BY g.role,t.name,p) FROM (VALUES('anon'),('authenticated'),('service_role'))g(role) CROSS JOIN(VALUES('productos'),('movimientos_inventario'),('compras'))t(name) CROSS JOIN unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'])p;"))
    cols=sql("SELECT NOT EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated'),('service_role'))g(role) CROSS JOIN(VALUES('productos'),('movimientos_inventario'),('compras'))t(name) CROSS JOIN unnest(ARRAY['INSERT','UPDATE','REFERENCES'])p WHERE has_any_column_privilege(g.role,'public.'||t.name,p));")
    check(all(not row[3] for row in matrix) and cols=='t','all63 effective table writer privileges and27 column writer combinations denied')
    for drift,marker in [
        ('GRANT UPDATE ON productos TO authenticated;','boundary drift'),
        ('GRANT UPDATE(cantidad_actual) ON productos TO authenticated;','boundary drift'),
        ('GRANT MAINTAIN ON compras TO service_role;','boundary drift'),
        ('GRANT EXECUTE ON FUNCTION '+LEGACY+' TO authenticated;','boundary drift'),
        ('REVOKE SELECT ON productos FROM anon;','boundary drift'),
        ('REVOKE INSERT ON tareas FROM authenticated;','prerequisite drift'),
        ('ALTER TABLE movimientos_inventario DISABLE ROW LEVEL SECURITY;','prerequisite drift')
    ]:
        catalog=sql(CATALOG)
        for namespace in ('application_closure','application_plan_delete'):
            result=sql('BEGIN;'+drift+'SELECT '+namespace+'.assert_boundary();ROLLBACK;',False)
            check(result.returncode!=0 and marker in result.stderr.lower() and state()==before and sql(CATALOG)==catalog,namespace+' detects and rolls back '+drift.split(';')[0])
    # Clinical177 remains an invoker. Exercise its real UPDATE dependencies on a
    # treatment created through the new trusted boundary after retirement.
    animal=ctx['treated']['payload']['animalId'];original=json.loads(sql('SELECT to_jsonb(a) FROM hato_animales a WHERE id='+u(animal)+';'))
    payload=dict(version=1,animalId=animal,nombre='Synthetic retained clinical lane',fechaInicio='2026-10-14',nota=None,fechaProximoPaso='2026-10-14',descripcionPaso=None,observedAnimal=original)
    key=c.uid();args=[lit('prepare'),u(key),js(payload),u(c.OWNER)]
    ctx['call']('fn_hato_treatment_create_web',args);args[0]=lit('post');created=ctx['call']('fn_hato_treatment_create_web',args)
    header=created['receipt']['after']['header']['id'];step=sql('SELECT id FROM hato_tratamiento_pasos WHERE tratamiento_id='+u(header)+';')
    result=ctx['call']('fn_hato_confirmar_paso_tratamiento',[u(animal),u(step),"'2026-10-14'::date",lit('Synthetic retained confirmer')],actor=None,role='service_role')
    check(result['ya_confirmado'] is False and sql('SELECT fecha_ejecutada::text FROM hato_tratamiento_pasos WHERE id='+u(step)+';')=='2026-10-14' and sql('SELECT estado FROM hato_tratamientos WHERE id='+u(header)+';')=='completado','service-only invoker177 still executes step/header updates after coordinated retirement')
    before=state();again=ctx['call']('fn_hato_confirmar_paso_tratamiento',[u(animal),u(step),"'2026-10-14'::date",lit('Synthetic retained confirmer')],actor=None,role='service_role')
    check(again['ya_confirmado'] is True and state()==before,'clinical177 same-date retry preserves complete combined state')
    race_spec=importlib.util.spec_from_file_location('retired_races',Path(__file__).with_name('combined-writer-races.py'))
    races=importlib.util.module_from_spec(race_spec);race_spec.loader.exec_module(races)
    races.exercise(sql,ctx)
    exercise.result=dict(denied_direct_updates=denials,table_writer_matrix=matrix,column_writer_denial_passed=True,clinical177_preserved=True,
        observed_lock_races_after_retirement=races.exercise.observed,race_extension_sha256=r.p.digest(Path(races.__file__).read_bytes()),
        installed_guard_body_md5=json.loads(sql("SELECT jsonb_object_agg(n.nspname,md5(p.prosrc)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('application_closure','application_plan_delete') AND p.proname='assert_boundary';")))


def main():
    a=argparse.ArgumentParser(description=__doc__);a.add_argument('evidence_dir',type=Path)
    for name in ('runtime','client','output','private-diagnostics'):a.add_argument('--'+name,type=Path,required=True)
    args=a.parse_args();evidence=args.evidence_dir.resolve();output=args.output.resolve()
    if output.is_relative_to(evidence) or output.name.endswith('-private.json') or args.private_diagnostics.resolve().is_relative_to(evidence):raise ValueError('Cannot overwrite private evidence')
    catalog,rls,hashes=r.load(evidence)
    with r.database(args.runtime.resolve(),args.client.resolve(),args.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
    result.update(install.result,**exercise.result,retirement_candidate_sha256=r.p.digest(SOURCE.read_bytes()),extension_sha256=r.p.digest(Path(__file__).read_bytes()),temporary_database_stopped_and_removed=True)
    result['assertions']+=len(result['installation_checks'])
    result['limits']=['Disposable local replay and synthetic Auth only; no hosted/release certification.','Stock mutation grants and legacy treatment RPC only: clinical direct writers, inactive-reader restriction and other financial/cattle writers remain separate.','Nine observed competing-writer races rerun after retirement; this is not every writer/resource/hosted path.']
    output.write_text(json.dumps(result,indent=2)+'\n')


if __name__=='__main__':main()
