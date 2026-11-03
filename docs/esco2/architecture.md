# E2-03 — proposed architecture and bounded review budget

## Outcome and gate

Design a web-only, Gerencia-only query function with a single operation registry. Prepare route B while E2-17 remains open. No deployed endpoint, SQL migration, secret or frontend change is part of this delivery.

The runtime will have one path: authenticated request → current access and conversation ownership → Luna plan proposal → deterministic validation/resolution → bounded reads/calculations → evidence per requested part → composition/number check → structured context.

## Isolation

Proposed source: `supabase/functions/esco-consultas-v2/`, one tree. It must not import `chat.tsx`, `telegram/bot.ts`, legacy dispatchers or their bootstraps. The web client calls only this function after the pilot gate. Telegram must never import the new kernel in phase 1. Until M7, keep the existing web and Telegram query paths frozen.

Verified repository facts at baseline:

- `src/supabase/functions/server/telegram/bot.ts:42` imports the old chat loop. Changing its import graph can affect capture.
- `supabase/config.toml` currently declares only `make-server-1ccce916`, with `verify_jwt=false` for existing webhook/cron behavior.
- The current drift workflow covers that function only. Its checker treats JWT verification enabled and anonymous health other than 200 as failures. Merely adding a new slug to its matrix would therefore be wrong.

Future implementation must add a per-function expectation: legacy retains false/anonymous 200; the query function explicitly declares `verify_jwt=true`, with authenticated readiness and anonymous denial checked separately. Verify current Supabase signing-key/gateway compatibility before deployment; gateway configuration never replaces server token verification. Add source path, independent deployment receipt and hash/clock state for the new function. Do not edit legacy runtime or global JWT expectations to accommodate it.

Without `OPENAI_API_KEY`, readiness/request returns 503 and no model/data operation runs. No OpenRouter fallback. A provider error never falls back to the old engine. Deployment and rollback select the query slug alone. M7 separately disables the old query handlers while preserving OCR, confirmation, editing, cancellation, inventory rounds and milk capture.

## Trust and permission contracts

| Boundary | Trusted input | Required behavior |
| --- | --- | --- |
| HTTP | verified Supabase token | Validate signature/issuer/audience/expiry with supported Auth/JWKS method. Reject absent/invalid token before context/catalog/model access. |
| Actor | current server/database profile | Require active Gerencia on every turn and recheck before every operation. Client role, token user metadata and conversation prose cannot grant access. |
| Conversation | server record keyed by verified subject | Prove owner and compatible context version before reading messages/catalog/context. Unknown/foreign IDs return safe denial; no content leak. Recheck ownership on context persistence. |
| Operation | registry-valid plan and trusted actor | Bind scope from authorization, not model arguments. Reject arbitrary table, projection, SQL, URL, identity or role arguments. |
| Data | user JWT with effective RLS | New request-scoped Data API client with public key and caller Authorization; never service role for business reads. No shared mutable client headers or cached permissions. |
| Output | deterministic evidence | Model receives approved aggregates/minimized facts. No worker identities, salary fields, raw personal notes or unbounded rows. |

RLS is necessary but not sufficient: existing user tokens can have broader ERP permissions. The server operation map fixes tables, columns, joins and read-only methods, with no generic proxy route. If a minimal-column aggregate requires reading individual wage rows or a restricted table, use a reviewed aggregate RPC/view design. Do not send these rows to the model. Any database grant/RPC addition needs its own review and authorization; this handoff creates none.

A future RPC should use invoker permissions when possible, fixed `search_path`, no dynamic SQL, no caller-supplied actor, and explicit authorization in its transaction. Security-definer use requires separate proof of row/column restrictions. Data API/RPC do not mean SQL-management identity. RLS, read-only privileges and output projection must all pass negative tests.

## One operation definition

`analysis/esco2-design/operations.json` is a design probe for `labores.resumen.v1`. Its `parameters` schema is both the model's argument schema and the execution validator's schema. A future model adapter must use that exact schema/version; it must not maintain a second argument allowlist. Freeze and hash registry version with each evaluation run.

The executor separately validates cross-field semantics: valid calendar dates, start ≤ end, bounded span, unique resolved entity IDs and permitted scope. These rules restrict the advertised schema explicitly; do not silently invent narrower enums. Resolution accepts catalog IDs only after authorization; ambiguous names produce clarification, never the first match.

Proposed envelope:

