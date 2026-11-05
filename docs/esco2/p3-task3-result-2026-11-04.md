# P3 Task 3: exact saved plan and recorded execution quantities

Date: 2026-11-04. Parent: Task 2 commit `bd7f910f` (PR #421), based on main
`cf1bfa77`. Santiago authorized continuing Task 3 before reviewing Tasks 2 and 3 together.
This task has its own stacked PR with Task 2 as temporary base; retarget to main after Task 2
integration. Neither task is merged by this implementation session.

## Delivered behavior

`consultar_cantidades_aplicacion` accepts exactly one caller-visible application selected by
UUID or a name/code resolved in code. Optional paired dates select only recorded execution
by movement date, inclusively. Without execution dates, its scope is the application's complete
recorded lifetime. The saved plan always remains complete. Conversation can supply the selector
and explicit period for interpretation, preserving #419; source visibility is revalidated.

The exact product/lote plan reuses `calcularFumigacion` for Fumigación/Drench and
`calcularFertilizacion` for fertilizer with saved trees, doses, calibration and capacity.
`aplicaciones_calculos.mezcla_id` is the authoritative mix/lote link. The original arithmetic
and rounding bodies remain unchanged; type-only overloads allow the minimal validated inputs.
Missing required base stays unavailable, with readable stored product totals and containers
shown separately. No default capacity, current trees or proportional/equal allocation fills gaps.

Execution aggregates distinct movement-product row IDs by product/lote/unit. It has no join
to all planned mixes. Repeated products across mixes are not duplicated across lots; separate
legitimate execution rows are summed. Plan and execution never form a combined total.
Stored mix-product totals are reconciled against the reconstructed exact plan without
rescaling discrepancies. Product quantities keep their own kg/L/units, distinct from stored
canecas/bultos and mix metadata. Mixed-unit fertilizer metadata is explicitly unverified.

Fixed column readers use the verified caller-JWT client and visible parent IDs. Complete
pagination, unique IDs and required relationships are checked. NULL, unread, invalid,
incompatible, empty, missing movement products and unresolved identity have distinct states.
One unread side does not erase the other side or an independently answerable labor obligation.
Small nonzero quantities retain their decimals; nonfinite accumulation is unavailable.
Spanish factual text is deterministic, using the existing date/number conventions, without
model-written figures. No arbitrary SQL, joins, expressions or general query language is added.

See [runtime scope](p3-task3-runtime-scope.md) and [approved source contract](p3-source-contract.md).

## Validation

Backend and independent QA use synthetic fixtures. QA fixed its initial table oracles before
runtime integration and exercises the actual handler, scoped readers and synthetic SQL/RLS;
network calls are denied. The coordinator repeats the final tests independently.

| Check | Final coordinator result |
|---|---|
| `npm test` | **7,638 passed / 324 files** |
| Task 3 backend tests included above | 25 |
| Independent QA integration checks included above | 46 |
| New Task 3 total included in the suite | 71 |
| Focused Task 3 rerun | 71/71 |
| `npx tsc --noEmit` | Passed |
| `npm run lint` | 0 errors / 907 existing warnings |
| Production build and diagnostic-marker pruning | Passed; four markers absent |
| Frozen implementation/test/scope hashes during final checks | 23/23 unchanged |
| Protected legacy/Telegram/chat/local-handoff hashes | 253/253 unchanged |
| Original calculator arithmetic body hashes | 2/2 unchanged |
| Diff whitespace | Passed |

The final complete suite ran in 33.88 seconds. QA's initial 29-case run had 28
missing-capability failures and one passing table oracle. The final independent suite contains
46 checks. Review corrected reader-factory wiring, empty-product state, required relationship
availability, numeric formatting/overflow, machine-precision-only reconciliation and duplicate
lot identity. Stored totals, containers and mapping notices distinguish NULL from unread data.

Covered failure classes include text instead of ID joins, repeated products across mixes,
fan-out, plan plus execution, bulto allocation, rounded-caneca substitution, incomplete source
as zero, mismatched saved totals, unit pooling, hidden parents with permissive children,
missing base/doses, inclusive execution dates, and independent mixed-domain failures.

These are bounded local checks, not production authorization certification, natural-language
accuracy or P5 acceptance. Costs, linked labor, live shortages and their remaining mutation
classes are separate later P3 tasks. The application development-set check comes last after
those capabilities are complete; it was not run for this slice.

## Spend and review gate

New paid model calls: **0**. Incremental provider spend: **USD 0**. Latest published cumulative
P3 spend after #419 remains **USD 0.0345 / 0.25**. No production reads or writes were needed.
No held-out, e2e-local, migration, secret change, deployment, pilot or P4–P6 work occurred.
Protected chat, Telegram and legacy server files and the unrelated local handoff are preserved.

No essential semantic question remains open for this slice. Santiago or Claude Code must
review Tasks 2 and 3 before merge. After a later merge, backend deployment drift is expected
until a separately authorized redeploy; this session does not deploy.

## Review fixes (Claude Code, 2026-11-05)

Review of PR #422 against the 24 live applications (read-only, local simulation, aggregates only)
found one blocking defect and a readability problem. Fixed in the same PR:

| Finding | Fix |
|---|---|
| A fertilization stored doses in kg per tree. The engine divides by 1,000, and each lot was published as an exact plan about 1,000 times smaller than the saved total. | A mix/product whose per-lot sum does not match its saved total is withheld per lot (`no_concilia`). The saved total and the per-lot sum are both shown; the difference is never adjusted. |
| 10 of 18 discrepancies were exactly one 0.01 step: the saved total is itself `ceil`'d. | Tolerance is one calculator rounding step (0.01) plus binary residue. |
| 15 products had a crossed dose unit (cc on kg, g on L) and were marked incompatible. | Owner decision: compute as the calculator does (1 cc = 1 g) and name the products in a note. 14 of 15 now match their saved totals. |
| Answers up to 204 lines, products, mixes and lots shown by UUID. | Names first; an ID only when two names collide or a name is missing. One line per lot, with containers in parentheses; execution containers summed per lot. Only real discrepancies are listed. |
| Float noise in sums and in some saved sources (`463,99999999999994`). | Display at 12 significant digits. Values and comparisons are unchanged. |
| One read per mix, movement and lot. | One `in` read per block of 100 parent IDs. |
| `calculosAplicaciones.ts` was not watched by the drift detector. | Added with `src/types/aplicaciones.ts`; the type import now has an explicit `.ts` extension for the Deno bundle. |

Simulation after the fix (24 applications, plan and execution): 0 UUIDs in any answer; lines
median 24, max 89 (the 62-product application); characters median about 1,900. Conciliation:
156 match, 9 discrepancies (5 real base changes of about 2 %, 4 kg-per-tree fertilization
records), 40 not verifiable for missing data. Full suite 7,640 / 7,640, `tsc` and lint clean.
No paid model calls: the planner prompt, the tool registry and the core were not changed, and
the development set is labor only.
