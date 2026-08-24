-- Migración 114: acota por rol el DELETE de `contratistas` y `lotes`, los dos
-- padres del residual que la migración 110 dejó explícitamente abierto al
-- cerrar el hallazgo #37 (cadena de trazabilidad GlobalGAP).
--
-- Numerada 114: 110 y 111 ya están aplicadas a producción; 112 y 113 están en
-- vuelo (ramas abiertas, sin aplicar) al momento de escribir este archivo.
--
-- NO APLICAR DESDE ESTE AGENTE. Este archivo se abre en PR para revisión
-- adversarial y lo aplica el orquestador.
--
-- ---------------------------------------------------------------------------
-- QUÉ DEJÓ ABIERTO LA 110 Y POR QUÉ IMPORTA
-- ---------------------------------------------------------------------------
-- 110 acotó el DELETE directo de las 7 tablas de la cadena GlobalGAP
-- (aplicaciones_productos/calculos/lotes/compras,
-- movimientos_diarios_productos/empleados/trabajadores) a Gerencia y
-- Administrador. Pero el borrado en CASCADA de PostgreSQL corre como dueño de
-- la tabla hija con `SECURITY_NOFORCE_RLS` -- la RLS del hijo NO se evalúa
-- durante una cascada -- y las 7 son `relowner = postgres` con
-- `relforcerowsecurity = false` (reverificado acá: sigue siendo así). Eso
-- significa que un padre con DELETE incondicional puede seguir destruyendo
-- esas 7 tablas por la puerta de atrás, sin que 110 lo note.
--
-- 110 identificó tres padres con esa forma y dejó dicho, textualmente, que
-- "#37 no queda completo sin acotar también `contratistas` (y `lotes`)":
--
--   padre                | hijo GlobalGAP afectado                              | política DELETE hoy
--   contratistas          | movimientos_diarios_trabajadores (CASCADE)           | `true`, sin freno
--   lotes                 | movimientos_diarios_empleados + _trabajadores (CASCADE) | `true`, freno parcial de rebote
--   movimientos_diarios    | los tres `movimientos_diarios_*` (CASCADE)            | `created_by = auth.uid()`, sin rol
--
-- Esta migración cierra las primeras dos. La tercera se deja sin tocar --
-- razón completa más abajo, en su propia sección.
--
-- ---------------------------------------------------------------------------
-- ANATOMÍA REAL, VERIFICADA CONTRA EL CATÁLOGO VIVO (no asumida de la 110)
-- ---------------------------------------------------------------------------
-- `contratistas` -- 4 políticas, TODAS `TO authenticated`, ninguna de rol:
--   authenticated_select_contratistas  (r, qual true)
--   authenticated_insert_contratistas  (a, with_check true)
--   authenticated_update_contratistas  (w, qual true, with_check true)
--   authenticated_delete_contratistas  (d, qual true)              <- el problema
-- Misma anatomía exacta que las 7 de la 110 (naming `authenticated_<cmd>_<tabla>`,
-- todas `TO authenticated`, `true`), salvo que acá SÍ hay política de UPDATE
-- (en las 7 de la 110 no la había). No cambia el análisis: se toca sólo DELETE.
--
-- `lotes` -- 6 políticas, con una diferencia real frente a `contratistas`: ya
-- tiene Gerencia con acceso total, y Administrador con lectura:
--   Gerencia acceso total                     (*, TO public, qual get_user_role()='Gerencia')
--   Administrador lee lotes                   (r, TO public, qual get_user_role()='Administrador')
--   Usuarios autenticados pueden leer lotes    (r, TO authenticated, qual true)
--   Usuarios autenticados pueden insertar lotes(a, TO authenticated, with_check true)
--   Usuarios autenticados pueden actualizar lotes (w, TO authenticated, qual true, with_check true)
--   Usuarios autenticados pueden eliminar lotes   (d, TO authenticated, qual true)   <- el problema
-- La política ALL de Gerencia ya cubre su propio DELETE -- acotar la de
-- `authenticated` no le quita nada a Gerencia, sólo se lo quita a cualquier
-- OTRO rol autenticado (hoy nadie; mañana, un Verificador). Administrador hoy
-- sólo tiene lectura como política propia: su capacidad de borrar viene
-- ÚNICAMENTE de la política `true` de `authenticated`, así que -- a diferencia
-- de Gerencia -- si esta migración fallara en incluir a Administrador en el
-- nuevo predicado, le quitaría el borrado que usa hoy. Por eso el nuevo
-- predicado es `IN ('Gerencia','Administrador')`, igual que en la 110, y no
-- sólo 'Administrador' con la ALL de Gerencia cubriendo el resto: así el
-- predicado se lee solo, sin depender de que la política ALL siga viva para
-- que Gerencia conserve el borrado.
--
-- 0 políticas RESTRICTIVE en ninguna de las dos tablas (reverificado). Ambas
-- son `relowner = postgres`, `relforcerowsecurity = false` -- confirma que el
-- borrado en cascada hacia sus hijos bypasea RLS igual que documentó la 110.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ `contratistas` ES LA PRIORIDAD -- el freno de `lotes` no lo tiene
-- ---------------------------------------------------------------------------
-- `lotes` está parcialmente protegido de rebote: `aplicaciones_lotes` y
-- `aplicaciones_calculos` referencian `lote_id` con FK `RESTRICT`, así que un
-- lote con aplicaciones no se puede borrar aunque su propia política lo
-- permita. Ese freno es ajeno a esta migración -- no lo crea ni depende de él
-- -- y sólo protege lotes que tengan aplicaciones.
--
-- `contratistas` no tiene ningún freno equivalente por diseño: la única FK
-- RESTRICT que lo toca es `registros_trabajo` (`ON DELETE RESTRICT`), y hoy,
-- verificado en vivo, TODO contratista con filas en
-- `movimientos_diarios_trabajadores` tiene también al menos una fila en
-- `registros_trabajo` -- 0 contratistas están en el hueco. Pero eso es una
-- correlación de los datos de hoy (probablemente porque el mismo flujo de
-- captura escribe ambas tablas), no una garantía estructural: no hay un
-- trigger ni una FK que obligue a esa correlación, así que un futuro camino de
-- escritura que sólo toque `movimientos_diarios_trabajadores` -- o el borrado
-- futuro de una fila huérfana de `registros_trabajo` -- dejaría a ese
-- contratista borrable sin ningún freno.
--
-- ---------------------------------------------------------------------------
-- INVENTARIO DE QUIÉN BORRA HOY -- repo completo (`src/`, los dos árboles de
-- edge function, `scripts/`), no sólo el módulo obvio
-- ---------------------------------------------------------------------------
-- contratistas: UN sólo sitio en todo el repo -- `src/components/empleados/
--   Contratistas.tsx:207`. Ya hace su propio chequeo de negocio antes de
--   llamar `.delete()`: cuenta filas en `registros_trabajo` para ese
--   contratista y si hay alguna, aborta con un mensaje explicando que debe
--   marcarse Inactivo en su lugar (líneas 190-204). Ese chequeo es aplicativo,
--   no RLS, y sigue intacto -- esta migración no lo toca ni depende de él.
--
-- lotes: un sólo sitio que borra -- `src/components/configuracion/
--   LotesConfig.tsx:162-163`. Los demás ~20 sitios listados por el grep son
--   `.select()`, lectura de catálogo para poblar selects/filtros; ninguno
--   borra. `eliminarLote()` no hace ningún chequeo de rol previo -- confía en
--   que la RLS responda 23503 (FK) o, hasta hoy, simplemente deja pasar a
--   cualquier autenticado. El manejo de error ya distingue el caso 23503 por
--   tabla (líneas 182+) pero no un error de RLS -- no hace falta agregarlo:
--   con el padrón actual (ver guarda 1.3) nadie pierde una capacidad que use.
--
-- movimientos_diarios (el padre que se deja sin tocar, ver su sección): dos
--   sitios -- `DailyMovementForm.tsx:716,771` (autoguardado, borra su propio
--   movimiento en construcción si el paso siguiente falla) y
--   `DailyMovementsDashboard.tsx:484` (borrado manual desde la lista).
--
-- Ninguna edge function ni ningún script de `scripts/` borra de `contratistas`,
-- `lotes` ni `movimientos_diarios`. El único consumidor de `contratistas` en
-- todo el árbol de edge functions es de LECTURA (`telegram_usuarios` FK,
-- ningún DELETE). `service_role` tiene `rolbypassrls`, así que aunque
-- existiera no le aplicaría esta migración.
--
-- No hay chequeo de rol en la UI en ninguno de los tres flujos (ni
-- `RoleGuard`, ni `isGerencia`, ni ninguna variante) -- la pestaña "Lotes" de
-- Configuración y la pantalla de Contratistas son visibles para cualquier rol
-- autenticado. Hoy da igual porque el padrón es 100% Gerencia/Administrador
-- (guarda 1.3); la RLS acotada por esta migración pasa a ser el ÚNICO freno
-- de rol para estos dos borrados, igual que ya lo es para las 7 tablas de la
-- 110.
--
-- ---------------------------------------------------------------------------
-- `movimientos_diarios` -- SE DEJA SIN TOCAR. Argumento, no evasión.
-- ---------------------------------------------------------------------------
-- Su política DELETE no es `true`: es `created_by = (SELECT auth.uid())`. Ya
-- exige ser el AUTOR del movimiento, no cualquier autenticado -- es una
-- exposición de otra clase, más chica, que la de `contratistas` y `lotes`:
--
--   - `contratistas`/`lotes` hoy: cualquier autenticado borra CUALQUIER fila,
--     de cualquier autor, con todo su reparto en cascada.
--   - `movimientos_diarios` hoy: cada autenticado sólo puede borrar SUS
--     PROPIOS movimientos -- nunca los de otro.
--
-- Combinar rol y autoría (`created_by = auth.uid() AND get_user_role() IN
-- (...)`) es un predicado NUEVO, no la aplicación del molde de la 110 (que
-- reemplaza `true` por un chequeo de rol, sin tocar ninguna otra cláusula). No
-- hay ningún hermano en esta tabla que ya use esa forma combinada para
-- probarla barata, a diferencia de `lotes`, donde `aplicaciones_mezclas` (110)
-- y la propia "Gerencia acceso total" ya prueban en vivo que acotar por rol no
-- rompe nada.
--
-- Y no es sólo forma: es una decisión de producto, no una migración de
-- endurecimiento. Hoy CUALQUIER autenticado puede *crear* un movimiento
-- (política de INSERT en `true`) y luego corregirse borrando su propio
-- intento -- ése es justo el uso que hace `DailyMovementForm.tsx:716,771`
-- (autoguardado que se deshace si el flujo no completa). Convertir el borrado
-- en Gerencia/Administrador-only le quitaría esa capacidad de autocorrección a
-- cualquier futuro Verificador que capture movimientos -- un cambio de
-- comportamiento del feature, no un cierre de una puerta que nadie debería
-- tener abierta. Decidir eso es del resorte de producto (CTO/dueño), no de
-- esta migración de seguridad.
--
-- Con el padrón actual (8 cuentas, todas Gerencia o Administrador, guarda 1.3)
-- el riesgo real hoy es cero de todas formas -- nadie fuera de esos dos roles
-- puede ni crear ni borrar un movimiento. El día que exista un Verificador que
-- capture en este flujo, la pregunta correcta es "¿debería poder borrar SU
-- PROPIA captura del día, o eso también debería quedar cerrado a
-- Gerencia/Administrador?" -- y ésa es una pregunta de producto sobre el
-- feature de autoguardado/autocorrección, no una que esta migración de
-- endurecimiento de RLS deba resolver por su cuenta. Queda reportada aparte
-- para que el dueño decida, igual que la 110 reportó `contratistas`/`lotes`
-- aparte de su propio alcance.
--
-- ---------------------------------------------------------------------------
-- HALLAZGO REPORTADO, NO CORREGIDO ACÁ: `anon` con GRANT completo de tabla
-- ---------------------------------------------------------------------------
-- Verificado en vivo: `anon` tiene SELECT/INSERT/UPDATE/DELETE/TRIGGER/
-- TRUNCATE/REFERENCES de tabla completa en `contratistas` Y en `lotes` --
-- incluida la cédula y el teléfono de los 7 contratistas activos. Es el mismo
-- patrón que documentaron 081/082: `ALTER DEFAULT PRIVILEGES IN SCHEMA public
-- GRANT ALL ON TABLES TO anon, authenticated` de Supabase, no algo que esta
-- migración haya causado. Hoy no es explotable para NINGUNO de esos verbos
-- -- las 4 políticas de `contratistas` y las 6 de `lotes` son todas `TO
-- authenticated` o exigen `get_user_role() = 'Gerencia'/'Administrador'`
-- (que con `auth.uid()` nulo da NULL, nunca TRUE) -- así que `anon` no
-- calza en ninguna. El alcance de esta migración es sólo el DELETE de estas
-- dos tablas, igual que el alcance de la 110 fue sólo DELETE de las 7 suyas.
-- Ampliar a REVOKE del resto de verbos, o a una limpieza general de
-- `ALTER DEFAULT PRIVILEGES` en todo `public`, es un hallazgo propio y
-- distinto -- se deja reportado, sin tocar acá.
--
-- ---------------------------------------------------------------------------
-- DECISIONES DE FORMA (mismas de la 110)
-- ---------------------------------------------------------------------------
-- `ALTER POLICY`, nunca `DROP`+`CREATE` (precedente 077): atómico, nunca deja
-- la tabla sin política. Predicado envuelto como `(SELECT get_user_role())`
-- (precedente 093): el planificador lo sube a un InitPlan en vez de
-- reevaluarlo fila a fila. `get_user_role()` devuelve el enum `rol_usuario`
-- y con `auth.uid()` nulo da NULL -- `NULL IN (...)` no es cierto: falla
-- cerrado. Misma grieta conocida y no cerrada acá que documentó la 110:
-- `get_user_role()` no filtra por `usuarios.activo` -- hoy da igual, 0 cuentas
-- inactivas (guarda 1.3), y cerrarla sólo acá sería incoherente con las 97
-- políticas de la 093 y las 7 de la 110 que comparten la misma grieta.
--
-- `REVOKE DELETE ... FROM anon` en las dos (precedente 081/110): segunda capa,
-- no cambia comportamiento -- `anon` ya no calza en ninguna política, esto
-- sólo le quita el permiso de mesa por si alguna política futura lo
-- reintrodujera por accidente (`TO public`).
--
-- FILAS AFECTADAS: cero. Un `ALTER POLICY` no borra ni actualiza ninguna fila
-- de dato, y toda cuenta activa ya es Gerencia o Administrador (guarda 1.3).
-- Ningún literal de conteo absoluto: la línea base se captura en tiempo de
-- ejecución (guarda 1.4/1.5) -- la trampa que le costó un día a la 103.
--
-- ---------------------------------------------------------------------------
-- 1. Pre-condiciones. Cualquiera que falle aborta la transacción entera.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_n integer;
  v_pred text;
  v_padron integer;
