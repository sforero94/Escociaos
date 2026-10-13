import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import { leerHojasCrudas as source } from '../supabase/functions/server/hato-chequeo-spreadsheet';
import { leerHojasCrudas as deployed } from '../../supabase/functions/make-server-1ccce916/hato-chequeo-spreadsheet';

// Independent synthetic XML: raw 1904-date normalization, cached error, sparse
// non-A1 origin/trailing extent and workbook order are caller-visible contracts.
async function fixture() {
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const zip = new JSZip();
  zip.file('xl/workbook.xml', `<workbook xmlns="${ns}" xmlns:r="${rel}"><workbookPr date1904="1"/><sheets><sheet name="Zeta" sheetId="1" r:id="s1"/><sheet name="Alfa" sheetId="2" r:id="s2"/></sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="s1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="s2" Type="${rel}/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`);
  zip.file('xl/styles.xml', `<styleSheet xmlns="${ns}"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`);
  zip.file('xl/worksheets/sheet1.xml', `<worksheet xmlns="${ns}"><dimension ref="C3:G5"/><sheetData><row r="3"><c r="C3" s="1"><v>44763.50000000001</v></c><c r="D3" t="e"><f>1+"bad"</f><v>#VALUE!</v></c><c r="E3" t="b"><v>1</v></c><c r="F3"><v>0</v></c><c r="G3" t="inlineStr"><is><t> raw </t></is></c></row></sheetData></worksheet>`);
  zip.file('xl/worksheets/sheet2.xml', `<worksheet xmlns="${ns}"><sheetData/></worksheet>`);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
describe('Hato actual-byte server cutover', () => {
  it.each([source, deployed])('preserves all ordered raw sheets in each function-root package', async read => {
    expect(await read(await fixture(), 'synthetic.xlsx')).toEqual([
      { archivo: 'synthetic.xlsx', hoja: 'Zeta', filas: [[46225.50000000001, '#VALUE!', true, 0, ' raw '], [null, null, null, null, null], [null, null, null, null, null]] },
      { archivo: 'synthetic.xlsx', hoja: 'Alfa', filas: [] },
    ]);
  });
  it.each([source, deployed])('refuses legacy, unsupported, oversize and malformed bytes without records', async read => {
    await expect(read(await fixture(), 'legacy.xls')).rejects.toThrow(/Convierta.*Excel o LibreOffice/);
    await expect(read(await fixture(), 'rows.csv')).rejects.toThrow(/Se requiere .xlsx/);
    await expect(read(new Uint8Array(20 * 1024 * 1024 + 1), 'large.xlsx')).rejects.toThrow(/20 MiB/);
    await expect(read(new Uint8Array([80, 75, 3, 4]), 'broken.xlsx')).rejects.toThrow();
  });
  it('keeps preview mirrors exact and offline consumers on the awaited shared adapter', () => {
    const file = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
    const preview = file('../supabase/functions/server/hato-chequeo-preview.ts');
    expect(file('../../supabase/functions/make-server-1ccce916/hato-chequeo-preview.ts')).toBe(preview);
    expect(preview).toContain('hojas = await leerHojasCrudas(bytes, archivo.name)');
    expect(preview).toContain('20 * 1024 * 1024');
    for (const path of ['../../scripts/import-hato/extract.ts', '../../scripts/import-hato/backfill-leche.ts']) {
      const reader = file(path);
      expect(reader).toContain("from '../../src/utils/spreadsheet/index.ts'");
      expect(reader).toContain('await readXlsx(readFileSync(');
      expect(reader).toContain('sheet.rows');
      expect(reader).not.toMatch(/require\(['"]xlsx|XLSXTypes|RUTA_XLSX|obtenerXLSX/);
    }
  });
});
