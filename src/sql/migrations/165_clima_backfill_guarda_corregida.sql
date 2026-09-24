-- =============================================================================
-- 165_clima_backfill_guarda_corregida.sql
--
-- Clase: datos (control del cron temporal de la 164). Hallazgo ESCO-121.
-- Go de Santiago, 2026-09-23.
--
-- QUÉ PASÓ: el cron de la 164 se detuvo solo en el tramo 2 (2026-06-30 →
-- 07-06). El endpoint respondió 200 y escribió los 7 días, pero la guarda
-- marcó dos como «empeorados». Las dos marcas eran falsas alarmas:
--   * 2026-06-30: 288 → 284 lecturas; lluvia igual (2,79 mm); hueco máximo
--     25 min. La guarda paraba ante CUALQUIER caída de lecturas.
--   * 2026-07-05: lluvia 1,78 → 0,00 mm. El 1,78 era copia exacta del 07-04 —
--     el contador congelado del feed en tiempo real (ver la 122). La
--     reconstrucción por evento confirma 0,00. Es la corrección buscada.
--
-- QUÉ HACE:
--   1. CREATE OR REPLACE de respaldos.fn_clima_backfill_164_tick (nunca se
--      edita la 164), con dos excepciones en la verificación por fila:
--      a. menos lecturas se acepta si cobertura_hueco_max_min <= 45 (159);
--      b. un cambio de lluvia se acepta si el día queda 'ok' y
--         lluvia_mm_evento coincide con lluvia_total_mm dentro de
--         GREATEST(0,5 mm; 10 %) — evidencia independiente del contador.
--      Todo lo demás sigue deteniendo el cron: lluvia que pasa a NULL,
--      pérdida de cobertura real, HTTP distinto de 200, sin respuesta.
--   2. Marca el tramo 2 'hecho', sólo si sus 7 días pasan la guarda nueva.
--   3. Vuelve a programar el cron `clima-backfill-164`, que sigue en el tramo 3.
--
-- Pre-guarda: md5(prosrc) vivo = fbe81c31e55ddcc0376f2f8824c94cd3 (patrón 143).
-- Filas de dominio: cero. Sin BEGIN/COMMIT: apply_migration ya envuelve.
-- =============================================================================

-- 0. Precondiciones --------------------------------------------------------------
DO $$
DECLARE v_n integer;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc
       WHERE oid = 'respaldos.fn_clima_backfill_164_tick'::regproc)
     IS DISTINCT FROM 'fbe81c31e55ddcc0376f2f8824c94cd3' THEN
    RAISE EXCEPTION 'Pre 0.1: el cuerpo vivo de fn_clima_backfill_164_tick no es el revisado';
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'clima-backfill-164') THEN
    RAISE EXCEPTION 'Pre 0.2: el cron clima-backfill-164 ya existe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM respaldos.clima_backfill_164_tramos
                  WHERE n = 2 AND estado = 'fallo'
                    AND detalle = 'dia(s) empeorado(s): 2026-06-30, 2026-07-05') THEN
    RAISE EXCEPTION 'Pre 0.3: el tramo 2 no está en el fallo revisado';
  END IF;
  SELECT count(*) INTO v_n FROM respaldos.clima_backfill_164_tramos WHERE estado = 'hecho';
  IF v_n <> 1 THEN RAISE EXCEPTION 'Pre 0.4: % tramos hechos, se esperaba 1', v_n; END IF;
  SELECT count(*) INTO v_n FROM respaldos.clima_backfill_164_tramos WHERE estado = 'pendiente';
  IF v_n <> 26 THEN RAISE EXCEPTION 'Pre 0.5: % tramos pendientes, se esperaban 26', v_n; END IF;
END $$;

