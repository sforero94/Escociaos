// Temporary, single-target release. Never log subprocess output or API bodies.
import { execFileSync } from 'node:child_process';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readdir, readFile, mkdir, rm, open } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const TARGET = 'make-server-1ccce916';
export const PROJECT = 'ywhtjwawnkeqlwxbvgup';
export const SOURCE = '634580480c72b27c7ccd2d8c006af520d0ca1058';
export const ROLLBACK_SOURCE = 'e5d2291202901848c45e42a2ffddae1a4cdf249e';
export const ROLLBACK_TREE = '0336fa13a040a48178a7d73beb6c8a1709e9a6a7';
const DEPLOY_CONFIG = '# Minimal config for Edge Function deployment\n\n[functions.make-server-1ccce916]\nverify_jwt = false\n';
const FUNCTION_ID = '9defb252-5ea2-463b-b91b-497e0a7fe582';
export const EDGE_TREE = '99ba3737577f064e27112e4e99a8dd24739c6422';
export const BASELINE = Object.freeze({ status: 'ACTIVE', verifyJwt: false, version: 280, hash: 'dc67ed8b9f26f47b3d4184446ddaf67055b7832dc33f39fdb874b06268c7ff00' });
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
class ReleaseError extends Error {}
function requireThat(condition, message) { if (!condition) throw new ReleaseError(message); }
export function normalized(meta) {
  requireThat(meta?.slug === TARGET && meta.name === TARGET && meta.id === FUNCTION_ID && typeof meta.status === 'string' && typeof meta.verify_jwt === 'boolean' &&
    meta.import_map === false && Number.isSafeInteger(meta.version) &&
    meta.entrypoint_path === `file:///tmp/user_fn_${PROJECT}_${FUNCTION_ID}_${meta.version}/source/supabase/functions/${TARGET}/index.ts` && /^[a-f0-9]{64}$/.test(meta.ezbr_sha256 ?? ''), 'Invalid deployment metadata');
  return { version: meta.version, hash: meta.ezbr_sha256, status: meta.status, verifyJwt: meta.verify_jwt };
}
export function same(a, b) { return a.version === b.version && a.hash === b.hash && a.status === b.status && a.verifyJwt === b.verifyJwt; }

// No source rewriting: compare complete paths, directory inventory and file bytes.
// Only the download workspace wrapper and known Supabase metadata prefix differ.
export async function fingerprint(directory, entrypoint = 'index.ts') {
  const files = [];
  async function walk(dir, prefix = '') {
    for (const item of (await readdir(dir, { withFileTypes: true })).sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)))) {
      const relative = prefix + item.name;
      requireThat(!/[\x00-\x1f\x7f\\]/.test(item.name), 'Ambiguous rollback path');
      requireThat(!item.isSymbolicLink(), 'Rollback contains a symlink');
      if (item.isDirectory()) { files.push([relative + '/', 'directory']); await walk(join(dir, item.name), relative + '/'); }
      else { requireThat(item.isFile(), 'Rollback contains a special file'); files.push([relative, sha(await readFile(join(dir, item.name)))]); }
    }
  }
  await walk(directory);
  requireThat(files.some(([name]) => name === entrypoint), 'Rollback entrypoint missing');
  return { count: files.filter(([, value]) => value !== 'directory').length, hash: sha(files.map(([name, hash]) => `${name}\0${hash}\n`).join('')) };
}

export async function downloadedFingerprint(directory) {
  async function exactLayout(dir, expected) {
    const items = await readdir(dir, { withFileTypes: true });
    requireThat(items.length === Object.keys(expected).length && items.every((item) =>
      expected[item.name] === 'file' ? item.isFile() : expected[item.name] === 'directory' && item.isDirectory()), 'Unexpected download wrapper');
  }
  await exactLayout(directory, { supabase: 'directory' });
  await exactLayout(join(directory, 'supabase'), { 'config.toml': 'file', functions: 'directory' });
  await exactLayout(join(directory, 'supabase/functions'), { [TARGET]: 'directory' });
  // This is a seeded CLI control file, not an observed remote TOML. Metadata
  // independently verifies the deployed JWT/import-map/entrypoint settings.
  requireThat((await readFile(join(directory, 'supabase/config.toml'), 'utf8')) === DEPLOY_CONFIG, 'Seeded deployment config changed');
  return fingerprint(join(directory, 'supabase/functions', TARGET));
}

