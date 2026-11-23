-- =============================================================================
-- 198_evergreen_pro_cantidad_x100.sql
--
-- ESCRITA, SIN APLICAR. ESCO-188 (parte de datos, clase datos, Ruta FDS). Sesion
-- de arreglo de datos con Santiago presente, 2026-11-23.
--
-- Hechos que da Santiago (2026-11-23), confirmados por David:
--   * «Fumigacion floracion» (3c3c353f): Evergreen pro se aplico 17 U en La Vega y
--     15 U en Australia, total 32 U. El sistema guardo 100 veces menos (0,32).
--   * «Fumigacion floracion y monalonion» (efb7d569): tambien x100. Sistema 0,30,
--     real 30 U (David lo confirmo).
--   * Bodega: «Hay 0, no 1. El calculo es correcto.» 62 comprados - 32 - 30 = 0.
--
-- Causa: el producto se mide en 'Unidades' y la dosis se capturo como si fuera otra
-- unidad (factor 100). El PLAN (aplicaciones_productos, ~31,83 y ~30,19) ya es
-- correcto y NO se toca. Lo que esta mal es lo REAL y lo que deriva de el.
--
-- Filas que cambian (todas por id literal, nunca por patron):
--   movimientos_diarios_productos   9 filas, cantidad_utilizada x100
--       3c3c353f: 2ea36692 0,08->8  04bdede7 0,09->9  (La Vega = 17)
--                 9ff90ff5 0,08->8  7c1940e9 0,07->7  (Australia = 15)
--       efb7d569: 9ac4baca 0,08->8  dd88cc22 0,03->3  c86430bd 0,05->5
--                 204edbe3 0,05->5  5d0aa374 0,09->9  (= 30)
--   movimientos_inventario          2 filas (las Salidas por Aplicacion)
--       d49aa171 (3c3c353f): cantidad 0,32->32, saldo_nuevo 61,68->30,
--                valor_movimiento 7.040->704.000
--       3578b2c5 (efb7d569): cantidad 0,30->30, saldo_anterior 61,68->30,
--                saldo_nuevo 61,38->0, valor_movimiento 6.600->660.000
--       Precio: el del cierre, 22.000 por unidad (7.040/0,32 = 6.600/0,30), NO el
--       22.500 actual. Las dos Entradas no se tocan.
--   aplicaciones                    2 filas (los costos del cierre)
--       costo_total_insumos es exactamente SUM(valor_movimiento) de las salidas de
--       la aplicacion (verificado antes de escribir), costo_total = insumos + mano
--       de obra, costo_por_arbol = costo_total / arboles (3.390 y 2.957).
--       3c3c353f: insumos +696.960, total +696.960, por arbol 1.155 -> 1.361
--       efb7d569: insumos +653.400, total +653.400, por arbol 1.215 -> 1.436
--   productos                       1 fila: cantidad_actual 61,38 -> 0
--
-- NO cambian: aplicaciones_productos (el plan), aplicaciones_cierre (no tiene
-- columnas de costo), productos.precio_unitario, costo_total_mano_obra, las Entradas.
-- P&G y Flujo de Caja no leen estas tablas. Ninguna ronda de inventario tiene este
-- producto en su alcance (verificado 2026-11-23).
--
-- Triggers que se disparan y por que no hacen nada inesperado:
--   * trg_globalgap_correccion (113) en movimientos_diarios_productos y aplicaciones:
--     retorna si auth.uid() es NULL (caso de una migracion) -> no deja traza.
--   * update_*_updated_at / set_producto_updated_by: solo sellan la fila.
--   * trigger_sync_tarea_aplicacion y validar_orden_fechas_aplicacion: solo con
--     cambios de fechas o nombre; aqui no cambian.
-- movimientos_inventario no tiene trigger y no esta trazada. El respaldo en
-- `respaldos` (patron 081) es el UNICO registro del estado anterior.
--
-- Sabido y NO corregido: la cadena de saldos no sigue el orden de fecha_movimiento
-- (la salida del 11-12 lee como saldo_anterior el 62 de la Entrada del 11-13). Sigue
-- el orden de created_at, que es como se escribio. Esta migracion conserva ese orden.
--
-- Filas afectadas: 9 + 2 + 2 + 1 = 14 UPDATE. Objetos: 4 tablas de respaldo.
-- ROLLBACK al pie.
-- =============================================================================

