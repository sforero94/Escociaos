-- =============================================================================
-- 193 — Esco SQL: correcciones de vistas (fase P1 del plan de migración Esco 2.0)
-- =============================================================================
-- ESCRITA, SIN APLICAR. La aplica Santiago en una sesión presente.
--
-- POR QUÉ EXISTE
-- La evaluación en producción del 2026-11-09 (26 casos por el botón «Esco SQL (beta)») y el
-- baseline del 2026-11-08 señalan cuatro defectos que viven en las VISTAS, no en el prompt:
--
-- F2  «Ventas» respondidas con todos los ingresos. v_esco_ingresos no distingue una venta de una
--     renta o una participación, y NO trae las ventas de ganado de ceba, que viven en
--     fin_transacciones_ganado (es_hato = false) y no en fin_ingresos. La pantalla de Finanzas >
--     Ingresos muestra las dos fuentes juntas; la vista solo mostraba una.
--       → v_esco_ingresos hace UNION ALL con las ventas de ganado de ceba y agrega `es_venta`
--         y `origen`. Las ventas de animales del HATO (es_hato = true) NO se unen: ya están en
--         fin_ingresos (migración 070, fn_hato_registrar_venta_animales) y se contarían dos veces.
--
-- F3  Costo de aplicación distinto del reporte. La vista leía aplicaciones.costo_total*, un valor
--     guardado al cerrar que usa el precio de ese día; el reporte (useReporteAplicacion.ts)
--     lo recalcula con el precio ACTUAL de cada producto y con los registros de trabajo vivos.
--     Medido contra producción: la misma aplicación daba $8,2M guardado y $17,4M en el reporte.
--       → v_esco_aplicaciones calcula insumos y mano de obra como el reporte. Una prueba
--         (escoSqlMigracion193.test.ts) compara la vista contra calcularCostoAplicacionReal(),
--         que es la función que el propio reporte usa ahora.
--
-- F4  Fecha de cierre un día antes. aplicaciones.fecha_cierre es timestamptz y se guarda a las
--     00:00 UTC del día de cierre. La 192 lo convertía a America/Bogota (UTC-5) y por eso
--     «15 de octubre» salía «14 de octubre». La fecha de negocio es la de aplicaciones_cierre
--     (tipo date); la columna timestamptz queda solo como respaldo, leída en UTC.
--     Se revisaron las 24 columnas de fecha de las 10 vistas: las otras 23 son `date` de origen
--     (sin conversión de huso). Esta era la única.
--
-- F10 Cobertura de lluvia. Un día calendario SIN fila en clima_resumen_diario no se contaba como
--     «sin dato»: simplemente no aparecía, y un conteo de días con/sin dato quedaba corto.
--       → v_esco_clima_diario genera TODOS los días calendario desde el primer dato hasta ayer
--         (hora de Bogotá). Un día sin fila sale con lluvia_mm NULL, lluvia_estado 'sin_dato' y
--         tiene_fila = false. No hay solape entre estaciones: wunderground-historico termina
--         antes de que empiece la estación Ecowitt, así que no se duplica ningún día.
--
-- Las vistas se reemplazan con DROP + CREATE (no CREATE OR REPLACE): las columnas nuevas y los
-- cambios de tipo/orden lo impiden. Ninguna otra vista ni función depende de estas tres
-- (DROP sin CASCADE: si algo dependiera, la migración aborta en vez de borrarlo).
--
-- Filas de dominio afectadas: cero.
-- =============================================================================

-- 0. Precondiciones ------------------------------------------------------------
DO $pre$
BEGIN
  IF (SELECT count(*) FROM pg_views WHERE schemaname = 'public' AND viewname LIKE 'v\_esco\_%') <> 10 THEN
    RAISE EXCEPTION '193: se esperaban las 10 vistas v_esco_* de la migración 192.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'v_esco_ingresos' AND column_name = 'es_venta'
  ) THEN
    RAISE EXCEPTION '193: ya está aplicada (v_esco_ingresos ya tiene es_venta).';
  END IF;
  IF to_regclass('public.fin_transacciones_ganado') IS NULL
     OR to_regclass('public.aplicaciones_cierre') IS NULL
     OR to_regclass('public.movimientos_diarios_productos') IS NULL THEN
    RAISE EXCEPTION '193: faltan tablas base.';
  END IF;
END
$pre$;

DROP VIEW public.v_esco_ingresos;
DROP VIEW public.v_esco_aplicaciones;
DROP VIEW public.v_esco_clima_diario;

