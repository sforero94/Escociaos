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
-- POR QUÉ IMPORTA, con un caso concreto: bloquea la investigación del faltante
-- de Naturboro. La escritura del 2026-08-05 19:31:49 que sacó 20 L del libro no
-- se puede atribuir a nadie -- sólo inferir por marcas de tiempo.
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
-- Por eso la asignación es **incondicional**: `updated_by` describe la MISMA
-- escritura que `updated_at`, así que se mueven juntas o no sirven.
--
-- CONSECUENCIA ACEPTADA, dicha de frente: cuando escribe el `service_role` -- el
-- bot de Telegram, una migración, una edge function -- `auth.uid()` es NULL y la
-- columna queda en NULL. Es deliberado y es el criterio de todo el proyecto:
-- **"sin dato" antes que un dato inventado.** Conservar el editor anterior
-- afirmaría que esa persona hizo la última edición, que es falso. Un NULL dice
-- la verdad: la última escritura no es atribuible. Es la misma brecha aceptada
-- que documentan 050/063/074 para el bot.
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
-- `productos.updated_by` sigue NULL en las 341 hasta que alguien edite un
-- producto. Sin FK que pueda fallar: `updated_by` referencia `auth.users(id)` y
-- `auth.uid()` sólo puede devolver un id que existe ahí.

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
  -- INCONDICIONAL, no COALESCE: en un BEFORE UPDATE `NEW.updated_by` arrastra el
  -- valor viejo, así que un COALESCE congelaría la columna en el primer editor
  -- mientras `updated_at` sigue avanzando. NULL cuando escribe el service_role
  -- (bot, migración, edge function) es la respuesta honesta: esa escritura no es
  -- atribuible, y decir que la hizo el editor anterior sería falso.
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.set_producto_updated_by() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_producto_updated_by() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_producto_updated_by() FROM authenticated;

COMMENT ON FUNCTION public.set_producto_updated_by() IS
  'Migración 112: sella `productos.updated_by` con `auth.uid()` en cada UPDATE. La asignación es INCONDICIONAL a propósito -- con COALESCE la columna se congelaría en el primer editor, porque en un BEFORE UPDATE NEW.updated_by arrastra el valor viejo. Escrituras del service_role (bot de Telegram, migraciones, edge functions) dejan NULL: brecha aceptada, igual que en 050/063/074.';

-- ---------------------------------------------------------------------------
-- 3. El disparador.
-- ---------------------------------------------------------------------------
CREATE TRIGGER set_updated_by_productos
  BEFORE UPDATE ON public.productos
  FOR EACH ROW
  EXECUTE FUNCTION public.set_producto_updated_by();

COMMENT ON COLUMN public.productos.updated_by IS
  'Quién hizo la ÚLTIMA actualización de la fila, sellado por el disparador `set_updated_by_productos` (migración 112). NULL significa "no atribuible" -- fila nunca editada desde la migración, o editada por el service_role (bot, migración, edge function), donde auth.uid() es NULL. Nunca se rellena con un valor heredado: se lee junto a `updated_at`, que describe la misma escritura.';

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
--   COMMENT ON COLUMN public.productos.updated_by IS NULL;
--
-- No hay datos que revertir: la migración no escribe ninguna fila.
-- ---------------------------------------------------------------------------
