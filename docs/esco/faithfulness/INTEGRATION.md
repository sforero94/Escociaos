# Faithfulness integration — I03-d refresh

## Current I03-d candidate — 2026-10-30 UTC

Actual main0e80cae23ab257a845ba94db18a09d1a4856a5f6, root tree84ac7a28b28f08fbbeda22bfba9c9dde592e5641, now contains359/361/363. Existing draft364 is refreshed through a non-forced merge with original19d16783e7af0dde3a95057dea45446ece76e4a5. Its original replay implementation/tests and all nine imported dependency source blobs are unchanged. Retarget364 to main, not the obsolete offline integration-base; do not merge that base as a PR. Only two original composition files and three reconciled trackers differ from current main. Preserve all security,371 UI/runtime/control source and PO work.372 is unrelated/unmerged, not a dependency.

Merged363 head4fae9c0, merge0e80cae: postmerge CI40994634155/job123864789506 passed5034 tests/227 files, types/lint; GitHub Vercel status success. The reviewed fixture files remain identical2f996c7. Backend371 release40992476137 previously stopped before management access; no backend operation occurs here. Parent reports188 applied separately; no SQL, historical repair or live query in this task.

Current task stops at reviewed draft/terminal CI before parent ready/merge go, under the user's specific364 grant. After364 lands, reconcile366 against actual current main and retest; no readiness claim for future heads. No providers, private fixtures, environment/credentials, production reads/writes or deployment.

## Composition contract and evidence limits

- `ejecutarReplaySintetico(pack, scripts, promptBase)` accepts strict JSON synthetic manifests and declarative per-turn tool-call/answer scripts. It supplies no executable callback, URL, fetch fallback, model key or implicit environment/config. Unknown script properties, functions, lossy values and tampered hashes reject before execution. No source scenario pack or private fixture is loaded.
- It builds the reviewed channel messages, matches each request through the closed fixture adapter, calls `verificarFin()` for every turn and `verificarCasoFin()` after the last turn, then runs deterministic scoring and measurement **v1.1** with an explicitly unavailable semantic judge/review. Failures remain inconclusive; success of scripted plumbing is not verified service success. Missing scenarios remain listed against all expected manifest IDs; zero scripts is zero coverage, not a fallback/all selection.
- Error/unknown/partial/stale/empty/truncated results are opaque full JSON serialization. No production event means no invented `error:false`, token usage or timings; metadata usage=null. No result-summary truncation simulation or real-model prompt-injection defense is claimed. Both channels' existing windows are retained, including Telegram omitting new questions beyond 20 stored rows; scripts do not prove the model could answer from that window.
- Only completed turns enter `corrida.turnos`. Calls consumed inside a later-failing turn are not a complete attempted-call audit; earlier completed turns remain. Fixture diagnostics and `corrida.error` retain invalidity, so partial traces cannot produce verified success. This matches the source runner's completed-turn behavior.
- Timestamp is explicit Bogotá UTC-5. Fixture seconds are preserved by applying the validated seconds after the minute-resolution date helper. No global clock freeze or runtime-date claim. Synthetic labels remain unadjudicated/no_verificable and excluded from golden; no immutable historical label is edited. Scripts can declare numeric/date anchors for seeded controls, not independently adjudicated truth.
- Record pack/scenario/script/base-prompt SHA-256 and reference/rubric versions. These are canonical JSON hashes (including quotes for strings), not original byte hashes, code hashes or authorization/provenance proof. Candidate code identity is the reviewed PR SHA; no unverifiable git/source stamp is invented by the pure API.
- Network proof: the bounded import graph reaches only offline helpers plus node:crypto; no network/runtime/env path or executable transport input exists. Tests deny inherited fetch while executing both channels and failures, and reject executable injection. This proves this declarative composition makes no network calls in those controls. It is not a sandbox for malicious JavaScript, a general HTTP interceptor, production-loop replay or proof against every process-side network path.


Rollback: revert the incremental offline composition/test/docs only. No schema/runtime rollback. This slice does not complete private calibration or the original P0-03 scenario coverage requirements; actual-loop integration is366, separate.

## Historical I03-c refresh (merged363)

