-- =====================================================================
-- 121: Reintento diario de días de clima sin dato confiable
-- Fecha: 2026-08-26
--
-- Pedido directo del dueño: "no quiero que registre null ni invente el 0.
-- Quiero que haga backfill del día una vez la estación recupere conexión y
-- se pueda consultar el dato real que sí existe en Ecowitt."
--
-- El rollup nocturno (068/103/115) ya hace la mitad correcta: cuando el día
-- llega incompleto o con el contador de lluvia congelado, escribe NULL en
-- vez de inventar un cero o un duplicado. Lo que faltaba es la otra mitad:
-- si la estación se reconecta y Ecowitt SÍ tiene el dato completo en su
-- propia nube (buffer local que se sube al volver la luz/el internet), acá
-- nada volvía a mirar ese día -- quedaba en `sin_dato` para siempre aunque
-- el dato real ya estuviera disponible del otro lado de la API.
--
-- Este archivo agrega el pg_cron. La lógica del reintento vive en el edge
-- function (`clima.tsx`, handler `handleClimaReintentoSinDato`) porque
-- necesita llamar la History API de Ecowitt -- SQL no hace peticiones HTTP
-- salientes por su cuenta, sólo a través de `net.http_post` hacia edge
-- functions propias, igual que el resto de los cron de este módulo (030,
-- 060, 068, 102, 105).
--
-- IMPORTANTE -- de paso, `handleClimaReintentoSinDato` (y el propio
-- `/clima/backfill`, que se reescribió en el mismo commit) dejaron de tener
-- su propia clasificación de confianza en TypeScript
-- (`aggregateReadingsToDaily`, que NO aplicaba ninguno de los chequeos de
-- 068/103/115 -- un backfill viejo podía escribir 'ok' sobre un día con el
-- contador congelado). Ahora ambos insertan las lecturas crudas en
-- `clima_lecturas` y llaman al RPC `fn_clima_rollup_diario(p_fecha)` --
-- la MISMA función que corre el cron nocturno -- así que sólo hay UN lugar
-- en todo el sistema que decide `lluvia_confianza`. Backfill manual,
-- reintento automático y rollup nocturno concuerdan siempre, por
-- construcción, no por disciplina de mantenerlos sincronizados a mano.
--
-- Reutiliza el secreto compartido de la 105 (`CLIMA_SYNC_SECRET` /
-- `clima_sync_secret` en Vault) -- el nuevo endpoint pasa por la misma
-- puerta `verificarAccesoClima` que ya protege `/clima/sync` y
-- `/clima/backfill`, no hace falta un secreto nuevo.
--
-- Horario: 06:00 Bogotá (11:00 UTC) -- después del rollup nocturno (00:15
-- Bogotá, migración 068) para que el resumen de ayer ya exista, y separado
-- por >10 min de hato-alertas-tick (05:45, migración 060) y acciones-tick
-- (05:50, migración 102) para que no compitan por la misma instancia de la
-- edge function en el mismo minuto (mismo criterio que dejó escrito la
-- 102). Una vez al día alcanza: no es una alerta urgente, es un
-- autocorrector de historia -- si la estación tarda varios días en
-- reconectar, la ventana de `DIAS_REINTENTO_SIN_DATO = 21` (definida en
-- `clima.tsx`) lo sigue cubriendo en la corrida del día siguiente.
--
-- Idempotente: `cron.schedule` hace upsert por nombre de job, y el reintento
-- en sí es seguro de re-ejecutar -- si un día ya está 'ok' no vuelve a
-- pedirlo (ver el filtro en `handleClimaReintentoSinDato`).
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

SELECT cron.schedule(
  'clima-reintento-sin-dato',
  '0 11 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ywhtjwawnkeqlwxbvgup.supabase.co/functions/v1/make-server-1ccce916/clima/reintentar-sin-dato',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-clima-sync-secret',
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'clima_sync_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Misma guarda que dejó la 105: si el secreto no existe todavía, el header
-- viaja vacío y el endpoint responde 503 (fail-closed, nunca corre
-- "abierto") en vez de fallar en silencio. El secreto ya debería existir en
-- este punto (se creó para la 105) -- esto es una red de seguridad, no se
-- espera que dispare.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'clima_sync_secret') THEN
    RAISE WARNING 'El secreto de Vault "clima_sync_secret" no existe -- el reintento diario de clima responderá 503 hasta que se cree (ver migración 105).';
  END IF;
END $$;

-- =============================================================================
-- ROLLBACK (manual)
--   SELECT cron.unschedule('clima-reintento-sin-dato');
-- =============================================================================
