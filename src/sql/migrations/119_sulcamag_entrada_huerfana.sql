-- Migración 119: borra la Entrada huérfana de 8.000 kg de Sulcamag.
-- Cierra el hallazgo #29. GO DEL DUEÑO: 2026-08-24.
--
-- ############################################################################
-- ## LEER ESTO ANTES QUE NADA: VA EN LA DIRECCIÓN OPUESTA AL REMEDIO QUE     ##
-- ## SE REFUTÓ EL 2026-08-10.                                                ##
-- ############################################################################
--
-- Aquel remedio proponía subir `productos.cantidad_actual` de Sulcamag para que
-- cuadrara con su libro. Eso habría **fabricado 8.000 kg de fertilizante
-- inexistente, $5.359.680**, y por eso se mató. Esta migración hace lo
-- contrario: deja el saldo intacto y corrige el LIBRO.
--
-- No confundir una con otra. Si alguien lee "hallazgo #29" y recuerda "hay un
-- refute, no tocar", el refute era contra la otra dirección.
--
-- ---------------------------------------------------------------------------
-- QUÉ PASÓ -- la evidencia es autosuficiente
-- ---------------------------------------------------------------------------
-- La MISMA factura **4379** (Río Claro, 160 bultos de 50 kg, $5.359.680) está
-- registrada dos veces, contra dos productos distintos:
--
--   Sulcamag    1d3e27f6-71a6-4f4b-9b48-26aa4db7642c  creada 2026-07-15 12:27
--               saldo_anterior 16,00 -> saldo_nuevo 8.016,00
--   Silicalmag  751a9e1c-3d6b-4e64-8c95-bc861261dee0  creada 2026-07-24 20:07
--               saldo_anterior  0,00 -> saldo_nuevo 8.000,00
--
-- Y hoy, en producción:
--
--   Silicalmag  cantidad_actual = 8.000 kg  ...  libro = 8.000 kg   COHERENTE
--   Sulcamag    cantidad_actual =    16 kg  ...  libro = 8.000 kg   NO
--
-- La lectura es inequívoca: alguien cargó la compra contra el producto
-- equivocado, se dio cuenta nueve días después, la volvió a cargar contra
-- Silicalmag, **devolvió el saldo de Sulcamag a 16 kg** -- exactamente el
-- `saldo_anterior` que la propia fila mala registra -- y dejó la fila del libro.
--
-- POR ESO NO HACE FALTA UN CONTEO FÍSICO PARA ESTA CORRECCIÓN. Los 16 kg no son
-- una cifra que haya que creerle a nadie: son el saldo que Sulcamag tenía ANTES
-- de la carga equivocada, escrito en la propia fila que se va a borrar, y al que
-- el producto volvió. Borrar un asiento fantasma es correcto tanto si el stock
-- real de Sulcamag son 16 kg como si son 14 -- son dos preguntas distintas. El
-- conteo físico sigue valiendo la pena; esta migración no depende de él, y
-- **tampoco lo sustituye**.
--
-- `productos.cantidad_actual` NO SE TOCA. La post-condición 4.3 lo prueba.
--
-- Se borra en vez de compensar por el mismo motivo que la 118: la fila no
-- registra un evento que salió mal, registra uno que nunca ocurrió contra ese
-- producto. La entrega SÍ existió y está correctamente asentada en Silicalmag.
-- Precedente 075/076; la evidencia sobrevive en `respaldos`.
--
-- FILAS AFECTADAS: 1.

DO $$
DECLARE
  v_fila integer;
  v_silicalmag integer;
  v_saldo numeric;
  v_total integer;
BEGIN
  -- 1.1 La fila huerfana sigue ahi con su forma exacta.
  SELECT count(*) INTO v_fila
  FROM public.movimientos_inventario
  WHERE id = '1d3e27f6-71a6-4f4b-9b48-26aa4db7642c'::uuid
    AND tipo_movimiento::text = 'Entrada'
    AND cantidad = 8000.00
    AND factura = '4379'
    AND saldo_anterior = 16.00
    AND saldo_nuevo = 8016.00;
  IF v_fila <> 1 THEN
    RAISE EXCEPTION 'PRE 1.1: la Entrada huerfana de Sulcamag no tiene la forma esperada (hay %). Alguien la toco, o esta migracion ya se aplico.', v_fila;
  END IF;

  -- 1.2 LA GUARDA QUE MAS IMPORTA: la compra SI existe correctamente asentada
  --     en Silicalmag. Sin esto, borrar la de Sulcamag perderia el unico
  --     registro de una entrega real de $5,36M.
  SELECT count(*) INTO v_silicalmag
  FROM public.movimientos_inventario mi JOIN public.productos p ON p.id = mi.producto_id
  WHERE p.nombre ILIKE 'Silicalmag%'
    AND mi.tipo_movimiento::text = 'Entrada'
    AND mi.cantidad = 8000.00
    AND mi.factura = '4379';
  IF v_silicalmag <> 1 THEN
    RAISE EXCEPTION 'PRE 1.2: no se encontro la Entrada correcta de 8.000 kg factura 4379 en Silicalmag (hay %). ABORTAR: sin ella, borrar la de Sulcamag destruiria el unico registro de la compra.', v_silicalmag;
  END IF;

  -- 1.3 El saldo de Sulcamag es 16 kg, el mismo saldo_anterior de la fila mala.
  --     Es la prueba de que alguien ya revirtio el efecto sobre el inventario.
  SELECT p.cantidad_actual INTO v_saldo
  FROM public.productos p
  WHERE p.id = (SELECT producto_id FROM public.movimientos_inventario WHERE id = '1d3e27f6-71a6-4f4b-9b48-26aa4db7642c'::uuid);
  IF v_saldo <> 16.00 THEN
    RAISE EXCEPTION 'PRE 1.3: el saldo de Sulcamag es % y se esperaba 16,00 -- el mismo saldo_anterior de la fila huerfana. Si cambio, la lectura de que el inventario ya fue revertido no se sostiene. NO seguir.', v_saldo;
  END IF;
  PERFORM set_config('escociaos.mig119_saldo', v_saldo::text, false);

  SELECT count(*) INTO v_total FROM public.movimientos_inventario;
  PERFORM set_config('escociaos.mig119_total', v_total::text, false);
