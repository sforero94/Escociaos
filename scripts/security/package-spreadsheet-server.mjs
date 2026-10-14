#!/usr/bin/env node
// Deterministic function-root packaging. --check verifies without writing.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../../', import.meta.url));
const check = process.argv.includes('--check');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const targets = ['src/supabase/functions/server', 'supabase/functions/make-server-1ccce916'];
const inputs = ['index.ts', 'archive.ts', 'limits.ts'].map(name => ({
  source: `src/utils/spreadsheet/${name}`, destination: `spreadsheet/${name}`,
  transform: text => text.replaceAll('../../vendor/spreadsheet/', '../vendor/spreadsheet/').replace("from './archive'", "from './archive.ts'"),
}));
for (const name of ['exceljs-runtime.mjs', 'exceljs-runtime.d.mts', 'exceljs-types.d.ts', 'manifest.json', 'LICENSES.md', 'saxes-LICENSE.txt', 'README.md', 'audit-evidence.json']) {
  // Copy runtime provenance and notices alongside the artifact, never rebundle.
  inputs.push({ source: `src/vendor/spreadsheet/${name}`, destination: `vendor/spreadsheet/${name}`, transform: null });
}
for (const target of targets) {
  const files = inputs.map(input => {
    const source = readFileSync(resolve(root, input.source));
    const deployed = input.transform ? Buffer.from(input.transform(source.toString('utf8'))) : source;
    const path = resolve(root, target, input.destination);
    if (check) {
      if (!readFileSync(path).equals(deployed)) throw Error(`Stale deployment file: ${target}/${input.destination}`);
    } else { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, deployed); }
    return { source: input.source, destination: input.destination, sourceSHA256: hash(source), deployedSHA256: hash(deployed) };
  });
  const manifest = Buffer.from(JSON.stringify({ version: 1, transforms: ['Adapter runtime import path ../../vendor/spreadsheet/ -> ../vendor/spreadsheet/', 'Type-only ./archive -> ./archive.ts'], files }, null, 2) + '\n');
  const path = resolve(root, target, 'spreadsheet/packaging-manifest.json');
  if (check) { if (!readFileSync(path).equals(manifest)) throw Error(`Stale deployment manifest: ${target}`); }
  else writeFileSync(path, manifest);
}
console.log(`Spreadsheet deployment packages ${check ? 'verified' : 'generated'} from canonical sources; exact runtime bytes in both function roots.`);
