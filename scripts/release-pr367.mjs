// Temporary, single-target release. Never log subprocess output or API bodies.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readdir, readFile, mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const TARGET = 'make-server-1ccce916';
export const PROJECT = 'ywhtjwawnkeqlwxbvgup';
export const SOURCE = '634580480c72b27c7ccd2d8c006af520d0ca1058';
export const EDGE_TREE = '99ba3737577f064e27112e4e99a8dd24739c6422';
export const BASELINE = Object.freeze({ status: 'ACTIVE', verifyJwt: false, version: 280, hash: 'dc67ed8b9f26f47b3d4184446ddaf67055b7832dc33f39fdb874b06268c7ff00' });
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
function requireThat(condition, message) { if (!condition) throw new Error(message); }
export function normalized(meta) {
  requireThat(meta?.slug === TARGET && typeof meta.status === 'string' && typeof meta.verify_jwt === 'boolean' &&
    meta.import_map === false && typeof meta.entrypoint_path === 'string' && meta.entrypoint_path.endsWith(`/supabase/functions/${TARGET}/index.ts`) &&
    Number.isSafeInteger(meta.version) && /^[a-f0-9]{64}$/.test(meta.ezbr_sha256 ?? ''), 'Invalid deployment metadata');
  return { version: meta.version, hash: meta.ezbr_sha256, status: meta.status, verifyJwt: meta.verify_jwt };
}
export function same(a, b) { return a.version === b.version && a.hash === b.hash && a.status === b.status && a.verifyJwt === b.verifyJwt; }

// Capture must contain the original entrypoint and only ordinary files/directories.
export async function fingerprint(directory) {
  const files = [];
  async function walk(dir, prefix = '') {
    for (const item of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const relative = prefix + item.name;
      requireThat(!item.isSymbolicLink(), 'Rollback contains a symlink');
      if (item.isDirectory()) await walk(join(dir, item.name), relative + '/');
      else { requireThat(item.isFile(), 'Rollback contains a special file'); files.push([relative, sha(await readFile(join(dir, item.name)))]); }
    }
  }
  await walk(directory);
  requireThat(files.some(([name]) => name === 'index.ts'), 'Rollback entrypoint missing');
  return { count: files.length, hash: sha(files.map(([name, hash]) => `${name}\0${hash}\n`).join('')) };
}

// Injected operations allow all failure paths to be tested without credentials/network.
export async function release(ops) {
  const before = normalized(await ops.metadata());
  requireThat(same(before, BASELINE), 'Baseline changed; stop for review');
  const first = await ops.capture('first');
  const second = await ops.capture('second');
  requireThat(first.count > 0 && first.count === second.count && first.hash === second.hash, 'Rollback captures differ');
  requireThat(same(normalized(await ops.metadata()), before), 'Deployment changed during capture');
  await ops.verifySource();
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
  requireThat(process.env.RELEASE_CONFIRMATION === 'DEPLOY_PR367_WITH_TEMPORARY_ROLLBACK' &&
    process.env.ACCEPT_TEMPORARY_ROLLBACK === 'true', 'Explicit temporary-only rollback acceptance required');
  requireThat(Boolean(process.env.SUPABASE_ACCESS_TOKEN), 'Management identity missing');
  const source = resolve('release-source');
  const root = await mkdtemp(join(process.env.RUNNER_TEMP, 'release367-'));
  const dirs = new Map();
  const cli = (cwd, args) => {
    try { execFileSync('npx', ['--offline', '--cache', process.env.CLI_CACHE, '--yes', '--package', 'supabase@2.122.0', '--', 'supabase', ...args], { cwd, stdio: 'ignore', timeout: 180000 }); }
    catch { throw new Error('CLI command failed; outcome may be uncertain; no automatic retry'); }
  };
  const metadata = async () => {
    console.log('phase: metadata');
    const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/functions/${TARGET}`, {
      headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` }, redirect: 'error', signal: AbortSignal.timeout(20000),
    });
    requireThat(response.ok, 'Metadata request failed');
    return response.json();
  };
  try {
    const result = await release({
      metadata,
      capture: async (name) => {
        console.log(`phase: capture-${name}`);
        const dir = join(root, name);
        await mkdir(join(dir, 'supabase'), { recursive: true });
        await cp(join(source, 'supabase/config.toml'), join(dir, 'supabase/config.toml'));
        cli(dir, ['functions', 'download', TARGET, '--project-ref', PROJECT, '--use-api']);
        dirs.set(name, dir);
        return fingerprint(join(dir, 'supabase/functions', TARGET));
      },
      verifySource: async () => {
        console.log('phase: source-verification');
        requireThat(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim() === SOURCE, 'Wrong source commit');
        requireThat(execFileSync('git', ['rev-parse', `HEAD:supabase/functions/${TARGET}`], { cwd: source, encoding: 'utf8' }).trim() === EDGE_TREE, 'Wrong edge source tree');
        requireThat(execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: source, encoding: 'utf8' }).trim() === '', 'Dirty release source');
        const config = await readFile(join(source, 'supabase/config.toml'), 'utf8');
        requireThat(config === '# Minimal config for Edge Function deployment\n\n[functions.make-server-1ccce916]\nverify_jwt = false\n', 'Unexpected deployment configuration');
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
    });
    console.log(JSON.stringify(result)); // State, version and fingerprint only.
    requireThat(result.state === 'released', 'Release failed; captured source restored');
  } finally {
    await rm(root, { recursive: true, force: true }); // No plaintext artifact or retained source.
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Release stopped. Inspect safe step status; do not retry an uncertain deployment.'); process.exitCode = 1; });
}
