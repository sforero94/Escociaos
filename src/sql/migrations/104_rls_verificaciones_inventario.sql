-- =============================================================================
-- 104_rls_verificaciones_inventario.sql
--
-- Cierra el hallazgo ESCO-18 (P1, corrida 2026-08-10): las dos tablas de
-- verificacion fisica de inventario -- `verificaciones_inventario` y
-- `verificaciones_detalle` -- aceptan LECTURA Y ESCRITURA SIN AUTENTICAR con la
-- llave `anon` que viaja en el bundle del navegador y esta publicada en un repo
-- que GitHub reporta como `visibility=public`.
--
-- La causa son 6 policies (3 por tabla) `PERMISSIVE`, `TO public` -- el
-- pseudo-rol PUBLIC, al que `anon` pertenece -- con predicado literalmente
-- `true`:
--
--   verificaciones_inventario   verificaciones_detalle       cmd     predicado
--   --------------------------- ---------------------------- ------- ---------
--   Todos pueden ver verificac. Todos pueden ver detalles     SELECT  qual true
--   Usuarios pueden crear ver.  Usuarios pueden crear det.    INSERT  check true
--   Usuarios pueden actualizar  Usuarios pueden actualizar    UPDATE  qual true
--
-- No hay ninguna policy `RESTRICTIVE` que las contenga, `relrowsecurity=true`
-- en ambas (o sea que estan vivas), y `anon` tiene ademas los GRANT de tabla
-- completos. DELETE no esta cubierto por ninguna de las tres, asi que el dano
-- alcanzable es corrupcion silenciosa (sobreescribir `cantidad_fisica`,
-- `diferencia`, `ajuste_realizado`, `aprobado`), no destruccion.
--
-- El hallazgo quedo en P1 y no en P0 porque la verificacion adversarial de la
-- corrida establecio que el dano NO SE PROPAGA al inventario real:
-- `aplicar_ajustes_verificacion()` -- la unica funcion que empujaria estas
-- filas hacia `productos` / `movimientos_inventario` -- es codigo muerto
-- (parametro `integer` contra columnas `uuid`, sin operador `uuid = integer`) y
-- ademas `SECURITY INVOKER`, y la RLS de esas dos tablas aguanta contra `anon`.
-- Eso NO se vuelve a litigar aqui.
--
--
-- RE-VERIFICADO CONTRA PRODUCCION EL 2026-08-20 (solo SELECT), despues de las
-- migraciones 094-102:
--
--   * Las 6 policies siguen ahi, siguen `PERMISSIVE`, siguen `{public}` y
--     siguen con predicado `true`. Ninguna fue endurecida desde el 2026-08-10.
--   * `anon` conserva SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER
--     sobre ambas tablas.
--   * `verificaciones_inventario` = 1 fila, `verificaciones_detalle` = 223.
--     La unica verificacion es la abandonada del 2026-07-30, estado
--     "En proceso", con 0 de 223 productos contados. Sigue siendo terminable
--     por la UI despues de esta migracion -- ver la seccion de call sites.
--   * Los 3 triggers vivos (`trigger_calcular_diferencias`,
--     `update_verificaciones_*_updated_at`) son `SECURITY INVOKER` pero solo
--     calculan columnas de la propia fila; ninguno escribe en otra tabla, asi
--     que no necesitan permisos adicionales.
--
--
-- DE DONDE SALE EL PATRON QUE SE APLICA (no se inventa: se copia del vecindario)
-- -----------------------------------------------------------------------------
-- Estado vivo de las tablas hermanas del modulo Inventario, leido de
-- `pg_policies` el 2026-08-20:
--
--   movimientos_inventario : "Gerencia acceso total"          ALL    Gerencia
--                            "Administrador puede todo ..."   ALL    Administrador
--                            "Verificador lee movimientos"    SELECT Verificador
--   compras                : "Gerencia acceso total"          ALL    Gerencia
--                            "Administrador puede todo ..."   ALL    Administrador
--   productos              : "Gerencia acceso total"          ALL    Gerencia
--                            "Administrador lectura/escritura/actualiza"
--                            "Usuarios autenticados leen productos" SELECT true
--                                                                   TO authenticated
--                            "Verificador lee productos"      SELECT Verificador
--
-- O sea: LECTURA para `authenticated`, ESCRITURA predicada por rol
-- (Administrador + Gerencia, mas Verificador donde aplica) -- el patron de la
-- 044. Ninguna tabla vecina tiene una policy `TO public` con predicado `true`,
-- y ninguna tiene una policy `ALL TO authenticated USING(true)`.
--
-- Las verificaciones SI tienen esa ultima, una por tabla:
-- `Usuarios autenticados - verificaciones` y
-- `Usuarios autenticados - verificaciones detalle`, ambas `ALL`,
-- `TO authenticated`, `USING true WITH CHECK true`. Es la que hoy le da acceso
-- real al rol Administrador, porque -- a diferencia de las tablas vecinas --
-- estas dos NO tienen policy de Administrador. Tambien es la que vuelve
-- decorativa toda la estructura de roles: mientras exista, endurecer las 6 no
-- cambia nada para `authenticated`. Por eso esta migracion tambien la
-- reemplaza, en vez de dejarla.
--
--
-- ESTADO FINAL (6 policies por tabla, igual que ahora)
-- -----------------------------------------------------------------------------
--   SELECT  -> `authenticated`, `USING (true)`      [policy ALTERada en sitio]
--   INSERT  -> Administrador                        [policy ALTERada en sitio]
--   UPDATE  -> Administrador                        [policy ALTERada en sitio]
--   DELETE  -> Administrador                        [policy NUEVA]
--   ALL     -> Gerencia      ("Gerencia acceso total", intacta)
--   ALL     -> Verificador   ("Verificador puede todo ...", intacta)
--
-- La union de esas 6 le da a Administrador, Gerencia y Verificador exactamente
-- lo que tienen hoy. `anon` pierde todo. Un `authenticated` SIN fila en
-- `usuarios` (`get_user_role()` devuelve NULL) queda en solo-lectura en vez de
-- lectura-escritura: es una mejora estricta y es como se comporta cualquier
-- otra tabla de la app.
--
-- `rol_usuario` tiene exactamente 3 valores en produccion
-- (Administrador, Verificador, Gerencia) y los 8 usuarios se reparten en 3
-- Administrador + 5 Gerencia. No hay ningun usuario Verificador hoy; su policy
-- se conserva igual porque el rol existe y la UI no lo bloquea.
--
--
-- POR QUE `ALTER POLICY` Y NO `DROP` + `CREATE`
-- -----------------------------------------------------------------------------
-- Mismo razonamiento de la 077/093: `ALTER POLICY` es atomico y no abre una
-- ventana en la que la tabla se quede sin esa policy. Las 3 policies por tabla
-- que solo cambian de predicado y de rol destinatario se ALTERan en sitio. La
-- unica que se borra es la `ALL TO authenticated` -- `ALTER POLICY` no puede
-- cambiar el `cmd`, asi que ahi no hay alternativa -- y se borra DESPUES de que
-- sus reemplazos ya existen, dentro de la misma transaccion.
--
--
-- POR QUE CADA `get_user_role()` VA ENVUELTA COMO `(SELECT ...)`
-- -----------------------------------------------------------------------------
-- No es estilo. Una llamada suelta en un predicado de RLS se re-evalua UNA VEZ
-- POR FILA; envuelta en una subconsulta escalar no correlacionada, el planeador
-- la sube a un InitPlan y la evalua una vez por sentencia. La 077 (62 policies)
-- y la 093 (97 llamadas, incluidas las de estas dos tablas) existen exactamente
-- para eso. La medicion de la 093 sobre produccion, con buffers calientes:
--
--   count(*) from fin_gastos  where es_usuario_gerencia()  126,3 ms / 9.367 buf
--   ... envuelta como (SELECT ...)                           3,2 ms /   517 buf
--   count(*) from monitoreos  where get_user_role() = ...   155,4 ms / 8.821 buf
--   ... envuelta como (SELECT ...)                            2,8 ms /   471 buf
--
-- Una llamada suelta nueva reintroduce el aviso `auth_rls_initplan` del linter
-- que esas dos migraciones cerraron. Las policies de Gerencia y de Verificador
-- que esta migracion NO toca ya vienen envueltas por la 093; se verifica al
-- cierre que sigan asi.
--
-- Aca no aparece `auth.uid()` ni `es_usuario_gerencia()`: el predicado del
-- vecindario es `get_user_role()`, y se copia tal cual.
--
--
-- REVOKE A `anon` -- SEGUNDA CAPA, NO DECORACION
-- -----------------------------------------------------------------------------
-- Con las policies corregidas, `anon` ya no ve ni escribe una fila. Igual se le
-- quitan los GRANT de tabla, por el precedente de la 081 (donde el REVOKE era
-- lo unico que sostenia el cierre) y de la 082 parte 4 (`kv_store_1ccce916` y
-- `telegram_*`, cuyo deny-all dejo de descansar solo en RLS). Defensa en
-- profundidad: si alguien vuelve a crear una policy laxa, el GRANT ya no esta.
--
-- SOLO a `anon`. `authenticated` conserva sus GRANT intactos -- sin ellos
-- PostgREST le responde `permission denied` a la app antes de mirar RLS.
--
--
-- NO ES IDEMPOTENTE, A PROPOSITO. Correrla dos veces aborta en la guarda 0
-- ("se esperaban 6 ...; hay 0") sin tocar nada. Una migracion que endurece
-- permisos no debe "arreglar" en silencio un estado que ya no reconoce: si el
-- catalogo no es el que este archivo documenta, alguien mas lo movio y hay que
-- mirar antes.
--
-- ENSAYADA EN UNA REPLICA LOCAL (Postgres 16, desechable) con el estado previo
-- exacto de produccion -- roles `anon`/`authenticated`/`service_role`, el enum
-- `rol_usuario`, `get_user_role()`, las dos tablas, las 12 policies y los GRANT.
-- Resultado: aplica limpio, ambas guardas pasan, y despues
--   * `anon` recibe `permission denied` en SELECT, INSERT y UPDATE;
--   * Administrador completa el flujo entero (crear cabecera + 1 renglon por
--     producto, grabar `cantidad_fisica`, cerrar la verificacion);
--   * Gerencia y Verificador escriben por sus policies `ALL`;
--   * un `authenticated` sin fila en `usuarios` lee pero no escribe.
-- El bloque de ROLLBACK del pie se ejecuto tal cual y devolvio el catalogo al
-- estado previo exacto (12 policies, 6 siempre-verdaderas, 2 blanket, `anon`
-- con GRANT); la migracion vuelve a aplicar limpio despues.
--
-- ESTA MIGRACION DEBE CORRERSE COMO UNA SOLA TRANSACCION (el editor SQL de
-- Supabase ya lo hace). Las guardas usan `RAISE EXCEPTION` y dependen de que un
-- resultado inesperado deshaga todo, como en 075/076/080/081.
--
-- No toca ni una fila de datos. 0 filas escritas; 7 objetos de policy por tabla
-- (3 ALTER + 1 CREATE + 1 DROP) y 1 REVOKE por tabla.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. Guarda de entrada -- el estado previo tiene que ser EXACTAMENTE el que
--    documenta el hallazgo. Si ya lo endurecieron por otra via, o si alguien
--    creo policies nuevas, hay que mirar antes de tocar.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_siempre_true  integer;
  v_blanket       integer;
  v_gerencia      integer;
  v_verificador   integer;
  v_total         integer;
  v_rls_v         boolean;
  v_rls_d         boolean;
