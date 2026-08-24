-- =============================================================================
-- 115_clima_cobertura_fin_dia.sql
--
-- Hallazgo #42 (PO 2026-08-24). NO APLICAR AQUI -- este archivo va en un PR
-- para revision adversarial; el orquestador la aplica despues.
--
-- NUMERACION: 110 (`delete_globalgap_por_rol`) y 111 (`cerrar_logs_auditoria`)
-- estan aplicadas/en vuelo (PR #160, #161); 112 (`productos_updated_by`) esta
-- en vuelo (PR #162). Si no ves esos ficheros en este arbol es porque sus PR
-- no se fusionaron todavia -- no es un hueco. Se salta 113 y 114 (reservados,
-- sin fichero todavia) y se numera 115 por instruccion directa del hallazgo.
--
-- -----------------------------------------------------------------------------
-- EL BUG (mirror exacto del que motivo la 103)
-- -----------------------------------------------------------------------------
-- La 103 le enseno al rollup a preguntar CUANTO del dia se capturo
-- (`lecturas_count < 240`). No le enseno a preguntar CUANDO se corto la
-- captura. Un dia que arranca sano y se detiene temprano -- la estacion deja
-- de reportar a las 17:00 y no vuelve -- puede acumular igual 249, 268, 272 o
-- 279 lecturas (por encima del umbral de la 103) sin haber visto nunca la
-- tarde/noche. El contador de lluvia de Ecowitt es ACUMULADO: la ultima
-- lectura recibida ese dia es el total hasta ESE momento, nunca el total del
-- dia si el dia sigue corriendo despues. Sellar esa ultima lectura como
-- `lluvia_total_mm` confiable es exactamente el mismo error que la 103 cerro
-- para el caso de huecos a mitad de jornada -- aca el hueco esta al final, y
-- el umbral de conteo por si solo no lo distingue de un dia sano con jitter.
--
-- Medido sobre los ultimos 90 dias contra `clima_resumen_diario` (agregado,
-- no lectura cruda -- ver mas abajo por que eso importa): 4 dias caen en la
-- banda que la 103 declaraba vacia (240-278 lecturas, sellados `ok`):
--
--   fecha        lecturas_count   lluvia_total_mm   lluvia_confianza (hoy)
--   2026-08-21   249              0.00              ok
--   2026-07-09   268              28.19             ok
--   2026-06-23   272              0.00              ok
--   2026-08-06   279              --                ok
--
-- -----------------------------------------------------------------------------
-- LA DECISION -- 28,19 mm del 2026-07-09 NO se descartan, y ninguno de los 4
-- dias de arriba se re-evalua. Las dos cosas van juntas, no son independientes.
-- -----------------------------------------------------------------------------
-- Razon por la que NO se descarta el numero: un contador acumulado truncado
-- da una COTA INFERIOR, nunca un total. 28,19 mm sobre 268 lecturas es lo
-- MINIMO que llovio ese dia, no una cifra inventada -- subir el umbral de
-- conteo (a 275, digamos) para volver a capturar el caso convertiria un dato
-- real y conservador en "sin dato" en la historia permanente. Es exactamente
-- la perdida que las migraciones 068 y 103 existen para impedir. Por eso el
-- arreglo NO es mover el umbral de conteo.
--
-- Razon por la que los 4 dias NO se re-evaluan ni se tocan (ni con un
-- backfill, ni re-corriendo la funcion nueva sobre ellos): la pregunta nueva
-- -- "¿la ultima lectura del dia quedo cerca de la medianoche?" -- necesita
-- el TIMESTAMP de cada lectura cruda de ESE dia, y `clima_lecturas` es una
-- ventana rodante de ~24 h que esta misma funcion poda a diario (migracion
-- 036/068). Para los 4 dias de arriba esa informacion ya no existe en ningun
-- lado: `clima_resumen_diario` nunca guardo la hora de la ultima lectura
-- (hasta esta migracion), asi que la POSICION del hueco de un dia ya sellado
-- es irrecuperable. Confirmando la logica al reves: el "3h15m sin capturar"
-- del 2026-08-21 que cito el hallazgo es (288-249)×5min -- una estimacion del
-- TOTAL de minutos perdidos asumiendo distribucion pareja, no de DONDE
-- cayeron esos minutos. No alcanza para decidir si el hueco de ese dia
-- especifico estuvo al final (el patron que esta migracion ataca) o a mitad
-- de jornada (el patron que la 103 ya deberia haber capturado, y no capturo
-- porque 249 >= 240). Inventar una posicion para poder re-evaluar violaria la
-- misma regla que gobierna todo el modulo: "sin dato" es NULL, nunca un
-- numero construido. Es justo la razon por la que el arreglo tiene que vivir
-- en el ROLLUP -- corriendo desde ahora, con datos frescos -- y no en un
-- backfill sobre historia que ya perdio el detalle que necesita.
--
-- Consecuencia explicita: los 4 dias de arriba se quedan exactamente como
-- estan hoy (`ok`, con su `lluvia_total_mm` intacto, incluidos los 28,19 mm
-- del 07-09 y el 0,00 mm del 08-21 y el 06-23, que pueden ser reales o pueden
-- ser el mismo patron de corte temprano sin forma de saberlo ya). Esta
-- migracion es aditiva y prospectiva: no hace NINGUN UPDATE sobre
-- `clima_resumen_diario`. La proxima vez que un corte de luz corte la tarde,
-- el rollup de esa noche lo va a marcar solo.
--
-- -----------------------------------------------------------------------------
-- EL ARREGLO
-- -----------------------------------------------------------------------------
-- La pregunta deja de ser solo "¿cuanto del dia vimos?" (recuento total,
-- 103) y pasa a incluir "¿vimos el FINAL del dia?" (posicion de la ultima
-- lectura). Un hueco al PRINCIPIO o a MITAD del dia no es sospechoso para el
-- total acumulado -- el contador sigue sumando con las lecturas que
-- faltaron adentro, y la ultima lectura del dia ya trae ese total completo.
-- Un hueco al FINAL si lo es: la ultima lectura recibida es un corte a mitad
-- de camino, y todo lo que hubiera llovido despues de esa hora queda fuera
-- para siempre. Esa asimetria es justo lo que el recuento total no puede ver
-- por si solo -- 268 lecturas bien repartidas hasta las 23:55 cuentan una
-- historia completamente distinta de 268 lecturas que se detienen a las
-- 17:00 y nunca vuelven, y el conteo de la 103 les da el mismo numero.
--
-- Regla nueva, agregada al CASE de `fn_clima_rollup_diario`, en la MISMA
-- categoria que el chequeo de conteo de la 103 (pregunta de COBERTURA, no de
-- frescura del contador de lluvia -- ver la 103 DESVIACION DELIBERADA #1
-- sobre por que esta clase de chequeo va primero en el CASE): si la ultima
-- lectura recibida ese dia (`MAX(timestamp)`, agregada de `clima_lecturas`)
-- quedo a mas de 30 minutos de la medianoche local, el dia queda
-- `cobertura_parcial` igual que un dia con menos de 240 lecturas.
--
-- 30 minutos = 6 lecturas de 5 minutos de margen. Aviso honesto sobre esta
-- cifra: a diferencia del umbral de 240 de la 103 -- que se ajusto contra un
-- pull en vivo de los 153 dias de la estacion --, esta sesion no tiene acceso
-- de lectura a produccion (el CLI no tiene password de BD y el conector MCP
-- sin autenticar es de solo escritura de migraciones, no de consulta; ver
-- memoria del repo). 30 minutos sale de la cadencia de muestreo conocida (un
-- reporte cada 5 min) con un colchon de 6x para el jitter del cron -- del
-- mismo orden que el margen que la propia 103 documenta como normal (dias
-- sanos en 279-289 de 288, o sea hasta 9 lecturas de holgura sin que nadie lo
-- vea como problema). Si al revisar esto contra `clima_lecturas` en vivo el
-- margen real de jitter resulta mayor, es un cambio de una constante
-- (`v_margen_fin_dia`, declarada al principio de la funcion), no de la logica.
--
-- Se guarda la hora de la ultima lectura en una columna nueva,
-- `clima_resumen_diario.ultima_lectura_en`, en vez de calcularla solo
-- adentro de la funcion y descartarla: es exactamente el dato que hizo
-- irrecuperables a los 4 dias historicos de arriba, asi que a partir de hoy
-- se conserva -- sin ella, el proximo dia sospechoso vuelve a ser
-- imposible de auditar en cuanto pasen 24 horas y `clima_lecturas` lo pode.
--
-- -----------------------------------------------------------------------------
-- LO QUE ESTA MIGRACION NO HACE
-- -----------------------------------------------------------------------------
-- No re-evalua, no re-sella y no hace UPDATE de ninguna fila existente de
-- `clima_resumen_diario` -- ver la seccion de la decision arriba. Es
-- estrictamente aditiva: una columna nueva (nullable, sin DEFAULT, todas las
-- filas viejas quedan en NULL) y un reemplazo de funcion que solo cambia el
-- comportamiento de las corridas del cron DE AHORA EN ADELANTE.
--
-- No toca temperatura, humedad, viento ni radiacion -- mismo alcance
-- deliberado que la 103 (esos agregados de un dia con hueco al final quedan
-- fuera de este arreglo; es decision de producto de Santiago, no mecanica).
--
-- No cambia el contrato de lectura: `lluvia_confianza` sigue teniendo los
-- mismos 4 valores (el CHECK no se toca), y `lluviaConfiableDeResumen()`
-- (`src/utils/calculosClima.ts`) ya trata cualquier `cobertura_parcial` como
-- "sin dato" sea cual sea la razon -- no hace falta ningun cambio de
-- frontend para que un dia marcado por esta regla nueva se vea como `s/d` en
-- vez de una barra en cero.
--
-- Correr el archivo COMPLETO de una sola vez (SQL editor o `apply_migration`),
-- para que los `RAISE EXCEPTION` de las guardas compartan transaccion con el
-- resto -- misma convencion que 075/076/077/080/081/103.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. Guardas previas.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_col_existente  integer;
  v_check_def      text;
  v_fn_existente   integer;
  v_total_pre      integer;
BEGIN
  -- 0.1 Migracion aditiva, corre una sola vez. Si la columna ya existe, ya
  --     se aplico -- abortar con un mensaje explicito en vez de dejar que el
  --     ALTER TABLE falle mas abajo con el error generico de Postgres.
  SELECT count(*) INTO v_col_existente
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'clima_resumen_diario'
     AND column_name = 'ultima_lectura_en';
  IF v_col_existente > 0 THEN
    RAISE EXCEPTION 'Migracion 115: clima_resumen_diario.ultima_lectura_en ya existe -- la migracion ya se corrio. ABORTA.';
  END IF;

  -- 0.2 Esta migracion asume el estado que dejo la 103: el CHECK ya admite
  --     cobertura_parcial. Si no esta, 103 no esta aplicada y esta migracion
  --     no tiene sobre que pararse (reutiliza esa etiqueta, no crea una).
  SELECT pg_get_constraintdef(oid) INTO v_check_def
    FROM pg_constraint
   WHERE conrelid = 'public.clima_resumen_diario'::regclass
     AND conname  = 'clima_resumen_diario_lluvia_confianza_check';
  IF v_check_def IS NULL OR v_check_def NOT LIKE '%cobertura_parcial%' THEN
    RAISE EXCEPTION 'Migracion 115: el CHECK de lluvia_confianza no incluye cobertura_parcial todavia -- la migracion 103 no esta aplicada. ABORTA.';
  END IF;

  -- 0.3 La funcion que se va a reemplazar existe, con una unica firma.
  SELECT count(*) INTO v_fn_existente
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_clima_rollup_diario';
  IF v_fn_existente <> 1 THEN
    RAISE EXCEPTION 'Migracion 115: se esperaba exactamente 1 fn_clima_rollup_diario en public y hay %. ABORTA.', v_fn_existente;
  END IF;

  -- 0.4 Conteo de partida. Esta migracion NO debe tocar ninguna fila
  --     existente -- solo agrega una columna nullable y reemplaza la
  --     funcion. Se guarda transaction-local (misma tecnica que la 103,
  --     guardas 0.6/4.4) para cotejar contra si mismo en la postcondicion,
  --     nunca contra un literal -- el cron nocturno inserta una fila por dia
  --     y un literal caduca a las 24 horas de escribirlo.
  SELECT count(*) INTO v_total_pre FROM public.clima_resumen_diario;
  PERFORM set_config('m115.total_pre', v_total_pre::text, true);

  RAISE NOTICE 'Migracion 115: pre-condiciones OK -- columna nueva por crear, CHECK ya admite cobertura_parcial, 1 funcion a reemplazar, % filas en clima_resumen_diario al arrancar.', v_total_pre;
END $$;


-- -----------------------------------------------------------------------------
-- 1. Columna nueva: hora de la ultima lectura de 5 min del dia.
--
-- Nullable, sin DEFAULT -- las filas existentes quedan en NULL a proposito.
-- No hay forma de reconstruirlas: clima_lecturas ya podo esos dias (ventana
-- rodante de ~24 h) y clima_resumen_diario nunca guardo este dato antes de
-- hoy. Es precisamente la razon por la que esta migracion no puede
-- re-evaluar los 4 dias historicos del hallazgo (ver el encabezado).
-- -----------------------------------------------------------------------------
ALTER TABLE public.clima_resumen_diario
  ADD COLUMN ultima_lectura_en timestamptz;

COMMENT ON COLUMN public.clima_resumen_diario.ultima_lectura_en IS
  'Timestamp de la lectura de 5 min mas reciente que se recibio ese dia (MAX(timestamp) de clima_lecturas, agregado por fn_clima_rollup_diario). Sirve para decidir cobertura_parcial por el hueco al FINAL del dia -- migracion 115 -- y para que la posicion de un hueco futuro no vuelva a ser irrecuperable una vez que clima_lecturas se pode a 24 h. NULL en toda fila anterior a esta migracion: no hay forma de reconstruirlo retroactivamente.';

COMMENT ON COLUMN public.clima_resumen_diario.lluvia_confianza IS
  'ok = contador verificado fresco y el dia se capturo completo, incluido el final. contador_congelado = el contador de Ecowitt no se reinicio (lluvia_total_mm queda NULL, nunca un duplicado -- migracion 068). sin_time_piezo = Ecowitt no envio la senal de frescura del contador; se confia en el valor crudo. cobertura_parcial = el dia se capturo incompleto -- por MENOS de 240 de las 288 lecturas esperadas (migracion 103) O porque la ultima lectura del dia (ultima_lectura_en) quedo a mas de 30 minutos de la medianoche local, es decir la captura se corto cerca del final y el contador acumulado nunca vio el resto del dia (migracion 115). En los dos casos lluvia_total_mm queda NULL: un dia truncado da una cota inferior, nunca un total.';


-- -----------------------------------------------------------------------------
-- 2. El rollup nocturno pasa a mirar tambien CUANDO se corto la captura.
--
-- Cuerpo de la 103 verbatim salvo por: (a) MAX(timestamp) agregado como
-- ultima_lectura_en, (b) la rama nueva del CASE, (c) ultima_lectura_en
-- agregada al INSERT/ON CONFLICT. Se conserva `SET search_path = public,
-- pg_temp` -- lo pineo la 082 y un CREATE OR REPLACE sin el lo perderia
-- (mismo aviso que dejo la 103 en su paso 2).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_clima_rollup_diario(p_fecha date DEFAULT (now() AT TIME ZONE 'America/Bogota')::date - 1)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Migracion 115. 6 lecturas de 5 min de margen antes de la medianoche
  -- local. Ver el encabezado del archivo: no es un numero ajustado contra un
  -- pull en vivo (esta sesion no tuvo acceso de lectura a produccion) sino
  -- derivado de la cadencia de muestreo conocida con un colchon de 6x sobre
  -- el jitter del cron. Cambiar el margen es cambiar esta constante, no la
  -- logica de abajo.
  v_margen_fin_dia CONSTANT interval := interval '30 minutes';
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
      -- the chronologically last reading of the day (migration 068).
      (ARRAY_AGG(lluvia_diaria_actualizada_en ORDER BY timestamp DESC))[1] AS ultima_actualizacion_lluvia,
      -- Migracion 115: hora de la lectura de 5 min mas reciente del dia,
      -- para decidir si la captura llego hasta cerca de la medianoche.
      MAX(timestamp) AS ultima_lectura_en
    FROM clima_lecturas
    WHERE DATE(timestamp AT TIME ZONE 'America/Bogota') = p_fecha
    GROUP BY 1, 2
  ),
  evaluado AS (
    SELECT
      a.*,
      CASE
        -- Migracion 103. Cobertura del dia: cuanto se capturo en total. Va
        -- PRIMERO, antes de cualquier pregunta sobre el contador de lluvia
        -- (ver la 103, DESVIACION DELIBERADA #1).
        WHEN a.lecturas_count < 240 THEN 'cobertura_parcial'
        -- Migracion 115. Cobertura del dia: HASTA CUANDO se capturo. Misma
        -- categoria que la rama anterior -- ambas son preguntas de cobertura,
        -- ambas van antes de las de frescura del contador. Un dia puede tener
        -- >= 240 lecturas y aun asi haberse cortado horas antes de la
        -- medianoche (la estacion deja de reportar y no vuelve); esa cola sin
        -- capturar es exactamente lo que el conteo total no distingue de un
        -- dia sano con jitter disperso.
        WHEN (a.fecha + interval '1 day') - (a.ultima_lectura_en AT TIME ZONE 'America/Bogota') > v_margen_fin_dia
          THEN 'cobertura_parcial'
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
    lecturas_count,
    ultima_lectura_en
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
    viento_kmh_avg  = EXCLUDED.viento_kmh_avg,
    rafaga_kmh_max  = EXCLUDED.rafaga_kmh_max,
    viento_dir_predominante = EXCLUDED.viento_dir_predominante,
    radiacion_wm2_avg = EXCLUDED.radiacion_wm2_avg,
    radiacion_wm2_max = EXCLUDED.radiacion_wm2_max,
    uv_index_max    = EXCLUDED.uv_index_max,
    lecturas_count  = EXCLUDED.lecturas_count,
    ultima_lectura_en = EXCLUDED.ultima_lectura_en;

  -- Prune old 5-min readings (keep rolling 24h window) -- same as before.
  DELETE FROM clima_lecturas
  WHERE timestamp < now() - interval '24 hours';
END;
$$;

COMMENT ON FUNCTION public.fn_clima_rollup_diario IS
  'Rollup nocturno de clima_lecturas -> clima_resumen_diario. Detecta contador de lluvia congelado (migracion 068), dia con menos del 83% de las lecturas esperadas (migracion 103) y dia cuya ultima lectura quedo a mas de 30 min de la medianoche local (migracion 115, hueco al FINAL del dia). p_fecha por defecto: ayer (Bogota).';


-- -----------------------------------------------------------------------------
-- 3. Sin backfill. Ver el encabezado: la posicion del hueco de un dia ya
--    sellado es irrecuperable porque clima_lecturas ya lo podo, y
--    clima_resumen_diario nunca guardo la hora de la ultima lectura antes de
--    esta migracion. Los 4 dias del hallazgo (2026-08-21, 07-09, 06-23,
--    08-06) se quedan exactamente como estan -- incluidos los 28,19 mm del
--    2026-07-09, que no se descartan.
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- 4. Post-condiciones.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_col_tipo      text;
  v_col_nullable  text;
  v_no_nulas      integer;
  v_total_post    integer;
  v_total_pre     text;
  v_fn_oid        regprocedure;
  v_fn_def        text;
  v_fn_cfg        text;
  v_check_def     text;
BEGIN
  -- 4.1 La columna quedo con el tipo correcto, nullable, sin DEFAULT.
  SELECT data_type, is_nullable INTO v_col_tipo, v_col_nullable
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'clima_resumen_diario'
     AND column_name = 'ultima_lectura_en';
  IF v_col_tipo IS NULL THEN
    RAISE EXCEPTION 'Migracion 115: ultima_lectura_en no quedo creada. ABORTA.';
  END IF;
  IF v_col_tipo <> 'timestamp with time zone' OR v_col_nullable <> 'YES' THEN
    RAISE EXCEPTION 'Migracion 115: ultima_lectura_en quedo con tipo=% nullable=%, se esperaba timestamp with time zone / YES. ABORTA.', v_col_tipo, v_col_nullable;
  END IF;

  -- 4.2 Esta migracion no debio poblar ni una fila -- solo el cron de esta
  --     noche en adelante escribe esta columna.
  SELECT count(*) INTO v_no_nulas
    FROM public.clima_resumen_diario WHERE ultima_lectura_en IS NOT NULL;
  IF v_no_nulas <> 0 THEN
    RAISE EXCEPTION 'Migracion 115: % filas quedaron con ultima_lectura_en poblada. Esta migracion es aditiva -- no debe escribir dato en filas existentes. ABORTA.', v_no_nulas;
  END IF;

  -- 4.3 Ni una fila se creo ni se borro.
  SELECT count(*) INTO v_total_post FROM public.clima_resumen_diario;
  v_total_pre := current_setting('m115.total_pre', true);
  IF v_total_pre IS NULL OR v_total_pre = '' THEN
    RAISE EXCEPTION 'Migracion 115: no se encontro el conteo de partida. Esta migracion DEBE correrse como una sola transaccion -- pre y post condiciones tienen que compartirla.';
  END IF;
  IF v_total_post <> v_total_pre::integer THEN
    RAISE EXCEPTION 'Migracion 115: clima_resumen_diario paso de % a % filas. Esta migracion no inserta ni borra filas -- solo agrega una columna y reemplaza una funcion.', v_total_pre, v_total_post;
  END IF;

  -- 4.4 El CHECK de lluvia_confianza sigue intacto (esta migracion no lo
  --     toca -- cobertura_parcial ya existia desde la 103).
  SELECT pg_get_constraintdef(oid) INTO v_check_def
    FROM pg_constraint
   WHERE conrelid = 'public.clima_resumen_diario'::regclass
     AND conname  = 'clima_resumen_diario_lluvia_confianza_check';
  IF v_check_def IS NULL OR v_check_def NOT LIKE '%cobertura_parcial%' THEN
    RAISE EXCEPTION 'Migracion 115: el CHECK de lluvia_confianza quedo roto o sin cobertura_parcial. ABORTA.';
  END IF;

  -- 4.5 La funcion quedo reemplazada con la rama nueva Y conservo el
  --     search_path pineado por la 082 (un CREATE OR REPLACE sin SET
  --     search_path lo habria perdido -- mismo chequeo que dejo la 103).
  v_fn_oid := 'public.fn_clima_rollup_diario(date)'::regprocedure;
  SELECT pg_get_functiondef(v_fn_oid) INTO v_fn_def;
  IF v_fn_def NOT LIKE '%ultima_lectura_en%' OR v_fn_def NOT LIKE '%v_margen_fin_dia%' THEN
    RAISE EXCEPTION 'Migracion 115: fn_clima_rollup_diario no quedo con la logica de fin de dia (falta ultima_lectura_en o v_margen_fin_dia en su definicion). ABORTA.';
  END IF;

  SELECT array_to_string(p.proconfig, ',') INTO v_fn_cfg
    FROM pg_proc p WHERE p.oid = v_fn_oid;
  IF v_fn_cfg IS NULL OR v_fn_cfg !~ 'search_path=public,\s*pg_temp' THEN
    RAISE EXCEPTION 'Migracion 115: fn_clima_rollup_diario perdio el search_path pineado (encontrado: %). ABORTA.', v_fn_cfg;
  END IF;

  RAISE NOTICE 'Migracion 115: post-condiciones OK -- ultima_lectura_en creada (timestamptz, nullable, 0 filas pobladas), % filas en total (sin cambio), CHECK intacto, funcion reemplazada con la rama de fin de dia y search_path pineado.', v_total_post;
END $$;


-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- No hace falta tabla de respaldo: esta migracion no modifica ninguna fila
-- existente, solo agrega una columna (nullable) y reemplaza una funcion. Para
-- deshacerla, en este orden:
--
--   -- (a) restaurar la funcion de la 103 tal cual (correr el paso 2 de
--   --     103_clima_cobertura_parcial.sql), lo que quita la rama de fin de
--   --     dia y deja de poblar ultima_lectura_en hacia adelante. El
--   --     search_path pineado por la 082 se conserva porque el cuerpo de la
--   --     103 ya lo trae.
--
--   -- (b) quitar la columna nueva. Solo despues de (a) -- si se corre antes,
--   --     la funcion nueva (que todavia referencia ultima_lectura_en en el
--   --     INSERT) fallaria en la proxima corrida del cron:
--   ALTER TABLE public.clima_resumen_diario DROP COLUMN ultima_lectura_en;
--
-- No hay filas que restaurar: ninguna se toco.
-- =============================================================================
