-- Migración 150: retirar el stock de 15-15-15, que nunca existió físicamente
--
-- DECISIÓN DEL DUEÑO, 2026-09-14, en sesión en vivo: «era una prueba que
-- estaba haciendo y se armó todo un escándalo. No tenemos 15-15-15, así que
-- borra el stock y cierra el tema.»
--
-- QUÉ PASÓ. Durante la ronda de inventario de agosto (2026-08-28, la única
-- que ha corrido en la vida del módulo) se probó la vía CON respaldo: Uriel
-- dictó por voz «tres bultos de 15-15-15 de 50 kilos», el intérprete guardó
-- `cantidad_fisica = 3` en vez de 150, y David capturó a mano una Entrada de
-- 150,00 kg. Ese factor de 50 disparó la migración 145 (que corrigió la fila
-- de la excepción) y el hallazgo #98 (que pide aplicar la 147). Pero el
-- producto nunca estuvo en la bodega: fue un ensayo del circuito.
--
-- POR QUÉ ES SEGURO BORRARLO, y esto se comprobó contra producción ANTES de
-- escribir el fichero, no después:
--   * `compras`                     -> 0 filas
--   * `aplicaciones_productos`      -> 0 filas
--   * `movimientos_diarios_productos` -> 0 filas
--   * `verificaciones_detalle`      -> 0 filas
--   * `movimientos_inventario`      -> 1 fila, la Entrada de la prueba
-- O sea que **ninguna cadena de trazabilidad GlobalGAP cuelga de este
-- producto**. No se aplicó nunca a un lote, no se compró nunca, no entró
-- nunca a un movimiento diario. Si cualquiera de esos cuatro conteos dejara
-- de ser cero, esta migración aborta -- ver la guarda 0.3.
--
-- SE BORRA LA FILA, NO SE COMPENSA CON UNA SALIDA. `movimientos_inventario`
-- es un libro de eventos, y la regla por defecto de este proyecto es
-- compensar en vez de borrar (precedente 108, la doble carga de ganado). Acá
-- NO aplica: una Salida de 150 kg registraría un consumo de fertilizante que
-- tampoco ocurrió, o sea que para tapar un hecho falso escribiría un segundo
-- hecho falso. El precedente correcto es la 118 y sobre todo la **119**, que
-- borró una Entrada huérfana de 8.000 kg de Sulcamag por exactamente este
-- motivo: el asiento no corresponde a ningún hecho.
--
-- QUÉ **NO** SE TOCA, a propósito:
--   * `rondas_excepciones` y `rondas_inventario_alcance` (1 fila cada una).
--     La ronda de agosto SÍ ocurrió, está `cerrada`, y su informe está
--     congelado por el contrato R-10. Borrar la excepción dejaría al informe
--     emitido citando una fila inexistente. La historia de la ronda se
--     conserva; lo que se retira es el stock que nunca existió.
--   * `productos.activo`, que ya es `false` desde antes.
--   * `productos.precio_unitario` (4.360,00). Es precio de catálogo, no
--     saldo. Dejarlo no afecta ninguna valoración: con `cantidad_actual = 0`
--     el producto vale 0 en cualquier consumidor.
--
-- CONSECUENCIA VISIBLE QUE GERENCIA VA A NOTAR, y se avisa igual que la 119
-- avisó la suya: el total de Entradas del tablero de Inventario baja
-- **$654.000** al dejar de contar esta prueba. Es la dirección correcta.
-- P&G y Flujo de Caja NO se tocan: nada en `src/utils/`,
-- `src/components/finanzas/` ni `src/components/produccion/` lee
-- `movimientos_inventario`, y este producto no tiene ninguna fila en
-- `compras` ni en `fin_gastos`.
--
-- FILAS AFECTADAS: 1 DELETE en `movimientos_inventario`, 1 UPDATE en
-- `productos`. Nada más.

BEGIN;

DO $$
DECLARE
  v_producto uuid := 'a8aa8dcd-651f-46ce-ab50-803b171aa866';
  v_movimiento uuid := '840899f6-5ad8-45a0-81fb-47fecea1a5f1';
  v_n integer;
  v_cantidad numeric;
BEGIN
  -- 0.1 El producto existe y se llama lo que creemos.
  SELECT count(*) INTO v_n FROM productos
   WHERE id = v_producto AND nombre = '15-15-15';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Pre 0.1: se esperaba 1 producto 15-15-15 con ese id, hay %', v_n;
  END IF;

  -- 0.2 El saldo es exactamente el de la prueba.
  SELECT cantidad_actual INTO v_cantidad FROM productos WHERE id = v_producto;
  IF v_cantidad <> 150.00 THEN
    RAISE EXCEPTION 'Pre 0.2: cantidad_actual esperada 150.00, encontrada %', v_cantidad;
  END IF;

  -- 0.3 LA GUARDA QUE IMPORTA: el producto sigue sin historia real.
  -- Si alguien compró o aplicó 15-15-15 entre la revisión y la aplicación,
  -- esta migración ya no describe la realidad y no debe correr.
  SELECT (SELECT count(*) FROM compras WHERE producto_id = v_producto)
       + (SELECT count(*) FROM aplicaciones_productos WHERE producto_id = v_producto)
       + (SELECT count(*) FROM movimientos_diarios_productos WHERE producto_id = v_producto)
       + (SELECT count(*) FROM verificaciones_detalle WHERE producto_id = v_producto)
    INTO v_n;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Pre 0.3: el producto tiene % filas de historia real (compras/aplicaciones/movimientos diarios/verificaciones). NO es una prueba aislada: abortar y re-revisar', v_n;
  END IF;

  -- 0.4 Hay exactamente un movimiento de inventario y es el de la prueba.
  SELECT count(*) INTO v_n FROM movimientos_inventario WHERE producto_id = v_producto;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Pre 0.4: se esperaba 1 movimiento_inventario, hay %', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM movimientos_inventario
   WHERE id = v_movimiento AND producto_id = v_producto
     AND tipo_movimiento = 'Entrada' AND cantidad = 150.00
     AND saldo_anterior = 0.00 AND saldo_nuevo = 150.00;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Pre 0.5: el movimiento % no tiene la forma esperada (Entrada 150,00 de 0 a 150)', v_movimiento;
  END IF;
