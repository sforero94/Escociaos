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
│   │   │   ├── GraficoTendencias.tsx     # Trend charts
│   │   │   ├── MapaCalorIncidencias.tsx  # Incidence heat map
│   │   │   └── VistasRapidas.tsx         # Quick-view panels
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
│   │   └── validation.ts               # Data validation utilities
│   │
│   ├── sql/                             # SQL scripts & migrations
│   │   ├── migrations/                  # Sequential numbered migrations (001–031)
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
│   ├── supabase_tablas.md               # Complete DB schema (32+ tables, enums)
│   ├── CHECKLIST_SETUP.md
│   ├── INSTRUCCIONES_SETUP_COMPLETO.md
│   └── ... (20 planning/implementation docs)
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
| `/monitoreo`                       | MonitoreoDashboardV2         | Monitoring     |
| `/monitoreo/registros`             | RegistrosMonitoreo           | Monitoring     |
| `/monitoreo/carga-masiva`          | CargaMasiva                  | Monitoring     |
| `/monitoreo/catalogo`              | CatalogoPlagas               | Monitoring     |
| `/labores`                         | Labores (Kanban)             | Labor          |
| `/empleados`                       | Personal                     | Employees      |
| `/empleados/contratistas`          | Contratistas                 | Employees      |
| `/finanzas`                        | FinanzasDashboard            | Finance        |
| `/finanzas/gastos`                 | GastosView                   | Finance        |
| `/finanzas/ingresos`               | IngresosView                 | Finance        |
| `/finanzas/reportes`               | ReportesView                 | Finance        |
| `/finanzas/presupuesto`            | PresupuestoView              | Finance        |
| `/finanzas/configuracion`          | ConfiguracionFinanzas        | Finance        |
| `/reportes`                        | ReportesDashboard            | Reports        |
| `/reportes/generar`                | ReporteSemanalWizard         | Reports        |
| `/produccion`                      | ProduccionDashboard          | Production     |
| `/clima`                           | ClimaDashboard               | Climate        |
| `/clima/historico`                 | ClimaHistorico               | Climate        |
| `/configuracion`                   | ConfiguracionDashboard       | Settings       |
| `/ventas`                          | ComingSoon                   | Not implemented|
| `/lotes`                           | ComingSoon                   | Not implemented|
| `/login`                           | Login                        | Auth (public)  |

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
- **Finance**: `fin_gastos`, `fin_ingresos`, `fin_transacciones_ganado`, `fin_conceptos_gastos`, `fin_proveedores`, `fin_categorias_gastos`, `fin_categorias_ingresos`, `fin_medios_pago`, `fin_regiones`, `fin_negocios`, `fin_compradores`, `fin_presupuestos` (budget allocations by concepto, year, negocio)
- **Production**: `produccion`, `reportes_semanales`
- **Climate**: `clima_lecturas` (weather station readings: temp, humidity, wind, rain, radiation, UV — synced from Ecowitt every 5 min via pg_cron)
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

Sequential SQL migrations live in `src/sql/migrations/` (001–031). See `src/sql/migrations/README_MIGRATION.md` for instructions on running them.

- **023**: `create_fin_transacciones_ganado` — cattle buy/sell transactions table with RLS
- **024**: `alter_fin_ingresos_add_columns` — adds `cantidad`, `precio_unitario`, `cosecha`, `alianza`, `cliente`, `finca` to `fin_ingresos`
- **029**: `create_clima_lecturas` — weather station readings table with UNIQUE(station_id, timestamp), B-tree + BRIN indexes, RLS
- **030**: `clima_cron_sync` — pg_cron + pg_net schedule to call `/clima/sync` every 5 minutes
- **031**: `add_colmenas_con_reina` — adds `colmenas_con_reina integer NOT NULL DEFAULT 0` to `mon_colmenas`

### Ganado ↔ Finance Integration

Cattle buy/sell transactions live in `fin_transacciones_ganado` (not in `fin_gastos`/`fin_ingresos`). The Gastos and Ingresos historial views merge ganado records alongside regular records using a `UnifiedFinanceItem` discriminated union. Ganado items display with an amber `[Ganado]` badge and route to `TransaccionGanadoForm` for editing (not `GastoForm`/`IngresoForm`).

Key files:
- `src/components/finanzas/components/TransaccionGanadoForm.tsx` — create/edit dialog for ganado transactions, with dropdown selectors for finca (from existing transactions), proveedor (`fin_proveedores`), and cliente (`fin_compradores`)
- `src/types/finanzas.ts` — `UnifiedFinanceItem` type
- `src/components/finanzas/components/GastosList.tsx` — merges `fin_transacciones_ganado` compras
- `src/components/finanzas/components/IngresosList.tsx` — merges `fin_transacciones_ganado` ventas

> **Note**: There are two files with the `019_` prefix (`019_auto_reporte_semanal.sql` and `019_storage_policies_reportes.sql`) due to a naming conflict. Check which have been applied before creating new migrations.

### Supabase Edge Functions

