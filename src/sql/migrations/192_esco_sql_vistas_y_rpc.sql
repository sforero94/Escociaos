-- =============================================================================
-- 192 — Esco SQL: vistas de negocio v_esco_* y RPC esco_sql_lectura
-- =============================================================================
-- ESCRITA, SIN APLICAR. La aplica Santiago en una sesión presente.
--
-- POR QUÉ EXISTE
-- Esco 2.0 (planificador + validadores) dio No-Go en M6: 57 de 78 turnos
-- terminaron en error_plan antes de leer un dato. Esco pasa a ser un loop simple:
-- el modelo escribe un SELECT, Postgres lo ejecuta con la RLS de quien pregunta
-- y el modelo responde sólo con las filas devueltas. La seguridad la da Postgres
-- (RLS con el JWT del usuario + transacción de solo lectura), no un analizador
-- de SQL. Las reglas de negocio que el modelo no puede adivinar viven acá, en
-- vistas, una regla por vista.
--
-- QUÉ HACE
-- 1. Diez vistas v_esco_*, todas WITH (security_invoker = true): sin eso una
--    vista se ejecuta con los privilegios de su dueño e ignora la RLS.
-- 2. public.esco_sql_lectura(p_sql text) → jsonb {filas, n_filas, truncado}.
--    SECURITY INVOKER (el llamante es una sesión Gerencia con su JWT), sólo
--    Gerencia (42501 para cualquier otro rol), una sola sentencia SELECT/WITH,
--    en transacción de solo lectura, máximo 500 filas.
--
-- REGLAS QUE CODIFICA CADA VISTA (y de dónde sale)
-- * v_esco_jornales: jornales = fraccion_jornal::text::numeric. El ENUM tiene 4
--   etiquetas (0.25, 0.5, 0.75, 1.0); contar filas NO es contar jornales.
--   costo = costo_jornal, que puede ser NULL (sin dato, no cero).
-- * v_esco_gastos: sólo estado = 'Confirmado' (igual que el tablero de finanzas).
-- * v_esco_aplicaciones_productos: lo planeado (aplicaciones_productos) y lo
--   real (movimientos_diarios_productos) en columnas separadas, nunca mezcladas
--   (src/components/aplicaciones/CLAUDE.md). aplicaciones_lotes_planificado está
--   vacía y NO se usa: el mapeo lote sale de aplicaciones_calculos.
-- * v_esco_produccion: regla consolidarRegistros de useProduccionData.ts. Un
--   registro a nivel lote gana; si no existe, suma de sublotes. Con duplicados
--   a nivel lote (56 grupos en producción, 55 idénticos) gana el más reciente.
-- * v_esco_monitoreo: incidencia ponderada = Σ afectados / Σ monitoreados, por
--   ronda_id (nunca por fecha). Sin fila = no monitoreado, nunca 0 %.
-- * v_esco_clima_diario: sale de clima_resumen_diario (NUNCA clima_lecturas).
--   lluvia_mm es NULL cuando el contador está congelado (lluviaConfiableDeResumen)
--   y cuando la cobertura es parcial con 0 mm, porque una cota inferior de 0 no
--   informa nada (construirFranjaLluvia).
-- * v_esco_hato: sólo hechos de v_hato_estado_actual. El estado reproductivo
--   derivado (vacía / servida / confirmada / seca) vive en calculosHato.ts y NO
--   se reimplementa en SQL.
--
-- LÍMITES CONOCIDOS
-- * statement_timeout: el RPC no puede acortar el límite de la sentencia en
--   curso (el temporizador se arma al empezar la sentencia de nivel superior).
--   El límite efectivo es el del rol: authenticated = 8 s (medido en
--   pg_roles, 2026-11-08).
-- * El RPC lee cualquier tabla que el rol authenticated pueda leer con su RLS.
--   Las vistas guían al modelo; no son una frontera de seguridad.
--
-- Filas de dominio afectadas: cero.
-- =============================================================================

-- 0. Precondiciones ------------------------------------------------------------
DO $pre$
DECLARE
  v_existe text;
