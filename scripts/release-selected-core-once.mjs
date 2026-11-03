// One reviewed candidate only. Publication does not authorize execution.
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TARGET, PROJECT, DEPLOY_CONFIG, normalized, fingerprint } from './release-faithfulness-proof.mjs';
import { reconstructCapture } from './release-selected-core-capture.mjs';
export const APPROVED = Object.freeze({ source: '6ed67f5cb8b629de17618a3b100747b00ea856a6',
  edgeTree: '264c2c6b42b4eb2d443350ebacbcad5df5b5f6f1',
  fingerprint: '59d413c9e4a9a2cb1ee08d878e9641afa5b192e5a16e0850c6172cb50855f27d' });
export const ROLLBACK = Object.freeze({ source: '19618994fd1d27e894154408f85f43cac6e507fe',
  tree: '9decf9734cbf9adc95a365f16add6de570bc63c9',
  full: 'e39c36ee3a703120cc6c767601777fac163f230474039513b08204021cc30f4e' });
// Expected baseline from verified run41494473672/job125445689783; not a fresh observation.
// Never accept metadata from the dispatch caller or silently adopt live values.
export const BASELINE = Object.freeze({ version:290, status:'ACTIVE', verifyJwt:false,
  hash:'ea6314b084b54916b0baf2a29c21a34ca9217b7e672176cecef7c799b8b7bc79', updatedAt:Date.parse('2026-11-02T17:48:06.783Z') });