BEGIN
  SELECT relrowsecurity INTO v_rls_v FROM pg_class
    WHERE oid = 'public.verificaciones_inventario'::regclass;
  SELECT relrowsecurity INTO v_rls_d FROM pg_class
    WHERE oid = 'public.verificaciones_detalle'::regclass;

  IF NOT v_rls_v OR NOT v_rls_d THEN
    RAISE EXCEPTION
      '104 ABORTADA: RLS no esta habilitada en ambas tablas (inventario=%, detalle=%). '
      'Sin RLS las policies son decoracion; hay que investigar antes de tocarlas.',
      v_rls_v, v_rls_d;
  END IF;

  -- Las 6 policies del hallazgo: permisivas, al pseudo-rol PUBLIC (`{0}`),
  -- con predicado `true` en `USING` o en `WITH CHECK`.
  SELECT count(*) INTO v_siempre_true
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relname IN ('verificaciones_inventario', 'verificaciones_detalle')
     AND p.polpermissive
     AND p.polroles = '{0}'::oid[]
     AND COALESCE(pg_get_expr(p.polqual,      p.polrelid), 'true') = 'true'
     AND COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), 'true') = 'true';

  IF v_siempre_true <> 6 THEN
    RAISE EXCEPTION
      '104 ABORTADA: se esperaban 6 policies siempre-verdaderas TO PUBLIC sobre las tablas de verificacion; hay %. '
      'El estado de produccion cambio respecto del hallazgo ESCO-18 (re-verificado 2026-08-20): revisar a mano.',
      v_siempre_true;
  END IF;

  -- Las 2 policies `ALL TO authenticated USING(true) WITH CHECK(true)` que
  -- tambien se reemplazan.
  SELECT count(*) INTO v_blanket
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relname IN ('verificaciones_inventario', 'verificaciones_detalle')
     AND p.polname IN ('Usuarios autenticados - verificaciones',
                       'Usuarios autenticados - verificaciones detalle')
     AND p.polcmd = '*';

  IF v_blanket <> 2 THEN
    RAISE EXCEPTION
      '104 ABORTADA: se esperaban las 2 policies "Usuarios autenticados - verificaciones[ detalle]" (cmd=ALL); hay %.',
      v_blanket;
  END IF;

  -- Las policies de rol que esta migracion NO toca, y de las que depende el
  -- estado final: si no estan, el resultado dejaria a Gerencia sin acceso.
  SELECT count(*) INTO v_gerencia
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relname IN ('verificaciones_inventario', 'verificaciones_detalle')
     AND p.polname = 'Gerencia acceso total' AND p.polcmd = '*';

  SELECT count(*) INTO v_verificador
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relname IN ('verificaciones_inventario', 'verificaciones_detalle')
     AND p.polname IN ('Verificador puede todo en verificaciones',
                       'Verificador puede todo en verificaciones_detalle')
     AND p.polcmd = '*';

  IF v_gerencia <> 2 OR v_verificador <> 2 THEN
    RAISE EXCEPTION
      '104 ABORTADA: faltan las policies de rol preexistentes (Gerencia=%, Verificador=%; se esperaban 2 y 2). '
      'El estado final depende de ellas para no dejar a Gerencia sin escritura.',
      v_gerencia, v_verificador;
  END IF;

  SELECT count(*) INTO v_total
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relname IN ('verificaciones_inventario', 'verificaciones_detalle');

  IF v_total <> 12 THEN
    RAISE EXCEPTION
      '104 ABORTADA: se esperaban 12 policies en total sobre las dos tablas (6 + 6); hay %. '
      'Aparecio o desaparecio alguna: revisar antes de continuar.',
      v_total;
  END IF;

  RAISE NOTICE '104: estado previo verificado -- 6 policies siempre-verdaderas TO PUBLIC, 2 blanket a authenticated, 12 en total.';