The edge function server uses **Hono** (via Deno/npm imports) and lives in `src/supabase/functions/server/`. Endpoints include:
- Health check
- CSV product import
- User CRUD
- Product toggle
- Weekly report generation (calls DeepSeek `deepseek-v3.2` via OpenRouter, fetches 4-week historical context from DB + Notion)
- **Esco chat agent** (`chat.tsx`) — conversational data assistant for farm management. Uses Gemini 3 Flash Preview (`google/gemini-3-flash-preview`) via OpenRouter with tool-calling loop (`tool_choice: 'required'` on round 0). Exports `llmToolLoop` and `getSystemPrompt` (used by telegram bot). 17 tools cover: labor summaries, employee activity, monitoring (with floración), applications, inventory, finances, budget/presupuesto (annual budget vs actual execution by concepto, multi-quarter support), production, harvests, lot info, purchases, inventory movements, application details, weekly overviews, climate data, soil conductivity (CE), and beehive/apiario health.
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

**Required edge function secrets** (set via Supabase Dashboard → Project Settings → Edge Functions):
- `OPENROUTER_API_KEY` — OpenRouter API key (used for DeepSeek and Gemini 2.5 Flash via OpenRouter)
- `NOTION_TOKEN` — Notion integration token (for owner call summaries; optional, graceful fallback if absent)
- `ECOWITT_APP_KEY` — Ecowitt application key for climate data sync
- `ECOWITT_API_KEY` — Ecowitt API key
- `ECOWITT_MAC` — Ecowitt weather station MAC address (84:1F:E8:35:D8:73)
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

Current test files:
- `aplicacionesReales.test.ts` — Real applications data handling
- `generarReporteSemanal.test.ts` — Report generation logic
- `laborImprovements.test.ts` — Labor module improvements
- `laborRegistration.test.ts` — Labor registration & DB trigger shapes
- `reporteSemanal.test.ts` — Weekly report logic

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

### Dialog Size System (`src/components/ui/dialog.tsx`)
All dialogs use a fixed-size tier via the `size` prop on `DialogContent`: `sm` (448×384px), `md` (576×512px), `lg` (768×640px), `xl` (1024×704px). These are max dimensions in rem — they never fill the screen. The base `DialogContent` enforces `overflow-hidden`, so scrollable content MUST go inside `<DialogBody>`. Never put `overflow-y-auto` on `DialogContent` directly. `StandardDialog` was removed — use `Dialog` + `DialogContent` + `DialogHeader` + `DialogBody` + `DialogFooter` directly.

---

## Known Issues

See `BUG_REPORT.md` for current tracked bugs. As of the last update, the Reporte Semanal (Weekly Report) module has several critical issues including PDF generation failures and RLS policy errors.

---

## Key Documentation

| Document                                    | Location                     | Purpose                          |
|---------------------------------------------|------------------------------|----------------------------------|
| Database schema (32+ tables)                | `docs/supabase_tablas.md`    | Complete DB reference            |
| Setup checklist                             | `docs/CHECKLIST_SETUP.md`    | Environment setup guide          |
| Full setup instructions                     | `docs/INSTRUCCIONES_SETUP_COMPLETO.md` | Detailed setup walkthrough |
| Final setup instructions                    | `docs/SETUP_FINAL_INSTRUCCIONES.md` | Latest setup walkthrough   |
| CSV upload guide                            | `docs/README_CARGA_CSV.md`   | Monitoring CSV bulk import       |
| CSV index                                   | `docs/INDEX_CARGA_CSV.md`    | CSV upload entry point           |
| CSV flow diagram                            | `docs/DIAGRAMA_FLUJO_CSV.md` | CSV processing architecture      |
| Lots/sublots config guide                   | `docs/GUIA_CONFIGURACION_LOTES_SUBLOTES.md` | Lot management      |
| Contractor tracking implementation          | `docs/CONTRACTOR_TRACKING_IMPLEMENTATION.md` | Contractor feature  |
| Labor module improvements plan              | `docs/PLAN_MEJORAS_MODULO_LABORES.md` | Labor roadmap           |
| Labor refactor plan                         | `docs/PLAN_REFACTORIZACION_LABORES.md` | Labor refactoring guide  |
| Labor phase 1 changelog                     | `docs/CHANGELOG_LABORES_FASE1.md` | Labor changes history       |
| Monitoring refinement plan                  | `docs/PLAN_REFINAMIENTO_MONITOREO.md` | Monitoring roadmap        |
| Production module plan                      | `docs/plan_produccion_module.md` | Production module design     |
| Migration instructions (units)              | `docs/INSTRUCCIONES_MIGRACION_UNIDADES.md` | Unit migration guide |
| Implemented changes log                     | `docs/CAMBIOS_IMPLEMENTADOS.md` | History of major changes    |
| NewPurchase technical issue                 | `docs/PROBLEMA_TECNICO_NEWPURCHASE.md` | Known technical issue    |
| Application ↔ Labor sync architecture       | `src/sql/migrations/README_APLICACIONES_LABORES_SYNC.md` | Trigger sync docs |
| Design guidelines                           | `src/guidelines/Guidelines.md` | UI/UX design reference        |
| SQL scripts index                           | `src/sql/README.md`          | SQL scripts overview             |
| Attributions                                | `docs/Attributions.md`       | Third-party attributions         |
| Bug report                                  | `BUG_REPORT.md`              | Known issues tracker             |

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