-- 0. PRE-CONDICIONES -----------------------------------------------------------
DO $$
DECLARE
  v_n integer;
BEGIN
  -- 0.1 Producto
  SELECT count(*) INTO v_n FROM public.productos
  WHERE id = 'f32931db-cf30-44ff-86a2-54fbeb574106'
    AND nombre = 'Evergreen pro' AND unidad_medida = 'Unidades'
    AND cantidad_actual = 61.38 AND precio_unitario = 22500;
  IF v_n <> 1 THEN RAISE EXCEPTION '198 pre 0.1: producto Evergreen pro no esta como se espera'; END IF;

  -- 0.2 Las 9 filas de movimientos_diarios_productos, con su valor exacto
  SELECT count(*) INTO v_n
  FROM public.movimientos_diarios_productos mdp
  JOIN public.movimientos_diarios md ON md.id = mdp.movimiento_diario_id
  JOIN (VALUES
    ('2ea36692-680c-4c56-b37f-eaeff44499d0'::uuid, 0.08::numeric, '3c3c353f-a0d4-4102-ad08-f7bd98af18e3'::uuid),
    ('04bdede7-b85a-4d3e-8184-07198c0d42a4'::uuid, 0.09::numeric, '3c3c353f-a0d4-4102-ad08-f7bd98af18e3'::uuid),
    ('9ff90ff5-ada7-4a78-a0d4-88812bcee0e7'::uuid, 0.08::numeric, '3c3c353f-a0d4-4102-ad08-f7bd98af18e3'::uuid),
    ('7c1940e9-2f9a-46dd-94b0-01d72a5faff3'::uuid, 0.07::numeric, '3c3c353f-a0d4-4102-ad08-f7bd98af18e3'::uuid),
    ('9ac4baca-17d8-4135-b030-71a82f73c0be'::uuid, 0.08::numeric, 'efb7d569-8965-4617-ad93-8d1ad0eb776f'::uuid),
    ('dd88cc22-0b01-4b67-afa2-cce9603f3592'::uuid, 0.03::numeric, 'efb7d569-8965-4617-ad93-8d1ad0eb776f'::uuid),
    ('c86430bd-a752-44e1-ab2e-9676648ad6b8'::uuid, 0.05::numeric, 'efb7d569-8965-4617-ad93-8d1ad0eb776f'::uuid),
    ('204edbe3-478a-4de8-b845-659605190c8f'::uuid, 0.05::numeric, 'efb7d569-8965-4617-ad93-8d1ad0eb776f'::uuid),
    ('5d0aa374-fd45-401f-8b23-143ffdeb58d4'::uuid, 0.09::numeric, 'efb7d569-8965-4617-ad93-8d1ad0eb776f'::uuid)
  ) AS e(id, cant, app) ON e.id = mdp.id
  WHERE mdp.producto_id = 'f32931db-cf30-44ff-86a2-54fbeb574106'
    AND mdp.cantidad_utilizada = e.cant AND md.aplicacion_id = e.app;
  IF v_n <> 9 THEN RAISE EXCEPTION '198 pre 0.2: % de 9 filas de movimientos_diarios_productos coinciden', v_n; END IF;

  -- 0.3 No hay ninguna otra fila de consumo de este producto
  SELECT count(*) INTO v_n FROM public.movimientos_diarios_productos
  WHERE producto_id = 'f32931db-cf30-44ff-86a2-54fbeb574106';
  IF v_n <> 9 THEN RAISE EXCEPTION '198 pre 0.3: hay % filas de consumo de Evergreen pro, se esperaban 9', v_n; END IF;

  -- 0.4 Libro de inventario: exactamente estas 4 filas con estos valores
  SELECT count(*) INTO v_n FROM public.movimientos_inventario
  WHERE producto_id = 'f32931db-cf30-44ff-86a2-54fbeb574106';
  IF v_n <> 4 THEN RAISE EXCEPTION '198 pre 0.4: hay % movimientos de inventario, se esperaban 4', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.movimientos_inventario
  WHERE (id = '5d9d9dcc-9ca7-4c7a-b2dd-6939a2205789' AND tipo_movimiento = 'Entrada'
         AND cantidad = 40 AND saldo_anterior = 0 AND saldo_nuevo = 40)
     OR (id = 'e80a1e1d-637a-4daa-8e2a-701cfb11cefe' AND tipo_movimiento = 'Entrada'
         AND cantidad = 22 AND saldo_anterior = 40 AND saldo_nuevo = 62)
     OR (id = 'd49aa171-c96a-441e-abaf-e721fa595d40' AND tipo_movimiento = 'Salida por Aplicación'
         AND aplicacion_id = '3c3c353f-a0d4-4102-ad08-f7bd98af18e3'
         AND cantidad = 0.32 AND saldo_anterior = 62 AND saldo_nuevo = 61.68
         AND valor_movimiento = 7040 AND notas IS NULL)
     OR (id = '3578b2c5-ef19-41fb-9d93-5e6bdf21466e' AND tipo_movimiento = 'Salida por Aplicación'
         AND aplicacion_id = 'efb7d569-8965-4617-ad93-8d1ad0eb776f'
         AND cantidad = 0.30 AND saldo_anterior = 61.68 AND saldo_nuevo = 61.38
         AND valor_movimiento = 6600 AND notas IS NULL);
  IF v_n <> 4 THEN RAISE EXCEPTION '198 pre 0.4b: % de 4 movimientos de inventario coinciden', v_n; END IF;

  -- 0.5 Las dos aplicaciones, cerradas, con sus costos exactos
  SELECT count(*) INTO v_n FROM public.aplicaciones a
  WHERE a.estado = 'Cerrada'
    AND EXISTS (SELECT 1 FROM public.aplicaciones_cierre c WHERE c.aplicacion_id = a.id)
    AND ((a.id = '3c3c353f-a0d4-4102-ad08-f7bd98af18e3'
          AND a.costo_total_insumos = 1197802.8
          AND a.costo_total_mano_obra = 2717929.5400000005
          AND a.costo_total = 3915732.340000001
          AND a.costo_por_arbol = 1155.0832861356935)
      OR (a.id = 'efb7d569-8965-4617-ad93-8d1ad0eb776f'
          AND a.costo_total_insumos = 1322883.84
          AND a.costo_total_mano_obra = 2271000.4499999997
          AND a.costo_total = 3593884.29
          AND a.costo_por_arbol = 1215.381903956713));
  IF v_n <> 2 THEN RAISE EXCEPTION '198 pre 0.5: % de 2 aplicaciones coinciden', v_n; END IF;

  -- 0.6 La regla que se recalcula: insumos = SUM(valor_movimiento) de sus salidas
  SELECT count(*) INTO v_n FROM public.aplicaciones a
  WHERE a.id IN ('3c3c353f-a0d4-4102-ad08-f7bd98af18e3', 'efb7d569-8965-4617-ad93-8d1ad0eb776f')
    AND a.costo_total_insumos = (SELECT sum(mi.valor_movimiento) FROM public.movimientos_inventario mi
                                 WHERE mi.aplicacion_id = a.id);
  IF v_n <> 2 THEN RAISE EXCEPTION '198 pre 0.6: costo_total_insumos ya no es SUM(valor_movimiento)'; END IF;

  -- 0.7 Arboles implicitos en costo_por_arbol (3.390 y 2.957)
  IF (SELECT round(costo_total / costo_por_arbol, 6) FROM public.aplicaciones
      WHERE id = '3c3c353f-a0d4-4102-ad08-f7bd98af18e3') <> 3390
  OR (SELECT round(costo_total / costo_por_arbol, 6) FROM public.aplicaciones
      WHERE id = 'efb7d569-8965-4617-ad93-8d1ad0eb776f') <> 2957 THEN
    RAISE EXCEPTION '198 pre 0.7: el numero de arboles implicito cambio';
  END IF;

  -- 0.8 Ninguna ronda de inventario tiene el producto congelado
  SELECT count(*) INTO v_n FROM public.rondas_inventario_alcance
  WHERE producto_id = 'f32931db-cf30-44ff-86a2-54fbeb574106';
  IF v_n <> 0 THEN RAISE EXCEPTION '198 pre 0.8: el producto esta en % alcances de ronda', v_n; END IF;

  -- 0.9 Respaldos libres
  IF to_regclass('respaldos.backup_198_movimientos_diarios_productos') IS NOT NULL
  OR to_regclass('respaldos.backup_198_movimientos_inventario') IS NOT NULL
  OR to_regclass('respaldos.backup_198_aplicaciones') IS NOT NULL
  OR to_regclass('respaldos.backup_198_productos') IS NOT NULL THEN
    RAISE EXCEPTION '198 pre 0.9: ya existe un respaldo backup_198_*';
  END IF;
