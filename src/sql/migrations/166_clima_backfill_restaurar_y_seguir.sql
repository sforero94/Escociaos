-- =============================================================================
-- 166_clima_backfill_restaurar_y_seguir.sql
--
-- Clase: datos (control del cron temporal de la 164). Hallazgo ESCO-121.
-- Autorizado por Santiago, 2026-09-23 (escrituras recuperables sin preguntar).
--
-- QUÉ PASÓ: con la guarda de la 165, el tramo 3 (2026-07-07 → 07-13) paró por
-- un empeoramiento REAL, no una falsa alarma: 2026-07-09 pasó de 268 lecturas
-- en vivo a 245 en la History API, con un hueco de 220 min. La 159 anuló
-- temp_c_min/max, radiacion_wm2_avg/max y uv_index_max. La lluvia (28,19 mm)
-- quedó igual y el evento la confirma. Los otros 6 días del tramo mejoraron.
--
-- QUÉ HACE:
--   1. Restaura 2026-07-09 desde su foto (respaldos.clima_backfill_164_foto,
--      n=3). Conserva sólo lluvia_mm_evento = 28,19 del backfill: es evidencia
--      independiente que confirma la lluvia del contador. UPDATE, nunca DELETE.
--   2. CREATE OR REPLACE del tick (nunca se editan 164 ni 165): si 1 a 3 días
--      de un tramo empeoran con HTTP 200, los RESTAURA desde la foto y sigue.
--      Con más de 3 días, HTTP distinto de 200, sin respuesta o cuota agotada
--      3 veces, el cron se detiene como antes.
--   3. Marca el tramo 3 'hecho' y vuelve a programar el cron (tramo 4).
--
-- Pre-guarda: md5(prosrc) vivo = 38fde8d38bc5f58bac2f4b4021f0149a (la 165).
-- Filas de dominio: 1 UPDATE (2026-07-09). Sin BEGIN/COMMIT.
-- =============================================================================

-- 0. Precondiciones --------------------------------------------------------------
DO $$
DECLARE v_n integer;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc
       WHERE oid = 'respaldos.fn_clima_backfill_164_tick'::regproc)
     IS DISTINCT FROM '38fde8d38bc5f58bac2f4b4021f0149a' THEN
    RAISE EXCEPTION 'Pre 0.1: el cuerpo vivo del tick no es el de la 165';
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'clima-backfill-164') THEN
    RAISE EXCEPTION 'Pre 0.2: el cron clima-backfill-164 ya existe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM respaldos.clima_backfill_164_tramos
                  WHERE n = 3 AND estado = 'fallo' AND intentos = 1
                    AND detalle = 'dia(s) empeorado(s): 2026-07-09') THEN
    RAISE EXCEPTION 'Pre 0.3: el tramo 3 no está en el fallo revisado';
  END IF;
  SELECT count(*) INTO v_n FROM respaldos.clima_backfill_164_foto
   WHERE n = 3 AND intento = 1 AND fecha = DATE '2026-07-09'
     AND (fila->>'lecturas_count')::int = 268
     AND (fila->>'temp_c_min')::numeric = 14.61;
  IF v_n <> 1 THEN RAISE EXCEPTION 'Pre 0.4: falta la foto revisada de 2026-07-09'; END IF;
  SELECT count(*) INTO v_n FROM clima_resumen_diario
   WHERE fecha = DATE '2026-07-09' AND station_id <> 'wunderground-historico'
     AND lecturas_count = 245 AND temp_c_min IS NULL AND lluvia_mm_evento = 28.19;
  IF v_n <> 1 THEN RAISE EXCEPTION 'Pre 0.5: 2026-07-09 no está en el estado revisado'; END IF;
  SELECT count(*) INTO v_n FROM respaldos.clima_backfill_164_tramos WHERE estado = 'pendiente';
  IF v_n <> 25 THEN RAISE EXCEPTION 'Pre 0.6: % tramos pendientes, se esperaban 25', v_n; END IF;
END $$;

