# E2-17 — comparison protocol v0.1

Prepared 2026-11-03 against master plan v0.3. Status: protocol ready for review; provider experiment **not executed**; route selection open. This document does not relax the production ban on model-generated SQL.

## Stage 0: route A eligibility before A fixtures

Candidate: Composio **Platform SDK/API**, integrated in Esco, `SUPABASE_RUN_READ_ONLY_QUERY`. Do not substitute a personal connector or assume a Composio `user_id` represents a Supabase Auth subject.

Public evidence checked 2026-11-03:

- [Composio Supabase toolkit](https://docs.composio.dev/toolkits/supabase) lists the candidate. The initial fetched rendering omitted it; a refreshed rendering/search confirmed it. Catalog presence is not proof of its effective contract or permissions.
- [Composio session configuration](https://docs.composio.dev/docs/configuring-sessions) permits tool restrictions. These restrict exposed tools, and do not establish Supabase row identity or table grants.
- [Supabase read-only Management endpoint](https://supabase.com/docs/reference/api/v1-read-only-query) documents a project query under `supabase_read_only_user`, with query/parameters and management permission. It does not document forwarding an end-user JWT for RLS. Mapping the candidate to this endpoint is an inference until its actual versioned definition is inspected.
- [Supabase JWT](https://supabase.com/docs/guides/auth/jwts) and [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) explain the user-token/database-policy boundary. Read-only management access cannot be assumed equivalent.

| Exclusion requirement | Evidence available now | Disposition |
| --- | --- | --- |
| Caller Supabase JWT determines actual `auth.uid()` and effective RLS | No versioned candidate input/transport contract or execution trace obtained | **Unproven — do not execute A** |
| Closed allowed tables/columns independent of model | Tool-level allowlisting documented; no candidate table policy established | **Unproven — do not execute A** |
| No mutations/side effects, bounded rows/time | Tool name/read-only endpoint are insufficient for effective limits and callable functions | Pending actual contract/security test |
| Only disposable synthetic target and approved destination | No target/account created or connected | Deliberately not provisioned |

This is an **evidence/access blocker**, not a demonstrated capability failure. Do not mark E2-17 complete, choose B, or create A fixtures on this basis. Obtain the exact candidate schema, toolkit/SDK version, auth type and upstream URL from approved public metadata/vendor documentation or an authorized tool-definition read without creating an account/credential. If the contract demonstrably cannot bind JWT/RLS and closed tables externally, document that incapacity, stop A, obtain the security review and present B for explicit architecture decision under v0.3 D16. If evidence remains unavailable, keep the blocker open. Prompt rules, regex SQL filters, a trusted model, or manually injecting claims into arbitrary SQL do not compensate.

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

Current remaining action: coordinator resolves authorized candidate-contract metadata and decides whether additional vendor evidence is available. No provider run, credential request, persistent access or private-data transmission was attempted. Continue B design while this remains pending.
