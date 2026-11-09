-- =============================================================================
-- 195 — Esco SQL: vistas de hato (eventos, pesajes, quincenal, estado derivado) y monitoreo
-- =============================================================================
-- ESCRITA, SIN APLICAR. La aplica Santiago en una sesión presente.
-- (194 está reservada para la fase P4 del plan: esco_sql_lectura_actor.)
--
-- POR QUÉ EXISTE
-- Después de la 193, dos módulos seguían por debajo del 60 % en el eval de dev: hato 43 % y monitoreo 56 %.
--
-- HATO — faltaban hechos. Esco no tenía vista de eventos (partos, servicios), de pesajes individuales ni de
-- producción quincenal, así que respondía con v_esco_ingresos («pesar» = vender leche) o con la última fecha de
-- parto de cada vaca («partos del año»). Se agregan tres vistas de hechos y el estado reproductivo derivado.
--   v_esco_hato_eventos              una fila por evento (parto, servicio, aborto, secado_real, venta, muerte…)
--   v_esco_hato_pesajes              una fila por pesaje individual de leche (litros por vaca y fecha)
--   v_esco_hato_produccion_quincenal litros de la quincena, SIN dinero (la venta vive en fin_ingresos)
--   v_esco_hato                      se reemplaza: suma estado_reproductivo / estado_pantalla y las fechas
--                                    probables de parto y de secado DERIVADAS
--
-- ESTADO DERIVADO — decisión de Santiago (2026-11-09): entra en SQL. La 192 lo dejó fuera porque la fuente de
-- verdad es derivarEstadoReproductivo() (src/utils/calculosHato.ts) y reimplementarla arriesga que diverjan. El
-- control es una prueba de PARIDAD (escoSqlMigracion195.test.ts): corre la función de TypeScript y esta vista
-- sobre las mismas ~2.500 filas sintéticas y exige el mismo estado, la misma fecha de secar y la misma fecha
-- probable de parto. Si alguien cambia una regla en un lado y no en el otro, esa prueba falla.
-- Alcance: SOLO el estado y las dos fechas. Las alertas, dias_abiertos y vacia_es_problema NO se portan.
-- Los parámetros salen de hato_config en vivo (meses de gestación, meses de secado por raza, ventana de secar).
-- Las fechas probable_parto/secar ya no se copian del último chequeo (podían quedar viejas tras un servicio
-- nuevo): se calculan desde el último servicio, igual que la pantalla, y solo existen cuando hay un ciclo de
-- preñez activo.
--
-- MONITOREO — tres causas, medidas sobre las trazas de dev:
--   * «Última ronda»: ORDER BY ronda_inicio DESC pone PRIMERO las filas sin ronda (NULL ordena primero en DESC)
--     y hay 86 observaciones sin ronda. El modelo elegía «la ronda NULL» y concluía «no hay registros».
--     → ronda_orden (1 = la ronda con observaciones más reciente) y es_ultima_ronda; NULL en las filas sin ronda.
--   * Promedio de porcentajes: AVG(incidencia_pct) no es la incidencia. → v_esco_monitoreo_ronda_plaga trae la
--     incidencia ponderada de TODOS los lotes por ronda y plaga (Σafectados / Σmonitoreados).
--   * Conteo de observaciones: la vista ya viene agregada, así que COUNT(*) cuenta filas de la vista; las
--     observaciones son SUM(n_observaciones). Va en el prompt.
--
-- Las vistas v_esco_monitoreo y v_esco_hato se reemplazan con DROP + CREATE (sin CASCADE: si algo dependiera,
-- aborta). Filas de dominio afectadas: cero.
-- =============================================================================

-- 0. Precondiciones ------------------------------------------------------------
DO $pre$
BEGIN
  IF (SELECT count(*) FROM pg_views WHERE schemaname = 'public' AND viewname LIKE 'v\_esco\_%') <> 10 THEN
    RAISE EXCEPTION '195: se esperaban las 10 vistas v_esco_* (192 + 193).';
  END IF;
  IF to_regclass('public.v_esco_hato_eventos') IS NOT NULL THEN
    RAISE EXCEPTION '195: ya está aplicada (v_esco_hato_eventos existe).';
  END IF;
  IF to_regclass('public.hato_eventos') IS NULL OR to_regclass('public.hato_pesajes_leche') IS NULL
     OR to_regclass('public.hato_produccion_quincenal') IS NULL OR to_regclass('public.hato_config') IS NULL
     OR to_regclass('public.v_hato_estado_actual') IS NULL THEN
    RAISE EXCEPTION '195: faltan tablas base del hato.';
  END IF;
END
$pre$;

