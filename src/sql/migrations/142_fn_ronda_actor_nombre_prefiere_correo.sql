-- Migración 142: fn_ronda_actor_nombre -- el correo antes que el nombre para mostrar
--
-- Hallazgo #63 del barrido de mantenimiento (2026-09-11), P2, clase ddl_aditivo.
--
-- QUÉ ESTÁ MAL. `fn_ronda_actor_nombre` (migración 126, líneas 358-366, ya
-- aplicada a producción) resuelve el actor de la ronda de inventario así:
--
--   COALESCE(
--     (SELECT t.nombre_display FROM telegram_usuarios t WHERE t.id = p_telegram),
--     (SELECT COALESCE(u.nombre_completo, u.email) FROM usuarios u WHERE u.id = p_usuario),
--     'Ronda de inventario'
--   )
--
-- O sea, un nombre PARA MOSTRAR le gana al correo en las dos ramas. Ese texto
-- va directo a `movimientos_inventario.responsable` desde los dos únicos RPC
-- de la ronda que escriben esa columna: `fn_ronda_resolver_con_captura`
-- (126:826-838) y `fn_ronda_aplicar_ajuste` (126:1172-1181).
--
-- POR QUÉ IMPORTA. `movimientos_inventario` es el libro de trazabilidad de
-- insumos que audita GlobalGAP, y su columna `responsable` es texto libre sin
-- FK: nadie la normaliza y ningún trigger de atribución la rellena (verificado
-- contra `pg_trigger`, 0 triggers no internos). Hasta la primera ronda real la
-- columna era homogénea. Estado en producción 2026-09-11:
--
--   SELECT responsable, count(*) FROM movimientos_inventario GROUP BY 1;
--     aescociahass@gmail.com   142
--     sforero94@gmail.com       18
--     NULL                       3
--     'Santiago Forero'          1   <- 2026-08-29, escrita por este helper
--     santiago@thinksid.co       1
--
-- 161 de 162 filas atribuidas son un correo; la única excepción la escribió
-- esta función. Un segundo formato parte la columna en dos sin que nada falle
-- y sin que nadie lo note.
--
-- Y ES PEOR QUE UN PROBLEMA DE FORMATO: un nombre para mostrar NO IDENTIFICA
-- UNA CUENTA. `usuarios` tiene DOS cuentas de Santiago -- `sforero94@gmail.com`
-- (Gerencia) y `santiago@thinksid.co` (Administrador, 'Santiago Admin') --,
-- un hecho que ya costó caro en la migración 063, donde un backfill apuntó a
-- la cuenta equivocada. El correo es la única clave que el sistema mismo trata
-- como identidad: es la que deriva `fn_cerrar_aplicacion` (migración 106,
-- `auth.jwt() ->> 'email'`) y la que estampan los tres escritores TypeScript
-- (`user?.email`), vigilados por `src/__tests__/movimientoInventarioResponsable.test.ts`.
-- Ese guard no puede ver un RPC, y por eso este defecto entró sin que nada se
-- pusiera rojo. Esta migración viene acompañada de la extensión del guard.
--
-- QUÉ CAMBIA. Sólo el ORDEN del COALESCE, para que el correo gane siempre:
--
--   1. el correo del `usuarios` del actor -- alcanzable por las DOS ramas,
--      porque el camino de Telegram ya lleva `telegram_usuarios.usuario_id`;
--   2. `telegram_usuarios.nombre_display`, que sobrevive SÓLO como respaldo
--      para un usuario de Telegram sin fila en `usuarios` (`usuario_id` es
--      NULLABLE, así que ese caso existe en el modelo aunque hoy no en los
--      datos: las 5 filas vivas tienen `usuario_id`);
--   3. 'Ronda de inventario', el último recurso de la 126, intacto, para que
--      la columna nunca quede vacía en un movimiento nacido de la ronda.
--
-- `usuarios.nombre_completo` desaparece de la expresión a propósito: es el
-- valor que causó el defecto y no aporta nada que el correo no diga mejor.
--
-- `NULLIF(btrim(u.email), '')` es carga útil, no adorno: `usuarios.email` es
-- NOT NULL pero eso no impide la cadena vacía, y un `responsable` en blanco
-- sería peor que el fallback -- contradiría el contrato que el propio
-- comentario de la 126 declara ("para que la columna nunca quede vacía").
--
-- QUÉ **NO** CAMBIA, verificado contra el catálogo vivo antes de escribir esto
-- (`pg_proc`, no el fichero de la 126, que el CLAUDE.md raíz advierte que no es
-- autoritativo sobre el estado aplicado):
--   - firma: fn_ronda_actor_nombre(p_usuario uuid, p_telegram uuid) -> text
--   - `prosecdef = false` (SECURITY INVOKER). Ojo: `pg_get_functiondef` OMITE
--     "SECURITY INVOKER" del DDL por ser el default, así que la comprobación
--     real es la columna, no un ILIKE contra el texto (lección de la 130).
--   - `provolatile = 's'` (STABLE), `LANGUAGE sql`
--   - `proconfig = {search_path=public, pg_temp}`
--   - ACL `{postgres=X, authenticated=X, service_role=X}` -- `anon` sin EXECUTE
--   - NINGUNA política RLS llama a esta función (barrido sobre `pg_policy`, 0
--     filas), así que esta migración no lleva ningún REVOKE ni GRANT: no hay
--     nada que revocar que pudiera tumbar una política, y `CREATE OR REPLACE`
--     preserva OID, dueño y ACL cuando la firma no cambia. Se verifica igual
--     en la postcondición, en vez de confiar en la documentación.
--
-- RAMA AMBIGUA: NO EXISTE. `fn_ronda_validar_actor` (126) aborta con
-- "debe venir exactamente uno de usuario/telegram" cuando los dos parámetros
-- son NULL o los dos son no-NULL, y los DOS llamantes la invocan ANTES de
-- llegar acá (verificado sobre `pg_proc.prosrc`: `fn_ronda_resolver_con_captura`
-- la llama en la posición 873 y usa el nombre en la 3326;
-- `fn_ronda_aplicar_ajuste`, 1128 y 3699). Así que el reordenamiento nunca
-- decide entre dos fuentes presentes a la vez: decide cuál se consulta para
-- la única identidad que llegó.
--
-- RLS: sin cambio de alcance. La función es SECURITY INVOKER y las filas que
-- lee son las mismas que ya leía. Rama navegador: `p_telegram` es NULL por
-- construcción (D-T4), así que sólo se toca la propia fila de `usuarios`, que
-- la política "Usuario ve su perfil" ya permitía leer -- el cuerpo viejo
-- también la leía, para sacar `nombre_completo`. Rama Telegram: corre como
-- `service_role`, que tiene `rolbypassrls`.
--
-- LA FILA HISTÓRICA **NO SE TOCA**. El movimiento del 2026-08-29 sigue
-- diciendo 'Santiago Forero'. Reescribirla es `clase datos`, no `ddl_aditivo`,
-- y exige que Santiago confirme con cuál de sus dos cuentas actuó: el texto
-- guardado no lo dice. Esta migración no contiene ni un UPDATE.
--
-- FILAS AFECTADAS: CERO. No hay UPDATE, DELETE, DROP ni ALTER en este fichero.
--
-- ROLLBACK al pie.