BEGIN
  -- 1.1 `contratistas`: exactamente 4 políticas, 0 restrictivas.
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

  -- 1.2 `contratistas`: la política DELETE es exactamente la esperada --
  --     PERMISSIVE, sólo TO authenticated, predicado literal `true`.
  SELECT count(*) INTO v_n
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'contratistas'
    AND p.polname = 'authenticated_delete_contratistas'
    AND p.polcmd = 'd'
    AND p.polpermissive
    AND btrim(coalesce(pg_get_expr(p.polqual, p.polrelid), '')) = 'true'
    AND p.polroles = ARRAY[(SELECT oid FROM pg_roles WHERE rolname = 'authenticated')];
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'PRE 1.2: no se encontró `authenticated_delete_contratistas` con la forma esperada (PERMISSIVE, sólo TO authenticated, qual=true); hay %. LA CAUSA MÁS PROBABLE ES QUE ESTA MIGRACIÓN YA SE APLICÓ -- comprobalo mirando si el predicado ya nombra get_user_role antes de asumir que alguien tocó la política a mano. Este repo tiene historial de migraciones aplicadas sin fila en el ledger, así que la ausencia de fila en schema_migrations NO prueba que no se aplicó.', v_n;
  END IF;

  -- 1.3 `lotes`: exactamente 6 políticas, 0 restrictivas.
  SELECT count(*) INTO v_n
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'lotes';
  IF v_n <> 6 THEN
    RAISE EXCEPTION 'PRE 1.3: se esperaban exactamente 6 políticas en lotes, hay %. El análisis de esta migración ya no describe la tabla.', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'lotes' AND NOT p.polpermissive;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'PRE 1.3b: aparecieron % políticas RESTRICTIVE en lotes; revisar antes de seguir.', v_n;
  END IF;

  -- 1.4 `lotes`: la política DELETE de `authenticated` es exactamente la
  --     esperada, Y sigue existiendo la política ALL de Gerencia (para que la
  --     post-condición 4.6 pueda comprobar que no la tocamos).
  SELECT count(*) INTO v_n
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'lotes'
    AND p.polname = 'Usuarios autenticados pueden eliminar lotes'
    AND p.polcmd = 'd'
    AND p.polpermissive
    AND btrim(coalesce(pg_get_expr(p.polqual, p.polrelid), '')) = 'true'
    AND p.polroles = ARRAY[(SELECT oid FROM pg_roles WHERE rolname = 'authenticated')];
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'PRE 1.4: no se encontró "Usuarios autenticados pueden eliminar lotes" con la forma esperada (PERMISSIVE, sólo TO authenticated, qual=true); hay %. Comprobar si ya se aplicó esta migración antes de asumir corrupción.', v_n;
  END IF;

  SELECT pg_get_expr(p.polqual, p.polrelid) INTO v_pred
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'lotes' AND p.polname = 'Gerencia acceso total' AND p.polcmd = '*';
  IF v_pred IS NULL OR v_pred NOT LIKE '%get_user_role%' OR v_pred NOT LIKE '%Gerencia%' THEN
    RAISE EXCEPTION 'PRE 1.4b: "Gerencia acceso total" sobre lotes no tiene la forma esperada (get_user_role()=Gerencia); actual: %. Sin esa política, Gerencia se quedaría sin DELETE al acotar la de authenticated.', coalesce(v_pred, '<no existe>');
  END IF;
  -- Se guarda en su propia clave de configuración (no concatenada con los
  -- conteos de 1.6) porque el predicado puede contener cualquier carácter,
  -- incluido '=' y potencialmente ';' -- concatenar todo en un solo string
  -- parseado por delimitador es exactamente el tipo de parsing fragil que
  -- esta guarda quiere evitar.
  PERFORM set_config('escociaos.mig114_lotes_gerencia_pred', v_pred, false);

  -- 1.5 EL PADRÓN. Si existe una sola cuenta activa fuera de Gerencia y
  --     Administrador, esta migración le QUITA el borrado a alguien que hoy
  --     lo usa, y deja de ser un cambio de cero filas afectadas.
  SELECT count(*) INTO v_padron
  FROM public.usuarios
  WHERE activo AND rol NOT IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario);
  IF v_padron > 0 THEN
    RAISE EXCEPTION 'PRE 1.5: hay % cuenta(s) activa(s) fuera de Gerencia/Administrador. El padrón cambió: esta migración les revocaría el borrado de contratistas/lotes. Revisar antes de aplicar.', v_padron;
  END IF;

  -- 1.6 Línea base de filas, para la post-condición de "cero filas tocadas".
  --     Nada de literales absolutos -- estas tablas crecen (7/9 hoy, pero es
  --     irrelevante: se comparan contra sí mismas, no contra un número fijo).
  SELECT count(*) INTO v_n FROM public.contratistas;
  PERFORM set_config('escociaos.mig114_count_contratistas', v_n::text, false);
  SELECT count(*) INTO v_n FROM public.lotes;
  PERFORM set_config('escociaos.mig114_count_lotes', v_n::text, false);
