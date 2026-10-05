-- =====================================================================
-- 175: hato_alertas_tick_0730 -- la hora de envío de las alertas deja de
-- estar fija en un cron y la maneja Gerencia desde Configuración → Alertas.
-- Fecha: 2026-10-05.
--
-- DECISIONES DEL DUEÑO (2026-10-05, sesión en vivo):
--   (1) "cambiemos la hora de envio de notificaciones de 5:45 am a 7:30 am".
--   (2) "Haz que todas las alertas sean modificables y asi no quedan
--       hardcoded y yo las manejo desde la pagina de configuraciones".
--
-- Qué hace:
--   1. `fn_alertas_horario_listar()` -- devuelve la hora de Bogotá de cada
--      cron que ENVÍA alertas por Telegram. Un navegador no puede leer el
--      esquema `cron`, así que la pantalla lo lee por acá.
--   2. `fn_alertas_horario_cambiar(p_jobname, p_hora)` -- cambia la hora de
--      uno de esos crons con `cron.alter_job`. Sólo cambia el `schedule`:
--      el `command`, el endpoint y el secreto de Vault no se tocan.
--   3. Mueve `hato-alertas-tick` de '45 10 * * *' (05:45) a '30 12 * * *'
--      (07:30 Bogotá), con la misma función.
--
-- Jobs que se pueden cambiar -- LISTA LITERAL, nada más:
--   'hato-alertas-tick'      (060, alertas del hato)
--   'ronda-inventario-tick'  (127, recordatorio / día 15 / cierre de la ronda)
-- Los crons de clima (sync, rollup, reintento) son tareas de máquina y no
-- mandan alertas: no entran, y la función los rechaza.
--
-- Seguridad:
--   - SECURITY DEFINER, porque `authenticated` no tiene acceso al esquema
--     `cron`. Por eso la función comprueba a su propio llamante (precedente
--     082): Gerencia activa vía `es_usuario_gerencia()`, si no 42501.
--   - Los jobs pertenecen a `postgres` (verificado 2026-10-05:
--     cron.job.username = 'postgres' en los 5) y `cron.alter_job` sólo deja
--     cambiar un job a su dueño. La función la crea `postgres`, así que
--     dentro de ella `current_user` = 'postgres' y la llamada pasa.
--   - EXECUTE sólo para `authenticated` (la pantalla) y `service_role`;
--     revocado a PUBLIC y `anon`. `search_path = public, pg_temp`.
--   - La hora entra como texto 'HH:MM' validado con regex; el schedule se
--     construye con enteros, nunca concatenando el texto del usuario.
--   - Rechaza una hora que deje dos jobs en el mismo minuto: dos
--     `net.http_post` a la misma edge function en el mismo minuto compiten
--     por la misma instancia (la razón por la que la 102 fue a :50).
--
-- Bogotá es UTC-5 sin horario de verano (precedente 030/060): la hora UTC
-- es la de Bogotá + 5, módulo 24. Un horario después de las 19:00 Bogotá
-- cae en el día siguiente UTC, y el tick sigue tomando "hoy" en Bogotá, así
-- que no cambia la fecha de referencia.
--
-- VERIFICADO CONTRA PRODUCCIÓN el 2026-10-05 (conector de sólo lectura):
--   jobid 4 'hato-alertas-tick' '45 10 * * *', jobid 9
--   'ronda-inventario-tick' '0 12 * * *', ambos active y de `postgres`.
--
-- Administrativa: cero filas de dominio afectadas. La 060 y la 127 NO se
-- editan; sus ficheros describen el horario con que nacieron.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Precondiciones
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_n INTEGER;
BEGIN
  SELECT count(*) INTO v_n FROM cron.job WHERE jobname = 'hato-alertas-tick';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '175 ABORTADA (pre): se esperaba 1 job ''hato-alertas-tick'', hay %', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM cron.job WHERE jobname = 'ronda-inventario-tick';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '175 ABORTADA (pre): se esperaba 1 job ''ronda-inventario-tick'', hay %', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM cron.job
  WHERE jobname IN ('hato-alertas-tick', 'ronda-inventario-tick') AND username <> 'postgres';
  IF v_n <> 0 THEN
    RAISE EXCEPTION '175 ABORTADA (pre): un job de alertas no pertenece a postgres; cron.alter_job fallaría dentro de la función';
  END IF;
  IF to_regprocedure('public.es_usuario_gerencia()') IS NULL THEN
    RAISE EXCEPTION '175 ABORTADA (pre): no existe public.es_usuario_gerencia()';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1. Lectura
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_alertas_horario_listar()
RETURNS TABLE (jobname TEXT, hora_bogota TEXT, activo BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT COALESCE(public.es_usuario_gerencia(), false) THEN
    RAISE EXCEPTION 'Solo Gerencia consulta el horario de las alertas' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    j.jobname::TEXT,
    CASE
      WHEN j.schedule ~ '^[0-9]{1,2} [0-9]{1,2} \* \* \*$' THEN
        lpad((((split_part(j.schedule, ' ', 2)::INT - 5) % 24 + 24) % 24)::TEXT, 2, '0')
        || ':' ||
        lpad(split_part(j.schedule, ' ', 1), 2, '0')
      ELSE NULL  -- un schedule que no es diario no se traduce a una hora
    END,
    j.active
  FROM cron.job j
  WHERE j.jobname IN ('hato-alertas-tick', 'ronda-inventario-tick')
  ORDER BY j.jobname;
END;
$fn$;

-- ---------------------------------------------------------------------
-- 2. Cambio
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_alertas_horario_cambiar(p_jobname TEXT, p_hora TEXT)
RETURNS TABLE (jobname TEXT, hora_bogota TEXT, activo BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_jobid    BIGINT;
  v_hora     INT;
  v_minuto   INT;
  v_schedule TEXT;
  v_choque   TEXT;
BEGIN
  IF NOT COALESCE(public.es_usuario_gerencia(), false) THEN
    RAISE EXCEPTION 'Solo Gerencia cambia el horario de las alertas' USING ERRCODE = '42501';
  END IF;

  IF p_jobname IS NULL OR p_jobname NOT IN ('hato-alertas-tick', 'ronda-inventario-tick') THEN
    RAISE EXCEPTION 'Ese proceso no manda alertas y no se puede reprogramar desde aquí: %', p_jobname
      USING ERRCODE = '22023';
  END IF;

  IF p_hora IS NULL OR p_hora !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
    RAISE EXCEPTION 'Hora inválida: %. Usa HH:MM entre 00:00 y 23:59.', p_hora
      USING ERRCODE = '22023';
  END IF;

  v_hora   := split_part(p_hora, ':', 1)::INT;
  v_minuto := split_part(p_hora, ':', 2)::INT;
  -- Bogotá (UTC-5, sin horario de verano) -> UTC.
  v_schedule := v_minuto::TEXT || ' ' || ((v_hora + 5) % 24)::TEXT || ' * * *';

  SELECT j.jobname INTO v_choque
  FROM cron.job j
  WHERE j.schedule = v_schedule AND j.jobname <> p_jobname
  LIMIT 1;
  IF v_choque IS NOT NULL THEN
    RAISE EXCEPTION 'A las % ya corre otro proceso (%). Elige otro minuto.', p_hora, v_choque
      USING ERRCODE = '22023';
  END IF;

  SELECT j.jobid INTO v_jobid FROM cron.job j WHERE j.jobname = p_jobname;
  IF v_jobid IS NULL THEN
    RAISE EXCEPTION 'No existe el proceso programado %', p_jobname USING ERRCODE = 'P0002';
  END IF;

  PERFORM cron.alter_job(v_jobid, schedule := v_schedule);

  RETURN QUERY SELECT * FROM public.fn_alertas_horario_listar() l WHERE l.jobname = p_jobname;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_alertas_horario_listar() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_alertas_horario_cambiar(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_alertas_horario_listar() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_alertas_horario_cambiar(TEXT, TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. Decisión (1): el tick del hato pasa a 07:30 Bogotá. Se escribe directo
-- (no por la función) porque la migración corre sin JWT de Gerencia.
-- ---------------------------------------------------------------------
SELECT cron.alter_job(jobid, schedule := '30 12 * * *')
FROM cron.job
WHERE jobname = 'hato-alertas-tick';

-- ---------------------------------------------------------------------
-- Postcondiciones
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_schedule TEXT;
  v_active   BOOLEAN;
  v_command  TEXT;
  v_def      BOOLEAN;
BEGIN
  SELECT schedule, active, command INTO v_schedule, v_active, v_command
  FROM cron.job WHERE jobname = 'hato-alertas-tick';
  IF v_schedule <> '30 12 * * *' OR NOT v_active THEN
    RAISE EXCEPTION '175 ABORTADA (post): hato-alertas-tick quedó en ''%'' (active=%)', v_schedule, v_active;
  END IF;
  IF v_command NOT LIKE '%/hato/alertas/tick%' OR v_command NOT LIKE '%x-hato-tick-secret%' THEN
    RAISE EXCEPTION '175 ABORTADA (post): el command de hato-alertas-tick cambió';
  END IF;

  SELECT prosecdef INTO v_def FROM pg_proc WHERE oid = 'public.fn_alertas_horario_cambiar(text,text)'::regprocedure;
  IF NOT v_def THEN
    RAISE EXCEPTION '175 ABORTADA (post): fn_alertas_horario_cambiar no quedó SECURITY DEFINER';
  END IF;
  IF has_function_privilege('anon', 'public.fn_alertas_horario_cambiar(text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_alertas_horario_listar()', 'EXECUTE') THEN
    RAISE EXCEPTION '175 ABORTADA (post): anon conserva EXECUTE sobre las funciones de horario';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_alertas_horario_cambiar(text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION '175 ABORTADA (post): authenticated no tiene EXECUTE sobre fn_alertas_horario_cambiar';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- Verificación manual después de aplicar:
--   SELECT jobname, schedule, active FROM cron.job
--   WHERE jobname IN ('hato-alertas-tick', 'ronda-inventario-tick');
--   -- esperado: '30 12 * * *' y '0 12 * * *'
--
-- ROLLBACK (ejecutable):
--   SELECT cron.alter_job(jobid, schedule := '45 10 * * *')
--   FROM cron.job WHERE jobname = 'hato-alertas-tick';
--   DROP FUNCTION IF EXISTS public.fn_alertas_horario_cambiar(TEXT, TEXT);
--   DROP FUNCTION IF EXISTS public.fn_alertas_horario_listar();
-- ---------------------------------------------------------------------
