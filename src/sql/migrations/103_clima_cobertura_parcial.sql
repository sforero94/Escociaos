-- =============================================================================
-- 103_clima_cobertura_parcial.sql
--
-- Un dia del que solo se capturo una parte deja de escribirse en la historia
-- permanente del clima como si fuera un dia completo y confiable.
--
-- -----------------------------------------------------------------------------
-- EL BUG
-- -----------------------------------------------------------------------------
-- `fn_clima_rollup_diario` (migracion 068) decide `lluvia_confianza` mirando
-- UNICAMENTE si el contador de lluvia de Ecowitt se refresco ese dia. Nunca
-- mira cuanto del dia se alcanzo a capturar. `lecturas_count` se agrega con un
-- COUNT(*) y se guarda, pero jamas entra a un predicado.
--
-- Resultado, verificado vivo en produccion (2026-08-20):
--
--   SELECT fecha, lecturas_count, lluvia_total_mm, lluvia_confianza
--     FROM clima_resumen_diario WHERE fecha = '2026-08-19';
--   -- 2026-08-19 | 167 | 0.00 | ok
--
-- La estacion muestrea cada 5 minutos: 288 lecturas por dia. El 2026-08-19
-- llegaron 167 (58%). Repartidas por hora de Bogota:
--
--   00-09h: 12/hora (completo)   10h: 5    11h-16h: 0 (nada)
--   17h: 4    18h-20h: 12/hora   21h: 2    22h-23h: 0 (nada)
--
-- O sea: no hay captura entre las 11:00 y las 17:00, ni despues de las 21:10.
-- Casi nueve horas del dia sin registro -- justamente la franja de la tarde en
-- que llueve en Aguadas. Y aun asi la fila quedo escrita con el sello `ok`
-- afirmando 0,00 mm. Causa confirmada por Santiago el 2026-08-20: corte de luz
-- prolongado en la finca.
--
-- Es el espejo exacto de la 068. Aquella migracion existe para impedir un
-- DUPLICADO fabricado; esto fabrica un CERO. Las dos violan la misma regla que
-- este proyecto sostiene en monitoreo, en hato y en el reporte semanal:
-- "sin dato" es NULL, jamas 0. "No llovio" y "no sabemos" son cosas distintas.
--
-- Y no es un accidente irrepetible: ahora que la causa es un corte de luz, cada
-- corte que empiece o termine a media jornada produce un dia parcial que el
-- rollup de esa noche va a sellar como confiable. La restauracion parcial es el
-- caso mas probable y es justo el peligroso -- si la luz NO vuelve en todo el
-- dia no se inserta fila y eso si es seguro (no hay fila = sin dato).
--
-- Consumidores rio abajo que hoy se comen ese 0 como bueno: el reporte semanal
-- (`fetchDatosReporteSemanal.ts`, el mismo consumidor del incidente S30/2026 que
-- motivo la 068), la vista de Clima historicos, la franja de lluvia del tablero
-- y las respuestas de clima de Esco. Ninguno lee `lecturas_count`.
--
-- -----------------------------------------------------------------------------
-- EL ARREGLO
-- -----------------------------------------------------------------------------
-- Un cuarto valor de `lluvia_confianza`: `cobertura_parcial`. Un dia con menos
-- de 240 lecturas (~83% de las 288 esperadas) guarda `lluvia_total_mm = NULL`,
-- igual que un contador congelado. El numero crudo no se conserva porque, a
-- diferencia del backfill de la 068 -- que deja el duplicado intacto para
-- auditoria en una columna que el frontend ya nulea --, aca el valor no es una
-- lectura sospechosa sino un total incompleto por construccion: el contador es
-- acumulado, y si faltan las ultimas horas del dia el maximo disponible es una
-- cota inferior, no una medicion.
--
-- 240 y no 288: la propia estacion tiene dias de 279-289 lecturas por jitter del
-- cron de 5 minutos. En los 153 dias que lleva la estacion Ecowitt, exactamente
-- 4 caen por debajo de 240 y los 149 restantes estan en 279+. No hay zona gris.
--
-- -----------------------------------------------------------------------------
-- DESVIACION DELIBERADA #1 -- donde va el check dentro del CASE
-- -----------------------------------------------------------------------------
-- La accion propuesta en el hallazgo decia "despues de los checks de frescura".
-- Va ANTES, y a proposito.
--
-- La cobertura es una propiedad de la CAPTURA del dia, anterior e independiente
-- de cualquier pregunta sobre el contador de lluvia. Si solo vimos el 58% del
-- dia no podemos afirmar nada sobre el total, se vea como se vea la marca de
-- frescura del piezo. Puesto al final, la primera rama del CASE de la 068
-- (`ultima_actualizacion_lluvia IS NULL` -> 'sin_time_piezo', que CONFIA en el
-- valor crudo) se dispararia primero y un dia parcial sin senal de frescura
-- seguiria entrando con su numero -- justo el hueco que hay que cerrar.
--
-- Ponerlo primero solo puede producir MAS NULLs, nunca menos: no puede volver
-- confiable ningun dia que la 068 hubiera desconfiado. Lo unico que cambia para
-- un dia que es parcial Y tiene el contador congelado es la ETIQUETA
-- ('cobertura_parcial' en vez de 'contador_congelado'); el valor es NULL en los
-- dos casos, asi que ningun numero se mueve. Si se prefiere la version literal
-- del hallazgo, es mover una rama del CASE.
--
-- -----------------------------------------------------------------------------
-- DESVIACION DELIBERADA #2 -- el backfill NO puede ser `WHERE lecturas_count < 240`
-- -----------------------------------------------------------------------------
-- El hallazgo propuso `UPDATE ... WHERE lecturas_count < 240 AND
-- lluvia_confianza='ok'` y afirmaba que tocaba 1 fila. Ejecutado como SELECT
-- contra produccion antes de escribir esto: toca **1.734**.
--
-- La razon es que `clima_resumen_diario` tiene DOS poblaciones con semanticas
-- distintas de `lecturas_count`:
--
--   station_id                | filas | fechas                  | lecturas_count
--   --------------------------+-------+-------------------------+---------------
--   'wunderground-historico'  | 1.757 | 2020-07-01 .. 2025-11-04| siempre 1
--   '84:1F:E8:35:D8:73 '      |   153 | 2026-03-18 .. 2026-08-19| 111 .. 289
--
-- Las 1.757 filas de `wunderground-historico` son agregados DIARIOS importados:
-- `lecturas_count = 1` significa "un registro diario importado", no "1 de 288
-- lecturas". De ellas 1.730 estan en `ok`. El UPDATE propuesto tal cual les
-- pondria `lluvia_total_mm = NULL` a cinco anios y medio de historia pluvial
-- legitima -- borraria la unica serie larga de lluvia que tiene la finca.
--
-- Por eso el backfill se acota a la estacion de muestreo por 5 minutos, con un
-- literal explicito y no con una regex (leccion de la 099), y con guardas que
-- verifican que la exclusion es coherente (toda fila excluida tiene
-- `lecturas_count = 1`) y que despues del UPDATE la poblacion historica quedo
-- intacta.
--
-- La regla del CASE dentro de la funcion no necesita ese filtro: el rollup solo
-- lee `clima_lecturas`, que unicamente alimenta el sync de 5 minutos de
-- `clima.tsx` para esa estacion (verificado: es el unico write path del repo, y
-- `clima_lecturas` tiene un solo station_id).
--
-- Filas afectadas por el backfill: 4 (2026-08-19, 2026-03-30, 2026-03-27,
-- 2026-03-18), mas cualquier dia parcial nuevo que el cron nocturno haya escrito
-- entre hoy y el momento en que se corra esto. Ver la guarda 2.
--
-- -----------------------------------------------------------------------------
-- LO QUE ESTA MIGRACION NO ARREGLA (decision de producto pendiente)
-- -----------------------------------------------------------------------------
-- Rescata SOLO la lluvia. Temperatura, humedad y radiacion de un dia parcial
-- siguen consumiendose como fiables aunque el promedio este sesgado por el hueco
-- horario: la radiacion media del 2026-08-19 quedo en 109,81 W/m2 contra 145-151
-- de los dias despejados de la ventana (-25%), porque el hueco de 11:00 a 17:00
-- se comio el pico solar. No se toca aca porque NULLear esos agregados es una
-- decision de producto de Santiago, no un arreglo mecanico.
--
-- -----------------------------------------------------------------------------
-- Correr el archivo COMPLETO de una sola vez (SQL editor o `apply_migration`),
-- para que sea UNA transaccion: los `RAISE EXCEPTION` de las guardas dependen de
-- eso para deshacer todo. Misma convencion que 075/076/077/080/081, que tampoco
-- escriben BEGIN/COMMIT explicitos.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. Guardas previas -- estado esperado antes de tocar nada.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_stations         integer;
  v_wu_filas         integer;
  v_wu_lc1           integer;
  v_wu_ok            integer;
  v_objetivo         integer;
  v_objetivo_viejos  integer;
  v_check_def        text;
  v_total_pre        integer;
