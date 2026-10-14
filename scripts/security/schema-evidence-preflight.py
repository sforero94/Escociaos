#!/usr/bin/env python3
"""Offline admission/writer map. Never imports a DB client or prints private definitions."""
import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TABLES = ('productos', 'movimientos_inventario', 'compras', 'fin_gastos', 'fin_ingresos',
          'aplicaciones', 'usuarios', 'telegram_usuarios', 'hato_animales',
          'hato_tratamientos', 'hato_tratamiento_pasos')
REQUIRED = ('relations', 'columns', 'constraints', 'indexes', 'triggers', 'functions',
            'views', 'enums', 'sequences', 'migrations')


def digest(value):
    return hashlib.sha256(value).hexdigest()


def acl_roles(acl, privileges):
    """Explicit ACL entries only; never invent effective/inherited permissions."""
    return sorted({(match[1] or 'PUBLIC').strip('"')
                   for match in re.finditer(r'(?:^|[,\{])([^=,{}]*)=([^/]+)/', acl or '')
                   if any(char in match[2] for char in privileges)})


def function_body(definition):
    match = re.search(r'\bAS\s+(\$[\w]*\$)([\s\S]*?)\1', definition, re.I)
    return match[2] if match else None


def lexical_sql(body):
    # Remove strings/comments before looking for ordinary static DML. Dynamic
    # SQL and other language bodies are explicitly outside this lexical map.
    return re.sub(r"'(?:''|[^'])*'|--[^\n]*|/\*[\s\S]*?\*/", ' ', body)


