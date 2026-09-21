-- =============================================================================
-- 159_clima_cobertura_por_hueco_temporal.sql
--
-- ESCO-116 + ESCO-121. Una sola causa raiz, dos hallazgos.
--
-- `fn_clima_rollup_diario` decide si un dia es confiable CONTANDO lecturas
-- (`COUNT(*) < 240` de 288 esperadas, migracion 103; la 115 agrego ademas un
-- chequeo de cierre de dia; la 158 lo extendio a horas_sol_duracion). Ese
-- criterio no distingue un dia COMPLETO muestreado cada 30 minutos de un dia
-- TRUNCADO. Ecowitt sirve resolucion de 5 minutos ~90 dias hacia atras; mas
-- alla devuelve 30 minutos, o sea 48 lecturas por dia completo -- muy por
-- debajo de 240. La 122 ya documento esa consecuencia y la dejo abierta.
--
-- ESCO-116: en los dias realmente truncados, `radiacion_wm2_avg`,
-- `radiacion_wm2_max`, `uv_index_max`, `temp_c_min` y `temp_c_max` se
-- promedian sobre el pedazo capturado y se sellan como si fueran el dia
-- entero. Medido contra produccion 2026-09-21:
--   * 2026-09-17: 189 lecturas, sin captura entre 00:00 y 08:25 (las horas
--     frias y sin sol). radiacion_wm2_avg = 417,07 W/m2 contra ~156 de un
--     dia completo -- 2,66x, por encima de la banda alta del Hass. temp_c_min
--     = 15,94 sin haber medido la madrugada.
--   * 2026-09-16: 11 lecturas nocturnas. radiacion_wm2_avg = 0,00 y
--     uv_index_max = 0 en un dia que tuvo sol.
--   * 2026-08-27: 288 lecturas -- CUENTA COMPLETA -- pero la ultima es de
--     las 15:50 hora local: 8 h 10 min sin medir al cierre. El criterio de
--     conteo NO lo ve. Es la prueba de que contar filas no sirve.
--
-- ESCO-121: 148 de los dias completos no tienen `horas_sol_duracion` porque
-- la 151 la estreno recien. El arreglo obvio -- un `/clima/backfill` de la
-- historia -- convierte esos dias en filas de 48 lecturas, que el umbral de
-- conteo lee como truncadas: destruiria 43 dias de lluvia medida para ganar
-- cero horas de sol. Por eso 116 y 121 se cierran con el mismo cambio.
--
-- QUE CAMBIA
--
-- 1) La prueba de cobertura pasa de CONTAR LECTURAS a MEDIR EL HUECO
--    TEMPORAL MAXIMO del dia: el mayor tramo sin ninguna medicion, contando
--    tambien el arranque (medianoche local -> primera lectura) y el cierre
--    (ultima lectura -> medianoche siguiente). Extiende el chequeo de cierre
--    de la 115 en vez de duplicarlo: ese chequeo pasa a ser uno de los tres
--    tramos de la misma cuenta, no una regla aparte.
--
--    UMBRAL: 45 minutos. Tiene que ser >= 30 para admitir la cadencia gruesa
--    de la History API (48 lecturas cada 30 min, ultima a las 23:30, o sea
--    un hueco de cierre de exactamente 30 min), y tiene que ser lo mas bajo
--    posible por encima de eso. 45 min acepta esa cadencia con holgura para
--    jitter y RECHAZA una lectura gruesa perdida (60 min): una sola muestra
--    de 30 min perdida al mediodia es 1/48 del dia justo en el pico. En la
--    cadencia fina de 5 min tolera hasta ocho muestras seguidas perdidas.
--    60 min se descarto porque admite la muestra gruesa perdida; 30 min se
--    descarto porque deja la cadencia gruesa en el borde exacto.
--
--    Con este umbral NINGUN dia ya sellado cambia de clase respecto al
--    chequeo de cierre de la 115 (los 19 dias gruesos cierran a las 23:30 =
--    30 min, pasaban y siguen pasando; los truncados tienen huecos de
--    3,7 h a 23 h). El unico efecto del 30 -> 45 en el cierre es aceptar un
--    dia que termine entre 23:15 y 23:30, y hoy no existe ninguno.
--
-- 2) `horas_sol_duracion` deja de multiplicar por la constante 5 minutos y
--    usa el intervalo REAL del dia, deducido de la mediana de los huecos
--    entre lecturas consecutivas y ENCAJADO a la cadencia nominal conocida
--    (5 o 30 minutos; cualquier otra cosa -> NULL, cadencia desconocida).
--    Sin esto, habilitar el sol en un dia grueso reportaria 1/6 de la
--    duracion real. El encaje es deliberado: usar la mediana cruda haria
--    que un jitter de un segundo moviera el resultado de dias finos que hoy
--    ya estan bien. Los 7 dias que hoy tienen valor (271-288 lecturas)
--    quedan byte por byte iguales.
--
-- 3) Las cinco columnas sesgadas por captura parcial pasan a NULL en un dia
--    truncado: `radiacion_wm2_avg`, `radiacion_wm2_max`, `uv_index_max`,
--    `temp_c_min`, `temp_c_max`.
--
--    DECISION SOBRE `uv_index_max` (y `radiacion_wm2_max`, misma fisica).
--    Son MAXIMOS, asi que un dia truncado los sesga solo hacia abajo y solo
--    si se perdio la ventana del mediodia -- menos sesgo que un promedio.
--    Aun asi van a NULL. Un maximo sobre un dia truncado es una COTA
--    INFERIOR, no una medicion, y estas columnas no tienen forma de decirlo:
--    la lluvia si la tiene (`lluvia_confianza` + `esCotaInferior()`, 103/122),
--    estas no. Sin esa marca, una cota inferior se lee como el pico del dia
--    y nadie la vuelve a revisar. 2026-09-16 es la demostracion:
--    `uv_index_max = 0` en un dia con sol. Y la funcion no puede saber desde
--    la fila si el mediodia solar quedo dentro del tramo capturado, asi que
--    "conservarlo cuando se capturo el mediodia" no es una regla expresable
--    sin una columna nueva. Se elige "sin dato" antes que una cota silenciosa
--    -- la misma decision que el proyecto ya tomo para `lluvia_total_mm` bajo
--    `contador_congelado` (103/122) y para `horas_sol_duracion` (158). NULL
--    lo recupera un backfill; una cifra verosimil no.
--
-- 4) Columna nueva `clima_resumen_diario.cobertura_hueco_max_min` (numeric,
--    NULL = no medido). Guarda el hueco maximo en minutos que decidio la
--    clase del dia. Es la leccion literal de la 122 (`lluvia_mm_evento`):
--    sin ella, la respuesta a "por que este dia quedo truncado" solo existe
--    mientras las lecturas de 5 min sigan vivas, o sea 24 horas. Aditiva;
--    ningun consumidor la lee todavia.
--
-- LO QUE NO CAMBIA, A PROPOSITO
--   * NINGUNA columna de lluvia. `lluvia_total_mm`, `lluvia_confianza` y
--     `lluvia_mm_evento` de las filas ya escritas quedan intactas. La regla
--     nueva SI reclasifica la lluvia de dias futuros o rebackfilleados (un
--     dia grueso deja de ser `cobertura_parcial`), pero el UPDATE historico
--     no toca lluvia: evaluar `coincide` o `frescura_vencida` exige las
--     lecturas de 5 min, que ya no existen. Los 19 dias gruesos conservan su
--     lluvia medida -- 11 de ellos con valor positivo -- y el frontend los
--     sigue pintando porque `esCotaInferior()` muestra `cobertura_parcial`
--     con valor.
--   * `temp_c_avg`, `humedad_pct_*`, `viento_*` y `rafaga_kmh_max` tienen el
--     MISMO defecto de sesgo por captura parcial. FUERA DE ALCANCE aqui, por
--     el mismo criterio con que la 158 dejo fuera la radiacion: se acota a
--     las cinco columnas del hallazgo. Queda anotado, no resuelto.
--   * No se llama al RPC sobre fechas historicas. `fn_clima_rollup_diario`
--     termina con un DELETE global de lecturas > 24 h (leccion de la 122), y
--     ademas las lecturas de esos dias ya no existen.
--   * No se inventa ninguna lectura ni ningun valor. Solo se retira lo que
--     se sello sobre un dia incompleto.
--
-- LIMITE DEL ARREGLO HISTORICO, DECLARADO
--   El UPDATE no puede medir huecos: las lecturas de esos dias se podaron.
--   Usa el mejor sustituto que queda en `clima_resumen_diario` -- la FORMA
--   de un dia completo en cada una de las dos cadencias conocidas:
--     fina   : lecturas_count >= 240  Y  no cierra temprano
--     gruesa : lecturas_count = 48    Y  cierra a las 23:30 locales
--   Cualquier otra forma es truncada. Consecuencias que se aceptan:
--     (a) 98 filas anteriores a la 115 no tienen `ultima_lectura_en` (son de
--         2026-03-19 a 2026-08-23, todas con 249-288 lecturas). Sin senal de
--         cierre se les da el beneficio de la duda y se conservan. Un dia
--         truncado al cierre escondido ahi es indetectable hoy.
--     (b) Un dia fino con 240-287 lecturas y un hueco interno grande pero
--         cierre normal se conserva; uno con menos de 240 se descarta. Esa
--         linea es el umbral de la 103, usado aqui solo como sustituto
--         historico. La regla de hueco, la de verdad, rige de aqui en
--         adelante y corrige ambos casos en cuanto el dia se rebackfillee.
--   `station_id = 'wunderground-historico'` (1.757 filas, 2020-07-01 a
--   2025-11-04) se EXCLUYE explicitamente: tiene `lecturas_count = 1` por
--   construccion y temperaturas validas en las 1.757 filas. Sin ese filtro
--   el UPDATE las clasificaria truncadas y borraria cinco anios de historia.
--   Es exactamente la trampa que documenta la 103.
--
-- FILAS AFECTADAS POR EL UPDATE: 11 (medido en vivo 2026-09-21).
--   2026-03-18 (19 lecturas), 2026-03-27 (32, cierra 15:30),
--   2026-03-30 (25), 2026-04-17 (39), 2026-08-19 (105, cierra 19:05),
--   2026-08-20 (32, cierra 20:15), 2026-08-27 (288, cierra 15:50),
--   2026-09-08 (221), 2026-09-09 (225), 2026-09-16 (11),
--   2026-09-17 (189).
-- NO TOCADAS: las otras 173 filas Ecowitt -- 19 gruesas completas
--   (2026-03-21 a 2026-05-25) y 154 finas completas -- mas las 1.757 de
--   wunderground-historico.
--
-- Precondicion: md5(prosrc) del cuerpo VIVO de la 158,
-- `60b95011b820082e879339bead553b76` (verificado 2026-09-21). Patron de la
-- 143: si produccion divergio, abortar en vez de pisar.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. Guardas previas. Linea base RELATIVA, sin literales absolutos de filas:
--    el rollup nocturno agrega una fila por dia y un literal aborta una
--    migracion sana (el error de la 103 y de la 120).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_src        text;
  v_fn         integer;
  v_col        integer;
  v_truncados  integer;
  v_completos  integer;
  v_total      integer;
  v_wu         integer;
