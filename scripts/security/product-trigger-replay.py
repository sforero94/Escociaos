#!/usr/bin/env python3
"""Catalog/CSV reviewed-trigger contract on the reconciled local schema only."""
import argparse
import importlib.util
import json
from pathlib import Path
import re
import uuid

spec = importlib.util.spec_from_file_location('replay', Path(__file__).with_name('schema-replay.py'))
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
ROOT, lit = r.ROOT, r.lit
OWNER = '10000000-0000-4000-8000-000000000001'
OTHER = '10000000-0000-4000-8000-000000000002'
BASELINE = '4c905180016eaad2c2c87e68536678eb'


def fields():
    source = (ROOT / 'src/components/inventory/ProductForm.tsx').read_text()
    initial = re.search(r'const initialFormData: ProductData = \{(.*?)\n\};', source, re.S)[1]
    values = {key: None for key in re.findall(r'^  (\w+):', initial, re.M)}
    values.update(nombre='Synthetic ' + uuid.uuid4().hex, categoria='Fertilizante', grupo='Agroinsumos',
                  unidad_medida='Kilos', estado='OK', activo=True, cantidad_actual=2.35,
                  permitido_gerencia=False, epp_alto_nivel=False, riesgo_acuatico=False,
                  riesgo_vida_silvestre=False, riesgo_polinizador=False, riesgo_transeunte=False)
    return values


