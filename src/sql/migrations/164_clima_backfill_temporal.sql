-- =============================================================================
-- 164_clima_backfill_temporal.sql
--
-- Clase: datos (vía cron temporal). Hallazgo ESCO-121. Decisión de Santiago,
-- 2026-09-23: reparar la historia de clima de los grupos A y C, dejar el B.
--
-- QUÉ HACE: programa un cron TEMPORAL (`clima-backfill-164`) que llama
-- `POST /clima/backfill?from&to` tramo por tramo, con el secreto que ya está en
-- Vault (`clima_sync_secret`, migración 105) — nadie maneja el secreto. Cuando
-- termina la lista, el cron se desprograma solo.
--
-- LOS TRES GRUPOS (medidos en vivo el 2026-09-23 sobre los días sin
-- horas_sol_duracion o sin lluvia_mm_evento):
--   A (72 días, 2026-06-30 → 2026-09-17): dentro de la ventana de ~90 días en
--     que Ecowitt todavía sirve lecturas de 5 minutos. Se gana todo.
--   C (23 días, 2026-03-18 → 2026-05-25): días viejos que YA tienen ~48
--     lecturas de 30 minutos (vinieron del backfill de la 122). Llegan los
--     mismos datos; se ganan las horas de sol (la 159 acepta la cadencia 30).
--   B (79 días, 2026-03-19 → 2026-06-29): NO SE TOCAN. Tienen 288 lecturas de
--     5 minutos capturadas en vivo, y la History API ya sólo los devuelve a 30
--     minutos: el backfill los empeoraría (temperaturas extremas y ráfagas
--     suavizadas) a cambio de horas de sol aproximadas. Decisión: quedan sin
--     horas de sol, para siempre.
--   Excluidos además: 2026-08-19 y 08-20 (apagón real, Ecowitt tampoco tiene
--   las horas) y 2026-08-27 (cerró a las 15:50 con 288 lecturas; la 159 ya lo
--   anuló). El backfill manual NO pasa por la guarda de no-empeorar
--   (debeReagregarDia), así que un día que puede empeorar no entra en la lista.
--
-- ORDEN: tramo 1 es un DÍA DE CONTROL del grupo C (2026-04-14, 27,68 mm de
-- lluvia sobre 48 lecturas). Después el grupo A, del más viejo al más nuevo,
-- porque es el que pierde resolución de 5 minutos cada día que pasa. Al final
-- el resto del grupo C.
--
-- PROTECCIONES (lo que hace `respaldos.fn_clima_backfill_164_tick`):
--   * EN SERIE por construcción: un tramo sólo sale cuando el anterior tiene
--     respuesta HTTP y pasó la verificación. Nunca dos a la vez — la poda
--     GLOBAL de fn_clima_rollup_diario hace que dos backfills paralelos pierdan
--     datos en silencio (ver la 122 en CLAUDE.md).
--   * Horario: cada 10 minutos, SALVO las horas 05 y 11 UTC, donde corren el
--     rollup nocturno (00:15 Bogotá) y el reintento de la 121 (06:00 Bogotá),
--     que también podan/reagregan.
--   * FOTO ANTES de cada tramo: la fila completa de cada día va a
--     `respaldos.clima_backfill_164_foto` (to_jsonb). Es el registro para
--     restaurar a mano si algo sale mal.
--   * PARADA AUTOMÁTICA si un día EMPEORA: lecturas_count baja, o la lluvia
--     pasa de tener valor a NULL, o cambia más de GREATEST(0,5 mm; 10 %). El
--     tramo queda en 'fallo', el cron se desprograma, y nada más se toca.
--   * Verificación por FILA, nunca por la respuesta HTTP (`synced:1` no
--     prueba nada, ver la 122).
--   * Cuota de Ecowitt: si la respuesta trae "upper limit", el tramo vuelve a
--     'pendiente' (máximo 3 intentos) en vez de contarse como hecho.
--
-- Filas de dominio: las escribe el endpoint, no esta migración. Esta migración
-- sólo crea dos tablas de control en `respaldos` (patrón 081: sin grants de
-- navegador, RLS sin políticas), una función y un cron.
-- Sin BEGIN/COMMIT: apply_migration ya envuelve.
-- =============================================================================