BEGIN
  SELECT string_agg(viewname, ', ') INTO v_existe
  FROM pg_views
  WHERE schemaname = 'public' AND viewname LIKE 'v\_esco\_%';
  IF v_existe IS NOT NULL THEN
    RAISE EXCEPTION '192: ya existen vistas v_esco_*: %. Revisa antes de reemplazarlas.', v_existe;
  END IF;
  IF to_regprocedure('public.esco_sql_lectura(text)') IS NOT NULL THEN
    RAISE EXCEPTION '192: public.esco_sql_lectura(text) ya existe.';
  END IF;
  IF to_regprocedure('public.get_user_role()') IS NULL THEN
    RAISE EXCEPTION '192: falta public.get_user_role().';
  END IF;
END
$pre$;

-- 1. Vistas --------------------------------------------------------------------

-- 1.1 Jornales: una fila por registro de trabajo.
CREATE VIEW public.v_esco_jornales WITH (security_invoker = true) AS
SELECT
  r.id                                   AS registro_id,
  r.fecha_trabajo                        AS fecha,
  r.lote_id,
  l.nombre                               AS lote,
  r.tarea_id,
  t.nombre                               AS tarea,
  tt.nombre                              AS tipo_tarea,
  CASE WHEN r.empleado_id IS NOT NULL THEN 'empleado'
       WHEN r.contratista_id IS NOT NULL THEN 'contratista' END AS tipo_persona,
  COALESCE(e.nombre, c.nombre)           AS persona,
  r.fraccion_jornal::text::numeric       AS jornales,
  r.costo_jornal                         AS costo
FROM public.registros_trabajo r
LEFT JOIN public.lotes        l  ON l.id  = r.lote_id
LEFT JOIN public.tareas       t  ON t.id  = r.tarea_id
LEFT JOIN public.tipos_tareas tt ON tt.id = t.tipo_tarea_id
LEFT JOIN public.empleados    e  ON e.id  = r.empleado_id
LEFT JOIN public.contratistas c  ON c.id  = r.contratista_id;

-- 1.2 Gastos confirmados.
CREATE VIEW public.v_esco_gastos WITH (security_invoker = true) AS
SELECT
  g.id,
  g.fecha,
  g.valor,
  g.nombre,
  n.nombre  AS negocio,
  rg.nombre AS region,
  cg.nombre AS categoria,
  co.nombre AS concepto,
  p.nombre  AS proveedor
FROM public.fin_gastos g
LEFT JOIN public.fin_negocios         n  ON n.id  = g.negocio_id
LEFT JOIN public.fin_regiones         rg ON rg.id = g.region_id
LEFT JOIN public.fin_categorias_gastos cg ON cg.id = g.categoria_id
LEFT JOIN public.fin_conceptos_gastos co ON co.id = g.concepto_id
LEFT JOIN public.fin_proveedores      p  ON p.id  = g.proveedor_id
WHERE g.estado = 'Confirmado';

-- 1.3 Ingresos.
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
  i.cabezas
FROM public.fin_ingresos i
LEFT JOIN public.fin_negocios           n  ON n.id  = i.negocio_id
LEFT JOIN public.fin_regiones           rg ON rg.id = i.region_id
LEFT JOIN public.fin_categorias_ingresos ci ON ci.id = i.categoria_id;

-- 1.4 Aplicaciones (cabecera). El estado guardado 'Calculada' se llama
--     'Planificada' en la pantalla; se exponen los dos.
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
  (a.fecha_cierre AT TIME ZONE 'America/Bogota')::date AS fecha_cierre,
  (SELECT string_agg(DISTINCT l.nombre, ', ' ORDER BY l.nombre)
     FROM public.aplicaciones_calculos ac
     JOIN public.lotes l ON l.id = ac.lote_id
    WHERE ac.aplicacion_id = a.id)  AS lotes_planeados,
  (SELECT string_agg(DISTINCT l.nombre, ', ' ORDER BY l.nombre)
     FROM public.movimientos_diarios md
     JOIN public.lotes l ON l.id = md.lote_id
    WHERE md.aplicacion_id = a.id)  AS lotes_ejecutados,
  a.costo_total_insumos,
  a.costo_total_mano_obra,
  a.costo_total,
  a.jornales_utilizados
