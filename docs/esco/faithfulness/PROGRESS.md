# Progress and handoff

## Current state — read this first

- Integration branch: `codex/esco-faithfulness-plan`.
- Original code base: `14271f1`. Evaluation prerequisite commit: `027a162`.
- Plan bootstrap: complete. Product implementation: **1/25 tasks complete**.
- Active implementation task: P0-03 parent in progress; P0-03-a complete locally.
- **Next task: P0-03-b — tool fixture adapter and scenario pack. P0-02 is blocked.**
- First action: `rg -n "executeTool|correrCaso|instalarGuardas" src/supabase/functions/server/chat.tsx evals/esco/lib/ejecutor.ts`; design tool-boundary injection and scenario/turn matching.
- Next useful milestone: checkpoint A, then complete animal-sales evidence and deterministic totals before building online infrastructure.
- Production state: no deployment, migration, telemetry activation, worker, schedule, feedback UI, or canary performed by this plan bootstrap.
- Private data: absent from this independent checkout. It is present only in the originating workspace; see BASELINE.md. Two private-dataset tests skip here.
- Blocking owner decision for P0-01: none. Open decisions D01–D07 are tracked in DECISIONS.md and apply at named gates.

## Task tracker

Update this table and the current-state block in the same session. Add implementation commit/PR and verification evidence when work starts or completes. The detailed acceptance criteria remain in PLAN.md.

| Task | Status | Dependencies | Implementation / evidence / next action |
|---|---|---|---|
| S00 | done | Existing evaluation work | `027a162`: preserved prior judge safeguards; 91 passed, 2 private-dataset tests skipped; lint 0 errors |
| P0-01 | done | S00 | METRICS.md; typed review and measurement/report tests; implementation commit recorded below |
| P0-02 | blocked | P0-01, D01 | ADJUDICATION.md v1 prepared; private records/labels absent; D01 unresolved |
| P0-03 | in_progress | P0-01; P0-02 for disputed seeds | `48141b0`: P0-03-a closed HTTP foundation complete; P0-03-b ready: tool matching, 12–15 scenarios, manifests and frozen CLI remain |
| P1-01 | todo | P0-03 | Evidence envelopes and compatible adapters |
| P1-02 | todo | P0-03, P1-01 | Bounded execution, duplicate reuse, command routing |
| P1-03 | todo | P1-01, P1-02 | Structured facts and prepublication checks |
| P1-04 | todo | P1-01, P1-03 | Scope-aware facts across turns |
| P2-01 | todo | P1-01, P1-03; D02 if needed | Complete animal-sales aggregate and routing |
| P2-02 | todo | P1-01–P1-03; D02 if needed | Application definitions, costs and progress |
| P2-03 | todo | P1-01, P1-03; D02 if needed | Weighted yield and derived prices |
| P2-04 | todo | P1-01, P1-03 | Inventory filtering and material error disclosure |
| P2-05 | todo | P1-01, P1-03, scoped P2 tasks | Coverage, freshness, attribution, optional-tool failures |
| P3-01 | todo | P0-01, P0-03, P1-04 | Repeats/paraphrases and fact-level consistency |
| P3-02 | todo | P2-01–P2-04 | Controlled retrieval integration suite |
| P3-03 | todo | P2-05, P3-01, P3-02; D07/P0-02 for enforcement | CI and offline candidate checkpoint B |
| P4-01 | todo | P0-01, P1-01; D03/D04 before production | Trace schema, RLS, minimization and retention contract |
| P4-02 | todo | P4-01, P1-02; capture activation gate | Shared collector across web and Telegram |
| P4-03 | todo | P4-02, P1-03 | Deterministic online monitor records |
| P5-01 | todo | P4-01–P4-03; D04/D05 before paid activation | Idempotent asynchronous judge worker |
| P5-02 | todo | P5-01; D03–D05 before activation | Sampling, budget caps and retention cleanup |
| P5-03 | todo | P4-02, P5-01; D03 | Feedback, reviewer workflow and fixture proposals |
| P5-04 | todo | P4-03, P5-02, P5-03 | Scorecard and configurable incident rules |
| P6-01 | todo | Checkpoint B, P5-04, D03–D06 | Baseline observation and safe shadow pilot |
| P6-02 | todo | P6-01, D06/D07 | Conversation canary, promotion and rollback |
| P6-03 | todo | P3-03, pilot findings; P0-02 for disputes | Expand case coverage and operational ownership |

## Checkpoint record

| Checkpoint | State | Evidence |
|---|---|---|
| Planning bootstrap | complete | PLAN/SESSION/BASELINE/DECISIONS documents and task tracker committed on integration branch |
| A: reliable measurement | in progress | P0-01 complete; adjudication and frozen fixtures remain |
| B: offline candidate | not started | Requires P1–P3 tasks and agreed release gates |
| C: online observation | not started | Requires P4–P5 and activation decisions |
| D: production decision | not started | Requires P6 pilot and owner promotion decision |

## Session history (append; do not replace prior entries)

### Session: planning bootstrap, 2026-10-27 America/New_York

