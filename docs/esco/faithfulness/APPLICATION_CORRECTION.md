# Application retrieval and date-order correction

## Decision and baseline

Owner-approved scope: application searches use actual execution dates by default; planned dates only on explicit intent. Validate start/end within each planned and actual pair independently. Do not compare planned start to actual end, infer absent actual dates, or rewrite existing records.

Baseline main `f175c78a1bc65955f34247589698958565ab20b6` includes359/361 and the accepted security/runtime releases. This correction is source-only until separately approved activation. No private case text, record identifiers or production result bodies belong in this document or fixtures.

## Exposed tool inventory and routing

| Existing tool | Baseline schema and purpose | Corrective behavior |
| --- | --- | --- |
| get_aplicaciones_ejecucion | Required date_from/date_to; optional application_id, lote_name, detalle_offset; plans, actual movements, recipes and work | Existing direct execution route gains optional current scope, application_name, estado and date_basis. No implicit state filter is added to identity or general lookup; explicit estado selects active lists without inventing a week; explicit period requires both dates. Generic animal filters are not exposed here. |
| get_application_summary | Optional application_id/date_from/date_to/type; planned-start filter, limit30 | Actual-start default; explicit planned basis, normalized name/state/type. Still a bounded legacy summary, not complete absence evidence. |
| get_application_details | Required application_id; closure/calculation/foci details | UUID detail path retained; not name discovery. |
| get_application_cost_by_lote | application_id or application_name; previously latest partial-name candidate | Normalized matching across pages; ambiguous name rejected, no latest-candidate guess. Actual date displayed by default. |
| get_cost_by_lote | Required dates; application-cost aggregation with planned-start selection | Actual-start selection by default; planned basis explicit. Existing cost calculations retained. |
| get_weekly_overview | Optional dates; wraps legacy application summary | Forwards explicit date basis to its application component. |

There is no separate active-only or progress-only tool. Both channels expose the same tool list/loop. Adjacent task, inventory and recommendation tools cannot establish application absence. Source inspection and the narrowly authorized case lookup established a skipped direct execution route; it did not establish that every raw database row was returned through the user's permission-aware tool result.

Application existence/status/progress questions and explicit fumigation/fertilization synonyms force the existing execution tool on the first model round. Non-farm application meanings are excluded conservatively; explicit agricultural nouns take priority. Merely mentioning a planned date does not authorize planned basis: positive intent is required and actual instructions, negation or mixed requests retain the actual default. Date basis is a schema enum and runtime argument: unsolicited planned basis is rejected before the database call. This conservative language detector is not a general semantic intent parser. Explicit date ranges are preserved; actual-period candidates use actual start or in-range actual movements. No planned fallback is allowed. Names normalize accents, case and whitespace; multiple candidates require clarification for singular lookup; legitimate plural/historical collections remain usable. Raw plan quantities use aplicaciones_calculos, per the application module contract, with no derived percentage or cost formula.

The final response guard requires complete execution evidence. Wrong-domain, missing, malformed, errored (including falsy error values), truncated and incomplete results cannot prove absence. Unique missing-actual-date results disclose that limit on actual-basis queries; explicitly requested planned evidence remains usable. Empty complete results describe only the queried scope. Both date pairs and conflicts remain visible. Successful unique evidence still permits model narrative; this does not prove complete factual entailment or calibration.

## Write boundaries and migration188

- Calculator create/edit validates planned dates before writing; clearing the required start propagates to parent state and fails final save.
- Start modal compares date-only strings against the browser local calendar day (including positive UTC offsets), then validates actual start against any recorded actual end.
- Closure payload/PDF validation uses actual dates, requires closure endpoints, and no longer substitutes planned start. The existing transactional closure RPC is unchanged.
- Draft188 adds a security-invoker trigger on aplicaciones inserts and updates of the four date columns. It rejects reversed pairs independently with SQLSTATE23514. Null ends and same-day pairs are valid. Existing bad pairs are grandfathered only while that pair remains unchanged; unrelated edits or a valid change to the other pair can proceed. No new grants, RLS change or historical data rewrite. CREATE TRIGGER is deliberately non-idempotent: inspect migration ledger and object metadata before application; never blindly retry after an uncertain outcome. The calculator may reject unchanged legacy reversed planned dates while unrelated direct updates remain grandfathered; cleanup remains a separate decision.

Before any database activation, an authorized owner must run metadata/schema compatibility review and a narrowly scoped aggregate preflight for reversed planned/actual pairs. Do not export row bodies. Decide cleanup separately if bad historical rows exist; do not silently repair dates. Apply188 only after specific approval, then verify direct insert/update and closure atomicity in an authorized staging environment. A full CHECK constraint and mandatory cleanup are intentionally not introduced.

