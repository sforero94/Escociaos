# XLSX adapter contract — saved before implementation, October 13

Foundation ownership: new `src/utils/spreadsheet/*`, generated `src/vendor/spreadsheet/*`, generator/build dependencies and focused tests only. Existing browser exports/imports, server mirrors and offline callers are not edited in this slice. CSV remains a separate caller contract. No BIFF fallback.

Proposed integration API:

- `readXlsx(bytes: Uint8Array | ArrayBuffer, options?: { filename?: string }): Promise<RawWorkbook>` returns ordered `{name, rows, range}` sheets. `range` is one-based `{top,left,bottom,right}` or null; matrix starts at its declared origin and retains all null holes/trailing extent. Raw cells are `string | number | boolean | null`.
- `writeXlsx(sheets: readonly SheetSpec[]): Promise<Uint8Array>` writes new AOA workbooks; primitive values, Date and explicitly typed cached-formula/error/rich-text/hyperlink cells are supported. Optional character widths use existing MDW=6 padding/1/256 rounding; numeric formats address one-based cells; margins and repeated print rows are explicit.
- `rowsToObjects(sheet, {headers?, skipRows?, defaultValue?})` maps the first sheet's raw matrix. Absent keys omit nulls unless a default is supplied; entirely blank rows are skipped. Explicit finance headers plus skipRows=2 preserve fixed mapping.
- `downloadXlsx(bytes, filename)` handles browser Blob/object-URL cleanup and preserves thrown serialization/download errors. It does not serialize synchronously.
- `inspectXlsxArchive(bytes)` performs admission validation before ExcelJS parsing and returns bounded XML metadata. Reader invokes this automatically.

Reader handles cached formulas only, never evaluates them. Error text remains literal. Date-formatted numeric cells use original XML numeric values to preserve serial 60 and fractional precision, normalize 1904 date cells by +1462, and keep ordinary numeric cells unchanged. UTC conversion is used for explicit ISO dates. Strings (including leading equals), whitespace, booleans and zero remain typed.

Admission limits are fixed (caller cannot increase them): archive 20 MiB; 2,048 ZIP entries; total expanded data 64 MiB; each XML part 16 MiB; 64 worksheets; row coordinate 100,000; column coordinate 256; total declared matrix cells 1,000,000; total serialized cells/shared strings/style entries 1,000,000; 1,024 merged ranges with aggregate merged-cell extent 1,000,000. ZIP directory/local headers, actual bounded inflation, CRC, canonical non-traversing paths, duplicate entries, relationship targets, XML well-formedness/DTD prohibition, row/cell/dimension consistency and shared-string/style/shared-formula references are validated before loading. XLS/CSV/non-ZIP input gets a clear conversion/format refusal. These are application resource bounds, not a general parser/fuzz certification.

The runtime artifact is generated from genuine `exceljs@4.4.0` source with scoped `exceljs -> uuid@11.1.1`, not its prebuilt browser distribution. Generation records normalized exact source graph, package lock/integrities, build inputs/output hash and license notices. Browser and Deno use the same local ESM artifact. Generation must be reproducible from the app lock; no standalone Deno npm graph security claim. Source entry is lazy loaded through the adapter.

Root approved this API before integration; caller ownership partition remains coordinated by root. Dependency presence does not complete remediation while old consumers remain.
