-- Migration 048: Create pest_umbral_economico reference table
-- Part of the monitoring prioritization feature (see docs/PLAN_PRIORIZACION_MONITOREO.md, stage P0b).
--
-- Small, hand-seeded table of REAL economic action thresholds provided by the farm
-- owner, sourced from Cartama (a named Colombian avocado industry source). This is
-- NOT derived from any data pipeline -- it is 10 static rows.
--
-- Pooling: the 4 "Ácaro complex" catalog entries (Ácaro, Ácaro Cristalino,
-- Huevos de acaro, H-acaro  Cristalino [sic, double space in the real catalog name])
-- share grupo_key = 'acaro_complex' so ranking logic can pool their incidence and
-- gate all four at the same 33% threshold. Antracnosis fruto/ramas and Phytophtora
-- (catalog spelling lacks the 2nd "h") are tracked independently -- grupo_key NULL.

CREATE TABLE IF NOT EXISTS pest_umbral_economico (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pest_id      UUID REFERENCES plagas_enfermedades_catalogo(id),
  grupo_key    TEXT NULL,
  umbral_pct   NUMERIC NOT NULL,
  source_label TEXT NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pest_umbral_economico_pest_id ON pest_umbral_economico(pest_id);
CREATE INDEX idx_pest_umbral_economico_grupo_key ON pest_umbral_economico(grupo_key);

CREATE TRIGGER update_pest_umbral_economico_updated_at
  BEFORE UPDATE ON pest_umbral_economico
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS: authenticated users can read; writes are hand-managed via migration (no INSERT/UPDATE/DELETE policy)
ALTER TABLE pest_umbral_economico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pest_umbral_economico_select_authenticated"
  ON pest_umbral_economico FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- Seed data: 10 rows, all source_label = 'Cartama'
-- ============================================================================

INSERT INTO pest_umbral_economico (pest_id, grupo_key, umbral_pct, source_label) VALUES
  ('3fa8a62b-2b5d-40c3-8f19-47d6a4eaaf26', NULL,            1,  'Cartama'), -- Thrips
  ('af26aa68-cd7d-4467-8776-0dcf26d776b3', 'acaro_complex', 33, 'Cartama'), -- Ácaro
  ('440335b4-b404-4db7-9697-eb05dbdd3ddd', 'acaro_complex', 33, 'Cartama'), -- Ácaro Cristalino
  ('4787e6cf-3c83-457e-b430-24e7267e16f1', 'acaro_complex', 33, 'Cartama'), -- Huevos de acaro
  ('7e0ea4ba-0fad-423c-9528-9c3b5342c229', 'acaro_complex', 33, 'Cartama'), -- H-acaro  Cristalino (double space, real catalog spelling)
  ('2f3ea4e9-b3d8-413f-91ec-d2499923470b', NULL,            26, 'Cartama'), -- Monalonion
  ('816e276a-bf1d-4720-9647-1c1cf3bade4a', NULL,            36, 'Cartama'), -- Cucarron marceño
  ('650cd749-e533-48a3-8c9c-f3170e6cc516', NULL,            10, 'Cartama'), -- Phytophtora (catalog spelling lacks 2nd "h")
  ('ae24054d-22e2-4472-9b84-cd6d543e3aa8', NULL,            10, 'Cartama'), -- Antracnosis fruto (independent, not pooled with ramas)
  ('8882ea84-676c-4579-9618-dd47d6b44908', NULL,            10, 'Cartama'); -- Antracnosis ramas (independent, not pooled with fruto)