-- 1. Guarda corregida ------------------------------------------------------------
CREATE OR REPLACE FUNCTION respaldos.fn_clima_backfill_164_tick()
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
         -- Menos lecturas sólo es empeorar si el día perdió cobertura real
         -- (hueco máximo sin medir mayor a 45 min, criterio de la 159).
         OR (r.lecturas_count < (f.fila->>'lecturas_count')::int
             AND (r.cobertura_hueco_max_min IS NULL OR r.cobertura_hueco_max_min > 45))
         OR ((f.fila->>'lluvia_total_mm') IS NOT NULL AND r.lluvia_total_mm IS NULL)
         -- Un cambio de lluvia es corrección, no empeoramiento, cuando el día
         -- queda 'ok' y la reconstrucción por evento (122) confirma el valor.
         OR ((f.fila->>'lluvia_total_mm') IS NOT NULL
             AND abs(r.lluvia_total_mm - (f.fila->>'lluvia_total_mm')::numeric)
                 > GREATEST(0.5, 0.1 * (f.fila->>'lluvia_total_mm')::numeric)
             AND NOT (r.lluvia_confianza = 'ok'
                      AND r.lluvia_mm_evento IS NOT NULL
                      AND abs(r.lluvia_total_mm - r.lluvia_mm_evento)
                          <= GREATEST(0.5, 0.1 * r.lluvia_total_mm)))
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

-- 2. Tramo 2: hecho, sólo si sus 7 días pasan la guarda nueva --------------------
DO $$
DECLARE v_malos integer;
BEGIN
  SELECT count(*) INTO v_malos
    FROM respaldos.clima_backfill_164_foto f
    LEFT JOIN clima_resumen_diario r
      ON r.fecha = f.fecha AND r.station_id = f.fila->>'station_id'
   WHERE f.n = 2 AND f.intento = 1
     AND (
       r.fecha IS NULL
       OR r.lluvia_mm_evento IS NULL
       OR r.horas_sol_duracion IS NULL
       OR (r.lecturas_count < (f.fila->>'lecturas_count')::int
           AND (r.cobertura_hueco_max_min IS NULL OR r.cobertura_hueco_max_min > 45))
       OR ((f.fila->>'lluvia_total_mm') IS NOT NULL AND r.lluvia_total_mm IS NULL)
       OR ((f.fila->>'lluvia_total_mm') IS NOT NULL
           AND abs(r.lluvia_total_mm - (f.fila->>'lluvia_total_mm')::numeric)
               > GREATEST(0.5, 0.1 * (f.fila->>'lluvia_total_mm')::numeric)
           AND NOT (r.lluvia_confianza = 'ok'
                    AND abs(r.lluvia_total_mm - r.lluvia_mm_evento)
                        <= GREATEST(0.5, 0.1 * r.lluvia_total_mm)))
     );
  IF v_malos <> 0 THEN
    RAISE EXCEPTION 'Paso 2: % dia(s) del tramo 2 no pasan la guarda nueva', v_malos;
  END IF;

  UPDATE respaldos.clima_backfill_164_tramos
     SET estado = 'hecho',
         detalle = 'fallo original era falsa alarma; revisado y cerrado por la 165'
   WHERE n = 2;
END $$;

-- 3. Cron otra vez (mismo nombre y horario que la 164) ---------------------------
SELECT cron.schedule(
  'clima-backfill-164',
  '3,13,23,33,43,53 0-4,6-10,12-23 * * *',
  $$ SELECT respaldos.fn_clima_backfill_164_tick(); $$
);

-- 4. Postcondiciones -------------------------------------------------------------
DO $$
DECLARE v_n integer;
BEGIN
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'respaldos.fn_clima_backfill_164_tick'::regproc)
     NOT LIKE '%cobertura_hueco_max_min > 45%' THEN
    RAISE EXCEPTION 'Post 4.1: la guarda nueva no quedó en el cuerpo vivo';
  END IF;
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'respaldos.fn_clima_backfill_164_tick'::regproc)
     NOT LIKE '%cron.unschedule%' THEN
    RAISE EXCEPTION 'Post 4.2: la parada automática desapareció';
  END IF;
  SELECT count(*) INTO v_n FROM respaldos.clima_backfill_164_tramos WHERE estado = 'hecho';
  IF v_n <> 2 THEN RAISE EXCEPTION 'Post 4.3: % tramos hechos, se esperaban 2', v_n; END IF;
  SELECT count(*) INTO v_n FROM cron.job WHERE jobname = 'clima-backfill-164' AND active;
  IF v_n <> 1 THEN RAISE EXCEPTION 'Post 4.4: el cron no quedó programado'; END IF;
  IF has_function_privilege('authenticated', 'respaldos.fn_clima_backfill_164_tick()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Post 4.5: authenticated puede ejecutar la función';
  END IF;
END $$;

-- PARAR A MANO: SELECT cron.unschedule('clima-backfill-164');