BEGIN
  SELECT count(*) INTO v_fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_clima_rollup_diario';
  IF v_fn <> 1 THEN
    RAISE EXCEPTION 'Migracion 159 ABORTADA (pre): se esperaba 1 fn_clima_rollup_diario y hay %.', v_fn;
  END IF;

  SELECT p.prosrc INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_clima_rollup_diario';

  IF v_src ILIKE '%v_hueco_max_cobertura%' THEN
    RAISE EXCEPTION 'Migracion 159 ABORTADA (pre): fn_clima_rollup_diario YA usa la regla de hueco temporal -- lo mas probable es que esta migracion ya se aplico. Revisar a mano antes de reintentar.';
  END IF;

  -- Nunca sobrescribir en silencio un cambio hecho fuera del repo (143).
  IF md5(v_src) <> '60b95011b820082e879339bead553b76' THEN
    RAISE EXCEPTION 'Migracion 159 ABORTADA (pre): fn_clima_rollup_diario difiere del cuerpo vivo revisado de la 158 (md5 actual %). No sobrescribir un cambio vivo sin incorporarlo primero.', md5(v_src);
  END IF;

  SELECT count(*) INTO v_col FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'clima_resumen_diario'
     AND column_name IN ('horas_sol_duracion', 'ultima_lectura_en', 'lluvia_mm_evento');
  IF v_col <> 3 THEN
    RAISE EXCEPTION 'Migracion 159 ABORTADA (pre): faltan columnas de 115/122/151 en clima_resumen_diario (encontradas %).', v_col;
  END IF;

  -- Linea base relativa, capturada AHORA contra el catalogo vivo.
  WITH c AS (
    SELECT *, (ultima_lectura_en AT TIME ZONE 'America/Bogota')::time AS fin
      FROM public.clima_resumen_diario
     WHERE station_id <> 'wunderground-historico'
  ), k AS (
    SELECT *,
           (lecturas_count >= 240 AND (fin IS NULL OR fin >= TIME '23:15'))
        OR (lecturas_count = 48 AND fin >= TIME '23:25' AND fin < TIME '23:35') AS completo
      FROM c
  )
  SELECT count(*) FILTER (WHERE NOT completo),
         count(*) FILTER (WHERE completo)
    INTO v_truncados, v_completos
    FROM k;

  SELECT count(*) INTO v_total FROM public.clima_resumen_diario;
  SELECT count(*) INTO v_wu    FROM public.clima_resumen_diario
   WHERE station_id = 'wunderground-historico' AND temp_c_min IS NOT NULL;

  IF v_truncados = 0 THEN
    RAISE EXCEPTION 'Migracion 159 ABORTADA (pre): 0 dias truncados detectados -- la regla no encontro nada que reparar, revisar antes de seguir.';
  END IF;
  IF v_completos = 0 THEN
    RAISE EXCEPTION 'Migracion 159 ABORTADA (pre): 0 dias completos detectados -- la regla clasificaria TODO como truncado. Abortar.';
  END IF;
  IF v_wu = 0 THEN
    RAISE EXCEPTION 'Migracion 159 ABORTADA (pre): no hay temperaturas en wunderground-historico -- el conteo de proteccion no sirve.';
  END IF;

  PERFORM set_config('m159.truncados_pre', v_truncados::text, true);
  PERFORM set_config('m159.completos_pre', v_completos::text, true);
  PERFORM set_config('m159.total_pre',     v_total::text,     true);
  PERFORM set_config('m159.wu_pre',        v_wu::text,        true);

  RAISE NOTICE 'Migracion 159: pre OK -- md5 de la 158, % dia(s) truncado(s), % completo(s), % fila(s) en total, % de wunderground con temperatura.',
    v_truncados, v_completos, v_total, v_wu;
