# Implementation plan: faithful and consistent Esco

Version 1. Planning branch: `codex/esco-faithfulness-plan`. Status lives in [PROGRESS.md](PROGRESS.md), not in duplicate checkboxes here. Read [SESSION.md](SESSION.md) for session entry/exit, [DECISIONS.md](DECISIONS.md) for approval boundaries, and [BASELINE.md](BASELINE.md) for measured findings.

## Outcome and scope

An answer must distinguish verified facts, calculations, missing data, and interpretation. Complete totals require complete retrieval. Follow-ups preserve entity/period/metric definitions unless new evidence explains a correction. The system records failures and evaluates real traffic without putting an LLM judge on the response path.

Three separate quality axes: **faithfulness** (supported by evidence received), **correctness** (retrieval and calculation match reviewed business truth), and **consistency** (same facts under equivalent evidence/questions). Also measure useful completion, appropriate clarification/abstention, execution errors, latency, tool calls and tokens. Do not optimize pass rate by refusing every question.

Initial domain scope: animal sales, application costs/progress, weighted production yield, inventory filtering, and cross-domain evidence controls. Broader tool replacement and model-family changes are deferred. The first end-to-end milestone is complete animal-sales evidence, deterministic totals, stable follow-ups, and a trace inspectable in replay and production.

One task is one intended session, not a promise that every task fits every context window. Split oversized tasks into explicit slices before implementation; each slice must leave a working, testable commit. New module paths below are proposed locations, not assertions that files already exist.

## Phase 0 — trustworthy measurement

### P0-01 — Define the metric and case contract

**Dependencies:** prerequisite S00. **First action:** read the current result types, verdict combination, README, and BASELINE.md.
**Implement:** add a metric specification under this directory and typed definitions in `src/utils/escoEvals/` as needed. Separate unsupported claims, wrong retrieval, wrong calculation, within-conversation contradiction, execution failure, judge unavailable, clarification, and abstention. Define every denominator and severity. Keep existing report fields backward-compatible.
**Accept:** every one of the 56 cases is accounted for; execution failures count against service success even if semantic verdict is inconclusive; judge-unavailable and missing traces cannot disappear from denominators. Correct abstention and useful answer coverage are reported separately. Define how claim-level support is human-labeled and distinguish it from mere presence of citations.
**Verify:** report/verdict fixtures covering missing judge, execution exception, partial answer and appropriate clarification; harness checks.
**Handoff:** metric definitions, mappings from old fields, and exact initial seed list. No paid calls needed.

### P0-02 — Adjudicate calibration and rubric disputes

**Dependencies:** P0-01; D01 for final decisions. **First action:** inspect the five disagreement records, approved criteria and original human labels; obtain private evidence if absent.
**Implement:** create a versioned adjudication ledger with old label/rubric, evidence, proposed interpretation, reviewer decision, and affected cases. Separately review ESCO-GS-054 acknowledgement versus completed persistence. Clarify the meaning of tolerated historical drift. Resolve ESCO-GS-056 malformed output handling without guessing a verdict.
**Accept:** each disputed case is accepted, revised with attribution/versioning, or excluded from an enforced gate with a reason. Never overwrite the uploaded original. Synthetic examples prove that missing tool summaries are not failures and genuine failures are not hidden.
**Verify:** judge parser/prompt tests and original-answer calibration only with the approved dataset and authorized one-time budget. Report unavailable results.
**Handoff:** reviewed rubric version and decisions. If owner input is pending, mark blocked and continue P0-03 using undisputed cases.

### P0-03 — Add frozen tool replay and the first fixture pack

