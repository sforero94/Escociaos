# Faithfulness integration — I01

## Candidate and provenance

Baseline main: `ad5455ffa371d847191f92c7f7dbdc3404628046` (PR #356).
Preserved source: `codex/esco-faithfulness-plan` at
`3d3e65454d8d2f78971593f1fe90a0514ce22301` (18 ahead, 37 behind main).
Both remote heads were reverified on 2026-10-28 UTC. The original `work` checkout
and source branch remain unchanged. No applicable checkout `AGENTS.md` or
`.agents/skills` exists in either tree; root `CLAUDE.md` and the source planning
protocol were read. This explicit current-main extraction supersedes the source
README's default instruction to continue on the accumulated planning branch.

I01 initially copied `src/utils/escoEvals/numeros.ts` and
`src/__tests__/escoEvalsNumeros.test.ts` byte-for-byte from that source. Independent
review then found two defects; the bounded corrections below supersede that
byte-equality claim for the current head. I01 makes
numeric/date anchor matching independently reviewable before the remaining
scoring stack. It handles Colombian separators, ambiguous numeric candidates,
million suffixes, negative balances, tolerances and Spanish date forms. These
are **permissive token-presence helpers**, not proof of claim support, scope,
retrieval correctness, valid calendar dates or model quality. No production
module imports the helper. No HTTP, database, provider or edge dependency exists.

`npm run eval:esco:check` runs repository types, evaluator lint and the imported
synthetic tests. This slice has no `eval:esco` runner, fixture replay or semantic
judge. Do not run commands described only in the source-branch historical record.

## Integration sequence — proposals, not authorization to continue

| Slice | Contents from preserved source | Dependencies / review boundary |
|---|---|---|
| I01 (this draft) | Numeric/date helper, 13 synthetic tests, check command, tracker | Independent of runtime and private data; stop for parent review |
| I02 (next scope proposal) | Remaining `src/utils/escoEvals/` scoring/measurement/report modules and matching pure tests | Reconcile against merged I01; preserve judge/parser safeguards and owner adjudication; separate private-data skips |
| I03 (later) | `evals/esco/` transports, runner, fixture pack/config and harness docs | I02; replay CLI tests additionally need I04's optional loop transport. Split pure adapter tests from production-loop tests rather than importing a broken runner |
| I04 (later runtime candidate) | Canonical `escoConsultas.ts`, `escoEvidencia.ts`, `chat.tsx`, sync script, corresponding edge copies and runtime tests | Reconcile on then-current main; separate transport injection from evidence producer/consumer changes where independently testable. Preserve alert #356 and inventory F1 changes. Synchronize both edge trees; deployment remains gated |
| P1-02 | Bounded loop and command routing | Not implemented or started by this continuation; review after required evidence/runtime integration |

The source `hatoFechaLocalGuard.test.ts` allow-list change belongs with its
associated evaluator files, not a general relaxation on main. Do not merge the
entire planning branch or cherry-pick the combined merge commits. Inspect each
slice's imports and tests before choosing its final size. Existing contracts and
history remain at the [pinned planning directory](https://github.com/sforero94/Escociaos/tree/3d3e65454d8d2f78971593f1fe90a0514ce22301/docs/esco/faithfulness).

## Validation and merge decision

Candidate-tree checks before commit:

- `npm run eval:esco:check`: passed; 13 synthetic tests, zero skips; includes `tsc --noEmit` and focused ESLint.
- `npm run lint`: passed; zero errors, 907 warnings in unchanged baseline files. Focused evaluator lint has no findings. Node also warns that the existing ESLint config has no package module type.
- `npm run build`: passed; Vite 6.3.5, 17.97 seconds.
- Focused alert/F1/parity regression: 6 files, 232 tests passed, zero skips (`hatoAlertaRespuesta355`, `hatoAlertas`, `eliminarCompraConReversion`, `movimientoInventarioResponsable`, `productoStockSinMovimiento`, `arbolEdgeFunctionParidad`).
- `git diff --check`: passed. The two imported code/test files match the pinned source.

Implementation commit `16e95e342620b7412d6614493c9e66ddc00c8f6a` passed:
`npm run eval:esco:check` (13 tests, types and focused lint), `npm run lint`
(zero errors / 907 warnings), `npm run build`, and `npm test` (212 files,
4,678 tests, zero skips). `git diff --check HEAD^ HEAD` passed.
Logs: `/tmp/esco-i01-final-{check,lint,build,suite}.log`.

The fresh branch push succeeded. **Draft PR creation was denied by automatic
approval review**, which requires explicit user authorization to publish/open
this PR as an external repository commitment and disclosure. No PR number exists;
GitHub PR search returned no match and #357 returned 404 before the confirmed
rejection. CLI GitHub API reads also returned Forbidden; connector reads worked.
No workaround or further creation attempt will occur. CI for this head has no
PR workflow runs. The proposed PR text is saved in `PR_DRAFT.md`; parent review
and explicit publication authorization are the remaining blocker.

This follow-up handoff changes documentation only. Code and tests remain
byte-identical to the verified implementation commit. Final handoff checks are
reported to the parent separately; no unrun check is marked passed here. Local logs: `/tmp/esco-i01-{check,lint,build,regression}.log`
(temporary, no private data). Installed dependencies are reused through a local,
ignored `node_modules` symlink; no dependencies or lockfile changed.

Recommend publishing and merging only I01 after explicit PR publication authorization, CI and parent review.
Rollback is a normal revert of this PR; no schema, stored history, traffic or
backend deployment rollback is needed. Desktop/mobile and live Web/Telegram QA
are not exercised by this pure helper slice. Before any future runtime release,
test Web and Telegram history/evidence handling and the preserved alert/F1 flows
in an authorized environment; do not claim these unit tests are live QA.

## Gates and production state

PR #356 is merged. Its fetched description reports migration 186 **not applied**
and edge deployment pending. No live database ledger was queried here; no claim
that the alert backend is live. This draft changes neither edge tree and needs no
edge deployment. No migration, deployment, telemetry, schedule, pilot or canary.

D01 remains resolved. P0-02 calibration is blocked by the rejected private-payload
disclosure to OpenRouter. The $1 cap alone does not authorize disclosure. No
private JSONL is retrieved/read/transmitted, and no paid provider is called.
Security PR #324, medium security fixes, credentials and access are outside scope.


## Independent review corrections — I01 only

Both reported defects reproduced with synthetic regressions before changing code:
`extraerNumeros('-$87,25')` returned positive 87.25, and
`fechaPresente('2026-08-12', '12-ago-2025')` returned true. The reproduction run
had 2 failures / 13 passes (`/tmp/esco-i01-review-repro.log`).

The numeric token now includes a dollar symbol after a preceding minus, so the
existing sign parser retains it. Tests cover ASCII/Unicode minus before/after
currency, positive currency (including plus), opposite-sign rejection, Colombian
thousands/decimals and million suffixes. The written-date year guard now accepts
a hyphen before the four-digit year, including an abbreviated month with a period.
Tests require the correct year and reject a different year for abbreviated/full
months and month-first dates. Dates without a year retain their prior behavior.
All 15 focused tests passed after the fix (`/tmp/esco-i01-review-focused.log`).

Scope limits remain: `1.234` can mean 1234 or 1.234; either candidate is emitted.
This is permissive token matching, not a general currency-expression parser or
calendar validator. These corrections cover adjacent currency/sign forms and
four-digit written years; they do not establish support for accounting parentheses,
spaced negative currency signs or two-digit written years. A mismatched explicit
four-digit year and an opposite-sign numeric anchor are rejected by these tests.

Only helper/tests and review notes changed. Final-head checks are reported to
the parent after commit; prior verification totals above remain historical.
PR publication remains denied/pending explicit authorization. No retry, runtime
change, private data, paid provider call, migration, deployment or next slice.


### Publication authorization update

After the earlier denial, the user explicitly approved publishing this first
slice as a draft at 19:55 UTC on 2026-10-28. The parent transmitted the approval
and required both narrow review corrections before publication. Commit `abb0ec5`
contains those corrections. The following handoff only updates documentation.
Final publication text must record the actual final SHA and executed checks;
prior 4,678-test totals are historical. Check duplicates before retrying only the
draft creation. Stop if review denies again. No merge, deployment or next slice.
