-- =============================================================================
-- 122_clima_lluvia_tres_senales.sql
--
-- La lluvia diaria deja de depender de UN contador acumulado fragil y pasa a
-- decidirse contrastando ese contador contra una senal INDEPENDIENTE que la
-- estacion ya venia guardando cada 5 minutos y que nadie leia nunca.
--
-- -----------------------------------------------------------------------------
-- EL BUG (medido contra produccion 2026-08-27, no supuesto)
-- -----------------------------------------------------------------------------
-- `fn_clima_rollup_diario` (068) marca `contador_congelado` por dos vias:
--
--   #1  la marca de frescura de Ecowitt (lluvia_diaria_actualizada_en) quedo
--       vieja                                            <- evidencia real
--   #2  el total de hoy es > 0 y es EXACTAMENTE igual al de ayer
--                                                        <- pura coincidencia
--
-- De los 31 dias marcados `contador_congelado`, 24 conservan su valor (el
-- backfill de la 068 solo escribio metadata). Se consultaron los 24:
--
--   LOS 24 TIENEN hoy_mm = ayer_mm EXACTO. Ninguno entro por evidencia.
--
-- El criterio #2 dispara solo porque el pluviometro es CUANTIZADO: 0,25 mm es
-- un tic del sensor (0.01 in = 0.254 mm), el valor no-cero mas frecuente que
-- existe en una zona de garua diaria. Dos dias seguidos de un tic cada uno y
-- el sistema declara el contador congelado y tira el dato:
--
--   07-30: 0.25 ok  ->  07-31: NULL congelado
--   08-01: 0.25 ok  ->  08-02: NULL congelado
--   08-09: 0.25 ok  ->  08-10: NULL congelado
--   08-12: 0.25 ok  ->  08-13: NULL congelado
--
-- Escala: 31 de 159 dias (19,5%). Una de cada cinco jornadas. Toda pantalla
-- que trate eso como "sin dato" queda permanentemente en naranja, y el
-- contador de dias sin lluvia se corta en el primer hueco: el tablero decia
-- "5 dias" cuando la respuesta real es ~36 (ultima lluvia >=10 mm confiable:
-- 2026-07-20).
--
-- -----------------------------------------------------------------------------
-- LO QUE LO HACE ARREGLABLE
-- -----------------------------------------------------------------------------
-- `clima_lecturas` ya guarda, por lectura, dos senales que NO dependen del
-- contador diario, y la funcion no lee ninguna (verificado sobre
-- pg_get_functiondef: no menciona ni lluvia_evento_mm ni lluvia_tasa_mm_hr):
--
--   lluvia_evento_mm   -- acumulador por EVENTO de lluvia; no se reinicia a
--                         medianoche, asi que la suma de sus deltas positivos
--                         dentro del dia es la lluvia caida ese dia
--   lluvia_tasa_mm_hr  -- tasa instantanea; integrada da un tercer total
--
-- Cotejo sobre la ventana viva (2026-08-27):
--
--   fecha        MAX(diaria)   SUM(deltas evento)   integral(tasa)
--   2026-08-25   0,00          0,00                 0,00
--   2026-08-26   0,25          0,25                 0,25
--
-- Tres metodos, mismo numero. Si el contador diario se congela, esos dos
-- siguen sanos -- y es justamente la discriminacion que faltaba.
--
-- -----------------------------------------------------------------------------
-- LA REGLA NUEVA
-- -----------------------------------------------------------------------------
-- El criterio #2 se ELIMINA. En su lugar, el contador se contrasta contra la
-- reconstruccion:
--
--   contador ~= evento (tolerancia)          -> 'ok',            valor = contador
--   contador vencido por frescura            -> 'reconstruido',  valor = evento
--   contador en desacuerdo con evento        -> 'reconstruido',  valor = evento
--
-- Esto mata el falso positivo CON EVIDENCIA, no con una excepcion:
--   * si de verdad llovio 15,75 dos dias seguidos, evento tambien dira 15,75,
--     coinciden, y el dia queda 'ok' con su numero;
--   * si el contador estaba congelado en 15,75, evento dira ~0, no coinciden,
--     y el dia queda 'reconstruido' con el valor real.
--
-- Tolerancia: GREATEST(0,5 mm; 10% del contador). 0,5 mm son dos tics del
-- sensor -- por debajo de eso la diferencia es resolucion, no desacuerdo.
--
-- DESVIACION DELIBERADA #1 -- por que 'cobertura_parcial' deja de ser NULL.
-- La 103 puso NULL porque un contador ACUMULADO truncado da una cota
-- inferior, no un total. Sigue siendo cierto del contador; pero la suma de
-- deltas de evento sobre las horas que SI se capturaron es una medicion real
-- de esas horas. Se guarda ese valor, que es una cota inferior honesta y
-- util, en vez de tirar el dia entero. La etiqueta 'cobertura_parcial' se
-- conserva para que el consumidor sepa que es cota inferior.
--
-- DESVIACION DELIBERADA #2 -- guarda anti-cero-fabricado.
-- Si un dia NO tiene ninguna lectura con lluvia_evento_mm (n_evento = 0) no
-- hay senal independiente con que contrastar, y aplicar la regla nueva
-- fabricaria un 0 (evento suma 0 por ausencia, no por sequia) -- exactamente
-- el pecado que 068/103/115 existen para impedir. En ese caso se conserva el
-- comportamiento previo (frescura + cobertura, NULL incluido). Hoy la columna
-- esta poblada en 521 de 521 lecturas, asi que esa rama deberia estar muerta;
-- esta por seguridad, no por uso esperado.
--
-- -----------------------------------------------------------------------------
-- LO QUE ESTA MIGRACION NO HACE
-- -----------------------------------------------------------------------------
-- No repara ninguna fila historica. Los 31 dias ya marcados siguen igual: sus
-- lecturas de 5 min fueron podadas hace rato (ventana rodante de 24 h) y la
-- reconstruccion necesita esas lecturas. Se reparan con
-- `POST /clima/backfill`, que las vuelve a traer de la History API de Ecowitt
-- y llama a esta misma funcion. Es prospectiva y aditiva.
--
-- No toca temperatura, humedad, viento ni radiacion -- mismo alcance
-- deliberado que 103 y 115.
--
-- Correr el archivo COMPLETO de una sola vez, para que las guardas compartan
-- transaccion -- misma convencion que 075/076/077/080/081/103/115.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. Guardas previas.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_check_def  text;
  v_fn         integer;
  v_total_pre  integer;
  v_col        integer;
