import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm, mkdir, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { release, TARGET, BASELINE, fingerprint, downloadedFingerprint, diagnosticInventory, executionMode, diagnose } from './release-pr367.mjs';
const meta = (version = 280, overrides = {}) => ({ slug: TARGET, name: TARGET, id: '9defb252-5ea2-463b-b91b-497e0a7fe582', import_map: false, entrypoint_path: `file:///tmp/user_fn_ywhtjwawnkeqlwxbvgup_9defb252-5ea2-463b-b91b-497e0a7fe582_${version}/source/supabase/functions/${TARGET}/index.ts`, version, status: 'ACTIVE', verify_jwt: false, ezbr_sha256: version === 280 ? BASELINE.hash : 'a'.repeat(64), ...overrides });
function harness({ metadata = [meta(), meta(), meta(), meta(281), meta(281)], health = [true], capture, deploy } = {}) {
  const calls = []; let reads = 0; let checks = 0;
  return { calls, ops: {
    metadata: async () => { calls.push('metadata'); assert.ok(reads < metadata.length); return metadata[reads++]; },
    capture: async (name) => { calls.push(`capture:${name}`); return capture ? capture(name) : { count: 2, hash: 'b'.repeat(64) }; },
    verifySource: async () => { calls.push('source'); return { count: 2, hash: 'b'.repeat(64) }; },
    deploy: async (kind) => { calls.push(`deploy:${kind}`); if (deploy) await deploy(kind); },
    health: async () => { calls.push('health'); assert.ok(checks < health.length); return health[checks++]; },
  } };
}
test('two matching captures and stable baseline precede one fixed release', async () => {
  const { calls, ops } = harness(); assert.equal((await release(ops)).state, 'released');
  assert.deepEqual(calls, ['metadata', 'capture:first', 'capture:second', 'metadata', 'source', 'metadata', 'deploy:release', 'metadata', 'health', 'metadata']);
});
for (const overrides of [{version:281}, {verify_jwt:true}, {slug:'another-target'}, {status:'FAILED'}, {ezbr_sha256:null}, {import_map:true}, {entrypoint_path:'other.ts'}]) {
  test(`rejects changed/invalid baseline ${JSON.stringify(overrides)}`, async () => {
    const {calls, ops} = harness({metadata:[meta(280, overrides)]}); await assert.rejects(release(ops));
    assert.deepEqual(calls, ['metadata']);
  });
}
test('mismatched captures never deploy', async () => {
  const {calls, ops} = harness({capture: name => ({count:2, hash:name})}); await assert.rejects(release(ops), /captures differ/);
  assert.ok(!calls.includes('deploy:release'));
});
test('baseline changing during capture never deploys', async () => {
  const {calls, ops} = harness({metadata:[meta(),meta(281)]}); await assert.rejects(release(ops), /during capture/);
  assert.ok(!calls.includes('deploy:release'));
});
test('uncertain CLI failure never retries or blindly restores', async () => {
  const {calls, ops} = harness({deploy:()=>{throw Error('simulated uncertain outcome');}}); await assert.rejects(release(ops));
  assert.equal(calls.filter(c=>c.startsWith('deploy:')).length,1);
});
for (const overrides of [{version:283}, {ezbr_sha256:BASELINE.hash}, {slug:'wrong'}]) {
  test(`unexpected postdeploy state stops without blind rollback ${JSON.stringify(overrides)}`, async () => {
    const {calls,ops}=harness({metadata:[meta(),meta(),meta(),meta(281,overrides)]}); await assert.rejects(release(ops)); assert.ok(calls.includes('deploy:release')); assert.ok(!calls.includes('deploy:rollback'));
  });
}
for (const releaseMeta of [meta(281),meta(281,{verify_jwt:true}),meta(281,{status:'FAILED'})]) {
  test(`known release smoke/config failure restores both source and config ${releaseMeta.status}/${releaseMeta.verify_jwt}`, async () => {
    const {calls,ops}=harness({metadata:[meta(),meta(),meta(),releaseMeta,releaseMeta,meta(282),meta(282)],health:releaseMeta.verify_jwt || releaseMeta.status!=='ACTIVE' ? [true] : [false,true]});
    assert.equal((await release(ops)).state,'rolled-back'); assert.ok(calls.includes('deploy:rollback')); assert.ok(calls.includes('capture:restored'));
  });
}
test('concurrent deployment prevents restoring over another owner', async () => {
  const {calls,ops}=harness({metadata:[meta(),meta(),meta(),meta(281),meta(282)],health:[false]}); await assert.rejects(release(ops), /before rollback/); assert.ok(!calls.includes('deploy:rollback'));
});
test('restored source mismatch remains a failure', async () => {
  const {ops}=harness({metadata:[meta(),meta(),meta(),meta(281),meta(281),meta(282)],health:[false,true],capture:name=>({count:2,hash:name==='restored'?'wrong':'b'.repeat(64)})}); await assert.rejects(release(ops),/Restored source differs/);
});
test('fingerprints ignore filesystem creation order and reject missing entrypoint/symlinks', async () => {
  const dir=await mkdtemp(join(tmpdir(),'release367-test-'));
  try { await assert.rejects(fingerprint(dir), /entrypoint/); await writeFile(join(dir,'index.ts'),'synthetic'); const first=await fingerprint(dir); assert.equal(first.count,1); assert.equal((await fingerprint(dir)).hash,first.hash); await symlink('/unread-target',join(dir,'bad')); await assert.rejects(fingerprint(dir), /symlink/); } finally { await rm(dir,{recursive:true,force:true}); }
});
test('rollback CLI failure is terminal without another mutation', async () => {
  const {calls,ops}=harness({metadata:[meta(),meta(),meta(),meta(281),meta(281)],health:[false],deploy:kind=>{if(kind==='rollback')throw Error('rollback failed');}});
  await assert.rejects(release(ops)); assert.equal(calls.filter(c=>c.startsWith('deploy:')).length,2);
});
test('restored unhealthy service and concurrent restoration verification both fail', async () => {
  const a=harness({metadata:[meta(),meta(),meta(),meta(281),meta(281),meta(282)],health:[false,false]}); await assert.rejects(release(a.ops),/Rollback verification failed/);
  const b=harness({metadata:[meta(),meta(),meta(),meta(281),meta(281),meta(282),meta(283)],health:[false,true]}); await assert.rejects(release(b.ops),/during rollback verification/);
});

