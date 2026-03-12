-- 026_telegram_bot_tables.sql
-- Telegram bot integration tables for Escocia OS
-- Enables field workers to report monitoring data, log labor, and receive
-- notifications via Telegram. The bot runs as a Supabase Edge Function in
-- webhook mode using grammy. Only the service_role key accesses these tables,
-- so RLS is enabled but no user-facing policies are created.

-- ============================================================================
-- TABLAS
-- ============================================================================

-- Links Telegram accounts to farm employees/contractors
CREATE TABLE IF NOT EXISTS telegram_usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id bigint UNIQUE,              -- NULL until worker links via /start <code>
  telegram_username text,
  usuario_id uuid REFERENCES auth.users(id),
  empleado_id uuid REFERENCES empleados(id),
  contratista_id uuid REFERENCES terceros(id),
  nombre_display text NOT NULL,
  rol_bot text NOT NULL DEFAULT 'campo' CHECK (rol_bot IN ('campo', 'admin', 'gerencia')),
  modulos_permitidos text[] DEFAULT '{labores}',
  codigo_vinculacion text,
  codigo_expira_at timestamptz,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Audit log for all bot messages (inbound and outbound)
CREATE TABLE IF NOT EXISTS telegram_mensajes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_usuario_id uuid REFERENCES telegram_usuarios(id),
  telegram_id bigint NOT NULL,
  direccion text NOT NULL CHECK (direccion IN ('entrante', 'saliente')),
  tipo_mensaje text NOT NULL,
  contenido jsonb NOT NULL,
  flujo text,
  created_at timestamptz DEFAULT now()
);

-- grammy conversation session persistence for webhook mode
CREATE TABLE IF NOT EXISTS telegram_sessions (
  key text PRIMARY KEY,
  session jsonb NOT NULL
);

-- ============================================================================
-- ALTER: monitoreos
-- ============================================================================

-- Photo URL for monitoring images uploaded via Telegram
ALTER TABLE monitoreos ADD COLUMN IF NOT EXISTS foto_url text;

-- ============================================================================
-- INDICES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_telegram_usuarios_telegram_id
  ON telegram_usuarios(telegram_id);

CREATE INDEX IF NOT EXISTS idx_telegram_usuarios_codigo_vinculacion
  ON telegram_usuarios(codigo_vinculacion)
  WHERE codigo_vinculacion IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_telegram_mensajes_usuario_id
  ON telegram_mensajes(telegram_usuario_id);

CREATE INDEX IF NOT EXISTS idx_telegram_mensajes_created_at
  ON telegram_mensajes(created_at);

-- ============================================================================
-- RLS (enabled, no user-facing policies — service_role only)
-- ============================================================================

ALTER TABLE telegram_usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_mensajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_sessions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TRIGGER: auto-update updated_at on telegram_usuarios
-- ============================================================================

DROP TRIGGER IF EXISTS update_telegram_usuarios_updated_at ON telegram_usuarios;
CREATE TRIGGER update_telegram_usuarios_updated_at
  BEFORE UPDATE ON telegram_usuarios
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- STORAGE: bucket for monitoring photos from Telegram
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('monitoreo-fotos', 'monitoreo-fotos', false)
ON CONFLICT (id) DO NOTHING;