BEGIN
  -- 0.1 Exactamente dos poblaciones. Si aparece una tercera estacion, la
  --     semantica de `lecturas_count` deja de estar establecida y el backfill
  --     de mas abajo deja de ser seguro: hay que revisarlo a mano.
  SELECT count(DISTINCT station_id) INTO v_stations FROM public.clima_resumen_diario;
  IF v_stations <> 2 THEN
    RAISE EXCEPTION 'Migracion 103: se esperaban 2 station_id en clima_resumen_diario y hay %. El backfill asume dos poblaciones conocidas (import diario de Wunderground vs muestreo de 5 min de Ecowitt); con una tercera hay que revisar a mano antes de correr esto.', v_stations;
  END IF;

  -- 0.2 La poblacion historica esta congelada y es homogenea: 1.757 filas, todas
  --     con lecturas_count = 1. Es lo que justifica excluirla por station_id.
  SELECT count(*) INTO v_wu_filas
    FROM public.clima_resumen_diario WHERE station_id = 'wunderground-historico';
  SELECT count(*) INTO v_wu_lc1
    FROM public.clima_resumen_diario WHERE station_id = 'wunderground-historico' AND lecturas_count = 1;
  SELECT count(*) INTO v_wu_ok
    FROM public.clima_resumen_diario WHERE station_id = 'wunderground-historico' AND lluvia_confianza = 'ok';

  IF v_wu_filas <> 1757 THEN
    RAISE EXCEPTION 'Migracion 103: se esperaban 1.757 filas de wunderground-historico y hay %. Esa serie deberia estar cerrada (2020-07-01 .. 2025-11-04); si crecio, revisa a mano.', v_wu_filas;
  END IF;
  IF v_wu_lc1 <> v_wu_filas THEN
    RAISE EXCEPTION 'Migracion 103: % de las % filas de wunderground-historico NO tienen lecturas_count = 1. La exclusion por station_id deja de ser coherente -- ABORTA.', v_wu_filas - v_wu_lc1, v_wu_filas;
  END IF;
  IF v_wu_ok <> 1730 THEN
    RAISE EXCEPTION 'Migracion 103: se esperaban 1.730 filas ok en wunderground-historico y hay %.', v_wu_ok;
  END IF;

  -- 0.3 El conjunto a corregir. Se permite que haya crecido desde el analisis
  --     (2026-08-20): el cron nocturno puede haber sellado dias parciales
  --     nuevos mientras dure el corte de luz, y NULearlos es exactamente el
  --     objetivo. Lo que NO se permite es que aparezcan filas parciales viejas
  --     que el analisis no vio -- eso significaria que la poblacion no es la
  --     que se estudio.
  SELECT count(*) INTO v_objetivo
    FROM public.clima_resumen_diario
   WHERE station_id <> 'wunderground-historico'
     AND lecturas_count < 240
     AND lluvia_confianza = 'ok';

  SELECT count(*) INTO v_objetivo_viejos
    FROM public.clima_resumen_diario
   WHERE station_id <> 'wunderground-historico'
     AND lecturas_count < 240
     AND lluvia_confianza = 'ok'
     AND fecha <= DATE '2026-08-19'
     AND fecha NOT IN (DATE '2026-08-19', DATE '2026-03-30', DATE '2026-03-27', DATE '2026-03-18');

  IF v_objetivo < 4 THEN
    RAISE EXCEPTION 'Migracion 103: se esperaban al menos 4 filas parciales marcadas ok en la estacion Ecowitt y hay %. Puede que la migracion ya se haya corrido.', v_objetivo;
  END IF;
  IF v_objetivo_viejos <> 0 THEN
    RAISE EXCEPTION 'Migracion 103: aparecieron % filas parciales con fecha <= 2026-08-19 que el analisis del 2026-08-20 no identifico. La poblacion cambio -- revisa a mano antes de correr esto.', v_objetivo_viejos;
  END IF;

  -- 0.4 Los 4 dias conocidos tienen que seguir ahi.
  IF NOT EXISTS (SELECT 1 FROM public.clima_resumen_diario WHERE fecha = DATE '2026-08-19' AND lecturas_count = 167 AND lluvia_confianza = 'ok' AND lluvia_total_mm = 0.00) THEN
    RAISE EXCEPTION 'Migracion 103: la fila del 2026-08-19 no esta en el estado documentado (167 lecturas, ok, 0.00 mm). ABORTA.';
  END IF;

  -- 0.5 El CHECK todavia es el de la 068 (no se corrio esto antes).
  SELECT pg_get_constraintdef(oid) INTO v_check_def
    FROM pg_constraint
   WHERE conrelid = 'public.clima_resumen_diario'::regclass
     AND conname  = 'clima_resumen_diario_lluvia_confianza_check';
  IF v_check_def IS NULL THEN
    RAISE EXCEPTION 'Migracion 103: no existe clima_resumen_diario_lluvia_confianza_check. Estado inesperado -- ABORTA.';
  END IF;
  IF v_check_def LIKE '%cobertura_parcial%' THEN
    RAISE EXCEPTION 'Migracion 103: el CHECK ya incluye cobertura_parcial -- la migracion ya se corrio. ABORTA.';
  END IF;

  -- 0.6 Conteo de partida. La invariante que importa NO es un total absoluto
  --     sino que esta migracion no cree ni borre filas: el cron nocturno
  --     inserta una fila por dia, asi que cualquier numero fijo caduca a las
  --     24 horas de escribirlo. Se guarda transaction-local y se coteja al
  --     final contra si mismo.
  SELECT count(*) INTO v_total_pre FROM public.clima_resumen_diario;
  PERFORM set_config('m103.total_pre', v_total_pre::text, true);

  RAISE NOTICE 'Migracion 103: pre-condiciones OK -- 2 estaciones, 1.757 filas historicas intactas, % filas parciales por corregir, % filas en total al arrancar.', v_objetivo, v_total_pre;
