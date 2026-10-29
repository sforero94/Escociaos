# Faithfulness integration — I03-c

## Baseline and queue

Main `6a2dd50bea966f733d6ef42b15bf1346ca77d6dc` includes I01/#357 and I02/#358. Preserved source remains `3d3e65454d8d2f78971593f1fe90a0514ce22301`. Both remote refs reverified. Draft #359 input and #361 messages are green and unmerged. Security #360/#362 are parent-owned and untouched. No merges tonight.

| Slice | Scope | Integration order |
|---|---|---|
| I01/I02 | Anchors, scoring, measurement v1.1/reports/adjudication | Merged #357/#358 |
| I03-a | Input validation/selection and explicit dates | Draft #359, main base, review first |
| I03-b | Pure channel history/message builders | Draft #361, independent main base, review second |
| I03-c | Closed synthetic tool-fixture adapter | This branch `codex/esco-faithfulness-eval-fixtures`, independent main base, review third |
| I03 remainder | Transport-independent runner composition, authorized loaders/config and closed HTTP/model guards | Adapt to #361 raw-history API, #359 input/date contract and this adapter's finalization; no runtime/provider/private data automatically authorized |
| I04 | Runtime injection/evidence changes and both edge copies | Separate review; preserve alert/F1; deployments separately gated |
| P1-02 | Execution/control changes | Not started; requires parent dispatch/prerequisites |

No code dependency among queued I03 slices: no stacking, duplicate module or retarget needed. Three tracker docs overlap. After each earlier merge, reconcile current state while preserving historical evidence and rerun checks/CI on the changed final head before the next merge. Do not reuse old CI receipts or force-push.

## I03-c replay contract

- Node-only offline helper uses `node:crypto` SHA-256; no app/runtime import, I/O, fetch, environment lookup or provider code. Caller supplies explicitly synthetic manifests, no bundled dataset. Tests construct synthetic controls. Source case/model conversion and scenario pack excluded pending separate provenance/runner review.
- Canonicalization sorts object keys, preserves arrays and null vs absent keys. Rejects nonfinite numbers, undefined, functions, bigint, sparse/decorated arrays, symbols, accessors, hidden properties, exotic prototypes, cycles and depth above 100. JSON `-0` normalizes to `0`. This is not a general arbitrary JavaScript-object decoder.
- Manifest validates schema/source/review declaration, nonblank versions, unique SYN IDs, exact channel, explicit valid local timestamp, criteria/turn/fixture shapes, exact scenario hash index and duplicate tool/argument keys per turn. Hashes prove integrity relative to the supplied manifest only: a self-declared flag/hash does not establish provenance, real-world truth, human adjudication or a source-byte authorization gate.
- Each installation snapshots its manifest. Matching has no fallback. Each call consumes one fixture. Call `verificarFin()` before advancing and `verificarCasoFin()` after the last turn. Unconsumed fixtures, early finalization, skipped turns, unknown/duplicate calls and invalid arguments permanently invalidate the installation, even when exceptions are caught or diagnostics cleared. A separately valid run needs a new installation.
- Empty/null/errors/partial/stale/missing evidence and long/truncated/instruction-like strings remain opaque JSON results. No approval, repair or success promotion. Truncated strings are JSON-encoded as strings (`JSON.stringify(result)`), matching the source API; not raw HTTP transcripts. Intentional duplicate metadata is preserved but no scripted model runs here.
- Future orchestration must invoke both finalizers and propagate invalidity as unavailable/inconclusive. This adapter cannot intercept networking or prove production-loop isolation. Mocked answers cannot measure quality. Measurement v1.1, labels and adjudication remain unchanged; v1 comparisons require common-contract recomputation.

## Review, remaining milestones and rollback

Initial source controls: 10 failed, 1 passed. Independent QA found channel-array coercion and custom-array hash behavior; both fixed with regressions. Focused lint initially rejected a sparse literal; same invalid input now constructed using `Array(2)`, no lint relaxation. Final-head test/type/lint/build receipts are in the handoff/PR.

Remaining useful work: transport-independent runner composition; closed transport/network-denial verification; separately reviewed runtime injection/evidence; synthetic scenario provenance/coverage review; then authorized calibration/live QA. No completed calibration or live-faithfulness claim.

Rollback: revert offline files. No schema/history/traffic rollback, no mobile/live channel/provider QA exercised. Alert migration186/edge deployment belongs to the other owner; no live ledger/deployment state queried. Private disclosure, paid calls, telemetry, schedules, canaries and activation stay gated.

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
Golden input validation remains I03. Prompt separation is tested synthetically;
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
- I01 publication was initially denied, then explicitly approved at 19:55 UTC. PR #357 opened; parent reviewed and merged after the user's 20:10 UTC approval. Earlier “no PR” and “publication blocked” notes in session history describe the earlier state only. I02 publication is a separate approval and has not been attempted.

## Gates, QA and rollback

Only synthetic tests; no private JSONL retrieval/read/transmission or provider
calls. D01 remains resolved; P0-02 private disclosure to OpenRouter remains blocked.
The $1 cap does not authorize disclosure. Security PR #324, medium security fixes,
credentials and access remain outside scope.

PR #356 described migration 186 unapplied and edge deployment pending. No live
ledger or deployment state is queried here; that owner remains responsible.
No migration, deployment, telemetry, recurring spend, pilot or canary.

Recommend publishing/merging I02 only after parent review, explicit draft-publication
authorization and PR CI. Rollback is a normal revert; no schema, history or traffic
rollback. Desktop/mobile/live Web/Telegram QA is not exercised by these pure
modules. A future runtime release requires authorized checks in both channels and
preservation of alert/F1 behavior; these synthetic tests do not establish live QA.