END $$;


-- -----------------------------------------------------------------------------
-- 1. Columna de auditoria del hueco. Aditiva, NULL en toda la historia.
-- -----------------------------------------------------------------------------
ALTER TABLE public.clima_resumen_diario
  ADD COLUMN IF NOT EXISTS cobertura_hueco_max_min numeric;

COMMENT ON COLUMN public.clima_resumen_diario.cobertura_hueco_max_min IS
  'Mayor tramo del dia sin ninguna lectura, en minutos, contando arranque (medianoche local -> primera lectura) y cierre (ultima lectura -> medianoche siguiente). Decide si el dia es completo (<= 45 min) o truncado. NULL = no medido (filas anteriores a la migracion 159). Migracion 159.';


-- -----------------------------------------------------------------------------
-- 2. Respaldo forense. SIEMPRE en `respaldos`, NUNCA en `public`: una tabla
--    public.backup_* hereda el GRANT ALL a `anon` de Supabase (leccion 081).
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS respaldos.backup_159_clima_cobertura;

CREATE TABLE respaldos.backup_159_clima_cobertura AS
WITH c AS (
  SELECT *, (ultima_lectura_en AT TIME ZONE 'America/Bogota')::time AS fin
    FROM public.clima_resumen_diario
   WHERE station_id <> 'wunderground-historico'
), k AS (
  SELECT *,
         (lecturas_count >= 240 AND (fin IS NULL OR fin >= TIME '23:15'))
      OR (lecturas_count = 48 AND fin >= TIME '23:25' AND fin < TIME '23:35') AS completo
    FROM c
)
SELECT fecha, station_id, lecturas_count, ultima_lectura_en,
       temp_c_min, temp_c_max,
       radiacion_wm2_avg, radiacion_wm2_max, uv_index_max,
       horas_sol_duracion,
       lluvia_total_mm, lluvia_confianza, lluvia_mm_evento,
       now() AS respaldado_en
  FROM k
 WHERE NOT completo;