FROM public.aplicaciones a;

-- 1.5 Productos por aplicación: plan y real en columnas separadas.
CREATE VIEW public.v_esco_aplicaciones_productos WITH (security_invoker = true) AS
WITH plan AS (
  SELECT m.aplicacion_id, ap.producto_id, sum(ap.cantidad_total_necesaria) AS cantidad_planeada
  FROM public.aplicaciones_productos ap
  JOIN public.aplicaciones_mezclas m ON m.id = ap.mezcla_id
  GROUP BY m.aplicacion_id, ap.producto_id
), real AS (
  SELECT md.aplicacion_id, mp.producto_id, sum(mp.cantidad_utilizada) AS cantidad_real,
         min(md.fecha_movimiento) AS primera_fecha_real, max(md.fecha_movimiento) AS ultima_fecha_real
  FROM public.movimientos_diarios_productos mp
  JOIN public.movimientos_diarios md ON md.id = mp.movimiento_diario_id
  GROUP BY md.aplicacion_id, mp.producto_id
)
SELECT
  COALESCE(p.aplicacion_id, r.aplicacion_id) AS aplicacion_id,
  a.nombre_aplicacion,
  a.estado::text                              AS estado,
  COALESCE(p.producto_id, r.producto_id)      AS producto_id,
  pr.nombre                                   AS producto,
  pr.unidad_medida::text                      AS unidad,
  p.cantidad_planeada,
  r.cantidad_real,
  r.primera_fecha_real,
  r.ultima_fecha_real
FROM plan p
FULL JOIN real r ON r.aplicacion_id = p.aplicacion_id AND r.producto_id = p.producto_id
LEFT JOIN public.aplicaciones a ON a.id = COALESCE(p.aplicacion_id, r.aplicacion_id)
LEFT JOIN public.productos   pr ON pr.id = COALESCE(p.producto_id, r.producto_id);

-- 1.6 Inventario de productos. precio_unitario es referencial: la valoración
--     del inventario no está certificada (inventario_parametros).
CREATE VIEW public.v_esco_inventario WITH (security_invoker = true) AS
SELECT
  p.id AS producto_id,
  p.nombre,
  p.categoria::text      AS categoria,
  p.unidad_medida::text  AS unidad,
  p.cantidad_actual,
  p.stock_minimo,
  p.precio_unitario,
  p.estado::text         AS estado,
  p.activo
FROM public.productos p;

-- 1.7 Producción consolidada por (lote, año, cosecha): consolidarRegistros.
CREATE VIEW public.v_esco_produccion WITH (security_invoker = true) AS
WITH nivel_lote AS (
  SELECT DISTINCT ON (lote_id, ano, cosecha_tipo)
         lote_id, ano, cosecha_tipo, kg_totales, arboles_registrados, kg_exportacion, kg_nacional
  FROM public.produccion
  WHERE sublote_id IS NULL
  ORDER BY lote_id, ano, cosecha_tipo, updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id
), solo_sublotes AS (
  SELECT p.lote_id, p.ano, p.cosecha_tipo,
         sum(p.kg_totales)          AS kg_totales,
         sum(p.arboles_registrados) AS arboles_registrados,
         sum(p.kg_exportacion)      AS kg_exportacion,
         sum(p.kg_nacional)         AS kg_nacional
  FROM public.produccion p
  WHERE p.sublote_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.produccion q
      WHERE q.sublote_id IS NULL AND q.lote_id = p.lote_id AND q.ano = p.ano AND q.cosecha_tipo = p.cosecha_tipo)
  GROUP BY p.lote_id, p.ano, p.cosecha_tipo
), u AS (
  SELECT *, 'lote'::text AS nivel FROM nivel_lote
  UNION ALL
  SELECT *, 'sublotes'::text AS nivel FROM solo_sublotes
)
SELECT
  u.lote_id,
  l.nombre                AS lote,
  u.ano,
  u.cosecha_tipo,
  u.kg_totales,
  u.arboles_registrados,
  round(u.kg_totales / NULLIF(u.arboles_registrados, 0), 2) AS kg_por_arbol,
  u.kg_exportacion,
  u.kg_nacional,
  u.nivel
