import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm, readFile, writeFile, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { OMITTED, proveTypeOnly, validateRawInventory, reconstructCapture } from './release-pr367-capture.mjs';
import { TARGET, diagnosticInventory, fingerprint, release } from './release-pr367.mjs';
const ts = (await import(pathToFileURL(resolve(process.env.PROOF_TYPESCRIPT || 'node_modules/typescript/lib/typescript.js')).href)).default;
const pinned = resolve(process.env.PR367_TEST_ROLLBACK || 'supabase/functions', TARGET);
const sha = value => createHash('sha256').update(value).digest('hex');
const config = Buffer.from('synthetic config');
const git = { fileCount: 82, entries: [
  { path: 'index.ts', type: 'file', bytes: 1, sha256: sha('x') },
  ...Object.entries(OMITTED).map(([path, sha256]) => ({ path, type: 'file', bytes: 10, sha256 })),
] };
function rawInventory() {
  return { entries: [
    ...['supabase', 'supabase/functions', `supabase/functions/${TARGET}`, 'supabase/.temp'].map(path => ({ path, type: 'directory' })),
    { path: 'supabase/config.toml', type: 'file', bytes: config.length, sha256: sha(config) },
    { path: `supabase/functions/${TARGET}/index.ts`, type: 'file', bytes: 1, sha256: sha('x') },
    { path: 'supabase/.temp/cli-latest', type: 'file', bytes: 8, sha256: sha('v2.122.0') },
    { path: 'supabase/.temp/linked-project.json', type: 'file', bytes: 134, sha256: '5afb37cef5be9eb93a709f9a1769352d325098f5dc58bdf706563d6a6110a302' },
  ] };
}
test('exact observed cache metadata and native source inventory accepted; order irrelevant', () => {
  validateRawInventory(rawInventory(), git, config);
  const reversed = rawInventory(); reversed.entries.reverse(); validateRawInventory(reversed, git, config);
});
for (const mutation of ['extra-file','extra-directory','missing-source','missing-cache','renamed','changed-source','changed-cache','cache-size','cache-symlink','cache-directory','source-symlink','config','unsafe-path','omitted-present']) {
  test(`raw proof rejects ${mutation}`, () => {
    const raw = rawInventory(); const source = raw.entries.find(e => e.path.endsWith('/index.ts'));
    const cache = raw.entries.find(e => e.path.endsWith('/linked-project.json'));
    if (mutation === 'extra-file') raw.entries.push({path:'extra',type:'file',bytes:0,sha256:sha('')});
    if (mutation === 'extra-directory') raw.entries.push({path:'supabase/.temp/extra',type:'directory'});
    if (mutation === 'missing-source') raw.entries = raw.entries.filter(e => e !== source);
    if (mutation === 'missing-cache') raw.entries = raw.entries.filter(e => e !== cache);
    if (mutation === 'renamed') source.path = source.path.replace('index.ts','Index.ts');
    if (mutation === 'changed-source') source.sha256 = sha('y');
    if (mutation === 'changed-cache') cache.sha256 = sha('unknown');
    if (mutation === 'cache-size') cache.bytes++;
    if (mutation === 'cache-symlink') cache.type = 'symlink';
    if (mutation === 'cache-directory') cache.type = 'directory';
    if (mutation === 'source-symlink') source.type = 'symlink';
    if (mutation === 'config') raw.entries.find(e => e.path.endsWith('config.toml')).sha256 = sha('other');
    if (mutation === 'unsafe-path') cache.path = 'supabase/.temp/../linked-project.json';
    if (mutation === 'omitted-present') raw.entries.push({path:`supabase/functions/${TARGET}/telegram/types.ts`,type:'file',bytes:10,sha256:OMITTED['telegram/types.ts']});
    assert.throws(() => validateRawInventory(raw, git, config), /exact observed/);
  });
}
test('fixed Git modules emit empty modules and have 18 explicit type-only incoming references', async () => {
  const proof = await proveTypeOnly(pinned, ts);
  assert.equal(proof.emitsOnlyEmptyModules, true);
  assert.equal(proof.references['importHato/tipos.ts'].length, 10);
  assert.equal(proof.references['telegram/types.ts'].length, 8);
  await assert.rejects(proveTypeOnly(pinned, {...ts, version:'wrong'}), /version/);
});
for (const kind of ['runtime-import','runtime-export','dynamic-import','require','changed-omission','missing-omission','symlink','malformed']) {
  test(`type proof rejects ${kind}`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'pr367-type-'));
    try {
      await cp(pinned, root, {recursive:true});
      const path = join(root,'index.ts');
      const statements = {
        'runtime-import': "import { BotContext } from './telegram/types.ts';",
        'runtime-export': "export * from './telegram/types.ts';",
        'dynamic-import': "import('./telegram/types.ts');",
        require: "require('./telegram/types.ts');",
        malformed: "export interface {",
      };
      if (statements[kind]) await writeFile(path, statements[kind]);
      if (kind === 'changed-omission') await writeFile(join(root,'telegram/types.ts'), 'export const unsafe = 1;');
      if (kind === 'missing-omission') await rm(join(root,'telegram/types.ts'));
      if (kind === 'symlink') await symlink('/unread-private',join(root,'unexpected.ts'));
      await assert.rejects(proveTypeOnly(root, ts));
    } finally { await rm(root,{recursive:true,force:true}); }
  });
}
test('invalid disk cache never creates a clean capture; raw download remains unchanged', async () => {
  const root = await mkdtemp(join(tmpdir(),'pr367-reconstruct-'));
  try {
    const gitRoot = join(root,'git'); const raw = join(root,'raw'); const clean = join(root,'clean');
    await mkdir(join(gitRoot,'supabase/functions'),{recursive:true});
    await cp(pinned,join(gitRoot,'supabase/functions',TARGET),{recursive:true});
    await writeFile(join(gitRoot,'supabase/config.toml'),'synthetic config');
    await cp(gitRoot,raw,{recursive:true});
    for (const omitted of Object.keys(OMITTED)) await rm(join(raw,'supabase/functions',TARGET,omitted));
    await mkdir(join(raw,'supabase/.temp'));
    await writeFile(join(raw,'supabase/.temp/cli-latest'),'v2.122.0');
    await writeFile(join(raw,'supabase/.temp/linked-project.json'),'unapproved synthetic cache');
    const before = await diagnosticInventory(raw);
    await assert.rejects(reconstructCapture(raw,gitRoot,clean,ts), /exact observed/);
    await assert.rejects(readFile(join(clean,'supabase/config.toml')), {code:'ENOENT'});
    assert.deepEqual(await diagnosticInventory(raw),before);
    const native = await fingerprint(join(raw,'supabase/functions',TARGET));
    assert.equal(native.count,80);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('full synthetic disk repair supports release and conditional rollback/restored capture', async () => {
  const root = await mkdtemp(join(tmpdir(),'pr367-complete-'));
  try {
    // Replace only the observed cache digest in a private temporary test copy.
    // Production constants stay exact. No remote cache body is read or retained.
    const syntheticCache = 'x'.repeat(134);
    const implementation = await readFile(new URL('./release-pr367-capture.mjs',import.meta.url),'utf8');
    const originalDigest = '5afb37cef5be9eb93a709f9a1769352d325098f5dc58bdf706563d6a6110a302';
    assert.equal(implementation.split(originalDigest).length,2);
    await writeFile(join(root,'release-pr367-capture.mjs'),implementation.replace(originalDigest,sha(syntheticCache)));
    await cp(new URL('./release-pr367.mjs',import.meta.url),join(root,'release-pr367.mjs'));
    const repaired = await import(pathToFileURL(join(root,'release-pr367-capture.mjs')).href);
    const gitRoot = join(root,'git');
    await mkdir(join(gitRoot,'supabase/functions'),{recursive:true});
    await cp(pinned,join(gitRoot,'supabase/functions',TARGET),{recursive:true});
    await writeFile(join(gitRoot,'supabase/config.toml'),'# Minimal config for Edge Function deployment\n\n[functions.make-server-1ccce916]\nverify_jwt = false\n');
    const expected = await fingerprint(pinned);
    const dirs = new Map(); const evidence = []; const mutations = [];
    const capture = async name => {
      const raw = join(root,`raw-${name}`); const clean = join(root,`clean-${name}`);
      await cp(gitRoot,raw,{recursive:true});
      for (const path of Object.keys(OMITTED)) await rm(join(raw,'supabase/functions',TARGET,path));
      await mkdir(join(raw,'supabase/.temp'));
      await writeFile(join(raw,'supabase/.temp/cli-latest'),'v2.122.0');
      await writeFile(join(raw,'supabase/.temp/linked-project.json'),syntheticCache);
      const before = await diagnosticInventory(raw);
      const proof = await repaired.reconstructCapture(raw,gitRoot,clean,ts);
      assert.deepEqual(proof.fingerprint,expected);
      assert.equal(proof.evidence.native.count,80);
      assert.equal(proof.evidence.reconstructed.count,82);
      assert.deepEqual(proof.evidence.reconstructed.restoredFromGit,Object.keys(OMITTED));
      assert.deepEqual(await diagnosticInventory(raw),before);
      await assert.rejects(readFile(join(clean,'supabase/.temp/linked-project.json')),{code:'ENOENT'});
      dirs.set(name,clean); evidence.push(proof.evidence); return proof.fingerprint;
    };
    const metadata = version => ({slug:TARGET,name:TARGET,id:'9defb252-5ea2-463b-b91b-497e0a7fe582',import_map:false,
      entrypoint_path:`file:///tmp/user_fn_ywhtjwawnkeqlwxbvgup_9defb252-5ea2-463b-b91b-497e0a7fe582_${version}/source/supabase/functions/${TARGET}/index.ts`,
      version,status:'ACTIVE',verify_jwt:false,ezbr_sha256:version===280?'dc67ed8b9f26f47b3d4184446ddaf67055b7832dc33f39fdb874b06268c7ff00':'a'.repeat(64)});
    let reads=0; let health=0;
    const versions=[280,280,280,281,281,282,282];
    const result=await release({capture,verifySource:async()=>expected,metadata:async()=>metadata(versions[reads++]),
      deploy:async kind=>{mutations.push(kind);if(kind==='rollback')assert.deepEqual(await fingerprint(join(dirs.get('first'),'supabase/functions',TARGET)),expected);},
      health:async()=>++health>1});
    assert.equal(result.state,'rolled-back'); assert.deepEqual(mutations,['release','rollback']);
    assert.equal(evidence.length,3); assert.deepEqual(evidence[0].native,evidence[2].native);
  } finally { await rm(root,{recursive:true,force:true}); }
});
