-- Migration 037: Allow Administrador role to read and create fin_proveedores
-- Date: 2026-04-08
-- Purpose: Administrador users need to see the proveedores list and create
-- new ones from the "Registrar Compra" workflow (ProveedorDialog popup).
-- Note: Production SELECT policy is Gerencia-only (es_usuario_gerencia),
-- so Administrador needs its own SELECT policy to populate the dropdown.

DROP POLICY IF EXISTS "fin_proveedores_admin_select" ON fin_proveedores;
CREATE POLICY "fin_proveedores_admin_select"
  ON fin_proveedores
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = auth.uid()
        AND usuarios.rol = 'Administrador'
    )
  );

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