-- 0. Precondiciones --------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'clima_sync_secret') THEN
    RAISE EXCEPTION 'Pre 0.1: falta el secreto de Vault clima_sync_secret (migración 105)';
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'clima-backfill-164') THEN
    RAISE EXCEPTION 'Pre 0.2: el cron clima-backfill-164 ya existe';
  END IF;
  IF to_regclass('respaldos.clima_backfill_164_tramos') IS NOT NULL
     OR to_regclass('respaldos.clima_backfill_164_foto') IS NOT NULL THEN
    RAISE EXCEPTION 'Pre 0.3: las tablas de control de la 164 ya existen';
  END IF;
END $$;

-- 1. Tablas de control -----------------------------------------------------------
CREATE TABLE respaldos.clima_backfill_164_tramos (
  n            integer PRIMARY KEY,
  grupo        text    NOT NULL CHECK (grupo IN ('control','A','C')),
  desde        date    NOT NULL,
  hasta        date    NOT NULL CHECK (hasta >= desde),
  estado       text    NOT NULL DEFAULT 'pendiente'
               CHECK (estado IN ('pendiente','enviado','hecho','fallo')),
  intentos     integer NOT NULL DEFAULT 0,
  request_id   bigint,
  enviado_en   timestamptz,
  cerrado_en   timestamptz,
  http_status  integer,
  respuesta    text,
  detalle      text
);

CREATE TABLE respaldos.clima_backfill_164_foto (
  n        integer NOT NULL REFERENCES respaldos.clima_backfill_164_tramos(n),
  intento  integer NOT NULL,
  fecha    date    NOT NULL,
  fila     jsonb   NOT NULL,
  PRIMARY KEY (n, intento, fecha)
);

REVOKE ALL ON respaldos.clima_backfill_164_tramos FROM PUBLIC, anon, authenticated;
REVOKE ALL ON respaldos.clima_backfill_164_foto   FROM PUBLIC, anon, authenticated;
ALTER TABLE respaldos.clima_backfill_164_tramos ENABLE ROW LEVEL SECURITY;
ALTER TABLE respaldos.clima_backfill_164_foto   ENABLE ROW LEVEL SECURITY;

-- Lista LITERAL (nunca una regla que se recalcule sola): medida 2026-09-23.
INSERT INTO respaldos.clima_backfill_164_tramos (n, grupo, desde, hasta) VALUES
  ( 1, 'control', '2026-04-14', '2026-04-14'),
  ( 2, 'A', '2026-06-30', '2026-07-06'),
  ( 3, 'A', '2026-07-07', '2026-07-13'),
  ( 4, 'A', '2026-07-14', '2026-07-20'),
  ( 5, 'A', '2026-07-21', '2026-07-27'),
  ( 6, 'A', '2026-07-28', '2026-08-03'),
  ( 7, 'A', '2026-08-04', '2026-08-10'),
  ( 8, 'A', '2026-08-11', '2026-08-17'),
  ( 9, 'A', '2026-08-18', '2026-08-18'),
  (10, 'A', '2026-08-21', '2026-08-26'),
  (11, 'A', '2026-08-29', '2026-09-04'),
  (12, 'A', '2026-09-05', '2026-09-11'),
  (13, 'A', '2026-09-16', '2026-09-17'),
  (14, 'C', '2026-03-18', '2026-03-18'),
  (15, 'C', '2026-03-21', '2026-03-21'),
  (16, 'C', '2026-03-25', '2026-03-25'),
  (17, 'C', '2026-03-27', '2026-03-27'),
  (18, 'C', '2026-03-30', '2026-03-30'),
  (19, 'C', '2026-04-05', '2026-04-05'),
  (20, 'C', '2026-04-08', '2026-04-13'),
  (21, 'C', '2026-04-15', '2026-04-17'),
  (22, 'C', '2026-04-23', '2026-04-23'),
  (23, 'C', '2026-04-29', '2026-04-29'),
  (24, 'C', '2026-05-03', '2026-05-03'),
  (25, 'C', '2026-05-05', '2026-05-05'),
  (26, 'C', '2026-05-14', '2026-05-14'),
  (27, 'C', '2026-05-22', '2026-05-22'),
  (28, 'C', '2026-05-25', '2026-05-25');

