# Bug: Weekly report clima uses volatile table + Incidencia average-of-averages
**Date:** 2026-04-16  
**Severity:** High  
**Status:** Fixed

---

## Bug 1: Weekly report climate data missing

### Symptom
The weekly report (informe semanal) for S15 (Apr 6-12, 2026) shows weather data with only one data point (Dom 12) instead of 7 days. KPI values reflect only that single day's readings.

### Reproduction path
1. Generate weekly report for any past week (e.g., S15: Apr 6-12)
2. `fetchClimaResumenSemanal()` in `src/utils/fetchDatosReporteSemanal.ts` queries `clima_lecturas`
3. `clima_lecturas` is pruned to a 24h rolling window by a daily cron (migration 036)
4. By the time the report is generated, Apr 6-11 data has been deleted — only Apr 12 remains

### Hypotheses evaluated
| Hypothesis | Status | Evidence |
|---|---|---|
| Wrong table (`clima_lecturas` vs `clima_resumen_diario`) | Confirmed root cause | Line 1679 queried volatile table; migration 035/036 confirm daily pruning |
| Timezone double-conversion | Secondary (fixed by rewrite) | Line 1718 manually subtracted 5h; no longer needed with date-based table |
| Historical 4-week query also broken | Confirmed | Line 1754 also used `clima_lecturas` — always empty for past data |

### Root cause
`fetchClimaResumenSemanal()` queried `clima_lecturas` (24h rolling window) instead of `clima_resumen_diario` (permanent daily summaries). Both the main query and the 4-week historical comparison query had this issue.

### Fix
Rewrote `fetchClimaResumenSemanal()` to query `clima_resumen_diario` using `fecha` date ranges. Eliminated timezone conversion bugs since the table uses plain dates (already in Bogota timezone). Both the main and historical queries now use the permanent table.

**File:** `src/utils/fetchDatosReporteSemanal.ts` — `fetchClimaResumenSemanal()`

---

## Bug 2: Incidencia average-of-averages in monitoring snapshot

### Symptom
Lote-level incidencia in the monitoring dashboard snapshot table is calculated as a simple average of sublote percentages instead of a weighted average based on tree counts. Example: La Vega shows Cucarron marceño 33.3% = (17.1 + 40 + 42.9) / 3, which is mathematically incorrect.

### Reproduction path
1. Open monitoring dashboard → Snapshot table
2. Expand a lote with multiple sublotes (e.g., La Vega)
3. Lote-level percentages are simple averages of sublote percentages

### Hypotheses evaluated
| Hypothesis | Status | Evidence |
|---|---|---|
| Simple average of `incidencia` percentages | Confirmed root cause | Lines 643-646: `total += m.incidencia`, line 684: `total / count` |
| Missing raw tree count data | Ruled out | `MonitoreoRow` has `arboles_afectados` and `arboles_monitoreados` |
| Same bug in other components | Partially confirmed | GraficoTendencias and some MonitoreoDashboardV2 calculations also use simple averages (not fixed — separate scope) |

### Root cause
`calcularSnapshot()` in `DashboardMonitoreoV3.tsx` aggregated by summing `incidencia` (already a %) and dividing by observation count. Should sum `arboles_afectados` and `arboles_monitoreados` separately, then compute `(totalAfectados / totalMonitoreados) * 100`.

### Fix
Changed `plagasMap` structure from `{ total, count }` (sum of percentages / count) to `{ afectados, monitoreados }` (sum of raw tree counts). The final percentage is computed as `(afectados / monitoreados) * 100`. Applied to both lote-level and sublote-level aggregation.

**File:** `src/components/monitoreo/DashboardMonitoreoV3.tsx` — `calcularSnapshot()`

---

## Tests
- [ ] Generate weekly report for a past week — verify 7 days of climate data appear
- [ ] Verify climate KPIs match `clima_resumen_diario` values
- [ ] Verify 4-week historical comparison populates
- [ ] Open monitoring snapshot — verify lote-level incidencia matches weighted calculation
- [ ] Expand La Vega — verify lote % != simple average of sublote %s
- [ ] Verify sublote-level values unchanged (single observation per pest)