-- 1. Ingresos: fin_ingresos + ventas de ganado de ceba, con es_venta y origen. ----------
CREATE VIEW public.v_esco_ingresos WITH (security_invoker = true) AS
SELECT
  i.id,
  i.fecha,
  i.valor,
  i.nombre,
  n.nombre  AS negocio,
  rg.nombre AS region,
  ci.nombre AS categoria,
  i.cantidad,
  i.precio_unitario,
  i.cosecha,
  i.cliente,
  i.finca,
  i.cabezas,
  COALESCE(ci.nombre ILIKE 'venta%' OR ci.nombre IN ('Exportación', 'Nacional', 'Descarte'), false) AS es_venta,
  'fin_ingresos'::text AS origen
FROM public.fin_ingresos i
LEFT JOIN public.fin_negocios            n  ON n.id  = i.negocio_id
LEFT JOIN public.fin_regiones            rg ON rg.id = i.region_id
LEFT JOIN public.fin_categorias_ingresos ci ON ci.id = i.categoria_id
UNION ALL
SELECT
  t.id,
  t.fecha,
  t.valor_total,
  'Venta de ganado'::text,
  'Ganado'::text,
  NULL::text,
  'Venta de ganado'::text,
  NULL::numeric,
  NULL::numeric(15,2),
  NULL::text,
  t.cliente_proveedor,
  t.finca,
  t.cantidad_cabezas,
  true,
  'fin_transacciones_ganado'::text
FROM public.fin_transacciones_ganado t
WHERE t.tipo = 'venta' AND NOT t.es_hato;

-- 2. Aplicaciones: costo como lo calcula el reporte; fecha de cierre sin desplazar. ---------
--    Réplica de calcularCostoAplicacionReal() (src/utils/calculosCostoAplicacionReporte.ts):
--    * insumos = Σ cantidad_utilizada × precio_unitario ACTUAL del producto (0 si no hay
--      precio), solo de movimientos con lote;
--    * mano de obra = Σ costo_jornal de los registros de la tarea de la aplicación (con lote) si
--      hay jornales registrados; si no, jornales_utilizados × valor_jornal;
--    * NULL = sin dato (no hay movimientos ni jornales), nunca 0.
CREATE VIEW public.v_esco_aplicaciones WITH (security_invoker = true) AS
SELECT
  a.id                     AS aplicacion_id,
  a.codigo_aplicacion,
  a.nombre_aplicacion,
  a.tipo_aplicacion::text  AS tipo,
  a.estado::text           AS estado,
  CASE a.estado::text WHEN 'Calculada' THEN 'Planificada' ELSE a.estado::text END AS estado_pantalla,
  a.fecha_inicio_planeada,
  a.fecha_fin_planeada,
  a.fecha_inicio_ejecucion,
  a.fecha_fin_ejecucion,
  COALESCE(ci.fecha_cierre, (a.fecha_cierre AT TIME ZONE 'UTC')::date) AS fecha_cierre,
  (SELECT string_agg(DISTINCT l.nombre, ', ' ORDER BY l.nombre)
     FROM public.aplicaciones_calculos ac
     JOIN public.lotes l ON l.id = ac.lote_id
    WHERE ac.aplicacion_id = a.id)  AS lotes_planeados,
  (SELECT string_agg(DISTINCT l.nombre, ', ' ORDER BY l.nombre)
     FROM public.movimientos_diarios md
     JOIN public.lotes l ON l.id = md.lote_id
    WHERE md.aplicacion_id = a.id)  AS lotes_ejecutados,
  ins.costo                         AS costo_total_insumos,
  mo.costo                          AS costo_total_mano_obra,
  CASE WHEN ins.costo IS NULL AND mo.costo IS NULL THEN NULL
       ELSE COALESCE(ins.costo, 0) + COALESCE(mo.costo, 0) END AS costo_total,
  mo.jornales                       AS jornales_utilizados
FROM public.aplicaciones a
LEFT JOIN LATERAL (
  SELECT c.fecha_cierre, c.valor_jornal
  FROM public.aplicaciones_cierre c
  WHERE c.aplicacion_id = a.id
  ORDER BY c.created_at DESC NULLS LAST
  LIMIT 1
) ci ON true
LEFT JOIN LATERAL (
  SELECT sum(COALESCE(mp.cantidad_utilizada, 0) * COALESCE(pr.precio_unitario, 0)) AS costo
  FROM public.movimientos_diarios md
  JOIN public.movimientos_diarios_productos mp ON mp.movimiento_diario_id = md.id
  LEFT JOIN public.productos pr ON pr.id = mp.producto_id
  WHERE md.aplicacion_id = a.id AND md.lote_id IS NOT NULL
) ins ON true
LEFT JOIN LATERAL (
  SELECT
    CASE WHEN rt.jornales > 0 THEN rt.jornales
         WHEN COALESCE(a.jornales_utilizados, 0) > 0 THEN a.jornales_utilizados
         ELSE NULL END AS jornales,
    CASE WHEN rt.jornales > 0 THEN rt.costo
         WHEN COALESCE(a.jornales_utilizados, 0) > 0
           THEN a.jornales_utilizados * COALESCE(NULLIF(a.valor_jornal, 0), ci.valor_jornal, 0)
         ELSE NULL END AS costo
  FROM (
    SELECT COALESCE(sum(r.fraccion_jornal::text::numeric), 0) AS jornales,
           COALESCE(sum(COALESCE(r.costo_jornal, 0)), 0)       AS costo
    FROM public.registros_trabajo r
    WHERE r.tarea_id = a.tarea_id AND r.lote_id IS NOT NULL
  ) rt
) mo ON true;