-- ---------------------------------------------------------------------------
-- PRECONDICIONES
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_secdef   BOOLEAN;
  v_volatil  TEXT;
  v_config   TEXT[];
  v_lang     TEXT;
  v_def      TEXT;
  v_acl      TEXT;
  v_total    BIGINT;
  v_email    BIGINT;
  v_nombre   BIGINT;
BEGIN
  -- 1. La 126 tiene que estar aplicada, con la firma exacta que vamos a
  --    reemplazar. Si la firma no coincide, CREATE OR REPLACE crearía una
  --    sobrecarga NUEVA en vez de reemplazar nada, y los dos llamantes
  --    seguirían usando la vieja sin que nada falle.
  IF to_regprocedure('public.fn_ronda_actor_nombre(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION '142 ABORTADA (pre): public.fn_ronda_actor_nombre(uuid, uuid) no existe -- esta migración depende de que la 126 ya esté aplicada.';
  END IF;

  SELECT p.prosecdef, p.provolatile::TEXT, p.proconfig, l.lanname,
         pg_get_functiondef(p.oid), p.proacl::TEXT
    INTO v_secdef, v_volatil, v_config, v_lang, v_def, v_acl
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language  l ON l.oid = p.prolang
   WHERE n.nspname = 'public' AND p.proname = 'fn_ronda_actor_nombre';

  -- 2. Tiene que ser el cuerpo defectuoso (nombre antes que correo). Si ya
  --    prefiere el correo, lo más probable es que esta migración ya se aplicó
  --    -- y este repo tiene historial de migraciones aplicadas sin fila en el
  --    ledger, así que la ausencia de fila NO prueba lo contrario.
  IF v_def NOT ILIKE '%u.nombre_completo, u.email%' THEN
    RAISE EXCEPTION '142 ABORTADA (pre): fn_ronda_actor_nombre ya NO tiene el COALESCE nombre-primero de la 126. Causa más probable: esta migración ya se aplicó. Revisar a mano antes de reintentar. Cuerpo actual: %', v_def;
  END IF;

  -- 3. Metadatos que la migración debe PRESERVAR, no cambiar. Se comprueban
  --    antes para que la postcondición compare contra algo verificado y no
  --    contra una suposición.
  IF v_secdef IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION '142 ABORTADA (pre): se esperaba SECURITY INVOKER (prosecdef=false) y la función viva tiene prosecdef=%.', v_secdef;
  END IF;
  IF v_volatil IS DISTINCT FROM 's' THEN
    RAISE EXCEPTION '142 ABORTADA (pre): se esperaba STABLE (provolatile=s) y la función viva tiene provolatile=%.', v_volatil;
  END IF;
  IF v_lang IS DISTINCT FROM 'sql' THEN
    RAISE EXCEPTION '142 ABORTADA (pre): se esperaba LANGUAGE sql y la función viva usa %.', v_lang;
  END IF;
  IF NOT ('search_path=public, pg_temp' = ANY(COALESCE(v_config, ARRAY[]::TEXT[]))) THEN
    RAISE EXCEPTION '142 ABORTADA (pre): el search_path pineado no está donde se esperaba. proconfig actual: %', v_config;
  END IF;
  IF v_acl IS NULL OR v_acl NOT LIKE '%authenticated=X%' OR v_acl NOT LIKE '%service_role=X%' OR v_acl LIKE '%anon%' THEN
    RAISE EXCEPTION '142 ABORTADA (pre): el ACL de la función no es el esperado (authenticated+service_role, nunca anon). ACL actual: %', v_acl;
  END IF;

  -- 4. Ninguna política RLS puede depender de esta función. Si alguna la
  --    llamara, reemplazarla sería cambiar un predicado de autorización, no
  --    un helper de presentación -- y esta migración no está escrita para eso.
  IF EXISTS (
    SELECT 1 FROM pg_policy pol
     WHERE COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '') LIKE '%fn_ronda_actor_nombre%'
        OR COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), '') LIKE '%fn_ronda_actor_nombre%'
  ) THEN
    RAISE EXCEPTION '142 ABORTADA (pre): alguna política RLS llama a fn_ronda_actor_nombre. Eso no era cierto cuando se escribió esta migración; revisar a mano.';
  END IF;

  -- 5. El cuerpo nuevo hace del correo la rama principal, así que
  --    `usuarios.email` tiene que seguir siendo NOT NULL.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'usuarios'
       AND column_name = 'email' AND is_nullable <> 'NO'
  ) THEN
    RAISE EXCEPTION '142 ABORTADA (pre): usuarios.email dejó de ser NOT NULL. El cuerpo nuevo apoya su rama principal en esa garantía.';
  END IF;

  -- 6. Estado de la columna, SIN NINGÚN LITERAL DE CONTEO. `movimientos_inventario`
  --    es una tabla viva (la escriben la app y dos RPC), así que fijar un
  --    número acá haría que la guarda expirara sola -- el error exacto que la
  --    103 tuvo que corregir y que la 120 y la 133 evitaron. Se informa, no se
  --    afirma. Lo único que aborta es la tabla vacía, que significaría que
  --    estamos mirando otra base.
  SELECT count(*),
         count(*) FILTER (WHERE responsable LIKE '%@%'),
         count(*) FILTER (WHERE responsable IS NOT NULL AND responsable NOT LIKE '%@%')
    INTO v_total, v_email, v_nombre
    FROM movimientos_inventario;

  IF v_total = 0 THEN
    RAISE EXCEPTION '142 ABORTADA (pre): movimientos_inventario está vacía. Esto no es la base de producción.';
  END IF;

  RAISE NOTICE '142 (pre): movimientos_inventario -- % filas, % con correo, % con nombre para mostrar. Esta migración NO toca ninguna.', v_total, v_email, v_nombre;
