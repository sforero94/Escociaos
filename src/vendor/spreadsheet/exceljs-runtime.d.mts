import type { Workbook as ExcelWorkbook } from 'exceljs';
export const Workbook: { new(): ExcelWorkbook };
export class Inflate {
  constructor(options: { raw: boolean; chunkSize: number });
  onData: (chunk: Uint8Array) => void;
  push(data: Uint8Array, final: boolean): boolean;
  err: number;
  msg: string;
  ended: boolean;
  strm: { avail_in: number };
}
export class SaxesParser {
  constructor(options?: { xmlns?: boolean });
  on(event: string, callback: (...args: any[]) => void): this;
  write(xml: string): this;
  close(): this;
}
