-- Migración 145: corregir la cantidad física de la excepción de la ronda de agosto
--                (3 bultos registrados como 3, cuando el producto se mide en kilos)
--
-- Hallazgo #61 del barrido de mantenimiento, PARTE B. `clase datos`.
-- Aprobada por Santiago en intercambio en vivo el 2026-09-11 sobre la propuesta
-- que ya estaba filada en `Accion recomendada` desde la corrida 2026-08-31-lunes.
-- El `UPDATE`, su ROLLBACK y su conteo de filas son los de esa propuesta, literales.
--
-- QUÉ PASÓ. Uriel dictó «tres bultos de 15-15-15 de 50 kilos». El sistema guardó
-- `cantidad_fisica = 3`. El producto se mide en `Kilos` con `presentacion_kg_l =
-- 50,00`, así que la cifra real es 150. David capturó el movimiento correcto por su
-- cuenta —`movimientos_inventario` `840899f6-…`, Entrada de 150,00— y por eso el
-- inventario nunca estuvo mal. Lo que quedó mal es el REGISTRO DE TRAZABILIDAD: la
-- excepción dice 3 donde la realidad fueron 150, un factor de 50, y es la fila que
-- leería una auditoría para responder «de qué tamaño fue la diferencia».
--
-- POR QUÉ NO SE VIO. Ni la pantalla que confirma Uriel ni el informe de cierre
-- imprimían la unidad. El PR #220 (PARTE A) ya lo arregló y está desplegado, así que
-- esta clase de error vuelve a ser visible. Esta migración repara el dato que aquel
-- defecto dejó escrito.
--
-- LA ARITMÉTICA ES EXACTA, NO UNA ESTIMACIÓN: 3 × 50,00 = 150,00, y 150,00 es
-- literalmente la `cantidad` del movimiento que la propia excepción enlaza en
-- `captura_movimiento_id`. No se infiere la cifra: se toma de la fila enlazada.
--
-- QUÉ **NO** TOCA, y cada exclusión tiene su motivo:
--   · `productos.cantidad_actual` — ya vale 150,00 y es correcto. Subirlo otra vez
--     fabricaría 150 kg de fertilizante inexistente: es exactamente el remedio que se
--     refutó el 2026-08-10 y que la migración 119 dejó documentado.
--   · `teorico_conteo` — se queda en 0. El teórico al momento del conteo era 0 y sigue
--     siendo 0; corregir el físico no reescribe el teórico.
--   · `rondas_reportes` — R-10 congela un informe emitido a propósito. Reescribirlo
--     mataría el contrato de idempotencia del módulo. El informe de agosto conserva su
--     cifra rancia, y eso es el contrato funcionando, no un descuido.
--   · `movimientos_inventario` — la fila de David ya es correcta.
--
-- Filas afectadas: **1**.

-- ---------------------------------------------------------------------------
-- RESPALDO (esquema `respaldos`, nunca `public` -- lección de la 081)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS respaldos.backup_145_excepcion_bultos AS
SELECT * FROM rondas_excepciones
 WHERE id = '1d903165-6aa4-4c5d-8dbf-04067de3cbf2';

ALTER TABLE respaldos.backup_145_excepcion_bultos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON respaldos.backup_145_excepcion_bultos FROM anon, authenticated, PUBLIC;

-- ---------------------------------------------------------------------------
-- PRECONDICIONES
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fisica      NUMERIC;
  v_teorico     NUMERIC;
  v_estado      TEXT;
  v_mov_id      UUID;
  v_mov_cant    NUMERIC;
  v_presenta    NUMERIC;
  v_unidad      TEXT;
  v_stock       NUMERIC;
  v_respaldo    BIGINT;
