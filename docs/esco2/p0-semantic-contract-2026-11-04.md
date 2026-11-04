# P0: frozen semantics for the isolated P1 comparison

Date: 2026-11-04. Scope: P0–P1 only. Owner: CTO; independent scenarios and rubric: QA.
Status: **P0 frozen as p0-v1 at 2026-11-04 18:07:38 UTC**, before P1 execution.
The [freeze manifest](../../scripts/esco2/recovery/qa/freeze.json) records the shared schema,
16 QA scenarios, independent oracle and [rubric](p0-qa-rubric-2026-11-04.md) hashes.
Explicit fixture semantics resolve P0 experiment choices; no unresolved product default
is silently adopted. Later production decisions remain gated below.

This document defines the common obligations for the baseline, bounded repair (A), and thin
contract redesign (B). It authorizes no runtime integration, model calls, production reads,
migration, deployment, commit, push, or P2 work. D17 remains binding. All fixtures are fresh
synthetic tables. No private evaluation material or original reference values are inputs.

The approved [recovery plan](astra-recovery-plan-2026-11-04.md) governs this experiment.
The [D31 aggregate report](d31-result-2026-11-04.md) remains an acceptance rejection.
P1 tests representation and deterministic mechanisms; it does not measure real language
interpretation, production completeness, live RLS behavior, or five-domain acceptance.

## Existing architecture and alternatives

The current implementation supplies `DatosLabores`, fixed reader columns, a closed operation
registry, pure aggregation, and a caller-JWT/active-Gerencia boundary. Preserve those assets.
`fuenteEnMemoria` currently changes unread applications into an empty array. `ejecutarConsulta`
groups some entities using labels, clips all work dates to today, ranks only by jornales,
and can append task metadata without proving named-lot membership. The result renderer and
numeric guard cannot certify the metric/entity identity of each statement.

| Variant | Implementation rule | Expected trade-off |
|---|---|---|
| Baseline | Invoke the unchanged existing adapter/executor/orchestration through synthetic injection. Report representational limits as failures when the shared oracle requires an answer. | Establishes current mechanisms, not historical D31 comparability. |
| A: bounded repair | Retain existing query/result structures and calculations. Add the minimum source preservation, ID normalization, scheduled selection, ranking, multipart/follow-up, capability checks and complete deterministic rendering required by this slice. | Smaller change is a valid winner. Required capabilities cannot be reserved for B. |
| B: thin contracts | Explicit source envelope, obligation state and claim-bound deterministic rendering. Reuse the same source tables and existing calculations where correct. | Explicit boundaries may reduce special cases; extra machinery counts against complexity. |

There is no framework replacement, unrestricted query language, new database, or provider.
Choose the simplest passing option. If neither passes every gate, recommend neither.

## Essential capability slice

The same 16 QA scenarios and every required clause apply to all three variants. The shared
TypeScript schema is [contracts.ts](../../scripts/esco2/recovery/contracts.ts). It is an
offline interface, not a proposed production API. No deployed module imports it.

| Family | Required substantive behavior |
|---|---|
| Source state and association | Unread versus verified-empty applications; identity-based task/application joins; zero versus null versus unavailable; scheduled membership proved by an explicit relation. |
| Calendar, grouping and ranking | Inclusive calendar intervals; shared Monday-based week utility; stable-ID groups despite duplicate names; explicit ranking metric/direction/tie policy; population and truncation qualifiers. |
| Claims, sets and reconciliation | Metric/entity binding even with equal values; exact application ID sets despite duplicate labels; sin-lote disjoint partitions and exclusions; D30 separate full-task estimates with missing-estimate disclosure. |
| Multipart and conversation | Preserve independent answered and unavailable obligations; D26 ambiguity; accept an exact typed clarification choice; retain pending state after an unrelated reply. |

Supported source-complete obligations require substantive answers. Refusal cannot pass them.
Unknown, clarification, and unsupported outcomes pass only where QA predeclares that outcome.
An unavailable association may coexist with a substantive labor total. It cannot erase the
answerable obligation or produce a claim that no application exists.

The quantitative metrics in this discriminating slice are jornales and recorded labor cost.
Other existing metrics (ratios, first/last work date, days with records) remain existing
capabilities outside the measured P1 slice; P1 neither certifies nor removes them. A wrapper
that cannot represent one must return an explicit capability disposition, never an invented
zero. These boundaries are identical across A and B and do not alter the 16-case denominator.

