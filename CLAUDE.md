# CLAUDE.md — Escocia OS

## Project Overview

Escocia OS is a comprehensive agricultural management system for avocado (aguacate Hass) cultivation with GlobalGAP certification compliance. It is a single-page application built with React + TypeScript, backed by Supabase (PostgreSQL), and deployed on Vercel.

The system manages: inventory, phytosanitary applications (fumigation/fertilization/drench), pest monitoring, labor/tasks, employees/contractors, finances, production tracking, and weekly reporting — all with full traceability and audit logging.

**Original design**: Figma prototype at https://www.figma.com/design/lXwuvZRqDgLunTJyrVebjU/Escocia-OS

---

## Tech Stack

| Layer         | Technology                                                       |
|---------------|------------------------------------------------------------------|
| Language      | TypeScript 5.9 (strict mode)                                    |
| Framework     | React 18.3 (functional components, hooks only)                  |
| Routing       | React Router DOM 7.10                                            |
| Build         | Vite 6.3 with SWC plugin                                        |
| Styling       | Tailwind CSS 4.1 (CSS-first config via `globals.css`; no separate `tailwind.config.js`) |
| Components    | Radix UI (25+ headless primitives) + custom `src/components/ui` |
| Icons         | Lucide React                                                     |
| Charts        | Recharts                                                         |
| Backend       | Supabase (PostgreSQL + Auth + Storage + Edge Functions)          |
| PDF           | jsPDF + jspdf-autotable + html2canvas                           |
| CSV/Excel     | PapaParse (CSV), xlsx (Excel)                                   |
| Toast/Notif   | Sonner                                                           |
| Testing       | Vitest 4.0                                                       |
| Linting       | ESLint 9 + typescript-eslint + eslint-plugin-react-hooks        |
| Deployment    | Vercel                                                           |

---

## Quick Reference Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server on http://localhost:3000
npm run build        # Production build → /build directory
npm run typecheck    # TypeScript check (tsc --noEmit)
npm run lint         # ESLint check on src/
npm test             # Run tests once (vitest run)
npm run test:watch   # Run tests in watch mode
```

---

## Environment Variables

Create a `.env.local` file at the project root with:

```
VITE_SUPABASE_URL=<your-supabase-project-url>
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

These are consumed in `src/utils/supabase/client.ts` via `import.meta.env`. The app will throw on startup if they are missing.

---

## Project Structure

```
/
├── src/
│   ├── main.tsx                          # Entry point
│   ├── App.tsx                           # Root component, routing setup
│   ├── index.css                         # Tailwind compiled output (do not hand-edit)
│   │
│   ├── components/
│   │   ├── Layout.tsx                    # Sidebar + navigation shell
│   │   ├── Login.tsx                     # Auth login page
│   │   ├── Dashboard.tsx                 # Main overview dashboard
│   │   ├── aplicaciones/                 # Phytosanitary applications module
│   │   ├── inventory/                    # Inventory & purchases module
│   │   │   ├── InventoryNav.tsx          # Inventory section nav bar
│   │   │   ├── InventorySubNav.tsx       # Inventory sub-navigation
│   │   │   └── VerificacionesNav.tsx     # Verificaciones sub-navigation
│   │   ├── monitoreo/                    # Pest/disease monitoring module
│   │   │   ├── components/               # Monitoring sub-components
│   │   │   ├── MonitoreoSubNav.tsx       # Monitoring sub-navigation
│   │   │   ├── DashboardMonitoreoV3.tsx  # Main dashboard: Snapshot + Mapa de Calor/Tendencias/Priorización tabs
│   │   │   ├── MapaCalorIncidencias.tsx  # Incidence heat map (grouped by ronda)
│   │   │   └── PriorizacionScoutingView.tsx # Scouting priority ranking
│   │   ├── clima/                         # Weather monitoring module
│   │   │   ├── ClimaDashboard.tsx        # Vista Rápida: KPI cards + period summary
│   │   │   ├── ClimaHistorico.tsx        # Historical view: 2x2 chart grid + CSV export
│   │   │   ├── ClimaSubNav.tsx           # Tab navigation
│   │   │   └── components/               # KPI cards, period table, 4 chart components, wind arrow
│   │   ├── labores/                      # Task/labor management (Kanban)
│   │   │   ├── ReportesView.tsx          # Labor reports view
│   │   │   └── kanban-types.ts           # Kanban TypeScript types
│   │   ├── empleados/                    # Personnel & contractors
│   │   │   └── EmpleadosSubNav.tsx       # Employees sub-navigation
│   │   ├── finanzas/                     # Finance (expenses, income, reports)
│   │   │   ├── components/               # Finance sub-components
│   │   │   ├── dashboard/                # Per-negocio dashboards
│   │   │   ├── presupuesto/              # Budget vs actual
│   │   │   ├── reportes/                 # P&G + Flujo de Caja tables & controls
│   │   │   └── hooks/                    # Finance-specific hooks
│   │   ├── produccion/                   # Production tracking & charts
│   │   │   ├── components/               # Production sub-components
│   │   │   └── hooks/                    # Production-specific hooks
│   │   ├── reportes/                     # Weekly report wizard & history
│   │   ├── configuracion/                # System configuration (lots, users)
│   │   ├── auth/                         # ProtectedRoute, RoleGuard
│   │   ├── dashboard/                    # Dashboard sub-components (AlertList — "Pulso de Gestión" cross-module alerts)
│   │   ├── shared/                       # Reusable components (dialogs, uploaders, FormDraftBanner)
│   │   ├── ui/                           # Radix UI wrappers (button, dialog, etc.)
│   │   └── figma/                        # Image fallback component
│   │
│   ├── contexts/
│   │   ├── AuthContext.tsx               # Auth state (user, profile, session, roles)
│   │   └── SafeModeContext.tsx           # Safe-mode toggle (localStorage-persisted)
│   │
│   ├── hooks/
│   │   ├── useFormPersistence.ts         # Form state persistence hook (drop-in useState replacement)
│   │   ├── useFormDraft.ts              # Snapshot-based draft persistence (for fragmented-state forms)
│   │   └── useReporteAplicacion.ts       # Application report data hook
│   │
│   ├── types/                            # TypeScript type definitions per module
│   │   ├── aplicaciones.ts
│   │   ├── finanzas.ts
│   │   ├── monitoreo.ts
│   │   ├── produccion.ts
│   │   ├── reporteSemanal.ts
│   │   ├── reportesFinancieros.ts
│   │   └── shared.ts
│   │
│   ├── utils/                            # Business logic & helper functions
│   │   ├── supabase/
│   │   │   ├── client.ts                 # Supabase singleton client + auth helpers
│   │   │   └── info.tsx                  # Supabase connection info component
│   │   ├── aplicacionesReales.ts        # Applications with real-data handling
│   │   ├── calculosAplicaciones.ts       # Application dose/cost calculations
│   │   ├── calculosMonitoreo.ts          # Monitoring metric calculations
│   │   ├── calculosReporteAplicacion.ts  # Application report calculations
│   │   ├── csvMonitoreo.ts              # CSV parsing & validation for monitoring
│   │   ├── dailyMovementUtils.ts        # Daily movement helpers
│   │   ├── fechas.ts                    # Date formatting utilities
│   │   ├── format.ts                    # Number/currency formatting
│   │   ├── fetchDatosReporteSemanal.ts  # Weekly report data aggregation
│   │   ├── fetchDatosReporteCierre.ts   # Closure report data
│   │   ├── reporteSemanalService.ts     # Report generation service
│   │   ├── generarPDF*.ts              # PDF generators (reports, P&L, shopping lists)
│   │   ├── insightsAutomaticos.ts       # Automatic insight generation
│   │   ├── laborCosts.ts               # Labor cost calculations
│   │   ├── calculosPyG.ts              # P&G engine (pure) — see Financial Reports
│   │   ├── calculosFlujoCaja.ts        # Cash-flow engine (pure)
│   │   ├── costoVentaGanado.ts         # Cattle COGS, moving weighted average per head
│   │   ├── periodosReporte.ts          # Cumulative quarters & cosecha periods
│   │   ├── clasificacionCostos.ts      # Direct vs indirect cost resolution
│   │   ├── calculosHato.ts             # Hato Lechero pure engine (S2) — see below
│   │   └── validation.ts               # Data validation utilities
│   │
│   ├── sql/                             # SQL scripts & migrations
│   │   ├── migrations/                  # Sequential numbered migrations (001–063)
│   │   └── *.sql                        # Standalone SQL scripts
│   │
│   ├── styles/
│   │   └── globals.css                  # Theme variables, font-face, Tailwind theme
│   │
│   ├── supabase/
│   │   └── functions/server/            # Edge function source (Hono framework)
│   │
│   ├── guidelines/
│   │   └── Guidelines.md                # Design guidelines reference
│   ├── assets/                          # Static images
│   └── __tests__/                       # Vitest unit tests
│
├── supabase/                            # Supabase project config
│   ├── config.toml
│   └── functions/
│
├── docs/                                # Extended documentation
│   ├── README.md                        # Documentation index and canonical references
│   ├── supabase_tablas.md               # DB schema reference (validate against migrations)
│   └── archive/                         # Completed plans, resolved incidents, legacy guides
│
├── package.json
├── tsconfig.json                        # Strict TS config, path alias @/* → ./src/*
├── vite.config.ts                       # Vite config with extensive aliases
├── eslint.config.js
├── vercel.json                          # Vercel deployment config
├── BUG_REPORT.md                        # Known issues tracker
└── index.html                           # SPA entry point
```

