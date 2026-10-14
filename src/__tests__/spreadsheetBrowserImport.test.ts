import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import JSZip from 'jszip';
import { readImportFile } from '../utils/spreadsheet/importFile';
import { readXlsx, writeXlsx } from '../utils/spreadsheet';
import { XLSX_LIMITS } from '../utils/spreadsheet/limits';

function file(name: string, bytes: Uint8Array | string) {
  const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  return { name, size: data.length, arrayBuffer: vi.fn(async () => new Uint8Array(data).buffer) };
}
function expression(path: string, name: string) {
  const sf = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(sf) === name && node.initializer) found = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(sf);
  if (!found) throw Error(`Missing ${name}`);
  return found.getText(sf);
}
function load(path: string, name: string, dependencies: Record<string, unknown>) {
  const code = ts.transpileModule(`const handler = ${expression(path, name)};`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  return new Function(...Object.keys(dependencies), `${code}; return handler;`)(...Object.values(dependencies));
}
const monitoring = 'src/components/monitoreo/CargaMasiva.tsx';
const finances = ['Gastos', 'Ingresos'].map(kind => `src/components/finanzas/components/CargaMasiva${kind}.tsx`);

describe('bounded browser import admission and actual consumer handlers', () => {
  it.each(['old.xls', 'wrong.pdf', 'rows.csv'])('refuses unsupported finance input %s without reading bytes', async name => {
    const input = file(name, 'untrusted');
    await expect(readImportFile(input)).rejects.toThrow(name.endsWith('.xls') ? 'Convierta' : '.xlsx');
    expect(input.arrayBuffer).not.toHaveBeenCalled();
  });
  it('rejects advertised oversize before allocation and dishonest byte size after reading', async () => {
    const oversized = { ...file('large.xlsx', ''), size: XLSX_LIMITS.archiveBytes + 1 };
    await expect(readImportFile(oversized)).rejects.toThrow('20 MiB');
    expect(oversized.arrayBuffer).not.toHaveBeenCalled();
    const dishonest = { ...file('large.csv', new Uint8Array(XLSX_LIMITS.archiveBytes + 1)), size: 1 };
    await expect(readImportFile(dishonest, { allowCsv: true })).rejects.toThrow('20 MiB');
  });
  it('uses only the first sheet with inferred headers and typed zero/false/date serial', async () => {
    const bytes = await writeXlsx([
      { name: 'First', rows: [['Name', 'Amount', 'Active', 'Date', 'Empty'], ['x', 0, false, 46308, null]] },
      { name: 'Ignored', rows: [['Bad'], ['other']] },
    ]);
    const reader = load(monitoring, 'leerArchivo', { readImportFile });
    expect(await reader(file('monitor.xlsx', bytes))).toEqual([{ Name: 'x', Amount: 0, Active: false, Date: 46308 }]);
  });
  it('keeps quoted CSV delimiters/newlines, decimal/scientific values, dates and formula text', async () => {
    const input = file('monitor.csv', 'Date,Name,Count,Active,Blank,Formula\n2026-10-13,"quoted, name\nnext",1e2,FALSE,,=SUM(A1)\n');
    const reader = load(monitoring, 'leerArchivo', { readImportFile });
    expect(await reader(input)).toEqual([{ Date: '2026-10-13', Name: 'quoted, name\nnext', Count: 100, Active: false, Formula: '=SUM(A1)' }]);
  });
  it('accepts a valid single-column CSV without a guessed delimiter', async () => {
    expect(await readImportFile(file('one.csv', 'Name\nFarm\n'), { allowCsv: true })).toEqual([{ Name: 'Farm' }]);
  });
  it('aligns finance headers to absolute columns and skips absolute worksheet rows for sparse B3 data', async () => {
    const generated = await writeXlsx([{ name: 'Sparse', rows: [[], [], [null, 'Farm', null, 0]] }]);
    const zip = await JSZip.loadAsync(generated);
    const xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    zip.file('xl/worksheets/sheet1.xml', xml.replace('ref="A3:D3"', 'ref="B3:D3"').replace(/<c r="A3"[^>]*\/>/, ''));
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const raw = await readXlsx(bytes);
    expect(raw.sheets[0].range).toEqual({ top: 3, left: 2, bottom: 3, right: 4 });
    expect(await readImportFile(file('sparse.xlsx', bytes), {
      headers: ['Date', 'Business', 'Region', 'Amount'], skipRows: 2, defaultValue: '',
    })).toEqual([{ Date: '', Business: 'Farm', Region: '', Amount: 0 }]);
  });
  it.each([
    ['bad.csv', 'Name,Value\n"unterminated,3'],
    ['columns.csv', Array(257).fill('header').join(',')],
    ['rows.csv', 'header\n' + 'x\n'.repeat(XLSX_LIMITS.rows)],
    ['cells.csv', Array(256).fill('x').join(',') + '\n' + (Array(256).fill('x').join(',') + '\n').repeat(3906)],
  ])('refuses malformed or over-budget CSV %s', async (name, text) => {
    await expect(readImportFile(file(name, text), { allowCsv: true })).rejects.toThrow('CSV inválido');
  });
  it('refuses non-UTF8 CSV', async () => {
    await expect(readImportFile(file('bad.csv', new Uint8Array([0xff])), { allowCsv: true })).rejects.toThrow('UTF-8');
  });
  it('rejects hostile ZIP traversal through the actual monitoring reader', async () => {
    const zip = new JSZip(); zip.file('../evil.xml', '<x/>');
    const reader = load(monitoring, 'leerArchivo', { readImportFile });
    await expect(reader(file('bad.xlsx', await zip.generateAsync({ type: 'uint8array' })))).rejects.toThrow('ruta ZIP ambigua');
  });
  it('does not move an Excel date to the previous day in Bogota', () => {
    const normalize = load(monitoring, 'normalizarFecha', {});
    const previous = process.env.TZ;
    try {
      for (const zone of ['UTC', 'America/Bogota']) {
        process.env.TZ = zone;
        expect(normalize(46308)).toBe('2026-10-13');
        expect(normalize('2026-10-13')).toBe('2026-10-13');
      }
    } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
  });
  for (const path of finances) {
    it(`${path} keeps its fixed schema, two skipped rows and blank defaults`, async () => {
      const code = expression(path, 'handleFileUpload');
      const options = code.match(/readImportFile\(file, (\{[\s\S]*?\})\)/)![1];
      const mapping = new Function(`return (${options});`)();
      const expense = path.includes('Gastos');
      const bytes = await writeXlsx([{ name: 'Finance', rows: [
        ['irrelevant header'], ['instructions'],
        expense ? [46308, 'Farm', 'Region', 'Category', 'Concept', null, 'Cash', 'Expense', 0, null, 'Pendiente']
          : [46308, 'Farm', 'Region', 'Category', null, 'Cash', 'Income', 0, null],
        [],
      ] }]);
      const rows = await readImportFile(file('finance.xlsx', bytes), mapping);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ Fecha: 46308, Negocio: 'Farm', Valor: 0, Observaciones: '', 'Medio de Pago': 'Cash' });
      expect(rows[0]).toHaveProperty(expense ? 'Proveedor' : 'Comprador', '');
      expect(rows[0]).toHaveProperty(expense ? 'Nombre del Gasto' : 'Nombre del Ingreso', expense ? 'Expense' : 'Income');
      expect(rows[0]).not.toHaveProperty(expense ? 'Comprador' : 'Concepto');
    });
    it(`${path} surfaces admission errors before catalog queries or writes`, async () => {
      const onError = vi.fn(), getSupabase = vi.fn(() => { throw Error('Unexpected database access'); });
      const noop = vi.fn();
      const handler = load(path, 'handleFileUpload', {
        readImportFile, getSupabase, onError, console: { error: noop }, fileInputRef: { current: null },
        mensajeErrorCargaDiferida: (error: Error) => error.message,
        setCurrentFile: noop, setLoading: noop, setErrors: noop, setSuccessCount: noop, setProgress: noop,
      });
      const input = file('legacy.xls', 'untrusted');
      await handler({ target: { files: [input] } });
      expect(onError).toHaveBeenCalledWith(expect.stringContaining('Convierta'));
      expect(input.arrayBuffer).not.toHaveBeenCalled();
      expect(getSupabase).not.toHaveBeenCalled();
    });
  }
});
