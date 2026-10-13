# Shared XLSX runtime

Generated, self-contained ESM from genuine ExcelJS 4.4.0 **source** and the exact app lock, using scoped ExcelJS -> UUID 11.1.1. The stock upstream browser prebuilt distribution is not used. Only the typed in-memory adapter is supported; file/CSV/stream/password APIs exposed internally by upstream are not application contracts.

Regenerate with `npm ci --ignore-scripts` followed by `npm run spreadsheet:generate`. The build needs the pinned dev dependencies. `manifest.json` records each normalized source path/hash, source package registry tarball/integrity, generator and lock hashes, and the generated artifact/license hashes. Two successive builds in the recorded environment produced identical artifact, manifest and license bytes. Regenerate after changing the package lock; do not edit the runtime manually.

`saxes@5.0.1`'s npm tarball omits its license file. `saxes-LICENSE.txt` is the genuine upstream v5.0.1 license from the URL/hash recorded in the manifest; generation uses this local preserved copy and makes no network requests. All other runtime package license notices come from installed upstream package assets.

The browser adapter loads this runtime lazily. Deno integration should package the same reviewed local adapter and artifact; independently resolving `npm:exceljs@4.4.0` does not inherit the application's UUID override. The local Deno proof is not a hosted Supabase runtime/deployment certificate.

Acceptance: `src/__tests__/spreadsheetAdapter.test.ts`, `scripts/security/spreadsheet-adapter-browser-proof.mjs` (Node with `--experimental-vm-modules`) and `scripts/security/spreadsheet-adapter-deno-proof.mjs`. The older three ExcelJS proof scripts preserve pre-cutover oracle evidence; two intentionally require the old SheetJS dependency and are not post-cutover acceptance tests.
