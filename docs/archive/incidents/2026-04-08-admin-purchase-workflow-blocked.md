# Bug: Administrador users blocked at multiple points in purchase workflow
**Date:** 2026-04-08  
**Severity:** Critical  
**Status:** Fixed

## Symptom
Administrador users encounter errors across the entire purchase (compras) workflow:
- Deleting a purchase fails with: `"update or delete on table 'compras' violates foreign key constraint 'fin_gastos_compra_fkey' on table 'fin_gastos'"`
- Factura upload/view blocked by Gerencia-only storage policies

## Reproduction path
1. Log in as Administrador
2. Navigate to `/inventario/compras`
3. Attempt to delete an existing purchase
4. PurchaseHistory.tsx:352 → `fin_gastos.delete().eq('compra_id', id)` → blocked by RLS (Gerencia-only)
5. Error swallowed silently (line 357-359)
6. PurchaseHistory.tsx:406 → `compras.delete().eq('id', id)` → FK constraint violation (fin_gastos record still references compra)

## Hypotheses evaluated
| Hypothesis | Status | Evidence |
|---|---|---|
| fin_gastos DELETE blocked by RLS for Administrador | **Confirmed** | `fin_gastos_write` policy requires Gerencia. Error swallowed on line 357. |
| FK constraint blocks compra deletion | **Confirmed** | `fin_gastos_compra_fkey` has no CASCADE/SET NULL. Linked gasto still references compra. |
| Facturas storage Gerencia-only | **Confirmed** | All 4 storage policies in `create_storage_policies_facturas.sql` check `rol = 'Gerencia'`. |
| compras table RLS blocks Administrador | Ruled out | No restrictive RLS found; user can see purchase history. |
| productos RLS blocks Administrador | Ruled out | Product fetch and update work (no error before FK issue). |
| movimientos_inventario RLS blocks Administrador | Ruled out | Movement operations succeed (no error before FK issue). |

## Root cause
Three independent bugs, all caused by the finance module being designed with Gerencia-only access:

1. **fin_gastos RLS blocks cleanup**: The delete flow silently fails to delete the linked `fin_gastos` record (Administrador has no DELETE access), then the FK constraint blocks the `compras` deletion.
2. **No FK cascade**: `fin_gastos.compra_id` uses default RESTRICT behavior — no CASCADE or SET NULL.
3. **Facturas storage Gerencia-only**: All storage policies on the `facturas` bucket only allow Gerencia.

## Impact
- Delete flow in PurchaseHistory.tsx (lines 318-422)
- FacturaUploader component used in NewPurchase.tsx
- No regression risk: changes are additive (new RPC function, new policies, relaxed FK)

## Fix plan
**Migration 039** (`039_fix_admin_purchase_workflow.sql`):
1. SECURITY DEFINER function `fn_cleanup_compra_dependencies(UUID)` — deletes linked fin_gastos records bypassing RLS
2. Alter FK to `ON DELETE SET NULL` — safety net so compra deletion is never blocked by FK
3. Administrador storage policies on facturas bucket — SELECT, INSERT, UPDATE, DELETE

**Frontend** (`PurchaseHistory.tsx`):
- Replace direct `fin_gastos.delete()` with RPC call to `fn_cleanup_compra_dependencies`

## Tests
- [x] Administrador can delete a purchase that has a linked fin_gastos record
- [x] FK constraint no longer blocks compra deletion
- [x] Administrador can upload facturas in the purchase form
- [x] Gerencia purchase workflow still works (regression)
- [x] Pending expenses are properly cleaned up on purchase deletion