END $$;

CREATE TABLE respaldos.backup_119_sulcamag_huerfana AS
SELECT * FROM public.movimientos_inventario
WHERE id = '1d3e27f6-71a6-4f4b-9b48-26aa4db7642c'::uuid;

ALTER TABLE respaldos.backup_119_sulcamag_huerfana ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON respaldos.backup_119_sulcamag_huerfana FROM anon, authenticated;

COMMENT ON TABLE respaldos.backup_119_sulcamag_huerfana IS
  'La Entrada huerfana de 8.000 kg de Sulcamag (factura 4379) que borro la migracion 119. La compra real esta correctamente asentada en Silicalmag; esta fila era la carga contra el producto equivocado. Unica copia; el ROLLBACK del pie de la 119 la reinserta.';

DELETE FROM public.movimientos_inventario
WHERE id = '1d3e27f6-71a6-4f4b-9b48-26aa4db7642c'::uuid;

DO $$
DECLARE
  v_quedan integer;
  v_respaldo integer;
  v_silicalmag integer;
  v_saldo_ahora numeric;
  v_saldo_antes text;
  v_total_post integer;
  v_total_pre text;
BEGIN
  SELECT count(*) INTO v_quedan FROM public.movimientos_inventario
   WHERE id = '1d3e27f6-71a6-4f4b-9b48-26aa4db7642c'::uuid;
  IF v_quedan <> 0 THEN RAISE EXCEPTION 'POST 4.1: la fila huerfana sigue ahi.'; END IF;

  SELECT count(*) INTO v_respaldo FROM respaldos.backup_119_sulcamag_huerfana;
  IF v_respaldo <> 1 THEN RAISE EXCEPTION 'POST 4.2: el respaldo tiene % filas en vez de 1.', v_respaldo; END IF;

  -- 4.2b La compra sigue asentada en Silicalmag. Se comprueba DESPUES del
  --      borrado, no solo antes: es el registro que debia sobrevivir.
  SELECT count(*) INTO v_silicalmag
  FROM public.movimientos_inventario mi JOIN public.productos p ON p.id = mi.producto_id
  WHERE p.nombre ILIKE 'Silicalmag%' AND mi.tipo_movimiento::text = 'Entrada'
    AND mi.cantidad = 8000.00 AND mi.factura = '4379';
  IF v_silicalmag <> 1 THEN
    RAISE EXCEPTION 'POST 4.2b: la Entrada de Silicalmag ya no esta. La compra de $5,36M se quedo sin registro.';
  END IF;

  -- 4.3 EL SALDO DE SULCAMAG NO SE MOVIO. Es la diferencia entre esta migracion
  --     y el remedio refutado el 2026-08-10.
  v_saldo_antes := nullif(current_setting('escociaos.mig119_saldo', true), '');
  SELECT p.cantidad_actual INTO v_saldo_ahora FROM public.productos p WHERE p.nombre ILIKE 'Sulcamag%';
  IF v_saldo_antes IS NULL THEN
    RAISE WARNING 'POST 4.3: no se pudo leer el saldo previo; la comprobacion NO se ejecuto.';
  ELSIF v_saldo_ahora <> v_saldo_antes::numeric THEN
    RAISE EXCEPTION 'POST 4.3: el saldo de Sulcamag cambio de % a %. Esta migracion NO debe tocar el inventario.', v_saldo_antes, v_saldo_ahora;
  END IF;

  v_total_pre := nullif(current_setting('escociaos.mig119_total', true), '');
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
--   SELECT * FROM respaldos.backup_119_sulcamag_huerfana;
-- ---------------------------------------------------------------------------
