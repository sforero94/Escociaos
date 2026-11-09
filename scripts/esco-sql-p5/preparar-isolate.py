#!/usr/bin/env python3
"""Prepare a public/synthetic Edge Runtime PNG fixture in a new temporary directory.
Does not start Docker, access production, read env files or use product inputs.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

WRAPPER_SHA256 = '10170d02d816f02ec76f9bc095b01d9becf536e7b1e12e5aa616652c84b237a1'
IMAGE = 'supabase/edge-runtime@sha256:6b850a2ccf0bf50ecac9accff8098095cd191c389c2a53c59b857aa0f53a8343'
MAIN = r'''Deno.serve(async(req)=>{
 try{
 const worker=await EdgeRuntime.userWorkers.create({servicePath:'/fixtures/worker',memoryLimitMb:256,workerTimeoutMs:150000,noModuleCache:false,envVars:[],forceCreate:new URL(req.url).searchParams.get('cold')==='1',cpuTimeSoftLimitMs:1800,cpuTimeHardLimitMs:2000});
 return await worker.fetch(req);
 }catch(error){return Response.json({error:String(error)},{status:500});}
});
(async()=>{
 const rows=[];
 try{
  for(let i=0;i<43;i++){
   const cold=i<3;let response;
   for(let attempt=0;attempt<20;attempt++){
    try{response=await fetch('http://127.0.0.1:9000/synthetic?cold='+(cold?'1':'0'));break;}
    catch(error){if(attempt===19)throw error;await new Promise(r=>setTimeout(r,50));}
   }
   if(!response||response.status!==200)throw Error('Worker HTTP '+response?.status+':'+await response?.text());const body=await response.json();rows.push({iteration:i,cold,...body});console.log('D3_ROW '+JSON.stringify(rows.at(-1)));
  }
  const concurrent=await Promise.all([0,1].map(async(i)=>{const r=await fetch('http://127.0.0.1:9000/synthetic?cold=0');if(r.status!==200)throw Error('Concurrent HTTP '+r.status);return {iteration:43+i,cold:false,concurrent:true,...await r.json()};}));rows.push(...concurrent);
  console.log('D3_COMPLETE '+JSON.stringify({rows,memoryLimitMb:256,cpuTimeHardLimitMs:2000,policy:'per_request',envVars:[],publicFixtureOnly:true}));
 }catch(error){console.error('D3_FAILED '+String(error));}
})();
'''
WORKER = r'''import { renderizarGraficaPng } from './escoSqlPng.ts';
let calls=0; globalThis.fetch=()=>{calls++;throw Error('Network forbidden');};
let requestCount=0;
Deno.serve(async()=>{
 const start=performance.now();const shapes=['bar','line','area','pie'] as const;const outputs=[];
 for(const shape of shapes){const series=shape==='pie'?['v0']:Array.from({length:6},(_,i)=>'v'+i);const datos=Array.from({length:60},(_,i)=>Object.fromEntries([['categoria','Categoría sintética '+i],...series.map((s,j)=>[s,shape==='pie'?i+1:i%11===0?null:((i*31+j*17)%180)-40])]))
 const b={tipo:'grafica' as const,consulta:1,truncado:true,titulo:'D3 sintético máximo '+shape,forma:shape,x:'categoria',y:series,formato:'numero' as const,datos};
 const png=await renderizarGraficaPng(b);const view=new DataView(png.buffer,png.byteOffset,png.byteLength);if(png[0]!==137||png[1]!==80||png[2]!==78||png[3]!==71)throw Error('PNG signature');outputs.push({shape,bytes:png.length,width:view.getUint32(16),height:view.getUint32(20)});
 }
 requestCount++;return Response.json({requestCount,outputs,ms:performance.now()-start,fetches:calls,memory:Deno.memoryUsage()});
});
'''

def digest(data):
    return hashlib.sha256(data).hexdigest()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    out = args.out.resolve()
    if out == repo or repo in out.parents:
        raise SystemExit('Use a temporary directory outside the repository.')
    if out.exists() and any(out.iterdir()):
        raise SystemExit('Output directory must be new or empty; nothing was overwritten.')
    canonical = repo / 'src/supabase/functions/server/telegram'
    wrapper = repo / 'node_modules/@resvg/resvg-wasm/index.mjs'
    if digest(wrapper.read_bytes()) != WRAPPER_SHA256:
        raise SystemExit('Pinned public resvg wrapper SHA mismatch; no fixture written.')
    files = {
        'worker/vendor/resvg.mjs': wrapper,
        'worker/shared/escoSql/formato.ts': repo / 'src/utils/escoSql/formato.ts',
        'worker/shared/escoSql/bloques.ts': repo / 'src/utils/escoSql/bloques.ts',
        'worker/shared/formatPuro.ts': repo / 'src/utils/formatPuro.ts',
    }
    for name in ['escoSqlWasm.ts', 'escoSqlFont.ts', 'escoSqlFontCoverage.ts']:
        files['worker/vendor/' + name] = canonical / 'vendor' / name
    prepared = {name: source.read_bytes() for name, source in files.items()}
    original = (canonical / 'escoSqlPng.ts').read_bytes()
    transformed = original.decode().replace('@esco-sql/', './shared/escoSql/').replace('@resvg/resvg-wasm', './vendor/resvg.mjs')
    prepared['worker/escoSqlPng.ts'] = transformed.encode()
    prepared['main/index.ts'] = MAIN.encode()
    prepared['worker/index.ts'] = WORKER.encode()
    for name, data in prepared.items():
        target = out / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    commit = subprocess.check_output(['git', '-C', str(repo), 'rev-parse', 'HEAD'], text=True).strip()
    manifest = {'image': IMAGE, 'repository_head': commit,
                'production_png_source_sha256': digest(original),
                'temporary_transformation': 'Only import specifiers rewritten to local public copies; PNG implementation unchanged.',
                'scope': 'PNG renderer and shared formatter, not the full make-server import graph.',
                'env_vars': [], 'memory_limit_mb': 256, 'cpu_hard_limit_ms': 2000,
                'policy': 'per_request', 'files': {name: digest(data) for name, data in prepared.items()}}
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({'output': str(out), 'files': len(prepared), 'image': IMAGE}))

if __name__ == '__main__':
    main()