Current remote main13ef1f4ded1d0505d8d9b5b823314a65c891f2fe, root treecc3d23322fb78c047207717cdb86dee4255199db. Existing draft363 receives a non-forced merge integration with its original2f996c7cacebab5a05d03ce5fbd07590b0e67a19 head. Both fixture implementation/test blobs remain byte-identical. Only the three shared trackers are reconciled; no sibling runner/runtime code is imported. Preserve359/361, security360/362,371 UI/source/controls and PO documents. Draft372 remains separate and is not a dependency.

PR371 is merged; postmerge CI40987891472 passed4994 tests and GitHub Vercel status succeeded. Its diagnostic40988136741 passed; approved release40992476137 stopped at anonymous diagnostic-log redirect verification, before the management step. It did not deploy or roll back; backend remains the last verifiedv281. Parent reports188 separately applied/postverified02:32:12UTC with ledger20261030023201, no historical repair. This offline refresh performs no production reads, writes, providers, permission changes, migrations or deployment.

User specifically authorized363→364→366 integration, but this task stops at a reviewed candidate/CI for the parent before ready/merge. Do not merge the old offline integration-base. After363 lands, reconcile364 on actual current main and retest;366 follows only after364. These future candidates are not declared ready against an unknown future main.

### Preserved fixture contract and limits

Node-only helper with node:crypto; no I/O, network, environment, provider or app/runtime import. Caller supplies an explicitly synthetic manifest; no private scenario pack is bundled. Canonical JSON validates lossless finite values and exact scenario/turn/tool/argument keys. Hashes establish supplied-content consistency, not provenance, human adjudication or truth. Errors, missing/partial/stale evidence and instruction-like output remain opaque results.

Each installation clones its manifest and retains private sticky failure state. Unmatched/repeated calls, malformed arguments, unconsumed fixtures, skipped turns or attempted state resets cannot be repaired by clearing diagnostics. Consumers must call BOTH verificarFin() before advancing and verificarCasoFin() after the final turn, and propagate failure as unavailable/inconclusive. The adapter itself is not a process-wide network sandbox or a model-quality measurement. Measurementv1.1, immutable labels/adjudication and no direct v1 rate comparison remain unchanged.

Initial reviewed363:40 fixture tests/4797 full tests on2f996c7; parent independently passed15 extra assertions. Those are historical evidence, not validation of this refreshed combination. Final candidate focused/full checks, independent review and exact-head CI are recorded in the handoff. Rollback is an offline source/test/docs revert; no database or deployed-behavior rollback.

## Historical application-correction scope before371 merge

Baseline main `f175c78a1bc65955f34247589698958565ab20b6`, root tree `8baf11662a14df15ac8484ddab52d9b4cdbc2771`, includes merged359 and361. Preserved planning source remains `3d3e65454d8d2f78971593f1fe90a0514ce22301`.
The current application-domain correction changes runtime source, UI date validation and a draft database trigger. It is not deployed. One-time371 controls/tests/docs are now prepared in the same draft, fixed to unchanged e7a5545 runtime. No dispatch or management-secret access occurred; RELEASE_PR371.md defines separate diagnostic/release gates. Security, accepted runtime367/release controls and PO changes remain intact.

The owner explicitly selected actual execution dates by default, planned dates only on explicit intent, and independent start/end validation for both pairs. Direct execution-tool routing, normalized name matching, ambiguity and incomplete-evidence safeguards address application lookup. See [APPLICATION_CORRECTION.md](APPLICATION_CORRECTION.md) for inventory, write boundaries, tests and activation limits. No business records are rewritten; migration188 is draft only.

Measurementv1.1, immutable labels and adjudication safeguards remain unchanged. No private fixture or provider call is included. Offline363→364→366 stays queued while this correction is reviewed.

## Historical queue before371 merge and accepted367 release

| Slice | Current state | Dependency / next action |
| --- | --- | --- |
| I01 | PR357 merged | 15 corrected synthetic anchor tests; prior evidence retained below |
| I02 | PR358 merged | Pure scoring/reporting and measurementv1.1; prior CI40765357918 passed |
| I03-a | PR359 merged | Merge50d3776; postmerge CI40956872042 passed |
| I03-b | PR361 merged | Mergef175c78; postmerge CI passed |
| I03-c | PR363 draft | Reconcile against current main; closed fixture transports |
| I03-d | PR364 draft | Reconcile after363; offline runner composition |
| I03-e | PR366 draft | Reconcile after364; synthetic actual-loop integration |
| I04-a | PR367 merged and backend released | Accepted corrective summary-safety portion only; broader runtime work remains separate |
| P1-02 | Not started in this continuation | No authorization to advance here |

