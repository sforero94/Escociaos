# Measurement contract v1 (P0-01)

This is a local measurement contract, not a release gate or a relabeling of the private dataset. Legacy fields remain unchanged. `estado` and `tasa_pasa` still describe the existing harness, including deterministic-only passes and infrastructure inconclusives. New `medicion` fields must be used for service-success interpretation.

## Populations and missingness

The approved v2 population is 59 records, 56 included and 3 excluded. The private dataset determines the IDs; do not guess which three are excluded. The runner supplies all selected included IDs to `resumir`, including when writing intermediate results. With no filters this accounts for all 56 IDs as present or missing. Filters explicitly change the population. Repetitions and variants count as separate observed runs. Case coverage counts distinct IDs, and does not prove every planned repetition completed. Interrupted runs expose missing cases; a future scheduled-run manifest must account for missing repetitions too.

`medicion.total` is every observed run, including execution exceptions, omitted/invalid judges and absent traces. Verified service-success rate is `exito_verificado / total`, or null for zero runs. It requires a legacy pass, a valid available judge, no execution error or blocked write, a nonempty answer for every turn, and an attributed review that marks the response appropriate with no recorded failures. It is conservative and remains zero when review is absent. It is not a real-model improvement claim.

`ejecucion_fallida`, `juez_no_disponible`, `traza_ausente`, and `sin_revision` are overlapping counts over total observed runs. Missing turns or blank answers mean absent traces. Zero tool calls alone do not: greetings and clarification can legitimately need none. Historical missing tool summaries are unknown, not execution failures. A tool error alone need not fail service success if a reviewed answer correctly explains the limit. Infrastructure exceptions always fail service success even when legacy semantic status is inconclusive. A judge object with status other than `ok` is unavailable.

Legacy `tasa_pasa = pasa / (pasa + falla)` excludes inconclusives and is retained for compatibility only. Calibration still uses the original human labels and its existing exclusions. Neither rate estimates online production performance.

## Outcomes and human review

`RevisionMedicion` records reviewer and rubric version, response outcome, appropriateness, failure categories/severity and claim-level evidence. No outcome is inferred from a phrase, citation, numeric anchor or existing pass. Complete and partial answer counts describe reviewed response forms, including inappropriate ones. They use total observed runs as the coverage denominator; `sin_revision` exposes the unknown population. Appropriate clarification and abstention counts require verified success. They remain distinct from useful answer coverage (complete/partial response forms); an all-abstention system has zero answer coverage. A partial response can succeed when the request cannot be fully answered and it accurately states the limitation; it never counts as complete.

Human reviewers split checkable claims into atomic metric/entity/period/unit/value assertions. For each, inspect the evidence actually available at answer time and record source references plus a supporting or contradicting excerpt/calculation. Label support `completo`, `parcial`, `ausente` or `no_verificable`. Citation presence alone establishes nothing. `tasa_soporte` divides fully supported claims by all reviewed claims; partial and unverifiable claims stay in the denominator. Zero reviewed claims yields null. Report review coverage alongside it; this is not an automatic semantic detector.

Failure categories are independent and may overlap: `afirmacion_sin_soporte` (evidence does not support the claim), `recuperacion_incorrecta` (wrong/incomplete source selection against reviewed truth), `calculo_incorrecto` (wrong derivation), and `contradiccion_conversacion` (unexplained same-scope inconsistency). Reviewers attach evidence; do not infer a retrieval/calculation category from a generic judge failure. Severity: `menor` is a limited defect without a changed decision, `mayor` changes a substantive answer, `critica` can drive a materially harmful operational/financial decision, fabricate persistence, or cross an access boundary. Counts are failure events, not distinct runs. Any reviewed failure prevents verified success; thresholds remain D07 decisions.

## Initial seed list and review gates

Exact seed IDs from BASELINE.md: ESCO-GS-004, 005, 009, 012, 013, 014, 015, 016, 017, 021, 024, 028, 032, 033, 036, 037, 040, 041, 044, 045, 048, 054, 055, 058. They cover attribution, closure, ambiguity, execution, definitions, missing measurements, aggregates, inventory, consistency and commands. They are proposals for fixtures, not frozen historical truth.

P0-02 must adjudicate ESCO-GS-001, 030, 039, 040, 042; separately review 054 persistence wording and 056 malformed judge output. These remain in coverage; unresolved labels do not become enforced assertions. P0-03 can begin with undisputed synthetic seeds. No private evidence was available in this session, and no original labels were changed.
