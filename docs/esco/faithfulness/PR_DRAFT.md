# Draft: application lookup and independent date-order validation

Application progress questions can miss a running application when retrieval filters planned dates or queries adjacent domains. This correction routes current status/progress questions to the existing execution tool, matches accents/spacing, requires disambiguation, and refuses absence claims from incomplete evidence.

Application queries default to actual execution dates. Planned dates require explicit user intent and a validated argument. Explicit historical actual ranges remain supported; absent actual dates never fall back to planned dates. Both date pairs remain visible, with unknown/conflicting dates disclosed.

The calculator create/edit, start and closure paths reject start-after-end within each independent actual/planned pair. A draft database trigger extends that invariant to direct writes without rewriting legacy rows. Same-day, null-ended/in-progress and date-only behavior are preserved. Real plan quantities come from aplicaciones_calculos; no new cost/progress formula is introduced.

Baseline main: f175c78a1bc65955f34247589698958565ab20b6. Both edge source mirrors are synchronized. Only synthetic tests; no private logs/fixtures, providers, production writes or applied migrations. Final candidate SHA and checks belong to the PR/handoff, distinct from this pre-commit text. Migration188 and backend deployment require separate reviewed activation; this draft does not make the correction live.

Rollback: revert UI/backend source together; if the trigger is later applied, separately remove it under a reviewed database rollback. No historical data cleanup is included. Unknown dates remain unknown. Full narrative entailment and live model quality are not established.

Business one-liner: Finds the intended application using real execution dates and prevents new reversed date ranges without guessing missing evidence.

Corrected candidate validation:4983 tests/225 files,168 evaluator tests,168 focused application/date/query/handler tests; zero skips. Types, lint (907 existing warnings/zero errors), build25.10s and source parity passed. Independent retrieval review passed; ten actual-handler negative cases show error text with zero database calls. Hook/effect mocks are not DOM/browser acceptance. Corrected head and fresh CI belong to the PR/handoff.

Parent review supersedes initial green493d587: planned mentions no longer authorize planned basis; existence/fumigation synonyms route; local today is date-only; plural historical collections are not singular ambiguity; named/exact-ID discovery has no implicit active-state filter. Explicit active filters still work. Migration188 remains byte-identical, non-idempotent, unapplied and separately gated. Parent real Auth/PostgREST/fullRPC receipt is attributed to493d587 and unchanged persistence artifacts, not relabeled final-head/live coverage.

Latest correction replaces whole-sentence planned mention matching with bounded clause-local direct date-basis requests and revocation. State adjectives alone do not authorize date basis; incidental app wording cannot bypass farm routing. Independent mixed-clause review passed. No release workflow is implemented; activation remains separately gated.