FROM u
LEFT JOIN public.lotes l ON l.id = u.lote_id;

-- 1.8 Monitoreo por ronda, lote, sublote y plaga. Sin fila = no monitoreado.
CREATE VIEW public.v_esco_monitoreo WITH (security_invoker = true) AS
SELECT
  m.ronda_id,
  rm.nombre              AS ronda,
  rm.fecha_inicio        AS ronda_inicio,
  rm.fecha_fin           AS ronda_fin,
  m.lote_id,
  l.nombre               AS lote,
  m.sublote_id,
  s.nombre               AS sublote,
  m.plaga_enfermedad_id,
  pe.nombre              AS plaga,
  pe.tipo                AS tipo_plaga,
  min(m.fecha_monitoreo) AS fecha_primera,
  max(m.fecha_monitoreo) AS fecha_ultima,
  sum(m.arboles_afectados)   AS arboles_afectados,
  sum(m.arboles_monitoreados) AS arboles_monitoreados,
  round(100.0 * sum(m.arboles_afectados) / NULLIF(sum(m.arboles_monitoreados), 0), 2) AS incidencia_pct,
  count(*)               AS n_observaciones
FROM public.monitoreos m
LEFT JOIN public.rondas_monitoreo rm ON rm.id = m.ronda_id
LEFT JOIN public.lotes l ON l.id = m.lote_id
LEFT JOIN public.sublotes s ON s.id = m.sublote_id
LEFT JOIN public.plagas_enfermedades_catalogo pe ON pe.id = m.plaga_enfermedad_id
GROUP BY m.ronda_id, rm.nombre, rm.fecha_inicio, rm.fecha_fin, m.lote_id, l.nombre,
         m.sublote_id, s.nombre, m.plaga_enfermedad_id, pe.nombre, pe.tipo;

-- 1.9 Clima diario, con la lluvia confiable.
CREATE VIEW public.v_esco_clima_diario WITH (security_invoker = true) AS
SELECT
  c.fecha,
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
  c.horas_sol_duracion
FROM public.clima_resumen_diario c;

-- 1.10 Hato: hechos del estado actual (el estado reproductivo derivado NO va).
CREATE VIEW public.v_esco_hato WITH (security_invoker = true) AS
SELECT
  h.animal_id,
  h.numero AS chapeta,
  h.nombre,
  h.etapa,
  h.raza,
  h.estado,
  h.fecha_nacimiento,
  h.num_partos,
  h.ultimo_parto_fecha,
  h.ultimo_servicio_fecha,
  h.ultimo_tipo_servicio,
  h.ultima_confirmacion_prenez_fecha,
  h.ultima_confirmacion_prenez_metodo,
  h.ultimo_aborto_fecha,
  h.fecha_probable_parto,
  h.fecha_secar,
  h.ultimo_secado_real_fecha,
  h.ultimo_estado_chequeo,
  h.ultimo_chequeo_fecha,
  h.pl
FROM public.v_hato_estado_actual h;

-- Las vistas se crean como postgres: dejar claro quién puede leerlas.
REVOKE ALL ON public.v_esco_jornales, public.v_esco_gastos, public.v_esco_ingresos,
  public.v_esco_aplicaciones, public.v_esco_aplicaciones_productos, public.v_esco_inventario,
  public.v_esco_produccion, public.v_esco_monitoreo, public.v_esco_clima_diario, public.v_esco_hato
  FROM PUBLIC, anon;
GRANT SELECT ON public.v_esco_jornales, public.v_esco_gastos, public.v_esco_ingresos,
  public.v_esco_aplicaciones, public.v_esco_aplicaciones_productos, public.v_esco_inventario,
  public.v_esco_produccion, public.v_esco_monitoreo, public.v_esco_clima_diario, public.v_esco_hato
  TO authenticated, service_role;

