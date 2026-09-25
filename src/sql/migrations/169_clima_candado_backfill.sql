-- 169_clima_candado_backfill.sql
--
-- ESCO-133. Candado ENTRE INSTANCIAS para los tres caminos que reagregan dias
-- de clima desde la edge function: `/clima/actualizar` (boton, ESCO-127),
-- `/clima/backfill` (manual) y `/clima/reintentar-sin-dato` (cron de la 121).
--
-- POR QUE. `fn_clima_rollup_diario` termina con una poda GLOBAL de
-- `clima_lecturas` (lecturas de mas de 24 h), no acotada a su `p_fecha`. Dos
-- procesos que reagregan dias viejos a la vez se borran mutuamente las lecturas
-- historicas recien insertadas, el dia queda intacto y la respuesta igual dice
-- `synced:1` (comprobado 2026-08-26, ver la 122). El PR del boton cubrio el
-- doble clic con una bandera EN MEMORIA, que no ve a otra instancia del edge
-- runtime. Este candado vive en la base, asi que lo ven todas.
--
-- POR QUE UN LEASE Y NO `pg_try_advisory_lock`. La edge function habla con la
-- base por PostgREST, que usa un pool de conexiones. Un advisory lock de SESION
-- tomado en una llamada RPC queda pegado a una conexion del pool: la llamada
-- que intenta soltarlo puede caer en OTRA conexion y no soltarlo nunca, y el
-- candado se filtraria a peticiones ajenas. Uno de TRANSACCION se suelta al
-- terminar la propia llamada RPC, o sea antes de que empiece el trabajo que
-- tendria que proteger. Un lease en una fila no tiene ninguno de los dos
-- problemas: se toma con un UPDATE atomico, se suelta por dueno y VENCE solo
-- si la funcion muere a mitad de camino.
--
-- DISENO.
--   * `clima_candado_backfill`: UNA fila (id = 1). `vence_en` NULL = libre.
--   * `fn_clima_candado_tomar(p_dueno, p_segundos)`: toma el candado si esta
--     libre o vencido; devuelve true/false. Nunca espera.
--   * `fn_clima_candado_soltar(p_dueno)`: lo suelta SOLO si el dueno coincide,
--     asi un proceso lento no suelta el candado que ya tomo otro despues de
--     que el suyo vencio.
-- El cron nocturno `clima-daily-rollup` NO pasa por aca: corre SQL directo a
-- las 05:15 UTC y la edge function ya se niega a correr en esa ventana.
--
-- SEGURIDAD. Solo la edge function (service_role) llama a estas funciones.
-- EXECUTE revocado a PUBLIC/anon/authenticated. La tabla: RLS activa sin
-- politicas y sin grants para roles del navegador (patron 081).
-- `SECURITY INVOKER` con `search_path` pineado (082).
--
-- Aditiva pura. Filas de dominio afectadas: cero (1 fila de control nueva).
-- ORDEN: migracion primero, `functions deploy` despues. Al reves, los tres
-- endpoints responden 503 «candado no disponible» y no escriben nada.
-- NO trae BEGIN;/COMMIT; -- `apply_migration` ya envuelve en una transaccion.

-- ---------------------------------------------------------------------------
-- 0. Pre-condiciones
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.clima_candado_backfill') IS NOT NULL THEN
    RAISE EXCEPTION '169: public.clima_candado_backfill ya existe';
  END IF;
  IF to_regprocedure('public.fn_clima_candado_tomar(text,integer)') IS NOT NULL
     OR to_regprocedure('public.fn_clima_candado_soltar(text)') IS NOT NULL THEN
    RAISE EXCEPTION '169: las funciones del candado ya existen';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Tabla de una sola fila
-- ---------------------------------------------------------------------------
CREATE TABLE public.clima_candado_backfill (
  id        smallint PRIMARY KEY CHECK (id = 1),
  dueno     text,
  tomado_en timestamptz,
  vence_en  timestamptz
);

COMMENT ON TABLE public.clima_candado_backfill IS
  'Migracion 169 (ESCO-133): lease entre instancias para los endpoints de clima que '
  'reagregan dias (actualizar, backfill, reintentar-sin-dato). vence_en NULL = libre. '
  'Solo la edge function (service_role) la toca, via fn_clima_candado_tomar/soltar.';

