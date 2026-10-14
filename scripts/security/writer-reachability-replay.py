#!/usr/bin/env python3
"""Effective local ACL/RLS probes and bypass evidence; never remote database access."""
import argparse
import importlib.util
import json
from pathlib import Path

spec=importlib.util.spec_from_file_location('combined',Path(__file__).with_name('combined-mutation-replay.py'))
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
r,lit,js,uid,u,OWNER,OTHER=c.r,c.lit,c.js,c.uid,c.uuid_sql,c.OWNER,c.OTHER
TABLES=('productos','movimientos_inventario','compras','hato_tratamientos','hato_tratamiento_pasos')
LEGACY='public.fn_hato_registrar_tratamiento(uuid,text,date,text,date,text,text,uuid)'


def exercise(sql,ctx):
    check,state=ctx['check'],ctx['state'];sql('UPDATE usuarios SET activo=true WHERE id='+u(OTHER)+';')
    # Native effective privilege functions include PUBLIC, inherited membership,
    # schema usage and column grants; do not infer access from a raw ACL string.
    table_matrix=json.loads(sql("SELECT jsonb_agg(jsonb_build_object('table',n.nspname||'.'||t.relname,'role',g.role,'schema_usage',has_schema_privilege(g.role,n.oid,'USAGE'),'table_privileges',(SELECT jsonb_object_agg(p,has_table_privilege(g.role,t.oid,p)) FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p),'column_privileges',(SELECT jsonb_object_agg(p,has_any_column_privilege(g.role,t.oid,p)) FROM unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) p)) ORDER BY n.nspname,t.relname,g.role) FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace CROSS JOIN (VALUES('anon'),('authenticated'),('service_role'))g(role) WHERE (n.nspname='public' AND t.relname IN("+','.join(lit(t) for t in TABLES)+")) OR (n.nspname IN('purchase_integrity','manual_stock','product_catalog_integrity','csv_product_import','application_closure','application_plan_delete','ronda_stock_integrity','hato_undo','hato_treatment_creation') AND t.relkind='r');"))
    functions=json.loads(sql("SELECT jsonb_agg(jsonb_build_object('function',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')','name',p.proname,'definer',p.prosecdef,'owner',pg_get_userbyid(p.proowner),'configuration',p.proconfig,'returns_trigger',p.prorettype='trigger'::regtype,'execute',(SELECT jsonb_object_agg(role,has_schema_privilege(role,n.oid,'USAGE') AND has_function_privilege(role,p.oid,'EXECUTE')) FROM (VALUES('anon'),('authenticated'),('service_role'))g(role))) ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','purchase_integrity','manual_stock','product_catalog_integrity','csv_product_import','application_closure','application_plan_delete','ronda_stock_integrity','hato_undo','hato_treatment_creation');"))
    views=json.loads(sql("SELECT coalesce(jsonb_agg(jsonb_build_object('view',n.nspname||'.'||v.relname,'updatable_mask',pg_relation_is_updatable(v.oid,false),'role',g.role,'update',has_schema_privilege(g.role,n.oid,'USAGE') AND has_table_privilege(g.role,v.oid,'UPDATE'),'insert',has_schema_privilege(g.role,n.oid,'USAGE') AND has_table_privilege(g.role,v.oid,'INSERT'),'delete',has_schema_privilege(g.role,n.oid,'USAGE') AND has_table_privilege(g.role,v.oid,'DELETE')) ORDER BY v.relname,g.role),'[]') FROM pg_class v JOIN pg_namespace n ON n.oid=v.relnamespace CROSS JOIN(VALUES('anon'),('authenticated'),('service_role'))g(role) WHERE n.nspname='public' AND v.relkind='v';"))
    protected=[x for x in table_matrix if not x['table'].startswith('public.')]
    check(all(not any(x['table_privileges'].values()) and not any(x['column_privileges'].values()) for x in protected),'every candidate protected table denies table/column access to ordinary and service roles')
    check(all(not any(f['execute'].values()) for f in functions if not f['function'].startswith('public.')),'protected helper functions have no effective ordinary/service RPC entry')
    # Table-level SELECT and RLS are distinct. Seed a real protected creation as
    # a clinical read witness; an empty table cannot demonstrate reader denial.
    animal=ctx['treated']['payload']['animalId'];original=json.loads(sql('SELECT to_jsonb(a) FROM hato_animales a WHERE id='+u(animal)+';'))
    payload=dict(version=1,animalId=animal,nombre='Synthetic read witness',fechaInicio='2026-10-14',nota=None,fechaProximoPaso='2026-10-15',descripcionPaso=None,observedAnimal=original)
    key=uid();ctx['call']('fn_hato_treatment_create_web',[lit('prepare'),u(key),js(payload),u(OWNER)]);created=ctx['call']('fn_hato_treatment_create_web',[lit('post'),u(key),js(payload),u(OWNER)])
    header=created['receipt']['after']['header']['id']
    viewer,inactive,missing=uid(),uid(),uid();sql('INSERT INTO auth.users VALUES('+u(viewer)+'),('+u(inactive)+'),('+u(missing)+');INSERT INTO usuarios(id,email,rol,activo) VALUES('+u(viewer)+",'viewer@synthetic.invalid','Verificador',true),("+u(inactive)+",'inactive@synthetic.invalid','Administrador',false);")
    contexts=[('active_admin','authenticated',OWNER),('active_manager','authenticated',OTHER),('active_viewer','authenticated',viewer),('inactive_admin','authenticated',inactive),('missing_profile','authenticated',missing),('missing_uid','authenticated',None),('anonymous','anon',None)]
    readers=[]
    for name,role,actor in contexts:
        for table,id in [('productos',ctx['pid']),('hato_tratamientos',header)]:
            result=sql('BEGIN;SET LOCAL ROLE '+role+';SET LOCAL request.jwt.claim.sub='+lit(actor or '')+';SELECT count(*) FROM '+table+' WHERE id='+u(id)+';ROLLBACK;',False)
            readers.append(dict(context=name,table=table,reachable=result.returncode==0 and result.stdout.strip()=='1',permission_denied=result.returncode!=0))
        if name not in ('active_admin','active_manager'):
            ctx['refuse']('fn_product_catalog_post',[u(uid()),js(dict(mode='create',product_id=None,original=None,fields=c.product.fields())),u(actor or OWNER)],name+' cannot invoke trusted catalog mutation',actor=actor,role=role)
    # Positive counterexamples: current policies/grants permit bypasses. Every
    # probe is rolled back and full combined state is compared afterward.
    bypass=[]
    def probe(name,body,query,role='authenticated'):
        before=state();result=sql('BEGIN;SET LOCAL ROLE '+role+';SET LOCAL request.jwt.claim.sub='+lit(OWNER if role=='authenticated' else '')+';'+body+'RESET ROLE;SELECT '+query+';ROLLBACK;',False)
        check(result.returncode==0 and result.stdout.strip()=='t' and state()==before,name+' reproduced only inside rolled-back local transaction')
        bypass.append(name)
    stock=ctx['stock']();count=sql('SELECT count(*) FROM movimientos_inventario;')
    probe('direct stock UPDATE without ledger/proof','UPDATE productos SET cantidad_actual=cantidad_actual+1 WHERE id='+u(ctx['pid'])+';',"(SELECT cantidad_actual="+str(stock+1)+' FROM productos WHERE id='+u(ctx['pid'])+") AND (SELECT count(*)="+count+' FROM movimientos_inventario)')
    movement=sql('SELECT id FROM movimientos_inventario WHERE producto_id='+u(ctx['pid'])+" AND tipo_movimiento='Entrada' ORDER BY created_at,id LIMIT 1;")
    probe('direct ledger DELETE without counter-entry','DELETE FROM movimientos_inventario WHERE id='+u(movement)+';', '(SELECT count(*)=0 FROM movimientos_inventario WHERE id='+u(movement)+')')
    for role in ('authenticated','service_role'):
        label='Synthetic forged legacy '+role
        legacy='DO $probe$ BEGIN PERFORM '+LEGACY.split('(')[0]+'('+','.join([u(animal),lit(label),"'2026-10-14'::date",'NULL::text',"'2026-10-15'::date",'NULL::text',lit('telegram'),u(OTHER)])+');END $probe$;'
        probe('legacy treatment attribution bypass '+role,legacy,'(SELECT count(*)=1 FROM hato_tratamientos WHERE nombre='+lit(label)+" AND fuente='telegram' AND created_by="+u(OTHER)+')',role=role)
    before=state()
    for namespace in ('application_closure','application_plan_delete'):
        result=sql('BEGIN;REVOKE UPDATE ON public.productos FROM PUBLIC,authenticated;SELECT '+namespace+'.assert_boundary();ROLLBACK;',False)
        check(result.returncode!=0 and 'grant' in result.stderr.lower() and state()==before,namespace+' currently refuses stock-grant retirement and fully rolls back')
    exercise.result=dict(table_matrix=table_matrix,function_matrix=functions,view_matrix=views,reader_probes=readers,confirmed_bypasses=bypass)


def main():
    a=argparse.ArgumentParser(description=__doc__);a.add_argument('evidence_dir',type=Path)
    for name in ('runtime','client','output','private-diagnostics'):a.add_argument('--'+name,type=Path,required=True)
    args=a.parse_args();evidence=args.evidence_dir.resolve();output=args.output.resolve()
    if output.is_relative_to(evidence) or output.name.endswith('-private.json') or args.private_diagnostics.resolve().is_relative_to(evidence):raise ValueError('Cannot overwrite private evidence')
    catalog,rls,hashes=r.load(evidence)
    with r.database(args.runtime.resolve(),args.client.resolve(),args.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise)
    result.update(exercise.result,extension_sha256=r.p.digest(Path(__file__).read_bytes()),temporary_database_stopped_and_removed=True)
    result['limits']=['Local schema/data/Auth only; effective EXECUTE is not proof a body authorizes a call.','Literal source callers and selected runtime contexts do not exhaust dynamic SQL/call graphs or hosted reachability.','No grants retired in this diagnostic unit; current direct/RPC bypasses remain release blockers.']
    output.write_text(json.dumps(result,indent=2)+'\n')


if __name__=='__main__':main()
