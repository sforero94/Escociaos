import importlib.util
import json
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / 'schema-evidence-preflight.py'
spec = importlib.util.spec_from_file_location('preflight', SCRIPT)
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


def fixture():
    catalog = {key: [] for key in p.REQUIRED}
    catalog.update(meta={'project_ref': 'PRIVATE_PROJECT_MARKER', 'exported_at': '2026-10-13T19:06:45-05:00'},
                   roles=[dict(rolname=name, rolsuper=False, rolinherit=True, rolcreaterole=False, rolcreatedb=False, rolcanlogin=False, rolreplication=False, rolbypassrls=False) for name in ('postgres', 'anon', 'authenticated', 'service_role')], role_memberships=[], grants={'table_grants': []})
    rls = {'meta': dict(catalog['meta']), 'rls_flags': [], 'policies': []}
    for name in p.TABLES:
        relation = {'schema': 'public', 'table': name, 'kind': 'r', 'rls': True, 'force_rls': False}
        catalog['relations'].append(relation)
        rls['rls_flags'].append(dict(relation))
        catalog['columns'].append({'schema': 'public', 'table': name, 'column': 'quantity',
                                   'type': 'numeric', 'udt': 'numeric', 'formatted_type': 'numeric(12,2)',
                                   'typmod': 786438, 'collation': None, 'generated': 'NEVER'})
        catalog['grants']['table_grants'].append({'schema': 'public', 'table': name, 'owner': 'postgres',
                                                'acl': '{postgres=arwdDxt/postgres,authenticated=arwdDxt/postgres}'})
    return catalog, rls


def supplemented_fixture():
    catalog, rls = fixture()
    catalog['migrations'] = [{'name': '180_example', 'version': '20261013000000'}]
    supplement = {
        'meta': dict(catalog['meta'], exported_at='2026-10-13T20:26:15-05:00',
                     supplement_to={'catalog': 'live-catalog-private.json', 'rls': 'live-rls-private.json',
                                    'original_exported_at': catalog['meta']['exported_at']},
                     schema_change_check={'schema_changes_detected_vs_original': False,
                                          'migrations_count_now': 1, 'migrations_count_original_export': 1,
                                          'latest_migration_now': '20261013000000_180_example',
                                          'latest_migration_original_export': '180_example'}),
        'column_types': [], 'sequences': [],
        'roles': [dict(r, role=r['rolname']) for r in catalog['roles']], 'role_memberships': []}
    for column in catalog['columns']:
        column.update(pos=1, nullable='YES', default=None)
        supplement['column_types'].append(dict(column, not_null=False, default_expr=None))
        for field in ('formatted_type', 'typmod', 'collation'):
            del column[field]
    return catalog, rls, supplement


def addendum_fixture():
    catalog, rls, supplement = supplemented_fixture()
    catalog['indexes'] = [dict(schema='public', table='productos', name='example_idx',
                               def_='CREATE UNIQUE INDEX example_idx ON public.productos USING btree (quantity)')]
    catalog['indexes'][0]['def'] = catalog['indexes'][0].pop('def_')
    catalog['constraints'] = [dict(schema='public', table='productos', name='example_pk', type='p')]
    addendum = {
        'meta': dict(supplement['meta'], exported_at='2026-10-13T21:24:24-05:00',
                     addendum_to={'catalog': 'live-catalog-private.json', 'rls': 'live-rls-private.json',
                                  'supplement': 'live-catalog-supplement-private.json',
                                  'original_exported_at': catalog['meta']['exported_at'],
                                  'supplement_exported_at': supplement['meta']['exported_at']},
                     schema_change_check=dict(supplement['meta']['schema_change_check'],
                                              index_identity_set_matches_original=True,
                                              constraint_identity_set_matches_original=True,
                                              indexdef_text_mismatches_vs_original=[])),
        'indexes': [dict(schema='public', table='productos', name='example_idx',
                         indexdef=catalog['indexes'][0]['def'], indisvalid=True, indisready=True,
                         indislive=True, indimmediate=True, indisunique=True, indisprimary=True,
                         indisexclusion=False, indnullsnotdistinct=False, indnkeyatts=1, indnatts=1,
                         key_columns=['quantity'], include_columns=[], predicate=None, expressions=None)],
        'constraints': [dict(schema='public', table='productos', name='example_pk', contype='p',
                             convalidated=True, condeferrable=False, condeferred=False)],
        'rewrite_rules': []}
    return p.with_supplement(catalog, supplement), rls, supplement, addendum