END $$;

-- 1. RESPALDO (patron 081: en respaldos, sin grants de navegador, RLS sin politicas)
CREATE TABLE respaldos.backup_198_movimientos_diarios_productos AS
  SELECT * FROM public.movimientos_diarios_productos
  WHERE producto_id = 'f32931db-cf30-44ff-86a2-54fbeb574106';
CREATE TABLE respaldos.backup_198_movimientos_inventario AS
  SELECT * FROM public.movimientos_inventario
  WHERE id IN ('d49aa171-c96a-441e-abaf-e721fa595d40', '3578b2c5-ef19-41fb-9d93-5e6bdf21466e');
CREATE TABLE respaldos.backup_198_aplicaciones AS
  SELECT * FROM public.aplicaciones
  WHERE id IN ('3c3c353f-a0d4-4102-ad08-f7bd98af18e3', 'efb7d569-8965-4617-ad93-8d1ad0eb776f');
CREATE TABLE respaldos.backup_198_productos AS
  SELECT * FROM public.productos WHERE id = 'f32931db-cf30-44ff-86a2-54fbeb574106';

REVOKE ALL ON respaldos.backup_198_movimientos_diarios_productos FROM PUBLIC, anon, authenticated;
REVOKE ALL ON respaldos.backup_198_movimientos_inventario FROM PUBLIC, anon, authenticated;
REVOKE ALL ON respaldos.backup_198_aplicaciones FROM PUBLIC, anon, authenticated;
REVOKE ALL ON respaldos.backup_198_productos FROM PUBLIC, anon, authenticated;
ALTER TABLE respaldos.backup_198_movimientos_diarios_productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE respaldos.backup_198_movimientos_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE respaldos.backup_198_aplicaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE respaldos.backup_198_productos ENABLE ROW LEVEL SECURITY;

