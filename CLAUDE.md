# CLAUDE.md — Escocia OS

## Project Overview

Escocia OS is a comprehensive agricultural management system for avocado (aguacate Hass) cultivation with GlobalGAP certification compliance. It is a single-page application built with React + TypeScript, backed by Supabase (PostgreSQL), and deployed on Vercel.

The system manages: inventory, phytosanitary applications (fumigation/fertilization/drench), pest monitoring, labor/tasks, employees/contractors, finances, production tracking, and weekly reporting — all with full **operational** traceability (who performed the work, when, on which lote, with which product).

**There is no change-history audit log.** The `logs_auditoria` table exists but has never received a row and nothing writes to it — see the Audit entry under Key Domains. Attribution of *who captured a record* comes from per-table `created_by`-style columns, and it is not uniform: migrations 040/050/063/074 cover `tareas`, `fin_gastos`, `fin_ingresos`, `fin_transacciones_ganado`, `monitoreos` and `registros_trabajo`, but `aplicaciones` and `movimientos_diarios*` still have no capturer column, and rows created by the Telegram bot (service role, `auth.uid()` is NULL) are unattributed everywhere.

**Original design**: Figma prototype at https://www.figma.com/design/lXwuvZRqDgLunTJyrVebjU/Escocia-OS

---

## Tech Stack

See `package.json` for the full dependency list. The three facts it does **not** tell you:

- **Tailwind CSS 4.3 compiles at build time** via `@tailwindcss/vite`. `src/index.css` is a three-line entry point, not a compiled artifact. See the CSS caution zone below.
- There is no `tailwind.config.js` (CSS-first config); theme lives in `src/styles/globals.css`, which reaches the compiler through `index.css`, not through a JS import.
- TypeScript runs in strict mode with `@/*` aliased to `./src/*`.

## Quick Reference Commands

Standard npm scripts — see `package.json`. `npm run dev` serves on port 3000; `npm run build` outputs to `/build` (not `dist`).

## Environment Variables

Create a `.env.local` file at the project root with:

