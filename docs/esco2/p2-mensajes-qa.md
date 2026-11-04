# P2 messages: independent Spanish output QA

2026-11-04. Add-on scope: deterministic human-readable final text and its strict
publication validator. Fresh synthetic result objects and synthetic SQL only.
No P3, model/provider call, production read, migration or deployment.

## Expectations fixed before rendering

QA authored `src/__tests__/esco2MensajesFixtures.ts` before the new renderer was
executed. SHA-256: `78f2e527b7b51f852e066f06669c3d7648dc29602c1822a687ecbdeca9bff59c`.
The initial fixture had literal numbers and Spanish sentences; expected arithmetic
or format strings never call the executor or production formatter. Its ten named
states fixed known work, visible verified-empty, NULL cost, unavailable data with
reason, unsupported capability, one concrete clarification, partial whole-task
estimates, known association members, unread association and visible empty set.
Extra literal fixtures specify crossed95/2 magnitudes, different periods with the
same4.5 labor total, six rows, tie ranking and same-record partition arithmetic.
This is a development fixture, not an independent business acceptance denominator.

Final revision `mensajes-v1.3` SHA-256:
`da87f3f57c27c38efd3643161e9153844fa17f2af88be93db7d1b0194a4b1ed8`.
The coordinator's explicit user requirements required these disclosed corrections:
NULL cost uses “sin costo registrado”; unavailable source starts “No tengo ese
dato”; clarification uses a typed result and the actual verified task name,
“Cosecha puntual”, rather than arbitrary context prose or an unmatched fragment.
Three additional cases cover an unresolved name with suggestions, known cost zero
with recorded work and a visible verified-empty scheduled selection. The final
fixture therefore has13 states. No original arithmetic, entity membership, query
period, table value or missing-estimate count changed. The exact complete output
book and exhaustive numeric bindings were added as a stricter QA layer during
implementation; they are development evidence, not a claim of a pre-existing
sealed acceptance oracle.

Given complete visible work, when a valid result is rendered, then its answer
comes first and each entity/metric pair stays bound to its inclusive period.
Given unread or recorded NULL data, when rendering, then no verified-empty or
zero claim replaces that source state.
Given pending ambiguity, when rendering, then exactly one question offers the
two concrete alternatives.
Given more than five rows, when rendering, then a table preserves every row;
truncated ranking states the real shown/eligible population and tie policy.
Given a correct same-record partition, when rendering, then the totals may close;
an inconsistent partition or NULL cost cannot claim equality.
Given any modified factual output, when the final-text validator is called, then
it rejects the mutation while accepting the original canonical control.

## Before and expected after, from the same synthetic fixtures

Known labor, total4.5 and cost95M; Cosecha2/40M and Poda2.5/55M.

Before:

```text
**Labores registradas** (2026-10-26 a 2026-11-01; fecha: trabajo): 4,5 jornales registrados, $95.000.000.
- Cosecha [task-cosecha]: 2 jornales registrados, $40.000.000
- Poda [task-poda]: 2,5 jornales registrados, $55.000.000
Alcance visible. Lotes: todos; tareas: todas; categorías: todas.
Se incluyen registros sin lote.
Lecturas separadas: no se certifica una instantánea conjunta.
```

Expected after, literal substantive lines:

```text
Se registraron 4,5 jornales; costo de mano de obra: $95M.
Del 26 de octubre de 2026 al 1 de noviembre de 2026, ambas fechas incluidas.
- Cosecha: 2 jornales registrados; costo de mano de obra: $40M.
- Poda: 2,5 jornales registrados; costo de mano de obra: $55M.
Se consultaron las labores que puedes ver.
```

NULL cost before:

```text
**Labores registradas** (2026-10-26 a 2026-11-01; fecha: trabajo): 4,5 jornales registrados, sin dato.
```

Expected substantive lines:

```text
Se registraron 4,5 jornales.
El costo no está completo: hay registros sin costo registrado.
```

Unavailable source before:

```text
**Labores registradas** (2026-10-26 a 2026-11-01; fecha: trabajo): fuente no disponible (campo_registro_no_disponible).
```

Expected substantive line:

```text
No tengo ese dato: no pude leer los datos de los registros de trabajo necesarios para responder.
```

The captured before strings came from the existing deterministic renderer, using
these same synthetic fixture objects. They are not historical farm outputs.

## Verification status

**79/79 new message checks pass** in three test files, together with the93
existing independent P2 checks: **172/172 across seven files**. Repository typecheck
and scoped lint of all four new QA files pass. Node emits the existing module-type
warning. Main must independently rerun these commands before publication.

