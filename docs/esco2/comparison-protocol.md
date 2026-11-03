# E2-17 — comparison protocol v0.2

Prepared 2026-11-03 against master plan v0.3. Status: standard route A **ineligible by documented contract**, for independent security/closure review; provider experiment **not executed**. Continue direct route B preparation under v0.3 D16; architecture acceptance and activation remain gated. This document does not relax the production ban on model-generated SQL.

## Stage 0: route A eligibility before A fixtures

Candidate: Composio **Platform SDK/API**, integrated in Esco, `SUPABASE_RUN_READ_ONLY_QUERY`. Do not substitute a personal connector or assume a Composio `user_id` represents a Supabase Auth subject.

Public evidence checked 2026-11-03:

- [Composio Supabase toolkit](https://docs.composio.dev/toolkits/supabase) lists the candidate. The initial fetched rendering omitted it; a refreshed rendering/search confirmed it. Catalog presence is not proof of its effective contract or permissions.
- [Composio session configuration](https://docs.composio.dev/docs/configuring-sessions) permits tool restrictions. These restrict exposed tools, and do not establish Supabase row identity or table grants.
- Coordination supplied an independent E2-17 finding: the standard candidate executes as `supabase_read_only_user`, without caller JWT or table-allowlist parameters. This updates the earlier unproven eligibility status. No project-specific runtime result is asserted.
- [Supabase read-only Management endpoint](https://supabase.com/docs/reference/api/v1-read-only-query), independently re-read here, documents execution under that role with query/parameters and management permission. It does not offer end-user JWT/RLS or a table allowlist in its request contract.
- [Official Supabase initial schema, pinned commit ff09b101523c6479f37fe1e0d02c5f7e3845104c](https://github.com/supabase/postgres/blob/ff09b101523c6479f37fe1e0d02c5f7e3845104c/migrations/db/init-scripts/00000000000000-initial-schema.sql#L20-L22), independently re-read here, creates `supabase_read_only_user` with `BYPASSRLS` and grants `pg_read_all_data`. These defaults contradict the required user RLS/table boundary. This source is a pinned default definition, not an attestation of a concrete project's live grants.
- [Supabase JWT](https://supabase.com/docs/guides/auth/jwts) and [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) explain the user-token/database-policy boundary. Read-only management access cannot be assumed equivalent.

| Exclusion requirement | Evidence available now | Disposition |
| --- | --- | --- |
| Caller Supabase JWT determines actual `auth.uid()` and effective RLS | Standard tool uses management read-only role; no JWT parameter; official role has BYPASSRLS | **Fails for standard tool — stop A** |
| Closed allowed tables/columns independent of model | No table-allowlist parameter; default role has pg_read_all_data; session tool allowlist is not a table boundary | **Fails for standard tool — stop A** |
| No mutations/side effects, bounded rows/time | No provider execution; these other controls were not tested because exclusion already applies | Not evaluated; cannot rescue eligibility |
| Only disposable synthetic target and approved destination | No target/account created or connected | Deliberately not provisioned |

Conclusion: **the standard SUPABASE_RUN_READ_ONLY_QUERY tool fails both v0.3 exclusion requirements**. Stop route A before fixtures/provider runs and document incapacity under D16. Continue B preparation; place E2-17 in review for independent security confirmation and explicit architecture decision rather than claiming a measured comparison or acceptance. No quality, latency or price result was obtained for A. This conclusion is scoped to the standard tool/contract. It neither inspects a concrete project nor proves that all possible custom Composio gateways are incapable; a custom gateway would be a new design with adaptation cost and its own gates. Do not create one to compensate within this experiment. Prompt rules, regex SQL filters, a trusted model, or manually injecting claims into arbitrary SQL do not compensate.

If eligible by contract, test against a newly authorized disposable synthetic project only. Never attach the production project, service-role secret, real snapshot, private golden, existing reserved 12 cases or held-out. No account, permission, grant or persistent access is created by this protocol.

## Controlled equivalence

Route B proposal: request-scoped Supabase Data API with caller JWT/RLS, registry-fixed projections and deterministic calculations; a minimal reviewed aggregate RPC only where required. No arbitrary SQL interface in product. Route A may use reference SQL/generated SQL only within the isolated experiment. Document every extra view, RPC, adapter and permission difference. A SQL endpoint and an RPC are not equivalent merely because their final numbers match.

Freeze after eligibility and authorization, before first attempt: synthetic schema/data hash, independent SQL/oracle revision, registry/adapters hash, SDK/tool version, prompts/model/effort, date clock/timezone, input limits, prices, network region, concurrency, repetitions, random ordering seed and approved hard spend cap. The cap is a required manifest field with no executable default; proposed per-turn limits appear in architecture.md. Both routes share questions/context, model, token limits and total attempt budget.

Development matrix proposal: 12 scenario families, each 3 predetermined repetitions per route (36 attempts per route at each model stage). All repetitions and timeouts persist. Families: simple labor sum; per-lot/null reconciliation; historical cost/missing cost; interval boundaries; application status/actual dates; products/units; plan versus execution; FK cross-domain cost; multiple parts; temporal follow-up/entity change; ambiguity with scripted clarification; empty/partial/truncated source. Freeze exact inputs only after independent reference review. Do not prepare A fixture/adapters while eligibility remains unproven.

Custodian independently creates a new synthetic reserve by scenario family/conversation, outside this branch. Implementation receives no reserve questions, answers or label hashes that reveal content. Custodian checks separation, runs reserve after freeze and reports aggregate/per-ID scores without disclosing content. Existing 12 reserved cases stay sealed. This comparison reserve does not substitute M6's product held-out or M1 snapshot evaluation.

## Stages and fail-closed gates

1. **Contract review**: prove identity and closed tables; record evidence/uncertainty. Stop A here if unproven.
2. **Effective security** on approved disposable target: users Gerencia A, Gerencia B (different scope), inactive/downgraded/other-role/anonymous/expired JWT. Verify current user/role, disjoint row visibility, forbidden columns/table/schema denial, altered token, denied mutations/DDL/side-effect functions, row/time limits and permission revocation mid-session. Include direct SDK execution and discovery/proxy bypass attempts. A custom wrapper counts as adaptation, and must enforce the controls even if the model ignores it. Never treat model refusal as a permission test.
3. **Access only**: reference SQL for A and equivalent fixed operations for B without model. Independent oracle checks values, units, populations, null groups and coverage; record transport/permission/unsupported differences.
4. **Real planning and response**: actual identical question/context through real OpenAI planning, validation, data access, deterministic calculation and composition. Programmed tool calls do not count. Record interpretation, validation, SQL/access, transport, calculation, evidence and response failures separately. Same routing rule for both routes; evaluate all-Sol quality/cost ceiling separately, without mixing denominator.
5. **Review**: safety first, then quality/coverage/cost/maintenance. Any critical observed leak/mutation/integrity regression stops affected activity, preserves minimized evidence and invokes the authorized response procedure. Ordinary safe functional failure remains in the campaign denominator. Do not patch midway; new config/code creates a new frozen run and reruns both routes.

## Scoring and record

Before running, an independent reviewer freezes answerable IDs and separate guard/clarification IDs. Success requires correct numbers, period, population, unit, every requested answerable part and qualified coverage. Partial counts as failure for complete/correct metric. Answerable product-blocked or unexecuted attempts remain failures; provider access limitation is additionally marked blocked, not mislabeled a functional observation. Oracle defects require independent correction applied to both routes and versioned rerun.

Proposed attempt record (synthetic/minimized only):

```json
{"runId":"synthetic-run","route":"A|B","stage":"access|planner|web","scenarioId":"dev-01","repetition":1,"attempt":1,"manifestHash":"pending","status":"not_run","failureStage":null,"completeCorrect":null,"guardCorrect":null,"latencyMs":{"total":null,"plan":null,"access":null,"compose":null},"usage":{"inputTokens":null,"outputTokens":null,"reasoningTokens":null,"connectorCharges":null,"infrastructureCharges":null},"securityResult":"not_verified","adaptations":[]}
```

Persist schema, timestamps, request/response hashes and synthetic traces for every attempt, including retries; never store access tokens. Metrics: correct/complete count over fixed answerable denominator, exact access agreement, operation coverage, guard precision separately, p50/p95 end-to-end and per-stage latency, timeouts, attempts and unsupported cases. Report sample size and uncertainty; this small comparison is not a phase-1 accuracy claim.

Cost per accepted answer = (all model token charges + connector charges + allocated infrastructure charges for ALL attempts) / complete-correct answers. Report undefined if no accepted answers. Report setup/adaptation hours and recurring maintenance separately, including RPCs, schema updates, vendor versions, identity plumbing and diagnostics. No assumed Composio price or savings. Archive current pricing source and billing assumptions before run.

## Required closing package

Versioned manifest/protocol, effective security evidence, results for both routes OR proven inability of one, independent reference/review signoff, total cost and maintenance comparison, limits and recommendation, then Santiago's explicit route decision. If A is ineligible, document the failed requirement and external evidence; do not fabricate A quality/latency/cost scores. If blocked, give the exact missing evidence/action and retain open status. Neither a catalog listing nor this local design closes E2-17.

Current remaining action: independent security review of documented standard-tool incapacity, review of B's contracts/proposed permissions and explicit architecture decision. Reconcile B with M1 and E2-06 before M2.5. No provider run, credential request, persistent access or private-data transmission was attempted. Earlier v0.1 evidence blocker is superseded by the independent standard-tool finding and official role definition; the historical tracker entries remain as history.
