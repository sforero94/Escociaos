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


class Preflight(unittest.TestCase):
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
