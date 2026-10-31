# Progress and handoff

## Current state — registered date cohort correction, 2026-10-31 UTC

- Verified baseline main `33ed54c2d5e15b7f48cbe04293516cbb3b0ecb61`; live v286 is unchanged. R01/R02 passed online; LC02 refused before tool use. Campaign remains 3 sent / 2 useful / 1 failed / 13 unrun, not acceptance.
- Explicit owner approval covers bounded registered-date comparison and safe Web/Telegram context preservation, tests and passing merge. Deployment remains separate. Parent clarified existing private KV is within scope; catalog-only isolation verification succeeded without business reads or writes.
- PR387 merged at `c2be2a5ba36cf39c22d4db251c0e5348910f1802` after exact-head CI41233661563. Postmerge CI41233949240 passed 5,386 tests / 240 files; GitHub Vercel passed. Backend remains v286; source merge did not deploy it. The correction adds a server-private bounded receipt and fresh exact-membership requery, with equal/different/not-verifiable date pairs. No model call for this continuation, dose arithmetic, causal interpretation, record edits or new access. See [contract and limits](APPLICATION_DATE_COHORT.md).
- A separate control-only release draft pins that merged source and unchanged v286 recovery; preparation passed 5,387 tests / 240 files plus independent40 + 40 guards / six assertions, types/lint/build. No ready/merge/dispatch/deploy of this new control is authorized. See [release boundaries](RELEASE_APPLICATION_DATE_COHORT.md).
- Local final source candidate: 5,386  tests / 240 files, zero skips; types/build passed; lint 0 errors/907 existing warnings; mirrors/whitespace passed. Independent re-review: 96 focused tests plus six adversarial assertions, no remaining concrete blocker. Exact-head CI41233661563 and postmerge CI41233949240 confirm this source; earlier release checks remain historical. No deployment or migration is performed by this correction.

## Historical state —372 refresh, 2026-10-30 UTC

- Actual mainfece0e5448eb36ac0be8b29333da20691baf114b (treeb0672175) includes363/364/366.366 postmerge CI40998038342 passed5091 tests/229 files, types/lint and GitHub Vercel success. Offline integration is complete for that queue, not calibration or the full original plan.
- Existing372 alone: merge current main without force-push, preserve reviewed36af47a workflow/controller/checks byte-identically, reconcile documentation only. Keep all runtime/security/PO/SQL/control fixes. No373 merge.
- Owner03:30UTC explicitly approved372 merge/job-wideActions-read/fresh diagnose/conditional371 release. Current task stops at parentgo after independent review/exact-head CI. No secret use, permission execution, diagnostic or deployment during this refresh.
- Source e7a5545/tree6e9969d, rollback6345804/tree99ba373, baseline281/config/raw80/reconstructed82/ownership/uncertainty guards unchanged. Old13ef receipt is historical and cannot authorize changed controls. After eventual372 merge, no main changes between fresh diagnosis and release; parent reviews the actual new receipt before release.
-371 frontend and parent-reported188 are already applied separately; approved earlier backend run40992476137 stopped before management access. Last verified backendv281. No production/business/private/provider query or mutation here; do not label this preparation a live release.

## Historical application correction pass (merged371)

Draft371 initially published493d587 with terminal green CI; parent review nevertheless found five bounded defects. Planned selection now requires positive intent rather than mention; actual/negation/mixed precedence stays safe. Agricultural existence/fumigation routing, valid plural results, unfiltered named/ID state discovery and local-date-only start checks are corrected with regressions. Ten actual handler negative tests cover create/edit/start/close without database calls. Final re-review/check receipts supersede the initial green result below; no activation is authorized.

Parent persistence acceptance on493d587 passed15groups with real local Auth/PostgREST and full RPC106; migration188/RPC artifacts remain unchanged. Synthetic schema/policy limits and no chat/React gate coverage remain explicit in APPLICATION_CORRECTION.md. Do not relabel that historical run as final-head coverage.