ALTER TABLE respaldos.backup_159_clima_cobertura ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON respaldos.backup_159_clima_cobertura FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE respaldos.backup_159_clima_cobertura IS
  'Migracion 159: filas de clima_resumen_diario clasificadas TRUNCADAS por hueco temporal, tal como estaban antes de anular radiacion/UV/temp min-max. Unico registro de los valores retirados.';


-- -----------------------------------------------------------------------------
-- 3. El rollup de la 158, con la cobertura medida por hueco temporal.
--    CREATE OR REPLACE. NUNCA se editan los ficheros 151 ni 158.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_clima_rollup_diario(p_fecha date DEFAULT (now() AT TIME ZONE 'America/Bogota')::date - 1)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tolerancia_mm  CONSTANT numeric  := 0.5;
  v_tolerancia_pct CONSTANT numeric  := 0.10;
  -- Cobertura por HUECO TEMPORAL (159), en minutos. Reemplaza el conteo de
  -- lecturas (103) y absorbe el chequeo de cierre de dia (115): arranque,
  -- cierre y huecos internos son el mismo tramo sin medicion.
  -- 45 min: >= 30 para admitir la cadencia gruesa de 30 min de la History
  -- API (dia completo, ultima lectura 23:30 -> hueco de cierre 30 min) y
  -- < 60 para rechazar una muestra gruesa perdida.
  v_hueco_max_cobertura CONSTANT numeric := 45;
  -- WMO-style sunshine duration (global radiation). Keep in sync with
  -- src/utils/calculosRadiacion.ts UMBRAL_TIEMPO_SOL_WM2.
  v_umbral_sol_wm2 CONSTANT numeric  := 120;
