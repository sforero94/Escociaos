#!/usr/bin/env node
/** Historical pre-cutover browser oracle (requires old SheetJS intentionally).
 * New portable acceptance: spreadsheet-adapter-browser-proof.mjs.
 * Synthetic source-browser build/VM proof. Run with --experimental-vm-modules.
 * Uses the genuine scratch package, patched lock and repo's existing Vite.
 * Writes build artifacts only under scratch. VM has Web APIs, no Node globals.
 * This is not a DOM browser, download, Deno or hosted-runtime certification.
 */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire, register } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { webcrypto, createHash } from 'node:crypto';
register('../import-hato/alias-hooks.mjs', import.meta.url);
const repo = fileURLToPath(new URL('../../', import.meta.url));
const scratch = resolve(process.argv[2] ?? resolve(repo, '../.escocia-xlsx-review'));
const req = createRequire(resolve(scratch, 'package.json'));
const repoReq = createRequire(resolve(repo, 'package.json'));
const { build } = await import(pathToFileURL(repoReq.resolve('vite')).href);
const injectModule = req('@rollup/plugin-inject');
const inject = injectModule.default ?? injectModule;
const XLSX = repoReq('xlsx');
const template = await import('../../src/utils/hato/exportarPlanillaChequeo.ts');
const entry = resolve(scratch, 'source-browser-entry.mjs');
writeFileSync(entry, "import ExcelJS from './node_modules/exceljs/lib/exceljs.browser.js';\nexport const Workbook = ExcelJS.Workbook;\n");
const graph = [];
await build({
  configFile: false, root: scratch,
  resolve: { alias: {
    'core-js': dirname(req.resolve('core-js')),
    'regenerator-runtime': dirname(req.resolve('regenerator-runtime/runtime')),
    stream: req.resolve('stream-browserify'), events: req.resolve('events/'),
    buffer: req.resolve('buffer/'), process: req.resolve('process/browser'),
  } },
  // Apply injection AFTER CommonJS conversion. Earlier injection creates
  // mixed modules that can leave residual require/module.exports in output.
  plugins: [
    { ...inject({ Buffer: ['buffer', 'Buffer'], process: 'process' }), enforce: 'post' },
    { name: 'record-genuine-source-graph', generateBundle() { graph.push(...this.getModuleIds()); } },
  ],
  build: { outDir: 'source-browser-polyfilled-dist', lib: { entry, formats: ['es'], fileName: () => 'exceljs-browser.mjs' }, minify: false },
});
const graphFile = resolve(scratch, 'source-browser-module-graph.json');
writeFileSync(graphFile, JSON.stringify(graph.filter(id => !id.startsWith('\0')).sort(), null, 2) + '\n');
const source = readFileSync(resolve(scratch, 'source-browser-polyfilled-dist/exceljs-browser.mjs'), 'utf8');
let checks = 0;
function check(label, test) { test(); checks++; console.log('PASS', label); }
check('resolved browser source graph uses overridden UUID11.1.1 and no prebuilt bundle', () => {
  assert.equal(req('uuid/package.json').version, '11.1.1');
  assert(graph.some(id => id.includes('/node_modules/uuid/dist/') && id.endsWith('/v4.js')));
  assert(graph.filter(id => id.includes('/node_modules/uuid/')).every(id => id.startsWith(resolve(scratch, 'node_modules/uuid')) || id.startsWith('\0')));
  assert(graph.some(id => id.endsWith('/exceljs/lib/exceljs.browser.js')));
  assert(!graph.some(id => /exceljs\/dist\/exceljs.*\.js/.test(id)));
});
const context = vm.createContext({ console, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, TextEncoder, TextDecoder, crypto: webcrypto });
context.self = context;
const module = new vm.SourceTextModule(source, { context });
await module.link(specifier => { throw new Error(`Unexpected external runtime import ${specifier}`); });
await module.evaluate();
context.Workbook = module.namespace.Workbook;
check('source browser module imports without Node process/Buffer/require/module globals', () => assert.equal(vm.runInContext('[typeof process,typeof Buffer,typeof require,typeof module].join("|")', context), 'undefined|undefined|undefined|undefined'));
const row = { numero: 101, nombre: 'SYNTHETIC', pl: 18.5, numPartos: 3, ultimaCria: '1/2/2025', sexoCria: 'ov', fechaServicio: '10/5/2026', toro: 'Toro Nitro', estadoRegistrado: 'preñada (3 meses)', estado: 'ok', secar: null, partoProbable: null, tratamiento: null };
const opts = { tituloHoja: template.construirTituloHojaChequeo('2026-07-22'), nombreHoja: template.construirNombreHojaChequeo('2026-07-22'), filas: [row] };
const aoa = template.construirAOAPlanillaChequeo(opts.tituloHoja, opts.filas);
const old = template.construirLibroPlanillaChequeo(XLSX, opts);
const widths = old.Sheets[opts.nombreHoja]['!cols'].map(col => Math.round((col.wch * 6 + 5) / 6 * 256) / 256);
writeFileSync(resolve(scratch, 'deno-fixture.json'), JSON.stringify({
  aoa, name: opts.nombreHoja, widths, margins: old.Sheets[opts.nombreHoja]['!margins'],
  originalBytes: Array.from(XLSX.write(old, { type: 'buffer', bookType: 'xlsx' })),
}) + '\n');
context.fixtureJson = JSON.stringify({ aoa, name: opts.nombreHoja, widths, margins: old.Sheets[opts.nombreHoja]['!margins'] });
// All input arrays/Date objects must be created in the same browser realm.
// ExcelJS uses instanceof Array/Date and cross-realm host arrays are not a
// valid stand-in for application arrays in an isolated VM.
const browserResult = await vm.runInContext(`(async()=>{
  const fixture=JSON.parse(fixtureJson); const workbook=new Workbook();
  const sheet=workbook.addWorksheet(fixture.name); sheet.addRows(fixture.aoa);
  fixture.widths.forEach((width,i)=>{sheet.getColumn(i+1).width=width;});
  sheet.pageSetup.margins=fixture.margins; sheet.pageSetup.printTitlesRow='2:2';
  sheet.addConditionalFormatting({ref:'C3',rules:[{type:'dataBar',minLength:0,maxLength:100,cfvo:[{type:'min'},{type:'max'}],color:{argb:'FF009900'}}]});
  const bytes=await workbook.xlsx.writeBuffer(); const again=new Workbook(); await again.xlsx.load(bytes);
  const returned=again.worksheets[0];
  return {bytes:Array.from(bytes),number:returned.getCell('A3').value,name:returned.getCell('B3').value,registered:returned.getCell('I3').value,widths:returned.columns.map(col=>col.width),print:returned.pageSetup.printTitlesRow,rows:returned.rowCount};
})()`, context);
check('source browser byte roundtrip preserves actual template numbers/raw text/state', () => { assert.equal(browserResult.number, 101); assert.equal(browserResult.name, 'SYNTHETIC'); assert.equal(browserResult.registered, 'preñada (3 meses)'); });
check('source browser repeat-row, widths and ten free rows survive byte roundtrip', () => { assert.equal(browserResult.print, '2:2'); assert.deepEqual(Array.from(browserResult.widths), widths); assert.equal(browserResult.rows, aoa.length); });
const browserBytes = Buffer.from(browserResult.bytes);
const read = XLSX.read(browserBytes, { type: 'buffer', cellDates: false });
check('browser source output is interoperable with existing SheetJS reader', () => {
  const sheet = read.Sheets[opts.nombreHoja]; assert.equal(sheet['!ref'], `A1:M${aoa.length}`); assert.equal(sheet.I3.v, 'preñada (3 meses)');
});
const JSZip = req('jszip'); const zip = await JSZip.loadAsync(browserBytes);
const sheetXML = await zip.file('xl/worksheets/sheet1.xml').async('string');
check('browser source conditional-format path invokes patched UUID v4 and emits valid IDs', () => assert.match(sheetXML, /\{[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}\}/));
const typedResult = await vm.runInContext(`(async()=>{
 const results=[];
 for(const date1904 of [false,true]){
  const w=new Workbook();w.properties.date1904=date1904;const s=w.addWorksheet('Types');const d=new Date(Date.UTC(2026,6,22,12));
  s.getCell('A1').value=d;s.getCell('A1').numFmt='dd/mm/yyyy hh:mm';s.getCell('B1').value={formula:'1+"bad"',result:{error:'#VALUE!'}};s.getCell('C1').value=0;
  const bytes=await w.xlsx.writeBuffer();const l=new Workbook();await l.xlsx.load(bytes);const t=l.worksheets[0];
  results.push({date1904:l.properties.date1904,date:t.getCell('A1').value.toISOString(),error:t.getCell('B1').value.result.error,zero:t.getCell('C1').value});
 }
 return JSON.stringify(results);
})()`, context);
check('source browser 1900/1904 dates, cached errors and real zero survive own byte loader', () => assert.deepEqual(JSON.parse(typedResult), [false, true].map(date1904 => ({ date1904, date: '2026-07-22T12:00:00.000Z', error: '#VALUE!', zero: 0 }))));
const audit = JSON.parse(readFileSync(resolve(scratch, 'patched-audit.json'), 'utf8'));
check('recorded patched scratch graph audit has zero reported advisories', () => assert.equal(audit.metadata.vulnerabilities.total, 0));
const result = { assertions: checks, bundleSHA256: createHash('sha256').update(source).digest('hex'), bundleBytes: Buffer.byteLength(source), vite: repoReq('vite/package.json').version, node: process.version, limitations: ['Web-API VM only, no real DOM/download/browser engine', 'unused fs/crypto methods externalized and unsupported', 'restricted Deno covered separately; hosted Deno unverified', 'no .xls or CSV proof', 'no adversarial expansion certification'], patchedUuidModules: graph.filter(id => id.includes('/node_modules/uuid/') && !id.startsWith('\0')).sort() };
writeFileSync(resolve(scratch, 'source-browser-result.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
