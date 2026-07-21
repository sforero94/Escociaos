# Escocia OS — Design System Guidelines

Reference for building UI in this codebase. Read the **Critical constraint** first — it silently breaks styling if ignored.

---

## ⚠️ Critical constraint: `src/index.css` is a FROZEN pre-compiled Tailwind build

`src/index.css` is a **checked-in, pre-compiled Tailwind v4.1.3 output** (~5.5k lines). Tailwind does **not** run during `vite build` — it is not a build dependency (only `tailwind-merge` is in `package.json`, and there is no Tailwind plugin in `vite.config.ts`).

**Consequence: the set of usable Tailwind utility classes is fixed.** Any class not already present in `src/index.css` is silently ignored — no error, no warning, the style just doesn't apply.

Real example that shipped broken: `bg-sidebar-accent` and `bg-primary/10` are **not** in `index.css`, so the sidebar's active item rendered with green text but a fully transparent background.

**Before using a Tailwind class you haven't seen elsewhere in this codebase, verify it exists:**

```bash
grep -cF 'bg-sidebar-accent' src/index.css   # 0 = the class does NOT exist, it will do nothing
```

**When a needed utility doesn't exist**, define a real CSS rule in `src/styles/globals.css` (which IS a live stylesheet and is imported *after* `index.css`, so it wins the cascade):

```css
.nav-item-active {
  background-color: var(--sidebar-accent);
  color: var(--primary);
}
```

Never hand-edit `src/index.css`. Arbitrary values (`bg-[#E7EDDD]`) and opacity modifiers (`bg-primary/10`) are **not** generated on demand — they fail the same way.

---

## Color tokens

Source of truth: `src/styles/globals.css` (`:root`, re-exported through `@theme inline`).

| Token | Value | Use |
|---|---|---|
| `--primary` | `#73991C` | Brand green: primary actions, active text/icons |
| `--primary-dark` | `#5f7d17` | Primary hover |
| `--secondary` | `#BFD97D` | Light green accent |
| `--sidebar-accent` | `#E7EDDD` | **Soft green surface for active nav items** |
| `--background` | `#F8FAF5` | App background |
| `--foreground` | `#172E08` | Primary text |
| `--brand-brown` | `#4D240F` | Secondary/muted text (usually at 60–70% opacity) |
| `--radius` | `1rem` | Base radius |

Font: **Visby CF** (loaded via CDN in `globals.css`).

Always reference tokens (`var(--primary)` or an existing utility), never hardcode hex values in components.

---

## Navigation

### Sidebar (`src/components/Layout.tsx`)

A single `NAV` array drives desktop (expanded + 72px collapsed) and mobile. Two entry kinds:

- **Leaf** — `{ id, label, icon, path, exact?, matchPrefix?, soloGerencia? }`
- **Group** (accordion) — `{ id, label, icon, modulo, children: NavLeaf[] }`

Structure: Tablero General · **Aguacate** (group) · **Hato Lechero** (group) · Ganado · **Finanzas** (group) · Configuración.

**Active state (the approved Figma treatment) — use the `.nav-item-active` class:**
- Background `#E7EDDD` (`--sidebar-accent`), text + icons `#73991C` (`--primary`), `font-semibold`, `rounded-xl`.
- Applies identically to active group headers and active leaves, on desktop and mobile.
- **Do not** use the old intense treatment (`bg-gradient-to-r from-primary to-secondary text-white`) for navigation.

Inactive: `text-foreground` with a subtle hover. Collapsed sidebar shows icon-only with an **opaque** tooltip (`#172E08` background — never transparent text on a transparent surface).

Group behaviour: the header toggles open/closed and does **not** navigate; the group containing the active route auto-opens; clicking a group icon while collapsed un-collapses the sidebar and expands that group.

### In-page sub-navigation (underline tabs)

Used by Labores, Inventario, Monitoreo, Clima, Ganado, and the Finanzas dashboard's negocio tabs. Canonical example: `src/components/labores/LaboresSubNav.tsx`.

- Container: `bg-white/80 backdrop-blur-xl border-b border-primary/10 mb-6 -mx-4 lg:-mx-8 px-4 lg:px-8` (bleeds edge-to-edge).
- Tab: `border-b-2`; active `border-primary text-foreground` + medium weight; inactive `border-transparent text-brand-brown/60`.
- Each tab shows an icon, a label, and a subtitle hidden below `lg`.

**Rule: don't duplicate navigation.** If a section's pages are reachable as sidebar children, it must not also carry a top ribbon listing the same destinations — that is why the Finanzas top ribbon was removed once Finanzas became a sidebar group. Sub-navs are for tabs *within* one destination (e.g. Labores' Kanban/Reportes/Empleados/Contratistas, or the finanzas dashboard's negocio tabs).

---

## Visibility & access

What appears in the UI is filtered by per-user module access — see the "Module Access Control" section in `CLAUDE.md`. Governed modules: `aguacate`, `hato_lechero`, `ganado`, `finanzas`.

- Gerencia sees everything; other roles only what's assigned.
- The rule lives in one pure function, `puedeAccederModulo` (`src/utils/modulosAcceso.ts`) — never re-implement it inline.
- It fails **open** while the profile is unconfirmed, so nobody is briefly locked out on load.
- A leaf can additionally be marked `soloGerencia` (e.g. Producción, which exposes cost/rentabilidad data).

---

## Components & layout rules

- **Dialogs**: always `Dialog` + `DialogContent` with a `size` tier (`sm|md|lg|xl`), and put scrollable content in `DialogBody` — `DialogContent` is `overflow-hidden`. Never bypass Radix Dialog with `createPortal`.
- **Number inputs**: always add `onWheel={(e) => e.currentTarget.blur()}` — scrolling over a number field silently corrupts values otherwise.
- **Numbers/currency** (Colombian): no decimals on money, dots as thousands separators, abbreviate to millions (`$95M`, `2.000M` — never billions), no `COP` suffix. Use `src/utils/format.ts`; never format inline.
- **Responsive**: verify mobile whenever desktop layout changes. The sidebar collapses on mobile and body content must never hide behind it.
- Reuse `src/components/ui/` (Radix wrappers) and `src/components/shared/` before writing new primitives.
- Spanish for all UI text and domain naming; English for code comments and config.
