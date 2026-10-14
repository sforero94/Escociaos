#!/usr/bin/env python3
"""Local PG17.6 entry-gate probes, not a full combined installation certificate."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('preflight', Path(__file__).with_name('schema-evidence-preflight.py'))
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)
CANDIDATES = ('purchase-integrity', 'manual-stock-movement', 'product-catalog-integrity',
              'csv-product-import', 'hato-treatment-creation')


def quote(value):
    return '"' + value.replace('"', '""') + '"'


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def entry_gate(source):
    # Only the entry gate may run: never candidate protected schema/functions.
    prefix, separator, _ = source.partition('CREATE SCHEMA ')
    if not separator or not prefix.rstrip().endswith('END $$;') or not re.search(r'^BEGIN;', prefix, re.M):
        raise ValueError('Unsupported entry gate boundary')
    return prefix


def trigger_gate(source):
    matches = re.findall(r'IF EXISTS\(SELECT 1 FROM pg_trigger WHERE NOT tgisinternal[\s\S]*?END IF;', entry_gate(source))
    if len(matches) != 1:
        raise ValueError('Expected exactly one unconditional noninternal trigger gate')
    return 'DO $$ BEGIN ' + matches[0] + ' END $$;'


def projection(catalog):
    """Exact observed columns/types and user trigger definitions for gate probes.

    Defaults, all FKs, indexes, policies and external Auth/Storage are deliberately
    not reconstructed. No captured function is invoked and there are no rows.
    """
    statements = ['SET check_function_bodies=off;',
                  'CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;']
    for enum in catalog['enums']:
        if enum['schema'] == 'public':
            statements.append('CREATE TYPE public.' + quote(enum['type']) + ' AS ENUM (' +
                              ','.join(literal(v) for v in enum['labels']) + ');')
    for table in p.TABLES:
        columns = sorted((c for c in catalog['columns'] if c['schema'] == 'public' and c['table'] == table), key=lambda c: c['pos'])
        if not columns:
            raise ValueError('Missing projection columns')
        statements.append('CREATE TABLE public.' + quote(table) + '(' +
                          ','.join(quote(c['column']) + ' ' + c['formatted_type'] for c in columns) + ');')
        relation = next(r for r in catalog['relations'] if r['schema'] == 'public' and r['table'] == table)
        if relation['rls']:
            statements.append('ALTER TABLE public.' + quote(table) + ' ENABLE ROW LEVEL SECURITY;')
    # The purchase entry gate reads this specific FK. Its referenced PK is needed
    # to create the exported FK; other constraints are outside these probes.
    for constraint in catalog['constraints']:
        if constraint['schema'] == 'public' and (
            (constraint['table'] == 'compras' and constraint['type'] == 'p') or
            (constraint['table'] == 'fin_gastos' and constraint['type'] == 'f' and
             re.search(r'^FOREIGN KEY \(compra_id\) REFERENCES (?:public\.)?compras\(id\)', constraint['def']))):
            statements.append('ALTER TABLE public.' + quote(constraint['table']) + ' ADD CONSTRAINT ' +
                              quote(constraint['name']) + ' ' + constraint['def'] + ';')
    functions = unique_functions(catalog['functions'])
    needed = {'fn_hato_registrar_tratamiento'}
    triggers = [t for t in catalog['triggers'] if t['schema'] == 'public' and t['table'] in p.TABLES]
    for trigger in triggers:
        match = re.search(r'EXECUTE (?:FUNCTION|PROCEDURE) (?:public\.)?([\w]+)\(', trigger['def'])
        if not match:
            raise ValueError('Unsupported captured trigger function identity')
        needed.add(match[1])
    for name in sorted(needed):
        function = functions[name]
        statements.append(function['def'] + ';')
        if name == 'fn_hato_registrar_tratamiento':
            signature = 'public.' + quote(name) + '(uuid,text,date,text,date,text,text,uuid)'
            statements.append('REVOKE ALL ON FUNCTION ' + signature + ' FROM PUBLIC,anon,authenticated,service_role;')
            roles = p.acl_roles(function['acl'], 'X')
            if not set(roles).issubset({'postgres', 'authenticated', 'service_role'}):
                raise ValueError('Historical treatment ACL requires broader projection')
            for role in roles:
                statements.append('GRANT EXECUTE ON FUNCTION ' + signature + ' TO ' + quote(role) + ';')
    for trigger in triggers:
        statements.append(trigger['def'] + ';')
        state = {'O': 'ENABLE', 'D': 'DISABLE', 'A': 'ENABLE ALWAYS', 'R': 'ENABLE REPLICA'}.get(trigger['enabled'])
        if state is None:
            raise ValueError('Unsupported trigger enable state')
        statements.append('ALTER TABLE public.' + quote(trigger['table']) + ' ' + state + ' TRIGGER ' + quote(trigger['name']) + ';')
    return '\n'.join(statements), triggers


def unique_functions(functions):
    result = {}
    for function in functions:
        if function['schema'] == 'public':
            if function['name'] in result:
                raise ValueError('Function overload requires explicit projection support')
            result[function['name']] = function
    return result


def run(evidence, runtime, client):
    if evidence.is_relative_to(ROOT) or not runtime.is_relative_to('/tmp') or not client.is_relative_to('/tmp'):
        raise ValueError('External private evidence and temporary local runtime/client required')
    values, hashes = [], {}
    for name in ('live-catalog-private.json', 'live-rls-private.json', 'live-catalog-supplement-private.json'):
        raw = (evidence / name).read_bytes()
        hashes[name] = p.digest(raw)
        values.append(json.loads(raw))
    catalog = p.with_supplement(values[0], values[2])
    if not p.assess(catalog, values[1], hashes)['minimum_metadata_admission_passed']:
        raise ValueError('Minimum metadata admission must pass first')
    env = os.environ.copy()
    env['LD_LIBRARY_PATH'] = str(runtime / 'lib')
    version = subprocess.check_output([str(runtime / 'bin/postgres'), '--version'], env=env, text=True).strip()
    if version != 'postgres (PostgreSQL) 17.6':
        raise ValueError('Pinned local PG17.6 required')
    local = Path(tempfile.mkdtemp(prefix='escocia-treatment-pg-', dir='/tmp'))
    (local / 'socket').mkdir(mode=0o700)
    stopped = False
    started = False

    def sql(source):
        return subprocess.run(['node', str(ROOT / 'scripts/security/local-postgres-query.mjs'),
                               str(local / 'socket'), str(client)], input=source, text=True,
                              capture_output=True, timeout=60)

    def require(source):
        result = sql(source)
        if result.returncode:
            # Never print captured private statements or arbitrary DB diagnostics.
            raise ValueError('Local catalog projection/query failed; no private diagnostics published')
        return result.stdout.strip()

    report = None
    try:
        subprocess.run([str(runtime / 'bin/initdb'), '-D', str(local / 'data'), '-U', 'postgres',
                        '--auth-local=trust', '--auth-host=reject', '--encoding=UTF8', '--locale=C'],
                       env=env, check=True, capture_output=True, timeout=60)
        subprocess.run([str(runtime / 'bin/pg_ctl'), '-D', str(local / 'data'), '-l', str(local / 'server.log'),
                        '-o', f"-c listen_addresses='' -c unix_socket_directories={local}/socket -c unix_socket_permissions=0700 -p 55439",
                        '-w', 'start'], env=env, check=True, capture_output=True, timeout=60)
        started = True
        if require('SHOW listen_addresses;') != '' or (local / 'socket').stat().st_mode & 0o777 != 0o700:
            raise ValueError('Local transport containment refused')
        ddl, triggers = projection(catalog)
        require(ddl)
        empty = '+'.join('(SELECT count(*) FROM public.' + quote(t) + ')' for t in p.TABLES)
        if require('SELECT ' + empty + ';') != '0':
            raise ValueError('Empty structural projection required')
        results = []
        for name in CANDIDATES:
            path = ROOT / 'src/sql/security-candidates' / (name + '.sql')
            source = path.read_text()
            gate = entry_gate(source)
            outcome = sql(gate + '\nROLLBACK;')
            allowed = re.findall(r"RAISE EXCEPTION '([^']*)'", gate)
            matched = [message for message in allowed if '%' not in message and message in outcome.stderr]
            if outcome.returncode and len(matched) != 1:
                raise ValueError('Unclassified entry-gate refusal; no compatibility claim')
            row = {'candidate': name, 'source_sha256': hashlib.sha256(source.encode()).hexdigest(),
                   'entry_gate_sha256': hashlib.sha256(gate.encode()).hexdigest(),
                   'entry_gate': 'refused' if outcome.returncode else 'passed_selected_projection',
                   'refusal': matched[0] if matched else None}
            if name in ('product-catalog-integrity', 'csv-product-import', 'hato-treatment-creation'):
                check = trigger_gate(source)
                if sql('BEGIN;' + check + 'ROLLBACK;').returncode == 0:
                    raise ValueError('Captured trigger gate did not refuse')
                drop = '\n'.join('DROP TRIGGER ' + quote(t['name']) + ' ON public.' + quote(t['table']) + ';' for t in triggers)
                if sql('BEGIN;' + drop + check + 'ROLLBACK;').returncode:
                    raise ValueError('Local trigger-free positive control failed')
                # Local rollback must restore every observed trigger identity.
                count = require("SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (" +
                                ','.join(literal('public.' + t) + '::regclass' for t in p.TABLES) + ');')
                if count != str(len(triggers)):
                    raise ValueError('Local positive-control rollback did not preserve trigger projection')
                row['trigger_gate_refusal_and_positive_control'] = True
            results.append(row)
        if require('SELECT ' + empty + ';') != '0':
            raise ValueError('Entry probes changed synthetic row state')
        if require("SELECT count(*) FROM pg_namespace WHERE nspname IN ('purchase_integrity','manual_stock','product_catalog_integrity','csv_product_import','hato_treatment_creation');") != '0':
            raise ValueError('Candidate implementation boundary was crossed')
        report = {'version': 1, 'kind': 'selected local installation-gate probes',
                  'snapshot_hashes': hashes, 'runtime': version,
                  'postgres_binary_sha256': p.digest((runtime / 'bin/postgres').read_bytes()),
                  'no_tcp_listener': True, 'private_socket_permissions': '0700',
                  'domain_rows_loaded': 0, 'protected_candidate_schemas_created': 0,
                  'results': results,
                  'captured_trigger_identities': [{'table': t['table'], 'name': t['name'], 'enabled': t['enabled']} for t in triggers],
                  'limits': ['Only selected entry gates executed, never captured functions or candidate mutation protocols.',
                             'Projection preserves observed target columns/types/enums/RLS and user triggers, plus the purchase expense FK.',
                             'Other constraints, defaults, indexes, policies, role inheritance and external Auth/Storage are not reconstructed.',
                             'Passing a projected gate is not combined installation, schema parity, effective authorization or hosted runtime certification.',
                             'Trigger-free controls modify only the empty temporary database inside rolled-back transactions.']}
    finally:
        if started or (local / 'data/postmaster.pid').exists():
            result = subprocess.run([str(runtime / 'bin/pg_ctl'), '-D', str(local / 'data'), '-w', '-m', 'immediate', 'stop'],
                                    env=env, capture_output=True, timeout=60)
            if result.returncode or (local / 'data/postmaster.pid').exists():
                raise ValueError('Temporary server stop not verified; retained directory for local investigation')
        stopped = True
        shutil.rmtree(local)
    report['temporary_server_stopped_and_directory_removed'] = stopped and not local.exists()
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('evidence_dir', type=Path)
    parser.add_argument('--runtime', type=Path, required=True)
    parser.add_argument('--client', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    destination = args.output.resolve()
    evidence = args.evidence_dir.resolve()
    if destination.is_relative_to(evidence) or destination.name.endswith('-private.json'):
        raise ValueError('Private evidence cannot be overwritten')
    result = run(evidence, args.runtime.resolve(), args.client.resolve())
    destination.write_text(json.dumps(result, indent=2) + '\n')
    print('Local entry-gate probes and cleanup complete; derived report saved. Full combined rehearsal remains unadmitted.')


if __name__ == '__main__':
    main()
