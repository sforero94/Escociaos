// One target/source only. No production operations when imported or tested.
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TARGET, PROJECT, normalized, same, fingerprint, diagnosticInventory } from './release-pr367.mjs';
import { reconstructCapture, OMITTED } from './release-pr367-capture.mjs';
export { TARGET, PROJECT };
export const SOURCE = 'e7a5545bc8d87ad0502caf009d0201cae67fc772';
export const EDGE_TREE = '6e9969d49f652989ef2c1679ff24be0f976410e7';
export const ROLLBACK_SOURCE = '634580480c72b27c7ccd2d8c006af520d0ca1058';
export const ROLLBACK_TREE = '99ba3737577f064e27112e4e99a8dd24739c6422';
export const BASELINE = Object.freeze({version:281, hash:'27dc76027a6b6eeddd5866f1e749ec2de32c3ac059b449ec6c8cb703a742756b', status:'ACTIVE', verifyJwt:false, updatedAt:1793306746924});
export const FULL = Object.freeze({rollback:'3010b467d3d259cf34cbce7875b393e67748a709a88413857199dd6b2282ce4e', release:'b83bc09149e76798832153b2aa620bf91d8d90af26c889dfefe137e8d2465685'});
export const NATIVE_ROLLBACK = '1a7e50e2d0b37c7aa0c014b564ee90312dfcdff971a49ebbc0215686342fa24f'; // Git expectation, never observed evidence.
const CONFIG = '# Minimal config for Edge Function deployment\n\n[functions.make-server-1ccce916]\nverify_jwt = false\n';
const WORKFLOW = '.github/workflows/release-pr371-once.yml';
const MARKER = 'PR371_DIAGNOSTIC_RECEIPT ';
const hash = value => createHash('sha256').update(value).digest('hex');
class Stop extends Error {}
function must(condition, message) { if (!condition) throw new Stop(message); }
export function stamp(meta) {
  const value = normalized(meta);
  must(Number.isSafeInteger(meta.updated_at) && meta.updated_at > 0, 'Invalid metadata timestamp');
  return {...value, updatedAt:meta.updated_at};
}
const stable = (a,b) => same(a,b) && a.updatedAt === b.updatedAt;
export function context(env) {
  must(env.GITHUB_REPOSITORY === 'sforero94/Escociaos' && env.GITHUB_REF === 'refs/heads/main' && env.GITHUB_EVENT_NAME === 'workflow_dispatch' && env.GITHUB_RUN_ATTEMPT === '1', 'Manual main-only first-attempt invocation required');
  must(/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '') && /^[1-9]\d*$/.test(env.GITHUB_RUN_ID ?? ''), 'Invalid run identity');
  return {controlSha:env.GITHUB_SHA, runId:env.GITHUB_RUN_ID};
}
export function mode(value, confirmation) {
  must((value === 'diagnose' && confirmation === 'DIAGNOSE_PR371_V281_ONLY') ||
    (value === 'release' && confirmation === 'DEPLOY_PR371_WITH_REVIEWED_V281_ROLLBACK'), 'Explicit matching mode/confirmation required');
  return value;
}
export function proof(p, kind='rollback') {
  must(p?.fingerprint?.count === 82 && p.fingerprint.hash === FULL[kind] &&
    p.evidence?.native?.count === 80 && /^[a-f0-9]{64}$/.test(p.evidence.native.hash ?? '') &&
    p.evidence.reconstructed?.count === 82 && p.evidence.reconstructed.hash === FULL[kind] &&
    JSON.stringify(p.evidence.reconstructed.restoredFromGit) === JSON.stringify(Object.keys(OMITTED)) &&
    p.evidence.typeProof?.typeScriptVersion === '5.9.3' && p.evidence.typeProof.emitsOnlyEmptyModules === true, 'Capture proof unavailable or different');
  if (kind === 'rollback') must(p.evidence.native.hash === NATIVE_ROLLBACK, 'Native v281 source differs from pinned Git expectation');
  return p;
}
export function receipt(p, run) {
  proof(p);
  return {runId:run.runId, controlSha:run.controlSha, source:SOURCE, edgeTree:EDGE_TREE,
    rollbackSource:ROLLBACK_SOURCE, rollbackTree:ROLLBACK_TREE, baseline:BASELINE,
    native:p.evidence.native, reconstructed:{count:82,hash:FULL.rollback}};
}
export function checkReceipt(value, run) {
  must(value && typeof value === 'object' && Object.keys(value).sort().join(',') === 'baseline,controlSha,edgeTree,native,reconstructed,rollbackSource,rollbackTree,runId,source', 'Invalid diagnostic receipt shape');
  must(value.controlSha === run.controlSha && /^[1-9]\d*$/.test(value.runId ?? '') && BigInt(value.runId) < BigInt(run.runId), 'Diagnostic must precede this run on identical controls');
  must(value.source === SOURCE && value.edgeTree === EDGE_TREE && value.rollbackSource === ROLLBACK_SOURCE && value.rollbackTree === ROLLBACK_TREE &&
    stable(value.baseline,BASELINE) && value.native?.count === 80 && value.native.hash === NATIVE_ROLLBACK && value.reconstructed?.count === 82 && value.reconstructed.hash === FULL.rollback, 'Diagnostic receipt differs from pinned release');
  return value;
}
export async function diagnose(ops, run) {
  const before=stamp(await ops.metadata()); must(stable(before,BASELINE), 'Baseline changed; stop for review');
  await ops.verifySource();
  const observed=proof(await ops.capture('diagnostic','rollback'));
  must(stable(stamp(await ops.metadata()),before), 'Deployment changed during diagnostic');
  return {state:'diagnostic-only', deploymentAttempted:false, receipt:receipt(observed,run), evidence:observed.evidence};
}
export async function release(ops, approved, run) {
  checkReceipt(approved,run);
  const before=stamp(await ops.metadata()); must(stable(before,BASELINE), 'Baseline changed; stop for review');
  await ops.verifySource();
  const first=proof(await ops.capture('first','rollback'));
  const second=proof(await ops.capture('second','rollback'));
  must(first.evidence.native.hash === approved.native.hash && second.evidence.native.hash === approved.native.hash, 'Current captures differ from reviewed diagnostic');
  must(stable(stamp(await ops.metadata()),before), 'Deployment changed during capture');
  await ops.verifySource();
  must(stable(stamp(await ops.metadata()),before), 'Deployment changed before release');
  await ops.deploy('release'); // Any thrown CLI outcome is uncertain: no catch/retry/rollback.
  const deployed=stamp(await ops.metadata());
  must(deployed.version === before.version+1 && deployed.hash !== before.hash && deployed.updatedAt >= before.updatedAt, 'Unexpected release ownership; inspect manually');
  must(['ACTIVE','FAILED'].includes(deployed.status),'Release status uncertain; inspect before rollback');
  if (deployed.status === 'ACTIVE' && deployed.verifyJwt === false && await ops.health()) {
    proof(await ops.capture('deployed','release'),'release'); // Unknown layout is uncertainty, not rollback permission.
    must(stable(stamp(await ops.metadata()),deployed), 'Deployment changed during verification');
    return {state:'released',metadata:deployed};
  }
  must(stable(stamp(await ops.metadata()),deployed), 'Deployment changed before conditional rollback');
  await ops.deploy('rollback');
  const restored=stamp(await ops.metadata());
  must(restored.version === deployed.version+1 && restored.status === 'ACTIVE' && restored.verifyJwt === false && restored.updatedAt >= deployed.updatedAt && await ops.health(), 'Rollback verification failed');
  proof(await ops.capture('restored','rollback'));
  must(stable(stamp(await ops.metadata()),restored), 'Deployment changed during rollback verification');
  return {state:'rolled-back',metadata:restored};
}
// Public GitHub evidence only: no extra repository permission or token fallback.
async function bounded(response, limit) {
  must(response.ok && Number(response.headers.get('content-length') || 0) <= limit, 'Evidence response unavailable or oversized');
  const chunks=[]; let size=0;
  for await (const chunk of response.body) { size+=chunk.length; must(size<=limit,'Evidence response oversized'); chunks.push(chunk); }
  return Buffer.concat(chunks).toString('utf8');
}
export async function reviewedDiagnostic(id, digest, run, request=fetch) {
  must(/^[1-9]\d*$/.test(id ?? '') && /^[a-f0-9]{64}$/.test(digest ?? '') && BigInt(id)<BigInt(run.runId), 'Reviewed diagnostic run and receipt hash required');
  const base='https://api.github.com/repos/sforero94/Escociaos/actions';
  const get=async (url,limit=262144) => bounded(await request(url,{redirect:'error',signal:AbortSignal.timeout(20000),headers:{Accept:'application/vnd.github+json'}}),limit);
  const info=JSON.parse(await get(`${base}/runs/${id}`));
  must(String(info.id) === id && info.path === WORKFLOW && info.event === 'workflow_dispatch' && info.head_branch === 'main' && info.head_sha === run.controlSha && info.status === 'completed' && info.conclusion === 'success' && info.run_attempt === 1, 'Diagnostic run not a successful first-attempt matching-control main dispatch');
  const jobs=JSON.parse(await get(`${base}/runs/${id}/jobs?filter=latest&per_page=100`));
  must(jobs.total_count === 1 && jobs.jobs?.length === 1 && jobs.jobs[0].name === 'release' && jobs.jobs[0].status === 'completed' && jobs.jobs[0].conclusion === 'success' && Number.isSafeInteger(jobs.jobs[0].id), 'Diagnostic job unavailable');
  const redirect=await request(`${base}/jobs/${jobs.jobs[0].id}/logs`,{redirect:'manual',signal:AbortSignal.timeout(20000)});
  must(redirect.status === 302, 'Diagnostic log redirect unavailable');
  const location=new URL(redirect.headers.get('location'));
  must(location.protocol === 'https:' && /^[a-z0-9-]+\.blob\.core\.windows\.net$/.test(location.hostname) && !location.username && !location.password && !location.port, 'Unknown diagnostic log host');
  const logs=await get(location.href,2*1024*1024);
  const records=logs.split(/\r?\n/).map(line=>line.replace(/^\d{4}-\d{2}-\d{2}T\S+ /,'')).filter(line=>line.startsWith(MARKER));
  must(records.length === 1, 'Exactly one observed diagnostic receipt required');
  const raw=records[0].slice(MARKER.length); must(hash(raw) === digest,'Reviewed receipt hash mismatch');
  const value=JSON.parse(raw); must(value.runId === id,'Receipt run mismatch');
  return checkReceipt(value,run);
}
export async function healthProbe(request=fetch, pause=()=>new Promise(done=>setTimeout(done,2000))) {
  let confirmedFailures=0;
  for(let i=0;i<3;i++){
    try{
      const r=await request(`https://${PROJECT}.supabase.co/functions/v1/${TARGET}/health`,{redirect:'error',signal:AbortSignal.timeout(10000)});
      if(r.status===200){
        const body=await bounded(r,4096); // Stream/transport failure remains unknown.
        try{if(JSON.parse(body).status==='ok')return true;}catch{/* completed malformed health response */}
      }
      confirmedFailures++;
    }catch{/* network uncertainty is never rollback permission */}
    await pause();
  }
  must(confirmedFailures===3,'Health unavailable; rollback ownership not inferred');return false;
}
export async function main(env=process.env) {
  const run=context(env); const selected=mode(env.RELEASE_MODE,env.RELEASE_CONFIRMATION);
  const approvedPath=join(env.RUNNER_TEMP,'pr371-approved.json');
  if (process.argv.includes('--verify-diagnostic')) {
    if (selected === 'release') {
      const approved=await reviewedDiagnostic(env.REVIEWED_DIAGNOSTIC_RUN_ID,env.REVIEWED_DIAGNOSTIC_SHA256,run);
      await writeFile(approvedPath,JSON.stringify(approved),{flag:'wx',mode:0o600});
    } else must(!env.REVIEWED_DIAGNOSTIC_RUN_ID && !env.REVIEWED_DIAGNOSTIC_SHA256,'Diagnostic must not borrow a prior receipt');
    return;
  }
  let approved=null;
  if(selected==='release'){
    const raw=await readFile(approvedPath,'utf8');
    must(hash(raw)===env.REVIEWED_DIAGNOSTIC_SHA256,'Approved receipt file changed');
    approved=checkReceipt(JSON.parse(raw),run);
    must(approved.runId===env.REVIEWED_DIAGNOSTIC_RUN_ID,'Approved receipt run changed');
  }
  must(Boolean(env.SUPABASE_ACCESS_TOKEN),'Management identity missing');
  const source=resolve('release-source'), rollback=resolve('rollback-source');
  const root=await mkdtemp(join(env.RUNNER_TEMP,'release371-')); const dirs=new Map();
  const cli=(cwd,args)=>{try{execFileSync('npx',['--offline','--cache',env.CLI_CACHE,'--yes','--package','supabase@2.122.0','--','supabase',...args],{cwd,stdio:'ignore',timeout:180000});}catch{throw new Stop('CLI outcome may be uncertain; inspect before any retry');}};
  const metadata=async()=>{const response=await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/functions/${TARGET}`,{headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`},redirect:'error',signal:AbortSignal.timeout(20000)});must(response.ok,'Metadata unavailable');return response.json();};
  const ts=(await import(pathToFileURL(resolve(env.PROOF_TYPESCRIPT)).href)).default;
  try {
    const ops={metadata,
      verifySource:async()=>{
        const git=(dir,args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8'}).trim();
        must(git(resolve('.'),['rev-parse',`HEAD:supabase/functions/${TARGET}`]) === EDGE_TREE,'Control commit changed runtime');
        for(const [dir,commit,tree] of [[source,SOURCE,EDGE_TREE],[rollback,ROLLBACK_SOURCE,ROLLBACK_TREE]]){
          must(git(dir,['rev-parse','HEAD'])===commit && git(dir,['rev-parse',`HEAD:supabase/functions/${TARGET}`])===tree && git(dir,['status','--porcelain','--untracked-files=all'])==='','Wrong or dirty pinned source');
          must(await readFile(join(dir,'supabase/config.toml'),'utf8')===CONFIG,'Deployment configuration differs');
        }
        must((await fingerprint(join(source,'supabase/functions',TARGET))).hash===FULL.release && (await fingerprint(join(rollback,'supabase/functions',TARGET))).hash===FULL.rollback,'Pinned fingerprint differs');
      },
      capture:async(name,kind)=>{
        await ops.verifySource(); const reference=kind==='release'?source:rollback;
        const raw=join(root,name); await mkdir(join(raw,'supabase'),{recursive:true}); await cp(join(reference,'supabase/config.toml'),join(raw,'supabase/config.toml'));
        cli(raw,['functions','download',TARGET,'--project-ref',PROJECT,'--use-api']);
        // Only known source paths are printed; unknown names become hashes.
        const inventory=await diagnosticInventory(raw); const known=await diagnosticInventory(join(reference,'supabase/functions',TARGET));
        const allowed=new Set(['supabase','supabase/config.toml','supabase/functions',`supabase/functions/${TARGET}`,'supabase/.temp','supabase/.temp/cli-latest','supabase/.temp/linked-project.json',...known.entries.map(e=>`supabase/functions/${TARGET}/${e.path}`)]);
        console.log(JSON.stringify({phase:'capture-inventory',capture:name,fileCount:inventory.fileCount,entries:inventory.entries.map(e=>({...e,path:allowed.has(e.path)?e.path:`unknown-sha256:${hash(e.path)}`}))}));
        const clean=join(root,`${name}-clean`); const p=proof(await reconstructCapture(raw,reference,clean,ts),kind); dirs.set(name,clean);
        console.log(JSON.stringify({phase:'capture-proof',capture:name,...p.evidence})); return p;
      },
      deploy:async kind=>{must(selected==='release','Diagnostic cannot deploy');console.log(`phase: deploy-${kind}`);cli(kind==='release'?source:dirs.get('first'),['functions','deploy',TARGET,'--project-ref',PROJECT,'--use-api']);},
      health:()=>healthProbe(),
    };
    if(selected==='diagnose'){
      // Capability restriction: diagnose receives no deploy or health operation.
      const result=await diagnose({metadata:ops.metadata,verifySource:ops.verifySource,capture:ops.capture},run);
      const raw=JSON.stringify(result.receipt);console.log(MARKER+raw);console.log(JSON.stringify({state:result.state,deploymentAttempted:false,receiptSha256:hash(raw)}));
    }else{const result=await release(ops,approved,run);console.log(JSON.stringify(result));must(result.state==='released','Verified rollback completed; release failed');}
  }finally{await rm(root,{recursive:true,force:true});await rm(approvedPath,{force:true});}
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){main().catch(error=>{console.error(error instanceof Stop ? `PR371 stopped: ${error.message}` : 'PR371 stopped. Inspect safe phase/metadata; no uncertain retry or blind rollback.');process.exitCode=1;});}
