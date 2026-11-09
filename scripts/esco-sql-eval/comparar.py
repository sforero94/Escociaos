#!/usr/bin/env python3
"""Antes y después del eval de Esco SQL, por módulo, sobre un split.

    python3 scripts/esco-sql-eval/comparar.py <carpeta> --split dev \
        --antes base2[,antes] --despues p1a[,p1b] [--salida <ruta.md>]

Para cada pregunta toma el «antes» del último tag de --antes que la contenga, y el «después» del último
de --despues. Eso permite re-correr con el motor viejo solo las preguntas cuya verdad cambió (o que son
nuevas) y no mezclar dos varas de medir. Una pregunta cuya verdad cambió o que es nueva (`verdad_v2` en
banco.json) se separa del subconjunto «limpio» (verdad intacta), que es la comparación más estricta.

Solo agregados (por módulo, por tipo de fallo, vueltos/mejorados): sin preguntas ni respuestas literales,
para poder subir el resultado al repo. El detalle por pregunta no sale de la carpeta privada.
"""
import argparse, json
from collections import Counter, defaultdict

ap = argparse.ArgumentParser()
ap.add_argument('carpeta')
ap.add_argument('--split', default='dev')
ap.add_argument('--antes', required=True)
ap.add_argument('--despues', required=True)
ap.add_argument('--salida')
a = ap.parse_args()

banco = {q['id']: q for q in json.load(open(f'{a.carpeta}/banco.json'))}


def cargar(tags):
    """id -> lista de veredictos de la última corrida (tag) que contiene esa pregunta."""
    por_id = {}
    for tag in tags.split(','):
        rondas = defaultdict(list)
        for linea in open(f'{a.carpeta}/resultados-{tag}.jsonl'):
            f = json.loads(linea)
            if 'omitida' in f or f.get('split') != a.split:
                continue
            rondas[f['id']].append(f)
        por_id.update(rondas)
    return por_id


antes, despues = cargar(a.antes), cargar(a.despues)
ids = sorted(set(antes) & set(despues))
v = lambda f: f.get('juicio', {}).get('veredicto')


def tasa(filas):
    return round(100 * sum(1 for f in filas if v(f) == 'CORRECTA') / len(filas), 1) if filas else None


def bloque(sel):
    fa = [f for i in sel for f in antes[i]]
    fd = [f for i in sel for f in despues[i]]
    return {
        'preguntas': len(sel), 'corridas_antes': len(fa), 'corridas_despues': len(fd),
        'correcta_antes': tasa(fa), 'correcta_despues': tasa(fd),
        'parcial_antes': round(100 * sum(1 for f in fa if v(f) == 'PARCIAL') / max(1, len(fa)), 1),
        'parcial_despues': round(100 * sum(1 for f in fd if v(f) == 'PARCIAL') / max(1, len(fd)), 1),
        'incorrecta_antes': round(100 * sum(1 for f in fa if v(f) not in ('CORRECTA', 'PARCIAL')) / max(1, len(fa)), 1),
        'incorrecta_despues': round(100 * sum(1 for f in fd if v(f) not in ('CORRECTA', 'PARCIAL')) / max(1, len(fd)), 1),
    }


def media(i, serie):
    xs = serie[i]
    return sum(1 for f in xs if v(f) == 'CORRECTA') / len(xs)


out = {'split': a.split, 'antes': a.antes, 'despues': a.despues, 'total': bloque(ids)}
out['limpio_verdad_intacta'] = bloque([i for i in ids if not banco[i].get('verdad_v2')])
out['verdad_cambiada_o_nueva'] = bloque([i for i in ids if banco[i].get('verdad_v2')])
mods = sorted({banco[i]['modulo'] for i in ids})
out['por_modulo'] = {m: bloque([i for i in ids if banco[i]['modulo'] == m]) for m in mods}
out['por_modulo_limpio'] = {m: bloque([i for i in ids if banco[i]['modulo'] == m and not banco[i].get('verdad_v2')]) for m in mods}
mejoran = [i for i in ids if media(i, despues) > media(i, antes) + 1e-9]
empeoran = [i for i in ids if media(i, despues) < media(i, antes) - 1e-9]
out['preguntas'] = {
    'mejoran': len(mejoran), 'empeoran': len(empeoran), 'igual': len(ids) - len(mejoran) - len(empeoran),
    'empeoran_por_modulo': dict(Counter(banco[i]['modulo'] for i in empeoran)),
    'mejoran_por_modulo': dict(Counter(banco[i]['modulo'] for i in mejoran)),
}
out['fallos_despues_por_tipo'] = dict(Counter(f['juicio'].get('fallo_tipo') for i in ids for f in despues[i] if v(f) != 'CORRECTA').most_common())
out['fallos_antes_por_tipo'] = dict(Counter(f['juicio'].get('fallo_tipo') for i in ids for f in antes[i] if v(f) != 'CORRECTA').most_common())


def fila(nombre, b):
    if not b['preguntas']:
        return f'| {nombre} | 0 | – | – | – |'
    d = round(b['correcta_despues'] - b['correcta_antes'], 1)
    return f"| {nombre} | {b['preguntas']} | {b['correcta_antes']} % | {b['correcta_despues']} % | {'+' if d >= 0 else ''}{d} |"


L = [f'# Antes y después — split {a.split}', '',
     f'Antes: {a.antes}. Después: {a.despues}. Por pregunta se toma el último tag que la contiene.', '',
     '| grupo | preguntas | correcta antes | correcta después | cambio (pp) |', '|---|---|---|---|---|',
     fila('**Total**', out['total']), fila('verdad intacta (comparación estricta)', out['limpio_verdad_intacta']),
     fila('verdad cambiada o pregunta nueva', out['verdad_cambiada_o_nueva'])]
L += ['', '## Por módulo (todas las preguntas)', '', '| módulo | preguntas | antes | después | cambio (pp) |', '|---|---|---|---|---|']
L += [fila(m, out['por_modulo'][m]) for m in mods]
L += ['', '## Por módulo (solo verdad intacta)', '', '| módulo | preguntas | antes | después | cambio (pp) |', '|---|---|---|---|---|']
L += [fila(m, out['por_modulo_limpio'][m]) for m in mods if out['por_modulo_limpio'][m]['preguntas']]
p = out['preguntas']
L += ['', f"Preguntas que mejoran: {p['mejoran']}; empeoran: {p['empeoran']}; igual: {p['igual']}.",
      f"Empeoran por módulo: {p['empeoran_por_modulo'] or 'ninguno'}.", '',
      '## Tipos de fallo (corridas no correctas)', '', '| tipo | antes | después |', '|---|---|---|']
for k in sorted(set(out['fallos_antes_por_tipo']) | set(out['fallos_despues_por_tipo'])):
    L.append(f"| {k} | {out['fallos_antes_por_tipo'].get(k, 0)} | {out['fallos_despues_por_tipo'].get(k, 0)} |")
texto = '\n'.join(L) + '\n'
json.dump(out, open(f'{a.carpeta}/comparacion-{a.split}.json', 'w'), ensure_ascii=False, indent=1)
if a.salida:
    open(a.salida, 'w', encoding='utf8').write(texto)
print(texto)
