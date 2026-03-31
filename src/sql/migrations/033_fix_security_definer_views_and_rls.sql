-- Migration 033: Fix SECURITY DEFINER views and enable RLS on missing tables
-- Date: 2026-03-31
-- Fixes 14 Supabase security advisor errors:
--   - 5 views with SECURITY DEFINER (bypasses RLS)
--   - 9 tables without RLS enabled

-- ============================================================================
-- PART 1: RECREATE VIEWS WITH SECURITY INVOKER
-- ============================================================================
-- PostgreSQL 15+ defaults to security_invoker = false (SECURITY DEFINER behavior).
-- We must explicitly set security_invoker = true so views respect the querying
-- user's RLS policies instead of the view owner's.

-- 1a. Drop v_resumen_financiero_mes first (depends on the other two finance views)
DROP VIEW IF EXISTS v_resumen_financiero_mes;

-- 1b. Drop and recreate v_gastos_completos
DROP VIEW IF EXISTS v_gastos_completos;

CREATE VIEW v_gastos_completos AS
SELECT g.id,
    g.fecha,
    n.nombre AS negocio,
    r.nombre AS region,
    cg.nombre AS categoria,
    co.nombre AS concepto,
    g.nombre AS descripcion,
    p.nombre AS proveedor,
    g.valor,
    mp.nombre AS medio_pago,
    g.observaciones,
    g.estado,
    g.compra_id,
    g.created_at,
    u.nombre_completo AS creado_por
FROM fin_gastos g
    LEFT JOIN fin_negocios n ON g.negocio_id = n.id
    LEFT JOIN fin_regiones r ON g.region_id = r.id
    LEFT JOIN fin_categorias_gastos cg ON g.categoria_id = cg.id
    LEFT JOIN fin_conceptos_gastos co ON g.concepto_id = co.id
    LEFT JOIN fin_proveedores p ON g.proveedor_id = p.id
    LEFT JOIN fin_medios_pago mp ON g.medio_pago_id = mp.id
    LEFT JOIN usuarios u ON g.created_by = u.id;

ALTER VIEW v_gastos_completos SET (security_invoker = true);

-- 1c. Drop and recreate v_ingresos_completos
DROP VIEW IF EXISTS v_ingresos_completos;

CREATE VIEW v_ingresos_completos AS
SELECT i.id,
    i.fecha,
    n.nombre AS negocio,
    r.nombre AS region,
    ci.nombre AS categoria,
    i.nombre AS descripcion,
    c.nombre AS comprador,
    i.valor,
    mp.nombre AS medio_pago,
    i.observaciones,
    i.created_at,
    u.nombre_completo AS creado_por
FROM fin_ingresos i
    LEFT JOIN fin_negocios n ON i.negocio_id = n.id
    LEFT JOIN fin_regiones r ON i.region_id = r.id
    LEFT JOIN fin_categorias_ingresos ci ON i.categoria_id = ci.id
    LEFT JOIN fin_compradores c ON i.comprador_id = c.id
    LEFT JOIN fin_medios_pago mp ON i.medio_pago_id = mp.id
    LEFT JOIN usuarios u ON i.created_by = u.id;

ALTER VIEW v_ingresos_completos SET (security_invoker = true);

-- 1d. Recreate v_resumen_financiero_mes (depends on the two views above)
CREATE VIEW v_resumen_financiero_mes AS
SELECT date_trunc('month', fecha::timestamp with time zone) AS mes,
    negocio,
    sum(CASE WHEN tipo = 'Ingreso' THEN valor ELSE 0::numeric END) AS total_ingresos,
    sum(CASE WHEN tipo = 'Gasto' THEN valor ELSE 0::numeric END) AS total_gastos,
    sum(CASE WHEN tipo = 'Ingreso' THEN valor ELSE -valor END) AS flujo_neto
FROM (
    SELECT fecha, negocio, valor, 'Ingreso'::text AS tipo
    FROM v_ingresos_completos
    UNION ALL
    SELECT fecha, negocio, valor, 'Gasto'::text AS tipo
    FROM v_gastos_completos
    WHERE estado = 'Confirmado'
) financiero
GROUP BY date_trunc('month', fecha::timestamp with time zone), negocio
ORDER BY date_trunc('month', fecha::timestamp with time zone) DESC, negocio;

ALTER VIEW v_resumen_financiero_mes SET (security_invoker = true);

-- 1e. Drop and recreate vista_resumen_verificaciones
DROP VIEW IF EXISTS vista_resumen_verificaciones;

