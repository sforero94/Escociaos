# P1 result: choose bounded repair for the next approval

2026-11-04. P0 and the isolated P1 experiment are complete. **Recommend A, bounded
repair, for a separately approved P2 labor scope.** Both candidates pass the same
frozen obligations. The claim representation in B provides no demonstrated
capability advantage that requires changing the existing result representation.
This recommendation does not authorize P2 or accept the product.

## Scope and frozen evidence

Local starting baseline: `main`, `9dfd46d919546f845270c084615fcfea12873e97`.
This session changed no tracked runtime files. Work added only isolated experiment
files and documentation. The two pre-existing untracked handoff/planning documents
were preserved. During close-out a concurrent action advanced the checkout to
`5b9a76be78af7bf3dce11d32e132f599896be91e`, adding only the approved recovery-plan
document. Its runtime source is identical to the tested baseline. This session
did not create that commit and did not reset or alter concurrent work.
No branch switch, worktree, commit, push, deployment, migration, production read,
secret change, paid inference or held-out access occurred.

CTO defined the [source and semantic contract](p0-semantic-contract-2026-11-04.md).
Separate QA authored raw synthetic tables, literal table-arithmetic expectations,
the [rubric](p0-qa-rubric-2026-11-04.md), and mutation oracles without calling the
candidate executor. The five-artifact [P0 manifest](../../scripts/esco2/recovery/qa/freeze.json)
was frozen at 18:07:38 UTC, before the first comparison at 18:10:59 UTC. All five
hashes still match. No frozen expected value or denominator changed after execution.

There are 16 scenarios: four source/association/cohort, four calendar/group/ranking,
four claim/set/reconciliation, and four multipart/ambiguity/follow-up cases.
Eleven require fully substantive answers; S13 requires substantive work plus an
unavailable association; two require unknown source outcomes and two clarification.
Verified-empty sets are substantive answers. X01 is a separately reported control
for missing scheduled-task lot-assignment authority.

## Uniform final result

| Variant | Frozen scenarios | Candidate mutation boundary | Positive controls | Candidate critical assertions | P1 gate |
|---|---:|---:|---:|---:|---|
| Current core, scripted legacy-intent adapter | 3/16 | Unavailable | No semantic validator API | Not adjudicated as a raw-answer count | Fail |
| A: existing numeric results plus semantic sidecar | 16/16 | 8/8 rejected | 8/8 accepted | 0 | Pass |
| B: explicit claims before factual rendering | 16/16 | 8/8 rejected | 8/8 accepted | 0 | Pass |

Both candidates also pass X01, the separate factual-prose mutation, eight
supplemental source controls and two unsupported-heading controls. Runtime
mutation rejection and independent oracle sensitivity are separate measurements.
The baseline's absent semantic validator is N/A; its reject-all diagnostic stub
does not count as protection.

The baseline score measures satisfaction of this synthetic contract through a
scripted adapter, not natural-language accuracy. Its adapter translates selectors
and task metadata into the existing DSL where representable, preserves D30
qualifications already present in native text, and does not invent stable IDs for
duplicate labels. Four final normalized contract flags are **not four independently
adjudicated false raw answers**. Earlier 1/16 and 2/16 adapter scores are superseded;
their timestamped runs remain available. No D31 improvement or causal attribution
follows from these numbers.

Two supplemental tests exercise the unchanged core directly, without diagnostic
projection: an unread application table becomes “sin aplicación asociada”; and the
actual numeric guard publishes crossed task/metric values plus a question-only
number through a scripted composer. These demonstrate mechanisms, not their
frequency or contribution to D31.

## What the adversarial track changed

The initial 16-case pass was insufficient. QA additionally reproduced four source
defects in both candidates: dropping work whose task was missing from the catalog;
certifying reconciliation across independent reads; dropping a task with a dangling
type relation during category filtering; and using a declared-unread category
field. All eight controls failed before the corresponding fixes and now pass.
Final review also removed arbitrary planner rejection prose from factual output.
The [supplemental record](../../scripts/esco2/recovery/qa/supplemental-findings.md)
preserves these discoveries and the baseline-adapter corrections.

The frozen eight mutation classes cover wrong entity, unit, date basis, set member,
missing qualifier, a number found only in the question, a skipped obligation and
unknown converted to verified-empty. Both candidates accept the legitimate
controls, reject each mutation and reject correct hidden facts paired with altered
factual prose. Source checks, the closed query registry and four-part bound remain
part of the repaired path.

## Orchestration and isolation evidence

Stage C runs all three variants on the same 16 inputs plus X01 through a local
scripted-plan wrapper. It uses the real `autorizarGerencia`, fixed `fuenteSupabase`
reader and existing PGlite RLS harness. Denied roles, inactive/profileless users,
invalid synthetic signatures and foreign conversation owners cannot select a
scope or reach planning improperly. Valid state ownership is arranged in fixtures;
the wrapper forwards state ownership unchanged.

