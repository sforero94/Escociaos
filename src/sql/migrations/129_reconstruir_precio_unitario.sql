-- Migración 129: reconstruye `productos.precio_unitario` desde la compra más
-- reciente vigente de cada producto.
--
-- Fase 0b -- Saneamiento de `productos.precio_unitario`, pieza 2 de
-- docs/brief_tecnico_verificacion_inventario.md §11.2. Bloquea únicamente las
-- dos líneas valorizadas del reporte de cierre de la ronda de inventario
-- (CA-20); el resto del rediseño (tablas `rondas_*`, RPC, pipeline de voz por
-- Telegram) es de otra fase, se está implementando en paralelo en otro árbol
-- de trabajo, y esta migración no lo toca.
--
-- NO APLICAR DESDE ESTE AGENTE. Queda escrita y verificada contra el catálogo
-- vivo (2026-08-28, vía `npx supabase db query --linked`, el mismo camino de
-- sólo lectura que documenta la nota "Cuidado con el conector de solo-lectura"
-- del CLAUDE.md raíz) para que el dueño la revise y la aplique junto con el
-- resto de la Fase 0b -- mismo patrón que la 124 con la Fase 0.
--
-- Numerada 129 por instrucción explícita (no por grep de este agente): el
-- máximo real en src/sql/migrations/ el 2026-08-28 es 124
-- (124_rotular_verificacion_prueba.sql), y 125-128 están reservados para las
-- migraciones de esquema/RPC/cron/legado del resto del rediseño de inventario
-- que otra sesión está escribiendo en paralelo. No renumerar aunque un grep
-- local muestre menos archivos creados todavía -- el CLAUDE.md raíz avisa
-- exactamente sobre este tipo de carrera de numeración (ver sus notas de
-- revisión 2 y 3).
--
-- ---------------------------------------------------------------------------
-- QUÉ ESTÁ ROTO -- y qué YA NO está roto
-- ---------------------------------------------------------------------------
-- `precio_unitario` significa $/kg-L derivado (calculosCompras.ts:13), y cada
-- compra lo sobrescribe con el precio de ESA compra (NewPurchase.tsx:390-398).
-- Hasta el 2026-08-28, `eliminarCompraConReversion` revertía `cantidad_actual`
-- al borrar una compra pero dejaba pegado el `precio_unitario` de la compra
-- borrada -- ese es el origen documentado de Sulcamag en 669,96 (migración
-- 119). Esa fuga YA ESTÁ CERRADA hacia adelante, en `main` (`c842333`, con
-- test `eliminarCompraConReversion.test.ts`): hoy el borrado de una compra
-- restaura el precio de la compra que sobrevive, o `NULL` si no queda
-- ninguna.
--
-- Lo que ese arreglo NO hace: reparar el daño ya acumulado. Esta migración es
-- esa reparación retroactiva -- el charco que queda después de tapar la fuga.
--
-- ---------------------------------------------------------------------------
-- MEDICIÓN CONTRA PRODUCCIÓN (2026-08-28, conector de sólo lectura) -- pieza 1
-- ---------------------------------------------------------------------------
-- De 226 productos activos:
--   * 3 en NULL, 8 en cero (ya medido cuando se cerró el brief técnico).
--   * 193 con `cantidad_actual > 0` -- el universo que de verdad importa para
--     CA-20, porque un precio malo sobre un producto en cero aporta 0 al KPI
--     de valor de inventario.
--
-- De esos 193, comparados contra `compras.costo_unitario` de su compra más
-- reciente VIGENTE (misma derivación que `eliminarCompraConReversion`:
-- `ORDER BY fecha_compra DESC, created_at DESC LIMIT 1` sobre las filas que
-- SIGUEN existiendo en `compras` hoy -- "vigente" es exactamente eso: una
-- compra borrada ya no compite, `compras` no tiene borrado lógico):
--
--   * 169 NO TIENEN NINGUNA fila en `compras` -- no reconstruibles. De esos
--     169: 160 conservan un `precio_unitario` positivo sin ningún documento
--     que lo respalde, 8 están en cero, 1 (Hercules) está en NULL. SULCAMAG
--     ES UNO DE ESTOS 169: su única compra fue la fila huérfana que la
--     migración 119 borró (factura 4379, cargada por error contra el
--     producto equivocado), así que hoy no tiene ninguna compra en pie. Sigue
--     en 669,96, contaminado, exactamente como ya lo dejó anotado la 119: "su
--     valor anterior es irrecuperable ... inventarlo sería peor". Esta
--     migración NO lo toca ni puede tocarlo -- no hay ningún documento del
--     que reconstruirlo. El caso que motivó todo el prerrequisito de §11
--     sigue, después de esta migración, exactamente igual: es la prueba de
--     que "reconstruir desde compras" no es una panacea, es sólo lo que la
--     evidencia disponible permite.
--
--   * 24 SÍ tienen al menos una compra vigente. De esos 24: 19 YA COINCIDEN
--     con el `costo_unitario` de esa compra (comparación EXACTA, `IS
--     DISTINCT FROM`, sin margen de tolerancia -- no hace falta ninguno: es
--     la misma escritura de `NewPurchase.tsx` sin ninguna transformación de
--     por medio) y 5 DISCREPAN -- son los que esta migración corrige:
--
--       Hidrocomplex   4.661,66 -> 91,74      (factor ~50 -- huele a $/bulto)
--       Rafos          3.972,98 -> 74,20      (mismo patrón)
--       Borozinco      8.121,40 -> 364,38     (mismo patrón)
--       Integrador     3.828,00 -> 76,56      (mismo patrón)
--       Econatur G-CU  43.795,00 -> 45.700,00 (discrepancia menor, ~4%)
--
--     Las primeras cuatro comparten fecha de compra (2026-04-25) y el mismo
--     patrón de factor ~50: son consistentes con un `precio_unitario` que en
--     algún momento quedó escrito como precio POR BULTO en vez de $/kg-L --
--     exactamente la confusión que `calculosCompras.ts:13` advierte. No se
--     investiga la causa acá (fuera de alcance de esta pieza, y no hay más
--     evidencia disponible que la propia `compras`); se corrige el dato desde
--     la fuente que sí es de fiar, `compras.costo_unitario`.
--
-- Repetida la misma comparación SIN restringir a activos/con existencia (todo
-- el catálogo, 341 productos, de los cuales 115 inactivos): 25 productos
-- tienen alguna compra vigente, de los cuales 20 coinciden y 5 discrepan --
-- LOS MISMOS 5. El producto extra que aparece con compra al mirar el
-- catálogo completo ya coincidía, así que no cambia ninguna fila escrita. Por
-- eso esta migración NO restringe por `activo`/`cantidad_actual`: reconstruye
-- desde `compras` "de cada producto" (texto literal de la pieza 2 del brief
-- técnico, §11.2), y en la práctica toca exactamente las mismas filas que
-- importan para CA-20 -- restringir el alcance no habría cambiado ni una.
--
-- ---------------------------------------------------------------------------
-- QUÉ HACE ESTA MIGRACIÓN
-- ---------------------------------------------------------------------------
-- Para cada producto que tiene AL MENOS UNA fila vigente en `compras`, si su
-- `precio_unitario` actual difiere (`IS DISTINCT FROM`) del `costo_unitario`
-- de esa compra más reciente, lo reemplaza por ese valor. Nada más: no toca
-- `cantidad_actual`, no toca ningún producto sin historia de compra, no
-- inventa ningún precio que `compras` no respalde.
--
-- Respaldo en el esquema `respaldos` (precedente 081/107/117/118/119 --
-- nunca en `public`): `respaldos.backup_129_precio_unitario`, una fila por
-- producto tocado, con el `precio_unitario` de ANTES y el valor reconstruido.
--
-- Guardas al estilo 099/118/119: conteos pre y post, `RAISE EXCEPTION` si
-- algo no coincide. A diferencia de esas tres (que corrigen una fila o un
-- lote de filas puntuales, ya identificadas por id, congeladas en el texto de
-- la migración), ésta es una REGLA general que se vuelve a evaluar en el
-- momento de aplicarla -- así que las guardas NO hardcodean "5" como el
-- número exacto y obligatorio de filas: lo calculan en vivo contra `compras`
-- (sección 0) y verifican DESPUÉS que el UPDATE tocó exactamente esas filas y
-- ninguna otra (sección 2). El "5" de arriba es lo que se midió el
-- 2026-08-28 y documenta la expectativa, no un literal que la migración exija
-- byte a byte: si entre hoy y el día que se aplique entra una compra nueva de
-- alguno de estos 5 productos, `NewPurchase.tsx` ya corrige su
-- `precio_unitario` por su cuenta y esa fila sale del conjunto a tocar sin
-- que haga falta editar este archivo.
--
-- Único límite de seguridad NO dinámico: si el conjunto a reconstruir supera
-- las 30 filas (6x lo medido), la migración aborta en vez de escribir --
-- señal de que algo cambió de forma que este archivo no anticipó (p. ej. una
-- carga masiva que rompió `precio_unitario` en muchos productos a la vez) y
-- amerita mirar a mano antes de aplicar la regla general a ciegas.
--
-- ---------------------------------------------------------------------------
-- QUÉ NO HACE -- el residuo, tal como lo pide §11.2 pieza 2 del brief técnico
-- ---------------------------------------------------------------------------
-- Los productos SIN ninguna fila en `compras` (169 de los 193 con existencia
-- medidos el 2026-08-28; ver arriba) NO se reconstruyen -- quedan como están.
-- Es un dato, no una estimación: no hay ningún documento del que derivar su
-- precio, e inventar uno sería exactamente lo que la migración 050 se negó a
-- hacer con los gastos anteriores a 2026 cuyo autor era irrecuperable. La
-- lista completa se puede regenerar en cualquier momento con la consulta
-- comentada al pie de este archivo -- no se congela una lista de 169 nombres
-- acá porque cambiaría con cada alta/baja de producto y quedaría vieja el
-- mismo día que se aplique la migración.
--
-- Pieza 4 del brief técnico (firmar `inventario_parametros.valoracion_publicable
-- = true`) tampoco es de esta migración -- esa tabla la crea la Fase 1 del
-- rediseño (migración 125, en curso en otro árbol de trabajo) y el flip es
-- una decisión explícita de Gerencia, no algo que se automatice acá.
--
-- ---------------------------------------------------------------------------
-- UN RESIDUO QUE ESTA MIGRACIÓN DESTAPA Y NO ARREGLA -- ya documentado en el
-- brief técnico (§11.2 pieza 3), se repite acá para que no se pierda
-- ---------------------------------------------------------------------------
-- `MovementsDashboard.tsx:195-201` -- la línea exacta es `(p.precio_unitario
-- || 0)` dentro de la agregación de valor de inventario -- trata un
-- `precio_unitario` NULL igual que un 0. Así que cualquier producto que
-- termine en NULL (por el arreglo de `eliminarCompraConReversion` hacia
-- adelante cuando se borra la última compra que quedaba, o por cualquier otra
-- vía futura) entra al KPI de valor de inventario como cero, en silencio.
-- Ninguno de los 5 productos que esta migración toca queda en NULL (los 5
-- tienen un `costo_unitario` no nulo en su compra más reciente, tanto antes
-- como después el valor es un número real), así que esta corrida puntual no
-- activa el residuo -- pero el residuo sigue ahí para la próxima compra que
-- se borre. Fuera de alcance de la Fase 0b por decisión explícita del brief
-- técnico; queda anotado para el próximo ticket, no arreglado acá.
--
-- FILAS ESCRITAS: hasta 5, según lo medido el 2026-08-28 (puede ser menos si
-- alguna se autocorrige antes de aplicar esta migración -- ver arriba). CERO
-- filas de `compras` tocadas: esta migración sólo LEE esa tabla.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 0. Pre-condiciones.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_n integer;
  v_a_reconstruir integer;
  v_total_productos integer;
  v_suma_cantidad numeric;
