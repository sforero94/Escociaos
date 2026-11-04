# P2-A independent local QA

Date: 2026-11-04. Fresh synthetic data only. P0/P1 frozen artifacts remain unchanged.
This is a local handler integration gate, not natural-language, production JWT/RLS,
live source completeness, deployed behavior, or five-domain acceptance.

## Acceptance criteria fixed before P2 execution

Feature: bounded deterministic labor recovery, through the actual HTTP handler.

Scenario: substantive registered work
  Given an active Gerencia and complete caller-visible synthetic records
  When a scripted registered-work plan reaches the actual handler and fixed reader
  Then the answer contains independently computed totals, stable grouped identities,
  inclusive Bogotá intervals, source qualifiers, and every requested supported metric.

Scenario: source defect before filtering
  Given a required row field is unread or a required relation dangles
  When a filter would otherwise hide that row
  Then the affected obligation is unavailable instead of verified empty or zero.

Scenario: zero, null and empty
  Given known zero cost, null cost, unread associations and verified-empty associations
  When each is requested
  Then each keeps its distinct meaning and available work remains answered.

Scenario: scheduled starts
  Given a future planned start and direct tareas.lote_ids independent of work records
  When scheduling is filtered by lot
  Then membership follows the direct assignment and planned-start interval without today clipping.

Scenario: identity and ranking
  Given duplicate entity labels and equal-ranked costs
  When top N is requested with explicit direction and tie policy
  Then stable IDs preserve groups, ties follow that policy and the full total is unchanged.

Scenario: estimates and partition
  Given tasks with zero, positive and missing whole-task estimates plus sin-lote records
  When category work and grouping are requested
  Then registered labor, whole-task estimate subtotal, missing counts and exclusions remain explicit.

Scenario: deterministic publication
  Given malicious planner purpose prose or a hypothetical swapped-number composer
  When a valid plan executes
  Then no arbitrary factual purpose or composer output is published; no composer is called.

Scenario: exact caller-owned clarification
  Given pending D26 state held behind a server-issued token
  When the caller chooses an exact offered ID
  Then the stored intent resolves; unrelated replies retain pending state.

Scenario: state and permission failure
  Given forged, expired, foreign tokens, client owner/scope fields or fabricated history
  When a follow-up is attempted
  Then no untrusted scope is accepted and denied roles cannot reach planning or labor tables.

## Evidence

Final independent run: **93/93 checks in four files** pass on the changed local runtime.
Repository `npm run typecheck` passes. Scoped QA lint passes with zero errors or warnings;
Node still emits the existing package module-type warning.

```sh
npm test -- src/__tests__/esco2P2Integration.test.ts src/__tests__/esco2P2Source.test.ts src/__tests__/esco2P2Security.test.ts src/__tests__/esco2P2Mutation.test.ts
npm run typecheck
./node_modules/.bin/eslint src/__tests__/esco2P2Harness.ts src/__tests__/esco2P2Integration.test.ts src/__tests__/esco2P2Source.test.ts src/__tests__/esco2P2Security.test.ts src/__tests__/esco2P2Mutation.test.ts
```

- `esco2P2Integration.test.ts`: 12 actual-handler checks, scripted planner and fixed
  reader over fresh PGlite SQL/RLS. Independent SQL confirms registered total
  2.5 jornales / cost250 / two work dates. Literal expectations cover duplicate
  lots, exact ranking/ties, three existing ratios, date metrics, future scheduling,
  D30 scheduled/recorded cohorts, null/zero/empty, and association ID sets.
- `esco2P2Source.test.ts`: 37 source/orchestration integration controls, including
  actual-handler unread-field overlays after real synthetic SQL/RLS. Missing or
  malformed work dates remain visible to validation before filters; dangling
  references, duplicate IDs, declared-unread fields, application completeness,
  optional metadata, assignment arrays and invalid denominator/estimate states
  cannot become factual zeros or verified-empty claims. Multipart journals remain
  answered when only cost is unread.
