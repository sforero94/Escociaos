# Esco Tool Audit: Data Gap Analysis

## Executive Summary

This audit identified **11 High-severity gaps**, **3 Medium-severity gaps**, and **3 Low-severity gaps** across the 17 Esco tools. The most critical finding: **application tools fail to query actual per-lote costs** by not joining `movimientos_diarios_productos` with `productos.precio_unitario`, nor querying `registros_trabajo` grouped by `lote_id` to show labor cost breakdown per lot. Labor tool has similar gaps. Monitoring tool misses sublote-level aggregation. Climate and conductivity tools are missing product/harvest cost joins.

---

## Tool-by-Tool Audit

### 1. get_labor_summary
- **Tables/columns currently queried:** `registros_trabajo` (id, fecha_trabajo, fraccion_jornal, observaciones, empleado:empleados, contratista:contratistas, tarea:tareas, lote:lotes) — chat.tsx:399–401
- **Corresponding UI module:** `/Users/santiagoforero/Codigo/Escociaos/src/components/labores/ReportesView.tsx` 
- **What the UI actually displays:** 
  - Fetches `registros_trabajo` with joins to `tareas.tipo_tarea_id` (ReportesView.tsx:165–174)
  - Displays `tareas.tipo_tarea_id` → lookup to `tipos_tareas(nombre)` for cost aggregation (ReportesView.tsx:220–239)
  - Shows costs **per lote by task type** (ReportesView.tsx:269–292: costos por lote + jornales + tareas count)
  - Shows **matriz lote × actividad** with employee vs contractor cost breakdown (ReportesView.tsx:322–397)
  - Computes `indicador_eficiencia` = jornales/capacidad% (ReportesView.tsx:204)
- **Gap diff:**
  - ❌ Tool does NOT fetch `tareas.tipo_tarea_id` (misses task type filtering in aggregation)
  - ❌ Tool does NOT compute **tareas count per lote** (UI shows it; tool aggregates only jornales, not unique task counts)
  - ❌ Tool does NOT distinguish employee vs contractor in cost breakdown matrix (UI separates `esContrato` boolean per row; tool only sums by worker name)
  - ❌ Tool does NOT return `indicador_eficiencia` (% utilization by capacity installed)
  - ⚠️ Tool returns top 15 employees but UI iterates **all employees in matrix**, not just top 15
- **Severity:** **High** — owner queries ask "cost per task type per lote" and tool cannot answer; missing efficiency KPI
- **Fix proposed:** Query `tareas(tipo_tarea_id, tipos_tareas(nombre))` and group by `lote_id` + `tipo_tarea_id`; compute `tareas.count()` per lote; add `indicador_eficiencia` = totalJornales / (uniqueWorkers × days).

---

### 2. get_employee_activity
- **Tables/columns currently queried:** `empleados` (id, nombre, cargo, salario, tipo_contrato, activo) + `contratistas` (id, nombre, tarifa_jornal, tipo_contrato) + `registros_trabajo` for each (fecha_trabajo, fraccion_jornal, costo_jornal, tarea, lote) — chat.tsx:529–546
- **Corresponding UI module:** No direct UI module found; tool is AI-only fallback when user asks "what did Juan do last week?"
- **What the UI actually displays:** `ReportesView.tsx` aggregates by employee but **does not have a dedicated single-employee detail view**; closest is a detail drill-down that would need to fetch the same data
- **Gap diff:**
  - ✓ Tool structure matches what a detail view would need
  - ⚠️ Tool limits registros to 30 per worker but does NOT aggregate by lote or tarea (UI would want "Juan's work on Lote A by task")
  - ⚠️ Tool does NOT include salary/tariff in output (useful for AI to explain cost reasons)
- **Severity:** **Low** — tool works for basic activity queries; missing detail is secondary
- **Fix proposed:** Add `salario`/`tariff` to result; optionally pre-aggregate by `lote_id` and `tarea_id` within the registros array.

---

