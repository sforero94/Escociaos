# Faithfulness integration — current scope I03-b

## Current baseline and scope — I03-b

Main is `6a2dd50bea966f733d6ef42b15bf1346ca77d6dc` (I01/I02 merged).
Source remains `3d3e65454d8d2f78971593f1fe90a0514ce22301`; refs verified.
I03-a [draft #359](https://github.com/sforero94/Escociaos/pull/359) is queued at
`9de2be29a90a37760d0ce81ed8052eda38ad1bed`, exact-head CI
[40798708653](https://github.com/sforero94/Escociaos/actions/runs/40798708653) success.
No PR is merged tonight. Security draft #360 is separate and untouched.

Fresh branch `codex/esco-faithfulness-eval-messages` contains **I03-b only**:
pure message builders and synthetic history/parity tests. It requires only merged
I02 types; no #359 input/date import, so target **main**, not a stacked branch.
No whole-source merge/cherry-pick; no date helper, runner, CLI, provider, env/credential
access, private fixture, runtime import/edit, database call or deployment.

## Message contract and review evidence

- Callers supply chronological persisted user/assistant rows and a base prompt (including any authorized memories). Expanded LLM messages/protocol are rejected instead of guessed back into rows. The future runner must adapt to this explicit API; no current app imports it.
- Window applies to persisted rows **before** evidence expansion: Web latest 20, Telegram earliest 20. This intentionally reproduces current Telegram omission of newer questions beyond the window; it does not repair production. Caller supplies database ordering/ties; no query is executed.
- Tool summaries are opaque and unchanged, including long, error, stale, partial and malformed/truncated JSON. Missing args/summary render as `undefined`, matching both current channels. Tool `error` flags remain in the evaluation trace; the runtime history format does not independently serialize them. No unknown state becomes an invented success or empty object.
- Metadata expands only for assistant rows. Prompt adjustment applies once from the supplied base, rather than recycling an already adjusted system prompt. Raw histories clone independently; no input or original answer is changed. Literal instruction-like text stays within its existing message; no real-model injection-resistance claim.
- Static tests inspect format/window fragments in both Web and both Telegram edge copies. They do not import/execute handlers or verify database ordering, delivery, permissions or persistence. No hard byte-bound or freshness/fact validator is claimed.

Initial controls reproduced three failures: absent-value formatting in both
channels and unknown-channel fallback. A separate QA/code-quality role found
unbounded 21/23-row histories against production's 20-row limit. That finding was
fixed with the explicit raw-history API. Independent re-review: 23 focused tests
passed, no new defects. Tests cover 19/20/21 rows, excluded evidence, >20 expanded
messages, repeated-turn isolation, error/truncation, invalid protocol and cyclic
args. Only factory-created synthetic histories; no source private fixtures.

## Queue order and later integration

Review #359 first, then I03-b. The code is independent and requires **no retarget**.
The three tracker docs overlap: after #359 merges, reconcile them on this branch,
retain both histories/current facts, and rerun final-head checks/CI before merging
I03-b. Do not force-push or mark old checks as verification of a changed head.
No merge is authorized tonight; no further slice begins without parent dispatch.

## Integration sequence

| Slice | Contents | Dependencies / review boundary |
|---|---|---|
| I01 (merged) | Numeric/date helper, 15 synthetic tests, check command, tracker | PR #357; two reviewed parser corrections retained |
| I02 (merged) | Pure scoring/measurement v1.1/report/adjudication | PR #358; main 6a2dd50 |
| I03-a (queued) | Pure input validation/selection and explicit dates | Draft #359, CI green; no merge tonight |
| I03-b (this candidate) | Pure Web/Telegram history/message builders | Independent main base; review after #359 and reconcile overlapping docs/retest |
| I03 remainder (deferred) | File/config, runner and provider/replay transports | Explicit raw-history API, source-hash gates; replay still needs I04 injection; no private fixtures implied |
| I04 (deferred runtime) | Canonical consultation/evidence/chat changes, sync script and both edge copies | Reconcile on then-current main; preserve alert #356 and inventory F1. Independently test transport injection and evidence changes. Synchronize trees; deployment separately gated |
| P1-02 (not started here) | Bounded loop and command routing | Requires reviewed evidence/runtime prerequisites; not authorized in this continuation |

No date converter or date-guard allow-list change is needed for this slice. Source plans and D01
owner decisions remain at the [pinned planning directory](https://github.com/sforero94/Escociaos/tree/3d3e65454d8d2f78971593f1fe90a0514ce22301/docs/esco/faithfulness).

## Historical I02 contract and review

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
- I01 publication was initially denied, then explicitly approved at 19:55 UTC. PR #357 opened; parent reviewed and merged after the user's 20:10 UTC approval. Earlier “no PR” and “publication blocked” notes in session history describe the earlier state only. I02 publication and merge later completed as PR #358; current queued work is recorded above.

## Gates, QA and rollback

Only synthetic tests; no private JSONL retrieval/read/transmission or provider
calls. D01 remains resolved; P0-02 private disclosure to OpenRouter remains blocked.
The $1 cap does not authorize disclosure. Security PR #324, medium security fixes,
credentials and access remain outside scope.

PR #356 described migration 186 unapplied and edge deployment pending. No live
ledger or deployment state is queried here; that owner remains responsible.
No migration, deployment, telemetry, recurring spend, pilot or canary.

Keep I03-b queued as a draft after CI; merge requires morning review and the later docs reconciliation/retest described above. Rollback is a normal revert; no schema, history or traffic
rollback. Desktop/mobile/live Web/Telegram QA is not exercised by these pure
modules. A future runtime release requires authorized checks in both channels and
preservation of alert/F1 behavior; these synthetic tests do not establish live QA.