END $$;


-- -----------------------------------------------------------------------------
-- 1. Cuarto valor admitido en lluvia_confianza.
-- -----------------------------------------------------------------------------
ALTER TABLE public.clima_resumen_diario
  DROP CONSTRAINT clima_resumen_diario_lluvia_confianza_check;

ALTER TABLE public.clima_resumen_diario
  ADD CONSTRAINT clima_resumen_diario_lluvia_confianza_check
  CHECK (lluvia_confianza IN ('ok', 'contador_congelado', 'sin_time_piezo', 'cobertura_parcial'));

COMMENT ON COLUMN public.clima_resumen_diario.lluvia_confianza IS
  'ok = contador verificado fresco ese dia. contador_congelado = el contador de Ecowitt no se reinicio (lluvia_total_mm queda NULL, nunca un duplicado). sin_time_piezo = Ecowitt no envio la senal de frescura; se confia en el valor crudo como antes de la migracion 068. cobertura_parcial = el dia se capturo incompleto (menos de 240 de las 288 lecturas de 5 min esperadas, tipicamente por corte de luz en la finca); lluvia_total_mm queda NULL porque el contador es acumulado y un dia truncado solo da una cota inferior, nunca un total -- migracion 103.';


-- -----------------------------------------------------------------------------
-- 2. El rollup nocturno pasa a mirar la cobertura del dia.
--
-- Cuerpo de la 068 verbatim salvo por la rama nueva del CASE y el CASE del
-- INSERT. Se conserva `SET search_path = public, pg_temp` porque la 082 lo
-- pineo sobre esta funcion y un CREATE OR REPLACE sin el lo perderia
-- (verificado contra `pg_get_functiondef` en produccion el 2026-08-20: el
-- cuerpo vivo es identico al fichero de la 068 mas ese pin).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_clima_rollup_diario(p_fecha date DEFAULT (now() AT TIME ZONE 'America/Bogota')::date - 1)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  WITH agregado AS (
    SELECT
      DATE(timestamp AT TIME ZONE 'America/Bogota') AS fecha,
      station_id,
      ROUND(MIN(temp_c), 2) AS temp_c_min,
      ROUND(MAX(temp_c), 2) AS temp_c_max,
      ROUND(AVG(temp_c), 2) AS temp_c_avg,
      ROUND(MIN(humedad_pct), 2) AS humedad_pct_min,
      ROUND(MAX(humedad_pct), 2) AS humedad_pct_max,
      ROUND(AVG(humedad_pct), 2) AS humedad_pct_avg,
      ROUND(MAX(lluvia_diaria_mm), 2) AS lluvia_max_dia,
      ROUND(AVG(viento_kmh), 2) AS viento_kmh_avg,
      ROUND(MAX(rafaga_kmh), 2) AS rafaga_kmh_max,
      ROUND(
        DEGREES(
          ATAN2(
            AVG(SIN(RADIANS(viento_dir))),
            AVG(COS(RADIANS(viento_dir)))
          )
        )::numeric % 360, 1
      ) AS viento_dir_predominante,
      ROUND(AVG(radiacion_wm2), 2) AS radiacion_wm2_avg,
      ROUND(MAX(radiacion_wm2), 2) AS radiacion_wm2_max,
      MAX(uv_index) AS uv_index_max,
      COUNT(*) AS lecturas_count,
      -- Freshness of the rain counter: Ecowitt's own "last updated" time for
      -- the chronologically last reading of the day.
      (ARRAY_AGG(lluvia_diaria_actualizada_en ORDER BY timestamp DESC))[1] AS ultima_actualizacion_lluvia
    FROM clima_lecturas
    WHERE DATE(timestamp AT TIME ZONE 'America/Bogota') = p_fecha
    GROUP BY 1, 2
  ),
  evaluado AS (
    SELECT
      a.*,
      CASE
        -- Migracion 103. Va PRIMERO: la cobertura del dia es anterior e
        -- independiente de cualquier pregunta sobre el contador de lluvia. Si
        -- solo se capturo una parte del dia no hay total que afirmar, se vea
        -- como se vea la marca de frescura del piezo. Puesto despues, la rama
        -- 'sin_time_piezo' -- que CONFIA en el valor crudo -- se disparia
        -- primero y dejaria pasar el numero de un dia truncado.
        -- 240 de 288 lecturas de 5 min = 83,3%. Los dias sanos de la estacion
        -- estan en 279-289; los incompletos, en 111-225. No hay zona gris.
        WHEN a.lecturas_count < 240 THEN 'cobertura_parcial'
        WHEN a.ultima_actualizacion_lluvia IS NULL THEN 'sin_time_piezo'
        WHEN DATE(a.ultima_actualizacion_lluvia AT TIME ZONE 'America/Bogota') < a.fecha THEN 'contador_congelado'
        WHEN a.lluvia_max_dia IS NOT NULL AND a.lluvia_max_dia > 0
             AND a.lluvia_max_dia IS NOT DISTINCT FROM y.lluvia_total_mm THEN 'contador_congelado'
        ELSE 'ok'
      END AS lluvia_confianza
    FROM agregado a
    LEFT JOIN clima_resumen_diario y
      ON y.fecha = a.fecha - 1 AND y.station_id = a.station_id
  )
  INSERT INTO clima_resumen_diario (
    fecha, station_id,
    temp_c_min, temp_c_max, temp_c_avg,
    humedad_pct_min, humedad_pct_max, humedad_pct_avg,
    lluvia_total_mm, lluvia_confianza,
    viento_kmh_avg, rafaga_kmh_max,
    viento_dir_predominante,
    radiacion_wm2_avg, radiacion_wm2_max,
    uv_index_max,
    lecturas_count
  )
  SELECT
    fecha, station_id,
    temp_c_min, temp_c_max, temp_c_avg,
    humedad_pct_min, humedad_pct_max, humedad_pct_avg,
    CASE WHEN lluvia_confianza IN ('contador_congelado', 'cobertura_parcial') THEN NULL ELSE lluvia_max_dia END,
    lluvia_confianza,
    viento_kmh_avg, rafaga_kmh_max,
    viento_dir_predominante,
    radiacion_wm2_avg, radiacion_wm2_max,
    uv_index_max,
    lecturas_count
  FROM evaluado
  ON CONFLICT (fecha, station_id) DO UPDATE SET
    temp_c_min      = EXCLUDED.temp_c_min,
    temp_c_max      = EXCLUDED.temp_c_max,
    temp_c_avg      = EXCLUDED.temp_c_avg,
    humedad_pct_min = EXCLUDED.humedad_pct_min,
    humedad_pct_max = EXCLUDED.humedad_pct_max,
    humedad_pct_avg = EXCLUDED.humedad_pct_avg,
    lluvia_total_mm = EXCLUDED.lluvia_total_mm,
    lluvia_confianza = EXCLUDED.lluvia_confianza,
    viento_kmh_avg  = EXCLUDED.viento_kmh_avg,
    rafaga_kmh_max  = EXCLUDED.rafaga_kmh_max,
    viento_dir_predominante = EXCLUDED.viento_dir_predominante,
    radiacion_wm2_avg = EXCLUDED.radiacion_wm2_avg,
    radiacion_wm2_max = EXCLUDED.radiacion_wm2_max,
    uv_index_max    = EXCLUDED.uv_index_max,
    lecturas_count  = EXCLUDED.lecturas_count;

  -- Prune old 5-min readings (keep rolling 24h window) -- same as before.
  DELETE FROM clima_lecturas
  WHERE timestamp < now() - interval '24 hours';
