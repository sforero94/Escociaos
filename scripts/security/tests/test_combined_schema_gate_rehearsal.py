import importlib.util
from pathlib import Path
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'combined-schema-gate-rehearsal.py'
spec = importlib.util.spec_from_file_location('combined_gates', SCRIPT)
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)


class EntryGateBoundary(unittest.TestCase):
    def test_all_selected_gate_boundaries_exclude_candidate_implementation(self):
        for name in g.CANDIDATES:
            source = (g.ROOT / 'src/sql/security-candidates' / (name + '.sql')).read_text()
            gate = g.entry_gate(source)
            self.assertIn('BEGIN;', gate)
            self.assertNotIn('CREATE SCHEMA', gate)
            self.assertNotIn('CREATE FUNCTION', gate)
            self.assertNotIn('INSERT INTO', gate)

    def test_unknown_or_partial_gate_boundary_refuses(self):
        for source in ('BEGIN; SELECT 1;', 'BEGIN; SELECT 1; CREATE SCHEMA unsafe;',
                       'DO $$ BEGIN NULL; END $$; CREATE SCHEMA unsafe;'):
            with self.subTest(source=source), self.assertRaises(ValueError):
                g.entry_gate(source)

    def test_trigger_positive_controls_use_only_original_gate(self):
        for name in ('product-catalog-integrity', 'csv-product-import', 'hato-treatment-creation'):
            source = (g.ROOT / 'src/sql/security-candidates' / (name + '.sql')).read_text()
            gate = g.trigger_gate(source)
            self.assertIn('WHERE NOT tgisinternal', gate)
            self.assertIn('RAISE EXCEPTION', gate)
            self.assertNotIn('CREATE SCHEMA', gate)
            self.assertNotIn('DROP TRIGGER', gate)

    def test_missing_trigger_gate_refuses(self):
        with self.assertRaises(ValueError):
            g.trigger_gate('BEGIN; DO $$ BEGIN NULL; END $$; CREATE SCHEMA unsafe;')

    def test_identifiers_and_literals_quote_without_executing_text(self):
        self.assertEqual(g.quote('table"name'), '"table""name"')
        self.assertEqual(g.literal("name'quoted"), "'name''quoted'")


if __name__ == '__main__':
    unittest.main()