DROP VIEW public.v_esco_hato;
DROP VIEW public.v_esco_monitoreo;

-- 1. Hato: hechos --------------------------------------------------------------
CREATE VIEW public.v_esco_hato_eventos WITH (security_invoker = true) AS
SELECT
  e.id              AS evento_id,
  e.animal_id,
  a.numero          AS chapeta,
  a.nombre,
  e.tipo,
  e.fecha,
  e.fecha_confianza,
  e.tipo_servicio,
  t.nombre          AS toro,
  e.fuente
FROM public.hato_eventos e
LEFT JOIN public.hato_animales a ON a.id = e.animal_id
LEFT JOIN public.hato_toros    t ON t.id = e.toro_id;

CREATE VIEW public.v_esco_hato_pesajes WITH (security_invoker = true) AS
SELECT
  p.id        AS pesaje_id,
  p.animal_id,
  a.numero    AS chapeta,
  a.nombre,
  p.fecha,
  p.litros_total AS litros,
  p.fuente
FROM public.hato_pesajes_leche p
LEFT JOIN public.hato_animales a ON a.id = p.animal_id;

-- Litros de la quincena. Una quincena MEDIDA guarda los litros en la venta (fin_ingresos.cantidad, migración 070)
-- y deja litros_total NULL; la derivada de un mensual sí lo guarda. Sin dinero a propósito.
CREATE VIEW public.v_esco_hato_produccion_quincenal WITH (security_invoker = true) AS
SELECT
  q.anio,
  q.mes,
  q.quincena,
  q.fecha_inicio,
  q.fecha_fin,
  COALESCE(q.litros_total, i.cantidad) AS litros,
  q.num_vacas_ordeno,
  q.origen_dato
FROM public.hato_produccion_quincenal q
LEFT JOIN public.fin_ingresos i ON i.id = q.fin_ingreso_id;

