#!/usr/bin/env node
/** Historical pre-cutover synthetic oracle (requires old SheetJS intentionally).
 * New portable acceptance: spreadsheetAdapter.test.ts and spreadsheet-adapter-*-proof.mjs.
 * Scratch-only synthetic XLSX proof. No app/dependency edits or domain I/O.
 * Usage: node scripts/security/exceljs-compatibility-proof.mjs [scratch-root]
 * Install exact approved ExcelJS in scratch with --ignore-scripts first.
 */
import assert from 'node:assert/strict';
import { createRequire, register } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

register('../import-hato/alias-hooks.mjs', import.meta.url);
const repo = fileURLToPath(new URL('../../', import.meta.url));
const scratch = resolve(process.argv[2] ?? resolve(repo, '../.escocia-xlsx-review'));
const requireScratch = createRequire(resolve(scratch, 'package.json'));
const requireRepo = createRequire(resolve(repo, 'package.json'));
const ExcelJS = requireScratch('exceljs');
const BrowserExcelJS = requireScratch('exceljs/dist/exceljs.min.js');
const JSZip = requireScratch('jszip');
const { SaxesParser } = requireScratch('saxes');
const XLSX = requireRepo('xlsx'); // Existing version is ONLY a synthetic oracle.
const TS = requireRepo('typescript');
const template = await import('../../src/utils/hato/exportarPlanillaChequeo.ts');
const { normalizarHojas } = await import('../../src/utils/importHato/normalizar.ts');
const { construirDiffChequeo } = await import('../../src/utils/importHato/diffChequeo.ts');
const calculations = await import('../../src/utils/calculosHato.ts');
const { parseToro } = await import('../../src/utils/importHato/parseToro.ts');
let count = 0;
const declaredRanges = new WeakMap();
function check(label, action) {
  action(); count++; console.log('PASS', label);
}
const config = {
  razas: ['jersey', 'holstein', 'normanda', 'gyr'],
  meses_secado_por_raza: { jersey: 2, holstein: 2, normanda: 3, _default: 2 },
  meses_gestacion_default: 9, umbral_partos_reemplazo: 9,
  ventana_proxima_secar_dias: 30, ventana_proximo_parir_dias: 30,
  dias_parto_proximo_alerta: 14, dias_servicio_sin_confirmacion: 45,
  dias_espera_voluntaria_post_parto: 60, dias_rechequeo_due: 60,
};
const epoch = Date.UTC(1899, 11, 30);
// Explicit 1900-normalized serials; numeric values are not guessed as dates.
function rawValue(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return (value.getTime() - epoch) / 86400000;
  if (typeof value !== 'object') return value;
  if (Object.hasOwn(value, 'formula') || Object.hasOwn(value, 'sharedFormula')) return rawValue(value.result);
  if (Object.hasOwn(value, 'error')) return value.error;
  if (value.richText) return value.richText.map(run => run.text).join('');
  if (Object.hasOwn(value, 'text')) return value.text;
  throw new Error('Unsupported synthetic raw cell shape');
}
function rawGrid(sheet) {
  // The convenience dimensions getter ignores empty rows. rowCount includes
  // serialized all-null rows; template columns are real header cells.
  if (!sheet.rowCount) return [];
  const range = declaredRanges.get(sheet) ?? { top: sheet.dimensions.top, left: sheet.dimensions.left, bottom: sheet.rowCount, right: sheet.columnCount };
  const rows = [];
  for (let row = range.top; row <= range.bottom; row++) {
    const cells = [];
    for (let col = range.left; col <= range.right; col++) cells.push(rawValue(sheet.getCell(row, col).value));
    rows.push(cells);
  }
  return rows;
}
function sheetJSGrid(sheet) {
  if (!sheet['!ref']) return [];
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const rows = [];
  for (let row = range.s.r; row <= range.e.r; row++) {
    const cells = [];
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
      cells.push(!cell || cell.v === undefined || cell.v === null ? null : cell.t === 'e' ? cell.w ?? '#VALUE!' : cell.v);
    }
    rows.push(cells);
  }
  return rows;
}
async function load(bytes, implementation = ExcelJS) {
  const zip = await JSZip.loadAsync(bytes);
  const workbook = new implementation.Workbook();
  await workbook.xlsx.load(bytes);
  // ExcelJS discards the input's declared dimension. Recover only metadata
  // with a real XML parser and relationship targets; do not reinterpret cells.
  function nodes(xml, tag) {
    const result = []; const parser = new SaxesParser();
    parser.on('opentag', node => { if (node.name === tag) result.push(node.attributes); });
    parser.write(xml).close(); return result;
  }
  const sheets = nodes(await zip.file('xl/workbook.xml').async('string'), 'sheet');
  const relationships = nodes(await zip.file('xl/_rels/workbook.xml.rels').async('string'), 'Relationship');
  for (const sheet of sheets) {
    const relation = relationships.find(item => item.Id === sheet['r:id']);
    assert(relation && !relation.TargetMode, 'only internal sheet relationships');
    const path = relation.Target.startsWith('/') ? relation.Target.slice(1) : `xl/${relation.Target}`;
    assert.match(path, /^xl\/worksheets\/[^/]+\.xml$/);
    const ref = nodes(await zip.file(path).async('string'), 'dimension')[0]?.ref;
    if (!ref) continue;
    const match = /^([A-Z]+)([1-9]\d*)(?::([A-Z]+)([1-9]\d*))?$/.exec(ref);
    assert(match, 'canonical synthetic dimension');
    const column = letters => [...letters].reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0);
    const range = { left: column(match[1]), top: Number(match[2]), right: column(match[3] ?? match[1]), bottom: Number(match[4] ?? match[2]) };
    assert(range.top <= range.bottom && range.left <= range.right && range.bottom <= 10000 && range.right <= 1024 && (range.bottom - range.top + 1) * (range.right - range.left + 1) <= 200000, 'bounded synthetic dimension');
    declaredRanges.set(workbook.getWorksheet(sheet.name), range);
  }
  return workbook;
}
function makeBook(rows, name, implementation = ExcelJS) {
  const workbook = new implementation.Workbook();
  const sheet = workbook.addWorksheet(name);
  sheet.addRows(rows);
  return { workbook, sheet };
}
function fixture(overrides) {
  const raw = {
    numero: 101, nombre: 'LUCERO', pl: 18.5, numPartos: 3,
    ultimaCria: '1/2/2025', sexoCria: 'ov', fechaServicio: '10/5/2026',
    toro: 'Toro Nitro', estado: 'ok', tratamiento: null,
    estadoRegistrado: null, secar: null, partoProbable: null, ...overrides,
  };
  const service = calculations.parseFechasServicio(raw.fechaServicio).fechas.at(-1) ?? null;
  const bull = parseToro(raw.toro, config);
  return {
    row: raw,
    animal: { id: `animal-${raw.numero}`, numero: raw.numero, nombre: raw.nombre, etapa: 'vaca', estado: 'activa' },
    previous: {
      animalId: `animal-${raw.numero}`, chequeoFecha: '2026-05-20',
      pl: calculations.parseValorNumerico(raw.pl).valor,
      numPartos: calculations.parseValorNumerico(raw.numPartos).valor,
      fechaServicio: service, toro: bull.toroNombre, tipoServicio: bull.tipoServicio,
      fechaSecar: service ? calculations.calcularFechaSecar(service, null, config) : null,
      fechaProbableParto: service ? calculations.calcularPartoProbable(service, config) : null,
      estado: calculations.parseEstado(raw.estado).tipo,
    },
  };
}
const lucero = fixture({});
const estrella = fixture({ numero: 205, nombre: 'ESTRELLA', pl: 12, numPartos: 1, ultimaCria: null, sexoCria: null, fechaServicio: null, toro: null, estado: 'rech', tratamiento: 'Vit ADE' });
const options = {
  tituloHoja: template.construirTituloHojaChequeo('2026-07-22'),
  nombreHoja: template.construirNombreHojaChequeo('2026-07-22'),
  filas: [lucero.row, estrella.row],
};
const lock = JSON.parse(readFileSync(resolve(scratch, 'package-lock.json'), 'utf8'));
check('genuine pinned registry ExcelJS lock integrity', () => {
  assert.equal(lock.packages['node_modules/exceljs'].version, '4.4.0');
  assert.equal(lock.packages['node_modules/exceljs'].resolved, 'https://registry.npmjs.org/exceljs/-/exceljs-4.4.0.tgz');
  assert.equal(lock.packages['node_modules/exceljs'].integrity, 'sha512-XctvKaEMaj1Ii9oDOqbW/6e1gXknSY4g/aLCDicOXqBE4M0nRWkUu0PTp++UPNzoFY12BNHMfs/VadKIS6llvg==');
});
const aoa = template.construirAOAPlanillaChequeo(options.tituloHoja, options.filas);
const original = template.construirLibroPlanillaChequeo(XLSX, options);
const originalBytes = XLSX.write(original, { type: 'buffer', bookType: 'xlsx' });
const baseline = XLSX.read(originalBytes, { type: 'buffer', cellDates: false });
const baselineRows = sheetJSGrid(baseline.Sheets[options.nombreHoja]);
const originalWithNewReader = await load(originalBytes);
check('existing real SheetJS template bytes read through ExcelJS raw adapter', () => assert.deepEqual(rawGrid(originalWithNewReader.worksheets[0]), baselineRows));
const widths = original.Sheets[options.nombreHoja]['!cols'].map(col => col.wch);
// Current SheetJS wch uses MDW=6 and stores padded Excel width units.
// Directly assigning wch to ExcelJS.width changes actual column geometry.
const encodedWidths = widths.map(width => Math.round((width * 6 + 5) / 6 * 256) / 256);
const baselineStyles = XLSX.read(originalBytes, { type: 'buffer', cellStyles: true });
check('explicit character-width conversion matches existing serialized column geometry', () => assert.deepEqual(encodedWidths, baselineStyles.Sheets[options.nombreHoja]['!cols'].map(col => col.width)));
const margins = original.Sheets[options.nombreHoja]['!margins'];
for (const [label, implementation] of [['Node', ExcelJS], ['upstream prebuilt browser in Node only', BrowserExcelJS]]) {
  const { workbook, sheet } = makeBook(aoa, options.nombreHoja, implementation);
  encodedWidths.forEach((width, i) => { sheet.getColumn(i + 1).width = width; });
  sheet.pageSetup.margins = margins;
  sheet.pageSetup.printTitlesRow = '2:2';
  const bytes = await workbook.xlsx.writeBuffer();
  const reread = await load(bytes, implementation);
  const rows = rawGrid(reread.worksheets[0]);
  const oldRead = XLSX.read(bytes, { type: 'buffer', cellDates: false });
  check(`${label}: XLSX bytes preserve exact existing Hato template raw grid`, () => assert.deepEqual(rows, baselineRows));
  check(`${label}: bytes remain readable by current SheetJS raw reader`, () => assert.deepEqual(sheetJSGrid(oldRead.Sheets[options.nombreHoja]), baselineRows));
  check(`${label}: 13 columns, one header and ten null free rows`, () => {
    assert.equal(rows[1].length, 13); assert.equal(rows.length, 14);
    assert.equal(rows.filter(row => row[0] === '#').length, 1);
    assert(rows.slice(-10).every(row => row.every(cell => cell === null)));
  });
  check(`${label}: widths, margins and repeat-row metadata survive reload`, () => {
    assert.deepEqual(reread.worksheets[0].columns.map(col => col.width), encodedWidths);
    assert.deepEqual(reread.worksheets[0].pageSetup.margins, margins);
    assert.equal(reread.worksheets[0].pageSetup.printTitlesRow, '2:2');
  });
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('xl/workbook.xml').async('string');
  const sheetXml = await zip.file('xl/worksheets/sheet1.xml').async('string');
  check(`${label}: serialized XML contains Print Titles, complete dimension and margins`, () => {
    assert.match(xml, /name="_xlnm.Print_Titles"/); assert.match(xml, /\$2:\$2/);
    assert.match(sheetXml, /dimension ref="A1:M14"/); assert.match(sheetXml, /<pageMargins left="0\.4"/);
  });
  const normalized = normalizarHojas([{ archivo: 'synthetic.xlsx', hoja: options.nombreHoja, filas: rows }], '2026-07-24T00:00:00.000Z', config);
  check(`${label}: actual Hato normalizer preserves date confidence and phantom free-row count`, () => {
    assert.equal(normalized.chequeos.length, 2);
    assert(normalized.chequeos.every(row => row.chequeoFecha === '2026-07-22' && row.chequeoFechaConfianza === 'exacta' && row.issues.length === 0));
    assert.equal(normalized.hojas[0].descartesPorMotivo.fantasma, 10);
  });
  const diff = construirDiffChequeo(normalized.chequeos, [lucero.animal, estrella.animal], [lucero.previous, estrella.previous]);
  check(`${label}: actual diff against original animal state is empty`, () => {
    assert.equal(diff.resumen.sinCambio, 2); assert.equal(diff.resumen.cambios, 0);
    assert(diff.filas.every(row => row.clasificacion === 'sin_cambio' && row.diferencias.length === 0));
  });
  // UUID v4 conditional-format path is outside the template but directly
  // exercises the audited dependency override without calling v3/v5 APIs.
  sheet.addConditionalFormatting({ ref: 'C3:C4', rules: [{ type: 'dataBar', minLength: 0, maxLength: 100, cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: 'FF009900' } }] });
  const conditional = await JSZip.loadAsync(await workbook.xlsx.writeBuffer());
  check(`${label}: conditional-format UUID v4 generation serializes valid IDs`, () => assert.match((conditional.file('xl/worksheets/sheet1.xml') ? sheet.model.conditionalFormattings[0].rules[0].x14Id : ''), /^\{[0-9A-F-]{36}\}$/));
}