END $$;


-- =============================================================================
-- 1. verificaciones_inventario
-- =============================================================================

-- 1a. SELECT: de "todo internet" a "cualquier sesion autenticada".
--     El predicado sigue siendo `true` a proposito -- es el mismo contrato que
--     "Usuarios autenticados leen productos" en la tabla vecina. Lo que cambia
--     es el destinatario: `TO authenticated` excluye a `anon`.
--     Esta policy es la que sostiene `VerificacionesList` (lee por la vista
--     `vista_resumen_verificaciones`, que es `security_invoker=true` y por lo
--     tanto aplica la RLS de quien consulta) y las lecturas de `ConteoFisico`.
ALTER POLICY "Todos pueden ver verificaciones"
  ON public.verificaciones_inventario
  TO authenticated
  USING (true);

ALTER POLICY "Todos pueden ver verificaciones"
  ON public.verificaciones_inventario
  RENAME TO "Usuarios autenticados leen verificaciones";

-- 1b. INSERT: pasa a ser la policy de Administrador.
--     Gerencia y Verificador ya insertan por sus policies `ALL`, que no se
--     tocan. `NuevaVerificacion.tsx` crea la cabecera aca.
ALTER POLICY "Usuarios pueden crear verificaciones"
  ON public.verificaciones_inventario
  TO authenticated
  WITH CHECK ((SELECT get_user_role()) = 'Administrador'::rol_usuario);

