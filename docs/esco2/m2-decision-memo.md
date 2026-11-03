# M2 decision memo — proposed labor proof block

2026-11-03. Prepared from master plan/PRD v0.3 and the local evidence through `7f8fe35`. **Recommendations for approval, not decisions or execution authorization.** No product code, integration, provider call or deployment accompanies this memo. Review the five items together because the interface determines the result contract, provenance guard and tests.

Sources: [master plan](https://app.notion.com/p/40d67755ed6881dba866f9775fca997e), [E2-03](https://app.notion.com/p/40d67755ed6881f2aac0c34906e46234), [E2-17](https://app.notion.com/p/40d67755ed6881eba1a3db25cafe5287), [independent review](review-and-baseline.md), [local compatibility disposition](compatibility-disposition.md).

## Decision requested

Approve or revise the five technical recommendations below and the conditional M2.5 effort/campaign ceiling. Record the data-route decision separately after E2-17 security/closure review. The standard Composio tool's documented inability satisfies neither proof of B security nor the explicit architecture decision. Recommended execution path for the proposed block is the direct-route design **only if that decision and the required gates are approved**. No final route is selected here.

### 1. Names, context and the external operation interface

**A — Canonical new interface.** New planner uses one versioned operation registry and authorized resolved IDs. Name resolution happens once against a fresh authorized catalog; ambiguity yields clarification. Structured context carries verified IDs/date basis and is rebound to the current actor/conversation each turn. No legacy API compatibility promise in phase 1.

**B — Approved compatibility adapter.** Keep legacy date/name arguments at the boundary and translate to the canonical plan after authorized catalog resolution. Reject unsupported selectors or ambiguous context explicitly; keep the canonical registry the sole execution authority. This entails another boundary/version to maintain and more alias/collision/continuation tests. The local date-only converter demonstrates only a small mechanical part.

**Recommendation: A.** The web-only rebuild has no approved need to preserve old tool signatures. One interpretation path fits v0.3 and avoids binding the new core to the old orchestration. Keep the date converter as development evidence, not a published shim. Do not silently reinterpret `lote_name=null` or discard `reference_day`.

**Impact:** avoids adapter maintenance but requires a new planner schema and fresh authorized catalog/clarification contract. Preserves current web/Telegram behavior until the pilot gate; it does not justify changing existing handlers now.

**Dependencies / proof:** M1 qualifies catalog identities and the authority's scope source; M2 approves date/context behavior; E2-13 proves current ownership/role and scope in the actual read transaction. Acceptance cases must include duplicate names, unassigned groups, explicit period/entity changes and revocation. Local evidence proves argument preservation and rejection of unsupported aliases, not real name resolution.

### 2. Existing Scope/Evidence versus the per-part result envelope

**A — Minimal new versioned envelope, preserving proof semantics.** Define requested parts, effective scope/period, fact IDs, metric/unit, missing counts, population completeness/provenance and explicit result states. Qualify reusable pure proof/calculation helpers, but do not import the broad legacy dispatcher/boot graph. All model-facing output derives from this one envelope.

**B — Strict adapter over legacy Scope/Evidence.** Keep that representation internally and translate only a reviewed subset to the new response. Must carry population proof, metric coverage, no-record conditions and denied/unsupported/error distinctions explicitly. A mapper cannot infer missing proof or equate `ok` with a complete answer. Unsupported mappings fail closed.

**Recommendation: A, reusing qualified proof semantics/helpers where possible.** The narrow labor proof needs fewer states/domains than the existing dispatcher. A thin, versioned result is easier to audit than a broad compatibility layer, while retaining useful provenance rules rather than rebuilding arithmetic blindly.

**Impact:** requires new result types/validator and discriminating null/partial/error tests; avoids a permanent dual-state translation. It does not require a new database or changes to historical records. Reader/calculation reuse is conditional, not assumed savings.

**Dependencies / proof:** M2 approves states and proof fields; M1 qualifies registered date/cost grain; E2-13 validates real output minimization; evaluator independently tests incomplete population, missing costs, duplicate IDs, empty source and numeric grouping reconciliation. Current emitter discards source outputs and therefore proves none of these data-result properties.

### 3. Extra metric IDs and labor.count

**A — Keep M2.5 narrow.** Expose journals and historical registered labor cost only, by lot/period with the unassigned group. Keep record counts as explicitly named coverage metadata when useful, not an answerable business metric or synonym for journals. Unsupported business metrics stay unsupported.

**B — Add record count and broader IDs as first-class metrics.** Each needs a distinct definition, unit, population and oracle. Adding application input cost also needs qualified cost/attribution data; it cannot inherit the meaning of `application.cost`, which currently denotes labor cost.

**Recommendation: A for M2.5.** This matches the master plan's single-family proof. Decide later whether count or other metrics solve an approved task; no automatic expansion to make comparisons look better.

**Impact:** lowers proof scope and avoids ambiguous totals. Some legacy metric requests need an explicit unsupported response. No promises about application costs by lot, current salaries or allocated input costs.

**Dependencies / proof:** product/technical scope confirmation in M2; M1 verifies historical cost and fraction fields. Evaluator distinguishes count, journals and cost, and retains missing values as missing. The local registry already distinguishes the two proposed metrics and emits only their requested columns; it does not validate real totals.

### 4. Numeric/provenance guard versus evaluation number candidates

**A — Reuse the existing parser under a new strict assertion-to-fact boundary.** Qualify `escoEvals/numeros.ts` as a parser; require each numeric assertion to bind to approved structured facts and their unit, entity, period and coverage. Handle multiple candidate parses as ambiguity, not automatic proof. Render tables from facts. Permit one bounded recomposition, then a safe partial result.

**B — New parser and verifier.** Independently implement parsing plus provenance checks with a comprehensive locale/date/unit corpus. This can provide a cleaner contract but adds parser duplication and validation effort, contrary to v0.3's intended reuse unless qualification shows an actual blocker.

**Recommendation: A.** Reuse the existing extraction work after tests, and add the missing strict provenance boundary. Do not use the evaluation helper alone as the production guard. If it cannot represent the approved output reliably, document that gap before approving B.

**Impact:** moderate adapter/validator work and an explicit composer contract. Some ambiguous prose may require recomposition or structured rendering. No additional model call beyond the single budgeted recomposition; stronger models never fix missing evidence or permissions.

**Dependencies / proof:** item 2's approved envelope and date/unit rules; E2-06 model/cost limits; independent cases with extra unsupported numbers, swapped units/entities/periods, repeated equal values from different populations, locale separators and dates. No result/composer guard exists in the current probe. New guard code belongs to the approved block, not this memo.

### 5. Python evidence versus Vitest-only CI

**A — Port selected requirements to native TypeScript/Vitest with the product implementation.** Use the production registry as schema/validator source. Retain Python cases as historical design evidence, not a second production implementation. Explicitly carry the regression requirements and their provenance rather than only a test count.

**B — Keep Python as an actively checked evidence suite.** Add a dedicated CI job with pinned Python/jsonschema and explicit commands, while production remains TypeScript. This can protect design probes but adds an ongoing second toolchain and does not validate the production runtime by itself.

**Recommendation: A for the executable M2.5 block.** The existing repository already checks TypeScript/Vitest. Put the future behavior tests beside the actual implementation and avoid treating a Python emitter as a production oracle. No workflow or dependency edit is authorized by this recommendation.

**Impact:** test porting is real work included below; no implied green CI for current Python cases. Preserve the independent oracle separately from implementation to avoid tests simply restating the new code.

**Dependencies / proof:** approved implementation interface and ownership; test design review before port; native tests must fail against deliberate defects. Existing PR CI does not run the 28 Python cases. The local pinned dependency supports manual reproducibility only.

## What is established, and what is not

| Established by local/public evidence | Still requires evidence or decision |
| --- | --- |
| 28 synthetic cases pass; separate reviewer checked their bounded behavior; argument-loss/projection regressions failed before fixes | No actual JWT verification, user RLS/grants, live catalog/scope or transaction-time revocation proven |
| Branch reconciled with exact main 43c3e887; latest checked main unchanged; differences confined to preparation paths | A newer main must be compared again before any authorized integration |
| Standard A tool is documented with management read-only role that bypasses RLS and broad read grants | Independent closure/security review and explicit architecture decision; no project-specific inspection or universal Composio claim |
| Canonical fields/columns and date-only alias conversion are explicit in the probe | Result semantics, production interface, reused helpers and all five recommendations need M2 approval |
| D18 in the master authorizes snapshot data to OpenAI for evaluation, subject to its stated limits | Snapshot isolation/retention is currently blocked; E2-06 must verify exact project/config/treatment before running. D18 does not authorize new credentials, production or other destinations |
| Fixed family, same-case v295 comparison, all-Sol ceiling and 80% selection cutoff are in the plan | Actual case eligibility, independent references, v295 comparability and time/cost values must be frozen/confirmed before M2.5 |

## Conditional M2.5 budget — proposal for approval

**Active engineering time box: 24 hours.** Independent evaluation/review: **8 hours**. Santiago's review: **up to 2 hours**. Total ceiling: **34 person-hours**, of which 32 are technical effort. This narrows the earlier 16–28 engineering-hour estimate to a proposed stop limit, not a delivery guarantee or calendar deadline. No start date or named new owner is invented. At most two implementation fronts remain active; evaluation keeps independent ownership.

This envelope assumes the five recommended alternatives, qualified existing infrastructure/helpers, and resolved prerequisites. It excludes the preparation already completed in this branch; it does not charge those deliverables again. Choosing a legacy compatibility layer, a new parser, extra metrics or another active CI toolchain requires a revised estimate before accepting that additional work under M2.

The 24 hours **replace**, rather than add to, the earlier M2.5 engineering estimate. Native contract tests/ported regressions are included in the 3-hour contract, 5-hour boundary and 5-hour calculation rows below. The evaluator's 8 hours cover this labor proof only, not another M1/reference project or full M6 campaign. Tag delivered tests/review artifacts to this block and credit them when reestimating E2-07/E2-13/M3; do not budget the same work again. Later domains and full capture/web/phase-1 evidence remain separate.

Preflight must review effective synthetic access/denial evidence before any private snapshot read or snapshot-to-model call. The final security review must not be the first effective check.

Engineering breakdown, with no duplicated evaluation effort:

| Deliverable inside M2.5 | Engineering hours |
| --- | ---: |
| Narrow production registry/types; approved request/result contract | 3 |
| Controlled harness and actual authorized read boundary; source projection/scope | 5 |
| Labor fractions/historical cost, null groups, coverage/provenance; qualify helpers | 5 |
| Luna/all-Sol planning/composition and minimal strict numeric guard | 4 |
| Frozen bounded campaign runner, stage/cost record, run execution | 2 |
| One local/synthetic correction cycle before provider-campaign freeze, with discriminating regression | 3 |
| Evidence package, limits and M3 recommendation | 2 |
| **Hard engineering ceiling** | **24** |

Evaluator allocation: 2 hours preflight contract/reference/comparability review; 4 hours independent scoring and failure/coverage review; 2 hours security/quality close-out. Santiago allocation: 1 hour confirming contract/threshold/timebox decisions; 1 hour reviewing the outcome/Go–No-Go. These are effort allocations, not commitments by people who have not accepted ownership.

**Included scope:** one labor family, journals and historical labor cost by lot/date with null group; registry-driven planning, deterministic read/calculation, explicit evidence and composition; actual authorized snapshot/provider path in a controlled harness after gates. A production web rollout, full chat persistence or general platform is not required to prove this block and is not included. The actual web end-to-end product remains a later plan gate.

**Excluded prerequisites:** creating/requalifying the snapshot and its isolation/retention; reconstructing golden/oracles or held-out; account/credential/procurement changes; resolving database privilege redesign; supplier agreements; production deployment; legacy repair; applications/other domains; full M3/M4 framework; pilot/capture rollout. Those remain separately owned/estimated. If any excluded prerequisite becomes necessary, stop that part rather than spending this budget on hidden setup.

### Proposed campaign ceiling, not an approved case selection

- Freeze all eligible **development** labor scenarios and scripted turns, including clarification/continuation inputs, grouped by family/conversation. The proposed envelope holds at most **12 evaluated turns across that whole set per configuration/repetition**, 3 predetermined repetitions and 2 configurations (Luna without reasoning and all-Sol ceiling): **at most 72 evaluated-turn attempts**. An attempt is one incoming user turn through planning/execution/composition, not an entire multi-turn conversation. Every clarification reply, continuation or model-generated setup turn counts separately; repeated context counts in input tokens. The inventory's historical 11 cases does not establish a turn count. M1/evaluator must determine the actual set and total turns; if it needs more than 12, revise the envelope before running instead of excluding long/difficult cases.
- Maximum 3 model calls per attempt: planner, composer, and one optional recomposition. No unbudgeted retry or automatic legacy fallback. Total at most **216 model calls**. The 3-hour correction allocation is local/synthetic and precedes the frozen provider campaign. The 72-attempt ceiling covers one complete fixed campaign, not a provider-informed repair/rerun. If a provider result leads to code/config changes, preserve the first campaign, re-freeze the full comparable set/configurations, and obtain a revised envelope before any new provider call. Unused attempts are not permission for opportunistic case selection. Report every frozen version separately; never combine favorable pre/post runs.
- Proposed cumulative budget per attempt: 18,000 input tokens and 6,000 billed output tokens **including reasoning where billed** across all its calls; aggregate ceilings **1,296,000 input** and **432,000 output** tokens. E2-06 must verify enforceable token accounting/limits and the lowest supported Sol reasoning setting before approval. If billed reasoning cannot be bounded/accounted for, no provider run starts under this envelope.
- Both configurations use the same questions, authorized scope, frozen data/references, clock/date rules and limits. Report all-Sol as a separate ceiling, not as a replacement for a failed Luna result. This campaign does not expose or use held-out scenarios.

**Money is deliberately not invented.** At 36 attempts/configuration the token maxima are 0.648 million input and 0.216 million output per configuration. With verified worst-applicable USD-per-million rates `L_in`, `S_in`, `L_out`, `S_out` (including reasoning charging), model upper bound is:

```text
0.648 × (L_in + S_in) + 0.216 × (L_out + S_out)
```

Add verified infrastructure charges and any separately billed item; do not assume cached-token savings or free infrastructure. An explicit approved USD cap and trustworthy accounting are required before execution. E2-06 supplies current account-specific rates/limits; this session neither queries billing nor promises a dollar total. Spending/time reached → stop, preserve evidence, request a revised block if warranted; do not omit expensive failures.

### Preconditions, stop rules and exit

Start the 24 active-engineering-hour implementation block only after M2 scope/budget/interface decisions, route decision, accepted owners, M1/E2-18 authorized isolated snapshot with retention verified, E2-06 exact project/data settings/rates/cap and the read-boundary/security test plan are resolved. The snapshot remains blocked today. Waiting on these gates is not counted as implementation progress; it does not authorize a workaround.

An approved security plan alone does not establish access safety. Before the first private snapshot read or call carrying snapshot data, effective positive/negative tests must pass on an authorized synthetic target using the same pinned security configuration: user identity, active role, owner/scope, allowed rows/columns/tables, no writes and transaction-time revocation. Record target/config equivalence and the independent preflight review; if equivalence is unproven, stay blocked. This memo authorizes no target provisioning or grant changes. Native boundary tests and their execution are in the 5-hour boundary allocation; any permission redesign is an excluded prerequisite.

Before the first run, evaluator freezes denominator, references, configurations, cutoff values, stage scoring and the recorded v295 case mapping. Compare against recorded v295 outputs on the same cases, with independent snapshot/reference alignment; if that alignment is inconclusive, do not claim superiority. No automatic rerun of the frozen legacy engine or causal diagnosis is included.

Proposed exit follows v0.3: new labor core strictly improves over the recorded v295 baseline on the comparable cases; operation/argument selection is at least 80%; no observed critical safety/access/integrity failure; report partial/blocked/unrun attempts in the fixed answerable denominator and guards separately; report both model configurations, latency, cost, limits and remaining risks. Confirm cutoff values before starting. The 90% phase-1 acceptance target is not substituted for this M2.5 gate.

If quality is below baseline, selection below 80%, comparability unresolved, any critical failure observed, or hours/spend exhausted, stop expansion and present evidence/options. Sol-only success or green mechanism tests alone do not unlock M3. Ordinary safe functional failures remain recorded; safety or uncertain execution stops the affected action. No production rollout or Telegram change occurs in this block.

## Approval record to complete in coordination

1. Five technical recommendations: approved / revised / deferred, with the exact revision.
2. Data route and E2-17 scoped closure: explicit decision and security reviewer.
3. 24 engineering + 8 evaluator + up to 2 Santiago hours: accepted/revised allocations and confirmed owners.
4. Frozen case/configuration/attempt/token envelope, cutoff values, Sol effort and approved USD cap with E2-06 source.
5. M1/E2-18 snapshot isolation/retention and reference/v295-comparability evidence; no held-out exposure.

Until those entries and prerequisites are complete, retain this as a proposal. Continue independently authorized synthetic preparation only; no implementation, integration or new authorization is inferred from writing or reviewing the memo.

## Preparation verification

Separate read-only reviewer `/root/review_b_boundary` checked v0.3 alignment, budget arithmetic and implied-authorization risks. The review prompted explicit turn accounting, a pre-freeze-only local correction allocation, effective security tests before private data, and effort credit to avoid double budgeting. After those clarifications the reviewer confirmed bounded coherence, correct arithmetic and no implied M2 decision/permission. Whitespace checks passed. This reviews the proposal's consistency, not the feasibility or acceptance of unbuilt product behavior.