BEGIN
  -- 0.1 Se para sobre 103 (cobertura_parcial) y 115 (ultima_lectura_en).
  SELECT pg_get_constraintdef(oid) INTO v_check_def
    FROM pg_constraint
   WHERE conrelid = 'public.clima_resumen_diario'::regclass
     AND conname  = 'clima_resumen_diario_lluvia_confianza_check';
  IF v_check_def IS NULL OR v_check_def NOT LIKE '%cobertura_parcial%' THEN
    RAISE EXCEPTION 'Migracion 122: falta el CHECK con cobertura_parcial (migracion 103 no aplicada). ABORTA.';
  END IF;
  IF v_check_def LIKE '%reconstruido%' THEN
    RAISE EXCEPTION 'Migracion 122: el CHECK ya incluye reconstruido -- ya se corrio. ABORTA.';
  END IF;

  SELECT count(*) INTO v_col FROM information_schema.columns
   WHERE table_schema='public' AND table_name='clima_resumen_diario' AND column_name='ultima_lectura_en';
  IF v_col <> 1 THEN
    RAISE EXCEPTION 'Migracion 122: falta clima_resumen_diario.ultima_lectura_en (migracion 115 no aplicada). ABORTA.';
  END IF;

  -- 0.2 Una sola firma de la funcion a reemplazar.
  SELECT count(*) INTO v_fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='fn_clima_rollup_diario';
  IF v_fn <> 1 THEN
    RAISE EXCEPTION 'Migracion 122: se esperaba 1 fn_clima_rollup_diario y hay %. ABORTA.', v_fn;
  END IF;

  -- 0.3 Las dos senales independientes existen en clima_lecturas. Sin ellas la
  --     regla nueva no tiene sobre que pararse.
  SELECT count(*) INTO v_col FROM information_schema.columns
   WHERE table_schema='public' AND table_name='clima_lecturas'
     AND column_name IN ('lluvia_evento_mm','lluvia_tasa_mm_hr');
  IF v_col <> 2 THEN
    RAISE EXCEPTION 'Migracion 122: clima_lecturas no tiene lluvia_evento_mm y lluvia_tasa_mm_hr. ABORTA.';
  END IF;

  -- 0.4 Linea base relativa, nunca un literal -- el cron nocturno inserta una
  --     fila por dia y un numero fijo caduca a las 24 horas (leccion de la 103).
  SELECT count(*) INTO v_total_pre FROM public.clima_resumen_diario;
  PERFORM set_config('m122.total_pre', v_total_pre::text, true);

  RAISE NOTICE 'Migracion 122: pre-condiciones OK -- % filas al arrancar.', v_total_pre;