ALTER POLICY "Usuarios pueden crear verificaciones"
  ON public.verificaciones_inventario
  RENAME TO "Administrador crea verificaciones";

-- 1c. UPDATE: idem. `ConteoFisico.tsx` cierra la verificacion aca
--     (estado -> 'Pendiente Aprobacion'). Se pone `WITH CHECK` explicito: sin
--     el, un UPDATE solo se valida contra `USING`, y queremos que la fila
--     resultante tambien tenga que pasar el mismo predicado.
ALTER POLICY "Usuarios pueden actualizar verificaciones"
  ON public.verificaciones_inventario
  TO authenticated
  USING      ((SELECT get_user_role()) = 'Administrador'::rol_usuario)
  WITH CHECK ((SELECT get_user_role()) = 'Administrador'::rol_usuario);

ALTER POLICY "Usuarios pueden actualizar verificaciones"
  ON public.verificaciones_inventario
  RENAME TO "Administrador actualiza verificaciones";

-- 1d. DELETE: policy NUEVA. Hoy Administrador puede borrar por la policy
--     blanket que este archivo elimina en 1e; sin esta, la migracion le
--     quitaria una capacidad que tiene. Ninguna ruta de la app borra estas
--     filas (verificado con grep), pero el objetivo es cerrarle la puerta a
--     `anon`, no recortarle nada a un usuario real. Ademas deja a Administrador
--     con el mismo alcance que tiene en `movimientos_inventario` y `compras`
--     ("Administrador puede todo", ALL).
CREATE POLICY "Administrador elimina verificaciones"
  ON public.verificaciones_inventario
  FOR DELETE
  TO authenticated
  USING ((SELECT get_user_role()) = 'Administrador'::rol_usuario);

