-- ===========================================
-- FINANCIAL MODULE TABLES - ESCOCIA HASS
-- ===========================================
-- Created: 2025-12-16
-- Purpose: Create all financial tables for the module
-- ===========================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===========================================
-- CATALOG TABLES
-- ===========================================

-- Business Units
CREATE TABLE IF NOT EXISTS fin_negocios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre TEXT NOT NULL UNIQUE,
    descripcion TEXT,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Regions
CREATE TABLE IF NOT EXISTS fin_regiones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre TEXT NOT NULL UNIQUE,
    descripcion TEXT,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payment Methods
CREATE TABLE IF NOT EXISTS fin_medios_pago (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre TEXT NOT NULL UNIQUE,
    descripcion TEXT,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Expense Categories
CREATE TABLE IF NOT EXISTS fin_categorias_gastos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre TEXT NOT NULL UNIQUE,
    descripcion TEXT,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Expense Concepts (by category)
CREATE TABLE IF NOT EXISTS fin_conceptos_gastos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    categoria_id UUID NOT NULL REFERENCES fin_categorias_gastos(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(categoria_id, nombre)
);

-- Suppliers
CREATE TABLE IF NOT EXISTS fin_proveedores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre TEXT NOT NULL UNIQUE,
    nit TEXT,
    telefono TEXT,
    email TEXT,
    direccion TEXT,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Income Categories (by business)
CREATE TABLE IF NOT EXISTS fin_categorias_ingresos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    negocio_id UUID NOT NULL REFERENCES fin_negocios(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(negocio_id, nombre)
);

-- Buyers
CREATE TABLE IF NOT EXISTS fin_compradores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre TEXT NOT NULL UNIQUE,
    nit TEXT,
    telefono TEXT,
    email TEXT,
    direccion TEXT,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- TRANSACTION TABLES
-- ===========================================

-- Expenses
CREATE TABLE IF NOT EXISTS fin_gastos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fecha DATE NOT NULL,
    negocio_id UUID NOT NULL REFERENCES fin_negocios(id),
    region_id UUID NOT NULL REFERENCES fin_regiones(id),
    categoria_id UUID NOT NULL REFERENCES fin_categorias_gastos(id),
    concepto_id UUID NOT NULL REFERENCES fin_conceptos_gastos(id),
    nombre TEXT NOT NULL,
    proveedor_id UUID REFERENCES fin_proveedores(id),
    valor NUMERIC(15,2) NOT NULL CHECK (valor > 0),
    medio_pago_id UUID NOT NULL REFERENCES fin_medios_pago(id),
    observaciones TEXT,
    estado TEXT NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente', 'Confirmado')),
    compra_id UUID, -- Reference to inventory purchase if auto-generated
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id)
);

-- Income
CREATE TABLE IF NOT EXISTS fin_ingresos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fecha DATE NOT NULL,
    negocio_id UUID NOT NULL REFERENCES fin_negocios(id),
    region_id UUID NOT NULL REFERENCES fin_regiones(id),
    categoria_id UUID NOT NULL REFERENCES fin_categorias_ingresos(id),
    nombre TEXT NOT NULL,
    comprador_id UUID REFERENCES fin_compradores(id),
    valor NUMERIC(15,2) NOT NULL CHECK (valor > 0),
    medio_pago_id UUID NOT NULL REFERENCES fin_medios_pago(id),
    observaciones TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id)
);

-- ===========================================
-- INDEXES
-- ===========================================

