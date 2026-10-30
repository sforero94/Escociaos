// Local release preparation: reviewed pure source proofs, no I/O on import.
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { readdir, readFile, open } from 'node:fs/promises';
import { join } from 'node:path';
export const TARGET = 'make-server-1ccce916';
export const PROJECT = 'ywhtjwawnkeqlwxbvgup';
const FUNCTION_ID = '9defb252-5ea2-463b-b91b-497e0a7fe582';
export const DEPLOY_CONFIG = '# Minimal config for Edge Function deployment\n\n[functions.make-server-1ccce916]\nverify_jwt = false\n';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function requireThat(ok, message) { if (!ok) throw new Error(message); }
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
