-- =============================================================================
-- 203 — Esco SQL: estado de monitoreo POR LOTE en v_esco_monitoreo (ESCO-184)
-- =============================================================================
-- ESCRITA, SIN APLICAR. La aplica Santiago en una sesión presente.
-- (200, 201 y 202 están tomadas por PRs abiertos en paralelo: #490, #491 y el chequeo multifoto.)
-- No se aplicó ni se ensayó con po_sonda: el conector de solo lectura no tiene EXECUTE sobre
-- po_sonda (42501). La lógica de la columna nueva se verificó contra producción con un SELECT de
-- solo lectura el 2026-11-26 (ver el pie de este fichero).
--
-- POR QUÉ EXISTE
-- La finca ya no se monitorea entera en una ronda: hay visitas a media finca. En noviembre de 2026
-- Piedra Paula y Salto de Tequendama se leyeron en la Ronda 35 (2026-11-13), y Australia y La Vega
-- sólo en la Ronda 34 (2026-11-03). Con `es_ultima_ronda` (195), que marca UNA ronda para toda la
-- finca, Esco veía sólo dos lotes y para los otros dos no tenía qué decir — o, peor, los leía como
-- «sin hallazgos».
--
-- Decisión de Santiago (ESCO-184, opción A, N = 14 días): el estado actual se calcula POR LOTE. Cada
-- lote usa la ronda más reciente que tiene lectura EN ESE LOTE. Si esa lectura tiene más de 14 días,
-- se dice «no revisado desde <fecha>», nunca 0 %. La pantalla de priorización, la tarjeta de
-- cobertura y la herramienta de Esco en chat.tsx ya aplican esta regla en TypeScript
-- (calcularLecturasPorLote, src/utils/priorizacionMonitoreo.ts). Esta migración le da la misma
-- regla al motor SQL de Esco.
--
-- QUÉ HACE
-- `CREATE OR REPLACE VIEW` de public.v_esco_monitoreo con el cuerpo de la 195 SIN CAMBIOS y una
-- columna nueva AL FINAL, `es_ultima_ronda_lote`:
--   true  en las filas de la ronda cuya última lectura en el lote (max fecha_ultima) es la más
--         reciente de ese lote; empate: el ronda_id mayor (misma regla que el motor de TypeScript —
--         el orden de uuid en Postgres es byte a byte, igual que comparar el texto hex en minúscula).
--   false en todas las demás filas, incluidas las filas sin ronda (ronda_id NULL nunca define la
--         ronda de un lote) y las filas sin lote.
-- La columna NO decide la frescura: los 14 días se aplican en la consulta comparando fecha_ultima
-- contra la fecha de hoy (regla en el prompt de Esco SQL). Así el umbral vive en un solo sitio por
-- motor y no se congela en la vista.
--
-- `es_ultima_ronda` (195) se conserva igual: sigue siendo la ronda más reciente de TODA la finca.
-- v_esco_monitoreo_ronda_plaga depende de esta vista y no cambia (agregar una columna al final es
-- compatible con CREATE OR REPLACE aunque haya vistas dependientes).
--
-- Filas de dominio afectadas: cero. Sólo cambia la definición de una vista.
-- Orden: independiente del deploy de la edge function. La herramienta de chat.tsx no lee esta vista;
-- el prompt de Esco SQL menciona la columna, así que hasta que esta migración corra Esco SQL puede
-- recibir 42703 si la usa — aplicar antes o junto con el deploy de esco-consultas.
-- =============================================================================

-- 0. Precondiciones ------------------------------------------------------------
DO $pre$
BEGIN
  IF (SELECT count(*) FROM pg_views WHERE schemaname = 'public' AND viewname LIKE 'v\_esco\_%') <> 14 THEN
    RAISE EXCEPTION '203: se esperaban las 14 vistas v_esco_* (192 + 193 + 195).';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'v_esco_monitoreo'
               AND column_name = 'es_ultima_ronda_lote') THEN
    RAISE EXCEPTION '203: ya está aplicada (es_ultima_ronda_lote existe).';
  END IF;
  -- El cuerpo vivo tiene que ser el que dejó la 195 (verificado 2026-11-26). Si alguien lo cambió
  -- fuera del repo, abortar en vez de pisarlo en silencio (precedente 143).
  IF md5(pg_get_viewdef('public.v_esco_monitoreo'::regclass, true)) <> 'dad2fa7bc5448d1a13ede0f908cc3f91' THEN
    RAISE EXCEPTION '203: el cuerpo vivo de v_esco_monitoreo no es el de la 195 (md5 distinto).';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'v_esco_monitoreo') <> 19 THEN
    RAISE EXCEPTION '203: v_esco_monitoreo no tiene las 19 columnas de la 195.';
  END IF;
