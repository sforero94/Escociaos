#!/usr/bin/env python3
"""Derive/replay static invoice compatibility DDL from local candidate functions only."""
import argparse
import hashlib
import importlib.util
import json
import re
import subprocess
from pathlib import Path

spec = importlib.util.spec_from_file_location('invoice_prior', Path(__file__).with_name('invoice-combined-admission-replay.py'))
a = importlib.util.module_from_spec(spec)
spec.loader.exec_module(a)
p, c, r = a.p, a.c, a.r
SOURCE = r.ROOT / 'src/sql/security-candidates/invoice-combined-integrity.sql'


def md5(value):
    return hashlib.md5(value.encode()).hexdigest()


def catalog_query():
    # Reuse a reviewed, source-owned catalog query, not exported function bodies.
    text = (r.ROOT / 'src/sql/security-candidates/hato-income-metadata.sql').read_text()
    body = text.split('AS $baseline$', 1)[1].split('$baseline$;', 1)[0]
    start = body.index("WHERE n.nspname='public' AND c.relname IN(")
    end = body.index('),\nsections', start)
    return (body[:start] + 'WHERE c.oid IN ' + a.TARGETS + body[end:]).replace("p.schemaname='public'", "p.schemaname=(SELECT ns.nspname FROM pg_class rel JOIN pg_namespace ns ON ns.oid=rel.relnamespace WHERE rel.oid=t.oid)")


def functions(sql):
    namespaces = sorted(set(re.findall(r'CREATE SCHEMA(?: IF NOT EXISTS)?\s+(\w+)', '\n'.join(f.read_text() for f in (r.ROOT / 'src/sql/security-candidates').glob('*.sql')), re.I)))
    # Only private protocol definitions from tracked review candidates are eligible.
    namespaces = [n for n in namespaces if n not in ('public', 'storage', 'auth', 'respaldos')]
    return json.loads(sql("BEGIN;SET LOCAL search_path=pg_catalog;SELECT coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'source',p.prosrc,'definition',pg_get_functiondef(p.oid),'body',md5(p.prosrc),'args',p.pronargs,'returns',p.prorettype::regtype::text,'name',p.proname,'authority',md5(jsonb_build_array(pg_get_userbyid(p.proowner),p.proacl,p.proconfig,p.prosecdef,p.provolatile,p.proparallel,p.proleakproof,p.proisstrict)::text)) ORDER BY p.oid::regprocedure::text),'[]') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN(" + ','.join(p.lit(n) for n in namespaces) + ');COMMIT;'))


def values(sql, funcs):
    result = {}
    for f in funcs:
        if f['args'] == 0 and f['returns'] == 'text' and 'md5' in f['source'] and 'pg_' in f['source']:
            for path in ('public', 'pg_catalog'):
                v = sql('BEGIN;SET LOCAL search_path=' + path + ';SELECT ' + f['signature'] + ';COMMIT;')
                if not re.fullmatch('[0-9a-f]{32}', v):
                    raise AssertionError('Unexpected catalog fingerprint shape')
                result[(f['signature'], path)] = v
    return result


def replacements(original, pairs):
    current = {f['signature']: f['source'] for f in original}
    for _ in range(64):
        mapping = dict(pairs)
        for f in original:
            old, new = f['body'], md5(current[f['signature']])
            if old != new:
                if old in mapping and mapping[old] != new:
                    raise AssertionError('Ambiguous function pin mapping')
                mapping[old] = new
        updated = {f['signature']: re.sub(r"'([0-9a-f]{32})'", lambda m: "'" + mapping.get(m[1], m[1]) + "'", f['source']) for f in original}
        if updated == current:
            return updated
        current = updated
    raise AssertionError('Cyclic body pins require explicit review, not guessed acceptance')