```
VITE_SUPABASE_URL=<your-supabase-project-url>
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

These are consumed in `src/utils/supabase/client.ts` via `import.meta.env`. The app will throw on startup if they are missing.

---

## Project Structure

Run `ls`/`find` over `src/` — the layout is conventional and self-describing. Non-obvious placement rules that the tree does not show:

- Pure business logic lives in `src/utils/calculos*.ts` and `fetch*.ts`; components must not re-derive it inline.
- Types are per-module in `src/types/`; SQL migrations in `src/sql/migrations/`.
- Edge-function source is duplicated in `src/supabase/functions/server/` and `supabase/functions/make-server-1ccce916/` — both must stay in sync.
- Import-pipeline logic lives in `src/utils/importHato/` (typechecked), never in `scripts/` (not typechecked, not linted).

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

Routes are defined in [`src/App.tsx`](src/App.tsx) (`LayoutRoutes`). All routes except `/login` are protected. Read that file rather than relying on a transcribed table.

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

Sidebar structure (`Layout.tsx` `NAV`): Tablero General · **Aguacate** (group: Labores, Monitoreo, Aplicaciones, Inventario, Clima, Producción, Reportes) · **Hato Lechero** (group: Tablero, Producción, Hato, Chequeos, Alertas, Pajillas) · Ganado · **Finanzas** (group: Dashboard, Gastos, Ingresos, Reportes, Presupuesto, Configuración) · Configuración.

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
- **Dairy herd (Hato Lechero)** (migrations 053–060): `hato_toros` (bull catalog), `hato_animales` (individual registry, `numero` permanent chapeta), `hato_chequeos` + `hato_chequeo_vacas` (bimonthly vet check: raw + normalized layers), `hato_eventos` (append-only reproductive/lifecycle log), `hato_pesajes_leche` (weekly per-cow), `hato_produccion_quincenal` (fortnightly camión volume), `hato_protocolos` + `hato_tratamientos` + `hato_tratamiento_pasos`, `hato_alertas` + `hato_alertas_config` (Telegram closed-loop queue), `hato_pajillas` + `hato_pajillas_uso` (insemination straws), `hato_config` (editable formula params), `hato_alertas_envios` (one row per recipient of a broadcast alert, with its `message_id`). Views: `v_hato_estado_actual`, `v_hato_pajillas_stock`
- **Alert subscriptions (cross-module)** (migration 096): `alertas_catalogo` (one row per alert type of ANY module; `clave` = `modulo.tipo`) + `telegram_alertas_suscripciones` (`recibe` / `escalamiento` per Telegram user per alert). **Adding an alert for aguacate or ganado is an `INSERT`, not a code change** — the Telegram config screen renders its checkboxes from the catalog. Alert *instances* stay per-module.
- **Production**: `produccion`, `reportes_semanales`
- **Climate**: `clima_lecturas` (rolling 24h window of 5-min Ecowitt readings — pruned daily by cron; `lluvia_diaria_actualizada_en` since migration 068 carries Ecowitt's own freshness timestamp for the cumulative daily rain counter), `clima_resumen_diario` (pre-aggregated daily summaries: min/max/avg temp, humidity, wind, rainfall, radiation, UV — one row per day, scales indefinitely; `lluvia_confianza` since migration 068 — see that entry for the frozen-counter bug it fixes)
- **Audit**: `logs_auditoria` — **declared but never wired**. Zero rows, zero historical inserts, no trigger or function writes to it, and no app code reads it (the only repo reference is the generated type in `src/types/database.ts`). Its INSERT policy is `WITH CHECK (true)`, so it must be hardened before any use. There is no `audit_log` table; that name was a documentation error corrected 2026-07-31.

### Applications Data Architecture

The applications module has two distinct tracking layers — **do not confuse these**:

| Layer | Tables | Purpose |
|---|---|---|
| **Planned** | `aplicaciones_lotes_planificado`, `aplicaciones_productos`, `aplicaciones_mezclas` | What was planned before execution (lot targets, product dosis, mixes) |
| **Real** | `movimientos_diarios`, `movimientos_diarios_productos` | What actually happened per day (canecas, bultos, products used) |

`aplicaciones_lotes_planificado` is the canonical source for planned tree counts and lot assignments. `movimientos_diarios` is the canonical source for real execution data. Never substitute one for the other.

> **Removed tables** (migration 022): `aplicaciones_lotes_real`, `aplicaciones_productos_real`, `aplicaciones_productos_planificado`, `aplicaciones_mezclas_productos` — these were ghost tables from an abandoned design; they were never populated or queried.

### Migrations

Sequential SQL migrations live in `src/sql/migrations/` (001–082). See `src/sql/migrations/README_MIGRATION.md` for instructions on running them.

> **Forensic backups go in the `respaldos` schema, never in `public`** (migration 081). A `CREATE TABLE public.backup_* AS SELECT …` inherits Supabase's default `GRANT ALL … TO anon` and lands the backup on the public API with no RLS — that is how the 2026-08-03 critical linter alert happened.

- **023**: `create_fin_transacciones_ganado` — cattle buy/sell transactions table with RLS
- **024**: `alter_fin_ingresos_add_columns` — adds `cantidad`, `precio_unitario`, `cosecha`, `alianza`, `cliente`, `finca` to `fin_ingresos`
- **029**: `create_clima_lecturas` — weather station readings table with UNIQUE(station_id, timestamp), B-tree + BRIN indexes, RLS
- **030**: `clima_cron_sync` — pg_cron + pg_net schedule to call `/clima/sync` every 5 minutes
- **031**: `add_colmenas_con_reina` — adds `colmenas_con_reina integer NOT NULL DEFAULT 0` to `mon_colmenas`
- **035**: `create_clima_resumen_diario` — daily aggregated weather table (PK: fecha + station_id), backfills from existing readings, prunes clima_lecturas to 24h
- **036**: `clima_daily_rollup_cron` — pg_cron at 00:15 Bogotá: aggregates yesterday's readings into clima_resumen_diario, deletes clima_lecturas older than 24h
- **037**: `allow_admin_insert_proveedores` — Administrador SELECT + INSERT policies on `fin_proveedores`
- **038**: `fix_trigger_compra_gasto_security_definer` — SECURITY DEFINER on `crear_gasto_pendiente_de_compra()` so the purchase-to-expense trigger bypasses RLS. **Reverted by 079 on 2026-07-02 — that trigger no longer exists.**
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
- **063**: `ingresos_created_by_tracking` — the 050 fix, applied to `fin_ingresos`. The `created_by` column has existed since the original schema but no write path ever populated it, which blocked the Usuario filter in the Ingresos historial. Adds `set_ingreso_created_by()` + BEFORE INSERT trigger (same `COALESCE(created_by, auth.uid())` pattern as 050/040) and backfills **every** NULL row to Santiago. The unconditional backfill deliberately departs from 050, which left pre-2026 gastos NULL because their author was genuinely unrecoverable; here the author of the whole history is known. `fin_transacciones_ganado` is untouched — 050 already covers it, so ganado ventas need nothing. Applied to production 2026-07-22 (221 rows, all of `fin_ingresos`, spanning 2023-01-03 → 2026-06-30; 0 left unattributed). The backfill targets `sforero94@gmail.com` — Santiago's Gerencia account in `usuarios`, **not** `santiago@thinksid.co`, which is a separate "Santiago Admin" Administrador account; both exist, so the wrong one would have failed silently rather than loudly. Known gap, identical to gastos post-050: the Telegram bot inserts via the service role where `auth.uid()` is NULL, so bot-created rows still land as "Sin usuario".
- **064**: `hato_config_gyr_dia_pesaje` — two owner decisions from the second decision round (2026-07-22): appends `"gyr"` to the `razas` catalog (~101 occurrences in the historical Toro column; `meses_secado_por_raza` deliberately untouched — no gyr-specific value was given, `_default` applies) and seeds an 11th key `dia_pesaje_semanal` (`{"iso": 3, "nombre": "miercoles"}`) so the S5 milk backfill can derive calendar dates from "SEMANA N" sheets. Renumbered from 063 to 064 while integrating with `main` — 063 was already taken by `ingresos_created_by_tracking`, applied to production first. Applied to production 2026-07-22 (verified: `razas` carries gyr, `dia_pesaje_semanal` seeded, `meses_secado_por_raza` untouched).
- **065**: `fn_hato_commit_chequeo` — `SECURITY DEFINER` plpgsql RPC (038/039 precedent) backing the B0 "Aprobar" commit path (see "Chequeo commit path" under Hato Lechero). One call = one transaction: find-or-create `hato_chequeos` header by fecha, idempotent cleanup scoped to that chequeo only (`hato_eventos` by `chequeo_vaca_id`, then its `hato_chequeo_vacas` rows), fresh inserts of vacas (raw verbatim + normalized + issues) and derived eventos. EXECUTE is `REVOKE`d from `PUBLIC`/`anon`/`authenticated` and granted **only to `service_role`** — the function has no internal role check; the edge-function endpoint is the auth gate. Applied to production 2026-07-22 via the claude.ai connector (verified: `prosecdef = true`, EXECUTE held only by `service_role` + owner).
- **066**: `hato_numero_atributo_mutable` — `numero` deja de ser identidad permanente y pasa a **"chapeta actual" (atributo mutable)**. Owner decision 2026-07-23: the duplicate historical chapetas are **bought-in cows that arrived wearing a tag already in use** (not data errors), and Martha will re-tag the whole herd — so `numero` is both non-unique today and about to change wholesale. Identity was always `hato_animales.id`; every FK (chequeos, eventos, pesajes, madre/padre) hangs off `id`, never `numero`. Drops the inline `UNIQUE (numero)` (`hato_animales_numero_key`, from 053) and replaces it with a **partial** unique index `hato_animales_numero_activa_unique ON hato_animales(numero) WHERE estado='activa' AND numero IS NOT NULL` — no two *living* cows share a tag, but a sold/dead animal's tag can be recycled and provisional working numbers (900–999) coexist. Applied to production 2026-07-23 via the authenticated Supabase MCP (verified: constraint dropped, partial index present; table was empty). See the "Identity model & renumeración" note under Hato Lechero.
- **067**: `hato_registrar_salida` — **archivo de registro, no aplicar.** Applied to production 2026-07-24 (`schema_migrations` version `20260724181919`) before its file existed; body recovered 2026-08-03 from `supabase_migrations.schema_migrations.statements`. Created `fn_hato_registrar_salida(uuid,text,date,text)` (SECURITY INVOKER: `hato_eventos` INSERT + `hato_animales.estado/fecha_estado` UPDATE in one transaction) for the redundant `MarcarSalidaDialog`. **The function was then dropped from production out of band** — no migration records the drop — when this branch was reconciled with S9, whose finance-integrated `VentaAnimalDialog`/`MuerteAnimalDialog` own venta/muerte instead (see `src/components/hato/CLAUDE.md`). Verified 2026-08-03: absent from `pg_proc`, and no app code calls it. This is the whole of the 067 numbering gap.
- **068**: `clima_lluvia_confianza` — fixes the recurring duplicate-daily-rainfall bug (e.g. 2026-07-20/21 both showing 15.75mm; ≥22 occurrences since 2026-03). Root cause: Ecowitt's `rainfall_piezo.daily` value is a cumulative counter that is supposed to reset at local midnight; when the sensor fails to reset, the API keeps serving the previous day's frozen total, and the old rollup (migration 036, blind `MAX(lluvia_diaria_mm)`) wrote it in as if fresh. Adds `clima_lecturas.lluvia_diaria_actualizada_en` (Ecowitt's own per-field last-updated time, captured in `clima.tsx`'s `parseEcowittObservation`) and `clima_resumen_diario.lluvia_confianza` (`ok` | `contador_congelado` | `sin_time_piezo`). Replaces the inline cron SQL with `fn_clima_rollup_diario()`, which trusts a day's rain total only if (a) the freshest reading's counter was actually updated within that Bogotá calendar day, and (b) the total isn't a suspicious exact duplicate of the prior day's — either check failing marks the day `contador_congelado` with `lluvia_total_mm = NULL` ("sin dato", never a fabricated duplicate — same rule as monitoreo/hato). Reschedules the existing `clima-daily-rollup` cron job (same name, `cron.schedule` upserts in place) to call the new function, and retroactively flags historical rows matching the confirmed duplicate signature (metadata only — `lluvia_total_mm` is left intact for audit; the frontend nulls it out for display via `lluvia_confianza`). The same freshness gate was independently applied client-side in `calculosClima.ts` (live 24h view), Esco's `execClimateData` tool in `chat.tsx` (a 4th vulnerable site found during this fix, querying `clima_lecturas` directly), and the weekly-report live-backfill added by PR #63 (`fetchDatosReporteSemanal.ts`'s `fetchClimaLecturasFaltantes`) — all four previously did an unguarded `MAX()`/`Math.max()` over the raw cumulative counter. Applied to production (verified 2026-07-27: both columns exist and the historical backfill flagged e.g. 2026-07-21 `contador_congelado`).
  - **Follow-up 2026-07-27 — every read of `clima_resumen_diario.lluvia_total_mm` must go through `lluviaConfiableDeResumen()`** (`src/utils/calculosClima.ts`). The 068 backfill flags historical rows but deliberately leaves `lluvia_total_mm` intact for audit, so any consumer that reads the column directly resurrects the duplicate. That is exactly what the weekly report did — S30/2026 reported 38.4mm (double-counting 15.75mm on 07-21) against a 4-week baseline of 18.9mm that was itself inflated by 4 more frozen days, while the live Clima view showed the same week correctly. Fixed in `fetchDatosReporteSemanal.ts` (week + 4-week history) and in the three `calculosClima.ts` aggregations that summed the raw column (`buildResumenFromDaily`, `resumenDiarioToMensual`, `resumenDiarioToAnual`). The 4-week rain baseline is now `promedio por día con dato × 7` instead of `total ÷ 4 semanas`, so discarded days no longer deflate it. `DiaClima.lluviaMm` is `number | null` — the report renders `s/d` and a footnote for those days, never a zero bar.
- **069**: `fn_hato_commit_chequeo_meses_prenez` — populates `hato_chequeo_vacas.meses_prenez` from the commit path (closes follow-up #2 of the hato module). Applied to production (926 of 1.479 rows carry a value; the rest have no service date to derive from).
- **070**: `hato_produccion_venta_link` — links Producción (hato) to Finanzas for the fortnightly milk sale and for hato animal sales. Adds `fin_ingresos.cabezas` (nullable, `CHECK > 0`) — head count for a hato animal sale, **never** overloaded onto `cantidad`, which already means litros for leche and kg for aguacate. Adds to `hato_produccion_quincenal`: `fin_ingreso_id` (FK, **NOT NULL**, `ON DELETE RESTRICT`), `origen_dato` (`medido` | `derivado_mensual`), `num_vacas_ordeno_origen` (`medido` | `derivado_chequeos`), `updated_at/by`; and `hato_eventos.fin_ingreso_id` (`ON DELETE SET NULL`). Three RPCs, all **`SECURITY INVOKER`** (`fn_hato_guardar_quincena_venta`, `fn_hato_eliminar_quincena_venta`, `fn_hato_registrar_venta_animales`) — the caller is an authenticated Gerencia browser session that already holds write RLS on both tables; the only missing property is atomicity, and a `DEFINER` would bypass RLS and force a duplicate `es_usuario_gerencia()` check. **There is deliberately NO sync trigger on `fin_ingresos`** — "one record" is structural, not synchronized: `fin_ingreso_id` is NOT NULL and `litros_total` is **NULL for `medido` rows** (a CHECK enforces it), so the litros exist in exactly one place (`fin_ingresos.cantidad`, read through the FK) and have no window in which to diverge. `litros_total` is NOT NULL only for `derivado_mensual` (backfill) rows, whose split has nowhere else to live. Applied to production 2026-07-28.
- **071**: `fin_categoria_venta_descarte` — creates the `Venta de Vacas de Descarte` categoría under Hato Lechero and recategorizes the 6 historic 2025 rows previously filed as "Otro", **by literal id**, triple-guarded (negocio + both categorías must exist; exactly 6 rows must currently be under "Otro" before the UPDATE; exactly 6 after). No `valor`/`fecha`/`cantidad` is touched, so P&G and Flujo de Caja **totals are byte-identical** — verified before/after across all 4 years; only the detail-line label changes in both reports. The name deliberately excludes the substring "leche" so the Hato's $/litro denominator (`calculosPyG.ts`, filters `/leche/i`) cannot capture it. Applied to production 2026-07-28.
- **072**: `storage_chequeos_fotos` — private Storage bucket `chequeos-fotos` + RLS policies, for the Fase 3b photo-upload route (`POST /hato/chequeo/foto`). The photo **is** that route's raw layer (the equivalent of `hato_chequeo_vacas.*_raw` on the `.xlsx` route), so it is stored before the OCR even runs and kept as the evidence any later doubt is audited against. Read/insert/update: Administrador + Gerencia (the module's write set, 044 pattern); **DELETE is Gerencia-only** — deleting the photo destroys the chequeo's traceability, so it is not an operational action. The endpoint itself uploads with the service role (RLS-bypass); the SELECT policy is what makes `createSignedUrl` work from the app. Applied to production 2026-07-30 (verified: bucket present and `public = false`, 4 policies active). **Applying it is a hard prerequisite of the photo route**: without the bucket the endpoint still answers, but `ocr.almacenamiento.ok` comes back `false` and the raw layer is silently lost.
- **073**: `cerrar_escalacion_privilegios` — closes two verified privilege-escalation paths found by the 2026-07-31 maintenance sweep. (a) `usuarios`: the `Usuario actualiza su login` policy constrained *which row* (`id = auth.uid()`) but never *which columns*, and `UPDATE` was granted table-wide, so any authenticated user could `PATCH` their own row with `{"rol":"Gerencia","activo":true}` and defeat every gate built on `es_usuario_gerencia()`/`get_user_role()` — the sole predicate on all 13 `fin_*` tables. Fixed by `REVOKE UPDATE ... FROM authenticated, anon` plus dropping the policy; verified beforehand that all 8 browser call sites on `usuarios` are `select` and that nothing anywhere writes `last_login`, so the policy guarded a write that does not exist. `service_role` (the edge function's real mutation path) is unaffected. **If an "edit my own profile" feature is ever added, use a column-scoped `GRANT UPDATE (nombre_completo)`, never a table-level grant.** (b) Drops three dead `SECURITY DEFINER` inventory functions that had `EXECUTE` granted to `PUBLIC`: `actualizar_cantidad_producto(uuid, numeric)` was a bare `UPDATE productos SET cantidad_actual = cantidad_actual + ...` with no auth check and **no `movimientos_inventario` row**, i.e. untraceable stock mutation by any low-privilege authenticated user; `registrar_salida_inventario` and `registrar_compra` were already inert (integer-vs-uuid signature mismatch, and a reference to the nonexistent `detalles_compra`). Also pins `search_path` on `es_usuario_gerencia()` and `get_user_role()`. Applied to production 2026-07-31 (verified: 0 UPDATE grants remain, 0 of the 3 functions remain, both search_paths set, 7 usuarios intact).
- **074**: `atribucion_monitoreos_registros_trabajo` — BEFORE INSERT triggers populating `monitoreos.user_id` and `registros_trabajo.registrado_por` via the same `COALESCE(NEW.col, auth.uid())` pattern as 040/050/063. Both columns had existed since the original schema and were populated in **0 of 4.233** and **0 of 2.500** rows respectively: 040/050/063 covered finanzas and labores but never the aguacate tables. New rows only — the historical author is genuinely unrecoverable (same call 050 made for pre-2026 gastos). `monitoreos.monitor` (text, 4.233/4.233) remains the operational attribution of *who walked the round*; `user_id` answers the different question of *who captured it*. Known gap, identical to 050/063: Telegram-bot rows insert via the service role where `auth.uid()` is NULL. Applied to production 2026-07-31.
- **075**: `limpieza_monitoreo_beneficos_y_duplicados` — (a) merges the duplicate `'Beneficos '` catalog row (trailing space, 314 observations, 2025-01→2026-04) into `'Beneficos'` (149 obs), which had split one concept into two series so the heat map rendered two rows and the trend broke at the 2026-04/05 boundary where capture switched ids. Adds `UNIQUE (btrim(nombre))` so it cannot recur. Migration `032_unify_beneficos.sql` targeted the *accented* variant, which does not exist in production, and was never applied — left untouched per the never-edit-a-migration rule. (b) Deletes duplicate `monitoreos` rows from CSV re-imports under the owner-approved rule "most recent import wins". **Scope was 64 rows, not the 136 originally estimated**: `created_at < MAX(created_at)` only discriminates when copies carry different instants, and 72 of the 132 groups arrived in the same import transaction with identical `created_at`. That is correct behaviour — the approved rule does not apply there and guessing would be worse. Backup tables `backup_075_*` are left in the database on purpose. Applied to production 2026-07-31.
- **076**: `limpieza_monitoreo_duplicados_exactos` — finishes 075 for the 14 same-instant groups whose copies are **identical in the data** (same incidencia, arboles_afectados, arboles_monitoreados), where an arbitrary `id` tiebreak picks no value because both rows say the same thing. **Deliberately leaves 58 groups untouched**: same `created_at`, divergent values (e.g. 2,86% vs 34,29% incidencia for the same sublote/plaga/fecha/monitor). No defensible automatic rule exists for those — there is no "more recent", and choosing by `id` would invent a number. They need the paper planillas from the 17 affected rondas (2025-01-21 → 2026-04-24). Applied to production 2026-07-31 (verified end state: `monitoreos` 4.233 → 4.155, 78 rows deleted across 075+076, 58 groups remaining, 0 orphaned observations).
  - **Resolution 2026-08-03 (issue #96 item 1) — those 58 groups are NOT duplicates. Owner decision: leave them intact, permanently.** Re-examined against production before touching anything: in all 116 rows `severidad = individuos_encontrados / arboles_afectados` holds exactly, the two rows of each pair share the same denominator (`arboles_monitoreados`), and none is a zero reading. They are two internally-coherent, independent observations — not a corrupted copy of one reading, which is what 076 assumed. Deleting either one destroys a real observation. Nothing else in the module needs to change: the weighted `calcularIncidencia(Σafectados, Σmonitoreados)` already pools both rows into one correct number, and the "blank, never 0%" display contract is unaffected. **Do not re-open this as a duplicate-cleanup task.**
- **077**: `rls_initplan_select_wrap` — closes all 62 `auth_rls_initplan` advisor warnings (issue #96 item 5). `auth.uid()` written bare in a policy predicate is re-evaluated **once per row**; wrapped as `(SELECT auth.uid())` Postgres hoists it into an InitPlan and evaluates it once per query. 62 policies rewritten via `ALTER POLICY` (atomic, preserves `TO <rol>`/`AS PERMISSIVE`, and idempotent — unlike DROP+CREATE, which opens a window with no policy), 89 call sites wrapped; every predicate reproduced verbatim except the wrapping, so no row that was visible becomes invisible or vice versa. `es_usuario_gerencia()` and `get_user_role()` were left unwrapped here, on the stated grounds that a VOLATILE function is never hoisted into an InitPlan. **That reasoning was wrong — corrected by 093, which does the wrapping and carries the measurement.** The 485 `multiple_permissive_policies` warnings are **out of scope on purpose** — consolidating permissive policies changes the access model and needs a security review. Applied to production 2026-08-03 (verified: `auth_rls_initplan` 62 → 0).
- **078**: `kv_store_indices_duplicados` — `kv_store_1ccce916` had accumulated 19 indexes on `key` (issue #96 item 6): the PK plus **18 identical** `btree (key text_pattern_ops)`. Grep of both edge-function trees and the whole repo found **no versioned `CREATE INDEX`** — `kv_store.tsx` is Figma Make boilerplate marked AUTOGENERATED and contains no DDL at all, so there is no code-side root cause to fix; the duplicates come from the platform bootstrap, outside version control. The migration groups indexes by normalized `indexdef` and keeps one per distinct definition, skipping anything backed by a constraint (`pg_constraint.conindid`) since `DROP INDEX` fails on those. **It keeps one `text_pattern_ops` index rather than dropping all 18**: that opclass is not redundant with the PK — the PK's default opclass cannot serve `LIKE 'prefijo%'` in a non-C collation, and that is exactly the access `getByPrefix()` makes. Dropping all 18 would have seeded a latent regression. 17 dropped, 2 remain. Applied to production 2026-08-03 (verified: `duplicate_index` → 0).
- **079**: `drop_compra_a_gasto_trigger` — **archivo de registro, no aplicar.** Applied to production **2026-07-02** (`schema_migrations` version `20260702173945`) before its file existed; body recovered 2026-08-03. Two statements: `DROP TRIGGER trigger_compra_a_gasto ON compras` + `DROP FUNCTION crear_gasto_pendiente_de_compra()`. **The compra → gasto automatism no longer exists** — registering a compra creates nothing in `fin_gastos`; the gasto is captured by hand in Finanzas. Verified 2026-08-03: neither object is in `pg_proc`/`pg_trigger`, and `fin_gastos.compra_id` is populated in **0 of 4.426 rows** (nothing in app code writes it either). The number 079 is just the next free slot — chronologically this migration sits between 045 and 047.

- **080**: `hato_partos_biologicamente_imposibles` — deletes 33 `hato_eventos` rows of `tipo='parto'` that are biologically impossible (issue #96 item 2). Owner decision 2026-08-03, quoted in the migration: *"elimina los partos biologicamente imposibles - deja las vacas vacias y si es el caso registro las preñezes luego"* — so the event is **deleted**, never merged or re-dated, and no replacement pregnancy is invented; Martha re-registers by hand. Distinct from the three 2026-07 cleanup rounds, which collapsed multiple *readings* of the same birth (`DIAS_MINIMOS_ENTRE_PARTOS = 60`); this one removes second *births* that cannot be real, using the ~270-day real minimum interval. Rule: per animal, walk forward by `(fecha, id)` holding an anchor; a parto landing <270 days after the anchor is impossible and is deleted — **except** that an `'aproximada'` anchor always yields to an `'exacta'` candidate (exactly 1 case, RICARENA #88). 333 → 300 partos over 31 animals. The raw layer (`hato_chequeo_vacas.ultima_cria_raw`) is untouched by contract, with the known consequence that re-committing one of those historical chequeos via `fn_hato_commit_chequeo` would regenerate the event. Guarded like 075/076 but harder — `RAISE EXCEPTION` aborts the whole transaction unless the pre-counts (333 total, 33/31 selected, 1 precedence case) and post-counts (300 left, 33 gone, **0 remaining intervals <270 days**, recomputed independently with `LAG()`) all match exactly; the 2026-07-23 ad-hoc-SQL corruption incident is why. Backup table `backup_080_hato_partos_imposibles` left in the database — **moved to the `respaldos` schema by 081**, so the ROLLBACK block at the foot of 080 needs `respaldos.` instead of `public.`. Applied to production 2026-08-03 (verified: 300 partos, 0 intervals <270).
- **081**: `respaldos_fuera_del_esquema_publico` — closes the CRITICAL `rls_disabled_in_public` the Supabase linter emailed on 2026-08-03. `public.backup_080_hato_partos_imposibles` had RLS off *and* full DML (incl. TRUNCATE) granted to `anon` — the key that ships in the browser bundle — so anyone with the project URL could read or destroy it. What was at stake is integrity, not confidentiality: those 33 rows are the only copy of what 080 deleted and the only path its documented ROLLBACK has. **Root cause is not 080 being careless**: Supabase ships `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated`, so *every* `CREATE TABLE public.backup_NNN_* AS SELECT …` — the pattern of 075, 076 and 080 — publishes its backup by default. Fixing only this table would have left the trap armed for the next cleanup. So forensic backups leave `public` for a **`respaldos` schema that PostgREST does not expose**, with three independent layers: unexposed schema, no grants for `anon`/`authenticated`/`PUBLIC` (on schema or table — `SET SCHEMA` *preserves* grants, so the REVOKE is load-bearing, not decoration), and RLS enabled with no policies. `service_role`/`postgres` hold `rolbypassrls`, so the edge function and the SQL editor keep the access they had. **New cleanup migrations must create their backup directly in `respaldos`, never in `public`.** The resulting INFO-level `rls_enabled_no_policy` on that table is the intended end state, not a leftover: for a table no browser role should touch, deny-all *is* the policy. Guarded like 080 (`RAISE EXCEPTION` unless 33 rows / 31 animals / 1 precedence case before, and 33 rows / RLS on / 0 policies / 0 browser grants / 0 `backup_*` left in `public` after). Applied to production 2026-08-04 (verified: `rls_disabled_in_public` count 0, `has_table_privilege('anon', …)` false for SELECT/DELETE/TRUNCATE, backup intact at 33 rows).

- **082**: `endurecer_funciones_y_grants` — closes the WARN/INFO findings left after 081. Security-linter count 51 → 11. Four parts. **(1)** `fn_cleanup_compra_dependencies` was `SECURITY DEFINER` with no caller check and `EXECUTE` for `anon`, and its whole body is `DELETE FROM fin_gastos WHERE compra_id = $1` — an unauthenticated DELETE primitive against a Gerencia-only table, reachable with the browser's `anon` key. **Latent, not live**: `compra_id` is populated in 0 of 4.438 rows since 079 dropped the trigger that filled it, so it matches nothing today, but it arms itself the moment anything repopulates that column. Now checks its own caller against the same rule as the `compras` RLS (Administrador or Gerencia) and `anon` loses EXECUTE. A `SECURITY DEFINER` function must gate its own caller — RLS is by definition not protecting it. **(2)** `EXECUTE` revoked on all 31 trigger functions (`anon`/`authenticated`). **(3)** `search_path` pinned to `public, pg_temp` on the 31 unpinned functions, plus `pg_temp` appended to 8 already pinned as bare `search_path=public` — `pg_temp` must be listed **last**, because when it is not listed Postgres searches the temp schema *first* for relation names, which is the shadowing vector being closed. **(4)** Redundant `anon`/`authenticated` grants revoked on `kv_store_1ccce916` and the three `telegram_*` tables (edge-function-only, verified zero browser call sites) so their deny-all no longer rests on RLS alone. Applied to production 2026-08-04.
  - **Two verified facts that govern this area — do not "fix" the remaining warnings without them.** (a) **An RLS policy requires `EXECUTE` on any function it calls**, from the querying role (proven on production with a throwaway table: revoking gives `permission denied for function`). So `es_usuario_gerencia()` and `get_user_role()` **must keep `EXECUTE` for `anon` and `authenticated`** — 97 policies call them (90 targeting `{public}`, which includes `anon`), and revoking either takes down all 13 `fin_*` tables, `hato_config` and `usuarios`. The linter will keep reporting both as `anon_security_definer_function_executable`; that is a **permanent accept**, not a pending fix — they are the authorization primitives, and for `anon` they resolve `auth.uid()` to NULL and return false/NULL. (b) **A trigger fires even when the writing role lacks `EXECUTE` on the trigger function** — Postgres checks that privilege at `CREATE TRIGGER`, not per fire (proven twice: synthetically, then end-to-end on `productos` as `authenticated` with a real Gerencia JWT). That is what makes part (2) safe.
  - The 35 `function_search_path_mutable` warnings were **all on `SECURITY INVOKER` functions** (every `SECURITY DEFINER` one was already pinned by 065/073), and neither `anon` nor `authenticated` holds `CREATE` on schema `public`, so nothing could be planted to shadow. Fixed as hygiene, not as an exploitable hole.

- **084**: `hato_correcciones` — S3 T4b (`docs/plan_hato_ciclo_manual_override.md` §5). Numbered 084, not 083: 083 was written by a parallel agent the same day (S1, August-2026 inventory reconciliation) and is untouched here. Creates `public.hato_correcciones` (append-only traffic log of humans' UPDATE/DELETE on 5 hato tables — `hato_eventos`, `hato_pesajes_leche`, `hato_produccion_quincenal`, `hato_animales`, `hato_chequeo_vacas`), keeping `datos_anteriores`/`datos_nuevos` as full-row `jsonb` (table-agnostic by design — the trigger uses `to_jsonb(OLD)`/`to_jsonb(NEW)`, never a per-table column list). A single generic `AFTER UPDATE OR DELETE` trigger (`fn_hato_registrar_correccion`, `SECURITY DEFINER`, `search_path=public, pg_temp`, `EXECUTE` revoked from `PUBLIC`/`anon`/`authenticated` — same 082-part-2 precedent that a trigger still fires without it) writes the trace; the app itself never inserts into this table (SELECT-only for `authenticated`, no write policy, `REVOKE INSERT/UPDATE/DELETE/TRUNCATE FROM anon, authenticated` — same 081 lesson about Supabase's `ALTER DEFAULT PRIVILEGES` trap). `IF auth.uid() IS NULL THEN RETURN` at the top means only human browser sessions get traced — `service_role` writes (065's chequeo-commit re-derivation, migrations, the Telegram bot) leave zero rows, same accepted gap as 050/063/074's `created_by` triggers. Also bumps `hato_config.dias_espera_voluntaria_post_parto` from 60 (provisional, migration 062) to 90 (D-23) in the same transaction. Applied to production 2026-08-06 (verified: RLS on, 1 SELECT policy, 0 write grants for anon/authenticated, 5 triggers installed, function is `SECURITY DEFINER` with the pinned search_path, config value = 90).

- **093**: `rls_wrap_helpers_gerencia_rol` — wraps the 97 remaining bare calls to `es_usuario_gerencia()` / `get_user_role()` in `public` RLS policies as `(SELECT …)`, across 34 tables. **Corrects the reasoning in 077**, which left these two alone claiming Postgres never hoists a VOLATILE function into an InitPlan. False: an *uncorrelated* scalar sub-SELECT becomes an InitPlan as a **structural** consequence of being uncorrelated — the planner does not consult volatility for that decision. Measured on production 2026-08-03, warm cache: `count(*) from fin_gastos where es_usuario_gerencia()` **126,3 ms / 9.367 buffers** → wrapped **3,2 ms / 517**; same on `monitoreos` with `get_user_role()` **155,4 ms / 8.821** → **2,8 ms / 471**. Wrapped plans show `InitPlan 1` + `One-Time Filter`, `loops=1`, and stay one evaluation even above a Hash Join; bare plans also poison cardinality estimates (`monitoreos` estimated `rows=21` vs `4176` actual). **`ALTER FUNCTION … STABLE` was considered and deliberately rejected**: once wrapped it buys nothing measurable, and it is a contract change to the app's only authorization predicate. The win scales with rows *scanned*, not table size — a `LIMIT 100` query only went 6,0 → 1,6 ms — so it lands hardest on the report queries, which `fetchAll` deliberately full-scans. Complementary to 082, never overlapping: 082 owns the `EXECUTE` grants and `search_path` of these same two functions (its own guard aborts if `authenticated` loses EXECUTE, "porque eso rompe 97 politicas RLS" — these 97); 093 only changes the shape of the predicate that calls them. Renumbered from 081 while integrating with `main` (081 is now `respaldos_fuera_del_esquema_publico`); 087/088 are undocumented gaps and are deliberately not filled. Known and NOT fixed here: both functions are `proparallel = 'u'`, so no plan containing them can go parallel — irrelevant at ~4k rows and `max_parallel_workers_per_gather = 1`, and changing it is its own migration. **Not applied yet.**

- **094**: `hato_estado_actual_metodo_prenez_aborto` — `v_hato_estado_actual` gains `ultima_confirmacion_prenez_metodo` and `ultimo_aborto_fecha` (appended last: `CREATE OR REPLACE VIEW` cannot reorder). Backs the five-state vocabulary (D-D 2026-08-13): **"servida" = pregnant by presumption, "confirmada" = palpated**, a distinction `hato_eventos.datos->>'metodo'` has stored since S3 but the view never exposed. `ultima_confirmacion` switched from `max()+GROUP BY` to `DISTINCT ON` so the method comes from the *same row* as the max date. Applied to production 2026-08-14 — **the method is NULL in all 179 rows**: no historical confirmation carries one, and the engine reads NULL as PRESUMPTION, never palpation (asserting a vet palpated without evidence is the one reading that cannot be undone). 7 animals carry `ultimo_aborto_fecha`.
- **095**: `hato_catalogo_toros_y_pajillas` — owner decision D-A: delete unreferenced bulls, deactivate referenced ones. 63 → 57 rows, **8 active** (2 monta + 6 inseminación) and 6 pajilla lots / 27 units seeded. Forensic backup in `respaldos` (081 pattern). **Its first run aborted on its own output guard and rolled everything back**, which is the lesson worth keeping: the temp table holds two spellings per bull — `clave` (how it lives in the DB today, `marquez`) and the final `nombre` (`Márquez`) — and after step 4 renames the row, any later step that still looks it up by `clave` no longer finds it. Step 6 deactivated the bull step 4 had just normalized. **Anything that searches a row after a rename must accept both spellings.** Applied 2026-08-14 (verified: 0 orphaned events, Jersey keeps its 44 services).
- **096**: `alertas_catalogo_y_suscripciones` — who receives which alert stops being hard-coded. `alertas_catalogo` (`clave` = `modulo.tipo`, e.g. `hato.secado_due`) is **generic across modules on purpose**: adding an aguacate or ganado alert is an `INSERT`, and the Telegram config UI groups it under its module with no code change. `telegram_alertas_suscripciones` (`recibe`, `escalamiento` per user per alert) replaces the single `hato_alertas_config.destinatario_telegram_id`, which is now **vestigial — the tick no longer reads it**. `hato_alertas_envios` stores one `message_id` per recipient so closing an alert can edit everyone else's message (owner decision: broadcast, **first responder closes it for all**). Only the catalog and subscriptions are generic; alert *instances* stay per-module (`hato_alertas`). **RLS does NOT follow the 044 pattern**: `telegram_alertas_suscripciones` copies `telegram_usuarios`' real policy verbatim (single `ALL`, Gerencia-only including read) because it is edited from that same screen — granting Administrador write would be a permission no one can exercise. `alertas_catalogo` keeps `SELECT` open to `authenticated` (it is a catalog of names); `hato_alertas_envios` has no browser grants at all. Applied 2026-08-14.

> **The Supabase ledger is not authoritative.** `supabase_migrations.schema_migrations` holds 80 rows and the repo holds 82 numbered migrations (counts as of 2026-08-04), and neither is a superset: 067 and 079 above were in the ledger with no file, while 035–039, 041 and 046 are demonstrably applied to production (verified 2026-08-03: `clima_resumen_diario` and `esco_memorias` exist, `produccion.kg_exportacion` exists) yet have **no ledger row** — they were applied through the SQL editor / claude.ai connector, which does not register. Reconcile against the live catalog (`pg_proc`, `pg_trigger`, `information_schema`), never against `list_migrations` alone.

### Hato Lechero Module (`/hato-lechero`)

Full contract lives in [`src/components/hato/CLAUDE.md`](src/components/hato/CLAUDE.md) — read it before touching anything in this module. Two rules that apply from **outside** that directory, so they stay here:

- **`src/utils/calculosHato.ts` and `src/utils/hatoAlertas.ts` are mirrored** into both edge-function trees, and `src/utils/importHato/*` is mirrored by `docs/hato/regenerar-copias-importhato.py`. Change the logic in **all** copies in the same commit, and **never hand-edit a generated copy to silence a parity failure — regenerate it.**
- **`scripts/import-hato/load.ts` is backfill-only, forever.** Re-running it after any live chequeo exists would FK-fail or orphan live history. Chapeta corrections are in-place `UPDATE`s, never a re-Load.

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

### Financial Reports (`/finanzas/reportes`) — P&G + Flujo de Caja

Two reports × four views (Global, Aguacate Hass, Ganado, Hato Lechero). Global includes *every* negocio — Oficina Central, Caballos, Agrícola, Finca de Descanso have no view of their own. Design doc: `docs/plan_reportes_finanzas.md`. Per-view UI and list contracts (Gastos/Ingresos historial, the ganado merge, table CSS): [`src/components/finanzas/CLAUDE.md`](src/components/finanzas/CLAUDE.md).

**Accounting rules the engine enforces** (approved by the owner; changing one is a business decision, not a refactor). These live here, not in the finanzas directory file, because the same rules are enforced by the pure engines in `src/utils/` and re-implemented in the Deno port `src/supabase/functions/server/reportes-financieros.ts` — sessions touching either never open `src/components/finanzas/`:

- **Only `estado='Confirmado'` gastos count.** Pendientes are excluded and surfaced as a warning with their total.
- **Buying cattle is not an expense — it is inventory.** The purchase never appears in the P&G; only the COGS of animals actually sold crosses the line, at a **moving weighted average per head** (`costoVentaGanado.ts`). Per head and not per kilo on purpose: the animal is bought thin and sold fat, so costing sold kilos at purchase price would charge the fattening twice — feed and vet are already in `fin_gastos`. The purchase *is* a cash outflow in the Flujo de Caja: that asymmetry is the single most misread thing in these two reports and carries its own labelled line.
- **The COGS calculation is path-dependent** — the hook fetches the *entire* `fin_transacciones_ganado` history, never just the year. Truncating the series changes the answer (there is a test that proves it).
- **Cosecha assignment (aguacate only)**: `Traviesa N` ← egresos ene–jun of N; `Principal N` ← egresos jul–dic of **N−1** (it is sold nov N−1 → abr N, so that is the semester the fruit was worked). Controlled by the single constant `DESFASE_ANIO_PRINCIPAL` in `periodosReporte.ts`.
- **No prorrateo between negocios.** `fin_gastos.negocio_id` is NOT NULL, so every gasto already has its business. Note the consequence: Oficina Central (~$2.356M historical, zero income) is pure shared overhead that no per-business utility carries — it only shows up in Global.
- **P&G columns are cumulative** (Q1 ⊂ Q1–Q2 ⊂ Q1–Q3 ⊂ Año); the Flujo de Caja is 12 calendar months.

**Contracts that hold outside `src/components/finanzas/`:**

- `valores`/`meses` are **always positive**; the sign lives in `esResta`/`signo`. Never infer sign from the value.
- `sinDato[]` marks cells that render `—` rather than `0` — the difference between "the margin was 0%" and "there were no sales, so there is no percentage".
- **All report queries must go through `fetchAll`** (`src/utils/supabase/fetchAll.ts`). There are ~1.250 gastos per year and PostgREST silently caps at 1.000.
- **Never feed these reports from `movimientos_diarios_productos`, `movimientos_inventario`, `compras` or `registros_trabajo`.** Those are operational costing (cost/kg per lote) and would double-count insumos that are also captured in `fin_gastos` (by hand since 2026-07-02 — see 079 — and by the compra→gasto trigger before that). The only sources are `fin_gastos`, `fin_ingresos` and `fin_transacciones_ganado`.

### Cattle Inventory Module (`/ganado`, issue #51)

Live head-count inventory layered on top of the finance transactions. Hierarchy: `gan_ubicaciones` → `gan_fincas` (hectáreas) → `gan_potreros` → `gan_inventario`. `gan_movimientos` is the source of truth; a DB trigger applies confirmed movements to the `gan_inventario` snapshot (CHECK constraints prevent negative counts).

How `fin_transacciones_ganado` rows surface inside the Gastos/Ingresos lists — and why they cannot be filtered by negocio/región/categoría as query predicates — is in [`src/components/finanzas/CLAUDE.md`](src/components/finanzas/CLAUDE.md).

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
- **Esco chat agent** (`chat.tsx`) — conversational data assistant for farm management. Uses Gemini 3 Flash Preview (`google/gemini-3-flash-preview`) via OpenRouter with tool-calling loop (`tool_choice: 'required'` on round 0). Exports `llmToolLoop(messages, userId?)` and `getSystemPrompt(memorias?)` (used by telegram bot). 33 tools cover: labor summaries, employee activity, monitoring (with floración + per-sublote aggregation), applications, **per-lote/per-árbol cost analysis (`get_application_cost_by_lote`, `get_cost_by_lote`)**, inventory, finances, budget/presupuesto, production, harvests, lot info, purchases, inventory movements, application details, weekly overviews, climate data (Ecowitt + OpenWeatherMap forecast), soil conductivity (CE), beehive/apiario health, **live cattle inventory (`get_ganado_inventory`: head counts by ubicación/finca/potrero, cabezas/ha, 30-day variation, pending confirmations — distinct from `get_financial_summary type=ganado` which covers money)**, **P&G and cash flow (`get_pyg_flujo_caja`) — same accounting rules as `/finanzas/reportes`, see below**, **agronomic web search with citations (Tavily)**, **user-triggered long-term memory (`propose_memory_save`, `commit_memory_save`, `forget_memory`)**, and **Hato Lechero (S7: `get_hato_animal` ficha+genealogía+eventos, `get_hato_reproduccion` herd reproductive picture with the same four-category rule as the UI, `get_hato_produccion` pesajes+quincenal — `hato_config` read live on every call, provisional chapetas 800–999 flagged, missing pesajes are "sin dato" never 0; `get_ganado_inventory` explicitly excludes the hato)**. Pure logic (cost rollup, Tavily/OpenWeather parsing, memory proposals, cattle inventory aggregation, hato aggregation) lives in `cost-aggregation.ts`, `external-tools.ts`, `memory.ts`, `ganado-inventario.ts`, `hato-aggregation.ts` and `reportes-financieros.ts` so each module is unit-testable from Vitest without crossing the Deno boundary. The Telegram bot inherits all tools automatically via `llmToolLoop`.
- **Telegram bot webhook** — registered at `/make-server-1ccce916/telegram/webhook` in `index.ts`. Uses Grammy with conversations plugin. The `handleWebhook` import in `index.ts` is critical — without it the bot returns 404. Both `index.ts` copies must stay in sync.
- **Hato Lechero pesaje pipeline (shared)** — `hato-pesaje-pipeline.ts`. The photo→OCR→roster→diff→per-cell-commit pipeline lives here so the HTTP endpoint (`/hato/pesaje/foto`) and the Telegram `/pesaje` conversation share ONE implementation. There is no second cell reader: `importHato/ocrPesaje.ts` remains the only one. Telegram writes carry `fuente='telegram'` and an explicit `created_by` from `telegram_usuarios.usuario_id` — the bot uses the service role, where `auth.uid()` is NULL and no attribution trigger fires.
- **Hato Lechero chequeo upload preview (B0/V10)** — `POST /make-server-1ccce916/hato/chequeo/preview` (`hato-chequeo-preview.ts`). Parses an uploaded chequeo `.xlsx` and returns a diff for approval (plus `filasNormalizadas` for the commit step); never commits. See "Hato Lechero Module" above for the full contract.
- **Hato Lechero chequeo commit** — `POST /make-server-1ccce916/hato/chequeo/commit` (`hato-chequeo-commit.ts`). The Aprobar step: re-validates the echoed approved rows against fresh DB state and writes atomically via the `fn_hato_commit_chequeo` RPC (migration 065, service-role only). See "Chequeo commit path" under Hato Lechero.
- **Hato Lechero chequeo por FOTO (Fase 3b)** — `POST /make-server-1ccce916/hato/chequeo/foto` (`hato-chequeo-foto.ts`, hand-synced pair). Twin of the preview endpoint: Martha photographs the printed, hand-filled planilla and uploads 1..6 images (`multipart/form-data`, field `fotos`; optional `fecha` field `AAAA-MM-DD`). **The OCR replaces only the grid read, never the pipeline** — the vision model (`google/gemini-3-flash-preview` via the same `OPENROUTER_API_KEY` as Esco, one call per photo, `response_format` json_schema, temperature 0) produces the SAME raw-string matrix `grilla.ts` would, which then goes through the SAME `normalizarHojas` + `construirDiffChequeo`. There is no second cell parser: `parseSX`/`parseToro`/`parseEstado` stay the only interpreters. 503 before doing anything if `OPENROUTER_API_KEY` is unset. Never writes to domain tables; uploads the photos to the 072 bucket first (raw layer) and reports a Storage failure explicitly instead of silently. Pure logic — roster, anchor cotejo (anti-row-drift), raw-matrix build, missing-cow report, prompt and JSON schema — lives in `src/utils/importHato/ocrChequeo.ts` (mirrored by the same generator as the rest of `importHato/`), tested with model-response fixtures in `src/__tests__/importHatoOcrChequeo.test.ts`. Two hard rules it enforces: a row whose printed `#`+`Nombre` do not match the roster of active cows is marked **no leída** and never shifted; a cell the model marks `baja`/`ilegible` enters as an **empty cell + a flag**, never a guess. `chequeoFecha` is `null` unless a human sent `fecha` — a title read off the photo comes back only as `chequeoFechaSugerida`.
- **Hato Lechero alertas tick (S6)** — `POST /make-server-1ccce916/hato/alertas/tick` (`hato-alertas-tick.ts`). Called daily at 05:45 Bogotá by the 060 pg_cron; auth via `x-hato-tick-secret` header. Generates/dispatches/escalates `hato_alertas`; sends nothing until `hato_alertas_config.destinatario_telegram_id` is configured. Full contract under "S6 — Motor de alertas" in the Hato Lechero section.
- **Telegram: hato producción conversations (S5)** — `pesajeLeche` (weekly per-cow weighing, date defaults to the configured `dia_pesaje_semanal`) and `produccionQuincenal` (replaces the daily `litrosCamion`), registered in `telegram/bot.ts` with `/pesaje` and `/produccion` commands. `telegram/types.ts` (BotContext) was restored from git history in S5 — a prior resync had deleted the only copy, which would have broken the whole bot at next deploy.
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
- `HATO_ALERTAS_TICK_SECRET` — shared secret for the hato alertas tick endpoint; must equal the Vault secret `hato_alertas_tick_secret` that the 060 pg_cron sends in the `x-hato-tick-secret` header. Both provisioned 2026-07-23. Endpoint returns 503 (does nothing) if unset.
- ~~`HATO_ALERTAS_ESCALAMIENTO_TELEGRAM_ID`~~ — **dead since migration 096 (2026-08-14). Nothing reads it.** Escalation recipients now come from `telegram_alertas_suscripciones.escalamiento`, per alert type. Worth knowing why the switch was free: `supabase secrets list` confirmed the variable **was never set**, so escalation had been silently doing nothing since July — unanswered alerts were marked `escalada` and died there. 096 therefore seeds `escalamiento = false` for everyone: turning it on is now a checkbox, and a scaffolding migration must not switch on a feature that was off.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — auto-injected by Supabase

**Deploy command**: `npx supabase functions deploy make-server-1ccce916`
Note: The local source in `src/supabase/functions/server/` must be kept in sync with `supabase/functions/make-server-1ccce916/` manually — changes to one must be applied to the other.

---

## Styling & Theming

- **Tailwind CSS 4.3** — `tailwindcss` + `@tailwindcss/vite` are real devDependencies and the compiler runs on every build. Utility-first, **CSS-first configuration**: no `tailwind.config.js`, no `postcss.config.js`; the plugin sits in `vite.config.ts` after `react()`.
- **CSS Variables** — theming via `:root` custom properties (green/agricultural palette), re-exported to Tailwind through `@theme inline` in `globals.css`
- **Primary color**: `#73991C` (olive green)
- **Font**: Visby CF (loaded from CDN in globals.css)
- **UI components**: Radix UI primitives wrapped in `src/components/ui/` with Tailwind + `cn()` utility (`clsx` + `tailwind-merge`)
- **`tw-animate-css`** supplies the `animate-in` / `slide-in-from-*` / `fade-out-*` utilities that `Sheet`, `Drawer` and the Radix overlays use. They are **not** Tailwind core — if it is ever dropped, those transitions disappear silently
- **`index.css`** is the entry point (three `@import`s: `tailwindcss`, `tw-animate-css`, `./styles/globals.css`) — nothing else belongs in it, and it is never hand-edited
- **`src/styles/globals.css`** is the source of truth for tokens, `@font-face` declarations, base typography and the project's own CSS. It carries the Tailwind directives (`@custom-variant`, `@theme`, `@layer`) and only works because `index.css` imports it

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

### ⚠️ CSS: `src/index.css` is an entry point, not a build artifact

Tailwind 4.3 **compiles on every `vite dev` / `vite build`** (`@tailwindcss/vite`, wired in `vite.config.ts`). **There is no closed list of usable classes** — any valid utility works, including arbitrary values (`bg-[#E7EDDD]`) and opacity modifiers (`bg-primary/10`). The old `grep -cF '<class>' src/index.css` check verified membership in a frozen compiled file; that file no longer exists. Do not reintroduce it, and treat any doc still describing it as stale.

| File | Role |
|---|---|
| `src/index.css` | The CSS entry point — three lines: `@import "tailwindcss";`, `@import "tw-animate-css";`, `@import "./styles/globals.css";`. The **only** stylesheet `main.tsx` imports. Never hand-edit |
| `src/styles/globals.css` | Source of truth for tokens (`:root`, `@theme inline`), `@font-face`, base typography, and the project's own CSS rules |
| `src/components/finanzas/dashboard/components/dashboardTables.css` | Plain CSS imported directly by 4 finance table components. No Tailwind directives, so it does not depend on the import chain |

**The import chain is load-bearing.** `globals.css` must enter through `index.css`, never through a JavaScript `import`. Tailwind only reads `@theme`, `@custom-variant` and `@layer base` from files reachable via the `@import "tailwindcss"` chain — import `globals.css` from `main.tsx` instead and the build still passes, CSS is still emitted, and every token silently stops existing.

**The rule that replaced "check before you use":** need a style → **use the Tailwind utility**. Hand-written CSS in `globals.css` is the exception, reserved for what utilities genuinely cannot express — domain selectors like `.tabla-financiera`, `.chat-markdown`, `.kpi-grid-hato`, `.filtros-colapsables`. It is no longer the way to work around a missing class, because no class is missing.

**If you do hand-write a rule, wrap it in `@layer`.** An unlayered rule beats *every* rule inside `@layer utilities` — regardless of specificity or source order — so an unlayered hand rule silently overrides the real utility forever. That is exactly how `.shadow-none` and `.data-[variant=outline]:shadow-xs` came to live in `globals.css`, and why they killed the `focus-visible:ring-*` outline on every `Toggle`/`ToggleGroup`: they wrote a final `box-shadow` value instead of composing the `--tw-*` layers the focus ring lives in. **Never redefine a Tailwind utility name by hand.**

**`index.css` is not edited by hand — the last time it was, it cost a whole phase.** The old compiled file had been amended twice against its own contract: a near-duplicate copy of `globals.css` in the middle, and 16 `!important` overrides at the end (`.text-brand-brown`, `.bg-primary`, `.bg-gradient-to-r`, `.hover\:bg-primary-dark`…). `text-brand-brown` was alive across ~100 files *only* because of that appendix, while all ~650 uses of `text-brand-brown/<opacity>` were dead — a hand-written class cannot cover opacity variants. Both edits are gone; the compiler regenerates those utilities from `@theme`, opacity modifiers included.

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
- Several triggers auto-sync data between tables (e.g., applications ↔ tasks)
- Modifying table schemas may break triggers — check `src/sql/migrations/` for trigger definitions
- See `src/sql/migrations/README_APLICACIONES_LABORES_SYNC.md` for the sync architecture
- **There is no purchases → expenses trigger.** `crear_gasto_pendiente_de_compra()` and `trigger_compra_a_gasto` were dropped from production on 2026-07-02 (migration 079); a compra posts nothing to `fin_gastos`. `src/sql/trigger_compra_a_gasto.sql`, `src/sql/update_trigger_compra_a_gasto.sql` and migration 038 are historical — do not re-run them. New triggers that touch cross-role tables should still use SECURITY DEFINER (the 038/039 precedent).
- The `fn_cleanup_compra_dependencies()` RPC function uses SECURITY DEFINER for the same reason (migration 039). Purchase deletion calls this via `.rpc()` instead of direct `fin_gastos.delete()`.

### ⚠️ "Hoy" siempre se toma en hora LOCAL, nunca en UTC

`new Date().toISOString().split('T')[0]` (o `.slice(0, 10)`) is **not** today — it is the **UTC** day. Bogotá is UTC-5, so from 19:00 to midnight it already returns **tomorrow**. Always use `obtenerFechaHoy()` from `@/utils/fechas`, which builds the string from local `getFullYear`/`getMonth`/`getDate`.

This is a data-corrupting trap, not a rendering nit, and it bites twice over:

- The **form** defaults `fecha` to the UTC day and persists a future date.
- The **list** filters with `fecha <= obtenerFechaHoy()` (local) — `periodo: 'ytd'` via `calcularRangoFechasPorPeriodo` (`fechas.ts`) is the default in Gastos/Ingresos and the Finanzas dashboard.

So the record saves correctly and then **vanishes from the screen**, which reads as data loss to the user. Verified live 2026-08-03: Consuelito captured 5 gastos at 21:13–21:18 Bogotá, all stored `Confirmado` with `fecha = 2026-08-04`, none visible in the historial. 12 rows in `fin_gastos` carry this desfase historically — all 12 created after 19:00 Bogotá.

Fixed across all 36 browser call sites (finanzas, monitoreo, inventario, labores, ganado, aplicaciones, clima, PDF filenames). `src/__tests__/hatoFechaLocalGuard.test.ts` is the static guard — it now covers **all of `src/components/` and `src/utils/`** (it previously only watched `src/components/hato/`, and only the `.slice(0, 10)` spelling, which is why the 36 `.split('T')[0]` sites went unseen) plus a fixed-clock regression asserting the form default falls inside the list's default window.

**Edge functions are deliberately out of scope.** `src/supabase/functions/` runs on Deno servers already in UTC, where `obtenerFechaHoy()` reads local = UTC and fixes nothing; those sites need an explicit `America/Bogota` conversion instead. Still open: `chat.tsx`, `generar-reporte-semanal.tsx`, `telegram/bot.ts`, `telegram/conversations/{pesajeLeche,ingreso}.ts`.

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

Two module contracts live as **nested `CLAUDE.md` files** rather than in this one — they load automatically only when Claude works with files under their directory, which keeps them out of unrelated sessions. Read them directly when working on those modules.

| Document | Location | Purpose |
|----------|----------|---------|
| Hato Lechero contract | `src/components/hato/CLAUDE.md` | Full module contract (auto-loads under that dir) |
| PO maintenance operation | `escociaos-po/CLAUDE.md` | Scheduled audit operation: agent roster, run protocol, memory layer |
| Finanzas view contracts | `src/components/finanzas/CLAUDE.md` | Gastos/Ingresos historial, ganado merge, table CSS (auto-loads under that dir) |
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
3. Update the right memory file if any of these changed: schema, routes, edge functions, env vars, dependencies.
   - Cross-cutting facts → this `CLAUDE.md`.
   - Hato Lechero or Finanzas module detail → the nested `CLAUDE.md` in that component directory (see Key Documentation). Do **not** grow this file back with module-specific detail — it is deliberately kept small so every session pays less to load it.
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