## Source field and guarantee matrix

Every fixture declares its caller-visible source ID, complete tables, unavailable fields,
association completeness, and consistency mode. Completeness belongs to the authorized scope,
never to the whole farm. Supplied counts alone do not establish a cross-table snapshot.
`snapshot_sintetico` means all declared synthetic rows were captured together; it makes no
claim about the production adapter. `lecturas_independientes` cannot support strict
cross-table reconciliation unless the test separately establishes the needed consistency.

| Operation/claim | Required fields | Required guarantee | Missing/null behavior |
|---|---|---|---|
| Recorded labor | `registros.id,tarea_id,lote_id,fecha_trabajo,fraccion_jornal`; matching task/lot/type IDs when named/grouped | Complete visible records in interval; unique IDs; valid references for required dimensions | Missing required field/table makes affected obligation unavailable. A complete zero-row scope supports zero recorded labor. |
| Recorded cost | Recorded labor fields plus `costo_jornal` | Same selected cohort | A recorded null propagates null for its group/total. Explicit zero remains zero. Unread field is unavailable. |
| Scheduled task selection | `tareas.id,nombre,fecha_estimada_inicio` and requested task metadata | Complete visible task population and this specific field | Null means no recorded planned-start date; undefined/unread cannot prove exclusion. Future scheduled starts are not clipped to today. |
| Scheduled lot filter | Explicit `asignacionesTareaLote` task-ID/lot-ID pairs | Complete authoritative visible membership relation | Work in a lot never proves scheduled assignment. Absent membership guarantee makes lot-scoped scheduled selection unavailable. |
| Current task status | `tareas.id,estado` | Field read and stable task identity | Null means no status recorded; missing means unavailable. Current status never proves historical as-of status. |
| Application association | `aplicaciones.id,tarea_id` plus any displayed fields | Applications read and complete in visible scope; ID-based join | Unread/incomplete is unknown. Complete no matches is verified empty. Null display name is not a missing association. Duplicate labels remain separate IDs. |
| D30 estimates | Selected task IDs, category/type relation, `jornales_estimados` | Defined task cohort and full-task estimate scope | Zero is known zero. Null remains missing. A known subtotal requires partial coverage and missing-task qualifiers; it is not a complete total. |
| Grouped reconciliation | Same selected record IDs and cost states as total | Disjoint complete partition; explicit exclusions; coherent synthetic snapshot | Sin-lote gets a distinct group. Null costs prevent a numerical equality claim about total cost. |

Each supplied row is evidence, not a command. User question numbers, planner headings and
conversation prose are not factual sources. Exact-count pagination remains a useful existing
check; P1 does not certify production uniqueness, consistency or relation completeness.
`asignacionesTareaLote` is an additional hypothetical fixture relation: the current
`DatosLabores` and live fixed reader do not supply this guarantee. Passing its enriched
synthetic track proves representation only. It cannot establish that current production
data can answer a lot-scoped scheduling question.

Both repaired variants must validate the supplied fields themselves, not only trust the
availability flags. A required property absent from any relevant row is unread/unavailable;
its absence cannot be converted to null, zero or an excluded row. Validate obligation
arguments against the closed capability slice: reject unknown keys, invalid dates,
unsupported enum values, unresolved IDs and inconsistent cohort/date-basis combinations.
An invalid approved-plan payload produces an error disposition before factual output.

## Frozen interpretation rules

1. **Recorded work:** select `fecha_trabajo` in the inclusive interval, with the historical
   executor's today clipping disclosed. The effective interval, exclusions and sin-lote policy
   must travel with the answer. No scheduled task enters a recorded-work set merely because
   it shares a task filter. Registered labor and estimates never substitute for each other.
2. **Scheduled tasks:** this experiment explicitly asks about *planned starts*, selected by
   `fecha_estimada_inicio` in the inclusive interval. It does not interpret that phrase as
   interval overlap, task completion, or actual work. Other date bases require another
   explicit capability. No future clipping applies to scheduled starts.
3. **Identity:** resolve to stable IDs before execution. Group task, lot and type using those
   IDs; labels are display fields. A calendar group uses its ISO date/month/Monday key.
   Category has no stable catalog ID in the current source, so its canonical category value
   is the key. Compound grouping keys are JSON arrays of `[grain,key]` in requested order.