An additional test invokes the **actual unchanged HTTP handler** with a scripted
tool response, checks its total against independent SQL and verifies Bogotá near
UTC midnight. Candidate wrappers are not candidate HTTP-handler integrations.
SQL NULL cannot represent an unread historical property, so explicit source-profile
overlays remove those properties after synthetic SQL reads. The scheduling lot
relation is hypothetical enriched fixture evidence, not a demonstrated live reader.
Business IDs use text in the local database; policy predicates and auth functions
come from the existing harness. This does not verify real JWT cryptography,
production RLS, current data completeness or concurrent-read consistency.

## Complexity, payload and deterministic timing

Both candidates share repaired source checks, identity resolution, calendar/cohort
selection, arithmetic, ranking, estimates, reconciliation and typed follow-up.
A renders `ResultadoParte` metrics plus the minimum semantic sidecar directly;
its claim conversion exists only for QA export. B uses the same native calculation,
projects to claims and then renders those claims. B does not remove the calculation
sidecar in this experiment.

The required distinct answer paths are approximately 51 physical lines for A,
versus 46 for B including its claim projection and renderer. The common machinery
counts equally. Comparing A's 61-line file with B's 13-line entry file would omit
B's required transitive code. The shared nine branch families are source state,
stable identity, scheduled membership, work-date clipping, ranking, D30, coherent
reconciliation, conversation ownership/choices and closed query validation. There
are no scenario-ID exceptions in candidate execution.

Final local measurement, 11 fully substantive scenarios, 10 warmups and 100 timed
repeats per scenario:

| Measurement | A | B |
|---|---:|---:|
| Mean native evidence JSON | 1,371 bytes | 1,347 bytes |
| Mean factual text | 623 bytes | 623 bytes |
| Mean normalized QA payload | 2,139 bytes | 2,141 bytes |
| Native generation/render p50 | 0.0265 ms | 0.0242 ms |
| Native generation/render p90 | 0.0400 ms | 0.0326 ms |

These differences are practically tied for this decision. A timing excludes its
QA-only claim export; B timing includes required claim projection. Both exclude
the additional source re-execution used by `validateCandidate` when validating an
adversarial result. The partial response and unknown/clarification timings are
reported separately in [measurements.json](../../scripts/esco2/recovery/qa/measurements.json),
with every timing sample. Repeats are not additional scenarios. No provider latency,
server SLA or operating-cost conclusion follows from this microbenchmark.

## Reproduction and verification

From the repository root with existing dependencies:

```sh
npm test -- scripts/esco2/recovery
./node_modules/.bin/tsc --noEmit -p scripts/esco2/recovery/tsconfig.json
./node_modules/.bin/eslint scripts/esco2/recovery
node --experimental-strip-types scripts/esco2/recovery/measure.ts
```

The main coordinator independently ran the final experiment together with the
five existing focused suites: **285/285 tests in 11 files** (161 experiment tests
and 124 existing tests). Experiment typecheck, repository typecheck and scoped
lint passed. Node emitted the existing package module-type warning; lint had no
errors. No application/build configuration changed, and no production build or
browser acceptance was claimed.

Final A/B run: `2026-11-04T18-20-21-208Z`; stage C:
`2026-11-04T18-20-21-229Z`. Both recorded identical implementation hashes before
and after their runs. [results.json](../../scripts/esco2/recovery/qa/results.json)
contains per-scenario judgments and per-mutation results;
[rls-results.json](../../scripts/esco2/recovery/qa/rls-results.json) contains stage C
evidence. Network fetch is denied and asserted unused in these tests and the
benchmark. Experimental provider calls and cost: **0 / USD 0**.

## Recommendation and exact next decision

Choose **A, bounded repair**, as the conservative implementation direction.
It satisfies the same obligations and preserves the existing result representation.
B remains viable, but this experiment establishes no capability, complexity or
performance advantage that requires its additional runtime projection. This is
a narrow result-representation choice, not proof that every existing component is
correct or that the five-domain product is accepted.

Santiago's next decision is whether to authorize **P2 labor recovery with A**:
carry the tested source-state checks, stable IDs, explicit recorded/scheduled
cohorts, ranking and reconciliation qualifications, deterministic factual renderer
and caller-owned typed follow-up into a separately scoped implementation. Do not
restore numeric-membership certification or arbitrary model factual composition.
Confirm actual scheduling-lot authority and state transport before exposing those
capabilities; absent evidence must stay unavailable. Existing ratios and other date
metrics were not certified by this 16-case slice.

Natural-language planning, D26 discovery from real wording, clarification UX,
source acquisition, historical status, application valuation, remaining domains,
independent acceptance, model budgets and pilot readiness remain later work.
P2–P6 and runtime integration require new approval. This session stops here.
