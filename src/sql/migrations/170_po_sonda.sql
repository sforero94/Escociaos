-- =============================================================================
-- 170 — po_sonda: consultas de prueba que siempre se deshacen
-- =============================================================================
-- ESCRITA, SIN APLICAR. La aplica Santiago en una sesión presente (decisión
-- 2026-09-27, "opción A": ninguna Routine escribe en la base de datos).
--
-- POR QUÉ EXISTE
-- Las Routines de mantenimiento se quedaban horas esperando un permiso por una
-- consulta que no es lectura ni migración: una CONSULTA DE PRUEBA para comprobar
-- una hipótesis. Ejemplos: simular un rol para ver si una política RLS deja
-- pasar un INSERT, probar si una función aborta con un payload, medir un plan
-- real con EXPLAIN ANALYZE, ensayar una migración antes de proponerla.
-- `SUPABASE_RUN_READ_ONLY_QUERY` rechaza todas esas consultas (corre en una
-- transacción de solo lectura), así que el agente iba al SQL libre
-- (`SUPABASE_BETA_RUN_SQL_QUERY`), el filtro pedía permiso y la corrida quedaba
-- en espera hasta que alguien abría la sesión.
--
-- QUÉ HACE
-- `po_sonda(p_consulta, p_preparacion)` ejecuta los pasos de preparación en
-- orden, ejecuta la consulta, guarda sus filas como jsonb y DESHACE TODO al
-- final, siempre: el bloque interno termina con una excepción propia, y la
-- excepción revierte la subtransacción entera — filas escritas, DDL, `SET LOCAL
-- ROLE`, `set_config(..., true)`, tablas temporales y la cola de pg_net.
-- Un error en cualquier paso NO se propaga: vuelve en el campo `error`, con su
-- SQLSTATE y el número de paso, para que la hipótesis tenga respuesta igual.
--
-- El filtro `.claude/hooks/supabase-guard.py` deja pasar sin preguntar sólo una
-- llamada con la forma exacta `select public.po_sonda($a$…$a$, ARRAY[$b$…$b$])`.
--
-- LO QUE UNA TRANSACCIÓN NO DESHACE — y por eso se rechaza antes de ejecutar:
--   pg_terminate_backend / pg_cancel_backend (matan conexiones de la app),
--   pg_reload_conf, pg_rotate_logfile, pg_advisory_* (un candado de sesión
--   sobrevive al rollback), setval (no es transaccional), lo_* (objetos
--   grandes), pg_read_*/pg_ls_*/pg_stat_file (leen archivos del servidor),
--   vault/pgsodium/decrypted_secrets (un secreto en la salida termina en un
--   reporte), dblink/http_* (no instaladas hoy; se bloquean por si acaso), COPY.
-- Se acepta sin bloquear: nextval consume números de secuencia (daño cosmético).
-- Extensiones verificadas 2026-09-27: pg_cron, pg_net, pg_stat_statements,
-- pgcrypto, plpgsql, supabase_vault, uuid-ossp. pg_net encola en una tabla, así
-- que su net.http_* se deshace con el resto.
--
-- LÍMITES
-- * lock_timeout = 2 s dentro de la sonda: un DDL de prueba no se queda
--   esperando detrás de la app. Un bloqueo tomado se suelta al deshacer.
-- * Duración: acotada por la API de Supabase (~60 s por consulta).
-- * Salida: máximo 500 filas; `truncado = true` si había más.
-- * SECURITY INVOKER: la sonda nunca tiene más privilegios que quien la llama.
--   EXECUTE sólo para service_role (y el dueño). `anon` y `authenticated` no:
--   aunque todo se deshace, no es una herramienta del navegador.
--
-- Filas de dominio afectadas: cero.
-- =============================================================================

-- 0. Precondición --------------------------------------------------------------
DO $pre$
BEGIN
  IF to_regprocedure('public.po_sonda(text, text[])') IS NOT NULL THEN
    RAISE EXCEPTION '170: public.po_sonda(text, text[]) ya existe. Revisa antes de reemplazarla.';
  END IF;
END
$pre$;