// Diagnostic output contains relative paths/types/sizes/hashes only. Never follow
// symlinks or read special files, and never include subprocess/source/API bodies.
export async function diagnosticInventory(directory, secrets = []) {
  const entries = [];
  let bytes = 0;
  const safePath = (path) => secrets.filter(Boolean).reduce((value, secret) => value.split(secret).join('[redacted]'), path);
  async function walk(dir, prefix = '') {
    for (const item of (await readdir(dir, { withFileTypes: true })).sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)))) {
      requireThat(entries.length < 512, 'Diagnostic inventory exceeds entry bound');
      const path = prefix + item.name;
      const entry = { path: safePath(path), type: item.isSymbolicLink() ? 'symlink' : item.isDirectory() ? 'directory' : item.isFile() ? 'file' : 'special' };
      if (entry.type === 'file') {
        const file = await open(join(dir, item.name), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        try {
          const info = await file.stat();
          requireThat(info.isFile() && bytes + info.size <= 32 * 1024 * 1024, 'Diagnostic inventory exceeds file/byte bound');
          const content = await file.readFile();
          bytes += content.length;
          requireThat(bytes <= 32 * 1024 * 1024, 'Diagnostic inventory exceeds byte bound');
          entry.bytes = content.length;
          entry.sha256 = sha(content);
        } finally { await file.close(); }
      }
      entries.push(entry);
      if (entry.type === 'directory') await walk(join(dir, item.name), path + '/');
    }
  }
  await walk(directory);
  return { fileCount: entries.filter((entry) => entry.type === 'file').length, entryCount: entries.length, bytes, entries };
}

export function executionMode(mode, confirmation) {
  requireThat((mode === 'diagnose' && confirmation === 'DIAGNOSE_PR367_LAYOUT_ONLY') ||
    (mode === 'release' && confirmation === 'DEPLOY_PR367_WITH_VERIFIED_GIT_ROLLBACK'), 'Explicit matching mode/confirmation required');
  return mode;
}

// Deliberately has no deployment/rollback/health capability. A layout rejection
// is evidence in the report, never permission to bypass the release gate.
export async function diagnose(ops) {
  const before = normalized(await ops.metadata());
  requireThat(same(before, BASELINE), 'Baseline changed; stop for review');
  const git = await ops.verifySource();
  const capture = await ops.download();
  const inventory = await ops.inventory(capture);
  let layout;
  try { layout = { passed: true, fingerprint: await ops.strictFingerprint(capture) }; }
  catch (error) { layout = { passed: false, reason: error instanceof ReleaseError ? error.message : 'Inventory validation unavailable' }; }
  requireThat(same(normalized(await ops.metadata()), before), 'Deployment changed during diagnostic; stop');
  const gitEquivalent = layout.passed ? layout.fingerprint.count === git?.count && layout.fingerprint.hash === git?.hash : null;
  return { state: 'diagnostic-only', deploymentAttempted: false, layout, gitEquivalent, git, inventory };
}

// Injected operations allow all failure paths to be tested without credentials/network.
export async function release(ops) {
  const before = normalized(await ops.metadata());
  requireThat(same(before, BASELINE), 'Baseline changed; stop for review');
  const first = await ops.capture('first');
  const second = await ops.capture('second');
  requireThat(first.count > 0 && first.count === second.count && first.hash === second.hash, 'Rollback captures differ');
  requireThat(same(normalized(await ops.metadata()), before), 'Deployment changed during capture');
  const gitRollback = await ops.verifySource();
  requireThat(gitRollback?.count > 0 && /^[a-f0-9]{64}$/.test(gitRollback.hash ?? '') &&
    first.count === gitRollback.count && first.hash === gitRollback.hash &&
    second.count === gitRollback.count && second.hash === gitRollback.hash, 'Downloaded rollback source differs from pinned Git source');
  requireThat(same(normalized(await ops.metadata()), before), 'Deployment changed before release; stop');
  // CLI failure has an uncertain remote outcome: never retry or infer ownership.
  await ops.deploy('release');
  const deployed = normalized(await ops.metadata());
  requireThat(deployed.version === before.version + 1 && deployed.hash !== before.hash, 'Unexpected release metadata; manual inspection required');
  if (deployed.status === 'ACTIVE' && deployed.verifyJwt === false && await ops.health()) {
    requireThat(same(normalized(await ops.metadata()), deployed), 'Deployment changed during smoke; stop');
    return { state: 'released', version: deployed.version, rollbackFingerprint: first.hash };
  }
  requireThat(same(normalized(await ops.metadata()), deployed), 'Deployment changed before rollback; stop');
  await ops.deploy('rollback');
  const restored = normalized(await ops.metadata());
  requireThat(restored.version === deployed.version + 1 && restored.status === 'ACTIVE' && restored.verifyJwt === false && await ops.health(), 'Rollback verification failed');
  // ESZIP rebuilds need not reproduce the old bundle hash. Compare downloaded source.
  const recovered = await ops.capture('restored');
  requireThat(recovered.hash === first.hash && recovered.count === first.count, 'Restored source differs');
  requireThat(same(normalized(await ops.metadata()), restored), 'Deployment changed during rollback verification');
  return { state: 'rolled-back', version: restored.version, rollbackFingerprint: first.hash };
}

