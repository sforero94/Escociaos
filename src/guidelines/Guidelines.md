# Escocia OS — Design System Guidelines

Reference for building UI in this codebase. Read **how CSS is built here** first — the cascade rule it describes silently breaks styling if ignored.

---

## ⚠️ How CSS is built here: Tailwind compiles, `index.css` is just the entry point

`src/index.css` is **three lines** — `@import "tailwindcss";`, `@import "tw-animate-css";`, `@import "./styles/globals.css";` — and it is the only stylesheet `main.tsx` imports. Tailwind 4.3 runs on every `vite dev` / `vite build` through `@tailwindcss/vite`.

**Consequence: there is no closed list of usable classes.** Any valid utility works, arbitrary values (`bg-[#E7EDDD]`) and opacity modifiers (`bg-primary/10`) included. The `grep -cF '<class>' src/index.css` check this file used to prescribe is obsolete — it verified membership in a compiled file that no longer exists.

**Use the Tailwind utility.** Hand-written CSS in `src/styles/globals.css` is now the exception, not the workaround of first resort: it is for what utilities genuinely cannot express — domain selectors such as `.tabla-financiera`, `.chat-markdown`, `.kpi-grid-hato`, `.nav-item-active`:

```css
@layer utilities {
  .nav-item-active {
    background-color: var(--sidebar-accent);
    color: var(--primary);
  }
}
```

**Wrap hand-written rules in `@layer`.** An unlayered rule beats every rule inside `@layer utilities`, whatever the specificity or order, so it silently and permanently overrides the real utility. That is how `.shadow-none` and `.data-[variant=outline]:shadow-xs` ended up killing the focus ring on `Toggle`/`ToggleGroup`. Never redefine a Tailwind utility name by hand.

**Never hand-edit `src/index.css`.** The old compiled version was amended by hand twice — a duplicated copy of `globals.css` plus 16 `!important` overrides — and untangling that was its own piece of work.

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
