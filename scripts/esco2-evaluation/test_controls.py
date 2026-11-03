"""Controles discriminantes de evaluación; únicamente datos sintéticos."""
import copy
import sqlite3
import unittest
from pathlib import Path
from score import score


def case(identifier, classification='answerable', attempts=None):
    return {'id': identifier, 'domain': 'labores', 'partition': 'development',
            'lineage_group': identifier, 'classification': classification,
            'reference_verified': True, 'mandatory': True, 'attempts': attempts or [1]}


def result(identifier, outcome='complete_correct', attempt=1):
    return {'case_id': identifier, 'attempt': attempt, 'outcome': outcome,
            'critical': False, 'reviewed_by': 'SYN-independent-reviewer', 'review_version': 'SYN-v1'}


def manifest(*cases):
    return {'schema': 'esco2-score/v0.3', 'frozen': True, 'cases': list(cases)}


class ScoringControls(unittest.TestCase):
    def test_missing_blocked_and_partial_remain_in_denominator(self):
        m = manifest(*(case('SYN-' + str(i)) for i in range(4)))
        report = score(m, [result('SYN-0'), result('SYN-1', 'blocked'), result('SYN-2', 'partial')])
        p = report['partitions']['development']
        self.assertEqual((p['denominator'], p['complete_correct_all_attempts'], p['rate']), (4, 1, .25))
        self.assertEqual(p['missing_attempts'], [['SYN-3', 1]])
        self.assertFalse(report['scoring_gate_pass'])

    def test_guards_do_not_inflate_answerable_successes(self):
        report = score(manifest(case('SYN-a'), case('SYN-g', 'guard')),
                       [result('SYN-a', 'partial'), result('SYN-g', 'guard_pass')])
        self.assertEqual(report['partitions']['development']['rate'], 0)
        self.assertEqual(report['partitions']['development']['guard_clarification_pass'], 1)

    def test_reference_inconclusive_blocks_without_shrinking_denominator(self):
        m = manifest(case('SYN-a'), case('SYN-b'))
        m['cases'][1]['reference_verified'] = False
        report = score(m, [result('SYN-a'), result('SYN-b')])
        self.assertEqual(report['partitions']['development']['denominator'], 2)
        self.assertEqual(report['inconclusive_references'], ['SYN-b'])
        self.assertFalse(report['scoring_gate_pass'])

    def test_runtime_reference_dispute_and_critical_override_success(self):
        for field, value in [('outcome', 'reference_inconclusive'), ('critical', True)]:
            r = result('SYN-a')
            r[field] = value
            self.assertFalse(score(manifest(case('SYN-a')), [r])['scoring_gate_pass'])

    def test_no_best_attempt_selection(self):
        report = score(manifest(case('SYN-a', attempts=[1, 2])),
                       [result('SYN-a'), result('SYN-a', 'partial', 2)])
        p = report['partitions']['development']
        self.assertEqual((p['denominator'], p['expected_attempts'], p['rate']), (1, 2, 0))
        self.assertEqual(p['outcomes_all_attempts'], {'complete_correct': 1, 'partial': 1})

    def test_duplicate_extra_and_lineage_leak_are_rejected(self):
        m = manifest(case('SYN-a'))
        for rs in [[result('SYN-a'), result('SYN-a')], [result('SYN-a', attempt=2)]]:
            with self.assertRaises(ValueError):
                score(m, rs)
        b = copy.deepcopy(m['cases'][0])
        b.update(id='SYN-b', partition='heldout')
        with self.assertRaises(ValueError):
            score(manifest(m['cases'][0], b), [])

    def test_high_average_cannot_hide_failed_mandatory(self):
        m = manifest(*(case('SYN-' + str(i)) for i in range(10)))
        report = score(m, [result('SYN-' + str(i), 'partial' if i == 9 else 'complete_correct') for i in range(10)])
        self.assertEqual(report['partitions']['development']['rate'], .9)
        self.assertFalse(report['scoring_gate_pass'])

    def test_control_never_claims_product_acceptance(self):
        report = score(manifest(case('SYN-a')), [result('SYN-a')])
        self.assertTrue(report['scoring_gate_pass'])
        self.assertFalse(report['product_accepted'])
        self.assertLess(report['partitions']['development']['wilson95_cases'][0], .9)

    def test_attempt_boolean_cannot_impersonate_attempt_one(self):
        for attempt in (True, 1.0, '1'):
            with self.subTest(attempt=attempt), self.assertRaises(ValueError):
                score(manifest(case('SYN-a')), [result('SYN-a', attempt=attempt)])

    def test_adjudicator_requires_nonblank_text(self):
        for value in ('  ', ['SYN-reviewer'], {'name': 'SYN-reviewer'}, True):
            r = result('SYN-a')
            r['reviewed_by'] = value
            with self.subTest(value=value), self.assertRaises(ValueError):
                score(manifest(case('SYN-a')), [r])

    def test_inconclusive_reference_blocks_even_at_threshold_without_mandatory(self):
        m = manifest(*(case('SYN-' + str(i)) for i in range(10)))
        m['cases'][9].update(reference_verified=False, mandatory=False)
        report = score(m, [result('SYN-' + str(i)) for i in range(10)])
        self.assertEqual(report['partitions']['development']['rate'], .9)
        self.assertEqual(report['partitions']['development']['mandatory_failed'], [])
        self.assertFalse(report['scoring_gate_pass'])