BEGIN
  WITH base AS (
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
        - LAG(lluvia_evento_mm) OVER (PARTITION BY station_id ORDER BY timestamp) AS d_evento,
      -- Hueco hasta la lectura anterior DEL MISMO DIA local. La primera
      -- lectura del dia da NULL y la cubre el hueco de arranque.
      EXTRACT(EPOCH FROM (
        timestamp - LAG(timestamp) OVER (
          PARTITION BY station_id, (timestamp AT TIME ZONE 'America/Bogota')::date
          ORDER BY timestamp)
      )) / 60.0 AS d_min
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
      COUNT(radiacion_wm2) AS n_radiacion,
      COUNT(*) FILTER (WHERE radiacion_wm2 >= v_umbral_sol_wm2) AS n_sol,
      MAX(uv_index) AS uv_index_max,
      COUNT(*) AS lecturas_count,
      (ARRAY_AGG(lluvia_diaria_actualizada_en ORDER BY timestamp DESC))[1] AS ultima_actualizacion_lluvia,
      MIN(timestamp) AS primera_lectura_en,
      MAX(timestamp) AS ultima_lectura_en,
      -- Mayor hueco INTERNO del dia, en minutos.
      MAX(d_min) AS hueco_interno_min,
      -- Cadencia representativa del dia: mediana de los huecos internos.
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY d_min::double precision) AS mediana_min
    FROM base
    WHERE fecha = p_fecha
    GROUP BY fecha, station_id
  ),
  cobertura AS (
    SELECT
      a.*,
      -- Hueco de arranque: medianoche local -> primera lectura.
      EXTRACT(EPOCH FROM (
        (a.primera_lectura_en AT TIME ZONE 'America/Bogota') - a.fecha::timestamp
      )) / 60.0 AS hueco_inicio_min,
      -- Hueco de cierre: ultima lectura -> medianoche siguiente. Es el
      -- chequeo de la 115, ahora como un tramo mas de la misma cuenta.
      EXTRACT(EPOCH FROM (
        (a.fecha::timestamp + interval '1 day') - (a.ultima_lectura_en AT TIME ZONE 'America/Bogota')
      )) / 60.0 AS hueco_fin_min
    FROM agregado a
  ),
  senales AS (
    SELECT
      c.*,
      GREATEST(
        c.hueco_inicio_min,
        c.hueco_fin_min,
        COALESCE(c.hueco_interno_min, 1440)
      ) AS hueco_max_min,
      (c.n_evento > 0) AS hay_senal,
      (c.ultima_actualizacion_lluvia IS NOT NULL
       AND (c.ultima_actualizacion_lluvia AT TIME ZONE 'America/Bogota')::date < c.fecha
      ) AS frescura_vencida,
      (c.lluvia_contador IS NOT NULL
       AND ABS(c.lluvia_contador - c.lluvia_evento)
           <= GREATEST(v_tolerancia_mm, c.lluvia_contador * v_tolerancia_pct)
      ) AS coincide,
      -- Cadencia nominal encajada. Cualquier otra -> NULL: cadencia
      -- desconocida no se traduce a horas de sol.
      CASE
        WHEN c.mediana_min IS NULL           THEN NULL
        WHEN c.mediana_min < 15              THEN 5
        WHEN c.mediana_min <= 45             THEN 30
        ELSE NULL
      END::numeric AS intervalo_min
    FROM cobertura c
  ),
  evaluado AS (
    SELECT
      s.*,
      (s.hueco_max_min > v_hueco_max_cobertura) AS cobertura_corta,
      CASE
        WHEN NOT s.hay_senal THEN
          CASE
            WHEN s.hueco_max_min > v_hueco_max_cobertura   THEN 'cobertura_parcial'
            WHEN s.ultima_actualizacion_lluvia IS NULL     THEN 'sin_time_piezo'
            WHEN s.frescura_vencida                        THEN 'contador_congelado'
            ELSE 'ok'
          END
        WHEN s.hueco_max_min > v_hueco_max_cobertura       THEN 'cobertura_parcial'
        WHEN s.coincide                                    THEN 'ok'
        ELSE 'reconstruido'
      END AS lluvia_confianza,
      CASE
        WHEN NOT s.hay_senal THEN
          CASE
            WHEN s.hueco_max_min > v_hueco_max_cobertura
              OR s.frescura_vencida                        THEN NULL
            ELSE s.lluvia_contador
          END
        WHEN s.hueco_max_min > v_hueco_max_cobertura       THEN s.lluvia_evento
        WHEN s.coincide                                    THEN s.lluvia_contador
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
    horas_sol_duracion,
    uv_index_max,
    lecturas_count,
    ultima_lectura_en,
    cobertura_hueco_max_min
  )
  SELECT
    fecha, station_id,
    -- Sesgadas por captura parcial: NULL en dia truncado, nunca una cifra
    -- calculada sobre el pedazo capturado (159).
    CASE WHEN cobertura_corta THEN NULL ELSE temp_c_min END,
    CASE WHEN cobertura_corta THEN NULL ELSE temp_c_max END,
    temp_c_avg,
    humedad_pct_min, humedad_pct_max, humedad_pct_avg,
    lluvia_total_mm_final,
    lluvia_confianza,
    CASE WHEN hay_senal THEN lluvia_evento ELSE NULL END,
    viento_kmh_avg, rafaga_kmh_max,
    viento_dir_predominante,
    CASE WHEN cobertura_corta THEN NULL ELSE radiacion_wm2_avg END,
    CASE WHEN cobertura_corta THEN NULL ELSE radiacion_wm2_max END,
    CASE
      WHEN cobertura_corta          THEN NULL
      WHEN n_radiacion = 0          THEN NULL
      WHEN intervalo_min IS NULL    THEN NULL
      ELSE ROUND(n_sol::numeric * intervalo_min / 60.0, 2)
    END,
    CASE WHEN cobertura_corta THEN NULL ELSE uv_index_max END,
    lecturas_count,
    ultima_lectura_en,
    ROUND(hueco_max_min, 2)
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
    horas_sol_duracion = EXCLUDED.horas_sol_duracion,
    uv_index_max    = EXCLUDED.uv_index_max,
    lecturas_count  = EXCLUDED.lecturas_count,
    ultima_lectura_en = EXCLUDED.ultima_lectura_en,
    cobertura_hueco_max_min = EXCLUDED.cobertura_hueco_max_min;

  DELETE FROM clima_lecturas
  WHERE timestamp < now() - interval '24 hours';