Historical2987e62 local receipt:4965 tests/225 files, zero skips;168 evaluator tests plus types/focused lint;150 application/date/query/handler tests; repository lint0 errors/907 existing warnings; build24.75s; mirror/whitespace parity passed. Independent retrieval re-review passed144 tests across four suites; separate ten-handler coverage passed. The preceding correction run reproduced the two final wording/routing gaps (2 failed/4963 passed); final complete rerun passed without weakening tests. Logs /tmp/application-correction-final-{full,eval,lint,build}.log and /tmp/application-corrections-focused-v5.log. Exact corrected commit and fresh CI are recorded in PR371/handoff after publication;493d587 CI is historical.

Further parent re-review superseded2987e62 for three remaining intent/routing cases. The latest correction uses clause-local direct date-basis grammar and revocation, distinguishes a planned-state description from planned-date consent, and removes the blanket incidental-app exclusion. Independent mixed-clause re-review passed; fresh complete checks and publication receipt follow separately. Migration188 and fullRPC106 blobs remain unchanged. No workflow or activation was added.

Historical325a8c clause-corrected local receipt:4983 tests/225 files, zero skips;168 evaluator tests plus types/focused lint;168 application/date/query/handler tests; full lint0 errors/907 existing warnings; build25.10s; mirrors and whitespace passed. Independent mixed-clause re-review passed162 tests across four suites. Logs /tmp/application-clause-final-{full,eval,lint,build}.log and /tmp/application-clause-revocation-focused.log. Fresh exact-head CI is recorded in PR371/handoff after update; both prior green heads remain historical evidence.

Adjacent325a8c review reproduced unresolved revocation and clear positive planned collection/exclusion gaps. The correction handles `y no` as a negative clause, withdraws planned consent for unresolved negation, preserves explicitly excluded actual dates and accepts a direct requested planned collection. The bounded supported matrix and conservative tradeoff are documented in APPLICATION_CORRECTION.md. Pre-fix reproduction:6 failed/64 passed, then2 unresolved-near-variant failures/70 passed. Independent final matrix review172 focused tests passed. Final complete checks/commit/CI are recorded separately; no workflow or activation is included.

Latest adjacent-corrected local receipt:4993 tests/225 files, zero skips;168 evaluator tests plus types/focused lint;178 application/date/query/handler tests; lint0 errors/907 existing warnings; build25.97s; mirror/whitespace checks passed. Independent bounded matrix review172 tests passed plus earlier8 independent intent probes. Logs /tmp/application-adjacent-final-{full,eval,lint,build}.log and /tmp/application-adjacent-final-focused.log. Fresh exact-head CI belongs to PR371/handoff after update. SQL188/RPC106 remain byte-identical; no controls or activation were added.

## Historical initial application candidate receipt (493d587, superseded review state)

Initial implementation:4931 tests across224 files, zero skips; evaluator check168 tests across10 files plus TypeScript/focused lint; repository lint0 errors/907 existing warnings; production build passed in23.09s. Focused application/date/query suites:116 passed. Both generated query mirrors and chat mirror are byte-identical; whitespace checks passed. Independent retrieval re-review96 tests passed; UI/database re-review found no remaining blocker. Review exposed ordinary-state routing, explicit planned lookup, missing-date handling and real-plan lot-filter defects; each was corrected and covered. One full run caught the intentionally added failing lot regression before its fix; the final full rerun is green, not a relaxation.

Migration188 rerun in the isolated networkless synthetic PostgreSQL17 container:11 checks passed. Initial repeated setup refused an already existing synthetic table; recreating only that fixture table produced the clean final run. No production SQL ran. This is not full closure/RLS integration or live model evidence. Local logs: /tmp/application-candidate-{full,eval,lint,build}.log; /tmp/application-final-focused-v2.log. Exact commit and remote CI follow in the PR/handoff; these local counts must not be confused with historical implementation commits.

## Current control-only continuation