END $$;

-- 1. Respaldo en `respaldos`, NUNCA en `public` (precedente 081: una tabla
--    de respaldo en `public` hereda el GRANT por defecto a `anon`).
--    Es el único registro de lo que se borra: `movimientos_inventario` no
--    está trazada por `globalgap_correcciones` (113 cubre `aplicaciones*` y
--    `movimientos_diarios*`), y una migración corre con `auth.uid()` NULL,
--    donde ese trigger retorna temprano de todos modos.
CREATE TABLE respaldos.backup_150_15_15_15_prueba AS
SELECT m.*, p.cantidad_actual AS producto_cantidad_actual_antes
  FROM movimientos_inventario m
  JOIN productos p ON p.id = m.producto_id
 WHERE m.producto_id = 'a8aa8dcd-651f-46ce-ab50-803b171aa866';

REVOKE ALL ON respaldos.backup_150_15_15_15_prueba FROM PUBLIC, anon, authenticated;
ALTER TABLE respaldos.backup_150_15_15_15_prueba ENABLE ROW LEVEL SECURITY;

-- 2. Borrar el asiento que no corresponde a ningún hecho.
DELETE FROM movimientos_inventario
 WHERE id = '840899f6-5ad8-45a0-81fb-47fecea1a5f1';

-- 3. Dejar el saldo en la existencia física real: cero.
UPDATE productos
   SET cantidad_actual = 0
 WHERE id = 'a8aa8dcd-651f-46ce-ab50-803b171aa866';

DO $$
DECLARE
  v_producto uuid := 'a8aa8dcd-651f-46ce-ab50-803b171aa866';
  v_n integer;
  v_cantidad numeric;
BEGIN
  -- 4.1 El respaldo guardó la fila.
  SELECT count(*) INTO v_n FROM respaldos.backup_150_15_15_15_prueba;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Post 4.1: el respaldo tiene % filas, se esperaba 1', v_n;
  END IF;

  -- 4.2 El movimiento ya no está.
  SELECT count(*) INTO v_n FROM movimientos_inventario WHERE producto_id = v_producto;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Post 4.2: quedan % movimientos de 15-15-15', v_n;
  END IF;

  -- 4.3 El saldo es cero.
  SELECT cantidad_actual INTO v_cantidad FROM productos WHERE id = v_producto;
  IF v_cantidad <> 0 THEN
    RAISE EXCEPTION 'Post 4.3: cantidad_actual quedó en %, se esperaba 0', v_cantidad;
  END IF;

  -- 4.4 La historia de la ronda sigue intacta: NO se tocó.
  SELECT (SELECT count(*) FROM rondas_excepciones WHERE producto_id = v_producto)
       + (SELECT count(*) FROM rondas_inventario_alcance WHERE producto_id = v_producto)
    INTO v_n;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Post 4.4: la historia de la ronda cambió (esperadas 2 filas, hay %). Esta migración no debe tocarla', v_n;
  END IF;

  -- 4.5 Ningún otro producto quedó con saldo negativo.
  SELECT count(*) INTO v_n FROM productos WHERE cantidad_actual < 0;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Post 4.5: hay % productos con saldo negativo', v_n;
  END IF;

  RAISE NOTICE '150 OK: 15-15-15 queda en 0,00 kg, 1 movimiento borrado, respaldo en respaldos.backup_150_15_15_15_prueba';
END $$;

COMMIT;

-- ROLLBACK EJECUTABLE (mientras exista el respaldo):
--
-- BEGIN;
--   INSERT INTO movimientos_inventario
--     (id, fecha_movimiento, producto_id, tipo_movimiento, cantidad, unidad,
--      lote_aplicacion, aplicacion_id, factura, saldo_anterior, saldo_nuevo,
--      valor_movimiento, responsable, observaciones, provisional, created_at, notas)
--   SELECT id, fecha_movimiento, producto_id, tipo_movimiento, cantidad, unidad,
--          lote_aplicacion, aplicacion_id, factura, saldo_anterior, saldo_nuevo,
--          valor_movimiento, responsable, observaciones, provisional, created_at, notas
--     FROM respaldos.backup_150_15_15_15_prueba;
--   UPDATE productos
--      SET cantidad_actual = (SELECT producto_cantidad_actual_antes
--                               FROM respaldos.backup_150_15_15_15_prueba LIMIT 1)
--    WHERE id = 'a8aa8dcd-651f-46ce-ab50-803b171aa866';
-- COMMIT;
