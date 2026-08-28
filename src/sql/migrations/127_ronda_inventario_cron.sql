-- Migración 127: cron + catálogo de alertas de la "ronda de inventario" --
-- Fase 5 (recordatorio, alerta del día 15, reporte de cierre) de
-- docs/brief_tecnico_verificacion_inventario.md §8/§13, sobre el esquema
-- (125) y los RPC (126, corregida por 130) ya aplicados.
--
-- Dos piezas, ninguna nueva en su forma -- ambas calcan un patrón ya
-- aplicado en este repo:
--   1. Siembra de `alertas_catalogo` (migración 096) con las TRES claves de
--      §3.4 del brief técnico -- `inventario.ronda_recordatorio` (Uriel),
--      `inventario.revision_dia_15` (Santiago) y `inventario.reporte_cierre`
--      (Santiago). Verificado contra el catálogo vivo antes de escribir este
--      archivo (ver la nota de la sesión): la tabla existe (096, aplicada) y
--      hoy NO tiene ninguna fila con `modulo = 'inventario'`. Sin estas tres
--      filas, `telegram_alertas_suscripciones.alerta_clave` (FK a
--      `alertas_catalogo.clave`, ON DELETE CASCADE) no tiene contra qué
--      suscribir a nadie -- la pantalla de configuración de Telegram
--      construye sus casillas a partir de este catálogo (CLAUDE.md: "Adding
--      an alert for aguacate or ganado is an INSERT, not a code change").
--   2. `cron.schedule('ronda-inventario-tick', '0 12 * * *', ...)` -- pg_cron
--      diario a las 07:00 Bogotá (UTC-5 fijo, sin horario de verano, mismo
--      cálculo que 030/036/060/102/105/121), calcado LITERAL de 102/121:
--      `net.http_post` al endpoint del tick con el secreto compartido
--      resuelto en tiempo de disparo desde Supabase Vault por NOMBRE (nunca
--      en este archivo). `cron.schedule` hace upsert por `jobname`, así que
--      es idempotente sin `unschedule` previo.
--
-- POR QUÉ 07:00 (§8.2 del brief técnico, literal): "Los tres minutos vecinos
-- están ocupados: 05:45 hato-alertas-tick (060), 05:50
-- acciones-recomendadas-tick (102), 06:00 clima-reintentar-sin-dato (121)."
-- Y además: "este tick es el único de los cuatro cuya salida es un mensaje
-- que un humano debe accionar ese mismo día" -- un recordatorio a las 05:45
-- se pierde entre notificaciones nocturnas, uno a las 07:00 no.
--
-- ⚠️ LO QUE ESTA SESIÓN **NO** PUDO COMPROBAR EN VIVO -- a diferencia de lo
-- que el CLAUDE.md pide ("lee `cron.job` antes de escribir la migración, no
-- asumas"), esta sesión no tuvo un conector de Supabase disponible. El
-- horario 07:00/'0 12 * * *' se tomó del §8.2 del brief técnico (que sí
-- declara haberlo verificado el 2026-08-28) y de la lista de jobs que el
-- CLAUDE.md raíz documenta con sus horarios exactos -- ninguna de las dos
-- fuentes es el catálogo vivo. La guarda 0.3 de abajo hace la comprobación
-- real EN TIEMPO DE APLICAR: aborta si ya existe un job en ese minuto/hora o
-- con ese nombre. **Repetir la consulta a `cron.job` inmediatamente antes de
-- aplicar sigue siendo obligatorio** (mismo aviso que 125/126 ya dejaron) --
-- la guarda es una red de seguridad, no un sustituto de mirar el catálogo.
--
-- Es SEGURO aplicar esto antes de que el endpoint (`ronda-inventario-tick.ts`)
-- esté desplegado -- mismo argumento que 060/102/121: hasta el despliegue el
-- POST diario devuelve 404 (pg_net lo registra en `net._http_response`, no
-- pasa nada más). Y como el endpoint es NUEVO -- no un gate sobre uno
-- existente --, no hay ninguna versión desplegada que un `functions deploy`
-- de otra cosa pueda activar sola (la lección de la mina de la 105, que el
-- propio CLAUDE.md documenta, no aplica acá).
--
-- ORDEN DE PUESTA EN MARCHA, obligatorio (§8.2 del brief técnico, literal):
--   1. crear el secreto en Vault (`inventario_tick_secret`)
--   2. configurarlo como secreto de edge function (`INVENTARIO_TICK_SECRET`)
--   3. aplicar ESTA migración
--   4. desplegar `ronda-inventario-tick.ts`
-- Los pasos 1-3 son inofensivos sin el 4.
--
-- NO SE APLICA DESDE ESTE AGENTE. Queda escrita y verificada estructuralmente
-- para que el dueño la aplique tras su revisión, mismo protocolo que
-- 124/125/126/130.
--
-- Estilo de guardas: precondiciones (0.x) con RAISE EXCEPTION, postcondición
-- (2.x) que comprueba forma/contenido -- nada idempotente a propósito salvo
-- el propio `cron.schedule` (que YA es upsert por diseño de pg_cron, 030 en
-- adelante), precedente 124/125/126.
--
-- ROLLBACK ejecutable comentado al pie (mismo patrón que 080/081/099/121).
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 0. PRECONDICIONES
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_filas_inventario INTEGER;
  v_job_mismo_horario TEXT;
BEGIN
  -- 0.1 alertas_catalogo debe existir (096).
  IF to_regclass('public.alertas_catalogo') IS NULL THEN
    RAISE EXCEPTION '127 ABORTADA: public.alertas_catalogo no existe -- la migración 096 debe estar aplicada antes que ésta.';
  END IF;

  -- 0.2 Ninguna de las tres claves puede existir ya -- si alguna existe, es
  --     evidencia de que esta migración (u otra) ya sembró el catálogo de
  --     inventario, y hay que revisar a mano en vez de pisarlo en silencio
  --     (mismo criterio que 125/126 para sus propios objetos nuevos).
  SELECT count(*) INTO v_filas_inventario FROM alertas_catalogo WHERE modulo = 'inventario';
  IF v_filas_inventario <> 0 THEN
    RAISE EXCEPTION '127 ABORTADA: alertas_catalogo ya tiene % fila(s) con modulo=''inventario'' -- revisar a mano antes de continuar (¿esta migración ya se aplicó con otro número?).', v_filas_inventario;
  END IF;

  -- 0.3 pg_cron/pg_net deben existir para poder consultar cron.job (si pg_cron
  --     todavía no está instalado, CREATE EXTENSION de la sección 2 lo
  --     resuelve -- pero la guarda de colisión de abajo necesita `cron.job`
  --     legible AHORA para decidir si aborta).
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE '127: pg_cron todavía no está instalado en este entorno -- no hay ningún job con el que colisionar. La sección 2 lo instala.';
  ELSE
    -- Ningún job puede llamarse igual (cron.schedule haría upsert en vez de
    -- fallar, así que esto es informativo más que bloqueante -- pero un
    -- 'ronda-inventario-tick' preexistente con OTRO contenido sería
    -- sospechoso, no una re-aplicación limpia).
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ronda-inventario-tick') THEN
      RAISE EXCEPTION '127 ABORTADA: ya existe un cron.job llamado ''ronda-inventario-tick'' -- revisar su contenido a mano antes de sobrescribirlo (cron.schedule hace upsert; esta guarda existe para que ese upsert sea una decisión, no un accidente).';
    END IF;

    -- Colisión de HORARIO: dos jobs que llaman a la MISMA edge function en el
    -- MISMO minuto compiten por la misma instancia sin ninguna necesidad --
    -- literal del razonamiento que ya dejaron 102 y 121 para sus propios
    -- horarios. '0 12 * * *' = 07:00 Bogotá.
    SELECT jobname INTO v_job_mismo_horario FROM cron.job WHERE schedule = '0 12 * * *' LIMIT 1;
    IF v_job_mismo_horario IS NOT NULL THEN
      RAISE EXCEPTION '127 ABORTADA: ya existe un cron.job (%) programado exactamente a ''0 12 * * *'' (07:00 Bogotá) -- elegir otro minuto libre antes de continuar. Esta migración NO se escribió con acceso al catálogo vivo (ver cabecera); esta guarda es la comprobación real.', v_job_mismo_horario;
    END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Siembra de alertas_catalogo -- §3.4 del brief técnico, LITERAL.
-- ---------------------------------------------------------------------------

INSERT INTO alertas_catalogo (clave, modulo, nombre, descripcion, orden, activo)
VALUES
  ('inventario.ronda_recordatorio', 'inventario', 'Recordatorio de la ronda mensual',
   'Aviso para empezar la ronda de inventario del mes (día 1, o el día al que se pospuso). Va a Uriel.',
   1, TRUE),
  ('inventario.revision_dia_15', 'inventario', 'Revisión del día 15 -- mes omitido y excepciones vencidas',
   'Un solo aviso con hasta dos bloques: la ronda del mes no se cerró, y/o hay excepciones abiertas hace más de 30 días. Va a Santiago.',
   2, TRUE),
  ('inventario.reporte_cierre', 'inventario', 'Reporte de cierre de ronda',
   'Resumen al cerrar cada ronda: excepciones por desenlace, movimientos con la ronda abierta, observaciones de Uriel y (si el catálogo de precios está saneado) valor total del inventario. Va a Santiago.',
   3, TRUE);

-- ---------------------------------------------------------------------------
-- 2. Cron diario -- 07:00 Bogotá = '0 12 * * *' (§8.2 del brief técnico).
--    Calcado LITERAL de 102/121: net.http_post con el secreto resuelto desde
--    Vault por nombre, cron.schedule hace upsert por jobname.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

SELECT cron.schedule(
  'ronda-inventario-tick',
  '0 12 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ywhtjwawnkeqlwxbvgup.supabase.co/functions/v1/make-server-1ccce916/inventario/ronda/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-inventario-tick-secret',
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'inventario_tick_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ---------------------------------------------------------------------------
-- 3. POSTCONDICIONES
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_filas_inventario INTEGER;
  v_schedule TEXT;
BEGIN
  SELECT count(*) INTO v_filas_inventario FROM alertas_catalogo WHERE modulo = 'inventario';
  IF v_filas_inventario <> 3 THEN
    RAISE EXCEPTION '127 ABORTADA (post): alertas_catalogo tiene % fila(s) con modulo=''inventario'', se esperaban exactamente 3.', v_filas_inventario;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM alertas_catalogo WHERE clave = 'inventario.ronda_recordatorio' AND activo) THEN
    RAISE EXCEPTION '127 ABORTADA (post): falta inventario.ronda_recordatorio (o quedó inactiva).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM alertas_catalogo WHERE clave = 'inventario.revision_dia_15' AND activo) THEN
    RAISE EXCEPTION '127 ABORTADA (post): falta inventario.revision_dia_15 (o quedó inactiva).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM alertas_catalogo WHERE clave = 'inventario.reporte_cierre' AND activo) THEN
    RAISE EXCEPTION '127 ABORTADA (post): falta inventario.reporte_cierre (o quedó inactiva).';
  END IF;

  SELECT schedule INTO v_schedule FROM cron.job WHERE jobname = 'ronda-inventario-tick';
  IF v_schedule IS DISTINCT FROM '0 12 * * *' THEN
    RAISE EXCEPTION '127 ABORTADA (post): el job ''ronda-inventario-tick'' no quedó programado a ''0 12 * * *''. Valor actual: %.', COALESCE(v_schedule, '<no existe>');
  END IF;

  RAISE NOTICE '127 OK: 3 filas sembradas en alertas_catalogo (modulo=inventario), cron ''ronda-inventario-tick'' programado a las 07:00 Bogotá (''0 12 * * *'').';
END $$;

-- ===========================================================================
-- ROLLBACK (manual, ejecutar sólo con instrucción explícita del dueño)
-- ===========================================================================
--   SELECT cron.unschedule('ronda-inventario-tick');
--   DELETE FROM alertas_catalogo WHERE clave IN (
--     'inventario.ronda_recordatorio', 'inventario.revision_dia_15', 'inventario.reporte_cierre'
--   );
-- Si ya existen filas en `telegram_alertas_suscripciones` referenciando
-- alguna de estas tres claves, el DELETE se lleva puestas esas
-- suscripciones por el ON DELETE CASCADE de la 096 -- confirmar con el dueño
-- antes de correr el rollback si el módulo ya está en uso real.
-- ===========================================================================