def invoice_controls(sql):
    """Static private authority pin; exclude only its own recursive body digest."""
    query = """WITH sections AS(
 SELECT 'schema' k,jsonb_agg(jsonb_build_array(pg_get_userbyid(nspowner),nspacl)) v FROM pg_namespace WHERE nspname='invoice_upload'
 UNION ALL SELECT 'tables',jsonb_agg(jsonb_build_array(c.relname,pg_get_userbyid(c.relowner),c.relacl,c.relrowsecurity,c.relforcerowsecurity,c.relkind) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='invoice_upload' AND c.relkind IN('r','p')
 UNION ALL SELECT 'columns',jsonb_agg(jsonb_build_array(c.relname,a.attname,a.attnum,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attacl,pg_get_expr(d.adbin,d.adrelid)) ORDER BY c.relname,a.attnum) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='invoice_upload' AND c.relkind IN('r','p')
 UNION ALL SELECT 'constraints',jsonb_agg(jsonb_build_array(c.relname,k.conname,pg_get_constraintdef(k.oid),k.convalidated,k.condeferrable,k.condeferred) ORDER BY c.relname,k.conname) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='invoice_upload'
 UNION ALL SELECT 'indexes',jsonb_agg(jsonb_build_array(c.relname,pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready,i.indislive) ORDER BY c.relname,i.indexrelid::regclass::text) FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='invoice_upload'
 UNION ALL SELECT 'triggers',coalesce(jsonb_agg(jsonb_build_array(c.relname,t.tgname,pg_get_triggerdef(t.oid),t.tgenabled) ORDER BY c.relname,t.tgname),'[]') FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='invoice_upload' AND NOT t.tgisinternal
 UNION ALL SELECT 'policies',coalesce(jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname),'[]') FROM pg_policies p WHERE schemaname='invoice_upload'
 UNION ALL SELECT 'functions',jsonb_agg(jsonb_build_array(n.nspname,f.proname,pg_get_function_identity_arguments(f.oid),pg_get_userbyid(f.proowner),f.proacl,f.prosecdef,f.proconfig,f.provolatile,f.proparallel,f.proisstrict,f.proleakproof,f.prorettype::regtype::text,f.proretset,f.proargnames,f.proargmodes,f.prokind,(SELECT lanname FROM pg_language WHERE oid=f.prolang),CASE WHEN n.nspname='invoice_upload' AND f.proname='assert_controls' THEN NULL ELSE md5(f.prosrc) END) ORDER BY n.nspname,f.proname,pg_get_function_identity_arguments(f.oid)) FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace WHERE n.nspname='invoice_upload' OR(n.nspname='public' AND f.proname IN('fn_invoice_upload_target','fn_invoice_upload_step','invoice_object_committed'))
 UNION ALL SELECT 'rules',coalesce(jsonb_agg(jsonb_build_array(c.relname,w.rulename,pg_get_ruledef(w.oid)) ORDER BY c.relname,w.rulename),'[]') FROM pg_rewrite w JOIN pg_class c ON c.oid=w.ev_class JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='invoice_upload'
) SELECT md5((SELECT jsonb_object_agg(k,v)::text FROM sections));"""
    query = 'SELECT md5(jsonb_build_array((' + catalog_query().strip().removesuffix(';') + '),(' + query.strip().removesuffix(';') + '))::text);'
    prefix = "CREATE FUNCTION invoice_upload.assert_controls() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $control$ BEGIN RAISE EXCEPTION 'Uninitialized invoice controls';END $control$;REVOKE ALL ON FUNCTION invoice_upload.assert_controls() FROM PUBLIC,anon,authenticated,service_role;"
    sql(prefix)
    definitions = []
    for name in ('invoice_upload.guard_reference()', 'public.fn_invoice_upload_target(uuid,uuid,text)', 'public.fn_invoice_upload_step(uuid,text,jsonb,text)'):
        f = json.loads(sql('SELECT jsonb_build_object(\'source\',prosrc,\'definition\',pg_get_functiondef(oid)) FROM pg_proc WHERE oid=' + p.lit(name) + '::regprocedure;'))
        source = f['source'].replace('BEGIN', 'BEGIN\n PERFORM invoice_upload.assert_controls();', 1)
        definition = f['definition'].replace(f['source'], source, 1)
        sql(definition)
        definitions.append(definition.rstrip().removesuffix(';') + ';')
    digest = sql('BEGIN;SET LOCAL search_path=pg_catalog;' + query + 'COMMIT;')
    actual = "CREATE OR REPLACE FUNCTION invoice_upload.assert_controls() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $control$ BEGIN IF (" + query.removesuffix(';') + ") IS DISTINCT FROM '" + digest + "' THEN RAISE EXCEPTION 'Unreviewed invoice private authority';END IF;END $control$;"
    sql(actual)
    sql('SELECT invoice_upload.assert_controls();')
    return prefix + '\n' + '\n'.join(definitions) + '\n' + actual


