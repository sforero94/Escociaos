-- 027_telegram_usuarios_rls.sql
-- RLS policy allowing Gerencia web users to manage telegram_usuarios
-- Enables UI-based telegram bot user management

CREATE POLICY "Gerencia puede gestionar telegram_usuarios"
  ON telegram_usuarios
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = auth.uid()
      AND usuarios.rol = 'Gerencia'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = auth.uid()
      AND usuarios.rol = 'Gerencia'
    )
  );