**Dependencies:** P0-01; disputed fixtures wait for P0-02. **First action:** inspect `correrCaso`, transport guards and dynamic module loading.
**Implement:** inject a test/replay tool transport while exercising the actual production loop. Key fixtures by tool, canonical arguments, scenario, and turn/state; return recorded or explicitly synthetic results. Fail on unmatched calls and prohibit database/network side effects. Keep LLM transport independently configurable. Start with 12–15 distinct scenarios mapped to BASELINE.md; include animal sales, duplicates, missingness, ambiguity, error handling and multi-turn consistency.
**Accept:** frozen replay cannot silently fall through to production; date and evidence are controlled. Sanitized synthetic fixtures are committed; private snapshots remain excluded. Fixtures have source, schema, reference/rubric version, hash and review status. Historical expected values have compatible tool responses, not today's data relabeled as history.
**Verify:** zero-network replay with mocked model; unexpected tool request fails explicitly; two scenarios cannot leak state. Document a real-model frozen replay command separately from free tests.
**Handoff:** fixture manifest, supported cases, gaps and repeatable baseline command. Do not claim real model improvement from mocked outputs.

## Phase 1 — evidence and execution controls

### P1-01 — Introduce typed evidence envelopes

**Dependencies:** P0-03. **First action:** inventory current `_evidencia`, summaries and error shapes in shared tools.
**Implement:** shared evidence types and adapters (for example `src/utils/escoEvidencia/`) with outcome, completeness, scope/entities, period/timezone, coverage, observed/retrieved timestamps, units, source IDs and truncation. Model `complete-empty`, `partial`, `unavailable` and `stale` distinctly; unknown fields stay unknown. Migrate the scoped tools first with backward-compatible adapters.
**Accept:** no truncating adapter can set complete=true; no error becomes empty success; metadata survives the immediate loop and persisted context. Source references resolve to authorized evidence. No key/header leaks into envelopes.
**Verify:** empty vs missing/error, partial pagination, stale data, summary truncation and legacy tool adapters. Synchronize generated edge copies when affected.
**Handoff:** envelope contract, migrated/unmigrated tool inventory, consumer compatibility notes.

### P1-02 — Bound the tool loop and route commands

**Dependencies:** P0-03; P1-01 for outcome metadata. **First action:** inspect forced first-round `required`, duplicate detection and per-round tool arrays.
**Implement:** configurable total calls, calls per response, elapsed deadline, canonical duplicate keys and bounded retries. Reuse an identical result rather than creating repeated error interactions; validate arguments instead of silently executing `{}` after invalid JSON. Reconcile provider-required tool-call responses before stopping. Route web greetings/control commands outside data retrieval; preserve Telegram's existing command handlers. Do not force a query before a necessary clarification.
**Accept:** repeated batches cannot reproduce the 194-interaction pattern; budgets include every round and fallback; one hanging final generation cannot bypass the deadline. A stop produces a useful partial/unknown outcome with a machine-readable reason. Defaults are recorded and tested, not inferred from three rounds.
**Verify:** oversized tool batch, reordered argument keys, repeated failure, malformed args, abort/fallback, greeting, `/clear`, and ordinary legitimate multi-tool request. Run production-loop runtime tests.
**Handoff:** configured limits, compatibility behavior, and cases to rerun.

### P1-03 — Validate claims before publishing

**Dependencies:** P1-01, P1-02. **First action:** define a minimal structured answer/fact schema with source references.
**Implement:** facts bind metric/entity/period/unit/value to evidence; code validates references, scoped numeric facts, aggregates and completeness prerequisites. Render user text/charts from verified facts where practical. Permit a bounded repair attempt; otherwise omit unsupported details and explain the limitation. Preserve useful supported parts. Never present association as proven causation or work activity as formal task closure without the required source.
**Accept:** unknown source IDs, mismatched units/entities/periods, incomplete definitive totals and fabricated chart observations fail validation. Captured success/failure of this validation is explicit. Narrative causal support is not claimed to be fully provable by regex or an ID existing; uncertain interpretation is qualified and evaluated semantically.
**Verify:** correct number attached to wrong lot; absent measurement; failed lookup used to assert absence; partially supported answer; unsupported explanation; malicious instructions embedded in source text. Check web and Telegram rendering compatibility.
**Handoff:** supported claim classes, deterministic checks and remaining semantic limitations.

