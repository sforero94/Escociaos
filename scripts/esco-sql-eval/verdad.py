"""Ejecuta la `verdad` (SQL sobre tablas base) de cada pregunta del banco, en SOLO LECTURA (Composio).

    python3 scripts/esco-sql-eval/verdad.py <carpeta> [ids separados por coma]

Lee <carpeta>/banco.json y escribe <carpeta>/verdad.json.
"""
import json, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
carpeta = sys.argv[1]
banco = json.load(open(f'{carpeta}/banco.json'))
def run(x):
    if not x['verdad']: return x['id'], None
    p = subprocess.run(['composio','execute','SUPABASE_RUN_READ_ONLY_QUERY','--account','escocia-os','-d',
        json.dumps({'ref':'ywhtjwawnkeqlwxbvgup','query':x['verdad']})], capture_output=True, text=True, cwd='/tmp')
    try:
        d = json.loads(p.stdout)
        return x['id'], (d['data']['result'] if d.get('successful') else {'error': str(d)[:500]})
    except Exception:
        return x['id'], {'error': (p.stdout+p.stderr)[:300]}
prev = {}
try: prev = json.load(open(f'{carpeta}/verdad.json'))
except Exception: pass
solo = set(map(int, sys.argv[2].split(','))) if len(sys.argv)>2 else None
todo = [x for x in banco if (solo is None or x['id'] in solo)]
with ThreadPoolExecutor(4) as ex:
    for i, r in ex.map(run, todo): prev[str(i)] = r
json.dump(prev, open(f'{carpeta}/verdad.json','w'), ensure_ascii=False, indent=1)
bad = [(k,v) for k,v in prev.items() if isinstance(v, dict) and 'error' in v]
print('errores:', len(bad))
for k,v in bad: print(k, banco[int(k)-1]['pregunta'], '->', v['error'][:300])