test('deployment changed during a healthy smoke cannot be reported successful', async () => {
  const {calls,ops}=harness({metadata:[meta(),meta(),meta(),meta(281),meta(282)],health:[true]}); await assert.rejects(release(ops),/during smoke/); assert.ok(!calls.includes('deploy:rollback'));
});

test('deployment changing during source verification aborts before mutation', async () => {
  const {calls,ops}=harness({metadata:[meta(),meta(),meta(281)]}); await assert.rejects(release(ops),/before release/); assert.ok(!calls.includes('deploy:release'));
});

for (const proof of [undefined, { count: 2, hash: 'c'.repeat(64) }, { count: 3, hash: 'b'.repeat(64) }, { count: 0, hash: 'b'.repeat(64) }]) {
  test(`matching captures without exact pinned Git proof cannot deploy ${JSON.stringify(proof)}`, async () => {
    const {calls,ops}=harness(); ops.verifySource=async()=>proof; await assert.rejects(release(ops), /pinned Git/); assert.ok(!calls.includes('deploy:release'));
  });
}
for (const overrides of [{name:'wrong-name'}, {id:'wrong-id'}, {entrypoint_path:'file:///other/supabase/functions/make-server-1ccce916/index.ts'}, {entrypoint_path:'file:///tmp/user_fn_ywhtjwawnkeqlwxbvgup_9defb252-5ea2-463b-b91b-497e0a7fe582_279/source/supabase/functions/make-server-1ccce916/index.ts'}]) {
  test(`metadata normalization rejects changed config/prefix ${JSON.stringify(overrides)}`, async () => {
    const {calls,ops}=harness({metadata:[meta(280,overrides)]}); await assert.rejects(release(ops)); assert.deepEqual(calls,['metadata']);
  });
}
test('complete source manifest rejects extra/missing/renamed/byte-changed entries and config/wrapper drift', async () => {
  const root=await mkdtemp(join(tmpdir(),'release367-manifest-'));
  const fn=join(root,'supabase/functions',TARGET);
  try {
    await mkdir(fn,{recursive:true}); await writeFile(join(fn,'index.ts'),'synthetic\n'); await writeFile(join(root,'supabase/config.toml'),'# Minimal config for Edge Function deployment\n\n[functions.make-server-1ccce916]\nverify_jwt = false\n');
    const baseline=await downloadedFingerprint(root); assert.equal(baseline.count,1);
    await writeFile(join(fn,'extra.ts'),'extra'); assert.notEqual((await downloadedFingerprint(root)).hash,baseline.hash); await rm(join(fn,'extra.ts'));
    await writeFile(join(fn,'index.ts'),'synthetic\r\n'); assert.notEqual((await downloadedFingerprint(root)).hash,baseline.hash); await writeFile(join(fn,'index.ts'),'synthetic\n');
    await writeFile(join(root,'supabase/config.toml'),'verify_jwt = true\n'); await assert.rejects(downloadedFingerprint(root),/config changed/); await writeFile(join(root,'supabase/config.toml'),'# Minimal config for Edge Function deployment\n\n[functions.make-server-1ccce916]\nverify_jwt = false\n');
    await mkdir(join(fn,'extra-empty')); assert.notEqual((await downloadedFingerprint(root)).hash,baseline.hash); await rm(join(fn,'extra-empty'),{recursive:true});
    await rename(join(fn,'index.ts'),join(fn,'Index.ts')); await assert.rejects(downloadedFingerprint(root),/entrypoint/); await rename(join(fn,'Index.ts'),join(fn,'index.ts'));
    await writeFile(join(fn,'ambiguous\npath.ts'),'x'); await assert.rejects(downloadedFingerprint(root),/Ambiguous/); await rm(join(fn,'ambiguous\npath.ts'));
    assert.deepEqual(await downloadedFingerprint(root),baseline);
    await writeFile(join(root,'outside.txt'),'unexpected'); await assert.rejects(downloadedFingerprint(root),/wrapper/); await rm(join(root,'outside.txt'));
    await mkdir(join(root,'other-wrapper')); await assert.rejects(downloadedFingerprint(root),/wrapper/);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('diagnostic and release require distinct explicit mode confirmations', () => {
  assert.equal(executionMode('diagnose','DIAGNOSE_PR367_LAYOUT_ONLY'),'diagnose');
  assert.equal(executionMode('release','DEPLOY_PR367_WITH_VERIFIED_GIT_ROLLBACK'),'release');
  for (const [mode,confirmation] of [[undefined,undefined],['diagnose','DEPLOY_PR367_WITH_VERIFIED_GIT_ROLLBACK'],['release','DIAGNOSE_PR367_LAYOUT_ONLY'],['unknown','DIAGNOSE_PR367_LAYOUT_ONLY']]) assert.throws(()=>executionMode(mode,confirmation));
});
function diagnosticHarness({changed=false,layoutError=false}={}) {
  const calls=[]; let reads=0;
  return {calls,ops:{
    metadata:async()=>{calls.push('metadata');return meta(changed && reads++>0?281:280);},
    verifySource:async()=>{calls.push('git');return {count:82,hash:'b'.repeat(64)};},
    download:async()=>{calls.push('download');return 'isolated-capture';},
    inventory:async()=>{calls.push('inventory');return {fileCount:1,entries:[{path:'supabase/.temp/linked-project.json',type:'file',sha256:'a'.repeat(64)}]};},
    strictFingerprint:async()=>{calls.push('strict');if(layoutError)throw Error('UNSAFE BODY SENTINEL');return {count:82,hash:'b'.repeat(64)};},
    deploy:async()=>{throw Error('FORBIDDEN DEPLOY');},health:async()=>{throw Error('FORBIDDEN HEALTH');},
  }};
}
test('diagnostic reports layout failure without calling deploy, rollback or health', async () => {
  const {calls,ops}=diagnosticHarness({layoutError:true});const result=await diagnose(ops);assert.equal(result.state,'diagnostic-only');assert.equal(result.deploymentAttempted,false);assert.equal(result.layout.passed,false);assert.equal(result.gitEquivalent,null);assert.ok(!JSON.stringify(result).includes('UNSAFE BODY SENTINEL'));
  assert.deepEqual(calls,['metadata','git','download','inventory','strict','metadata']);
});
test('successful diagnostic is still diagnostic-only and uses the strict gate', async () => {
  const {ops}=diagnosticHarness();const result=await diagnose(ops);assert.equal(result.state,'diagnostic-only');assert.equal(result.layout.passed,true);assert.equal(result.gitEquivalent,true);assert.equal(result.deploymentAttempted,false);
});
test('diagnostic rejects concurrent baseline changes and initial wrong baseline', async () => {
  const changed=diagnosticHarness({changed:true});await assert.rejects(diagnose(changed.ops),/during diagnostic/);
  const initial=diagnosticHarness();initial.ops.metadata=async()=>meta(281);await assert.rejects(diagnose(initial.ops),/Baseline changed/);assert.deepEqual(initial.calls,[]);
});
test('download errors stop diagnostic without a deployment fallback', async () => {
  const {ops}=diagnosticHarness();ops.download=async()=>{throw Error('download failed');};await assert.rejects(diagnose(ops),/download failed/);
});
test('inventory exposes only relative metadata, redacts token-like names and never follows symlinks', async () => {
  const root=await mkdtemp(join(tmpdir(),'release367-inventory-'));
  try {
    await mkdir(join(root,'supabase/.temp'),{recursive:true});await writeFile(join(root,'supabase/.temp/linked-project.json'),'PRIVATE CONTENT SENTINEL');await writeFile(join(root,'FAKE-TOKEN-SENTINEL'),'PRIVATE BODY SENTINEL');await symlink('/unread-private-target',join(root,'link'));
    const report=await diagnosticInventory(root,['FAKE-TOKEN-SENTINEL']);const text=JSON.stringify(report);assert.equal(report.fileCount,2);assert.ok(text.includes('supabase/.temp/linked-project.json'));assert.ok(text.includes('[redacted]'));assert.ok(!text.includes('PRIVATE CONTENT SENTINEL'));assert.ok(!text.includes('PRIVATE BODY SENTINEL'));assert.ok(!text.includes('FAKE-TOKEN-SENTINEL'));assert.ok(!text.includes('/unread-private-target'));assert.equal(report.entries.find(e=>e.path==='link').type,'symlink');
    for(const entry of report.entries)assert.ok(Object.keys(entry).every(k=>['path','type','bytes','sha256'].includes(k)));
    await assert.rejects(downloadedFingerprint(root),/wrapper/);
  } finally {await rm(root,{recursive:true,force:true});}
});

test('diagnostic never labels a different downloaded source as Git-equivalent', async () => {
  const {ops}=diagnosticHarness();ops.strictFingerprint=async()=>({count:82,hash:'c'.repeat(64)});const result=await diagnose(ops);assert.equal(result.gitEquivalent,false);assert.equal(result.state,'diagnostic-only');assert.equal(result.deploymentAttempted,false);
});
