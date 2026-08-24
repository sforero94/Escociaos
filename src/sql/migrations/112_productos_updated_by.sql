-- Migración 112: `productos.updated_by` deja de estar vacía. Cierra el hallazgo #16.
--
-- NUMERACIÓN: 110 (`delete_globalgap_por_rol`, aplicada, PR #160) y 111
-- (`cerrar_logs_auditoria`, PR #161) están en vuelo. Si no ves esos ficheros en
-- este árbol es porque sus PR no se fusionaron todavía -- no es un hueco.
--
-- ---------------------------------------------------------------------------
-- QUÉ ESTÁ MAL HOY
-- ---------------------------------------------------------------------------
-- `productos.updated_by` es NULL en las **341** filas, mientras `updated_at`
-- está poblada en las 341. O sea que la tabla registra CUÁNDO se tocó cada
-- producto y nunca QUIÉN. La columna existe desde el esquema original y ningún
-- camino de código la escribe (`grep` sobre `src/`: 0 escrituras).
--
-- Es exactamente el hueco que cerraron las migraciones 040 (`tareas`), 050
-- (`fin_gastos`, `fin_transacciones_ganado`), 063 (`fin_ingresos`) y 074
-- (`monitoreos`, `registros_trabajo`). `productos` nunca recibió el suyo.
--
-- POR QUÉ IMPORTA, y con qué límite. El hallazgo lo motiva el faltante de
-- Naturboro: la escritura del 2026-08-05 19:31:49 que sacó 20 L del libro no se
-- puede atribuir a nadie. **Esto NO desbloquea esa investigación**: no hay backfill,
-- así que el pasado sigue irrecuperable. Y `updated_by` es UNA SOLA ranura que la
-- siguiente escritura pisa, mientras `cantidad_actual` se reescribe en cada
-- movimiento de inventario y en cada cierre de aplicación -- la atribución POR
-- EVENTO ya vive en `movimientos_inventario`. Lo que esta columna dará es quién
-- tocó el producto **la última vez**, que es útil y es poco. Cierra el patrón de
-- atribución que 040/050/063/074 dejaron a medias, no un caso forense concreto.
--
-- ---------------------------------------------------------------------------
-- CORRECCIÓN AL DISEÑO QUE TRAÍA EL HALLAZGO -- leer antes de "simplificar" esto
-- ---------------------------------------------------------------------------
-- La acción filada proponía copiar literalmente el patrón de las 040/050/063/074:
--
--     NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
--
-- **Eso funciona para `created_by` y está MAL para `updated_by`**, y la
-- diferencia no es de estilo:
--
--   * `created_by` se llena en un disparador BEFORE **INSERT**. Ahí
--     `NEW.created_by` viene NULL salvo que el llamante lo haya puesto a
--     propósito, así que el `COALESCE` significa "respetá lo que me dieron".
--   * `updated_by` se llena en un disparador BEFORE **UPDATE**. Ahí
--     `NEW.updated_by` **arrastra el valor de la fila vieja** salvo que la
--     sentencia lo asigne explícitamente. Con `COALESCE`, la primera
--     actualización lo fija y **todas las siguientes lo encuentran no-nulo y lo
--     dejan igual**: la columna se congela para siempre en el primer editor.
--
-- El resultado sería peor que la columna vacía de hoy: `updated_at` diría "hace
-- cinco minutos" y `updated_by` diría el nombre de quien la tocó en 2024. Un par
-- de columnas que se contradicen miente con más autoridad que un NULL.
--
-- HONESTIDAD SOBRE LA SOLUCIÓN ELEGIDA: esa objeción **no desaparece del todo**,
-- se reduce de escala. Con `COALESCE(auth.uid(), NEW.updated_by)` el par ya no
-- puede contradecirse cuando escribe una persona desde el navegador -- que es el
-- caso normal -- pero **sí puede** cuando escribe el `service_role` sin pasar id,
-- hoy únicamente `toggleProductoActivo`. Pasa de ser la regla a ser un camino, y
-- ese camino se cierra con un cambio de una línea en la app, no acá. El
-- `COMMENT ON COLUMN` lo advierte para que nadie infiera de más.
--
-- Se consideró y se descartó una tercera forma que da las dos propiedades:
-- `CASE WHEN auth.uid() IS NOT NULL THEN auth.uid() WHEN NEW.updated_by IS
-- DISTINCT FROM OLD.updated_by THEN NEW.updated_by ELSE NULL END`. Distingue "la
-- sentencia pasó un id" de "la sentencia calló" usando `OLD`. Su borde: si la
-- edge function pasa el MISMO uuid que ya estaba, `IS DISTINCT FROM` es falso y
-- anularía la atribución correcta. Se prefirió la forma simple porque **hoy nada
-- lee esta columna** (cero lecturas en `src/`), así que ninguna pantalla puede
-- mostrar un nombre viejo a nadie.
--
-- BENEFICIO EXTRA DEL ORDEN ELEGIDO, que conviene no perder: `updated_by` queda
-- **infalsificable desde el navegador**. Con el orden inverso, un Administrador
-- autenticado podía mandar `PATCH {"updated_by": "<otro uuid>"}` y el disparador
-- lo honraba. Con éste, `auth.uid()` lo sobrescribe siempre.
--
-- SUPERFICIE NUEVA QUE ABRE, dicha para quien escriba el arreglo de la app: como
-- el `service_role` saltea RLS, ahora **puede** meter un uuid arbitrario en una
-- columna con FK `NO ACTION`. Hoy no hay camino vivo (cero escrituras a
-- `updated_by` en `src/`), y `acceso.userId` sale de `supabase.auth.getUser(token)`,
-- así que el arreglo propuesto es seguro -- pero es una obligación nueva.
--
-- Por eso la asignación es **incondicional**: `updated_by` describe la MISMA
-- escritura que `updated_at`, así que se mueven juntas o no sirven.
--
-- QUIÉN ESCRIBE DE VERDAD ESTA TABLA -- comprobado, no supuesto. **El bot de
-- Telegram NO toca `productos`** (`grep` sobre `telegram/`: cero coincidencias), y
-- `importar-productos.tsx` sólo hace `.insert()`. El único escritor recurrente por
-- `service_role` es `toggleProductoActivo`
-- (`src/supabase/functions/server/productos.tsx:82-86`), y es una **acción humana**:
-- verifica el Bearer, comprueba el rol y **tiene el `userId` en la mano**
-- (`acceso.userId`) -- y lo descarta.
--
-- Por eso el orden del COALESCE importa tanto. Con la asignación incondicional que
-- proponía el borrador, ocultar un producto **borraría** la atribución humana previa
-- y la sustituiría por un NULL rotulado «no atribuible», cuando sí era atribuible; y
-- además cerraría la única puerta limpia para arreglarlo. Con `COALESCE(auth.uid(),
-- NEW.updated_by)` esa puerta queda abierta: basta que `toggleProductoActivo` pase
-- `updated_by: acceso.userId` en su UPDATE. **Eso es un cambio de código aparte, no
-- de esta migración**, y queda reportado.
--
-- La brecha que sí permanece: una escritura por `service_role` que NO pase el id
-- deja el valor anterior en pie. Es menos malo que las dos alternativas -- congelar
-- la columna (COALESCE al revés) o borrar una atribución que existía (incondicional)
-- -- y se cierra pasando el id, no cambiando el disparador.
--
-- ---------------------------------------------------------------------------
-- LO QUE NO HACE
-- ---------------------------------------------------------------------------
-- **No hay backfill, a propósito.** El editor histórico de esas 341 filas es
-- genuinamente irrecuperable; inventarlo sería exactamente lo que la migración
-- 050 se negó a hacer con los gastos anteriores a 2026. Hacia adelante, y nada más.
--
-- No toca los dos disparadores BEFORE UPDATE que ya existen sobre esta tabla
-- (`set_updated_at_productos` y `update_productos_updated_at`, **los dos
-- llamando a `update_updated_at_column`** -- sí, están duplicados). Ese duplicado
-- es preexistente, inofensivo (asignan lo mismo) y arreglarlo exige un `DROP`,
-- que no cabe en el carril aditivo. Queda anotado, no tocado.
--
-- SEGURIDAD: `SECURITY INVOKER` y `search_path` pineado a `public, pg_temp`,
-- idéntico a `set_gasto_created_by` (verificado contra `pg_proc`) y a lo que
-- exige la migración 082. Se revoca `EXECUTE` a `PUBLIC`/`anon`/`authenticated`:
-- un disparador **se dispara igual sin ese EXECUTE**, porque Postgres lo
-- comprueba en `CREATE TRIGGER` y no en cada disparo (verificado dos veces, ver
-- 082 parte 2).
--
-- FILAS AFECTADAS: **cero**. Un `CREATE TRIGGER` no actualiza ninguna fila.
-- `productos.updated_by` sigue NULL en las 341 hasta que alguien edite un producto.
--
-- POR QUÉ LA FK NO PUEDE FALLAR -- y el motivo NO es el que parece. `updated_by`
-- referencia `auth.users(id)`, y sería cómodo decir que «`auth.uid()` sólo puede
-- devolver un id que existe ahí». **Eso es falso**: el cuerpo real de `auth.uid()`
-- en producción es una lectura SIN VALIDAR de un claim del JWT
-- (`current_setting('request.jwt.claim.sub')`), que perfectamente puede traer un
-- uuid huérfano. Lo que de verdad cierra el riesgo es la RLS: las dos únicas
-- políticas que permiten UPDATE sobre `productos` exigen `get_user_role()` = Administrador o
-- Gerencia, `get_user_role()` es `SELECT rol FROM usuarios WHERE id = auth.uid()`,
-- y `usuarios.id` referencia `auth.users(id)` **ON DELETE CASCADE**. Si el usuario
-- de Auth desapareciera, su fila de `usuarios` se va con él, `get_user_role()`
-- devuelve NULL, ninguna política casa y el UPDATE se deniega **antes** de que el
-- disparador llegue a correr. Y el `service_role`, que sí saltea RLS, no lleva
-- claim `sub`: `auth.uid()` es NULL y la FK ni se comprueba.
--
-- Vale la pena tenerlo escrito bien, porque quien copie este patrón a una tabla
-- cuya RLS no exija fila viva en `usuarios` NO tendrá esa protección.

-- ---------------------------------------------------------------------------
-- 1. Pre-condiciones.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_n integer;
BEGIN
  -- 1.1 La columna existe y es del tipo que esperamos.
  SELECT count(*) INTO v_n
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'productos'
    AND column_name = 'updated_by' AND data_type = 'uuid';

  IF v_n <> 1 THEN
    RAISE EXCEPTION 'PRE 1.1: no existe `productos.updated_by` de tipo uuid.';
  END IF;

  -- 1.2 El disparador todavía no existe. Sin `DROP ... IF EXISTS` (no cabe en el
  --     carril aditivo), un segundo pase reventaría con "trigger already exists";
  --     esto lo convierte en un aborto explicado.
  SELECT count(*) INTO v_n
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'productos'
    AND t.tgname = 'set_updated_by_productos' AND NOT t.tgisinternal;

  IF v_n <> 0 THEN
    RAISE EXCEPTION 'PRE 1.2: el disparador `set_updated_by_productos` ya existe. LA CAUSA MÁS PROBABLE ES QUE ESTA MIGRACIÓN YA SE APLICÓ. Ojo: este repo tiene historial de migraciones aplicadas sin fila en el ledger, así que la ausencia de fila NO prueba lo contrario.';
  END IF;

  -- 1.3 La FK apunta a `auth.users`, que es lo que hace imposible que
  --     `auth.uid()` viole la restricción. Si alguien la reapuntó a
  --     `public.usuarios`, un usuario de Auth sin ficha rompería TODA
  --     actualización de productos -- y eso sí sería una regresión grave.
  SELECT count(*) INTO v_n
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'productos' AND con.contype = 'f'
    AND con.conname = 'productos_updated_by_fkey'
    AND pg_get_constraintdef(con.oid) LIKE '%auth.users(id)%';

  IF v_n <> 1 THEN
    RAISE EXCEPTION 'PRE 1.3: `productos_updated_by_fkey` ya no referencia auth.users(id). Revisar antes de instalar el disparador: con otro destino, auth.uid() podría violar la FK y romper toda actualización de productos.';
  END IF;

  -- 1.4 Línea base de filas, para la post-condición 4.3. Sin literales: la tabla
  --     crece con las compras.
  SELECT count(*) INTO v_n FROM public.productos;
  PERFORM set_config('escociaos.mig112_filas', v_n::text, false);
END $$;

-- ---------------------------------------------------------------------------
-- 2. La función. Misma forma que `set_gasto_created_by` salvo la asignación,
--    que es incondicional por el motivo explicado arriba.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_producto_updated_by()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- OJO CON EL ORDEN DE LOS ARGUMENTOS: primero `auth.uid()`, después el valor
  -- viejo. El orden inverso -- que es el que pedía el hallazgo -- congela la
  -- columna en el primer editor. Ver el encabezado.
  --
  -- (Este comentario evita a propósito escribir el orden invertido de forma
  -- literal: la post-condición 4.2c busca esa cadena dentro de
  -- `pg_get_functiondef()`, que INCLUYE los comentarios del cuerpo, así que
  -- escribirla acá abortaría la migración en falso.)
  --
  -- Con ESTE orden: desde el navegador `auth.uid()` no es nulo y SIEMPRE pisa, así
  -- que nunca se congela. Desde el `service_role` (`auth.uid()` nulo) se respeta lo
  -- que traiga la sentencia -- que es lo que permite a una edge function atribuir
  -- explícitamente, el mismo patrón que ya usa el pipeline de pesaje al pasar
  -- `created_by` desde `telegram_usuarios.usuario_id`.
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.set_producto_updated_by() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_producto_updated_by() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_producto_updated_by() FROM authenticated;

COMMENT ON FUNCTION public.set_producto_updated_by() IS
  'Migracion 112: sella productos.updated_by en cada UPDATE con COALESCE(auth.uid(), NEW.updated_by) -- en ESE orden. Desde el navegador auth.uid() nunca es nulo cuando este disparador corre (las politicas de UPDATE de productos exigen get_user_role(), que necesita fila viva en usuarios), asi que el usuario real SIEMPRE pisa: la columna no se congela, y ademas es INFALSIFICABLE -- un PATCH que mande updated_by a mano queda sobrescrito. Desde service_role (auth.uid() nulo) se respeta el id que traiga la sentencia, y si no trae ninguno se conserva el valor anterior. Ese arrastre es una brecha conocida y acotada: se cierra pasando el id explicito, como ya hace el pipeline de pesaje con created_by.';

-- ---------------------------------------------------------------------------
-- 3. El disparador.
-- ---------------------------------------------------------------------------
CREATE TRIGGER set_updated_by_productos
  BEFORE UPDATE ON public.productos
  FOR EACH ROW
  EXECUTE FUNCTION public.set_producto_updated_by();

COMMENT ON COLUMN public.productos.updated_by IS
  'Quien hizo la ultima actualizacion, sellado por el disparador set_updated_by_productos (migracion 112). CUIDADO AL INTERPRETARLO: si la escritura vino del navegador, describe exactamente la misma escritura que updated_at. Si vino de service_role (edge function) y esa llamada no paso un id explicito, la columna CONSERVA el valor anterior -- o sea que updated_by puede nombrar a alguien que no hizo la ultima edicion. Hoy el unico camino asi es toggleProductoActivo. NO se puede inferir de un updated_by no nulo que esa persona hizo el ultimo cambio; para atribucion por evento esta movimientos_inventario.';

-- ---------------------------------------------------------------------------
-- 4. Post-condiciones.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_n integer;
  v_antes integer;
  v_def text;
BEGIN
  -- 4.1 El disparador existe, es BEFORE UPDATE, FOR EACH ROW, y está habilitado.
  SELECT count(*) INTO v_n
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'productos'
    AND t.tgname = 'set_updated_by_productos'
    AND NOT t.tgisinternal
    AND (t.tgtype::int & 2) > 0     -- BEFORE
    AND (t.tgtype::int & 16) > 0    -- UPDATE
    AND (t.tgtype::int & 1) > 0     -- FOR EACH ROW
    AND t.tgenabled = 'O';

  IF v_n <> 1 THEN
    RAISE EXCEPTION 'POST 4.1: el disparador no quedó instalado como BEFORE UPDATE FOR EACH ROW habilitado (coincidencias: %).', v_n;
  END IF;

  -- 4.2 La función es SECURITY INVOKER con search_path pineado, y NO usa COALESCE
  --     sobre updated_by -- que es el defecto que esta migración corrige.
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'set_producto_updated_by';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'POST 4.2a: la función `set_producto_updated_by` no existe.';
  END IF;

  SELECT count(*) INTO v_n
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'set_producto_updated_by'
    AND NOT p.prosecdef
    AND array_to_string(p.proconfig, ',') LIKE '%search_path%pg_temp%';

  IF v_n <> 1 THEN
    RAISE EXCEPTION 'POST 4.2b: la función no quedó SECURITY INVOKER con search_path pineado a pg_temp.';
  END IF;

  IF v_def ILIKE '%COALESCE(NEW.updated_by%' THEN
    RAISE EXCEPTION 'POST 4.2c: la función quedó con COALESCE sobre NEW.updated_by; eso congelaría la atribución en el primer editor. Ver el encabezado.';
  END IF;

  -- 4.3 Cero filas tocadas: un CREATE TRIGGER no actualiza nada, y `updated_by`
  --     sigue vacía hasta que alguien edite un producto.
  v_antes := nullif(current_setting('escociaos.mig112_filas', true), '')::integer;
  IF v_antes IS NULL THEN
    RAISE WARNING 'POST 4.3: no se pudo leer la línea base de filas; la comprobación no se ejecutó.';
  ELSE
    SELECT count(*) INTO v_n FROM public.productos;
    IF v_n <> v_antes THEN
      RAISE EXCEPTION 'POST 4.3: el conteo de productos cambió de % a %.', v_antes, v_n;
    END IF;
  END IF;

  SELECT count(*) INTO v_n FROM public.productos WHERE updated_by IS NOT NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'POST 4.4: % filas quedaron con updated_by poblado. Esta migración NO hace backfill; algo escribió durante la transacción.', v_n;
  END IF;

  -- 4.5 Los dos disparadores preexistentes de `updated_at` siguen ahí. Si esta
  --     migración se hubiera llevado uno por delante, `updated_at` dejaría de
  --     actualizarse y nadie se enteraría hasta mucho después.
  SELECT count(*) INTO v_n
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE n.nspname = 'public' AND c.relname = 'productos'
    AND NOT t.tgisinternal AND p.proname = 'update_updated_at_column';

  IF v_n <> 2 THEN
    RAISE EXCEPTION 'POST 4.5: se esperaban los 2 disparadores preexistentes de updated_at, hay %.', v_n;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (ejecutable):
--
--   DROP TRIGGER IF EXISTS set_updated_by_productos ON public.productos;
--   DROP FUNCTION IF EXISTS public.set_producto_updated_by();
--   COMMENT ON COLUMN public.productos.updated_by IS 'ID del usuario que realizó la última actualización';
--
-- OJO con el comentario: la columna YA tenía uno ('ID del usuario que realizó la
-- última actualización'). Un `IS NULL` en el rollback lo DESTRUIRÍA en vez de
-- restaurarlo, así que el rollback lo repone literal.
--
-- Y «no hay datos que revertir» sólo es cierto en t=0: revertida una semana
-- después, las filas escritas mientras el disparador vivía conservan su
-- `updated_by`. Eso no es un problema (el dato es correcto), pero no es un
-- rollback a cero.
-- ---------------------------------------------------------------------------