BEGIN
  -- 0.1 Las columnas que se usan existen con el tipo esperado -- defensivo,
  --     barato, y evita un error de sintaxis a mitad de camino si alguien
  --     renombró algo desde que se escribió este archivo.
  SELECT count(*) INTO v_n
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'productos'
    AND column_name = 'precio_unitario' AND data_type = 'numeric';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'PRE 0.1 ABORTADA: no existe `productos.precio_unitario` de tipo numeric.';
  END IF;

  SELECT count(*) INTO v_n
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'compras'
    AND column_name = 'costo_unitario' AND data_type = 'numeric';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'PRE 0.1 ABORTADA: no existe `compras.costo_unitario` de tipo numeric.';
  END IF;

  -- 0.2 El esquema `respaldos` existe (precedente 081) y la tabla de esta
  --     migración todavía no -- sin esto, un segundo pase pisaría el
  --     respaldo del primero en vez de abortar con un mensaje claro.
  SELECT count(*) INTO v_n FROM pg_namespace WHERE nspname = 'respaldos';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'PRE 0.2 ABORTADA: no existe el esquema `respaldos` (precedente 081). No se puede continuar sin él.';
  END IF;

  SELECT count(*) INTO v_n
  FROM pg_tables WHERE schemaname = 'respaldos' AND tablename = 'backup_129_precio_unitario';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'PRE 0.2 ABORTADA: `respaldos.backup_129_precio_unitario` ya existe. LA CAUSA MÁS PROBABLE ES QUE ESTA MIGRACIÓN YA SE APLICÓ -- no es idempotente a propósito, para no pisar un respaldo real con uno de una segunda corrida.';
  END IF;

  -- 0.3 Cuántos productos tienen alguna compra vigente y cuántos de esos
  --     difieren de esa compra -- CALCULADO EN VIVO, no un literal. Ver el
  --     encabezado sobre por qué "5" no se hardcodea acá.
  WITH ultima_compra AS (
    SELECT DISTINCT ON (producto_id)
      producto_id, costo_unitario
    FROM public.compras
    ORDER BY producto_id, fecha_compra DESC, created_at DESC
  )
  SELECT count(*) FILTER (WHERE p.precio_unitario IS DISTINCT FROM uc.costo_unitario)
  INTO v_a_reconstruir
  FROM public.productos p
  JOIN ultima_compra uc ON uc.producto_id = p.id;

  IF v_a_reconstruir = 0 THEN
    RAISE WARNING 'PRE 0.3: no hay ningún producto para reconstruir en este momento (0 discrepancias contra su compra vigente más reciente). El 2026-08-28 se midieron 5. Es posible que ya se hayan autocorregido por una compra nueva -- la migración va a correr igual y no va a escribir ninguna fila (comportamiento seguro), pero conviene notar el cambio antes de aplicar.';
  END IF;

  IF v_a_reconstruir > 30 THEN
    RAISE EXCEPTION 'PRE 0.3 ABORTADA: hay % productos para reconstruir, muy por encima de los 5 medidos el 2026-08-28 (tope de seguridad: 30). Algo cambió de forma que este archivo no anticipó -- revisar a mano antes de aplicar la regla general a ciegas.', v_a_reconstruir;
  END IF;

  -- 0.4 Línea base para las post-condiciones de "nada más se movió": total de
  --     productos y suma de `cantidad_actual` -- ninguna de las dos debe
  --     cambiar, porque esta migración sólo toca `precio_unitario`.
  SELECT count(*), coalesce(sum(cantidad_actual), 0) INTO v_total_productos, v_suma_cantidad
  FROM public.productos;

  PERFORM set_config('escociaos.mig129_a_reconstruir', v_a_reconstruir::text, false);
  PERFORM set_config('escociaos.mig129_total_productos', v_total_productos::text, false);
  PERFORM set_config('escociaos.mig129_suma_cantidad', v_suma_cantidad::text, false);
