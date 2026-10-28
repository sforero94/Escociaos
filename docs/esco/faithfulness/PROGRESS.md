# Progress and handoff

## Current state — read this first

- Integration branch: `codex/esco-faithfulness-plan`.
- Original code base: `14271f1`. Evaluation prerequisite commit: `027a162`.
- Plan bootstrap: complete. Product implementation: **3/25 tasks complete**.
- Latest implementation: P1-01 complete locally on the integration branch; scoped birth/animal producers, conservative generic adapters, typed validation and context compatibility.
- **Next task: P1-02 — bound the tool loop and route commands. P0-02 remains blocked by missing approved private evidence and D01 adjudication.**
- First action: `rg -n "maxRounds|llamadas|tool_choice|fnArgs|toolTransport" src/supabase/functions/server/chat.tsx`; inspect budgets, duplicate detection, argument parsing and forced query behavior.
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
| P0-03 | done | P0-01; P0-02 for disputed seeds | `48141b0` foundation + `61c684c` P0-03-b: tool boundary, 14 synthetic scenarios, manifests, frozen CLI and isolation checks; historical disputed snapshots remain gated |
| P1-01 | done | P0-03 | `6d2e80b` P1-01-a + P1-01-b recorded below: scoped birth/animal metadata, generic reads/errors and validated consumers; EVIDENCE.md records contract, deferred domain tools and compatibility limits |
| P1-02 | ready | P0-03, P1-01 | Bounded execution, duplicate reuse, command routing |
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
| A: reliable measurement | in progress | P0-01/P0-03 complete locally; P0-02 adjudication remains blocked |
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


### Session: P0-03-b tool fixtures and scenario pack, 2026-10-28 America/New_York