// Cached formula results and Date objects require deliberate raw mapping.
for (const date1904 of [false, true]) {
  const { workbook, sheet } = makeBook([], `types-${date1904}`);
  workbook.properties.date1904 = date1904;
  const date = new Date(Date.UTC(2026, 6, 22, 12));
  sheet.getCell('A1').value = date; sheet.getCell('A1').numFmt = 'dd/mm/yyyy hh:mm';
  sheet.getCell('B1').value = { formula: 'DATE(2026,7,22)', result: date }; sheet.getCell('B1').numFmt = 'dd/mm/yyyy hh:mm';
  sheet.getCell('C1').value = { error: '#VALUE!' };
  sheet.getCell('D1').value = { formula: '1+"bad"', result: { error: '#VALUE!' } };
  sheet.getCell('E1').value = { formula: '2+3', result: 5 };
  sheet.getCell('F1').value = { formula: 'A999' };
  sheet.getCell('G1').value = true; sheet.getCell('H1').value = 0;
  sheet.getCell('I1').value = { richText: [{ text: 'raw ' }, { text: 'text' }] };
  sheet.getCell('J1').value = { text: 'Shown', hyperlink: 'https://synthetic.invalid' };
  sheet.getCell('K1').value = '=1+2'; sheet.getCell('L1').value = '  unchanged raw  ';
  sheet.getCell('M1').value = { sharedFormula: 'E1', result: 6 };
  const bytes = await workbook.xlsx.writeBuffer();
  const reread = await load(bytes); const row = rawGrid(reread.worksheets[0])[0];
  const serial1900 = (date.getTime() - epoch) / 86400000;
  check(`${date1904 ? '1904' : '1900'} date-system: direct and cached dates normalize to existing UTC serial contract`, () => {
    assert.equal(reread.properties.date1904, date1904); assert.equal(row[0], serial1900); assert.equal(row[1], serial1900);
  });
  check(`${date1904 ? '1904' : '1900'} typed errors/formulas retain raw semantics`, () => assert.deepEqual(row.slice(2, 8), ['#VALUE!', '#VALUE!', 5, null, true, 0]));
  check(`${date1904 ? '1904' : '1900'} text/rich-text/hyperlink/shared-formula semantics`, () => assert.deepEqual(row.slice(8), ['raw text', 'Shown', '=1+2', '  unchanged raw  ', 6]));
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('xl/worksheets/sheet1.xml').async('string');
  const writtenSerial = Number(xml.match(/<c r="A1"[^>]*><v>([^<]+)/)[1]);
  check(`${date1904 ? '1904' : '1900'} serialized date serial uses workbook epoch`, () => assert.equal(writtenSerial, serial1900 - (date1904 ? 1462 : 0)));
}

