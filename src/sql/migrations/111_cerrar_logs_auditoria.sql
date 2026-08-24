-- Migración 111: `logs_auditoria` deja de aceptar inserciones sin autenticar.
-- Cierra la PARTE A del hallazgo #19.
--
-- NUMERACIÓN: el número 110 lo ocupa `delete_globalgap_por_rol`, aplicada a
-- producción el 2026-08-24 (ledger `20260824200409`) y abierta en el PR #160.
-- Si al leer esto no ves el fichero 110 en este árbol, es porque ese PR todavía
-- no se fusionó -- no es un hueco.
--
-- ---------------------------------------------------------------------------
-- QUÉ ESTÁ MAL HOY
-- ---------------------------------------------------------------------------
-- La tabla tiene tres políticas y **una de ellas está abierta de par en par**:
--
--   Gerencia acceso total   ALL     TO PUBLIC  USING  (get_user_role() = 'Gerencia')
--   Solo Gerencia lee logs  SELECT  TO PUBLIC  USING  (get_user_role() = 'Gerencia')
--   Todos pueden crear logs INSERT  TO PUBLIC  CHECK  true          <-- esto
--
-- `TO PUBLIC` incluye a `anon`, y `anon` es la llave que viaja en el bundle del
-- navegador. Además `anon` tiene HOY los ocho privilegios de tabla
-- (SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN) por la
-- trampa del `ALTER DEFAULT PRIVILEGES` que documenta la migración 081. O sea
-- que un llamante **sin autenticar** puede insertar filas vía PostgREST, y la
-- tabla tiene dos columnas `jsonb` (`datos_antiguos`, `datos_nuevos`) sin cota
-- de tamaño: es una primitiva de escritura ilimitada contra una base de datos
-- **sin entorno de pruebas**.
--
-- LO QUE HOY NO PASA, dicho con precisión para no inflar el hallazgo: nadie lee
-- esta tabla, así que no hay exposición de lectura. Y está **vacía**: 0 filas,
-- 0 triggers, 0 funciones que la nombren (verificado contra `pg_proc.prosrc`), y
-- la única referencia del repo es el tipo generado en `src/types/database.ts`.
-- El daño no es que se esté explotando: es que **el día que alguien conecte el
-- registro de auditoría, lo primero que hereda es una tabla que un atacante pudo
-- haber envenenado antes**. Un log de auditoría que arranca contaminado no sirve
-- para lo único que sirve un log de auditoría.
--
-- ---------------------------------------------------------------------------
-- QUÉ HACE ESTA MIGRACIÓN, Y POR QUÉ ASÍ
-- ---------------------------------------------------------------------------
-- El modelo correcto ya existe en este proyecto y es el de la migración 084 para
-- `hato_correcciones`: **la app NUNCA escribe la tabla de trazas**. La llena un
-- disparador `SECURITY DEFINER`, que corre como su dueño (`postgres`, con
-- `rolbypassrls`) y por tanto **no necesita ninguna política ni ningún GRANT**.
-- Los roles del navegador quedan con lectura y nada más.
--
-- Así que esto cierra la escritura en dos capas, que es el patrón de la 104:
--
--   1. La política de INSERT deja de ser `true` y pasa a exigir Gerencia, con lo
--      que queda alineada con las otras dos de la tabla. Va con `ALTER POLICY`,
--      **nunca `DROP` + `CREATE`** (precedente 077): es atómico y mantiene la
--      migración dentro del carril estrictamente aditivo, donde `DROP POLICY`
--      descalifica.
--   2. `REVOKE` de los privilegios de tabla. Esta es la capa que de verdad
--      cierra, porque no depende de que ninguna política esté bien escrita.
--
-- `anon` pierde TODO: no tiene ningún motivo para tocar esta tabla, ni siquiera
-- leerla. `authenticated` pierde sólo la escritura y **conserva SELECT**, que es
-- imprescindible: los usuarios de Gerencia se conectan como `authenticated`, y
-- una política RLS no puede devolver filas si el rol no tiene el GRANT de tabla.
-- Quitárselo dejaría la tabla ilegible para todos y rompería la lectura antes de
-- que exista.
--
-- NO SE TOCA la política de SELECT ni la de ALL: ya están acotadas a Gerencia y
-- envueltas como `(SELECT get_user_role())` por la migración 093.
--
-- FILAS AFECTADAS: cero, y no por promesa sino por aritmética -- la tabla tiene
-- 0 filas. La guarda 1.4 aborta si dejaron de ser 0, porque eso significaría que
-- alguien empezó a escribirla y este cambio podría romperlo.
--
-- LO QUE ESTA MIGRACIÓN **NO** HACE: no conecta ningún historial de cambios. Esa
-- es la PARTE B del hallazgo #19 -- extender el disparador genérico de la 084
-- (`fn_hato_registrar_correccion`, ya agnóstico de tabla vía `to_jsonb(OLD)`) a
-- `aplicaciones` y `movimientos_diarios*`, que es decisión tomada del dueño
-- (2026-08-24) y va en su propia migración. Ésta sólo deja la puerta cerrada
-- para cuando eso llegue.

