"""Control local v0.3 de denominador fijo. Sin red ni llamadas al producto.

Entrada: manifest congelado y resultados adjudicados; no contiene oráculos.
Este control NO adjudica respuestas ni declara aceptación del producto.
"""
import json
import math
import sys
from collections import Counter


def wilson(successes, total):
    if not total:
        return None
    z = 1.959963984540054
    p = successes / total
    center = (p + z * z / (2 * total)) / (1 + z * z / total)
    radius = z * math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / (1 + z * z / total)
    return [max(0, center - radius), min(1, center + radius)]


def score(manifest, results):
    if manifest.get('schema') != 'esco2-score/v0.3' or manifest.get('frozen') is not True:
        raise ValueError('Se requiere manifest v0.3 congelado')
    cases = manifest['cases']
    ids = [c['id'] for c in cases]
    if not ids or len(set(ids)) != len(ids):
        raise ValueError('IDs vacíos o duplicados')
    groups = {}
    expected = set()
    for c in cases:
        if c['partition'] not in {'development', 'heldout'}:
            raise ValueError('Partición inválida')
        if c['classification'] not in {'answerable', 'guard', 'clarification'}:
            raise ValueError('Clasificación inválida; resolver alcance antes de congelar')
        if type(c['reference_verified']) is not bool or type(c['mandatory']) is not bool:
            raise ValueError('Estado de referencia/imprescindible inválido')
        if not c['lineage_group'] or not c['domain']:
            raise ValueError('Falta linaje o dominio')
        if groups.setdefault(c['lineage_group'], c['partition']) != c['partition']:
            raise ValueError('Fuga de linaje entre particiones')
        attempts = c['attempts']
        if not attempts or any(type(a) is not int or a < 1 for a in attempts) or len(set(attempts)) != len(attempts):
            raise ValueError('Intentos deben predefinirse sin duplicados')
        expected.update((c['id'], a) for a in attempts)
    observed = {}
    valid_outcomes = {'complete_correct', 'partial', 'blocked', 'not_executed', 'failed',
                      'guard_pass', 'clarification_pass', 'reference_inconclusive'}
    for r in results:
        if type(r['attempt']) is not int or r['attempt'] < 1:
            raise ValueError('Índice de intento debe ser entero positivo')
        key = (r['case_id'], r['attempt'])
        if key not in expected or key in observed:
            raise ValueError('Resultado desconocido, extra o duplicado')
        if r['outcome'] not in valid_outcomes or type(r['critical']) is not bool:
            raise ValueError('Resultado sin estado o severidad válidos')
        if any(not isinstance(r.get(k), str) or not r[k].strip()
               for k in ('reviewed_by', 'review_version')):
            raise ValueError('Falta adjudicación independiente identificada')
        observed[key] = r
    unresolved = sorted(c['id'] for c in cases if not c['reference_verified'] or any(
        observed.get((c['id'], a), {}).get('outcome') == 'reference_inconclusive' for a in c['attempts']))
    critical = any(r['critical'] for r in results)

    def summarize(selected):
        answerable = [c for c in selected if c['classification'] == 'answerable']
        def passed(c):
            wanted = {'answerable': 'complete_correct', 'guard': 'guard_pass',
                      'clarification': 'clarification_pass'}[c['classification']]
            return c['id'] not in unresolved and all(
                observed.get((c['id'], a), {}).get('outcome') == wanted
                and not observed[(c['id'], a)]['critical'] for a in c['attempts'])
        successes = sum(passed(c) for c in answerable)
        total = len(answerable)
        guards = [c for c in selected if c['classification'] != 'answerable']
        outcomes = Counter(observed.get((c['id'], a), {'outcome': 'not_executed'})['outcome']
                           for c in selected for a in c['attempts'])
        return {'denominator': total, 'complete_correct_all_attempts': successes,
                'rate': successes / total if total else None,
                'wilson95_cases': wilson(successes, total),
                'lineage_groups': len({c['lineage_group'] for c in answerable}),
                'expected_attempts': sum(len(c['attempts']) for c in selected),
                'outcomes_all_attempts': dict(outcomes),
                'missing_attempts': [[c['id'], a] for c in selected for a in c['attempts']
                                     if (c['id'], a) not in observed],
                'guard_clarification_total': len(guards),
                'guard_clarification_pass': sum(passed(c) for c in guards),
                'mandatory_failed': [c['id'] for c in selected if c['mandatory'] and not passed(c)]}
    partitions = {p: summarize([c for c in cases if c['partition'] == p])
                  for p in sorted({c['partition'] for c in cases})}
    domains = {p + '/' + d: summarize([c for c in cases if c['partition'] == p and c['domain'] == d])
               for p, d in sorted({(c['partition'], c['domain']) for c in cases})}
    gate = not critical and not unresolved and all(
        s['denominator'] > 0 and s['rate'] >= .9 and not s['mandatory_failed']
        and s['guard_clarification_total'] == s['guard_clarification_pass']
        for s in partitions.values())
    return {'schema': 'esco2-score-report/v0.3-prep', 'partitions': partitions,
            'by_domain': domains, 'critical_observed': critical,
            'inconclusive_references': unresolved, 'scoring_gate_pass': gate,
            'product_accepted': False,
            'limits': ['Scoring control only; independent adjudication still required.',
                       'No acceptance without frozen development AND independently custodied held-out,',
                       'approved domain must-haves, route/security, web and Telegram regression evidence.',
                       'Wilson uses cases, not attempts; related cases are not independent.',
                       'Case passes only if every predefined attempt passes; no best-of selection.']}


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Uso: score.py manifest.json results.json')
    with open(sys.argv[1], encoding='utf8') as handle:
        manifest = json.load(handle)
    with open(sys.argv[2], encoding='utf8') as handle:
        results = json.load(handle)
    print(json.dumps(score(manifest, results), ensure_ascii=False, indent=2))
