-- =====================================================================
-- 156: retirar_acciones_recomendadas -- issue #266. Desprograma el cron
-- diario del motor de "acciones recomendadas" (jobid 6, 'acciones-
-- recomendadas-tick'), que "Novedades" reemplaza en el Tablero General.
-- Fecha: 2026-09-17.
--
-- DECISIÓN DEL DUEÑO (2026-09-17): el código del motor NO SE BORRA -- se
-- archiva íntegro, sin tocar, en `archive/acciones-recomendadas/` (frontend,
-- las 2×9 edge functions, los 11 tests, el script de paridad). Sólo esta
-- migración toca producción: apaga el cron que lo alimentaba. El "cómo
-- recrearlo" completo, incluida la sentencia `cron.schedule` literal, vive
-- en `docs/archive/implementation/motor_acciones_recomendadas_retiro.md`
-- (pedido explícito del dueño: "document how to recreate it within the
-- archived documentation") y se repite al pie de este archivo como ROLLBACK
-- ejecutable -- las dos copias tienen que decir lo mismo.
--
-- Por qué se apaga por NOMBRE y no por el jobid=6 memorizado: es el mismo
-- error de clase que el literal `1910` de la 103 y el `4000` de la 120 --
-- un número copiado de un documento puede no ser el vivo. Se relee jobid
-- desde `cron.job` en el momento de aplicar.
--
-- VERIFICADO CONTRA PRODUCCIÓN el 2026-09-17, inmediatamente antes de
-- escribir este archivo (conector de sólo lectura):
--   jobid 6, jobname 'acciones-recomendadas-tick', schedule '50 10 * * *',
--   active = true, único job con ese nombre. El `command` exacto (para que
--   el ROLLBACK sea literal, no reconstruido de memoria) llama
--   `net.http_post` a
--   .../functions/v1/make-server-1ccce916/acciones/tick con el secreto
--   `acciones_tick_secret` leído de `vault.decrypted_secrets` en el
--   encabezado `x-acciones-tick-secret`.
--
-- No se toca ninguna tabla de dominio -- `acciones_corridas`,
-- `acciones_recomendadas`, `acciones_silencios` y `revisiones_periodicas`
-- (migración 101) se conservan exactamente como quedaron: son la única
-- evidencia de las corridas históricas del motor. Sólo reciben un
-- `COMMENT ON TABLE` que fecha el retiro y enlaza a la documentación
-- archivada -- mismo precedente que la 128 con `vista_resumen_verificaciones`.
--
-- Aditiva/administrativa: cero filas de dominio afectadas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Precondiciones
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_jobs INTEGER;
BEGIN
  SELECT count(*) INTO v_jobs FROM cron.job WHERE jobname = 'acciones-recomendadas-tick';
  IF v_jobs = 0 THEN
    RAISE EXCEPTION '156 ABORTADA (pre): no existe ningún cron.job llamado ''acciones-recomendadas-tick'' -- ¿ya se aplicó esta migración?';
  END IF;
  IF v_jobs > 1 THEN
    RAISE EXCEPTION '156 ABORTADA (pre): hay % jobs llamados ''acciones-recomendadas-tick'', se esperaba exactamente 1 -- revisar a mano antes de desprogramar.', v_jobs;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1. Desprogramar el cron -- por NOMBRE, nunca por un jobid memorizado.
-- ---------------------------------------------------------------------
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'acciones-recomendadas-tick';

-- ---------------------------------------------------------------------
-- 2. Dejar constancia en las tablas del motor -- se conservan, nunca se
-- borran (§11.2 del plan técnico de Novedades: son la única evidencia de
-- las corridas históricas).
-- ---------------------------------------------------------------------
COMMENT ON TABLE acciones_corridas IS
  'Motor de "acciones recomendadas" RETIRADO 2026-09-17 (issue #266, reemplazado por Novedades). Tabla conservada como evidencia histórica -- nunca se borra. Código archivado en archive/acciones-recomendadas/; ver docs/archive/implementation/motor_acciones_recomendadas_retiro.md.';
COMMENT ON TABLE acciones_recomendadas IS
  'Motor de "acciones recomendadas" RETIRADO 2026-09-17 (issue #266, reemplazado por Novedades). Tabla conservada como evidencia histórica -- nunca se borra. Código archivado en archive/acciones-recomendadas/; ver docs/archive/implementation/motor_acciones_recomendadas_retiro.md.';
COMMENT ON TABLE acciones_silencios IS
  'Motor de "acciones recomendadas" RETIRADO 2026-09-17 (issue #266, reemplazado por Novedades). Tabla conservada como evidencia histórica -- nunca se borra. Código archivado en archive/acciones-recomendadas/; ver docs/archive/implementation/motor_acciones_recomendadas_retiro.md.';
COMMENT ON TABLE revisiones_periodicas IS
  'Huérfano O-8 del motor de "acciones recomendadas", RETIRADO 2026-09-17 (issue #266). Destino declarado: trasladarse a Salud de los datos en una pasada posterior (docs/plan_novedades.md §7) -- no se borra ni se reinterpreta acá.';

-- ---------------------------------------------------------------------
-- Postcondiciones
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_jobs INTEGER;
BEGIN
  SELECT count(*) INTO v_jobs FROM cron.job WHERE jobname = 'acciones-recomendadas-tick';
  IF v_jobs <> 0 THEN
    RAISE EXCEPTION '156 ABORTADA (post): todavía queda % job(s) ''acciones-recomendadas-tick'' -- el unschedule no surtió efecto.', v_jobs;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_description d
    JOIN pg_class c ON c.oid = d.objoid
    WHERE c.relname = 'acciones_recomendadas' AND d.description LIKE 'Motor de "acciones recomendadas" RETIRADO%'
  ) THEN
    RAISE EXCEPTION '156 ABORTADA (post): acciones_recomendadas no quedó con el comentario de retiro.';
  END IF;

  RAISE NOTICE '156 OK: cron ''acciones-recomendadas-tick'' desprogramado; las 4 tablas del motor quedaron comentadas con la fecha de retiro, ninguna fila tocada.';
END $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (ejecutable, si hubiera que revertir -- recrea el job LITERAL
-- verificado contra producción el 2026-09-17, mismo texto que
-- docs/archive/implementation/motor_acciones_recomendadas_retiro.md; el
-- código del endpoint sigue intacto en archive/acciones-recomendadas/ y
-- tendría que restaurarse a src/supabase/functions/server/ +
-- supabase/functions/make-server-1ccce916/ + re-registrar la ruta en
-- index.tsx/index.ts + redesplegar ANTES de que este cron vuelva a llamarla,
-- o el tick va a fallar contra una ruta que no existe):
--
--   SELECT cron.schedule(
--     'acciones-recomendadas-tick',
--     '50 10 * * *',
--     $job$
--       SELECT net.http_post(
--         url := 'https://ywhtjwawnkeqlwxbvgup.supabase.co/functions/v1/make-server-1ccce916/acciones/tick',
--         headers := jsonb_build_object(
--           'Content-Type', 'application/json',
--           'x-acciones-tick-secret',
--             (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'acciones_tick_secret')
--         ),
--         body := '{}'::jsonb,
--         timeout_milliseconds := 30000
--       );
--     $job$
--   );
-- ---------------------------------------------------------------------------
