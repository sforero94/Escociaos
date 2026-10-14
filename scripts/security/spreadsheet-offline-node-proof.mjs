#!/usr/bin/env node
// Synthetic local bytes only. Never imports/runs the service-role CLI main().
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { build } from 'esbuild';
const root = fileURLToPath(new URL('../../', import.meta.url));
const fixture = resolve(process.argv[2] ?? resolve(root, '../.escocia-xlsx-review/adapter-proof/golden.xlsx'));
// Bundle the actual typed adapter with its same local runtime for Node 20,
// rather than requiring a runtime that supports direct TS execution.
const result = await build({ entryPoints: [resolve(root, 'src/utils/spreadsheet/index.ts')], bundle: true, write: false, platform: 'node', format: 'esm', target: 'node20' });
const api = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
const sheets = (await api.readXlsx(readFileSync(fixture), { filename: 'synthetic.xlsx' })).sheets;
const rows = sheets.map(sheet => ({ archivo: 'synthetic.xlsx', hoja: sheet.name, filas: sheet.rows }));
assert.deepEqual(rows, [{ archivo: 'synthetic.xlsx', hoja: 'Golden', filas: [[46225.50000000001, '#VALUE!', true, 0], [null, null, null, null], [null, null, null, null]] }]);
await assert.rejects(api.readXlsx(readFileSync(fixture), { filename: 'legacy.xls' }), /Convierta/);
await assert.rejects(api.readXlsx(readFileSync(fixture), { filename: 'data.csv' }), /Se requiere/);
await assert.rejects(api.readXlsx(Buffer.from([80, 75, 3, 4]), { filename: 'broken.xlsx' }));
console.log(JSON.stringify({ assertions: 4, node: process.version, note: 'Actual shared typed adapter bundled for Node20 + fs bytes; offline CLI main and service-role path intentionally unexecuted' }));
