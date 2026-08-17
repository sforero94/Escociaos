-- =====================================================================
-- 100: Ganado — agrupación de la historia de movimientos por grupo_id.
--
-- Plan: docs/plan_ganado_inventario_v2_implementacion.md §5.4.
-- REQUIERE la 098 aplicada (usa gan_movimientos.grupo_id). Independiente
-- de la 099 (esta migración solo toca gan_movimientos, nunca gan_potreros
-- ni gan_fincas) pero se numera después por orden y para tener una sola
-- ventana de verificación.
--
-- EL PROBLEMA: el 2026-07-02 se registraron 11 traslados como 22 filas
-- sueltas (11 traslado_salida + 11 traslado_entrada), sin ninguna columna
-- que las relacione entre sí (B-1 del brief del CPO). Emparejarlas por
-- fecha + montos sería exactamente la aproximación que la regla "nunca
-- inventar un movimiento" (R-2) prohíbe: entre 11 salidas y 11 entradas
-- del mismo día, dos traslados de la misma cantidad de cabezas son
-- indistinguibles por monto.
--
-- EL HECHO DE POSTGRES DEL QUE CUELGA TODO: gan_movimientos.created_at es
-- TIMESTAMPTZ DEFAULT NOW() (migración 044), y NOW() en Postgres es
-- transaction_timestamp() -- constante DENTRO de una transacción. Filas
-- escritas por una sola sentencia o una sola llamada a RPC comparten
-- created_at exacto, al microsegundo; filas escritas por llamadas HTTP
-- separadas (dos round-trips) tienen created_at distintos. O sea que
-- created_at es la huella de la transacción que escribió cada fila -- y
-- como cada camino de escritura del módulo tiene una forma transaccional
-- distinta, created_at dice por sí solo qué código escribió cada fila.
-- Esta migración no supone nada: lo lee.
--
-- TRES POBLACIONES, TRES REGLAS, MUTUAMENTE EXCLUYENTES:
--   P1 -- Traslados ANTERIORES a la 097 (las 11 parejas del 2026-07-02).
--        Se escribieron con dos .insert() separados (código de
--        useGanadoInventario.ts pre-#124: git show
--        e4fa6d4:src/components/ganado/hooks/useGanadoInventario.ts,
--        líneas 167-175) -- dos transacciones, dos created_at DISTINTOS,
--        salida antes que entrada. Regla: SECUENCIA. Ordenadas por
--        created_at, las filas 2k-1 y 2k forman par si y solo si la
--        primera es traslado_salida, la segunda traslado_entrada, los
--        deltas son espejo exacto, ambas tienen su potrero, y son
--        potreros distintos. Si dos filas comparten created_at exacto
--        (instantes < filas), la secuencia NO está determinada y esta
--        migración NO agrupa nada de P1 -- mismo criterio con el que la
--        075 decidió no tocar 72 grupos de monitoreo con created_at
--        idéntico.
--   P2 -- Traslados escritos por fn_ganado_registrar_traslado_multi()
--        ENTRE la 097 y la 098 (antes de que esa función estampara
--        grupo_id). Un RPC = una transacción = created_at IDÉNTICO en
--        todas sus filas. Regla: TRANSACCIÓN. Vacía hoy (no hay
--        traslados registrados desde el 2026-08-17), pero la regla existe
--        por si alguien registra uno entre la verificación y la
--        aplicación de esta migración -- por eso el CREATE OR REPLACE que
--        estampa grupo_id fue a la 098 y no a la 099, para que esta
--        ventana sea lo más corta posible.
--   P3 -- Ajustes masivos y cargas iniciales, de CUALQUIER fecha.
--        construirAjustesMasivos/cargarInventarioInicial hacen un solo
--        .insert(array) -- una sentencia = una transacción = created_at
--        IDÉNTICO en todas. Regla: TRANSACCIÓN, con triple ancla
--        (created_at + fecha + notas, porque esas dos últimas también las
--        pone la misma llamada). Hallazgo que agranda el alcance para
--        bien: esto hace agrupables retroactivamente los conteos físicos
--        históricos, no solo los futuros. P3 es separable a propósito: si
--        se quisiera no tocar los ajustes históricos, esa sección se
--        podría quitar sin afectar P1/P2.
--
-- SI ALGO NO CUADRA: aborta esa población (o la migración entera, si el
-- total global de filas diverge) y NO se agrupa nada de esa población.
-- NO se reintenta con una regla más laxa -- filas sueltas es el
-- comportamiento de HOY, no una regresión (mismo principio que 075/076/
-- 080).
--
-- IDEMPOTENTE por población: cada una parte de "candidatos con
-- grupo_id IS NULL"; si ese conjunto está vacío, RAISE NOTICE y se salta
-- esa población sin error (no es un fallo, es "ya se agrupó antes" o
-- "no hay nada de esta forma hoy"). Las guardas de cierre verifican el
-- ESTADO FINAL de la tabla, así que valen igual en una corrida nueva o en
-- una re-corrida idempotente.
--
-- RESPALDO en `respaldos`, nunca en `public` (081). Guarda las filas
-- verbatim ANTES de tocarlas (con su grupo_id NULL previo), más un
-- snapshot de gan_inventario para probar que esta migración no lo tocó.
--
-- Corre completo de una sola vez (sin BEGIN/COMMIT explícitos, igual que
-- 075/076/077/080/081/082/098/099).
-- =====================================================================