### P1-04 — Preserve scoped facts across turns

**Dependencies:** P1-01, P1-03. **First action:** inspect both channels' history construction and truncated tool summaries.
**Implement:** conversation evidence state keyed by entity IDs, metric definition and period, with source versions and freshness. Reuse valid facts across paraphrases/follow-ups; invalidate when scope or source changes. Request clarification for genuinely ambiguous entities. Explain corrections when new evidence changes a previous value.
**Accept:** same-scope follow-ups preserve facts; changed evidence can correct them; stale evidence does not justify new absence claims. Conversation/user isolation is enforced; state size/expiry are bounded. A name is never silently equated to an unverified alias.
**Verify:** two-turn contradiction seed, ambiguous animal then identifier, changed date/metric, updated source, separate conversations and both channel history formats.
**Handoff:** persisted/context schema compatibility and invalidation rules.

## Phase 2 — correct tools and domain calculations

### P2-01 — Complete animal-sales aggregates (first end-to-end milestone)

**Dependencies:** P1-01, P1-03; D02 only if domain sources conflict. **First action:** trace ESCO-GS-040 to its source tables and existing financial tools.
**Implement:** complete paginated retrieval or verified aggregate query; calculate annual counts and any requested weighted prices in code. Make sale scope, transfer treatment, confirmed status, dairy/beef scope, period and null handling explicit. Route annual-count questions to this tool rather than summing a truncated detail list in the model.
**Accept:** full totals remain correct past a pagination boundary; incomplete retrieval cannot claim completeness; the model uses returned values in text and charts. Reviewed frozen references agree exactly within declared tolerances; avoid hardcoding benchmark values.
**Verify:** independent sums on synthetic records, multiple pages, transfers, duplicate rows, year boundaries and missing quantities. Run ESCO-GS-040 replay three times plus a follow-up.
**Handoff:** definition, source mapping, observed improvement and unresolved historical differences.

### P2-02 — Application definitions, details and progress

**Dependencies:** P1-01–P1-03; D02 for conflicting cost definitions. **First action:** map ESCO-GS-012–017 to summary/detail and cost sources.
**Implement:** separate purchases from consumption in closed applications; deterministic planned/executed quantities, progress denominator and date cutoff; complete lot detail. Ask which cost definition is intended when unresolved. Treat contradictory user numbers as a discrepancy to locate, not a reason to invent a dose change.
**Accept:** the selected definition appears in evidence and response; partial/executed/closed states are distinct; no double counting mixes/lot details; quantity mismatch does not produce an unrecorded explanation.
**Verify:** partial completion, zero denominator, multiple lots/products, open vs closed, two plausible cost definitions, and challenged totals. Replay 012–017 with consistent fixtures.
**Handoff:** definitions and any required business decision; no unreviewed financial convention changes.

### P2-03 — Weighted production yield and derived prices

**Dependencies:** P1-01, P1-03; applicable D02. **First action:** inspect existing pure production/financial calculations before adding duplicates.
**Implement:** reusable weighted aggregates with explicit numerator/denominator, entity scope and period. Calculate ratios from totals, not unweighted means of lot ratios. Keep zero/missing denominator and missing observations separate; use established Colombian formatting at rendering boundaries.
**Accept:** tools expose inputs, unit and formula; the model cannot substitute its own figure. No invented observation fills gaps in charts.
**Verify:** unequal lot sizes, missing/zero denominator, rounding, changing inventory/tree populations and sparse measurements. Replay 028/033/037/045 as applicable.
**Handoff:** formula references and domain-specific coverage limits.

### P2-04 — Repair inventory filtering and error propagation