class Preflight(unittest.TestCase):
    def test_addendum_reconciles_without_mutating_input(self):
        catalog, _, supplement, addendum = addendum_fixture()
        merged = p.with_addendum(catalog, supplement, addendum)
        self.assertTrue(merged['indexes'][0]['indisvalid'])
        self.assertNotIn('indisvalid', catalog['indexes'][0])
        self.assertEqual(merged['rewrite_rules'], [])

    def test_addendum_missing_or_changed_object_refuses(self):
        for mutation in ('missing', 'duplicate', 'definition', 'constraint_type', 'flag'):
            catalog, _, supplement, addendum = addendum_fixture()
            if mutation == 'missing':
                addendum['indexes'] = []
            elif mutation == 'duplicate':
                addendum['constraints'].append(addendum['constraints'][0])
            elif mutation == 'definition':
                addendum['indexes'][0]['indexdef'] = 'changed'
            elif mutation == 'constraint_type':
                addendum['constraints'][0]['contype'] = 'u'
            else:
                del addendum['indexes'][0]['indisvalid']
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                p.with_addendum(catalog, supplement, addendum)

    def test_addendum_requires_explicit_rule_inventory(self):
        catalog, _, supplement, addendum = addendum_fixture()
        del addendum['rewrite_rules']
        with self.assertRaises(ValueError):
            p.with_addendum(catalog, supplement, addendum)

    def test_null_include_array_requires_explicit_zero_include_count(self):
        catalog, _, supplement, addendum = addendum_fixture()
        addendum['indexes'][0]['include_columns'] = None
        self.assertEqual(p.with_addendum(catalog, supplement, addendum)['indexes'][0]['include_columns'], [])
        addendum['indexes'][0]['indnatts'] = 2
        with self.assertRaises(ValueError):
            p.with_addendum(catalog, supplement, addendum)

    def test_addendum_snapshot_or_schema_change_refuses(self):
        for mutation in ('project', 'supplement', 'changed'):
            catalog, _, supplement, addendum = addendum_fixture()
            if mutation == 'project':
                addendum['meta']['project_ref'] = 'other'
            elif mutation == 'supplement':
                addendum['meta']['addendum_to']['supplement_exported_at'] = 'other'
            else:
                addendum['meta']['schema_change_check']['schema_changes_detected_vs_original'] = True
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                p.with_addendum(catalog, supplement, addendum)

    def test_supplement_preserves_original_and_admits_exact_joined_types(self):
        catalog, rls, supplement = supplemented_fixture()
        merged = p.with_supplement(catalog, supplement)
        self.assertTrue(p.assess(merged, rls, {})['minimum_metadata_admission_passed'])
        self.assertNotIn('formatted_type', catalog['columns'][0])
        self.assertEqual(merged['columns'][0]['formatted_type'], 'numeric(12,2)')

    def test_supplement_wrong_snapshot_or_changed_schema_refuses(self):
        for field in ('project', 'timestamp', 'schema', 'tip'):
            catalog, _, supplement = supplemented_fixture()
            if field == 'project':
                supplement['meta']['project_ref'] = 'wrong'
            elif field == 'timestamp':
                supplement['meta']['supplement_to']['original_exported_at'] = 'wrong'
            elif field == 'schema':
                supplement['meta']['schema_change_check']['schema_changes_detected_vs_original'] = True
            else:
                supplement['meta']['schema_change_check']['latest_migration_now'] = '181_changed'
            with self.subTest(field=field), self.assertRaises(ValueError):
                p.with_supplement(catalog, supplement)

    def test_supplement_missing_or_duplicate_column_refuses(self):
        for duplicate in (False, True):
            catalog, _, supplement = supplemented_fixture()
            if duplicate:
                supplement['column_types'].append(supplement['column_types'][0])
            else:
                supplement['column_types'].pop()
            with self.subTest(duplicate=duplicate), self.assertRaises(ValueError):
                p.with_supplement(catalog, supplement)

    def test_supplement_overlapping_structural_changes_refuse(self):
        for field, value in [('pos', 2), ('not_null', True), ('default_expr', '1'), ('generated', 's')]:
            catalog, _, supplement = supplemented_fixture()
            supplement['column_types'][0][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                p.with_supplement(catalog, supplement)

    def test_supplement_does_not_invent_missing_bypass_flag(self):
        catalog, rls, supplement = supplemented_fixture()
        for role in supplement['roles']:
            del role['rolbypassrls']
        report = p.assess(p.with_supplement(catalog, supplement), rls, {})
        self.assertIn('effective_permissions', [b['gate'] for b in report['blockers']])

    def test_supplement_sequence_state_refuses(self):
        catalog, _, supplement = supplemented_fixture()
        catalog['sequences'] = [{'schema': 'public', 'name': 'example', 'owner': 'postgres', 'type': 'bigint'}]
        supplement['sequences'] = [dict(catalog['sequences'][0], last_value=123)]
        with self.assertRaises(ValueError):
            p.with_supplement(catalog, supplement)

    def test_minimum_complete_fixture_passes_without_claiming_runtime_parity(self):
        catalog, rls = fixture()
        self.assertTrue(p.assess(catalog, rls, {})['minimum_metadata_admission_passed'])

    def test_missing_numeric_typmods_refuse_admission_without_guessing(self):
        catalog, rls = fixture()
        for column in catalog['columns']:
            del column['formatted_type']
            del column['typmod']
        report = p.assess(catalog, rls, {})
        self.assertFalse(report['minimum_metadata_admission_passed'])
        self.assertIn('exact_column_types', [b['gate'] for b in report['blockers']])

    def test_missing_sequence_configuration_is_not_invented(self):
        catalog, rls = fixture()
        catalog['sequences'] = [{'schema': 'public', 'name': 'example', 'type': 'bigint'}]
        report = p.assess(catalog, rls, {})
        self.assertFalse(report['minimum_metadata_admission_passed'])
        self.assertIn('sequence_configuration', [b['gate'] for b in report['blockers']])

    def test_missing_role_membership_blocks_effective_privilege_claim(self):
        catalog, rls = fixture()
        del catalog['role_memberships']
        self.assertIn('effective_permissions', [b['gate'] for b in p.assess(catalog, rls, {})['blockers']])

    def test_snapshot_identity_or_timestamp_mismatch_refuses(self):
        catalog, rls = fixture()
        rls['meta']['project_ref'] = 'other'
        with self.assertRaises(ValueError):
            p.assess(catalog, rls, {})
        rls['meta'] = dict(catalog['meta'], exported_at='other')
        with self.assertRaises(ValueError):
            p.assess(catalog, rls, {})

    def test_private_definitions_and_project_reference_are_never_published(self):
        catalog, rls = fixture()
        catalog['functions'] = [{'schema': 'public', 'name': 'cleanup', 'security_definer': True,
                                 'acl': '{authenticated=X/postgres}',
                                 'def': "CREATE FUNCTION cleanup() RETURNS void AS $$BEGIN DELETE FROM public.fin_gastos; RAISE NOTICE 'PRIVATE_SQL_MARKER'; END$$ LANGUAGE plpgsql;"}]
        report = p.assess(catalog, rls, {})
        self.assertTrue(report['lexical_function_writers'][0]['expense_delete_token'])
        self.assertEqual(report['lexical_function_writers'][0]['explicit_execute_roles'], ['authenticated'])
        output = json.dumps(report)
        self.assertNotIn('PRIVATE_SQL_MARKER', output)
        self.assertNotIn('PRIVATE_PROJECT_MARKER', output)
        self.assertNotIn('DELETE FROM', output)

    def test_literal_and_comment_tokens_are_not_executed_dml(self):
        catalog, rls = fixture()
        catalog['functions'] = [{'schema': 'public', 'name': 'read_only', 'security_definer': False, 'acl': None,
                                 'def': "CREATE FUNCTION read_only() RETURNS text AS $$BEGIN /* DELETE FROM fin_gastos; */ RETURN 'UPDATE productos'; END$$ LANGUAGE plpgsql;"}]
        self.assertEqual(p.assess(catalog, rls, {})['lexical_function_writers'], [])

    def test_dynamic_only_writer_is_marked_for_manual_review(self):
        catalog, rls = fixture()
        catalog['functions'] = [{'schema': 'public', 'name': 'dynamic', 'security_definer': False, 'acl': None,
                                 'def': "CREATE FUNCTION dynamic() RETURNS void AS $$BEGIN EXECUTE 'UPDATE productos SET cantidad_actual=0'; END$$ LANGUAGE plpgsql;"}]
        report = p.assess(catalog, rls, {})
        self.assertTrue(report['lexical_function_writers'][0]['dynamic_sql_present'])
        self.assertTrue(report['lexical_function_writers'][0]['public_execute_by_default'])

    def test_rls_conflict_is_not_silently_reconciled(self):
        catalog, rls = fixture()
        rls['rls_flags'][0]['rls'] = False
        self.assertIn('rls_snapshot_consistency', [b['gate'] for b in p.assess(catalog, rls, {})['blockers']])


if __name__ == '__main__':
    unittest.main()