-- 1. Restaurar 2026-07-09 --------------------------------------------------------
UPDATE clima_resumen_diario r
   SET (temp_c_min,temp_c_max,temp_c_avg,humedad_pct_min,humedad_pct_max,humedad_pct_avg,lluvia_total_mm,viento_kmh_avg,rafaga_kmh_max,viento_dir_predominante,radiacion_wm2_avg,radiacion_wm2_max,uv_index_max,lecturas_count,lluvia_confianza,ultima_lectura_en,lluvia_mm_evento,horas_sol_duracion,cobertura_hueco_max_min) =
       (SELECT p.temp_c_min,p.temp_c_max,p.temp_c_avg,p.humedad_pct_min,p.humedad_pct_max,p.humedad_pct_avg,p.lluvia_total_mm,p.viento_kmh_avg,p.rafaga_kmh_max,p.viento_dir_predominante,p.radiacion_wm2_avg,p.radiacion_wm2_max,p.uv_index_max,p.lecturas_count,p.lluvia_confianza,p.ultima_lectura_en,r.lluvia_mm_evento,p.horas_sol_duracion,p.cobertura_hueco_max_min
          FROM jsonb_populate_record(NULL::clima_resumen_diario, f.fila) p)
  FROM respaldos.clima_backfill_164_foto f
 WHERE f.n = 3 AND f.intento = 1 AND f.fecha = DATE '2026-07-09'
   AND r.fecha = f.fecha AND r.station_id = f.fila->>'station_id';

-- 2. Tick que restaura y sigue ---------------------------------------------------
CREATE OR REPLACE FUNCTION respaldos.fn_clima_backfill_164_tick()
RETURNS text
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  t        respaldos.clima_backfill_164_tramos%ROWTYPE;
  resp     record;
  malos    text;
  v_malos  date[];
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
    SELECT string_agg(f.fecha::text, ', ' ORDER BY f.fecha), array_agg(f.fecha)
      INTO malos, v_malos
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

    -- Días empeorados: primero se exige HTTP 200 y cuota disponible; si no,
    -- las ramas de abajo deciden (paran o reintentan) sin tocar filas.
    IF malos IS NOT NULL AND resp.status_code = 200
       AND coalesce(resp.content, '') NOT ILIKE '%upper limit%' THEN
      -- Más de 3 días malos en un tramo es un problema sistemático: parar.
      IF array_length(v_malos, 1) > 3 THEN
        UPDATE respaldos.clima_backfill_164_tramos
           SET estado = 'fallo', cerrado_en = now(), http_status = resp.status_code,
               respuesta = left(resp.content, 4000),
               detalle = 'dia(s) empeorado(s), demasiados para restaurar: ' || malos
         WHERE n = t.n;
        PERFORM cron.unschedule('clima-backfill-164');
        RETURN 'fallo: empeoraron ' || malos || ', cron detenido';
      END IF;

      -- 1 a 3 días: se RESTAURAN desde la foto tomada antes del tramo (UPDATE,
      -- nunca DELETE) y el backfill sigue. La foto queda como evidencia.
      UPDATE clima_resumen_diario r
         SET (temp_c_min,temp_c_max,temp_c_avg,humedad_pct_min,humedad_pct_max,humedad_pct_avg,lluvia_total_mm,viento_kmh_avg,rafaga_kmh_max,viento_dir_predominante,radiacion_wm2_avg,radiacion_wm2_max,uv_index_max,lecturas_count,lluvia_confianza,ultima_lectura_en,lluvia_mm_evento,horas_sol_duracion,cobertura_hueco_max_min) =
             (SELECT p.temp_c_min,p.temp_c_max,p.temp_c_avg,p.humedad_pct_min,p.humedad_pct_max,p.humedad_pct_avg,p.lluvia_total_mm,p.viento_kmh_avg,p.rafaga_kmh_max,p.viento_dir_predominante,p.radiacion_wm2_avg,p.radiacion_wm2_max,p.uv_index_max,p.lecturas_count,p.lluvia_confianza,p.ultima_lectura_en,p.lluvia_mm_evento,p.horas_sol_duracion,p.cobertura_hueco_max_min
                FROM jsonb_populate_record(NULL::clima_resumen_diario, f.fila) p)
        FROM respaldos.clima_backfill_164_foto f
       WHERE f.n = t.n AND f.intento = t.intentos
         AND r.fecha = f.fecha AND r.station_id = f.fila->>'station_id'
         AND r.fecha = ANY (v_malos);

      UPDATE respaldos.clima_backfill_164_tramos
         SET estado = 'hecho', cerrado_en = now(), http_status = resp.status_code,
             respuesta = left(resp.content, 4000),
             detalle = 'restaurado(s) desde la foto: ' || malos
       WHERE n = t.n;
      t.estado := 'hecho';
    ELSIF malos IS NOT NULL AND resp.status_code IS DISTINCT FROM 200 THEN
      UPDATE respaldos.clima_backfill_164_tramos
         SET estado = 'fallo', cerrado_en = now(), http_status = resp.status_code,
             respuesta = left(coalesce(resp.content, resp.error_msg), 4000),
             detalle = 'HTTP distinto de 200 y dia(s) cambiado(s): ' || malos
       WHERE n = t.n;
      PERFORM cron.unschedule('clima-backfill-164');
      RETURN 'fallo: HTTP ' || coalesce(resp.status_code::text, 'NULL') || ' con cambios, cron detenido';
    END IF;

    IF t.estado = 'hecho' THEN
      NULL;  -- ya cerrado arriba con restauración
    ELSIF resp.status_code = 200 AND resp.content ILIKE '%upper limit%' AND t.intentos >= 3 THEN
      UPDATE respaldos.clima_backfill_164_tramos
         SET estado = 'fallo', cerrado_en = now(), http_status = resp.status_code,
             respuesta = left(resp.content, 4000),
             detalle = 'cuota de Ecowitt agotada 3 veces'
       WHERE n = t.n;
      PERFORM cron.unschedule('clima-backfill-164');
      RETURN 'fallo: cuota agotada 3 veces, cron detenido';

    ELSIF resp.status_code = 200 AND resp.content ILIKE '%upper limit%' THEN
      UPDATE respaldos.clima_backfill_164_tramos
         SET estado = 'pendiente', http_status = resp.status_code,
             respuesta = left(resp.content, 4000),
             detalle = 'cuota de Ecowitt agotada; se reintenta'
       WHERE n = t.n;
      RETURN 'cuota agotada en tramo ' || t.n || ', se reintenta';

    ELSIF resp.status_code IS DISTINCT FROM 200 THEN
      UPDATE respaldos.clima_backfill_164_tramos
         SET estado = 'fallo', cerrado_en = now(), http_status = resp.status_code,
             respuesta = left(coalesce(resp.content, resp.error_msg), 4000),
             detalle = 'respuesta HTTP distinta de 200'
       WHERE n = t.n;
      PERFORM cron.unschedule('clima-backfill-164');
      RETURN 'fallo: HTTP ' || coalesce(resp.status_code::text, 'NULL') || ', cron detenido';

    ELSE
      UPDATE respaldos.clima_backfill_164_tramos
         SET estado = 'hecho', cerrado_en = now(), http_status = resp.status_code,
             respuesta = left(resp.content, 4000)
       WHERE n = t.n;
    END IF;
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

