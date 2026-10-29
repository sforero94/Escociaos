# Application retrieval and date-order correction

## Decision and baseline

Owner-approved scope: application searches use actual execution dates by default; planned dates only on explicit intent. Validate start/end within each planned and actual pair independently. Do not compare planned start to actual end, infer absent actual dates, or rewrite existing records.

Baseline main `f175c78a1bc65955f34247589698958565ab20b6` includes359/361 and the accepted security/runtime releases. This correction is source-only until separately approved activation. No private case text, record identifiers or production result bodies belong in this document or fixtures.

## Exposed tool inventory and routing

| Existing tool | Baseline schema and purpose | Corrective behavior |
| --- | --- | --- |
| get_aplicaciones_ejecucion | Required date_from/date_to; optional application_id, lote_name, detalle_offset; plans, actual movements, recipes and work | Existing direct execution route gains optional current scope, application_name, estado and date_basis. Current actual scope defaults to En ejecución without inventing a week; explicit period requires both dates. Generic animal filters are not exposed here. |
| get_application_summary | Optional application_id/date_from/date_to/type; planned-start filter, limit30 | Actual-start default; explicit planned basis, normalized name/state/type. Still a bounded legacy summary, not complete absence evidence. |
| get_application_details | Required application_id; closure/calculation/foci details | UUID detail path retained; not name discovery. |
| get_application_cost_by_lote | application_id or application_name; previously latest partial-name candidate | Normalized matching across pages; ambiguous name rejected, no latest-candidate guess. Actual date displayed by default. |
| get_cost_by_lote | Required dates; application-cost aggregation with planned-start selection | Actual-start selection by default; planned basis explicit. Existing cost calculations retained. |
| get_weekly_overview | Optional dates; wraps legacy application summary | Forwards explicit date basis to its application component. |

There is no separate active-only or progress-only tool. Both channels expose the same tool list/loop. Adjacent task, inventory and recommendation tools cannot establish application absence. Source inspection and the narrowly authorized case lookup established a skipped direct execution route; it did not establish that every raw database row was returned through the user's permission-aware tool result.

Current status/progress questions force the existing execution tool on the first model round. Date basis is a schema enum and runtime argument: unsolicited planned basis is rejected before the database call. This conservative language detector is not a general semantic intent parser. Explicit date ranges are preserved; actual-period candidates use actual start or in-range actual movements. No planned fallback is allowed. Names normalize accents, case and whitespace; multiple candidates require clarification. Raw plan quantities use aplicaciones_calculos, per the application module contract, with no derived percentage or cost formula.

The final response guard requires complete execution evidence. Wrong-domain, missing, malformed, errored (including falsy error values), truncated and incomplete results cannot prove absence. Unique missing-actual-date results disclose that limit on actual-basis queries; explicitly requested planned evidence remains usable. Empty complete results describe only the queried scope. Both date pairs and conflicts remain visible. Successful unique evidence still permits model narrative; this does not prove complete factual entailment or calibration.

## Write boundaries and migration188

- Calculator create/edit validates planned dates before writing; clearing the required start propagates to parent state and fails final save.
- Start modal validates actual start against any recorded actual end.
- Closure payload/PDF validation uses actual dates, requires closure endpoints, and no longer substitutes planned start. The existing transactional closure RPC is unchanged.
- Draft188 adds a security-invoker trigger on aplicaciones inserts and updates of the four date columns. It rejects reversed pairs independently with SQLSTATE23514. Null ends and same-day pairs are valid. Existing bad pairs are grandfathered only while that pair remains unchanged; unrelated edits or a valid change to the other pair can proceed. No new grants, RLS change or historical data rewrite.

Before any database activation, an authorized owner must run metadata/schema compatibility review and a narrowly scoped aggregate preflight for reversed planned/actual pairs. Do not export row bodies. Decide cleanup separately if bad historical rows exist; do not silently repair dates. Apply188 only after specific approval, then verify direct insert/update and closure atomicity in an authorized staging environment. A full CHECK constraint and mandatory cleanup are intentionally not introduced.

## Validation and release limits

Synthetic tests exercise actual tool-loop requests with fixed synthetic configuration and a closed fetch fixture. Unexpected HTTP requests fail; there is no inherited-network fallback or real provider invocation. Controls cover active applications outside planned windows, explicit actual/planned ranges, null dates, normalized and ambiguous names, malformed arguments, incomplete absence, wrong-domain results and date conflicts. Date tests cover same-day, leap/calendar validity, reversed independent pairs and date-only values; instants are rejected.

The draft migration ran only on an isolated PostgreSQL17 table in Docker with network=none and no host ports. Eleven checks cover independent pairs, null ends, reversed insert/update, unchanged legacy rows, pair-specific updates, simulated closure transaction rollback and timezone-independent date values. The simulation is not the complete production closure/RLS schema. Independent reviewers checked retrieval and UI/database boundaries; review findings were corrected with regressions. Final-head command receipts and CI are recorded in the PR/handoff, not inferred from historical run counts.

Activation gates remain separate: review/merge approval, migration preflight and application approval, synchronized backend CLI deployment with verified rollback, frontend rollout and live permission-aware acceptance. No real application query/model traffic or business mutation is performed by this draft. Backend rollback must restore approved source/config; source equality does not guarantee bit-identical bundles/dependencies. If188 is later applied, remove its trigger/function only under a reviewed rollback; preserve all business data. Temporary prior-release controls remain unchanged. Offline363→364→366 remains queued.