-- 3. Clima diario: todos los días calendario, con la lluvia confiable. ----------------------
CREATE VIEW public.v_esco_clima_diario WITH (security_invoker = true) AS
WITH limites AS (
  SELECT min(c0.fecha) AS desde,
         GREATEST(max(c0.fecha), (now() AT TIME ZONE 'America/Bogota')::date - 1) AS hasta
  FROM public.clima_resumen_diario c0
), calendario AS (
  SELECT (l.desde + g)::date AS fecha
  FROM limites l, generate_series(0, l.hasta - l.desde) AS g
)
SELECT
  cal.fecha,
  c.station_id,
  c.temp_c_min,
  c.temp_c_max,
  c.temp_c_avg,
  c.humedad_pct_avg,
  CASE
    WHEN c.lluvia_confianza = 'contador_congelado' THEN NULL
    WHEN c.lluvia_confianza = 'cobertura_parcial' AND COALESCE(c.lluvia_total_mm, 0) = 0 THEN NULL
    ELSE c.lluvia_total_mm
  END AS lluvia_mm,
  CASE
    WHEN c.lluvia_confianza = 'contador_congelado' THEN 'sin_dato'
    WHEN c.lluvia_confianza = 'cobertura_parcial' AND COALESCE(c.lluvia_total_mm, 0) = 0 THEN 'sin_dato'
    WHEN c.lluvia_total_mm IS NULL THEN 'sin_dato'
    WHEN c.lluvia_confianza = 'cobertura_parcial' THEN 'cota_inferior'
    ELSE 'completo'
  END AS lluvia_estado,
  c.viento_kmh_avg,
  c.rafaga_kmh_max,
  c.radiacion_wm2_avg,
  c.horas_sol_duracion,
  (c.fecha IS NOT NULL) AS tiene_fila
FROM calendario cal
LEFT JOIN public.clima_resumen_diario c ON c.fecha = cal.fecha;

-- Las vistas se crean como postgres: mismos permisos que la 192.
REVOKE ALL ON public.v_esco_ingresos, public.v_esco_aplicaciones, public.v_esco_clima_diario
  FROM PUBLIC, anon;
GRANT SELECT ON public.v_esco_ingresos, public.v_esco_aplicaciones, public.v_esco_clima_diario
  TO authenticated, service_role;

-- 4. Postcondiciones -------------------------------------------------------------
DO $post$
DECLARE
  v_mal text;
BEGIN
  IF (SELECT count(*) FROM pg_views WHERE schemaname = 'public' AND viewname LIKE 'v\_esco\_%') <> 10 THEN
    RAISE EXCEPTION '193: se esperaban 10 vistas v_esco_*.';
  END IF;

  SELECT string_agg(c.relname, ', ') INTO v_mal
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname LIKE 'v\_esco\_%' AND c.relkind = 'v'
    AND NOT (coalesce(c.reloptions, '{}'::text[]) @> ARRAY['security_invoker=true']);
  IF v_mal IS NOT NULL THEN
    RAISE EXCEPTION '193: vistas sin security_invoker: %', v_mal;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'v_esco_ingresos' AND column_name = 'es_venta')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'v_esco_clima_diario' AND column_name = 'tiene_fila') THEN
    RAISE EXCEPTION '193: faltan columnas nuevas.';
  END IF;

  IF has_table_privilege('anon', 'public.v_esco_ingresos', 'SELECT')
     OR has_table_privilege('anon', 'public.v_esco_aplicaciones', 'SELECT')
     OR has_table_privilege('anon', 'public.v_esco_clima_diario', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.v_esco_aplicaciones', 'SELECT') THEN
    RAISE EXCEPTION '193: ACL incorrecta en las vistas.';
  END IF;
END
$post$;

-- ROLLBACK (vuelve a las definiciones de la 192):
--   DROP VIEW public.v_esco_ingresos, public.v_esco_aplicaciones, public.v_esco_clima_diario;
--   y volver a ejecutar, de 192_esco_sql_vistas_y_rpc.sql, los CREATE VIEW de las secciones
--   1.3 (v_esco_ingresos), 1.4 (v_esco_aplicaciones) y 1.9 (v_esco_clima_diario), más el
--   REVOKE/GRANT de esas tres vistas.
