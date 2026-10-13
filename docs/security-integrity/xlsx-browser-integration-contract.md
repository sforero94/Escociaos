# Browser XLSX integration contract — October 13

Saved before caller edits. Ownership is ONLY six consumers: monitoring CargaMasiva; finance CargaMasivaGastos/Ingresos; exportarInventario; exportarExcelReportes; Hato exportarPlanillaChequeo, their existing byte/diagnostic tests and new focused browser-consumer tests. Foundation, vendor/package/lock, Deno/offline, SQL/bot files remain with root/other owners.

All XLSX imports use approved async readXlsx and rowsToObjects; preserve first-sheet selection, monitoring header inference, finance fixed distinct keys with exactly two skipped rows and empty-string defaults. Monitoring CSV remains separately supported through bounded Papaparse, with quoted delimiters/newlines and existing numeric/boolean/date coercion assessed against current contract. Reject over-20MiB inputs and over-budget rows/columns/cells; no legacy BIFF fallback. Both UI admission and .xls diagnostics must make Excel/LibreOffice conversion explicit.

All exports preserve pure business AOA/row generation, worksheet ordering/names, filenames/MIME, current MDW6 widths, numeric/custom literal-percent formatting, Hato margins/Print Titles, raw state/SX strings and blank/free rows. writeXlsx is awaited before downloadXlsx or inventory's existing Blob flow; diagnostics propagate loader/serialization/download failures. Hato workbook builder contract will become async typed serialization (no mutable SheetJS injection); update owned tests to actual adapter bytes and golden XML expectations, retain normalizer/diff end-to-end cases.

Only focused consumer/byte/diagnostic tests and scoped typechecks; no broad suite, owner workbooks or live mutation. Root coordinates foundation commit/dependency removal after all consumer handbacks.


## October 13 cloud reconstruction evidence

Imports were reconstructed/pushed separately in0fa4dd1. Export/template reconstruction now covers all six saved consumers. Business row generators remain intact; the inventory Blob path and filenames/MIME remain, financial P&G→Flujo order/sign/null semantics and literal percent format remain, Hato async serialization preserves raw clinical values/free rows/print titles/margins. All template serialization is awaited before download. Actual template handlers and downloaded report bytes are tested; inventory and Hato tests now use actual adapter/server-reader bytes plus independent XML metadata instead of injected SheetJS. The diagnostic guard follows adapter chunk loads.

Fresh whole-tree249files/5,238tests, lint (existing warnings), typecheck and32.99sbuild PASS. Logs /tmp/escocia-browser-export-resume-{lint,typecheck,tests,build}.log. Existing xlsx dependency is deliberately still installed pending a separate lock/provenance regeneration and audit unit; no clean vulnerability claim. No owner workbook, domain query or hosted/runtime certification.
