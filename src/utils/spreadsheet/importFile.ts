import { readXlsx, rowsToObjects, type RawCell, type RawSheet } from './index';
import { XLSX_LIMITS } from './limits';

type ImportFile = Pick<File, 'name' | 'size' | 'arrayBuffer'>;
type Options = Parameters<typeof rowsToObjects>[1] & { allowCsv?: boolean };

function csvValue(value: string): RawCell {
  if (value === '') return null;
  if (value === 'TRUE' || value === 'true') return true;
  if (value === 'FALSE' || value === 'false') return false;
  // Keep dates and formula-looking text literal; never evaluate spreadsheet input.
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return value;
}

async function csvSheet(bytes: ArrayBuffer): Promise<RawSheet> {
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw Error('El CSV debe estar codificado en UTF-8.'); }
  const { default: Papa } = await import('papaparse');
  const rows: RawCell[][] = [];
  let columns = 0, cells = 0, failure: Error | undefined;
  Papa.parse<string[]>(text, {
    skipEmptyLines: false,
    step(result, parser) {
      const row = result.data;
      columns = Math.max(columns, row.length);
      cells += row.length;
      // A one-column CSV legitimately has no detectable delimiter.
      if (result.errors.some(error => error.code !== 'UndetectableDelimiter')) failure = Error('CSV inválido: comillas o delimitadores incorrectos.');
      if (rows.length >= XLSX_LIMITS.rows || columns > XLSX_LIMITS.columns || cells > XLSX_LIMITS.cells
        || (rows.length + 1) * columns > XLSX_LIMITS.cells) {
        failure = Error('CSV inválido: límite de filas, columnas o celdas.');
      }
      if (failure) { parser.abort(); return; }
      rows.push(row.map(csvValue));
    },
  });
  if (failure) throw failure;
  return { name: 'CSV', rows, range: rows.length ? { top: 1, left: 1, bottom: rows.length, right: columns } : null };
}

/** Reject unsupported/oversized input before reading bytes or querying any catalog. */
export async function readImportFile(file: ImportFile, options: Options = {}): Promise<Record<string, RawCell>[]> {
  if (!Number.isInteger(options.skipRows ?? 0) || (options.skipRows ?? 0) < 0) throw Error('Número de filas a omitir inválido');
  if (/\.xls$/i.test(file.name)) {
    throw Error('El formato .xls no es compatible. Convierta el archivo a .xlsx en Excel o LibreOffice.');
  }
  const csv = options.allowCsv === true && /\.csv$/i.test(file.name);
  if (!csv && !/\.xlsx$/i.test(file.name)) throw Error(options.allowCsv ? 'Seleccione un archivo .xlsx o .csv.' : 'Seleccione un archivo .xlsx.');
  if (!Number.isFinite(file.size) || file.size < 0 || file.size > XLSX_LIMITS.archiveBytes) throw Error('El archivo supera el máximo de 20 MiB.');
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > XLSX_LIMITS.archiveBytes) throw Error('El archivo supera el máximo de 20 MiB.');
  const sheet = csv ? await csvSheet(bytes) : (await readXlsx(bytes, { filename: file.name })).sheets[0];
  if (!sheet) return [];
  if (options.headers && sheet.range) {
    // Finance headers address columns A onward and skip absolute worksheet
    // rows 1–2, even when a sparse worksheet's declared origin is B3.
    const left = sheet.range.left - 1;
    const aligned = { ...sheet, rows: left ? sheet.rows.map(row => [...Array<null>(left).fill(null), ...row]) : sheet.rows };
    return rowsToObjects(aligned, { ...options, skipRows: Math.max(0, (options.skipRows ?? 0) - (sheet.range.top - 1)) });
  }
  return rowsToObjects(sheet, options);
}