def derive(sql):
    old = functions(sql)
    before = values(sql, old)
    query = catalog_query()
    fingerprint = sql('BEGIN;SET LOCAL search_path=pg_catalog;' + query + 'COMMIT;')
    invoice = a.CANDIDATE.read_text()
    # The original guard remains unchanged in its isolated candidate.
    line = next(x for x in invoice.splitlines() if 'Invoice installation requires reviewed current Storage/reference triggers' in x)
    if not line.strip().startswith('IF EXISTS(SELECT 1 FROM pg_trigger'):
        raise AssertionError('Original invoice guard changed')
    exact = " IF (" + query.strip().removesuffix(';') + ") IS DISTINCT FROM '" + fingerprint + "' THEN RAISE EXCEPTION 'Unreviewed combined invoice catalog';END IF;"
    body = r.transaction_body(invoice.replace(line, exact))
    body = 'SET LOCAL ROLE postgres;\n' + body.replace('CREATE POLICY invoice_server_insert_only', 'SET LOCAL ROLE supabase_storage_admin;\nCREATE POLICY invoice_server_insert_only') + "\nCREATE POLICY invoice_server_delete_only ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(bucket_id<>'facturas');\nSET LOCAL ROLE postgres;\n"
    sql('BEGIN;SET LOCAL search_path=pg_catalog;' + body + 'COMMIT;', bootstrap=True)
    authority = invoice_controls(sql)
    after = values(sql, old)
    pairs = {}
    for key, value in before.items():
        if value != after[key]:
            if value in pairs and pairs[value] != after[key]:
                raise AssertionError('Context-dependent ambiguous baseline mapping')
            pairs[value] = after[key]
    revised = replacements(old, pairs)
    changes = [f for f in old if revised[f['signature']] != f['source']]
    checks, definitions, report = [], [], []
    for f in changes:
        if f['source'] not in f['definition']:
            raise AssertionError('Cannot preserve exact candidate function definition')
        checks.append("IF md5(pg_get_functiondef(" + p.lit(f['signature']) + "::regprocedure)) IS DISTINCT FROM '" + md5(f['definition']) + "' THEN RAISE EXCEPTION 'Unreviewed original invoice dependency';END IF;")
        checks.append("IF (SELECT md5(jsonb_build_array(pg_get_userbyid(p.proowner),p.proacl,p.proconfig,p.prosecdef,p.provolatile,p.proparallel,p.proleakproof,p.proisstrict)::text) FROM pg_proc p WHERE p.oid=" + p.lit(f['signature']) + "::regprocedure) IS DISTINCT FROM '" + f['authority'] + "' THEN RAISE EXCEPTION 'Unreviewed original invoice dependency authority';END IF;")
        definitions.append(f['definition'].replace(f['source'], revised[f['signature']], 1).rstrip().removesuffix(';') + ';')
        report.append(dict(signature=f['signature'], before=f['body'], after=md5(revised[f['signature']])))
    # No source-owned implementation is discovered or accepted during installation.
    complete = '-- LOCAL REVIEW ONLY. Requires authorized owner-switching installer; no new role membership.\nBEGIN;\nSET LOCAL ROLE postgres;\nSET LOCAL search_path=pg_catalog;\nSELECT hato_birth_undo.lock_domain();\nDO $admit$ BEGIN\n' + '\n'.join(checks) + '\nEND $admit$;\n' + body + '\n' + authority + '\n' + '\n'.join(definitions) + '\nCOMMIT;\n'
    for definition in definitions:
        sql(definition)
    return complete, dict(baseline_pairs=pairs, function_replacements=report)


def install(sql):
    p.install(sql)
    sql("INSERT INTO storage.buckets(id,name,public) VALUES('facturas','facturas',false);")
    rows = p.query(sql)
    before = sql(rows)
    if install.derive:
        text, install.report = derive(sql)
        SOURCE.write_text(text)
    else:
        for ddl in ("ALTER FUNCTION storage.update_updated_at_column() SET search_path=public;", "ALTER TABLE storage.objects DISABLE TRIGGER update_objects_updated_at;"):
            # Resolve the captured Storage function through its trigger below;
            # no live metadata or function definitions enter this probe.
            if ddl.startswith('ALTER FUNCTION'):
                binding = sql("SELECT tgfoid::regprocedure::text FROM pg_trigger WHERE tgrelid='storage.objects'::regclass AND tgname='update_objects_updated_at';")
                ddl = 'ALTER FUNCTION ' + binding + ' SET search_path=public;'
            failed = sql('BEGIN;' + ddl + r.transaction_body(SOURCE.read_text()) + 'COMMIT;', False, bootstrap=True)
            if failed.returncode == 0 or 'Unreviewed combined invoice catalog' not in failed.stderr or sql(rows) != before or sql("SELECT to_regnamespace('invoice_upload') IS NULL;") != 't':
                diagnostic = Path('/tmp/escocia-invoice-integrity-admission-private.log')
                diagnostic.touch(mode=0o600, exist_ok=True)
                diagnostic.write_text(failed.stderr)
                raise AssertionError('Invoice baseline drift must refuse with complete installation rollback')
        sql(SOURCE.read_text(), bootstrap=True)
        install.report = {}
    if sql(rows) != before:
        raise AssertionError('Invoice installation changed existing rows')
    if sql('SELECT(SELECT count(*) FROM invoice_upload.targets)+(SELECT count(*) FROM invoice_upload.requests)+(SELECT count(*) FROM invoice_upload.executions);') != '0':
        raise AssertionError('Invoice installation seeded controls')
    for f in functions(sql):
        if f['args'] == 0 and f['returns'] == 'void' and f['name'].startswith('assert_'):
            sql('SELECT ' + f['signature'] + ';')


