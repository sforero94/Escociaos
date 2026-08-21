-- =============================================================================
-- 108_ganado_revertir_duplicado_carga_inicial.sql
--
-- *** ARCHIVO DE REGISTRO — NO APLICAR. ***
--
-- Esta migración YA CORRIÓ en producción el 2026-08-17 (ledger
-- `supabase_migrations.schema_migrations`, versión `20260817152442`, nombre
-- `ganado_revertir_duplicado_carga_inicial`) ANTES de que existiera su archivo.
-- El cuerpo de abajo se recuperó del ledger el 2026-08-21 y se guarda acá
-- verbatim, mismo criterio que 067 y 079. Volver a correrlo ABORTA en la
-- primera guarda (Bosque ya no tiene 38 cabezas, tiene 19), que es
-- exactamente lo que debe pasar.
--
-- EL NÚMERO 108 ES SOLO EL SIGUIENTE SLOT LIBRE. Cronológicamente esta
-- migración va entre la 097 (`20260817151658`, ocho minutos antes) y la 098
-- (`20260817213728`, esa misma tarde) — corrió antes de que la 099
-- reorganizara las fincas y renombrara potreros.
--
-- QUÉ ARREGLÓ. El 2026-08-15 se usó "Cargar inventario inicial" (el flujo de
-- `InventarioInicialDialog.tsx`) sobre cabezas que YA habían entrado al
-- inventario por una compra registrada en Finanzas y confirmada como
-- movimiento. Resultado: 43 cabezas contadas dos veces, repartidas en tres
-- potreros. La carga inicial suma, no reemplaza — está documentado en
-- CLAUDE.md ("the load sums, not replaces") y el diálogo avisa cuando la
-- finca ya tiene cabezas, pero el aviso no alcanzó.
--
--   Bosque             38 -> 19   (-19 toros)
--   Mochuelos Repele   22 -> 11   (-11 novillos)
--   Quebradas          26 -> 13   (-13 toros)
--
-- CÓMO lo arregló, y por qué así: **no borra las filas malas — inserta tres
-- movimientos `ajuste` compensatorios.** `gan_movimientos` es un log de
-- eventos: borrar el ajuste original haría desaparecer la evidencia de que
-- la doble carga ocurrió, y el inventario es una foto derivada de ese log
-- (el trigger `fn_aplicar_movimiento_ganado` de 044/045 la recalcula al
-- insertar un movimiento confirmado). Con la compensación sobreviven las dos
-- cosas: el error y su reversa. Es el mismo criterio que 080/099, que dejan
-- respaldo en vez de borrar en silencio.
--
-- La `fecha` se toma en hora **local de Bogotá**, no en UTC — ver la sección
-- «"Hoy" siempre se toma en hora LOCAL» de CLAUDE.md.
--
-- GUARDAS (todas `RAISE EXCEPTION`, abortan la transacción entera):
--   - Los 3 potreros existen.
--   - Cada uno tiene EXACTAMENTE 38 / 22 / 26 cabezas antes de tocar nada.
--   - Cada uno queda EXACTAMENTE en 19 / 11 / 13 después.
--   - Siguen existiendo exactamente 3 compras confirmadas ligadas a
--     `fin_transacciones_ganado` — o sea, la reversa no se comió la traza de
--     la compra, que es la que debía sobrevivir.
--   - Invariante global: `SUM(gan_inventario)` vuelve a cuadrar contra
--     `SUM(deltas de movimientos confirmados)`.
--
-- Verificado 2026-08-21 contra producción: Bosque 19, Mochuelos Repele 11,
-- Quebradas 13. La reversa se sostuvo.
-- =============================================================================

DO $mig$
DECLARE
  v_bosque    UUID;
  v_mochuelos UUID;
  v_quebradas UUID;
  v_hoy       DATE := (NOW() AT TIME ZONE 'America/Bogota')::DATE;
  v_nota      TEXT;
  v_cab       INTEGER;
