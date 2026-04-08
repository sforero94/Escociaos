-- Migration 037: Allow Administrador role to INSERT into fin_proveedores
-- Date: 2026-04-08
-- Purpose: Administrador users need to create new proveedores inline
-- from the "Registrar Compra" workflow (ProveedorDialog popup).

DROP POLICY IF EXISTS "fin_proveedores_admin_insert" ON fin_proveedores;
CREATE POLICY "fin_proveedores_admin_insert"
  ON fin_proveedores
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = auth.uid()
        AND usuarios.rol = 'Administrador'
    )
  );