-- 2. La función que corre en cada disparo ----------------------------------------
CREATE FUNCTION respaldos.fn_clima_backfill_164_tick()
RETURNS text
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  t        respaldos.clima_backfill_164_tramos%ROWTYPE;
  resp     record;
  malos    text;
  v_url    text;
  v_req    bigint;
BEGIN
  -- (a) ¿Hay un tramo en vuelo? Verificarlo antes de mandar otro.
  SELECT * INTO t FROM respaldos.clima_backfill_164_tramos
   WHERE estado = 'enviado' ORDER BY n LIMIT 1 FOR UPDATE;

  IF FOUND THEN
    SELECT status_code, content, timed_out, error_msg INTO resp
      FROM net._http_response WHERE id = t.request_id;

    IF NOT FOUND THEN
      IF now() - t.enviado_en > interval '40 minutes' THEN
        UPDATE respaldos.clima_backfill_164_tramos
           SET estado = 'fallo', cerrado_en = now(),
               detalle = 'sin respuesta HTTP en 40 min'
         WHERE n = t.n;
        PERFORM cron.unschedule('clima-backfill-164');
        RETURN 'fallo: sin respuesta, cron detenido';
      END IF;
      RETURN 'esperando respuesta del tramo ' || t.n;
    END IF;

    -- Verificación por FILA contra la foto tomada antes de enviar.
    SELECT string_agg(f.fecha::text, ', ' ORDER BY f.fecha) INTO malos
      FROM respaldos.clima_backfill_164_foto f
      LEFT JOIN clima_resumen_diario r
        ON r.fecha = f.fecha AND r.station_id = f.fila->>'station_id'
     WHERE f.n = t.n AND f.intento = t.intentos
       AND (
         r.fecha IS NULL
         OR r.lecturas_count < (f.fila->>'lecturas_count')::int
         OR ((f.fila->>'lluvia_total_mm') IS NOT NULL AND r.lluvia_total_mm IS NULL)
         OR ((f.fila->>'lluvia_total_mm') IS NOT NULL
             AND abs(r.lluvia_total_mm - (f.fila->>'lluvia_total_mm')::numeric)
                 > GREATEST(0.5, 0.1 * (f.fila->>'lluvia_total_mm')::numeric))
       );

    IF malos IS NOT NULL THEN
      UPDATE respaldos.clima_backfill_164_tramos
         SET estado = 'fallo', cerrado_en = now(), http_status = resp.status_code,
             respuesta = left(resp.content, 4000),
             detalle = 'dia(s) empeorado(s): ' || malos
       WHERE n = t.n;
      PERFORM cron.unschedule('clima-backfill-164');
      RETURN 'fallo: empeoraron ' || malos || ', cron detenido';
    END IF;

    IF resp.status_code = 200 AND resp.content ILIKE '%upper limit%' AND t.intentos >= 3 THEN
      UPDATE respaldos.clima_backfill_164_tramos
         SET estado = 'fallo', cerrado_en = now(), http_status = resp.status_code,
             respuesta = left(resp.content, 4000),
             detalle = 'cuota de Ecowitt agotada 3 veces'
       WHERE n = t.n;
      PERFORM cron.unschedule('clima-backfill-164');
      RETURN 'fallo: cuota agotada 3 veces, cron detenido';
    END IF;

    IF resp.status_code = 200 AND resp.content ILIKE '%upper limit%' THEN
      UPDATE respaldos.clima_backfill_164_tramos
         SET estado = 'pendiente', http_status = resp.status_code,
             respuesta = left(resp.content, 4000),
             detalle = 'cuota de Ecowitt agotada; se reintenta'
       WHERE n = t.n;
      RETURN 'cuota agotada en tramo ' || t.n || ', se reintenta';
    END IF;

    IF resp.status_code IS DISTINCT FROM 200 THEN
      UPDATE respaldos.clima_backfill_164_tramos
         SET estado = 'fallo', cerrado_en = now(), http_status = resp.status_code,
             respuesta = left(coalesce(resp.content, resp.error_msg), 4000),
             detalle = 'respuesta HTTP distinta de 200'
       WHERE n = t.n;
      PERFORM cron.unschedule('clima-backfill-164');
      RETURN 'fallo: HTTP ' || coalesce(resp.status_code::text, 'NULL') || ', cron detenido';
    END IF;

    UPDATE respaldos.clima_backfill_164_tramos
       SET estado = 'hecho', cerrado_en = now(), http_status = resp.status_code,
           respuesta = left(resp.content, 4000)
     WHERE n = t.n;
  END IF;

  -- (b) Mandar el siguiente tramo pendiente.
  SELECT * INTO t FROM respaldos.clima_backfill_164_tramos
   WHERE estado = 'pendiente' ORDER BY n LIMIT 1 FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM cron.unschedule('clima-backfill-164');
    RETURN 'terminado: no quedan tramos, cron desprogramado';
  END IF;

  INSERT INTO respaldos.clima_backfill_164_foto (n, intento, fecha, fila)
  SELECT t.n, t.intentos + 1, r.fecha, to_jsonb(r)
    FROM clima_resumen_diario r
   WHERE r.station_id <> 'wunderground-historico'
     AND r.fecha BETWEEN t.desde AND t.hasta;

  v_url := 'https://ywhtjwawnkeqlwxbvgup.supabase.co/functions/v1/make-server-1ccce916/clima/backfill'
           || '?from=' || to_char(t.desde, 'YYYYMMDD') || '&to=' || to_char(t.hasta, 'YYYYMMDD');

  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-clima-sync-secret',
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'clima_sync_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  ) INTO v_req;

  UPDATE respaldos.clima_backfill_164_tramos
     SET estado = 'enviado', intentos = t.intentos + 1,
         request_id = v_req, enviado_en = now()
   WHERE n = t.n;

  RETURN 'enviado tramo ' || t.n || ' (' || t.desde || ' → ' || t.hasta || ')';