-- 2. RPC -------------------------------------------------------------------------
CREATE FUNCTION public.esco_sql_lectura(p_sql text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  c_max   CONSTANT integer := 500;
  v_sql   text;
  v_filas jsonb;
  v_n     integer;
BEGIN
  IF (SELECT public.get_user_role()) IS DISTINCT FROM 'Gerencia' THEN
    RAISE EXCEPTION 'esco_sql_lectura: solo Gerencia' USING ERRCODE = '42501';
  END IF;

  v_sql := btrim(regexp_replace(coalesce(p_sql, ''), '[[:space:];]+$', ''));
  IF v_sql = '' THEN
    RAISE EXCEPTION 'esco_sql_lectura: la consulta está vacía' USING ERRCODE = '22023';
  END IF;
  IF position(';' IN v_sql) > 0 THEN
    RAISE EXCEPTION 'esco_sql_lectura: envía una sola sentencia, sin ";" intermedio' USING ERRCODE = '22023';
  END IF;
  IF v_sql !~* '^(select|with)([[:space:](]|$)' THEN
    RAISE EXCEPTION 'esco_sql_lectura: la consulta debe empezar por SELECT o WITH' USING ERRCODE = '22023';
  END IF;

  SET LOCAL transaction_read_only = on;

  EXECUTE format(
    'SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM (%s' || E'\n' || ') q LIMIT %s) t', v_sql, c_max + 1)
  INTO v_filas;

  v_filas := coalesce(v_filas, '[]'::jsonb);
  v_n := jsonb_array_length(v_filas);
  IF v_n > c_max THEN
    v_filas := v_filas - c_max;   -- quita el elemento 501
  END IF;

  RETURN jsonb_build_object(
    'filas',    v_filas,
    'n_filas',  least(v_n, c_max),
    'truncado', v_n > c_max
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.esco_sql_lectura(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.esco_sql_lectura(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.esco_sql_lectura(text) IS
  'Esco SQL: ejecuta un SELECT/WITH de una sola sentencia en transacción de solo lectura, solo Gerencia, máx. 500 filas. Migración 192.';

-- 3. Postcondiciones -------------------------------------------------------------
DO $post$
DECLARE
  v_mal text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO v_mal
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname LIKE 'v\_esco\_%' AND c.relkind = 'v'
    AND NOT (coalesce(c.reloptions, '{}'::text[]) @> ARRAY['security_invoker=true']);
  IF v_mal IS NOT NULL THEN
    RAISE EXCEPTION '192: vistas sin security_invoker: %', v_mal;
  END IF;

  IF (SELECT count(*) FROM pg_views WHERE schemaname = 'public' AND viewname LIKE 'v\_esco\_%') <> 10 THEN
    RAISE EXCEPTION '192: se esperaban 10 vistas v_esco_*.';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.esco_sql_lectura(text)'::regprocedure) THEN
    RAISE EXCEPTION '192: esco_sql_lectura quedó SECURITY DEFINER.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'public.esco_sql_lectura(text)'::regprocedure
      AND 'search_path=public, pg_temp' = ANY (proconfig)
  ) THEN
    RAISE EXCEPTION '192: esco_sql_lectura sin search_path pineado.';
  END IF;
  IF has_function_privilege('anon', 'public.esco_sql_lectura(text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.esco_sql_lectura(text)', 'EXECUTE') THEN
    RAISE EXCEPTION '192: ACL incorrecta en esco_sql_lectura.';
  END IF;
  IF has_table_privilege('anon', 'public.v_esco_gastos', 'SELECT') THEN
    RAISE EXCEPTION '192: anon puede leer v_esco_gastos.';
  END IF;
END
$post$;

-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.esco_sql_lectura(text);
--   DROP VIEW IF EXISTS public.v_esco_jornales, public.v_esco_gastos, public.v_esco_ingresos,
--     public.v_esco_aplicaciones, public.v_esco_aplicaciones_productos, public.v_esco_inventario,
--     public.v_esco_produccion, public.v_esco_monitoreo, public.v_esco_clima_diario, public.v_esco_hato;
