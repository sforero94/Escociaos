#!/usr/bin/env python3
"""Reporte agregado del eval de Esco SQL.

    python3 scripts/esco-sql-eval/reporte.py <carpeta> <tag>

Lee <carpeta>/resultados-<tag>.jsonl y escribe <carpeta>/reporte-<tag>.json y .md.
Solo agregados por módulo, por tipo de fallo y por split: sin preguntas ni respuestas literales,
para que el resumen se pueda compartir. El detalle por pregunta queda en el jsonl privado.
"""
import json, sys, statistics as st
from collections import Counter, defaultdict

carpeta, tag = sys.argv[1], sys.argv[2]
filas = [json.loads(l) for l in open(f'{carpeta}/resultados-{tag}.jsonl')]
filas = [f for f in filas if 'omitida' not in f]


def v(f): return f.get('juicio', {}).get('veredicto')


def tasa(xs):
    return round(100 * sum(1 for f in xs if v(f) == 'CORRECTA') / len(xs), 1) if xs else None


def resumen(xs):
    por_q = defaultdict(list)
    for f in xs: por_q[f['id']].append(v(f))
    estables = sum(1 for r in por_q.values() if all(x == 'CORRECTA' for x in r))
    return {
        'corridas': len(xs), 'preguntas': len(por_q),
        'correcta_pct': tasa(xs),
        'parcial_pct': round(100 * sum(1 for f in xs if v(f) == 'PARCIAL') / len(xs), 1) if xs else None,
        'incorrecta_pct': round(100 * sum(1 for f in xs if v(f) in ('INCORRECTA', 'ERROR', 'SIN_JUICIO')) / len(xs), 1) if xs else None,
        'preguntas_3_de_3_correctas': estables,
        'preguntas_inconsistentes': sum(1 for r in por_q.values() if len(set(r)) > 1),
    }


out = {'tag': tag, 'total': resumen(filas)}
out['por_split'] = {s: resumen([f for f in filas if f.get('split') == s]) for s in sorted({f.get('split') for f in filas if f.get('split')})}
out['por_modulo'] = {m: resumen([f for f in filas if f.get('modulo') == m]) for m in sorted({f.get('modulo') for f in filas if f.get('modulo')})}
out['por_espera'] = {m: resumen([f for f in filas if f.get('espera') == m]) for m in sorted({f.get('espera') for f in filas if f.get('espera')})}
out['fallos_por_tipo'] = dict(Counter(f['juicio'].get('fallo_tipo') for f in filas if v(f) != 'CORRECTA').most_common())
con_q = [f for f in filas if 'n_consultas' in f]
out['operacion'] = {
    'consultas_por_pregunta_media': round(st.mean(f['n_consultas'] for f in con_q), 2) if con_q else None,
    'consultas_max': max((f['n_consultas'] for f in con_q), default=None),
    'corridas_con_error_postgres_pct': round(100 * sum(1 for f in con_q if f['errores_pg']) / len(con_q), 1) if con_q else None,
    'latencia_mediana_s': round(st.median(f['ms'] for f in con_q) / 1000, 1) if con_q else None,
    'latencia_p90_s': round(sorted(f['ms'] for f in con_q)[int(0.9 * len(con_q))] / 1000, 1) if con_q else None,
    'costo_esco_usd': round(sum(f.get('costo_esco') or 0 for f in con_q), 4),
    'costo_juez_usd': round(sum(f['juicio'].get('costo') or 0 for f in filas), 4),
    'formato_colombiano_ok_pct': round(100 * sum(1 for f in filas if f['juicio'].get('formato_ok') is True) / max(1, sum(1 for f in filas if f['juicio'].get('formato_ok') is not None)), 1),
    'corridas_con_tablas_crudas_pct': round(100 * sum(1 for f in con_q if any(not t.startswith('v_esco_') for t in f.get('tablas', []))) / len(con_q), 1) if con_q else None,
    'runner_errores': sum(1 for f in filas if f.get('error_runner')),
}
json.dump(out, open(f'{carpeta}/reporte-{tag}.json', 'w'), ensure_ascii=False, indent=1)

L = [f'# Eval Esco SQL — {tag}', '']
t = out['total']
L += [f"**Total:** {t['corridas']} corridas sobre {t['preguntas']} preguntas — correcta {t['correcta_pct']} %, parcial {t['parcial_pct']} %, incorrecta {t['incorrecta_pct']} %. "
      f"{t['preguntas_3_de_3_correctas']} preguntas correctas en todas las repeticiones; {t['preguntas_inconsistentes']} con resultados distintos entre repeticiones.", '']
for titulo, clave in (('Por split', 'por_split'), ('Por módulo', 'por_modulo'), ('Por tipo de pregunta', 'por_espera')):
    L += [f'## {titulo}', '', '| grupo | preguntas | correcta % | parcial % | incorrecta % | 3 de 3 | inconsistentes |', '|---|---|---|---|---|---|---|']
    for k, r in out[clave].items():
        L.append(f"| {k} | {r['preguntas']} | {r['correcta_pct']} | {r['parcial_pct']} | {r['incorrecta_pct']} | {r['preguntas_3_de_3_correctas']} | {r['preguntas_inconsistentes']} |")
    L.append('')
L += ['## Tipos de fallo (corridas no correctas)', '']
L += [f'- {k}: {n}' for k, n in out['fallos_por_tipo'].items()] or ['- ninguno']
L += ['', '## Operación', '']
L += [f'- {k}: {val}' for k, val in out['operacion'].items()]
open(f'{carpeta}/reporte-{tag}.md', 'w').write('\n'.join(L) + '\n')
print('\n'.join(L))