**Dependencies:** P1-01; P1-03 for response behavior. **First action:** reproduce the enum/text filter from ESCO-GS-036 with the verified schema.
**Implement:** supported enum equality or explicitly valid cast/search behavior; avoid invalid `ilike` on an enum. Distinguish zero stock from missing minimum. Preserve tool failure as a material limitation while allowing independently verified financial results.
**Accept:** controlled Postgres integration no longer returns 42883; missing minimum count is explicit; a failed query cannot yield fabricated inventory alerts.
**Verify:** enum matches, unknown category, null minimum, zero stock, query failure, mixed-success answer. Keep migrations unnecessary unless inspection establishes otherwise.
**Handoff:** exact query fix, schema evidence and diagnostic fixture.

### P2-05 — Apply coverage, freshness and attribution rules

**Dependencies:** P1-01, P1-03 and scoped P2 tools. **First action:** inspect current climate coverage and report-source tools; reuse their metadata.
**Implement:** expose actual observation coverage and last-observation time; preserve gaps in chart series; retain agronomist report identity/date and separate its statements from field measurements. Treat external search/forecast unavailability explicitly; avoid unrelated fallback queries or unsupported cited claims.
**Accept:** incomplete weather coverage is a bound/unknown as appropriate; missing weeks are not invented points; stale dairy measurements are labeled; every attributed report claim has an accessible source. Causality requires its stated evidential basis.
**Verify:** 021/024/032/042/045/057/058-style fixtures with successful, partial and unavailable sources; no credentials required for fault injection.
**Handoff:** migrated rules and deferred tools. Do not broaden into a monitoring-model redesign.

## Phase 3 — offline release evidence

### P3-01 — Repetition, paraphrase and multi-turn scoring

**Dependencies:** P0-01, P0-03, P1-04. **First action:** inspect existing EVAL_REPETICIONES/EVAL_PARAFRASIS support and add only missing measurement.
**Implement:** normalize facts for comparison across repeats/paraphrases and turns; separate wording variation from contradiction. Report per-case stability, domain scores, task success, appropriate abstention, unsupported claims and judge availability. Pin fixture/rubric/model/prompt/tool/code versions.
**Accept:** seeded contradictions fail; legitimate source changes are explained; unavailable trials never count as stable. Claims outside the structured fact set still receive semantic/human scrutiny. Compare identical fixture versions.
**Verify:** deterministic scoring tests plus an authorized real-model focused campaign; at least three repeats per critical case. Show trial counts and uncertainty, not only a percentage.
**Handoff:** actual commands, manifests, private artifact locations and baseline/candidate comparison.

### P3-02 — Controlled retrieval integration suite

**Dependencies:** P2-01–P2-04. **First action:** define a disposable database fixture without production writes.
**Implement:** seed relevant schema/records into a local or dedicated test instance, exercise actual query adapters, and independently calculate expected outputs. Validate pagination, filters, joins, dates, enum types and completeness flags. Keep synthetic CI seeds committed.
**Accept:** retrieval correctness is tested separately from answer faithfulness. Tests can detect a correct-looking answer generated from wrong tool rows. Test setup/teardown cannot target the production URL; no live reset/seed command exists by default.
**Verify:** controlled integration suite, wrong-filter mutation/failure, >one-page data, partial fetch and schema mismatch.
**Handoff:** reproducible seed/run commands, requirements, schema assumptions and isolation proof.

### P3-03 — CI and offline checkpoint B

**Dependencies:** P2-05, P3-01, P3-02; D07 for enforced thresholds; P0-02 for disputed gates.
**Implement:** PR jobs for free deterministic/integration checks; protected/manual paid jobs for focused/full model evaluations. Supply private data via authorized storage, never public artifacts or fork secrets. Add report-only quality gates first, then enable owner-approved gates. Capture candidate source hash, not a moving branch label.
**Accept:** no automatic paid calls on untrusted PRs; no leaked private fixtures/reports; skipped private checks are visible. Validate existing channel and source-mirror tests. Produce a reviewable offline candidate report before deployment.
**Verify:** CI configuration, missing-secret/private-data behavior, gate failure and unavailable-judge paths. Run the full reviewed frozen suite and critical repeats within D05's budget.
**Handoff:** checkpoint B result, exact failed gates and rollback candidate. Online activation is not a prerequisite for this checkpoint.

