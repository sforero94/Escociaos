# Implementation Plan — Sidebar Reorganization + Module-Based Access Control

> **Status**: authoritative. Backend and frontend agents implement this VERBATIM.
> **Mandate**: SURGICAL. Do not break anything currently working. No DB RLS changes.
> **Author**: CTO. Last verified against code: 2026-07-20.

---

## A. Architecture Summary & Module-Access Model

### What we are building

1. A new **grouped sidebar** (accordion groups + single items) replacing the flat `menuStructure` in `Layout.tsx`.
2. A **Hato Lechero** module with 5 sub-screens, all rendering the existing `ComingSoon` ("En Desarrollo") placeholder.
3. A **per-user module-access** feature: a Gerencia user assigns, per user, which of 4 governed modules they can access — **Aguacate, Hato Lechero, Ganado, Finanzas** — from Configuración → Usuarios.

### The module-access model (single source of truth)

- Governed modules (keys): `aguacate`, `hato_lechero`, `ganado`, `finanzas`.
- Persistence: new column `usuarios.modulos_acceso text[] NOT NULL DEFAULT '{}'`.
- The profile carries `modulos: string[]` loaded from that column.
- Enforcement is **navigation/visibility only**, at TWO layers, both driven by ONE pure function `puedeAccederModulo`:
  1. **Sidebar hide** — `Layout.tsx` filters groups/items.
  2. **Route-level guard** — `ModuleGuard` layout routes in `App.tsx` redirect denied direct-URL access to `/`.
- **NO database RLS changes.** This is not a hardened data boundary. (Data-layer RLS remains exactly as today.)

### The access rule (`puedeAccederModulo`) — spelled out

```
puedeAccederModulo(profile, moduloKey):
  1. if profile is null              -> true    (nothing loaded yet; fail OPEN)
  2. if profile.rol === ''           -> true    (temporal/unconfirmed profile; fail OPEN)
  3. if profile.rol === 'Gerencia'   -> true    (Gerencia always sees everything)
  4. else                            -> profile.modulos.includes(moduloKey)
```

**Fail-open rule (CRITICAL):** during the ~2s window where `AuthContext` holds the temporal profile (`rol === ''`), every governed module is allowed. This guarantees a real Gerencia user is never briefly locked out. Once the real profile resolves, the rule tightens automatically (an Administrador/Verificador with `modulos: []` then loses the governed modules — which is the intended "start with nothing, must be configured" behavior).

- **Gerencia** → all 4 modules, always (never needs configuration).
- **Administrador / Verificador** → start with `modulos_acceso = '{}'` → see ONLY non-governed items (Tablero General + Configuración) until a Gerencia user configures them.
- **Monitor** → unaffected: already fully blocked by `ProtectedRoute` (Telegram-only). Do not touch that path.

### Component/route topology after this change

```
Layout (grouped sidebar)
└── Routes
    ├── /                       Dashboard              (always)
    ├── [ModuleGuard aguacate]                         (layout route → <Outlet/>)
    │   ├── /labores            LaboresLayout          (SubNav + Outlet)
    │   │   ├── index           Labores (Kanban|Reportes via ?vista=)
    │   │   ├── empleados       Personal
    │   │   └── contratistas    Contratistas
    │   ├── /monitoreo/*        (unchanged)
    │   ├── /aplicaciones/*     (unchanged)
    │   ├── /inventario/*       (unchanged)
    │   ├── /clima/*            (unchanged)
    │   ├── /produccion         ProduccionDashboard    (inner RoleGuard KEPT: Gerencia-only; sidebar leaf hidden for non-Gerencia — see R1 RESOLVED)
    │   └── /reportes/*         (weekly reports, unchanged)
    ├── [ModuleGuard hato_lechero]
    │   └── /hato-lechero/*     5× ComingSoon
    ├── [ModuleGuard ganado]
    │   └── /ganado/*           (unchanged)
    ├── [ModuleGuard finanzas]
    │   └── /finanzas/*         (inner RoleGuards removed on 6 screens)
    ├── /configuracion          ConfiguracionDashboard (always; Usuarios/Telegram stay Gerencia-only inside)
    ├── /empleados, /empleados/contratistas → <Navigate> redirects to /labores/*
    ├── /ventas, /lotes          ComingSoon (ungoverned, unchanged)
    └── *                        Navigate → /
```

---

## B. BACKEND TASK LIST

Dependency order: B1 → B2 → (B3, B4, B5 parallel) → B6.

### B1. Migration `049_add_usuarios_modulos_acceso.sql`  — complexity S