-- ---------------------------------------------------------------------
-- Consulta de pre-verificación (NO se ejecuta como parte de la
-- migración -- correrla a mano ANTES de aplicar, para confirmar qué
-- poblaciones existen hoy):
--
-- WITH candidatos AS (
--   SELECT id, tipo, fecha, created_at, novillos_delta, toros_delta, notas,
--          potrero_origen_id, potrero_destino_id, grupo_id,
--          count(*) OVER (PARTITION BY created_at) AS filas_mismo_instante
--     FROM gan_movimientos
--    WHERE estado = 'confirmado'
--      AND tipo IN ('traslado_salida','traslado_entrada','ajuste')
-- )
-- SELECT CASE
--          WHEN tipo LIKE 'traslado%' AND filas_mismo_instante = 1 THEN 'P1 secuencia (pre-097)'
--          WHEN tipo LIKE 'traslado%'                             THEN 'P2 transaccion (RPC 097)'
--          WHEN filas_mismo_instante > 1                          THEN 'P3 conteo fisico'
--          ELSE 'suelto -- no se agrupa'
--        END                                   AS poblacion,
--        count(*)                              AS filas,
--        count(DISTINCT created_at)            AS instantes,
--        count(*) FILTER (WHERE grupo_id IS NOT NULL) AS ya_agrupadas,
--        min(fecha), max(fecha)
-- FROM candidatos
-- GROUP BY 1 ORDER BY 1;
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- 0. Esquema de respaldos + tablas de respaldo (estructura vacía, se
--    llenan por población más abajo). CREATE TABLE IF NOT EXISTS: en una
--    re-corrida no se pisa lo que ya se respaldó.
-- ---------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS respaldos;
REVOKE ALL ON SCHEMA respaldos FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA respaldos TO service_role;

CREATE TABLE IF NOT EXISTS respaldos.backup_100_gan_movimientos_grupos AS
  SELECT * FROM gan_movimientos WHERE false;

CREATE TABLE IF NOT EXISTS respaldos.backup_100_gan_inventario AS
  SELECT potrero_id, novillos, toros, peso_promedio_kg FROM gan_inventario;

ALTER TABLE respaldos.backup_100_gan_movimientos_grupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE respaldos.backup_100_gan_inventario ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE respaldos.backup_100_gan_movimientos_grupos IS
  'Filas de gan_movimientos, verbatim con su grupo_id NULL previo, tal '
  'como estaban justo antes de que la migración 100 las agrupara. Fuente '
  'del ROLLBACK documentado al pie de 100.';
COMMENT ON TABLE respaldos.backup_100_gan_inventario IS
  'Snapshot de gan_inventario tomado por la migración 100 antes de '
  'agrupar. La 100 SOLO escribe grupo_id -- nunca debe tocar el '
  'inventario; esta tabla es la línea base contra la que se verifica.';


DO $$
DECLARE
  v_total_movs           integer;
  v_suma_novillos_antes   integer;
  v_suma_toros_antes      integer;
  -- P1
  v_p1_total              integer;
  v_p1_instantes          integer;
  v_p1_invalidos          integer;
  v_p1_grupos             integer;
  -- P2
  v_p2_grupos_candidatos  integer;
  v_p2_invalidos          integer;
  -- P3
  v_p3_grupos_candidatos  integer;
  v_p3_filas              integer;
  -- Cierre
  v_p1_grupos_validos     integer;
  v_p1_grupos_distintos   integer;
  v_p1_sin_grupo          integer;
  v_traslados_sin_grupo   integer;
  v_no_cierra             integer;
  v_grupos_mixtos         integer;
  v_total_final           integer;
  v_suma_novillos_final   integer;
  v_suma_toros_final      integer;
  v_inventario_diff       integer;