END;
$$;

COMMENT ON FUNCTION public.fn_clima_rollup_diario IS
  'Rollup nocturno de clima_lecturas -> clima_resumen_diario. Cobertura por HUECO TEMPORAL maximo (159): arranque, cierre (115) y huecos internos; > 45 min = dia truncado, sin importar el numero de lecturas -- asi un dia completo muestreado cada 30 min (History API) no se confunde con un dia cortado. En dia truncado van a NULL radiacion_wm2_avg/max, uv_index_max, temp_c_min/max y horas_sol_duracion: nunca una cifra calculada sobre el pedazo capturado. horas_sol_duracion usa el intervalo real del dia (5 o 30 min, encajado desde la mediana de huecos). Lluvia: contador vs reconstruccion por evento (122). p_fecha por defecto: ayer (Bogota). NO llamar en paralelo sobre fechas historicas: la poda de 24 h es global.';


-- -----------------------------------------------------------------------------
-- 4. Reparacion historica. UN SOLO UPDATE, acotado a la estacion Ecowitt y a
--    las formas que NO son un dia completo en ninguna de las dos cadencias.
--    No toca ninguna columna de lluvia. No toca wunderground-historico.
-- -----------------------------------------------------------------------------
WITH c AS (
  SELECT fecha, station_id, lecturas_count,
         (ultima_lectura_en AT TIME ZONE 'America/Bogota')::time AS fin
    FROM public.clima_resumen_diario
   WHERE station_id <> 'wunderground-historico'
), truncados AS (
  SELECT fecha, station_id
    FROM c
   WHERE NOT (
          (lecturas_count >= 240 AND (fin IS NULL OR fin >= TIME '23:15'))
       OR (lecturas_count = 48 AND fin >= TIME '23:25' AND fin < TIME '23:35')
   )
)
UPDATE public.clima_resumen_diario r
   SET radiacion_wm2_avg  = NULL,
       radiacion_wm2_max  = NULL,
       uv_index_max       = NULL,
       temp_c_min         = NULL,
       temp_c_max         = NULL,
       horas_sol_duracion = NULL
  FROM truncados t
 WHERE r.fecha = t.fecha
   AND r.station_id = t.station_id;