END $$;

-- ---------------------------------------------------------------------------
-- EL CAMBIO -- sólo el orden del COALESCE. Firma, seguridad, volatilidad,
-- lenguaje y search_path idénticos a la 126.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_ronda_actor_nombre(p_usuario UUID, p_telegram UUID)
RETURNS TEXT
LANGUAGE sql SECURITY INVOKER STABLE SET search_path = public, pg_temp AS $$
  SELECT COALESCE(
    -- 1. El correo del actor. Alcanzable por las DOS ramas: la de navegador
    --    trae `p_usuario`, y la de Telegram llega vía `telegram_usuarios.usuario_id`.
    --    `fn_ronda_validar_actor` garantiza que exactamente uno de los dos
    --    parámetros es no-NULL, así que el COALESCE interno nunca arbitra
    --    entre dos identidades presentes a la vez.
    (SELECT NULLIF(btrim(u.email), '')
       FROM usuarios u
      WHERE u.id = COALESCE(
              p_usuario,
              (SELECT t.usuario_id FROM telegram_usuarios t WHERE t.id = p_telegram)
            )),
    -- 2. Respaldo: un usuario de Telegram sin fila en `usuarios`
    --    (`telegram_usuarios.usuario_id` es NULLABLE).
    (SELECT t.nombre_display FROM telegram_usuarios t WHERE t.id = p_telegram),
    -- 3. Último recurso de la 126, intacto.
    'Ronda de inventario'
  );
