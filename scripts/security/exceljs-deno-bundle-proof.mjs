#!/usr/bin/env -S deno run --no-prompt --deny-net --deny-write --deny-env --deny-run
/** Historical scratch artifact proof; new adapter acceptance is
 * spreadsheet-adapter-deno-proof.mjs.
 * Deno proof for the generated, audited upstream-source ESM artifact.
 * Use --no-config --no-lock --cached-only --allow-read=<scratch>.
 * This deliberately has NO standalone npm:exceljs resolution, no Auth client,
 * no records, no network and no runtime filesystem/worker writes.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const repo = fileURLToPath(new URL('../../', import.meta.url));
const scratch = resolve(Deno.args[0] ?? resolve(repo, '../.escocia-xlsx-review'));
const filename = resolve(scratch, 'source-browser-polyfilled-dist/exceljs-browser.mjs');
const fixture = JSON.parse(await Deno.readTextFile(resolve(scratch, 'deno-fixture.json')));
const proof = JSON.parse(await Deno.readTextFile(resolve(scratch, 'source-browser-result.json')));
const graph = JSON.parse(await Deno.readTextFile(resolve(scratch, 'source-browser-module-graph.json')));
const lock = JSON.parse(await Deno.readTextFile(resolve(scratch, 'package-lock.json')));
const source = await Deno.readFile(filename);
const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', source))].map(byte => byte.toString(16).padStart(2, '0')).join('');
let checks = 0;
function check(label, test) { test(); checks++; console.log('PASS', label); }
check('same verified browser-source artifact hash is used by Deno, without npm graph resolution', () => assert.equal(hash, proof.bundleSHA256));
check('source artifact provenance includes actual patched UUID11.1.1 modules, not old prebuilt distribution', () => {
  assert.equal(lock.packages['node_modules/uuid'].version, '11.1.1');
  assert(graph.some(id => id.endsWith('/uuid/dist/cjs-browser/v4.js')));
  assert(!graph.some(id => /exceljs\/dist\/exceljs.*\.js/.test(id)));
});
for (const name of ['net', 'write', 'env', 'run']) {
  const status = await Deno.permissions.query({ name });
  check(`runtime ${name} capability denied`, () => assert.equal(status.state, 'denied'));
}
const { Workbook } = await import(pathToFileURL(filename).href);
check('patched source artifact imports under restricted Deno runtime', () => assert.equal(typeof Workbook, 'function'));
const workbook = new Workbook(); const sheet = workbook.addWorksheet(fixture.name);
sheet.addRows(fixture.aoa);
fixture.widths.forEach((width, i) => { sheet.getColumn(i + 1).width = width; });
sheet.pageSetup.margins = fixture.margins; sheet.pageSetup.printTitlesRow = '2:2';
sheet.addConditionalFormatting({ ref: 'C3', rules: [{ type: 'dataBar', minLength: 0, maxLength: 100, cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: 'FF009900' } }] });
const bytes = await workbook.xlsx.writeBuffer(); const again = new Workbook(); await again.xlsx.load(bytes);
const reread = again.worksheets[0];
check('Deno in-memory write/load preserves current template raw values and types', () => {
  assert.equal(reread.getCell('A3').value, 101); assert.equal(reread.getCell('B3').value, 'SYNTHETIC');
  assert.equal(reread.getCell('C3').value, 18.5); assert.equal(reread.getCell('I3').value, 'preñada (3 meses)');
});
check('Deno template row/column geometry, widths, margins and Print Titles persist', () => {
  assert.equal(reread.rowCount, fixture.aoa.length); assert.equal(reread.columnCount, 13);
  assert.deepEqual(reread.columns.map(col => col.width), fixture.widths);
  assert.deepEqual(reread.pageSetup.margins, fixture.margins); assert.equal(reread.pageSetup.printTitlesRow, '2:2');
});
check('Deno conditional-format UUID v4 path serializes under network/env/run denial', () => {
  const rule = sheet.model.conditionalFormattings[0].rules[0]; assert.match(rule.x14Id, /^\{[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}\}$/);
});
const original = new Workbook(); await original.xlsx.load(new Uint8Array(fixture.originalBytes));
check('Deno reads existing SheetJS byte template values and confirms declared-dimension adapter is necessary', () => {
  assert.equal(original.worksheets[0].getCell('B3').value, 'SYNTHETIC');
  // The old writer stores blank extent in XML dimension, not row records.
  assert(original.worksheets[0].rowCount < fixture.aoa.length);
});
for (const date1904 of [false, true]) {
  const typed = new Workbook(); typed.properties.date1904 = date1904; const values = typed.addWorksheet('Typed');
  const date = new Date(Date.UTC(2026, 6, 22, 12));
  values.getCell('A1').value = date; values.getCell('A1').numFmt = 'dd/mm/yyyy hh:mm';
  values.getCell('B1').value = { formula: 'DATE(2026,7,22)', result: date }; values.getCell('B1').numFmt = 'dd/mm/yyyy hh:mm';
  values.getCell('C1').value = { error: '#VALUE!' };
  values.getCell('D1').value = { formula: '1+"bad"', result: { error: '#VALUE!' } };
  values.getCell('E1').value = 0; values.getCell('F1').value = true;
  const read = new Workbook(); await read.xlsx.load(await typed.xlsx.writeBuffer()); const cells = read.worksheets[0];
  check(`Deno ${date1904 ? '1904' : '1900'} direct/cached dates normalize by UTC`, () => {
    assert.equal(read.properties.date1904, date1904); assert.equal(cells.getCell('A1').value.toISOString(), '2026-07-22T12:00:00.000Z'); assert.equal(cells.getCell('B1').value.result.toISOString(), '2026-07-22T12:00:00.000Z');
  });
  check(`Deno ${date1904 ? '1904' : '1900'} typed/cached errors, zero and boolean preserve values`, () => {
    assert.equal(cells.getCell('C1').value.error, '#VALUE!'); assert.equal(cells.getCell('D1').value.result.error, '#VALUE!'); assert.equal(cells.getCell('E1').value, 0); assert.equal(cells.getCell('F1').value, true);
  });
}
let rejected = false;
try { await new Workbook().xlsx.load(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])); } catch { rejected = true; }
check('Deno binary XLS signature rejected without legacy-support claim', () => assert(rejected));
console.log(JSON.stringify({ assertions: checks, deno: Deno.version, bundleSHA256: hash, note: 'Local restricted Deno engine with identical audited source artifact; no standalone npm override assumption or hosted Supabase certification', limits: ['legacy XLS unsupported', 'CSV not proved', 'declared-dimension application adapter not installed', 'hosted Deno/deployed version unverified', 'no compressed-expansion/fuzz proof'] }, null, 2));
