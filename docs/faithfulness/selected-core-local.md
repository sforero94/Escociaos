# Selected reliability-first core — local candidate

This candidate restores only the eleven tools explicitly selected on November 2. It preserves the earlier thirteen bounded routes and four conditional routes, with their existing limits. A tool count is not a claim of full-domain capability. The other twenty-nine operations remain excluded; a fixed metadata-only explanation replaces a misleading offered-but-unexecutable tool. No online acceptance, deployment, migration, permission or provider change is part of this work.

## Selected tasks and evidence boundaries

| Tool | Previous checkpoint 5197 | Restored task | Important limits |
|---|---|---|---|
| `get_ganado_movimientos_detalle` | blocked before read | Registered movement history, canonical event groups and endpoints | Transfer legs are not independent heads/events. Closure of related groups is required; malformed or inconsistent groups are unavailable. No payment or physical delivery inference. |
| `get_ganado_inventory` | blocked before read | Stock hierarchy, stage totals, compatible density, dated latest weight, scoped variation and explicitly global pending rows | Farm area is not assigned to an individual lot/paddock. Missing inventory is unknown. Snapshot stock, movement window and global pending population remain separate. |
| `get_produccion_calidad` | blocked before read | Registered export/national quantities and valid percentages by lot/year/crop | Whole-lot source row has the established UI precedence over sublot rows. Missing breakdown is not zero; duplicate grain is ambiguous. |
| `get_monitoring_data` | blocked before read | Recorded monitoring incidence, severity and flowering by lot/pest/period | Incidence uses observed denominator; severity is individuals/affected trees, not a percentage. Flowering deduplicates within date/sublot/lot. No synthetic denominator or agronomic cause. |
| `get_production_data` | blocked before read | Agricultural kilograms, recorded productivity and an explicitly supported denominator | Unweighted mean of recorded productivities and ratio of sums are distinct. Recorded trees are not a claim of unique physical trees across years. |
| `get_harvest_shipments` | blocked before read | Harvest and shipment series, quantities, captured prices/values and requested customer grouping | Harvest dates and shipment dates describe different populations. Customer restriction affects shipments, not harvests. No delivery, receipt, collection or causal linkage. |
| `get_purchase_history` | blocked before read | Captured purchase quantities/costs by product, period and requested supplier | Stored cost is authoritative; no recomputation from today's price. Supplier identity/label requires current request purpose. No invoice, notes, document or employee payload. |
| `get_inventory_movements` | blocked before read | Entries, two distinct exit types and signed adjustments by product/unit/period | Adjustment quantity is signed; captured monetary valuation remains its stored value. No duplicate IDs, physical reconciliation or incompatible-unit addition. |
| `get_tareas` | blocked before read | Programmed/in-process board tasks, recorded state, priority and planned/actual dates | Estimated journals are planned, not executed labor. No responsible-person fields, salaries or observations. Null dates and incomplete pairs remain unknown. |
| `get_radiation_context` | blocked before read | Recorded daily energy, sunshine duration, coverage, configured band and bounded period comparison | Existing absolute energy difference and configured thresholds retained. Partial days are lower bounds; configured band is not demonstrated crop health or cause. Legacy absent-period date bounds are labeled explicitly. |
| `get_conductivity_data` | blocked before read | Recorded lot-date CE/pH and period summaries | Existing preaggregated source grain and units retained. Null is not zero; missing pH is unknown. No-date/all-history and explicit one-sided date bounds remain distinct. |

## Shared execution, privacy and usefulness

Existing authentication and channel gates run before reads. Web requires valid JWT/Gerencia and conversation ownership; Telegram retains Telegram activity/consultas/link gates. This work neither creates farm tenancy nor assumes service-role requests inherit user RLS. Previously documented differences in linked-user activity/role revalidation remain unchanged.

Only current request purpose permits customer/supplier identity fields. Names can be withheld while preserving requested identity grouping. The closed source port accepts adapter-built projections, exact counts, unique identities and a 20,000-row budget, with 200-row pages. Unknown tables, wildcard projections, caller pagination and unnecessary personnel/document fields fail before network access. A stable count is not an atomic snapshot; equal-count concurrent replacements remain possible.

The first model request is rebuilt from a small planner instruction and the actual current user request. Old assistant prose, tool payloads, metadata and memories do not enter that request. The model proposes structured tool calls; it does not author the final source facts. Selected adapters consume fresh source reads and the common compositor renders validated facts. No selected raw results are sent for a second model generation. Failures preserve independently supported parts and report the unavailable part. No source fact is recovered from old prose or inferred from an average.

Large result sets retain bounded explicit details, with source totals/coverage and omission notices where supported. Re-query a narrower scope for omitted raw detail. Hash/source consistency is not truth or provenance certification. Customer/supplier strings are not sent to external search or chart services.

## Retained limits outside these eleven

