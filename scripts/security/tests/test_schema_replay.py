import importlib.util
from pathlib import Path
import subprocess
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'schema-replay.py'
spec = importlib.util.spec_from_file_location('schema_replay', SCRIPT)
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)


class ReplayBoundary(unittest.TestCase):
    def test_candidate_wrapper_preserves_function_transactions_and_excludes_commit(self):
        for path in (r.ROOT / 'src/sql/security-candidates').glob('*.sql'):
            source = path.read_text()
            if 'CREATE SCHEMA ' not in source:
                continue
            body = r.transaction_body(source)
            self.assertNotRegex(body, r'(?m)^COMMIT;\s*$')
            self.assertNotRegex(body, r'(?m)^BEGIN;\s*$')
            self.assertIn('CREATE SCHEMA ', body)

    def test_ambiguous_or_missing_transaction_wrapper_refuses(self):
        for source in ('SELECT 1;', 'BEGIN;\nSELECT 1;\nCOMMIT;\nCOMMIT;',
                       'BEGIN;\nSELECT 1;\nCOMMIT;\nSELECT 2;'):
            with self.subTest(source=source), self.assertRaises(ValueError):
                r.transaction_body(source)

    def test_runtime_refuses_remote_or_uncontained_paths_before_startup(self):
        with self.assertRaises(ValueError):
            with r.database(Path('/usr/bin'), Path('/tmp/client'), Path('/tmp/diagnostics-private.txt')):
                self.fail('Invalid runtime was admitted')
        with self.assertRaises(ValueError):
            with r.database(Path('/tmp/runtime'), Path('/tmp/client'), r.ROOT / 'private.txt'):
                self.fail('Repository diagnostics were admitted')

    def test_transport_rejects_tcp_selector_and_arbitrary_user_before_loading_client(self):
        transport = r.ROOT / 'scripts/security/local-postgres-query.mjs'
        for socket, user in [('localhost', 'postgres'), ('/tmp/escocia-treatment-pg-test/socket', 'someone')]:
            result = subprocess.run(['node', str(transport), socket, '/tmp/missing-client', user],
                                    text=True, capture_output=True, timeout=10)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('Synthetic temporary runtime paths and bootstrap role required', result.stderr)
            self.assertNotIn('ERR_MODULE_NOT_FOUND', result.stderr)


if __name__ == '__main__':
    unittest.main()
