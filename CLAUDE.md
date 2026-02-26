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
| Styling       | Tailwind CSS 4.1 (utility classes, CSS variables for theming)   |
| Components    | Radix UI (25+ headless primitives) + custom `src/components/ui` |
| Icons         | Lucide React                                                     |
| Charts        | Recharts                                                         |
| Backend       | Supabase (PostgreSQL + Auth + Storage + Edge Functions)          |
| PDF           | jsPDF + jspdf-autotable + html2pdf.js                           |
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
│   │   ├── monitoreo/                    # Pest/disease monitoring module
│   │   ├── labores/                      # Task/labor management (Kanban)
│   │   ├── empleados/                    # Personnel & contractors
│   │   ├── finanzas/                     # Finance (expenses, income, reports)
│   │   ├── produccion/                   # Production tracking & charts
│   │   ├── reportes/                     # Weekly report wizard & history
│   │   ├── configuracion/                # System configuration (lots, users)
│   │   ├── auth/                         # ProtectedRoute, RoleGuard
│   │   ├── dashboard/                    # Dashboard sub-components (AlertList)
│   │   ├── shared/                       # Reusable components (dialogs, uploaders)
│   │   ├── ui/                           # Radix UI wrappers (button, dialog, etc.)
│   │   └── figma/                        # Image fallback component
│   │
│   ├── contexts/
│   │   ├── AuthContext.tsx               # Auth state (user, profile, session, roles)
│   │   └── SafeModeContext.tsx           # Safe-mode toggle (localStorage-persisted)
│   │
│   ├── hooks/
│   │   ├── useFormPersistence.ts         # Form state persistence hook
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
│   │   ├── migrations/                  # Sequential numbered migrations (001–020+)
│   │   └── *.sql                        # Standalone SQL scripts
│   │
│   ├── styles/
│   │   └── globals.css                  # Theme variables, font-face, Tailwind theme
│   │
│   ├── supabase/
│   │   └── functions/server/            # Edge function source (Hono framework)
│   │
│   ├── guidelines/                      # Design guidelines (placeholder)
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
│                           └── LayoutRoutes (nested routes)
```

### State Management

- **AuthContext** — Global authentication state (user, profile, session, role-based access). Uses Supabase auth listeners for session management.
- **SafeModeContext** — UI toggle for confirming critical operations. Persisted in localStorage.
- **No Redux/Zustand** — The app uses React Context + local component state. Data is fetched directly from Supabase in components and hooks.

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
| `/finanzas/configuracion`          | ConfiguracionFinanzas        | Finance        |
| `/reportes`                        | ReportesDashboard            | Reports        |
| `/reportes/generar`                | ReporteSemanalWizard         | Reports        |
| `/produccion`                      | ProduccionDashboard          | Production     |
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
- **Applications**: `aplicaciones`, `aplicaciones_calculos`, `mezclas`, `mezclas_productos`, `movimientos_diarios`
- **Inventory**: `movimientos_inventario`, `compras`, `compras_productos`, `verificaciones_inventario`
- **Monitoring**: `monitoreos`, `plagas_enfermedades_catalogo`, `monitoreos_plagas`
- **Labor**: `tareas`, `registros_trabajo`, `empleados_tareas`
- **Finance**: `fin_gastos`, `fin_ingresos`, `fin_conceptos_gastos`, `fin_proveedores`
- **Production**: `produccion`, `reportes_semanales`
- **Audit**: `audit_log`

### Migrations

Sequential SQL migrations live in `src/sql/migrations/` (001–020+). See `src/sql/migrations/README_MIGRATION.md` for instructions on running them.

### Supabase Edge Functions

The edge function server uses **Hono** (via Deno/npm imports) and lives in `src/supabase/functions/server/`. Endpoints include:
- Health check
- CSV product import
- User CRUD
- Product toggle
- Weekly report generation

---

## Styling & Theming

- **Tailwind CSS 4.1** — utility-first, configured via `src/styles/globals.css`
- **CSS Variables** — theming via `:root` custom properties (green/agricultural palette)
- **Primary color**: `#73991C` (olive green)
- **Font**: Visby CF (loaded from CDN in globals.css)
- **UI components**: Radix UI primitives wrapped in `src/components/ui/` with Tailwind + `cn()` utility (`clsx` + `tailwind-merge`)
- **`index.css`** is the compiled Tailwind output — do not edit it manually
- **`src/styles/globals.css`** is where theme customizations and `@font-face` declarations live

---

## Testing

Tests use **Vitest** and live in `src/__tests__/`. They mock the Supabase client.

```bash
npm test             # Single run
npm run test:watch   # Watch mode
```

Current test files:
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
- New migrations must use the next sequential number (e.g., `021_description.sql`)
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
| CSV upload guide                            | `docs/README_CARGA_CSV.md`   | Monitoring CSV bulk import       |
| CSV flow diagram                            | `docs/DIAGRAMA_FLUJO_CSV.md` | CSV processing architecture      |
| Lots/sublots config guide                   | `docs/GUIA_CONFIGURACION_LOTES_SUBLOTES.md` | Lot management      |
| Contractor tracking implementation          | `docs/CONTRACTOR_TRACKING_IMPLEMENTATION.md` | Contractor feature  |
| Labor module improvements plan              | `docs/PLAN_MEJORAS_MODULO_LABORES.md` | Labor roadmap           |
| Migration instructions (units)              | `docs/INSTRUCCIONES_MIGRACION_UNIDADES.md` | Unit migration guide |
| Application ↔ Labor sync architecture       | `src/sql/migrations/README_APLICACIONES_LABORES_SYNC.md` | Trigger sync docs |
| Bug report                                  | `BUG_REPORT.md`              | Known issues tracker             |

---

## Deployment

The app is deployed on **Vercel** with:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "build",
  "installCommand": "npm install",
  "framework": "vite"
}
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables in the Vercel dashboard.

---

## Priority: Code Quality

When working on this project, prioritize:
1. **Type safety** — leverage strict TypeScript, avoid `any`
2. **Correctness** — ensure data integrity, test edge cases
3. **Readability** — clear naming, consistent patterns
4. **Maintainability** — modular code, reuse existing patterns and components from `src/components/ui/` and `src/components/shared/`
5. **Security** — respect RLS policies, validate inputs at boundaries
