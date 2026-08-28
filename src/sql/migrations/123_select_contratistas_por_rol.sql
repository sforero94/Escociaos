-- Migración 123: acota por rol el SELECT de `contratistas`, la última de sus
-- cuatro políticas que seguía con predicado literalmente `true`.
--
-- Numerada 123: es el siguiente número libre tomado sobre las DOS fuentes que
-- exige la constitución — el máximo de `src/sql/migrations/` es 122
-- (`122_clima_lluvia_tres_senales.sql`) y el máximo del ledger
-- `supabase_migrations.schema_migrations` es `20260827010814`
-- (`clima_lluvia_tres_senales`), o sea la misma migración. Coinciden, y ninguna
-- de las dos llega a 123.
--
-- NO APLICAR DESDE ESTE AGENTE. Este archivo se abre en PR para revisión
-- adversarial independiente y lo aplica el orquestador.
--
-- ---------------------------------------------------------------------------
-- QUÉ CIERRA
-- ---------------------------------------------------------------------------
-- `authenticated_select_contratistas` es PERMISSIVE, `TO authenticated`, con
-- `qual` literalmente `true`. La tabla lleva `cedula` y `telefono` de 7
-- contratistas — terceros que no son empleados de la finca y que no eligieron
-- estar en el sistema — y CUALQUIER sesión autenticada, de cualquier rol, las
-- lee enteras. Cuatro lectores de la aplicación piden además `select('*')`
-- (`Contratistas.tsx:107`, `Labores.tsx:223`, `TareaDetalleDialog.tsx:124`,
-- `DailyMovementForm.tsx:505`), así que las dos columnas viajan de verdad al
-- navegador, no son sólo alcanzables en teoría.
--
-- Contraste que hace evidente la asimetría: `empleados`, la tabla hermana con
-- exactamente el mismo tipo de dato personal, SÍ está acotada por rol — tiene
-- "Gerencia full access", "Administrador read access" y "Verificador read
-- active empleados", ninguna con predicado `true`.
--
-- La 114 (aplicada 2026-08-24) acotó el DELETE de ESTA MISMA tabla y dejó el
-- SELECT intacto a propósito: su alcance era la cascada hacia las tablas de
-- trazabilidad GlobalGAP, no la lectura de PII. Esta migración es ese residuo,
-- y usa el mismo molde.
--
-- ---------------------------------------------------------------------------
-- CALIBRACIÓN HONESTA: HOY NO HAY NI UN DATO PERSONAL EN ESAS DOS COLUMNAS
-- ---------------------------------------------------------------------------
-- Verificado en vivo antes de escribir: `count(*) filter (where cedula is not
-- null)` = 0 y `count(*) filter (where telefono is not null)` = 0, sobre las 7
-- filas. Ninguno de los 7 contratistas tiene cédula ni teléfono cargados.
--
-- Eso NO refuta el hallazgo, y conviene decir por qué en los dos sentidos:
--   - Baja el daño de HOY a cero. La exposición es estructural (las columnas
--     están, el formulario de `Contratistas.tsx` las escribe), no material.
--   - Y por eso mismo hace que este sea el momento BARATO de cerrarla: no hay
--     que decidir nada sobre datos ya capturados, y el día que alguien teclee
--     la primera cédula la puerta ya está cerrada.
-- La severidad correcta sigue siendo la de una brecha LATENTE (P2), no la de
-- una fuga en curso.
--
-- ---------------------------------------------------------------------------
-- EL PADRÓN, Y POR QUÉ SU GUARDA ES `RAISE WARNING` Y NO `RAISE EXCEPTION`
-- ---------------------------------------------------------------------------
-- Padrón verificado hoy: 8 cuentas activas, 5 Gerencia + 3 Administrador, CERO
-- inactivas, y ninguna Verificador. El enum `rol_usuario` tiene exactamente
-- tres etiquetas — Administrador, Verificador, Gerencia — así que el único rol
-- que puede aparecer y quedar fuera del nuevo predicado es **Verificador**.
--
-- La 114 abortaba si existía una cuenta fuera de Gerencia/Administrador, y ahí
-- estaba bien: acotar el DELETE le habría quitado a esa cuenta una capacidad
-- que ya usaba. Acá la lógica se invierte, y es la lección que dejó el primer
-- borrador UNSAFE de la 120: **una guarda que aborta justo cuando el agujero se
-- vuelve real secuencia el defecto menor delante del mayor.** El día que exista
-- un Verificador es exactamente el día en que esta migración hace falta; negarse
-- a correr entonces sería lo contrario de lo que se pide. Y como una migración
-- aplicada no se edita, esa guarda mataría el fichero. Por eso: WARNING.
--
-- ---------------------------------------------------------------------------
-- BARRIDO COMPLETO DE LECTORES — la parte que hay que revisar, no la SQL
-- ---------------------------------------------------------------------------
-- Acotar mal esto rompe la Calculadora y los formularios de Labores en
-- producción, que es justo el riesgo que en la 110 obligó a acotar por ROL y no
-- por propietario. Barrido de TODO el repo (`src/`, los dos árboles de edge
-- function, `scripts/`), buscando tanto `.from('contratistas')` como los embeds
-- de PostgREST (`contratistas(...)`, `contratistas:contratista_id`), que también
-- pasan por la RLS de esta tabla.
--
-- A) NAVEGADOR — corren como `authenticated`, SÍ les aplica este predicado:
--    src/components/empleados/Contratistas.tsx:107     select('*')            (pantalla CRUD)
--    src/components/labores/Labores.tsx:223            select('*') estado=Activo
--    src/components/labores/TareaDetalleDialog.tsx:124 select('*') estado=Activo
--    src/components/labores/TareaDetalleDialog.tsx:99  embed contratistas:contratista_id
--    src/components/labores/ReportesView.tsx:169       embed contratistas(nombre,…)
--    src/components/labores/RegistrarTrabajoDialog.tsx:211  embed contratistas(nombre)
--    src/components/aplicaciones/DailyMovementForm.tsx:505  select('*') estado=Activo
--    src/components/aplicaciones/DailyMovementsDashboard.tsx:252 embed contratistas(nombre)
--    src/components/aplicaciones/CierreAplicacion.tsx:424  select(id,nombre,tarifa_jornal)
--    src/utils/laborCosts.ts:230                       select(id,nombre,tarifa_jornal)
--    Ninguna de esas rutas lleva `RoleGuard`: `/labores/*` y `/aplicaciones/*`
--    sólo pasan por `ModuleGuard modulo="aguacate"`, que es visibilidad de
--    navegación y NO un data boundary. O sea que con el padrón de hoy TODOS
--    esos lectores corren como Gerencia o Administrador, los dos roles que el
--    nuevo predicado admite: **cero cambios de comportamiento al aplicar.**
--
-- B) EDGE FUNCTIONS — corren con `SUPABASE_SERVICE_ROLE_KEY`, que tiene
--    `rolbypassrls`: la RLS no se les evalúa y esta migración NO los toca.
--    supabase/functions/make-server-1ccce916/chat.tsx:735   (Esco, embed contratista:contratistas)
--    supabase/functions/make-server-1ccce916/telegram/conversations/jornal.ts:443
--    (más sus espejos en src/supabase/functions/server/). Comprobado que el JWT
--    del usuario en `chat.tsx` se usa SÓLO para identificarlo
--    (`authenticateUser`, línea 200): todas las consultas de datos salen por
--    `getAdminHeaders()`, service role.
--    `generar-reporte-semanal.tsx` no lee la tabla — su campo `contratistas` es
--    un conteo derivado de `registros_trabajo.contratista_id`.
--
-- C) DENTRO DE LA BASE — un solo lector, y es el que casi se pasa por alto:
--    `calcular_costo_jornal()` (trigger BEFORE INSERT/UPDATE sobre
--    `registros_trabajo`) hace `SELECT COALESCE(tarifa_jornal,0) ... FROM
--    contratistas WHERE id = NEW.contratista_id`, y es **SECURITY INVOKER**
--    (`prosecdef = false`), así que corre con la RLS de quien inserta. Hoy sólo
--    insertan Gerencia y Administrador, así que no cambia nada. Se documenta su
--    consecuencia futura abajo. Ninguna otra función ni vista de `public`
--    referencia la tabla (verificado sobre `pg_get_functiondef` y `pg_rewrite`).
--
-- ---------------------------------------------------------------------------
-- POR QUÉ POLÍTICA POR ROL Y NO UNA VISTA SIN `cedula`/`telefono`
-- ---------------------------------------------------------------------------
-- La opción de la vista se evaluó en serio, porque el dato sobrante son dos
-- columnas y no la tabla: 8 de los 10 lectores del navegador sólo necesitan
-- `nombre` (y a veces `tarifa_jornal`). Se descarta por tres razones concretas:
--
--   1. La RLS de PostgreSQL es por FILA, no por columna, así que en la tabla no
--      hay forma de esconder dos columnas a unos roles y no a otros.
--   2. Un `GRANT SELECT (nombre, tarifa_jornal)` por columna tampoco sirve acá:
--      los grants son por ROL DE POSTGRES, y todos los roles de la aplicación
--      (Gerencia, Administrador, Verificador) comparten el MISMO rol de base
--      `authenticated`. Un grant por columna se lo quitaría a Gerencia también.
--   3. Una vista `contratistas_publicos` sí resolvería el matiz, pero exige
--      cambiar los 10 sitios de la aplicación **y** reescribir los 4 embeds de
--      PostgREST, que dependen de la relación por FK con la tabla real. Eso ya
--      no es `ddl_aditivo`: es DDL + cambio de código de aplicación, y hay que
--      decirlo en vez de entregar la mitad. Queda propuesto aparte.
--
-- Roles admitidos: **Gerencia + Administrador**. Es el mismo conjunto que la
-- 114 ya dejó en el DELETE de esta misma tabla — así las cuatro políticas se
-- leen coherentes entre sí — y el mismo de "Administrador read access on
-- empleados". Verificador queda fuera a propósito: es el rol de verificación de
-- inventario (tiene políticas propias en `verificaciones_*`) y no tiene ninguna
-- pantalla de labores ni de aplicaciones diseñada para él — no existe un solo
-- `RoleGuard allowedRoles={['Verificador']}` en todo el repo.
--
-- ---------------------------------------------------------------------------
-- DOS CONSECUENCIAS FUTURAS QUE SE ACEPTAN CON LOS OJOS ABIERTOS
-- ---------------------------------------------------------------------------
-- Las dos son contingentes a que exista una cuenta Verificador, que hoy no
-- existe. Se escriben acá para que quien cree la primera no las descubra:
--
--   (1) Un Verificador que llegue a `/labores/*` o `/aplicaciones/*` verá los
--       selectores de contratistas VACÍOS y los nombres de contratista como
--       'Sin nombre'/'N/A' en las listas (los embeds devuelven `null` cuando la
--       fila embebida no pasa la RLS). Los empleados se siguen viendo: la
--       política "Verificador read active empleados" existe.
--   (2) `registros_trabajo` tiene una política de INSERT con `WITH CHECK (true)`,
--       o sea que un Verificador PUEDE insertar un registro de trabajo. Si lo
--       hace con `contratista_id`, el trigger `calcular_costo_jornal` no
--       encontrará la fila y `costo_jornal` quedará **NULL** — "sin dato", que
--       es el comportamiento correcto del proyecto, nunca un 0 fabricado. Pero
--       es un hueco de costo que nadie ve.
--
-- Ninguna de las dos se arregla acá. La (1) es la propuesta de la vista; la (2)
-- es el `WITH CHECK (true)` del INSERT de `registros_trabajo`, que es un
-- hallazgo propio y distinto (esta migración no lo crea ni lo empeora). Meter
-- cualquiera de las dos en este fichero sería salirse del alcance.
--
-- ---------------------------------------------------------------------------
-- DECISIONES DE FORMA (mismas de 110/114)
-- ---------------------------------------------------------------------------
-- `ALTER POLICY`, nunca `DROP`+`CREATE` (precedente 077): es atómico y no abre
-- una ventana en la que la tabla se queda sin política de SELECT. Predicado
-- envuelto como `(SELECT get_user_role())` (precedente 093): el planificador lo
-- sube a un InitPlan en vez de reevaluarlo fila a fila. `get_user_role()`
-- devuelve el enum `rol_usuario` y con `auth.uid()` nulo da NULL — `NULL IN
-- (...)` no es cierto, así que falla CERRADO. Misma grieta conocida y no
-- cerrada acá que documentaron 110/114: `get_user_role()` no filtra por
-- `usuarios.activo` (hoy da igual, 0 cuentas inactivas), y cerrarla sólo acá
-- sería incoherente con las 97 políticas de la 093.
--
-- `REVOKE SELECT ... FROM anon` (precedente 081/110/114): segunda capa. Hoy
-- `anon` tiene el GRANT de tabla de SELECT por la trampa del `ALTER DEFAULT
-- PRIVILEGES` de Supabase y sólo lo detiene no figurar en ninguna política —
-- o sea que la tabla está a UNA política `TO public` de distancia de la lectura
-- anónima. No se tocan INSERT/UPDATE/TRIGGER/TRUNCATE/REFERENCES de `anon`: son
-- el mismo hallazgo que la 114 dejó reportado y sin cerrar, y ampliarlo acá
-- sería cambiar el alcance por comodidad.
--
-- FILAS AFECTADAS: **CERO**. Un `ALTER POLICY` y un `REVOKE` no leen, no
-- escriben, no borran y no actualizan ninguna fila de dato, y toda cuenta
-- activa ya es Gerencia o Administrador. Ningún literal de conteo absoluto de
-- filas entra en una guarda: la línea base se captura en tiempo de ejecución
-- (1.4) y se compara contra sí misma (4.5) — la trampa que le costó un día a la
-- 103.
--
-- ---------------------------------------------------------------------------
-- 1. Pre-condiciones. Cualquiera que falle aborta la transacción entera.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_n integer;
  v_padron integer;
