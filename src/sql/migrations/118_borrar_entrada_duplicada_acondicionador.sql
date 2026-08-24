-- Migración 118: borra la Entrada fantasma de 8 kg de Acondicionador sys.
-- Cierra el hallazgo #43. GO DEL DUEÑO: 2026-08-24.
--
-- ---------------------------------------------------------------------------
-- QUÉ PASÓ, Y POR QUÉ EL SALDO NUNCA ESTUVO MAL
-- ---------------------------------------------------------------------------
-- La compra de la factura 65028 (Agromax, 8 bultos de 1 kg, $315.968) quedó
-- registrada DOS veces en `movimientos_inventario`, el 2026-05-07, con quince
-- minutos de diferencia:
--
--   4d07e09b-98cf-4535-ba2f-8d9402c215e7  creada 16:30:59  saldo 0,69 -> 8,69
--   bb6c4204-0b80-4d1d-a51a-6b2ff398fb11  creada 16:46:17  saldo 0,69 -> 8,69
--
-- **Las dos registran la MISMA transición de saldo.** Ése es el dato que decide
-- todo: la segunda no sumó stock, sólo repitió el asiento. Y el movimiento
-- siguiente (2026-05-15) arranca de `saldo_anterior = 8,69`, o sea que el
-- inventario subió 8 kg, no 16.
--
-- Consecuencia: **ninguna cifra de stock que alguien haya visto está mal**. Lo
-- que miente es el libro, y sólo si se lo lee sumando cantidades en vez de
-- siguiendo la cadena de saldos. `productos.cantidad_actual` no se toca.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ BORRAR Y NO COMPENSAR
-- ---------------------------------------------------------------------------
-- La migración 108 estableció que `gan_movimientos` es un log de eventos y que
-- un error real se compensa en vez de borrarse, para que la evidencia del error
-- sobreviva. **Acá no aplica**: esta fila no registra un evento que ocurrió y
-- salió mal. Registra un evento que NUNCA OCURRIÓ -- una doble pulsación. No
-- hay historia que preservar dentro del libro, y un asiento compensatorio
-- dejaría el libro con tres filas para una sola entrega.
--
-- El precedente correcto es el de las migraciones 075 y 076, que sí borran
-- duplicados exactos -- y que dejan el respaldo en la base para que la
-- evidencia sobreviva FUERA del libro, que es donde corresponde.
--
-- SE BORRA LA SEGUNDA (16:46), no la primera. Son idénticas en todos los campos
-- salvo `id` y `created_at`, así que la elección es arbitraria en cuanto al
-- dato; se conserva la primera porque es la que el usuario quiso hacer.
--
-- RESPALDO en el esquema `respaldos`, NUNCA en `public` (migración 081).
--
-- FILAS AFECTADAS: 1.

DO $$
DECLARE
  v_pareja integer;
  v_saldo_producto numeric;
  v_total integer;
BEGIN
  -- 1.1 Las dos filas siguen ahi y siguen siendo identicas en todo lo que
  --     importa. Si alguna cambio, la premisa de "duplicado exacto" se cayo.
  SELECT count(*) INTO v_pareja
  FROM public.movimientos_inventario
  WHERE id IN ('4d07e09b-98cf-4535-ba2f-8d9402c215e7'::uuid,
               'bb6c4204-0b80-4d1d-a51a-6b2ff398fb11'::uuid)
    AND tipo_movimiento::text = 'Entrada'
    AND cantidad = 8.00
    AND factura = '65028'
    AND saldo_anterior = 0.69
    AND saldo_nuevo = 8.69;

  IF v_pareja <> 2 THEN
    RAISE EXCEPTION 'PRE 1.1: se esperaban las 2 filas duplicadas con su forma exacta y hay %. Alguien las toco, o esta migracion ya se aplico.', v_pareja;
  END IF;

  -- 1.2 El saldo del producto NO se toca, asi que se captura para probarlo.
  SELECT p.cantidad_actual INTO v_saldo_producto
  FROM public.productos p
  WHERE p.id = (SELECT producto_id FROM public.movimientos_inventario
                 WHERE id = '4d07e09b-98cf-4535-ba2f-8d9402c215e7'::uuid);
  PERFORM set_config('escociaos.mig118_saldo', v_saldo_producto::text, false);

  SELECT count(*) INTO v_total FROM public.movimientos_inventario;
  PERFORM set_config('escociaos.mig118_total', v_total::text, false);
