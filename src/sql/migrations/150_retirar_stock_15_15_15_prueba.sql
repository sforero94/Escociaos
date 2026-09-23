-- =============================================================================
-- 150_retirar_stock_15_15_15_prueba.sql
--
-- ARCHIVO DE REGISTRO — NO APLICAR.
--
-- Corrió en producción el 2026-09-21 (ledger `20260921132809`, name
-- `150_retirar_stock_15_15_15_prueba`) antes de que existiera este fichero en
-- `main`. Cuerpo recuperado literal del ledger el 2026-09-23, mismo criterio que
-- 067, 079, 108 y 157:
--   select statements from supabase_migrations.schema_migrations
--    where version = '20260921132809';
--
-- Por qué no es el fichero del PR #247: aquel borraba la Entrada de 150 kg con
-- DELETE. Al aplicarlo se vio que `rondas_excepciones.captura_movimiento_id` y el
-- CHECK `excepcion_captura_completa` anclan ese movimiento a la excepción resuelta
-- de la ronda de agosto (contrato R-10), así que borrarlo obligaba a reescribir
-- la ronda. Lo que corrió ANULA el asiento (cantidad, saldo_nuevo y
-- valor_movimiento a 0) y deja el stock en 0. El PR #247 se cerró sin merge.
--
-- Decisión de Santiago (2026-09-14): el 15-15-15 fue una prueba y nunca existió
-- físicamente. Efecto: stock 150 → 0, total de Entradas del tablero de
-- Inventario −$654.000. P&G y Flujo de Caja no cambian.
--
-- Filas afectadas: 1 UPDATE en movimientos_inventario + 1 UPDATE en productos.
-- Respaldo: respaldos.backup_150_15_15_15_prueba (1 fila).
-- Verificado 2026-09-23: stock 0,00; movimiento 0,00 / 0,00; respaldo 1 fila.
--
-- Nota: el cuerpo trae BEGIN/COMMIT propios. Así corrió y así se conserva; no
-- es un patrón a copiar (ver escociaos-po/memory/_compartida.md, «Aplicar
-- migraciones por Composio», punto 1).
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_producto uuid := 'a8aa8dcd-651f-46ce-ab50-803b171aa866';
  v_movimiento uuid := '840899f6-5ad8-45a0-81fb-47fecea1a5f1';
  v_n integer;
  v_cantidad numeric;
BEGIN
  SELECT count(*) INTO v_n FROM productos WHERE id = v_producto AND nombre = '15-15-15';
  IF v_n <> 1 THEN RAISE EXCEPTION 'Pre 0.1: se esperaba 1 producto 15-15-15, hay %', v_n; END IF;

  SELECT cantidad_actual INTO v_cantidad FROM productos WHERE id = v_producto;
  IF v_cantidad <> 150.00 THEN RAISE EXCEPTION 'Pre 0.2: cantidad_actual esperada 150.00, encontrada %', v_cantidad; END IF;

  SELECT (SELECT count(*) FROM compras WHERE producto_id = v_producto)
       + (SELECT count(*) FROM aplicaciones_productos WHERE producto_id = v_producto)
       + (SELECT count(*) FROM movimientos_diarios_productos WHERE producto_id = v_producto)
       + (SELECT count(*) FROM verificaciones_detalle WHERE producto_id = v_producto)
    INTO v_n;
  IF v_n <> 0 THEN RAISE EXCEPTION 'Pre 0.3: el producto tiene % filas de historia real', v_n; END IF;
END $$;

CREATE TABLE respaldos.backup_150_15_15_15_prueba AS
SELECT m.*, p.cantidad_actual AS producto_cantidad_actual_antes
  FROM movimientos_inventario m
  JOIN productos p ON p.id = m.producto_id
 WHERE m.id = '840899f6-5ad8-45a0-81fb-47fecea1a5f1';

REVOKE ALL ON respaldos.backup_150_15_15_15_prueba FROM PUBLIC, anon, authenticated;
ALTER TABLE respaldos.backup_150_15_15_15_prueba ENABLE ROW LEVEL SECURITY;

-- No se borra el movimiento: FK + check excepcion_captura_completa lo anclan a la ronda.
-- Se anula el asiento (cantidad/valor/saldos) y se pone stock en 0.
UPDATE movimientos_inventario
   SET cantidad = 0,
       saldo_nuevo = 0,
       valor_movimiento = 0,
       observaciones = COALESCE(observaciones, '') || ' | anulado 2026-09-21 Escocia Bot: prueba 15-15-15, nunca existió físicamente (ESCO PR #247 sin merge)'
 WHERE id = '840899f6-5ad8-45a0-81fb-47fecea1a5f1';

UPDATE productos
   SET cantidad_actual = 0
 WHERE id = 'a8aa8dcd-651f-46ce-ab50-803b171aa866';

DO $$
DECLARE
  v_producto uuid := 'a8aa8dcd-651f-46ce-ab50-803b171aa866';
  v_n integer;
  v_cantidad numeric;
  v_valor numeric;
BEGIN
  SELECT count(*) INTO v_n FROM respaldos.backup_150_15_15_15_prueba;
  IF v_n <> 1 THEN RAISE EXCEPTION 'Post: respaldo tiene % filas', v_n; END IF;

  SELECT cantidad_actual INTO v_cantidad FROM productos WHERE id = v_producto;
  IF v_cantidad <> 0 THEN RAISE EXCEPTION 'Post: stock quedó en %', v_cantidad; END IF;

  SELECT cantidad, valor_movimiento INTO v_cantidad, v_valor
    FROM movimientos_inventario WHERE id = '840899f6-5ad8-45a0-81fb-47fecea1a5f1';
  IF v_cantidad <> 0 OR v_valor <> 0 THEN RAISE EXCEPTION 'Post: movimiento no anulado (cant %, valor %)', v_cantidad, v_valor; END IF;

  SELECT (SELECT count(*) FROM rondas_excepciones WHERE producto_id = v_producto)
       + (SELECT count(*) FROM rondas_inventario_alcance WHERE producto_id = v_producto)
    INTO v_n;
  IF v_n <> 2 THEN RAISE EXCEPTION 'Post: historia de ronda cambió (hay %)', v_n; END IF;

  RAISE NOTICE '150 OK (variante sin DELETE): stock 0; movimiento anulado; ronda intacta';
END $$;

COMMIT;