-- 2. Hato: estado actual + estado reproductivo derivado ---------------------------
--    Réplica de derivarEstadoReproductivo() (src/utils/calculosHato.ts): estado y fechas, nada más.
CREATE VIEW public.v_esco_hato WITH (security_invoker = true) AS
WITH cfg AS (
  SELECT
    COALESCE((SELECT (valor #>> '{}')::int FROM public.hato_config WHERE clave = 'meses_gestacion_default'), 9)      AS gestacion,
    COALESCE((SELECT (valor #>> '{}')::int FROM public.hato_config WHERE clave = 'ventana_proxima_secar_dias'), 30) AS ventana_secar,
    COALESCE((SELECT valor FROM public.hato_config WHERE clave = 'meses_secado_por_raza'), '{"_default": 2}'::jsonb) AS secado,
    (now() AT TIME ZONE 'America/Bogota')::date AS hoy
), b AS (
  SELECT h.*, cfg.gestacion, cfg.ventana_secar, cfg.hoy,
         COALESCE((cfg.secado ->> lower(btrim(h.raza)))::int, (cfg.secado ->> '_default')::int, 2) AS meses_secado,
         greatest(h.ultimo_servicio_fecha, h.ultima_confirmacion_prenez_fecha, h.ultimo_secado_real_fecha, h.ultimo_parto_fecha) AS f_max
  FROM public.v_hato_estado_actual h
  CROSS JOIN cfg
), c AS (
  SELECT b.*,
         -- Evento más reciente del ciclo; en empate gana parto > secado_real > confirmación > servicio.
         CASE WHEN f_max IS NULL THEN NULL
              WHEN ultimo_parto_fecha = f_max THEN 'parto'
              WHEN ultimo_secado_real_fecha = f_max THEN 'secado_real'
              WHEN ultima_confirmacion_prenez_fecha = f_max THEN 'confirmacion'
              ELSE 'servicio' END AS mas_reciente,
         -- Ciclo de preñez activo: activa, sin un evento posterior que lo invalide, el más reciente no es un parto
         -- y hay un servicio desde donde proyectar.
         (estado = 'activa' AND etapa <> 'ternera' AND f_max IS NOT NULL
          AND NOT (ultimo_evento_fecha IS NOT NULL AND ultimo_evento_fecha > f_max)
          AND ultimo_parto_fecha IS DISTINCT FROM f_max
          AND ultimo_servicio_fecha IS NOT NULL) AS ciclo_activo
  FROM b
), d AS (
  SELECT c.*,
         CASE WHEN ciclo_activo THEN (ultimo_servicio_fecha + make_interval(months => gestacion))::date END AS pp_derivada,
         CASE WHEN ciclo_activo THEN (ultimo_servicio_fecha + make_interval(months => gestacion - meses_secado))::date END AS secar_derivada
  FROM c
), e AS (
  SELECT d.*,
         CASE
           WHEN estado <> 'activa' THEN estado
           WHEN etapa = 'ternera' THEN 'cria'
           WHEN f_max IS NULL THEN CASE WHEN etapa = 'novilla' THEN 'novilla' ELSE 'vacia_por_servir' END
           WHEN ultimo_evento_fecha IS NOT NULL AND ultimo_evento_fecha > f_max THEN
             CASE WHEN ultimo_aborto_fecha = ultimo_evento_fecha THEN 'vacia_por_servir' ELSE 'indeterminado' END
           WHEN mas_reciente = 'parto' THEN 'parida_reciente'
           WHEN ultimo_servicio_fecha IS NULL THEN
             CASE WHEN mas_reciente = 'secado_real' THEN 'seca'
                  WHEN ultima_confirmacion_prenez_metodo = 'palpacion' THEN 'preñada'
                  ELSE 'servida' END
           WHEN mas_reciente = 'secado_real' THEN 'seca'
           WHEN (secar_derivada - hoy) <= ventana_secar OR hoy >= secar_derivada THEN 'proxima_a_secar'
           WHEN mas_reciente = 'confirmacion' AND ultima_confirmacion_prenez_metodo = 'palpacion' THEN 'preñada'
           ELSE 'servida'
         END AS estado_reproductivo
  FROM d
)
SELECT
  e.animal_id,
  e.numero AS chapeta,
  e.nombre,
  e.etapa,
  e.raza,
  e.estado,
  e.fecha_nacimiento,
  e.num_partos,
  e.ultimo_parto_fecha,
  e.ultimo_servicio_fecha,
  e.ultimo_tipo_servicio,
  e.ultima_confirmacion_prenez_fecha,
  e.ultima_confirmacion_prenez_metodo,
  e.ultimo_aborto_fecha,
  e.pp_derivada     AS fecha_probable_parto,
  e.secar_derivada  AS fecha_secar,
  e.ultimo_secado_real_fecha,
  e.ultimo_estado_chequeo,
  e.ultimo_chequeo_fecha,
  e.pl,
  e.estado_reproductivo,
  CASE e.estado_reproductivo
    WHEN 'preñada' THEN 'Confirmada'
    WHEN 'parida_reciente' THEN 'Vacía'
    WHEN 'servida' THEN 'Servida'
    WHEN 'proxima_a_secar' THEN 'Por secar'
    WHEN 'seca' THEN 'Seca'
    WHEN 'vacia_por_servir' THEN 'Vacía'
    WHEN 'novilla' THEN 'Vacía'
    WHEN 'cria' THEN 'Cría'
    WHEN 'indeterminado' THEN '—'
    WHEN 'vendida' THEN 'Vendida'
    WHEN 'muerta' THEN 'Muerta'
    WHEN 'descartada' THEN 'Descartada'
    ELSE e.estado_reproductivo
  END AS estado_pantalla
FROM e;

-- 3. Monitoreo: orden de ronda y vista ponderada por ronda y plaga ------------------
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
  sum(m.arboles_afectados)    AS arboles_afectados,
  sum(m.arboles_monitoreados) AS arboles_monitoreados,
  round(100.0 * sum(m.arboles_afectados) / NULLIF(sum(m.arboles_monitoreados), 0), 2) AS incidencia_pct,
  count(*)               AS n_observaciones,
  CASE WHEN m.ronda_id IS NULL THEN NULL
       ELSE dense_rank() OVER (ORDER BY rm.fecha_inicio DESC NULLS LAST, m.ronda_id) END::int AS ronda_orden,
  (m.ronda_id IS NOT NULL
   AND dense_rank() OVER (ORDER BY rm.fecha_inicio DESC NULLS LAST, m.ronda_id) = 1) AS es_ultima_ronda
FROM public.monitoreos m
LEFT JOIN public.rondas_monitoreo rm ON rm.id = m.ronda_id
LEFT JOIN public.lotes l ON l.id = m.lote_id
LEFT JOIN public.sublotes s ON s.id = m.sublote_id
LEFT JOIN public.plagas_enfermedades_catalogo pe ON pe.id = m.plaga_enfermedad_id
GROUP BY m.ronda_id, rm.nombre, rm.fecha_inicio, rm.fecha_fin, m.lote_id, l.nombre,
         m.sublote_id, s.nombre, m.plaga_enfermedad_id, pe.nombre, pe.tipo;

-- Incidencia ponderada de TODOS los lotes por ronda y plaga: Σ afectados / Σ monitoreados.
CREATE VIEW public.v_esco_monitoreo_ronda_plaga WITH (security_invoker = true) AS
SELECT
  v.ronda_id,
  v.ronda,
  v.ronda_inicio,
  v.ronda_fin,
  v.ronda_orden,
  v.es_ultima_ronda,
  v.plaga_enfermedad_id,
  v.plaga,
  v.tipo_plaga,
  sum(v.arboles_afectados)    AS arboles_afectados,
  sum(v.arboles_monitoreados) AS arboles_monitoreados,
  round(100.0 * sum(v.arboles_afectados) / NULLIF(sum(v.arboles_monitoreados), 0), 2) AS incidencia_pct,
  count(DISTINCT v.lote_id)   AS n_lotes,
  sum(v.n_observaciones)      AS n_observaciones
FROM public.v_esco_monitoreo v
WHERE v.ronda_id IS NOT NULL
GROUP BY v.ronda_id, v.ronda, v.ronda_inicio, v.ronda_fin, v.ronda_orden, v.es_ultima_ronda,
         v.plaga_enfermedad_id, v.plaga, v.tipo_plaga;

-- Mismos permisos que la 192.
REVOKE ALL ON public.v_esco_hato, public.v_esco_hato_eventos, public.v_esco_hato_pesajes,
  public.v_esco_hato_produccion_quincenal, public.v_esco_monitoreo, public.v_esco_monitoreo_ronda_plaga
  FROM PUBLIC, anon;
GRANT SELECT ON public.v_esco_hato, public.v_esco_hato_eventos, public.v_esco_hato_pesajes,
  public.v_esco_hato_produccion_quincenal, public.v_esco_monitoreo, public.v_esco_monitoreo_ronda_plaga
  TO authenticated, service_role;

-- 4. Postcondiciones -------------------------------------------------------------
DO $post$
DECLARE
  v_mal text;
BEGIN
  IF (SELECT count(*) FROM pg_views WHERE schemaname = 'public' AND viewname LIKE 'v\_esco\_%') <> 14 THEN
    RAISE EXCEPTION '195: se esperaban 14 vistas v_esco_*.';
  END IF;

  SELECT string_agg(c.relname, ', ') INTO v_mal
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname LIKE 'v\_esco\_%' AND c.relkind = 'v'
    AND NOT (coalesce(c.reloptions, '{}'::text[]) @> ARRAY['security_invoker=true']);
  IF v_mal IS NOT NULL THEN
    RAISE EXCEPTION '195: vistas sin security_invoker: %', v_mal;
  END IF;

  SELECT string_agg(c.relname, ', ') INTO v_mal
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname LIKE 'v\_esco\_%' AND c.relkind = 'v'
    AND (has_table_privilege('anon', c.oid, 'SELECT') OR NOT has_table_privilege('authenticated', c.oid, 'SELECT'));
  IF v_mal IS NOT NULL THEN
    RAISE EXCEPTION '195: ACL incorrecta en: %', v_mal;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'v_esco_hato' AND column_name = 'estado_pantalla')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'v_esco_monitoreo' AND column_name = 'es_ultima_ronda') THEN
    RAISE EXCEPTION '195: faltan columnas nuevas.';
  END IF;

  -- Exactamente UNA ronda es la última, y ninguna fila sin ronda lo es.
  IF (SELECT count(DISTINCT ronda_id) FROM public.v_esco_monitoreo WHERE es_ultima_ronda) > 1 THEN
    RAISE EXCEPTION '195: más de una ronda marcada como última.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.v_esco_monitoreo WHERE ronda_id IS NULL AND (es_ultima_ronda OR ronda_orden IS NOT NULL)) THEN
    RAISE EXCEPTION '195: una fila sin ronda quedó con ronda_orden.';
  END IF;
  -- La vista de hato no pierde ni duplica animales.
  IF (SELECT count(*) FROM public.v_esco_hato) <> (SELECT count(*) FROM public.v_hato_estado_actual) THEN
    RAISE EXCEPTION '195: v_esco_hato cambió el número de animales.';
  END IF;
END
$post$;

-- ROLLBACK (vuelve a las definiciones de la 192; las vistas nuevas se borran):
--   DROP VIEW public.v_esco_monitoreo_ronda_plaga, public.v_esco_hato_produccion_quincenal,
--     public.v_esco_hato_pesajes, public.v_esco_hato_eventos, public.v_esco_hato, public.v_esco_monitoreo;
--   y volver a ejecutar, de 192_esco_sql_vistas_y_rpc.sql, los CREATE VIEW de las secciones 1.8
--   (v_esco_monitoreo) y 1.10 (v_esco_hato), más el REVOKE/GRANT de esas dos vistas.
