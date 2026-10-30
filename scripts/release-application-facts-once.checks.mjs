// Synthetic only. No main(), credentials, network or CLI execution.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, cp, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { candidate, invocation, release, healthProbe, BASELINE, ROLLBACK, APPROVED, requirePinnedSource } from './release-application-facts-once.mjs';
import { OMITTED, validateRawInventory, proveTypeOnly } from './release-application-facts-capture.mjs';
import { fingerprint, diagnosticInventory, DEPLOY_CONFIG } from './release-faithfulness-proof.mjs';
const pins={source:'a'.repeat(40),edgeTree:'b'.repeat(40),fingerprint:'c'.repeat(64)};
const fn='make-server-1ccce916', project='ywhtjwawnkeqlwxbvgup', id='9defb252-5ea2-463b-b91b-497e0a7fe582';
const meta=(changes={})=> {
  const m={slug:fn,name:fn,id,version:283,ezbr_sha256:BASELINE.hash,status:'ACTIVE',verify_jwt:false,import_map:false,updated_at:BASELINE.updatedAt,...changes};
  m.entrypoint_path=`file:///tmp/user_fn_${project}_${id}_${m.version}/source/supabase/functions/${fn}/index.ts`;
  return m;
};
const deployed=()=>meta({version:284,ezbr_sha256:'d'.repeat(64),updated_at:BASELINE.updatedAt+1});
function capture(kind) {
  const rollback=kind==='rollback', count=rollback?83:84, hash=rollback?ROLLBACK.full:pins.fingerprint;
  return {fingerprint:{count,hash},evidence:{native:{count:count-2,hash:rollback?ROLLBACK.native:'f'.repeat(64)},
    reconstructed:{count,hash,restoredFromGit:Object.keys(OMITTED)},typeProof:{typeScriptVersion:'5.9.3',emitsOnlyEmptyModules:true}}};
}
function fixture(sequence=[meta(),meta(),meta(),deployed(),deployed()]) {
  const calls=[];
  const ops={metadata:async()=>{calls.push('metadata'); assert.ok(sequence.length,'Unexpected metadata query');return sequence.shift();},
    verifySource:async()=>{calls.push('verifySource');},
    capture:async(name,kind)=>{calls.push('capture:'+name);return capture(kind);},
    deploy:async kind=>{calls.push('deploy:'+kind);},health:async()=>true};
  return {ops,calls};
}
test('unfrozen candidate stops before all I/O',async()=>{const f=fixture();await assert.rejects(release(f.ops,{source:null,edgeTree:null,fingerprint:null}),/not frozen/);assert.deepEqual(f.calls,[]);});
test('manual main first attempt and explicit exclusive window are mandatory',()=>{
  const env={GITHUB_REPOSITORY:'sforero94/Escociaos',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ID:'10',EXCLUSIVE_BACKEND_WINDOW:'true',RELEASE_CONFIRMATION:'DEPLOY_APPROVED_APPLICATION_FACTS_WITH_V283_ROLLBACK'};
  invocation(env); candidate(pins);
  for(const change of [{GITHUB_REF:'refs/heads/other'},{GITHUB_RUN_ATTEMPT:'2'},{GITHUB_EVENT_NAME:'push'},{EXCLUSIVE_BACKEND_WINDOW:'false'},{RELEASE_CONFIRMATION:''}]) assert.throws(()=>invocation({...env,...change}));
});
test('healthy owned release requires two v283 captures and candidate post-capture',async()=>{
  const f=fixture(); assert.equal((await release(f.ops,pins)).state,'released');
  assert.deepEqual(f.calls.filter(c=>c.startsWith('capture:')),['capture:first','capture:second','capture:deployed']);
  assert.deepEqual(f.calls.filter(c=>c.startsWith('deploy:')),['deploy:release']);
});
for(const [name,change] of [['version',{version:284}],['bundle',{ezbr_sha256:'0'.repeat(64)}],['JWT',{verify_jwt:true}],['map',{import_map:true}],['time',{updated_at:BASELINE.updatedAt+1}]]) {
  test(`baseline ${name} drift cannot deploy`,async()=>{const f=fixture([meta(change)]);await assert.rejects(release(f.ops,pins));assert.ok(!f.calls.some(c=>c.startsWith('deploy:')));});
}
test('missing or changed raw proof cannot deploy',async()=>{
  for(const change of [p=>delete p.evidence.native,p=>p.evidence.native.hash='e'.repeat(64),p=>p.evidence.typeProof.emitsOnlyEmptyModules=false]) {
    const f=fixture();f.ops.capture=async()=>{const p=capture('rollback');change(p);return p;};
    await assert.rejects(release(f.ops,pins));assert.ok(!f.calls.some(c=>c.startsWith('deploy:')));
  }
});
test('immediate pre-deploy movement stops without mutation',async()=>{
  const f=fixture([meta(),meta(),deployed()]);await assert.rejects(release(f.ops,pins));assert.ok(!f.calls.some(c=>c.startsWith('deploy:')));
});
test('dirty or wrong source cannot deploy',async()=>{
  const f=fixture();f.ops.verifySource=async()=>{throw Error('source mismatch');};
  await assert.rejects(release(f.ops,pins));assert.ok(!f.calls.some(c=>c.startsWith('deploy:')));
});
test('uncertain CLI outcome never retries or rolls back',async()=>{
  const f=fixture();f.ops.deploy=async kind=>{f.calls.push('deploy:'+kind);throw Error('uncertain');};
  await assert.rejects(release(f.ops,pins));assert.deepEqual(f.calls.filter(c=>c.startsWith('deploy:')),['deploy:release']);
});
test('lost ownership or pending status cannot authorize rollback',async()=>{
  for(const changed of [deployed(),meta({version:284,ezbr_sha256:'e'.repeat(64),updated_at:BASELINE.updatedAt+2}),meta({...deployed(),status:'DEPLOYING'})]) {
    const f=fixture([meta(),meta(),meta(),changed]); f.ops.health=async()=>{throw Error('unknown');};
    await assert.rejects(release(f.ops,pins)); assert.deepEqual(f.calls.filter(c=>c.startsWith('deploy:')),['deploy:release']);
  }
});
test('post-deploy source mismatch is uncertainty, not blind rollback permission',async()=>{
  const f=fixture();f.ops.capture=async(name,kind)=>{const p=capture(kind);if(name==='deployed')p.fingerprint.hash='0'.repeat(64);return p;};
  await assert.rejects(release(f.ops,pins));assert.deepEqual(f.calls.filter(c=>c.startsWith('deploy:')),['deploy:release']);
});
test('confirmed bad health rolls back once only while ownership remains stable',async()=>{
  const bad=deployed(), restored=meta({version:285,ezbr_sha256:'e'.repeat(64),updated_at:BASELINE.updatedAt+2});
  const f=fixture([meta(),meta(),meta(),bad,bad,restored,restored]);let probes=0;f.ops.health=async()=>++probes>1;
  assert.equal((await release(f.ops,pins)).state,'rolled-back');
  assert.deepEqual(f.calls.filter(c=>c.startsWith('deploy:')),['deploy:release','deploy:rollback']);
});
test('ownership loss immediately before rollback stops',async()=>{
  const f=fixture([meta(),meta(),meta(),deployed(),meta({version:284})]);f.ops.health=async()=>false;
  await assert.rejects(release(f.ops,pins));assert.deepEqual(f.calls.filter(c=>c.startsWith('deploy:')),['deploy:release']);
});
test('failed rollback is not retried',async()=>{
  const bad=deployed();const f=fixture([meta(),meta(),meta(),bad,bad]);f.ops.health=async()=>false;
  f.ops.deploy=async kind=>{f.calls.push('deploy:'+kind);if(kind==='rollback')throw Error('uncertain rollback');};
  await assert.rejects(release(f.ops,pins));assert.deepEqual(f.calls.filter(c=>c.startsWith('deploy:')),['deploy:release','deploy:rollback']);
});
test('health transport/redirect uncertainty is not confirmed failure',async()=>{
  await assert.rejects(healthProbe(async()=>{throw Error('network');},async()=>{}),/uncertain/);
  assert.equal(await healthProbe(async()=>new Response('bad',{status:503}),async()=>{}),false);
  assert.equal(await healthProbe(async()=>Response.json({status:'ok'}),async()=>{}),true);
});
test('unknown raw wrapper/cache/symlink shape is rejected',()=>{
  for(const entry of [{path:'unknown',type:'file',bytes:0,sha256:'a'.repeat(64)},{path:'supabase/.temp/other',type:'symlink'}])
    assert.throws(()=>validateRawInventory({entries:[entry]},{fileCount:82,entries:[]},Buffer.from('config')));
});
test('workflow has manual trigger, read-only contents and one step-scoped management secret',async()=>{
  const w=await readFile(new URL('../.github/workflows/release-application-facts-once.yml',import.meta.url),'utf8');
  assert.equal((w.match(/secrets\.SUPABASE_ACCESS_TOKEN/g)||[]).length,1);
  assert.ok(w.includes('workflow_dispatch:') && w.includes('contents: read'));
  for(const forbidden of ['actions: read','github.token','secrets.GITHUB_TOKEN','push:','schedule:','pull_request:']) assert.ok(!w.includes(forbidden));
  assert.ok(w.indexOf('Reject unfrozen source')<w.indexOf('secrets.SUPABASE_ACCESS_TOKEN'));
  assert.ok(w.includes('source_sha="$(node') && w.includes('set -euo pipefail'));
});
const sha=value=>createHash('sha256').update(value).digest('hex');
const config=Buffer.from('synthetic config');
const sourceInventory={fileCount:83,entries:[{path:'index.ts',type:'file',bytes:1,sha256:sha('x')},
  ...Object.entries(OMITTED).map(([path,sha256])=>({path,type:'file',bytes:10,sha256})),...Array.from({length:80},(_,i)=>({path:'synthetic-'+i+'.ts',type:'file',bytes:1,sha256:sha('x')}))]};
