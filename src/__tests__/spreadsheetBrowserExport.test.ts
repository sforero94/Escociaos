import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import JSZip from 'jszip';
import { readXlsx, writeXlsx } from '@/utils/spreadsheet';
import { exportarExcelReportes } from '@/utils/exportarExcelReportes';
import { mensajeErrorCargaDiferida } from '@/utils/errorCargaDiferida';
import type { ReportePyG, ReporteFlujoCaja } from '@/types/reportesFinancieros';

function load(path: string, name: string, dependencies: Record<string, unknown>) {
  const sf = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(sf) === name) expression = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!expression) throw Error(`Missing ${name}`);
  const source = expression.getText(sf).replace(/await import\(['"][^'"]+['"]\)/g, 'spreadsheet');
  const code = ts.transpileModule(`const handler = ${source};`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  return new Function(...Object.keys(dependencies), `${code}; return handler;`)(...Object.values(dependencies));
}
const templates = [
  { path: 'src/components/monitoreo/CargaMasiva.tsx', handler: 'construirYDescargarPlantilla', name: 'Monitoreos', filename: 'plantilla_monitoreos_2026-10-13.xlsx', widths: [18,15,15,25,20,18,22,20,35], header: 'Fecha (YYYY-MM-DD)' },
  { path: 'src/components/finanzas/components/CargaMasivaGastos.tsx', handler: 'descargarPlantilla', name: 'Plantilla Gastos', filename: 'plantilla_gastos_2026-10-13.xlsx', widths: [12,20,20,20,25,25,20,35,15,30,12], header: 'Fecha' },
  { path: 'src/components/finanzas/components/CargaMasivaIngresos.tsx', handler: 'descargarPlantilla', name: 'Plantilla Ingresos', filename: 'plantilla_ingresos_2026-10-13.xlsx', widths: [12,20,20,25,25,20,35,15,30], header: 'Fecha' },
];
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('browser template and financial report export bytes', () => {
  for (const template of templates) {
    it(`${template.name} preserves worksheet, filename, header and MDW6 widths`, async () => {
      const downloadXlsx = vi.fn();
      const onError = vi.fn();
      const handler = load(template.path, template.handler, {
        spreadsheet: { writeXlsx, downloadXlsx }, obtenerFechaHoy: () => '2026-10-13',
        negocios: [{ id: 'farm', nombre: 'Farm' }], regiones: [], categorias: [], conceptos: [], proveedores: [], compradores: [], mediosPago: [],
        loadCatalogs: vi.fn(), onError, mensajeErrorCargaDiferida,
      });
      await handler();
      expect(onError).not.toHaveBeenCalled();
      expect(downloadXlsx).toHaveBeenCalledOnce();
      const [bytes, filename] = downloadXlsx.mock.calls[0];
      expect(filename).toBe(template.filename);
      const workbook = await readXlsx(bytes);
      expect(workbook.sheets.map(sheet => sheet.name)).toEqual([template.name]);
      expect(workbook.sheets[0].rows[0][0]).toBe(template.header);
      if (template.name === 'Monitoreos') expect(workbook.sheets[0].rows[1].slice(4, 7)).toEqual([35, 5, 12]);
      const zip = await JSZip.loadAsync(bytes);
      const xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
      const widths: number[] = [];
      for (const match of xml.matchAll(/<col\s[^>]*\/>/g)) {
        const min = Number(match[0].match(/min="(\d+)"/)![1]);
        const max = Number(match[0].match(/max="(\d+)"/)![1]);
        const width = Number(match[0].match(/width="([^"]+)"/)![1]);
        for (let column = min; column <= max; column++) widths[column - 1] = width;
      }
      // Independent legacy MDW6 golden widths for these integer wch values.
      expect(widths).toEqual(template.widths.map(width => width + 0.83203125));
    });
  }
  it.each(templates.slice(1))('$name reports serialization failure and never downloads', async template => {
    const downloadXlsx = vi.fn(), onError = vi.fn();
    const handler = load(template.path, template.handler, {
      spreadsheet: { writeXlsx: vi.fn(async () => { throw Error('synthetic serialization failure'); }), downloadXlsx },
      obtenerFechaHoy: () => '2026-10-13', negocios: [{ id: 'farm', nombre: 'Farm' }], regiones: [], categorias: [], conceptos: [], proveedores: [], compradores: [], mediosPago: [],
      loadCatalogs: vi.fn(), onError, mensajeErrorCargaDiferida, console: { error: vi.fn() },
    });
    await handler();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('synthetic serialization failure'));
    expect(downloadXlsx).not.toHaveBeenCalled();
  });
  it('preserves report sheet order, signed numeric values, literal percent formats and download cleanup', async () => {
    const pyg: ReportePyG = {
      version: 2, modo: 'trimestres', vista: 'global', vista_nombre: 'Toda la finca', anio: 2026,
      periodos: [{ key: 'Q1', label: 'Q1', egresos: { desde: '2026-01-01', hasta: '2026-03-31' }, ingresos: { modo: 'fecha' }, descripcion: 'Q1' }],
      lineas: [
        { id: 'cost', nivel: 1, tipo: 'detalle', etiqueta: 'Costos', valores: [123.5], esResta: true, formato: 'moneda' },
        { id: 'margin', nivel: 0, tipo: 'indicador', etiqueta: 'Margen', valores: [12.3], esResta: false, formato: 'porcentaje' },
        { id: 'missing', nivel: 0, tipo: 'indicador', etiqueta: 'Sin dato', valores: [0], sinDato: [true], esResta: false, formato: 'porcentaje' },
      ],
      totales: { ingresos: [], costos_directos: [], margen_contribucion: [], gastos_indirectos: [], utilidad_operativa: [], margen_contribucion_pct: [], utilidad_operativa_pct: [] }, advertencias: [],
    };
    const flujo: ReporteFlujoCaja = {
      version: 1, vista: 'global', vista_nombre: 'Toda la finca', anio: 2026, meses_label: ['Enero'],
      lineas: [{ id: 'out', nivel: 1, tipo: 'detalle', etiqueta: 'Salida', meses: [15.25], total: 15.25, signo: 'salida' }],
      totales: { entradas: [], salidas: [], flujo_neto: [], flujo_acumulado: [] }, saldo_inicial: 0, saldo_inicial_es_supuesto: true, advertencias: [],
    };
    let blob: Blob | undefined;
    const link = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
    vi.spyOn(URL, 'createObjectURL').mockImplementation(value => { blob = value as Blob; return 'blob:synthetic'; });
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.stubGlobal('document', { createElement: () => link, body: { appendChild: vi.fn() } });
    await exportarExcelReportes(pyg, flujo);
    expect(link.download).toBe('reportes-toda-la-finca-2026.xlsx');
    expect(link.click).toHaveBeenCalledOnce();
    expect(link.remove).toHaveBeenCalledOnce();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(revoke).toHaveBeenCalledWith('blob:synthetic');
    expect(blob!.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const bytes = new Uint8Array(await blob!.arrayBuffer());
    const workbook = await readXlsx(bytes);
    expect(workbook.sheets.map(sheet => sheet.name)).toEqual(['P&G', 'Flujo de Caja']);
    expect(workbook.sheets[0].rows.slice(4,7).map(row => row.slice(0,2))).toEqual([['  Costos', -123.5], ['Margen', 12.3], ['Sin dato', null]]);
    expect(workbook.sheets[1].rows[4]).toEqual(['  Salida', -15.25, -15.25]);
    const zip = await JSZip.loadAsync(bytes);
    const styles = await zip.file('xl/styles.xml')!.async('string');
    expect(styles).toContain('<xf numFmtId="3"'); // built-in #,##0
    expect(styles).toContain('formatCode="0.0&quot;%&quot;"');
    const xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    expect(xml).toContain('<c r="B5" s="1"><v>-123.5</v></c>');
    expect(xml).toMatch(/<c r="B6" s="\d+"><v>12.3<\/v><\/c>/);
  });
});
