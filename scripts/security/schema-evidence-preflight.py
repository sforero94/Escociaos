#!/usr/bin/env python3
"""Offline admission/writer map. Never imports a DB client or prints private definitions."""
import argparse
import copy
from datetime import datetime
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


def unique_rows(rows, fields):
    result = {}
    for row in rows:
        key = tuple(row[field] for field in fields)
        if key in result:
            raise ValueError('Duplicate metadata identity')
        result[key] = row
    return result


def with_supplement(catalog, supplement):
    """Join only after provenance and overlapping structural fields agree."""
    meta = supplement['meta']
    link = meta['supplement_to']
    check = meta['schema_change_check']
    if (meta['project_ref'] != catalog['meta']['project_ref']
        or link['original_exported_at'] != catalog['meta']['exported_at']
        or link['catalog'] != 'live-catalog-private.json'
        or link['rls'] != 'live-rls-private.json'
        or datetime.fromisoformat(meta['exported_at']) < datetime.fromisoformat(catalog['meta']['exported_at'])):
        raise ValueError('Supplement snapshot provenance does not match')
    tip = catalog['migrations'][-1]['name']
    if (check['schema_changes_detected_vs_original'] is not False
        or check['migrations_count_now'] != len(catalog['migrations'])
        or check['migrations_count_original_export'] != len(catalog['migrations'])
        or check['latest_migration_original_export'] != tip
        or not (check['latest_migration_now'] == tip or check['latest_migration_now'].endswith('_' + tip))):
        raise ValueError('Supplement schema-change attestation does not match')
    merged = copy.deepcopy(catalog)
    base = {(r['schema'], r['table']) for r in catalog['relations']
            if r['kind'] in ('r', 'p') and r['schema'] in ('public', 'respaldos')}
    original = unique_rows([c for c in merged['columns'] if (c['schema'], c['table']) in base], ('schema', 'table', 'column'))
    extra = unique_rows(supplement['column_types'], ('schema', 'table', 'column'))
    if original.keys() != extra.keys():
        raise ValueError('Supplement base-table column coverage does not match')
    for key, column in original.items():
        added = extra[key]
        generated = added['generated'] not in ('', None, 'NEVER')
        if (column['pos'] != added['pos']
            or (column['nullable'] == 'NO') != added['not_null']
            or (column['generated'] == 'ALWAYS') != generated
            or (not generated and column['default'] != added['default_expr'])):
            raise ValueError('Supplement overlapping column structure changed')
        for field in ('formatted_type', 'typmod', 'collation'):
            column[field] = added[field]
        if generated:
            column['generation_expression'] = added['default_expr']
    old_sequences = unique_rows(merged['sequences'], ('schema', 'name'))
    new_sequences = unique_rows(supplement['sequences'], ('schema', 'name'))
    if old_sequences.keys() != new_sequences.keys():
        raise ValueError('Supplement sequence identities do not match')
    for key, sequence in old_sequences.items():
        added = new_sequences[key]
        if any(sequence[field] != added[field] for field in ('owner', 'type')) or 'last_value' in added:
            raise ValueError('Supplement sequence structure changed or contains state')
        for field in ('start_value', 'min_value', 'max_value', 'increment_by', 'cycle', 'cache_size'):
            sequence[field] = added[field]
    merged['roles'] = [dict(r, rolname=r['role']) for r in supplement['roles']]
    merged['role_memberships'] = copy.deepcopy(supplement['role_memberships'])
    return merged