- `esco2P2Security.test.ts`: 23 actual-handler checks cover denied roles, inactive
  and profileless accounts, invalid synthetic signature, exact choices, unrelated
  replies, category resolution, successive ambiguities, stable obligation IDs,
  forged/foreign/expired state, history forgery, empty-ID-intersection scope
  expansion and stale accepted decisions in a fresh plan. Orphaned choices safely
  reset with no new planner call or factual output. The runtime model configuration
  remains the existing M3 configuration.
- `esco2P2Mutation.test.ts`: 21 checks, consisting of eight independent answer-oracle
  sensitivity mutations with passing legitimate controls, plus 13 actual runtime
  planner/publication attacks. Every suite installs a network-denying `fetch`
  and asserts it was unused. Normal substantive turns make one scripted planner
  call and zero composer calls.

The eight copied-response mutations are wrong entity ID, wrong unit in prose,
wrong date basis, wrong exact association member, missing qualifier, question-only
number777, skipped obligation and unknown converted to verified-empty. Their
rejection is **QA oracle sensitivity**, not runtime rejection of client-supplied
results. The HTTP API never accepts a result or composed factual answer. Actual
runtime controls separately reject unknown fields, mismatched cohort/date basis,
malformed ranking, excessive or mixed special-tool plans and arbitrary factual
planner headings/rejection prose. A syntactically valid but semantically wrong
planner-selected entity still requires later natural-language acceptance work.

## Failures found and resolved during development

QA independently reproduced these defects before the backend correction:

1. Declared-unread category fields were used during grouping; related denominator,
   assignment and metadata declaration controls were added.
2. An application with a dangling task reference could permit a false association
   disposition for valid tasks.
3. Equal type labels with distinct IDs and estimates5/7 yielded12 in both groups.
4. Selecting the task interpretation after a disjoint prior stable-ID selector
   could turn an empty intersection into an unrestricted task population.
5. A prior accepted category choice could bypass D26 on a fresh planner turn.
6. Special clarification/out-of-scope tool branches accepted unknown keys, silently
   swallowed a mixed query and bypassed the four-operation bound.

All corresponding regressions pass after backend fixes. Additional controls cover
CTO/main review findings: category clarification looping, multipart part renumbering,
multiple pending choices, scheduled D30 missing coverage and nonfinite denominators.
The final narrow controls also cover orphaned choices, a64KiB state overflow with
independent parts preserved and no truncated IDs, invalid raw estimate metadata
and declared-unread identity fields. Two final validated-plan/executor source
boundary controls reject an empty record ID and a null record row without throwing. A nonfinite or negative ratio denominator
now yields null with an explicit reason,
preserving available work; the test requires that per-field behavior rather than
unnecessarily refusing the whole operation. Unread estimates have a separate
unavailable count, distinct from recorded null estimates.

## Source and evidence limits

Local tracked schema and form code establish direct `tareas.lote_ids` as the
recorded assignment authority (migrations021/022/033 and
`CrearEditarTareaDialog.tsx`). The P2 synthetic DB adds that column; it does not
invent P1's hypothetical assignment relation or infer scheduling membership from
work. This verifies the local source contract, not current production population.
The answer explicitly avoids historical assignment/status and atomic cross-table
snapshot claims over independent reads.

All fixtures are new P2-v1 synthetic data. The P0/P1 oracle, expectations, manifests,
results and runner files were not changed or executed by QA. No held-out material,
private evaluator traces or build artifacts were accessed. No production read,
provider call, migration, deployment, commit or push occurred in this QA track.
These 93 checks are development regression evidence; they are not93 independent
business scenarios, repetitions, or a generalization/acceptance score.

No browser UI, real JWT cryptography, live RLS/completeness, concurrency snapshot,
model wording interpretation, multi-instance state durability, five-domain
acceptance or deployment readiness is certified. The ephemeral token state can
expire or be lost across processes. Main must independently rerun the checks before
closing P2; no P3 or publication action follows from this result.

Default test discovery now excludes documentation, build directories and the frozen
P1 recovery runners. The historical P1 commands describe the frozen P1 revision
`b1eccb8c`; running those writers against repaired P2 would overwrite evidence and
assert intentionally removed baseline behavior. P2 uses its separate tests above.
