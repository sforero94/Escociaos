-- 168_ajuste_nutrifeed_drench_septiembre.sql
--
-- ESCO-129. Ajuste de inventario de +0,6 kg de «Nutrifeed menor» para que la
-- aplicacion «Drench Septiembre» se pueda cerrar.
--
-- EL PROBLEMA. `fn_cerrar_aplicacion` (106) valida TODOS los productos antes de
-- escribir nada y aborta el cierre entero si alguno quedaria en negativo. El
-- consumo anotado de Nutrifeed menor en el Drench suma 59,60 kg (17 movimientos
-- diarios, 2026-09-01 -> 2026-09-22) y `productos.cantidad_actual` es 59,00 kg.
-- La aplicacion lleva mas de 3 semanas «En ejecucion» y, mientras no cierre, no
-- existe el registro GlobalGAP del drench de septiembre.
--
-- DE DONDE SALE LA DIFERENCIA. El consumo anotado NO es una medicion: todas las
-- filas son exactamente 0,1 kg por caneca (40 canecas -> 4, 28 -> 2,8, ...). El
-- saldo de 59,00 no se mueve desde marzo (unica fila de `movimientos_inventario`
-- del producto: la Salida por Aplicacion del 2026-03-11). Los dos 2,8 del 18-sep
-- NO son un duplicado: son dos lotes distintos (Piedra Paula y Salto de
-- Tequendama). La diferencia de 0,6 kg (1 %) es redondeo de dosis contra bultos.
--
-- DECISION DEL DUENO (Santiago, 2026-09-25): registrar un «Ajuste» de +0,6 kg en
-- el libro de movimientos, en vez de editar o recrear movimientos diarios que
-- son trazabilidad GlobalGAP. «Es una cantidad marginal.» Mismo patron que los
-- 15 Ajustes que ya existen (cantidad positiva, saldo_anterior -> saldo_nuevo).
-- Se deja EXPLICITO que es un ajuste de cuadre, no un conteo fisico -- la 119
-- refuto inventar existencias en silencio; este no es silencioso, lleva autor,
-- motivo y respaldo.
--
-- EFECTO: `productos.cantidad_actual` 59,00 -> 59,60. Al cerrar la aplicacion,
-- `fn_cerrar_aplicacion` descuenta los 59,60 y el producto queda en 0.
-- `movimientos_diarios*` NO se tocan. P&G y Flujo de Caja no se tocan (no leen
-- `movimientos_inventario`).
--
-- Filas de dominio afectadas: 1 INSERT en `movimientos_inventario`, 1 UPDATE en
-- `productos`. `set_updated_by_productos` (112) deja `updated_by` intacto porque
-- `auth.uid()` es NULL en una migracion.
-- NO trae BEGIN;/COMMIT; -- `apply_migration` ya envuelve en una transaccion.

-- ---------------------------------------------------------------------------
-- 0. Respaldo (patron 081: esquema `respaldos`, jamas `public`)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS respaldos.backup_168_nutrifeed_producto AS
SELECT * FROM public.productos
WHERE id = '6eba8583-1b34-4ba4-baa9-ae3cdda7e2c9';

ALTER TABLE respaldos.backup_168_nutrifeed_producto ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON respaldos.backup_168_nutrifeed_producto FROM anon, authenticated, PUBLIC;

-- ---------------------------------------------------------------------------
-- 1. Pre-condiciones -- abortan la transaccion entera si el estado cambio
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_prod RECORD;
  v_app RECORD;
  v_consumo numeric;
  v_ajustes_previos int;
  v_backup int;
BEGIN
  SELECT nombre, cantidad_actual, unidad_medida INTO v_prod
    FROM public.productos WHERE id = '6eba8583-1b34-4ba4-baa9-ae3cdda7e2c9';
  IF v_prod IS NULL THEN
    RAISE EXCEPTION '168: el producto objetivo no existe';
  END IF;
  IF v_prod.nombre IS DISTINCT FROM 'Nutrifeed menor' THEN
    RAISE EXCEPTION '168: el producto no es Nutrifeed menor (es %)', v_prod.nombre;
  END IF;
  IF v_prod.unidad_medida::text IS DISTINCT FROM 'Kilos' THEN
    RAISE EXCEPTION '168: la unidad no es Kilos (es %)', v_prod.unidad_medida;
  END IF;
  IF v_prod.cantidad_actual IS DISTINCT FROM 59.00 THEN
    RAISE EXCEPTION '168: cantidad_actual ya no es 59,00 (es %) -- alguien movio el stock', v_prod.cantidad_actual;
  END IF;

  SELECT id, nombre_aplicacion, estado INTO v_app
    FROM public.aplicaciones WHERE id = 'db7dad46-3c6b-429d-8105-917c86d3b14e';
  IF v_app IS NULL OR v_app.nombre_aplicacion IS DISTINCT FROM 'Drench Septiembre' THEN
    RAISE EXCEPTION '168: la aplicacion Drench Septiembre no esta donde se diagnostico';
  END IF;
  IF v_app.estado::text = 'Cerrada' THEN
    RAISE EXCEPTION '168: Drench Septiembre ya esta Cerrada -- el ajuste ya no hace falta';
  END IF;

  -- El consumo anotado tiene que seguir siendo exactamente 59,60 kg
  SELECT COALESCE(sum(mdp.cantidad_utilizada), 0) INTO v_consumo
    FROM public.movimientos_diarios_productos mdp
    JOIN public.movimientos_diarios md ON md.id = mdp.movimiento_diario_id
   WHERE md.aplicacion_id = 'db7dad46-3c6b-429d-8105-917c86d3b14e'
     AND mdp.producto_id  = '6eba8583-1b34-4ba4-baa9-ae3cdda7e2c9';
  IF v_consumo IS DISTINCT FROM 59.60 THEN
    RAISE EXCEPTION '168: el consumo anotado ya no es 59,60 (es %) -- recalcular el ajuste', v_consumo;
  END IF;

  -- Idempotencia: no hay un ajuste de este mismo motivo ya escrito
  SELECT count(*) INTO v_ajustes_previos
    FROM public.movimientos_inventario
   WHERE producto_id = '6eba8583-1b34-4ba4-baa9-ae3cdda7e2c9'
     AND tipo_movimiento = 'Ajuste'
     AND observaciones LIKE '%ESCO-129%';
  IF v_ajustes_previos <> 0 THEN
    RAISE EXCEPTION '168: ya existe un ajuste ESCO-129 para este producto';
  END IF;

  SELECT count(*) INTO v_backup FROM respaldos.backup_168_nutrifeed_producto;
  IF v_backup <> 1 THEN
    RAISE EXCEPTION '168: el respaldo tiene % filas, se esperaba 1', v_backup;
  END IF;

  RAISE NOTICE '168: pre-condiciones OK -- stock 59,00, consumo 59,60, Drench en %', v_app.estado;