-- 2. CORRECCION -----------------------------------------------------------------
-- 2.1 Consumo real x100 (9 filas)
UPDATE public.movimientos_diarios_productos SET cantidad_utilizada = 8
  WHERE id = '2ea36692-680c-4c56-b37f-eaeff44499d0';
UPDATE public.movimientos_diarios_productos SET cantidad_utilizada = 9
  WHERE id = '04bdede7-b85a-4d3e-8184-07198c0d42a4';
UPDATE public.movimientos_diarios_productos SET cantidad_utilizada = 8
  WHERE id = '9ff90ff5-ada7-4a78-a0d4-88812bcee0e7';
UPDATE public.movimientos_diarios_productos SET cantidad_utilizada = 7
  WHERE id = '7c1940e9-2f9a-46dd-94b0-01d72a5faff3';
UPDATE public.movimientos_diarios_productos SET cantidad_utilizada = 8
  WHERE id = '9ac4baca-17d8-4135-b030-71a82f73c0be';
UPDATE public.movimientos_diarios_productos SET cantidad_utilizada = 3
  WHERE id = 'dd88cc22-0b01-4b67-afa2-cce9603f3592';
UPDATE public.movimientos_diarios_productos SET cantidad_utilizada = 5
  WHERE id = 'c86430bd-a752-44e1-ab2e-9676648ad6b8';
UPDATE public.movimientos_diarios_productos SET cantidad_utilizada = 5
  WHERE id = '204edbe3-478a-4de8-b845-659605190c8f';
UPDATE public.movimientos_diarios_productos SET cantidad_utilizada = 9
  WHERE id = '5d0aa374-fd45-401f-8b23-143ffdeb58d4';

-- 2.2 Salidas por aplicacion y su cadena de saldos (precio del cierre: 22.000)
UPDATE public.movimientos_inventario
  SET cantidad = 32, saldo_nuevo = 30, valor_movimiento = 704000,
      notas = 'ESCO-188 (migracion 198), 2026-11-23: cantidad corregida x100. Antes 0,32 (62 -> 61,68, $7.040). David confirma 17 U La Vega + 15 U Australia.'
  WHERE id = 'd49aa171-c96a-441e-abaf-e721fa595d40';
UPDATE public.movimientos_inventario
  SET cantidad = 30, saldo_anterior = 30, saldo_nuevo = 0, valor_movimiento = 660000,
      notas = 'ESCO-188 (migracion 198), 2026-11-23: cantidad corregida x100. Antes 0,30 (61,68 -> 61,38, $6.600). Confirmado por David; bodega en 0.'
  WHERE id = '3578b2c5-ef19-41fb-9d93-5e6bdf21466e';