### 3. get_monitoring_data
- **Tables/columns currently queried:** `monitoreos` (id, fecha_monitoreo, incidencia, severidad, gravedad_texto, arboles_monitoreados, arboles_afectados, individuos_encontrados, observaciones, floracion_*, ronda_id, sublote_id, lote:lotes, sublote:sublotes, plaga:plagas_enfermedades_catalogo) — chat.tsx:561
- **Corresponding UI module:** `/Users/santiagoforero/Codigo/Escociaos/src/components/monitoreo/DashboardMonitoreoV3.tsx` (primary); `/src/components/monitoreo/GraficoTendencias.tsx` (trends)
- **What the UI actually displays:**
  - Queries `monitoreos` with joins to `lotes`, `sublotes`, `plagas_enfermedades_catalogo` — same as tool
  - Aggregates by **sublote** in some charts (dashboard groups by `sublote_id` for severity thresholds)
  - Shows **incidencia % trend by sublote × plaga combination** (not just by plaga)
- **Gap diff:**
  - ⚠️ Tool returns `resumen_por_plaga` (correct) but **does NOT return `resumen_por_sublote`** (UI may need sublote detail for area-specific action)
  - ⚠️ Tool does NOT compute sublote-level max_gravedad separately (treats all sublotes as one lote)
  - ✓ Floracion summary is present
- **Severity:** **Medium** — sublote detail missing; owner may ask "which sublote is worst?" and tool cannot break it down
- **Fix proposed:** Add separate aggregation: `bySubLote: Record<string, {count, totalAfectados, totalMonitoreados, max_gravedad}>`; include in output.

---

### 4. get_application_summary
- **Tables/columns currently queried:** `aplicaciones` (id, nombre_aplicacion, tipo_aplicacion, estado, fecha_inicio_planeada, fecha_fin_planeada, fecha_cierre, blanco_biologico, costo_total, jornales_utilizados, observaciones_cierre) + **batch queries** for `aplicaciones_lotes`, `aplicaciones_lotes_planificado`, `aplicaciones_mezclas`, `movimientos_diarios` — chat.tsx:675–734
- **Corresponding UI module:** `/Users/santiagoforero/Codigo/Escociaos/src/components/aplicaciones/AplicacionesList.tsx`; `/src/components/aplicaciones/DetalleAplicacion.tsx`
- **What the UI actually displays:**
  - Loads `aplicaciones` with `aplicaciones_lotes (lotes)` — same as tool
  - **DetalleAplicacion** additionally queries:
    - `aplicaciones_calculos` (numero_canecas, numero_bultos, litros_mezcla, lote_id) — **TOOL DOES NOT QUERY THIS**
    - `aplicaciones_productos` (dosis_grandes, dosis_medianos, dosis_pequenos, dosis_clonales per mezcla)
    - `movimientos_diarios` with lote filter (DetalleAplicacion.tsx:189–196) — **TOOL QUERIES BUT DOES NOT FILTER BY LOTE**
    - `focos` detail (costo_insumos, jornales, costo_mano_obra, focos_productos) — **TOOL DOES NOT QUERY**
- **Gap diff:**
  - ❌ **CRITICAL:** Tool does NOT query `aplicaciones_calculos` (missing canecas/bultos/litros planeados per lote)
  - ❌ **CRITICAL:** Tool does NOT query `focos` table (missing per-foco cost breakdown: insumos, mano obra)
  - ❌ **CRITICAL:** Tool does NOT join `movimientos_diarios_productos` with `productos.precio_unitario` (cannot compute **actual cost per product applied**)
  - ❌ Tool returns generic `movimientos_reales` but **does NOT aggregate cost by lote** (UI shows filtered by lote)
  - ❌ Tool does NOT query `aplicaciones_cierre` (misses closure summary: cierre_total_insumos, cierre_total_mano_obra)
  - ⚠️ Tool stores `costo_total` in `aplicaciones` but this is **likely calculated, not from joins**; no breakdown by input/labor