BEGIN
  -- =====================================================================
  -- Guarda global de entrada: el universo de gan_movimientos es el
  -- esperado y se captura la suma de deltas ANTES de tocar nada (la 100
  -- solo debe escribir grupo_id -- ningún delta puede cambiar).
  -- =====================================================================
  SELECT count(*), COALESCE(sum(novillos_delta), 0), COALESCE(sum(toros_delta), 0)
    INTO v_total_movs, v_suma_novillos_antes, v_suma_toros_antes
    FROM gan_movimientos;

  IF v_total_movs <> 53 THEN
    RAISE EXCEPTION '100 ABORTADA: gan_movimientos tiene % filas, se esperaban 53 (línea base 2026-08-17). El estado divergió -- revisar antes de continuar.', v_total_movs;
  END IF;

  -- =====================================================================
  -- P1 -- traslados anteriores a la 097 (2026-07-02), regla de secuencia.
  -- =====================================================================
  SELECT count(*), count(DISTINCT created_at)
    INTO v_p1_total, v_p1_instantes
    FROM gan_movimientos
   WHERE estado = 'confirmado'
     AND tipo IN ('traslado_salida', 'traslado_entrada')
     AND fecha = '2026-07-02'
     AND grupo_id IS NULL;

  IF v_p1_total = 0 THEN
    RAISE NOTICE '100 (P1): no hay traslados del 2026-07-02 sin agrupar -- ya se agruparon en una corrida anterior, o no hay nada que hacer.';
  ELSE
    IF v_p1_total <> 22 THEN
      RAISE EXCEPTION '100 ABORTADA (P1): hay % traslados del 2026-07-02 sin agrupar, se esperaban exactamente 22. No se agrupa nada.', v_p1_total;
    END IF;
    IF v_p1_instantes <> 22 THEN
      RAISE EXCEPTION '100 ABORTADA (P1): los 22 traslados no tienen created_at todos distintos (% instantes) -- la evidencia de secuencia no alcanza. No se agrupa nada.', v_p1_instantes;
    END IF;

    CREATE TEMP TABLE gan_100_p1_pares AS
    WITH numerados AS (
      SELECT id, tipo, potrero_origen_id, potrero_destino_id, novillos_delta, toros_delta,
             row_number() OVER (ORDER BY created_at) AS rn
        FROM gan_movimientos
       WHERE estado = 'confirmado'
         AND tipo IN ('traslado_salida', 'traslado_entrada')
         AND fecha = '2026-07-02'
         AND grupo_id IS NULL
    )
    SELECT
      s.rn AS par,
      s.id AS salida_id, e.id AS entrada_id,
      (s.tipo = 'traslado_salida')                                            AS s_es_salida,
      (e.tipo = 'traslado_entrada')                                           AS e_es_entrada,
      (s.novillos_delta = -e.novillos_delta AND s.toros_delta = -e.toros_delta) AS deltas_espejo,
      (s.potrero_origen_id IS NOT NULL)                                       AS s_tiene_origen,
      (e.potrero_destino_id IS NOT NULL)                                      AS e_tiene_destino,
      (s.potrero_origen_id IS DISTINCT FROM e.potrero_destino_id)             AS potreros_distintos,
      gen_random_uuid()                                                       AS grupo_id
      FROM numerados s
      JOIN numerados e ON e.rn = s.rn + 1
     WHERE s.rn % 2 = 1;

    SELECT count(*) INTO v_p1_grupos FROM gan_100_p1_pares;
    IF v_p1_grupos <> 11 THEN
      RAISE EXCEPTION '100 ABORTADA (P1): se formaron % pares candidatos, se esperaban 11.', v_p1_grupos;
    END IF;

    SELECT count(*) INTO v_p1_invalidos
      FROM gan_100_p1_pares
     WHERE NOT (s_es_salida AND e_es_entrada AND deltas_espejo AND s_tiene_origen AND e_tiene_destino AND potreros_distintos);
    IF v_p1_invalidos <> 0 THEN
      RAISE EXCEPTION '100 ABORTADA (P1): % de los 11 pares candidatos no cumplen las 6 condiciones (salida, entrada, deltas espejo, ambos potreros presentes, potreros distintos). No se agrupa nada de P1.', v_p1_invalidos;
    END IF;

    INSERT INTO respaldos.backup_100_gan_movimientos_grupos
    SELECT m.* FROM gan_movimientos m
     WHERE m.id IN (SELECT salida_id FROM gan_100_p1_pares UNION SELECT entrada_id FROM gan_100_p1_pares);

    UPDATE gan_movimientos m SET grupo_id = p.grupo_id
      FROM gan_100_p1_pares p WHERE m.id = p.salida_id;
    UPDATE gan_movimientos m SET grupo_id = p.grupo_id
      FROM gan_100_p1_pares p WHERE m.id = p.entrada_id;

    DROP TABLE gan_100_p1_pares;

    RAISE NOTICE '100 (P1): 11 pares agrupados (22 filas) de los traslados del 2026-07-02.';
  END IF;

  -- =====================================================================
  -- P2 -- traslados posteriores a la 097 compartiendo created_at exacto
  --       (una llamada al RPC = una transacción), regla de transacción.
  -- =====================================================================
  CREATE TEMP TABLE gan_100_p2_grupos AS
  SELECT created_at,
         count(*)                                                  AS n,
         count(*) FILTER (WHERE tipo = 'traslado_salida')          AS n_salidas,
         count(*) FILTER (WHERE tipo = 'traslado_entrada')         AS n_entradas,
         count(DISTINCT fecha)                                     AS n_fechas,
         sum(CASE WHEN tipo = 'traslado_salida' THEN -novillos_delta ELSE novillos_delta END) AS novillos_neto,
         sum(CASE WHEN tipo = 'traslado_salida' THEN -toros_delta    ELSE toros_delta    END) AS toros_neto,
         gen_random_uuid()                                         AS grupo_id
    FROM gan_movimientos
   WHERE estado = 'confirmado'
     AND tipo IN ('traslado_salida', 'traslado_entrada')
     AND grupo_id IS NULL
   GROUP BY created_at
  HAVING count(*) >= 2;

  SELECT count(*) INTO v_p2_grupos_candidatos FROM gan_100_p2_grupos;

  IF v_p2_grupos_candidatos = 0 THEN
    RAISE NOTICE '100 (P2): no hay traslados posteriores a la 097 compartiendo created_at -- población vacía hoy, como se esperaba.';
  ELSE
    SELECT count(*) INTO v_p2_invalidos
      FROM gan_100_p2_grupos
     WHERE n_salidas = 0 OR n_entradas = 0 OR n_fechas <> 1 OR novillos_neto <> 0 OR toros_neto <> 0;

    IF v_p2_invalidos <> 0 THEN
      RAISE EXCEPTION '100 ABORTADA (P2): % grupo(s) de traslado con created_at compartido no cierran por categoría (falta salida o entrada, más de una fecha, o el neto de novillos/toros no da cero). No se agrupa nada de P2.', v_p2_invalidos;
    END IF;

    INSERT INTO respaldos.backup_100_gan_movimientos_grupos
    SELECT m.* FROM gan_movimientos m
      JOIN gan_100_p2_grupos g ON g.created_at = m.created_at
     WHERE m.estado = 'confirmado' AND m.tipo IN ('traslado_salida', 'traslado_entrada') AND m.grupo_id IS NULL;

    UPDATE gan_movimientos m SET grupo_id = g.grupo_id
      FROM gan_100_p2_grupos g
     WHERE g.created_at = m.created_at
       AND m.estado = 'confirmado' AND m.tipo IN ('traslado_salida', 'traslado_entrada') AND m.grupo_id IS NULL;

    RAISE NOTICE '100 (P2): % grupo(s) de traslado agrupados por transacción compartida.', v_p2_grupos_candidatos;
  END IF;

  DROP TABLE gan_100_p2_grupos;

  -- =====================================================================
  -- P3 -- ajustes masivos / cargas iniciales, triple ancla (created_at +
  --       fecha + notas), regla de transacción.
  -- =====================================================================
  CREATE TEMP TABLE gan_100_p3_grupos AS
  SELECT created_at, fecha, notas, count(*) AS n, gen_random_uuid() AS grupo_id
    FROM gan_movimientos
   WHERE estado = 'confirmado' AND tipo = 'ajuste' AND grupo_id IS NULL
   GROUP BY created_at, fecha, notas
  HAVING count(*) >= 2;

  SELECT count(*), COALESCE(sum(n), 0) INTO v_p3_grupos_candidatos, v_p3_filas FROM gan_100_p3_grupos;

  IF v_p3_grupos_candidatos = 0 THEN
    RAISE NOTICE '100 (P3): no hay ajustes masivos sin agrupar -- nada que hacer.';
  ELSE
    RAISE NOTICE '100 (P3): % grupo(s) candidatos, % fila(s) en total -- agrupando por (created_at, fecha, notas).', v_p3_grupos_candidatos, v_p3_filas;

    INSERT INTO respaldos.backup_100_gan_movimientos_grupos
    SELECT m.*
      FROM gan_movimientos m
      JOIN gan_100_p3_grupos g
        ON g.created_at = m.created_at AND g.fecha = m.fecha AND g.notas IS NOT DISTINCT FROM m.notas
     WHERE m.estado = 'confirmado' AND m.tipo = 'ajuste' AND m.grupo_id IS NULL;

    UPDATE gan_movimientos m
       SET grupo_id = g.grupo_id
      FROM gan_100_p3_grupos g
     WHERE g.created_at = m.created_at AND g.fecha = m.fecha AND g.notas IS NOT DISTINCT FROM m.notas
       AND m.estado = 'confirmado' AND m.tipo = 'ajuste' AND m.grupo_id IS NULL;
  END IF;

  DROP TABLE gan_100_p3_grupos;

  -- =====================================================================
  -- Guardas de cierre. Recomputadas de forma INDEPENDIENTE de la lógica
  -- de arriba (sobre el estado final de la tabla), no una repetición de
  -- lo que ya decidió qué agrupar. Válidas tanto en una corrida nueva
  -- como en una re-corrida idempotente.
  -- =====================================================================

  -- Los traslados del 2026-07-02 tienen exactamente 11 grupo_id
  -- distintos, cada uno con 2 miembros (1 salida + 1 entrada) y deltas
  -- espejo (suma de novillos_delta y de toros_delta = 0 por grupo).
  SELECT count(*) INTO v_p1_grupos_validos
    FROM (
      SELECT grupo_id, count(*) AS n,
             count(*) FILTER (WHERE tipo = 'traslado_salida')  AS n_sal,
             count(*) FILTER (WHERE tipo = 'traslado_entrada') AS n_ent,
             sum(novillos_delta) AS suma_novillos, sum(toros_delta) AS suma_toros
        FROM gan_movimientos
       WHERE tipo IN ('traslado_salida', 'traslado_entrada') AND fecha = '2026-07-02'
       GROUP BY grupo_id
    ) g
   WHERE g.grupo_id IS NOT NULL AND g.n = 2 AND g.n_sal = 1 AND g.n_ent = 1
     AND g.suma_novillos = 0 AND g.suma_toros = 0;

  SELECT count(DISTINCT grupo_id), count(*) FILTER (WHERE grupo_id IS NULL)
    INTO v_p1_grupos_distintos, v_p1_sin_grupo
    FROM gan_movimientos
   WHERE tipo IN ('traslado_salida', 'traslado_entrada') AND fecha = '2026-07-02';

  IF v_p1_grupos_validos <> 11 OR v_p1_grupos_distintos <> 11 OR v_p1_sin_grupo <> 0 THEN
    RAISE EXCEPTION '100 ABORTADA (cierre P1): % grupo(s) válidos, % grupo(s) distintos, % fila(s) sin grupo entre los traslados del 2026-07-02 -- se esperaban 11 / 11 / 0.', v_p1_grupos_validos, v_p1_grupos_distintos, v_p1_sin_grupo;
  END IF;

  -- 0 filas de traslado (de cualquier fecha) con grupo_id IS NULL.
  SELECT count(*) INTO v_traslados_sin_grupo
    FROM gan_movimientos WHERE tipo IN ('traslado_salida', 'traslado_entrada') AND grupo_id IS NULL;
  IF v_traslados_sin_grupo <> 0 THEN
    RAISE EXCEPTION '100 ABORTADA (cierre): quedan % traslado(s) sin grupo_id.', v_traslados_sin_grupo;
  END IF;

  -- Todo grupo de traslado (P1 o P2) cierra por categoría.
  SELECT count(*) INTO v_no_cierra
    FROM (
      SELECT grupo_id, sum(novillos_delta) AS sn, sum(toros_delta) AS st
        FROM gan_movimientos
       WHERE tipo IN ('traslado_salida', 'traslado_entrada') AND grupo_id IS NOT NULL
       GROUP BY grupo_id
    ) g
   WHERE g.sn <> 0 OR g.st <> 0;
  IF v_no_cierra <> 0 THEN
    RAISE EXCEPTION '100 ABORTADA (cierre): % grupo(s) de traslado no cierran por categoría.', v_no_cierra;
  END IF;

  -- Ningún grupo_id mezcla traslados con ajustes.
  SELECT count(*) INTO v_grupos_mixtos
    FROM (
      SELECT grupo_id,
             count(*) FILTER (WHERE tipo IN ('traslado_salida', 'traslado_entrada')) AS n_traslado,
             count(*) FILTER (WHERE tipo = 'ajuste')                                 AS n_ajuste
        FROM gan_movimientos
       WHERE grupo_id IS NOT NULL
       GROUP BY grupo_id
    ) g
   WHERE g.n_traslado > 0 AND g.n_ajuste > 0;
  IF v_grupos_mixtos <> 0 THEN
    RAISE EXCEPTION '100 ABORTADA (cierre): % grupo_id mezclan traslados con ajustes.', v_grupos_mixtos;
  END IF;

  -- count(*) y las sumas de deltas de gan_movimientos no cambiaron -- la
  -- 100 SOLO escribe grupo_id.
  SELECT count(*), COALESCE(sum(novillos_delta), 0), COALESCE(sum(toros_delta), 0)
    INTO v_total_final, v_suma_novillos_final, v_suma_toros_final
    FROM gan_movimientos;

  IF v_total_final <> v_total_movs THEN
    RAISE EXCEPTION '100 ABORTADA (cierre): gan_movimientos pasó de % a % filas -- la 100 solo debe escribir grupo_id.', v_total_movs, v_total_final;
  END IF;
  IF v_suma_novillos_final <> v_suma_novillos_antes OR v_suma_toros_final <> v_suma_toros_antes THEN
    RAISE EXCEPTION '100 ABORTADA (cierre): la suma de novillos_delta/toros_delta cambió (antes %/%,  después %/%) -- la 100 no debe tocar ningún delta.', v_suma_novillos_antes, v_suma_toros_antes, v_suma_novillos_final, v_suma_toros_final;
  END IF;

  -- El inventario no se movió: gan_inventario byte a byte igual que el
  -- respaldo tomado antes de agrupar. Un UPDATE sobre gan_movimientos
  -- dispara fn_aplicar_movimiento_ganado() (045), cuyo IF solo actúa en
  -- la transición pendiente -> confirmado -- tocar grupo_id es inerte, y
  -- esto lo verifica en vez de solo asumirlo.
  SELECT count(*) INTO v_inventario_diff
    FROM gan_inventario i
    FULL JOIN respaldos.backup_100_gan_inventario b ON b.potrero_id = i.potrero_id
   WHERE i.potrero_id IS NULL OR b.potrero_id IS NULL
      OR i.novillos IS DISTINCT FROM b.novillos
      OR i.toros IS DISTINCT FROM b.toros
      OR i.peso_promedio_kg IS DISTINCT FROM b.peso_promedio_kg;
  IF v_inventario_diff <> 0 THEN
    RAISE EXCEPTION '100 ABORTADA (cierre): gan_inventario cambió (% fila(s) distintas respecto al respaldo) -- la 100 no debe tocar el inventario.', v_inventario_diff;
  END IF;

  RAISE NOTICE '100 OK: 11 grupos de traslado del 2026-07-02 (22 filas, 0 sin agrupar), 0 grupos de traslado sin cerrar, 0 grupo_id mixtos, gan_movimientos sin cambios de conteo ni de deltas, gan_inventario intacto.';
END $$;


-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Deshace SOLO el grupo_id -- ninguna otra columna de gan_movimientos se
-- tocó nunca, así que no hay nada más que restaurar. La UI vuelve a
-- mostrar filas sueltas, que es el estado de hoy, no una pérdida de datos.
--
--   UPDATE gan_movimientos
--      SET grupo_id = NULL
--    WHERE id IN (SELECT id FROM respaldos.backup_100_gan_movimientos_grupos);
--
-- El respaldo se deja en la base a propósito, igual que backup_075_*/
-- backup_080_*/backup_099_*. Bórralo cuando Santiago confirme que la
-- página de Movimientos agrupa los traslados correctamente.
-- =============================================================================
