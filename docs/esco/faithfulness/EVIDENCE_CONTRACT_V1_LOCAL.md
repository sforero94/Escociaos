# Evidence contract v1 — local interface proposal

Status: parent review required before implementation. Documentation only. Base: actual main `76f9b77686248f48bee263ee2c53f90c62e46563`, tree `2394495021a290b7f87fad255276982d73b70350`. No operational action, new data access or release is proposed by this document. R18 remains a separate reusable local candidate, not an independent release.

## Goal and boundary

Preserve source identity, value, unit, denominator, period and meaning through retrieval, calculation, context and the final answer. Answer verified parts of mixed requests; state the exact unresolved part instead of refusing everything or completing it with invented facts. This is a small protocol for existing evidence-backed operations, not unrestricted natural-language truth verification, a new query service or arbitrary formula execution.

The operation is shared; fincas are locations, not security tenants. Existing access rules remain authoritative. Service-role reads do not inherit caller RLS. No new policy, permission, credential, endpoint, model or external recipient is needed for this interface.

## Authoritative inputs

1. Existing channel gates establish the actor before the loop. The actor/channel context is server-only and never supplied by model arguments or user text.
2. A resolved request has independently answerable parts. Each part specifies a supported operation and canonical selectors. The model may propose a plan; it cannot attest identity, authorization, completeness, date precedence or factual truth. Server validation binds the proposal to actual user intent and supported source contracts. Ambiguous selectors clarify only the affected part.
3. Scope has a business date reference from the existing Bogotá clock, explicit date boundaries, date-field meaning, canonical identity IDs and applicable location filters. Actual/planned comparison uses two explicit bases; a planned date cannot fill a missing actual date. Conflicting periods are not silently widened, swapped or clamped.
4. Current-turn validated reads create evidence. Persisted prose, model IDs and saved truncated summaries cannot create evidence. Reuse of the existing application cohort receipt retains all binding, expiry, exact-membership and current-access checks; no generic new receipt storage is introduced.

## Proposed minimal shape (normative semantics; names pending freeze)

```ts
type CoverageState = 'complete' | 'partial' | 'unknown';
type Origin = 'recorded' | 'planned' | 'derived';
type Value =
  | { kind: 'decimal'; value: string; unit: string; denominator?: string }
  | { kind: 'date'; value: string }
  | { kind: 'status'; value: string }
  | { kind: 'unknown'; reason: string };

interface Scope {
  id: string;                    // server-local identifier, not an authorization token
  operation: string;             // registered operation, not free SQL/code
  entities: Array<{ kind: string; id: string; label: string }>;
  period: null | {
    from: string; to: string; referenceDay: string;
    clock: 'America/Bogota'; basis: 'actual' | 'planned' | 'observation' | 'recorded_at';
    fieldMeaning: string;        // allowlisted definition, not inferred from a date label
  };
  // Location IDs and other permitted filters are validated by the domain adapter.
  filters: Record<string, string | string[]>;
}
interface Coverage {
  populationId: string;          // particular queried universe, not one global completeness flag
  population: CoverageState; values: CoverageState;
  rowsRead: number; expectedRows: number | null; missingValues: number;
  identityUnique: boolean;
  consistency: 'single_read' | 'stable_count_pages' | 'not_attested';
  reasons: string[];             // bounded fixed codes, no raw errors/data
}
interface Fact {
  id: string; scopeId: string; metric: string; definitionId: string;
  entities: Array<{ kind: string; id: string }>;
  value: Value; origin: Origin; coverage: Coverage;
  source: { tool: string; field: string; capturedAt: string };
  assertion: 'record_value' | 'scoped_total' | 'verified_subtotal'
    | 'record_count' | 'bounded_empty' | 'derived_measure';
  derivation?: {
    operation: string;
    inputs: Array<{ factId: string } | { populationId: string; field: string }>;
  };
}
interface Evidence {
  version: 1; state: 'ok' | 'partial' | 'error';
  scopes: Scope[]; facts: Fact[];
  issues: Array<{ partId: string; code: string }>;
}
interface AnswerPart {
  partId: string;
  state: 'answered' | 'partial' | 'clarify' | 'unavailable' | 'unsupported';
  factIds: string[]; issueCode?: string;
}
```

This shape is internal. It is not a new public API, credential format or permissive bag of model-authored facts. Builders/validators own allowlists of operations, metric definitions, units, field meanings and issue codes. A fact must refer to an existing scope, population and consistent entity IDs. Derived facts must refer to validated facts or a validated population field and a registered bounded operation; no eval, scripting or arbitrary formula string. Source hashes alone do not establish truth or provenance.