const registered = makeBook(template.construirAOAPlanillaChequeo(options.tituloHoja, [fixture({ estadoRegistrado: 'preñada (3 meses)' }).row]), options.nombreHoja);
const registeredRows = rawGrid((await load(await registered.workbook.xlsx.writeBuffer())).worksheets[0]);
check('Estado registrado preserved verbatim at its actual template column', () => assert.equal(registeredRows[2][8], 'preñada (3 meses)'));
const emptyAOA = template.construirAOAPlanillaChequeo(options.tituloHoja, []);
emptyAOA[2] = [950, 'RECIEN LLEGADA', null, null, null, null, null, null, null, 'ok', null, null, null];
const filled = makeBook(emptyAOA, options.nombreHoja);
const filledRows = rawGrid((await load(await filled.workbook.xlsx.writeBuffer())).worksheets[0]);
const filledNormalized = normalizarHojas([{ archivo: 'synthetic.xlsx', hoja: options.nombreHoja, filas: filledRows }], '2026-07-24T00:00:00.000Z', config);
check('populated free row becomes one real animal and remaining nine are phantom rows', () => {
  assert.equal(filledNormalized.chequeos.length, 1); assert.equal(filledNormalized.chequeos[0].numero, 950); assert.equal(filledNormalized.hojas[0].descartesPorMotivo.fantasma, 9);
});