def assess(catalog, rls, hashes):
    for key in REQUIRED:
        if not isinstance(catalog.get(key), list):
            raise ValueError('Missing or malformed catalog section: ' + key)
    if not isinstance(rls.get('policies'), list) or not isinstance(rls.get('rls_flags'), list):
        raise ValueError('Missing or malformed RLS sections')
    if not catalog.get('meta', {}).get('project_ref') or catalog['meta']['project_ref'] != rls.get('meta', {}).get('project_ref'):
        raise ValueError('Snapshot project identities do not match')
    if catalog['meta'].get('exported_at') != rls['meta'].get('exported_at'):
        raise ValueError('Snapshot timestamps do not match')
    blockers = []
    columns = [c for c in catalog['columns'] if c['schema'] == 'public' and c['table'] in TABLES]
    incomplete = [c for c in columns if not c.get('formatted_type') or 'typmod' not in c or 'collation' not in c]
    if incomplete:
        blockers.append({'gate': 'exact_column_types', 'affected_columns': len(incomplete),
                         'tables': sorted({c['table'] for c in incomplete}),
                         'required': ['pg_attribute formatted_type, typmod, collation; numeric precision/scale and character limits must not be guessed']})
    generated = [c for c in columns if c.get('generated') not in (None, '', 'NEVER') and not c.get('generation_expression')]
    if generated:
        blockers.append({'gate': 'generated_expressions', 'affected_columns': len(generated)})
    if any(not all(key in s for key in ('start_value', 'min_value', 'max_value', 'increment_by', 'cycle', 'cache_size')) for s in catalog['sequences']):
        blockers.append({'gate': 'sequence_configuration', 'required': ['pg_sequences structure properties only; exclude last_value']})
    role_fields = ('rolname', 'rolsuper', 'rolinherit', 'rolcreaterole', 'rolcreatedb', 'rolcanlogin', 'rolreplication', 'rolbypassrls')
    roles = catalog.get('roles')
    memberships = catalog.get('role_memberships')
    if (not isinstance(roles, list) or not isinstance(memberships, list)
        or not {'postgres', 'anon', 'authenticated', 'service_role'}.issubset({r.get('rolname') for r in roles if isinstance(r, dict)})
        or any(not all(key in r for key in role_fields) for r in roles)
        or any(not all(key in membership for key in ('role', 'member', 'grantor', 'admin_option', 'inherit_option', 'set_option')) for membership in memberships)):
        blockers.append({'gate': 'effective_permissions', 'required': ['role privilege flags and memberships (including inherit/set options); exclude passwords and authentication/domain rows']})
    owners = catalog.get('grants', {}).get('table_grants', [])
    matrix = []
    for name in TABLES:
        matching = [r for r in catalog['relations'] if r['schema'] == 'public' and r['table'] == name]
        if len(matching) != 1:
            blockers.append({'gate': 'target_relation', 'table': name})
            continue
        flag = [r for r in rls['rls_flags'] if r['schema'] == 'public' and r['table'] == name]
        if len(flag) != 1 or flag[0]['rls'] != matching[0]['rls'] or flag[0]['force_rls'] != matching[0]['force_rls']:
            blockers.append({'gate': 'rls_snapshot_consistency', 'table': name})
        grant = next((g for g in owners if g['schema'] == 'public' and g['table'] == name), None)
        if grant is None:
            blockers.append({'gate': 'table_acl_missing', 'table': name})
        matrix.append({'table': name, 'columns': sum(c['table'] == name for c in columns),
                       'rls': matching[0]['rls'], 'force_rls': matching[0]['force_rls'],
                       'triggers': sum(t['schema'] == 'public' and t['table'] == name for t in catalog['triggers']),
                       'policy_count': sum(p['schema'] == 'public' and p['table'] == name for p in rls['policies']),
                       'explicit_dml_roles': acl_roles(grant.get('acl') if grant else None, 'awd')})
    writers = []
    for f in catalog['functions']:
        body = function_body(f['def'])
        if body is None:
            continue
        text = lexical_sql(body)
        touched = sorted({table for table in TABLES if re.search(
            r'\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:public\.)?"?' + re.escape(table) + r'"?\b', text, re.I)})
        dynamic = bool(re.search(r'\bEXECUTE\b', text, re.I))
        if not touched and not dynamic:
            continue
        writers.append({'function': f['schema'] + '.' + f['name'], 'definition_sha256': digest(f['def'].encode()),
                        'body_md5': hashlib.md5(body.encode()).hexdigest(), 'static_dml_tables': touched,
                        'security_definer': f['security_definer'],
                        'explicit_execute_roles': acl_roles(f.get('acl'), 'X'),
                        'public_execute_by_default': f.get('acl') is None,
                        'dynamic_sql_present': dynamic,
                        'expense_delete_token': bool(re.search(r'\bDELETE\s+FROM\s+(?:public\.)?fin_gastos\b', text, re.I))})
    return {'version': 1, 'snapshot_hashes': hashes, 'exported_at': catalog['meta']['exported_at'],
            'source': 'Owner-provided structure-only exports; no production connection',
            'minimum_metadata_admission_passed': not blockers, 'blockers': blockers,
            'counts': {key: len(catalog[key]) for key in REQUIRED}, 'policies': len(rls['policies']),
            'target_matrix': matrix, 'lexical_function_writers': writers,
            'limits': ['Explicit grants do not prove effective/inherited authorization or RLS access.',
                       'Static DML tokens are a review map, not exhaustive writer/call-graph or execution proof.',
                       'Passing admission is not schema parity, combined installation or runtime certification.',
                       'No row data, sequence state, production connection, generated schema or SQL execution.']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('evidence_dir', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    evidence = args.evidence_dir.resolve()
    if evidence.is_relative_to(ROOT):
        raise SystemExit('Private exports must remain outside the repository')
    values, hashes = [], {}
    for name in ('live-catalog-private.json', 'live-rls-private.json'):
        raw = (evidence / name).read_bytes()
        hashes[name] = digest(raw)
        values.append(json.loads(raw))
    report = assess(*values, hashes)
    output = json.dumps(report, indent=2) + '\n'
    if args.output:
        destination = args.output.resolve()
        if destination.is_relative_to(evidence) or destination.name.endswith('-private.json'):
            raise SystemExit('Refusing to overwrite private evidence')
        destination.write_text(output)
    else:
        print(output, end='')
    raise SystemExit(0 if report['minimum_metadata_admission_passed'] else 2)


if __name__ == '__main__':
    main()