END $$;


-- -----------------------------------------------------------------------------
-- 1. Valor nuevo de lluvia_confianza + columna de auditoria.
--
-- `lluvia_mm_evento` guarda la reconstruccion independiente SIEMPRE, coincida
-- o no con el contador. Sin ella, "por que este dia quedo reconstruido" solo
-- se puede contestar mientras las lecturas de 5 min sigan vivas -- o sea 24
-- horas. Es el mismo error que la 115 arreglo guardando `ultima_lectura_en`.
-- -----------------------------------------------------------------------------
ALTER TABLE public.clima_resumen_diario
  DROP CONSTRAINT clima_resumen_diario_lluvia_confianza_check;

ALTER TABLE public.clima_resumen_diario
  ADD CONSTRAINT clima_resumen_diario_lluvia_confianza_check
  CHECK (lluvia_confianza IN ('ok', 'contador_congelado', 'sin_time_piezo', 'cobertura_parcial', 'reconstruido'));

ALTER TABLE public.clima_resumen_diario
  ADD COLUMN IF NOT EXISTS lluvia_mm_evento numeric(6,2);

COMMENT ON COLUMN public.clima_resumen_diario.lluvia_mm_evento IS
  'Lluvia del dia reconstruida desde lluvia_evento_mm (suma de deltas positivos del acumulador por evento), independiente del contador diario acumulado. Se guarda SIEMPRE, coincida o no con lluvia_total_mm, para poder auditar despues por que un dia quedo reconstruido -- migracion 122. NULL en toda fila anterior a esta migracion y en dias sin senal de evento.';

COMMENT ON COLUMN public.clima_resumen_diario.lluvia_confianza IS
  'ok = el contador diario coincide con la reconstruccion independiente; lluvia_total_mm sale del contador. reconstruido = el contador estaba vencido por frescura o en desacuerdo con la reconstruccion; lluvia_total_mm sale de lluvia_mm_evento (migracion 122). cobertura_parcial = el dia se capturo incompleto (menos de 240 de 288 lecturas -- migracion 103 -- o la ultima lectura quedo a mas de 30 min de la medianoche -- migracion 115); lluvia_total_mm es una COTA INFERIOR real, no un total. contador_congelado / sin_time_piezo = etiquetas de 068 que esta funcion ya no escribe salvo cuando no hay senal independiente; sobreviven en filas historicas.';


-- -----------------------------------------------------------------------------
-- 2. El rollup contrasta el contador contra la senal independiente.
--
-- Cuerpo de la 115 con dos cambios estructurales:
--   (a) el LAG de lluvia_evento_mm necesita la lectura ANTERIOR, que puede caer
--       en el dia previo, asi que la ventana se calcula sobre la tabla completa
--       y el filtro por p_fecha se aplica DESPUES (antes el WHERE estaba dentro
--       del agregado y habria cortado la linea base del primer delta del dia);
--   (b) el CASE decide por acuerdo entre senales, no por coincidencia de totales.
--
-- Se conserva `SET search_path = public, pg_temp` -- lo pineo la 082 y un
-- CREATE OR REPLACE sin el lo perderia (mismo aviso de 103 y 115).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_clima_rollup_diario(p_fecha date DEFAULT (now() AT TIME ZONE 'America/Bogota')::date - 1)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Margen de la 115: la ultima lectura del dia tiene que quedar a menos de
  -- esto de la medianoche local, o el dia se capturo truncado al final.
  v_margen_fin_dia CONSTANT interval := interval '30 minutes';
  -- Piso de tolerancia al comparar contador vs reconstruccion. 0,5 mm son dos
  -- tics del pluviometro (0,254 mm cada uno): por debajo es resolucion del
  -- sensor, no desacuerdo.
  v_tolerancia_mm  CONSTANT numeric  := 0.5;
  -- Componente proporcional de la tolerancia, para dias de lluvia fuerte donde
  -- 0,5 mm es demasiado estricto.
  v_tolerancia_pct CONSTANT numeric  := 0.10;
  -- Umbral de cobertura de la 103: 240 de las 288 lecturas de 5 min (83%).
  v_min_lecturas   CONSTANT integer  := 240;