BEGIN
  SELECT e.cantidad_fisica, e.teorico_conteo, e.estado::text, e.captura_movimiento_id
    INTO v_fisica, v_teorico, v_estado, v_mov_id
    FROM rondas_excepciones e
   WHERE e.id = '1d903165-6aa4-4c5d-8dbf-04067de3cbf2';

  IF NOT FOUND THEN
    RAISE EXCEPTION '145 ABORTADA (pre): no existe la excepción 1d903165-6aa4-4c5d-8dbf-04067de3cbf2.';
  END IF;

  -- El estado exacto que la propuesta filada asumió.
  IF v_estado <> 'resuelta_con_captura' THEN
    RAISE EXCEPTION '145 ABORTADA (pre): la excepción está en estado % y la propuesta asumió resuelta_con_captura. Revisar antes de reintentar.', v_estado;
  END IF;
  IF v_fisica <> 3 THEN
    RAISE EXCEPTION '145 ABORTADA (pre): cantidad_fisica es % y no 3 -- o ya se aplicó esta migración, o alguien la editó. No sobrescribir.', v_fisica;
  END IF;
  IF v_teorico <> 0 THEN
    RAISE EXCEPTION '145 ABORTADA (pre): teorico_conteo es % y la propuesta asumió 0.', v_teorico;
  END IF;

  -- La cifra correcta NO se infiere: sale del movimiento que la excepción enlaza.
  IF v_mov_id IS NULL THEN
    RAISE EXCEPTION '145 ABORTADA (pre): la excepción no enlaza un movimiento de captura -- sin él no hay fuente para los 150.';
  END IF;
  SELECT m.cantidad INTO v_mov_cant FROM movimientos_inventario m WHERE m.id = v_mov_id;
  IF v_mov_cant IS DISTINCT FROM 150.00 THEN
    RAISE EXCEPTION '145 ABORTADA (pre): el movimiento enlazado tiene cantidad % y no 150,00.', v_mov_cant;
  END IF;

  -- Y tiene que cerrar contra la presentación del producto: 3 bultos x 50 kg.
  SELECT p.presentacion_kg_l, p.unidad_medida, p.cantidad_actual
    INTO v_presenta, v_unidad, v_stock
    FROM productos p
    JOIN rondas_excepciones e ON e.producto_id = p.id
   WHERE e.id = '1d903165-6aa4-4c5d-8dbf-04067de3cbf2';
  IF v_presenta IS DISTINCT FROM 50.00 OR v_unidad <> 'Kilos' THEN
    RAISE EXCEPTION '145 ABORTADA (pre): el producto no es Kilos con presentacion 50,00 (es % / %). La aritmética 3 x 50 = 150 ya no se sostiene.', v_unidad, v_presenta;
  END IF;
  IF v_fisica * v_presenta <> v_mov_cant THEN
    RAISE EXCEPTION '145 ABORTADA (pre): % x % no da % -- la conversión de bultos a kilos no cierra.', v_fisica, v_presenta, v_mov_cant;
  END IF;

  -- El inventario real ya está bien y esta migración no lo toca.
  IF v_stock IS DISTINCT FROM 150.00 THEN
    RAISE EXCEPTION '145 ABORTADA (pre): productos.cantidad_actual es % y no 150,00. Esta migración NO ajusta stock, así que un stock distinto significa que el supuesto cambió.', v_stock;
  END IF;

  SELECT count(*) INTO v_respaldo FROM respaldos.backup_145_excepcion_bultos;
  IF v_respaldo <> 1 THEN
    RAISE EXCEPTION '145 ABORTADA (pre): el respaldo tiene % filas y debe tener exactamente 1.', v_respaldo;
  END IF;

  RAISE NOTICE '145 (pre): OK. 3 bultos x 50,00 kg = 150,00, que es la cantidad del movimiento enlazado.';
END $$;

-- ---------------------------------------------------------------------------
-- LA CORRECCIÓN. Literal de la propuesta filada el 2026-08-31.
-- ---------------------------------------------------------------------------
UPDATE rondas_excepciones
   SET cantidad_fisica = 150,
       updated_at = now()
 WHERE id = '1d903165-6aa4-4c5d-8dbf-04067de3cbf2'
   AND cantidad_fisica = 3
   AND estado = 'resuelta_con_captura';

-- ---------------------------------------------------------------------------
-- POSTCONDICIONES
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fisica   NUMERIC;
  v_teorico  NUMERIC;
  v_estado   TEXT;
  v_stock    NUMERIC;
  v_malos    BIGINT;
BEGIN
  SELECT e.cantidad_fisica, e.teorico_conteo, e.estado::text
    INTO v_fisica, v_teorico, v_estado
    FROM rondas_excepciones e
   WHERE e.id = '1d903165-6aa4-4c5d-8dbf-04067de3cbf2';

  IF v_fisica <> 150 THEN
    RAISE EXCEPTION '145 ABORTADA (post): cantidad_fisica quedó en % y no en 150.', v_fisica;
  END IF;
  IF v_teorico <> 0 THEN
    RAISE EXCEPTION '145 ABORTADA (post): teorico_conteo cambió a % -- esta migración no lo toca.', v_teorico;
  END IF;
  IF v_estado <> 'resuelta_con_captura' THEN
    RAISE EXCEPTION '145 ABORTADA (post): el estado cambió a % -- esta migración no lo toca.', v_estado;
  END IF;

  -- El stock real tiene que seguir intacto. Si cambió, esta migración hizo algo
  -- que no debía y hay que abortar antes de confirmar.
  SELECT p.cantidad_actual INTO v_stock
    FROM productos p JOIN rondas_excepciones e ON e.producto_id = p.id
   WHERE e.id = '1d903165-6aa4-4c5d-8dbf-04067de3cbf2';
  IF v_stock IS DISTINCT FROM 150.00 THEN
    RAISE EXCEPTION '145 ABORTADA (post): productos.cantidad_actual cambió a % -- esta migración NO debe tocar stock.', v_stock;
  END IF;

  -- Exactamente una fila de la ronda cambió, y es la nuestra.
  SELECT count(*) INTO v_malos
    FROM rondas_excepciones
   WHERE id <> '1d903165-6aa4-4c5d-8dbf-04067de3cbf2'
     AND updated_at >= now() - interval '1 minute';
  IF v_malos <> 0 THEN
    RAISE EXCEPTION '145 ABORTADA (post): % excepciones ajenas cambiaron en el último minuto.', v_malos;
  END IF;

  RAISE NOTICE '145 (post): OK. La excepción dice 150 Kilos. El stock sigue en 150,00 y el informe de agosto conserva su texto.';
END $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (no ejecutar salvo instrucción explícita del dueño).
--
--   UPDATE rondas_excepciones
--      SET cantidad_fisica = 3, updated_at = now()
--    WHERE id = '1d903165-6aa4-4c5d-8dbf-04067de3cbf2';
--
-- El respaldo `respaldos.backup_145_excepcion_bultos` conserva la fila entera tal
-- como estaba, incluido su `updated_at` original (2026-08-29 00:24:00.679558+00).
-- ---------------------------------------------------------------------------