```ts
type Plan = { version: 1; parts: Array<{
  partId: string; operation: string; arguments: unknown;
}> };
type Result = {
  version: 1; partId: string; operationVersion: string;
  state: 'complete' | 'partial' | 'no_records' | 'clarification_required'
       | 'out_of_scope' | 'access_denied' | 'technical_error';
  scope: { entityIds: string[]; period: { from: string; to: string;
    timezone: string; dateMeaning: string }; populationId: string };
  facts: Array<{ id: string; value: string | null; unit: string;
    sourceFields: string[]; derivation: string; groupId: string | null }>;
  coverage: { rowsRead: number; expectedRows: number | null;
    populationComplete: boolean; missingByMetric: Record<string, number>;
    truncated: boolean };
  provenance: { source: string; capturedAt: string; registryHash: string };
  issues: Array<{ code: string; partId: string }>;
};
```

A trusted actor/conversation capability stays outside model-visible Plan/Result. Unknown versions, duplicate part IDs and operation/schema mismatches reject before reading. Each requested part retains a result, including unavailable parts. Technical errors cannot masquerade as no records. A bounded empty read is `no_records`; it never proves zero physical activity. Missing numeric fields produce a verified subtotal plus missing count, never a complete total.

## Initial operation inventory (proposed, not accepted coverage)

| Operation | Grain/date and minimized source | Calculation/semantics |
| --- | --- | --- |
| `labores.resumen.v1` | one `registros_trabajo.id`; `fecha_trabajo`, `lote_id`, `tarea_id`, `fraccion_jornal`, `costo_jornal`; authorized lot catalog | Sum registered fractions and historical costs separately. Group null lot as unassigned; reconcile groups to total; duplicate identity is error. No current salary lookup. |
| `labores.estado.v1` | one task; qualified `tareas` dates/status/identity | Distinguish actual from planned dates; no execution inference from status. |
| `aplicaciones.fechas.v1` | one application; qualified `aplicaciones` planned/actual dates and status | Selection basis is explicit, closed status does not prove quality/completion of all work. |
| `aplicaciones.consumos.v1` | one recorded product movement; `movimientos_diarios` → `movimientos_diarios_productos` by FK; qualified product unit | Sum per product AND unit; separate planned and executed populations; no unit conversion without approved rule. |
| `aplicaciones.trabajo.v1` | application→task→labor relationship only if qualified against M1 | No text join or many-to-many multiplication. Missing relationship is unsupported/partial, not allocated cost. |

These table/column mappings are candidate repository mappings, not a current catalog attestation. M1 must confirm them before a reader becomes executable. Qualify pure calculation/date helpers independently before reuse. Do not import the old orchestration to reuse a helper. Remaining phase-1 domains get operations only after M2.5/M3: monitoring and conductivity, observed climate, dairy record identity and existing reproductive engine, milk weights and linked fortnight liters without money.

Independent inventory handoff received from coordination, anchored to `main` `43c3e887` (this local worktree remains at baseline `a635a05`). These are qualification candidates, not acceptance or demonstrated causes of v295. Reconcile against the intended integration commit before reuse:

- Labor reader rejects null lot IDs: a replacement must explicitly preserve and reconcile unassigned groups. Do not qualify the existing reader based on its test count.
- `application.cost` represents labor cost. Input cost in application closure is per product/application; lot attribution is unproven. Use explicit metric names and do not distribute product costs by lot without an approved source/rule.
- Monitoring must distinguish no observation from zero incidence. Soil conductivity color criteria conflict between Esco and UI; agree one definition/version before exposing a derived classification.
- The verified climate contract covers rain only. Temperature, humidity and other observed variables require separate qualification; their PRD inclusion is not evidence of reader coverage.
- Fortnight dairy liters exist in a legacy reader but the operation is marked unsupported. The current DTO includes money. Qualify a minimal liters-only projection through the linked income record; never pass the financial DTO to the model.

This handoff authorizes no legacy repair, production inspection or widening of query scope. Remaining domains do not become implementation fronts before their plan gates.

## Context, time and limits

Structured context version 1 contains resolved entity references, effective period/date basis, completed part IDs and evidence references. Bind it to actor and conversation. Expired, foreign or incompatible context cannot become authority. Explicit entity/period changes replace the relevant prior filters; a new turn re-resolves access and stale references.