END $$;

-- ---------------------------------------------------------------------------
-- 2. El ajuste -- una fila en el libro + el saldo del producto
-- ---------------------------------------------------------------------------
INSERT INTO public.movimientos_inventario
  (fecha_movimiento, producto_id, tipo_movimiento, cantidad, unidad,
   saldo_anterior, saldo_nuevo, valor_movimiento, responsable, observaciones,
   provisional)
SELECT DATE '2026-09-25', p.id, 'Ajuste', 0.60, 'Kilos',
       59.00, 59.60, round(0.60 * COALESCE(p.precio_unitario, 0)),
       'sforero94@gmail.com',
       'Ajuste de cuadre ESCO-129 (migracion 168), decidido por Santiago el 2026-09-25: '
       || 'el consumo anotado del Drench Septiembre (59,60 kg, 0,1 kg por caneca) supera '
       || 'el saldo (59,00 kg) por 0,6 kg. No es un conteo fisico.',
       false
  FROM public.productos p
 WHERE p.id = '6eba8583-1b34-4ba4-baa9-ae3cdda7e2c9';

UPDATE public.productos
   SET cantidad_actual = 59.60
 WHERE id = '6eba8583-1b34-4ba4-baa9-ae3cdda7e2c9'
   AND cantidad_actual = 59.00;

-- ---------------------------------------------------------------------------
-- 3. Post-condiciones
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_stock numeric;
  v_ajustes int;
  v_consumo numeric;
BEGIN
  SELECT cantidad_actual INTO v_stock
    FROM public.productos WHERE id = '6eba8583-1b34-4ba4-baa9-ae3cdda7e2c9';
  IF v_stock IS DISTINCT FROM 59.60 THEN
    RAISE EXCEPTION '168 post: cantidad_actual quedo en %', v_stock;
  END IF;

  SELECT count(*) INTO v_ajustes
    FROM public.movimientos_inventario
   WHERE producto_id = '6eba8583-1b34-4ba4-baa9-ae3cdda7e2c9'
     AND tipo_movimiento = 'Ajuste'
     AND observaciones LIKE '%ESCO-129%'
     AND cantidad = 0.60 AND saldo_anterior = 59.00 AND saldo_nuevo = 59.60;
  IF v_ajustes <> 1 THEN
    RAISE EXCEPTION '168 post: se esperaba 1 ajuste ESCO-129, hay %', v_ajustes;
  END IF;

  -- LA PRUEBA QUE IMPORTA: el cierre ya no dejaria el producto en negativo
  SELECT COALESCE(sum(mdp.cantidad_utilizada), 0) INTO v_consumo
    FROM public.movimientos_diarios_productos mdp
    JOIN public.movimientos_diarios md ON md.id = mdp.movimiento_diario_id
   WHERE md.aplicacion_id = 'db7dad46-3c6b-429d-8105-917c86d3b14e'
     AND mdp.producto_id  = '6eba8583-1b34-4ba4-baa9-ae3cdda7e2c9';
  IF v_stock - v_consumo < 0 THEN
    RAISE EXCEPTION '168 post: el cierre seguiria en negativo (% - %)', v_stock, v_consumo;
  END IF;

  RAISE NOTICE '168 OK: Nutrifeed menor 59,00 -> 59,60; saldo al cierre = %', v_stock - v_consumo;
END $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (ejecutable, no se corre automaticamente; solo si la aplicacion
-- todavia NO se cerro -- despues del cierre el saldo ya es otro)
-- ---------------------------------------------------------------------------
-- DELETE FROM public.movimientos_inventario
--  WHERE producto_id = '6eba8583-1b34-4ba4-baa9-ae3cdda7e2c9'
--    AND tipo_movimiento = 'Ajuste' AND observaciones LIKE '%ESCO-129%';
-- UPDATE public.productos p
--    SET cantidad_actual = b.cantidad_actual
--   FROM respaldos.backup_168_nutrifeed_producto b
--  WHERE p.id = b.id;
