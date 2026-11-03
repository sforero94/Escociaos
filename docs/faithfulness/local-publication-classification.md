# Local publication-content classification

Status: local read-only review of the frozen candidate. This records a local frozen-tree review; later local additions are identified in the addendum. No publication, push, PR, merge, deployment, model request, production query, external read, or credential access is authorized or performed by this review.

## Exact comparison and disposition

- Baseline: `76f9b77686248f48bee263ee2c53f90c62e46563` (#398 merge).
- Candidate: `de71a7e1de1e9073945dc64620f2f09ae04686f5`.
- Complete changed-path inventory: **137 text files**, 15,777 added lines and 545 removed lines; no binary additions.
- Categories: **82 code files** (26 canonical utilities, 28 server files, 28 deployment-mirror files), **50 tests**, **4 documents**, and **1 local synchronization script**.
- These are source, synthetic controls and technical documentation suitable for a separately reviewed repository change. This is a content classification, not authority to publish, and not functional or online-quality acceptance.
- No added literal credential, private key, real-person contact address, private production response dump, business-record export, or copied identity artifact was identified. Fictional privacy canaries deliberately remain in tests. A field name such as `salario`, a placeholder key, a SHA digest, and a generated UUID are not production records or credentials.

The earlier checkpoint `5197e9f` to this candidate changes 70 paths, including 19 tests. This review uses the larger **76f9 baseline**, not only that later subset. The older `EVIDENCE_BATCH_FILES_LOCAL.tsv` is an historical batch manifest, not the final 137-path manifest. The inventory below is computed directly from the frozen Git trees.

## Material that must stay local / must not be added

Actual credentials, environment files, access tokens, session/JWT strings, private key material, real employee names or identifiers linked to salary/activity, invoices/contact details, production JSON/CSV/HAR/request-response exports, chat histories, memory contents, held-out questions/answers, evaluator private artifacts, operational payloads and temporary execution logs must not enter an eventual change or its PR text. No such added artifact was found in these 137 paths. This conclusion does not approve unrelated existing repository content or future files.

Synthetic identity/salary/notes fixtures in the tests are necessary negative controls. Their inputs are constructed in local factories, contain generated or short test IDs, and use fictional names/canaries. Assertions inspect complete model bodies, visible results, events, persisted context, and query projections. They are not evidence that live records are safe to publish. Existing baseline business examples or historical payloads outside the changed lines were not reclassified as new additions.

The four changed documents contain interface types, operation names, generic worked examples, local ownership/check receipts, source commit/tree/fingerprint identifiers and file paths. These are technical metadata, not credentials or copied operational rows. Their historical phase/status language must remain distinguishable from a current publication decision.

## Scan and manual review evidence

Every added line in all 137 paths was inspected by the local automated scan for private-key markers, JWT literals, common cloud/provider/Telegram token shapes, embedded PostgreSQL credentials, email literals, external URLs, local artifact paths, identity/secret field assignments and high-entropy strings. Results: zero private-key/JWT/cloud-token/provider-token/Telegram-token/database-credential/email/local-artifact-path matches. Identity-field matches resolve to synthetic fixtures, fixed deny/allowlist field names or server-only query code. Long-token alerts resolve to manifest paths and the source-contract path inventory, not key material.

External URL additions occur only in tests: `.invalid` source hosts and the existing model endpoint literal under a stubbed `fetch` boundary. They are routing constants, not newly exported payloads or credentials. The scan made no HTTP call. Tests use placeholder environment values; imported fixture/schema reads target repository files rather than local private captures.

Manual inspection covered the changed channel/loop wiring, source projections and positive serializers, the four documents, the synchronization diff, fixture factories and privacy controls, all 19 later-checkpoint test paths, and the #395/#397/#398 preservation diff. New domain modules were also reviewed during their local integration and independent probes. The full path/addition scan includes all mirrored copies; mirrors are not presented as independent evidence of provenance.

Limits: this is a pattern scan plus targeted source review, not an exhaustive secret-detection product, a proof of synthetic provenance, a full-repository sanitization, or a new line-by-line audit of every unchanged historical source file. Equal-looking fictional names cannot by themselves prove nonidentity with a real person. No live schema, Auth, provider, production data or online campaign was consulted. No tests, build or deployment were run for this documentation-only classification; existing check receipts remain their original local receipts.

## Preserved ancestry and release controls

The commit objects show this direct first-parent chain:

`#395 7d95a3ec` → `#397 19618994` → `#398 76f9b776` → candidate descendant `de71a7e1`.

Local `merge-base --is-ancestor` checks return success for #398 and #397 against the candidate. A direct #395 traversal encounters the missing historical secondary-parent object `ba4f30e7`; no fetch was attempted. The #397 commit object explicitly records #395 as its first parent and #398 explicitly records #397. Thus the known first-parent chain establishes inclusion without pretending the local historical object graph is complete.

- **#395:** its recovery document, dependency manifests, legacy-state fixture, recovery tests, component instructions and both `telegram/conversations/pesajeLeche.ts` copies are byte-identical to baseline. Both bot files change only later conversational model-context wiring/call inputs; all 27 nonblank lines introduced by #395 remain literally present in each bot file.
- **#397:** all 21 nonblank status-selection additions remain literally present in each of the three `escoConsultas` copies. Its status test changes to inspect canonical rendered/persisted facts instead of old prose/second-generation behavior. Closed/Calculada/En-ejecución status, month-name identity, duplicate identity, no planned-as-consumed and no physical-success controls remain; a negative model-type regression is added.
- **#398:** its workflow, release-status document, runner, runner checks and release-runner tests are all byte-identical to baseline.

**Exact script/workflow change list against 76f9:** only `scripts/sync-esco-consultas.py` changes, with seven added lines. It adds 24-module mirror generation and import transformations. Against `5197e9f`, that same file changes by three additions/two deletions: ten more mirrored modules plus the canonical-consultas and radiation import transformations. No other script and no `.github` path changes in either comparison.

All baseline release runners, runner checks, capture/proof helpers, source/recovery/runtime pins, drift controls, workflow dispatch/input guards, package manifests, Supabase configuration and migration sources are outside the changed-path set. The original release controllers are preserved; they were not repinned or relaxed to accept the expanded runtime. Their unchanged bytes are not an approval to run them against this candidate.

## Later-checkpoint test subset (19 paths)

- `src/__tests__/escoAplicacionesFaithfulness.test.ts` — synthetic local fixtures or repository source/schema checks.
- `src/__tests__/escoComercioNumerosIndependent.test.ts` — synthetic local fixtures or repository source/schema checks.
- `src/__tests__/escoComercioPortIndependent.test.ts` — synthetic local fixtures or repository source/schema checks.
- `src/__tests__/escoCultivosIndependent.test.ts` — synthetic local fixtures or repository source/schema checks.
- `src/__tests__/escoEvalsLoopCerrado.test.ts` — synthetic local fixtures or repository source/schema checks.
- `src/__tests__/escoGanadoIndependent.test.ts` — synthetic local fixtures or repository source/schema checks.
- `src/__tests__/escoNucleoComercio.test.ts` — synthetic local fixtures or repository source/schema checks.
- `src/__tests__/escoNucleoContrato.test.ts` — synthetic local fixtures or repository source/schema checks.
- `src/__tests__/escoNucleoCultivos.test.ts` — synthetic local fixtures or repository source/schema checks.
- `src/__tests__/escoNucleoEsquema.test.ts` — synthetic local fixtures or repository source/schema checks.
- `src/__tests__/escoNucleoFrontera.test.ts` — synthetic local fixtures or repository source/schema checks.
- `src/__tests__/escoNucleoGanado.test.ts` — synthetic local fixtures or repository source/schema checks.
- `src/__tests__/escoNucleoIdentidadVisible.test.ts` — synthetic local fixtures or repository source/schema checks.
- `src/__tests__/escoNucleoLoopIndependent.test.ts` — synthetic local fixtures or repository source/schema checks.
- `src/__tests__/escoNucleoLoopIntegrado.test.ts` — synthetic local fixtures or repository source/schema checks.
- `src/__tests__/escoNucleoOperaciones.test.ts` — synthetic local fixtures or repository source/schema checks.
- `src/__tests__/escoNucleoProofIndependent.test.ts` — synthetic local fixtures or repository source/schema checks.
- `src/__tests__/escoOpsIndependent.test.ts` — synthetic local fixtures or repository source/schema checks.
- `src/__tests__/umbralGravedadContract.test.ts` — synthetic local fixtures or repository source/schema checks.

## Complete frozen diff inventory

| Path | Category | Content disposition |
| --- | --- | --- |
| `docs/esco/faithfulness/EVIDENCE_BATCH_FILES_LOCAL.tsv` | documentation: technical/local receipts | Technical metadata/interface only |
| `docs/esco/faithfulness/EVIDENCE_BATCH_LOCAL_REVIEW.md` | documentation: technical/local receipts | Technical metadata/interface only |
| `docs/esco/faithfulness/EVIDENCE_CONTRACT_V1_LOCAL.md` | documentation: technical/local receipts | Technical metadata/interface only |
| `docs/faithfulness/selected-core-local.md` | documentation: technical/local receipts | Technical metadata/interface only |
| `scripts/sync-esco-consultas.py` | script: local mirror generator | Local source; no embedded record/credential identified |
| `src/__tests__/climaConfianzaParidadEsco.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/esco-improvements.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoAccesoEvidencia.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoAlcance.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoAplicacionCantidades.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoAplicacionCohorte.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoAplicacionConsumoPregunta.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoAplicacionEstado.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoAplicacionSeleccion.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoAplicacionesFaithfulness.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoCobertura.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoComercioNumerosIndependent.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoComercioPortIndependent.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoConsultas.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoCultivosIndependent.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoDispatcherVerificado.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoEvalsLoopCerrado.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoEvalsMensajes.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoEvidenciaContrato.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoFechasAplicacionEvidencia.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoGanadoIndependent.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoHechosClima.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoHechosInventario.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoHechosRegistros.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoHechosTrabajo.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoLecheEvidencia.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoNucleoComercio.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoNucleoContrato.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoNucleoCultivos.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoNucleoEsquema.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoNucleoFrontera.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoNucleoGanado.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoNucleoIdentidadVisible.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoNucleoLoopIndependent.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoNucleoLoopIntegrado.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoNucleoOperaciones.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoNucleoProofIndependent.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoOpsIndependent.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoPoliticaDatos.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoPrivacidadFronteras.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoPrivacidadLoopCerrado.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoRegistrosLoopCerrado.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoRespuestaTerminal.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoRespuestaVerificada.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoSolicitudIndividual.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoTiempoLoopCerrado.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/escoToolLoopEvidencia.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/hatoFechaLocalGuard.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/telegramChat.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/__tests__/umbralGravedadContract.test.ts` | test: synthetic/local control | Synthetic fixtures/canaries; no live capture identified |
| `src/supabase/functions/server/calculosRadiacion.ts` | code: server/runtime mirror | Local source; no embedded record/credential identified |
| `src/supabase/functions/server/chat.tsx` | code: server/runtime mirror | Local source; no embedded record/credential identified |
| `src/supabase/functions/server/esco-consultas.ts` | code: server/runtime mirror | Local source; no embedded record/credential identified |
| `src/supabase/functions/server/escoAlcance.ts` | code: server/runtime mirror | Local source; no embedded record/credential identified |
| `src/supabase/functions/server/escoAplicacionHechos.ts` | code: server/runtime mirror | Local source; no embedded record/credential identified |
| `src/supabase/functions/server/escoClimaCalidad.ts` | code: server/runtime mirror | Local source; no embedded record/credential identified |
| `src/supabase/functions/server/escoCobertura.ts` | code: server/runtime mirror | Local source; no embedded record/credential identified |
| `src/supabase/functions/server/escoDispatcherVerificado.ts` | code: server/runtime mirror | Local source; no embedded record/credential identified |
| `src/supabase/functions/server/escoEvidencia.ts` | code: server/runtime mirror | Local source; no embedded record/credential identified |
| `src/supabase/functions/server/escoHechosClima.ts` | code: server/runtime mirror | Local source; no embedded record/credential identified |
| `src/supabase/functions/server/escoHechosInventario.ts` | code: server/runtime mirror | Local source; no embedded record/credential identified |
| `src/supabase/functions/server/escoHechosRegistros.ts` | code: server/runtime mirror | Local source; no embedded record/credential identified |
| `src/supabase/functions/server/escoHechosTrabajo.ts` | code: server/runtime mirror | Local source; no embedded record/credential identified |
| `src/supabase/functions/server/escoNucleoCatalogo.ts` | code: server/runtime mirror | Local source; no embedded record/credential identified |
| `src/supabase/functions/server/escoNucleoComercio.ts` | code: server/runtime mirror | Local source; no embedded record/credential identified |
| `src/supabase/functions/server/escoNucleoComun.ts` | code: server/runtime mirror | Local source; no embedded record/credential identified |
| `src/supabase/functions/server/escoNucleoCultivos.ts` | code: server/runtime mirror | Local source; no embedded record/credential identified |
| `src/supabase/functions/server/escoNucleoDefiniciones.ts` | code: server/runtime mirror | Local source; no embedded record/credential identified |
| `src/supabase/functions/server/escoNucleoGanado.ts` | code: server/runtime mirror | Local source; no embedded record/credential identified |
| `src/supabase/functions/server/escoNucleoOperaciones.ts` | code: server/runtime mirror | Local source; no embedded record/credential identified |
| `src/supabase/functions/server/escoNucleoSolicitud.ts` | code: server/runtime mirror | Local source; no embedded record/credential identified |
| `src/supabase/functions/server/escoNucleoTransporte.ts` | code: server/runtime mirror | Local source; no embedded record/credential identified |
| `src/supabase/functions/server/escoPoliticaDatos.ts` | code: server/runtime mirror | Local source; no embedded record/credential identified |
| `src/supabase/functions/server/escoProyeccionLegada.ts` | code: server/runtime mirror | Local source; no embedded record/credential identified |
| `src/supabase/functions/server/escoRespuesta.ts` | code: server/runtime mirror | Local source; no embedded record/credential identified |
| `src/supabase/functions/server/escoSolicitudIndividual.ts` | code: server/runtime mirror | Local source; no embedded record/credential identified |
| `src/supabase/functions/server/escoTurnoVerificado.ts` | code: server/runtime mirror | Local source; no embedded record/credential identified |
| `src/supabase/functions/server/telegram/bot.ts` | code: server/runtime mirror | Local source; no embedded record/credential identified |
| `src/utils/calculosClima.ts` | code: canonical utility | Local source; no embedded record/credential identified |
| `src/utils/escoAlcance.ts` | code: canonical utility | Local source; no embedded record/credential identified |
| `src/utils/escoAplicacionHechos.ts` | code: canonical utility | Local source; no embedded record/credential identified |
| `src/utils/escoClimaCalidad.ts` | code: canonical utility | Local source; no embedded record/credential identified |
| `src/utils/escoCobertura.ts` | code: canonical utility | Local source; no embedded record/credential identified |
| `src/utils/escoConsultas.ts` | code: canonical utility | Local source; no embedded record/credential identified |
| `src/utils/escoDispatcherVerificado.ts` | code: canonical utility | Local source; no embedded record/credential identified |
| `src/utils/escoEvidencia.ts` | code: canonical utility | Local source; no embedded record/credential identified |
| `src/utils/escoHechosClima.ts` | code: canonical utility | Local source; no embedded record/credential identified |
| `src/utils/escoHechosInventario.ts` | code: canonical utility | Local source; no embedded record/credential identified |
| `src/utils/escoHechosRegistros.ts` | code: canonical utility | Local source; no embedded record/credential identified |
| `src/utils/escoHechosTrabajo.ts` | code: canonical utility | Local source; no embedded record/credential identified |
| `src/utils/escoNucleoCatalogo.ts` | code: canonical utility | Local source; no embedded record/credential identified |
| `src/utils/escoNucleoComercio.ts` | code: canonical utility | Local source; no embedded record/credential identified |
| `src/utils/escoNucleoComun.ts` | code: canonical utility | Local source; no embedded record/credential identified |
| `src/utils/escoNucleoCultivos.ts` | code: canonical utility | Local source; no embedded record/credential identified |
| `src/utils/escoNucleoDefiniciones.ts` | code: canonical utility | Local source; no embedded record/credential identified |
| `src/utils/escoNucleoGanado.ts` | code: canonical utility | Local source; no embedded record/credential identified |
| `src/utils/escoNucleoOperaciones.ts` | code: canonical utility | Local source; no embedded record/credential identified |
| `src/utils/escoNucleoSolicitud.ts` | code: canonical utility | Local source; no embedded record/credential identified |
| `src/utils/escoNucleoTransporte.ts` | code: canonical utility | Local source; no embedded record/credential identified |
| `src/utils/escoPoliticaDatos.ts` | code: canonical utility | Local source; no embedded record/credential identified |
| `src/utils/escoProyeccionLegada.ts` | code: canonical utility | Local source; no embedded record/credential identified |
| `src/utils/escoRespuesta.ts` | code: canonical utility | Local source; no embedded record/credential identified |
| `src/utils/escoSolicitudIndividual.ts` | code: canonical utility | Local source; no embedded record/credential identified |
| `src/utils/escoTurnoVerificado.ts` | code: canonical utility | Local source; no embedded record/credential identified |
| `supabase/functions/make-server-1ccce916/calculosRadiacion.ts` | code: deployment mirror source | Local source; no embedded record/credential identified |
| `supabase/functions/make-server-1ccce916/chat.tsx` | code: deployment mirror source | Local source; no embedded record/credential identified |
| `supabase/functions/make-server-1ccce916/esco-consultas.ts` | code: deployment mirror source | Local source; no embedded record/credential identified |
| `supabase/functions/make-server-1ccce916/escoAlcance.ts` | code: deployment mirror source | Local source; no embedded record/credential identified |
| `supabase/functions/make-server-1ccce916/escoAplicacionHechos.ts` | code: deployment mirror source | Local source; no embedded record/credential identified |
| `supabase/functions/make-server-1ccce916/escoClimaCalidad.ts` | code: deployment mirror source | Local source; no embedded record/credential identified |
| `supabase/functions/make-server-1ccce916/escoCobertura.ts` | code: deployment mirror source | Local source; no embedded record/credential identified |
| `supabase/functions/make-server-1ccce916/escoDispatcherVerificado.ts` | code: deployment mirror source | Local source; no embedded record/credential identified |
| `supabase/functions/make-server-1ccce916/escoEvidencia.ts` | code: deployment mirror source | Local source; no embedded record/credential identified |
| `supabase/functions/make-server-1ccce916/escoHechosClima.ts` | code: deployment mirror source | Local source; no embedded record/credential identified |
| `supabase/functions/make-server-1ccce916/escoHechosInventario.ts` | code: deployment mirror source | Local source; no embedded record/credential identified |
| `supabase/functions/make-server-1ccce916/escoHechosRegistros.ts` | code: deployment mirror source | Local source; no embedded record/credential identified |
| `supabase/functions/make-server-1ccce916/escoHechosTrabajo.ts` | code: deployment mirror source | Local source; no embedded record/credential identified |
| `supabase/functions/make-server-1ccce916/escoNucleoCatalogo.ts` | code: deployment mirror source | Local source; no embedded record/credential identified |
| `supabase/functions/make-server-1ccce916/escoNucleoComercio.ts` | code: deployment mirror source | Local source; no embedded record/credential identified |
| `supabase/functions/make-server-1ccce916/escoNucleoComun.ts` | code: deployment mirror source | Local source; no embedded record/credential identified |
| `supabase/functions/make-server-1ccce916/escoNucleoCultivos.ts` | code: deployment mirror source | Local source; no embedded record/credential identified |
| `supabase/functions/make-server-1ccce916/escoNucleoDefiniciones.ts` | code: deployment mirror source | Local source; no embedded record/credential identified |
| `supabase/functions/make-server-1ccce916/escoNucleoGanado.ts` | code: deployment mirror source | Local source; no embedded record/credential identified |
| `supabase/functions/make-server-1ccce916/escoNucleoOperaciones.ts` | code: deployment mirror source | Local source; no embedded record/credential identified |
| `supabase/functions/make-server-1ccce916/escoNucleoSolicitud.ts` | code: deployment mirror source | Local source; no embedded record/credential identified |
| `supabase/functions/make-server-1ccce916/escoNucleoTransporte.ts` | code: deployment mirror source | Local source; no embedded record/credential identified |
| `supabase/functions/make-server-1ccce916/escoPoliticaDatos.ts` | code: deployment mirror source | Local source; no embedded record/credential identified |
| `supabase/functions/make-server-1ccce916/escoProyeccionLegada.ts` | code: deployment mirror source | Local source; no embedded record/credential identified |
| `supabase/functions/make-server-1ccce916/escoRespuesta.ts` | code: deployment mirror source | Local source; no embedded record/credential identified |
| `supabase/functions/make-server-1ccce916/escoSolicitudIndividual.ts` | code: deployment mirror source | Local source; no embedded record/credential identified |
| `supabase/functions/make-server-1ccce916/escoTurnoVerificado.ts` | code: deployment mirror source | Local source; no embedded record/credential identified |
| `supabase/functions/make-server-1ccce916/telegram/bot.ts` | code: deployment mirror source | Local source; no embedded record/credential identified |


## Local handler-verification addendum (no transmission authority)

The later verification phase adds two synthetic tests: `src/__tests__/escoWebHandlerCompleto.test.ts` and `src/__tests__/escoTelegramHandlerCompleto.test.ts`. Their complete contents were inspected locally: only fictional UUIDs, short test Telegram IDs, `synthetic-*` credentials that cannot authenticate, `.invalid` source hosts, fabricated business quantities, private-data canaries and closed transport factories. Existing provider/Telegram hostnames are intercepted, never used for real requests. No real business record, employee/contact identity or production payload was copied.

Six runtime files change in this phase: canonical/deployment copies of `chat.tsx`, `telegram/bot.ts` and `telegram/resolverUsuarioTelegram.ts`. Changes are request-shape checks and fixed operational error responses/log codes. No query projection, auth role/module/link rule, credential, data recipient, business calculation or database object is added by these handler corrections. The current phase also adds the technical handler/runtime verification report and updates the old receipt heading. The exact final path/category totals are provided by the final Git manifest, not silently attributed to the old 137-file snapshot.

A second scan inspected COMPLETE current changed files, not just their additions, for private-key blocks, JWT/provider/Supabase/Telegram token literals, credential-bearing database URIs and email literals. It found none; this remains a bounded scanner plus manual review, not proof about every possible encoding or repository history. The public bot account ID and source field names are not employee records. Any future transfer must use an explicit reviewed file allowlist, not the workspace, Git history, environment directories, build output, node_modules, execution logs or temporary artifacts.

This addendum does not resolve or retry the parent's publication/transfer denial. No destination received these files in this phase.

Final local manifest supplement: the frozen 137-path list plus these SIX paths comprises **143 changed text files** versus 76f9: 84 code files (26 utils, 29 server, 29 deployment mirror), 52 tests, 6 documents and 1 synchronization script:

- `src/supabase/functions/server/telegram/resolverUsuarioTelegram.ts`
- `supabase/functions/make-server-1ccce916/telegram/resolverUsuarioTelegram.ts`
- `src/__tests__/escoWebHandlerCompleto.test.ts`
- `src/__tests__/escoTelegramHandlerCompleto.test.ts`
- `docs/faithfulness/local-publication-classification.md`
- `docs/faithfulness/local-handler-runtime-verification.md`

The resolver's sole behavioral difference in this phase is a fixed diagnostic log code instead of the returned database message; identity resolution results and filters are unchanged. The final source/test checks pass locally; no external action follows from that fact.