BEGIN
  -- 1.1 Exactamente 4 políticas y 0 RESTRICTIVE. Si cambió, el análisis de
  --     arriba ya no describe la tabla y no hay que seguir a ciegas.
  SELECT count(*) INTO v_n
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'contratistas';
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'PRE 1.1: se esperaban exactamente 4 políticas en contratistas, hay %. El análisis de esta migración ya no describe la tabla.', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'contratistas' AND NOT p.polpermissive;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'PRE 1.1b: aparecieron % políticas RESTRICTIVE en contratistas; revisar antes de seguir.', v_n;
  END IF;

  -- 1.2 La política SELECT es exactamente la esperada: PERMISSIVE, sólo
  --     TO authenticated, predicado literal `true`.
  SELECT count(*) INTO v_n
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'contratistas'
    AND p.polname = 'authenticated_select_contratistas'
    AND p.polcmd = 'r'
    AND p.polpermissive
    AND btrim(coalesce(pg_get_expr(p.polqual, p.polrelid), '')) = 'true'
    AND p.polroles = ARRAY[(SELECT oid FROM pg_roles WHERE rolname = 'authenticated')];
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'PRE 1.2: no se encontró `authenticated_select_contratistas` con la forma esperada (PERMISSIVE, sólo TO authenticated, qual=true); hay %. LA CAUSA MÁS PROBABLE ES QUE ESTA MIGRACIÓN YA SE APLICÓ -- comprobalo mirando si el predicado ya nombra get_user_role antes de asumir que alguien tocó la política a mano. Este repo tiene historial de migraciones aplicadas sin fila en el ledger, así que la ausencia de fila en schema_migrations NO prueba que no se aplicó.', v_n;
  END IF;

  -- 1.3 El DELETE que dejó la 114 sigue acotado por rol. No se toca acá; se
  --     comprueba para que la post-condición 4.4 pueda probar que no lo movimos
  --     y para que las cuatro políticas queden coherentes entre sí.
  SELECT count(*) INTO v_n
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'contratistas'
    AND p.polname = 'authenticated_delete_contratistas'
    AND p.polcmd = 'd'
    AND pg_get_expr(p.polqual, p.polrelid) LIKE '%get_user_role%';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'PRE 1.3: `authenticated_delete_contratistas` no está acotada por get_user_role(). La migración 114 debería haberla dejado así; revisar si fue revertida (ver src/sql/fix_all_monitoreo_rls_policies.sql, marcado OBSOLETO, que recrea políticas como USING(true)).';
  END IF;

  -- 1.4 Línea base de filas, para la post-condición de "cero filas tocadas".
  --     Nada de literales absolutos: se compara contra sí misma.
  SELECT count(*) INTO v_n FROM public.contratistas;
  PERFORM set_config('escociaos.mig123_count_contratistas', v_n::text, false);

  -- 1.5 EL PADRÓN -- informativo, NO bloqueante. Ver la sección de arriba: una
  --     cuenta Verificador es exactamente el escenario para el que existe esta
  --     migración, así que abortar por eso sería al revés.
  SELECT count(*) INTO v_padron
  FROM public.usuarios
  WHERE activo AND rol NOT IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario);
  IF v_padron > 0 THEN
    RAISE WARNING 'PRE 1.5: hay % cuenta(s) activa(s) fuera de Gerencia/Administrador. La migración SIGUE (esa cuenta es justamente de quien se protege la PII), pero esa cuenta dejará de ver nombres de contratista en Labores/Aplicaciones y un registro_trabajo que capture con contratista_id quedará con costo_jornal NULL. Ver "DOS CONSECUENCIAS FUTURAS" en la cabecera.', v_padron;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. El cambio. Una sola sentencia atómica.
