// Shared lightweight admission limits; safe to import without loading the runtime.
export const XLSX_LIMITS = Object.freeze({ archiveBytes: 20 * 1024 * 1024, entries: 2048, expandedBytes: 64 * 1024 * 1024, xmlBytes: 16 * 1024 * 1024, sheets: 64, rows: 100000, columns: 256, cells: 1000000 });
