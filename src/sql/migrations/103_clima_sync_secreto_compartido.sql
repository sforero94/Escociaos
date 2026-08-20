-- =====================================================================
-- 103: El cron de clima manda un secreto compartido
-- Fecha: 2026-08-20
--
-- Cierra la parte de clima del hallazgo ESCO-1 (P1, corrida
-- 2026-08-03-lunes): la edge function `make-server-1ccce916` corre con
-- verify_jwt=false y las rutas `/clima/sync` y `/clima/backfill` no leian
-- NINGUN encabezado. La verificacion del hallazgo lo confirmo desde el
-- lado del cron: el job `clima-sync-wu` (jobid 1, migracion 030) postea
-- con SOLO 'Content-Type' -- sin apikey y sin Authorization -- y recibe
-- 200 con escritura efectiva. Es decir, la exposicion era ANONIMA DESDE
-- INTERNET, no "cualquiera con el anon key".
--
-- No se puede arreglar activando verify_jwt: el webhook de Telegram y los
-- pg_cron (060 hato-alertas-tick, 102 acciones-tick) dependen de que siga
-- en false. La puerta va dentro del handler.
--
-- Esta migracion es la MITAD del arreglo: reprograma el job para que mande
-- `x-clima-sync-secret`. La otra mitad es el gate `verificarAccesoClima`
-- en `clima.tsx` (doble puerta: secreto compartido o JWT + Gerencia),
-- calcado de `acciones-tick.ts`.
--
-- NO se edita la migracion 030 (regla del proyecto: una migracion aplicada
-- no se toca). `cron.schedule()` hace upsert POR NOMBRE, asi que reusar
-- 'clima-sync-wu' reemplaza el job existente en su lugar -- mismo criterio
-- que ya uso la 068 para reprogramar 'clima-daily-rollup'. El horario
-- ('*/5 * * * *') y la URL se reproducen VERBATIM de lo que hay hoy en
-- `cron.job`; lo unico que cambia es el header.
--
-- Secreto compartido: `x-clima-sync-secret` se resuelve en tiempo de
-- disparo desde Supabase Vault (vault.decrypted_secrets) por NOMBRE -- el
-- valor NUNCA queda escrito en este archivo, que si se versiona en git.
-- El secreto se crea fuera de banda (no en una migracion) con:
--
--   SELECT vault.create_secret('<valor-aleatorio>', 'clima_sync_secret');
--
-- y el MISMO valor se configura como secreto de edge function
-- CLIMA_SYNC_SECRET (Supabase Dashboard -> Project Settings -> Edge
-- Functions).
--
-- ORDEN DE APLICACION (importante, es un cron cada 5 minutos):
--   1. crear el secreto en Vault  (`vault.create_secret`)
--   2. configurar CLIMA_SYNC_SECRET en los secretos de la edge function
--   3. aplicar ESTA migracion
--   4. `npx supabase functions deploy make-server-1ccce916`
--
-- Los pasos 1-3 son inofensivos con el codigo desplegado HOY: el endpoint
-- viejo ignora el header nuevo y sigue respondiendo 200. Recien el paso 4
-- empieza a exigirlo. Hecho en ese orden no hay ni una corrida perdida.
-- Al reves (deploy antes que la migracion) el cron responderia 401 cada 5
-- minutos hasta que se aplique -- falla CERRADO, que es lo correcto para
-- un endpoint que escribe, pero deja hueco en `clima_lecturas`.
--
-- Idempotente: seguro de re-ejecutar (cron.schedule upsert por jobname).
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

SELECT cron.schedule(
  'clima-sync-wu',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ywhtjwawnkeqlwxbvgup.supabase.co/functions/v1/make-server-1ccce916/clima/sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-clima-sync-secret',
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'clima_sync_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Guarda: si el secreto no existe en Vault, el subselect devuelve NULL, el
-- header viaja vacio y el endpoint respondera 401/503 cada 5 minutos. Se
-- avisa fuerte aca en vez de dejarlo pasar en silencio -- no es EXCEPTION
-- porque la migracion en si es correcta y puede aplicarse antes de crear
-- el secreto; lo que no puede es desplegarse la edge function antes.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'clima_sync_secret') THEN
    RAISE WARNING 'El secreto de Vault "clima_sync_secret" NO existe todavia. Crealo con vault.create_secret(...) y configura CLIMA_SYNC_SECRET en la edge function ANTES de desplegar make-server-1ccce916, o el cron de clima empezara a fallar con 401.';
  END IF;
END $$;

-- =============================================================================
-- ROLLBACK (manual) -- vuelve el job al estado de la migracion 030, sin
-- header. Solo tiene sentido si TAMBIEN se revierte el deploy de la edge
-- function; con el gate desplegado, este rollback deja el cron en 401.
--
--   SELECT cron.schedule(
--     'clima-sync-wu',
--     '*/5 * * * *',
--     $ROLLBACK$
--     SELECT net.http_post(
--       url := 'https://ywhtjwawnkeqlwxbvgup.supabase.co/functions/v1/make-server-1ccce916/clima/sync',
--       headers := '{"Content-Type": "application/json"}'::jsonb,
--       body := '{}'::jsonb
--     );
--     $ROLLBACK$
--   );
-- =============================================================================
