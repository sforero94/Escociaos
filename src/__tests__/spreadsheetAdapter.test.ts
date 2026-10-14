import { describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';
import { readXlsx, writeXlsx, rowsToObjects, characterWidth, downloadXlsx } from '../utils/spreadsheet';
import { inspectXlsxArchive, XLSX_LIMITS } from '../utils/spreadsheet/archive';
const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
// Golden OOXML input is assembled directly, independently of either spreadsheet library.
async function golden(sheet: string, extras: Record<string, string> = {}, options: {
    date1904?: boolean;
    relations?: string;
    names?: string[];
} = {}): Promise<Uint8Array> {
    const names = options.names ?? ['Golden'];
    const zip = new JSZip();
    zip.file('[Content_Types].xml', `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
    zip.file('_rels/.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="root" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
    zip.file('xl/workbook.xml', `<workbook xmlns="${ns}" xmlns:r="${rel}"><workbookPr date1904="${options.date1904 ? '1' : '0'}"/><sheets>${names.map((name, i) => `<sheet name="${name}" sheetId="${i + 1}" r:id="s${i + 1}"/>`).join('')}</sheets></workbook>`);
    zip.file('xl/_rels/workbook.xml.rels', options.relations ?? `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_, i) => `<Relationship Id="s${i + 1}" Type="${rel}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="styles" Type="${rel}/styles" Target="styles.xml"/></Relationships>`);
    zip.file('xl/styles.xml', `<styleSheet xmlns="${ns}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`);
    names.forEach((_, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, `<worksheet xmlns="${ns}">${sheet}</worksheet>`));
    for (const [path, value] of Object.entries(extras))
        zip.file(path, value);
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
const row = (content: string) => `<sheetData><row r="1">${content}</row></sheetData>`;
const cell = (ref: string, value: string, attrs = '') => `<c r="${ref}" ${attrs}><v>${value}</v></c>`;
describe('real XLSX adapter, independent OOXML expectations', () => {
    it('keeps declared sparse origin, trailing blanks and workbook order', async () => {
        const bytes = await golden('<dimension ref="C3:E6"/><sheetData><row r="3"><c r="C3" t="inlineStr"><is><t> raw </t></is></c></row><row r="5"><c r="E5"><v>0</v></c></row></sheetData>', {}, { names: ['Second', 'First'] });
        const book = await readXlsx(bytes);
        expect(book.sheets.map(s => s.name)).toEqual(['Second', 'First']);
        expect(book.sheets[0]).toEqual({ name: 'Second', range: { top: 3, left: 3, bottom: 6, right: 5 }, rows: [[' raw ', null, null], [null, null, null], [null, null, 0], [null, null, null]] });
    });
    it.each([false, true])('keeps precise raw date/cache/error/zero values with date1904=%s', async (date1904) => {
        const contents = cell('A1', '60', 's="1"') + cell('B1', '46225.50000000001', 's="1"') + `<c r="C1" s="1"><f>DATE(2026,7,22)</f><v>46225.5</v></c><c r="D1" t="e"><v>#VALUE!</v></c><c r="E1" t="e"><f>1+"bad"</f><v>#DIV/0!</v></c>` + cell('F1', '0') + cell('G1', '1', 't="b"') + `<c r="H1"><f>99+1</f></c><c r="I1" t="inlineStr"><is><t>=1+2</t></is></c>`;
        const book = await readXlsx(await golden('<dimension ref="A1:I1"/>' + row(contents), {}, { date1904 }));
        const offset = date1904 ? 1462 : 0;
        expect(book.sheets[0].rows[0]).toEqual([60 + offset, 46225.50000000001 + offset, 46225.5 + offset, '#VALUE!', '#DIV/0!', 0, true, null, '=1+2']);
    });
    it('keeps shared caches/rich text/hyperlink display and ISO dates', async () => {
        const sheet = `<dimension ref="A1:D2"/><sheetData><row r="1"><c r="A1"><f t="shared" si="0" ref="A1:A2">1+1</f><v>2</v></c><c r="B1" t="inlineStr"><is><r><t> raw </t></r><r><t>text</t></r></is></c><c r="C1" t="inlineStr"><is><t>display</t></is></c><c r="D1" t="d"><v>2026-07-22T12:00:00Z</v></c></row><row r="2"><c r="A2"><f t="shared" si="0"/><v>3</v></c></row></sheetData><hyperlinks><hyperlink ref="C1" r:id="link" xmlns:r="${rel}"/></hyperlinks>`;
        const extras = { 'xl/worksheets/_rels/sheet1.xml.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="link" Type="${rel}/hyperlink" Target="https://example.invalid/private" TargetMode="External"/></Relationships>` };
        const book = await readXlsx(await golden(sheet, extras));
        expect(book.sheets[0].rows).toEqual([[2, ' raw text', 'display', 46225.5], [3, null, null, null]]);
    });
    it('normalizes date style zero and custom dates, while ignoring literal/color format text', async () => {
        const styles = `<styleSheet xmlns="${ns}"><numFmts count="3"><numFmt numFmtId="164" formatCode="[Red]0.00"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd"/><numFmt numFmtId="166" formatCode="0.0&amp;quot;m&amp;quot;"/></numFmts><cellXfs count="4"><xf numFmtId="14"/><xf numFmtId="164"/><xf numFmtId="165"/><xf numFmtId="166"/></cellXfs></styleSheet>`.replace(/&amp;/g, '&');
        const bytes = await golden(row(cell('A1', '60', 's="0"') + cell('B1', '12', 's="1"') + cell('C1', '44763.5', 's="2"') + cell('D1', '12', 's="3"')), { 'xl/styles.xml': styles }, { date1904: true });
        expect((await readXlsx(bytes)).sheets[0].rows).toEqual([[1522, 12, 46225.5, 12]]);
    });
    it('serializes numeric formats, MDW6 widths, margins and Print Titles to real XML', async () => {
        const bytes = await writeXlsx([{ name: 'P&G', rows: [['Qty', 'Rate'], [-12.125, 0], [null, null], [null, null]], widths: [24, 13], formats: [{ row: 2, column: 1, format: '#,##0.####' }, { row: 2, column: 2, format: '0.0"%"' }], margins: { left: .3, right: .3, top: .5, bottom: .5, header: .2, footer: .2 }, printTitlesRow: '2:2' }]);
        const zip = await JSZip.loadAsync(bytes);
        const xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string'), workbook = await zip.file('xl/workbook.xml')!.async('string'), styles = await zip.file('xl/styles.xml')!.async('string');
        expect(xml).toContain('<v>-12.125</v>');
        expect(xml).toContain('<v>0</v>');
        expect(xml).toContain(`width="${characterWidth(24)}"`);
        expect(xml).toContain('<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>');
        expect(workbook).toContain('_xlnm.Print_Titles');
        expect(workbook).toContain('$2:$2');
        expect(styles).toContain('#,##0.####');
        expect(styles).toContain('0.0&quot;%&quot;');
        const read = await readXlsx(bytes);
        expect(read.sheets[0].rows).toEqual([['Qty', 'Rate'], [-12.125, 0], [null, null], [null, null]]);
    });
    it('writes typed cached dates/errors, rich text, hyperlink text and false without coercion', async () => {
        const date = new Date(Date.UTC(2026, 6, 22, 12));
        const bytes = await writeXlsx([{ name: 'Typed', rows: [[date, { formula: 'DATE(2026,7,22)', result: date }, { error: '#VALUE!' }, { formula: '1/0', result: { error: '#DIV/0!' } }, { richText: [{ text: ' raw ' }, { text: 'text' }] }, { text: 'display', hyperlink: 'https://example.invalid' }, false, 0]], formats: [{ row: 1, column: 1, format: 'yyyy-mm-dd hh:mm' }, { row: 1, column: 2, format: 'yyyy-mm-dd hh:mm' }] }]);
        expect((await readXlsx(bytes)).sheets[0].rows).toEqual([[46225.5, 46225.5, '#VALUE!', '#DIV/0!', ' raw text', 'display', false, 0]]);
    });
    it('maps explicit two-row finance skip/defaults and header duplicates safely', () => {
        const sheet = { name: 'Finance', range: null, rows: [['title'], ['instructions'], ['value', null, 0], [null, null, null]] };
        expect(rowsToObjects(sheet, { headers: ['Name', 'Provider', 'Amount'], skipRows: 2, defaultValue: '' })).toEqual([{ Name: 'value', Provider: '', Amount: 0 }]);
        const mapped = rowsToObjects({ name: 'x', range: null, rows: [['A', 'A', '__proto__'], [1, 2, 'kept']] });
        expect(mapped).toEqual([JSON.parse('{"A":1,"A_1":2,"__proto__":"kept"}')]);
        expect(Object.prototype.hasOwnProperty.call(mapped[0], '__proto__')).toBe(true);
    });
    it('cleans up URL and anchor if browser click fails', () => {
        const remove = vi.fn(), revoke = vi.fn();
        vi.stubGlobal('document', { body: { appendChild: vi.fn() }, createElement: () => ({ remove, click: () => { throw Error('click failed'); } }) });
        vi.stubGlobal('URL', { createObjectURL: () => 'blob:synthetic', revokeObjectURL: revoke });
        vi.useFakeTimers();
        try {
            expect(() => downloadXlsx(new Uint8Array([1]), 'x.xlsx')).toThrow('click failed');
            expect(remove).toHaveBeenCalledOnce();
            vi.runAllTimers();
            expect(revoke).toHaveBeenCalledWith('blob:synthetic');
        }
        finally {
            vi.useRealTimers();
            vi.unstubAllGlobals();
        }
    });
});
describe('hostile archive rejection before ExcelJS parsing', () => {
    it.each([
        ['oversized dimension', '<dimension ref="A1:IV100000"/>' + row(cell('A1', '1')), 'matriz'],
        ['coordinate beyond row bound', '<dimension ref="A1:A100001"/>', 'filas/columnas'],
        ['reverse geometry', '<dimension ref="B2:A1"/>', 'invertida'],
        ['cell outside dimension', '<dimension ref="A1:A1"/>' + row(cell('B1', '1')), 'fuera de dimensión'],
        ['duplicate cell', row(cell('A1', '1') + cell('A1', '2')), 'duplicada'],
        ['mismatched row', row(cell('A2', '1')), 'celda/fila'],
        ['bad shared string reference', row(cell('A1', '99', 't="s"')), 'texto compartido'],
        ['bad style reference', row(cell('A1', '1', 's="999"')), 'estilo'],
        ['missing shared formula master', row('<c r="A1"><f t="shared" si="1"/><v>2</v></c>'), 'fórmula compartida'],
        ['malformed XML', '<sheetData><row></sheetData>', 'XML mal formado'],
        ['DTD', '<!DOCTYPE worksheet [<!ENTITY x "bad">]><sheetData/>', 'XML'],
        ['wrong namespace', '<dimension xmlns="wrong" ref="A1"/><sheetData/>', 'namespace'],
        ['merge outside geometry', '<dimension ref="A1:A1"/><mergeCells><mergeCell ref="A1:B2"/></mergeCells>', 'fuera de dimensión'],
        ['overlapping merges', '<dimension ref="A1:C3"/><mergeCells><mergeCell ref="A1:B2"/><mergeCell ref="B2:C3"/></mergeCells>', 'solapados'],
        ['non-decimal number', row(cell('A1', '0xff')), 'número'],
    ])('%s', async (_label, sheet, message) => { await expect(readXlsx(await golden(sheet))).rejects.toThrow(message); });
    it('budgets the entire workbook, not per sheet', async () => { await expect(readXlsx(await golden('<dimension ref="A1:IV3000"/>', {}, { names: ['One', 'Two'] }))).rejects.toThrow('matriz del libro'); });
    it.each(['../secret.xml', '/xl/worksheets/../secret.xml', 'https://example.invalid/sheet.xml'])('rejects worksheet relationship target %s', async (target) => { await expect(readXlsx(await golden(row(cell('A1', '1')), {}, { relations: `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="s1" Type="${rel}/worksheet" Target="${target}"/></Relationships>` }))).rejects.toThrow('destino de hoja'); });
    it('rejects external and duplicate worksheet relationships', async () => {
        for (const body of [`<Relationship Id="s1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml" TargetMode="External"/>`, `<Relationship Id="s1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="s1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/>`])
            await expect(readXlsx(await golden('', {}, { relations: `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${body}</Relationships>` }))).rejects.toThrow(/relación/);
    });
    it('rejects oversized compressed bytes and BIFF with conversion instructions', async () => { await expect(readXlsx(new Uint8Array(XLSX_LIMITS.archiveBytes + 1))).rejects.toThrow('20 MiB'); await expect(readXlsx(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]))).rejects.toThrow('Convierta'); await expect(readXlsx(new Uint8Array(), { filename: 'old.xls' })).rejects.toThrow('Convierta'); await expect(readXlsx(new Uint8Array(), { filename: 'rows.csv' })).rejects.toThrow('CSV'); });
    it('checks style/shared-string declared reference counts and OOXML roots', async () => {
        await expect(readXlsx(await golden(row(cell('A1', '0', 't="s"')), { 'xl/sharedStrings.xml': `<sst xmlns="${ns}" uniqueCount="2"><si><t>one</t></si></sst>` }))).rejects.toThrow('conteo de textos');
        await expect(readXlsx(await golden('', { 'xl/styles.xml': `<styleSheet xmlns="${ns}"><cellXfs count="2"><xf numFmtId="0"/></cellXfs></styleSheet>` }))).rejects.toThrow('conteo de estilos');
        await expect(readXlsx(await golden('', { 'xl/workbook.xml': `<fake xmlns="${ns}"/>` }))).rejects.toThrow('raíz');
    });
    it('rejects excessive entries and duplicate canonical ZIP paths', async () => {
        const zip = new JSZip();
        for (let i = 0; i <= XLSX_LIMITS.entries; i++)
            zip.file(`tiny${i}`, new Uint8Array());
        await expect(inspectXlsxArchive(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow('directorio ZIP');
        const bytes = await golden('', {}, { names: ['One', 'Two'] });
        const old = new TextEncoder().encode('xl/worksheets/sheet2.xml'), replacement = new TextEncoder().encode('xl/worksheets/sheet1.xml');
        for (let i = 0; i < bytes.length - old.length; i++)
            if (old.every((b, j) => bytes[i + j] === b))
                bytes.set(replacement, i);
        await expect(inspectXlsxArchive(bytes)).rejects.toThrow('ruta ZIP ambigua');
    });
    it.each([...Array.from({ length: 32 }, (_, code) => String.fromCharCode(code)), '\\'])('rejects forbidden ZIP path character %j', async character => {
        const zip = new JSZip();
        zip.file(`bad${character}name.xml`, '<x/>');
        await expect(inspectXlsxArchive(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow('ruta ZIP ambigua');
    });
    it('rejects Unicode ZIP extra fields that override admitted paths', async () => {
        const zip = new JSZip(); zip.file('café.xml', '<x/>');
        const bytes = await zip.generateAsync({ type: 'uint8array' });
        const view = new DataView(bytes.buffer); let central = 0;
        for (let p = 0; p < bytes.length - 4; p++) if (view.getUint32(p, true) === 0x02014b50) { central = p; break; }
        let extra = central + 46 + view.getUint16(central + 28, true);
        const end = extra + view.getUint16(central + 30, true);
        let changed = false;
        while (extra < end) {
            const kind = view.getUint16(extra, true), size = view.getUint16(extra + 2, true);
            if (kind === 0x7075) { bytes.set(new TextEncoder().encode('évil.xml'), extra + 9); changed = true; break; }
            extra += 4 + size;
        }
        expect(changed).toBe(true);
        await expect(inspectXlsxArchive(bytes)).rejects.toThrow('ruta Unicode ZIP discordante');
    });
    it('rejects actual inflation above a lying declared size without allocating the expansion', async () => {
        const zip = new JSZip();
        zip.file('bomb.xml', ' '.repeat(2 * 1024 * 1024));
        const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
        const view = new DataView(bytes.buffer);
        view.setUint32(22, 1, true);
        let central = 0;
        for (let p = 0; p < bytes.length - 4; p++)
            if (view.getUint32(p, true) === 0x02014b50) {
                central = p;
                break;
            }
        view.setUint32(central + 24, 1, true);
        await expect(inspectXlsxArchive(bytes)).rejects.toThrow('expansión real');
    });
    it('rejects CRC mismatch and declared XML expansion excess', async () => {
        const good = await golden(row(cell('A1', '1')));
        const bad = good.slice(), view = new DataView(bad.buffer);
        view.setUint32(14, 0, true);
        let central = 0;
        for (let p = 0; p < bad.length - 4; p++)
            if (view.getUint32(p, true) === 0x02014b50) {
                central = p;
                break;
            }
        view.setUint32(central + 16, 0, true);
        await expect(inspectXlsxArchive(bad)).rejects.toThrow('CRC');
        const excess = good.slice(), eview = new DataView(excess.buffer);
        eview.setUint32(central + 24, XLSX_LIMITS.xmlBytes + 1, true);
        await expect(inspectXlsxArchive(excess)).rejects.toThrow('expansión ZIP/XML');
    });
});