def with_addendum(catalog, supplement, addendum):
    """Reconcile current catalog state without inferring flags from DDL text."""
    meta = addendum['meta']
    link = meta['addendum_to']
    check = meta['schema_change_check']
    tip = catalog['migrations'][-1]['name']
    if (meta['project_ref'] != catalog['meta']['project_ref']
        or link['original_exported_at'] != catalog['meta']['exported_at']
        or link['supplement_exported_at'] != supplement['meta']['exported_at']
        or link['catalog'] != 'live-catalog-private.json'
        or link['rls'] != 'live-rls-private.json'
        or link['supplement'] != 'live-catalog-supplement-private.json'
        or datetime.fromisoformat(meta['exported_at']) < datetime.fromisoformat(supplement['meta']['exported_at'])):
        raise ValueError('Addendum snapshot provenance does not match')
    if (check['schema_changes_detected_vs_original'] is not False
        or check['migrations_count_now'] != len(catalog['migrations'])
        or check['migrations_count_original_export'] != len(catalog['migrations'])
        or check['latest_migration_original_export'] != tip
        or not (check['latest_migration_now'] == tip or check['latest_migration_now'].endswith('_' + tip))
        or check['index_identity_set_matches_original'] is not True
        or check['constraint_identity_set_matches_original'] is not True
        or check['indexdef_text_mismatches_vs_original'] != []):
        raise ValueError('Addendum schema-change attestation does not match')
    merged = copy.deepcopy(catalog)
    for section in ('indexes', 'constraints'):
        original = unique_rows(merged[section], ('schema', 'table', 'name'))
        extra = unique_rows(addendum[section], ('schema', 'table', 'name'))
        if original.keys() != extra.keys():
            raise ValueError('Addendum object identity coverage does not match')
        for key, row in original.items():
            added = dict(extra[key])
            if section == 'indexes':
                if row['def'] != added['indexdef']:
                    raise ValueError('Addendum index definition changed')
                flags = ('indisvalid', 'indisready', 'indislive', 'indimmediate', 'indisunique',
                         'indisprimary', 'indisexclusion', 'indnullsnotdistinct')
                # SQL array_agg over zero INCLUDE attributes exports null. The
                # explicit key/total counts establish that it means an empty set.
                if (added.get('include_columns') is None and 'include_columns' in added
                    and added.get('indnatts') == added.get('indnkeyatts')):
                    added['include_columns'] = []
                if (any(not isinstance(added.get(f), bool) for f in flags)
                    or not isinstance(added.get('indnkeyatts'), int)
                    or not isinstance(added.get('indnatts'), int)
                    or not isinstance(added.get('key_columns'), list)
                    or not isinstance(added.get('include_columns'), list)
                    or 'predicate' not in added or 'expressions' not in added):
                    raise ValueError('Addendum index state is incomplete')
            else:
                if row['type'] != added['contype'] or any(not isinstance(added.get(f), bool)
                    for f in ('convalidated', 'condeferrable', 'condeferred')):
                    raise ValueError('Addendum constraint state changed or is incomplete')
            row.update(added)
    if not isinstance(addendum.get('rewrite_rules'), list):
        raise ValueError('Explicit rewrite-rule inventory required')
    merged['rewrite_rules'] = copy.deepcopy(addendum['rewrite_rules'])
    return merged


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
    if not catalog['meta'].get('exported_at') or catalog['meta'].get('exported_at') != rls['meta'].get('exported_at'):
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
        or any(not all(key in r for key in role_fields) or any(not isinstance(r[key], bool) for key in role_fields[1:]) for r in roles)
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
    supplement_path = evidence / 'live-catalog-supplement-private.json'
    supplement = None
    if supplement_path.exists():
        raw = supplement_path.read_bytes()
        hashes[supplement_path.name] = digest(raw)
        supplement = json.loads(raw)
        values[0] = with_supplement(values[0], supplement)
    addendum_path = evidence / 'live-catalog-addendum-private.json'
    addendum = None
    if addendum_path.exists():
        if supplement is None:
            raise ValueError('Addendum requires its referenced supplement')
        raw = addendum_path.read_bytes()
        hashes[addendum_path.name] = digest(raw)
        addendum = json.loads(raw)
        values[0] = with_addendum(values[0], supplement, addendum)
    report = assess(*values, hashes)
    if supplement:
        report['supplement'] = {
            'exported_at': supplement['meta']['exported_at'],
            'base_columns_joined': len(supplement['column_types']),
            'roles': len(supplement['roles']),
            'memberships': len(supplement['role_memberships']),
            'overlapping_structure_matches': True,
            'limit': 'Exporter attests no schema change; matching migration tips alone do not prove absence of manual DDL.'}
    if addendum:
        report['catalog_state_admission_passed'] = True
        report['addendum'] = {
            'exported_at': addendum['meta']['exported_at'],
            'indexes_joined': len(addendum['indexes']), 'constraints_joined': len(addendum['constraints']),
            'user_rewrite_rules': len(addendum['rewrite_rules']),
            'identity_sets_and_index_definitions_match': True,
            'limit': 'Catalog state reconciled for public/respaldos; not combined installation or hosted certification.'}
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
