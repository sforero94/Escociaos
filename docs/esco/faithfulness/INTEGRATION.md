# Faithfulness integration — I04-a summary safety

## Baseline and scope

Independent branch `codex/esco-faithfulness-summary-safety` from current main `47d138633f03bb75deececb50516e4a17a2fd9ff` (I01/I02 and PO #365 retained). Source `3d3e65454d8d2f78971593f1fe90a0514ce22301` preserved. This is the narrow P1-01-a truncation/error corrective portion of I04; not the whole preserved evidence/runtime branch. No dependency on queued #359/#361/#363/#364/#366: existing main tests execute the actual loop with synthetic HTTP. No helper/runner copy or stack needed.

## Exact runtime behavior if separately deployed

- `resumirContexto` keeps results at/below the existing threshold byte-identical. Above it, removing detail also downgrades legacy `consulta_completa` and `detalle_completo` to false. Retain the summary, other legacy fields and re-query instruction. Own `error` presence survives via a fixed message, including falsy values, instead of losing the failure or copying a long raw error.
- The births gate rejects any own error key, context loss or malformed present context-loss marker; only absent/explicitfalse can represent untruncated legacy context. Complete-empty and complete aggregate retrieval with paginated detail still pass when no context loss/error is recorded. Existing date/period/entity/claim policy is unchanged.
- Full immediate tool response remains untouched. Only the persisted tool summary and the decision based on that summary change. Actual-loop synthetic regression proves a complete long tool result still reaches the immediate model, while the saved summary loses detail and the current births safeguard replaces an unsupported absence claim with inability to verify.
- This is not a hard context-size policy, secret redactor, semantic fact checker, calendar/range-binding fix or general evidence-envelope migration. A large retained `resumen` may still exceed24000 characters. Short malformed JSON and primitives stay byte-identical but cannot pass the births gate. No old history is rewritten.

## Evidence and queue

Six regressions failed before correction;76 focused tests pass after synchronization, plus26 independent synthetic assertions. Test exact boundaries, long/short/malformed/falsy errors, complete-empty/paginated aggregates, context-loss refusal, raw payload preservation and parity. Final committed-head full suite/types/lint/build/whitespace and associated CI receipts must be checked in the handoff/PR. No real model or database queried; no model-quality/calibration claim.

I04-a is independently reviewable and can be considered first as the small corrective fix. No merge tonight. Offline chain order remains #359 → #361 → #363 → #364 → #366; shared tracker docs and final-head tests/CI need reconciliation after each integration. Do not merge `codex/esco-faithfulness-offline-base` itself. All PO #365 files are unchanged relative to baseline.

## Release/rollback limits

Only canonical source, its two synchronized generated copies, existing focused tests and tracker docs. No mirrored chat.tsx, Telegram, injection, schema/credentials/access/security-setting edit. Existing sync script run; no deployment command. A future authorized edge release must coordinate existing alert/F1 changes and owner readiness around PR356's described migration186/deployment gap; no current live-state assertion is made here.

Local synthetic/full checks prove this deterministic source behavior. Actual PostgREST/RLS/persistence round trips require a separately authorized development Supabase environment; live Web/channel delivery and release smoke need separate rollout authorization. Neither is necessary to reproduce/fix the pure defect. Rollback before deployment: revert source/test changes and synchronize mirrors. If deployed later, deploying the reviewed revert is a separate action.

No business-definition decision is needed for this fix (PLAN P1-01-a; DECISIONS A01/A02). Private disclosure/provider approval and future D03–D07 storage/budget/pilot/enforcement decisions remain gated; D02 applies only to an actual domain-rule conflict. No private fixtures/provider calls, telemetry/schedules, production queries, Bot Log/Notion, migrations, merge or auto-merge. Stop for parent review after this slice.

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
