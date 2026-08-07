# Finanzas — view contracts (`src/components/finanzas/`)

This file loads only when working under `src/components/finanzas/`. It was split out of
the root `CLAUDE.md` to keep per-view UI detail out of every unrelated session.

**The accounting rules themselves stay in the root `CLAUDE.md`** — they are also enforced by
the pure engines in `src/utils/` and by the Deno port in the edge-function tree, so they must
load for sessions that never open this directory. Read them there before changing any number.

**Structure**: pure engines in `src/utils/` (`periodosReporte`, `clasificacionCostos`, `costoVentaGanado`, `calculosPyG`, `calculosFlujoCaja`, `reportesFinancierosComun`) — zero Supabase imports, tested in `src/__tests__/` — fed by a single fetching hook (`useReportesFinancierosData`) that loads once per year and serves all 4 views, so the two reports can never disagree by having read the DB at different moments.

## Report rendering contracts

- Report lines are a **flat ordered array** with `nivel` + `padre_id`, not a tree: the table, the PDF and the Excel all walk the same structure.
- The PDF/Excel exporters reuse `formatearCelda`/`formatearCeldaFlujo` from the table components. Do **not** switch them to `formatearMoneda` (used by the older PDF generators): it renders the COP symbol and the PDF would stop matching the screen.
- Financial tables are laid out by real CSS, not by utilities: the `.tabla-financiera` / `.celda-num` / `.col-etiqueta` rules live in `globals.css`, and `.tabla-financiera .col-etiqueta` must keep its specificity above `.tabla-financiera td`, or long labels overflow onto the first figure. They were originally written because `table-fixed`/`tabular-nums`/`border-collapse` were missing from the frozen build; **that reason is gone — Tailwind compiles now and those utilities work** — but the rules stay, because column widths and the sticky label column are structural, not a missing-class workaround.

## Ganado ↔ Finance Integration

Cattle buy/sell transactions live in `fin_transacciones_ganado` (not in `fin_gastos`/`fin_ingresos`). The Gastos and Ingresos historial views merge ganado records alongside regular records using a `UnifiedFinanceItem` discriminated union. Ganado items display with an amber `[Ganado]` badge and route to `TransaccionGanadoForm` for editing (not `GastoForm`/`IngresoForm`).

Key files:
- `src/components/finanzas/components/TransaccionGanadoForm.tsx` — create/edit dialog for ganado transactions, with dropdown selectors for finca (from the shared `gan_fincas` catalog, falling back to distinct transaction values), proveedor (`fin_proveedores`), and cliente (`fin_compradores`). New finca names are inserted into `gan_fincas`.
- `src/types/finanzas.ts` — `UnifiedFinanceItem` type
- `src/components/finanzas/components/GastosList.tsx` — merges `fin_transacciones_ganado` compras
- `src/components/finanzas/components/IngresosList.tsx` — merges `fin_transacciones_ganado` ventas

**Filtering the merged lists — `fin_transacciones_ganado` has none of the dimensions the filters use.** No `negocio_id`, `region_id`, `categoria_id`, `concepto_id` or `estado`; a ganado row is by definition the **Ganado** negocio and has no región, categoría, concepto or Confirmado/Pendiente state. Those filters therefore cannot be expressed as query predicates on that table — each list computes an `incluirGanado` boolean and includes or excludes the ganado block wholesale: excluded whenever región/categoría/concepto/estado is set, or when the negocio filter is set to anything other than Ganado (resolved by name via `NEGOCIO_GANADO`, never a hardcoded UUID).

This was silently broken until 2026-07-22: ganado rows ignored every non-date filter, so they appeared under *any* negocio and their value was added to the header total. Filtering Ingresos by negocio "Agrícola" for 2025 showed 27 rows / $1.417M when the truth was 10 rows / $239M — **83% of the figure came from ganado that should not have been on screen.** `negocioGanadoId` must stay in the load effect's dependency array: the catalogs resolve after first render, so without it a Ganado-negocio filter drops the ganado rows until the next filter change.

## Gastos historial (`/finanzas/gastos`) — view contract

`GastosView` opens on the **Historial** tab (leftmost); `?tab=registrar` still deep-links to the capture grid. `GastosList` defaults its period filter to **`ytd`**, not `mes_actual` — that default is repeated in three places (initial state, the navigation-state effect, and the clear-filters reset); change all three together or they silently disagree.