BEGIN
  SELECT id INTO v_bosque    FROM gan_potreros WHERE nombre = 'Bosque';
  SELECT id INTO v_mochuelos FROM gan_potreros WHERE nombre = 'Mochuelos Repele';
  SELECT id INTO v_quebradas FROM gan_potreros WHERE nombre = 'Quebradas';

  IF v_bosque IS NULL OR v_mochuelos IS NULL OR v_quebradas IS NULL THEN
    RAISE EXCEPTION 'Falta alguno de los 3 potreros';
  END IF;

  SELECT novillos + toros INTO v_cab FROM gan_inventario WHERE potrero_id = v_bosque;
  IF v_cab IS DISTINCT FROM 38 THEN
    RAISE EXCEPTION 'Bosque tiene % cabezas, se esperaban 38 - no se aplica', v_cab;
  END IF;
  SELECT novillos + toros INTO v_cab FROM gan_inventario WHERE potrero_id = v_mochuelos;
  IF v_cab IS DISTINCT FROM 22 THEN
    RAISE EXCEPTION 'Mochuelos Repele tiene % cabezas, se esperaban 22 - no se aplica', v_cab;
  END IF;
  SELECT novillos + toros INTO v_cab FROM gan_inventario WHERE potrero_id = v_quebradas;
  IF v_cab IS DISTINCT FROM 26 THEN
    RAISE EXCEPTION 'Quebradas tiene % cabezas, se esperaban 26 - no se aplica', v_cab;
  END IF;

  v_nota := 'Correccion: la carga de inventario del 15-ago-2026 (Emiliano) duplico cabezas que ya habian entrado por la compra registrada en finanzas. Se revierte la linea del ajuste; sobrevive la traza de la compra.';

  INSERT INTO gan_movimientos (tipo, estado, fecha, potrero_destino_id, novillos_delta, toros_delta, notas)
  VALUES ('ajuste', 'confirmado', v_hoy, v_bosque, 0, -19, v_nota);

  INSERT INTO gan_movimientos (tipo, estado, fecha, potrero_destino_id, novillos_delta, toros_delta, notas)
  VALUES ('ajuste', 'confirmado', v_hoy, v_mochuelos, -11, 0, v_nota);

  INSERT INTO gan_movimientos (tipo, estado, fecha, potrero_destino_id, novillos_delta, toros_delta, notas)
  VALUES ('ajuste', 'confirmado', v_hoy, v_quebradas, 0, -13, v_nota);

  SELECT novillos + toros INTO v_cab FROM gan_inventario WHERE potrero_id = v_bosque;
  IF v_cab <> 19 THEN RAISE EXCEPTION 'Bosque quedo en % y debia quedar en 19', v_cab; END IF;
  SELECT novillos + toros INTO v_cab FROM gan_inventario WHERE potrero_id = v_mochuelos;
  IF v_cab <> 11 THEN RAISE EXCEPTION 'Mochuelos Repele quedo en % y debia quedar en 11', v_cab; END IF;
  SELECT novillos + toros INTO v_cab FROM gan_inventario WHERE potrero_id = v_quebradas;
  IF v_cab <> 13 THEN RAISE EXCEPTION 'Quebradas quedo en % y debia quedar en 13', v_cab; END IF;

  SELECT COUNT(*) INTO v_cab
  FROM gan_movimientos
  WHERE tipo = 'compra' AND estado = 'confirmado' AND transaccion_ganado_id IS NOT NULL;
  IF v_cab <> 3 THEN
    RAISE EXCEPTION 'Se esperaban 3 compras confirmadas ligadas a finanzas, hay %', v_cab;
  END IF;

  IF (SELECT COALESCE(SUM(novillos + toros), 0) FROM gan_inventario)
     <> (SELECT COALESCE(SUM(novillos_delta + toros_delta), 0) FROM gan_movimientos WHERE estado = 'confirmado') THEN
    RAISE EXCEPTION 'El inventario dejo de cuadrar contra la suma de movimientos confirmados';
  END IF;
END $mig$;