## Validation and release limits

Synthetic tests exercise actual tool-loop requests with fixed synthetic configuration and a closed fetch fixture. Unexpected HTTP requests fail; there is no inherited-network fallback or real provider invocation. Controls cover active applications outside planned windows, explicit actual/planned ranges, null dates, normalized and ambiguous names, malformed arguments, incomplete absence, wrong-domain results and date conflicts. Date tests cover same-day, leap/calendar validity, reversed independent pairs and date-only values; instants are rejected.

The draft migration ran only on an isolated PostgreSQL17 table in Docker with network=none and no host ports. Eleven checks cover independent pairs, null ends, reversed insert/update, unchanged legacy rows, pair-specific updates, simulated closure transaction rollback and timezone-independent date values. The simulation is not the complete production closure/RLS schema. Independent reviewers checked retrieval and UI/database boundaries; review findings were corrected with regressions. Final-head command receipts and CI are recorded in the PR/handoff, not inferred from historical run counts.

Activation gates remain separate: review/merge approval, migration preflight and application approval, synchronized backend CLI deployment with verified rollback, frontend rollout and live permission-aware acceptance. No real application query/model traffic or business mutation is performed by this draft. Backend rollback must restore approved source/config; source equality does not guarantee bit-identical bundles/dependencies. If188 is later applied, remove its trigger/function only under a reviewed rollback; preserve all business data. Temporary prior-release controls remain unchanged. Offline363→364→366 remains queued.

## Independent correction pass after initial draft

The initial493d587 candidate passed its tests but parent review found five runtime/date-boundary gaps: planned mention overriding an actual instruction; missing existence/fumigation routing; UTC-parsed start dates rejecting local today; plural collections treated as singular ambiguity; and hidden active-state filtering excluding named/exact-ID closed applications. Corrections add focused controls, including mixed planificadas/real wording and agricultural queries mentioning the app. Ten tests invoke actual create/edit/start/close handlers through a controlled hook renderer: invalid or missing dates expose error text with zero database calls. Effects/children are mocked; this is not DOM/browser acceptance.

Parent independently ran15 persistence acceptance groups against initial493d587 using real local GoTrue/JWT/PostgREST and complete RPC106, blob3d6915570c2a3274188d061792475c2271b9a60c. It covered closure operations, trigger23514 rollback, final-movement failure rollback, inventory/double-close controls, representative permissions and legacy grandfathering. Schema/policies were synthetic; no React UI or chat JWT gate was exercised. Migration188 is unchanged (SHA2564d7342094630214b32c6b04a9f67c6cc6c849f16cfa02b4b8f73a75d6ef36183). That receipt is attributed to its tested head; applicability to a final candidate requires reviewing the unchanged persistence artifacts, not relabeling the run.

## Clause-local date-basis correction after2987e62

Parent re-review found remaining unauthorized planned selection from a descriptive relative clause, broad incidental-app exclusion, and cross-clause negation. Date-basis recognition now accepts bounded direct date-object/basis requests per clause. Mere state adjectives ("aplicaciones planificadas") do not request a planned date basis; those earlier synthetic assumptions were corrected to preserve the owner's actual-date default. Negation can revoke prior consent within its own clause, including courtesy prefixes and verb variants, without granting another basis. A later positive explicit request resolves a preceding contrast; mixed direct requests retain the safe actual default. Incidental "app" text no longer overrides the agricultural application question. This finite grammar is conservative, not universal natural-language understanding. The explicit typed argument and runtime denial remain enforced.

## Supported adjacent intent matrix

| Request pattern | Planned basis |
| --- | --- |
| Usa fechas planeadas, pero no las uses | No: unresolved revocation withdraws consent |
| Usa fechas planeadas y no las reales | Yes: the negative clause explicitly excludes actual dates |
| No uses fechas reales; usa las planeadas | Yes: the later positive clause is explicit |
| Dame las aplicaciones planeadas para mayo | Yes: direct requested planned collection |
| Dame el estado de la aplicación cuya fecha planeada estaba mal | No: descriptive relative clause only |
| Mixed positive planned and actual dates | No: safe actual default |

A negative clause without an explicit date basis conservatively withdraws prior planned consent without guessing its referent or verb form. This can also withdraw consent for an unrelated negative instruction; it does not claim complete language understanding. Bare planned-state adjectives remain insufficient, while a direct requested planned collection is supported explicitly. Adjacent regression failures were reproduced before fixes; independent bounded matrix/revocation review passed. No release controls were implemented.