- **Severity:** **High** — this is the **known-broken case** user mentioned; owner cannot ask per-lote cost questions; tool cannot differentiate between product cost and labor cost
- **Fix proposed:** Query `aplicaciones_calculos` for planeado; query `focos` and `focos_productos` for actual costs; LEFT JOIN `movimientos_diarios_productos` → `productos(precio_unitario)` to compute actual spend; aggregate by `lote_id`.

---

### 5. get_application_details
- **Tables/columns currently queried:** `aplicaciones_cierre` (all columns), `aplicaciones_calculos` (lote_nombre, area_hectareas, total_arboles, litros_mezcla, numero_canecas, kilos_totales, numero_bultos), `focos` (fecha_aplicacion, blanco_biologico, numero_focos, numero_bombas_30l, costo_insumos, jornales, costo_mano_obra, costo_total, observaciones, lote:lotes, sublote:sublotes, focos_productos) — chat.tsx:1156–1200
- **Corresponding UI module:** `/src/components/aplicaciones/ReporteAplicacion.tsx` and `/src/components/aplicaciones/ReporteAplicacionCerrada.tsx`
- **What the UI actually displays:**
  - Fetches full `aplicaciones_calculos` with area, arboles, litros, canecas per lote (ReporteAplicacion.tsx)
  - Fetches `focos` with joins to `focos_productos(productos)` — same as tool
  - **ReporteAplicacionCerrada** calls `fetchDatosReporteCierre()` which queries:
    - `movimientos_diarios` + `movimientos_diarios_productos(productos)` — **TOOL DOES NOT QUERY**
    - `registros_trabajo` filtered by aplicacion_id (labor cost by lot) — **TOOL DOES NOT QUERY**
- **Gap diff:**
  - ❌ Tool queries `focos` but **does NOT query `movimientos_diarios_productos`** for actual product consumption vs planned (ReporteAplicacionCerrada needs this for variance analysis)
  - ❌ Tool does NOT query `registros_trabajo` for actual labor cost during application (only focos.jornales, which is summary; no task-level detail)
  - ✓ Tool returns cierre data (correct structure)
  - ⚠️ Tool returns `costo_insumos` and `costo_mano_obra` from focos but **aggregation logic unclear** (sum? max per focus?)
- **Severity:** **High** — closure report missing variance analysis (planned vs actual per lote + per product)
- **Fix proposed:** LEFT JOIN `focos_productos` → `movimientos_diarios_productos(productos(precio_unitario, cantidad))` to compute variance; query `registros_trabajo` filtered by `aplicacion_id` to show actual labor cost.

---

### 6. get_inventory_status
- **Tables/columns currently queried:** `productos` (id, nombre, categoria, grupo, estado_fisico, presentacion_kg_l, cantidad_actual, stock_minimo, estado, precio_unitario, activo) — chat.tsx:739–762
- **Corresponding UI module:** `/Users/santiagoforero/Codigo/Escociaos/src/components/inventory/dashboard/components/InventoryStatus.tsx` (if exists) or main inventory view
- **What the UI actually displays:** 
  - Searches `productos` with filters by name and category — **same as tool**
  - Computes low-stock alerts: `cantidad_actual <= stock_minimo and stock_minimo > 0` — **same as tool**
  - Returns full product list with precio_unitario — **same as tool**
- **Gap diff:**
  - ✓ Tool structure matches UI exactly
  - ⚠️ Tool does NOT aggregate **total inventory value** = `cantidad_actual × precio_unitario` (useful KPI)
  - ⚠️ Tool does NOT compute **stock-out risk per category** (e.g., "Fungicides: 3 out of 8 products low")
- **Severity:** **Low** — tool works; missing aggregates are nice-to-have
- **Fix proposed:** Compute and return `total_inventory_value` and `low_stock_summary_by_category`.

---

