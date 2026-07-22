-- =====================================================================
-- 060: Cron diario del tick de alertas del hato
-- Fecha: 2026-07-22
--
-- Parte del PR único de S1 (hato) — plan docs/plan_hato_lechero_module.md
-- §7.1–7.2, renumerado 050→053…057→060 (ver brief S1, Decisión 1).
--
-- Programa un pg_cron diario a las 05:45 America/Bogota que llama al
-- endpoint /hato/alertas/tick de la edge function (patrón 030). Bogotá
-- es UTC-5 sin horario de verano (mismo cálculo que 030/036), así que
-- 05:45 Bogotá = 10:45 UTC → '45 10 * * *'.
--
-- cron.schedule() hace upsert por jobname (mismo nombre = reemplaza el
-- job existente), así que esta migración es idempotente sin necesidad de
-- un unschedule previo — igual que 030 y 036.
--
-- Secreto compartido: el tick envía mensajes salientes de Telegram, a
-- diferencia del sync de clima (030), que no necesita autenticación
-- porque es una lectura inofensiva. Por eso el header x-hato-tick-secret
-- se resuelve en tiempo de disparo desde Supabase Vault
-- (vault.decrypted_secrets) por NOMBRE — el valor del secreto nunca
-- queda escrito en este archivo (que sí se versiona en git). El secreto
-- se crea fuera de banda (no en una migración) con:
--
--   SELECT vault.create_secret('<valor-aleatorio>', 'hato_alertas_tick_secret');
--
-- y el MISMO valor se configura como secreto de edge function
-- HATO_ALERTAS_TICK_SECRET cuando S6 implemente el endpoint.
--
-- ¿Es seguro programarlo ya, si /hato/alertas/tick no existe hasta S6?
-- Sí, explícitamente: hasta que S6 despliegue el handler, el POST diario
-- devuelve 404 (pg_net registra la respuesta en net._http_response y no
-- pasa nada más) — no hay Telegram saliente (no hay handler), ningún
-- error visible para usuarios, ningún dato mutado. Si el secreto de
-- Vault todavía no existe, el subselect devuelve NULL y el header viaja
-- vacío; el endpoint igual devuelve 404. Este "404 diario benigno" es el
-- estado transitorio esperado hasta que S6 cierre.
--
-- Idempotente: seguro de re-ejecutar (cron.schedule upsert por jobname).
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

SELECT cron.schedule(
  'hato-alertas-tick',
  '45 10 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ywhtjwawnkeqlwxbvgup.supabase.co/functions/v1/make-server-1ccce916/hato/alertas/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-hato-tick-secret',
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'hato_alertas_tick_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
