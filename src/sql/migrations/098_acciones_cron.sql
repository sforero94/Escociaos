-- =====================================================================
-- 098: Cron diario del tick del motor de acciones recomendadas
-- Fecha: 2026-08-17
--
-- Parte de la Fase 2 del motor de acciones recomendadas (bloque 4 del
-- Centro de Control) -- docs/brief_tecnico_motor_acciones.md §2.2, §10
-- Fase 2. Depende de 097 (`acciones_corridas`/`acciones_recomendadas`/
-- `acciones_silencios`/`revisiones_periodicas`), que todavía NO está
-- aplicada -- se aplican juntas o esta queda como 404 benigno, mismo
-- criterio de "seguro programar antes de que el endpoint exista" que ya usó
-- 060.
--
-- Programa un pg_cron diario a las 05:50 America/Bogota que llama al
-- endpoint /acciones/tick de la edge function -- CALCADO de la migración
-- 060 (hato-alertas-tick), no un patrón nuevo. Bogotá es UTC-5 sin horario
-- de verano (mismo cálculo que 030/036/060), así que 05:50 Bogotá = 10:50
-- UTC → '50 10 * * *'.
--
-- Por qué 05:50 y no 05:45 (mismo minuto que 060): dos `net.http_post` a la
-- MISMA edge function en el mismo minuto compiten por la misma instancia y
-- por el mismo presupuesto de pared sin ninguna necesidad -- 060 ya ocupa
-- el minuto 45 (`hato-alertas-tick`, '45 10 * * *'). Cinco minutos después
-- es gratis y elimina la carrera (brief §2.2, "Por qué 05:50 y no 05:45").
--
-- cron.schedule() hace upsert por jobname (mismo nombre = reemplaza el job
-- existente), así que esta migración es idempotente sin necesidad de un
-- unschedule previo -- igual que 030, 036 y 060.
--
-- Secreto compartido: `x-acciones-tick-secret` se resuelve en tiempo de
-- disparo desde Supabase Vault (vault.decrypted_secrets) por NOMBRE -- el
-- valor del secreto NUNCA queda escrito en este archivo (que sí se
-- versiona en git). El secreto se crea fuera de banda (no en una
-- migración) con:
--
--   SELECT vault.create_secret('<valor-aleatorio>', 'acciones_tick_secret');
--
-- y el MISMO valor se configura como secreto de edge function
-- ACCIONES_TICK_SECRET (Supabase Dashboard → Project Settings → Edge
-- Functions) cuando se despliegue `acciones-tick.ts`.
--
-- ¿Es seguro programarlo ya, si /acciones/tick puede no estar desplegado
-- todavía en este entorno? Sí, explícitamente, mismo argumento que 060:
-- hasta que el handler esté desplegado, el POST diario devuelve 404
-- (pg_net registra la respuesta en net._http_response y no pasa nada más)
-- -- ningún dato mutado, ningún error visible para usuarios. Si el secreto
-- de Vault todavía no existe, el subselect devuelve NULL y el header viaja
-- vacío; el endpoint responde 503 (nunca corre "abierto") o 401, nunca 200
-- con un secreto ausente.
--
-- Idempotente: seguro de re-ejecutar (cron.schedule upsert por jobname).
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

SELECT cron.schedule(
  'acciones-recomendadas-tick',
  '50 10 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ywhtjwawnkeqlwxbvgup.supabase.co/functions/v1/make-server-1ccce916/acciones/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-acciones-tick-secret',
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'acciones_tick_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- =============================================================================
-- ROLLBACK (manual)
--   SELECT cron.unschedule('acciones-recomendadas-tick');
-- Sin estado que preservar: desprogramar el job no borra ninguna fila de
-- 097 -- las corridas ya persistidas quedan intactas, sólo deja de crearse
-- una nueva cada madrugada.
-- =============================================================================
