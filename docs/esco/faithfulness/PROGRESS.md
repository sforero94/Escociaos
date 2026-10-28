# Progress and handoff

## Current state — read this first

- Integration branch: `codex/esco-faithfulness-plan`.
- Original code base: `14271f1`. Evaluation prerequisite commit: `027a162`.
- Plan bootstrap: complete. Product implementation: **0/25 tasks complete**.
- Active implementation task: none.
- **Next task: P0-01 — define the metric and case contract.**
- First action: read `src/utils/escoEvals/tipos.ts`, `veredicto.ts`, `reporte.ts`, then `BASELINE.md`; write the metric specification and focused report/verdict tests.
- Next useful milestone: checkpoint A, then complete animal-sales evidence and deterministic totals before building online infrastructure.
- Production state: no deployment, migration, telemetry activation, worker, schedule, feedback UI, or canary performed by this plan bootstrap.
- Private data: absent from this independent checkout. It is present only in the originating workspace; see BASELINE.md. Two private-dataset tests skip here.
- Blocking owner decision for P0-01: none. Open decisions D01–D07 are tracked in DECISIONS.md and apply at named gates.

## Task tracker

Update this table and the current-state block in the same session. Add implementation commit/PR and verification evidence when work starts or completes. The detailed acceptance criteria remain in PLAN.md.

| Task | Status | Dependencies | Implementation / evidence / next action |
|---|---|---|---|
| S00 | done | Existing evaluation work | `027a162`: preserved prior judge safeguards; 91 passed, 2 private-dataset tests skipped; lint 0 errors |
| P0-01 | ready | S00 | Define denominator/severity/outcome contract; no owner decision required |
| P0-02 | todo | P0-01, D01 | Prepare disputed-case adjudication; do not rewrite original labels |
| P0-03 | todo | P0-01; P0-02 for disputed seeds | Frozen replay adapter and 12–15 reviewed scenarios |
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
| A: reliable measurement | not started | Requires P0 tasks and reviewed fixture dispositions |
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
