# Bug: DailyMovementsDashboard crashes with TDZ ReferenceError for non-active applications
**Date:** 2026-04-09
**Severity:** Critical
**Status:** Fixed

## Symptom
Navigating to `/aplicaciones/:id/movimientos` for an application with `estado = 'Calculada'` crashes the page with:
```
ReferenceError: Cannot access 'Z' before initialization
    at DailyMovementsDashboardWrapper-Keu-aztg.js:14:17673
```
The page never renders — React catches an unrecoverable exception during the first effect cycle. The minified variable `Z` corresponds to `loadData`.

## Reproduction path
1. Navigate to `/aplicaciones`
2. Click on an application in "Calculada" state (not yet started)
3. Navigate to its movimientos page (`/aplicaciones/:id/movimientos`)
4. Page crashes immediately

## Hypotheses evaluated
| Hypothesis | Status | Evidence |
|---|---|---|
| TDZ: `const` functions declared after conditional early return | **Confirmed root cause** | `loadData`, `calcularResumen`, `calcularCanecasTotales` declared as `const` on lines 114/259/347, AFTER conditional return on line 80. Effects at lines 69-76 fire into the TDZ when early return triggers. |
| Circular chunk dependency | Ruled out | No circular imports in dependency tree; Vite build produces no warnings |
| Minification reorders code | Ruled out | Rollup/esbuild preserve execution order semantics; `Z` is the renamed `loadData` |
| Race condition between wrapper and dashboard | Ruled out | Wrapper fully resolves `aplicacion` before rendering dashboard |
| Non-"En ejecución" state from DB | Confirmed enabling condition | `EstadoAplicacion = 'Calculada' \| 'En ejecución' \| 'Cerrada'` — "Calculada" triggers the early return |
| `onClose` always truthy from wrapper | Confirmed enabling condition | Wrapper always passes `onClose={handleClose}` |

## Root cause
In `src/components/aplicaciones/DailyMovementsDashboard.tsx`, six `const` arrow function declarations (`loadData`, `loadMovimientos`, `loadProductosPlanificados`, `loadCanecasPlaneadas`, `calcularResumen`, `calcularCanecasTotales`) are placed on lines 114-365, AFTER a conditional early return at line 80.

Three `useEffect` hooks at lines 69-76 reference `loadData`, `calcularResumen`, and `calcularCanecasTotales`. These effects are registered during render (before the early return), but their callbacks fire asynchronously after render.

When `aplicacion.estado !== 'En ejecución' && aplicacion.estado !== 'Cerrada' && onClose`:
1. Hooks and effects register normally (lines 41-76)
2. Conditional early return fires (line 80) — function body exits
3. `const` declarations at lines 114+ are never executed
4. React fires the registered effects
5. Effect callbacks try to access `loadData` → TDZ → `ReferenceError`

JavaScript `const` declarations are hoisted (the variable exists in scope) but NOT initialized until the declaration statement executes. Accessing them before that point throws a ReferenceError (Temporal Dead Zone).

## Impact
- Only route `/aplicaciones/:id/movimientos` is affected
- Fix is internal to the component body — no exported interface changes
- No similar TDZ patterns found in sibling components (CierreAplicacion, AplicacionesList, CalculadoraAplicaciones)

## Fix plan
Move the six `const` function declarations (lines 114-365) to immediately after line 76 (after the last `useEffect`, before the conditional early return at line 80). All dependencies (supabase, props, state values, state setters) are declared above line 76.

## Tests
- [ ] Navigate to `/aplicaciones/:id/movimientos` for a "Calculada" app → should show "No Iniciada" message, not crash
- [ ] Navigate for an "En ejecución" app → should load daily movements normally
- [ ] `npm run build` succeeds without warnings
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