## Phase 4 — durable production traces (disabled until authorized)

### P4-01 — Trace schema and access controls

**Dependencies:** P0-01, P1-01; D03/D04 before production use. **First action:** inspect chat ownership, RLS, Telegram user linkage and current migration ledger.
**Implement:** design versioned request/turn traces, tool spans, evidence references/snapshots, evaluator results and feedback linkage; actual table layout may be combined if simpler. Include generation/delivery latency, tokens, stopping reason, channel, versions, capture completeness and scope. Separate trace metadata from sensitive snapshot payloads. Reserve migration numbers only after current inspection.
**Accept:** explicit role/ownership checks for service-role paths, Gerencia review access per D03, minimized/redacted payloads, bounded snapshot sizes, deletion policy and no credential capture. Migration has a rollback/forward-repair plan. Ordinary users cannot enumerate others' traces.
**Verify:** local migration/RLS/access tests for owner, other user, reviewer and worker; rejected oversize/secret-like fields. Do not apply production migrations as part of schema drafting.
**Handoff:** schema contract, decision status, migration file and unapplied/applied state backed by evidence.

### P4-02 — Instrument web and Telegram

**Dependencies:** P4-01, P1-02; production capture requires D03/D04 and authorized schema/deployment.
**Implement:** shared trace collector around the common loop and both channel entry points. Correlate existing tool events, tool results, response and errors. Flush on failure/cancel as well as success; bounded persistence failure must not hang the answer. Record capture gaps. Avoid two independent tracing implementations.
**Accept:** both channels record versioned traces and actual model/tool failures; summaries alone are not labeled complete snapshots. Capture is configurable and initially disabled outside test/pilot. Existing chat ownership/memory behavior remains intact.
**Verify:** mock persistence, aborted web stream, Telegram delivery failure, loop exception, store outage, large result and cross-user isolation; existing chat/Telegram tests and source synchronization.
**Handoff:** flags, activation procedure, trace examples using synthetic data and any capture limitations.

### P4-03 — Deterministic online monitors

**Dependencies:** P4-02, P1-03. **First action:** reuse metric definitions and synchronous evidence-validator outcomes.
**Implement:** every captured request records budgets, duplicate calls, tool errors, missing required evidence, incomplete definitive-answer attempts and execution outcome. Distinguish a mechanically verified violation from a heuristic alert. Include trace coverage/ingestion failures in operational reporting.
**Accept:** failure severity and monitor version are explicit; no trace/unknown evaluation is not a pass; no LLM required. Alerts are records until notification routing is authorized.
**Verify:** synthetic traces for every failure class and false-positive controls, malformed/partial traces, duplicate ingestion.
**Handoff:** monitor catalog, signal definitions and counts on a synthetic pilot dataset.

## Phase 5 — sampled online evaluation and review

### P5-01 — Asynchronous evaluation queue and judge worker

**Dependencies:** P4-01–P4-03; D04/D05 before paid activation. **First action:** choose a minimal first-party queue/lease mechanism using current platform capabilities.
**Implement:** idempotent jobs keyed by trace/evaluator/rubric version; bounded retries, timeout, lease expiry, terminal failure and replay. Judge the response against evidence captured at answer time, not a fresh database lookup. Validate JSON/criterion IDs; capture uncertainty and exact unsupported claim/source references. Do not expose secrets or treat source text as instructions.
**Accept:** no judge call on the user response path; duplicate deliveries do not duplicate billable work without recorded retry reason; invalid output is unavailable. Worker has no business-write authority and cannot automatically change user data or labels.
**Verify:** fake provider and queue tests: duplicates, timeout, malformed JSON, worker crash, stale lease, source prompt injection and unavailable snapshot. Optional authorized single-trace live judge probe.
**Handoff:** worker commands/deployment requirements, costs measured when available, retry semantics and flags (off by default).