Parent conditionally accepted runtimee7a5545 after bounded re-review and authorized preparation of one-time371 controls/tests/docs in the same draft. Runtime, mirrors, SQL188 and RPC106 remain unchanged. New workflow/controller require manual main first attempt, observed reviewed v281 diagnostic from identical controls, two fresh release captures, stable baseline and fixed CLI source/rollback. Existing367 helpers remain unchanged. No management secret, external diagnostic, deployment or migration is invoked during preparation. RELEASE_PR371.md records exact identities, approvals, uncertainty and source-only rollback limits. Final checks/review/CI are reported separately from runtimee7a5545 evidence. Preparation passed114 Node guards and4994 full tests/226 files, zero skips; types/evaluator168/focused lint, full lint (907 warnings/zero errors), build26.03s and whitespace/source identity passed. Independent control reviews added12 and17 mocked assertions and found no remaining blocker after first-attempt/body-uncertainty safeguards. Exact control-head CI follows publication.

## Prior CI receipts

I01 CI40759015461 and I02 CI40765357918 passed before their merges.
Merged359 postmerge CI40956872042 passed; its local145 evaluator tests and4864 full tests do not validate this changed candidate.
Merged361 postmerge CI40959220757 passed4887 tests/222 files, types and lint (907 warnings, zero errors); GitHub provider status reported Vercel complete. Direct Vercel metadata403 was not retried.
Queued actual-loop CI40811688057 remains prior-slice evidence only.
Backend postmerge CI40951382054 and release40951834611 passed separately; they do not establish live faithfulness.

## Task tracker — preserved source-branch status

Update this table and the current-state block in the same session. Add implementation commit/PR and verification evidence when work starts or completes. The detailed acceptance criteria remain in PLAN.md.