-- 1e. Fuera la policy blanket. Se borra AL FINAL: 1a-1d ya cubren todo lo que
--     ella cubria para los roles reales, asi que en ningun instante de la
--     transaccion la tabla queda sin policy aplicable.
DROP POLICY "Usuarios autenticados - verificaciones"
  ON public.verificaciones_inventario;

-- 1f. Segunda capa: `anon` pierde los GRANT de tabla.
REVOKE ALL ON TABLE public.verificaciones_inventario FROM anon;


-- =============================================================================
-- 2. verificaciones_detalle  (mismo tratamiento, mismos motivos)
-- =============================================================================

-- 2a. SELECT para `authenticated`. Sostiene la carga de los 223 renglones en
--     `ConteoFisico.tsx` y el JOIN de la vista de resumen.
ALTER POLICY "Todos pueden ver detalles"
  ON public.verificaciones_detalle
  TO authenticated
  USING (true);

ALTER POLICY "Todos pueden ver detalles"
  ON public.verificaciones_detalle
  RENAME TO "Usuarios autenticados leen detalles de verificacion";

-- 2b. INSERT -- `NuevaVerificacion.tsx` inserta un renglon por producto activo.
ALTER POLICY "Usuarios pueden crear detalles"
  ON public.verificaciones_detalle
  TO authenticated
  WITH CHECK ((SELECT get_user_role()) = 'Administrador'::rol_usuario);