-- -----------------------------------------------------------------------------
-- 5. Post-condiciones.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_src       text;
  v_cfg       text;
  v_secdef    boolean;
  v_quedan    integer;
  v_completos integer;
  v_total     integer;
  v_wu        integer;
  v_resp      integer;
  v_0917      numeric;
  v_0827      numeric;
  v_coarse    integer;
BEGIN
  SELECT p.prosrc, array_to_string(p.proconfig, ','), p.prosecdef
    INTO v_src, v_cfg, v_secdef
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_clima_rollup_diario';

  IF v_src NOT ILIKE '%v_hueco_max_cobertura%'
     OR v_src NOT ILIKE '%hueco_inicio_min%'
     OR v_src NOT ILIKE '%hueco_fin_min%'
     OR v_src NOT ILIKE '%hueco_interno_min%' THEN
    RAISE EXCEPTION 'Migracion 159 ABORTADA (post): la funcion no quedo con los tres tramos del hueco temporal.';
  END IF;
  IF v_src ILIKE '%v_min_lecturas%' THEN
    RAISE EXCEPTION 'Migracion 159 ABORTADA (post): la funcion sigue decidiendo cobertura por conteo de lecturas.';
  END IF;
  IF v_src NOT ILIKE '%v_umbral_sol_wm2%'
     OR v_src NOT ILIKE '%lluvia_evento_mm%'
     OR v_src NOT ILIKE '%lluvia_diaria_actualizada_en%' THEN
    RAISE EXCEPTION 'Migracion 159 ABORTADA (post): se perdio el cuerpo de 122/151 (umbral de sol o reconstruccion de lluvia).';
  END IF;
  IF v_src NOT ILIKE '%DELETE FROM clima_lecturas%' THEN
    RAISE EXCEPTION 'Migracion 159 ABORTADA (post): se perdio la poda de 24 h.';
  END IF;
  IF v_secdef IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'Migracion 159 ABORTADA (post): la funcion quedo SECURITY DEFINER -- debia seguir INVOKER.';
  END IF;
  IF v_cfg IS NULL OR v_cfg !~ 'search_path=public,\s*pg_temp' THEN
    RAISE EXCEPTION 'Migracion 159 ABORTADA (post): se perdio el search_path pineado (encontrado: %).', v_cfg;
  END IF;

  -- Ninguna fila truncada conserva una de las cinco columnas.
  WITH c AS (
    SELECT *, (ultima_lectura_en AT TIME ZONE 'America/Bogota')::time AS fin
      FROM public.clima_resumen_diario
     WHERE station_id <> 'wunderground-historico'
  ), k AS (
    SELECT *,
           (lecturas_count >= 240 AND (fin IS NULL OR fin >= TIME '23:15'))
        OR (lecturas_count = 48 AND fin >= TIME '23:25' AND fin < TIME '23:35') AS completo
      FROM c
  )
  SELECT count(*) FILTER (WHERE NOT completo AND (
             radiacion_wm2_avg IS NOT NULL OR radiacion_wm2_max IS NOT NULL
          OR uv_index_max IS NOT NULL
          OR temp_c_min IS NOT NULL OR temp_c_max IS NOT NULL
          OR horas_sol_duracion IS NOT NULL)),
         count(*) FILTER (WHERE completo),
         count(*) FILTER (WHERE completo AND lecturas_count = 48
                            AND radiacion_wm2_avg IS NOT NULL
                            AND lluvia_total_mm IS NOT NULL)
    INTO v_quedan, v_completos, v_coarse
    FROM k;

  IF v_quedan <> 0 THEN
    RAISE EXCEPTION 'Migracion 159 ABORTADA (post): quedan % fila(s) truncada(s) con radiacion/UV/temp sellada.', v_quedan;
  END IF;

  -- Los dias completos NO se tocan. Comparacion contra la linea base
  -- relativa de la pre-condicion, nunca contra un literal.
  IF v_completos <> current_setting('m159.completos_pre')::integer THEN
    RAISE EXCEPTION 'Migracion 159 ABORTADA (post): la poblacion de dias completos cambio de % a %.',
      current_setting('m159.completos_pre'), v_completos;
  END IF;
  IF v_coarse = 0 THEN
    RAISE EXCEPTION 'Migracion 159 ABORTADA (post): los dias gruesos completos perdieron radiacion o lluvia -- debian quedar intactos.';
  END IF;

  -- wunderground-historico intacto: la trampa de la 103.
  SELECT count(*) INTO v_wu FROM public.clima_resumen_diario
   WHERE station_id = 'wunderground-historico' AND temp_c_min IS NOT NULL;
  IF v_wu <> current_setting('m159.wu_pre')::integer THEN
    RAISE EXCEPTION 'Migracion 159 ABORTADA (post): wunderground-historico paso de % a % filas con temperatura -- NO debia tocarse.',
      current_setting('m159.wu_pre'), v_wu;
  END IF;

  -- Un cambio de columnas no puede borrar filas. Solo denuncia hacia abajo
  -- (patron de la 133): el rollup nocturno puede agregar una fila a mitad
  -- de la transaccion y `<>` abortaria una migracion sana.
  SELECT count(*) INTO v_total FROM public.clima_resumen_diario;
  IF v_total < current_setting('m159.total_pre')::integer THEN
    RAISE EXCEPTION 'Migracion 159 ABORTADA (post): clima_resumen_diario bajo de % a % filas.',
      current_setting('m159.total_pre'), v_total;
  END IF;

  -- Respaldo con el mismo numero de filas que se reparo.
  SELECT count(*) INTO v_resp FROM respaldos.backup_159_clima_cobertura;
  IF v_resp <> current_setting('m159.truncados_pre')::integer THEN
    RAISE EXCEPTION 'Migracion 159 ABORTADA (post): el respaldo tiene % filas y se detectaron % dias truncados.',
      v_resp, current_setting('m159.truncados_pre');
  END IF;

  -- Los dos casos que motivaron el hallazgo.
  SELECT radiacion_wm2_avg INTO v_0917 FROM public.clima_resumen_diario
   WHERE fecha = DATE '2026-09-17' AND station_id <> 'wunderground-historico' LIMIT 1;
  IF FOUND AND v_0917 IS NOT NULL THEN
    RAISE EXCEPTION 'Migracion 159 ABORTADA (post): 2026-09-17 sigue con radiacion_wm2_avg = % -- el caso de ESCO-116.', v_0917;
  END IF;
  SELECT radiacion_wm2_avg INTO v_0827 FROM public.clima_resumen_diario
   WHERE fecha = DATE '2026-08-27' AND station_id <> 'wunderground-historico' LIMIT 1;
  IF FOUND AND v_0827 IS NOT NULL THEN
    RAISE EXCEPTION 'Migracion 159 ABORTADA (post): 2026-08-27 sigue con radiacion_wm2_avg = % -- el dia de 288 lecturas que cierra a las 15:50, la prueba de que contar filas no sirve.', v_0827;
  END IF;

  RAISE NOTICE 'Migracion 159: post OK -- % dia(s) reparado(s) y respaldado(s), % completo(s) intacto(s) (% gruesos con radiacion y lluvia), wunderground-historico intacto en % filas.',
    current_setting('m159.truncados_pre'), v_completos, v_coarse, v_wu;