def exercise(sql, ctx):
    ctx['check'](True, 'all56candidates install without changing existing rows or seeding invoice state')
    ctx['check'](True, 'all zero-argument protected authority and baseline assertions pass after integration')
    p.p.exercise(sql, ctx)
    check, call = ctx['check'], ctx['call']
    actor = c.uid()
    sql('INSERT INTO auth.users VALUES(' + p.u(actor) + ');INSERT INTO usuarios(id,email,rol,activo) VALUES(' + p.u(actor) + ",'invoice@synthetic.invalid','Gerencia',true);")
    proc = subprocess.run(['node', str(Path(__file__).with_name('invoice-combined-native.mjs'))], input=json.dumps(dict(socket=sql('SHOW unix_socket_directories;'), client=str(exercise.client), owner=actor)), capture_output=True, text=True, cwd=r.ROOT, timeout=90)
    if proc.returncode:
        diagnostic = Path('/tmp/escocia-invoice-combined-sdk-private.log')
        diagnostic.touch(mode=0o600, exist_ok=True)
        diagnostic.write_text(proc.stderr)
        raise AssertionError('Actual invoice handler/SDK failed; inspect external private diagnostics')
    data = json.loads(proc.stdout)
    exercise.sdk = {k: v for k, v in data.items() if k != 'committed'}
    receipt = data['committed']
    income = sql('SELECT id FROM fin_ingresos ORDER BY id LIMIT 1;')
    if not income:
        raise AssertionError('Missing synthetic financial fixture')
    alias = 'https://example.invalid/storage/v1/object/sign/facturas/' + receipt['path'] + '?token=synthetic'
    sql('UPDATE fin_ingresos SET url_factura=' + p.lit(alias) + ' WHERE id=' + p.u(income) + ';')
    check(sql('SELECT url_factura FROM fin_ingresos WHERE id=' + p.u(income) + ';') == alias, 'committed canonical alias coexists with original financial triggers')
    rows = p.query(sql)
    def refuse(statement, label, bootstrap=False):
        before = sql(rows)
        failed = sql('BEGIN;' + statement + 'COMMIT;', False, bootstrap=bootstrap)
        if failed.returncode == 0 or sql(rows) != before:
            raise AssertionError(label + ' must refuse with exact whole-state rollback')
        if any(x in failed.stderr for x in ('syntax error', 'does not exist', 'ambiguous', 'is not assigned')):
            raise AssertionError('Unexpected local SQL defect')
        check(True, label)
    for role in ('anon', 'authenticated'):
        refuse('SET LOCAL ROLE ' + role + ';SELECT fn_invoice_upload_step(' + p.u(actor) + ",'status'," + p.js(receipt['identity']) + ',NULL);', role + ' cannot invoke trusted invoice service transition')
    refuse('UPDATE fin_ingresos SET url_factura=' + p.lit('verified/' + c.uid() + '.png') + ' WHERE id=' + p.u(income) + ';', 'uncommitted reserved namespace cannot be attached')
    read = sql('BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub=' + p.lit(actor) + ";SELECT count(*) FROM storage.objects WHERE bucket_id='facturas' AND name=" + p.lit(receipt['path']) + ';COMMIT;')
    check(read == '1', 'current ordinary Gerencia retains committed invoice visibility')
    before_delete = sql(rows)
    deleted = sql("BEGIN;SET LOCAL storage.allow_delete_query='true';SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub=" + p.lit(actor) + ";DELETE FROM storage.objects WHERE bucket_id='facturas' AND name=" + p.lit(receipt['path']) + ' RETURNING id;COMMIT;')
    check(deleted == '' and sql(rows) == before_delete, 'ordinary invoice deletion is filtered with all retained Storage/proof/reference rows intact')
    for ddl, label in (("GRANT UPDATE ON invoice_upload.requests TO service_role;", 'private request table authority drift'), ("GRANT UPDATE(state) ON invoice_upload.requests TO authenticated;", 'private request column authority drift'), ("ALTER FUNCTION invoice_upload.guard_reference() SET search_path=public;", 'reference guard configuration drift')):
        refuse(ddl + 'SET LOCAL ROLE service_role;SELECT fn_invoice_upload_step(' + p.u(actor) + ",'status'," + p.js(receipt['identity']) + ',NULL);', label + ' refuses before service transition')
    refuse("ALTER POLICY invoice_server_insert_only ON storage.objects WITH CHECK(true);SET LOCAL ROLE service_role;SELECT fn_invoice_upload_step(" + p.u(actor) + ",'status'," + p.js(receipt['identity']) + ',NULL);', 'shared Storage policy drift refuses before invoice service transition', bootstrap=True)
    original = receipt['identity']
    def step(kind, identity=original, observed=None):
        return call('fn_invoice_upload_step', [p.u(actor), p.lit(kind), p.js(identity), p.lit(observed) if observed is not None else 'NULL'], role='service_role')
    unknown = dict(original, requestKey=c.uid())
    step('reserve', unknown)
    execution = c.uid()
    step('write-claim', unknown, execution)
    step('quarantine', unknown)
    step('cleanup-observed', unknown, 'absent')
    check(step('status', unknown)['cleanupPending'], 'absence cannot settle original uncertain write execution')
    refuse('SET LOCAL ROLE service_role;SELECT fn_invoice_upload_step(' + p.u(actor) + ",'write-claim'," + p.js(unknown) + ',' + p.lit(c.uid()) + ');', 'quarantined original cannot allocate replacement permission')
    step('write-settled', unknown, execution)
    step('cleanup-observed', unknown, 'absent')
    check(not step('status', unknown)['cleanupPending'], 'only original definitive settlement permits later explicit absence proof')
    refuse('SET LOCAL ROLE service_role;SELECT fn_invoice_upload_step(' + p.u(actor) + ",'cleanup-authorize'," + p.js(original) + ',NULL);', 'committed referenced invoice cannot authorize deletion')