END;
$$;

COMMENT ON FUNCTION public.fn_clima_rollup_diario IS
  'Rollup nocturno de clima_lecturas -> clima_resumen_diario con deteccion de contador de lluvia congelado (migracion 068) y de dia capturado incompleto (migracion 103). p_fecha por defecto: ayer (Bogota).';


-- -----------------------------------------------------------------------------
-- 3. Backfill de los dias parciales ya escritos como confiables.
--
-- Acotado a la estacion de muestreo de 5 minutos. Sin ese filtro el UPDATE
-- alcanza las 1.730 filas historicas de wunderground-historico (agregados
-- diarios, lecturas_count = 1 por construccion) y borra cinco anios y medio de
-- lluvia legitima. Ver el encabezado, DESVIACION DELIBERADA #2.
-- -----------------------------------------------------------------------------
UPDATE public.clima_resumen_diario
   SET lluvia_confianza = 'cobertura_parcial',
       lluvia_total_mm  = NULL
 WHERE station_id <> 'wunderground-historico'
   AND lecturas_count < 240
   AND lluvia_confianza = 'ok';


-- -----------------------------------------------------------------------------
-- 4. Post-condiciones.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_parciales     integer;
  v_parciales_nn  integer;
  v_restantes     integer;
  v_wu_ok         integer;
  v_wu_parcial    integer;
  v_wu_nulos      integer;
  v_total         integer;
  v_total_pre     text;
  v_check_def     text;