Supported coverage is defined by validated structured operations and source contracts, not a list of natural-language regex phrases. Resolution validates explicit selectors and temporal constraints against current user text or validated prior user context; a model's proposal cannot authorize its own entity, range or definition. Natural-language interpretation is still an end-to-end risk to test, not a universal deterministic guarantee. Existing phrase recognizers may assist parsing but cannot independently attest that an operation is supported, complete or correctly scoped.

The adapter may calculate from many fetched rows internally without exposing every source row to the model. Derived aggregate provenance names the validated population/field and registered calculation; do not fabricate thousands of input facts solely to fit this shape. A sum of recorded costs is derived from recorded inputs, not a salary estimate: retain that origin chain and the metric definition in its label. Planned inputs never become actual inputs through arithmetic. Labels are presentation only and must be bounded and rendered literally. Canonical IDs preserve distinctions when labels collide.

Adapter boundary: a validated request part plus an integrator-injected read port yields `Evidence`. The read port exposes existing allowlisted tables/projections/filters and page/count metadata, never credentials or model-authored SQL. Domain workers supply deterministic query specifications and transformations; the integrator binds them to existing callers and validates page attestations. A domain adapter cannot attest its own access rights or invent count metadata. This port wraps current reads; it is not a new service or source permission.

## Required invariants

- **Known versus zero:** `unknown` is not numeric zero. Zero is known only from a valid recorded zero, verified empty population under exact filters, or a valid bounded derivation. Empty results do not prove absence of physical activity, money collection or receipt of goods.
- **Coverage is metric- and population-specific:** complete aggregate coverage does not imply complete raw detail, every animal/product, every calendar day, all transactions or physical capture. Each fact binds its population and value coverage separately. Different metrics may have different scopes and denominators. A subtotal remains explicitly a subtotal even when another metric is complete.
- **Reading:** strict count/range validation plus deterministic unique ordering is required for complete paginated population claims. Missing/changing counts, shortened pages, duplicate IDs across pages, inconsistent identities and cap exhaustion prevent complete totals. No attestation promises a database snapshot; equal-count concurrent replacements remain a limitation unless the source already provides stronger consistency.
- **Calendar:** rainfall coverage compares expected dates for the selected station/universe against observed dates, not only rows carrying a bad-data flag. Missing days remain unknown. A day with no row is not a dry day.
- **Calculations:** use recorded `costo_jornal` once, never current salary times historical journals; preserve decimal values without truncation. Aggregate only compatible identities/units/periods. Averages, totals and rates have explicit denominators. A ratio is not a weighted average unless the operation defines it. Missing inputs cannot be filled from a plan or global average.
- **Meaning:** planned, recorded and derived values remain distinguishable in the answer. Closed status does not imply satisfactory physical execution. An invoice, forecast or candidate match does not prove payment, physical receipt, field condition or cause. Only supported registered statements may be rendered; no generic causal or physical-success assertion is authorized by this contract.
- **Budgets:** adapters preserve essential aggregates/identities/coverage before optional detail. Any omitted detail is marked. Existing milk budget stays intact. Each adapter must declare a finite evidence/output cap before activation; no silent provider-bound dump or truncation followed by a completeness claim.

Assertion eligibility is integrator-owned and defaults to unavailable when a required property is unknown:

| Assertion | Minimum eligible evidence |
| --- | --- |
| record_value | known valid field, canonical subject and defined record scope; cannot imply a whole population |
| scoped_total | complete target population and values, unique identities, compatible units/bases/periods and registered calculation |
| verified_subtotal | validated values over an explicitly labelled subset; never substituted for scoped_total |
| record_count | complete unique population and verified count; missing monetary values do not invalidate an otherwise complete record count |
| bounded_empty | verified complete zero count under the exact scope; no physical/global absence inference |
| derived_measure | known validated inputs plus registered operation/definition and compatible units/denominator/scopes; cross-basis comparisons only when the operation explicitly defines both bases |

Initial population/field registration is bounded to existing sources: work records (`id`, `lote_id`, `fecha_trabajo`, `fraccion_jornal`, `costo_jornal`); selected application facts and their existing movement/task identities; active product records (`id`, catalog unit, `cantidad_actual`, `stock_minimo`); station/day climate observations and existing quality rules; the existing validated milk summaries and measurement definitions. These do not authorize additional source fields. Root validators register the concrete definition IDs before adapters run. Domain workers cannot self-register a new fact definition by sending arbitrary strings. Any unknown field/definition/operation is unavailable until integrator review. No payment or physical-delivery fact is inferred from these populations.