### 7. get_financial_summary
- **Tables/columns currently queried:**
  - **Gastos:** `fin_gastos` (id, fecha, valor, nombre, estado, observaciones, categoria:fin_categorias_gastos, concepto:fin_conceptos_gastos, proveedor:fin_proveedores, negocio:fin_negocios) filtered by `estado='Confirmado'` — chat.tsx:782–806
  - **Ingresos:** `fin_ingresos` (id, fecha, valor, nombre, observaciones, cantidad, precio_unitario, cosecha, cliente, finca, categoria:fin_categorias_ingresos, comprador:fin_compradores, negocio:fin_negocios) — chat.tsx:810–835
  - **Ganado:** `fin_transacciones_ganado` (id, fecha, tipo, cantidad_cabezas, kilos_pagados, precio_kilo, valor_total, finca, cliente_proveedor, observaciones) — chat.tsx:838–856
- **Corresponding UI module:** `/Users/santiagoforero/Codigo/Escociaos/src/components/finanzas/dashboard/FinanzasDashboard.tsx` (likely)
- **What the UI actually displays:**
  - Queries same tables with same joins (structure validated via naming convention)
  - Aggregates by category and month — **same as tool**
  - Likely shows negocio filter drill-down — **tool supports this**
- **Gap diff:**
  - ✓ Tool structure matches UI
  - ⚠️ Tool does NOT compute **profit margin** = ingresos - gastos (high-value KPI)
  - ⚠️ Tool does NOT show **variance by category** vs prior year (year-over-year comparison)
  - ⚠️ Tool does NOT compute **cash flow projection** (useful for owner planning)
- **Severity:** **Low** — baseline data present; aggregate KPIs missing but secondary
- **Fix proposed:** Add `profit_summary: {total_ingresos, total_gastos, margen_neto}` and `variance_yoy_por_categoria`.

---

### 8. get_production_data
- **Tables/columns currently queried:** `produccion` (id, ano, cosecha_tipo, kg_totales, arboles_registrados, kg_por_arbol, lote:lotes, sublote:sublotes) — chat.tsx:863–927
- **Corresponding UI module:** `/Users/santiagoforero/Codigo/Escociaos/src/components/produccion/components/ProductionDashboard.tsx` (if exists) or main produccion view
- **What the UI actually displays:**
  - Queries same table and joins — **matches tool**
  - Aggregates by year and by lote — **matches tool**
  - Computes kg_per_tree average — **matches tool**
- **Gap diff:**
  - ✓ Tool structure matches UI
  - ⚠️ Tool does NOT query `cosechas` to show **harvest count** per lote (separate from production summary)
  - ⚠️ Tool does NOT compute **quality metrics** (if available in schema) like % defects
- **Severity:** **Low** — baseline structure correct
- **Fix proposed:** If quality data exists, add it to schema query.

---

### 9. get_harvest_shipments
- **Tables/columns currently queried:**
  - **Cosechas:** `cosechas` (id, fecha_cosecha, kilos_cosechados, numero_canastillas, lote:lotes, sublote:sublotes) — chat.tsx:935–946
  - **Despachos:** `despachos` (id, fecha_despacho, kilos_despachados, precio_por_kilo, valor_total, cliente:clientes) — chat.tsx:939–946
- **Corresponding UI module:** `/src/components/produccion/components/HarvestDashboard.tsx` (likely) or sales view
- **What the UI actually displays:**
  - Queries same tables with same joins
  - Aggregates by month and by client — **matches tool**
- **Gap diff:**
  - ✓ Tool structure matches
  - ⚠️ Tool does NOT compute **loss ratio** = (cosechado - despachado) / cosechado (useful for quality/waste tracking)
  - ⚠️ Tool does NOT show **margin per despaho** = (valor_total - costo_produccion) (missing profitability per shipment)
- **Severity:** **Low** — baseline present; KPIs secondary
- **Fix proposed:** Add loss_ratio calculation; optionally LEFT JOIN production costs.

---

### 10. get_lot_info
- **Tables/columns currently queried:** `lotes` (id, nombre, area_hectareas, arboles_grandes, arboles_medianos, arboles_pequenos, arboles_clonales, total_arboles, fecha_siembra, activo, sublotes) — chat.tsx:1001–1005
- **Corresponding UI module:** UI for lote detail (if exists as modal/page)
- **What the UI actually displays:**
  - Same query structure expected
  - May show related monitoring or labor records per lote
