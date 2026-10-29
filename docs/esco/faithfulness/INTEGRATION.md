# Current I03-e — unchanged actual loop with closed HTTP

Branch `codex/esco-faithfulness-eval-loop`; target #364 branch `codex/esco-faithfulness-eval-replay` at reviewed `19d16783e7af0dde3a95057dea45446ece76e4a5`. Incremental scope: test-only actual-loop runner, one factory-created synthetic births scenario with adversarial variants, matching tests, tracker docs. Neither mirrored `chat.tsx` nor other runtime source changes. Earlier slice contracts follow as history.

- `evals/esco/lib/ejecutorCongelado.ts` imports the actual runtime under Vitest and invokes its existing three-argument loop. Real `executeTool`/consultation code runs against closed synthetic HTTP responses, unlike #364's declarative trace composition. No optional tool-injection runtime patch or evidence rewrite is imported from the preserved branch.
- Install before runtime import: fixed synthetic Deno values for only the database URL and two placeholder keys, never inherited Deno/process.env. A fresh fetch function matches normalized URL/query, method, normalized header digest and canonical-JSON hash of raw body text. Only exact model POST and explicitly listed GET/HEAD fixture-DB REST requests are eligible. No inherited transport capture/use/fallback. Reject unknown reads, all other writes, body/header/query mismatches, provider lookalikes, fragments, userinfo, malformed responses and every 3xx response.
- HTTP exchanges reuse the strict fixture adapter (`tool: http`, signature args). Start each turn, call `verificarFin()` after actual loop return, then `verificarCasoFin()` after all turns. All adapter lifecycle/transport/config failures are privately sticky; clearing returned diagnostics cannot approve the run. Runtime-swallowed HTTP failures become infrastructure errors/inconclusive. Response503 and truncated server pagination remain actual tool errors and retain the existing birth-query abstention behavior; this is current-runtime regression evidence, not a new agent fix.
- Exactly one declared synthetic case/scenario is supported; questions/channel/clock must match. The golden-shaped synthetic case is explicitly unadjudicated/excluded and has no historical original runs. Fixture timestamps require seconds00 matching the case's minute clock. Freeze Date only, reject preowned fake timers or overlapping installations, restore exact fetch/Deno descriptors and real timers in finally. New installation means new fixture state; pending requests cannot finish successfully after restoration. Trusted test scope, not an arbitrary-JavaScript/process-wide network sandbox.
- Completed answers feed raw follow-up history and deterministic scoring/measurement v1.1. Separate HTTP attempt and tool-event records preserve failed-turn diagnostics; they are not complete successful-turn traces. Judge/review, real token usage and latency remain unavailable. Scripted model responses, partial/error fixtures and pinned request hashes prove protocol/transport consistency, not provenance, retrieval truth, calibration or real-model quality. Record pack/scenario/case/prompt hashes; code identity is the candidate SHA plus unchanged reviewed runtime blobs. No currency-spend or source-byte authorization claim.
- Synthetic checks cover actual two-turn query/history, numeric contradiction, unavailable503/server-partial evidence, unexpected and unused fixtures, sticky lifecycle failures, method/query/body/header mismatch, redirects, malformed replies, exact global restoration, pending-request isolation and clock ownership. An independent reviewer reproduced the inherited-mock spy-ledger defect; fresh descriptor installation corrected it, verified by31 tests and7 additional assertions. Model body signatures were captured only under closed-network denial and pinned; intentional protocol/schema changes require reviewing/re-recording those fixtures, not loosening matchers.

Morning order: #359 → #361 → #363 → #364 → this PR. Keep all draft/unmerged tonight. Do not merge `codex/esco-faithfulness-offline-base`. After prior merges, reconcile docs and dependencies, retarget each child as appropriate and rerun full checks/CI on its changed final head. Rollback of this slice is a test/docs revert, no schema/runtime/deployment rollback. No mobile/live/provider QA is exercised.

Remaining product gates: integrate reviewed queue; expand reviewed synthetic coverage toward original P0-03's12–15 scenarios; separately authorize/review I04 runtime evidence/injection if tool-boundary replay is selected; preserve alert/F1 fixes; obtain explicit provider/private-payload approval before private calibration; separately authorize migrations/deployment/live Web/channel QA and any telemetry/paid schedules. D01 remains resolved, but hashes/budget alone do not authorize disclosure. Alert deployment/migration186 remains with its other owner; no live state queried. No new user decision is required to review this strictly synthetic milestone. Stop here for parent review, no next stage.

# Current I03-d — offline scripted evaluator composition