-- 2.3 Costos guardados en el cierre (misma formula que construirPayloadCierreAplicacion)
UPDATE public.aplicaciones
  SET costo_total_insumos = costo_total_insumos + 696960,
      costo_total = costo_total + 696960,
      costo_por_arbol = (costo_total + 696960) / 3390
  WHERE id = '3c3c353f-a0d4-4102-ad08-f7bd98af18e3';
UPDATE public.aplicaciones
  SET costo_total_insumos = costo_total_insumos + 653400,
      costo_total = costo_total + 653400,
      costo_por_arbol = (costo_total + 653400) / 2957
  WHERE id = 'efb7d569-8965-4617-ad93-8d1ad0eb776f';

-- 2.4 Saldo del producto
UPDATE public.productos SET cantidad_actual = 0
  WHERE id = 'f32931db-cf30-44ff-86a2-54fbeb574106';

-- 3. POST-CONDICIONES ----------------------------------------------------------
DO $$
DECLARE
  v_n integer;
  r record;
  v_prev numeric := 0;
BEGIN
  -- 3.1 Respaldos completos
  IF (SELECT count(*) FROM respaldos.backup_198_movimientos_diarios_productos) <> 9
  OR (SELECT count(*) FROM respaldos.backup_198_movimientos_inventario) <> 2
  OR (SELECT count(*) FROM respaldos.backup_198_aplicaciones) <> 2
  OR (SELECT count(*) FROM respaldos.backup_198_productos) <> 1 THEN
    RAISE EXCEPTION '198 post 3.1: respaldo incompleto';
  END IF;

  -- 3.2 Consumo real por aplicacion y por lote
  IF (SELECT sum(mdp.cantidad_utilizada) FROM public.movimientos_diarios_productos mdp
      JOIN public.movimientos_diarios md ON md.id = mdp.movimiento_diario_id
      WHERE mdp.producto_id = 'f32931db-cf30-44ff-86a2-54fbeb574106'
        AND md.aplicacion_id = '3c3c353f-a0d4-4102-ad08-f7bd98af18e3'
        AND md.lote_id = 'ee810553-4108-4a6e-8494-63491954d59b') <> 17
  OR (SELECT sum(mdp.cantidad_utilizada) FROM public.movimientos_diarios_productos mdp
      JOIN public.movimientos_diarios md ON md.id = mdp.movimiento_diario_id
      WHERE mdp.producto_id = 'f32931db-cf30-44ff-86a2-54fbeb574106'
        AND md.aplicacion_id = '3c3c353f-a0d4-4102-ad08-f7bd98af18e3'
        AND md.lote_id = '5588e8c8-7519-472e-a78c-47b56216c24c') <> 15
  OR (SELECT sum(mdp.cantidad_utilizada) FROM public.movimientos_diarios_productos mdp
      JOIN public.movimientos_diarios md ON md.id = mdp.movimiento_diario_id
      WHERE mdp.producto_id = 'f32931db-cf30-44ff-86a2-54fbeb574106'
        AND md.aplicacion_id = 'efb7d569-8965-4617-ad93-8d1ad0eb776f') <> 30 THEN
    RAISE EXCEPTION '198 post 3.2: consumo real no da 17 / 15 / 30';
  END IF;

  -- 3.3 Salida de inventario = consumo real, por aplicacion
  SELECT count(*) INTO v_n FROM public.movimientos_inventario mi
  WHERE mi.producto_id = 'f32931db-cf30-44ff-86a2-54fbeb574106'
    AND mi.tipo_movimiento = 'Salida por Aplicación'
    AND mi.cantidad = (SELECT sum(mdp.cantidad_utilizada) FROM public.movimientos_diarios_productos mdp
                       JOIN public.movimientos_diarios md ON md.id = mdp.movimiento_diario_id
                       WHERE mdp.producto_id = mi.producto_id AND md.aplicacion_id = mi.aplicacion_id)
    AND mi.valor_movimiento = mi.cantidad * 22000;
  IF v_n <> 2 THEN RAISE EXCEPTION '198 post 3.3: salidas no cuadran con el consumo real'; END IF;

  -- 3.4 Cadena de saldos coherente en orden de escritura, y termina en el saldo del producto
  FOR r IN SELECT tipo_movimiento, cantidad, saldo_anterior, saldo_nuevo
           FROM public.movimientos_inventario
           WHERE producto_id = 'f32931db-cf30-44ff-86a2-54fbeb574106'
           ORDER BY created_at LOOP
    IF r.saldo_anterior <> v_prev THEN
      RAISE EXCEPTION '198 post 3.4: saldo_anterior % no sigue a %', r.saldo_anterior, v_prev;
    END IF;
    IF (r.saldo_nuevo <> r.saldo_anterior
         + (CASE WHEN r.tipo_movimiento IN ('Entrada', 'Ajuste') THEN r.cantidad ELSE -r.cantidad END)) THEN
      RAISE EXCEPTION '198 post 3.4: saldo_nuevo % no cuadra', r.saldo_nuevo;
    END IF;
    v_prev := r.saldo_nuevo;
  END LOOP;
  IF v_prev <> 0 OR (SELECT cantidad_actual FROM public.productos
                     WHERE id = 'f32931db-cf30-44ff-86a2-54fbeb574106') <> 0 THEN
    RAISE EXCEPTION '198 post 3.4: el saldo final no es 0';
  END IF;

  -- 3.5 Costos: insumos = SUM(valor_movimiento), total = insumos + mano de obra,
  --     mano de obra sin cambio, por arbol = total / arboles.
  --     Tolerancia de 1 centavo: los valores guardados por el cierre traen ruido de
  --     coma flotante de JavaScript (3.915.732,340000001 = 1.197.802,8 +
  --     2.717.929,5400000005 con 5e-10 de diferencia), asi que la igualdad exacta no
  --     se cumple ni antes de esta migracion. El total sube en exactamente el mismo
  --     delta que los insumos (2.3), asi que ese ruido se conserva, no crece.
  SELECT count(*) INTO v_n FROM public.aplicaciones a
  JOIN respaldos.backup_198_aplicaciones b ON b.id = a.id
  WHERE a.costo_total_insumos = (SELECT sum(mi.valor_movimiento) FROM public.movimientos_inventario mi
                                 WHERE mi.aplicacion_id = a.id)
    AND abs(a.costo_total - (a.costo_total_insumos + a.costo_total_mano_obra)) < 0.01
    AND a.costo_total - b.costo_total = a.costo_total_insumos - b.costo_total_insumos
    AND a.costo_total_mano_obra = b.costo_total_mano_obra
    AND a.estado = b.estado
    AND abs(a.costo_por_arbol * CASE a.id WHEN '3c3c353f-a0d4-4102-ad08-f7bd98af18e3' THEN 3390 ELSE 2957 END
            - a.costo_total) < 0.01;
  IF v_n <> 2 THEN RAISE EXCEPTION '198 post 3.5: costos de las aplicaciones no cuadran'; END IF;

  -- 3.6 El precio y el plan no se tocaron
  IF (SELECT precio_unitario FROM public.productos
      WHERE id = 'f32931db-cf30-44ff-86a2-54fbeb574106') <> 22500 THEN
    RAISE EXCEPTION '198 post 3.6: precio_unitario cambio';
  END IF;
