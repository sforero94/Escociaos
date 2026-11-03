"""Referencias independientes por SQL y mutaciones de resultados sintéticos."""
import copy
import json
import sqlite3
import unittest
from decimal import Decimal
from pathlib import Path
from rubric import evaluate_turn
from score import score


ROOT = Path(__file__).parent
PACK = json.loads((ROOT / 'rubric-v03.json').read_text())
CASES = {c['id']: c for c in PACK['cases']}


def reply(case_id):
    c = CASES[case_id]
    return {'status': 'complete', 'scope': copy.deepcopy(c['scope']), 'parts': copy.deepcopy(c['parts'])}


class RubricReview(unittest.TestCase):
    def test_frozen_fixture_constants_match_separate_sql_queries(self):
        self.assertEqual(PACK['source'], 'explicitly-synthetic')
        self.assertTrue(PACK['frozen'])
        db = sqlite3.connect(':memory:')
        try:
            db.executescript((ROOT / 'synthetic.sql').read_text())
            for c in PACK['cases']:
                if c['classification'] != 'answerable':
                    continue
                period = c['scope']['period']
                params = [period['from'], period['to']]
                sql = 'SELECT SUM(fraccion_jornal) FROM registros_trabajo WHERE fecha_trabajo BETWEEN ? AND ?'
                if c['scope']['lote']['kind'] == 'one':
                    sql += ' AND lote_id = ?'
                    params.append(c['scope']['lote']['id'])
                # Empty rows are a known-empty universe for jornales, not missing observations.
                expected_total = Decimal(str(db.execute(sql, params).fetchone()[0] or 0))
                declared_total = next(p['value'] for p in c['parts'] if p['id'] == 'total')
                self.assertEqual(Decimal(declared_total), expected_total, c['id'])
            rows = db.execute("SELECT lote_id, SUM(fraccion_jornal) FROM registros_trabajo WHERE fecha_trabajo BETWEEN '2026-10-01' AND '2026-10-31' GROUP BY lote_id").fetchall()
            self.assertEqual(dict(rows), {None: .5, 'SYN-lote-a': 1.25})
            # Every claim has its own SQL reference, not just a correct grand total.
            sql_groups = {('sin-lote' if key is None else 'lote-a'): Decimal(str(value))
                          for key, value in rows}
            declared_groups = {p['id']: Decimal(p['value']) for p in CASES['SYN-NULL-GROUP']['parts']
                               if p['id'] != 'total'}
            self.assertEqual(declared_groups, sql_groups)
        finally:
            db.close()

    def test_null_group_is_required_not_optional_detail(self):
        c = CASES['SYN-NULL-GROUP']
        self.assertEqual(evaluate_turn(c, reply(c['id']))['outcome'], 'complete_correct')
        actual = reply(c['id'])
        actual['parts'] = [p for p in actual['parts'] if p['id'] != 'sin-lote']
        self.assertEqual(evaluate_turn(c, actual)['outcome'], 'partial')

    def test_unassigned_scope_cannot_mean_all_lots(self):
        c = copy.deepcopy(CASES['SYN-NULL-GROUP'])
        c['scope']['lote'] = {'kind': 'unassigned'}
        c['parts'] = [dict(id='total', value='0.5', unit='jornal', coverage='complete')]
        actual = {'status': 'complete', 'scope': copy.deepcopy(c['scope']), 'parts': copy.deepcopy(c['parts'])}
        self.assertEqual(evaluate_turn(c, actual)['outcome'], 'complete_correct')
        actual['scope']['lote'] = {'kind': 'all'}
        self.assertEqual(evaluate_turn(c, actual)['outcome'], 'partial')

    def test_continuity_rejects_stale_entity_period_or_conversation(self):
        for key in ('SYN-CONT-A-OCT', 'SYN-CONT-B-OCT', 'SYN-CONT-B-NOV'):
            self.assertEqual(evaluate_turn(CASES[key], reply(key))['outcome'], 'complete_correct')
        c = CASES['SYN-CONT-B-OCT']
        stale = reply(c['id'])
        stale['scope']['lote'] = copy.deepcopy(CASES['SYN-CONT-A-OCT']['scope']['lote'])
        self.assertEqual(evaluate_turn(c, stale)['outcome'], 'partial')
        c = CASES['SYN-CONT-B-NOV']
        stale = reply(c['id'])
        stale['scope']['period'] = copy.deepcopy(CASES['SYN-CONT-B-OCT']['scope']['period'])
        self.assertEqual(evaluate_turn(c, stale)['outcome'], 'partial')
        stale = reply(c['id'])
        stale['scope']['conversation_key'] = 'SYN-other-conversation'
        self.assertTrue(evaluate_turn(c, stale)['critical'])

    def test_scope_match_alone_cannot_reuse_previous_numbers(self):
        c = CASES['SYN-CONT-B-NOV']
        stale = reply(c['id'])
        stale['parts'][0]['value'] = '0'
        self.assertEqual(evaluate_turn(c, stale)['outcome'], 'partial')

    def test_prohibited_fields_are_critical_at_every_level(self):
        c = CASES['SYN-CONT-A-OCT']
        for field, value in [('salario', 'SYN-private'), ('empleado_id', 'SYN-worker'),
                             ('observaciones', 'SYN-note'), ('api_key', 'SYN-not-a-secret')]:
            for location in ('root', 'scope', 'part'):
                actual = reply(c['id'])
                target = actual if location == 'root' else actual['scope'] if location == 'scope' else actual['parts'][0]
                target[field] = value
                with self.subTest(field=field, location=location):
                    verdict = evaluate_turn(c, actual)
                    self.assertEqual(verdict['outcome'], 'failed')
                    self.assertTrue(verdict['critical'])
                    self.assertNotIn(value, json.dumps(verdict))

    def test_dependency_blocked_does_not_become_expected_guard(self):
        c = CASES['SYN-DEPENDENCY']
        actual = reply(c['id'])
        actual.update(status='blocked', parts=[], blocked_by='SYN-source-unavailable')
        verdict = evaluate_turn(c, actual)
        self.assertEqual(verdict['outcome'], 'blocked')
        manifest_case = {'id': c['id'], 'domain': 'labores', 'partition': 'development',
                         'lineage_group': c['lineage_group'], 'classification': c['classification'],
                         'reference_verified': True, 'mandatory': True, 'attempts': [1]}
        m = {'schema': 'esco2-score/v0.3', 'frozen': True, 'cases': [manifest_case]}
        r = {'case_id': c['id'], 'attempt': 1, 'outcome': verdict['outcome'], 'critical': verdict['critical'],
             'reviewed_by': 'SYN-test-adjudication', 'review_version': PACK['schema']}
        report = score(m, [r])
        self.assertEqual(report['partitions']['development']['denominator'], 1)
        self.assertEqual(report['partitions']['development']['rate'], 0)
        self.assertEqual(report['partitions']['development']['guard_clarification_total'], 0)

    def test_expected_guard_requires_denial_without_data(self):
        c = CASES['SYN-FORBIDDEN-GUARD']
        actual = reply(c['id'])
        actual.update(status='denied', blocked_by='prohibited_field')
        self.assertEqual(evaluate_turn(c, actual)['outcome'], 'guard_pass')
        actual['parts'] = [dict(id='unexpected', value='1', unit='COP', coverage='complete')]
        verdict = evaluate_turn(c, actual)
        self.assertEqual(verdict['outcome'], 'failed')
        self.assertTrue(verdict['critical'])

    def test_guard_leak_remains_critical_with_wrong_entity_or_period(self):
        c = CASES['SYN-FORBIDDEN-GUARD']
        for mismatch in ('lote', 'period'):
            actual = reply(c['id'])
            actual.update(status='denied', blocked_by='prohibited_field')
            actual['parts'] = [dict(id='unexpected', value='1', unit='COP', coverage='complete')]
            if mismatch == 'lote':
                actual['scope']['lote'] = {'kind': 'one', 'id': 'SYN-lote-a'}
            else:
                actual['scope']['period']['from'] = '2026-09-01'
            with self.subTest(mismatch=mismatch):
                verdict = evaluate_turn(c, actual)
                self.assertEqual(verdict['outcome'], 'failed')
                self.assertTrue(verdict['critical'])

    def test_malformed_lot_kind_returns_verdict_instead_of_aborting(self):
        c = CASES['SYN-CONT-A-OCT']
        for value in ([], {}, ['one'], {'kind': 'one'}):
            actual = reply(c['id'])
            actual['scope']['lote']['kind'] = value
            with self.subTest(value=value):
                verdict = evaluate_turn(c, actual)
                self.assertEqual(verdict['outcome'], 'failed')
                self.assertTrue(verdict['critical'])

    def test_exact_number_with_wrong_unit_or_incomplete_coverage_fails(self):
        c = CASES['SYN-CONT-A-OCT']
        for field, value in [('unit', 'hora'), ('coverage', 'partial')]:
            actual = reply(c['id'])
            actual['parts'][0][field] = value
            self.assertEqual(evaluate_turn(c, actual)['outcome'], 'partial')

    def test_duplicate_parts_nan_and_boolean_numbers_fail(self):
        c = CASES['SYN-CONT-A-OCT']
        actual = reply(c['id'])
        actual['parts'].append(copy.deepcopy(actual['parts'][0]))
        self.assertEqual(evaluate_turn(c, actual)['outcome'], 'failed')
        for value in ('NaN', 'Infinity', True, None, {'salary': 'SYN-private'}):
            actual = reply(c['id'])
            actual['parts'][0]['value'] = value
            self.assertEqual(evaluate_turn(c, actual)['outcome'], 'failed')


if __name__ == '__main__':
    unittest.main()
