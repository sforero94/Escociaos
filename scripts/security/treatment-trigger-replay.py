#!/usr/bin/env python3
"""Treatment admission and native private recovery on verified local replay only."""
import argparse
import importlib.util
import json
from pathlib import Path


def module(name, filename):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(filename))
    loaded=importlib.util.module_from_spec(spec);spec.loader.exec_module(loaded)
    return loaded

product=module('product','product-trigger-replay.py')
treatment=module('treatment','hato-treatment-creation-postgres.py')
r=product.r
BASELINE='589b0bfd39d77f52c262cb2e63697ffa'


def run(catalog,rls,hashes,sql):
    checks=[]
    def check(value,label):
        if not value:raise AssertionError(label)
        checks.append(label);print('PASS',label,flush=True)
    keys,cons,idx,_=r.recreate(catalog,rls,sql)
    check(r.verify(catalog,rls,keys,cons,idx,sql)['exported_property_parity_passed'],'initial complete exported-property parity')
    query=(r.ROOT/'scripts/security/treatment-trigger-baseline-query.sql').read_text()
    check(sql(query)==BASELINE,'reviewed treatment trigger/function/config/grant digest matches evidence')
    source=(r.ROOT/'src/sql/security-candidates/hato-treatment-creation.sql').read_text()
    mutations={
        'missing animal trigger':'DROP TRIGGER trg_hato_correccion ON public.hato_animales',
        'missing identity trigger':'DROP TRIGGER update_telegram_usuarios_updated_at ON public.telegram_usuarios',
        'disabled trigger':'ALTER TABLE public.hato_animales DISABLE TRIGGER trg_hato_correccion',
        'replica trigger':'ALTER TABLE public.telegram_usuarios ENABLE REPLICA TRIGGER update_telegram_usuarios_updated_at',
        'trigger condition':'CREATE OR REPLACE TRIGGER update_telegram_usuarios_updated_at BEFORE UPDATE ON public.telegram_usuarios FOR EACH ROW WHEN(NEW.activo IS NOT NULL) EXECUTE FUNCTION public.update_updated_at_column()',
        'trigger timing':'CREATE OR REPLACE TRIGGER update_telegram_usuarios_updated_at AFTER UPDATE ON public.telegram_usuarios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
        'extra header trigger':'CREATE TRIGGER extra BEFORE INSERT ON public.hato_tratamientos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
        'extra step trigger':'CREATE TRIGGER extra BEFORE INSERT ON public.hato_tratamiento_pasos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
        'extra profile trigger':'CREATE TRIGGER extra BEFORE UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
        'changed animal function body':'CREATE OR REPLACE FUNCTION public.fn_hato_registrar_correccion() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN RETURN coalesce(NEW,OLD);END$$',
        'changed identity function body':'CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW;END$$',
        'definer drift':'ALTER FUNCTION public.fn_hato_registrar_correccion() SECURITY INVOKER',
        'owner drift':'GRANT CREATE ON SCHEMA public TO authenticated;ALTER FUNCTION public.fn_hato_registrar_correccion() OWNER TO authenticated',
        'configuration drift':'ALTER FUNCTION public.fn_hato_registrar_correccion() SET search_path=public',
        'volatility drift':'ALTER FUNCTION public.fn_hato_registrar_correccion() IMMUTABLE',
        'strictness drift':'ALTER FUNCTION public.fn_hato_registrar_correccion() STRICT',
        'parallel drift':'ALTER FUNCTION public.fn_hato_registrar_correccion() PARALLEL SAFE',
        'function execute grant':'GRANT EXECUTE ON FUNCTION public.fn_hato_registrar_correccion() TO authenticated',
        'function grant option':'GRANT EXECUTE ON FUNCTION public.fn_hato_registrar_correccion() TO authenticated WITH GRANT OPTION',
    }
    for label,mutation in mutations.items():
        result=sql('BEGIN;'+mutation+';'+r.transaction_body(source)+'ROLLBACK;',False)
        check(result.returncode!=0 and 'Reviewed treatment trigger baseline drift' in result.stderr,'installation refuses '+label)
        check(sql(query)==BASELINE,label+' rollback restores trigger baseline')
    gate=source.split('CREATE SCHEMA hato_treatment_creation;')[0].replace('BEGIN;','',1)
    for mutation in (
        'CREATE TABLE public.synthetic_identity_child() INHERITS(public.usuarios)',
        'CREATE RULE synthetic_rewrite AS ON INSERT TO public.hato_tratamientos DO INSTEAD NOTHING',
        'ALTER TABLE public.hato_tratamientos ADD COLUMN unexpected text',
        'ALTER TABLE public.hato_tratamientos ALTER COLUMN fecha_inicio DROP NOT NULL',
        "ALTER TABLE public.hato_tratamientos ALTER COLUMN estado SET DEFAULT 'completado'",
        'ALTER TABLE public.hato_tratamientos DROP CONSTRAINT hato_tratamientos_animal_id_fkey',
        'GRANT SELECT ON public.hato_tratamientos TO anon WITH GRANT OPTION',
        'ALTER TABLE public.hato_tratamiento_pasos DISABLE ROW LEVEL SECURITY',
        'ALTER TABLE public.hato_tratamientos FORCE ROW LEVEL SECURITY',
        'ALTER TABLE public.telegram_usuarios DROP CONSTRAINT telegram_usuarios_telegram_id_key',
        'ALTER TABLE public.usuarios ADD COLUMN unexpected text',
        'ALTER TABLE public.hato_animales ADD COLUMN unexpected text',
        'ALTER TABLE public.telegram_usuarios ALTER COLUMN activo SET DEFAULT false',
    ):
        result=sql('BEGIN;'+mutation+';'+gate+'ROLLBACK;',False)
        check(result.returncode!=0 and any(x in result.stderr for x in ('Unreviewed treatment schema','fingerprint','Unique immediate','Unsupported reviewed','Unsupported treatment inheritance/rewrite rule')),'installation refuses schema drift '+mutation)
    check(r.verify(catalog,rls,keys,cons,idx,sql)['exported_property_parity_passed'],'all admission probes restore complete exported-property parity')
    sql(source)
    def current_sql(source,ok=True):
        if ok:return sql(source)
        result=sql(source,False)
        if result.returncode==0:raise AssertionError('Expected rejection')
        if any(x in result.stderr for x in ('syntax error','ambiguous','is not assigned','invalid input value for enum')):raise AssertionError('Unexpected SQL defect in refusal probe')
        return result.stderr
    treatment.m.sql=current_sql;treatment.m.verify=check
    owner,other,animal=treatment.OWNER,treatment.OTHER,treatment.ANIMAL
    sql("INSERT INTO auth.users VALUES('"+owner+"'),('"+other+"');INSERT INTO public.usuarios(id,email,rol,activo) VALUES('"+owner+"','owner@synthetic.invalid','Administrador',true),('"+other+"','other@synthetic.invalid','Gerencia',true);INSERT INTO public.telegram_usuarios(telegram_id,usuario_id,activo,modulos_permitidos,nombre_display) VALUES(123,'"+owner+"',true,ARRAY['hato_produccion'],'Creación vinculada'),(456,NULL,true,ARRAY['hato_produccion'],'Campo sin vínculo');INSERT INTO public.hato_animales(id,numero,nombre,etapa,estado) VALUES('"+animal+"',1,'Animal de prueba','vaca','activa');")
    treatment.exercise()
    durable=sql("SELECT count(*) FILTER(WHERE to_jsonb(h)=r.receipt->'after'->'header' AND coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.hato_tratamiento_pasos s WHERE s.tratamiento_id=h.id),'[]')=r.receipt->'after'->'steps')=count(*) AND count(*)>0 FROM hato_treatment_creation.requests r JOIN public.hato_tratamientos h ON h.id=(r.receipt->'after'->'header'->>'id')::uuid WHERE r.state='committed';")
    check(durable=='t','independent persisted full header/step readback equals every retained committed creation receipt')
    check(sql(query)==BASELINE,'all creation/native recovery paths preserve reviewed trigger/function/config/grant baseline')
    return {'snapshot_hashes':hashes,'candidate_sha256':r.p.digest(source.encode()),'runner_sha256':r.p.digest(Path(__file__).read_bytes()),
            'shared_assertions_sha256':r.p.digest(Path(treatment.__file__).read_bytes()),'reviewed_treatment_trigger_digest':BASELINE,
            'assertions':len(checks),'checks':checks,'limits':['Synthetic users/data/Auth on reconciled local replay only; no hosted/global-writer/restore certificate.','Treatment-local concurrency only; combined cross-domain writer contention remains separate.']}


def main():
    a=argparse.ArgumentParser(description=__doc__);a.add_argument('evidence_dir',type=Path)
    for name in ('runtime','client','output','private-diagnostics'):a.add_argument('--'+name,type=Path,required=True)
    args=a.parse_args();evidence=args.evidence_dir.resolve();output=args.output.resolve()
    if output.is_relative_to(evidence) or output.name.endswith('-private.json') or args.private_diagnostics.resolve().is_relative_to(evidence):raise ValueError('Cannot overwrite private evidence')
    c,rls,h=r.load(evidence)
    with r.database(args.runtime.resolve(),args.client.resolve(),args.private_diagnostics.resolve()) as sql:result=run(c,rls,h,sql)
    result['temporary_database_stopped_and_removed']=True;output.write_text(json.dumps(result,indent=2)+'\n')


if __name__=='__main__':main()