### P5-02 — Sampling, cost controls and retention

**Dependencies:** P5-01; D03–D05 for activation. **First action:** implement a deterministic seeded sampler over synthetic traffic.
**Implement:** separate random and risk-triggered populations, persist selection reasons/inclusion probability, conversation-aware sampling for contradictions, daily request/token/spend caps and a kill switch. Use trusted pricing/version metadata when estimating spend; unknown prices must not bypass the cap. Budget all retries and estimate/reserve before dispatch. Add idempotent cleanup of snapshots, evidence-derived payloads and queue/review copies.
**Accept:** owner can bound recurring spend; 10% is a proposed default, not approval; flagged-rate statistics never masquerade as random production estimates. Metadata and snapshot retention are separate. Expired sensitive payloads are actually deleted or irreversibly redacted according to D04.
**Verify:** seeded inclusion tests, overlapping samples, concurrent workers at cap, retries, pricing missing/change, day boundaries and cleanup coverage.
**Handoff:** approved settings or explicit blocked activation, forecast method and synthetic cost/retention evidence.

### P5-03 — Feedback and human review

**Dependencies:** P4-02, P5-01; D03 for access. **First action:** define reviewer workflow and minimal UI/Telegram affordances.
**Implement:** attach incorrect-data/missing-info/contradiction/not-useful feedback to a specific answer; review view shows answer, evidence, flags, judge reasoning and decision. Support accepted finding, false positive and unresolved. Version adjudications and proposals for sanitized golden fixtures; promotion requires review.
**Accept:** feedback ownership and reviewer authorization are checked server-side; Telegram callbacks cannot select another user's trace; evidence is inspectable but minimized. Thumbs-down is not a ground-truth label. Existing memory-confirmation controls remain separate.
**Verify:** ownership, spoofed callback, duplicate feedback, access denial, unavailable evidence, review audit; mobile and desktop UI checks for any new view.
**Handoff:** review instructions, roles, fixture-promotion procedure and outstanding owner adjudications.

### P5-04 — Operational scorecard and incident rules

**Dependencies:** P4-03, P5-02, P5-03. **First action:** derive scorecard queries from the metric contract, including sampling strata.
**Implement:** minimal Gerencia view/report with sample sizes, trace coverage, unavailable evaluations, faithfulness/correctness/consistency, completion/abstention, tool errors, latency and tokens by version/channel/domain. Include weighted estimates or clearly label descriptive sample rates. Add configurable incident thresholds, deduplication and quiet-while-unchanged behavior; prepare notification destinations without sending unrequested messages.
**Accept:** a bad flagged cohort cannot distort random-sample estimates; p95 generation and end-to-end delivery are distinct; judge outages are visible. No automated rollout or data edits based on judge scores.
**Verify:** synthetic population with unequal inclusion probabilities, low sample counts, empty windows, delayed jobs and repeat incidents; UI visibility/mobile if applicable.
**Handoff:** operator runbook, query definitions and any notification activation decision.

## Phase 6 — pilot, release and long-term loop

### P6-01 — Baseline observation and safe shadow comparison

**Dependencies:** checkpoint B and P5-04; D03–D06 for live activation.
**Implement:** record current/candidate versions and approved cohort/budgets; observe before changing traffic. Candidate shadow generation uses the same captured read-only evidence, never repeats business writes or memory actions. Measure compatibility with both channel endpoints and clearly separate frozen shadow faithfulness from candidate retrieval tests.
**Accept:** paired comparisons use the same evidence; no shadow answer reaches users; no side effect is replayed. Low volume leads to an explicit insufficient-evidence conclusion, not promotion by elapsed days. Record exact deployment/config versions and rollback checks.
**Verify:** authorized internal pilot, side-effect-block tests, trace completeness, blind human comparison and latency/token report. Suggested observation is 3–7 days, subject to sufficient samples and owner approval.
**Handoff:** measured pilot report, sample sizes, adverse events, unresolved gates and recommendation.