BEGIN
  -- 4.1 Los dias parciales quedaron marcados, y TODOS con lluvia_total_mm NULL.
  SELECT count(*) INTO v_parciales
    FROM public.clima_resumen_diario WHERE lluvia_confianza = 'cobertura_parcial';
  SELECT count(*) INTO v_parciales_nn
    FROM public.clima_resumen_diario WHERE lluvia_confianza = 'cobertura_parcial' AND lluvia_total_mm IS NOT NULL;

  IF v_parciales < 4 THEN
    RAISE EXCEPTION 'Migracion 103: quedaron % filas cobertura_parcial, se esperaban al menos 4.', v_parciales;
  END IF;
  IF v_parciales_nn <> 0 THEN
    RAISE EXCEPTION 'Migracion 103: % filas cobertura_parcial conservan lluvia_total_mm. Un dia incompleto no puede afirmar un total -- ABORTA.', v_parciales_nn;
  END IF;

  -- 4.2 No queda ni un dia parcial de la estacion Ecowitt marcado ok. Esta es
  --     la verificacion de que el arreglo cerro, y se recalcula desde cero.
  SELECT count(*) INTO v_restantes
    FROM public.clima_resumen_diario
   WHERE station_id <> 'wunderground-historico'
     AND lecturas_count < 240
     AND lluvia_confianza = 'ok';
  IF v_restantes <> 0 THEN
    RAISE EXCEPTION 'Migracion 103: todavia quedan % dias parciales marcados ok. La correccion es incompleta.', v_restantes;
  END IF;

  -- 4.3 La serie historica de Wunderground quedo INTACTA. Es la guarda que
  --     protege contra el error que el hallazgo original traia incorporado.
  SELECT count(*) INTO v_wu_ok
    FROM public.clima_resumen_diario WHERE station_id = 'wunderground-historico' AND lluvia_confianza = 'ok';
  SELECT count(*) INTO v_wu_parcial
    FROM public.clima_resumen_diario WHERE station_id = 'wunderground-historico' AND lluvia_confianza = 'cobertura_parcial';
  SELECT count(*) INTO v_wu_nulos
    FROM public.clima_resumen_diario WHERE station_id = 'wunderground-historico' AND lluvia_total_mm IS NULL;

  IF v_wu_ok <> 1730 THEN
    RAISE EXCEPTION 'Migracion 103: wunderground-historico paso de 1.730 a % filas ok. El backfill toco la serie historica -- ABORTA.', v_wu_ok;
  END IF;
  IF v_wu_parcial <> 0 THEN
    RAISE EXCEPTION 'Migracion 103: % filas de wunderground-historico quedaron marcadas cobertura_parcial. ABORTA.', v_wu_parcial;
  END IF;
  IF v_wu_nulos <> 54 THEN
    RAISE EXCEPTION 'Migracion 103: wunderground-historico tiene % filas con lluvia_total_mm NULL, se esperaban 54 (las que ya venian sin dato del import). ABORTA.', v_wu_nulos;
  END IF;

  -- 4.4 No se creo ni se borro ninguna fila: esto es un UPDATE, no una limpieza.
  SELECT count(*) INTO v_total FROM public.clima_resumen_diario;
  v_total_pre := current_setting('m103.total_pre', true);
  IF v_total_pre IS NULL OR v_total_pre = '' THEN
    RAISE EXCEPTION 'Migracion 103: no se encontro el conteo de partida. Esta migracion DEBE correrse como una sola transaccion -- el bloque de pre-condiciones y el de post-condiciones tienen que compartir transaccion.';
  END IF;
  IF v_total <> v_total_pre::integer THEN
    RAISE EXCEPTION 'Migracion 103: clima_resumen_diario paso de % a % filas durante la migracion. Esta migracion solo ACTUALIZA: no inserta ni borra.', v_total_pre, v_total;
  END IF;

  -- 4.5 El CHECK admite el valor nuevo.
  SELECT pg_get_constraintdef(oid) INTO v_check_def
    FROM pg_constraint
   WHERE conrelid = 'public.clima_resumen_diario'::regclass
     AND conname  = 'clima_resumen_diario_lluvia_confianza_check';
  IF v_check_def IS NULL OR v_check_def NOT LIKE '%cobertura_parcial%' THEN
    RAISE EXCEPTION 'Migracion 103: el CHECK no quedo con cobertura_parcial. ABORTA.';
  END IF;

  RAISE NOTICE 'Migracion 103: post-condiciones OK -- % dias marcados cobertura_parcial (todos con lluvia_total_mm NULL), 0 dias parciales marcados ok, serie de wunderground-historico intacta (1.730 ok / 1.757 filas), 1.910 filas en total.', v_parciales;