## Normal return, fallback and mixed questions

Both normal and exhausted-round paths call the same composer with the resolved parts and current validated evidence. A nonempty model string is not a factual acceptance gate. The model may propose fact IDs/operations for answer parts, but the server checks references, scope, origin, units and coverage; the composer renders validated facts and bounded explanations from templates. Unreferenced numerical, entity, causal and physical assertions do not enter the evidence-backed section through free prose. This does not claim that a universal prose checker can prove truth.

Interpretation is visibly separate and cannot introduce new quantities, entities, causes, payment/receipt claims or physical compliance. A qualitative comparison must be grounded in an allowed derived fact with a declared definition, not an extra assertion hidden in commentary. Unsupported interpretation is explicitly limited without discarding verified factual parts. No fallback, parsing error or tool failure opens a free factual-prose path.

For a mixed request, compose answered/partial parts first, then identify the specific ambiguity, missing input or unsupported operation. Example: provide verified recorded quantities while marking an unverified physical-delivery assertion unavailable. Never replace the question with a generic application report. Clarification is not a useful-answer pass when a supported part was answerable.

A tool error is unavailable evidence for its dependent parts, not permission to answer from stale history. A final fallback cannot upgrade error, partial or unknown evidence. Context serialization retains scope/origin/coverage and essential facts; if these cannot fit, it marks requery required and cannot be reused as an authoritative complete result. Follow-ups resolve against user scope plus trusted validated context, never assistant prose alone.

Migration is explicit per operation. Legacy tools are not stamped v1 by wrapping their JSON. A covered answer part cannot escape the contract by selecting a legacy summary, overview or alternative tool: that output is discovery/unvalidated input until the registered adapter verifies it or requeries the allowed source. Tool selection does not change which facts that part is allowed to assert. No wholesale shutdown of unrelated tools to manufacture safety passes. Before enabling a family, its historical supported requests and controls must work through the shared composer; nonmigrated behavior remains a disclosed gap, not certified coverage. Application safeguards and existing receipts must remain operational during integration.

## Access matrix to preserve

| Channel / actor | Existing entry gate | Domain/data implication |
| --- | --- | --- |
| Web: missing/invalid JWT | deny before loop | no domain reads |
| Web: valid JWT, not Gerencia | deny before loop | no domain reads |
| Web: JWT + Gerencia | chat allowed; conversation ownership checked | existing Esco tool surface; no new module grants |
| Web: another user's conversation | deny ownership | no use of its history/receipts |
| Telegram: unregistered/inactive | active-user middleware denies | no free-text Esco loop |
| Telegram: active, no consultas | module gate denies | other bot commands retain their own gates |
| Telegram: consultas, missing user link | resolver denies | no persisted Esco query attributed to an invented user |
| Telegram: active + consultas + valid user link | existing free-text loop allowed | not equivalent to Web Gerencia; do not silently add/remove role gates |

Sources: `chat.tsx` authenticateUser/getAdminHeaders/handleChatMessage; Telegram bot active middleware/free-text fallback and resolverUsuarioTelegram. Service role bypasses caller RLS, so the adapter is not an authorization boundary. The integrator preserves gates before reads, binds conversation/receipt ownership and permits only existing source fields. Individual names/remuneration are unnecessary for aggregated labor requests and must not be fetched for that path. Finca filters express requested location, not new tenant isolation. No production access is needed to test this matrix with synthetic entry/adapter fixtures.

## Exclusive ownership and proposed files

No implementation worker starts until parent reviews this interface. Names below are proposed files, not created modules. Workers receive no evaluator-held-out wording.

