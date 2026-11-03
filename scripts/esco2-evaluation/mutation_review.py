"""Revisión discriminante: ejecutar tests sobre copias temporales defectuosas.

Sin red y sin modificar fuentes originales. Solo informa recuentos/códigos.
La independencia es de referencias y defectos inyectados, no un segundo humano.
"""
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).parent
FILES = ('score.py', 'rubric.py', 'rubric-v03.json', 'synthetic.sql',
         'test_controls.py', 'test_rubric.py')
MUTANTS = (
    ('denominator_successes_only', 'score.py', 'total = len(answerable)', 'total = max(1, successes)'),
    ('best_attempt_only', 'score.py', "c['id'] not in unresolved and all(", "c['id'] not in unresolved and any("),
    ('ignore_mandatory_gate', 'score.py', "and not s['mandatory_failed']", ''),
    ('ignore_reference_gate', 'score.py', 'gate = not critical and not unresolved and all(', 'gate = not critical and all('),
    ('drop_null_group', 'synthetic.sql', "('r2',NULL,'2026-10-02',0.5,50)", "('r2','SYN-lote-a','2026-10-02',0.5,50)"),
    ('accept_stale_scope', 'rubric.py', "if reply['scope'] != expected['scope']:", 'if False:'),
    ('allow_missing_parts', 'rubric.py', 'if set(parts) != set(wanted):', 'if False:'),
    ('allow_prohibited_fields', 'rubric.py', 'if not _safe_shape(reply):', 'if False:'),
    ('downgrade_guard_leak_on_scope_error', 'rubric.py', "if expected['classification'] == 'guard' and reply['parts']:", 'if False:'),
    ('corrupt_offsetting_group_oracles', 'rubric-v03.json',
     '"value": "1.25", "unit": "jornal", "coverage": "complete"}, {"id": "sin-lote", "value": "0.5"',
     '"value": "100", "unit": "jornal", "coverage": "complete"}, {"id": "sin-lote", "value": "-98.25"'),
)


def run_tests(directory):
    return subprocess.run([sys.executable, '-m', 'unittest', 'discover', '-s', '.', '-p', 'test_*.py'],
                          cwd=directory, capture_output=True, text=True, timeout=30)


def review():
    results = []
    with tempfile.TemporaryDirectory(prefix='esco-synthetic-mutation-') as directory:
        target = Path(directory)
        for file in FILES:
            shutil.copyfile(ROOT / file, target / file)
        baseline = run_tests(target)
        if baseline.returncode:
            raise RuntimeError('Baseline sintético falla; no interpretar mutaciones')
        for name, file, before, after in MUTANTS:
            source = (ROOT / file).read_text()
            if source.count(before) != 1:
                raise RuntimeError('Mutación no unívoca: ' + name)
            (target / file).write_text(source.replace(before, after, 1))
            shutil.rmtree(target / '__pycache__', ignore_errors=True)
            run = run_tests(target)
            # Errors/import failures do not demonstrate an assertion caught the defect.
            detected = run.returncode != 0 and 'FAIL:' in run.stderr and 'ERROR:' not in run.stderr
            results.append({'mutant': name, 'detected_by_assertion': detected,
                            'exit_code': run.returncode, 'error_present': 'ERROR:' in run.stderr})
            (target / file).write_text(source)
    return {'schema': 'esco2-synthetic-mutation-review/v0.3.1', 'baseline_pass': True,
            'mutants': results, 'all_detected': all(r['detected_by_assertion'] for r in results),
            'limits': 'Independent SQL references and injected defects; not a second human review or product acceptance.'}


if __name__ == '__main__':
    report = review()
    print(json.dumps(report, indent=2))
    raise SystemExit(0 if report['all_detected'] else 1)