ALTER POLICY "Usuarios pueden crear detalles"
  ON public.verificaciones_detalle
  RENAME TO "Administrador crea detalles de verificacion";

-- 2c. UPDATE -- es EL camino de escritura del conteo fisico:
--     `ConteoFisico.tsx` graba `cantidad_fisica` producto por producto, y el
--     trigger `trigger_calcular_diferencias` deriva el resto. Es tambien el
--     write que un anonimo podia falsificar.
ALTER POLICY "Usuarios pueden actualizar detalles"
  ON public.verificaciones_detalle
  TO authenticated
  USING      ((SELECT get_user_role()) = 'Administrador'::rol_usuario)
  WITH CHECK ((SELECT get_user_role()) = 'Administrador'::rol_usuario);

ALTER POLICY "Usuarios pueden actualizar detalles"
  ON public.verificaciones_detalle
  RENAME TO "Administrador actualiza detalles de verificacion";

-- 2d. DELETE (nueva), por la misma razon que 1d.
CREATE POLICY "Administrador elimina detalles de verificacion"
  ON public.verificaciones_detalle
  FOR DELETE
  TO authenticated
  USING ((SELECT get_user_role()) = 'Administrador'::rol_usuario);

-- 2e. Fuera la blanket.
DROP POLICY "Usuarios autenticados - verificaciones detalle"
  ON public.verificaciones_detalle;

-- 2f. `anon` pierde los GRANT.
REVOKE ALL ON TABLE public.verificaciones_detalle FROM anon;


-- -----------------------------------------------------------------------------
-- 3. Comentarios -- dejar escrito en el catalogo por que estas tablas estan
--    asi, para que la proxima persona no "arregle" el endurecimiento.
-- -----------------------------------------------------------------------------

COMMENT ON TABLE public.verificaciones_inventario IS
  'Cabecera de la verificacion fisica de inventario. RLS endurecida por la '
  'migracion 104 (hallazgo ESCO-18): lectura para `authenticated`, escritura '
  'para Administrador + Gerencia + Verificador. Antes tenia 3 policies TO PUBLIC '
  'con predicado `true`, o sea lectura y escritura sin autenticar con la llave '
  '`anon` publicada. `anon` no tiene GRANT sobre esta tabla: no reponerlos.';

COMMENT ON TABLE public.verificaciones_detalle IS
  'Renglon por producto de una verificacion fisica. RLS endurecida por la '
  'migracion 104 (hallazgo ESCO-18), mismo criterio que la cabecera. El UPDATE '
  'de `cantidad_fisica` era escribible por cualquiera en internet. `anon` no '
  'tiene GRANT sobre esta tabla: no reponerlos.';


-- -----------------------------------------------------------------------------
-- 4. Guardas de cierre -- se verifica el estado final DENTRO de la misma
--    transaccion, para que cualquier sorpresa deshaga todo lo anterior.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  t             text;
  v_siempre_true integer;
  v_total       integer;
  v_sueltas     integer;
  v_select      integer;
  v_admin       integer;
