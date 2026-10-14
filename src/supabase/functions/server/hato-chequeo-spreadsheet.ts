import { readXlsx } from './spreadsheet/index.ts';
import type { HojaCruda } from './importHato/tipos.ts';

/** Raw serial dates/error text and full range geometry reach the existing normalizer. */
export async function leerHojasCrudas(bytes: Uint8Array, nombreArchivo: string): Promise<HojaCruda[]> {
  const workbook = await readXlsx(bytes, { filename: nombreArchivo });
  return workbook.sheets.map(sheet => ({ archivo: nombreArchivo, hoja: sheet.name, filas: sheet.rows }));
}