| Task | Status | Dependencies | Implementation / evidence / next action |
|---|---|---|---|
| S00 | done | Existing evaluation work | `027a162`: preserved prior judge safeguards; 91 passed, 2 private-dataset tests skipped; lint 0 errors |
| P0-01 | done | S00 | METRICS.md; typed review and measurement/report tests; implementation commit recorded below |
| P0-02 | blocked | P0-01, D01 | `b1cf3f0`: D01 resolved, v2 ledger and immutable view implemented. Paid verification awaits explicit OpenRouter private-payload disclosure approval; $1 cap already authorized. |
| P0-03 | done | P0-01; P0-02 for disputed seeds | `48141b0` foundation + `61c684c` P0-03-b: tool boundary, 14 synthetic scenarios, manifests, frozen CLI and isolation checks; historical disputed snapshots remain gated |
| P1-01 | done | P0-03 | `6d2e80b` P1-01-a + `c85d288` P1-01-b: scoped birth/animal metadata, generic reads/errors and validated consumers; EVIDENCE.md records contract, deferred domain tools and compatibility limits |
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
- Branch: `codex/esco-faithfulness-plan`; implementation commit: `c85d288`. Integration location: this branch.
- Start: clean branch at handoff `9a31c17`; continued in this chat. Ran requested producer/consumer search and reviewed current contract/state. Root and applicable repository instructions, session protocol and decision gates remain in force; no new AGENTS.md or owner decision applies.
- Changed: `escoConsultas.finish` emits typed metadata alongside legacy output for every consultation. `get_hato_partos`/`get_hato_animales` bind delivered-page primary rows/animal IDs, Bogotá calendar, count units and retrieval timestamps. Other consultation tools keep conservative generic metadata. `executeTool` adapts legacy `get_*` results and caught failures. `leerEvidencia` rejects invalid versions/shapes/completeness instead of falling back to legacy success; event status and birth guard consume it. Truncation preserves validated producer metadata while remaining incomplete. Both edge trees synchronized. EVIDENCE.md records scoped semantics, reference limits, channel compatibility and deferred tools. Calendar constant moved into the shared envelope module; the local-date guard records this relocation, not a new time conversion.
- Verification: `npm run eval:esco:check` passed (122 passed / 2 private-data skips), including Web/Telegram persisted-context format tests. Focused domain suite (`escoEvidencia`, `escoConsultas`, `escoToolLoopEvidencia`, `arbolEdgeFunctionParidad`, `escoHerramientas`, `hatoFechaLocalGuard`, `escoChatPropiedadConversacion`) passed 191 tests. Additional existing compatibility suite (`esco-improvements`, `esco108112Guard`, `esco-evals`) passed 129 tests. `npm run typecheck` passed. `npm run lint` passed (0 errors / 910 existing warnings); final changed-file ESLint also passed. `EVAL_MODO=frozen EVAL_SALIDA=/tmp/esco-frozen-p1-01-b npm run eval:esco` passed all 14 synthetic controls. Ran `python scripts/sync-esco-consultas.py`; parity passed. `git diff --check` passed. Logs `/tmp/esco-p1b-{types,lint,lint-focused,check,domain,compat,frozen}.log` and frozen artifacts are temporary. Mobile smoke is inapplicable: no UI changes.
- Findings: direct production-loop mocks prove immediate/persisted typed identity preservation and unavailable error/event status. Synthetic references originate only in returned primary rows, never caller-supplied source lists. Complete retrieval with paginated detail stays partial; the narrow birth guard still permits aggregate retrieval without claiming a complete list. Stale/invalid/context-truncated results cannot satisfy it. Context-format tests cover both channel formats, not live Telegram delivery or full HTTP persistence.
- Decisions: none resolved. D01/P0-02 remain blocked by missing approved private evidence and attributed adjudication. No paid model campaign or historical label change occurred. Existing authorized query boundaries remain responsible for row access; envelopes grant no capability or new read endpoint.
- Remaining: none for P1-01's first scoped migration. Additional domain-specific metadata/freshness/reference migration remains in P2; numeric/reference claim validation in P1-03; scope-aware multi-turn state in P1-04; controlled database/access integration in P3-02. Generic adapters cannot prove observation coverage or aggregate provenance. Large summaries remain a trigger-based truncation policy, not a hard storage bound. Old persisted history is not rewritten.
- Next: P1-02 — bound the tool loop and route commands. First action: `rg -n "maxRounds|llamadas|tool_choice|fnArgs|toolTransport" src/supabase/functions/server/chat.tsx`. Use explicitly synthetic controls while P0-02 remains blocked.
- Production state: local implementation only; no paid provider calls, production reads/writes, deployment, migration, telemetry activation, worker, paid schedule or rollout. All production approval gates retained.


### Session: owner adjudication v2, 2026-10-28 America/New_York

- Task: P0-02 reviewed dispositions implemented; focused paid verification remains blocked.
- Branch: `codex/esco-faithfulness-plan`; implementation commit: `b1cf3f0`.
- Start: clean `ff017e2`; owner supplied the exact baseline JSONL and six direct decisions, plus $1 total for the seven-case campaign including retries.
- Changed: ADJUDICATION.md v2 records old labels, new attributed dispositions, rubric changes, evidence exclusions and dispatch state. DECISIONS.md resolves D01 and records the narrow D05 authorization. `adjudicacion.ts` creates a cloned evaluation view; tests verify source immutability, inventory exclusion and warning/acknowledgement separation. Default runner and original dataset are unchanged.
- Verification: source SHA-256 matches BASELINE.md. `npm run eval:esco:check` passed 105 tests, zero skips, including original dataset and parser/prompt checks. No old calibration output recovered. `npm run lint` passed (0 errors, 910 existing warnings), `npm run typecheck` passed, and `git diff --check` passed. No mobile smoke needed for evaluation-only work.
- Decisions: Santiago's 001 partial; 030 incorrect; 039 historical inventory excluded from enforced comparison; 040 contextual scope allowed; 042 correct with warning; 054 acknowledgement allowed, premature completed storage forbidden. 056 malformed output remains unavailable and missing follow-up answer remains outside a full-conversation gate.
- Remaining: automatic approval review rejected private payload disclosure to OpenRouter despite the approved spend. An explicit question describing questions/answers/criteria/reference figures/tool metadata is pending. No paid call occurred; no cost incurred. A private script was subsequently prepared locally at ignored `evals/esco/runs/2026-10-28-adjudication/calibrate.eval.ts`, without execution. It requires a disclosure flag, pins provider price limits, reserves costs before dispatch, retains reservations after failures, and includes retries under $1. Review/run it only after disclosure approval; record private per-case results before marking P0-02 done.
- Next: P0-02 paid calibration if disclosure is approved; otherwise independent P1-02. First action: inspect the disclosure answer and ADJUDICATION.md campaign requirements. Keep the original labels and reviewed version separate.
- Production state: no deployment, migrations, telemetry, schedule, production queries, or external judge dispatch. Production gates preserved. Upload stays ignored and private.

