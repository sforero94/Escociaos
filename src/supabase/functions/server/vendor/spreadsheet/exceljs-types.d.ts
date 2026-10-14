/** Scoped type facade for the reviewed ExcelJS 4.4.0 document API used by
 * the adapter. Runtime is unchanged upstream code; no npm type resolution is
 * needed in deployed Deno. This is not the complete ExcelJS public API. */
export type CellErrorValue = { error: '#N/A' | '#REF!' | '#NAME?' | '#DIV/0!' | '#NULL!' | '#VALUE!' | '#NUM!' };
export type Font = {
  name: string; size: number; family: number; scheme: 'minor' | 'major' | 'none'; charset: number;
  color: Partial<{ argb: string; theme: number }>; bold: boolean; italic: boolean;
  underline: boolean | 'none' | 'single' | 'double' | 'singleAccounting' | 'doubleAccounting';
  vertAlign: 'superscript' | 'subscript'; strike: boolean; outline: boolean;
};
export type CachedResult = number | string | boolean | Date | CellErrorValue;
export type CellValue = null | undefined | number | string | boolean | Date | CellErrorValue
  | { richText: { text: string; font?: Partial<Font> }[] }
  | { text: string; hyperlink: string; tooltip?: string }
  | { formula: string; result?: CachedResult; date1904?: boolean }
  | { sharedFormula: string; readonly formula?: string; result?: CachedResult; date1904?: boolean };
export type Margins = { left: number; right: number; top: number; bottom: number; header: number; footer: number };
export interface Worksheet {
  name: string;
  getCell(row: number, column: number): { value: CellValue; numFmt: string };
  addRow(values: CellValue[]): unknown;
  getColumn(column: number): { width?: number };
  pageSetup: { margins: Margins; printTitlesRow: string };
}
export interface Workbook {
  worksheets: Worksheet[];
  addWorksheet(name: string): Worksheet;
  xlsx: { load(bytes: Uint8Array): Promise<Workbook>; writeBuffer(): Promise<Uint8Array> };
}