-- ---------------------------------------------------------------------------
ALTER POLICY authenticated_select_contratistas
  ON public.contratistas
  USING ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

COMMENT ON POLICY authenticated_select_contratistas ON public.contratistas IS
  'Migración 123: lectura acotada a Gerencia y Administrador. La tabla lleva cedula y telefono de terceros; el predicado `true` anterior las exponía a cualquier sesión autenticada. Mismo conjunto de roles que el DELETE de la 114 y que "Administrador read access on empleados".';

-- ---------------------------------------------------------------------------
-- 3. Segunda capa: `anon` pierde el GRANT de SELECT (precedente 081/110/114).
--    Hoy lo tiene y sólo lo detiene no figurar en ninguna política. No se
--    tocan sus otros verbos -- mismo alcance acotado que la 114.
-- ---------------------------------------------------------------------------
REVOKE SELECT ON public.contratistas FROM anon;

-- ---------------------------------------------------------------------------
-- 4. Post-condiciones.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_n integer;
  v_pred text;
  v_count_antes text;
  v_antes integer;
  v_ahora integer;
BEGIN
  v_count_antes := nullif(current_setting('escociaos.mig123_count_contratistas', true), '');
  IF v_count_antes IS NULL THEN
    RAISE WARNING 'POST 4: no se pudo leer la línea base de filas (la sección 1 corrió en otra sesión). La comprobación de "cero filas tocadas" (4.5) NO se ejecutó.';
  END IF;

  -- 4.1 El predicado SELECT quedó acotado por rol y ya no es `true`.
  SELECT pg_get_expr(p.polqual, p.polrelid) INTO v_pred
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'contratistas'
    AND p.polname = 'authenticated_select_contratistas' AND p.polcmd = 'r';

  IF v_pred IS NULL
     OR v_pred NOT LIKE '%get_user_role%'
     OR v_pred NOT LIKE '%Gerencia%'
     OR v_pred NOT LIKE '%Administrador%'
     OR btrim(v_pred) = 'true' THEN
    RAISE EXCEPTION 'POST 4.1: el predicado SELECT de contratistas no quedó acotado por rol. Actual: %', coalesce(v_pred, '<nulo>');
  END IF;

  -- 4.2 Conteo de políticas sin cambiar: siguen siendo 4, ninguna perdida ni
  --     creada, y 0 RESTRICTIVE.
  SELECT count(*) INTO v_n
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'contratistas';
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'POST 4.2: contratistas quedó con % políticas en vez de 4.', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'contratistas' AND NOT p.polpermissive;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'POST 4.2b: aparecieron % políticas RESTRICTIVE en contratistas.', v_n;
  END IF;

  -- 4.3 INSERT y UPDATE quedaron INTACTOS -- siguen siendo los dos `true` de
  --     `authenticated`. Es la prueba de que el alcance fue sólo el SELECT.
  --     (Que sigan en `true` es un hallazgo aparte, no de esta migración.)
  SELECT count(*) INTO v_n
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'contratistas' AND p.polcmd IN ('a', 'w')
    AND btrim(coalesce(pg_get_expr(p.polqual, p.polrelid), pg_get_expr(p.polwithcheck, p.polrelid))) = 'true';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'POST 4.3: se esperaban intactas las 2 políticas de insert/update de contratistas con predicado true, coinciden %.', v_n;
  END IF;

  -- 4.4 El DELETE de la 114 no se tocó: sigue acotado por rol.
  SELECT pg_get_expr(p.polqual, p.polrelid) INTO v_pred
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'contratistas'
    AND p.polname = 'authenticated_delete_contratistas' AND p.polcmd = 'd';
  IF v_pred IS NULL OR v_pred NOT LIKE '%get_user_role%' THEN
    RAISE EXCEPTION 'POST 4.4: el predicado DELETE de contratistas (migración 114) cambió. Esta migración no debía tocarlo. Actual: %', coalesce(v_pred, '<nulo>');
  END IF;

  -- 4.5 Cero filas tocadas, contra la línea base capturada en 1.4.
  IF v_count_antes IS NOT NULL THEN
    v_antes := v_count_antes::integer;
    SELECT count(*) INTO v_ahora FROM public.contratistas;
    IF v_ahora <> v_antes THEN
      RAISE EXCEPTION 'POST 4.5: el conteo de contratistas cambió de % a %. Un ALTER POLICY no puede hacer eso; abortar.', v_antes, v_ahora;
    END IF;
  END IF;

  -- 4.6 `anon` ya no puede leer la tabla.
  IF has_table_privilege('anon', 'public.contratistas', 'SELECT') THEN
    RAISE EXCEPTION 'POST 4.6: `anon` conserva el privilegio SELECT sobre contratistas.';
  END IF;

  -- 4.7 `authenticated` CONSERVA el GRANT de tabla. La reja es la RLS, no el
  --     grant: sin este privilegio se rompería la lectura para TODOS los roles,
  --     Gerencia y Administrador incluidos.
  IF NOT has_table_privilege('authenticated', 'public.contratistas', 'SELECT') THEN
    RAISE EXCEPTION 'POST 4.7: `authenticated` perdió el GRANT de SELECT sobre contratistas. Eso dejaría la tabla ilegible para todos los roles.';
  END IF;

  -- 4.8 RLS sigue habilitada en la tabla.
  SELECT count(*) INTO v_n FROM pg_class WHERE oid = 'public.contratistas'::regclass AND relrowsecurity;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'POST 4.8: RLS no está habilitada en contratistas; sin ella las políticas no se evalúan.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (ejecutable, devuelve la tabla exactamente a como estaba):
--
--   ALTER POLICY authenticated_select_contratistas ON public.contratistas USING (true);
--   COMMENT ON POLICY authenticated_select_contratistas ON public.contratistas IS NULL;
--   GRANT SELECT ON public.contratistas TO anon;
--
-- El GRANT del rollback restaura el estado exacto previo. Devolvérselo a `anon`
-- no reabre por sí solo la lectura anónima: seguiría sin figurar en ninguna
-- política -- está sólo para que el rollback sea fiel.
-- ---------------------------------------------------------------------------