-- 3. Tramo 3 hecho y cron otra vez -----------------------------------------------
UPDATE respaldos.clima_backfill_164_tramos
   SET estado = 'hecho',
       detalle = 'restaurado desde la foto por la 166: 2026-07-09'
 WHERE n = 3;

SELECT cron.schedule(
  'clima-backfill-164',
  '3,13,23,33,43,53 0-4,6-10,12-23 * * *',
  $$ SELECT respaldos.fn_clima_backfill_164_tick(); $$
);

-- 4. Postcondiciones -------------------------------------------------------------
DO $$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM clima_resumen_diario
   WHERE fecha = DATE '2026-07-09' AND station_id <> 'wunderground-historico'
     AND lecturas_count = 268 AND temp_c_min = 14.61 AND temp_c_max = 19.39
     AND radiacion_wm2_avg = 59.83 AND lluvia_total_mm = 28.19
     AND lluvia_mm_evento = 28.19 AND lluvia_confianza = 'ok';
  IF v_n <> 1 THEN RAISE EXCEPTION 'Post 4.1: 2026-07-09 no quedó restaurado'; END IF;
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'respaldos.fn_clima_backfill_164_tick'::regproc)
     NOT LIKE '%restaurado(s) desde la foto%' THEN
    RAISE EXCEPTION 'Post 4.2: el tick nuevo no quedó en el cuerpo vivo';
  END IF;
  SELECT count(*) INTO v_n FROM respaldos.clima_backfill_164_tramos WHERE estado = 'hecho';
  IF v_n <> 3 THEN RAISE EXCEPTION 'Post 4.3: % tramos hechos, se esperaban 3', v_n; END IF;
  SELECT count(*) INTO v_n FROM cron.job WHERE jobname = 'clima-backfill-164' AND active;
  IF v_n <> 1 THEN RAISE EXCEPTION 'Post 4.4: el cron no quedó programado'; END IF;
  IF has_function_privilege('authenticated', 'respaldos.fn_clima_backfill_164_tick()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Post 4.5: authenticated puede ejecutar la función';
  END IF;
END $$;

-- PARAR A MANO: SELECT cron.unschedule('clima-backfill-164');