Runner branch: `codex/esco-faithfulness-eval-replay`, target integration base `codex/esco-faithfulness-offline-base` at `158720fed6ceb461efd34746760db520c557d2a3`. This uses #359 explicit dates, #361 raw history/windows and #363 closed fixture state; it cannot honestly target main until those dependencies land. The PR incremental diff adds only replay composition/tests and tracker updates. Integration-base provenance/order follows below; do not merge that base as a replacement for the reviewed slices.

## Composition contract and evidence limits

- `ejecutarReplaySintetico(pack, scripts, promptBase)` accepts strict JSON synthetic manifests and declarative per-turn tool-call/answer scripts. It supplies no executable callback, URL, fetch fallback, model key or implicit environment/config. Unknown script properties, functions, lossy values and tampered hashes reject before execution. No source scenario pack or private fixture is loaded.
- It builds the reviewed channel messages, matches each request through the closed fixture adapter, calls `verificarFin()` for every turn and `verificarCasoFin()` after the last turn, then runs deterministic scoring and measurement **v1.1** with an explicitly unavailable semantic judge/review. Failures remain inconclusive; success of scripted plumbing is not verified service success. Missing scenarios remain listed against all expected manifest IDs; zero scripts is zero coverage, not a fallback/all selection.
- Error/unknown/partial/stale/empty/truncated results are opaque full JSON serialization. No production event means no invented `error:false`, token usage or timings; metadata usage=null. No result-summary truncation simulation or real-model prompt-injection defense is claimed. Both channels' existing windows are retained, including Telegram omitting new questions beyond 20 stored rows; scripts do not prove the model could answer from that window.
- Only completed turns enter `corrida.turnos`. Calls consumed inside a later-failing turn are not a complete attempted-call audit; earlier completed turns remain. Fixture diagnostics and `corrida.error` retain invalidity, so partial traces cannot produce verified success. This matches the source runner's completed-turn behavior.
- Timestamp is explicit Bogotá UTC-5. Fixture seconds are preserved by applying the validated seconds after the minute-resolution date helper. No global clock freeze or runtime-date claim. Synthetic labels remain unadjudicated/no_verificable and excluded from golden; no immutable historical label is edited. Scripts can declare numeric/date anchors for seeded controls, not independently adjudicated truth.
- Record pack/scenario/script/base-prompt SHA-256 and reference/rubric versions. These are canonical JSON hashes (including quotes for strings), not original byte hashes, code hashes or authorization/provenance proof. Candidate code identity is the reviewed PR SHA; no unverifiable git/source stamp is invented by the pure API.
- Network proof: the bounded import graph reaches only offline helpers plus node:crypto; no network/runtime/env path or executable transport input exists. Tests deny inherited fetch while executing both channels and failures, and reject executable injection. This proves this declarative composition makes no network calls in those controls. It is not a sandbox for malicious JavaScript, a general HTTP interceptor, production-loop replay or proof against every process-side network path.

Next milestones: after reviewed dependencies land, retarget/retest this runner; add a separately reviewed production-loop/transport integration with sticky no-fallback guards; review synthetic scenario provenance and coverage; then authorized calibration/live QA. No private disclosure/provider/production/runtime activation is implied. Original P0-03 acceptance criteria remain unfinished until actual-loop isolation is verified. No P1-02 or further slice starts here.

Rollback: revert only incremental offline files; no schema/runtime/deployment rollback. No mobile/provider/live QA applicable to this pure API. Security and alert deployment/migration owner remains separate.

# Offline integration base (PR target only)

This branch combines exact reviewed heads #359 (`9de2be29a90a37760d0ce81ed8052eda38ad1bed`), #361 (`917f9ad42b8b491f97f277254af9a97f892210b7`), and #363 (`2f996c7cacebab5a05d03ce5fbd07590b0e67a19`) through local merge commits. No GitHub PR is merged and main stays `6a2dd50`. The only merge conflicts were the three shared tracker docs; the later #363 snapshot supplies current scope/links, and original histories remain in their unchanged parent commits. No code conflict or implementation edit.

Purpose: minimal explicit base for the dependent offline runner PR, avoiding sibling-code duplication in a main-targeted diff. **Do not merge this integration branch to main.** Morning order: #359 → #361 → #363, reconcile docs and retest each final head; then rebase/merge current main into runner as appropriate without force-pushing, retarget runner to main only after its dependencies are present, inspect the incremental diff and rerun all gates/CI. No merges tonight. The runner uses dates, raw history and the fixture adapter, so it requires all three candidates.

The prior #363 tracker snapshot follows as history, not a claim this base is another publishable slice.

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
