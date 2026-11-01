// One reviewed candidate only. Publication does not authorize execution.
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TARGET, PROJECT, DEPLOY_CONFIG, normalized, fingerprint } from './release-faithfulness-proof.mjs';
import { reconstructCapture } from './release-application-date-cohort-capture.mjs';
export const APPROVED = Object.freeze({ source: 'bf6a8a30dadcafdc9e27b3b9514d1b77f8d4ad58',
  edgeTree: '14b02e7c564c8a05d6d26939f008111e759c1c65',
  fingerprint: 'a8ad35ddfb11af95909791ad96a08e9a90bde9c61bd2efde7bffdc54d44d6a02' });
export const ROLLBACK = Object.freeze({ source: 'c2be2a5ba36cf39c22d4db251c0e5348910f1802',
  tree: '97abc8a49a2d6693ed12bdb0d06949b651cadca7',
  full: 'd08faa6d930191cc667bc4fc20cab8907c331d5ac907270dc662fd03fcf35337',
  native: '00ed7d745293ad9b8942d718c0c302b8504b3cadbe659a5e3d53ccba5f5bfd9d' });
export const BASELINE = Object.freeze({ version:287, status:'ACTIVE', verifyJwt:false,
  hash:'7daa45317df62b545f2138f0a15262322289380b73d0fd4207ae682e665cae17', updatedAt:Date.parse('2026-10-31T19:59:03.098Z') });