---

## Architecture & Key Patterns

### Component Hierarchy

```
App
├── BrowserRouter
│   └── AuthProvider              # Global auth context
│       └── SafeModeProvider      # Safe-mode context
│           └── AppContent        # Auth-aware routing
│               ├── /login → Login
│               └── /* → ProtectedRoute
│                       └── Layout (sidebar + nav)
│                           └── Suspense (loading spinner)
│                               └── LayoutRoutes (nested routes, all React.lazy)
```

All route components are lazy-loaded via `React.lazy()` with a shared `<Suspense>` boundary. Heavy libraries (jsPDF, xlsx, html2canvas) are dynamically imported on demand, not bundled in the initial load.

### State Management

- **AuthContext** — Global authentication state (user, profile, session, role-based access). Uses Supabase auth listeners for session management.
- **SafeModeContext** — UI toggle for confirming critical operations. Persisted in localStorage.
- **No Redux/Zustand** — The app uses React Context + local component state. Data is fetched directly from Supabase in components and hooks.

### Form Persistence

All non-trivial forms auto-save to localStorage to prevent data loss. Two hooks cover different state patterns:

| Hook | Use when | How |
|------|----------|-----|
| `useFormPersistence` | Form has a single `formData` useState object | Drop-in useState replacement. Auto-restores on mount. |
| `useFormDraft` | Form uses many separate useStates | Observes a snapshot. Manual restore via banner. |

Both use `form_autosave_` prefix, 7-day retention, and version tracking. The shared `FormDraftBanner` component provides the restoration UI (two variants: `restored` for auto-restore, `available` for manual restore).

When adding persistence to a new form: prefer `useFormPersistence` if the form has a single state object; use `useFormDraft` if refactoring state is too risky. Always call `clearFormData()`/`clearDraft()` on successful save and cancel.

### Data Flow

1. Components call Supabase client directly (`getSupabase().from('table')...`)
2. Heavy data aggregation lives in `src/utils/fetch*.ts` and `src/utils/calculos*.ts`
3. Types are defined per module in `src/types/`
4. PDF generation utilities consume aggregated data and produce downloadable files

### Path Aliases

The `@/` alias resolves to `src/`. Use it for all imports:
```ts
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { getSupabase } from '@/utils/supabase/client';
```

---

## Routing Map

All routes except `/login` are protected and require authentication.

| Route                              | Component                    | Module         |
|------------------------------------|------------------------------|----------------|
| `/`                                | Dashboard                    | Overview       |
| `/inventario`                      | InventoryList                | Inventory      |
| `/inventario/dashboard`            | MovementsDashboard           | Inventory      |
| `/inventario/compras`              | ComprasIntegrado             | Inventory      |
| `/inventario/producto/:id`         | ProductDetail                | Inventory      |
| `/inventario/movimientos`          | InventoryMovements           | Inventory      |
| `/inventario/importar`             | ImportarProductosPage        | Inventory      |
| `/inventario/verificaciones`       | VerificacionesList           | Inventory      |
| `/inventario/verificaciones/nueva` | NuevaVerificacion            | Inventory      |
| `/inventario/verificaciones/conteo/:id` | ConteoFisico            | Inventory      |
| `/aplicaciones`                    | AplicacionesList             | Applications   |
| `/aplicaciones/calculadora`        | CalculadoraAplicaciones      | Applications   |
| `/aplicaciones/:id/movimientos`    | DailyMovementsDashboard      | Applications   |
| `/aplicaciones/:id/cierre`         | CierreAplicacion             | Applications   |
| `/aplicaciones/:id/reporte`        | ReporteAplicacion            | Applications   |
| `/monitoreo`                       | DashboardMonitoreoV3         | Monitoring     |
| `/monitoreo/registros`             | RegistrosMonitoreo           | Monitoring     |
| `/monitoreo/carga-masiva`          | CargaMasiva                  | Monitoring     |
| `/monitoreo/catalogo`              | CatalogoPlagas               | Monitoring     |
| `/labores`                         | LaboresLayout → Labores      | Labor          |
| `/labores?vista=reportes`          | LaboresLayout → Labores      | Labor          |
| `/labores/empleados`               | Personal                     | Labor          |
| `/labores/contratistas`            | Contratistas                 | Labor          |
| `/empleados`                       | → redirects to `/labores/empleados`      | Legacy |
| `/empleados/contratistas`          | → redirects to `/labores/contratistas`   | Legacy |
| `/hato-lechero`                    | ComingSoon (En Desarrollo)   | Hato Lechero   |
| `/hato-lechero/produccion`         | ComingSoon (En Desarrollo)   | Hato Lechero   |
| `/hato-lechero/hato`               | ComingSoon (En Desarrollo)   | Hato Lechero   |
| `/hato-lechero/chequeos`           | ComingSoon (En Desarrollo)   | Hato Lechero   |
| `/hato-lechero/alertas`            | ComingSoon (En Desarrollo)   | Hato Lechero   |
| `/finanzas`                        | FinanzasDashboard            | Finance        |
| `/finanzas/gastos`                 | GastosView                   | Finance        |
| `/finanzas/ingresos`               | IngresosView                 | Finance        |
| `/finanzas/reportes`               | ReportesView                 | Finance        |
| `/finanzas/presupuesto`            | PresupuestoView              | Finance        |
| `/finanzas/configuracion`          | ConfiguracionFinanzas        | Finance        |
| `/reportes`                        | ReportesDashboard            | Reports        |
| `/reportes/generar`                | ReporteSemanalWizard         | Reports        |
| `/produccion`                      | ProduccionDashboard          | Production     |
| `/ganado`                          | GanadoDashboard              | Cattle         |
| `/ganado/movimientos`              | GanadoMovimientos            | Cattle         |
| `/clima`                           | ClimaDashboard               | Climate        |
| `/clima/historico`                 | ClimaHistorico               | Climate        |
| `/configuracion`                   | ConfiguracionDashboard       | Settings       |
| `/ventas`                          | ComingSoon                   | Not implemented|
| `/lotes`                           | ComingSoon                   | Not implemented|
| `/login`                           | Login                        | Auth (public)  |

---

## Module Access Control (per-user)

Per-user module visibility governs 4 modules: **`aguacate`, `hato_lechero`, `ganado`, `finanzas`**.

