-- ============================================================================
-- 138_pajillas_jerico_stock_cero.sql
--
-- Deja el stock de pajillas del toro Jericó en 0, que es la existencia física
-- real (dueño, 2026-09-08). Hoy la vista v_hato_pajillas_stock reporta 1.
--
-- QUÉ PASÓ. El 2026-09-08 se registró DOS VECES la misma inseminación de
-- ELECTRA (#117) del 2026-08-11 con pajilla de Jericó, por dos caminos de
-- Telegram distintos:
--   19:51:32  uso 3b09597b… + evento servicio c0fa2e99…
--             datos = {"origen":"telegram","registrado_por":null}
--             SIN pajilla_uso_id, created_by NULL
--   21:00:27  uso 041dbf1a… + evento servicio 2eabd54b…
--             datos = {"origen":"telegram","pajilla_uso_id":"041dbf1a…",
--                      "registrado_por":"Martha Vega"}
--             created_by poblado
-- Una vaca no se insemina dos veces el mismo día con el mismo toro, y el par
-- de las 21:00 es el que quedó completo: enlaza su uso por `pajilla_uso_id`
-- y trae autor. Sobrevive ese; se borra el par de las 19:51.
--
-- POR QUÉ ADEMÁS SE BAJA cantidad_inicial. Borrar el duplicado sube el stock
-- de 1 a 2 — va en la dirección contraria. La existencia real es 0 con UNA
-- inseminación real, así que el lote se compró de 1 pajilla, no de 3. Se
-- corrige el dato de compra; NO se inventan usos para cuadrar el saldo (eso
-- fabricaría inseminaciones que nunca ocurrieron, el error que la 119 ya
-- refutó en inventario de insumos).
--
-- Qué NO se toca:
--   - hato_toros: Jericó ya está activo = false. No se borra el toro; los
--     eventos servicio históricos cuelgan de él.
--   - El evento servicio de las 21:00: ELECTRA conserva su servicio real.
--   - hato_pajillas.activa: sigue en true. El saldo en 0 es el hecho; la
--     baja del lote es otra decisión.
--
-- Traza: ni hato_pajillas ni hato_pajillas_uso están cubiertas por
-- hato_correcciones (084), y esta migración corre como `postgres` con
-- auth.uid() NULL, así que el trigger de hato_eventos tampoco deja fila. El
-- respaldo en `respaldos` es el único registro — patrón 081 (nunca en public,
-- que hereda GRANT ALL a anon).
--
-- Filas afectadas: 1 DELETE en hato_pajillas_uso, 1 DELETE en hato_eventos,
-- 1 UPDATE en hato_pajillas.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 0. Pre-condiciones. Cualquier desviación aborta toda la transacción.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_toro_id      uuid := '55944494-cf3e-4e8c-8594-a3e548af21db';
  v_lote_id      uuid := '0bb64748-2e4c-4642-b50b-51197e0f2bb2';
  v_animal_id    uuid := 'a36f7341-3d99-49ed-93c1-5d800a61dc91';
  v_uso_borrar   uuid := '3b09597b-62d2-41a6-8a45-126f2e3ab44d';
  v_uso_queda    uuid := '041dbf1a-5c47-4202-af60-3bbcd5c80553';
  v_ev_borrar    uuid := 'c0fa2e99-1f1b-4e80-8994-bc1be5d4be44';
  v_ev_queda     uuid := '2eabd54b-8576-46cb-8b6d-e553e71a38b5';
  v_n            integer;
BEGIN
  -- 0.1 El toro es Jericó.
  SELECT count(*) INTO v_n
  FROM hato_toros WHERE id = v_toro_id AND nombre = 'Jericó';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '0.1: el toro Jericó % no existe con ese nombre', v_toro_id;
  END IF;

  -- 0.2 Jericó tiene EXACTAMENTE un lote de pajillas, y es el esperado.
  SELECT count(*) INTO v_n FROM hato_pajillas WHERE toro_id = v_toro_id;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '0.2: se esperaba 1 lote de pajillas de Jericó, hay %', v_n;
  END IF;

  -- 0.3 Ese lote tiene cantidad_inicial = 3.
  SELECT count(*) INTO v_n
  FROM hato_pajillas WHERE id = v_lote_id AND toro_id = v_toro_id
    AND cantidad_inicial = 3;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '0.3: el lote % no tiene cantidad_inicial = 3', v_lote_id;
  END IF;

  -- 0.4 El lote tiene exactamente 2 usos, y son los dos identificados.
  SELECT count(*) INTO v_n FROM hato_pajillas_uso WHERE pajilla_id = v_lote_id;
  IF v_n <> 2 THEN
    RAISE EXCEPTION '0.4: se esperaban 2 usos en el lote, hay %', v_n;
  END IF;
  SELECT count(*) INTO v_n
  FROM hato_pajillas_uso
  WHERE pajilla_id = v_lote_id AND id IN (v_uso_borrar, v_uso_queda);
  IF v_n <> 2 THEN
    RAISE EXCEPTION '0.4b: los 2 usos del lote no son los identificados';
  END IF;

  -- 0.5 Los dos usos son la MISMA vaca y la MISMA fecha: es un duplicado,
  --     no dos inseminaciones distintas.
  SELECT count(*) INTO v_n
  FROM hato_pajillas_uso
  WHERE id IN (v_uso_borrar, v_uso_queda)
    AND animal_id = v_animal_id
    AND fecha_uso = DATE '2026-08-11';
  IF v_n <> 2 THEN
    RAISE EXCEPTION '0.5: los 2 usos no son ELECTRA/2026-08-11; no es un duplicado';
  END IF;

  -- 0.6 El uso que se borra es el HUÉRFANO: sin created_by y sin evento que
  --     lo enlace por pajilla_uso_id. El que queda sí trae autor.
  SELECT count(*) INTO v_n
  FROM hato_pajillas_uso WHERE id = v_uso_borrar AND created_by IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '0.6: el uso a borrar % ya no es el huérfano', v_uso_borrar;
  END IF;
  SELECT count(*) INTO v_n
  FROM hato_pajillas_uso WHERE id = v_uso_queda AND created_by IS NOT NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '0.6b: el uso que sobrevive % perdió su created_by', v_uso_queda;
  END IF;

  -- 0.7 ELECTRA tiene exactamente 2 eventos servicio de Jericó ese día, y el
  --     que sobrevive es el que enlaza el uso que sobrevive.
  SELECT count(*) INTO v_n
  FROM hato_eventos
  WHERE animal_id = v_animal_id AND tipo = 'servicio'
    AND toro_id = v_toro_id AND fecha = DATE '2026-08-11';
  IF v_n <> 2 THEN
    RAISE EXCEPTION '0.7: se esperaban 2 eventos servicio ELECTRA/Jericó, hay %', v_n;
  END IF;
  SELECT count(*) INTO v_n
  FROM hato_eventos
  WHERE id = v_ev_queda AND datos ->> 'pajilla_uso_id' = v_uso_queda::text;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '0.7b: el evento que sobrevive ya no enlaza el uso que sobrevive';
  END IF;
  SELECT count(*) INTO v_n
  FROM hato_eventos
  WHERE id = v_ev_borrar AND datos ->> 'pajilla_uso_id' IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '0.7c: el evento a borrar % ya no es el huérfano', v_ev_borrar;
  END IF;

  -- 0.8 Nada más apunta al uso ni al evento que se borran.
  SELECT count(*) INTO v_n
  FROM pg_constraint
  WHERE contype = 'f'
    AND confrelid IN ('hato_pajillas_uso'::regclass, 'hato_eventos'::regclass);
  IF v_n <> 0 THEN
    RAISE EXCEPTION '0.8: apareció una FK hacia hato_pajillas_uso/hato_eventos (%)', v_n;
  END IF;

  RAISE NOTICE 'Pre-condiciones OK: lote % (3 pajillas, 2 usos duplicados).', v_lote_id;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Respaldo forense en `respaldos` (NUNCA en public — patrón 081).
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS respaldos;

CREATE TABLE respaldos.backup_138_pajillas_jerico AS
SELECT * FROM hato_pajillas WHERE id = '0bb64748-2e4c-4642-b50b-51197e0f2bb2';

CREATE TABLE respaldos.backup_138_pajillas_uso_jerico AS
SELECT * FROM hato_pajillas_uso
WHERE id = '3b09597b-62d2-41a6-8a45-126f2e3ab44d';

CREATE TABLE respaldos.backup_138_eventos_jerico AS
SELECT * FROM hato_eventos
WHERE id = 'c0fa2e99-1f1b-4e80-8994-bc1be5d4be44';

ALTER TABLE respaldos.backup_138_pajillas_jerico      ENABLE ROW LEVEL SECURITY;
ALTER TABLE respaldos.backup_138_pajillas_uso_jerico  ENABLE ROW LEVEL SECURITY;
ALTER TABLE respaldos.backup_138_eventos_jerico       ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON respaldos.backup_138_pajillas_jerico     FROM anon, authenticated, PUBLIC;
REVOKE ALL ON respaldos.backup_138_pajillas_uso_jerico FROM anon, authenticated, PUBLIC;
REVOKE ALL ON respaldos.backup_138_eventos_jerico      FROM anon, authenticated, PUBLIC;

-- ---------------------------------------------------------------------------
-- 2. Borrar el par duplicado de las 19:51 (evento primero, luego el uso).
-- ---------------------------------------------------------------------------
DELETE FROM hato_eventos       WHERE id = 'c0fa2e99-1f1b-4e80-8994-bc1be5d4be44';
DELETE FROM hato_pajillas_uso  WHERE id = '3b09597b-62d2-41a6-8a45-126f2e3ab44d';

-- ---------------------------------------------------------------------------
-- 3. Corregir la compra: 1 pajilla, no 3. Con 1 uso real el saldo queda en 0.
-- ---------------------------------------------------------------------------
UPDATE hato_pajillas
SET cantidad_inicial = 1
WHERE id = '0bb64748-2e4c-4642-b50b-51197e0f2bb2';

-- ---------------------------------------------------------------------------
-- 4. Post-condiciones.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_toro_id   uuid := '55944494-cf3e-4e8c-8594-a3e548af21db';
  v_lote_id   uuid := '0bb64748-2e4c-4642-b50b-51197e0f2bb2';
  v_animal_id uuid := 'a36f7341-3d99-49ed-93c1-5d800a61dc91';
  v_n         integer;
  v_stock     integer;
BEGIN
  -- 4.1 El saldo de Jericó es 0. Es el objetivo de toda la migración.
  SELECT coalesce(sum(cantidad_actual), -1) INTO v_stock
  FROM v_hato_pajillas_stock WHERE toro_id = v_toro_id;
  IF v_stock <> 0 THEN
    RAISE EXCEPTION '4.1: el stock de Jericó quedó en %, se esperaba 0', v_stock;
  END IF;

  -- 4.2 Queda 1 uso, y es el que trae autor y evento enlazado.
  SELECT count(*) INTO v_n FROM hato_pajillas_uso WHERE pajilla_id = v_lote_id;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '4.2: quedaron % usos en el lote, se esperaba 1', v_n;
  END IF;
  SELECT count(*) INTO v_n
  FROM hato_pajillas_uso
  WHERE id = '041dbf1a-5c47-4202-af60-3bbcd5c80553'
    AND created_by IS NOT NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '4.2b: sobrevivió el uso equivocado';
  END IF;

  -- 4.3 ELECTRA conserva UN servicio real de Jericó ese día. Ni cero ni dos.
  SELECT count(*) INTO v_n
  FROM hato_eventos
  WHERE animal_id = v_animal_id AND tipo = 'servicio'
    AND toro_id = v_toro_id AND fecha = DATE '2026-08-11';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '4.3: ELECTRA quedó con % servicios de Jericó, se esperaba 1', v_n;
  END IF;

  -- 4.4 El respaldo tiene las 3 filas de antes.
  SELECT (SELECT count(*) FROM respaldos.backup_138_pajillas_jerico)
       + (SELECT count(*) FROM respaldos.backup_138_pajillas_uso_jerico)
       + (SELECT count(*) FROM respaldos.backup_138_eventos_jerico)
    INTO v_n;
  IF v_n <> 3 THEN
    RAISE EXCEPTION '4.4: el respaldo tiene % filas, se esperaban 3', v_n;
  END IF;

  -- 4.5 Ningún otro toro cambió de saldo por error.
  SELECT count(*) INTO v_n
  FROM v_hato_pajillas_stock WHERE toro_id <> v_toro_id AND cantidad_actual < 0;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '4.5: % lotes de otros toros quedaron en negativo', v_n;
  END IF;

  RAISE NOTICE 'Jericó: stock 0, 1 uso real de ELECTRA, 1 evento servicio.';
END $$;


-- ============================================================================
-- ROLLBACK (ejecutable, si hiciera falta)
-- ============================================================================
-- BEGIN;
--   INSERT INTO hato_pajillas_uso
--     SELECT * FROM respaldos.backup_138_pajillas_uso_jerico;
--   INSERT INTO hato_eventos
--     SELECT * FROM respaldos.backup_138_eventos_jerico;
--   UPDATE hato_pajillas p SET cantidad_inicial = b.cantidad_inicial
--     FROM respaldos.backup_138_pajillas_jerico b WHERE p.id = b.id;
-- COMMIT;
