-- Migration 031: Add 'monitor' role to telegram_usuarios.rol_bot CHECK constraint
-- The usuarios table does not have a DB-level CHECK on rol (enforced at app level),
-- but telegram_usuarios.rol_bot does have a CHECK constraint.

-- Drop and recreate the CHECK constraint to include 'monitor'
ALTER TABLE telegram_usuarios
  DROP CONSTRAINT IF EXISTS telegram_usuarios_rol_bot_check;

ALTER TABLE telegram_usuarios
  ADD CONSTRAINT telegram_usuarios_rol_bot_check
  CHECK (rol_bot IN ('campo', 'admin', 'gerencia', 'monitor'));
