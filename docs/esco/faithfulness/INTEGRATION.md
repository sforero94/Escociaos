# Faithfulness integration — I03-a current-main refresh

## Current baseline and scope

Current main is `2a8671a1af027815cadac5d6f39009558fc0a6cc`, reverified 2026-10-29 UTC.
Preserved planning source remains `3d3e65454d8d2f78971593f1fe90a0514ce22301`.
I01/#357 and I02/#358 are merged. PR359 is the next offline slice; it remains draft.
The reviewed input head was `9de2be29a90a37760d0ce81ed8052eda38ad1bed`.
This refresh reconciles shared trackers and integrates main without changing its four adapter/test blobs.
No source branch, security change, release control or PO document is overwritten.

I03-a is a pure input adapter, independent of the remaining queued runners and transports.
`golden.ts` validates declared JSONL case shape, selection controls and text variants.
`fechas.ts` converts explicit evidence timestamps under the fixed Bogotá UTC-5 contract.
Malformed rows, dates, nested fields and selection controls fail closed.
Unknown historical tool status, null snapshots and empty original answers remain explicit.
Unmatched valid selections return an empty array; future runners must expose empty coverage.
No clock-based today, filesystem/environment access, provider, private fixture, runtime import or CLI is included.
Only synthetic factories are used. Shape validation does not establish business truth or provenance authenticity.
Immutable labels, adjudication safeguards and measurementv1.1 remain unchanged.

## Integration order and accepted release

| Slice | Current state | Dependency / next action |
| --- | --- | --- |
| I01 | PR357 merged | 15 corrected synthetic anchor tests; prior evidence retained below |
| I02 | PR358 merged | Pure scoring/reporting and measurementv1.1; prior CI40765357918 passed |
| I03-a | PR359 draft, current refresh | Input adapter only; independently review before merge |
| I03-b | PR361 draft | Reconcile after359; message builders only |
| I03-c | PR363 draft | Reconcile after361; closed fixture transports |
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
Those historical counts are not PR359 validation and are not live faithfulness measurements.

## Validation for this refresh

The local current-main snapshot matched root tree `8e803295709422d5bd86285dba5637ea9386f73d` before applying PR359.
All four input source/test files retain their reviewed9de2be2 blob identities.
Final-head checks and CI belong in the handoff and PR receipt; no unrun check is marked passed here.
Original input evidence:22 source failures reproduced before correction;53 input/145 combined evaluator tests passed.
Independent prior review passed111 additional assertions. This refresh requires its own independent review and complete local checks.
No private JSONL, paid provider, deployed runtime, production business query or disclosure gate is exercised.

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
This I03-a refresh makes no migration, deployment, telemetry, pilot or canary change.

PR359 remains draft pending final checks, parent review and specific merge approval.
Revert its offline adapter/tests to roll back; no schema or traffic rollback is required.
Existing desktop/browser acceptance does not validate these pure modules or live model faithfulness.