- **File**: `src/sql/migrations/049_add_usuarios_modulos_acceso.sql` (next free number confirmed: 048 is the highest).
- **Content**:
  ```sql
  -- 049_add_usuarios_modulos_acceso.sql
  -- Per-user application module access (navigation/visibility only; NOT an RLS boundary).
  -- Modules: aguacate | hato_lechero | ganado | finanzas.
  -- Gerencia is granted all modules in application code and ignores this column.

  ALTER TABLE public.usuarios
    ADD COLUMN IF NOT EXISTS modulos_acceso text[] NOT NULL DEFAULT '{}'::text[];

  COMMENT ON COLUMN public.usuarios.modulos_acceso IS
    'App modules this user may navigate to (aguacate, hato_lechero, ganado, finanzas). Gerencia bypasses this in app code. Visibility only — not enforced by RLS.';
  ```
- **NO RLS changes.** The `usuarios` table has no repo-managed RLS/CREATE TABLE; the edge function writes with the service-role client (bypasses RLS), so no policy work is needed for the new column.
- **Apply manually** per repo convention (see `src/sql/migrations/README_MIGRATION.md`). Note in the PR that this migration must be run against production before the feature is usable.

### B2. Shared contract `src/utils/modulosAcceso.ts` (NEW)  — complexity S

Mirror the style of `src/utils/telegramUsuarios.ts` (`TELEGRAM_MODULES` + `toggleModulo`).

- Export the ordered constant:
  ```ts
  export interface ModuloAcceso { key: string; label: string; }
  export const MODULOS: ModuloAcceso[] = [
    { key: 'aguacate',     label: 'Aguacate' },
    { key: 'hato_lechero', label: 'Hato Lechero' },
    { key: 'ganado',       label: 'Ganado' },
    { key: 'finanzas',     label: 'Finanzas' },
  ];
  export const MODULO_KEYS = MODULOS.map(m => m.key);
  ```
- Export a minimal profile-shape type and the pure guard:
  ```ts
  export interface ProfileParaModulos { rol: string; modulos: string[]; }

  export function puedeAccederModulo(
    profile: ProfileParaModulos | null | undefined,
    moduloKey: string,
  ): boolean {
    if (!profile) return true;              // nothing loaded → fail open
    if (profile.rol === '') return true;    // temporal/unconfirmed → fail open
    if (profile.rol === 'Gerencia') return true;
    return profile.modulos.includes(moduloKey);
  }
  ```
- Export a `toggleModulo(current: string[], key: string): string[]` helper (identical semantics to `telegramUsuarios.toggleModulo`) for the checkbox UI.
- Keep this file free of React/Supabase imports so it stays unit-testable. (Recommended: add `src/__tests__/modulosAcceso.test.ts` covering the 4 rule branches — see Section E.)

### B3. `src/utils/supabase/client.ts` — extend `getUserProfile`  — complexity S

- The query already does `.select('*')` — no query change.
- In the returned object (currently lines ~57–63), add ONE field:
  ```ts
  return {
    id: data.id,
    nombre: data.nombre_completo || 'Usuario',
    email: data.email,
    rol: data.rol || 'Administrador',
    modulos: (data as any).modulos_acceso ?? [],   // NEW
    created_at: data.created_at,
  };
  ```
- Do not change the `rol` fallback (`|| 'Administrador'`) — unrelated and load-bearing.

### B4. `src/types/database.ts` — add the column to generated types  — complexity S

In the `usuarios` block (Row ~3097, Insert ~3106, Update ~3115):
- **Row**: add `modulos_acceso: string[] | null`
- **Insert**: add `modulos_acceso?: string[] | null`
- **Update**: add `modulos_acceso?: string[] | null`

(Adding as nullable in the type is safe even though the column is `NOT NULL DEFAULT`; PostgREST omits-safe on write, and reads always return an array.)

### B5. Edge function `usuarios.tsx` — accept & persist `modulos_acceso`  — complexity S

**Edit BOTH copies identically** (they must stay in sync):
- `src/supabase/functions/server/usuarios.tsx`
- `supabase/functions/make-server-1ccce916/usuarios.tsx`

Changes:
- `crearUsuario(body)`:
  - Destructure `modulos_acceso` from `body`.
  - Include it in the `.insert({...})`: `modulos_acceso: Array.isArray(modulos_acceso) ? modulos_acceso : []`.
  - Keep existing `rolesValidos` validation (`['Administrador','Verificador','Gerencia','Monitor']`) unchanged.
- `editarUsuario(body)`:
  - Destructure `modulos_acceso` from `body`.
  - Include it in the `.update({...})`: `modulos_acceso: Array.isArray(modulos_acceso) ? modulos_acceso : []`.
  - Do NOT write module data into `auth.users` metadata — DB column only.
- `eliminarUsuario` — no change.
- **Defensive**: if `rol === 'Gerencia'`, the server MAY normalize `modulos_acceso` to `MODULO_KEYS` (all four) so the row is self-consistent even though app code bypasses it. Optional but recommended; if done, hardcode the 4 keys (no cross-import into Deno).