-- 1. La función -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.po_sonda(
  p_consulta    text,
  p_preparacion text[] DEFAULT '{}'::text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  c_max_filas  CONSTANT integer := 500;
  c_prohibido  CONSTANT text :=
    '\m(pg_terminate_backend|pg_cancel_backend|pg_reload_conf|pg_rotate_logfile|'
    'pg_advisory_\w*|setval|lo_\w+|pg_read_\w+|pg_ls_\w+|pg_stat_file|'
    'vault|pgsodium|decrypted_secrets?|dblink\w*|http_\w+|copy)\M';
  v_texto      text;
  v_prohibida  text;
  v_sql        text;
  v_reg        record;
  v_filas      jsonb := '[]'::jsonb;
  v_n          integer := 0;
  v_truncado   boolean := false;
  v_paso       integer := 0;
  v_error      text;
  v_sqlstate   text;
  v_t0         timestamptz := clock_timestamp();
BEGIN
  IF p_consulta IS NULL OR btrim(p_consulta) = '' THEN
    RAISE EXCEPTION 'po_sonda: la consulta está vacía.' USING ERRCODE = '22023';
  END IF;

  v_texto := p_consulta || ' ' || coalesce(array_to_string(p_preparacion, ' '), '');
  v_prohibida := substring(v_texto from ('(?i)' || c_prohibido));
  IF v_prohibida IS NOT NULL THEN
    RAISE EXCEPTION 'po_sonda: «%» no se deshace con la transacción; la sonda no lo ejecuta.', v_prohibida
      USING ERRCODE = '42501';
  END IF;

  BEGIN
    PERFORM set_config('lock_timeout', '2s', true);

    FOREACH v_sql IN ARRAY coalesce(p_preparacion, '{}'::text[]) LOOP
      v_paso := v_paso + 1;
      EXECUTE v_sql;
    END LOOP;

    v_paso := v_paso + 1;
    FOR v_reg IN EXECUTE p_consulta LOOP
      v_n := v_n + 1;
      IF v_n > c_max_filas THEN
        v_truncado := true;
        EXIT;
      END IF;
      v_filas := v_filas || jsonb_build_array(to_jsonb(v_reg));
    END LOOP;

    -- Siempre se deshace: esta excepción revierte todo el bloque.
    RAISE EXCEPTION USING ERRCODE = 'PS001', MESSAGE = 'po_sonda: deshacer';
  EXCEPTION
    WHEN SQLSTATE 'PS001' THEN
      NULL;
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
      v_error := SQLERRM;
  END;

  RETURN jsonb_build_object(
    'filas',        CASE WHEN v_error IS NULL THEN v_filas END,
    'n_filas',      CASE WHEN v_error IS NULL THEN least(v_n, c_max_filas) END,
    'truncado',     v_truncado,
    'error',        v_error,
    'sqlstate',     v_sqlstate,
    'paso_fallido', CASE WHEN v_error IS NOT NULL THEN v_paso END,
    'ms',           round(extract(epoch FROM clock_timestamp() - v_t0) * 1000),
    'deshecho',     true
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.po_sonda(text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.po_sonda(text, text[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.po_sonda(text, text[]) TO service_role;

COMMENT ON FUNCTION public.po_sonda(text, text[]) IS
  'Consulta de prueba para la operación de mantenimiento: ejecuta y SIEMPRE deshace. Migración 170.';

-- 2. Postcondiciones, con una prueba real de que deshace -----------------------
DO $post$
DECLARE
  v_res jsonb;
BEGIN
  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.po_sonda(text, text[])'::regprocedure) THEN
    RAISE EXCEPTION '170: po_sonda quedó SECURITY DEFINER.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'public.po_sonda(text, text[])'::regprocedure
      AND 'search_path=public, pg_temp' = ANY (proconfig)
  ) THEN
    RAISE EXCEPTION '170: po_sonda sin search_path pineado.';
  END IF;
  IF has_function_privilege('anon', 'public.po_sonda(text, text[])', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.po_sonda(text, text[])', 'EXECUTE') THEN
    RAISE EXCEPTION '170: anon o authenticated conservan EXECUTE sobre po_sonda.';
  END IF;

  -- Una tabla temporal creada dentro de la sonda no debe existir después.
  v_res := public.po_sonda(
    'SELECT count(*) AS n FROM pg_temp._po_sonda_prueba_170',
    ARRAY['CREATE TEMP TABLE _po_sonda_prueba_170 (i int)',
          'INSERT INTO _po_sonda_prueba_170 VALUES (1), (2)']
  );
  IF (v_res -> 'filas' -> 0 ->> 'n')::int IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION '170: la sonda no devolvió lo que ejecutó: %', v_res;
  END IF;
  IF to_regclass('pg_temp._po_sonda_prueba_170') IS NOT NULL THEN
    RAISE EXCEPTION '170: la sonda NO deshizo su tabla temporal.';
  END IF;

  -- Un error vuelve como dato, no como excepción.
  v_res := public.po_sonda('SELECT 1/0 AS x');
  IF v_res ->> 'sqlstate' IS DISTINCT FROM '22012' THEN
    RAISE EXCEPTION '170: la sonda no devolvió el error como dato: %', v_res;
  END IF;

  -- Una operación que no se deshace se rechaza antes de ejecutar.
  BEGIN
    PERFORM public.po_sonda('SELECT pg_terminate_backend(0)');
    RAISE EXCEPTION '170: la sonda aceptó pg_terminate_backend.';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$post$;

-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.po_sonda(text, text[]);