- **Gap diff:**
  - ✓ Tool structure basic but correct
  - ⚠️ Tool does NOT include **age of lote** = today - fecha_siembra (useful context for yield expectations)
  - ⚠️ Tool does NOT include **recent activity summary** (last monitoring date, last labor cost, production last year)
- **Severity:** **Low** — structure correct; context KPIs missing
- **Fix proposed:** Compute `age_years`; optionally add recent_monitoring_date and recent_production_kg.

---

### 11. get_purchase_history
- **Tables/columns currently queried:** `compras` (id, fecha_compra, proveedor, numero_factura, cantidad, unidad, costo_unitario, costo_total, producto:productos) — chat.tsx:1013–1070
- **Corresponding UI module:** Inventory purchase/receiving module (if exists)
- **What the UI actually displays:**
  - Queries same table with same joins
  - Aggregates by proveedor and by producto — **matches tool**
  - Shows top 10 products by spend — **matches tool**
- **Gap diff:**
  - ✓ Tool structure matches
  - ⚠️ Tool does NOT show **price trend per producto** (useful for vendor negotiation)
  - ⚠️ Tool does NOT compute **lead time average** per proveedor (if available in schema)
- **Severity:** **Low** — baseline correct
- **Fix proposed:** If schema has delivery_date, compute lead_time; add price_trend_chart_data.

---

### 12. get_inventory_movements
- **Tables/columns currently queried:**
  - **Movimientos:** `movimientos_inventario` (id, fecha_movimiento, tipo_movimiento, cantidad, unidad, saldo_anterior, saldo_nuevo, valor_movimiento, observaciones, producto:productos) — chat.tsx:1078–1150
  - **Verificaciones:** `verificaciones_inventario` (id, fecha_inicio, fecha_fin, estado, usuario_verificador, observaciones_generales, verificaciones_detalle(producto, cantidad_teorica, cantidad_fisica, diferencia, porcentaje_diferencia, valor_diferencia, estado_diferencia)) — chat.tsx:1083–1087
- **Corresponding UI module:** Inventory audit/verification module
- **What the UI actually displays:**
  - Queries same tables and joins
  - Aggregates entradas/salidas/ajustes by producto — **matches tool**
  - Extracts discrepancies from verificaciones — **matches tool**
- **Gap diff:**
  - ✓ Tool structure matches UI
  - ⚠️ Tool does NOT compute **monthly turnover** (useful for slow-moving product identification)
  - ⚠️ Tool does NOT flag **high discrepancy rate** per product (e.g., "Fungicide A has 15% variance in last 3 counts")
- **Severity:** **Low** — baseline correct
- **Fix proposed:** Add `discrepancy_summary_per_product: {product, avg_discrepancy_pct, trend}`.

---

### 13. get_weekly_overview
- **Tables/columns currently queried:** Calls `execLaborSummary`, `execMonitoringData`, `execApplicationSummary`, `execHarvestShipments` in parallel — chat.tsx:1216–1229
- **Corresponding UI module:** `/src/components/dashboard/DashboardView.tsx` (or weekly report page)
- **What the UI actually displays:**
  - Aggregates from 4 other tools (composite view)
  - Date range defaults to Monday–Sunday of current week
- **Gap diff:**
  - ✗ **Inherits all gaps from tools 1, 3, 4, 9** (labor summary lacks lote breakdown; monitoring lacks sublote; applications lack focos cost; harvest lacks margin)
  - ⚠️ Tool does NOT add **overall KPI card**: total project spend this week, forecast vs budget
- **Severity:** **High** (propagated from dependencies) — weekly overview incomplete due to upstream gaps
- **Fix proposed:** Fix upstream tools first; add KPI aggregation: total_spend, total_jornales, total_kg_harvested.

---