### B6. Redeploy the edge function  — complexity S (after B5)

- `npx supabase functions deploy make-server-1ccce916`
- Verify via logs / health endpoint that the deploy is live.
- Forgetting this step is the #1 "works locally, not in prod" bug per CLAUDE.md.

---

## C. FRONTEND TASK LIST (dependency order)

Order: C1 → C2 → C3 → C4 → C5 → C6 → C7 → C8. C2 depends on B2; C4 depends on C3.

### C1. `src/contexts/AuthContext.tsx` — carry `modulos` + `hasModulo`  — complexity S

- Extend `UserProfile`:
  ```ts
  interface UserProfile {
    id: string; nombre: string; email: string; rol: string;
    modulos: string[];          // NEW
    created_at?: string;
  }
  ```
- Both temporal-profile literals (the `temporalProfile` at ~line 141 and the `basicProfile` at ~line 183) must set `modulos: []`.
- Add to context type + value a helper:
  ```ts
  hasModulo: (moduloKey: string) => boolean;
  // impl: import { puedeAccederModulo } from '../utils/modulosAcceso';
  //       const hasModulo = (k: string) => puedeAccederModulo(profile, k);
  ```
- `getUserProfile` already returns `modulos` (B3); the `setProfile(userProfile as UserProfile)` cast stays valid.
- Do NOT change the 2s timeout logic, `isAuthenticated`, `hasRole`, or the auth-state listener.

### C2. `src/components/auth/ModuleGuard.tsx` (NEW)  — complexity S (depends on B2, C1)

- Layout-route guard (renders `<Outlet/>`), NOT a children wrapper — this is the cleanest fit for centralized route-level enforcement in `App.tsx`.
  ```tsx
  import { Navigate, Outlet } from 'react-router-dom';
  import { useAuth } from '../../contexts/AuthContext';

  interface ModuleGuardProps { modulo: string; }

  export function ModuleGuard({ modulo }: ModuleGuardProps) {
    const { isLoading, hasModulo } = useAuth();
    if (isLoading) return null;                 // ProtectedRoute already shows the spinner
    if (!hasModulo(modulo)) return <Navigate to="/" replace />;
    return <Outlet />;
  }
  ```