BEGIN
  -- 4a. Cero policies siempre-verdaderas alcanzables por PUBLIC/`anon`.
  SELECT count(*) INTO v_siempre_true
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relname IN ('verificaciones_inventario', 'verificaciones_detalle')
     AND p.polpermissive
     AND (p.polroles = '{0}'::oid[] OR 'anon' = ANY (
            SELECT pg_get_userbyid(r) FROM unnest(p.polroles) AS r))
     AND COALESCE(pg_get_expr(p.polqual,      p.polrelid), 'true') = 'true'
     AND COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), 'true') = 'true';

  IF v_siempre_true <> 0 THEN
    RAISE EXCEPTION
      '104 ABORTADA: quedan % policies siempre-verdaderas alcanzables por PUBLIC/anon. El agujero sigue abierto.',
      v_siempre_true;
  END IF;

  -- 4b. 6 policies por tabla, 12 en total (se ALTERaron 3, se creo 1, se borro 1).
  SELECT count(*) INTO v_total
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relname IN ('verificaciones_inventario', 'verificaciones_detalle');

  IF v_total <> 12 THEN
    RAISE EXCEPTION '104 ABORTADA: se esperaban 12 policies al cierre (6 por tabla); hay %.', v_total;
  END IF;

  -- 4c. Ninguna llamada suelta a los helpers -- ni las que toca esta migracion
  --     ni las de Gerencia/Verificador que la 093 ya envolvio. Una suelta
  --     reintroduce `auth_rls_initplan`.
  SELECT count(*) INTO v_sueltas
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    CROSS JOIN LATERAL (VALUES
        (COALESCE(pg_get_expr(p.polqual,      p.polrelid), '')),
        (COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), ''))) AS e(expr)
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relname IN ('verificaciones_inventario', 'verificaciones_detalle')
     AND e.expr ~ '(get_user_role|es_usuario_gerencia|auth\.uid)\s*\('
     AND e.expr !~ 'SELECT\s+(get_user_role|es_usuario_gerencia|auth\.uid)';

  IF v_sueltas <> 0 THEN
    RAISE EXCEPTION
      '104 ABORTADA: % expresiones de policy llaman a un helper SIN envolver en (SELECT ...). '
      'Eso lo re-evalua por fila y revierte lo que cerraron 077 y 093.',
      v_sueltas;
  END IF;

  -- 4d. Cada tabla conserva exactamente 1 policy de SELECT para `authenticated`
  --     y las 3 de Administrador (INSERT/UPDATE/DELETE). Sin esto, la
  --     verificacion abandonada del 2026-07-30 no se podria ni abrir ni
  --     terminar desde la UI.
  FOREACH t IN ARRAY ARRAY['verificaciones_inventario', 'verificaciones_detalle'] LOOP
    SELECT count(*) INTO v_select
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
     WHERE c.relnamespace = 'public'::regnamespace AND c.relname = t
       AND p.polcmd = 'r'
       AND 'authenticated' = ANY (SELECT pg_get_userbyid(r) FROM unnest(p.polroles) AS r)
       AND COALESCE(pg_get_expr(p.polqual, p.polrelid), '') = 'true';

    SELECT count(*) INTO v_admin
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
     WHERE c.relnamespace = 'public'::regnamespace AND c.relname = t
       AND p.polcmd IN ('a', 'w', 'd')
       AND COALESCE(pg_get_expr(p.polqual, p.polrelid), '')
           || COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '') LIKE '%Administrador%';

    IF v_select <> 1 THEN
      RAISE EXCEPTION
        '104 ABORTADA: % deberia tener 1 policy de SELECT `true` TO authenticated; tiene %. La UI de verificaciones quedaria ciega.',
        t, v_select;
    END IF;

    IF v_admin <> 3 THEN
      RAISE EXCEPTION
        '104 ABORTADA: % deberia tener 3 policies de escritura de Administrador (INSERT/UPDATE/DELETE); tiene %.',
        t, v_admin;
    END IF;
  END LOOP;

  -- 4e. `anon` sin un solo privilegio, y `authenticated` con los suyos intactos.
  --     El segundo chequeo es tan importante como el primero: revocarle de mas
  --     a `authenticated` deja a PostgREST respondiendo `permission denied`
  --     antes siquiera de mirar la RLS, y tumba el modulo entero.
  FOREACH t IN ARRAY ARRAY['verificaciones_inventario', 'verificaciones_detalle'] LOOP
    IF has_table_privilege('anon', 'public.' || t, 'SELECT')
       OR has_table_privilege('anon', 'public.' || t, 'INSERT')
       OR has_table_privilege('anon', 'public.' || t, 'UPDATE')
       OR has_table_privilege('anon', 'public.' || t, 'DELETE') THEN
      RAISE EXCEPTION '104 ABORTADA: `anon` todavia tiene privilegios de tabla sobre public.%.', t;
    END IF;

    IF NOT (has_table_privilege('authenticated', 'public.' || t, 'SELECT')
            AND has_table_privilege('authenticated', 'public.' || t, 'INSERT')
            AND has_table_privilege('authenticated', 'public.' || t, 'UPDATE')) THEN
      RAISE EXCEPTION
        '104 ABORTADA: `authenticated` perdio GRANT sobre public.%. Sin ellos PostgREST rechaza a la app antes de evaluar RLS.', t;
    END IF;
  END LOOP;

  RAISE NOTICE '104 OK: 0 policies siempre-verdaderas a PUBLIC/anon, 12 policies (6+6), 0 helpers sin envolver, SELECT para authenticated y escritura Administrador+Gerencia+Verificador en ambas tablas, `anon` sin GRANT.';