export function requireBaseline(b=BASELINE) {
  must(b.version===290 && b.status==='ACTIVE' && b.verifyJwt===false &&
    /^[a-f0-9]{64}$/.test(b.hash??'') && Number.isSafeInteger(b.updatedAt) && b.updatedAt>0,
    'Exact v290 baseline receipt not bound');
}
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
  must(env.EXCLUSIVE_BACKEND_WINDOW === 'true' && (env.RELEASE_MODE ?? 'release')==='release' && env.RELEASE_CONFIRMATION === 'DEPLOY_REVIEWED_SELECTED_CORE_WITH_V290_SOURCE_ROLLBACK' || env.EXCLUSIVE_BACKEND_WINDOW === 'true' && env.RELEASE_MODE==='rollback' && env.RELEASE_CONFIRMATION==='ROLLBACK_REVIEWED_SELECTED_CORE_TO_V290_SOURCE', 'Specific release/window confirmation required');
}
export function stamp(meta) {
  const value = normalized(meta);
  must(Number.isSafeInteger(meta.updated_at) && meta.updated_at > 0, 'Invalid metadata time');
  return {...value, updatedAt:meta.updated_at};
}
function proof(p, kind, pins) {
  const count = kind === 'rollback' ? 85 : 109;
  const expected = kind === 'rollback' ? ROLLBACK.full : pins.fingerprint;
  must(p?.fingerprint?.count === count && p.fingerprint.hash === expected &&
    Number.isSafeInteger(p.evidence?.native?.count) && p.evidence.native.count >= count-2 && p.evidence.native.count <= count && /^[a-f0-9]{64}$/.test(p.evidence.native.hash ?? '') &&
    p.evidence.reconstructed?.count === count && p.evidence.reconstructed.hash === expected &&
    Array.isArray(p.evidence.reconstructed.restoredFromGit) && new Set(p.evidence.reconstructed.restoredFromGit).size===p.evidence.reconstructed.restoredFromGit.length && p.evidence.reconstructed.restoredFromGit.every(x=>['importHato/tipos.ts','telegram/types.ts'].includes(x)) && p.evidence.native.count + p.evidence.reconstructed.restoredFromGit.length === count &&
    p.evidence.typeProof?.emitsOnlyEmptyModules === true && p.evidence.typeProof.typeScriptVersion === '5.9.3', 'Source/configuration proof mismatch');
  return p;
}
export async function release(ops, pins = APPROVED, baseline = BASELINE) {
  requireBaseline(baseline);
  candidate(pins); // Before even metadata/capture operations.
  const before=stamp(await ops.metadata()); must(stable(before,baseline), 'Baseline drift');
  await ops.verifySource();
  const first=proof(await ops.capture('first','rollback'),'rollback',pins);
  const second=proof(await ops.capture('second','rollback'),'rollback',pins);
  must(JSON.stringify(first.evidence.native)===JSON.stringify(second.evidence.native) && JSON.stringify(first.evidence.reconstructed)===JSON.stringify(second.evidence.reconstructed),'Fresh captures differ');
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
// Functional HTTP200 failures require a separate supervised dispatch, never an
// automatic inference. Receipt fields must come from the verified release result.
export async function supervisedRollback(ops, receipt, baseline=BASELINE) {
  requireBaseline(baseline);
  must(receipt && receipt.version===baseline.version+1 && receipt.status==='ACTIVE' && receipt.verifyJwt===false &&
    /^[a-f0-9]{64}$/.test(receipt.hash??'') && receipt.hash!==baseline.hash &&
    Number.isSafeInteger(receipt.updatedAt) && receipt.updatedAt>baseline.updatedAt,'Verified owned release receipt required');
  must(stable(stamp(await ops.metadata()),receipt),'Supervised rollback ownership mismatch');
  await ops.verifySource();
  const first=proof(await ops.capture('functional-first','release'),'release',APPROVED);
  const second=proof(await ops.capture('functional-second','release'),'release',APPROVED);
  must(JSON.stringify(first.evidence.native)===JSON.stringify(second.evidence.native),'Current candidate captures differ');
  await ops.verifyRecovery();
  must(stable(stamp(await ops.metadata()),receipt),'Ownership changed before supervised rollback');
  await ops.deploy('supervised-rollback');
  const restored=stamp(await ops.metadata());
  must(restored.version===receipt.version+1 && restored.updatedAt>receipt.updatedAt && restored.status==='ACTIVE' &&
    restored.verifyJwt===false && await ops.health()===true,'Supervised rollback not verified');
  proof(await ops.capture('functional-restored','rollback'),'rollback',APPROVED);
  must(stable(stamp(await ops.metadata()),restored),'Ownership lost during recovery proof');
  return {state:'supervised-rolled-back',metadata:restored};
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
  requireBaseline();
  if(process.argv.includes('--source')) {
    must(execFileSync('git',['rev-parse',`HEAD:supabase/functions/${TARGET}`],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()===pins.edgeTree,'Controls contain a different runtime');
    requirePinnedSource(await fingerprint(resolve('supabase/functions',TARGET)),pins.fingerprint);
    console.log(pins.source); return;
  }
  must(typeof env.SUPABASE_ACCESS_TOKEN==='string' && env.SUPABASE_ACCESS_TOKEN.length>0,'Existing management identity missing');
  const source=resolve('release-source'), rollback=resolve('rollback-source');
  const ts=(await import(pathToFileURL(resolve(env.PROOF_TYPESCRIPT)).href)).default;
  const root=await mkdtemp(join(env.RUNNER_TEMP,'faithfulness-release-')); const dirs=new Map();
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
      verifyRecovery:async()=>{
        await ops.verifySource();
        const {proveTypeOnly}=await import('./release-selected-core-capture.mjs');
        await proveTypeOnly(join(rollback,'supabase/functions',TARGET),ts);
      },
      deploy:async kind=> {
        console.log(JSON.stringify({phase:'deploy-'+kind}));
        cli(kind==='release'?source:kind==='supervised-rollback'?rollback:dirs.get('first'),['functions','deploy',TARGET,'--project-ref',PROJECT,'--use-api']);
      }, health:()=>healthProbe(),
    };
    const result=env.RELEASE_MODE==='rollback'
      ? await supervisedRollback(ops,{version:Number(env.OWNED_VERSION),hash:env.OWNED_BUNDLE,updatedAt:Number(env.OWNED_UPDATED_AT),status:'ACTIVE',verifyJwt:false})
      : await release(ops,pins); console.log(JSON.stringify(result));
    must(result.state==='released' || result.state==='supervised-rolled-back','Verified technical rollback completed; release failed');
  } finally { await rm(root,{recursive:true,force:true}); }
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(()=>{ console.error('Release stopped. Inspect safe phase receipts; no blind retry or rollback.'); process.exitCode=1; });
}
