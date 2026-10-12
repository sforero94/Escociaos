"""Synthetic metadata boundaries; no provider access or backup contents."""
import importlib.util
from pathlib import Path
import unittest
from copy import deepcopy

spec = importlib.util.spec_from_file_location('backup_health', Path(__file__).with_name('backup-health.py'))
health = importlib.util.module_from_spec(spec)
spec.loader.exec_module(health)


def fixture():
    return {'workflow': {'id': 1, 'state': 'active'},
            'runs': [{'id': 2, 'workflow_id': 1, 'status': 'completed', 'conclusion': 'success',
                      'run_started_at': '2026-10-11T12:00:00Z', 'updated_at': '2026-10-11T12:05:00Z'}],
            'artifacts': [{'id': 3, 'workflow_run': {'id': 2}, 'expired': False, 'size_in_bytes': 100,
                          'created_at': '2026-10-11T12:04:00Z', 'expires_at': '2026-10-18T12:04:00Z',
                          'digest': 'sha256:' + 'a' * 64}]}


class BackupHealthTests(unittest.TestCase):
    def test_daily_success_alone_cannot_certify_freshness(self):
        self.assertEqual(health.assess(fixture(), '2026-10-12T13:00:00Z')['state'], 'stale')

    def test_exact_day_limit_and_timezone_equivalence(self):
        self.assertEqual(health.assess(fixture(), '2026-10-12T07:00:00-05:00')['state'], 'fresh_metadata')

    def test_recent_completion_without_known_snapshot_time_is_not_certification(self):
        self.assertEqual(health.assess(fixture(), '2026-10-12T12:03:00Z')['state'], 'unverifiable')

    def test_wrong_workflow_failed_and_running_jobs_are_not_backup_proof(self):
        for change in [{'workflow_id': 4}, {'conclusion': 'failure'}, {'status': 'in_progress'}]:
            data = fixture(); data['runs'][0].update(change)
            self.assertEqual(health.assess(data, '2026-10-12T11:00:00Z')['state'], 'unverifiable')

    def test_missing_expired_empty_and_bad_digest_artifacts_refuse(self):
        for change in [{'expired': True}, {'size_in_bytes': 0}, {'digest': None}, {'workflow_run': {'id': 99}}]:
            data = fixture(); data['artifacts'][0].update(change)
            self.assertEqual(health.assess(data, '2026-10-12T11:00:00Z')['state'], 'unverifiable')
        data = fixture(); data['artifacts'] = []
        self.assertEqual(health.assess(data, '2026-10-12T11:00:00Z')['state'], 'unverifiable')

    def test_inactive_workflow_is_reported_even_with_fresh_artifact(self):
        data = fixture(); data['workflow']['state'] = 'disabled_manually'
        self.assertEqual(health.assess(data, '2026-10-12T11:00:00Z')['state'], 'workflow_inactive')

    def test_future_and_out_of_order_provider_timestamps_refuse(self):
        for change in [{'created_at': '2026-10-12T13:00:00Z'}, {'expires_at': '2026-10-11T11:00:00Z'}, {'created_at': '2026-10-11T11:00:00Z'}]:
            data = fixture(); data['artifacts'][0].update(change)
            self.assertEqual(health.assess(data, '2026-10-12T11:00:00Z')['state'], 'unverifiable')

    def test_new_cleanup_does_not_replace_old_backup_evidence(self):
        data = fixture(); other = deepcopy(data['runs'][0]); other.update(id=4, workflow_id=5, run_started_at='2026-10-12T12:00:00Z', updated_at='2026-10-12T12:05:00Z')
        data['runs'].append(other)
        self.assertEqual(health.assess(data, '2026-10-12T13:00:00Z')['state'], 'stale')

    def test_naive_clock_is_rejected(self):
        with self.assertRaises(ValueError):
            health.assess(fixture(), '2026-10-12T11:00:00')

    def test_malformed_identity_is_not_artifact_evidence(self):
        for change in [{'id': None}, {'id': True}, {'id': -1}, {'size_in_bytes': True}]:
            data = fixture(); data['artifacts'][0].update(change)
            self.assertEqual(health.assess(data, '2026-10-12T11:00:00Z')['state'], 'unverifiable')

    def test_conflicting_runs_and_invalid_limits_refuse(self):
        data = fixture(); other = deepcopy(data['runs'][0]); other['conclusion'] = 'failure'; data['runs'].append(other)
        with self.assertRaises(ValueError):
            health.assess(data, '2026-10-12T11:00:00Z')
        for limit in [float('nan'), float('inf'), True, -1]:
            with self.assertRaises(ValueError):
                health.assess(fixture(), '2026-10-12T11:00:00Z', limit)

    def test_invalid_envelope_refuses(self):
        for data in [None, [], {}, {**fixture(), 'artifacts': None}]:
            with self.assertRaises(ValueError):
                health.assess(data, '2026-10-12T11:00:00Z')


if __name__ == '__main__':
    unittest.main()
