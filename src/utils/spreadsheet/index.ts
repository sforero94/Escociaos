import { XLSX_LIMITS } from './limits.ts';
import type { CellValue, Workbook } from '../../vendor/spreadsheet/exceljs-types.d.ts';
import type { Range } from './archive';
// Minimal browser-only download shape avoids requiring DOM library types in
// Deno reader deployments. This declaration emits no code.
type DownloadLink = { href: string; download: string; click(): void; remove(): void };
declare const document: { createElement(tag: 'a'): DownloadLink; body: { appendChild(link: DownloadLink): unknown } };
export type RawCell = string | number | boolean | null;
export type RawSheet = {
    name: string;
    rows: RawCell[][];
    range: Range | null;
};
export type RawWorkbook = {
    sheets: RawSheet[];
    date1904: boolean;
};
export type SheetSpec = {
    name: string;
    rows: readonly (readonly CellValue[])[];
    widths?: readonly number[];
    formats?: readonly {
        row: number;
        column: number;
        format: string;
    }[];
    margins?: {
        left: number;
        right: number;
        top: number;
        bottom: number;
        header: number;
        footer: number;
    };
    printTitlesRow?: string;
};
const day = 86400000, epoch = Date.UTC(1899, 11, 30);
/** Match current SheetJS character-width encoding at MDW=6. */
export const characterWidth = (wch: number): number => Math.round((wch * 6 + 5) / 6 * 256) / 256;
export function cellAddress(row: number, column: number): string {
    let letters = '';
    for (let n = column; n > 0; n = Math.floor((n - 1) / 26))
        letters = String.fromCharCode(65 + (n - 1) % 26) + letters;
    return `${letters}${row}`;
}
function rawValue(value: CellValue | undefined, xmlNumber: number | undefined, date1904: boolean): RawCell {
    if (value === null || value === undefined)
        return null;
    if (value instanceof Date) {
        if (xmlNumber !== undefined)
            return xmlNumber + (date1904 ? 1462 : 0);
        const serial = (value.getTime() - epoch) / day;
        if (!Number.isFinite(serial))
            throw Error('Fecha XLSX inválida');
        return serial;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
        return value;
    if ('formula' in value || 'sharedFormula' in value)
        return rawValue(value.result, xmlNumber, date1904);
    if ('error' in value)
        return value.error;
    if ('richText' in value)
        return value.richText.map(run => run.text).join('');
    if ('text' in value)
        return value.text;
    throw Error('Tipo de celda XLSX no compatible');
}
export async function readXlsx(input: Uint8Array | ArrayBuffer, options: {
    filename?: string;
} = {}): Promise<RawWorkbook> {
    if (options.filename && /\.xls$/i.test(options.filename))
        throw Error('El formato .xls no es compatible. Convierta el archivo a .xlsx en Excel o LibreOffice.');
    if (options.filename && !/\.xlsx$/i.test(options.filename))
        throw Error('Se requiere .xlsx. CSV se importa por separado.');
    if (input.byteLength > XLSX_LIMITS.archiveBytes) throw new Error('Archivo XLSX inválido: máximo 20 MiB');
    // Copy once so caller mutation cannot change bytes between admission and parsing.
    const bytes = new Uint8Array(input instanceof Uint8Array ? input : new Uint8Array(input));
    const { inspectXlsxArchive } = await import('./archive.ts');
    const metadata = await inspectXlsxArchive(bytes);
    const { Workbook } = await import('../../vendor/spreadsheet/exceljs-runtime.mjs');
    const workbook = new Workbook();
    await workbook.xlsx.load(bytes as unknown as Parameters<Workbook['xlsx']['load']>[0]);
    if (workbook.worksheets.length !== metadata.sheets.length)
        throw Error('Hojas XLSX inconsistentes');
    const sheets = metadata.sheets.map((meta, i) => {
        const sheet = workbook.worksheets[i];
        if (sheet.name !== meta.name)
            throw Error('Orden de hojas XLSX inconsistente');
        const rows: RawCell[][] = [];
        const range = meta.range;
        if (range)
            for (let row = range.top; row <= range.bottom; row++) {
                const cells: RawCell[] = [];
                for (let column = range.left; column <= range.right; column++)
                    cells.push(meta.dates.get(cellAddress(row, column)) ?? rawValue(sheet.getCell(row, column).value, meta.numbers.get(cellAddress(row, column)), metadata.date1904));
                rows.push(cells);
            }
        return { name: meta.name, rows, range };
    });
    return { sheets, date1904: metadata.date1904 };
}
export async function writeXlsx(sheets: readonly SheetSpec[]): Promise<Uint8Array> {
    const { Workbook } = await import('../../vendor/spreadsheet/exceljs-runtime.mjs');
    const workbook = new Workbook();
    if (!sheets.length)
        throw Error('El libro requiere una hoja');
    for (const spec of sheets) {
        const sheet = workbook.addWorksheet(spec.name);
        for (const row of spec.rows)
            sheet.addRow([...row]);
        spec.widths?.forEach((width, i) => { if (!Number.isFinite(width) || width < 0)
            throw Error('Ancho de columna inválido'); sheet.getColumn(i + 1).width = characterWidth(width); });
        for (const entry of spec.formats ?? [])
            sheet.getCell(entry.row, entry.column).numFmt = entry.format;
        if (spec.margins)
            sheet.pageSetup.margins = { ...spec.margins };
        if (spec.printTitlesRow)
            sheet.pageSetup.printTitlesRow = spec.printTitlesRow;
    }
    const bytes = await workbook.xlsx.writeBuffer();
    return new Uint8Array(bytes as unknown as ArrayBuffer);
}
/** Header/fixed-schema mapping: blank rows omitted, raw values kept, no coercion. */
export function rowsToObjects(sheet: RawSheet, options: {
    headers?: readonly string[];
    skipRows?: number;
    defaultValue?: RawCell;
} = {}): Record<string, RawCell>[] {
    const skip = options.skipRows ?? 0;
    if (!Number.isInteger(skip) || skip < 0)
        throw Error('Número de filas a omitir inválido');
    const source = sheet.rows.slice(skip);
    let headers: readonly string[];
    if (options.headers)
        headers = options.headers;
    else {
        const first = source.shift() ?? [], counts = new Map<string, number>();
        headers = first.map(value => { const base = value === null ? '__EMPTY' : String(value); let key = base, n = counts.get(base) ?? 0; while (counts.has(key)) {
            key = `${base}_${++n}`;
        } counts.set(base, n); counts.set(key, 0); return key; });
    }
    const hasDefault = Object.prototype.hasOwnProperty.call(options, 'defaultValue');
    const result: Record<string, RawCell>[] = [];
    for (const row of source) {
        if (row.every(value => value === null))
            continue;
        const object: Record<string, RawCell> = {};
        headers.forEach((key, i) => { const value = row[i] ?? null; if (value !== null || hasDefault)
            Object.defineProperty(object, key, { value: value ?? options.defaultValue ?? null, enumerable: true, configurable: true, writable: true }); });
        result.push(object);
    }
    return result;
}
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export function downloadXlsx(bytes: Uint8Array, filename: string): void {
    const blob = new Blob([new Uint8Array(bytes).buffer], { type: XLSX_MIME });
    const url = URL.createObjectURL(blob);
    let link: DownloadLink | undefined;
    try {
        link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
    } finally {
        try { link?.remove(); }
        finally { setTimeout(() => URL.revokeObjectURL(url), 0); }
    }
}