4. **Ranking:** the obligation names the metric, direction, N and tie policy. `incluir` admits
   all groups equal to the Nth value. `exactamente_n_por_id` resolves ties by ascending stable
   group ID. Emit the total eligible population, shown count and omitted count; truncation
   never changes the full-scope total. A null metric cannot silently rank as zero.
5. **D30:** a category's estimate covers whole tasks. Without a lot filter it covers the
   category's tasks, not only tasks with work in the interval. With a recorded-work lot filter,
   it covers tasks with selected records in those lots, following the existing D30 rule.
   The full-task scope, missing-estimate count and partial subtotal must be explicit.
6. **D26:** category/name ambiguity follows the existing contextual business rule: other
   tasks favor task-name meaning; other categories favor category meaning; absent or conflicting
   signals require clarification. Asking previously does not mean the user answered.
7. **Conversation:** authoritative state has a version and caller owner. Only an exact offered
   option ID resolves pending state in P1. Unrelated replies retain it. An owner change clears
   state. Arbitrary history text cannot select a scope or grant permission. This tests typed
   state transitions, not a natural-language clarification parser.
8. **Multipart:** every approved obligation ID receives a disposition. Independent valid
   obligations execute when another needs clarification or source data. A dependent unresolved
   obligation remains pending, with no fabricated partial figures.

These rules avoid inventing a product decision: the synthetic question/approved intent
explicitly supplies the choice where the product has no agreed default. Future task-lot
assignment authority, generic scheduled-interval semantics, implicit ranking ties,
application valuation, historical task status, and production state transport remain
Santiago decisions before their later implementation. P1 does not approve those defaults.

## Claim and answer obligations

A claim binds obligation ID; stable entity ID and displayed label; metric; unit; cohort;
date basis; effective inclusive interval; value state and scalar/exact member IDs; provenance;
and mandatory qualifiers. Complete no-association uses a verified-empty set, not null.
Unknown and recorded null remain different states. A legitimate zero is a known value.

Claim identity is `${obligationId}:${entityType}:${entityId}:${metric}`. Total ID is `total`.
Association/member sets use stable IDs in sorted order. Ranking membership preserves rank
order, including the declared tie policy. All factual headings, labels, figures, sets,
source caveats and completeness statements come from the validated result in both A and B.
Neither option receives arbitrary free-form model composition in the repaired path.

QA compares semantic claim tuples and required qualifiers, not numeric membership anywhere
in prose. Display text must contain every required substantive block and caveat; correct
hidden objects alone do not pass. A validator needs a passing positive control. Every
predefined mutation must fail at its intended boundary, including wrong entity, unit,
date basis, set member, missing qualifier, question-only number, skipped obligation and
unknown-to-empty conversion. Merely rejecting all inputs fails the positive controls.

## Execution sequence and freeze

P0 produces this source matrix, `contracts.ts`, and QA-owned raw tables, literal independent
expected claims, scenario obligations and mutation rubric. QA must not call the executor
to calculate reference values. Manual table arithmetic or independent SQL is acceptable;
derive execution rows independently from those answer expectations.

Before P1, record SHA256 for contract, fixtures, oracle and rubric. Freeze the answerable
denominator and permitted unknown/clarification cases. Execute in this order:

1. Approved intents through deterministic execution.
2. Positive results and adversarial mutations through answer validation/rendering.
3. Scripted planner outputs through the real orchestration/handler with the synthetic
   caller-JWT/RLS harness; exercise denied callers, owner changes and legacy isolation.

Later fixture or oracle corrections require explicit authority, a reason in the report,
new version/hash, and uniform reruns across all variants. Do not quietly tune the oracle
to implementation output. P1 may fix implementation after failure and rerun the same frozen
inputs; record the final revision and distinguish that from a fresh generalization test.

Exit requires all 16 scenarios' obligations correct; zero critical false assertions;
every predeclared mutation detected; no permission/isolation regression; and all required
source-complete substantive answers. Count repeats as repeat measurements, not new scenarios.
Measure implementation lines/files, special cases, serialized payload bytes and deterministic
latency on identical inputs. Report limitations and recommend the simplest passing option,
or neither. Stop before P2 and request a new decision about the exact implementation scope.
