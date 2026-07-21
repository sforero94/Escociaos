-- 049_add_usuarios_modulos_acceso.sql
-- Per-user application module access (navigation/visibility only; NOT an RLS boundary).
-- Modules: aguacate | hato_lechero | ganado | finanzas.
-- Gerencia is granted all modules in application code and ignores this column.

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS modulos_acceso text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.usuarios.modulos_acceso IS
  'App modules this user may navigate to (aguacate, hato_lechero, ganado, finanzas). Gerencia bypasses this in app code. Visibility only — not enforced by RLS.';
