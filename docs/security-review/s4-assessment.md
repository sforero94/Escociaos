# S4 — Secrets, file access and reachable dependencies

Assessed 2026-10-28 (America/New_York). Bounded read-only assessment.
Only review documentation changed. No remediation or production change.

## Baseline and limits

- Source: `71f4d57feedca33dccf25ff94eb1b51ba4383efb`, branch `docs/security-review-session-plan`,
  [PR #354](https://github.com/sforero94/Escociaos/pull/354), open/unmerged at start.
  Its `src/`, `supabase/` and lockfile blob/tree IDs match F1 frontend
  `e1518d09ae8f27726499b4a93dfbffbb10516b4f`.
- Vercel production metadata and deployment aliases reverified:
  `dpl_95qo9C7UTxgRyCD8to9EiESevTXe`, READY/PROMOTED, that F1 SHA,
  [escociaos.vercel.app](https://escociaos.vercel.app).
  This verifies routing, not HTML/assets, browser behavior or a farm workflow.
- Authorized Supabase account `supabase_bitis-coward` / `escocia-os`, project
  `ywhtjwawnkeqlwxbvgup`: latest ledger remains `20261028014545` /
  `185_inventario_guardado_atomico`. Edge metadata remains v279 ACTIVE,
  `verify_jwt=false`, hash
  `60ef9ded0d685a9ab7a627f6f2ce2b5a28a0908a948e46900aaae8e25fdc155b`,
  entrypoint still in a version-278 directory. **Edge conclusions are code-only.**
- Approved full edge-source export still has the connector/workbench HTTP 413 /
  `ToolRouterV2_PayloadTooLarge` (4345) blocker. No repeated export attempted.
  The separately rejected broad database-source export remains unapproved.
  No alternative identity, endpoint or body-export route was used.
- No Storage API/catalog reads or object operations; no account roster,
  business/personnel queries, Auth-session reads, logs, secret values, bot
  messages, live probes or test payloads. Live file authorization is therefore
  explicitly unchecked. Historical Storage exceptions are not current proof.
- The supplied local checkout remains clean at unrelated `5163501`, which
  already contains separate dependency work. Its fixes are not this baseline.
  Source review used pinned GitHub files and exact available Git blobs in a
  temporary snapshot. Full snapshot reconstruction failed when the code-mode
  host closed stdout during bulk reads; 174 source files remain unavailable in
  that snapshot. No claim of a complete local checkout or full-source lint pass.

## Resolved xlsx and current primary advisories

[Manifest](https://github.com/sforero94/Escociaos/blob/71f4d57feedca33dccf25ff94eb1b51ba4383efb/package.json#L53) requests `xlsx ^0.18.5`.
[Lockfile](https://github.com/sforero94/Escociaos/blob/71f4d57feedca33dccf25ff94eb1b51ba4383efb/package-lock.json#L8681) resolves the sole `node_modules/xlsx`
entry to **0.18.5**, from the npm registry. This is a production dependency,
not a dev-only notice. The edge preview separately pins
`npm:xlsx@0.18.5`; the browser lockfile does not resolve Deno imports.

Primary sources retrieved on the assessment date:

| Advisory | Affected / fixed range | Application disposition |
|---|---|---|
| [Vendor CVE-2023-30533](https://cdn.sheetjs.com/advisories/CVE-2023-30533), [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6) | Reading crafted workbooks through 0.19.2; vendor fix from 0.19.3. Vendor and GitHub severity scores differ. | Locked/pinned 0.18.5 is affected. Workbook readers below are reachable. Vendor explicitly excludes export-only workflows from this prototype-pollution advisory. |
| [Vendor CVE-2024-22363](https://cdn.sheetjs.com/advisories/CVE-2024-22363), [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9) | ReDoS through 0.20.1; vendor fix from 0.20.2; advisory severity high. | Same affected readers. Extension/size checks do not establish a CPU bound or remove this advisory. No payload executed and no denial of service demonstrated here. |

GitHub lists no patched npm version for these advisories; vendor fixes are
distributed separately. A change to the existing npm semver range alone is not
an evidenced remedy. No dependency replacement, installation or upgrade occurred.

### Reader and provenance map

| Caller | File origin / access | Parsing and boundary |
|---|---|---|
| Browser expense import | Operator chooses a local .xlsx/.xls through Finanzas. [Parent view](https://github.com/sforero94/Escociaos/blob/71f4d57feedca33dccf25ff94eb1b51ba4383efb/src/components/finanzas/GastosView.tsx#L99) opens the importer. | [Reader](https://github.com/sforero94/Escociaos/blob/71f4d57feedca33dccf25ff94eb1b51ba4383efb/src/components/finanzas/components/CargaMasivaGastos.tsx#L258) reads bytes with `XLSX.read` before row validation. No byte limit at this reader. The write RLS recorded in S2 does not sandbox browser parsing. |
| Browser income import | Same selected-file workflow and Finanzas module route. | [Reader](https://github.com/sforero94/Escociaos/blob/71f4d57feedca33dccf25ff94eb1b51ba4383efb/src/components/finanzas/components/CargaMasivaIngresos.tsx#L246) uses the same parser before validation. No byte limit at this reader. Successful ordinary finance writes require Gerencia, but parser reachability is not equivalent to write permission. |
| Browser monitoring import | Selected CSV/XLSX/XLS through Aguacate; [route](https://github.com/sforero94/Escociaos/blob/71f4d57feedca33dccf25ff94eb1b51ba4383efb/src/App.tsx#L131) has a module guard, not an importer-specific Gerencia gate. | [Reader](https://github.com/sforero94/Escociaos/blob/71f4d57feedca33dccf25ff94eb1b51ba4383efb/src/components/monitoreo/CargaMasiva.tsx#L258) sends the chosen file to `XLSX.read`, including its CSV path. Do not reduce parser audience to the historical G/A account roster. No current accounts queried. |
| Dairy chequeo preview | Uploaded workbook is normally the farm's completed veterinary sheet, with the app template as a backup workflow. Source accepts arbitrary bytes from any authenticated G/A caller; no cryptographic provenance check. | [Gate](https://github.com/sforero94/Escociaos/blob/71f4d57feedca33dccf25ff94eb1b51ba4383efb/supabase/functions/make-server-1ccce916/hato-chequeo-preview.ts#L59) validates Auth and current role before multipart parsing. [Upload](https://github.com/sforero94/Escociaos/blob/71f4d57feedca33dccf25ff94eb1b51ba4383efb/supabase/functions/make-server-1ccce916/hato-chequeo-preview.ts#L151) then checks nonempty, 20 MiB and extension before [XLSX.read](https://github.com/sforero94/Escociaos/blob/71f4d57feedca33dccf25ff94eb1b51ba4383efb/supabase/functions/make-server-1ccce916/hato-chequeo-preview.ts#L131). Parsing precedes semantic normalization/approval. Backend applicability awaits edge parity. |
| Historical extraction/backfill scripts | Explicit local operator files; not registered HTTP routes. | [Extractor](https://github.com/sforero94/Escociaos/blob/71f4d57feedca33dccf25ff94eb1b51ba4383efb/scripts/import-hato/extract.ts#L138) and [milk backfill](https://github.com/sforero94/Escociaos/blob/71f4d57feedca33dccf25ff94eb1b51ba4383efb/scripts/import-hato/backfill-leche.ts#L159) also use SheetJS readers. They are maintenance callers, not evidence of an anonymous runtime reader. They were not executed. |
| Inventory/report/chequeo spreadsheet export | Already fetched data supplied to write utilities. | [Inventory export](https://github.com/sforero94/Escociaos/blob/71f4d57feedca33dccf25ff94eb1b51ba4383efb/src/utils/exportarInventario.ts#L386), [report export](https://github.com/sforero94/Escociaos/blob/71f4d57feedca33dccf25ff94eb1b51ba4383efb/src/utils/exportarExcelReportes.ts#L20) and [chequeo template](https://github.com/sforero94/Escociaos/blob/71f4d57feedca33dccf25ff94eb1b51ba4383efb/src/utils/hato/exportarPlanillaChequeo.ts#L397) create workbooks. Their use of the same library does not make the crafted-input reader advisory reachable at those output calls. |

**Disposition:** known affected dependency with verified source reachability,
not a new finding merely because the advisory says high. The earlier security
memory explicitly retained this parsing risk for the internal import workflow.
S4 refines that note: browser parsing can precede role-restricted writes, and an
authenticated server parser is also present in repository source. Realistic
prerequisite is a crafted file selected by an operator, or an authorized G/A
caller submitting it to the preview endpoint. No automatic public attachment
ingestion, anonymous parser or code-execution chain was established.

Keep as a **medium contextual dependency risk / separate backlog**, with high
confidence in version/source reachability and separate uncertainty about actual
deployed edge code and exploit effects. No new verified critical/high production
candidate or immediate remediation is asserted. A future bounded replacement
decision must cover browser imports, edge preview and maintenance readers,
source provenance and focused synthetic legitimate-file/round-trip regressions.
Do not assume the unrelated local branch's spreadsheet changes were released.
Any dependency rollout/rollback must keep F1 receipts and pending attempts.

## File and secret boundary map

| Surface | Source evidence / boundary | Disposition and unchecked evidence |
|---|---|---|
| Browser credentials | [Client](https://github.com/sforero94/Escociaos/blob/71f4d57feedca33dccf25ff94eb1b51ba4383efb/src/utils/supabase/client.ts#L4) uses VITE URL/anon key. Selected chat, CSV and hato callers send session Bearer tokens. Server handlers obtain privileged keys through environment lookups. | No new embedded privileged credential established in the sampled boundaries. No env values, production secret lists or browser storage contents were read. This is not a repository/history secret certification. |
| Tracked configuration | Pinned tree contains no tracked environment file; [ignore rules](https://github.com/sforero94/Escociaos/blob/71f4d57feedca33dccf25ff94eb1b51ba4383efb/.gitignore#L12) cover named local env variants, CLI cache and real workbook files. Edge gateway configuration is not handler authorization. | No local .env or CLI credential file opened. Actual deployment env values, rotation and unexpected untracked variants remain unchecked. Preserve expected public anon credential and documented logo URL exception without reproducing their values. |
| Invoice attachments | [Uploader](https://github.com/sforero94/Escociaos/blob/71f4d57feedca33dccf25ff94eb1b51ba4383efb/src/components/shared/FacturaUploader.tsx#L70) allows listed image/PDF MIME values, max 5 MiB, generated paths, no upsert; stores path and requests one-hour signed URLs with session client. | Client checks are usability/resource checks, not server authorization. Arbitrary-path signing must be controlled by Storage policy. Live policy, content sniffing, cross-role access and actual object visibility were not tested. No IDOR inferred merely from accepting a path. |
| Dairy images / liquidations | [Chequeo photo](https://github.com/sforero94/Escociaos/blob/71f4d57feedca33dccf25ff94eb1b51ba4383efb/supabase/functions/make-server-1ccce916/hato-chequeo-foto.ts#L294), [pesaje photo](https://github.com/sforero94/Escociaos/blob/71f4d57feedca33dccf25ff94eb1b51ba4383efb/supabase/functions/make-server-1ccce916/hato-pesaje-foto.ts#L115) and [liquidation photo](https://github.com/sforero94/Escociaos/blob/71f4d57feedca33dccf25ff94eb1b51ba4383efb/supabase/functions/make-server-1ccce916/hato-produccion-quincena-foto.ts#L294) gate Auth/current G/A role, then multipart count/type/size checks. Generated prefixes identify uploads; source records paths and explicit upload failures before OCR. | Service role is intentional; S2 activity/ban uncertainty remains. Checks happen after multipart buffering; compressed/decoded resource use and external OCR processing are not proven bounded by the raw file cap. No files sent to models or Storage in this assessment. |
| Agronomic Word | [Local extraction](https://github.com/sforero94/Escociaos/blob/71f4d57feedca33dccf25ff94eb1b51ba4383efb/src/utils/informesVisita/docx.ts#L94) uses JSZip for text/images; [upload page](https://github.com/sforero94/Escociaos/blob/71f4d57feedca33dccf25ff94eb1b51ba4383efb/src/components/informesVisita/SubirInformePage.tsx#L84) accepts operator-selected .docx. Confirm/edit/ignore precedes [persistence](https://github.com/sforero94/Escociaos/blob/71f4d57feedca33dccf25ff94eb1b51ba4383efb/src/utils/informesVisita/persistir.ts#L38). Paths use a generated report ID; original/images upload before metadata in separate requests. | No active document macros executed by this extractor in source; it reads archive entries, not Office. Archive expansion/resource limits and orphan compensation remain design risks. The proposing handler uses Auth + G/A; external-model data handling is part of the existing feature, not a new secret disclosure. |
| Downloads / previews | [Visit download](https://github.com/sforero94/Escociaos/blob/71f4d57feedca33dccf25ff94eb1b51ba4383efb/src/components/informesVisita/InformeDetallePage.tsx#L84) requests a 60-second original URL; its photo previews use one hour. [pesaje URLs](https://github.com/sforero94/Escociaos/blob/71f4d57feedca33dccf25ff94eb1b51ba4383efb/src/components/hato/hooks/useSubidasPesajeMes.ts#L155) signs stored paths through the session client. | Signed URLs are bearer capabilities; expiry is not evidence of immediate revocation. Table-row access and object authorization are separate. Live policies, policies' activity clauses and URL invalidation remain unchecked. No signed URL was requested or opened. |
| Weekly report files | [Save](https://github.com/sforero94/Escociaos/blob/71f4d57feedca33dccf25ff94eb1b51ba4383efb/src/utils/reporteSemanalService.ts#L154) uses stable week paths and upsert for intentional regeneration, with separate metadata requests; [history preview](https://github.com/sforero94/Escociaos/blob/71f4d57feedca33dccf25ff94eb1b51ba4383efb/src/components/reportes/HistorialReportes.tsx#L25) uses iframe sandbox without script permission. [PDF conversion](https://github.com/sforero94/Escociaos/blob/71f4d57feedca33dccf25ff94eb1b51ba4383efb/src/utils/reporteSemanalService.ts#L117) parses the embedded structured payload for vector PDF output. | No direct script-enabled report-preview path identified in these callers. Historical broad Storage-read/activity exceptions are preserved as gaps, not declared fixed or refiled. Download/export copies cannot be recalled by later role revocation. No private report generated/read. |
| Logs | [Profile logging](https://github.com/sforero94/Escociaos/blob/71f4d57feedca33dccf25ff94eb1b51ba4383efb/src/utils/supabase/client.ts#L67) logs returned profile; [report metadata logging](https://github.com/sforero94/Escociaos/blob/71f4d57feedca33dccf25ff94eb1b51ba4383efb/src/utils/reporteSemanalService.ts#L203) logs the constructed record. Telegram adapter logs session keys/status and errors. | Source privacy/minimization risk, not evidence of a leaked token or unauthorized log reader. No production logs queried. Retention, access and telemetry forwarding remain unchecked. |

## Browser persistence disposition

**Verified source persistence limitation; medium shared-profile design risk.**
[useFormPersistence](https://github.com/sforero94/Escociaos/blob/71f4d57feedca33dccf25ff94eb1b51ba4383efb/src/hooks/useFormPersistence.ts#L45) and
[useFormDraft](https://github.com/sforero94/Escociaos/blob/71f4d57feedca33dccf25ff94eb1b51ba4383efb/src/hooks/useFormDraft.ts#L41) derive storage keys from the
form key, without account identity. They persist entered fields, not merely UI
flags. Finance forms use fixed new-record keys and row-ID edit keys, including
amounts, notes and invoice paths. [Sign-out](https://github.com/sforero94/Escociaos/blob/71f4d57feedca33dccf25ff94eb1b51ba4383efb/src/contexts/AuthContext.tsx#L217)
clears Auth/context state but contains no application-draft cleanup.

The clearest retained financial example is
[quincena draft](https://github.com/sforero94/Escociaos/blob/71f4d57feedca33dccf25ff94eb1b51ba4383efb/src/components/hato/components/ProduccionQuincenalDialog.tsx#L149):
its fixed key persists volume, value, notes and catalog IDs, and
[restore](https://github.com/sforero94/Escociaos/blob/71f4d57feedca33dccf25ff94eb1b51ba4383efb/src/components/hato/components/ProduccionQuincenalDialog.tsx#L382)
applies them on the user's request. Cancelling intentionally retains that draft;
preserve that owner decision. A later account sharing the same browser profile
can encounter the same key. Local device/browser-profile access is a prerequisite;
this is not a remote RLS bypass or proof of an affected operator.

`useFormDraft` checks the seven-day age on load.
`useFormPersistence` checks version on load but not age; its seven-day constant
is used by cleanup, so it is not a universal expiry guarantee.
Gasto/Ingreso also reset state in effects: do not infer that every saved field
is visibly restored across accounts solely from the storage key. No real browser
state or cross-account UI session was inspected.

Smallest future decision: define account ownership/retention for ordinary drafts,
then scope namespace/restore changes and synthetic account-switch/expiry tests.
Do not clear all localStorage, remove intentional recovery, or touch F1's separate
user-namespaced receipts and unresolved attempts.

## Other dependency and coverage dispositions

- No new AcroForm, SheetJS HTML-preview or jsPDF HTML-renderer caller established
  in the named export/report paths. Preserve the prior dependency-specific
  accepted notes; do not turn a historical audit count into a current all-library
  assessment. This session refreshed the two SheetJS primary advisories only.
- JSZip document extraction and raw archive/input size limits are resource
  design risks, without a new matched advisory or exploit claim here. No
  compressed archives, Office files or malicious inputs were executed.
- Deno/npm imports outside the pinned SheetJS import lack a newly verified
  deployed dependency graph. Frontend lockfile findings cannot establish Deno
  runtime resolution or bundle parity.
- S1 medium integrity items; S2 Auth/provisioning, owner-only revocation and broad
  SELECT uncertainties; S3 independent bot permissions, stale conversations,
  alert claim/effect and replay gaps all remain unchanged.
- F1 receipts/pending attempts, old-tab risk and open legitimate-operator
  confirmation remain preserved. No PR324 work or redesign. No fixes, merges,
  migrations, deployments, account/permission changes or historical data repair.

## Checks and next scope

Pinned source/lock/tree review; current vendor/GitHub advisory retrieval;
file/line references, document links/fences, scope, whitespace and redacted
credential-pattern checks. Live reads were deployment/function metadata and the
latest migration ledger only.

`npm run lint` ran against the **incomplete temporary source snapshot**, using
already installed local dependencies: 0 errors, 705 warnings. This is only a
partial-snapshot result; missing source explains why it cannot replace S2's
907-warning baseline or close S3's unrun full lint. No issues were fixed. The
bulk source-read host failure left 174 source files unavailable, so a complete
exact-baseline lint remains a validation gap. No installations, runtime suite,
mobile retest, backend calls from local scripts or production operations.

**Outcome: S4 assessed with gaps. No new verified critical/high remediation
candidate. Next: S5 consolidation only.** Consolidate the existing evidence,
qualifications and backlog without restarting the audit. Do not start S5 here.