| Owner | Exclusive canonical files / tests | Responsibilities / boundaries |
| --- | --- | --- |
| Integrator (this worker) | `src/utils/escoEvidencia.ts`, `src/utils/escoRespuesta.ts`; `chat.tsx`, dispatcher, both runtime trees, sync script; integration tests | freeze types/validators, wire trusted readers, common normal/fallback composition; only owner of hotspots and generated mirrors |
| Worker A: registered work/application facts | `src/utils/escoHechosTrabajo.ts`, narrowly needed `src/utils/escoAplicacionHechos.ts`; corresponding new unit tests | incorporate R18 aggregation, recorded/plan distinction, exact decimal/units/denominators; no chat, renderer, mirrors, receipts or release files |
| Worker B: inventory population | `src/utils/escoHechosInventario.ts`; corresponding new unit tests | canonical products, complete versus capped population, null/zero, registered balance versus physical receipt/absence; no chat or shared validators |
| Worker C: time/coverage/context | `src/utils/escoAlcance.ts`, `src/utils/escoCobertura.ts`, `src/utils/escoHechosClima.ts`; corresponding new unit tests | Bogotá reference, strict calendar/range/unique-page checks, current-turn eligibility/context projection as inputs to integrator-owned final acceptance; no changes to shared application receipt store or channel gates |
| Integrator reuse/audit | existing milk aggregation/DTO and a small bridge if needed | preserve existing identity/measurement/budget behavior; audit into v1 without rewriting calculations or broadening source data |
| Parent/evaluation owner | independent oracle/grading/held-out artifacts | frozen acceptance and independent online testing, outside implementation inputs; no private payloads in Git |

Shared review is read-only. If a worker needs another owner's file, return a proposed interface change to the integrator rather than editing it. Mirroring is generated once by the integrator. No worker changes workflow/source release pins, SQL, Auth, Telegram operational commands, provider configuration or production data.

## Dependency graph and bounded batches

1. **This phase:** review this contract/matrix/ownership; no runtime code, publication or operational action.
2. **After freeze:** integrator adds contract validators and synthetic conformance examples. A/B/C implement disjoint modules in parallel against that exact interface; their commits remain independently reviewable. A cross-owner semantic change returns for review.
3. **Coherent mechanism batch:** integrate scopes, authoritative facts and the common composer together for the selected high-materiality families. Remove neither the old guards nor the terminal-text guard. Include ordinary supported wording and mixed parts; do not release R18 in isolation or one parser wording at a time. If too large, split source/evidence correctness from answer enforcement, but neither intermediate merge is described as online-quality acceptance.
4. **Candidate freeze:** full applicable local checks, mirrors, independent review and exact-head CI; no hidden changing runtime during measurement. Parent coordinates the single controlled release and cross-domain online campaign separately. Production source/config verification is not answer-quality acceptance.

## Conformance matrix before activation

- Correct fact + correct render; correct fact + adversarial false proposed prose; wrong entity/unit/period; planned-as-recorded; total/rate/average confusion.
- Partial input values, known zero, exact empty, missing count, cap, late unequal row, duplicate/replaced IDs across pages, changing counts; explicitly retain no-snapshot limitation.
- Duplicate labels and conflicting selectors; valid normalized aliases; stale/forged/expired application context; correct fresh follow-up.
- Bogotá day/week/month/year boundaries, explicit historical periods and contradictory ranges; calendar dates absent entirely as well as flagged bad rows.
- Mixed supported/unsupported parts with useful verified answers, not broad refusal; status without physical-success inference; recorded balances without inferred collection/delivery.
- Entry channel × gate state × protected domain; no personal-field projection for aggregates; current normal and forced-fallback paths use the same eligibility rules.
- Provider/serialized evidence budgets and literal output labels; known errors remain explicit. Synthetic local Auth/PostgREST checks only where needed to verify adapter schema/gate contracts; no new production probes.

Local contract walk-throughs (synthetic reasoning checks, not implemented runtime tests):

| Inputs / request | Required disposition |
| --- | --- |
| Two lots each 1 jornal, stored costs 80.25 and 210.75 | lot facts remain distinct; derived registered total 291; no 145.50-per-lot proration |
| Population count complete, one cost null, valid journals | complete record count/journal facts may answer; cost total unknown, verified cost subtotal labelled; null never zero |
| Inventory page 50 rows, known larger universe | page/subset facts only; cannot call 50 the complete product population or deny other products |
| Seven expected station dates, five rows, no flagged rows | calendar population partial; cannot report no data gaps or seven verified dry days |
| Recorded quantities verified, physical receipt not evidenced | answer quantities; mark only receipt assertion unavailable; no whole-question refusal |
| Fallback after failed fresh read, older answer has a number | dependent fact unavailable/requery; no historic number promoted by fallback |

Offline replay proves controlled paths and invariant enforcement, not natural model selection, complete semantic understanding, source capture truth or online factual quality. The evaluator must bind each assertion to entity/value/unit/period/turn and test contradictions; matching a number anywhere in a multi-turn transcript is insufficient. Reserved wording remains outside implementers' access. Existing historical outcomes are never rewritten as passes.