function rawInventory() {
  return {entries:[...['supabase','supabase/functions',`supabase/functions/${fn}`,'supabase/.temp'].map(path=>({path,type:'directory'})),
    {path:'supabase/config.toml',type:'file',bytes:config.length,sha256:sha(config)},
    ...sourceInventory.entries.filter(e=>!Object.hasOwn(OMITTED,e.path)).map(e=>({...e,path:`supabase/functions/${fn}/`+e.path})),
    {path:'supabase/.temp/cli-latest',type:'file',bytes:8,sha256:sha('v2.122.0')},
    {path:'supabase/.temp/linked-project.json',type:'file',bytes:134,sha256:'5afb37cef5be9eb93a709f9a1769352d325098f5dc58bdf706563d6a6110a302'}]};
}
test('only exact known raw/source/cache inventory passes',()=>validateRawInventory(rawInventory(),sourceInventory,config));
for(const mutation of ['extra-file','missing-source','missing-cache','changed-source','changed-cache','symlink','config','omitted-present']) {
  test(`raw capture rejects ${mutation}`,()=>{
    const raw=rawInventory(), entry=raw.entries.find(e=>e.path.endsWith('/index.ts')), cache=raw.entries.find(e=>e.path.endsWith('/linked-project.json'));
    if(mutation==='extra-file')raw.entries.push({path:'unknown',type:'file',bytes:0,sha256:sha('')});
    if(mutation==='missing-source')raw.entries=raw.entries.filter(e=>e!==entry);
    if(mutation==='missing-cache')raw.entries=raw.entries.filter(e=>e!==cache);
    if(mutation==='changed-source')entry.sha256=sha('changed');
    if(mutation==='changed-cache')cache.sha256=sha('changed');
    if(mutation==='symlink')entry.type='symlink';
    if(mutation==='config')raw.entries.find(e=>e.path.endsWith('config.toml')).sha256=sha('changed');
    if(mutation==='omitted-present')raw.entries.push({path:`supabase/functions/${fn}/telegram/types.ts`,type:'file',bytes:10,sha256:OMITTED['telegram/types.ts']});
    assert.throws(()=>validateRawInventory(raw,sourceInventory,config));
  });
}
const ts=(await import(pathToFileURL(resolve(process.env.PROOF_TYPESCRIPT || 'node_modules/typescript/lib/typescript.js')).href)).default;
const baseline=resolve(process.env.RELEASE_TEST_BASELINE || `supabase/functions/${fn}`);
test('complete pinned Git inventory83 or84 passes exact synthetic layout; wrong counts do not',async()=>{
  const inventory=await diagnosticInventory(baseline),seed=Buffer.from(DEPLOY_CONFIG),prefix=`supabase/functions/${fn}/`;
  assert.ok([83,84].includes(inventory.fileCount));
  const raw={entries:[...['supabase','supabase/functions',`supabase/functions/${fn}`,'supabase/.temp'].map(path=>({path,type:'directory'})),
    {path:'supabase/config.toml',type:'file',bytes:seed.length,sha256:sha(seed)},
    ...inventory.entries.filter(e=>!Object.hasOwn(OMITTED,e.path)).map(e=>({...e,path:prefix+e.path})),
    {path:'supabase/.temp/cli-latest',type:'file',bytes:8,sha256:sha('v2.122.0')},
    {path:'supabase/.temp/linked-project.json',type:'file',bytes:134,sha256:'5afb37cef5be9eb93a709f9a1769352d325098f5dc58bdf706563d6a6110a302'}]};
  validateRawInventory(raw,inventory,seed);
  for(const count of [82,85,inventory.fileCount-1,inventory.fileCount+1])assert.throws(()=>validateRawInventory(raw,{...inventory,fileCount:count},seed));
});
test('release still rejects an unapproved current runtime; explicit rollback checkout must match its immutable source',async()=>{
  const observed=await fingerprint(baseline);
  if(process.env.RELEASE_TEST_BASELINE) {
    assert.deepEqual(observed,{count:83,hash:ROLLBACK.full});
    requirePinnedSource(observed,ROLLBACK.full);
  } else if(observed.hash===APPROVED.fingerprint) requirePinnedSource(observed,APPROVED.fingerprint);
  else assert.throws(()=>requirePinnedSource(observed,APPROVED.fingerprint),{message:'Pinned source differs'});
  assert.doesNotThrow(()=>requirePinnedSource({count:84,hash:APPROVED.fingerprint},APPROVED.fingerprint));
  assert.throws(()=>requirePinnedSource({count:83,hash:'not-a-hash'},APPROVED.fingerprint),{message:'Invalid source fingerprint'});
  const p=await proveTypeOnly(baseline,ts);
  assert.equal(p.emitsOnlyEmptyModules,true);
  assert.equal(p.references['importHato/tipos.ts'].length,10);assert.equal(p.references['telegram/types.ts'].length,8);
});
for(const mutation of ['runtime-import','changed-omission','symlink','malformed']) {
  test(`type-only reconstruction rejects ${mutation}`,async()=>{
    const root=await mkdtemp(join(tmpdir(),'faithfulness-proof-'));
    try {
      await cp(baseline,root,{recursive:true});
      if(mutation==='runtime-import')await writeFile(join(root,'index.ts'),"import { BotContext } from './telegram/types.ts';");
      if(mutation==='changed-omission')await writeFile(join(root,'telegram/types.ts'),'export const unsafe = 1;');
      if(mutation==='symlink')await symlink('/unread-private',join(root,'unexpected.ts'));
      if(mutation==='malformed')await writeFile(join(root,'index.ts'),'export interface {');
      await assert.rejects(proveTypeOnly(root,ts));
    } finally {await rm(root,{recursive:true,force:true});}
  });
}