END
$pre$;

-- Línea base de filas para la postcondición (tabla temporal: no depende de si el carril abre
-- transacción). El bot de Telegram escribe monitoreos con service_role, así que la cuenta puede
-- subir mientras corre la migración: la postcondición compara con <, nunca con <> (lección 133).
CREATE TEMP TABLE _m203_base AS
SELECT count(*) AS filas FROM public.v_esco_monitoreo;

-- 1. Vista ----------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_esco_monitoreo WITH (security_invoker = true) AS
WITH base AS (
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
           m.sublote_id, s.nombre, m.plaga_enfermedad_id, pe.nombre, pe.tipo
),
-- Última fecha de lectura de cada ronda EN cada lote. Sin ronda o sin lote no entra.
lote_ronda AS (
  SELECT b.lote_id, b.ronda_id, max(b.fecha_ultima) AS fecha_lectura
  FROM base b
  WHERE b.ronda_id IS NOT NULL AND b.lote_id IS NOT NULL
  GROUP BY b.lote_id, b.ronda_id
),
ranked AS (
  SELECT lr.lote_id, lr.ronda_id,
         row_number() OVER (PARTITION BY lr.lote_id
                            ORDER BY lr.fecha_lectura DESC, lr.ronda_id DESC) AS rn
  FROM lote_ronda lr
)
SELECT
  b.ronda_id, b.ronda, b.ronda_inicio, b.ronda_fin, b.lote_id, b.lote, b.sublote_id, b.sublote,
  b.plaga_enfermedad_id, b.plaga, b.tipo_plaga, b.fecha_primera, b.fecha_ultima,
  b.arboles_afectados, b.arboles_monitoreados, b.incidencia_pct, b.n_observaciones,
  b.ronda_orden, b.es_ultima_ronda,
  coalesce(r.rn = 1, false) AS es_ultima_ronda_lote
FROM base b
LEFT JOIN ranked r ON r.lote_id = b.lote_id AND r.ronda_id = b.ronda_id;

COMMENT ON COLUMN public.v_esco_monitoreo.es_ultima_ronda_lote IS
  'ESCO-184 (203): true en la ronda más reciente CON lectura en ese lote (max fecha_ultima; empate: ronda_id mayor). '
  'false en filas sin ronda o sin lote. No decide frescura: si fecha_ultima tiene más de 14 días, '
  'el lote está «no revisado desde <fecha>», nunca en 0 %.';

-- Mismos permisos que la 192/195. CREATE OR REPLACE conserva los grants; se repiten por si acaso.
REVOKE ALL ON public.v_esco_monitoreo FROM PUBLIC, anon;
GRANT SELECT ON public.v_esco_monitoreo TO authenticated, service_role;

