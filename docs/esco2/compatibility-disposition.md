# Contract incompatibilities — local disposition

2026-11-03. Follow-up to integration recommendation `820a87d`. Changes stay inside the synthetic emitter; no product/legacy integration, provider, real data, access or deployment. Draft registry metadata is now `esco2-design-0.2`; the operation name remains a proposal, not an accepted external API.

## Resolved without an M2 choice

1. **Loss of validated request semantics.** The emitter accepted `grupo` and `metricas` but omitted both from `SolicitudLectura`. It now retains their exact validated values, operation name and registered date field in its frozen request. It does not choose aggregation or metrics for the caller. New regressions failed before correction and pass afterward.
2. **Overprojection within the prototype.** A journals-only request previously emitted the cost field as well. The registry now distinguishes fixed identity/date/scope columns (`identityProjection`) from metric columns. The emitter derives projection from those identity columns plus only requested metric fields, preserving registry order. It still has no row reader/result boundary. Tests cover journals only, cost only and both; a registry invariant checks that every advertised metric has a registered source and unit.
3. **Contradictory null-lot wording.** The schema formerly said that an empty lot list included unassigned rows without explaining their separate permission. Its wording now matches the existing tested rule: empty means current authorized scope; unassigned rows require a separate server permission. No access policy was widened.
4. **Mechanical date-key incompatibility.** The pure `convertir_fechas_legadas` probe renames only `date_from/date_to` to `desde/hasta`. The caller must explicitly supply `lotes/grupo/metricas`; there are no defaults. It validates against the same canonical registry, makes defensive copies, and rejects missing/conflicting aliases and every extra legacy field. It is not a replacement for legacy operation resolution or proof of semantic equivalence.

The date converter rejects `lote_name` (even null), `reference_day`, personal selectors and mixed canonical/legacy keys rather than dropping or interpreting them. Calling it successfully grants no permission; any future use must still pass the authorized operation boundary. These syntactic conversions are exploratory local artifacts, not approval to expose a compatibility API.

## Gate-dependent parts left unchanged

| Incompatibility | Alternatives for M2 review | Why this follow-up stops there |
| --- | --- | --- |
| Legacy name selector versus canonical resolved IDs | New endpoint uses only canonical plan; or an explicit approved adapter resolves names with fresh authorized catalog and clarification rules | No agreed production selector/context interface, and no qualified catalog/authorization source. Do not guess IDs, silently treat null as a known selector, or preserve stale scope. |
| Existing `Scope/Evidence` versus proposed per-part envelope | Adopt a new versioned result contract; or a strict proof-preserving adapter with explicit unmapped states/metrics | No accepted result mapping. `ok` does not imply complete answer; error must not become no-records. Missing population proof or null group cannot be manufactured. |
| Legacy `labor.count` and broader metric IDs versus the narrow registry | Explicitly include another metric after scope approval; or keep it unmapped and report unsupported | Do not expand the operation silently or confuse record count with journals. Application labor cost and input cost also remain separate concepts. |
| Runtime numeric/provenance check versus evaluation number candidates | New strict assertion-to-fact guard; or qualified reuse with additional population/unit/date/provenance validation | No result/composer envelope accepted yet. Parsing a candidate value is not evidence; do not connect a superficial numeric matcher. |
| Python evidence versus current Vitest-only CI | Retain offline probes with a dedicated explicit CI job; or port selected contracts into native Vitest using one production registry | Product implementation/test strategy belongs to the approved block. No CI/workflow/dependency changes here. |

No alternative is selected by this document. They do not authorize product wiring, a second production registry, database changes or M2.5 execution. Existing snapshot/provider/security gates still apply.

## Verification

```sh
python analysis/esco2-design/check_contracts.py
python analysis/esco2-design/check_direct_boundary.py
python analysis/esco2-design/check_labor_compatibility.py
python analysis/esco2-design/check_integration_scope.py --base 43c3e887e503b8cd8c064cddc7085dfb4880d2f6
```

Current local total: 5 registry + 17 boundary + 6 syntactic compatibility cases = 28. The propagation/projection regressions failed against the preceding prototype, then passed after correction. Date compatibility tests cover exact renaming, no ignored legacy selectors, conflicting aliases, explicit options, canonical validation and copy isolation. Tests are synthetic; no live security, planner, answer-quality or product compatibility claim follows.

The separate read-only reviewer `/root/review_b_boundary` reran all 28 cases and the whitespace check successfully, and found no implicit M2 choice or product/provider connection in these changes. This is a bounded synthetic review, not product acceptance.
