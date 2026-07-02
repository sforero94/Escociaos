-- Migration 047: Drop the auto-create-pendiente-expense-from-purchase trigger
-- Date: 2026-07-02
-- Problem: Registering a purchase auto-creates a `Pendiente` fin_gastos row
--   (trigger from migration 038). Accounting was also separately creating the
--   real expense, causing double-counted expenses.
-- Fix: Decouple compras and fin_gastos entirely. Purchases no longer
--   auto-create an expense; accounting creates it manually.
-- Frontend impact: none. Verified no component in src/components/inventory/
--   or src/components/finanzas/ depends on the auto-created pendiente row or
--   filters/links fin_gastos by compra_id. The fn_cleanup_compra_dependencies
--   RPC (called from PurchaseHistory.tsx on purchase delete) and the
--   fin_gastos.compra_id FK (ON DELETE SET NULL) are left in place — they
--   become harmless no-ops for future purchases but still correctly clean up
--   any pre-existing trigger-created rows linked to a deleted compra.

DROP TRIGGER IF EXISTS trigger_compra_a_gasto ON compras;
DROP FUNCTION IF EXISTS crear_gasto_pendiente_de_compra();
