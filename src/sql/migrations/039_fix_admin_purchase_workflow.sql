-- Migration 039: Fix entire purchase workflow for Administrador role
-- Date: 2026-04-08
-- Fixes 3 independent bugs blocking Administrador users:
--   1. Cannot delete purchases (FK constraint because linked fin_gastos can't be deleted due to RLS)
--   2. Cannot upload/view invoices (facturas storage policies are Gerencia-only)
--   3. No FK cascade safety net (fin_gastos.compra_id blocks compra deletion)

-- ============================================================================
-- FIX 1: SECURITY DEFINER function to clean up compra dependencies
-- ============================================================================
-- The purchase delete flow needs to delete linked fin_gastos records,
-- but Administrador users are blocked by Gerencia-only RLS on fin_gastos.
-- This function runs as postgres (bypasses RLS) to handle the cleanup.

CREATE OR REPLACE FUNCTION fn_cleanup_compra_dependencies(p_compra_id UUID)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    -- Delete linked pending expense(s)
    DELETE FROM fin_gastos WHERE compra_id = p_compra_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION fn_cleanup_compra_dependencies(UUID) TO authenticated;

COMMENT ON FUNCTION fn_cleanup_compra_dependencies(UUID) IS
  'SECURITY DEFINER: deletes fin_gastos records linked to a compra. '
  'Called before deleting a compra to avoid FK violations when the caller '
  'does not have direct DELETE access to fin_gastos (e.g. Administrador role).';


-- ============================================================================
-- FIX 2: Alter FK to ON DELETE SET NULL (safety net)
-- ============================================================================
-- If the cleanup function isn't called (or fails), the compra delete should
-- not be blocked. Setting compra_id to NULL preserves the gasto record
-- while removing the FK reference.

ALTER TABLE fin_gastos
  DROP CONSTRAINT IF EXISTS fin_gastos_compra_fkey;

ALTER TABLE fin_gastos
  ADD CONSTRAINT fin_gastos_compra_fkey
  FOREIGN KEY (compra_id) REFERENCES compras(id) ON DELETE SET NULL;


-- ============================================================================
-- FIX 3: Administrador storage policies for facturas bucket
-- ============================================================================
-- Currently only Gerencia can access the facturas bucket.
-- Administrador needs full access for the purchase workflow.

-- Upload
DROP POLICY IF EXISTS "Administrador puede subir facturas" ON storage.objects;
CREATE POLICY "Administrador puede subir facturas"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'facturas' AND
  EXISTS (
    SELECT 1 FROM usuarios
    WHERE usuarios.id = auth.uid()
    AND usuarios.rol = 'Administrador'
  )
);

-- Read (needed for signed URLs)
DROP POLICY IF EXISTS "Administrador puede leer facturas" ON storage.objects;
CREATE POLICY "Administrador puede leer facturas"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'facturas' AND
  EXISTS (
    SELECT 1 FROM usuarios
    WHERE usuarios.id = auth.uid()
    AND usuarios.rol = 'Administrador'
  )
);

-- Delete
DROP POLICY IF EXISTS "Administrador puede eliminar facturas" ON storage.objects;
CREATE POLICY "Administrador puede eliminar facturas"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'facturas' AND
  EXISTS (
    SELECT 1 FROM usuarios
    WHERE usuarios.id = auth.uid()
    AND usuarios.rol = 'Administrador'
  )
);

-- Update
DROP POLICY IF EXISTS "Administrador puede actualizar facturas" ON storage.objects;
CREATE POLICY "Administrador puede actualizar facturas"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'facturas' AND
  EXISTS (
    SELECT 1 FROM usuarios
    WHERE usuarios.id = auth.uid()
    AND usuarios.rol = 'Administrador'
  )
);
