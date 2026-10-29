import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { release, TARGET, BASELINE, fingerprint } from './release-pr367.mjs';
const meta = (version = 280, overrides = {}) => ({ slug: TARGET, import_map: false, entrypoint_path: `/source/supabase/functions/${TARGET}/index.ts`, version, status: 'ACTIVE', verify_jwt: false, ezbr_sha256: version === 280 ? BASELINE.hash : 'a'.repeat(64), ...overrides });
function harness({ metadata = [meta(), meta(), meta(), meta(281), meta(281)], health = [true], capture, deploy } = {}) {
  const calls = []; let reads = 0; let checks = 0;
  return { calls, ops: {
    metadata: async () => { calls.push('metadata'); assert.ok(reads < metadata.length); return metadata[reads++]; },
    capture: async (name) => { calls.push(`capture:${name}`); return capture ? capture(name) : { count: 2, hash: 'safe-fingerprint' }; },
    verifySource: async () => { calls.push('source'); },
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
  const {ops}=harness({metadata:[meta(),meta(),meta(),meta(281),meta(281),meta(282)],health:[false,true],capture:name=>({count:2,hash:name==='restored'?'wrong':'same'})}); await assert.rejects(release(ops),/Restored source differs/);
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