END $$;

-- ---------------------------------------------------------------------------
-- 2. El cambio. Dos sentencias atómicas, una por tabla.
-- ---------------------------------------------------------------------------
ALTER POLICY authenticated_delete_contratistas
  ON public.contratistas
  USING ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

ALTER POLICY "Usuarios autenticados pueden eliminar lotes"
  ON public.lotes
  USING ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

-- ---------------------------------------------------------------------------
-- 3. Segunda capa: `anon` pierde el GRANT de DELETE (precedente 081/110).
--    Hoy lo tiene en las dos y sólo lo detiene no figurar en ninguna política.
--    No se toca SELECT/INSERT/UPDATE/TRIGGER/TRUNCATE/REFERENCES -- ver la
--    sección de "hallazgo reportado, no corregido acá" más arriba.
-- ---------------------------------------------------------------------------
REVOKE DELETE ON public.contratistas FROM anon;
REVOKE DELETE ON public.lotes FROM anon;

-- ---------------------------------------------------------------------------
-- 4. Post-condiciones.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_n integer;
  v_pred text;
  v_gerencia_pred_antes text;
  v_count_contratistas_antes text;
  v_count_lotes_antes text;
  v_antes integer;
  v_ahora integer;
BEGIN
  v_gerencia_pred_antes := nullif(current_setting('escociaos.mig114_lotes_gerencia_pred', true), '');
  v_count_contratistas_antes := nullif(current_setting('escociaos.mig114_count_contratistas', true), '');
  v_count_lotes_antes := nullif(current_setting('escociaos.mig114_count_lotes', true), '');
  IF v_gerencia_pred_antes IS NULL OR v_count_contratistas_antes IS NULL OR v_count_lotes_antes IS NULL THEN
    RAISE WARNING 'POST 4: no se pudo leer la línea base completa (la sección 1 corrió en otra sesión). Las comprobaciones de "cero filas tocadas" y de "Gerencia acceso total sin tocar" que dependan del dato faltante NO se ejecutaron.';
  END IF;

  -- 4.1 `contratistas`: el predicado DELETE quedó acotado por rol.
  SELECT pg_get_expr(p.polqual, p.polrelid) INTO v_pred
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'contratistas' AND p.polname = 'authenticated_delete_contratistas' AND p.polcmd = 'd';

  IF v_pred IS NULL OR v_pred NOT LIKE '%get_user_role%' OR v_pred NOT LIKE '%Gerencia%' OR v_pred NOT LIKE '%Administrador%' OR btrim(v_pred) = 'true' THEN
    RAISE EXCEPTION 'POST 4.1: el predicado DELETE de contratistas no quedó acotado por rol. Actual: %', coalesce(v_pred, '<nulo>');
  END IF;

  -- 4.2 `lotes`: el predicado DELETE quedó acotado por rol.
  SELECT pg_get_expr(p.polqual, p.polrelid) INTO v_pred
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'lotes' AND p.polname = 'Usuarios autenticados pueden eliminar lotes' AND p.polcmd = 'd';

  IF v_pred IS NULL OR v_pred NOT LIKE '%get_user_role%' OR v_pred NOT LIKE '%Gerencia%' OR v_pred NOT LIKE '%Administrador%' OR btrim(v_pred) = 'true' THEN
    RAISE EXCEPTION 'POST 4.2: el predicado DELETE de lotes no quedó acotado por rol. Actual: %', coalesce(v_pred, '<nulo>');
  END IF;

  -- 4.3 Conteo de políticas sin cambiar: 4 en contratistas, 6 en lotes -- no
  --     se perdió ni se creó ninguna.
  SELECT count(*) INTO v_n FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'contratistas';
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'POST 4.3a: contratistas quedó con % políticas en vez de 4.', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'lotes';
  IF v_n <> 6 THEN
    RAISE EXCEPTION 'POST 4.3b: lotes quedó con % políticas en vez de 6.', v_n;
  END IF;

  -- 4.4 `Gerencia acceso total` sobre lotes no se tocó -- el predicado sigue
  --     siendo literalmente el mismo que se capturó en la pre-condición 1.4b.
  IF v_gerencia_pred_antes IS NOT NULL THEN
    SELECT pg_get_expr(p.polqual, p.polrelid) INTO v_pred
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'lotes' AND p.polname = 'Gerencia acceso total' AND p.polcmd = '*';

    IF v_pred IS DISTINCT FROM v_gerencia_pred_antes THEN
      RAISE EXCEPTION 'POST 4.4: "Gerencia acceso total" sobre lotes cambió de predicado. Esta migración no debía tocarla. Antes: %, ahora: %', v_gerencia_pred_antes, coalesce(v_pred, '<nulo>');
    END IF;
  END IF;

  -- 4.5 Cero filas tocadas, contra la línea base capturada en 1.6.
  IF v_count_contratistas_antes IS NOT NULL THEN
    v_antes := v_count_contratistas_antes::integer;
    SELECT count(*) INTO v_ahora FROM public.contratistas;
    IF v_ahora <> v_antes THEN
      RAISE EXCEPTION 'POST 4.5a: el conteo de contratistas cambió de % a %. Un ALTER POLICY no puede hacer eso; abortar.', v_antes, v_ahora;
    END IF;
  END IF;

  IF v_count_lotes_antes IS NOT NULL THEN
    v_antes := v_count_lotes_antes::integer;
    SELECT count(*) INTO v_ahora FROM public.lotes;
    IF v_ahora <> v_antes THEN
      RAISE EXCEPTION 'POST 4.5b: el conteo de lotes cambió de % a %. Un ALTER POLICY no puede hacer eso; abortar.', v_antes, v_ahora;
    END IF;
  END IF;

  -- 4.6 `anon` ya no puede borrar ninguna de las dos.
  IF has_table_privilege('anon', 'public.contratistas', 'DELETE') THEN
    RAISE EXCEPTION 'POST 4.6a: `anon` conserva el privilegio DELETE sobre contratistas.';
  END IF;
  IF has_table_privilege('anon', 'public.lotes', 'DELETE') THEN
    RAISE EXCEPTION 'POST 4.6b: `anon` conserva el privilegio DELETE sobre lotes.';
  END IF;

  -- 4.7 `authenticated` conserva el GRANT de tabla en las dos: la reja es
  --     RLS, no el grant -- igual que en la 110.
  IF NOT has_table_privilege('authenticated', 'public.contratistas', 'DELETE') THEN
    RAISE EXCEPTION 'POST 4.7a: `authenticated` perdió el GRANT de DELETE sobre contratistas. Eso rompería el borrado para TODOS los roles, incluidos Gerencia/Administrador.';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.lotes', 'DELETE') THEN
    RAISE EXCEPTION 'POST 4.7b: `authenticated` perdió el GRANT de DELETE sobre lotes. Eso rompería el borrado para TODOS los roles, incluidos Gerencia/Administrador.';
  END IF;

  -- 4.8 Lectura/inserción/actualización no se tocaron en ninguna de las dos
  --     tablas: siguen siendo los mismos predicados `true` de `authenticated`
  --     (comprobación de que el alcance fue sólo el DELETE de `authenticated`).
  SELECT count(*) INTO v_n
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'contratistas' AND p.polcmd IN ('r', 'a', 'w')
    AND btrim(coalesce(pg_get_expr(p.polqual, p.polrelid), pg_get_expr(p.polwithcheck, p.polrelid))) = 'true';
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'POST 4.8a: se esperaban intactas las 3 políticas de select/insert/update de contratistas, coinciden %.', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'lotes' AND p.polcmd IN ('r', 'a', 'w') AND p.polname LIKE 'Usuarios autenticados%'
    AND btrim(coalesce(pg_get_expr(p.polqual, p.polrelid), pg_get_expr(p.polwithcheck, p.polrelid))) = 'true';
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'POST 4.8b: se esperaban intactas las 3 políticas `Usuarios autenticados...` de select/insert/update de lotes, coinciden %.', v_n;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (ejecutable, devuelve las dos a como estaban):
--
--   ALTER POLICY authenticated_delete_contratistas                    ON public.contratistas USING (true);
--   ALTER POLICY "Usuarios autenticados pueden eliminar lotes"         ON public.lotes         USING (true);
--
--   GRANT DELETE ON public.contratistas TO anon;
--   GRANT DELETE ON public.lotes        TO anon;
--
-- El GRANT del rollback restaura el estado exacto previo. Devolvérselo a
-- `anon` no reabre por sí solo el borrado anónimo: seguiría sin figurar en
-- ninguna política -- está sólo para que el rollback sea fiel.
-- ---------------------------------------------------------------------------