The earlier thirteen routes remain bounded rather than full-featured: observed milk pesajes are not quincenal production/sales; financial records are not P&G/cash collection; weekly overview is a labor alias; lot info is identity discovery; livestock milk-herd routes remain source excerpts; application estimates are not actual consumption. Automatic historical-memory recall, unverified generated interpretation and charts are not restored by this selection. Explicit own-memory operations and explicit individual activity retain their previous conditional policy. No additional individual access is granted.

Unsupported operations have fixed useful limitations, not a fabricated replacement calculation. Mixed requests retain available facts and expose the unsupported part. New-tool anaphoric identity references need a unique trustworthy selector; date inheritance alone must never widen a prior named population.

## Verification and release status

Final commit, file counts, exact check receipts and independent findings are recorded in the integration closeout. Synthetic adapter tests are necessary evidence, not model end-to-end quality acceptance. Shared-loop tests inspect outbound bodies, source projections, persisted context, fallback and contaminated history. Access tests distinguish actual Web rejection from Telegram static gate wiring/shared-loop parity. No new live Auth/PostgREST, business query or online question is authorized in this local phase.

Existing release controls and their source/recovery pins are unchanged. Their old runtime pins must reject this candidate at execution. A larger runtime file count requires a separately reviewed future release procedure; no count guard is relaxed here.

## Channel and purpose matrix

| Entry / request | Existing gate retained | Selected eleven | Individual fields / counterparty identity |
|---|---|---|---|
| Web aggregate | JWT, linked Gerencia role, conversation ownership | Same selected adapters behind the shared loop | No employee/contractor fields. Supplier/customer enrichment requires positive current purpose. |
| Web other role, invalid JWT or foreign conversation | Existing rejection before source/model access | Not reachable | No new grant. |
| Telegram aggregate | Webhook verification, active Telegram membership, `consultas`, linked identity | Same selected adapters; same source contracts | Same minimization; linked Web role/activity revalidation remains an existing difference, not silently added here. |
| Explicit individual request | Existing current-user selector and unique server binding, after entry gate | Does not authorize a new selected-domain query by itself | Existing conditional individual route retained; model-created selector never grants access. |
| Explicit own-memory request | Existing own-memory flow | Operational tools not offered for this request | Only its three memory tools; old memories are not automatic model context. |

A current named selector can restart a follow-up only when the actual user names that role/label and the adapter revalidates it against fresh metadata. A current date alone cannot recover a previous lot/product identity. An unresolved or orphan reference clarifies before source access. Full historical assistant prose is never selector authority. Quoted examples and references to earlier text do not grant customer/supplier purpose.

The source-schema tests compare projections and relationship targets with the versioned `src/types/database.ts`, including negative controls. This does not verify today's live schema, PostgREST relationship cache or a real authenticated request. Visible homonyms retain canonical IDs, including inventory facts whose scope has no entity list.

A small CE response can still exceed the 24 KB persisted evidence budget: visible facts remain useful, while persistence explicitly records `budget_exceeded` and requires a fresh query. The budget is not increased and no raw fallback is stored. Many groups/details have explicit omission budgets; neither an excerpt nor a stable count is advertised as an atomic snapshot.

Excluded operations (fixed limits, no source read): `get_hato_tratamientos`, `get_hato_chequeos`, `get_hato_salidas_finanzas`, `get_ganado_conciliacion`, `get_cosecha_trazabilidad`, `get_recomendaciones_ejecucion`, `get_carencia_cosecha`, `get_monitoreo_cobertura`, `get_inventario_conciliacion`, `get_producto_consumo`, `get_compra_detalle`, `get_finanzas_detalle`, `get_presupuesto_desviaciones`, `get_tarea_ejecucion`, `get_clima_cobertura`, `get_capturas_estado`, `get_informes_visita`, `get_application_details`, `get_application_cost_by_lote`, `get_cost_by_lote`, `web_search_agronomic`, `get_weather_forecast`, `get_beehive_data`, `get_budget_data`, `get_pyg_flujo_caja`, `get_hato_animal`, `get_hato_reproduccion`, `get_weekly_reports`, `get_pest_risk_priorizacion`.

## Frozen local receipts — checkpoint de71a7e, before handler verification

Final code checks: 6,383 tests in 276 files pass; TypeScript passes; ESLint has zero errors and the existing 907 warnings; production frontend build passes. Independent reviews cover each family and the common wiring; 25 projection/relationship checks use the versioned schema. The 24 synchronized module transformations and chat mirror comparison pass.

Relative to checkpoint `5197e9f`, the change comprises 16 canonical/backend files, 33 mirrored files, 19 tests, this document and the synchronization script. Runtime inventory is 109 files (checkpoint: 99); fingerprint using the existing pure release-proof format is `3d1f33bdeda591c02d5edce73f43e18cdbb3ade241e588a0b31316303565212b`. Existing release controls/pins remain unchanged. No publication, merge, deployment, live query or online campaign occurred in this phase. Parent review remains the next gate.
