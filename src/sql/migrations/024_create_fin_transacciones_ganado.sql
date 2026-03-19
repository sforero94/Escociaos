-- Migration 023: Create fin_transacciones_ganado table
-- Tracks cattle buy/sell transactions for the Ganado dashboard
-- Idempotent: safe to re-run

CREATE TABLE IF NOT EXISTS fin_transacciones_ganado (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('compra', 'venta')),
  finca TEXT,
  cliente_proveedor TEXT,
  cantidad_cabezas INTEGER NOT NULL CHECK (cantidad_cabezas > 0),
  kilos_pagados NUMERIC,
  precio_kilo NUMERIC,
  valor_total NUMERIC(15,2) NOT NULL CHECK (valor_total > 0),
  observaciones TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Indexes (IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_fin_transacciones_ganado_fecha ON fin_transacciones_ganado(fecha);
CREATE INDEX IF NOT EXISTS idx_fin_transacciones_ganado_tipo ON fin_transacciones_ganado(tipo);
CREATE INDEX IF NOT EXISTS idx_fin_transacciones_ganado_finca ON fin_transacciones_ganado(finca);

-- RLS
ALTER TABLE fin_transacciones_ganado ENABLE ROW LEVEL SECURITY;

-- Policies (drop + recreate for idempotency)
DROP POLICY IF EXISTS "fin_transacciones_ganado_select_gerencia" ON fin_transacciones_ganado;
CREATE POLICY "fin_transacciones_ganado_select_gerencia"
  ON fin_transacciones_ganado
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.id = auth.uid()
      AND u.rol = 'Gerencia'
    )
  );

DROP POLICY IF EXISTS "fin_transacciones_ganado_insert_gerencia" ON fin_transacciones_ganado;
CREATE POLICY "fin_transacciones_ganado_insert_gerencia"
  ON fin_transacciones_ganado
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.id = auth.uid()
      AND u.rol = 'Gerencia'
    )
  );

DROP POLICY IF EXISTS "fin_transacciones_ganado_update_gerencia" ON fin_transacciones_ganado;
CREATE POLICY "fin_transacciones_ganado_update_gerencia"
  ON fin_transacciones_ganado
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.id = auth.uid()
      AND u.rol = 'Gerencia'
    )
  );

DROP POLICY IF EXISTS "fin_transacciones_ganado_delete_gerencia" ON fin_transacciones_ganado;
CREATE POLICY "fin_transacciones_ganado_delete_gerencia"
  ON fin_transacciones_ganado
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.id = auth.uid()
      AND u.rol = 'Gerencia'
    )
  );

-- Trigger for updated_at (drop + recreate for idempotency)
DROP TRIGGER IF EXISTS update_fin_transacciones_ganado_updated_at ON fin_transacciones_ganado;
CREATE TRIGGER update_fin_transacciones_ganado_updated_at
  BEFORE UPDATE ON fin_transacciones_ganado
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