- Integration: preserved remote commits through `b62e2f6` (P0-03 and P1-01 complete). Merge conflict resolved only in this progress record; all prior session entries retained. Independent next task is now P1-02, not P0-03-b. Combined checks recorded below.

- Combined verification after merge: `npm run eval:esco:check` passed 127 tests with zero skips; `npm run lint` and `npm run typecheck` passed; `git diff --check` passed. No production source was authored by this adjudication session; incoming edge changes are preserved from the remote implementation commits. No deployment performed.


### Session: I01 current-main integration, 2026-10-28 UTC

- Task: I01 only; independent non-production extraction. Draft review pending, not integrated.
- Branch: `codex/esco-faithfulness-eval-anchors`; implementation commit: `16e95e342620b7412d6614493c9e66ddc00c8f6a`.
- Start: source `3d3e65454d8d2f78971593f1fe90a0514ce22301`; baseline `ad5455ffa371d847191f92c7f7dbdc3404628046`. Clean new worktree; original checkout and source branch preserved.
- Changed: byte-identical numeric/date anchor helper and its 13 synthetic tests, evaluator check command, docs index, this preserved tracker and INTEGRATION.md. Runtime/evidence changes remain on source.
- Verification before commit: evaluator check (types/lint/13 tests) passed; repository lint zero errors / 907 baseline warnings; build passed; alert/F1/edge parity 232 tests passed; zero skips; diff whitespace and source-byte equality passed. Implementation-commit checks also passed: evaluator 13 tests; full suite 212 files / 4,678 tests / zero skips; types/lint/build passed. See INTEGRATION.md. Temporary logs `/tmp/esco-i01-*.log`.
- Decisions: no new owner decision. Existing D01 retained; private disclosure rejection respected. No private JSONL or paid calls.
- Remaining: automatic review denied draft PR creation for missing explicit publication authorization; branch push succeeded, no PR created. Proposed PR text saved in PR_DRAFT.md. Parent review, CI and merge decision; subsequent integration slices require a new scope. No claim of deployed model improvement or live QA.
- Next: parent review I01; first action `git fetch origin main` and review PR_DRAFT.md plus this branch's head/checks. If merged, propose I02 offline scoring scope from the pinned source. Do not start P1-02 or I02 in this continuation.
- Production state: no deployment, migration or activation. PR #356 describes 186/deployment as pending; no live-ledger verification attempted.


### Session: I01 independent review corrections, 2026-10-28 UTC

- Task/branch: I01 only, `codex/esco-faithfulness-eval-anchors`; starting head `f7ad0dae0df236771ddd7e18767f0e5343e0f8c5`.
- Reproduced: `-$87,25` lost the negative sign; `12-ago-2025` matched a 2026 anchor. Added tests first: 2 failed / 13 passed.
- Changed: preserve minus before a dollar symbol; recognize a hyphen before an explicit four-digit written year. Add correct/opposite-sign and correct/different-year controls, including Unicode minus, suffixes and abbreviated/full month variants.
- Verification before commit: 15 focused synthetic tests passed; final-head checks run after commit and reported to parent. Current helper/test intentionally differ from the pinned source after these reviewed fixes. INTEGRATION.md records remaining parser limits.
- Remaining: explicit authorization to publish the draft PR, then CI and parent merge review. PR creation was not retried. P1-02 and next slice remain unstarted.
- Production: unchanged; no private dataset, provider calls, runtime edits, migration or deployment.

