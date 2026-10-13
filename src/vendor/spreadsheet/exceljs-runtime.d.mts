import type { Workbook as ExcelWorkbook } from './exceljs-types.d.ts';
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
  on(event: 'doctype' | 'text' | 'cdata', callback: (text: string) => void): this;
  on(event: 'error', callback: (error: Error) => void): this;
  on(event: 'opentag' | 'closetag', callback: (tag: { local: string; uri: string; attributes: Record<string, { value: string; local: string; uri: string }> }) => void): this;
  write(xml: string): this;
  close(): this;
}