END
$fn$;

REVOKE ALL ON FUNCTION respaldos.fn_clima_backfill_164_tick() FROM PUBLIC, anon, authenticated;

-- 3. El cron temporal ------------------------------------------------------------
-- Cada 10 minutos, salvo las horas 05 y 11 UTC (rollup nocturno y reintento de
-- la 121). Se desprograma solo al terminar o al detectar un día empeorado.
SELECT cron.schedule(
  'clima-backfill-164',
  '3,13,23,33,43,53 0-4,6-10,12-23 * * *',
  $$ SELECT respaldos.fn_clima_backfill_164_tick(); $$
);

-- 4. Postcondiciones -------------------------------------------------------------
DO $$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM respaldos.clima_backfill_164_tramos WHERE estado = 'pendiente';
  IF v_n <> 28 THEN RAISE EXCEPTION 'Post 4.1: % tramos pendientes, se esperaban 28', v_n; END IF;

  SELECT count(*) INTO v_n FROM cron.job WHERE jobname = 'clima-backfill-164' AND active;
  IF v_n <> 1 THEN RAISE EXCEPTION 'Post 4.2: el cron no quedo programado'; END IF;

  -- Ningún tramo toca el grupo B ni los días excluidos.
  SELECT count(*) INTO v_n
    FROM respaldos.clima_backfill_164_tramos t
    JOIN clima_resumen_diario r
      ON r.fecha BETWEEN t.desde AND t.hasta AND r.station_id <> 'wunderground-historico'
   WHERE r.fecha IN ('2026-08-19','2026-08-20','2026-08-27')
      OR (r.fecha < DATE '2026-06-30' AND r.lecturas_count >= 200);
  IF v_n <> 0 THEN RAISE EXCEPTION 'Post 4.3: % dias del grupo B o excluidos en la lista', v_n; END IF;

  IF has_table_privilege('authenticated', 'respaldos.clima_backfill_164_tramos', 'SELECT')
     OR has_table_privilege('anon', 'respaldos.clima_backfill_164_foto', 'SELECT') THEN
    RAISE EXCEPTION 'Post 4.4: una tabla de control quedo legible para un rol de navegador';
  END IF;
END $$;

-- PARAR A MANO (si hace falta): SELECT cron.unschedule('clima-backfill-164');
-- ESTADO:  SELECT n, grupo, desde, hasta, estado, intentos, http_status, detalle
--            FROM respaldos.clima_backfill_164_tramos ORDER BY n;
-- RESTAURAR un día desde la foto: tomar respaldos.clima_backfill_164_foto.fila
--   del último intento y reescribir la fila de clima_resumen_diario con esos valores.