END $$;


-- =============================================================================
-- ROLLBACK  (ejecutable tal cual; REABRE la vulnerabilidad)
-- =============================================================================
-- Devuelve las dos tablas al estado previo exacto: 6 policies siempre-
-- verdaderas `TO public`, las 2 blanket `ALL TO authenticated`, sin policies de
-- Administrador, y `anon` con los GRANT de vuelta. Solo tiene sentido si un
-- consumidor que no aparece en `src/` estuviera leyendo estas tablas con la
-- llave `anon` -- lo cual seria, en si mismo, el hallazgo.
--
--   -- verificaciones_inventario
--   ALTER POLICY "Usuarios autenticados leen verificaciones"
--     ON public.verificaciones_inventario RENAME TO "Todos pueden ver verificaciones";
--   ALTER POLICY "Todos pueden ver verificaciones"
--     ON public.verificaciones_inventario TO public USING (true);
--
--   ALTER POLICY "Administrador crea verificaciones"
--     ON public.verificaciones_inventario RENAME TO "Usuarios pueden crear verificaciones";
--   ALTER POLICY "Usuarios pueden crear verificaciones"
--     ON public.verificaciones_inventario TO public WITH CHECK (true);
--
--   ALTER POLICY "Administrador actualiza verificaciones"
--     ON public.verificaciones_inventario RENAME TO "Usuarios pueden actualizar verificaciones";
--   ALTER POLICY "Usuarios pueden actualizar verificaciones"
--     ON public.verificaciones_inventario TO public USING (true) WITH CHECK (true);
--
--   DROP POLICY "Administrador elimina verificaciones" ON public.verificaciones_inventario;
--
--   CREATE POLICY "Usuarios autenticados - verificaciones"
--     ON public.verificaciones_inventario FOR ALL TO authenticated
--     USING (true) WITH CHECK (true);
--
--   GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
--     ON public.verificaciones_inventario TO anon;
--
--   -- verificaciones_detalle
--   ALTER POLICY "Usuarios autenticados leen detalles de verificacion"
--     ON public.verificaciones_detalle RENAME TO "Todos pueden ver detalles";
--   ALTER POLICY "Todos pueden ver detalles"
--     ON public.verificaciones_detalle TO public USING (true);
--
--   ALTER POLICY "Administrador crea detalles de verificacion"
--     ON public.verificaciones_detalle RENAME TO "Usuarios pueden crear detalles";
--   ALTER POLICY "Usuarios pueden crear detalles"
--     ON public.verificaciones_detalle TO public WITH CHECK (true);
--
--   ALTER POLICY "Administrador actualiza detalles de verificacion"
--     ON public.verificaciones_detalle RENAME TO "Usuarios pueden actualizar detalles";
--   ALTER POLICY "Usuarios pueden actualizar detalles"
--     ON public.verificaciones_detalle TO public USING (true) WITH CHECK (true);
--
--   DROP POLICY "Administrador elimina detalles de verificacion" ON public.verificaciones_detalle;
--
--   CREATE POLICY "Usuarios autenticados - verificaciones detalle"
--     ON public.verificaciones_detalle FOR ALL TO authenticated
--     USING (true) WITH CHECK (true);
--
--   GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
--     ON public.verificaciones_detalle TO anon;
--
-- (El `UPDATE` original de ambas tablas tenia `WITH CHECK` NULL, que Postgres
-- resuelve cayendo al `USING`. El rollback escribe `WITH CHECK (true)`
-- explicito: es el mismo comportamiento, no una laxitud adicional.)
-- =============================================================================