def main():
    parser = argparse.ArgumentParser()
    for name in ('evidence-dir', 'runtime', 'client', 'output', 'private-diagnostics'):
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--derive', action='store_true')
    args = parser.parse_args()
    install.derive = args.derive
    exercise.client = args.client.resolve()
    old = json.loads((r.ROOT / 'docs/security-integrity/invoice-combined-admission-replay.json').read_text())
    extra = [Path(__file__).with_name('invoice-combined-native.mjs'), r.ROOT / 'src/__tests__/invoiceUploadFixtures.ts']
    for root in ('src/supabase/functions/server', 'supabase/functions/make-server-1ccce916'):
        extra.extend(r.ROOT / root / name for name in ('invoice-upload.ts', 'invoice-file-validation.ts', 'perfilAplicacionActivo.ts'))
    files = list(dict.fromkeys([Path(__file__), *extra, *[r.ROOT / k for k in old['source_hashes']], *([] if args.derive else [SOURCE])]))
    frozen = {f: f.read_bytes() for f in files}
    base = p.p
    while not hasattr(base, 's'):
        base = base.p
    catalog, rls, storage, types, hashes, _ = base.s.load(args.evidence_dir.resolve())
    base.install.inputs = (storage, types, rls, catalog)
    if args.output.resolve().is_relative_to(args.evidence_dir.resolve()) or args.output.name.endswith('-private.json'):
        raise ValueError('Private output boundary')
    with r.database(args.runtime.resolve(), args.client.resolve(), args.private_diagnostics.resolve()) as sql:
        result = c.run(catalog, rls, hashes, sql, followup=exercise, installation=install)
    if any(f.read_bytes() != value for f, value in frozen.items()):
        raise ValueError('Changing invoice integration sources cannot be certified')
    result.update(coordinated_candidate_count=56, derivation_only=args.derive, pin_reconciliation=install.report,
                  installed_sdk=exercise.sdk,
                  source_hashes={str(f.relative_to(r.ROOT)): r.p.digest(v) for f, v in frozen.items()},
                  temporary_database_stopped_and_removed=True,
                  limits=['Six approved local structure snapshots/contained synthetic PG only; never production.',
                          'Measured new attachments remain blocked pending actual byte/reference caller proof; financial writer retirement remains separate.'])
    args.output.write_text(json.dumps(result, indent=2) + '\n')


if __name__ == '__main__':
    main()