- Publication authorization update, 2026-10-28: parent supplied the user's explicit “si” at 19:55 UTC for this first-slice draft, including completion of the two review fixes before publication. Recheck for duplicates and retry only draft creation after final checks. If denied again, stop. No merge, deploy or next slice authorized.


### Session: I02 pure evaluator integration, 2026-10-28 UTC

- Task/branch: I02 only, `codex/esco-faithfulness-eval-scoring`, from main/I01 merge `23d607648c35e0848c138efec6f976ad7e1dfdad`; source `3d3e654` preserved.
- Changed: seven pure scorer/measurement/report/adjudication modules and synthetic tests. `juez.ts` excludes provider config and `llamarJuez`; its two source mock-HTTP tests are deferred with that transport. No fixture transport or runtime dependency was added.
- Review: seven new regression failures reproduced coercible judge verdicts, absent/malformed layers, unattributed review, unsupported claims without an explicit failure entry, and missing source-hash enforcement. Two more failures reproduced nested adjudication aliasing and absent purchase evidence; a final negative control reproduced corrupt counts for inherited object names in report groups. Corrected before candidate verification. Measurement v1.1 explicitly versions stricter attribution/support guards; original human labels and v1 historical results remain unchanged.
- Verification before commit: 77 focused synthetic tests passed, zero skips. Initial type check caught use of ES2022 `Object.hasOwn`; corrected to the ES2020-compatible API without changing compiler configuration. Final-head checks run after commit and are reported in the handoff. Logs `/tmp/esco-i02-*.log` are temporary.
- Remaining: independent parent review, explicit I02 draft publication approval, then PR CI/merge decision. No PR attempted. Next action: inspect candidate diff and final-head checks; stop before another slice.
- Production: no runtime changes, live QA, private dataset, provider calls, migrations or deployments. Rollback is a normal revert; no schema/data/traffic rollback.


### Session: I02 independent review corrections, 2026-10-28 UTC

- Scope: four parent findings only on existing `codex/esco-faithfulness-eval-scoring`, starting from `115db6ed6bad580565bc327415da3490b1a1fc49`.
- Reproduced first pair before fixes: 9 failing cases / 28 passing across judge/report tests. The brace-salvage parser accepted malformed envelopes; two failed anchors in one run produced a count of 2 under “Corridas”.
- Reproduced second pair before fixes: 2 failing cases / 43 passing across judge/boundary tests. A null tool-error assessment could pass despite an actual recorded error and approving review; prompt allowed blanket small historical differences.
- Changed: accept only clean JSON or a complete fenced response and reject invalid envelopes; deduplicate report reason categories per failed run while retaining detailed checks/reasons; require a boolean assessment for an actual tool error, otherwise mark judge unavailable/inconclusive; align historical-drift wording with owner v2 without relabeling. Measurement v1/v1.1 rates are not directly comparable without recomputation under the same contract.
- Verification before commit: 92 focused evaluator tests passed, zero skips. Final-head types/lint/build/full-suite checks run after commit and are reported with the exact handoff SHA. Temporary logs `/tmp/esco-i02-{envelope-count-repro,applicability-drift-repro,corrections-focused}.log` retain reproduction evidence.
- Remaining: parent review and explicit I02 draft-publication approval, then PR CI. No publication attempt. No other scope, runtime, provider call, private JSONL, migration, deployment or next slice.

## Session — I04-a persisted-summary safety, 2026-10-29 UTC