function fixedObjects(rows, keys, skip) {
  return rows.slice(skip).filter(row => row.some(value => value !== null)).map(row => Object.fromEntries(keys.map((key, i) => [key, row[i] ?? ''])));
}
function sourceArray(file, name) {
  const source = TS.createSourceFile(file, readFileSync(resolve(repo, file), 'utf8'), TS.ScriptTarget.Latest, true, TS.ScriptKind.TSX);
  let array;
  function visit(node) {
    if (!array && TS.isVariableDeclaration(node) && node.name.getText(source) === name && node.initializer && TS.isArrayLiteralExpression(node.initializer)) array = node.initializer;
    TS.forEachChild(node, visit);
  }
  visit(source); assert(array, 'expected current literal template array'); return array;
}
function literal(node) {
  if (TS.isStringLiteral(node)) return node.text;
  if (TS.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === TS.SyntaxKind.NullKeyword) return null;
  if (TS.isArrayLiteralExpression(node)) return node.elements.map(literal);
  if (TS.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map(property => {
    assert(TS.isPropertyAssignment(property) && TS.isStringLiteral(property.name), 'only literal object fields');
    return [property.name.text, literal(property.initializer)];
  }));
  throw new Error('nonliteral template fixture expression');
}
for (const [name, keys] of [
  ['Plantilla Gastos', ['Fecha', 'Negocio', 'Región', 'Categoría', 'Concepto', 'Proveedor', 'Medio de Pago', 'Nombre del Gasto', 'Valor', 'Observaciones', 'Estado']],
  ['Plantilla Ingresos', ['Fecha', 'Negocio', 'Región', 'Categoría', 'Comprador', 'Medio de Pago', 'Nombre del Ingreso', 'Valor', 'Observaciones']],
]) {
  const file = name === 'Plantilla Gastos' ? 'src/components/finanzas/components/CargaMasivaGastos.tsx' : 'src/components/finanzas/components/CargaMasivaIngresos.tsx';
  check(`${name}: synthetic matrix uses actual current template header order`, () => assert.deepEqual(keys, literal(sourceArray(file, 'templateData').elements[0])));
  const amount = keys.indexOf('Valor');
  const data = keys.map((_, i) => i === 0 ? 46225 : i === amount ? 1234.56 : i === 1 ? 'Escocia' : null);
  const rows = [keys, keys.map(() => 'instructions'), data, keys.map(() => null)];
  const current = XLSX.utils.aoa_to_sheet(rows);
  const expected = XLSX.utils.sheet_to_json(current, { range: 2, header: keys, defval: '' });
  const book = makeBook(rows, name);
  const actual = fixedObjects(rawGrid((await load(await book.workbook.xlsx.writeBuffer())).worksheets[0]), keys, 2);
  check(`${name}: real bytes retain fixed headers, skip two rows, empty defaults and numeric amount`, () => assert.deepEqual(actual, expected));
}
const monitorObjects = literal(sourceArray('src/components/monitoreo/CargaMasiva.tsx', 'data'));
const monitorKeys = Object.keys(monitorObjects[0]);
const monitorRows = [monitorKeys, ...monitorObjects.map(object => monitorKeys.map(key => object[key]))];
const extraMonitor = { ...monitorObjects[0], 'Fecha (YYYY-MM-DD)': 46225, 'Árboles Monitoreados': 0, Observaciones: ' raw ' };
monitorRows.push(monitorKeys.map(key => extraMonitor[key]));
const monitor = makeBook(monitorRows, 'Monitoreos');
const monitorRaw = rawGrid((await load(await monitor.workbook.xlsx.writeBuffer())).worksheets[0]);
check('actual nine-column monitoring template plus raw serial date/zero/text round-trip', () => { assert.equal(monitorKeys.length, 9); assert.deepEqual(monitorRaw, monitorRows); });
const reports = new ExcelJS.Workbook();
const pyg = reports.addWorksheet('P&G'); pyg.addRows([['Synthetic P&G'], [], [], ['Concepto', 'Q1'], ['Ingreso', 1200], ['Costo', -400], ['Margen', 25], ['Sin dato', null]]);
const cash = reports.addWorksheet('Flujo de Caja'); cash.addRows([['Synthetic cash'], [], [], ['Concepto', 'Enero', 'Total'], ['Salida', -400, -400]]);
pyg.getCell('B5').numFmt = '#,##0'; pyg.getCell('B6').numFmt = '#,##0'; pyg.getCell('B7').numFmt = '0.0"%"';
const inv = reports.addWorksheet('Inventario'); inv.addRows([['Producto', 'Cantidad', 'Unidad', 'Categoría'], ['Boro', 198.125, 'Kilos', 'Fertilizante']]); inv.getCell('B2').numFmt = '#,##0.####';
const reportBytes = await reports.xlsx.writeBuffer(); const reportLoaded = await load(reportBytes);
check('ordered multiple sheets and signed financial numbers survive bytes', () => {
  assert.deepEqual(reportLoaded.worksheets.map(sheet => sheet.name), ['P&G', 'Flujo de Caja', 'Inventario']);
  assert.equal(reportLoaded.worksheets[0].getCell('B6').value, -400); assert.equal(reportLoaded.worksheets[1].getCell('B5').value, -400);
});
check('missing data remains null and percentage value is not divided by 100', () => {
  assert.equal(reportLoaded.worksheets[0].getCell('B8').value, null); assert.equal(reportLoaded.worksheets[0].getCell('B7').value, 25);
});
check('currency, literal percentage and inventory numeric formats persist', () => {
  assert.equal(reportLoaded.worksheets[0].getCell('B5').numFmt, '#,##0'); assert.equal(reportLoaded.worksheets[0].getCell('B7').numFmt, '0.0"%"');
  assert.equal(reportLoaded.worksheets[2].getCell('B2').numFmt, '#,##0.####'); assert.equal(reportLoaded.worksheets[2].getCell('B2').value, 198.125);
});
const zipReports = await JSZip.loadAsync(reportBytes); const styles = await zipReports.file('xl/styles.xml').async('string');
check('actual styles XML retains escaped literal percent and inventory custom format', () => { assert.match(styles, /0\.0&amp;quot;|0\.0&quot;%&quot;/); assert.match(styles, /#,##0\.####/); });
const sparse = makeBook([], 'sparse'); sparse.sheet.getCell('B3').value = 'offset'; sparse.sheet.getCell('D5').value = 7;
const sparseBytes = await sparse.workbook.xlsx.writeBuffer(); const sparseOld = XLSX.read(sparseBytes, { type: 'buffer' });
const sparseLoaded = await load(sparseBytes);
check('sparse used-range origin and holes match current raw reader', () => assert.deepEqual(rawGrid(sparseLoaded.worksheets[0]), sheetJSGrid(sparseOld.Sheets.sparse)));
let legacyRejected = false;
try { await load(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])); } catch { legacyRejected = true; }
check('binary XLS signature refuses XLSX loader; no legacy-support claim', () => assert(legacyRejected));
const summary = { assertions: count, scratch, node: process.version, exceljs: '4.4.0', uuid: requireScratch('uuid/package.json').version, browserNote: 'Official prebuilt exercised in Node, not actual browser/Deno; no prebuilt advisory-removal claim', limits: ['legacy .xls unsupported', 'CSV not yet implemented', 'restricted Deno runtime covered by separate bundle proof', 'source browser bundling separate proof', 'no expansion/fuzz/production certification'] };
writeFileSync(resolve(scratch, 'compatibility-result.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