- **Usuario filter** — filters `created_by` on both `fin_gastos` and `fin_transacciones_ganado`, plus a "Sin usuario" option for `created_by IS NULL` (everything before migration 050, i.e. all pre-2026 rows and all ganado history).
- **Selection subtotal** — per-row checkboxes plus "seleccionar todos"; the subtotal is computed over `unifiedItems`, so it always reflects the active filters. Selection resets whenever filters or the search query change.
- **Detail dialog** (`GastoDetalleDialog.tsx`) — opens on row click for gasto and ganado items alike, and carries Editar / Eliminar / Completar. The row's `onClick` is suppressed on the checkbox and the `⋮` wrapper via `stopPropagation`.
- **Mobile** — the `⋮` menu is `hidden sm:block` **on purpose**: it is gated on `group-hover`, which never fires on touch, so on mobile the detail dialog is the only path to the actions. Do not re-enable it on mobile without also removing the hover gate. The two-line mobile row and the collapsible filter bar rely on the custom `globals.css` classes listed further down (`.filtros-toggle`, `.filtros-colapsables`, `.gasto-meta-movil`). The row **name** (`item.nombre`, free text with no length cap) is *not* one of them since the 2026-08-07 truncation pass: it clamps to 3 lines on mobile via Tailwind utilities written directly on the span (`max-sm:whitespace-normal max-sm:line-clamp-3`, plus a `title` fallback), not a hand `globals.css` rule — the compiler runs live on this branch, so the utility is the correct form. Keep `GastosList.tsx`/`IngresosList.tsx` in sync if this changes.
- **The list container must not carry `overflow-hidden`.** The `⋮` menu is absolutely positioned and opens downward, so clipping the container hid the actions on the last rows entirely — on desktop that menu is the only path to them besides the dialog. Corner rounding is handled instead by `.lista-financiera` (`globals.css`), which rounds the first and last row. Note its radius is `calc(var(--radius) + 4px)`, not Tailwind's stock `0.75rem`: **this build redefines `rounded-xl`** (`--radius` is `1rem`, so the real radius is 20px). Anything matching that container's corners must use the same expression.
- Row hover was written `hover:bg-gray-50/50` and did **nothing** — the frozen build shipped `.hover\:bg-gray-50` but no opacity-modified variant. Corrected to `hover:bg-gray-50`, which matters now that the whole row is clickable and needs the affordance. (Opacity modifiers compile fine today; the solid value is the intended one, so leave it.) A live row background is also what makes the `.lista-financiera` rounding load-bearing rather than decorative.

## Ingresos historial (`/finanzas/ingresos`) — view contract

Mirrors the Gastos contract above (Historial default + leftmost, `?tab=registrar` deep-link, `ytd` default repeated in the same three places, Usuario filter, selection subtotal, row-click detail dialog, collapsible mobile filters, no `overflow-hidden` on the list container). It reuses the same `globals.css` classes — `.filtros-toggle`, `.filtros-colapsables`, `.gasto-meta-movil`, `.lista-financiera` — plus the same inline Tailwind utilities for the row name (`max-sm:whitespace-normal max-sm:line-clamp-3` + `title`, see above). The `gasto-` prefix on the remaining classes is historical: **the rules are module-agnostic and shared with Ingresos on purpose** — renaming them means touching both lists.

Where it deliberately differs from Gastos, because `fin_ingresos` has no such column:

- **No `estado`** — no Confirmado/Pendiente filter, no estado icon, no "N pendientes" counter, and no Completar action. `IngresoDetalleDialog` therefore has no `onCompletar` prop, unlike its gastos twin.
- **No `concepto`** — the categoría filter has no cascade; instead it is **scoped by negocio** (`categoriasFiltradas`), and selecting a negocio clears `categoria_id`. Gastos does neither.
- **Extra ingreso-only fields** surfaced in the detail dialog: `cantidad`, `precio_unitario`, `cosecha`, `alianza`, `cliente`, `finca` (migration 024 columns that had no UI until now).
- **Usuario filter** — `created_by` on `fin_ingresos` is populated by migration **063**, not 050; the `fin_transacciones_ganado` half was already covered by 050.
- **"Quincena Hato" chip + 23503 delete guard** (migration 070, SOW 3 of `docs/plan_hato_produccion_rework.md`) — `hato_produccion_quincenal.fin_ingreso_id` is `ON DELETE RESTRICT`, so deleting a linked `fin_ingresos` row from here fails with Postgres `23503`. `IngresosList.tsx` catches that code and shows a human message ("elimínala desde Hato Lechero → Producción") instead of a raw error, and a per-row query against `hato_produccion_quincenal` (a second request, never a join on the main list query — that table is outside this view's normal scope) marks which loaded ingresos are linked with a blue "Quincena Hato" badge (row + `IngresoDetalleDialog`). The only correct delete path for a linked ingreso is `fn_hato_eliminar_quincena_venta` from Producción, which removes both rows atomically.
Everything else is intentionally identical to Gastos — the two lists should stay in sync.