- Task: S00 and plan setup; no P0–P6 implementation started.
- Branch/worktree: `codex/esco-faithfulness-plan`, initially `/workspace/Esco-faithfulness-plan`.
- Start: source branch `claude/gifted-euler-t8h8t2` at `14271f1` with four uncommitted evaluation-only fixes. Original checkout preserved unchanged.
- Changed: copied those four evaluated files into an isolated worktree and committed as `027a162`. Added this session plan, task definitions, progress ledger, decision register, sanitized baseline, and docs index link.
- Verification: `npm run eval:esco:check` passed type/lint/runtime checks, 91 passed / 2 skipped because the private dataset is absent. `npm run lint` exited 0 with 0 errors and 910 existing warnings. No blanket lint autofix. Documentation links/task references and `git diff --check` checked before final commit.
- Decisions: accepted only A01–A04. D01–D07 remain open at their specific gates. No assumption that general plan approval authorizes recurring spend or production capture.
- Remaining: all 25 implementation tasks. Private-dataset verification requires authorized artifact access. Prior measured run has 93 passing checks with dataset present; this session does not claim to have rerun those private tests.
- Next: P0-01; first inspect current metric/result/report types and define service-success denominators.
- Production state: local documentation/evaluation tooling only; no edge deployment, migrations, or paid calls in this session.

### Session: P0-01 measurement contract, 2026-10-27 America/New_York

- Task: P0-01 complete.
- Branch: `codex/esco-faithfulness-plan`; implementation commit: `1fab465`.
- Start: planning bootstrap at `1edd391`; no implementation tasks complete, clean checkout.
- Changed: METRICS.md defines denominators, severity, outcome/review labels, legacy mappings and exact seed list. Added optional attributed review types, pure measurement aggregation, JSON/Markdown report fields and selected-case coverage in the runner. Historical verdicts and calibration are preserved.
- Verification: `npm run eval:esco:check` passed (95 tests passed, 2 private-dataset tests skipped); `npm run lint` and `npm run typecheck` passed; `git diff --check` passed. Synthetic tests cover all 56 selected positions, missing judge/trace, execution exception, partial completion, appropriate clarification/abstention and citations without support. Logs in `/tmp/esco-{check,lint,types}.log` are temporary only. Mobile smoke is inapplicable to evaluation-only changes; no UI or edge source changed.
- Decisions: no owner decisions resolved. No private labels or evidence invented. Verified-success metrics require attributed review; absent review remains visible. Case coverage does not claim scheduled repetition coverage (explicit limitation in METRICS.md).
- Remaining: none for P0-01. Real dataset coverage verification is unavailable without the private JSONL; the runner derives the actual included IDs when supplied.
- Next: P0-02; inspect the disagreement records and approved private labels named in BASELINE.md. If absent, record the evidence block and continue ready P0-03 with `rg -n 'correrCaso|fetch|transport' evals/esco/lib/ejecutor.ts`.
- Production state: local evaluation tooling only; no paid calls, deployment, migration or schedule.

### Session: adjudication preparation and replay foundation, 2026-10-28 UTC

- Task: P0-02 preparation blocked; P0-03-a implemented. P0-03 parent remains in progress.
- Branch: `codex/esco-faithfulness-plan`; implementation commit: `48141b0`.
- Start: requested base `7771185`, clean checkout; original `work` branch preserved. Fetched requested branch using configured proxy outside the filesystem sandbox.
- Changed: ADJUDICATION.md v1 records all five disputes plus 054/056, unavailable originals, proposed review questions, temporary gate exclusions and historical-drift rules. Added independent replay model/read transports in `ejecutor.ts`, sticky invalid-run errors, synthetic runtime/safety tests, README usage and P0-03 slice definitions in PLAN.md.
- Verification: `npm run eval:esco:check` passed: 100 passed / 2 private-data skips. Initial sandbox run failed four existing CLI subprocess tests; the authorized outside-sandbox rerun passed all four. `npm run lint` passed with 0 errors / 910 existing warnings; `npm run typecheck` passed. `git diff --check` passed. Judge prompt/parser tests passed; paid original-answer calibration unavailable. Documentation references and task status consistency checked. Logs: `/tmp/esco-{check,lint,types}.log` (temporary). Mobile smoke not applicable: no UI/edge source changed.
- Decisions: D01 remains unresolved; no owner decision inferred. Private directories named in BASELINE.md are absent; bounded workspace/tmp artifact search found no approved JSONL/reports. No private label or historical value invented. The ledger is prepared, not adjudicated.
- Remaining: P0-02 requires authorized private evidence and attributed D01 decisions; paid calibration also requires budget. P0-03-b retains all unmet parent criteria: tool/argument/scenario/turn keys, fixture pack/manifests, multi-turn isolation and real-model frozen command. Current runtime results still use legacy `live` labeling; no CLI exposes this foundation yet. Mocked outputs establish transport behavior only.
- Next: P0-03-b; first run `rg -n "executeTool|correrCaso|instalarGuardas" src/supabase/functions/server/chat.tsx evals/esco/lib/ejecutor.ts`. Continue synthetic controls while private adjudication remains blocked.
- Production state: local harness/documentation only; no provider calls, production reads/writes, deployments, migrations, telemetry, schedules or rollout. All approval gates retained.