END $$;

CREATE TABLE respaldos.backup_118_entrada_duplicada AS
SELECT * FROM public.movimientos_inventario
WHERE id = 'bb6c4204-0b80-4d1d-a51a-6b2ff398fb11'::uuid;

ALTER TABLE respaldos.backup_118_entrada_duplicada ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON respaldos.backup_118_entrada_duplicada FROM anon, authenticated;

COMMENT ON TABLE respaldos.backup_118_entrada_duplicada IS
  'La fila de movimientos_inventario que la migracion 118 borro: la segunda Entrada identica de 8 kg de Acondicionador sys (factura 65028, 2026-05-07, creada 16:46). Unica copia; el ROLLBACK del pie de la 118 la reinserta desde aqui.';

DELETE FROM public.movimientos_inventario
WHERE id = 'bb6c4204-0b80-4d1d-a51a-6b2ff398fb11'::uuid;

DO $$
DECLARE
  v_quedan integer;
  v_respaldo integer;
  v_saldo_ahora numeric;
  v_saldo_antes text;
  v_total_post integer;
  v_total_pre text;
BEGIN
  -- 4.1 Queda exactamente una de las dos, y es la primera.
  SELECT count(*) INTO v_quedan
  FROM public.movimientos_inventario
  WHERE id IN ('4d07e09b-98cf-4535-ba2f-8d9402c215e7'::uuid,
               'bb6c4204-0b80-4d1d-a51a-6b2ff398fb11'::uuid);
  IF v_quedan <> 1 THEN
    RAISE EXCEPTION 'POST 4.1: quedaron % de las 2 filas en vez de 1.', v_quedan;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.movimientos_inventario WHERE id = '4d07e09b-98cf-4535-ba2f-8d9402c215e7'::uuid) THEN
    RAISE EXCEPTION 'POST 4.1b: se borro la fila equivocada. La que debia sobrevivir es la de las 16:30.';
  END IF;

  -- 4.2 El respaldo tiene la fila borrada.
  SELECT count(*) INTO v_respaldo FROM respaldos.backup_118_entrada_duplicada;
  IF v_respaldo <> 1 THEN
    RAISE EXCEPTION 'POST 4.2: el respaldo tiene % filas en vez de 1.', v_respaldo;
  END IF;

  -- 4.3 EL SALDO NO SE MOVIO. Es la comprobacion central: esta migracion
  --     corrige el libro, no el inventario.
  v_saldo_antes := nullif(current_setting('escociaos.mig118_saldo', true), '');
  SELECT p.cantidad_actual INTO v_saldo_ahora
  FROM public.productos p
  WHERE p.id = (SELECT producto_id FROM public.movimientos_inventario WHERE id = '4d07e09b-98cf-4535-ba2f-8d9402c215e7'::uuid);
  IF v_saldo_antes IS NULL THEN
    RAISE WARNING 'POST 4.3: no se pudo leer el saldo previo; la comprobacion NO se ejecuto.';
  ELSIF v_saldo_ahora <> v_saldo_antes::numeric THEN
    RAISE EXCEPTION 'POST 4.3: el saldo del producto cambio de % a %. Esta migracion NO debe tocar el inventario.', v_saldo_antes, v_saldo_ahora;
  END IF;

  -- 4.4 Se borro exactamente una fila del libro, ni una mas.
  v_total_pre := nullif(current_setting('escociaos.mig118_total', true), '');
  IF v_total_pre IS NOT NULL THEN
    SELECT count(*) INTO v_total_post FROM public.movimientos_inventario;
    IF v_total_post <> v_total_pre::integer - 1 THEN
      RAISE EXCEPTION 'POST 4.4: movimientos_inventario paso de % a %, se esperaba exactamente una fila menos.', v_total_pre, v_total_post;
    END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (ejecutable):
--   INSERT INTO public.movimientos_inventario
--   SELECT * FROM respaldos.backup_118_entrada_duplicada;
-- ---------------------------------------------------------------------------