Branch `codex/esco-faithfulness-summary-safety`; baseline current main47d1386, PO files preserved. Reproduced6 failures in current-main focused controls, fixed canonical `escoConsultas.ts` and synchronized its two generated copies with the existing script. Added synthetic tests to existing main query/loop suites:76 focused passed, independent26 assertions passed. Immediate raw tool data stays complete; persisted truncation/failure cannot pass the births evidence gate. No new business rule, typed-envelope migration, hard context cap, tool injection or Telegram rewrite. Final-head test/type/lint/build/CI receipts belong in PR/handoff. Rollback is source revert and mirror synchronization; deployed rollback would separately require an authorized edge deployment. No deployment or production/private/provider action occurred. Next: parent review and morning queue integration, no further slice.

Initial I04-a implementation `b162e37` full suite:4781 passed,1 failed; the existing documentation guard flagged placement of the public prior-CI receipt near channel-history text. Moved the unchanged receipt into its own section. No guard, allow-list or source/test assertion was relaxed. Functional source/tests remain as independently reviewed; final handoff is the later documentation commit and must pass all final-head gates.

## Historical session — I03-c closed fixture adapter, 2026-10-29 UTC

Branch: `codex/esco-faithfulness-eval-fixtures`, base main `6a2dd50`. Source preserved. Changes: Node-only canonical/hash/manifest and closed tool replay in `src/utils/escoEvals/fixtures.ts`, synthetic `escoEvalsFixtures.test.ts`, three tracker docs. No other scope imported. Initial 10 failing controls fixed; independent reviewer found and rechecked two additional fixes. Precommit gates: `eval:esco:check` 132 tests, `npm test` 4797/219 files, zero skips; types/lint/build passed (907 prior warnings, build27.19s), whitespace clean. Logs `/tmp/esco-i03c-final-{check,suite,lint,build}.log`; initial failures `/tmp/esco-i03c-repro.log`. Final committed head must pass gates before publication; exact receipt belongs in PR/handoff. No mobile/live QA applicable to this offline helper. Remaining: final-head CI and morning review; next useful implementation is transport-independent replay composition after parent dispatch. Keep #359/#361 queued, no merges/production actions.

## Session — refresh existing363 against merged371 main, 2026-10-30 UTC

Original head2f996c7 and actual main13ef1f4 reverified. Prepare a merge integration preserving both remote parents without force-push; original fixtures.ts and escoEvalsFixtures.test.ts blobs are unchanged. Reconcile current trackers only, retaining prior historical evidence and all main security/runtime/PO source. Node-only synthetic adapter has no production capability; consumers must invoke both finalizers and propagate sticky failure. Hashes prove consistency only. Final verification/independent review/CI belongs to the candidate handoff; no unrun check is passed here. Next scope only after parent review and363 merge: refresh364 against actual main, not old integration-base.

Local refreshed-candidate checks:40 fixture tests;208 evaluator tests/types/focused lint;5034 full tests/227 files, zero skips; full lint0 errors/907 existing warnings; build and whitespace passed. Independent review passed25 additional synthetic assertions and verified original blob parity. CI must validate the new remote merge head; historical2f996c7 results do not substitute.

## Historical session — I03-d offline composition, 2026-10-29 UTC

Branch `codex/esco-faithfulness-eval-replay`; target base `158720fed6ceb461efd34746760db520c557d2a3`. Local integration base combines exact reviewed #359/#361/#363; no GitHub merge or main mutation. Only tracker docs conflicted, resolved to later snapshot with original parent histories preserved. New code: replay.ts and synthetic replay tests; no dependency implementation edits. Both finalizers called, sticky fixture errors propagate as inconclusive. Initial 24 tests plus independent 12 assertions passed; added two channel-window controls. Precommit eval check and final-head full tests/types/lint/build must pass before publication; receipts are reported with exact candidate in PR/handoff, not inferred from source or prior PRs. Remaining: terminal CI, morning dependency merges/retarget/retest, then separately dispatched actual-loop isolation work. No runtime/provider/private-source/credential/production action. No calibration/live QA.

## Session — existing364 refresh/retarget, 2026-10-30 UTC