END $$;

-- ---------------------------------------------------------------------------
-- 1. Respaldo -- ANTES de escribir nada. Una fila por producto que esta
--    migración va a tocar, con el precio de antes y el valor reconstruido.
-- ---------------------------------------------------------------------------
CREATE TABLE respaldos.backup_129_precio_unitario AS
WITH ultima_compra AS (
  SELECT DISTINCT ON (producto_id)
    producto_id, id AS compra_id, costo_unitario, fecha_compra
  FROM public.compras
  ORDER BY producto_id, fecha_compra DESC, created_at DESC
)
SELECT
  p.id AS producto_id,
  p.nombre,
  p.precio_unitario AS precio_unitario_anterior,
  uc.costo_unitario AS precio_unitario_reconstruido,
  uc.compra_id AS compra_id_respaldo,
  uc.fecha_compra AS fecha_compra_respaldo,
  now() AS respaldado_en
FROM public.productos p
JOIN ultima_compra uc ON uc.producto_id = p.id
WHERE p.precio_unitario IS DISTINCT FROM uc.costo_unitario;

ALTER TABLE respaldos.backup_129_precio_unitario ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON respaldos.backup_129_precio_unitario FROM anon, authenticated;

COMMENT ON TABLE respaldos.backup_129_precio_unitario IS
  'Migración 129 -- fase 0b del rediseño de verificación de inventario. Una fila por producto cuyo `precio_unitario` se reconstruyó desde `compras.costo_unitario` de su compra más reciente vigente. `precio_unitario_anterior` es el valor de antes de esta migración (puede ser NULL); `precio_unitario_reconstruido` es el valor que quedó escrito. Única copia del dato previo -- el ROLLBACK del pie de la 129 lo usa para revertir.';