END $$;


-- =============================================================================
-- ROLLBACK (ejecutable)
-- =============================================================================
-- 1) Devolver los valores retirados desde el respaldo:
--
-- UPDATE public.clima_resumen_diario r
--    SET radiacion_wm2_avg  = b.radiacion_wm2_avg,
--        radiacion_wm2_max  = b.radiacion_wm2_max,
--        uv_index_max       = b.uv_index_max,
--        temp_c_min         = b.temp_c_min,
--        temp_c_max         = b.temp_c_max,
--        horas_sol_duracion = b.horas_sol_duracion
--   FROM respaldos.backup_159_clima_cobertura b
--  WHERE r.fecha = b.fecha AND r.station_id = b.station_id;
--
-- 2) Restaurar la funcion de la 158: ejecutar el paso 1 del fichero
--    158_clima_horas_sol_cobertura_parcial.sql tal cual (su CREATE OR
--    REPLACE completo). Vuelve el criterio de conteo, con su defecto.
--
-- 3) Opcional, retirar la columna de auditoria (aditiva, se puede dejar):
--
-- ALTER TABLE public.clima_resumen_diario DROP COLUMN IF EXISTS cobertura_hueco_max_min;
--
-- La tabla respaldos.backup_159_clima_cobertura se conserva: es el unico
-- registro de los valores que se retiraron.
-- =============================================================================
