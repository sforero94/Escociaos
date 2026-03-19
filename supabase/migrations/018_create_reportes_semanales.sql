-- Migration 018: Create reportes_semanales table and storage bucket
-- Tabla de metadatos para reportes semanales generados

-- ============================================================================
-- TABLA: reportes_semanales
-- ============================================================================

CREATE TABLE IF NOT EXISTS reportes_semanales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  numero_semana INT NOT NULL,
  ano INT NOT NULL,
  generado_por UUID NOT NULL REFERENCES auth.users(id),
  url_storage TEXT,
  datos_entrada JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- No generar dos reportes para la misma semana
  CONSTRAINT uq_reporte_semana UNIQUE (ano, numero_semana)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_reportes_semanales_fecha
  ON reportes_semanales(fecha_inicio, fecha_fin);
CREATE INDEX IF NOT EXISTS idx_reportes_semanales_semana
  ON reportes_semanales(ano, numero_semana);

-- Trigger para updated_at (no aplica aquí, reportes son inmutables)

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE reportes_semanales ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first (CREATE POLICY is NOT idempotent)
DROP POLICY IF EXISTS "Authenticated users can view reports" ON reportes_semanales;
DROP POLICY IF EXISTS "Authenticated users can create reports" ON reportes_semanales;
DROP POLICY IF EXISTS "Users can update own reports" ON reportes_semanales;
DROP POLICY IF EXISTS "Users can delete own reports" ON reportes_semanales;

-- Todos los usuarios autenticados pueden ver reportes
CREATE POLICY "Authenticated users can view reports"
  ON reportes_semanales FOR SELECT
  TO authenticated
  USING (true);

-- Todos los usuarios autenticados pueden crear reportes
CREATE POLICY "Authenticated users can create reports"
  ON reportes_semanales FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow upsert: USING (true) lets the UPDATE read the existing row,
-- WITH CHECK (true) allows any authenticated user to update
CREATE POLICY "Users can update own reports"
  ON reportes_semanales FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Solo el creador puede eliminar su reporte
CREATE POLICY "Users can delete own reports"
  ON reportes_semanales FOR DELETE
  TO authenticated
  USING (generado_por = auth.uid());

-- ============================================================================
-- STORAGE BUCKET (ejecutar en Supabase Dashboard o via API)
-- ============================================================================
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('reportes-semanales', 'reportes-semanales', false);

-- Storage policies:
-- CREATE POLICY "Authenticated users can upload reports"
--   ON storage.objects FOR INSERT
--   TO authenticated
--   WITH CHECK (bucket_id = 'reportes-semanales');

-- CREATE POLICY "Authenticated users can read reports"
--   ON storage.objects FOR SELECT
--   TO authenticated
--   USING (bucket_id = 'reportes-semanales');