-- Expenses indexes
CREATE INDEX IF NOT EXISTS idx_fin_gastos_fecha ON fin_gastos(fecha);
CREATE INDEX IF NOT EXISTS idx_fin_gastos_negocio ON fin_gastos(negocio_id);
CREATE INDEX IF NOT EXISTS idx_fin_gastos_region ON fin_gastos(region_id);
CREATE INDEX IF NOT EXISTS idx_fin_gastos_categoria ON fin_gastos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_fin_gastos_concepto ON fin_gastos(concepto_id);
CREATE INDEX IF NOT EXISTS idx_fin_gastos_proveedor ON fin_gastos(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_fin_gastos_estado ON fin_gastos(estado);
CREATE INDEX IF NOT EXISTS idx_fin_gastos_compra ON fin_gastos(compra_id);

-- Income indexes
CREATE INDEX IF NOT EXISTS idx_fin_ingresos_fecha ON fin_ingresos(fecha);
CREATE INDEX IF NOT EXISTS idx_fin_ingresos_negocio ON fin_ingresos(negocio_id);
CREATE INDEX IF NOT EXISTS idx_fin_ingresos_region ON fin_ingresos(region_id);
CREATE INDEX IF NOT EXISTS idx_fin_ingresos_categoria ON fin_ingresos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_fin_ingresos_comprador ON fin_ingresos(comprador_id);

-- ===========================================
-- VIEWS
-- ===========================================

-- View for pending expenses from purchases
CREATE OR REPLACE VIEW v_gastos_pendientes_compras AS
SELECT
    g.id,
    g.fecha,
    g.nombre,
    g.valor,
    g.estado,
    g.compra_id,
    n.nombre as negocio_nombre,
    r.nombre as region_nombre,
    c.nombre as categoria_nombre,
    co.nombre as concepto_nombre,
    p.nombre as proveedor_nombre,
    mp.nombre as medio_pago_nombre,
    g.observaciones,
    g.created_at
FROM fin_gastos g
LEFT JOIN fin_negocios n ON g.negocio_id = n.id
LEFT JOIN fin_regiones r ON g.region_id = r.id
LEFT JOIN fin_categorias_gastos c ON g.categoria_id = c.id
LEFT JOIN fin_conceptos_gastos co ON g.concepto_id = co.id
LEFT JOIN fin_proveedores p ON g.proveedor_id = p.id
LEFT JOIN fin_medios_pago mp ON g.medio_pago_id = mp.id
WHERE g.estado = 'Pendiente' AND g.compra_id IS NOT NULL;

-- ===========================================
-- TRIGGERS
-- ===========================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers to all financial tables
CREATE TRIGGER update_fin_negocios_updated_at BEFORE UPDATE ON fin_negocios FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_fin_regiones_updated_at BEFORE UPDATE ON fin_regiones FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_fin_medios_pago_updated_at BEFORE UPDATE ON fin_medios_pago FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_fin_categorias_gastos_updated_at BEFORE UPDATE ON fin_categorias_gastos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_fin_conceptos_gastos_updated_at BEFORE UPDATE ON fin_conceptos_gastos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_fin_proveedores_updated_at BEFORE UPDATE ON fin_proveedores FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_fin_categorias_ingresos_updated_at BEFORE UPDATE ON fin_categorias_ingresos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_fin_compradores_updated_at BEFORE UPDATE ON fin_compradores FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_fin_gastos_updated_at BEFORE UPDATE ON fin_gastos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_fin_ingresos_updated_at BEFORE UPDATE ON fin_ingresos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===========================================
-- ROW LEVEL SECURITY (RLS)
-- ===========================================

-- Enable RLS on all tables
ALTER TABLE fin_negocios ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_regiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_medios_pago ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_categorias_gastos ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_conceptos_gastos ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_categorias_ingresos ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_compradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_gastos ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_ingresos ENABLE ROW LEVEL SECURITY;

-- Policies: Allow authenticated users to read catalogs
CREATE POLICY "fin_negocios_read" ON fin_negocios FOR SELECT TO authenticated USING (true);
CREATE POLICY "fin_regiones_read" ON fin_regiones FOR SELECT TO authenticated USING (true);
CREATE POLICY "fin_medios_pago_read" ON fin_medios_pago FOR SELECT TO authenticated USING (true);
CREATE POLICY "fin_categorias_gastos_read" ON fin_categorias_gastos FOR SELECT TO authenticated USING (true);
CREATE POLICY "fin_conceptos_gastos_read" ON fin_conceptos_gastos FOR SELECT TO authenticated USING (true);
CREATE POLICY "fin_proveedores_read" ON fin_proveedores FOR SELECT TO authenticated USING (true);
CREATE POLICY "fin_categorias_ingresos_read" ON fin_categorias_ingresos FOR SELECT TO authenticated USING (true);
CREATE POLICY "fin_compradores_read" ON fin_compradores FOR SELECT TO authenticated USING (true);

-- Policies: Allow Gerencia role to manage transactions
CREATE POLICY "fin_gastos_read" ON fin_gastos FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = auth.uid() AND usuarios.rol = 'Gerencia')
);
CREATE POLICY "fin_gastos_write" ON fin_gastos FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = auth.uid() AND usuarios.rol = 'Gerencia')
) WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = auth.uid() AND usuarios.rol = 'Gerencia')
);

CREATE POLICY "fin_ingresos_read" ON fin_ingresos FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = auth.uid() AND usuarios.rol = 'Gerencia')
);
CREATE POLICY "fin_ingresos_write" ON fin_ingresos FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = auth.uid() AND usuarios.rol = 'Gerencia')
) WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = auth.uid() AND usuarios.rol = 'Gerencia')
);

-- ===========================================
-- SUCCESS MESSAGE
-- ===========================================

DO $$
BEGIN
    RAISE NOTICE 'Financial module tables created successfully!';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Run seed_finanzas_catalogos.sql to populate catalogs';
    RAISE NOTICE '2. Run trigger_compra_a_gasto.sql to set up purchase-to-expense integration';
END $$;