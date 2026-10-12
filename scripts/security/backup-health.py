#!/usr/bin/env python3
"""Assess supplied GitHub metadata only. No network, artifacts, keys or alerts."""
import argparse
from datetime import datetime, timezone
import json
import math
import re
import sys


def timestamp(value):
    if not isinstance(value, str):
        raise ValueError('Missing timestamp')
    result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if result.tzinfo is None:
        raise ValueError('Timezone required')
    return result.astimezone(timezone.utc)


def assess(metadata, now, maximum_age_hours=24):
    """Run start bounds snapshot age conservatively; does not certify coherence."""
    if isinstance(maximum_age_hours, bool) or not isinstance(maximum_age_hours, (int, float)) or not math.isfinite(maximum_age_hours) or maximum_age_hours <= 0:
        raise ValueError('Positive age limit required')
    if not isinstance(metadata, dict) or not isinstance(metadata.get('workflow'), dict) or not isinstance(metadata.get('runs'), list) or not isinstance(metadata.get('artifacts'), list):
        raise ValueError('Workflow, runs and artifacts metadata required')
    current = timestamp(now)
    workflow = metadata.get('workflow', {})
    workflow_id = workflow.get('id')
    if not isinstance(workflow_id, int) or isinstance(workflow_id, bool):
        raise ValueError('Verified workflow identity required')
    runs = {}
    for run in metadata['runs']:
        if not isinstance(run, dict) or not isinstance(run.get('id'), int) or isinstance(run['id'], bool) or run['id'] <= 0:
            raise ValueError('Valid run identity required')
        if run['id'] in runs and runs[run['id']] != run:
            raise ValueError('Conflicting run metadata')
        runs[run['id']] = run
    candidates = []
    rejected = 0
    for artifact in metadata.get('artifacts', []):
        try:
            if not isinstance(artifact, dict):
                raise ValueError('Invalid artifact')
            if not isinstance(artifact.get('id'), int) or isinstance(artifact['id'], bool) or artifact['id'] <= 0:
                raise ValueError('Valid artifact identity required')
            run = runs[artifact['workflow_run']['id']]
            if run.get('workflow_id') != workflow_id or run.get('status') != 'completed' or run.get('conclusion') != 'success':
                raise ValueError('No successful backup run')
            if artifact.get('expired') is not False or not isinstance(artifact.get('size_in_bytes'), int) or isinstance(artifact['size_in_bytes'], bool) or artifact['size_in_bytes'] <= 0:
                raise ValueError('Unavailable artifact')
            if not isinstance(artifact.get('digest'), str) or not re.fullmatch(r'sha256:[0-9a-f]{64}', artifact['digest']):
                raise ValueError('Missing provider digest')
            started = timestamp(run['run_started_at'])
            completed = timestamp(run['updated_at'])
            created = timestamp(artifact['created_at'])
            expires = timestamp(artifact['expires_at'])
            if not started <= created <= completed <= current or expires <= current:
                raise ValueError('Invalid temporal evidence')
            candidates.append((started, completed, artifact.get('id'), run['id']))
        except (KeyError, TypeError, ValueError):
            rejected += 1
    base = {'scope': 'metadata only; recovery/coherence unverified', 'rejected_artifacts': rejected}
    if not candidates:
        return {**base, 'state': 'unverifiable', 'reason': 'No valid successful-run artifact metadata'}
    started, completed, artifact_id, run_id = max(candidates)
    start_age = (current - started).total_seconds() / 3600
    completion_age = (current - completed).total_seconds() / 3600
    if workflow.get('state') != 'active':
        state = 'workflow_inactive'
    elif start_age <= maximum_age_hours:
        state = 'fresh_metadata'
    elif completion_age > maximum_age_hours:
        state = 'stale'
    else:
        state = 'unverifiable'
    return {**base, 'state': state, 'run_id': run_id, 'artifact_id': artifact_id,
            'run_start_age_hours': round(start_age, 3), 'completion_age_hours': round(completion_age, 3),
            'maximum_age_hours': maximum_age_hours}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--now', required=True, help='Verified timezone-qualified assessment time')
    args = parser.parse_args()
    result = assess(json.load(sys.stdin), args.now)
    print(json.dumps(result, sort_keys=True))
    return 0 if result['state'] == 'fresh_metadata' else 1


if __name__ == '__main__':
    sys.exit(main())