Do not merge `codex/esco-faithfulness-offline-base`. Reconcile tracker conflicts and retest each later candidate.
Security #360/#362, migration files, release controls and all PO changes remain part of the base.
No subsequent slice is included to satisfy imports.

PR367 fixed source `634580480c72b27c7ccd2d8c006af520d0ca1058` deployed as v281.
PR370 merged at `9a447d9e1a9202b07dee7e555435443b47892f4a`.
[Release40951834611](https://github.com/sforero94/Escociaos/actions/runs/40951834611) passed once, with no rollback.
Both native80-file captures passed exact source/cache/type checks; reconstructed82-file comparisons matched pinned rollback Git.
This proves source/configuration recovery, not bit-identical ESZIP, dependencies, runtime or secrets.
Metadata confirmed ACTIVE, verify_jwt=false and updated2026-10-29T20:45:46.924Z; anonymous health passed.
Parent accepted read-only browser smoke at20:50–20:53UTC: session, dashboard, expense history and Registrar; no application console errors.
No functional births query, real model calibration or business write was tested.
Temporary release controls remain pending a separately reviewed cleanup after acceptance; this refresh does not remove them.
The historical drift Actions failure was not rerun; read-only source/tree/metadata checks subsequently aligned.

## I04-a behavior retained from main

Saved summaries preserve own error markers and downgrade completeness after context truncation.
The births gate rejects error/context-loss summaries. Short results, complete-empty and valid paginated aggregates remain compatible.
Immediate full tool payloads remain unchanged. This is not a hard size cap or general semantic fact checker.
The completed correction reproduced six failures, then passed76 focused and26 independent synthetic assertions.
Those historical counts are not PR361 validation and are not live faithfulness measurements.

## Validation for this refresh

All message source/test blobs retain their reviewed917f9ad identities; the existing main input adapter remains unchanged.
Original23 focused message tests covered19/20/21 rows, repeated turns, excluded evidence, absent values and malformed protocol.
Earlier findings corrected missing-value formatting, unknown-channel fallback and unbounded21/23-row histories before that reviewed head.
Those are historical implementation receipts, not validation of this refreshed candidate.
Final-head full suite, evaluator check, types, lint, build, independent review and exact-head CI are required for this refresh.
No unrun check is marked passed here. No private JSONL, paid provider, live calibration or production write is exercised.

## Review corrections and measurement semantics

- Strict judge verdict types: an array such as `["cumple"]` is rejected, not string-coerced. Duplicate/unknown/missing criterion checks and typed flags remain required.
- Verdict combination validates an `ok` judge against the case criteria. Missing/malformed judges become unavailable/inconclusive; a missing or inconsistent deterministic layer cannot pass. Hard deterministic failures remain conclusive without a judge. Infrastructure failures retain the source legacy `inconcluso` behavior.
- Measurement **v1.1** retains v1 denominators and explicit missing-case coverage, but requires nonblank reviewer/version and fully supported reviewed claims for verified success. Citations alone and contradictory/incomplete reviews cannot produce success. Partial answers can succeed when their actual claims are supported and the review approves the limitation. Legacy pass rate remains separate from service success.
- Adjudication requires the expected source SHA-256 argument; unknown/missing hashes fail. The future loader must compute it from authorized source bytes. Synthetic tests supply the declared test value; they do not verify any private dataset. Purchase-only views require the expected evidence key/criterion and retain cloned nested values, so later view edits cannot mutate originals. D01 labels/rubric dispositions are unchanged.

Review tests reproduced seven failures before correction, then two additional
adjudication failures (shared nested evidence and absent purchase snapshot).
A further regression reproduced corrupt report counts for inherited object names; grouping now uses dictionaries without inherited properties. Initial imported suite: 58 passed. After correction: 77 focused tests passed,
zero skips. An initial type check caught ES2022 `Object.hasOwn`; the implementation
now uses the existing ES2020-compatible API. No test or compiler setting relaxed.
Final-candidate checks are reported with the exact handoff SHA after commit.

These are typed pure APIs, not a general decoder of arbitrary run/review JSON.
I03-a adds case-shape/calendar validation; semantic input truth remains unverified. Prompt separation is tested synthetically;
no real model injection-resistance claim follows. Anchors only check token presence:
`1.234` retains both numeric candidates, small integers remain soft, and a strong
anchor may occur in any evaluated turn. This does not prove entity/period support,
calendar validity, retrieval truth or model quality. Reports remain offline Markdown;
no UI, endpoint, stored history or release gate is activated.

## Independent I02 correction pass

Four findings from parent review were reproduced and corrected on I02 only:

1. Judge envelopes now require a clean JSON object or one complete optional-`json` fenced response. No brace-slicing salvage; truncated arrays, trailing/prefixed prose, incomplete fences and array envelopes are rejected. Existing schema validation still applies after parsing.
2. `motivos[].n` is explicitly the number of failed runs with that category, once per run. Multiple failed anchors remain separate in `determinista.chequeos` and detailed reasons, but count once under “Corridas”. One-run and multiple-run regressions verify both units and retained diagnostics.
3. An actual `error: true` tool requires a boolean `oculto_fallo_herramienta`. Null assessment marks the judge unavailable/inconclusive and prevents verified success, even with an approving review. Explicit false permits a declared limitation; true fails. Unknown historical tool status/absent summary does not invent a failure.
4. The judge prompt treats historical drift as a comparability limitation, not blanket numeric tolerance; only explicit approved tolerances apply. Original human labels and adjudication dispositions are unchanged.

**Do not compare v1 rates directly with v1.1.** Recompute under the same scoring,
judge-prompt, evidence and review contract before making comparisons; a matching
headline version alone is insufficient. No quality-improvement claim is measured.

Regressions initially failed 9 cases for the first pair, then 2 cases for the
second pair; after fixes all 92 evaluator tests pass before commit, zero skips.
Final-candidate checks are reported in the correction handoff; `115db6e`'s
77 evaluator / 4742 full tests remain historical. No new scope or publication.

## Historical I01 evidence — not I02 validation

- Original source was 18 ahead / 37 behind main `ad5455ffa371d847191f92c7f7dbdc3404628046` during I01 extraction.
- Initial candidate: 13 tests, zero skips; types/focused lint passed. Repository lint passed with 907 warnings; build passed in 17.97s; alert/F1/edge parity regression 232 tests across 6 files passed. Source code/test byte equality and whitespace check passed then.
- Initial implementation `16e95e342620b7412d6614493c9e66ddc00c8f6a` and documentation handoff `f7ad0dae0df236771ddd7e18767f0e5343e0f8c5`: 13 focused / 4678 full tests, zero skips, types/lint/build passed. Logs `/tmp/esco-i01-final-*` and `/tmp/esco-i01-handoff-*`.
- Independent I01 review: sign/year regressions reproduced 2 failures / 13 passes; fixes in `abb0ec5`. Reviewed final head `b6470a4`: 15 focused / 4680 full tests, zero skips; types/lint/build/whitespace passed. Corrected build 30.29s; 907 existing lint warnings. Logs `/tmp/esco-i01-corrected-*`.
- I01 publication was initially denied, then explicitly approved at 19:55 UTC. PR #357 opened; parent reviewed and merged after the user's 20:10 UTC approval. Earlier “no PR” and “publication blocked” notes in session history describe the earlier state only. I02 publication was later approved; PR #358 passed CI and merged.

## Gates, QA and rollback

Only synthetic tests; no private JSONL retrieval/read/transmission or provider
calls. D01 remains resolved; P0-02 private disclosure to OpenRouter remains blocked.
The $1 cap does not authorize disclosure. Security PR #324, medium security fixes,
credentials and access remain outside scope.

PR367 and the reviewed release controls completed the separate backend release below.
This application correction prepares migration188 without applying it; no deployment, telemetry, pilot or canary change.

PR361 is merged. The application correction remains draft pending review and separate activation approval.
Application rollback requires coordinated UI/backend source revert and removal of its date-order trigger if separately applied; no data restoration is supplied.
Existing desktop/browser acceptance does not validate these pure modules or live model faithfulness.