async function main() {
  requireThat(process.env.GITHUB_REPOSITORY === 'sforero94/Escociaos' && process.env.GITHUB_REF === 'refs/heads/main' &&
    process.env.GITHUB_EVENT_NAME === 'workflow_dispatch', 'Manual main-only invocation required');
  const mode = executionMode(process.env.RELEASE_MODE, process.env.RELEASE_CONFIRMATION);
  requireThat(Boolean(process.env.SUPABASE_ACCESS_TOKEN), 'Management identity missing');
  const source = resolve('release-source');
  const rollback = resolve('rollback-source');
  const root = await mkdtemp(join(process.env.RUNNER_TEMP, 'release367-'));
  const dirs = new Map();
  const cli = (cwd, args) => {
    try { execFileSync('npx', ['--offline', '--cache', process.env.CLI_CACHE, '--yes', '--package', 'supabase@2.122.0', '--', 'supabase', ...args], { cwd, stdio: 'ignore', timeout: 180000 }); }
    catch { throw new ReleaseError('CLI command failed; outcome may be uncertain; no automatic retry'); }
  };
  const metadata = async () => {
    console.log('phase: metadata');
    const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/functions/${TARGET}`, {
      headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` }, redirect: 'error', signal: AbortSignal.timeout(20000),
    });
    requireThat(response.ok, 'Metadata request failed');
    return response.json();
  };
  const downloadCapture = async (name) => {
    console.log(`phase: capture-${name}`);
    const dir = join(root, name);
    await mkdir(join(dir, 'supabase'), { recursive: true });
    await cp(join(rollback, 'supabase/config.toml'), join(dir, 'supabase/config.toml'));
    cli(dir, ['functions', 'download', TARGET, '--project-ref', PROJECT, '--use-api']);
    dirs.set(name, dir);
    return dir;
  };
  try {
    const ops = {
      metadata,
      capture: async (name) => downloadedFingerprint(await downloadCapture(name)),
      verifySource: async () => {
        console.log('phase: source-verification');
        requireThat(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim() === SOURCE, 'Wrong source commit');
        requireThat(execFileSync('git', ['rev-parse', `HEAD:supabase/functions/${TARGET}`], { cwd: source, encoding: 'utf8' }).trim() === EDGE_TREE, 'Wrong edge source tree');
        requireThat(execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: source, encoding: 'utf8' }).trim() === '', 'Dirty release source');
        requireThat(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: rollback, encoding: 'utf8' }).trim() === ROLLBACK_SOURCE, 'Wrong rollback commit');
        requireThat(execFileSync('git', ['rev-parse', `HEAD:supabase/functions/${TARGET}`], { cwd: rollback, encoding: 'utf8' }).trim() === ROLLBACK_TREE, 'Wrong rollback source tree');
        requireThat(execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: rollback, encoding: 'utf8' }).trim() === '', 'Dirty Git rollback source');
        const config = await readFile(join(source, 'supabase/config.toml'), 'utf8');
        requireThat(config === DEPLOY_CONFIG, 'Unexpected deployment configuration');
        requireThat((await readFile(join(rollback, 'supabase/config.toml'), 'utf8')) === config, 'Rollback deployment configuration differs');
        return fingerprint(join(rollback, 'supabase/functions', TARGET));
      },
      deploy: async (kind) => {
        console.log(`phase: deploy-${kind}`);
        cli(kind === 'release' ? source : dirs.get('first'), ['functions', 'deploy', TARGET, '--project-ref', PROJECT, '--use-api']);
      },
      health: async () => {
        console.log('phase: anonymous-health');
        // No business route or model call. Retry health only, never deployment.
        for (let attempt = 0; attempt < 3; attempt++) {
          try { const response = await fetch(`https://${PROJECT}.supabase.co/functions/v1/${TARGET}/health`, { redirect: 'error', signal: AbortSignal.timeout(10000) }); if (response.status === 200 && (await response.json()).status === 'ok') return true; } catch { /* bounded health retry */ }
          await new Promise((done) => setTimeout(done, 2000));
        }
        return false;
      },
    };
    if (mode === 'diagnose') {
      const report = await diagnose({
        metadata, verifySource: ops.verifySource, download: () => downloadCapture('diagnostic'),
        inventory: (dir) => diagnosticInventory(dir, [process.env.SUPABASE_ACCESS_TOKEN]),
        strictFingerprint: downloadedFingerprint,
      });
      console.log(JSON.stringify(report));
      return;
    }
    const result = await release(ops);
    console.log(JSON.stringify(result)); // State, version and fingerprint only.
    requireThat(result.state === 'released', 'Release failed; captured source restored');
  } finally {
    await rm(root, { recursive: true, force: true }); // Immediate capture is disposable only after the Git equivalence gate.
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error instanceof ReleaseError ? `Release stopped: ${error.message}` : 'Release stopped. Inspect safe phase status; do not retry an uncertain deployment.'); process.exitCode = 1; });
}
