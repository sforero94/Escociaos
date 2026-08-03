-- =============================================================================
-- 080_hato_partos_biologicamente_imposibles.sql
--
-- Item 2 del issue #96. Elimina los eventos `hato_eventos.tipo='parto'` que
-- son biológicamente imposibles: dos partos del MISMO animal separados por
-- menos del intervalo real mínimo entre partos (~270 días, ya documentado
-- como constante técnica en `calculosHato.ts:1105`, `DIAS_MINIMOS_ENTRE_PARTOS`
-- -- ese valor es 60, usado para colapsar LECTURAS del mismo nacimiento; este
-- archivo resuelve un problema distinto, dos NACIMIENTOS que no pueden ser
-- reales).
--
-- Decisión del dueño, citada textual (issue #96, 2026-08-03):
--   "elimina los partos biologicamente imposibles - deja las vacas vacias y
--    si es el caso registro las preñezes luego. Prefiero limpiar la herida y
--    reconstruir lo que haga falta que mantener datos sucios"
--
-- Es decir: se BORRA el evento imposible, sin fusionar, sin re-fechar, sin
-- inventar una preñez de reemplazo. Martha vuelve a registrar la preñez a
-- mano cuando corresponda -- esta migración no escribe ningún evento nuevo.
--
-- REGLA (decidida, no rediseñar -- ver `src/components/hato/CLAUDE.md`,
-- sección "Bugfix -- eventos parto", para el historial completo de las tres
-- rondas de limpieza previas sobre esta misma tabla):
--
--   Por animal, ordenar los partos por (fecha, id) y caminar HACIA ADELANTE
--   manteniendo un "ancla" (el último parto aceptado):
--     1. El primer parto siempre se acepta y es el ancla inicial.
--     2. Para cada parto siguiente: si `fecha - ancla.fecha >= 270`, se
--        acepta y pasa a ser la nueva ancla.
--     3. Si `fecha - ancla.fecha < 270` es imposible. Desempate:
--        - REGLA DE PRECEDENCIA: si el ancla es 'aproximada' y el candidato
--          es 'exacta', se borra el ANCLA y el candidato pasa a ser la nueva
--          ancla -- una fecha aproximada nunca le gana a una exacta.
--        - En cualquier otro caso se borra el CANDIDATO y el ancla no
--          cambia.
--
-- RESULTADO ESPERADO, verificado por Santiago contra producción antes de
-- escribir este archivo (estos números son la especificación, no una
-- estimación -- los guards de abajo abortan la migración completa si no se
-- cumplen exactamente):
--   * 33 filas borradas, en 31 animales distintos (2 animales pierden 2 cada
--     uno: PACIENCIA #101 y RICARENA #88).
--   * Exactamente 1 caso dispara la regla de precedencia: RICARENA #88,
--     ancla 2023-05-16 ('aproximada') pierde contra 2023-07-10 ('exacta'),
--     55 días de separación. Todos los demás son la regla simple.
--   * hato_eventos tipo `parto`: 333 -> 300.
--   * Tras el borrado, CERO intervalos consecutivos entre partos por debajo
--     de 270 días -- el post-condition de abajo lo verifica, no solo lo
--     afirma.
--
-- LA CAPA CRUDA NO SE TOCA: `hato_chequeo_vacas.ultima_cria_raw` (la
-- planilla verbatim) queda intacta a propósito -- es la capa de evidencia y
-- el contrato del módulo exige que sobreviva sin editar. Consecuencia
-- conocida y aceptada: si alguno de esos chequeos históricos se
-- re-comprometiera alguna vez vía `fn_hato_commit_chequeo` (migración 065),
-- el evento volvería a generarse desde la fila cruda -- no se intenta
-- prevenir eso aquí, es un problema del camino de re-commit, no de esta
-- limpieza puntual.
--
-- Verificado antes de escribir esto (mismo criterio que 071 §2): ninguna de
-- las 333 filas `tipo='parto'` tiene `alerta_id` ni `fin_ingreso_id`
-- asignado, así que no hay filas dependientes que limpiar.
--
-- INCIDENTE DE CORRUPCIÓN PREVIO (ver CLAUDE.md del módulo): la limpieza de
-- 2026-07-23 se hizo con SQL ad hoc que aceptó años malformados y corrompió
-- 2 filas. Por eso ESTA migración calcula el conjunto a borrar con un CTE
-- recursivo (nunca UUIDs pegados a mano) pero lo hace bajo GUARDS que
-- abortan la transacción completa (`RAISE EXCEPTION`) si la realidad no
-- coincide EXACTAMENTE con los números verificados arriba -- ni una fila de
-- más, ni una de menos, ni el conteo de la regla de precedencia.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Copia de seguridad -- filas completas de `hato_eventos` que el CTE
--    recursivo decide borrar, ANTES de tocar nada. Se deja en la base a
--    propósito, mismo criterio que `backup_075_*`/`backup_076_*`.
--
--    `es_precedencia` es una columna de diagnóstico (no existe en
--    hato_eventos): TRUE únicamente en la fila borrada por la regla de
--    precedencia (ancla aproximada perdiendo contra candidato exacto). Se
--    excluye explícitamente del INSERT de rollback al pie del archivo.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.backup_080_hato_partos_imposibles AS
WITH RECURSIVE partos AS (
  SELECT id, animal_id, fecha, fecha_confianza,
         ROW_NUMBER() OVER (PARTITION BY animal_id ORDER BY fecha, id) AS rn
    FROM public.hato_eventos
   WHERE tipo = 'parto'
),
walk AS (
  -- Caso base: el primer parto de cada animal siempre se acepta y es el
  -- ancla inicial. No hay nada que borrar en este paso.
  SELECT
    p.animal_id,
    p.rn,
    p.id              AS anchor_id,
    p.fecha           AS anchor_fecha,
    p.fecha_confianza AS anchor_confianza,
    NULL::uuid        AS deleted_id,
    FALSE             AS es_precedencia
    FROM partos p
   WHERE p.rn = 1

  UNION ALL

  -- Paso recursivo: compara el siguiente parto (p) contra el ancla vigente
  -- (w). Cada fila de este término procesa EXACTAMENTE una decisión y
  -- produce a lo sumo un `deleted_id` -- el candidato normalmente, o el
  -- ancla vieja cuando aplica la regla de precedencia.
  SELECT
    p.animal_id,
    p.rn,
    CASE
      WHEN (p.fecha - w.anchor_fecha) >= 270 THEN p.id
      WHEN w.anchor_confianza = 'aproximada' AND p.fecha_confianza = 'exacta' THEN p.id
      ELSE w.anchor_id
    END AS anchor_id,
    CASE
      WHEN (p.fecha - w.anchor_fecha) >= 270 THEN p.fecha
      WHEN w.anchor_confianza = 'aproximada' AND p.fecha_confianza = 'exacta' THEN p.fecha
      ELSE w.anchor_fecha
    END AS anchor_fecha,
    CASE
      WHEN (p.fecha - w.anchor_fecha) >= 270 THEN p.fecha_confianza
      WHEN w.anchor_confianza = 'aproximada' AND p.fecha_confianza = 'exacta' THEN p.fecha_confianza
      ELSE w.anchor_confianza
    END AS anchor_confianza,
    CASE
      -- >=270 dias: el candidato se acepta, no se borra nada en este paso.
      WHEN (p.fecha - w.anchor_fecha) >= 270 THEN NULL
      -- Regla de precedencia: se borra el ANCLA vieja, no el candidato.
      WHEN w.anchor_confianza = 'aproximada' AND p.fecha_confianza = 'exacta' THEN w.anchor_id
      -- Caso general: se borra el candidato, el ancla no cambia.
      ELSE p.id
    END AS deleted_id,
    ((p.fecha - w.anchor_fecha) < 270
      AND w.anchor_confianza = 'aproximada'
      AND p.fecha_confianza = 'exacta') AS es_precedencia
    FROM walk w
    JOIN partos p
      ON p.animal_id = w.animal_id
     AND p.rn = w.rn + 1
)
SELECT e.*, w.es_precedencia
  FROM public.hato_eventos e
  JOIN walk w ON w.deleted_id = e.id
 WHERE w.deleted_id IS NOT NULL;


-- -----------------------------------------------------------------------------
-- 2. Guards -- abortan la migración COMPLETA (RAISE EXCEPTION dentro de un
--    DO deshace la transacción) si la realidad no coincide con lo
--    verificado. Ningún DELETE corre si alguno de estos falla.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_total_partos     INTEGER;
  v_a_borrar         INTEGER;
  v_animales_afect   INTEGER;
  v_precedencia      INTEGER;
BEGIN
  -- Guard A: el universo de partos debe seguir siendo 333. Si cambió desde
  -- la verificación (una fila borrada/insertada por otra vía), la base
  -- divergió y esta migración se detiene en vez de operar sobre un
  -- conjunto distinto al que Santiago validó.
  SELECT count(*) INTO v_total_partos
    FROM public.hato_eventos
   WHERE tipo = 'parto';

  IF v_total_partos <> 333 THEN
    RAISE EXCEPTION 'Migración 080: se esperaban exactamente 333 eventos tipo=parto en hato_eventos, se encontraron %. La base divergió del estado verificado -- revisa manualmente antes de reintentar; NO se borró nada.', v_total_partos;
  END IF;

  -- Guard B: el conjunto calculado por el CTE recursivo debe ser exactamente
  -- 33 filas sobre 31 animales distintos.
  SELECT count(*), count(DISTINCT animal_id)
    INTO v_a_borrar, v_animales_afect
    FROM public.backup_080_hato_partos_imposibles;

  IF v_a_borrar <> 33 OR v_animales_afect <> 31 THEN
    RAISE EXCEPTION 'Migración 080: el CTE recursivo calculó % filas a borrar sobre % animales -- se esperaban exactamente 33 filas sobre 31 animales. NO se borró nada.', v_a_borrar, v_animales_afect;
  END IF;

  -- Guard C: la regla de precedencia (ancla aproximada perdiendo contra
  -- candidato exacto) debe dispararse EXACTAMENTE una vez -- el caso
  -- RICARENA #88 verificado (2023-05-16 aproximada vs 2023-07-10 exacta,
  -- 55 días). Cualquier otro conteo indica que la lógica del CTE no
  -- coincide con lo verificado en producción.
  SELECT count(*) INTO v_precedencia
    FROM public.backup_080_hato_partos_imposibles
   WHERE es_precedencia;

  IF v_precedencia <> 1 THEN
    RAISE EXCEPTION 'Migración 080: se esperaba exactamente 1 caso de regla de precedencia (ancla aproximada perdiendo contra candidato exacto), se calcularon %. NO se borró nada.', v_precedencia;
  END IF;

  RAISE NOTICE 'Migración 080: guards previos OK -- 333 partos totales, 33 a borrar sobre 31 animales, 1 caso de precedencia. Procediendo al DELETE.';
END $$;


-- -----------------------------------------------------------------------------
-- 3. DELETE -- solo las filas que pasaron los tres guards de arriba.
-- -----------------------------------------------------------------------------

DELETE FROM public.hato_eventos
 WHERE id IN (SELECT id FROM public.backup_080_hato_partos_imposibles);


-- -----------------------------------------------------------------------------
-- 4. Post-condiciones -- verifican el resultado, no solo lo asumen.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_restantes         INTEGER;
  v_borradas          INTEGER;
  v_intervalos_cortos INTEGER;
BEGIN
  -- Post-condición A: quedan exactamente 300 partos (333 - 33).
  SELECT count(*) INTO v_restantes
    FROM public.hato_eventos
   WHERE tipo = 'parto';

  IF v_restantes <> 300 THEN
    RAISE EXCEPTION 'Migración 080: tras el DELETE quedan % eventos tipo=parto, se esperaban exactamente 300. Revisa manualmente -- NO reintentes a ciegas.', v_restantes;
  END IF;

  -- Confirma también que el DELETE afectó exactamente las 33 filas del
  -- conjunto calculado (no más, no menos -- descarta condición de carrera).
  SELECT count(*) INTO v_borradas
    FROM public.backup_080_hato_partos_imposibles b
   WHERE NOT EXISTS (
     SELECT 1 FROM public.hato_eventos e WHERE e.id = b.id
   );

  IF v_borradas <> 33 THEN
    RAISE EXCEPTION 'Migración 080: el guard previo calculó 33 filas a borrar pero solo % ya no existen en hato_eventos tras el DELETE. Revisa manualmente.', v_borradas;
  END IF;

  -- Post-condición B (la más importante): CERO intervalos consecutivos
  -- entre partos del mismo animal por debajo de 270 días deben quedar.
  -- Recalculada de forma independiente al CTE de arriba (LAG simple sobre
  -- el estado final), para que esto sea una verificación real del
  -- resultado y no una repetición de la misma lógica que ya decidió qué
  -- borrar.
  SELECT count(*) INTO v_intervalos_cortos
    FROM (
      SELECT fecha - LAG(fecha) OVER (PARTITION BY animal_id ORDER BY fecha, id) AS dias
        FROM public.hato_eventos
       WHERE tipo = 'parto'
    ) d
   WHERE dias IS NOT NULL AND dias < 270;

  IF v_intervalos_cortos <> 0 THEN
    RAISE EXCEPTION 'Migración 080: tras el DELETE quedan % pares de partos consecutivos separados por menos de 270 días -- la limpieza es incompleta. Revisa manualmente, NO reintentes a ciegas.', v_intervalos_cortos;
  END IF;

  RAISE NOTICE 'Migración 080: post-condiciones OK -- 300 partos restantes, 33 filas borradas, 0 intervalos consecutivos por debajo de 270 días.';
END $$;


-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Restaura las 33 filas borradas desde la copia de seguridad. Se listan las
-- columnas explícitamente para excluir la columna de diagnóstico
-- `es_precedencia`, que no existe en `hato_eventos`:
--
--   INSERT INTO public.hato_eventos
--     (id, animal_id, tipo, fecha, fecha_confianza, toro_id, tipo_servicio,
--      cria_id, cria_destino, sx_raw, chequeo_vaca_id, alerta_id,
--      transaccion_ganado_id, fuente, datos, created_at, created_by)
--   SELECT
--     id, animal_id, tipo, fecha, fecha_confianza, toro_id, tipo_servicio,
--     cria_id, cria_destino, sx_raw, chequeo_vaca_id, alerta_id,
--     transaccion_ganado_id, fuente, datos, created_at, created_by
--   FROM public.backup_080_hato_partos_imposibles;
--
-- La tabla backup_080_hato_partos_imposibles se deja en la base a
-- propósito. Bórrala cuando Santiago confirme que la Hoja de Vida y el
-- motor de alertas (secado/parto) se ven correctos para los 31 animales
-- afectados.
-- =============================================================================