```sh
npm test -- src/__tests__/esco2Mensajes.test.ts src/__tests__/esco2MensajesMutaciones.test.ts src/__tests__/esco2MensajesFormato.test.ts
npm test -- src/__tests__/esco2P2Integration.test.ts src/__tests__/esco2P2Source.test.ts src/__tests__/esco2P2Security.test.ts src/__tests__/esco2P2Mutation.test.ts
npm run typecheck
./node_modules/.bin/eslint src/__tests__/esco2MensajesFixtures.ts src/__tests__/esco2Mensajes.test.ts src/__tests__/esco2MensajesMutaciones.test.ts src/__tests__/esco2MensajesFormato.test.ts
```

- `esco2Mensajes.test.ts`:45 checks. Every one of13 disposition/state cases has
  an exact complete expected string, so an extra assertion cannot pass merely
  because selected sentences remain. Additional tests bind crossed95/2 magnitudes
  to different entities and units; separate equal4.5 labor totals by period;
  preserve six table rows, tied ranking, shown/eligible/omitted counts, exact
  partitions, NULL costs, scheduled basis and duplicate-name associations.
- The bounded, test-only numeric auditor enumerates **every numeric span** of
  representative full known, table, ranking, D30 and multipart outputs. Each span
  has a literal token, exact sentence/table row, structured source field, stable
  entity and context. It includes day/year dates, table values, ranking counts,
  missing/NULL D30 counts and multipart ordinals. D30 bindings explicitly refer to
  the complete task plan; the query interval selects the task cohort and is not
  asserted as the estimate's measurement interval. Extra777, crossed entities,
  crossed units and a copied value from a different period fail the independent
  auditor. It never calls a production formatter or renderer helper to derive an
  expected token.
- `esco2MensajesMutaciones.test.ts`:14 checks. Eight classes now mutate the
  **final published text**, each with a passing legitimate control: wrong entity,
  unit, date basis, application member, mandatory qualifier, question-only number,
  missing multipart obligation and unknown converted to verified empty. Two extra
  controls attack period/amount binding. Raw free-form context, unknown notice
  strings and objects cannot become a valid canonical message.
- `esco2MensajesFormato.test.ts`:20 checks. Literal expected monetary formats
  include$95M,$2.000M,$999.999 and$0, with explicit approximation when integer
  millions lose precision. Journales retain their actual decimals. Existing
  `formatMillonesCOP` consumer defaults remain unchanged. Spanish calendar dates,
  leap day, Bogotá near UTC midnight, metadata reasons and actual HTTP D26 names
  are checked. Actual-handler overflow and expiry responses validate with the
  closed notice enum; removing or changing the notice fails validation. An
  unsupported fresh query with a lost context retains both capability explanation
  and context notice, with zero provider calls.

The eight final-text mutation rejections are now runtime canonical-publication
checks. They are distinct from earlier P2 QA-only copied-result mutations. The
runtime regenerates the deterministic message and compares it completely. This
proves text integrity against the supplied validated results; it cannot prove
source arithmetic or that a syntactically valid planner intent matches real user
wording. Those remain separate source/integration and later acceptance questions.

QA reproduced a wrong-scope reconciliation: a synthetic scheduled result with
recorded partitions could still claim the labor totals closed. The renderer now
only closes recorded-work/fecha_trabajo scope. Main/CTO review also identified
free-text clarification context, NULL wording, accidental deletion of legitimate
name characters, ambiguous duplicate-name associations and notices appended after
validation. Their corresponding independent controls now pass. Underscores and
Markdown characters remain visible through escaping; technical IDs, codes and
field names remain in structured evidence rather than final prose.

The historical P2 test updates in this add-on change only presentation assertions
(Spanish dates, natural visibility/unknown text and absence of IDs in prose).
Structured ID sets, arithmetic, source states and permission expectations remain
unchanged. No P0/P1 files or reference values were changed by this QA track.
No private evaluator material, paid provider, production service, migration,
deployment, commit or push was used by QA. These79 checks are development tests,
not79 independent product scenarios, a generalization estimate or five-domain
acceptance. No browser, real JWT cryptography or production completeness is
certified.

Final calendar compatibility check: after removing redundant timestamp conversion
from already-calendar dates in the renderer, the same20 format/integration checks
pass under `TZ=UTC`, `TZ=America/Bogota` and `TZ=America/New_York`. The existing
leap-day case also verifies the February month-group label. The13 existing
`hatoFechaLocalGuard` checks pass without adding a whitelist or duplicating a
formatter. These are timezone repeats of the same tests, not extra scenarios.

```sh
TZ=UTC npm test -- src/__tests__/esco2MensajesFormato.test.ts src/__tests__/hatoFechaLocalGuard.test.ts
TZ=America/Bogota npm test -- src/__tests__/esco2MensajesFormato.test.ts
TZ=America/New_York npm test -- src/__tests__/esco2MensajesFormato.test.ts
```