-- 2. Postcondiciones -------------------------------------------------------------
DO $post$
BEGIN
  IF (SELECT count(*) FROM pg_views WHERE schemaname = 'public' AND viewname LIKE 'v\_esco\_%') <> 14 THEN
    RAISE EXCEPTION '203: se esperaban 14 vistas v_esco_*.';
  END IF;

  -- La columna nueva es la 20 y es boolean; las 19 anteriores siguen en su sitio.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'v_esco_monitoreo'
                   AND column_name = 'es_ultima_ronda_lote' AND ordinal_position = 20
                   AND data_type = 'boolean') THEN
    RAISE EXCEPTION '203: es_ultima_ronda_lote no quedó como columna 20 boolean.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'v_esco_monitoreo'
                   AND column_name = 'es_ultima_ronda' AND ordinal_position = 19) THEN
    RAISE EXCEPTION '203: es_ultima_ronda se movió.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'public' AND c.relname = 'v_esco_monitoreo'
                   AND coalesce(c.reloptions, '{}'::text[]) @> ARRAY['security_invoker=true']) THEN
    RAISE EXCEPTION '203: v_esco_monitoreo perdió security_invoker.';
  END IF;
  IF has_table_privilege('anon', 'public.v_esco_monitoreo', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.v_esco_monitoreo', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.v_esco_monitoreo', 'SELECT') THEN
    RAISE EXCEPTION '203: ACL incorrecta en v_esco_monitoreo.';
  END IF;

  -- La vista no perdió filas (puede ganar si el bot escribió mientras tanto).
  IF (SELECT count(*) FROM public.v_esco_monitoreo) < (SELECT filas FROM _m203_base) THEN
    RAISE EXCEPTION '203: v_esco_monitoreo perdió filas.';
  END IF;

  -- Una fila sin ronda nunca es la última ronda de un lote.
  IF EXISTS (SELECT 1 FROM public.v_esco_monitoreo
             WHERE es_ultima_ronda_lote AND (ronda_id IS NULL OR lote_id IS NULL)) THEN
    RAISE EXCEPTION '203: una fila sin ronda o sin lote quedó marcada.';
  END IF;
  -- Cada lote con alguna ronda tiene exactamente UNA ronda marcada.
  IF EXISTS (SELECT lote_id FROM public.v_esco_monitoreo
             WHERE ronda_id IS NOT NULL AND lote_id IS NOT NULL
             GROUP BY lote_id
             HAVING count(DISTINCT ronda_id) FILTER (WHERE es_ultima_ronda_lote) <> 1) THEN
    RAISE EXCEPTION '203: un lote con rondas no tiene exactamente una ronda marcada.';
  END IF;
  -- La regla de la 195 no cambió: a lo sumo UNA ronda es la última de la finca.
  IF (SELECT count(DISTINCT ronda_id) FROM public.v_esco_monitoreo WHERE es_ultima_ronda) > 1 THEN
    RAISE EXCEPTION '203: más de una ronda marcada como última de la finca.';
  END IF;
  -- La vista dependiente sigue respondiendo.
  PERFORM 1 FROM public.v_esco_monitoreo_ronda_plaga LIMIT 1;
END
$post$;

DROP TABLE _m203_base;

-- =============================================================================
-- ROLLBACK (CREATE OR REPLACE no puede quitar una columna; hay que borrar y recrear las dos vistas):
--   DROP VIEW public.v_esco_monitoreo_ronda_plaga, public.v_esco_monitoreo;
--   y volver a ejecutar, de 195_esco_sql_hato_monitoreo_vistas.sql, los dos CREATE VIEW de la
--   sección 3 (v_esco_monitoreo y v_esco_monitoreo_ronda_plaga) más:
--   REVOKE ALL ON public.v_esco_monitoreo, public.v_esco_monitoreo_ronda_plaga FROM PUBLIC, anon;
--   GRANT SELECT ON public.v_esco_monitoreo, public.v_esco_monitoreo_ronda_plaga TO authenticated, service_role;
-- =============================================================================
--
-- VERIFICACIÓN DE SOLO LECTURA (2026-11-26, contra producción, mismo CTE lote_ronda/ranked):
--   1. Piedra Paula ............ Ronda 35  2026-11-13  13 días  (vigente)
--   2. Salto de Tequendama ..... Ronda 35  2026-11-13  13 días  (vigente)
--   3. Australia ............... Ronda 34  2026-11-03  23 días  → «no revisado desde 2026-11-03»
--   4. La Vega ................. Ronda 34  2026-11-03  23 días  → «no revisado desde 2026-11-03»
--  10. Santa Rosa .............. Ronda 26  2026-04-25  215 días → «no revisado desde 2026-04-25»
--   Lotes inactivos (Pedregal, La Unión, Irlanda, Acueducto) también reciben su ronda; el filtro
--   de lote activo es de la consulta, no de la vista. Exactamente 1 ronda marcada por lote.
--   md5 de la vista viva = dad2fa7bc5448d1a13ede0f908cc3f91, 19 columnas.
-- =============================================================================
