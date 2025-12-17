-- ===========================================
-- SAMPLE FINANCIAL DATA - Escocia Hass
-- ===========================================
-- Add sample expenses and income for testing
-- Execute this AFTER running the main financial schema
-- ===========================================

-- First, verify that required catalogs exist
DO $$
DECLARE
    negocio_count INTEGER;
    region_count INTEGER;
    medio_pago_count INTEGER;
    categoria_gasto_count INTEGER;
    categoria_ingreso_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO negocio_count FROM fin_negocios;
    SELECT COUNT(*) INTO region_count FROM fin_regiones;
    SELECT COUNT(*) INTO medio_pago_count FROM fin_medios_pago;
    SELECT COUNT(*) INTO categoria_gasto_count FROM fin_categorias_gastos;
    SELECT COUNT(*) INTO categoria_ingreso_count FROM fin_categorias_ingresos;

    IF negocio_count = 0 OR region_count = 0 OR medio_pago_count = 0 THEN
        RAISE EXCEPTION 'Required catalogs are missing. Please ensure fin_negocios, fin_regiones, and fin_medios_pago have data.';
    END IF;

    RAISE NOTICE 'Catalog verification passed: % negocios, % regiones, % medios pago, % categorias gastos, % categorias ingresos',
        negocio_count, region_count, medio_pago_count, categoria_gasto_count, categoria_ingreso_count;
END $$;

-- ===========================================
-- SAMPLE EXPENSES
-- ===========================================

-- Insert sample expenses using a more robust approach
INSERT INTO public.fin_gastos (
    fecha,
    negocio_id,
    region_id,
    categoria_id,
    concepto_id,
    nombre,
    proveedor_id,
    valor,
    medio_pago_id,
    observaciones,
    estado,
    created_at,
    updated_at
)
SELECT
    CURRENT_DATE - INTERVAL '15 days',
    n.id,
    r.id,
    cat.id,
    con.id,
    'Fertilizante NPK 20-20-20',
    prov.id,
    2500000.00,
    mp.id,
    'Aplicación en lote principal',
    'Confirmado',
    NOW(),
    NOW()
FROM fin_negocios n
CROSS JOIN fin_regiones r
CROSS JOIN fin_categorias_gastos cat
CROSS JOIN fin_conceptos_gastos con
LEFT JOIN fin_proveedores prov ON prov.id IS NOT NULL
CROSS JOIN fin_medios_pago mp
WHERE n.nombre = 'Aguacate Hass'
  AND r.nombre = 'San Francisco'
  AND cat.nombre = 'Alimentos y Fertilizantes'
  AND con.nombre = 'Fertilizantes Químicos'
  AND con.categoria_id = cat.id
  AND mp.nombre = 'Cuenta Davivienda'
LIMIT 1;

-- More expenses
INSERT INTO public.fin_gastos (
    fecha,
    negocio_id,
    region_id,
    categoria_id,
    concepto_id,
    nombre,
    proveedor_id,
    valor,
    medio_pago_id,
    observaciones,
    estado,
    created_at,
    updated_at
)
SELECT
    CURRENT_DATE - INTERVAL '10 days',
    n.id,
    r.id,
    cat.id,
    con.id,
    'Fungicida preventivo temporada',
    prov.id,
    1800000.00,
    mp.id,
    'Aplicación preventiva',
    'Confirmado',
    NOW(),
    NOW()
FROM fin_negocios n
CROSS JOIN fin_regiones r
CROSS JOIN fin_categorias_gastos cat
CROSS JOIN fin_conceptos_gastos con
LEFT JOIN fin_proveedores prov ON prov.id IS NOT NULL
CROSS JOIN fin_medios_pago mp
WHERE n.nombre = 'Aguacate Hass'
  AND r.nombre = 'Supatá'
  AND cat.nombre = 'Control de Plagas'
  AND con.nombre = 'Fungicidas'
  AND con.categoria_id = cat.id
  AND mp.nombre = 'Efectivo'
LIMIT 1;

INSERT INTO public.fin_gastos (
    fecha,
    negocio_id,
    region_id,
    categoria_id,
    concepto_id,
    nombre,
    proveedor_id,
    valor,
    medio_pago_id,
    observaciones,
    estado,
    created_at,
    updated_at
)
SELECT
    CURRENT_DATE - INTERVAL '5 days',
    n.id,
    r.id,
    cat.id,
    con.id,
    'Pago jornales mantenimiento cercas',
    NULL,
    450000.00,
    mp.id,
    '5 jornales x 3 días',
    'Confirmado',
    NOW(),
    NOW()
FROM fin_negocios n
CROSS JOIN fin_regiones r
CROSS JOIN fin_categorias_gastos cat
CROSS JOIN fin_conceptos_gastos con
CROSS JOIN fin_medios_pago mp
WHERE n.nombre = 'Ganado'
  AND r.nombre = 'San Francisco'
  AND cat.nombre = 'Mano de Obra y Asistencia Técnica'
  AND con.nombre = 'Jornales'
  AND con.categoria_id = cat.id
  AND mp.nombre = 'Efectivo'
LIMIT 1;

-- ===========================================
-- SAMPLE INCOME
-- ===========================================

