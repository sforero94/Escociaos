-- Migration 015: Create produccion table for harvest/production records
-- Supports both lote-level (sublote_id = NULL) and sublote-level records

-- Create produccion table
CREATE TABLE IF NOT EXISTS produccion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Location (lote required, sublote optional)
  lote_id UUID NOT NULL REFERENCES lotes(id) ON DELETE RESTRICT,
  sublote_id UUID REFERENCES sublotes(id) ON DELETE RESTRICT,

  -- Harvest identification
  ano INTEGER NOT NULL CHECK (ano >= 2020 AND ano <= 2050),
  cosecha_tipo TEXT NOT NULL CHECK (cosecha_tipo IN ('Principal', 'Traviesa')),

  -- Production data
  kg_totales NUMERIC(12, 2) NOT NULL CHECK (kg_totales >= 0),
  arboles_registrados INTEGER NOT NULL CHECK (arboles_registrados > 0),

  -- Calculated field (generated column for performance)
  kg_por_arbol NUMERIC(8, 4) GENERATED ALWAYS AS (
    CASE WHEN arboles_registrados > 0
    THEN kg_totales / arboles_registrados
    ELSE 0 END
  ) STORED,

  -- Metadata
  observaciones TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Unique constraint: one record per lote/sublote per harvest
  CONSTRAINT unique_produccion_record UNIQUE (lote_id, sublote_id, ano, cosecha_tipo)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_produccion_lote_id ON produccion(lote_id);
CREATE INDEX IF NOT EXISTS idx_produccion_sublote_id ON produccion(sublote_id) WHERE sublote_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_produccion_ano ON produccion(ano);
CREATE INDEX IF NOT EXISTS idx_produccion_cosecha_tipo ON produccion(cosecha_tipo);
CREATE INDEX IF NOT EXISTS idx_produccion_ano_tipo ON produccion(ano, cosecha_tipo);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_produccion_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_produccion_updated_at ON produccion;
CREATE TRIGGER trigger_produccion_updated_at
  BEFORE UPDATE ON produccion
  FOR EACH ROW
  EXECUTE FUNCTION update_produccion_updated_at();

-- Enable Row Level Security
ALTER TABLE produccion ENABLE ROW LEVEL SECURITY;

-- RLS Policies for authenticated users
CREATE POLICY "Allow authenticated read access on produccion"
  ON produccion FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated insert on produccion"
  ON produccion FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update on produccion"
  ON produccion FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated delete on produccion"
  ON produccion FOR DELETE
  TO authenticated
  USING (true);

-- Table and column comments
COMMENT ON TABLE produccion IS 'Historical harvest/production records for lotes and sublotes';
COMMENT ON COLUMN produccion.sublote_id IS 'NULL for lote-level records, set for sublote-level granularity';
COMMENT ON COLUMN produccion.arboles_registrados IS 'Snapshot of tree count at harvest time for historical accuracy';
COMMENT ON COLUMN produccion.kg_por_arbol IS 'Calculated yield per tree (generated column)';