INSERT INTO public.clima_candado_backfill (id) VALUES (1);

ALTER TABLE public.clima_candado_backfill ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.clima_candado_backfill FROM anon, authenticated, PUBLIC;
GRANT SELECT, UPDATE ON public.clima_candado_backfill TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Funciones
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.fn_clima_candado_tomar(p_dueno text, p_segundos integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tomado boolean;
BEGIN
  IF p_dueno IS NULL OR btrim(p_dueno) = '' THEN
    RAISE EXCEPTION 'fn_clima_candado_tomar: p_dueno es requerido';
  END IF;
  IF p_segundos IS NULL OR p_segundos < 1 OR p_segundos > 3600 THEN
    RAISE EXCEPTION 'fn_clima_candado_tomar: p_segundos debe estar entre 1 y 3600 (es %)', p_segundos;
  END IF;

  UPDATE public.clima_candado_backfill
     SET dueno = p_dueno,
         tomado_en = now(),
         vence_en = now() + make_interval(secs => p_segundos)
   WHERE id = 1
     AND (vence_en IS NULL OR vence_en < now())
  RETURNING true INTO v_tomado;

  RETURN COALESCE(v_tomado, false);
END $$;

CREATE FUNCTION public.fn_clima_candado_soltar(p_dueno text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_soltado boolean;
BEGIN
  UPDATE public.clima_candado_backfill
     SET vence_en = NULL
   WHERE id = 1
     AND dueno = p_dueno
     AND vence_en IS NOT NULL
  RETURNING true INTO v_soltado;

  RETURN COALESCE(v_soltado, false);
END $$;

REVOKE ALL ON FUNCTION public.fn_clima_candado_tomar(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_clima_candado_soltar(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_clima_candado_tomar(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_clima_candado_soltar(text) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Post-condiciones -- incluye una prueba funcional que se deshace sola
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.clima_candado_backfill;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '169 post: la tabla tiene % filas, se esperaba 1', v_n;
  END IF;

  IF has_table_privilege('anon', 'public.clima_candado_backfill', 'SELECT')
     OR has_table_privilege('authenticated', 'public.clima_candado_backfill', 'UPDATE') THEN
    RAISE EXCEPTION '169 post: un rol del navegador conserva privilegios sobre la tabla';
  END IF;
  IF has_function_privilege('anon', 'public.fn_clima_candado_tomar(text,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_clima_candado_tomar(text,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_clima_candado_soltar(text)', 'EXECUTE') THEN
    RAISE EXCEPTION '169 post: un rol del navegador puede ejecutar las funciones del candado';
  END IF;

  -- Prueba funcional: A toma, B no puede, B no suelta el de A, A suelta, B toma
  IF NOT public.fn_clima_candado_tomar('prueba-169-a', 60) THEN
    RAISE EXCEPTION '169 post: A no pudo tomar un candado libre';
  END IF;
  IF public.fn_clima_candado_tomar('prueba-169-b', 60) THEN
    RAISE EXCEPTION '169 post: B tomo un candado que ya tenia A';
  END IF;
  IF public.fn_clima_candado_soltar('prueba-169-b') THEN
    RAISE EXCEPTION '169 post: B solto un candado que no era suyo';
  END IF;
  IF NOT public.fn_clima_candado_soltar('prueba-169-a') THEN
    RAISE EXCEPTION '169 post: A no pudo soltar su propio candado';
  END IF;
  IF NOT public.fn_clima_candado_tomar('prueba-169-b', 60) THEN
    RAISE EXCEPTION '169 post: B no pudo tomar el candado despues de que A lo solto';
  END IF;

  -- Se deja libre y sin rastro de la prueba
  UPDATE public.clima_candado_backfill
     SET dueno = NULL, tomado_en = NULL, vence_en = NULL
   WHERE id = 1;

  RAISE NOTICE '169 OK: candado creado, probado y libre';
END $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (ejecutable, no se corre automaticamente). Antes, redesplegar una
-- edge function que no llame al candado, o los tres endpoints daran 503.
-- ---------------------------------------------------------------------------
-- DROP FUNCTION public.fn_clima_candado_soltar(text);
-- DROP FUNCTION public.fn_clima_candado_tomar(text, integer);
-- DROP TABLE public.clima_candado_backfill;