Reverified original19d1678 and actual main0e80cae; dependencies359/361/363 are merged. Retain original implementation/tests and nine dependency blobs; only tracker reconciliation. Preserve both remote parents with a non-forced update and retarget existing PR to main. No merge of old integration-base, runtime edit, production/provider/private-data access or372 dependency. Final candidate local/review/CI receipts belong to the handoff. Next only after parent review and364 merge: refresh366 on actual main.

Refreshed local checks:26 replay tests;234 evaluator tests/types/focused lint;5060 full tests/228 files, zero skips; full lint0 errors/907 existing warnings; build12.73s and whitespace passed. Independent review passed29 additional synthetic assertions, verified original replay/test and all dependency blobs, and attempted no network. Final remote head/CI is recorded in the handoff.

## Historical session — I03-e unchanged actual-loop verification, 2026-10-29 UTC

Branch `codex/esco-faithfulness-eval-loop`; base #364 `19d16783e7af0dde3a95057dea45446ece76e4a5`. New `evals/esco/lib/ejecutorCongelado.ts` and `escoEvalsLoopCerrado.test.ts`, three tracker docs. Actual read-only births query executes with synthetic model/REST fixtures, forced-query and unavailable/partial-evidence behavior retained. Exact request signatures, no inherited-network fallback, private sticky invalidity and both finalizers. Fresh fetch and exact Deno descriptor restoration; date ownership and cleanup; request/tool-attempt diagnostics. Focused31 and independent7 controls passed. Initial type/sentinel/capture failures are recorded above; final committed-head gates and associated CI must be reported with exact SHA in PR/handoff. No runtime edits or live/provider/private-data actions. Remaining gates: dependency integration/retest, broader independently reviewed scenario coverage, runtime evidence/injection authorization where needed, explicit private disclosure/provider approval before calibration and separate deployment/live-QA authorization. No further stage starts here.

## Session — existing366 refresh/retarget, 2026-10-30 UTC

Reverified original2d504e1 and actual main61d2faf. Preserve original closed HTTP/clock/env helper and all main source. Six synthetic model-body hashes require protocol maintenance after reviewed371 tool definitions; no assertion/matcher relaxation. One initial launcher used the preceding worktree and found no matching test; corrected cwd before the genuine6fail/25pass reproduction. Controlled repinning produced5fail/26pass, then1fail/30pass and final31pass. Independent8-envelope comparison proves the exact bounded delta. Final full/adversarial/CI receipts belong to the handoff. No provider, real environment, private record, production request or deployment. Next: parent review only; no new stage.

Refreshed local checks:31 closed-loop tests;265 evaluator tests/types/focused lint;5091 full tests/229 files, zero skips; lint0 errors/907 existing warnings; build and whitespace passed. Independent review:8 old/new envelopes across6 pins plus7 extra adversarial safety tests, inherited network calls0. Helper/dependency blobs remain unchanged; only6 test digest literals differ from original assertions. Final remote SHA/CI belongs to the handoff.

## Session — refresh existing372 after offline queue integration, 2026-10-30 UTC

Reverified original36af47a and actual mainfece0e5. Preserve all3 reviewed implementation files exactly; reconcile current trackers and release guide only. Both runtime trees, SQL188/RPC106, source/rollback SHA/tree/config/hash pins and original capture helpers remain unchanged. Existing372 fast-forward update preserves both parents; no force-push or new PR. Final local/independent/CI receipts belong to the candidate handoff. Stop before ready/merge for parentgo; no management secret, new diagnostic, deployment, provider, private data or373 merge. User's explicit03:30 permission covers the later bounded sequence, not guard bypass or a moving-main receipt.

Refreshed local checks:117 Node guards;5091 full tests/229 files;265 evaluator tests/types/focused lint; zero skips. Full lint0 errors/907 existing warnings, build and YAML/whitespace passed. Independent review12 additional adversarial tests plus117 controls/wrapper passed; all3 implementation blobs are identical36af47a. No permission/secret/live operation occurred. Final head/CI belongs to the published handoff.