$$;

COMMENT ON FUNCTION fn_ronda_actor_nombre(UUID, UUID) IS
  'Creada por la migración 126, corregida por la 142 (2026-09-11): el CORREO '
  'del actor va primero, porque movimientos_inventario.responsable es texto '
  'libre sin FK y el resto del sistema la escribe en formato correo '
  '(fn_cerrar_aplicacion vía auth.jwt(), los tres escritores TypeScript vía '
  'user?.email). Un nombre para mostrar además NO identifica una cuenta: hay '
  'dos cuentas de Santiago en usuarios. nombre_display sobrevive sólo como '
  'respaldo para un usuario de Telegram sin fila en usuarios; '
  '"Ronda de inventario" sigue siendo el último recurso para que la columna '
  'nunca quede vacía en un movimiento nacido de la ronda.';

-- ---------------------------------------------------------------------------
-- POSTCONDICIONES
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_secdef      BOOLEAN;
  v_volatil     TEXT;
  v_config      TEXT[];
  v_lang        TEXT;
  v_def         TEXT;
  v_acl         TEXT;
  v_sobrecargas INT;
  v_malos       BIGINT;
  v_total       BIGINT;
BEGIN
  -- 1. Sigue existiendo UNA sola función con ese nombre, y con la firma de
  --    siempre. Dos sobrecargas significarían que el reemplazo no reemplazó.
  SELECT count(*) INTO v_sobrecargas
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_ronda_actor_nombre';
  IF v_sobrecargas <> 1 THEN
    RAISE EXCEPTION '142 ABORTADA (post): hay % funciones llamadas fn_ronda_actor_nombre; debe haber exactamente una.', v_sobrecargas;
  END IF;
  IF to_regprocedure('public.fn_ronda_actor_nombre(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION '142 ABORTADA (post): la firma (uuid, uuid) desapareció.';
  END IF;

  SELECT p.prosecdef, p.provolatile::TEXT, p.proconfig, l.lanname,
         pg_get_functiondef(p.oid), p.proacl::TEXT
    INTO v_secdef, v_volatil, v_config, v_lang, v_def, v_acl
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language  l ON l.oid = p.prolang
   WHERE n.nspname = 'public' AND p.proname = 'fn_ronda_actor_nombre';

  -- 2. El cuerpo es el nuevo y no quedó rastro del viejo.
  IF v_def NOT ILIKE '%u.email%' THEN
    RAISE EXCEPTION '142 ABORTADA (post): el cuerpo nuevo no lee u.email.';
  END IF;
  IF v_def ILIKE '%nombre_completo%' THEN
    RAISE EXCEPTION '142 ABORTADA (post): el cuerpo todavía menciona nombre_completo -- el reemplazo no tomó.';
  END IF;

  -- 3. Metadatos preservados. `prosecdef`/`provolatile`/`proconfig` son
  --    columnas de pg_proc, no texto a adivinar: pg_get_functiondef OMITE
  --    "SECURITY INVOKER" del DDL por ser el default (lección de la 130).
  IF v_secdef IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION '142 ABORTADA (post): la función quedó SECURITY DEFINER -- debía seguir SECURITY INVOKER.';
  END IF;
  IF v_volatil IS DISTINCT FROM 's' THEN
    RAISE EXCEPTION '142 ABORTADA (post): la volatilidad cambió; se esperaba STABLE y quedó %.', v_volatil;
  END IF;
  IF v_lang IS DISTINCT FROM 'sql' THEN
    RAISE EXCEPTION '142 ABORTADA (post): el lenguaje cambió; se esperaba sql y quedó %.', v_lang;
  END IF;
  IF NOT ('search_path=public, pg_temp' = ANY(COALESCE(v_config, ARRAY[]::TEXT[]))) THEN
    RAISE EXCEPTION '142 ABORTADA (post): el search_path pineado no sobrevivió. proconfig actual: %', v_config;
  END IF;
  IF v_acl IS NULL OR v_acl NOT LIKE '%authenticated=X%' OR v_acl NOT LIKE '%service_role=X%' OR v_acl LIKE '%anon%' THEN
    RAISE EXCEPTION '142 ABORTADA (post): el ACL cambió respecto al esperado (authenticated+service_role, nunca anon). ACL actual: %', v_acl;
  END IF;

  -- 4. COMPORTAMIENTO contra los datos vivos, sin un solo literal de conteo:
  --    todo predicado se afirma como "cero filas que lo violen", así que la
  --    guarda no expira cuando crece el padrón.
  --    4a. Rama navegador: el nombre del actor ES su correo, para TODA cuenta.
  SELECT count(*) INTO v_malos
    FROM usuarios u
   WHERE fn_ronda_actor_nombre(u.id, NULL) IS DISTINCT FROM u.email;
  IF v_malos <> 0 THEN
    RAISE EXCEPTION '142 ABORTADA (post): % cuentas de usuarios no resuelven a su propio correo.', v_malos;
  END IF;

  --    4b. Rama Telegram CON vínculo: resuelve al correo de su usuario.
  SELECT count(*) INTO v_malos
    FROM telegram_usuarios t
    JOIN usuarios u ON u.id = t.usuario_id
   WHERE fn_ronda_actor_nombre(NULL, t.id) IS DISTINCT FROM u.email;
  IF v_malos <> 0 THEN
    RAISE EXCEPTION '142 ABORTADA (post): % usuarios de Telegram vinculados no resuelven al correo de su cuenta.', v_malos;
  END IF;

  --    4c. Rama Telegram SIN vínculo: conserva el respaldo nombre_display.
  --        Hoy este conjunto está vacío y la comprobación pasa en vacío a
  --        propósito -- es el caso que el modelo permite y los datos todavía
  --        no tienen.
  SELECT count(*) INTO v_malos
    FROM telegram_usuarios t
   WHERE t.usuario_id IS NULL
     AND fn_ronda_actor_nombre(NULL, t.id) IS DISTINCT FROM t.nombre_display;
  IF v_malos <> 0 THEN
    RAISE EXCEPTION '142 ABORTADA (post): % usuarios de Telegram sin vínculo perdieron su respaldo nombre_display.', v_malos;
  END IF;

  --    4d. Último recurso intacto.
  IF fn_ronda_actor_nombre(NULL, NULL) IS DISTINCT FROM 'Ronda de inventario' THEN
    RAISE EXCEPTION '142 ABORTADA (post): el último recurso dejó de ser "Ronda de inventario" (devolvió %).', fn_ronda_actor_nombre(NULL, NULL);
  END IF;

  -- 5. La tabla no se tocó. Sin literales: sólo se exige que siga teniendo
  --    filas y se informa el reparto para el registro de la aplicación.
  SELECT count(*), count(*) FILTER (WHERE responsable IS NOT NULL AND responsable NOT LIKE '%@%')
    INTO v_total, v_malos
    FROM movimientos_inventario;
  IF v_total = 0 THEN
    RAISE EXCEPTION '142 ABORTADA (post): movimientos_inventario quedó vacía. Esta migración no debía tocar ni una fila.';
  END IF;

  RAISE NOTICE '142 (post): OK. movimientos_inventario sigue con % filas, % atribuidas con nombre para mostrar (histórico, NO reparado acá -- es clase datos y necesita la confirmación de Santiago sobre cuál de sus dos cuentas actuó).', v_total, v_malos;
END $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (no ejecutar salvo instrucción explícita del dueño). Restaura el
-- cuerpo literal que aplicó la 126 -- ver src/sql/migrations/126_ronda_inventario_rpcs.sql.
-- Revertir esto vuelve a escribir nombres para mostrar en la columna de
-- trazabilidad que audita GlobalGAP.
--
--   CREATE OR REPLACE FUNCTION fn_ronda_actor_nombre(p_usuario UUID, p_telegram UUID)
--   RETURNS TEXT
--   LANGUAGE sql SECURITY INVOKER STABLE SET search_path = public, pg_temp AS $x$
--     SELECT COALESCE(
--       (SELECT t.nombre_display FROM telegram_usuarios t WHERE t.id = p_telegram),
--       (SELECT COALESCE(u.nombre_completo, u.email) FROM usuarios u WHERE u.id = p_usuario),
--       'Ronda de inventario'
--     );
--   $x$;
-- ---------------------------------------------------------------------------