### P6-02 — Conversation-level canary and rollout decision

**Dependencies:** P6-01; D06/D07. **First action:** prepare the exact candidate, cohort assignment and rollback version.
**Implement:** stable conversation assignment to avoid mixing versions within a thread, staged expansion and tested rollback. Review task success and safe abstention alongside faithfulness; capture channel/domain differences. Keep owner promotion decision attached to evidence.
**Accept:** no critical gate is hidden by aggregate improvement; no promotion with unavailable evaluators or insufficient samples. Deployment/migration ledger reflects actual state. Rollback does not corrupt historical trace interpretation or erase review records.
**Verify:** offline gates, authorized production smoke in both channels, canary/rollback exercise, matched cohort report and complete version provenance.
**Handoff:** approved/rejected/blocked release decision, deployed version or explicit local-only state, and follow-up issues.

### P6-03 — Expand fixtures and close the improvement loop

**Dependencies:** P3-03 and pilot findings; P0-02 for disputed cases.
**Implement:** convert reviewed online failures into sanitized, approved regression fixtures; extend reproducible coverage toward all 56 included cases. Keep historical-only cases explicitly classified if compatible evidence cannot be recovered. Document maintenance owner, review cadence, schema/rubric version changes and budgeted evaluation cadence. Schedule only when authorized.
**Accept:** each original case has a reviewed disposition and provenance; no fabricated historical snapshot; no automatic training/golden contamination from unreviewed user/model output. Report remaining limitations and create narrowly scoped next tasks for deferred tools/model experiments.
**Verify:** full reviewed offline suite, negative controls, evaluation-version compatibility and restore-from-private-artifacts procedure.
**Handoff:** final coverage matrix, operational ownership, budget/configuration, remaining backlog and closure evidence.

## Proposed release gates (D07)

| Dimension | Proposed criterion | Important limit |
|---|---|---|
| Critical evidence controls | All targeted deterministic tests pass | Passing tests do not prove arbitrary narrative truth |
| Critical answer cases | Zero critical unsupported claims across at least three frozen trials per case | Bounded sample, not a population guarantee |
| Broader reviewed frozen suite | At least 80% pass; every case accounted for | Confirm target after comparable baseline; report task success separately |
| Multi-turn consistency | No critical factual contradictions on the critical suite | Same scope/evidence; explained corrections are allowed |
| Execution | Total budgets enforced; no uncapped duplicate loops | Exhaustion remains an unsuccessful service outcome |
| Regression | No new critical failure vs same-fixture baseline | Unavailable verdicts do not establish improvement |
| Performance | Candidate p95 generation latency within 20% of comparable baseline | Also report delivery latency, tokens and cost; insufficient samples are explicit |
| Observability | Both channels produce inspectable traces; missing/failed evaluations are visible | Sampling and sensitive-data decisions must be approved |

## Task sequencing and checkpoints

Default sequence: P0-01 → P0-03 → P1-01 → P1-02 → P1-03 → P2-01 → P1-04 → remaining P2/P3 → P4 → P5 → P6. Bring P0-02 to the owner with evidence; unresolved labels need not block undisputed improvements. This sequence intentionally produces the first complete animal-sales improvement before online infrastructure.

P2 domain tasks can proceed independently after their shared prerequisites. Do not run parallel agents merely because tasks are independent; follow the current user's/session's delegation instructions. Online storage design can proceed using synthetic data while activation decisions are pending.

Planning estimate: roughly 2–4 engineering weeks for focused implementation/initial online evaluation, plus traffic-dependent pilot and owner review. This is not a deadline; update estimates after the first fixture and aggregate-tool tasks. One session-sized task may need a smaller explicit slice. Track actual progress rather than treating estimates as completion evidence.