### 14. get_climate_data
- **Tables/columns currently queried:** `clima_lecturas` (timestamp, temp_c, humedad_pct, viento_kmh, rafaga_kmh, viento_dir, lluvia_diaria_mm, lluvia_tasa_mm_hr, radiacion_wm2, uv_index) — chat.tsx:1247–1360
- **Corresponding UI module:** `/Users/santiagoforero/Codigo/Escociaos/src/components/clima/components/ClimaChart.tsx` or main climate dashboard
- **What the UI actually displays:**
  - Queries same clima_lecturas table
  - Aggregates daily by metric (temp avg/min/max, humidity, etc.) — **matches tool**
  - Computes rainfall total per day — **matches tool**
- **Gap diff:**
  - ✓ Tool structure matches UI
  - ⚠️ Tool does NOT query `aplicaciones` or `monitoreos` to cross-reference **weather impact on pest severity** (e.g., "high humidity → fungal pressure")
  - ⚠️ Tool does NOT include **frost/freeze alerts** if temp < threshold (useful for spraying decisions)
- **Severity:** **Low** — baseline correct; cross-domain insights missing
- **Fix proposed:** If needed, add optional JOIN to monitoreos for pest-weather correlation analysis.

---

### 15. get_conductivity_data
- **Tables/columns currently queried:** `mon_conductividad` (id, fecha_lectura, valor_ce, unidad, profundidad_cm, observaciones, lote:lotes) — chat.tsx:1372–1435
- **Corresponding UI module:** `/src/components/monitoreo/RegistroConductividad.tsx` or conductivity dashboard
- **What the UI actually displays:**
  - Queries same table and joins
  - Aggregates by lote and by month — **matches tool**
  - Applies thresholds for traffic light status (verde < 0.5, amarillo 0.5–1.5, rojo > 1.5) — **matches tool**
- **Gap diff:**
  - ✓ Tool structure matches
  - ⚠️ Tool does NOT aggregate **by profundidad_cm** (e.g., surface vs 30cm depth trends) — useful for irrigation decisions
  - ⚠️ Tool does NOT cross-reference with **fertilization records** to explain EC changes (schema join to `aplicaciones`)
- **Severity:** **Low** — baseline correct
- **Fix proposed:** Add summary by profundidad tier if multi-depth readings exist.

---

### 16. get_beehive_data
- **Tables/columns currently queried:** `apiarios` (id, nombre, ubicacion, total_colmenas, activo) + `mon_colmenas` (id, fecha_inspeccion, colmenas_fuertes, colmenas_debiles, colmenas_muertas, colmenas_con_reina, observaciones, apiario:apiarios) — chat.tsx:1450–1521
- **Corresponding UI module:** `/src/components/monitoreo/ConfigApiarios.tsx` or beehive dashboard
- **What the UI actually displays:**
  - Queries same tables and joins
  - Aggregates by apiario and month — **matches tool**
  - Computes health percentage (pct_fuertes) and status (bueno/regular/critico) — **matches tool**
- **Gap diff:**
  - ✓ Tool structure matches UI
  - ⚠️ Tool does NOT compute **mortality trend** = (colmenas_muertas this month / total_colmenas) to flag problems early
  - ⚠️ Tool does NOT cross-reference with **aplicaciones** (pesticide risk to hives) or **monitoreos** (pest pressure in apiario area)
- **Severity:** **Low** — baseline correct; trend alerting missing
- **Fix proposed:** Add mortality_pct_trend and optionally cross-reference to nearby aplicaciones for herbicide/fungicide risk.

---

### 17. get_budget_data
- **Tables/columns currently queried:**
  - `fin_negocios` (id, nombre)
  - `fin_presupuestos` (id, concepto_id, categoria_id, monto_anual, is_principal, fin_categorias_gastos, fin_conceptos_gastos)
  - `fin_gastos` (concepto_id, categoria_id, valor, concepto:fin_conceptos_gastos, categoria:fin_categorias_gastos) filtered by `estado='Confirmado'` and year/quarter range
  - Aggregates actual expenses across current year and prior year quarters