CREATE VIEW vista_resumen_verificaciones AS
SELECT v.id,
    v.fecha_inicio,
    v.fecha_fin,
    v.estado,
    v.usuario_verificador,
    v.revisada_por,
    v.fecha_revision,
    v.observaciones_generales,
    v.motivo_rechazo,
    count(vd.id) AS total_productos,
    count(vd.id) FILTER (WHERE vd.contado = true) AS productos_contados,
    count(vd.id) FILTER (WHERE vd.estado_diferencia = 'OK') AS productos_ok,
    count(vd.id) FILTER (WHERE vd.estado_diferencia = ANY (ARRAY['Sobrante', 'Faltante'])) AS productos_diferencia,
    COALESCE(sum(abs(vd.valor_diferencia)), 0::numeric) AS valor_total_diferencias,
    CASE
        WHEN count(vd.id) > 0 THEN round((count(vd.id) FILTER (WHERE vd.contado = true)::numeric / count(vd.id)::numeric) * 100::numeric, 2)
        ELSE 0::numeric
    END AS porcentaje_completado,
    count(vd.id) FILTER (WHERE vd.aprobado = true) AS productos_aprobados,
    v.created_at,
    v.updated_at
FROM verificaciones_inventario v
    LEFT JOIN verificaciones_detalle vd ON v.id = vd.verificacion_id
GROUP BY v.id, v.fecha_inicio, v.fecha_fin, v.estado, v.usuario_verificador,
    v.revisada_por, v.fecha_revision, v.observaciones_generales, v.motivo_rechazo,
    v.created_at, v.updated_at;

ALTER VIEW vista_resumen_verificaciones SET (security_invoker = true);

-- 1f. Drop and recreate vista_tareas_resumen
DROP VIEW IF EXISTS vista_tareas_resumen;

CREATE VIEW vista_tareas_resumen AS
SELECT
    t.id,
    t.codigo_tarea,
    t.nombre,
    t.tipo_tarea_id,
    t.descripcion,
    t.lote_id,
    t.sublote_id,
    t.estado,
    t.prioridad,
    t.fecha_estimada_inicio,
    t.fecha_estimada_fin,
    t.fecha_inicio_real,
    t.fecha_fin_real,
    t.jornales_estimados,
    t.responsable_id,
    t.observaciones,
    t.created_at,
    t.updated_at,
    t.created_by,
    t.updated_by,
    t.lote_ids,
    COALESCE(string_agg(DISTINCT l.nombre, ', ' ORDER BY l.nombre), '') AS lote_nombres,
    COALESCE(string_agg(DISTINCT l.nombre, ', ' ORDER BY l.nombre), '') AS lote_nombre,
    COALESCE(array_length(t.lote_ids, 1), 0) AS num_lotes,
    tt.nombre AS tipo_tarea_nombre,
    tt.categoria AS tipo_tarea_categoria,
    e.nombre AS responsable_nombre,
    COALESCE(sum((rt.fraccion_jornal::text)::numeric), 0::numeric) AS jornales_reales,
    COALESCE(sum(rt.costo_jornal), 0::numeric) AS costo_total,
    count(DISTINCT rt.empleado_id) AS num_empleados,
    count(DISTINCT rt.fecha_trabajo) AS dias_trabajados
FROM tareas t
    LEFT JOIN LATERAL unnest(t.lote_ids) AS unnested_lote_id ON true
    LEFT JOIN lotes l ON l.id = unnested_lote_id
    LEFT JOIN tipos_tareas tt ON t.tipo_tarea_id = tt.id
    LEFT JOIN empleados e ON t.responsable_id = e.id
    LEFT JOIN registros_trabajo rt ON t.id = rt.tarea_id
GROUP BY t.id, tt.nombre, tt.categoria, e.nombre;

ALTER VIEW vista_tareas_resumen SET (security_invoker = true);


-- ============================================================================
-- PART 2: ENABLE RLS AND CREATE POLICIES FOR 9 TABLES
-- ============================================================================
-- Pattern: all authenticated users get access (no per-user row ownership in this app)

-- --------------------------------------------------------------------------
-- 2a. tareas_lotes (read-only)
-- --------------------------------------------------------------------------
ALTER TABLE tareas_lotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_tareas_lotes" ON tareas_lotes;
CREATE POLICY "authenticated_select_tareas_lotes"
ON tareas_lotes FOR SELECT TO authenticated USING (true);

-- --------------------------------------------------------------------------
-- 2b. aplicaciones_compras (read + delete)
-- --------------------------------------------------------------------------
ALTER TABLE aplicaciones_compras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_aplicaciones_compras" ON aplicaciones_compras;
CREATE POLICY "authenticated_select_aplicaciones_compras"
ON aplicaciones_compras FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_aplicaciones_compras" ON aplicaciones_compras;
CREATE POLICY "authenticated_insert_aplicaciones_compras"
ON aplicaciones_compras FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_aplicaciones_compras" ON aplicaciones_compras;
CREATE POLICY "authenticated_delete_aplicaciones_compras"
ON aplicaciones_compras FOR DELETE TO authenticated USING (true);