- Deny behavior = redirect to `/` (the sidebar already hides the item; a URL a user can't reach should send them home). Do NOT reuse RoleGuard's full-screen "Acceso Restringido" here — redirect is cleaner for module gating.
- Because of fail-open, a denied non-Gerencia user may briefly see the target during the temporal-profile window, then get redirected once the real profile resolves. This is acceptable for a visibility feature. (Safer-but-heavier alternative in Section E.)

### C3. `src/App.tsx` — grouped routes + ModuleGuard layout routes + Labores/Hato routes  — complexity M (depends on C2)

Wrap the existing route subtrees in pathless `ModuleGuard` layout routes. Keep all existing lazy imports; add the new ones.

**New lazy imports:**
```ts
const LaboresLayout = lazy(() => import('./components/labores/LaboresLayout').then(m => ({ default: m.LaboresLayout })));
const ModuleGuard   = lazy(() => import('./components/auth/ModuleGuard').then(m => ({ default: m.ModuleGuard })));
```
(`ModuleGuard` may also be a normal non-lazy import since it is tiny — either is fine.)

**Route structure inside `<Routes>` (replace the current flat body):**
```tsx
<Route index element={<Dashboard />} />

{/* ===== Aguacate module ===== */}
<Route element={<ModuleGuard modulo="aguacate" />}>
  {/* Inventario */}
  <Route path="inventario"> ...unchanged children... </Route>
  {/* Aplicaciones */}
  <Route path="aplicaciones"> ...unchanged children... </Route>
  {/* Monitoreo */}
  <Route path="monitoreo" element={<DashboardMonitoreoV3 />} />
  <Route path="monitoreo/registros" element={<RegistrosMonitoreo />} />
  <Route path="monitoreo/carga-masiva" element={<CargaMasiva />} />
  <Route path="monitoreo/catalogo" element={<CatalogoPlagas />} />
  <Route path="monitoreo/apiarios" element={<ConfigApiarios />} />
  {/* Clima */}
  <Route path="clima" element={<ClimaDashboard />} />
  <Route path="clima/historico" element={<ClimaHistorico />} />
  {/* Labores (new nested layout) */}
  <Route path="labores" element={<LaboresLayout />}>
    <Route index element={<Labores />} />
    <Route path="empleados" element={<Personal />} />
    <Route path="contratistas" element={<Contratistas />} />
  </Route>
  {/* Legacy redirects (keep deep links alive) */}
  <Route path="empleados" element={<Navigate to="/labores/empleados" replace />} />
  <Route path="empleados/contratistas" element={<Navigate to="/labores/contratistas" replace />} />
  {/* Producción */}
  <Route path="produccion" element={<ProduccionDashboard />} />
  {/* Reportes (semanales) */}
  <Route path="reportes">
    <Route index element={<ReportesDashboard />} />
    <Route path="generar" element={<ReporteSemanalWizard />} />
  </Route>
</Route>

{/* ===== Hato Lechero module ===== */}
<Route element={<ModuleGuard modulo="hato_lechero" />}>
  <Route path="hato-lechero">
    <Route index element={<ComingSoon moduleName="Hato Lechero — Tablero" />} />
    <Route path="produccion" element={<ComingSoon moduleName="Hato Lechero — Producción" />} />
    <Route path="hato"       element={<ComingSoon moduleName="Hato Lechero — Hato" />} />
    <Route path="chequeos"   element={<ComingSoon moduleName="Hato Lechero — Chequeos" />} />
    <Route path="alertas"    element={<ComingSoon moduleName="Hato Lechero — Alertas" />} />
  </Route>
</Route>

{/* ===== Ganado module ===== */}
<Route element={<ModuleGuard modulo="ganado" />}>
  <Route path="ganado">
    <Route index element={<GanadoDashboard />} />
    <Route path="movimientos" element={<GanadoMovimientos />} />
  </Route>
</Route>

{/* ===== Finanzas module ===== */}
<Route element={<ModuleGuard modulo="finanzas" />}>
  <Route path="finanzas"> ...unchanged children (index + dashboard/* + gastos + ingresos + reportes + presupuesto + configuracion)... </Route>
</Route>

{/* ===== Always available ===== */}
<Route path="configuracion" element={<ConfiguracionDashboard />} />
<Route path="ventas" element={<ComingSoon moduleName="Ventas y Despachos" />} />
<Route path="lotes"  element={<ComingSoon moduleName="Gestión de Lotes" />} />
<Route path="*" element={<Navigate to="/" replace />} />
```

Notes:
- Remove the standalone `const Empleados = lazy(...)` import and its old `<Route path="empleados" element={<Empleados/>}>` block (replaced by the LaboresLayout nesting + redirects).
- `Personal` and `Contratistas` lazy imports stay.
- The single `<Suspense>` in `LayoutRoutes` still wraps everything — `ModuleGuard`'s `<Outlet/>` resolves lazy children under it fine.

### C4. Labores restructure — `LaboresLayout` + `LaboresSubNav` + minimal `Labores.tsx` edits  — complexity M (depends on C3 wiring)

**C4a. `src/components/labores/LaboresSubNav.tsx` (NEW)** — visually clone `EmpleadosSubNav.tsx` (same container/underline classes), 4 tabs:

| Label | Icon | Target | Active when |
|---|---|---|---|
| Kanban | `ListTodo` | `/labores?vista=kanban` | pathname `=== '/labores'` and `vista !== 'reportes'` |
| Reportes | `FileBarChart` | `/labores?vista=reportes` | pathname `=== '/labores'` and `vista === 'reportes'` |
| Empleados | `Users` | `/labores/empleados` | pathname `=== '/labores/empleados'` |
| Contratistas | `UserCheck` | `/labores/contratistas` | pathname `startsWith('/labores/contratistas')` |

- Use `useLocation` + `useSearchParams` to compute active state; navigate with `navigate('/labores?vista=kanban')` etc.
- Keep the exact container styling of `EmpleadosSubNav` (`bg-white/80 backdrop-blur-xl border-b ... -mx-4 lg:-mx-8 px-4 lg:px-8`, underline `border-b-2`, active `border-primary text-foreground`).

**C4b. `src/components/labores/LaboresLayout.tsx` (NEW)** — mirror `Empleados.tsx`:
```tsx
import { Outlet } from 'react-router-dom';
import { LaboresSubNav } from './LaboresSubNav';
export function LaboresLayout() {
  return (<div><LaboresSubNav /><Outlet /></div>);
}
```

**C4c. `src/components/labores/Labores.tsx` — minimal edits (keep component MOUNTED, no refetch on Kanban↔Reportes):**
- Add `useSearchParams` to the react-router-dom import.
- Replace `const [tabActivo, setTabActivo] = useState('kanban');` with:
  ```ts
  const [searchParams] = useSearchParams();
  const vista = searchParams.get('vista') === 'reportes' ? 'reportes' : 'kanban';
  ```
- Remove the `<TabsList>…</TabsList>` block (the 2-column trigger row). Keep `<Tabs value={vista}>` (drop `onValueChange`) and both `<TabsContent value="kanban">` / `<TabsContent value="reportes">` intact.
- Remove now-unused imports: `TabsList`, `TabsTrigger`, `ListTodo`, `FileBarChart` (verify none are referenced elsewhere in the file before deleting).
- Optionally drop the big `<h1>Gestión de Labores</h1>` header block (the sub-nav now provides context) to avoid a double header. Keep the alerts + dialogs untouched.
- **Do NOT touch** `cargarDatos`/`cargarTareas`/`cargarEmpleados`/`cargarContratistas`/`cargarLotes` or any fetching — this is the "keep data fetching in Labores unchanged" guarantee. Because the index route component stays mounted across `?vista` changes, no refetch occurs when toggling Kanban↔Reportes.

**C4d. Retire the old Empleados wrapper** (verified only App.tsx imported `Empleados`, and only `Empleados.tsx` imported `EmpleadosSubNav`):
- Delete `src/components/empleados/Empleados.tsx` and `src/components/empleados/EmpleadosSubNav.tsx`.
- Keep `src/components/empleados/Personal.tsx` and `Contratistas.tsx` (still routed).
- If deletion feels risky, the safe minimum is to simply stop importing them from `App.tsx` (dead files, no runtime effect). Prefer deletion to avoid confusion.

### C5. `src/components/Layout.tsx` — grouped sidebar with accordion groups  — complexity L (depends on C1)

Replace the flat `menuStructure` with a typed grouped structure and render logic. This is the largest single change — keep the existing visual language (gradient active pill, rounded-xl, tooltip-on-collapsed, mobile drawer).

**Data model** (module-scope, above the component):
```ts
type NavLeaf  = { id: string; label: string; icon: LucideIcon; path: string; exact?: boolean; soloGerencia?: boolean };
type NavGroup = { id: string; label: string; icon: LucideIcon; modulo: string; children: NavLeaf[] };
type NavEntry = (NavLeaf & { modulo?: string }) | NavGroup;
const isGroup = (e: NavEntry): e is NavGroup => 'children' in e;
```

**Structure (top → bottom, EXACT order):**
```ts
const NAV: NavEntry[] = [
  { id: 'tablero', label: 'Tablero General', icon: LayoutDashboard, path: '/', exact: true },
  { id: 'aguacate', label: 'Aguacate', icon: Leaf, modulo: 'aguacate', children: [
      { id: 'labores',     label: 'Labores',     icon: Wrench,        path: '/labores' },
      { id: 'monitoreo',   label: 'Monitoreo',   icon: Activity,      path: '/monitoreo' },
      { id: 'aplicaciones',label: 'Aplicaciones',icon: Sprout,        path: '/aplicaciones' },
      { id: 'inventario',  label: 'Inventario',  icon: Package,       path: '/inventario/dashboard' },
      { id: 'clima',       label: 'Clima',       icon: Cloud,         path: '/clima' },
      { id: 'produccion',  label: 'Producción',  icon: TrendingUp,    path: '/produccion', soloGerencia: true },
      { id: 'reportes',    label: 'Reportes',    icon: FileText,      path: '/reportes' },
  ]},
  { id: 'hato', label: 'Hato Lechero', icon: Milk, modulo: 'hato_lechero', children: [
      { id: 'hato-tablero',   label: 'Tablero',    icon: LayoutDashboard, path: '/hato-lechero', exact: true },
      { id: 'hato-produccion',label: 'Producción', icon: TrendingUp,      path: '/hato-lechero/produccion' },
      { id: 'hato-hato',      label: 'Hato',       icon: Beef,            path: '/hato-lechero/hato' },
      { id: 'hato-chequeos',  label: 'Chequeos',   icon: ClipboardCheck,  path: '/hato-lechero/chequeos' },
      { id: 'hato-alertas',   label: 'Alertas',    icon: Bell,            path: '/hato-lechero/alertas' },
  ]},
  { id: 'ganado',   label: 'Ganado',        icon: Beef,      path: '/ganado',        modulo: 'ganado' },
  { id: 'finanzas', label: 'Finanzas',      icon: DollarSign,path: '/finanzas',      modulo: 'finanzas' },
  { id: 'settings', label: 'Configuración', icon: Settings,  path: '/configuracion' },
];
```
- New lucide imports needed: `Milk`, `ClipboardCheck`, `Bell`, `ChevronDown` (or `ChevronRight`). Keep all existing imports.

**Filtering:** compute a visible list per render. Groups are filtered by module; each group's CHILDREN are additionally filtered by `soloGerencia` (Producción). Single items are filtered by module + `soloGerencia`. A group whose children all get filtered out is hidden.
```ts
const { profile } = useAuth();
// fail-open: unconfirmed profile (null or rol==='') is treated as Gerencia for the soloGerencia gate,
// consistent with puedeAccederModulo's fail-open behavior.
const rolSinConfirmar = !profile || profile.rol === '';
const esGerencia = profile?.rol === 'Gerencia';
const leafVisible = (l: NavLeaf) => !l.soloGerencia || esGerencia || rolSinConfirmar;

const visible = NAV
  .filter(e => isGroup(e)
    ? puedeAccederModulo(profile, e.modulo)
    : (e.modulo ? puedeAccederModulo(profile, e.modulo) : true) && leafVisible(e as NavLeaf))
  .map(e => isGroup(e) ? { ...e, children: e.children.filter(leafVisible) } : e)
  .filter(e => !isGroup(e) || e.children.length > 0);
```
(import `puedeAccederModulo` from `@/utils/modulosAcceso`.)

**Active matching:** keep current helper but honor `exact`:
```ts
const isActive = (path: string, exact?: boolean) =>
  exact ? location.pathname === path
        : (path === '/' ? location.pathname === '/' : location.pathname.startsWith(path));
```
Groups are "active" (header highlighted subtly) if any child `isActive`.

**Expanded-sidebar accordion:**
- Track `const [openGroups, setOpenGroups] = useState<Set<string>>(...)`. Initialize so the group containing the active route is open. Add an effect on `location.pathname` that auto-opens the active group (do not force-close others the user opened).
- Group header = a button: left icon + label + `ChevronDown` (rotated when open). Clicking toggles membership in `openGroups`. Header does NOT navigate.
- Children render indented (e.g. `pl-9`) below an open header, each a leaf button reusing the existing active-pill styling.

**Collapsed (72px) sidebar:**
- Leaf items: unchanged from today (centered icon + `SidebarTooltip`, navigate on click).
- Group items: render as a single centered icon button with `SidebarTooltip` = group label. **On click: `setCollapsed(false)` (persist to `localStorage`) AND add the group id to `openGroups`.** Do not navigate. (Per approved direction: clicking a collapsed group un-collapses + expands it.)

**Mobile drawer (`lg:hidden`):**
- Same `visible` list and grouping. No collapse concept on mobile. Render groups as accordions defaulting to open for the active group (reuse `openGroups`), children indented. Leaf items unchanged. Keep `setMobileMenuOpen(false)` on any navigation.
- Preserve the existing body-scroll-lock effect, overlay, and safe-area padding exactly.

**Do NOT change:** the logo header, collapse toggle button, user-info footer, logout button, tooltip component, the `#main-content` margin `<style>` block, or any width/transition values.

### C6. Hato Lechero screens — complexity S (covered by C3)

No new components: all 5 routes render the existing `ComingSoon` with a descriptive `moduleName` (see C3). No file additions beyond the routes.

### C7. `src/components/configuracion/UsuariosConfig.tsx` — "Módulos de acceso" section  — complexity M

- Add state: `const [modulosAcceso, setModulosAcceso] = useState<string[]>([]);`
- Import `{ MODULOS, MODULO_KEYS, toggleModulo }` from `@/utils/modulosAcceso`.
- `abrirModalCrear`: `setModulosAcceso([])`.
- `abrirModalEditar(usuario)`: `setModulosAcceso(usuario.modulos_acceso ?? [])`.
- Extend the local `Usuario` interface with `modulos_acceso?: string[] | null;` (the `.select('*')` already returns it once migration 049 is applied).
- Add a form section AFTER the Rol select and BEFORE Clave: a "Módulos de acceso" label + 4 checkboxes generated from `MODULOS`, each `checked={modulosAcceso.includes(m.key)}`, `onChange={() => setModulosAcceso(prev => toggleModulo(prev, m.key))}`.
- **Gerencia special-case:** when `rol === 'Gerencia'`, render all 4 checkboxes as `checked disabled` and show the note *"Gerencia tiene acceso a todo"*. (Do not depend on state for the checked visual in this case — force checked.)
- `handleSubmit` body: add `modulos_acceso` to the POST body:
  ```ts
  const body: any = {
    email, nombre_completo: nombreCompleto, rol, activo,
    modulos_acceso: rol === 'Gerencia' ? MODULO_KEYS : modulosAcceso,   // NEW
  };
  ```
- (Optional) include `modulosAcceso` in the `useFormDraft('usuarios-form-v1', {...})` snapshot + `handleRestoreDraft` so drafts survive; bump the draft key to `usuarios-form-v2` if you change the snapshot shape.
- **Keep the whole tab Gerencia-only** — do not touch the `profile?.rol !== 'Gerencia'` early return or the `ConfiguracionDashboard` `isGerencia` gating.

### C8. Verification pass — complexity S

Run typecheck + lint + manual flows (Section E) before commit.

---

## D. DO-NOT-TOUCH LIST (must keep working, unchanged)

1. **`ProtectedRoute` Monitor block** — the `profile?.rol === 'Monitor'` Telegram-only screen. Module gating must never interfere with it; Monitor never reaches `LayoutRoutes`.
2. **Configuración → Usuarios / Telegram Gerencia gating** — `ConfiguracionDashboard` `isGerencia` conditionals and `UsuariosConfig`'s `profile?.rol !== 'Gerencia'` early return stay as-is. `/configuracion` remains always-visible in the sidebar (not module-governed).
3. **All existing RLS / DB triggers / migrations** — no RLS changes anywhere. Migration 049 only ADDs a nullable-in-type, default-empty column.
4. **Labores data fetching** — `cargarDatos` and all `cargar*` functions in `Labores.tsx` are untouched; only the tab-selection mechanism changes.
5. **Ganado write-gating** — Ganado's Administrador+Gerencia write actions (module internals) are independent of sidebar module access; do not alter them. (A user must have the `ganado` module to navigate there, but write permissions inside remain role-based as today.)
6. **`ChatFAB`** — keep `hasRole(['Gerencia'])`. Do not convert to a module check.
7. **Number formatting** (`src/utils/format.ts`, Colombian standard), **Dialog size system** (`src/components/ui/dialog.tsx`), and **responsive/mobile rules** (sidebar collapse, number-input `onWheel` blur) — untouched. Verify the new sidebar respects mobile (Section E).
8. **`AuthContext` timeout/fail-open machinery** — the 2s profile timeout, `isAuthenticated`, `hasRole`, and auth-state listener stay. We only ADD `modulos` + `hasModulo`.
9. **Edge function auth CRUD semantics** — `rolesValidos`, auth.users creation/metadata, delete-on-failure rollback — unchanged; we only add `modulos_acceso` to insert/update.

---

## E. RISKS & VERIFICATION CHECKLIST

### Flagged risks (CTO)

- **R1 — RESOLVED by owner (2026-07-20): Producción stays Gerencia-only.** DECISION: keep `ProduccionDashboard`'s inner `RoleGuard allowedRoles={['Gerencia']}` (do NOT remove it) AND hide the "Producción" sidebar leaf for non-Gerencia via `soloGerencia: true` (see C5 filtering). Net effect: Producción is Aguacate-gated for the group's visibility, but the leaf + content are Gerencia-only. So the frontend RoleGuard-removal task applies to the **6 Finanzas screens ONLY** (`FinanzasDashboard`, `ConfiguracionFinanzas`, finanzas `ReportesView`, `PresupuestoView`, `GastosView`, `IngresosView`) — NOT `ProduccionDashboard`. The 6 finanzas screens become purely `finanzas`-module-governed (a configured non-Gerencia user CAN see them — that is the intended configurable behavior).
- **R2 — Fail-open flash.** During the temporal-profile window a denied user can briefly see a governed sidebar group / route before the real profile resolves (~≤2s), then it hides / redirects. Acceptable for a visibility feature and required to avoid locking out Gerencia.
  - *Safer-but-heavier alternative (only if the flash is unacceptable):* add a `profileConfirmed` boolean to `AuthContext` (set true only after `getUserProfile` resolves or times out) and have `ModuleGuard`/sidebar render a spinner while `!profileConfirmed`. This costs Gerencia a brief spinner on every load. Not recommended unless product asks.
- **R3 — Direct URL to a legacy path.** `/empleados` and `/empleados/contratistas` now redirect into the Aguacate-governed `/labores/*`. A user without the Aguacate module hitting an old bookmark will redirect then be sent to `/`. Expected.
- **R4 — Dashboard (`/`) cross-module alerts.** The always-visible Tablero (Dashboard "Pulso de Gestión") may surface data from modules a user lacks. Out of scope (no data-boundary enforcement by decision). Note for future hardening only.
- **R5 — Edge-function sync/deploy.** If only one `usuarios.tsx` copy is edited, or the redeploy is skipped, module assignment silently won't persist in prod. B5+B6 are mandatory together.
- **R6 — `activo` type note.** Editing a Gerencia user must send `modulos_acceso: MODULO_KEYS` so the row is self-consistent; app code ignores it regardless, but this avoids a confusing empty array on a Gerencia row.

### Automated checks (run before commit)

```bash
npm run typecheck    # must pass — new UserProfile.modulos, ModuleGuard, database.ts types
npm run lint         # fix any issue introduced this session (unused Tabs imports in Labores!)
npm test             # existing suite green; add modulosAcceso.test.ts (below)
```
- **Add `src/__tests__/modulosAcceso.test.ts`** covering `puedeAccederModulo`: (a) null profile → true; (b) `rol:''` → true; (c) `rol:'Gerencia', modulos:[]` → true for every key; (d) `rol:'Verificador', modulos:['ganado']` → true for `ganado`, false for the other three; plus `toggleModulo` add/remove.

### Manual flows (drive these in the browser)

1. **Gerencia** logs in → sidebar shows Tablero General, Aguacate (7 children), Hato Lechero (5 children), Ganado, Finanzas, Configuración. All routes reachable.
2. **Verificador configured with only `ganado`** → sidebar shows ONLY Tablero General, Ganado, Configuración. Aguacate/Hato/Finanzas groups+items hidden.
2b. **Verificador configured with `aguacate`** → sidebar Aguacate group shows 6 children (Producción HIDDEN — soloGerencia). Direct-URL `/produccion` passes the aguacate ModuleGuard but `ProduccionDashboard`'s inner `RoleGuard` shows "Acceso Restringido". Finanzas granted to that same user → the 6 Finanzas screens ARE visible/usable (module-governed, no inner Gerencia block).
3. **Direct-URL denial** → as that Verificador, navigate to `/finanzas` and `/hato-lechero/produccion` → redirected to `/`.
4. **Hato Lechero** → each of the 5 sub-items renders `ComingSoon` ("En Desarrollo") with the correct title.
5. **Labores 4-tab subnav** → Kanban ⇄ Reportes toggles via `?vista=` with NO data refetch (network idle on toggle); Empleados and Contratistas tabs load `Personal`/`Contratistas`. Active underline tracks correctly.
6. **Deep-link redirects** → `/empleados` → `/labores/empleados`; `/empleados/contratistas` → `/labores/contratistas`.
7. **Assign modules** → as Gerencia, edit a user, tick `Aguacate` + `Finanzas`, save; re-open → checkboxes reflect saved state; that user (re-login) sees exactly those groups. Editing a Gerencia user shows all 4 checked+disabled with the note.
8. **Collapsed sidebar** → collapse to 72px; click the Aguacate group icon → sidebar un-collapses AND the Aguacate group is expanded. Tooltips are opaque.
9. **Mobile viewport** → open the drawer; groups render (active group expanded), children indented, navigation closes the drawer; body content never hides behind the sidebar.

**Suggestion:** after implementation, ask me (or QA) to run an end-to-end browser verification of flows 1–9 — the module-visibility matrix is the highest-value thing to confirm live.

### Optional workflow (only if the owner opts in)

Module-access is a security-adjacent surface. If you want extra assurance before shipping, I can propose an **adversarial verification loop** (~4–6 agents): reviewers enumerate bypass paths (fail-open abuse, redirect loops, stale profile), skeptics try to refute each, only confirmed findings survive. Say the word; otherwise the checklist above is sufficient for a visibility-only feature.

---

## F. CLAUDE.md UPDATES NEEDED (diff-style note — CTO applies separately; do NOT edit CLAUDE.md as part of this feature work)

1. **Migrations section** — append:
   > - **049**: `add_usuarios_modulos_acceso` — adds `modulos_acceso text[] NOT NULL DEFAULT '{}'` to `usuarios`. Per-user app-module visibility (aguacate | hato_lechero | ganado | finanzas). Navigation/visibility only — NOT enforced by RLS. Gerencia bypasses it in app code.

2. **New concept block** — add a short "Module Access Control" subsection:
   > Per-user module visibility governs 4 modules (`aguacate`, `hato_lechero`, `ganado`, `finanzas`). Source of truth: `usuarios.modulos_acceso`. Pure rule in `src/utils/modulosAcceso.ts` (`puedeAccederModulo`): Gerencia → all; unconfirmed profile (`rol===''`) → fail OPEN; else membership. Enforced at the sidebar (`Layout.tsx` filter) and route level (`ModuleGuard` layout routes in `App.tsx`). NOT a data boundary — no RLS. Monitor is still fully blocked by `ProtectedRoute`.

3. **Routing Map** — replace the Employees rows and add Hato:
   > - `/labores` → `LaboresLayout` (SubNav) → index `Labores` (Kanban/Reportes via `?vista=`), `empleados` → `Personal`, `contratistas` → `Contratistas`.
   > - Remove the `/empleados`, `/empleados/contratistas` rows (now redirects into `/labores/*`).
   > - Add `/hato-lechero` (+ `/produccion`, `/hato`, `/chequeos`, `/alertas`) → `ComingSoon`, module `hato_lechero`.
   > - Note that Aguacate/Hato/Ganado/Finanzas route subtrees are each wrapped in a `ModuleGuard` layout route.

4. **Edge function secrets/CRUD note** — note that `usuarios/crear` and `usuarios/editar` now accept/persist `modulos_acceso: string[]` (both `usuarios.tsx` copies; redeploy required).

5. **Project Structure** — note new files: `src/utils/modulosAcceso.ts`, `src/components/auth/ModuleGuard.tsx`, `src/components/labores/LaboresLayout.tsx`, `src/components/labores/LaboresSubNav.tsx`; and removed files `src/components/empleados/Empleados.tsx`, `EmpleadosSubNav.tsx`.