END $$;


-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- No hace falta tabla de respaldo: son 4 filas y los valores previos estan
-- documentados aca. Si la migracion se corre despues del 2026-08-20 y el cron
-- alcanzo a sellar dias parciales nuevos, esos NO estan en esta lista -- para
-- deshacerlos habria que releer sus totales crudos, que el UPDATE de arriba si
-- descarta (a diferencia del backfill de la 068, que solo marca metadata).
-- Cotejar contra la salida del RAISE NOTICE del paso 4 antes de revertir.
--
-- Estado previo de las 4 filas conocidas (station_id = '84:1F:E8:35:D8:73 '):
--
--   fecha        lecturas_count  lluvia_total_mm  lluvia_confianza
--   2026-08-19   167             0.00             ok
--   2026-08-20   114             0.00             ok   <-- sellado por el cron
--                                                       del 2026-08-21 05:15 UTC,
--                                                       antes de aplicar esta
--                                                       migracion. Es el segundo
--                                                       dia del mismo corte de luz.
--   2026-03-30   147             18.03            ok
--   2026-03-27   225             3.30             ok
--   2026-03-18   111             1.02             ok
--
-- Para revertir por completo, en este orden:
--
--   -- (a) devolver las 4 filas a su estado previo
--   UPDATE public.clima_resumen_diario SET lluvia_confianza = 'ok', lluvia_total_mm = 0.00
--    WHERE fecha = DATE '2026-08-19' AND station_id = '84:1F:E8:35:D8:73 ';
--   UPDATE public.clima_resumen_diario SET lluvia_confianza = 'ok', lluvia_total_mm = 18.03
--    WHERE fecha = DATE '2026-03-30' AND station_id = '84:1F:E8:35:D8:73 ';
--   UPDATE public.clima_resumen_diario SET lluvia_confianza = 'ok', lluvia_total_mm = 3.30
--    WHERE fecha = DATE '2026-03-27' AND station_id = '84:1F:E8:35:D8:73 ';
--   UPDATE public.clima_resumen_diario SET lluvia_confianza = 'ok', lluvia_total_mm = 1.02
--    WHERE fecha = DATE '2026-03-18' AND station_id = '84:1F:E8:35:D8:73 ';
--
--   -- (b) restaurar la funcion de la 068 (correr el paso 3 de
--   --     068_clima_lluvia_confianza.sql tal cual, y volver a pinear el
--   --     search_path que agrego la 082):
--   --     ALTER FUNCTION public.fn_clima_rollup_diario(date) SET search_path = public, pg_temp;
--
--   -- (c) restaurar el CHECK original. Requiere que ya no quede ninguna fila
--   --     en 'cobertura_parcial', o falla:
--   ALTER TABLE public.clima_resumen_diario
--     DROP CONSTRAINT clima_resumen_diario_lluvia_confianza_check;
--   ALTER TABLE public.clima_resumen_diario
--     ADD CONSTRAINT clima_resumen_diario_lluvia_confianza_check
--     CHECK (lluvia_confianza IN ('ok', 'contador_congelado', 'sin_time_piezo'));
-- =============================================================================