-- Insert sample income using robust joins
INSERT INTO public.fin_ingresos (
    fecha,
    negocio_id,
    region_id,
    categoria_id,
    nombre,
    comprador_id,
    valor,
    medio_pago_id,
    observaciones,
    created_at,
    updated_at
)
SELECT
    CURRENT_DATE - INTERVAL '20 days',
    n.id,
    r.id,
    ci.id,
    'Venta exportación contenedor 40ft',
    comp.id,
    15000000.00,
    mp.id,
    'Destino: Europa, calidad premium',
    NOW(),
    NOW()
FROM fin_negocios n
CROSS JOIN fin_regiones r
CROSS JOIN fin_categorias_ingresos ci
LEFT JOIN fin_compradores comp ON comp.id IS NOT NULL
CROSS JOIN fin_medios_pago mp
WHERE n.nombre = 'Aguacate Hass'
  AND r.nombre = 'San Francisco'
  AND ci.nombre = 'Exportación'
  AND ci.negocio_id = n.id
  AND mp.nombre = 'Cuenta Davivienda'
LIMIT 1;

INSERT INTO public.fin_ingresos (
    fecha,
    negocio_id,
    region_id,
    categoria_id,
    nombre,
    comprador_id,
    valor,
    medio_pago_id,
    observaciones,
    created_at,
    updated_at
)
SELECT
    CURRENT_DATE - INTERVAL '12 days',
    n.id,
    r.id,
    ci.id,
    'Venta ganado ceba',
    comp.id,
    3200000.00,
    mp.id,
    '5 cabezas, promedio 180kg',
    NOW(),
    NOW()
FROM fin_negocios n
CROSS JOIN fin_regiones r
CROSS JOIN fin_categorias_ingresos ci
LEFT JOIN fin_compradores comp ON comp.id IS NOT NULL
CROSS JOIN fin_medios_pago mp
WHERE n.nombre = 'Ganado'
  AND r.nombre = 'Supatá'
  AND ci.nombre = 'Ganado de Ceba'
  AND ci.negocio_id = n.id
  AND mp.nombre = 'Cuenta Davivienda'
LIMIT 1;

INSERT INTO public.fin_ingresos (
    fecha,
    negocio_id,
    region_id,
    categoria_id,
    nombre,
    comprador_id,
    valor,
    medio_pago_id,
    observaciones,
    created_at,
    updated_at
)
SELECT
    CURRENT_DATE - INTERVAL '8 days',
    n.id,
    r.id,
    ci.id,
    'Venta leche mensual',
    comp.id,
    2800000.00,
    mp.id,
    'Producción promedio diaria: 450 litros',
    NOW(),
    NOW()
FROM fin_negocios n
CROSS JOIN fin_regiones r
CROSS JOIN fin_categorias_ingresos ci
LEFT JOIN fin_compradores comp ON comp.id IS NOT NULL
CROSS JOIN fin_medios_pago mp
WHERE n.nombre = 'Hato Lechero'
  AND r.nombre = 'San Francisco'
  AND ci.nombre = 'Venta de Leche'
  AND ci.negocio_id = n.id
  AND mp.nombre = 'Cuenta Davivienda'
LIMIT 1;

-- ===========================================
-- VERIFICATION QUERIES
-- ===========================================

-- Check sample data was inserted
SELECT
    'Gastos' as tipo,
    COUNT(*) as registros,
    SUM(valor) as total_valor
FROM fin_gastos
WHERE created_at >= NOW() - INTERVAL '1 minute'
UNION ALL
SELECT
    'Ingresos' as tipo,
    COUNT(*) as registros,
    SUM(valor) as total_valor
FROM fin_ingresos
WHERE created_at >= NOW() - INTERVAL '1 minute';

-- Show current financial summary
SELECT
    'Resumen Actual' as titulo,
    (SELECT COUNT(*) FROM fin_gastos WHERE estado = 'Confirmado') as gastos_confirmados,
    (SELECT COUNT(*) FROM fin_gastos WHERE estado = 'Pendiente') as gastos_pendientes,
    (SELECT COUNT(*) FROM fin_ingresos) as ingresos_registrados,
    (SELECT COALESCE(SUM(valor), 0) FROM fin_gastos WHERE estado = 'Confirmado') as total_gastos,
    (SELECT COALESCE(SUM(valor), 0) FROM fin_ingresos) as total_ingresos,
    ((SELECT COALESCE(SUM(valor), 0) FROM fin_ingresos) -
     (SELECT COALESCE(SUM(valor), 0) FROM fin_gastos WHERE estado = 'Confirmado')) as flujo_neto;

COMMIT;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ SAMPLE FINANCIAL DATA INSERTED SUCCESSFULLY';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '📊 Sample data added:';
    RAISE NOTICE '   • 3 sample expenses (various categories)';
    RAISE NOTICE '   • 3 sample income entries (different businesses)';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '🎯 Now you can test:';
    RAISE NOTICE '   • Dashboard KPIs should show real data';
    RAISE NOTICE '   • Expense list should display sample entries';
    RAISE NOTICE '   • Income list should display sample entries';
    RAISE NOTICE '   • Charts should show trends';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
END $$;