- Task: P0-03-b and P0-03 parent complete locally on the integration branch.
- Branch: `codex/esco-faithfulness-plan`; implementation commit: `61c684c`. Integration location: this branch, [GitHub branch](https://github.com/sforero94/Escociaos/tree/codex/esco-faithfulness-plan).
- Start: clean branch at requested handoff `ff017e2`. Initial requested `rg` ran from `/workspace` before the checkout was located; reran in `/workspace/Escociaos`, then checked out the requested branch and inspected both files. No applicable AGENTS.md found. Original `work` branch preserved.
- Changed: optional in-process tool transport in `llmToolLoop` (both edge trees); adapter keyed by scenario/turn/tool/canonical arguments; strict unknown/exhausted/unused-fixture failures; independent state and controlled date; frozen result labels. Added 14 explicitly synthetic scenarios and SHA-256/version/review manifest, seed map and limitations. Added separate mock/real frozen entrypoint with per-scenario metadata/results and documented repeatable commands. Existing production defaults and duplicate handling remain intact.
- Verification: `npm run eval:esco:check` passed (120 passed / 2 private-data skips); `npm run lint` passed (0 errors / 910 existing warnings); `npm run typecheck` passed. `EVAL_MODO=frozen EVAL_SALIDA=/tmp/esco-frozen-synthetic npm run eval:esco` passed all 14 controls. Focused `escoToolLoopEvidencia`, `escoConsultas`, `arbolEdgeFunctionParidad`, and `escoHerramientas` tests passed 156 checks. Ran `python scripts/sync-esco-consultas.py`; both edge trees match. `git diff --check` passed. Temporary logs: `/tmp/esco-{check,lint,types,frozen,domain}.log`; synthetic CLI artifacts: `/tmp/esco-frozen-synthetic/`. Mobile smoke not applicable: no UI changes.
- Findings: the original synthetic SYN-07 wording triggered the existing birth-query guard. Changed the synthetic question to request the animal ficha/last check; kept the production guard unchanged. Exact fixture payload delivery, duplicate refusal, prior-turn context, changed entity/evidence, unmatched tool failure, hash tampering, canonical keys and independent scenario state are verified. Mock outputs measure transport/context behavior only.
- Decisions: none resolved. D01 remains open; mapping synthetic controls to disputed 040 is not adjudication. Simplified/extended control payloads do not claim current retrieval correctness or reviewed historical truth. P0-02 still requires approved private evidence, attributed decisions and an authorized calibration budget. The real-model command is documented, not executed; no paid calls occurred.
- Remaining: none for P0-03's local synthetic replay acceptance. Approved historical fixtures, real-model semantic scoring and retrieval integration remain explicit gaps for their dependent tasks. Checkpoint A remains blocked on P0-02.
- Next: P1-01 — typed evidence envelopes. First action: `rg -n "_evidencia|resumirContexto|toolResultOk" src/utils/escoConsultas.ts src/supabase/functions/server/chat.tsx`. Continue synthetic controls while P0-02 is blocked.
- Production state: local code and harness only; no deployment, production reads/writes, migration, telemetry, worker, schedule or rollout. User instruction preserves production approval gates; plan inclusion and the repository's general redeploy convention do not authorize activation of this incomplete program.


### Session: P1-01-a typed adapter and context truncation, 2026-10-28 America/New_York

- Task: P1-01-a complete locally; P1-01 parent remains in progress (2/25 parent tasks complete).
- Branch: `codex/esco-faithfulness-plan`; implementation commit: `6d2e80b`. Integration location: this branch.
- Start: requested handoff `135273a`; clean checkout, original `work` branch preserved. Requested first search ran before other repository reads, then reran in the located checkout. No applicable AGENTS.md found. Read root CLAUDE.md, SESSION/PROGRESS, P1-01 and relevant accepted/open decisions.
- Changed: canonical `src/utils/escoEvidencia.ts` defines version 1 metadata and a conservative legacy adapter; both edge copies generated by updated sync script. Shared `resumirContexto` adds typed metadata on truncation, downgrades legacy completeness, and preserves error presence without raw long error text. Short results remain byte-identical. Added EVIDENCE.md with contract, migrated/unmigrated inventory and compatibility limits; PLAN.md records the slice and retains all parent acceptance criteria.
- Verification: `npm run eval:esco:check` passed (120 passed / 2 private-data skips). Final focused Vitest suite (`escoEvidencia`, `escoConsultas`, `escoToolLoopEvidencia`, `arbolEdgeFunctionParidad`, `escoHerramientas`, `hatoFechaLocalGuard`) passed 178 tests. `npm run typecheck` passed after correcting ES2020 compatibility and coverage typing in this slice. `npm run lint` passed with 0 errors / 910 existing warnings. `EVAL_MODO=frozen EVAL_SALIDA=/tmp/esco-frozen-p1-01-a npm run eval:esco` passed all 14 synthetic controls. Ran `python scripts/sync-esco-consultas.py`; mirror checks passed. `git diff --check` passed. Temporary logs: `/tmp/esco-{check,domain,types,lint,frozen}.log`; frozen artifacts: `/tmp/esco-frozen-p1-01-a/`. Mobile smoke is inapplicable: no UI changes.
- Findings: synthetic tests distinguish complete-empty/missing/error/partial/stale and validate falsy error keys, pagination, unknown metadata, safe projection and truncation. Production-loop mock test confirms full immediate payload delivery with incomplete persisted metadata. Mock controls establish transport/adapter behavior only, not semantic model quality or reviewed historical truth.
- Decisions: none resolved. P0-02/D01 remain blocked by missing approved private evidence and attributed adjudication. Unknown entity scope, timezone, observation/retrieval timestamp precision, units and authorized row references stay null; the adapter invents none.
- Remaining: P1-01-b must migrate scoped producers/failures and consumers, establish known authorized source identities and semantic metadata, and verify immediate/persisted compatibility in both channels. All producer outputs still use legacy shapes; typed metadata is currently added only at the truncated-summary boundary. Existing summary threshold is not a hard output-size cap. Existing stored history is not rewritten. See EVIDENCE.md for explicit limits.
- Next: P1-01-b — scoped evidence producers and consumers. First action: `rg -n "finish|_evidencia|toolResultOk|evidenciaPartosSuficiente" src/utils/escoConsultas.ts src/supabase/functions/server/chat.tsx`. Read EVIDENCE.md before migration. Continue explicitly synthetic controls while private adjudication is blocked.
- Production state: local branch implementation only; no paid provider calls, production data reads/writes, deployment, migration, telemetry, worker, paid schedule or rollout. User instruction preserves production approval gates despite the general repository redeploy convention.


### Session: P1-01-b scoped producers and consumers, 2026-10-28 America/New_York

- Task: P1-01-b and P1-01 parent complete locally on the integration branch (3/25 parent tasks complete).
- Branch: `codex/esco-faithfulness-plan`; implementation commit: pending.
- Start: clean branch at handoff `9a31c17`; continued in this chat. Ran requested producer/consumer search and reviewed current contract/state. Root and applicable repository instructions, session protocol and decision gates remain in force; no new AGENTS.md or owner decision applies.
- Changed: `escoConsultas.finish` emits typed metadata alongside legacy output for every consultation. `get_hato_partos`/`get_hato_animales` bind delivered-page primary rows/animal IDs, Bogotá calendar, count units and retrieval timestamps. Other consultation tools keep conservative generic metadata. `executeTool` adapts legacy `get_*` results and caught failures. `leerEvidencia` rejects invalid versions/shapes/completeness instead of falling back to legacy success; event status and birth guard consume it. Truncation preserves validated producer metadata while remaining incomplete. Both edge trees synchronized. EVIDENCE.md records scoped semantics, reference limits, channel compatibility and deferred tools. Calendar constant moved into the shared envelope module; the local-date guard records this relocation, not a new time conversion.
- Verification: `npm run eval:esco:check` passed (122 passed / 2 private-data skips), including Web/Telegram persisted-context format tests. Focused domain suite (`escoEvidencia`, `escoConsultas`, `escoToolLoopEvidencia`, `arbolEdgeFunctionParidad`, `escoHerramientas`, `hatoFechaLocalGuard`, `escoChatPropiedadConversacion`) passed 191 tests. Additional existing compatibility suite (`esco-improvements`, `esco108112Guard`, `esco-evals`) passed 129 tests. `npm run typecheck` passed. `npm run lint` passed (0 errors / 910 existing warnings); final changed-file ESLint also passed. `EVAL_MODO=frozen EVAL_SALIDA=/tmp/esco-frozen-p1-01-b npm run eval:esco` passed all 14 synthetic controls. Ran `python scripts/sync-esco-consultas.py`; parity passed. `git diff --check` passed. Logs `/tmp/esco-p1b-{types,lint,lint-focused,check,domain,compat,frozen}.log` and frozen artifacts are temporary. Mobile smoke is inapplicable: no UI changes.
- Findings: direct production-loop mocks prove immediate/persisted typed identity preservation and unavailable error/event status. Synthetic references originate only in returned primary rows, never caller-supplied source lists. Complete retrieval with paginated detail stays partial; the narrow birth guard still permits aggregate retrieval without claiming a complete list. Stale/invalid/context-truncated results cannot satisfy it. Context-format tests cover both channel formats, not live Telegram delivery or full HTTP persistence.
- Decisions: none resolved. D01/P0-02 remain blocked by missing approved private evidence and attributed adjudication. No paid model campaign or historical label change occurred. Existing authorized query boundaries remain responsible for row access; envelopes grant no capability or new read endpoint.
- Remaining: none for P1-01's first scoped migration. Additional domain-specific metadata/freshness/reference migration remains in P2; numeric/reference claim validation in P1-03; scope-aware multi-turn state in P1-04; controlled database/access integration in P3-02. Generic adapters cannot prove observation coverage or aggregate provenance. Large summaries remain a trigger-based truncation policy, not a hard storage bound. Old persisted history is not rewritten.
- Next: P1-02 — bound the tool loop and route commands. First action: `rg -n "maxRounds|llamadas|tool_choice|fnArgs|toolTransport" src/supabase/functions/server/chat.tsx`. Use explicitly synthetic controls while P0-02 remains blocked.
- Production state: local implementation only; no paid provider calls, production reads/writes, deployment, migration, telemetry activation, worker, paid schedule or rollout. All production approval gates retained.
