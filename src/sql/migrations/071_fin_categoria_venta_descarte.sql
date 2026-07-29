-- =====================================================================
-- 071: Categoría de ingreso "Venta de Vacas de Descarte" (Hato Lechero) y
--      recategorización de las 6 filas históricas hoy bajo "Otro".
-- Fecha: 2026-07-28
--
-- Parte de SOW 1 del rework del submódulo Producción — plan
-- docs/plan_hato_produccion_rework.md §2.2. Decisión 7 del dueño: las 6
-- filas "Otro" son ventas de vacas de descarte confirmadas; el Hato tiene
-- TRES flujos de ingreso -- leche · terneros · descarte -- y las ventas de
-- descarte se quedan en fin_ingresos, bajo el negocio Hato Lechero.
--
-- NO cambia ningún `valor`, `fecha` ni `cantidad`: los TOTALES del P&G y
-- del Flujo de Caja quedan idénticos -- ambos suman ing.valor sin filtrar
-- por categoría (calculosPyG.ts:157-181; calculosFlujoCaja.ts construye la
-- entrada de igual forma). Lo que SÍ cambia en los DOS reportes es la
-- ETIQUETA de la línea de detalle: calculosPyG.ts agrupa por categoria_id
-- para el id/etiqueta de cada línea (`ing_${categoria_id}`), y
-- calculosFlujoCaja.ts:76-80 hace lo mismo para su propia línea de
-- entrada (`ent_${categoria_id}`, etiqueta = categoria_nombre) --
-- corrección sobre el esbozo original del brief, que afirmaba
-- incorrectamente que el Flujo de Caja "ni siquiera lee la categoría"
-- (hallazgo de QA #2): sí la lee, para el mismo propósito de etiqueta, no
-- de total. El nombre se eligió SIN la subcadena "leche" a propósito: el
-- denominador de $/litro del Hato (calculosPyG.ts:185-190) filtra por
-- /leche/i y no debe capturarlo.
--
-- `fin_ingresos.cabezas` (el hallazgo de QA #3 que forzó agregarla) vive
-- en 070, NO aquí -- se movió junto a fn_hato_registrar_venta_animales
-- (que la necesita) para que ese RPC use un INSERT estático en vez de SQL
-- dinámico. Este archivo vuelve a ser, como en el diseño original, SOLO
-- la categoría + la recategorización de las 6 filas.
--
-- Los 6 `id` de la sección 2 fueron verificados de forma independiente
-- contra producción (proyecto ywhtjwawnkeqlwxbvgup) el 2026-07-28,
-- corriendo EXACTAMENTE el SELECT de la sección 2 vía
-- `supabase link --project-ref ywhtjwawnkeqlwxbvgup` +
-- `supabase db query --linked` (solo lectura) -- no se pegaron a ciegas
-- desde una lista recibida; la lista recibida y el resultado de la
-- verificación coincidieron fila por fila (mismos 6 id, mismo orden,
-- mismas fechas y valores).
--
-- Idempotente en la parte 1. La parte 2 (el UPDATE) es segura de
-- re-ejecutar: si las 6 filas ya están bajo "Venta de Vacas de Descarte",
-- el guard de categoría-previa de abajo lo detecta y no hace nada
-- (0 filas que cumplan "categoría actual = Otro" -> RAISE EXCEPTION
-- explícito, no un no-op silencioso -- ver el comentario de la sección 2
-- para la intención exacta de ese guard).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Categoría "Venta de Vacas de Descarte" bajo el negocio Hato Lechero
--    -- resuelto por NOMBRE, nunca UUID hardcodeado (precedente
--    NEGOCIO_GANADO en IngresosList.tsx:117-128).
-- ---------------------------------------------------------------------

INSERT INTO fin_categorias_ingresos (nombre, negocio_id, activo)
SELECT 'Venta de Vacas de Descarte', n.id, TRUE
FROM fin_negocios n
WHERE n.nombre = 'Hato Lechero'
  AND NOT EXISTS (
    SELECT 1 FROM fin_categorias_ingresos c
    WHERE c.negocio_id = n.id AND lower(c.nombre) = 'venta de vacas de descarte'
  );

-- ---------------------------------------------------------------------
-- 2. Recategorización acotada -- SOLO las 6 filas de Hato Lechero bajo
--    "Otro" que el dueño confirmó como descarte (2025), enumeradas por
--    ID LITERAL (nunca `WHERE categoria = 'Otro'` genérico, que
--    recategorizaría cualquier fila "Otro" que alguien agregue después --
--    mismo tipo de precaución que faltó en la limpieza de partos por SQL
--    ad hoc, `src/components/hato/CLAUDE.md` "Incidente de corrupción").
--
--    SELECT de verificación usado para obtener y confirmar estos 6 id
--    (el mismo que produjo la lista de abajo, re-corrido de forma
--    independiente antes de escribir este archivo):
--
--      SELECT i.id, i.fecha, i.nombre, i.valor
--      FROM fin_ingresos i
--      JOIN fin_negocios n ON n.id = i.negocio_id
--      JOIN fin_categorias_ingresos c ON c.id = i.categoria_id
--      WHERE n.nombre = 'Hato Lechero' AND c.nombre = 'Otro'
--      ORDER BY i.fecha;
--
--    Guard de doble candado -- ID exacto Y categoría actual == 'Otro':
--    la lista de ids por sí sola ya es específica, pero un guard que
--    ADEMÁS verifica que cada fila objetivo sigue bajo "Otro" en el
--    momento de aplicar la migración convierte una base de datos que
--    haya divergido desde la verificación (una de estas 6 filas borrada,
--    recategorizada a mano, o el propio ID reasignado por alguna
--    operación externa) en un RAISE EXCEPTION ruidoso -- nunca una
--    recategorización silenciosa de filas equivocadas.
-- ---------------------------------------------------------------------

DO $$
DECLARE
  v_ids_descarte UUID[] := ARRAY[
    'ce95f40c-c789-49c1-a6da-5312461571f5'::UUID,  -- 2025-01-14, 500.000
    '49a9a49d-71de-4db0-96db-3a60969cbdb1'::UUID,  -- 2025-03-14, 1.000.000
    '8034f4f8-d7f1-4719-8ba8-33a26350e028'::UUID,  -- 2025-04-14, 1.700.000
    '694968b0-1f64-4f10-9fb9-0531613e0105'::UUID,  -- 2025-06-14, 1.860.000
    '1784490c-b264-42d9-ba3f-32974bf3fdfa'::UUID,  -- 2025-07-14, 900.000
    '89401376-44b7-4439-b1d7-06415fe5d845'::UUID   -- 2025-10-14, 4.000.000
  ];
  v_categoria_descarte_id UUID;
  v_categoria_otro_id UUID;
  v_negocio_id UUID;
  v_previas_bajo_otro INTEGER;
  v_actualizadas INTEGER;
BEGIN
  SELECT id INTO v_negocio_id FROM fin_negocios WHERE nombre = 'Hato Lechero';
  IF v_negocio_id IS NULL THEN
    RAISE EXCEPTION 'Migración 071: no existe el negocio "Hato Lechero" en fin_negocios.';
  END IF;

  SELECT id INTO v_categoria_descarte_id
  FROM fin_categorias_ingresos
  WHERE negocio_id = v_negocio_id AND lower(nombre) = 'venta de vacas de descarte';
  IF v_categoria_descarte_id IS NULL THEN
    RAISE EXCEPTION 'Migración 071: no se encontró la categoría "Venta de Vacas de Descarte" bajo Hato Lechero -- la sección 1 de este mismo archivo debió crearla antes de llegar aquí.';
  END IF;

  SELECT id INTO v_categoria_otro_id
  FROM fin_categorias_ingresos
  WHERE negocio_id = v_negocio_id AND lower(nombre) = 'otro';
  IF v_categoria_otro_id IS NULL THEN
    RAISE EXCEPTION 'Migración 071: no se encontró la categoría "Otro" bajo Hato Lechero -- las 6 filas objetivo deberían estar categorizadas ahí; si la categoría ya no existe, la base divergió de lo verificado y esta migración se detiene en vez de adivinar.';
  END IF;

  -- Guard: cada una de las 6 filas objetivo debe existir Y seguir bajo
  -- "Otro" en este momento -- si la base divergió desde la verificación
  -- (una fila ya movida, borrada, o el id reasignado), esto lo detecta
  -- ANTES del UPDATE, no después.
  SELECT count(*) INTO v_previas_bajo_otro
  FROM fin_ingresos
  WHERE id = ANY (v_ids_descarte) AND categoria_id = v_categoria_otro_id;

  IF v_previas_bajo_otro <> 6 THEN
    RAISE EXCEPTION 'Migración 071: se esperaban exactamente 6 filas de fin_ingresos bajo la categoría "Otro" entre los ids de v_ids_descarte, se encontraron %. La base de datos divergió del estado verificado el 2026-07-28 (proyecto ywhtjwawnkeqlwxbvgup) -- revisa manualmente antes de reintentar; NO se hizo ningún UPDATE.', v_previas_bajo_otro;
  END IF;

  UPDATE fin_ingresos
  SET categoria_id = v_categoria_descarte_id
  WHERE id = ANY (v_ids_descarte) AND categoria_id = v_categoria_otro_id;

  GET DIAGNOSTICS v_actualizadas = ROW_COUNT;
  IF v_actualizadas <> 6 THEN
    RAISE EXCEPTION 'Migración 071: el guard de categoría-previa contó 6 filas elegibles pero el UPDATE afectó % -- condición de carrera o error inesperado; revisa manualmente, no reintentes a ciegas.', v_actualizadas;
  END IF;

  RAISE NOTICE 'Migración 071: % filas recategorizadas a "Venta de Vacas de Descarte".', v_actualizadas;
END $$;