-- --------------------------------------------------------------------------
-- 2c. aplicaciones_lotes (read + delete)
-- --------------------------------------------------------------------------
ALTER TABLE aplicaciones_lotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_aplicaciones_lotes" ON aplicaciones_lotes;
CREATE POLICY "authenticated_select_aplicaciones_lotes"
ON aplicaciones_lotes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_aplicaciones_lotes" ON aplicaciones_lotes;
CREATE POLICY "authenticated_insert_aplicaciones_lotes"
ON aplicaciones_lotes FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_aplicaciones_lotes" ON aplicaciones_lotes;
CREATE POLICY "authenticated_delete_aplicaciones_lotes"
ON aplicaciones_lotes FOR DELETE TO authenticated USING (true);

-- --------------------------------------------------------------------------
-- 2d. aplicaciones_calculos (read + delete)
-- --------------------------------------------------------------------------
ALTER TABLE aplicaciones_calculos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_aplicaciones_calculos" ON aplicaciones_calculos;
CREATE POLICY "authenticated_select_aplicaciones_calculos"
ON aplicaciones_calculos FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_aplicaciones_calculos" ON aplicaciones_calculos;
CREATE POLICY "authenticated_insert_aplicaciones_calculos"
ON aplicaciones_calculos FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_aplicaciones_calculos" ON aplicaciones_calculos;
CREATE POLICY "authenticated_delete_aplicaciones_calculos"
ON aplicaciones_calculos FOR DELETE TO authenticated USING (true);

-- --------------------------------------------------------------------------
-- 2e. aplicaciones_productos (read + delete)
-- --------------------------------------------------------------------------
ALTER TABLE aplicaciones_productos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_aplicaciones_productos" ON aplicaciones_productos;
CREATE POLICY "authenticated_select_aplicaciones_productos"
ON aplicaciones_productos FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_aplicaciones_productos" ON aplicaciones_productos;
CREATE POLICY "authenticated_insert_aplicaciones_productos"
ON aplicaciones_productos FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_aplicaciones_productos" ON aplicaciones_productos;
CREATE POLICY "authenticated_delete_aplicaciones_productos"
ON aplicaciones_productos FOR DELETE TO authenticated USING (true);

-- --------------------------------------------------------------------------
-- 2f. movimientos_diarios_productos (read + insert + delete)
-- --------------------------------------------------------------------------
ALTER TABLE movimientos_diarios_productos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_movimientos_diarios_productos" ON movimientos_diarios_productos;
CREATE POLICY "authenticated_select_movimientos_diarios_productos"
ON movimientos_diarios_productos FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_movimientos_diarios_productos" ON movimientos_diarios_productos;
CREATE POLICY "authenticated_insert_movimientos_diarios_productos"
ON movimientos_diarios_productos FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_movimientos_diarios_productos" ON movimientos_diarios_productos;
CREATE POLICY "authenticated_delete_movimientos_diarios_productos"
ON movimientos_diarios_productos FOR DELETE TO authenticated USING (true);

-- --------------------------------------------------------------------------
-- 2g. movimientos_diarios_empleados (read + insert + delete)
-- --------------------------------------------------------------------------
ALTER TABLE movimientos_diarios_empleados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_movimientos_diarios_empleados" ON movimientos_diarios_empleados;
CREATE POLICY "authenticated_select_movimientos_diarios_empleados"
ON movimientos_diarios_empleados FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_movimientos_diarios_empleados" ON movimientos_diarios_empleados;
CREATE POLICY "authenticated_insert_movimientos_diarios_empleados"
ON movimientos_diarios_empleados FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_movimientos_diarios_empleados" ON movimientos_diarios_empleados;
CREATE POLICY "authenticated_delete_movimientos_diarios_empleados"
ON movimientos_diarios_empleados FOR DELETE TO authenticated USING (true);

-- --------------------------------------------------------------------------
-- 2h. movimientos_diarios_trabajadores (read + insert + delete)
-- --------------------------------------------------------------------------
ALTER TABLE movimientos_diarios_trabajadores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_movimientos_diarios_trabajadores" ON movimientos_diarios_trabajadores;
CREATE POLICY "authenticated_select_movimientos_diarios_trabajadores"
ON movimientos_diarios_trabajadores FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_movimientos_diarios_trabajadores" ON movimientos_diarios_trabajadores;
CREATE POLICY "authenticated_insert_movimientos_diarios_trabajadores"
ON movimientos_diarios_trabajadores FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_movimientos_diarios_trabajadores" ON movimientos_diarios_trabajadores;
CREATE POLICY "authenticated_delete_movimientos_diarios_trabajadores"
ON movimientos_diarios_trabajadores FOR DELETE TO authenticated USING (true);

-- --------------------------------------------------------------------------
-- 2i. contratistas (full CRUD)
-- --------------------------------------------------------------------------
ALTER TABLE contratistas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_contratistas" ON contratistas;
CREATE POLICY "authenticated_select_contratistas"
ON contratistas FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_contratistas" ON contratistas;
CREATE POLICY "authenticated_insert_contratistas"
ON contratistas FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_contratistas" ON contratistas;
CREATE POLICY "authenticated_update_contratistas"
ON contratistas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_contratistas" ON contratistas;
CREATE POLICY "authenticated_delete_contratistas"
ON contratistas FOR DELETE TO authenticated USING (true);