-- ---------------------------------------------------------------------------
-- 2. El UPDATE -- deriva del respaldo, no recalcula la regla una segunda vez.
--    Así el conjunto tocado por el UPDATE es estructuralmente idéntico al
--    conjunto respaldado: no puede haber una fila reconstruida sin respaldo,
--    ni un respaldo de una fila que después no se tocó.
-- ---------------------------------------------------------------------------
UPDATE public.productos p
SET precio_unitario = b.precio_unitario_reconstruido
FROM respaldos.backup_129_precio_unitario b
WHERE b.producto_id = p.id;

-- ---------------------------------------------------------------------------
-- 3. Post-condiciones.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_esperado integer;
  v_respaldo integer;
  v_actualizado integer;
  v_desviados integer;
  v_total_antes text;
  v_total_ahora integer;
  v_suma_antes text;
  v_suma_ahora numeric;
BEGIN
  -- 3.1 El respaldo tiene exactamente las filas que la sección 0 calculó.
  v_esperado := nullif(current_setting('escociaos.mig129_a_reconstruir', true), '')::integer;
  SELECT count(*) INTO v_respaldo FROM respaldos.backup_129_precio_unitario;

  IF v_esperado IS NULL THEN
    RAISE WARNING 'POST 3.1: no se pudo leer la línea base de la sección 0; la comprobación de "el respaldo tiene el tamaño esperado" no se ejecutó.';
  ELSIF v_respaldo <> v_esperado THEN
    RAISE EXCEPTION 'POST 3.1 ABORTADA: el respaldo tiene % filas, se esperaban % (calculadas en la sección 0, antes de escribir nada). Algo escribió sobre `compras` o `productos` durante esta migración.', v_respaldo, v_esperado;
  END IF;

  -- 3.2 Cada fila del respaldo quedó con el precio reconstruido -- ni una
  --     menos, ni una con el valor viejo todavía puesto.
  SELECT count(*) INTO v_actualizado
  FROM respaldos.backup_129_precio_unitario b
  JOIN public.productos p ON p.id = b.producto_id
  WHERE p.precio_unitario IS NOT DISTINCT FROM b.precio_unitario_reconstruido;

  IF v_actualizado <> v_respaldo THEN
    RAISE EXCEPTION 'POST 3.2 ABORTADA: de % filas respaldadas, sólo % quedaron con el precio reconstruido escrito en `productos`.', v_respaldo, v_actualizado;
  END IF;

  -- 3.3 Ningún producto FUERA del respaldo cambió de precio -- comparado
  --     contra el estado vivo de `compras` en este mismo instante (si volvió
  --     a divergir por una escritura concurrente, esta comprobación avisa en
  --     vez de darlo por bueno en silencio).
  WITH ultima_compra AS (
    SELECT DISTINCT ON (producto_id)
      producto_id, costo_unitario
    FROM public.compras
    ORDER BY producto_id, fecha_compra DESC, created_at DESC
  )
  SELECT count(*) INTO v_desviados
  FROM public.productos p
  LEFT JOIN ultima_compra uc ON uc.producto_id = p.id
  LEFT JOIN respaldos.backup_129_precio_unitario b ON b.producto_id = p.id
  WHERE b.producto_id IS NULL                                    -- no estaba en el respaldo
    AND uc.producto_id IS NOT NULL                                -- pero sí tiene compra vigente
    AND p.precio_unitario IS DISTINCT FROM uc.costo_unitario;     -- y ahora discrepa

  IF v_desviados <> 0 THEN
    RAISE WARNING 'POST 3.3: % producto(s) con compra vigente y precio_unitario divergente que NO estaban en el respaldo de esta migración -- probablemente una compra nueva escrita durante o después de esta corrida. No es un error de esta migración (que no los tocó), pero conviene revisarlos por separado.', v_desviados;
  END IF;

  -- 3.4 `cantidad_actual` no se movió en ningún producto -- esta migración
  --     sólo toca `precio_unitario`.
  v_total_antes := nullif(current_setting('escociaos.mig129_total_productos', true), '');
  v_suma_antes := nullif(current_setting('escociaos.mig129_suma_cantidad', true), '');
  SELECT count(*), coalesce(sum(cantidad_actual), 0) INTO v_total_ahora, v_suma_ahora
  FROM public.productos;

  IF v_total_antes IS NULL OR v_suma_antes IS NULL THEN
    RAISE WARNING 'POST 3.4: no se pudo leer la línea base de la sección 0; la comprobación de "cantidad_actual intacta" no se ejecutó.';
  ELSE
    IF v_total_ahora <> v_total_antes::integer THEN
      RAISE EXCEPTION 'POST 3.4 ABORTADA: el conteo de `productos` cambió de % a %. Este UPDATE no debía insertar ni borrar filas.', v_total_antes, v_total_ahora;
    END IF;
    IF v_suma_ahora <> v_suma_antes::numeric THEN
      RAISE EXCEPTION 'POST 3.4 ABORTADA: la suma de `cantidad_actual` cambió de % a %. Este UPDATE no debía tocar existencias, sólo precio_unitario.', v_suma_antes, v_suma_ahora;
    END IF;
  END IF;

  -- 3.5 El respaldo quedó protegido: RLS encendida, sin GRANT para
  --     anon/authenticated (precedente 081/119).
  IF has_table_privilege('anon', 'respaldos.backup_129_precio_unitario', 'SELECT')
     OR has_table_privilege('authenticated', 'respaldos.backup_129_precio_unitario', 'SELECT') THEN
    RAISE EXCEPTION 'POST 3.5 ABORTADA: `anon` o `authenticated` conservan SELECT sobre el respaldo. El REVOKE de la sección 1 no se completó.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Consulta de verificación (comentada, no ejecuta) -- el residuo de 169
-- productos con existencia y sin ninguna compra que esta migración NO toca.
-- Regenerar bajo demanda en vez de congelar la lista acá:
--
--   SELECT p.nombre, p.cantidad_actual, p.precio_unitario
--   FROM public.productos p
--   WHERE p.activo = true
--     AND p.cantidad_actual > 0
--     AND NOT EXISTS (SELECT 1 FROM public.compras c WHERE c.producto_id = p.id)
--   ORDER BY p.nombre;
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- ROLLBACK (ejecutable). Restaura `precio_unitario` al valor de antes de esta
-- migración para las filas que respaldó -- no toca ninguna otra fila.
--
--   UPDATE public.productos p
--   SET precio_unitario = b.precio_unitario_anterior
--   FROM respaldos.backup_129_precio_unitario b
--   WHERE b.producto_id = p.id;
--
--   -- El respaldo se deja en pie después del rollback (mismo criterio que
--   -- 118/119): es la única prueba de que esta migración corrió y de qué
--   -- tocó. Si además se quiere borrar la tabla de respaldo:
--   -- DROP TABLE respaldos.backup_129_precio_unitario;
-- ---------------------------------------------------------------------------