END $$;

-- =============================================================================
-- ROLLBACK (ejecutar como un bloque; restaura desde respaldos y los borra)
-- =============================================================================
-- UPDATE public.movimientos_diarios_productos t SET cantidad_utilizada = b.cantidad_utilizada
--   FROM respaldos.backup_198_movimientos_diarios_productos b WHERE b.id = t.id;
-- UPDATE public.movimientos_inventario t
--   SET cantidad = b.cantidad, saldo_anterior = b.saldo_anterior, saldo_nuevo = b.saldo_nuevo,
--       valor_movimiento = b.valor_movimiento, notas = b.notas
--   FROM respaldos.backup_198_movimientos_inventario b WHERE b.id = t.id;
-- UPDATE public.aplicaciones t
--   SET costo_total_insumos = b.costo_total_insumos, costo_total = b.costo_total,
--       costo_por_arbol = b.costo_por_arbol
--   FROM respaldos.backup_198_aplicaciones b WHERE b.id = t.id;
-- UPDATE public.productos t SET cantidad_actual = b.cantidad_actual
--   FROM respaldos.backup_198_productos b WHERE b.id = t.id;
-- DROP TABLE respaldos.backup_198_movimientos_diarios_productos,
--            respaldos.backup_198_movimientos_inventario,
--            respaldos.backup_198_aplicaciones,
--            respaldos.backup_198_productos;