class OracleControls(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.executescript(Path(__file__).with_name('synthetic.sql').read_text())

    def tearDown(self):
        self.db.close()

    def test_labor_reconciles_null_group_and_missing_cost(self):
        rows = self.db.execute("SELECT lote_id, SUM(fraccion_jornal), SUM(costo_jornal), COUNT(costo_jornal), COUNT(*) FROM registros_trabajo WHERE fecha_trabajo BETWEEN '2026-10-01' AND '2026-10-31' GROUP BY lote_id").fetchall()
        self.assertEqual(rows, [(None, .5, 50, 1, 1), ('SYN-lote-a', 1.25, 100, 1, 2)])
        self.assertEqual(sum(r[1] for r in rows), 1.75)
        # INNER JOIN / WHERE lote_id IS NOT NULL would silently lose .5 jornal.
        broken = self.db.execute("SELECT SUM(fraccion_jornal) FROM registros_trabajo WHERE lote_id IS NOT NULL AND fecha_trabajo < '2026-11-01'").fetchone()[0]
        self.assertNotEqual(broken, 1.75)
        self.assertEqual(sum(r[3] for r in rows), 2)  # cost known for 2 of 3 records

    def test_weighted_incidence_is_not_average_of_percentages(self):
        correct = self.db.execute('SELECT 100.0 * SUM(afectados) / SUM(muestreados) FROM monitoreos').fetchone()[0]
        wrong = self.db.execute('SELECT AVG(100.0 * afectados / muestreados) FROM monitoreos').fetchone()[0]
        self.assertEqual(correct, 14)
        self.assertNotEqual(correct, wrong)

    def test_application_aggregates_before_join_and_preserves_units(self):
        rows = self.db.execute('''WITH consumo AS (
            SELECT aplicacion_id, producto_id, unidad, SUM(cantidad) cantidad
            FROM consumo_aplicacion GROUP BY aplicacion_id, producto_id, unidad)
            SELECT p.producto_id, p.unidad, p.cantidad, c.cantidad,
                   100.0 * c.cantidad / p.cantidad
            FROM plan_aplicacion p JOIN consumo c
            USING (aplicacion_id, producto_id, unidad) ORDER BY p.producto_id''').fetchall()
        self.assertEqual(rows, [('SYN-producto-a', 'kg', 10, 7, 70), ('SYN-producto-b', 'L', 20, 8, 40)])
        # Joining raw movements duplicates planned volume; kg and L cannot sum.
        broken = self.db.execute('''SELECT SUM(p.cantidad) FROM plan_aplicacion p
            JOIN consumo_aplicacion c USING (aplicacion_id, producto_id, unidad)
            WHERE p.unidad = 'kg' ''').fetchone()[0]
        self.assertNotEqual(broken, 10)

    def test_rain_missing_is_not_zero_or_complete_coverage(self):
        self.assertEqual(self.db.execute('SELECT SUM(lluvia), COUNT(lluvia), COUNT(*) FROM clima').fetchone(), (4, 2, 3))
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM clima WHERE lluvia = 0').fetchone()[0], 1)

    def test_milk_identity_missing_zero_and_linked_liters(self):
        self.assertEqual(self.db.execute('SELECT COUNT(*), COUNT(DISTINCT numero) FROM hato_animales').fetchone(), (2, 1))
        self.assertEqual(self.db.execute('SELECT COUNT(litros), COUNT(*), SUM(litros) FROM hato_pesajes_leche').fetchone(), (1, 2, 0))
        self.assertEqual(self.db.execute('SELECT i.cantidad FROM hato_produccion_quincenal q JOIN fin_ingresos i ON i.id = q.fin_ingreso_id').fetchone()[0], 300)
        self.assertIsNone(self.db.execute('SELECT litros_total FROM hato_produccion_quincenal').fetchone()[0])


if __name__ == '__main__':
    unittest.main()