def run(catalog, rls, hashes, sql):
    checks = []
    def check(value, label):
        if not value:
            raise AssertionError(label)
        checks.append(label)
        print('PASS', label, flush=True)
    keys, constraints, indexes, excluded = r.recreate(catalog, rls, sql)
    check(r.verify(catalog, rls, keys, constraints, indexes, sql)['exported_property_parity_passed'], 'initial exported-property parity')
    query = (ROOT / 'scripts/security/product-trigger-baseline-query.sql').read_text()
    check(sql(query) == BASELINE, 'reviewed trigger/function/config/grant digest matches reconstructed evidence')
    candidates = {name: (ROOT / 'src/sql/security-candidates' / (name + '.sql')).read_text()
                  for name in ('product-catalog-integrity', 'csv-product-import')}
    mutations = {
        'missing trigger': 'DROP TRIGGER set_updated_at_productos ON public.productos',
        'disabled trigger': 'ALTER TABLE public.productos DISABLE TRIGGER set_updated_at_productos',
        'replica trigger': 'ALTER TABLE public.productos ENABLE REPLICA TRIGGER set_updated_at_productos',
        'trigger condition': 'CREATE OR REPLACE TRIGGER set_updated_at_productos BEFORE UPDATE ON public.productos FOR EACH ROW WHEN (NEW.activo IS NOT NULL) EXECUTE FUNCTION public.update_updated_at_column()',
        'trigger timing': 'CREATE OR REPLACE TRIGGER set_updated_at_productos AFTER UPDATE ON public.productos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
        'extra product trigger': 'CREATE TRIGGER extra BEFORE UPDATE ON public.productos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
        'extra ledger trigger': 'CREATE TRIGGER extra BEFORE UPDATE ON public.movimientos_inventario FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
        'changed function body': 'CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW;END$$',
        'definer drift': 'ALTER FUNCTION public.update_updated_at_column() SECURITY DEFINER',
        'owner drift': 'GRANT CREATE ON SCHEMA public TO authenticated; ALTER FUNCTION public.update_updated_at_column() OWNER TO authenticated',
        'configuration drift': 'ALTER FUNCTION public.update_updated_at_column() SET search_path=pg_catalog,public',
        'volatility drift': 'ALTER FUNCTION public.update_updated_at_column() IMMUTABLE',
        'strictness drift': 'ALTER FUNCTION public.update_updated_at_column() STRICT',
        'parallel drift': 'ALTER FUNCTION public.update_updated_at_column() PARALLEL SAFE',
        'function execute grant': 'GRANT EXECUTE ON FUNCTION public.set_producto_updated_by() TO authenticated',
        'function grant option': 'GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated WITH GRANT OPTION',
        'zero trigger baseline': 'DROP TRIGGER set_updated_at_productos ON public.productos; DROP TRIGGER set_updated_by_productos ON public.productos; DROP TRIGGER update_productos_updated_at ON public.productos',
    }
    for label, mutation in mutations.items():
        for name, source in candidates.items():
            result = sql('BEGIN;' + mutation + ';' + r.transaction_body(source) + 'ROLLBACK;', False)
            check(result.returncode != 0 and 'reviewed product trigger baseline drift' in result.stderr,
                  name + ' refuses ' + label)
        check(sql(query) == BASELINE, label + ' rollback restores original baseline')
    check(r.verify(catalog, rls, keys, constraints, indexes, sql)['exported_property_parity_passed'], 'all drift probes preserve full schema parity')
    for source in candidates.values():
        sql(source)
    check(sql(query) == BASELINE, 'co-installed catalog/CSV preserve captured triggers and functions')
    sql("INSERT INTO auth.users(id) VALUES ('" + OWNER + "'),('" + OTHER + "');" +
        "INSERT INTO public.usuarios(id,email,rol,activo) VALUES ('" + OWNER + "','owner@synthetic.invalid','Administrador',true),('" + OTHER + "','other@synthetic.invalid','Gerencia',true);")
    tables = ('public.productos', 'public.movimientos_inventario', 'product_catalog_integrity.requests',
              'product_catalog_integrity.openings', 'product_catalog_integrity.audit', 'csv_product_import.requests',
              'csv_product_import.openings', 'csv_product_import.parsed')
    def state():
        return sql('SELECT jsonb_build_array(' + ','.join("(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') FROM " + t + ' t)' for t in tables) + ');')
    def call(name, payload, key=None, actor=OWNER, expected=OWNER, role='authenticated', ok=True):
        key = key or str(uuid.uuid4())
        suffix = '' if name.startswith('fn_csv') else ',' + ('NULL' if expected is None else lit(expected) + '::uuid')
        source = 'BEGIN;SET LOCAL ROLE ' + role + ';SET LOCAL request.jwt.claim.sub=' + lit(actor) + ";SET LOCAL request.jwt.claim.role='" + role + "';SELECT public." + name + '(' + lit(key) + '::uuid,' + lit(json.dumps(payload)) + '::jsonb' + suffix + ');COMMIT;'
        result = sql(source, ok)
        return json.loads(result) if ok else result
    def reject(name, payload, label, **options):
        before = state()
        result = call(name, payload, ok=False, **options)
        check(result.returncode != 0 and state() == before, label)
    proposal = dict(mode='create', product_id=None, original=None, fields=fields())
    key = str(uuid.uuid4())
    posted = call('fn_product_catalog_post', proposal, key)
    product = posted['product']
    check(product['cantidad_actual'] == 2.35 and product['updated_by'] == OWNER and posted['audit']['after_row'] == product,
          'catalog create exact trusted actor/opening/audit with real triggers')
    check(json.loads(sql('SELECT to_jsonb(p) FROM public.productos p WHERE id=' + lit(product['id']) + '::uuid;')) == product,
          'catalog receipt equals independently read durable full product')
    before = state()
    check(call('fn_product_catalog_post', proposal, key) == posted and state() == before, 'catalog lost-response replay creates no additional row/ledger/proof')
    edited_fields = {k: product[k] for k in fields() if k not in ('activo','cantidad_actual')}
    edited_fields['precio_unitario'] = 9.25
    edit = dict(mode='edit', product_id=product['id'], original=product, fields=edited_fields)
    updated = call('fn_product_catalog_post', edit, actor=OTHER, expected=OTHER)
    check(updated['product']['updated_by'] == OTHER and updated['audit']['before_row'] == product and updated['product']['cantidad_actual'] == 2.35,
          'different current actor edits exact original while trigger attribution and stock agree')
    reject('fn_product_catalog_post', edit, 'stale full original refuses without domain/proof changes')
    reject('fn_product_catalog_post', proposal, 'mismatched expected owner refuses before mutation', expected=OTHER)
    reject('fn_product_catalog_post', proposal, 'null expected owner refuses before mutation', expected=None)
    activation = dict(mode='activation', product_id=product['id'], original=updated['product'], fields=dict(activo=False))
    inactive = call('fn_product_catalog_post', activation)
    check(inactive['product']['activo'] is False and inactive['product']['updated_by'] == OWNER and inactive['movement_id'] is None,
          'activation survives reviewed timestamps and changes no inventory ledger')
    csv = dict(raw_csv='synthetic CSV bytes', parser_version=1, products=[dict(nombre='Synthetic CSV '+uuid.uuid4().hex,
               categoria='Fertilizante', grupo='Agroinsumos', unidad_medida='Kilos', activo=True, cantidad_actual=3.45)])
    ck = str(uuid.uuid4())
    register = 'BEGIN;SET LOCAL ROLE service_role;SELECT public.fn_csv_product_import_register(' + lit(OWNER) + '::uuid,' + lit(ck) + '::uuid,' + lit(json.dumps(csv)) + '::jsonb);COMMIT;'
    sql(register)
    result = call('fn_csv_product_import', csv, ck)
    check(bool(result), 'CSV service-parsed human posting succeeds with reviewed triggers')
    before = state()
    check(call('fn_csv_product_import', csv, ck) == result and state() == before, 'CSV lost-response exact replay adds no opening/ledger/receipt')
    check(sql("SELECT count(*) FROM public.productos WHERE nombre=" + lit(csv['products'][0]['nombre']) + ' AND cantidad_actual=3.45 AND updated_by=' + lit(OWNER) + '::uuid;') == '1',
          'CSV independently read stock and trusted updated_by match one durable product')
    # Faults are synthetic, post-install only, and never accepted as a release
    # baseline. Exact domain/receipt readbacks must roll back suppressed or
    # after-trigger changes even after the original installation check passed.
    for table, timing, body, label in (
        ('productos','BEFORE','RETURN NULL;','suppressed catalog row'),
        ('productos','AFTER',"UPDATE public.productos SET nombre='Synthetic after-trigger mutation' WHERE id=NEW.id; RETURN NEW;",'after-trigger product corruption'),
        ('movimientos_inventario','AFTER','UPDATE public.movimientos_inventario SET cantidad=cantidad+1 WHERE id=NEW.id; RETURN NEW;','after-trigger opening corruption')):
        sql('CREATE FUNCTION public.synthetic_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN '+body+' END$$; CREATE TRIGGER synthetic_fault '+timing+' INSERT ON public.'+table+' FOR EACH ROW EXECUTE FUNCTION public.synthetic_fault();')
        reject('fn_product_catalog_post', dict(mode='create',product_id=None,original=None,fields=fields()), label+' rolls back complete catalog/ledger/proof/audit')
        sql('DROP TRIGGER synthetic_fault ON public.'+table+'; DROP FUNCTION public.synthetic_fault();')
    multi = dict(raw_csv='synthetic two-row CSV',parser_version=1,products=[dict(csv['products'][0],nombre='Synthetic first '+uuid.uuid4().hex),dict(csv['products'][0],nombre='Synthetic refused '+uuid.uuid4().hex)])
    mk = str(uuid.uuid4())
    sql('BEGIN;SET LOCAL ROLE service_role;SELECT public.fn_csv_product_import_register('+lit(OWNER)+'::uuid,'+lit(mk)+'::uuid,'+lit(json.dumps(multi))+'::jsonb);COMMIT;')
    sql('CREATE FUNCTION public.synthetic_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.nombre='+lit(multi['products'][1]['nombre'])+' THEN RETURN NULL;END IF;RETURN NEW;END$$; CREATE TRIGGER synthetic_fault BEFORE INSERT ON public.productos FOR EACH ROW EXECUTE FUNCTION public.synthetic_fault();')
    reject('fn_csv_product_import',multi,'second CSV row suppression rolls back first row/ledger/openings/receipt while preserving registered parser proof',key=mk)
    sql('DROP TRIGGER synthetic_fault ON public.productos; DROP FUNCTION public.synthetic_fault();')
    sql("UPDATE public.usuarios SET activo=false WHERE id="+lit(OWNER)+'::uuid;')
    reject('fn_product_catalog_post',proposal,'revoked actor cannot replay committed catalog receipt',key=key)
    reject('fn_csv_product_import',csv,'revoked actor cannot replay committed CSV receipt',key=ck)
    sql("UPDATE public.usuarios SET activo=true WHERE id="+lit(OWNER)+'::uuid;')
    check(sql(query) == BASELINE, 'all mutation paths preserve reviewed trigger/function/config/grant baseline')
    return {'snapshot_hashes': hashes, 'reviewed_product_trigger_digest': BASELINE, 'assertions': len(checks), 'checks': checks,
            'candidate_hashes': {name:r.p.digest(source.encode()) for name,source in candidates.items()},
            'limits': ['Synthetic users/data and Auth helpers on verified local replay only; no hosted certification.',
                       'Other writer/grant retirement, plan-delete/treatment compatibility and combined concurrency remain separate.']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('evidence_dir', type=Path)
    parser.add_argument('--runtime', type=Path, required=True)
    parser.add_argument('--client', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--private-diagnostics', type=Path, required=True)
    args = parser.parse_args()
    evidence, output = args.evidence_dir.resolve(), args.output.resolve()
    if output.is_relative_to(evidence) or output.name.endswith('-private.json') or args.private_diagnostics.resolve().is_relative_to(evidence):
        raise ValueError('Cannot overwrite private evidence')
    c, rls, hashes = r.load(evidence)
    with r.database(args.runtime.resolve(), args.client.resolve(), args.private_diagnostics.resolve()) as sql:
        result = run(c, rls, hashes, sql)
    result['temporary_database_stopped_and_removed'] = True
    output.write_text(json.dumps(result,indent=2)+'\n')
    print('Reviewed product trigger mutations/drift and cleanup PASS', flush=True)


if __name__ == '__main__':
    main()