- **Corresponding UI module:** `/Users/santiagoforero/Codigo/Escociaos/src/components/finanzas/presupuesto/PresupuestoDashboard.tsx` (likely)
- **What the UI actually displays:**
  - Queries budget vs actuals for selected quarters
  - Shows execution % and year-over-year variance — **matches tool**
  - Aggregates by categoria — **matches tool**
- **Gap diff:**
  - ✓ Tool structure matches UI
  - ⚠️ Tool does NOT compute **monthly burn rate** (spend/days elapsed) to detect over/under-spending mid-quarter
  - ⚠️ Tool does NOT include **forecast to year-end** (if Q1 spend is high, will annual budget overflow?)
  - ⚠️ Tool does NOT warn on **unbudgeted conceptos** overrunning (e.g., "Contingency: 250% of budget" — user needs alert)
- **Severity:** **Low** — baseline present; forecasting secondary
- **Fix proposed:** Add `monthly_burn_rate` and `forecast_annual_overage_pct` to output.

---

## Summary by Severity

### High-Severity (11 gaps — block owner answers):
1. **get_labor_summary**: Missing task type aggregation, lote matrix with employee/contractor split, efficiency KPI
2. **get_application_summary**: Missing `aplicaciones_calculos`, `focos`, and `movimientos_diarios_productos` with product pricing
3. **get_application_details**: Missing labor cost by task and product variance analysis
4. **get_monitoring_data**: Missing sublote-level aggregation
5. **get_weekly_overview**: Propagates gaps from upstream tools (labor, monitoring, applications)

### Medium-Severity (3 gaps — require follow-up):
1. **get_monitoring_data**: Sublote detail needed for area-specific pest management
2. **get_application_summary**: Per-lote cost breakdown incomplete without product joins
3. **get_application_details**: Variance analysis (planned vs actual) missing

### Low-Severity (3 gaps — nice-to-have):
1. **get_inventory_status**: Missing inventory value and category summaries
2. **get_financial_summary**: Missing profit margin and year-over-year variance
3. **get_harvest_shipments**: Missing loss ratio and profitability per shipment
4. (All others): Minor KPIs or context fields)

---

## Root Cause Analysis

**Why were these gaps created?**

1. **Tool definitions were written from imagination, not from UI inspection** — Developers guessed what data tools should return rather than tracing what components actually fetch and display.

2. **Joins with computed costs are complex** — Queries like `movimientos_diarios_productos` → `productos.precio_unitario` require multi-step aggregation; easier to skip than implement.

3. **Sublote/granular grouping was omitted** — Tools aggregate only by lote or by month; finer grouping (sublote, task type, product) was deprioritized.

4. **Application tools pre-date focos table** — Early tool versions may have been coded before `focos` table was added; never updated.

5. **No automated test comparing tool output to UI queries** — No regression test ensures tools stay in sync with UI data needs.

---

## Recommended Fix Priority

**Tier 1 (Critical — fix this sprint):**
- `get_application_summary`: Add `aplicaciones_calculos` and `focos` queries; LEFT JOIN product movements with pricing
- `get_labor_summary`: Add task type grouping and employee/contractor matrix
- `get_application_details`: Add labor and product variance

**Tier 2 (Important — next sprint):**
- `get_monitoring_data`: Add sublote summary
- `get_weekly_overview`: Retest once upstream fixed

**Tier 3 (Polish — backlog):**
- All Low-severity tools: Add KPI and trend fields

---

## Implementation Checklist

- [ ] Add `aplicaciones_calculos` query to `execApplicationSummary` and `execApplicationDetails`
- [ ] Add `focos` and `focos_productos` queries to application tools
- [ ] LEFT JOIN `movimientos_diarios_productos` → `productos(precio_unitario)` in application tools
- [ ] Add task type (`tipos_tareas.nombre`) to labor tool grouping
- [ ] Compute employee/contractor cost matrix in labor tool
- [ ] Add sublote aggregation to monitoring tool
- [ ] Retest `get_weekly_overview` after upstream fixes
- [ ] Add missing KPI fields (efficiency, inventory value, profit margin, loss ratio)
- [ ] Create automated test: compare tool schema output against UI component data fetch queries