Propose `America/Bogota` as operational zone, subject to date-contract approval. Resolve relative periods once against an injected clock; date-only business ranges are inclusive. Timestamp reads use local midnight converted to an exclusive next-day boundary. Planned/start/end/work dates are different fields. No hidden UTC `toISOString().slice(0,10)` definition of today.

Provisional limits for review, **not measured promises**: 8 parts/turn; 2 planning rounds (initial plus one clarification/replan), at most one Luna→Sol escalation; 20 seconds total, 5 seconds/read; 2,000 rows/page, 20,000 rows/operation, 256 KiB structured model input. Abort at server AND database/transport bounds. Fetching one extra row or a completion cursor must prove truncation. Never call a truncated result complete. No silent retry on access denial, empty data, safety failure or uncertain execution. All attempts count toward cost. These values require calibration and approval before provider evaluation.

Route selection starts deterministically from the validated plan: multiple parts, multiple domains or entity change qualifies for Sol; a harder model never gains scope. Model IDs/effort/limits have one configuration source. E2-06 must verify actual project availability and treatment settings before use. Number guard checks every numeric assertion against structured facts (qualify `escoEvals/numeros.ts` first); recompose once, then partial response. Render tables from facts, not model prose.

## Verification required before integration

| Layer | Positive | Negative / discriminating check |
| --- | --- | --- |
| Registry | model schema and validator consume same object | Inject unknown argument/operation; change one schema enum and prove both surfaces change. |
| Access | active owner Gerencia | missing/expired/wrong issuer token; inactive/downgraded user; foreign conversation; revoked permission between operations; parallel actors cannot share headers/context. |
| Data | same authorized population through actual JWT/RLS | forbidden row/column/table; DML and side-effect RPC; service-role accidentally configured; response truncation; query timeout. |
| Labor | per-lot totals include null group | Duplicate IDs, missing costs, empty population, boundary dates and fan-out join. Remove null handling and require a failing case. |
| Applications | units and actual/plan separation | Mixed units, same name/different identity, missing FK, closed without execution evidence. |
| Planner | real question chooses operation/arguments | Programmed tool calls are mechanism tests only. No planner pass claim without real provider call. |
| Web | actual authenticated endpoint to rendered answer | call service directly as other role; extra requested part unanswered; forged context; missing OpenAI secret gives 503. |
| Isolation | independent query bootstrap and rollback | dependency graph contains no Telegram/legacy boot import; capture confirm/edit/cancel/OCR/milk regressions in controlled environment. |

Minimal telemetry: run/turn/part ID, registry/model/config version, operation, route reason, stage, safe error code, elapsed time, counts, token/cost totals and truncation. Do not log prompts, tokens, private rows or conversation payload by default. Retention, sink and access owner remain a gate in E2-06/E2-13; do not create persistent telemetry now.

## Review effort and sequencing

These are preliminary engineering estimates, not commitments or approved spend. Each row owns a distinct deliverable; evaluation ownership stays independent.

| Block / owner to confirm | Engineering hours | Santiago review hours | Exit |
| --- | --- | --- | --- |
| E2-03 + E2-17 design / Codex | 8–14 | 1–2 | interfaces, eligibility evidence, protocol and assumptions review |
| E2-17 execution / designated executor after authorization | 8–20 if eligible; 2–4 for documented failure review | 0.5–1 | complete results or incapacity; explicit route decision |
| E2-19 M2.5 / integrator | 16–28 | 1–2 | single labor family beats recorded v295 cases; ≥80% selection; time box agreed before start |
| E2-04/05/06 M3 / integrator, access/provider owners | 24–40 | 1–2 | common registry, authenticated isolated endpoint, authorized model/config |
| E2-08/09 M4 / domain owners, ≤2 implementation fronts total | 32–56 | 2–3 | labor/application tasks and context through real web flow |
| E2-07/13 independent verification | 16–28 | 1–2 | separate security/functional evidence, capture regressions |

M1 snapshot/reference creation, new held-out authoring, M5–M7 and infrastructure/provider spend are excluded and must not be buried in these hours. Total before those exclusions: 104–186 engineering hours if A is eligible, or 98–170 with documented failure review; Santiago review 6.5–12 hours. Reestimate M3/M4 after E2-17/M2.5. No calendar deadline for E2-17. No dollar estimate without rates, current provider terms and authorized usage caps. Cost comparison formula lives in the protocol.

Next: independent review of design; reconcile M1 map/references; resolve A eligibility; approve concrete M2 block, provider/data gates and M2.5 time box. Neither this estimate nor local probes close M2.