-- ---------------------------------------------------------------------------
-- 1. Pre-condiciones.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_n integer;
  v_check text;
BEGIN
  -- 1.1 La política de INSERT existe y sigue siendo la abierta que describe el
  --     hallazgo: PERMISSIVE, TO PUBLIC, WITH CHECK `true`.
  SELECT count(*) INTO v_n
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'logs_auditoria'
    AND p.polname = 'Todos pueden crear logs'
    AND p.polcmd = 'a'
    AND p.polpermissive
    AND btrim(coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')) = 'true';

  IF v_n <> 1 THEN
    SELECT coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '<no existe>') INTO v_check
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'logs_auditoria' AND p.polname = 'Todos pueden crear logs';

    RAISE EXCEPTION 'PRE 1.1: la política INSERT `Todos pueden crear logs` ya no es la abierta esperada (WITH CHECK actual: %). LA CAUSA MÁS PROBABLE ES QUE ESTA MIGRACIÓN YA SE APLICÓ. Ojo: este repo tiene historial de migraciones aplicadas sin fila en el ledger, así que la ausencia de fila NO prueba que no se aplicó.', coalesce(v_check, '<nulo>');
  END IF;

  -- 1.2 La tabla tiene exactamente 3 políticas: si aparecieron más, el análisis
  --     del hallazgo ya no la describe.
  SELECT count(*) INTO v_n
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'logs_auditoria';

  IF v_n <> 3 THEN
    RAISE EXCEPTION 'PRE 1.2: se esperaban exactamente 3 políticas en logs_auditoria, hay %.', v_n;
  END IF;

  -- 1.3 RLS sigue activo. Sin esto, los GRANT mandan solos y el razonamiento
  --     entero de la migración se cae.
  SELECT count(*) INTO v_n
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'logs_auditoria' AND c.relrowsecurity;

  IF v_n <> 1 THEN
    RAISE EXCEPTION 'PRE 1.3: RLS no está activo en logs_auditoria.';
  END IF;

  -- 1.4 La tabla sigue vacía y sin escritores. Si alguna de las tres dejó de ser
  --     cero, alguien empezó a usarla entre el barrido y ahora, y quitarle la
  --     escritura podría romperlo. Abortar y que lo mire un humano.
  SELECT count(*) INTO v_n FROM public.logs_auditoria;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'PRE 1.4a: logs_auditoria ya no está vacía (% filas). Algo empezó a escribirla; revisar QUÉ antes de revocarle la escritura.', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'logs_auditoria' AND NOT t.tgisinternal;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'PRE 1.4b: aparecieron % triggers en logs_auditoria; revisar antes de seguir.', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND p.prosrc ILIKE '%logs_auditoria%';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'PRE 1.4c: % función(es) nombran logs_auditoria; alguna podría estar escribiéndola.', v_n;
  END IF;

  -- 1.5 `authenticated` tiene hoy el SELECT, y lo tiene que conservar: sin el
  --     GRANT de tabla, la política de lectura de Gerencia no devuelve nada.
  IF NOT has_table_privilege('authenticated', 'public.logs_auditoria', 'SELECT') THEN
    RAISE EXCEPTION 'PRE 1.5: `authenticated` ya no tiene SELECT sobre logs_auditoria; el supuesto de partida no se cumple.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Capa 1 -- la política de INSERT se alinea con las otras dos de la tabla.
-- ---------------------------------------------------------------------------
ALTER POLICY "Todos pueden crear logs"
  ON public.logs_auditoria
  WITH CHECK ((SELECT public.get_user_role()) = 'Gerencia'::public.rol_usuario);

-- ---------------------------------------------------------------------------
-- 3. Capa 2 -- los GRANT. Es la que cierra de verdad, porque no depende de que
--    ninguna política esté bien escrita.
--
--    `anon` pierde todo: no tiene por qué tocar esta tabla ni para leerla.
--    `authenticated` pierde sólo la escritura y CONSERVA SELECT -- Gerencia se
--    conecta como `authenticated`, y una política RLS no puede devolver filas si
--    el rol no tiene el GRANT.
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.logs_auditoria FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.logs_auditoria FROM authenticated;

