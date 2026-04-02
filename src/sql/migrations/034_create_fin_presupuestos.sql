-- Migration 034: Create fin_presupuestos table for budget tracking
-- One budget row per year + negocio + concepto

CREATE TABLE IF NOT EXISTS fin_presupuestos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anio INTEGER NOT NULL,
  negocio_id UUID NOT NULL REFERENCES fin_negocios(id),
  categoria_id UUID NOT NULL REFERENCES fin_categorias_gastos(id),
  concepto_id UUID NOT NULL REFERENCES fin_conceptos_gastos(id),
  monto_anual NUMERIC(15,2) NOT NULL DEFAULT 0,
  is_principal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  CONSTRAINT fin_presupuestos_unique UNIQUE (anio, negocio_id, concepto_id)
);

CREATE INDEX idx_fin_presupuestos_anio_negocio ON fin_presupuestos(anio, negocio_id);
CREATE INDEX idx_fin_presupuestos_concepto ON fin_presupuestos(concepto_id);

-- Trigger for updated_at (reuse existing function)
CREATE TRIGGER update_fin_presupuestos_updated_at
  BEFORE UPDATE ON fin_presupuestos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS (Gerencia only, same pattern as fin_transacciones_ganado)
ALTER TABLE fin_presupuestos ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_presupuestos_select ON fin_presupuestos FOR SELECT
  USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'Gerencia'::rol_usuario));
CREATE POLICY fin_presupuestos_insert ON fin_presupuestos FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'Gerencia'::rol_usuario));
CREATE POLICY fin_presupuestos_update ON fin_presupuestos FOR UPDATE
  USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'Gerencia'::rol_usuario));
CREATE POLICY fin_presupuestos_delete ON fin_presupuestos FOR DELETE
  USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'Gerencia'::rol_usuario));