function must(ok, message) { if (!ok) throw new Error(message); }
const stable = (a,b) => ['version','status','verifyJwt','hash','updatedAt'].every(k => a[k] === b[k]);
export function candidate(p = APPROVED) {
  must(/^[a-f0-9]{40}$/.test(p.source ?? '') && /^[a-f0-9]{40}$/.test(p.edgeTree ?? '') &&
    /^[a-f0-9]{64}$/.test(p.fingerprint ?? ''), 'Combined candidate is not frozen and approved');
  return p;
}
export function requirePinnedSource(observed, expected) {
  must(observed && Number.isSafeInteger(observed.count) && observed.count > 0 && /^[a-f0-9]{64}$/.test(observed.hash ?? ''), 'Invalid source fingerprint');
  must(observed.hash === expected, 'Pinned source differs');
}
export function invocation(env) {
  must(env.GITHUB_REPOSITORY === 'sforero94/Escociaos' && env.GITHUB_REF === 'refs/heads/main' &&
    env.GITHUB_EVENT_NAME === 'workflow_dispatch' && env.GITHUB_RUN_ATTEMPT === '1' &&
    /^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '') && /^[1-9]\d*$/.test(env.GITHUB_RUN_ID ?? ''), 'Manual main first attempt required');
  must(env.EXCLUSIVE_BACKEND_WINDOW === 'true' && env.RELEASE_CONFIRMATION === 'DEPLOY_APPROVED_APPLICATION_COHORT_KV_SCHEMA_WITH_V287_ROLLBACK', 'Specific release/window confirmation required');
}
export function stamp(meta) {
  const value = normalized(meta);
  must(Number.isSafeInteger(meta.updated_at) && meta.updated_at > 0, 'Invalid metadata time');
  return {...value, updatedAt:meta.updated_at};
}
function proof(p, kind, pins) {
  const count = 85;
  const expected = kind === 'rollback' ? ROLLBACK.full : pins.fingerprint;
  must(p?.fingerprint?.count === count && p.fingerprint.hash === expected &&
    p.evidence?.native?.count === count-2 && /^[a-f0-9]{64}$/.test(p.evidence.native.hash ?? '') &&
    p.evidence.reconstructed?.count === count && p.evidence.reconstructed.hash === expected &&
    JSON.stringify(p.evidence.reconstructed.restoredFromGit) === JSON.stringify(['importHato/tipos.ts','telegram/types.ts']) &&
    p.evidence.typeProof?.emitsOnlyEmptyModules === true && p.evidence.typeProof.typeScriptVersion === '5.9.3', 'Source/configuration proof mismatch');
  if (kind === 'rollback') must(p.evidence.native.hash === ROLLBACK.native, 'Native v287 source changed');
  return p;
}
export async function release(ops, pins = APPROVED) {
  candidate(pins); // Before even metadata/capture operations.
  const before=stamp(await ops.metadata()); must(stable(before,BASELINE), 'Baseline drift');
  await ops.verifySource();
  const first=proof(await ops.capture('first','rollback'),'rollback',pins);
  proof(await ops.capture('second','rollback'),'rollback',pins);
  must(stable(stamp(await ops.metadata()),before),'Metadata changed during capture');
  await ops.verifySource();
  must(stable(stamp(await ops.metadata()),before),'Metadata changed immediately before deploy');
  await ops.deploy('release'); // A thrown outcome is uncertain: never retry/rollback.
  const deployed=stamp(await ops.metadata());
  must(deployed.version === before.version+1 && deployed.hash !== before.hash && deployed.updatedAt > before.updatedAt,
    'Deployment ownership uncertain');
  must(['ACTIVE','FAILED'].includes(deployed.status),'Deployment status uncertain');
  let healthy=false;
  if (deployed.status === 'ACTIVE' && deployed.verifyJwt === false) {
    healthy=await ops.health(); must(typeof healthy === 'boolean','Health outcome uncertain');
  }
  if (healthy) {
    proof(await ops.capture('deployed','release'),'release',pins);
    must(stable(stamp(await ops.metadata()),deployed),'Ownership lost during source verification');
    return {state:'released', metadata:deployed};
  }
  // Only a confirmed failed status/JWT/health while still owning this deployment.
  must(stable(stamp(await ops.metadata()),deployed),'Ownership lost before rollback');
  await ops.deploy('rollback');
  const restored=stamp(await ops.metadata());
  must(restored.version === deployed.version+1 && restored.updatedAt > deployed.updatedAt && restored.status === 'ACTIVE' &&
    restored.verifyJwt === false && await ops.health() === true,'Rollback not verified');
  const recovered=proof(await ops.capture('restored','rollback'),'rollback',pins);
  must(recovered.fingerprint.hash === first.fingerprint.hash && stable(stamp(await ops.metadata()),restored),'Restored source/ownership changed');
  return {state:'rolled-back', metadata:restored};
}
async function body(response, limit) {
  must(response.ok && Number(response.headers.get('content-length') || 0) <= limit,'Read unavailable/oversized');
  let total=0; const chunks=[];
  for await (const chunk of response.body) { total+=chunk.length; must(total<=limit,'Read oversized'); chunks.push(chunk); }
  return Buffer.concat(chunks).toString('utf8');
}
export async function healthProbe(request=fetch, pause=()=>new Promise(r=>setTimeout(r,2000))) {
  let failed=0;
  for(let i=0;i<3;i++) {
    try {
      const r=await request(`https://${PROJECT}.supabase.co/functions/v1/${TARGET}/health`,{redirect:'error',signal:AbortSignal.timeout(10000)});
      if(r.status===200) {
        const raw=await body(r,4096);
        try { if(JSON.parse(raw).status==='ok') return true; } catch { /* completed malformed body */ }
      }
      failed++;
    } catch { /* transport uncertainty cannot authorize rollback */ }
    await pause();
  }
  must(failed===3,'Health transport uncertain'); return false;
}
export async function main(env=process.env) {
  const pins=candidate();
  invocation(env);
  if(process.argv.includes('--source')) { console.log(pins.source); return; }
  must(typeof env.SUPABASE_ACCESS_TOKEN==='string' && env.SUPABASE_ACCESS_TOKEN.length>0,'Existing management identity missing');
  const source=resolve('release-source'), rollback=resolve('rollback-source');
  const root=await mkdtemp(join(env.RUNNER_TEMP,'faithfulness-release-')); const dirs=new Map();
  const ts=(await import(pathToFileURL(resolve(env.PROOF_TYPESCRIPT)).href)).default;
  const cli=(cwd,args)=> {
    try { execFileSync('npx',['--offline','--cache',env.CLI_CACHE,'--yes','--package','supabase@2.122.0','--','supabase',...args],{
      cwd,stdio:'ignore',timeout:180000,env:{PATH:env.PATH,HOME:env.HOME,CI:'true',SUPABASE_ACCESS_TOKEN:env.SUPABASE_ACCESS_TOKEN},
    }); } catch { throw new Error('CLI outcome uncertain; inspect before retry or rollback'); }
  };
  const git=(dir,args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
  try {
    const ops={
      metadata:async()=>JSON.parse(await body(await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/functions/${TARGET}`,{
        headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`},redirect:'error',signal:AbortSignal.timeout(20000),
      }),65536)),
      verifySource:async()=> {
        must(git(resolve('.'),['rev-parse','HEAD'])===env.GITHUB_SHA,'Controls changed');
        must(git(resolve('.'),['rev-parse',`HEAD:supabase/functions/${TARGET}`])===pins.edgeTree,'Controls contain a different runtime');
        for(const [dir,sha,tree,hash] of [[source,pins.source,pins.edgeTree,pins.fingerprint],[rollback,ROLLBACK.source,ROLLBACK.tree,ROLLBACK.full]]) {
          must(git(dir,['rev-parse','HEAD'])===sha && git(dir,['rev-parse',`HEAD:supabase/functions/${TARGET}`])===tree &&
            git(dir,['status','--porcelain','--untracked-files=all'])==='','Pinned checkout changed');
          must(await readFile(join(dir,'supabase/config.toml'),'utf8')===DEPLOY_CONFIG,'Config changed');
          requirePinnedSource(await fingerprint(join(dir,'supabase/functions',TARGET)),hash);
        }
      },
      capture:async(name,kind)=> {
        await ops.verifySource(); const reference=kind==='rollback'?rollback:source;
        const raw=join(root,name); await mkdir(join(raw,'supabase'),{recursive:true});
        await cp(join(reference,'supabase/config.toml'),join(raw,'supabase/config.toml'));
        cli(raw,['functions','download',TARGET,'--project-ref',PROJECT,'--use-api']);
        const clean=join(root,name+'-clean');
        const observed=proof(await reconstructCapture(raw,reference,clean,ts),kind,pins); dirs.set(name,clean);
        console.log(JSON.stringify({phase:name,native:observed.evidence.native,reconstructed:observed.evidence.reconstructed,typeOnly:true}));
        return observed;
      },
      deploy:async kind=> {
        console.log(JSON.stringify({phase:'deploy-'+kind}));
        cli(kind==='release'?source:dirs.get('first'),['functions','deploy',TARGET,'--project-ref',PROJECT,'--use-api']);
      }, health:()=>healthProbe(),
    };
    const result=await release(ops,pins); console.log(JSON.stringify(result));
    must(result.state==='released','Verified rollback completed; release failed');
  } finally { await rm(root,{recursive:true,force:true}); }
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(()=>{ console.error('Release stopped. Inspect safe phase receipts; no blind retry or rollback.'); process.exitCode=1; });
}
