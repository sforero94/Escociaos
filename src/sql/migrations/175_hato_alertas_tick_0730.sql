-- =====================================================================
-- 175: hato_alertas_tick_0730 -- mueve el tick diario de alertas del hato
-- de 05:45 a 07:30 hora de Colombia. Fecha: 2026-10-05.
--
-- DECISIÓN DEL DUEÑO (2026-10-05, sesión en vivo): "cambiemos la hora de
-- envio de notificaciones de 5:45 am a 7:30 am". Desde la 172 las alertas
-- de gerencia (parto_proximo, servicio_sin_confirmacion) también salen por
-- Telegram a Martha y Santiago, y a las 05:45 llegan antes de que nadie las
-- pueda atender.
--
-- Bogotá es UTC-5 sin horario de verano (precedente 030/060), así que
-- 07:30 Bogotá = '30 12 * * *' en UTC. El minuto está libre: los otros
-- jobs vivos son '*/5' (clima-sync-wu), '15 5' (clima-daily-rollup),
-- '0 11' (clima-reintento-sin-dato) y '0 12' (ronda-inventario-tick, 07:00
-- Bogotá). 12:30 queda 30 minutos después de ese último, así que dos
-- `net.http_post` a la misma edge function nunca compiten en el mismo
-- minuto (la razón por la que la 102 fue a :50 y no a :45).
--
-- SÓLO cambia el horario. `cron.alter_job` con `schedule :=` deja intactos
-- el `command`, el endpoint `/hato/alertas/tick` y la lectura del secreto
-- `x-hato-tick-secret` desde Vault -- nada se reescribe a mano. El job se
-- busca por NOMBRE, nunca por el jobid memorizado (precedente 156).
--
-- No cambia ninguna regla: la "fecha de hoy" del tick sigue siendo el
-- mismo día de Bogotá (12:30 UTC = 07:30 del mismo día), y el
-- escalamiento por horas se mide desde `enviada_en`, no desde la hora del
-- cron. El primer tick con el horario nuevo corre el día siguiente a
-- aplicar si se aplica después de las 12:30 UTC, o el mismo día si antes.
--
-- VERIFICADO CONTRA PRODUCCIÓN el 2026-10-05 (conector de sólo lectura):
--   jobid 4, jobname 'hato-alertas-tick', schedule '45 10 * * *',
--   active = true, único job con ese nombre.
--
-- Administrativa: cero filas de dominio afectadas. La migración 060 NO se
-- edita (regla del proyecto); su archivo sigue diciendo '45 10 * * *'
-- porque describe lo que esa migración hizo, no el horario de hoy.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Precondiciones
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_jobs     INTEGER;
  v_schedule TEXT;
BEGIN
  SELECT count(*) INTO v_jobs FROM cron.job WHERE jobname = 'hato-alertas-tick';
  IF v_jobs <> 1 THEN
    RAISE EXCEPTION '175 ABORTADA (pre): se esperaba exactamente 1 cron.job ''hato-alertas-tick'', hay %', v_jobs;
  END IF;

  SELECT schedule INTO v_schedule FROM cron.job WHERE jobname = 'hato-alertas-tick';
  IF v_schedule <> '45 10 * * *' THEN
    RAISE EXCEPTION '175 ABORTADA (pre): el schedule vivo es ''%'', se esperaba ''45 10 * * *'' -- ¿ya se aplicó, o alguien lo movió a mano?', v_schedule;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE schedule = '30 12 * * *') THEN
    RAISE EXCEPTION '175 ABORTADA (pre): ya hay un cron.job en ''30 12 * * *'' -- elegir otro minuto.';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1. Cambiar sólo el horario -- por NOMBRE.
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
BEGIN
  SELECT schedule, active, command INTO v_schedule, v_active, v_command
  FROM cron.job WHERE jobname = 'hato-alertas-tick';

  IF v_schedule <> '30 12 * * *' THEN
    RAISE EXCEPTION '175 ABORTADA (post): el schedule quedó en ''%''', v_schedule;
  END IF;
  IF NOT v_active THEN
    RAISE EXCEPTION '175 ABORTADA (post): el job quedó inactivo';
  END IF;
  IF v_command NOT LIKE '%/hato/alertas/tick%' OR v_command NOT LIKE '%x-hato-tick-secret%' THEN
    RAISE EXCEPTION '175 ABORTADA (post): el command del job ya no apunta a /hato/alertas/tick con x-hato-tick-secret';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- Verificación manual después de aplicar:
--   SELECT jobid, jobname, schedule, active FROM cron.job
--   WHERE jobname = 'hato-alertas-tick';
--   -- esperado: schedule '30 12 * * *', active true
--
--   -- Al día siguiente, confirmar que el tick corrió a la hora nueva:
--   SELECT ejecutado_at, estado FROM hato_alertas_tick_runs
--   ORDER BY ejecutado_at DESC LIMIT 2;
--   -- esperado: ejecutado_at ~12:30 UTC
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- ROLLBACK (ejecutable): vuelve a 05:45 Bogotá.
--   SELECT cron.alter_job(jobid, schedule := '45 10 * * *')
--   FROM cron.job WHERE jobname = 'hato-alertas-tick';
-- ---------------------------------------------------------------------
