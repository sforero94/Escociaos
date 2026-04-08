# Bug: Purchase-to-expense trigger blocked by RLS for non-Gerencia users
**Date:** 2026-04-08  
**Severity:** Critical  
**Status:** Fix planned

## Symptom
When an Administrador user registers a purchase (compra) in `/inventario/compras`, the operation fails with:
> "Error al guardar: No se encontraron catálogos activos necesarios para crear el gasto"

The purchase is not saved. The error prevents Administrador users from using the entire purchase registration workflow.

## Reproduction path
1. Log in as a user with role `Administrador`
2. Navigate to `/inventario/compras` (NewPurchase.tsx)
3. Fill in purchase details and click save
4. `NewPurchase.tsx:381` → INSERT into `compras` table
5. Trigger `trigger_compra_a_gasto` fires → calls `crear_gasto_pendiente_de_compra()`
6. Trigger queries catalog tables (`fin_negocios`, `fin_regiones`, etc.) with `WHERE activo = true`
7. Production RLS policies (Gerencia-only, via `es_usuario_gerencia()`) block the SELECTs for Administrador
8. All variables are NULL → line 34-37 validation fails → RAISE EXCEPTION
9. Exception propagates to `NewPurchase.tsx:447` catch block → `showError()` on line 448

## Hypotheses evaluated
| Hypothesis | Status | Evidence |
|---|---|---|
| Catalog tables have no active records | Ruled out | Would affect ALL users equally, not just Administrador |
| First active category has no concepts | Ruled out | Same — role-independent data issue |
| All records deactivated via config UI | Ruled out | Same — role-independent |
| **Production RLS is Gerencia-only on catalog tables** | **Confirmed** | Migration 037 states "Production SELECT policy is Gerencia-only (es_usuario_gerencia)". Function exists in database.ts types but not in any migration — created directly in Supabase Dashboard. |
| INSERT into fin_gastos also blocked by RLS | Confirmed (secondary) | `fin_gastos_write` requires Gerencia. Even if SELECTs worked, INSERT would fail. Trigger hits NULL check first. |
| **Trigger lacks SECURITY DEFINER** | **Confirmed** | Function uses default SECURITY INVOKER. All internal queries inherit caller's RLS context. |

## Root cause
The trigger function `crear_gasto_pendiente_de_compra()` (defined in `src/sql/update_trigger_compra_a_gasto.sql`) uses the default SECURITY INVOKER execution context. 

In production, the finance catalog table SELECT policies were manually tightened from `USING (true)` to Gerencia-only (via `es_usuario_gerencia()` function, created outside version-controlled migrations). When a non-Gerencia user (e.g., Administrador) inserts a purchase:
1. The trigger's SELECT queries are blocked by RLS → return no rows → variables are NULL
2. The NULL validation check on line 34-37 raises the exception

This is a compound bug: even if the SELECTs were unblocked, the trigger's INSERT into `fin_gastos` would also be blocked by the Gerencia-only write policy on that table.

## Impact
- **Direct**: All Administrador users are completely blocked from registering purchases
- **Scope**: Only the `compras` INSERT trigger is affected. Direct expense creation via GastoForm and batch imports to fin_gastos are separate flows.
- **Fix safety**: Making the function SECURITY DEFINER only affects this one trigger function. No other code calls it.

## Fix plan
Create migration `038_fix_trigger_compra_gasto_security_definer.sql` that:
1. Drops the existing trigger
2. Recreates `crear_gasto_pendiente_de_compra()` with `SECURITY DEFINER SET search_path = public`
3. Recreates the trigger

The SECURITY DEFINER attribute makes the function run as its owner (postgres), which bypasses RLS. This is the correct pattern for system-level triggers that need to access multiple tables regardless of the calling user's role.

## Tests
- [ ] Administrador user can register a purchase without the "catálogos activos" error
- [ ] A pending expense (estado='Pendiente') is auto-created in fin_gastos after purchase
- [ ] Gerencia user purchase flow still works correctly (regression)
- [ ] The auto-created expense has correct default catalog values
- [ ] The url_factura is copied from the purchase to the expense
