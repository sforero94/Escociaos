# Supplemental QA findings and harness limits

2026-11-04. These checks apply the existing frozen P0 source matrix. They do not alter
frozen scenario expectations or the 16-scenario denominator.

1. A complete work population containing a task ID absent from the catalog was silently
   filtered before aggregation. Both candidates returned `respondida` with a subtotal.
   `qa/source-boundaries.test.ts` independently reproduced this integration defect.
2. Both candidates certified grouped reconciliation when the source declared independent
   table reads. The frozen contract requires a coherent synthetic snapshot for this equality.
   The same supplemental file reproduced the missing precondition.

3. A task with a non-null type ID missing from the complete type catalog could be silently
   removed by a category filter before validation. Both candidates asserted a subtotal.
4. An explicit unread category-field declaration was ignored when raw supplied values still
   existed. Both candidates treated those values as executable filter evidence.

The second supplemental run at 18:14 UTC reproduced four category failures while the four
older controls passed. The same eight-test file retains all controls.

Initial supplemental run: four failures (both mechanisms in both variants), command
`npm test -- scripts/esco2/recovery/qa/source-boundaries.test.ts`, 2026-11-04 18:12 UTC.
The implementer owns fixes. Final results require a fresh uniform run, not deletion of controls.

The first aggregate run at `2026-11-04T18-10-59-230Z` used a preliminary baseline projection
which did not translate IDs and existing task-metadata capability faithfully. Its baseline
1/16 score is not a capability estimate. Preserve the artifact; interpret the corrected run.
Both candidate16/16 results and8/8 mutation results were observed in that run, but later
supplemental failures show why those alone were insufficient to close the experiment.

Stage C uses real `autorizarGerencia`, the fixed `fuenteSupabase` reader, and the existing
synthetic PGlite RLS policies. The local wrapper injects typed scripted plans. It does not
replace the production HTTP handler and does not exercise an actual model planner/parser.
An additional unchanged `manejar` HTTP control executes the real baseline orchestration
with one scripted tool call and a deliberate offline composer failure, then checks the
actual SQL total3 and Bogotá date. Candidate source-profile overlays recreate unread snapshot
properties after SQL reads because SQL NULL cannot represent a missing snapshot property.
This shim is explicit; no current live reader completeness is certified.

Business-ID columns in the test database use text for fresh short synthetic IDs. User IDs,
auth functions, active-Gerencia checks and the literal RLS policy predicates retain the
existing harness. The harness does not verify real JWT cryptography or deployed RLS state.
The wrapper now forwards state ownership unchanged. Legitimate fixture owner mapping lives
in test arrangement; a separate foreign-owner test confirms that state cannot select a task.

## Final QA assessment

Final uniform verification completed at 2026-11-04 18:20 UTC. The main loop independently
reran 285/285 tests across11files:161 isolated experiment tests plus124 focused existing
regression tests. Explicit experiment TypeScript, root typecheck and scoped ESLint passed.
No runtime source was integrated or changed by the experiment.

Final A/B evidence is `qa/results.json`, run `2026-11-04T18-20-21-208Z`. Both repair and
redesign pass all16 frozen scenarios with zero observed false semantic tuples, X01, all8
runtime mutation classes and all8 legitimate positive controls. Independent oracle sensitivity
also detects all8 candidate mutations; modified factual prose is rejected separately.
The eight supplemental source checks and two planner-prose checks pass after implementation
fixes. These are development-set results after adversarial iteration, not a fresh generalization set.

The final baseline diagnostic passes3/16 after faithful ID/capability translation and D30
scope projection. Its four normalized contract discrepancy flags are NOT four proven raw
baseline critical assertions. The actual unchanged-core defect probes separately demonstrate
only the two recorded mechanisms: unread association becomes false absence; the composer
accepts swapped metric/entity magnitudes and a question-only number. Initial baseline1/16
and intermediate2/16 scores are superseded adapter diagnostics, not valid capability estimates.
No frozen scenario, expected value, oracle, rubric or denominator changed for these corrections.

Stage C evidence is `qa/rls-results.json`, run `2026-11-04T18-20-21-229Z`. All three variants
received the same17 typed-plan inputs through the local gate/source/RLS wrapper. Denied callers
never reached planning or labor tables. Foreign-owner state did not select a task. The unchanged
HTTP handler's independent SQL total and Bogotá date checks passed. The wrapper limitations
above remain binding. Candidate and baseline implementation hashes remained identical before
and after both final comparison runs. All five P0 frozen hashes matched.

Measurements on the11 fully substantive cases show mean native evidence A1370.727bytes and
B1347.091bytes, with local native median0.0265ms and0.024208ms respectively. Timing repetitions
are measurements of the same cases. These small local differences do not establish a provider,
production or maintenance advantage. Both options satisfy the bounded mechanism gate; repair
is a viable simplest-scope choice. QA does not authorize implementation beyond P1.

The result does not establish natural-language planning accuracy, real JWT cryptography,
production RLS/completeness, deployment readiness or five-domain acceptance. No paid calls,
production reads, migrations, deployment, commit or push were part of QA. D17 remained intact.
P2 requires Santiago's new decision.