-- ---------------------------------------------------------------------------
-- 4. Que el catálogo diga la verdad: el nombre de la política quedó mintiendo
--    y `ALTER POLICY` no puede renombrar sin DROP.
-- ---------------------------------------------------------------------------
COMMENT ON POLICY "Todos pueden crear logs" ON public.logs_auditoria IS
  'Migración 111: el nombre es histórico y quedó mintiendo -- ya NO puede crear logs cualquiera. Desde 2026-08-24 exige rol Gerencia, y además `anon` y `authenticated` perdieron el GRANT de INSERT, así que esta política no es lo único que lo impide. El modelo previsto (patrón de la migración 084 para hato_correcciones) es que la tabla la llene un disparador SECURITY DEFINER, que corre como su dueño y no necesita política alguna.';

COMMENT ON TABLE public.logs_auditoria IS
  'Registro de auditoría. DECLARADA PERO NUNCA CONECTADA: 0 filas, 0 triggers, ninguna función la escribe y ningún código de la app la lee. Cerrada a escritura desde el navegador por la migración 111. Para conectarla, el patrón del proyecto es un disparador SECURITY DEFINER como fn_hato_registrar_correccion (migración 084), NO escrituras desde la app.';

-- ---------------------------------------------------------------------------
-- 5. Post-condiciones.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_n integer;
  v_check text;
BEGIN
  -- 5.1 El INSERT ya no es incondicional y nombra a Gerencia.
  SELECT pg_get_expr(p.polwithcheck, p.polrelid) INTO v_check
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'logs_auditoria' AND p.polname = 'Todos pueden crear logs';

  IF v_check IS NULL
     OR btrim(v_check) = 'true'
     OR v_check NOT LIKE '%get_user_role%'
     OR v_check NOT LIKE '%Gerencia%' THEN
    RAISE EXCEPTION 'POST 5.1: el WITH CHECK de INSERT no quedó acotado. Actual: %', coalesce(v_check, '<nulo>');
  END IF;

  -- 5.2 `anon` no conserva NINGÚN privilegio sobre la tabla.
  SELECT count(*) INTO v_n
  FROM (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) v(priv)
  WHERE has_table_privilege('anon', 'public.logs_auditoria', v.priv);

  IF v_n <> 0 THEN
    RAISE EXCEPTION 'POST 5.2: `anon` conserva % privilegio(s) sobre logs_auditoria.', v_n;
  END IF;

  -- 5.3 `authenticated` perdió la escritura...
  SELECT count(*) INTO v_n
  FROM (VALUES ('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) v(priv)
  WHERE has_table_privilege('authenticated', 'public.logs_auditoria', v.priv);

  IF v_n <> 0 THEN
    RAISE EXCEPTION 'POST 5.3: `authenticated` conserva % privilegio(s) de escritura sobre logs_auditoria.', v_n;
  END IF;

  -- 5.4 ...pero CONSERVA SELECT. Sin esto, la lectura de Gerencia queda muerta.
  IF NOT has_table_privilege('authenticated', 'public.logs_auditoria', 'SELECT') THEN
    RAISE EXCEPTION 'POST 5.4: `authenticated` perdió SELECT; la política de lectura de Gerencia dejaría de devolver filas.';
  END IF;

  -- 5.5 Siguen siendo 3 políticas y la tabla sigue vacía.
  SELECT count(*) INTO v_n
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'logs_auditoria';
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'POST 5.5a: quedaron % políticas en vez de 3.', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.logs_auditoria;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'POST 5.5b: logs_auditoria dejó de estar vacía (% filas).', v_n;
  END IF;

  -- 5.6 Las otras dos políticas quedaron intactas, acotadas a Gerencia.
  SELECT count(*) INTO v_n
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'logs_auditoria'
    AND p.polname IN ('Gerencia acceso total', 'Solo Gerencia lee logs')
    AND pg_get_expr(p.polqual, p.polrelid) LIKE '%get_user_role%'
    AND pg_get_expr(p.polqual, p.polrelid) LIKE '%Gerencia%';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'POST 5.6: se esperaban intactas las 2 políticas de Gerencia, coinciden %.', v_n;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (ejecutable, devuelve la tabla a como estaba):
--
--   ALTER POLICY "Todos pueden crear logs" ON public.logs_auditoria WITH CHECK (true);
--   GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.logs_auditoria TO anon;
--   GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.logs_auditoria TO authenticated;
--   COMMENT ON POLICY "Todos pueden crear logs" ON public.logs_auditoria IS NULL;
--   COMMENT ON TABLE public.logs_auditoria IS NULL;
--
-- No hay datos que restaurar: la tabla está y estaba vacía.
-- ---------------------------------------------------------------------------