- **Source of truth**: `usuarios.modulos_acceso text[]` (migration 049).
- **Pure rule**: `puedeAccederModulo(profile, moduloKey)` in `src/utils/modulosAcceso.ts` (unit-tested in `src/__tests__/modulosAcceso.test.ts`):
  1. `profile == null` → **true** (fail open)
  2. `profile.rol === ''` → **true** (temporal/unconfirmed profile — fail open so Gerencia is never briefly locked out during `AuthContext`'s 2s profile window)
  3. `profile.rol === 'Gerencia'` → **true** (Gerencia always has every module)
  4. else → `profile.modulos.includes(moduloKey)`
- **Administrador / Verificador start with `'{}'`** and see only non-governed items until a Gerencia user configures them.
- **Enforced at two layers, both driven by that one function**: the sidebar filter in `Layout.tsx`, and `ModuleGuard` layout routes in `App.tsx` (deny → `<Navigate to="/" replace/>`).
- **NOT a data boundary** — no RLS changes. Existing role-based RLS is untouched.
- **Configured** from Configuración → Usuarios (`UsuariosConfig.tsx`, Gerencia-only), persisted via the `usuarios/crear|editar` edge-function endpoints.
- **Exception — Producción**: `/produccion` sits under the Aguacate group but stays **Gerencia-only** (cost/rentabilidad data). Its sidebar leaf carries `soloGerencia: true` and `ProduccionDashboard` keeps its inner `RoleGuard allowedRoles={['Gerencia']}`.
- The Finanzas screens no longer carry inner Gerencia `RoleGuard`s — they are governed purely by the `finanzas` module. **Exception — Reportes**: `/finanzas/reportes` keeps an explicit `RoleGuard allowedRoles={['Gerencia']}`. Every `fin_*` table is Gerencia-only at the RLS layer (`es_usuario_gerencia()`, verified against production 2026-07-21), so without the guard a non-Gerencia user with the module granted would see a P&G full of zeros — indistinguishable from "no data" — instead of an explanation.
- `Monitor` role is unaffected: still fully blocked by `ProtectedRoute` (Telegram-only).

Sidebar structure (`Layout.tsx` `NAV`): Tablero General · **Aguacate** (group: Labores, Monitoreo, Aplicaciones, Inventario, Clima, Producción, Reportes) · **Hato Lechero** (group, all En Desarrollo: Tablero, Producción, Hato, Chequeos, Alertas) · Ganado · **Finanzas** (group: Dashboard, Gastos, Ingresos, Reportes, Presupuesto, Configuración) · Configuración.

Design/implementation plan: `docs/plan_sidebar_modulos.md`.

---

## Database

### Overview

PostgreSQL hosted on Supabase with 32+ tables, 7+ custom ENUM types, Row-Level Security (RLS), triggers, and audit logging. Full schema documentation is in `docs/supabase_tablas.md`.

### Key Domains

- **Configuration**: `lotes`, `sublotes`, `empleados`, `terceros`, `usuarios`, `productos`
- **Applications**: `aplicaciones`, `aplicaciones_calculos`, `aplicaciones_mezclas`, `aplicaciones_productos`, `aplicaciones_lotes`, `aplicaciones_lotes_planificado`, `aplicaciones_lotes_compras`, `movimientos_diarios`, `movimientos_diarios_productos`
- **Inventory**: `movimientos_inventario`, `compras`, `compras_productos`, `verificaciones_inventario`, `verificaciones_detalle`
- **Monitoring**: `monitoreos` (denormalized: one row per pest observation, includes `incidencia`, `lote_id`, FK to `plagas_enfermedades_catalogo`, floración fields: `floracion_sin_flor`, `floracion_brotes`, `floracion_flor_madura`, `floracion_cuaje`), `sublotes`, `plagas_enfermedades_catalogo`, `rondas_monitoreo`, `mon_conductividad` (soil CE readings), `mon_colmenas` (beehive health), `apiarios` (apiary config)
- **Labor**: `tareas`, `registros_trabajo`, `empleados_tareas`
- **Finance**: `fin_gastos`, `fin_ingresos`, `fin_transacciones_ganado`, `fin_conceptos_gastos`, `fin_proveedores`, `fin_categorias_gastos`, `fin_categorias_ingresos`, `fin_medios_pago`, `fin_regiones`, `fin_negocios`, `fin_compradores`, `fin_presupuestos` (budget allocations by concepto, year, negocio), `fin_parametros` (accounting inputs the system cannot derive: `cabezas_inventario_inicial`, `costo_cabeza_inventario_inicial`, `saldo_inicial_caja`)
- **Cattle inventory**: `gan_ubicaciones`, `gan_fincas` (hectáreas), `gan_potreros`, `gan_inventario` (snapshot per potrero: novillos/toros/peso promedio), `gan_movimientos` (event log: compra/venta/muerte/traslado_entrada/traslado_salida/ajuste; estado pendiente/confirmado/descartado), `gan_pesos_historico`
- **Dairy herd (Hato Lechero)** (migrations 053–060): `hato_toros` (bull catalog), `hato_animales` (individual registry, `numero` permanent chapeta), `hato_chequeos` + `hato_chequeo_vacas` (bimonthly vet check: raw + normalized layers), `hato_eventos` (append-only reproductive/lifecycle log), `hato_pesajes_leche` (weekly per-cow), `hato_produccion_quincenal` (fortnightly camión volume), `hato_protocolos` + `hato_tratamientos` + `hato_tratamiento_pasos`, `hato_alertas` + `hato_alertas_config` (Telegram closed-loop queue), `hato_pajillas` + `hato_pajillas_uso` (insemination straws), `hato_config` (editable formula params). Views: `v_hato_estado_actual`, `v_hato_pajillas_stock`
- **Production**: `produccion`, `reportes_semanales`
- **Climate**: `clima_lecturas` (rolling 24h window of 5-min Ecowitt readings — pruned daily by cron), `clima_resumen_diario` (pre-aggregated daily summaries: min/max/avg temp, humidity, wind, rainfall, radiation, UV — one row per day, scales indefinitely)
- **Audit**: `audit_log`

### Applications Data Architecture

The applications module has two distinct tracking layers — **do not confuse these**:

| Layer | Tables | Purpose |
|---|---|---|
| **Planned** | `aplicaciones_lotes_planificado`, `aplicaciones_productos`, `aplicaciones_mezclas` | What was planned before execution (lot targets, product dosis, mixes) |
| **Real** | `movimientos_diarios`, `movimientos_diarios_productos` | What actually happened per day (canecas, bultos, products used) |

`aplicaciones_lotes_planificado` is the canonical source for planned tree counts and lot assignments. `movimientos_diarios` is the canonical source for real execution data. Never substitute one for the other.

> **Removed tables** (migration 022): `aplicaciones_lotes_real`, `aplicaciones_productos_real`, `aplicaciones_productos_planificado`, `aplicaciones_mezclas_productos` — these were ghost tables from an abandoned design; they were never populated or queried.

### Migrations

Sequential SQL migrations live in `src/sql/migrations/` (001–063). See `src/sql/migrations/README_MIGRATION.md` for instructions on running them.

- **023**: `create_fin_transacciones_ganado` — cattle buy/sell transactions table with RLS
- **024**: `alter_fin_ingresos_add_columns` — adds `cantidad`, `precio_unitario`, `cosecha`, `alianza`, `cliente`, `finca` to `fin_ingresos`
- **029**: `create_clima_lecturas` — weather station readings table with UNIQUE(station_id, timestamp), B-tree + BRIN indexes, RLS
- **030**: `clima_cron_sync` — pg_cron + pg_net schedule to call `/clima/sync` every 5 minutes
- **031**: `add_colmenas_con_reina` — adds `colmenas_con_reina integer NOT NULL DEFAULT 0` to `mon_colmenas`
- **035**: `create_clima_resumen_diario` — daily aggregated weather table (PK: fecha + station_id), backfills from existing readings, prunes clima_lecturas to 24h
- **036**: `clima_daily_rollup_cron` — pg_cron at 00:15 Bogotá: aggregates yesterday's readings into clima_resumen_diario, deletes clima_lecturas older than 24h
- **037**: `allow_admin_insert_proveedores` — Administrador SELECT + INSERT policies on `fin_proveedores`
- **038**: `fix_trigger_compra_gasto_security_definer` — SECURITY DEFINER on `crear_gasto_pendiente_de_compra()` so the purchase-to-expense trigger bypasses RLS
- **039**: `fix_admin_purchase_workflow` — SECURITY DEFINER RPC `fn_cleanup_compra_dependencies()`, FK ON DELETE SET NULL on `fin_gastos.compra_id`, Administrador storage policies on `facturas` bucket
- **040**: `admin_delete_tareas` — Administrador DELETE policy on `tareas` (scoped to `created_by = auth.uid()` OR legacy NULL rows) and BEFORE INSERT trigger `set_tarea_created_by()` to auto-populate `created_by` on new tareas
- **041**: `create_esco_memorias` — long-term memory table for Esco's "save this for later" flow. Soft-delete via `archived_at`. RLS policy scopes rows to `user_id = auth.uid()`. Loaded into the system prompt at conversation start (cap 50, ordered DESC).
- **042**: `backfill_ingresos_unidades_cosecha` — backfills `fin_ingresos.cantidad`/`precio_unitario` by parsing `nombre` (Aguacate Hass: kilos, e.g. "1540"; Hato Lechero: litros, e.g. "12702 L") and derives `cosecha` for aguacate from `fecha` via `fn_cosecha_aguacate()`. Adds BEFORE INSERT trigger `trg_set_cosecha_aguacate` (SECURITY DEFINER) so new aguacate income rows auto-link to their cosecha when none is given. Applied to production 2026-06-09.
- **043**: `fix_cosecha_aguacate_etiqueta_anio` — corrects the cosecha labeling rule in `fn_cosecha_aguacate()` and relabels existing aguacate rows: Principal nov–feb is labeled with the year it ends (dec 2025–feb 2026 = "Principal 2026"); nov/dic → Principal (year+1), ene–abr → Principal (same year, mar–abr are sale tail), may–oct → Traviesa (same year, sep–oct are sale tail). Applied to production 2026-06-09.
- **044**: `create_ganado_inventario` — live cattle inventory (issue #51): `gan_ubicaciones` → `gan_fincas` (hectáreas) → `gan_potreros` → `gan_inventario` snapshot + `gan_movimientos` event log + `gan_pesos_historico`. Trigger `fn_crear_movimiento_pendiente_ganado()` (AFTER INSERT on `fin_transacciones_ganado`, SECURITY DEFINER) creates a `pendiente` movement per new finance transaction; `fn_aplicar_movimiento_ganado()` applies confirmed movements to `gan_inventario` (and logs to `gan_pesos_historico` when peso present). Partial unique indexes on `transaccion_ganado_id` block double confirmation. Seeds the 3 ubicaciones and `gan_fincas` from distinct historic transaction fincas. RLS: SELECT all authenticated; write Administrador + Gerencia. Applied to production 2026-06-10.
- **045**: `fix_aplicar_movimiento_ganado_upsert` — fixes 044's apply-trigger: `INSERT ... ON CONFLICT DO UPDATE` validates CHECK constraints on the proposed row before conflict arbitration, so every negative-delta movement (venta/muerte/traslado_salida) failed even with sufficient inventory. Rewritten UPDATE-first with INSERT fallback. Applied to production 2026-06-10.
- **046**: `add_produccion_calidad` — adds optional `kg_exportacion`/`kg_nacional` NUMERIC(12,2) columns to `produccion` with CHECK enforcing exact sum against `kg_totales` when both are non-null. Applied to production 2026-06-12.
- **049**: `add_usuarios_modulos_acceso` — adds `modulos_acceso text[] NOT NULL DEFAULT '{}'` to `usuarios`. Per-user app-module visibility (`aguacate` | `hato_lechero` | `ganado` | `finanzas`). Navigation/visibility only — **NOT enforced by RLS**. Gerencia bypasses it in app code. Applied to production 2026-07-21.
- **050**: `gastos_created_by_tracking` — BEFORE INSERT triggers on `fin_gastos` and `fin_transacciones_ganado` (`set_gasto_created_by()` / `set_transaccion_ganado_created_by()`, same `COALESCE(created_by, auth.uid())` pattern as migration 040's tareas trigger) so every new row is attributed to its creator going forward. One-time backfill for 2026: 48 gastos Efrain confirmed as his (matched by `fecha`+`nombre`+`valor`, 3 of the 45 identified entries had 2 identical physical rows each — pre-existing duplicate data entry) are attributed to him; the remaining 453 `fin_gastos` rows dated in 2026 are attributed to Consuelo. Rows outside 2026 (3870), and `fin_transacciones_ganado` history, are left with `created_by = NULL` (never populated pre-migration, no way to backfill). Applied to production 2026-07-21.
- **051**: `add_clasificacion_costos` — adds `tipo_costo` (`directo` | `indirecto`, NOT NULL DEFAULT `'indirecto'`) to `fin_categorias_gastos` and a nullable override on `fin_conceptos_gastos` (NULL = inherit). Drives the Margen de Contribución line in `/finanzas/reportes`; editable from Configuración → Finanzas → Reportes. Seeds by `ILIKE`, not equality — the production catalog diverged from the versioned SQL (the real category is `Mano de Obra y Asistencia Técnica`, while `calculosCostoKg.ts:41` still compares against `'Mano de Obra'`). Result: 7 directas / 7 indirectas. Applied to production 2026-07-21.
- **052**: `create_fin_parametros` — key/value table (`clave`, `anio`, `negocio_id`, `valor`) for accounting inputs the system cannot derive from its own data. Unique index over `COALESCE`d columns, so writes must be UPDATE-by-id then INSERT — **never PostgREST upsert**, since `on_conflict` cannot reference an expression index. RLS Gerencia-only via `es_usuario_gerencia()`. Applied to production 2026-07-21.
- **053–060**: **Hato Lechero module schema (session S1)** — 8 migrations shipped as one PR (the plan numbered them 050–057, renumbered +3 because 050–052 were already taken). All `hato_*` tables use the 044 RLS pattern (SELECT authenticated / write Administrador+Gerencia); SQL comments in Spanish. **Applied to production 2026-07-22** (15 tables + 2 views, 32 policies, 14 seeded rows; the live body of `fn_crear_movimiento_pendiente_ganado()` was verified byte-identical to 044 before 059 replaced it, so the only behavioral delta is the `es_hato` guard).
  - **053**: `create_hato_core` — `hato_toros` (bull catalog, created first as FK target), `hato_animales` (one row per animal forever; `numero integer UNIQUE` permanent chapeta, `raza`, `padre_toro_id`→`hato_toros`, `madre_id`/`padre_id` self-FK, `estado` lifecycle), `hato_chequeos` (round header), `hato_chequeo_vacas` (`UNIQUE(chequeo_id, animal_id)`; raw `*_raw text` columns + normalized nullable columns — the "capa cruda" that survives normalization errors), `hato_eventos` (append-only lifecycle log; `tipo` covers servicio/celo/parto/secado_real/venta/muerte/…; `alerta_id` column declared here, FK back-patched in 056).
  - **054**: `create_hato_leche` — `hato_pesajes_leche` (`UNIQUE(animal_id, fecha)`, `litros_total` GENERATED), `hato_produccion_quincenal` (`UNIQUE(anio, mes, quincena)`, `quincena CHECK IN (1,2)`; the Pomar's fortnightly cycle, V3). "no pesada = sin dato (—), nunca 0" is a missing-row rule.
  - **055**: `create_hato_tratamientos` — `hato_protocolos` (catalog, e.g. Estrumate steps), `hato_tratamientos`, `hato_tratamiento_pasos` (`UNIQUE(tratamiento_id, paso_num)`, partial index on pending steps for the alert engine).
  - **056**: `create_hato_alertas` — `hato_alertas` (`regla_clave text UNIQUE` = idempotency key for `INSERT … ON CONFLICT DO NOTHING`), `hato_alertas_config` (seeded 5 tipos, `horas_escalamiento` default 48), the `hato_eventos.alerta_id` FK back-patch, and **view `v_hato_estado_actual`** (facts only — no raza date-math, no state machine, no thresholds; those live in `calculosHato.ts`, S2).
  - **057**: `create_hato_pajillas` — `hato_pajillas`, `hato_pajillas_uso` (append-only, `animal_id` optional), view `v_hato_pajillas_stock` (`cantidad_inicial − COUNT(usos)`; may go negative, UI warns but never blocks — Épica G).
  - **058**: `create_hato_config` — key/value + `jsonb` table (`UNIQUE(clave)`), seeds 9 defaults (`razas`, `meses_secado_por_raza` jersey/holstein=2 normanda=3, `meses_gestacion_default`=9, `umbral_partos_reemplazo`=9, dashboard windows=30d, `dias_parto_proximo_alerta`=14, `dias_servicio_sin_confirmacion`=45, `dias_rechequeo_due`=60). SELECT authenticated (the engine reads params for all hato users); write Gerencia-only via `es_usuario_gerencia()`. Defaults let the date/alert engine run before the Ajustes UI (S10) exists.
  - **059**: `fin_transacciones_ganado_hato_link` — adds `es_hato boolean NOT NULL DEFAULT false` + `hato_animal_id uuid`→`hato_animales` to `fin_transacciones_ganado`; `CREATE OR REPLACE` of `fn_crear_movimiento_pendiente_ganado()` (044 body verbatim + `IF NEW.es_hato THEN RETURN NEW` guard, so a lechera sale/death spawns **no** spurious ceba pending-movement); extends RLS to Administrador (037/039 precedent). Never edits 023/044.
  - **060**: `hato_alertas_cron` — pg_cron `'45 10 * * *'` (05:45 Bogotá) → `net.http_post` to `/make-server-1ccce916/hato/alertas/tick`, secret read from Supabase Vault (`vault.decrypted_secrets`, never committed). Endpoint ships in S6 — until then a daily benign 404, no data mutated.
- **061**: `hato_pesajes_litros_total` — corrects 054. `litros_total` was `GENERATED ALWAYS AS (COALESCE(litros_am,0)+COALESCE(litros_pm,0))`, but the farm records **one figure per cow per weighing day (am+pm already summed)** — no per-milking split exists, historically or going forward. The generated column forced a choice between two lies: put the total in `litros_am`, or leave both NULL and store `litros_total = 0` — and a stored 0 is indistinguishable from "this cow gave 0 litres", which is exactly what Épica D forbids. Uses `ALTER COLUMN … DROP EXPRESSION` (PG 14+; prod runs 17) to convert in place, then `SET NOT NULL` + `CHECK >= 0`. `litros_am`/`litros_pm` survive as optional detail that no longer feeds the total. Applied to production 2026-07-22 (table verified empty first).
- **062**: `hato_chequeo_estado_normalizado` — `hato_chequeo_vacas` stored `estado_raw` with **no normalized counterpart**, unlike every other column in that table, so `parseEstado()` had nowhere to land. Adds `estado TEXT` (`vacia_apta` | `vacia_problema` | `fecha_heredada` | `desconocido`; NULL = empty cell, never defaulted to "apta") and exposes it in `v_hato_estado_actual` as `ultimo_estado_chequeo` (appended **last** — `CREATE OR REPLACE VIEW` cannot reorder or insert columns). Also seeds a 10th `hato_config` key, `dias_espera_voluntaria_post_parto` (**provisional 60, unconfirmed by the owner**): the engine was borrowing `dias_servicio_sin_confirmacion` as a proxy, which coupled two different concepts — one counts from the *service*, the other from the *parto* — so changing one silently moved the other. Applied to production 2026-07-22.
- **063**: `ingresos_created_by_tracking` — the 050 fix, applied to `fin_ingresos`. The `created_by` column has existed since the original schema but no write path ever populated it, which blocked the Usuario filter in the Ingresos historial. Adds `set_ingreso_created_by()` + BEFORE INSERT trigger (same `COALESCE(created_by, auth.uid())` pattern as 050/040) and backfills **every** NULL row to Santiago. The unconditional backfill deliberately departs from 050, which left pre-2026 gastos NULL because their author was genuinely unrecoverable; here the author of the whole history is known. `fin_transacciones_ganado` is untouched — 050 already covers it, so ganado ventas need nothing. **Not yet applied to production.** The backfill targets `sforero94@gmail.com` — Santiago's account in `usuarios`, not the `santiago@thinksid.co` address the repo is worked from; the DO block aborts loudly if the lookup misses. Known gap, identical to gastos post-050: the Telegram bot inserts via the service role where `auth.uid()` is NULL, so bot-created rows still land as "Sin usuario".

### Hato Lechero Module (`/hato-lechero`, plan `docs/plan_hato_lechero_module.md`)

Individual-animal dairy herd registry (Subachoque, ~45 cows), distinct from the head-count `gan_*` cattle module — different domain, never copied into `gan_inventario`. **Three-layer data design** (mirrors `gan_movimientos → gan_inventario` and `rondas_monitoreo → observaciones`): raw layer (`hato_chequeo_vacas.*_raw`) preserves the planilla verbatim; event layer (`hato_eventos`) is the append-only source of truth; derived layer is the SQL view `v_hato_estado_actual` **plus** the pure TS engine `calculosHato.ts` (S2) — the view exposes facts only, all raza-dependent date math (SECAR = parto_probable − meses_secado(raza)) and every threshold live in the engine reading `hato_config`, **never as constants in code or in the view**. Absence of a row means "not checked", never 0 — same rule as monitoreo. RLS: 044 pattern; `hato_config` write Gerencia-only; `hato_alertas`/`hato_alertas_config` are written by the cron/bot via service-role (RLS-bypass, no extra policy). Module visibility gated by `ModuleGuard hato_lechero` (per-user `usuarios.modulos_acceso`) — navigation only, table RLS is the real boundary. As of S2 the schema and the pure engine exist; the frontend routes are still `ComingSoon` until S4+.

**Pure engine (S2)** — `src/utils/calculosHato.ts`, hand-mirrored to `src/supabase/functions/server/calculos-hato.ts` **and** `supabase/functions/make-server-1ccce916/calculos-hato.ts`. Zero imports, fully deterministic (every function that depends on "today" takes `fechaReferencia`). `src/__tests__/calculosHatoParidad.test.ts` enforces the copies are **byte-identical below the `// Tipos compartidos` marker** *and* behaviourally equal on shared fixtures — stricter than the `priorizacionScouting` parity test, which it can afford because the engine has no imports. **Change the logic in all three files in the same commit, and never hand-edit a copy to silence a parity failure — regenerate it.**

Three rules the engine encodes, each grounded in a sweep of all 45 chequeo sheets (2019–2026), not in the plan's assumptions:
- **`TP` is never read.** It is a frozen `TODAY()` formula: `F_Servicio + TP×30.44` converges on the workbook's last-save date regardless of the sheet's real year. Months of pregnancy are derived from `F Servicio` + chequeo date instead.
- **`SECAR` is derived in one step** from `F Servicio` (`meses_gestacion_default − meses_secado_por_raza[raza]`), not by chaining off `parto_probable` — chaining double-clamps when the service date lands on day 29–31 (99.4% vs 94.6% match across 1.156 rows).
- **`#VALUE!` is derived, not noise.** A multi-date `F Servicio` cell makes Excel's TP/SECAR/PP formulas cascade to `#VALUE!`; the engine recovers the dates and re-derives the values. An uninterpretable cell **never** drops a row — it lands in `issues` with the raw value intact, same contract as monitoreo's "missing row ≠ 0".

All thresholds come from `hato_config` (migration 058) via the `HatoConfig` parameter — **no business constant lives in the engine**. `detectarColisionesChapeta` reports duplicate chapetas but never breaks a tie: at least 9 numbers are shared by concurrently-active animals (incl. `#162`, `#175` in the July 2026 sheet), which blocks `hato_animales.numero UNIQUE` until Martha adjudicates each pair in S3.


### Monitoring Module (`/monitoreo`) — incidencia aggregation

`monitoreos` is denormalized: **one row per pest observation per visit** — a monitor only inserts a row for a pest they chose to record, so there is NO explicit "0%, not found" row. Absence of a row means "not checked", not "not present". Rows link to a real round via `monitoreos.ronda_id` → `rondas_monitoreo` (a round can span several calendar dates depending on the lote — always group by `ronda_id`, never by `fecha_monitoreo`).

The three dashboard views (`DashboardMonitoreoV3.tsx`) were homologated 2026-07 so they never disagree on the same number. Two display contracts:

- **Single-datum views** (most-recent value): use the latest `ronda_id` per (lote/sublote × plaga). The Snapshot table filters to one selected `ronda_id`.
- **Multi-datum views** (matrix/trend): group by the last N distinct `ronda_id`. A pest with no row in a given round renders **blank (`—`), never 0%**, so "not checked" is never confused with "found in 0 trees". The Mapa de Calor's row/column "Prom" is computed over the SAME visible round window as the chained cells (not a wider history).

Weighted incidencia everywhere via `calcularIncidencia(afectados, monitoreados)` and the shared `clasificarGravedad` color buckets (10% / 30%) from `src/utils/calculosMonitoreo.ts` — never re-derive inline or use a different color scale.

**Scouting priority** (`PriorizacionScoutingView.tsx` → `usePriorizacionMonitoreo.ts` → pure engine `src/utils/priorizacionMonitoreo.ts`, hand-ported to `src/supabase/functions/server/priorizacion-scouting.ts` for Esco/Telegram — keep byte-identical, guarded by `priorizacionScoutingParidad.test.ts`): only a (sublote, plaga) with a reading in the **most recent round** (`rondaActualId`) is shown. A combination whose last reading is from an older round is excluded entirely — surfacing a stale reading as if current would fire alerts (and potentially an application) on months-old data. Combinations with a single round show the value without a trend arrow.

### Production Module (`/produccion`)

Redesigned 2026-06 around two goals: agronomic yield analysis and cost-per-kilo. Key facts:

- `produccion` holds one consolidated record per (lote, sublote, año, cosecha_tipo) — no harvest dates. Records exist at BOTH lote level (historic 2023–2025) and sublote level (2024+). All aggregation queries must consolidate via the `consolidarRegistros` pattern (lote-level record wins; otherwise sum sublotes) — never filter `sublote_id IS NULL` alone, it silently drops sublote-registered cosechas.
- **Cost-per-kilo engine** (`src/utils/calculosCostoKg.ts`, pure + tested; fetching in `src/components/produccion/hooks/useCostoKg.ts`): direct lote costs (lote-tagged `registros_trabajo` labor + `movimientos_diarios_productos` × `productos.precio_unitario` insumos) + farm overhead (`fin_gastos` Confirmado, Aguacate Hass negocio, excluding labor/insumo categories to avoid double-counting) allocated by `lotes.total_arboles` (NOT hectares; zero-tree lotes excluded). Per-cosecha figures split lote-year cost proportionally by kg. Lote-level cost data only exists from 2026 (labor starts Oct 2025, insumos Dec 2025); earlier years fall back to farm-level totals. Cost/kg is lote-level only — no cost source reaches sublotes.
- **Bulk capture grid** (`CapturaCosechaGrid.tsx` + `useCapturaCosecha.ts`): replaces the removed `RegistrarProduccionDialog`. All lote/sublote rows for a selected cosecha in one editable table (supports backfilling past cosechas), kg/árbol outlier detection against the lote's history with mandatory confirmation, UPDATE-by-id then INSERT (never PostgREST upsert — UNIQUE treats NULL sublote_id as distinct).
- Dashboard: 3 KPIs (kg totales, kg/árbol, costo/kg) + 2 tabs (Rendimiento, Rentabilidad). The old Edad vs Rendimiento tab was removed.

### Ganado ↔ Finance Integration

Cattle buy/sell transactions live in `fin_transacciones_ganado` (not in `fin_gastos`/`fin_ingresos`). The Gastos and Ingresos historial views merge ganado records alongside regular records using a `UnifiedFinanceItem` discriminated union. Ganado items display with an amber `[Ganado]` badge and route to `TransaccionGanadoForm` for editing (not `GastoForm`/`IngresoForm`).

Key files:
- `src/components/finanzas/components/TransaccionGanadoForm.tsx` — create/edit dialog for ganado transactions, with dropdown selectors for finca (from the shared `gan_fincas` catalog, falling back to distinct transaction values), proveedor (`fin_proveedores`), and cliente (`fin_compradores`). New finca names are inserted into `gan_fincas`.
- `src/types/finanzas.ts` — `UnifiedFinanceItem` type
- `src/components/finanzas/components/GastosList.tsx` — merges `fin_transacciones_ganado` compras
- `src/components/finanzas/components/IngresosList.tsx` — merges `fin_transacciones_ganado` ventas

### Financial Reports (`/finanzas/reportes`) — P&G + Flujo de Caja

Two reports × four views (Global, Aguacate Hass, Ganado, Hato Lechero). Global includes *every* negocio — Oficina Central, Caballos, Agrícola, Finca de Descanso have no view of their own. Design doc: `docs/plan_reportes_finanzas.md`.

**Accounting rules the engine enforces** (approved by the owner; changing one is a business decision, not a refactor):

- **Only `estado='Confirmado'` gastos count.** Pendientes are excluded and surfaced as a warning with their total.
- **Buying cattle is not an expense — it is inventory.** The purchase never appears in the P&G; only the COGS of animals actually sold crosses the line, at a **moving weighted average per head** (`costoVentaGanado.ts`). Per head and not per kilo on purpose: the animal is bought thin and sold fat, so costing sold kilos at purchase price would charge the fattening twice — feed and vet are already in `fin_gastos`. The purchase *is* a cash outflow in the Flujo de Caja: that asymmetry is the single most misread thing in these two reports and carries its own labelled line.
- **The COGS calculation is path-dependent** — the hook fetches the *entire* `fin_transacciones_ganado` history, never just the year. Truncating the series changes the answer (there is a test that proves it).
- **Cosecha assignment (aguacate only)**: `Traviesa N` ← egresos ene–jun of N; `Principal N` ← egresos jul–dic of **N−1** (it is sold nov N−1 → abr N, so that is the semester the fruit was worked). Controlled by the single constant `DESFASE_ANIO_PRINCIPAL` in `periodosReporte.ts`.
- **No prorrateo between negocios.** `fin_gastos.negocio_id` is NOT NULL, so every gasto already has its business. Note the consequence: Oficina Central (~$2.356M historical, zero income) is pure shared overhead that no per-business utility carries — it only shows up in Global.
- **P&G columns are cumulative** (Q1 ⊂ Q1–Q2 ⊂ Q1–Q3 ⊂ Año); the Flujo de Caja is 12 calendar months.

**Structure**: pure engines in `src/utils/` (`periodosReporte`, `clasificacionCostos`, `costoVentaGanado`, `calculosPyG`, `calculosFlujoCaja`, `reportesFinancierosComun`) — zero Supabase imports, tested in `src/__tests__/` — fed by a single fetching hook (`useReportesFinancierosData`) that loads once per year and serves all 4 views, so the two reports can never disagree by having read the DB at different moments.

**Contracts that matter when editing:**

- Report lines are a **flat ordered array** with `nivel` + `padre_id`, not a tree: the table, the PDF and the Excel all walk the same structure.
- `valores`/`meses` are **always positive**; the sign lives in `esResta`/`signo`. Never infer sign from the value.
- `sinDato[]` marks cells that render `—` rather than `0` — the difference between "the margin was 0%" and "there were no sales, so there is no percentage".
- **All report queries must go through `fetchAll`** (`src/utils/supabase/fetchAll.ts`). There are ~1.250 gastos per year and PostgREST silently caps at 1.000.
- The PDF/Excel exporters reuse `formatearCelda`/`formatearCeldaFlujo` from the table components. Do **not** switch them to `formatearMoneda` (used by the older PDF generators): it renders the COP symbol and the PDF would stop matching the screen.
- **Never feed these reports from `movimientos_diarios_productos`, `movimientos_inventario`, `compras` or `registros_trabajo`.** Those are operational costing (cost/kg per lote) and would double-count insumos already captured in `fin_gastos` by the compra→gasto trigger. The only sources are `fin_gastos`, `fin_ingresos` and `fin_transacciones_ganado`.
- Financial tables need real CSS, not Tailwind: `table-fixed`, `tabular-nums` and `border-collapse` **do not exist** in the frozen `index.css`. The `.tabla-financiera` / `.celda-num` / `.col-etiqueta` rules live in `globals.css`. `.tabla-financiera .col-etiqueta` must keep its specificity above `.tabla-financiera td`, or long labels overflow onto the first figure.

### Gastos historial (`/finanzas/gastos`) — view contract

`GastosView` opens on the **Historial** tab (leftmost); `?tab=registrar` still deep-links to the capture grid. `GastosList` defaults its period filter to **`ytd`**, not `mes_actual` — that default is repeated in three places (initial state, the navigation-state effect, and the clear-filters reset); change all three together or they silently disagree.

- **Usuario filter** — filters `created_by` on both `fin_gastos` and `fin_transacciones_ganado`, plus a "Sin usuario" option for `created_by IS NULL` (everything before migration 050, i.e. all pre-2026 rows and all ganado history).
- **Selection subtotal** — per-row checkboxes plus "seleccionar todos"; the subtotal is computed over `unifiedItems`, so it always reflects the active filters. Selection resets whenever filters or the search query change.
- **Detail dialog** (`GastoDetalleDialog.tsx`) — opens on row click for gasto and ganado items alike, and carries Editar / Eliminar / Completar. The row's `onClick` is suppressed on the checkbox and the `⋮` wrapper via `stopPropagation`.
- **Mobile** — the `⋮` menu is `hidden sm:block` **on purpose**: it is gated on `group-hover`, which never fires on touch, so on mobile the detail dialog is the only path to the actions. Do not re-enable it on mobile without also removing the hover gate. The two-line mobile row and the collapsible filter bar rely on the custom `globals.css` classes listed in the frozen-Tailwind caution zone below.
- **The list container must not carry `overflow-hidden`.** The `⋮` menu is absolutely positioned and opens downward, so clipping the container hid the actions on the last rows entirely — on desktop that menu is the only path to them besides the dialog. Corner rounding is handled instead by `.lista-financiera` (`globals.css`), which rounds the first and last row. Note its radius is `calc(var(--radius) + 4px)`, not Tailwind's stock `0.75rem`: **this build redefines `rounded-xl`** (`--radius` is `1rem`, so the real radius is 20px). Anything matching that container's corners must use the same expression.
- Row hover was written `hover:bg-gray-50/50` and did **nothing** — the frozen build ships `.hover\:bg-gray-50` but no opacity-modified variant. Corrected to `hover:bg-gray-50`, which matters now that the whole row is clickable and needs the affordance. A live row background is also what makes the `.lista-financiera` rounding load-bearing rather than decorative.

### Ingresos historial (`/finanzas/ingresos`) — view contract

Mirrors the Gastos contract above (Historial default + leftmost, `?tab=registrar` deep-link, `ytd` default repeated in the same three places, Usuario filter, selection subtotal, row-click detail dialog, collapsible mobile filters, no `overflow-hidden` on the list container). It reuses the same `globals.css` classes — `.filtros-toggle`, `.filtros-colapsables`, `.gasto-nombre`, `.gasto-meta-movil`, `.lista-financiera`. The `gasto-` prefix is historical: **the rules are module-agnostic and shared with Ingresos on purpose** — renaming them means touching both lists.

Where it deliberately differs from Gastos, because `fin_ingresos` has no such column:

- **No `estado`** — no Confirmado/Pendiente filter, no estado icon, no "N pendientes" counter, and no Completar action. `IngresoDetalleDialog` therefore has no `onCompletar` prop, unlike its gastos twin.
- **No `concepto`** — the categoría filter has no cascade; instead it is **scoped by negocio** (`categoriasFiltradas`), and selecting a negocio clears `categoria_id`. Gastos does neither.
- **Extra ingreso-only fields** surfaced in the detail dialog: `cantidad`, `precio_unitario`, `cosecha`, `alianza`, `cliente`, `finca` (migration 024 columns that had no UI until now).
- **Usuario filter** — `created_by` on `fin_ingresos` is populated by migration **063**, not 050; the `fin_transacciones_ganado` half was already covered by 050.
Everything else is intentionally identical to Gastos — the two lists should stay in sync.

### Cattle Inventory Module (`/ganado`, issue #51)

Live head-count inventory layered on top of the finance transactions. Hierarchy: `gan_ubicaciones` → `gan_fincas` (hectáreas) → `gan_potreros` → `gan_inventario`. `gan_movimientos` is the source of truth; a DB trigger applies confirmed movements to the `gan_inventario` snapshot (CHECK constraints prevent negative counts).

Pending-confirmation flow (anti double-count): saving a `TransaccionGanadoForm` fires a DB trigger that creates a `pendiente` movement carrying the signed head count in `novillos_delta` (negative for ventas) and derived peso promedio. The user confirms it from `/ganado/movimientos`, assigning potrero + novillos/toros split (sum must equal the transaction's cabezas); only then is `gan_inventario` updated. Pendientes can be `descartado` if already registered manually; partial unique indexes block confirming the same transaction twice.

Key files:
- `src/components/ganado/GanadoDashboard.tsx` — KPIs (total cabezas, novillos, toros, variación 30 días, cabezas/ha por ubicación), cascading filters, inventory table, pending banner, bulk-adjust dialog, and initial-load dialog
- `src/components/ganado/components/InventarioInicialDialog.tsx` — "Cargar inventario inicial" per finca (no potrero setup needed): heads land as confirmed `ajuste` movements on an auto-created "General" potrero per finca. Surfaced as an empty-state banner when total inventory is 0; warns on fincas that already have heads (the load sums, not replaces)
- `src/components/ganado/GanadoMovimientos.tsx` — event log + manual registration (muerte/traslado/ajuste) + pending confirmation
- `src/components/ganado/hooks/useGanadoInventario.ts` — all Supabase access for the module
- `src/utils/calculosGanado.ts` — pure logic (KPIs, traslado building, split validation, bulk-adjust diffing); tested in `src/__tests__/calculosGanado.test.ts`
- `src/components/configuracion/GanadoConfig.tsx` — CRUD for ubicaciones/fincas/potreros (Configuración → Ganado tab)
- `src/components/finanzas/dashboard/components/InventarioGanadoKPIs.tsx` — inventory KPI strip embedded in the finance Ganado tab (renders nothing until migration 044 is applied)

UI write actions are gated to Administrador + Gerencia (matching RLS); other roles see read-only views.

> **Note**: There are two files with the `019_` prefix (`019_auto_reporte_semanal.sql` and `019_storage_policies_reportes.sql`) due to a naming conflict. Check which have been applied before creating new migrations.

### Supabase Edge Functions

The edge function server uses **Hono** (via Deno/npm imports) and lives in `src/supabase/functions/server/`. Endpoints include:
- Health check
- CSV product import
- User CRUD
- Product toggle
- Weekly report generation (calls DeepSeek `deepseek-v3.2` via OpenRouter, fetches 4-week historical context from DB + Notion)
- **Esco chat agent** (`chat.tsx`) — conversational data assistant for farm management. Uses Gemini 3 Flash Preview (`google/gemini-3-flash-preview`) via OpenRouter with tool-calling loop (`tool_choice: 'required'` on round 0). Exports `llmToolLoop(messages, userId?)` and `getSystemPrompt(memorias?)` (used by telegram bot). 30 tools cover: labor summaries, employee activity, monitoring (with floración + per-sublote aggregation), applications, **per-lote/per-árbol cost analysis (`get_application_cost_by_lote`, `get_cost_by_lote`)**, inventory, finances, budget/presupuesto, production, harvests, lot info, purchases, inventory movements, application details, weekly overviews, climate data (Ecowitt + OpenWeatherMap forecast), soil conductivity (CE), beehive/apiario health, **live cattle inventory (`get_ganado_inventory`: head counts by ubicación/finca/potrero, cabezas/ha, 30-day variation, pending confirmations — distinct from `get_financial_summary type=ganado` which covers money)**, **P&G and cash flow (`get_pyg_flujo_caja`) — same accounting rules as `/finanzas/reportes`, see below**, **agronomic web search with citations (Tavily)**, and **user-triggered long-term memory (`propose_memory_save`, `commit_memory_save`, `forget_memory`)**. Pure logic (cost rollup, Tavily/OpenWeather parsing, memory proposals, cattle inventory aggregation) lives in `cost-aggregation.ts`, `external-tools.ts`, `memory.ts`, `ganado-inventario.ts` and `reportes-financieros.ts` so each module is unit-testable from Vitest without crossing the Deno boundary. The Telegram bot inherits all tools automatically via `llmToolLoop`.
- **Telegram bot webhook** — registered at `/make-server-1ccce916/telegram/webhook` in `index.ts`. Uses Grammy with conversations plugin. The `handleWebhook` import in `index.ts` is critical — without it the bot returns 404. Both `index.ts` copies must stay in sync.
- Key-value store (`kv_store.tsx`)

#### Esco Chat Agent (`chat.tsx`)

The chat agent ("Esco") is a non-streaming tool-calling loop that queries farm data via PostgREST, aggregates results, and returns structured JSON to the LLM for natural language response.

Key behaviors:
- **Gastos**: Only `estado=Confirmado` records are included (matches finance dashboard)
- **Ingresos**: Includes negocio join, extended columns (`cantidad`, `precio_unitario`, `cosecha`, `cliente`, `finca`), and category aggregation
- **Ganado**: Aggregates compra/venta totals and per-finca breakdown
- **Labor costs**: Computed as `(salario + prestaciones_sociales + auxilios_no_salariales) / 22` per jornal for employees; `tarifa_jornal` for contractors
- **Financial search**: `search_term` parameter filters gastos/ingresos by `nombre` (ilike)
- **Negocio filter**: Resolves `negocio_name` to IDs and applies to gastos and ingresos queries

**`get_pyg_flujo_caja` and the parity contract.** `src/supabase/functions/server/reportes-financieros.ts` is a hand-maintained Deno-side port of the frontend engines (`calculosPyG`, `calculosFlujoCaja`, `costoVentaGanado`, `periodosReporte`, `clasificacionCostos`) — `chat.tsx` cannot import across the deployment-tree boundary, same constraint that produced `priorizacion-scouting.ts`. Only the numbers are ported; the flat line array, the PDF contract and the expand/collapse stay in the frontend.

`src/__tests__/reportesFinancierosParidad.test.ts` feeds BOTH implementations the same fixtures and asserts the totals match exactly. **Touching the accounting logic on one side without the other fails that test** — that is the point. When changing a rule, change both files in the same commit.

`execPygFlujoCaja` reads through `supabaseQueryAll` (paginated). A plain `supabaseQuery` would silently cap at 1.000 rows and `fin_gastos` spans two years (~2.500 rows), producing a P&G that looks normal and is wrong.

Esco's system prompt carries the accounting rules verbatim (cattle purchases are inventory not expense, cosecha semesters cross calendar years, no prorrateo of Oficina Central) so the model explains discrepancies instead of inventing them. `get_financial_summary`'s description now explicitly steers away from profitability questions: subtracting its gastos from its ingresos contradicts the P&G, because there cattle purchases count as an outflow.

**Required edge function secrets** (set via Supabase Dashboard → Project Settings → Edge Functions):
- `OPENROUTER_API_KEY` — OpenRouter API key (used for DeepSeek and Gemini 2.5 Flash via OpenRouter)
- `NOTION_TOKEN` — Notion integration token (for owner call summaries; optional, graceful fallback if absent)
- `ECOWITT_APP_KEY` — Ecowitt application key for climate data sync
- `ECOWITT_API_KEY` — Ecowitt API key
- `ECOWITT_MAC` — Ecowitt weather station MAC address (84:1F:E8:35:D8:73)
- `TAVILY_API_KEY` — Tavily search API key (used by Esco's `web_search_agronomic` tool for cited agronomic Q&A)
- `OPENWEATHER_API_KEY` — OpenWeatherMap API key (used by Esco's `get_weather_forecast` tool for 5–7 day forecast)
- `FARM_LAT`, `FARM_LON` — optional. Override the default farm coordinates for the weather forecast. Defaults to Aguadas, Caldas (≈ 5.6094, -75.4582)
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — auto-injected by Supabase

**Deploy command**: `npx supabase functions deploy make-server-1ccce916`
Note: The local source in `src/supabase/functions/server/` must be kept in sync with `supabase/functions/make-server-1ccce916/` manually — changes to one must be applied to the other.

---

## Styling & Theming

- **Tailwind CSS 4.1** — utility-first, using the **CSS-first configuration** approach (no `tailwind.config.js` or `postcss.config.js`). Tailwind is not listed as an explicit `package.json` dependency; it is embedded in the build pipeline via Vite.
- **CSS Variables** — theming via `:root` custom properties (green/agricultural palette) using `@theme inline` in `globals.css`
- **Primary color**: `#73991C` (olive green)
- **Font**: Visby CF (loaded from CDN in globals.css)
- **UI components**: Radix UI primitives wrapped in `src/components/ui/` with Tailwind + `cn()` utility (`clsx` + `tailwind-merge`)
- **`index.css`** is the compiled Tailwind output — do not edit it manually
- **`src/styles/globals.css`** is the source of truth for theme customizations, `@font-face` declarations, and Tailwind directives (`@custom-variant`, `@theme`, `@layer`)

---

## Testing

Tests use **Vitest** and live in `src/__tests__/`. They mock the Supabase client.

```bash
npm test             # Single run
npm run test:watch   # Watch mode
```

Selected test files (the directory holds ~25 — run `ls src/__tests__/` for the full set):
- `aplicacionesReales.test.ts` — Real applications data handling
- `generarReporteSemanal.test.ts` — Report generation logic
- `laborImprovements.test.ts` — Labor module improvements
- `laborRegistration.test.ts` — Labor registration & DB trigger shapes
- `reporteSemanal.test.ts` — Weekly report logic
- `dialogScrollContract.test.ts` — Static guard: every `DialogContent` must scroll (see Dialog Size System)

When adding new tests, place them in `src/__tests__/` and follow existing patterns for mocking Supabase.

---

## Linting

ESLint is configured in `eslint.config.js` with:

- **Base**: JS recommended + TypeScript ESLint recommended
- **React Hooks**: all standard rules enforced; React Compiler rules set to **warn** (optimization hints, not correctness bugs)
- **`@typescript-eslint/no-explicit-any`**: warn
- **`@typescript-eslint/no-unused-vars`**: warn (ignores `_` prefixed vars)
- **Ignored directories**: `node_modules`, `build`, `dist`, `src/supabase`, `supabase`

Run lint before committing:
```bash
npm run lint
```

---

## Code Conventions

### File Naming
- **Components**: PascalCase (e.g., `InventoryList.tsx`, `KanbanBoard.tsx`)
- **Utilities/hooks**: camelCase (e.g., `calculosAplicaciones.ts`, `useFormPersistence.ts`)
- **Types**: camelCase (e.g., `aplicaciones.ts`, `finanzas.ts`)
- **Tests**: `*.test.ts` in `src/__tests__/`

### Component Patterns
- Functional components only (no class components)
- Props typed with `interface` definitions
- Event handlers prefixed with `handle` (e.g., `handleSubmit`, `handleDelete`)
- Loading states managed with local `useState<boolean>`
- Data fetching inside `useEffect` or custom hooks

### Imports
- Always use the `@/` path alias for project imports
- Group imports: React/libraries first, then project modules
- Named exports preferred (except default exports where React Router expects them)

### Language
- Code comments and variable names are in **Spanish** (the app's domain language)
- UI text is in Spanish
- Technical/config files and CLAUDE.md are in English

### TypeScript
- Strict mode enabled — avoid `any` (use `unknown` + type narrowing)
- Prefix intentionally unused variables with `_`
- Define types in `src/types/` for shared domain models
- Inline types are acceptable for component-local props

---

## Caution Zones

### ⚠️ Tailwind classes are FROZEN (`src/index.css`)

`src/index.css` is a **checked-in, pre-compiled Tailwind v4.1.3 build**. Tailwind does **not** run during `vite build` (it is not a dependency in `package.json`; there is no Tailwind plugin in `vite.config.ts`). **The set of usable utility classes is therefore fixed** — any class not already present in `index.css` is silently ignored (no error, the style simply never applies). This includes arbitrary values (`bg-[#E7EDDD]`) and opacity modifiers (`bg-primary/10`).

Before using an unfamiliar utility, check it exists:
```bash
grep -cF 'bg-sidebar-accent' src/index.css   # 0 = does not exist, will do nothing
```
⚠️ That plain form only works for classes **without a `:`**. Variants (`sm:`, `hover:`, `focus:`) are written escaped in the CSS (`.sm\:inline`), so `grep -F 'sm:inline'` returns 0 even when the class exists — a false negative. Search the escaped form instead:
```bash
grep -oF 'sm\:inline' src/index.css | wc -l      # variant classes
grep -oE '\.sm\\:[a-z0-9\\:.\[\]-]+' src/index.css | sort -u   # list every sm: variant present
```
Beware substring matches: `sm\:flex` also matches inside `sm\:flex-row`. Verified **absent** as of migration 050 work: `sm:hidden`, `sm:flex`, `sm:w-auto`, `sm:text-right`, `sm:gap-*`, `tabular-nums`, `break-words`, `text-[10px]`, `px-1.5`/`py-1.5`, `w-[70px]` — several of these are already written in existing JSX and silently do nothing.

If it doesn't exist, add a real CSS rule to `src/styles/globals.css` (a live stylesheet, imported *after* `index.css`, so it wins the cascade) — e.g. `.nav-item-active`, or the `.filtros-toggle` / `.filtros-colapsables` / `.gasto-meta-movil` / `.gasto-nombre` rules that give the Gastos historial its mobile layout. Never hand-edit `index.css`.

See `src/guidelines/Guidelines.md` for the full design system.

### Supabase Migrations (`src/sql/migrations/`)
- **Do NOT modify existing migration files** — they may have already been applied to production
- New migrations must use the next sequential number (e.g., `023_description.sql`)
- Always test migrations against a development Supabase instance first
- RLS policies are critical for data security — review carefully before modifying

### Authentication & Security (`src/contexts/AuthContext.tsx`, `src/utils/supabase/client.ts`, `src/components/auth/`)
- The auth flow has careful timeout handling and fallback logic — do not simplify without understanding why
- RLS policies in the database enforce row-level access — changes to auth affect what data users can see
- Never expose the Supabase service role key in frontend code
- The `ProtectedRoute` and `RoleGuard` components are security boundaries

### Database Triggers
- Several triggers auto-sync data between tables (e.g., applications ↔ tasks, purchases ↔ expenses)
- Modifying table schemas may break triggers — check `src/sql/migrations/` for trigger definitions
- See `src/sql/migrations/README_APLICACIONES_LABORES_SYNC.md` for the sync architecture
- The `crear_gasto_pendiente_de_compra()` trigger uses SECURITY DEFINER to bypass RLS (migration 038). Any new triggers that touch cross-role tables should also use SECURITY DEFINER.
- The `fn_cleanup_compra_dependencies()` RPC function uses SECURITY DEFINER for the same reason (migration 039). Purchase deletion calls this via `.rpc()` instead of direct `fin_gastos.delete()`.

### Dialog Size System (`src/components/ui/dialog.tsx`)
All dialogs use a fixed-size tier via the `size` prop on `DialogContent`: `sm` (448×384px), `md` (576×512px), `lg` (768×640px), `xl` (1024×704px). These are max dimensions in rem — they never fill the screen. The base `DialogContent` enforces `overflow-hidden`, so scrollable content MUST go inside `<DialogBody>`. Never put `overflow-y-auto` on `DialogContent` directly. `StandardDialog` was removed — use `Dialog` + `DialogContent` + `DialogHeader` + `DialogBody` + `DialogFooter` directly.

**When a `<form>` wraps the dialog content**, it becomes the flex child and must be able to shrink, or it clips the panel exactly as if `DialogBody` were absent:

```tsx
<form onSubmit={…} className="flex flex-col flex-1 min-h-0 gap-4">
  <DialogBody className="space-y-4">{/* fields */}</DialogBody>
  <DialogFooter className="gap-3">{/* buttons */}</DialogFooter>
</form>
```

`src/__tests__/dialogScrollContract.test.ts` enforces both rules across the codebase. See `docs/bugs/2026-07-21-dialog-sin-scroll-usuarios.md`.

---

## Known Issues

See `BUG_REPORT.md` for current tracked bugs. As of the last update, the Reporte Semanal (Weekly Report) module has several critical issues including PDF generation failures and RLS policy errors.

---

## Key Documentation

Start with [`docs/README.md`](docs/README.md) for the living-document index. Completed plans, resolved incidents and one-time setup guides live under [`docs/archive/`](docs/archive/README.md).

| Document | Location | Purpose |
|----------|----------|---------|
| Database schema | `docs/supabase_tablas.md` | Schema reference; validate against migrations |
| Financial-report rules | `docs/plan_reportes_finanzas.md` | Approved P&G and cash-flow accounting contract |
| Hato Lechero plan | `docs/plan_hato_lechero_module.md` | Active module design |
| CSV import guide | `docs/README_CARGA_CSV.md` | Monitoring bulk import |
| Lots / sublots guide | `docs/GUIA_CONFIGURACION_LOTES_SUBLOTES.md` | Configuration workflow |
| Application ↔ Labor sync | `src/sql/migrations/README_APLICACIONES_LABORES_SYNC.md` | Trigger architecture |
| Design guidelines | `src/guidelines/Guidelines.md` | UI/UX reference |
| SQL scripts index | `src/sql/README.md` | SQL script overview |
| Bug tracker | `BUG_REPORT.md` | Active known issues |

---

## Deployment

The app is deployed on **Vercel** with:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "build",
  "installCommand": "npm install",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

The `rewrites` rule ensures all routes are served by `index.html`, enabling React Router to handle client-side routing on page refresh.

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables in the Vercel dashboard.

---

## Priority: Code Quality

When working on this project, prioritize:
1. **Type safety** — leverage strict TypeScript, avoid `any`
2. **Correctness** — ensure data integrity, test edge cases
3. **Readability** — clear naming, consistent patterns
4. **Maintainability** — modular code, reuse existing patterns and components from `src/components/ui/` and `src/components/shared/`
5. **Security** — respect RLS policies, validate inputs at boundaries

---

## Number Formatting (Colombian Standard)

All monetary and numeric values in the UI **must** follow Colombian formatting:

- **No decimals** on monetary values. Round to integers.
- **Colombian thousands separator**: use dots (e.g., `1.234.567`).
- **Abbreviate to millions**: `$95M` not `$95.343.110 COP`. Use `2.000M` format — never use billions (Colombia doesn't use that scale).
- **No `COP` suffix** in the UI — currency is implicit.
- **Quantities**: no decimals unless the unit requires it (e.g., kg can have 1 decimal).
- Formatting utilities live in `src/utils/format.ts` — always use them, never format inline.

---

## Responsive & Layout Rules

- **Never modify desktop layout without verifying mobile**. The sidebar collapses on mobile — body content must not hide behind it.
- **Number inputs**: must prevent scroll-to-change with `onWheel={(e) => e.currentTarget.blur()}`. This is a critical bug source — users accidentally change values by scrolling.
- **Modals/popups**: always use the `Dialog` component with a `size` prop and `DialogBody` for scrollable content. Never bypass Radix Dialog with `createPortal`.
- **Sidebar collapse**: when collapsed, hover tooltips must have opaque background — never transparent text on transparent background.

---

## Session Wrap-Up Checklist

Before committing at the end of a session:

1. Run `npm run lint` and fix any issues from this session's changes.
2. Verify the app loads on mobile viewport (sidebar collapsed state).
3. Update this `CLAUDE.md` if any of these changed: schema, routes, edge functions, env vars, dependencies.
4. If edge functions were modified, redeploy: `npx supabase functions deploy make-server-1ccce916`.

---

## Edge Function Deployment

After modifying any Supabase edge function source in `src/supabase/functions/server/`:

1. **Always redeploy**: `npx supabase functions deploy make-server-1ccce916`
2. **Sync source**: keep `src/supabase/functions/server/` and `supabase/functions/make-server-1ccce916/` in sync — changes to one must be applied to the other.
3. **Verify**: after deploy, confirm the function is live by checking logs or hitting the health endpoint.
4. Forgetting to redeploy is a common source of "it works locally but not in production" issues.

---

## Language

- The user communicates in both **Spanish and English**. Respond in the language of the prompt.
- UI text and domain variable names are in **Spanish**.
- Code comments, config files, and CLAUDE.md are in **English**.
