#!/usr/bin/env -S deno run --no-prompt --deny-net --deny-write --deny-env --deny-run
// Run with --allow-read restricted to repository + synthetic fixture path.
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const fixture = resolve(Deno.args[0] ?? resolve(root, '../.escocia-xlsx-review/adapter-proof/golden.xlsx'));
const sha = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
for (const name of ['net', 'write', 'env', 'run']) assert.equal((await Deno.permissions.query({ name })).state, 'denied');
const canonicalHash = await sha(await Deno.readFile(resolve(root, 'src/vendor/spreadsheet/exceljs-runtime.mjs')));
const packages = ['src/supabase/functions/server', 'supabase/functions/make-server-1ccce916'];
const source = await import(pathToFileURL(resolve(root, 'src/utils/spreadsheet/index.ts')).href);
const golden = await Deno.readFile(fixture);
const expected = [{ archivo: 'synthetic.xlsx', hoja: 'Golden', filas: [[46225.50000000001, '#VALUE!', true, 0], [null, null, null, null], [null, null, null, null]] }];
let assertions = 4;
for (const target of packages) {
  const manifest = JSON.parse(await Deno.readTextFile(resolve(root, target, 'spreadsheet/packaging-manifest.json')));
  for (const entry of manifest.files) {
    assert.equal(await sha(await Deno.readFile(resolve(root, entry.source))), entry.sourceSHA256);
    assert.equal(await sha(await Deno.readFile(resolve(root, target, entry.destination))), entry.deployedSHA256);
    assertions += 2;
  }
  assert.equal(await sha(await Deno.readFile(resolve(root, target, 'vendor/spreadsheet/exceljs-runtime.mjs'))), canonicalHash); assertions++;
  const reader = await import(pathToFileURL(resolve(root, target, 'hato-chequeo-spreadsheet.ts')).href);
  assert.deepEqual(await reader.leerHojasCrudas(golden, 'synthetic.xlsx'), expected); assertions++;
  const bytes = await source.writeXlsx([{ name: 'First', rows: [[0, false, ' raw ', '=1+2'], [null, null, null, null]] }, { name: 'Second', rows: [[{ error: '#VALUE!' }]] }]);
  const rows = await reader.leerHojasCrudas(bytes, 'roundtrip.xlsx');
  assert.deepEqual(rows, [{ archivo: 'roundtrip.xlsx', hoja: 'First', filas: [[0, false, ' raw ', '=1+2'], [null, null, null, null]] }, { archivo: 'roundtrip.xlsx', hoja: 'Second', filas: [['#VALUE!']] }]); assertions++;
  await assert.rejects(reader.leerHojasCrudas(golden, 'legacy.xls'), /Convierta/); assertions++;
  await assert.rejects(reader.leerHojasCrudas(golden, 'data.csv'), /Se requiere/); assertions++;
  await assert.rejects(reader.leerHojasCrudas(new Uint8Array([80, 75, 3, 4]), 'broken.xlsx')); assertions++;
}
console.log(JSON.stringify({ assertions, deno: Deno.version, packages, runtimeSHA256: canonicalHash, note: 'Exact local function-root typed source and runtime; hosted Supabase bundling/version parity unverified' }));
