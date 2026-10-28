# Faithfulness integration — current scope I02

## Current baseline and scope

I01 is **merged** through [PR #357](https://github.com/sforero94/Escociaos/pull/357),
reviewed head `b6470a496b72e98d0db7fde7e93a2d520a0426a9`, merge/current main
`23d607648c35e0848c138efec6f976ad7e1dfdad`. Source branch
`codex/esco-faithfulness-plan` remains at
`3d3e65454d8d2f78971593f1fe90a0514ce22301`; both remote heads were reverified.
I02 uses fresh branch `codex/esco-faithfulness-eval-scoring` from current main.
The original `work` and I01 worktrees remain unchanged. No applicable checkout
`AGENTS.md`/`.agents/skills` exists; root `CLAUDE.md` and source session protocol
apply. This explicit extraction supersedes the source README's accumulated-branch
default. No source-branch merge or whole-commit cherry-pick.

I02 imports only `tipos`, `deterministico`, the **pure** `juez` prompt/parser,
`veredicto`, `medicion`, `reporte` and `adjudicacion` from `src/utils/escoEvals/`,
plus matching synthetic tests and test factories. `juez.ts` deliberately excludes
`ConfigJuez` and `llamarJuez`; the two source mock-HTTP tests remain deferred with
that provider transport, not removed to hide a failing implemented feature.
No runner, transport, golden loader, replay fixture pack or channel-message
constructor is included. All imports resolve locally; no app module imports these
scorers. The existing `eval:esco:check` command now covers them automatically.

## Integration sequence

| Slice | Contents | Dependencies / review boundary |
|---|---|---|
| I01 (merged) | Numeric/date helper, 15 synthetic tests, check command, tracker | PR #357; two reviewed parser corrections retained |
| I02 (this candidate) | Pure scoring, judge prompt/parser, measurement/report, immutable adjudication and synthetic tests | Based on merged I01; parent acceptance and explicit draft publication approval pending |
| I03 (deferred) | Golden input validation, channel messages, provider/runner/transports and fixture pack/config | Consume I02 pure API; move provider call into its own transport module. Compute source hash before adjudication. Replay CLI tests also need I04 transport injection; split rather than importing a broken runner |
| I04 (deferred runtime) | Canonical consultation/evidence/chat changes, sync script and both edge copies | Reconcile on then-current main; preserve alert #356 and inventory F1. Independently test transport injection and evidence changes. Synchronize trees; deployment separately gated |
| P1-02 (not started here) | Bounded loop and command routing | Requires reviewed evidence/runtime prerequisites; not authorized in this continuation |

The source `hatoFechaLocalGuard.test.ts` allow-list change belongs with its future
channel-message constructor, not a general relaxation now. Source plans and D01
owner decisions remain at the [pinned planning directory](https://github.com/sforero94/Escociaos/tree/3d3e65454d8d2f78971593f1fe90a0514ce22301/docs/esco/faithfulness).

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
