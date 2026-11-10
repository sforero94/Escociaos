#!/usr/bin/env python3
"""Build an external, public/synthetic fixture from a frozen approved Git tree.
No Docker invocation, environment/secret reads, production access or module mocks.
Only application network transports and Deno.serve are intercepted by the fixture.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

APPROVED_TREE = 'ab3e622c9e2c56b743698a0e2d54bcca4456d600'
IMAGE = 'supabase/edge-runtime@sha256:6b850a2ccf0bf50ecac9accff8098095cd191c389c2a53c59b857aa0f53a8343'
PREFIXES = ['src/utils', 'src/types', 'supabase/functions/make-server-1ccce916']
SUFFIXES = {'.ts', '.tsx', '.mjs', '.js', '.json', '.lock'}

def sha(data):
    return hashlib.sha256(data).hexdigest()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--tree', default=APPROVED_TREE,
                        help='Frozen source tree; default is the approved P5 candidate.')
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    out = args.out.resolve()
    if out == repo or repo in out.parents:
        raise SystemExit('Use a new temporary directory outside the repository.')
    if out.exists() and any(out.iterdir()):
        raise SystemExit('Output must be new or empty; nothing was overwritten.')
    def git(*params):
        return subprocess.check_output(['git', '-C', str(repo), *params])
    tree = git('rev-parse', args.tree + '^{tree}').decode().strip()
    names = git('ls-tree', '-r', '--name-only', tree, *PREFIXES).decode().splitlines()
    names = [name for name in names if Path(name).suffix in SUFFIXES]
    prepared = {}
    source_hashes = {}
    for name in names:
        data = git('show', tree + ':' + name)
        prepared['repo/' + name] = data
        source_hashes[name] = sha(data)
    config = json.loads(prepared['repo/supabase/functions/make-server-1ccce916/deno.json'])
    config['imports']['@esco-sql/'] = '../repo/src/utils/escoSql/'
    config['lock'] = './deno.lock'
    prepared['worker/deno.json'] = (json.dumps(config, indent=2) + '\n').encode()
    prepared['worker/deno.lock'] = prepared['repo/supabase/functions/make-server-1ccce916/deno.lock']
    templates = Path(__file__).resolve().parent / 'fixtures'
    for name in ['main', 'worker', 'control']:
        prepared[name + '/index.ts'] = (templates / ('servidor-' + name + '.ts.txt')).read_bytes()
    for name, data in prepared.items():
        target = out / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    (out / 'cache').mkdir(exist_ok=True)
    manifest = {
        'approved_tree': tree, 'image': IMAGE, 'source_files': source_hashes,
        'entrypoint': 'repo/supabase/functions/make-server-1ccce916/index.ts',
        'source_transformations': [],
        'fixture_config_change': 'Only rebase the shared @esco-sql alias; copy the approved lock unchanged.',
        'scope': 'Complete deploy bootstrap/import graph; real Hono, grammY, SQL client and renderers; closed synthetic network transports.',
        'network': 'Run with Docker --network none. Only main-proxy loopback HTTP is used.',
        'environment': 'Explicit synthetic values only; no host env files are read or mounted.',
        'policy': 'per_request', 'memory_limit_mb': 256, 'cpu_hard_ms': 2000,
        'fixtures': {name: sha(data) for name, data in prepared.items() if not name.startswith('repo/')},
    }
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({'out': str(out), 'tree': tree, 'public_source_files': len(source_hashes), 'image': IMAGE}))

if __name__ == '__main__':
    main()