BEGIN
  WITH base AS (
    -- Ventana calculada sobre TODA la tabla: el primer delta de evento del dia
    -- necesita como linea base la ultima lectura del dia anterior.
    SELECT
      timestamp,
      station_id,
      (timestamp AT TIME ZONE 'America/Bogota')::date AS fecha,
      temp_c, humedad_pct, viento_kmh, rafaga_kmh, viento_dir,
      radiacion_wm2, uv_index,
      lluvia_diaria_mm,
      lluvia_evento_mm,
      lluvia_tasa_mm_hr,
      lluvia_diaria_actualizada_en,
      lluvia_evento_mm
        - LAG(lluvia_evento_mm) OVER (PARTITION BY station_id ORDER BY timestamp) AS d_evento
    FROM clima_lecturas
  ),
  agregado AS (
    SELECT
      fecha,
      station_id,
      ROUND(MIN(temp_c), 2) AS temp_c_min,
      ROUND(MAX(temp_c), 2) AS temp_c_max,
      ROUND(AVG(temp_c), 2) AS temp_c_avg,
      ROUND(MIN(humedad_pct), 2) AS humedad_pct_min,
      ROUND(MAX(humedad_pct), 2) AS humedad_pct_max,
      ROUND(AVG(humedad_pct), 2) AS humedad_pct_avg,
      ROUND(MAX(lluvia_diaria_mm), 2) AS lluvia_contador,
      -- Reconstruccion independiente: solo deltas POSITIVOS, porque el
      -- acumulador de evento se reinicia entre eventos y un delta negativo es
      -- ese reinicio, no lluvia negativa.
      ROUND(SUM(GREATEST(COALESCE(d_evento, 0), 0)), 2) AS lluvia_evento,
      COUNT(lluvia_evento_mm) AS n_evento,
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
      (ARRAY_AGG(lluvia_diaria_actualizada_en ORDER BY timestamp DESC))[1] AS ultima_actualizacion_lluvia,
      MAX(timestamp) AS ultima_lectura_en
    FROM base
    WHERE fecha = p_fecha
    GROUP BY fecha, station_id
  ),
  senales AS (
    SELECT
      a.*,
      -- Hay con que contrastar.
      (a.n_evento > 0) AS hay_senal,
      -- Cobertura (103 + 115): el dia se vio entero, principio y final.
      (a.lecturas_count < v_min_lecturas
       OR (a.fecha + interval '1 day') - (a.ultima_lectura_en AT TIME ZONE 'America/Bogota') > v_margen_fin_dia
      ) AS cobertura_corta,
      -- Frescura (068 #1): la unica de las dos vias viejas que tenia evidencia.
      (a.ultima_actualizacion_lluvia IS NOT NULL
       AND (a.ultima_actualizacion_lluvia AT TIME ZONE 'America/Bogota')::date < a.fecha
      ) AS frescura_vencida,
      -- Acuerdo entre el contador y la reconstruccion.
      (a.lluvia_contador IS NOT NULL
       AND ABS(a.lluvia_contador - a.lluvia_evento)
           <= GREATEST(v_tolerancia_mm, a.lluvia_contador * v_tolerancia_pct)
      ) AS coincide
    FROM agregado a
  ),
  evaluado AS (
    SELECT
      s.*,
      CASE
        -- Sin senal independiente no se puede contrastar; se conserva el
        -- comportamiento previo, NULL incluido (ver DESVIACION DELIBERADA #2).
        WHEN NOT s.hay_senal THEN
          CASE
            WHEN s.cobertura_corta                          THEN 'cobertura_parcial'
            WHEN s.ultima_actualizacion_lluvia IS NULL      THEN 'sin_time_piezo'
            WHEN s.frescura_vencida                         THEN 'contador_congelado'
            ELSE 'ok'
          END
        -- Dia truncado: el valor es una cota inferior real, ya no un NULL.
        WHEN s.cobertura_corta                              THEN 'cobertura_parcial'
        WHEN s.coincide                                     THEN 'ok'
        ELSE 'reconstruido'
      END AS lluvia_confianza,
      CASE
        WHEN NOT s.hay_senal THEN
          CASE
            WHEN s.cobertura_corta OR s.frescura_vencida    THEN NULL
            ELSE s.lluvia_contador
          END
        WHEN s.cobertura_corta                              THEN s.lluvia_evento
        WHEN s.coincide                                     THEN s.lluvia_contador
        ELSE s.lluvia_evento
      END AS lluvia_total_mm_final
    FROM senales s
  )
  INSERT INTO clima_resumen_diario (
    fecha, station_id,
    temp_c_min, temp_c_max, temp_c_avg,
    humedad_pct_min, humedad_pct_max, humedad_pct_avg,
    lluvia_total_mm, lluvia_confianza, lluvia_mm_evento,
    viento_kmh_avg, rafaga_kmh_max,
    viento_dir_predominante,
    radiacion_wm2_avg, radiacion_wm2_max,
    uv_index_max,
    lecturas_count,
    ultima_lectura_en
  )
  SELECT
    fecha, station_id,
    temp_c_min, temp_c_max, temp_c_avg,
    humedad_pct_min, humedad_pct_max, humedad_pct_avg,
    lluvia_total_mm_final,
    lluvia_confianza,
    CASE WHEN hay_senal THEN lluvia_evento ELSE NULL END,
    viento_kmh_avg, rafaga_kmh_max,
    viento_dir_predominante,
    radiacion_wm2_avg, radiacion_wm2_max,
    uv_index_max,
    lecturas_count,
    ultima_lectura_en
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
    lluvia_mm_evento = EXCLUDED.lluvia_mm_evento,
    viento_kmh_avg  = EXCLUDED.viento_kmh_avg,
    rafaga_kmh_max  = EXCLUDED.rafaga_kmh_max,
    viento_dir_predominante = EXCLUDED.viento_dir_predominante,
    radiacion_wm2_avg = EXCLUDED.radiacion_wm2_avg,
    radiacion_wm2_max = EXCLUDED.radiacion_wm2_max,
    uv_index_max    = EXCLUDED.uv_index_max,
    lecturas_count  = EXCLUDED.lecturas_count,
    ultima_lectura_en = EXCLUDED.ultima_lectura_en;

  -- Poda de la ventana rodante de 24 h -- igual que 036/068/103/115.
  DELETE FROM clima_lecturas
  WHERE timestamp < now() - interval '24 hours';
END;
$$;

COMMENT ON FUNCTION public.fn_clima_rollup_diario IS
  'Rollup nocturno de clima_lecturas -> clima_resumen_diario. La lluvia del dia se decide contrastando el contador acumulado de Ecowitt contra una reconstruccion independiente hecha con los deltas de lluvia_evento_mm (migracion 122); ademas detecta dia con menos del 83% de las lecturas (103) y dia cortado cerca de la medianoche (115). p_fecha por defecto: ayer (Bogota).';


-- -----------------------------------------------------------------------------
-- 3. Sin backfill. Los 31 dias historicos se reparan con POST /clima/backfill,
--    que retrae las lecturas de 5 min de la History API de Ecowitt y llama a
--    esta misma funcion. Aca no hay nada que recalcular: sus lecturas fueron
--    podadas hace meses.
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- 4. Post-condiciones.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_check_def   text;
  v_fn_def      text;
  v_fn_cfg      text;
  v_total_post  integer;
  v_total_pre   text;
  v_col_tipo    text;
BEGIN
  -- 4.1 El CHECK admite el valor nuevo y conserva los cuatro viejos (las filas
  --     historicas los siguen usando).
  SELECT pg_get_constraintdef(oid) INTO v_check_def
    FROM pg_constraint
   WHERE conrelid = 'public.clima_resumen_diario'::regclass
     AND conname  = 'clima_resumen_diario_lluvia_confianza_check';
  IF v_check_def IS NULL
     OR v_check_def NOT LIKE '%reconstruido%'
     OR v_check_def NOT LIKE '%contador_congelado%'
     OR v_check_def NOT LIKE '%cobertura_parcial%'
     OR v_check_def NOT LIKE '%sin_time_piezo%' THEN
    RAISE EXCEPTION 'Migracion 122: el CHECK no quedo con los 5 valores. Encontrado: %', v_check_def;
  END IF;

  -- 4.2 La columna de auditoria quedo creada y nullable.
  SELECT data_type INTO v_col_tipo FROM information_schema.columns
   WHERE table_schema='public' AND table_name='clima_resumen_diario' AND column_name='lluvia_mm_evento';
  IF v_col_tipo IS NULL THEN
    RAISE EXCEPTION 'Migracion 122: lluvia_mm_evento no quedo creada. ABORTA.';
  END IF;

  -- 4.3 La funcion quedo con la logica nueva Y conservo el search_path de 082.
  SELECT pg_get_functiondef(p.oid), array_to_string(p.proconfig, ',')
    INTO v_fn_def, v_fn_cfg
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='fn_clima_rollup_diario';

  IF v_fn_def NOT LIKE '%lluvia_evento_mm%' OR v_fn_def NOT LIKE '%v_tolerancia_mm%' THEN
    RAISE EXCEPTION 'Migracion 122: la funcion no quedo con la reconstruccion por evento. ABORTA.';
  END IF;
  -- La heuristica de coincidencia de totales tiene que haber DESAPARECIDO: es
  -- el bug que esta migracion existe para cerrar.
  IF v_fn_def LIKE '%IS NOT DISTINCT FROM y.lluvia_total_mm%' THEN
    RAISE EXCEPTION 'Migracion 122: la funcion todavia compara el total de hoy contra el de ayer. Esa heuristica es el bug. ABORTA.';
  END IF;
  IF v_fn_cfg IS NULL OR v_fn_cfg !~ 'search_path=public,\s*pg_temp' THEN
    RAISE EXCEPTION 'Migracion 122: fn_clima_rollup_diario perdio el search_path pineado (encontrado: %). ABORTA.', v_fn_cfg;
  END IF;

  -- 4.4 Ni una fila se creo ni se borro: esto reemplaza una funcion y agrega
  --     una columna, no toca datos.
  SELECT count(*) INTO v_total_post FROM public.clima_resumen_diario;
  v_total_pre := current_setting('m122.total_pre', true);
  IF v_total_pre IS NULL OR v_total_pre = '' THEN
    RAISE EXCEPTION 'Migracion 122: no se encontro el conteo de partida. Correr el archivo como UNA transaccion.';
  END IF;
  IF v_total_post <> v_total_pre::integer THEN
    RAISE EXCEPTION 'Migracion 122: clima_resumen_diario paso de % a % filas. Esta migracion no inserta ni borra.', v_total_pre, v_total_post;
  END IF;

  RAISE NOTICE 'Migracion 122: post-condiciones OK -- CHECK con 5 valores, lluvia_mm_evento creada, funcion con reconstruccion por evento y sin la heuristica de duplicado, search_path pineado, % filas (sin cambio).', v_total_post;
END $$;


-- =============================================================================
-- ROLLBACK (manual)
-- =============================================================================
-- No hay filas que restaurar: esta migracion no modifica datos.
--   (a) restaurar la funcion de la 115 (correr su paso 2 tal cual);
--   (b) solo despues, y solo si ninguna fila quedo en 'reconstruido':
--       ALTER TABLE public.clima_resumen_diario DROP COLUMN lluvia_mm_evento;
--       ALTER TABLE public.clima_resumen_diario
--         DROP CONSTRAINT clima_resumen_diario_lluvia_confianza_check;
--       ALTER TABLE public.clima_resumen_diario
--         ADD CONSTRAINT clima_resumen_diario_lluvia_confianza_check
--         CHECK (lluvia_confianza IN ('ok','contador_congelado','sin_time_piezo','cobertura_parcial'));
-- =============================================================================
