-- Migración 110: el DELETE de la cadena de trazabilidad GlobalGAP deja de ser
-- incondicional y pasa a exigir rol Gerencia o Administrador.
-- Cierra el hallazgo #37 del tablero de mantenimiento.
--
-- ############################################################################
-- ## ALCANCE CORREGIDO: SON 7 TABLAS, NO LAS 4 QUE NOMBRA EL HALLAZGO.      ##
-- ############################################################################
--
-- El hallazgo #37 nombra cuatro. Al verificar el pre-estado aparecieron **tres
-- más con la forma idéntica** dentro de la misma cadena, y dejarlas fuera
-- habría cerrado 4 de 7 puertas de la misma habitación:
--
--   ya en el hallazgo          | encontradas al verificar
--   aplicaciones_productos     | aplicaciones_compras
--   aplicaciones_calculos      | movimientos_diarios_empleados
--   aplicaciones_lotes         | movimientos_diarios_trabajadores
--   movimientos_diarios_productos
--
-- Las siete comparten exactamente la misma anatomía, comprobada contra
-- `pg_policy`: **tres** políticas por tabla — `authenticated_select` (`true`),
-- `authenticated_insert` (`WITH CHECK true`) y `authenticated_delete` (`true`)
-- —, todas `PERMISSIVE`, todas `TO authenticated`, y **ninguna política de
-- Gerencia ni de Administrador**. O sea que la always-true no es un duplicado
-- de un privilegio que esos roles ya tuvieran por otra vía: es el ÚNICO camino
-- de borrado que existe en estas tablas, incluido el que usa la propia app.
--
-- POR QUÉ SE ESCAPARON. El detector de políticas always-true de corridas
-- anteriores filtra por `roles LIKE '%public%' OR '%anon%'`, y estas apuntan
-- sólo a `{authenticated}`. Repetido sin ese filtro, el barrido devuelve **17**
-- tablas con DELETE incondicional. Las 10 restantes (monitoreos, lotes,
-- sublotes, plagas_enfermedades_catalogo, rondas_monitoreo, apiarios,
-- mon_colmenas, mon_conductividad, produccion, contratistas) **NO entran acá**:
-- casi todas ya tienen además políticas por rol, así que su pregunta no es
-- «acotar» sino «por qué sobra la always-true», que es otro análisis y otra
-- migración. Quedan reportadas aparte.
--
-- ---------------------------------------------------------------------------
-- QUÉ ESTÁ MAL HOY
-- ---------------------------------------------------------------------------
-- El padre está acotado y los hijos no. `movimientos_diarios` tiene «Usuarios
-- pueden eliminar sus propios movimientos» con `created_by = (SELECT auth.uid())`
-- y esa columna está poblada en 157 de 157 filas. Pero el usuario A **sí puede
-- borrar las líneas de producto** que cuelgan del movimiento del usuario B — qué
-- producto y qué dosis se aplicó, que es el hecho GlobalGAP central — mientras
-- el encabezado sigue afirmando que el trabajo se hizo.
--
-- Y no queda constancia en ninguna parte: `logs_auditoria` tiene 0 filas,
-- `hato_correcciones` sólo cubre las 5 tablas del hato, y
-- `aplicaciones_lotes_planificado` está vacía por contrato del proyecto. **Si
-- pasara, es irrecuperable.**
--
-- LATENTE HOY, NO UNA ESCALADA: con el padrón actual (8 cuentas, todas Gerencia
-- o Administrador, cero inactivas) ninguna cuenta gana un privilegio que no
-- tenga ya. Se dispara el día que exista la primera cuenta **Verificador** — la
-- tercera y última etiqueta del enum `rol_usuario` —, que heredaría DELETE
-- incondicional sobre toda la cadena sin que nadie toque una política.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ POR ROL Y NO POR PROPIETARIO -- esto no es preferencia, es obligatorio
-- ---------------------------------------------------------------------------
-- `CalculadoraAplicaciones.tsx` reguarda una aplicación con **borrar y
-- reinsertar**, desde la sesión del navegador, contra cinco de estas tablas
-- (líneas 492-507). Acotar por propietario rompería ese flujo en producción, y
-- además **ninguna de las siete tiene columna `created_by`** — las migraciones
-- 040/050/063/074 nunca cubrieron `aplicaciones*` ni `movimientos_diarios*` —,
-- así que no hay a qué acotar sin una migración nueva más un backfill de autoría
-- irrecuperable.
--
-- INVENTARIO COMPLETO DE CONSUMIDORES (9 sitios, los nueve en el navegador,
-- corregido por la revisión adversarial — el borrador citaba sólo la Calculadora):
--   src/components/aplicaciones/CalculadoraAplicaciones.tsx:492,501,505,506
--   src/components/aplicaciones/AplicacionesList.tsx:238-316 (251,274,295,305)
-- Los dos flujos **ya exigen Gerencia o Administrador antes de tocar la primera
-- de las siete**: el de edición hace `UPDATE aplicaciones` con `if (error) throw`
-- en la línea inmediatamente anterior, y el de borrado termina en
-- `DELETE FROM aplicaciones` — y `aplicaciones` sólo tiene dos políticas `ALL`
-- acotadas a esos dos roles. O sea que el rol ya estaba siendo exigido aguas
-- arriba; esta migración lo hace cierto también aguas abajo.
--
-- LA PRUEBA DE QUE ACOTAR POR ROL NO ROMPE NADA ya está en la base: la hermana
-- `aplicaciones_mezclas`, que ese MISMO flujo borra en la línea 504, tiene desde
-- siempre dos políticas `ALL` acotadas por `(SELECT get_user_role())` a Gerencia
-- y a Administrador — y funciona. Esta migración le da a las otras siete la
-- forma que la octava ya tenía.
--
-- Verificado además que **ninguna edge function borra de estas tablas**: todos
-- los consumidores viven en `src/components/aplicaciones/`. Y el `service_role`
-- tiene `rolbypassrls`, así que ni le aplica.
--
-- ---------------------------------------------------------------------------
-- DECISIONES DE FORMA
-- ---------------------------------------------------------------------------
-- `ALTER POLICY`, NUNCA `DROP` + `CREATE` (precedente 077): es atómico y no abre
-- una ventana en la que la tabla se queda sin política. También es lo que
-- mantiene la migración dentro del carril estrictamente aditivo.
--
-- Predicado envuelto como `(SELECT get_user_role())` (precedente 093): pelado se
-- re-evalúa una vez por fila; envuelto, el planificador lo sube a un InitPlan.
-- Es además la forma exacta que ya tienen las políticas de `aplicaciones_mezclas`.
--
-- `get_user_role()` devuelve el enum `rol_usuario`, así que los literales del
-- `IN` se coercionan solos. Con `auth.uid()` nulo devuelve NULL y `NULL IN (...)`
-- no es cierto: **falla cerrado**.
--
-- GRIETA CONOCIDA Y NO CERRADA ACÁ, a propósito: `get_user_role()` **no filtra
-- por `usuarios.activo`** (a diferencia de `es_usuario_gerencia()`, que sí). Un
-- Administrador desactivado en la app conservaría el borrado mientras su usuario
-- de Auth siga vivo. Hoy da igual — hay **cero** cuentas inactivas — y sobre
-- todo: esa grieta es idéntica en las **97** políticas que la migración 093 ya
-- envolvió y en las 6 políticas DELETE de Storage. Cerrarla acá sola sería
-- incoherente y no taparía nada, porque esa misma cuenta seguiría entrando a
-- todo lo demás. Va como cambio propio, sobre la función.
--
-- Se añade `REVOKE DELETE ... FROM anon` en las siete (precedente 081): hoy
-- `anon` tiene el GRANT de tabla en las siete y lo único que lo detiene es no
-- figurar en ninguna política. Están **a una política accidental `TO public`**
-- de ser borrables anónimamente. Segunda capa.
--
-- FILAS AFECTADAS: cero. Un `ALTER POLICY` no borra nada, y toda cuenta activa
-- ya es Gerencia o Administrador. La guarda 1.4 aborta si el padrón cambió.
--
-- ---------------------------------------------------------------------------
-- LO QUE ESTA MIGRACIÓN **NO** CIERRA -- leer antes de dar #37 por resuelto
-- ---------------------------------------------------------------------------
-- **El borrado en CASCADA sigue abierto, y salta RLS por diseño.** Seis padres
-- tienen `ON DELETE CASCADE` hacia estas siete tablas:
--
--   aplicaciones          -> calculos, compras, lotes
--   aplicaciones_mezclas  -> calculos, productos
--   movimientos_diarios   -> los tres `movimientos_diarios_*`
--   empleados             -> md_empleados, md_trabajadores
--   contratistas          -> md_trabajadores
--   lotes                 -> md_empleados, md_trabajadores
--
-- Las acciones de integridad referencial de PostgreSQL corren como dueño de la
-- tabla hija con `SECURITY_NOFORCE_RLS`, y las siete son `relowner = postgres`
-- con `relforcerowsecurity = false`. **La RLS del hijo no se evalúa en una
-- cascada.** Eso tiene dos consecuencias opuestas y las dos importan:
--
--   BUENA: esta migración NO PUEDE romper ninguna cascada existente. Era el
--   riesgo grande — `DailyMovementForm.tsx:716,771` y
--   `DailyMovementsDashboard.tsx:484` borran el padre `movimientos_diarios`
--   confiando en la cascada — y queda descartado por construcción.
--
--   MALA: tampoco la cierra. Tres de esos seis padres se borran MÁS
--   ampliamente que el predicado nuevo: `contratistas`
--   (`authenticated_delete_contratistas`, qual `true`), `lotes` («Usuarios
--   autenticados pueden eliminar lotes», qual `true`) y `movimientos_diarios`
--   (`created_by = auth.uid()`, sin rol).
--
-- Así que el día que exista una cuenta **Verificador**, seguiría pudiendo
-- destruir `movimientos_diarios_trabajadores` y `_empleados` borrando un
-- contratista o un lote. `lotes` está parcialmente frenado de rebote — tiene FKs
-- `RESTRICT` desde `aplicaciones_lotes` y `aplicaciones_calculos`, así que un
-- lote con aplicaciones no se puede borrar — pero **`contratistas` no tiene ese
-- freno**, y ya figuraba como brecha latente conocida sin que nadie supiera que
-- tenía una cascada hacia datos GlobalGAP.
--
-- **#37 no queda completo sin acotar también `contratistas` (y `lotes`).** Va
-- como hallazgo propio: son tablas de otro dominio, con su propio análisis de
-- quién las borra hoy.

-- ---------------------------------------------------------------------------
-- 1. Pre-condiciones. Cualquiera que falle aborta la transacción entera.
--
--    El `set_config` de 1.5 no es un efecto de la migración: es la captura del
--    estado previo que la post-condición 4.3 necesita para comparar los conteos
--    contra sí mismos. Nada de literales absolutos: estas tablas crecen con la
--    captura diaria -- `movimientos_diarios_productos` pasó de 761 a 765 filas
--    entre la detección del hallazgo y esta migración. Es exactamente la trampa
--    que le costó un día a la 103.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_tablas text[] := ARRAY[
    'aplicaciones_productos',
    'aplicaciones_calculos',
    'aplicaciones_lotes',
    'aplicaciones_compras',
    'movimientos_diarios_productos',
    'movimientos_diarios_empleados',
    'movimientos_diarios_trabajadores'
  ];
  v_t text;
  v_n integer;
  v_padron integer;
  v_conteos text := '';
BEGIN
  FOREACH v_t IN ARRAY v_tablas LOOP
    -- 1.1 La política DELETE existe, se llama como esperamos, es PERMISSIVE,
    --     apunta sólo a `authenticated` y su predicado es literalmente `true`.
    SELECT count(*) INTO v_n
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = v_t
      AND p.polname = 'authenticated_delete_' || v_t
      AND p.polcmd = 'd'
      AND p.polpermissive
      AND btrim(coalesce(pg_get_expr(p.polqual, p.polrelid), '')) = 'true'
      AND (SELECT count(*) FROM pg_roles r WHERE r.oid = ANY(p.polroles) AND r.rolname = 'authenticated') = 1
      AND array_length(p.polroles, 1) = 1;

    IF v_n <> 1 THEN
      RAISE EXCEPTION 'PRE 1.1 (%): no se encontró exactamente 1 política DELETE incondicional `authenticated_delete_%` PERMISSIVE y sólo TO authenticated; hay %. LA CAUSA MÁS PROBABLE ES QUE ESTA MIGRACIÓN YA SE APLICÓ -- comprobalo mirando si el predicado ya nombra get_user_role antes de asumir que alguien tocó la política. Este repo tiene historial de migraciones aplicadas sin fila en el ledger (067, 079, 108, 035-039, 041, 046, 093), así que la ausencia de fila NO prueba que no se aplicó.', v_t, v_t, v_n;
    END IF;

    -- 1.2 La tabla tiene EXACTAMENTE 3 políticas. Es la comprobación que prueba
    --     que no existe ninguna política de Gerencia/Administrador -- si la
    --     hubiera, este cambio sería redundante y el análisis estaría mal.
    SELECT count(*) INTO v_n
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = v_t;

    IF v_n <> 3 THEN
      RAISE EXCEPTION 'PRE 1.2 (%): se esperaban exactamente 3 políticas (select/insert/delete), hay %. El análisis del hallazgo ya no describe esta tabla.', v_t, v_n;
    END IF;

    -- 1.3 Cero políticas RESTRICTIVE. Una restrictiva cambiaría por completo el
    --     razonamiento: las permisivas se combinan con OR, las restrictivas con AND.
    SELECT count(*) INTO v_n
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = v_t AND NOT p.polpermissive;

    IF v_n <> 0 THEN
      RAISE EXCEPTION 'PRE 1.3 (%): aparecieron % políticas RESTRICTIVE; revisar antes de seguir.', v_t, v_n;
    END IF;

    -- Captura del conteo de filas para la post-condición 4.3.
    EXECUTE format('SELECT count(*) FROM public.%I', v_t) INTO v_n;
    v_conteos := v_conteos || v_t || '=' || v_n || ';';
  END LOOP;

  -- 1.4 EL PADRÓN. Si existe una sola cuenta activa fuera de Gerencia y
  --     Administrador, esta migración le QUITA el borrado a alguien que hoy lo
  --     usa, y eso deja de ser un cambio de cero filas afectadas.
  SELECT count(*) INTO v_padron
  FROM public.usuarios
  WHERE activo AND rol NOT IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario);

  IF v_padron > 0 THEN
    RAISE EXCEPTION 'PRE 1.4: hay % cuenta(s) activa(s) fuera de Gerencia/Administrador. El padrón cambió desde el barrido: esta migración les revocaría el borrado. Revisar antes de aplicar.', v_padron;
  END IF;

  -- 1.5 Guardar los conteos para compararlos contra sí mismos al final.
  PERFORM set_config('escociaos.mig110_conteos', v_conteos, false);
END $$;

-- ---------------------------------------------------------------------------
-- 2. El cambio. Siete sentencias atómicas, una por tabla.
--    Misma forma que las políticas que `aplicaciones_mezclas` ya tenía.
-- ---------------------------------------------------------------------------
ALTER POLICY authenticated_delete_aplicaciones_productos
  ON public.aplicaciones_productos
  USING ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

ALTER POLICY authenticated_delete_aplicaciones_calculos
  ON public.aplicaciones_calculos
  USING ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

ALTER POLICY authenticated_delete_aplicaciones_lotes
  ON public.aplicaciones_lotes
  USING ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

ALTER POLICY authenticated_delete_aplicaciones_compras
  ON public.aplicaciones_compras
  USING ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

ALTER POLICY authenticated_delete_movimientos_diarios_productos
  ON public.movimientos_diarios_productos
  USING ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

-- `movimientos_diarios_empleados` tiene 0 filas: quedó muerta, reemplazada por
-- `movimientos_diarios_trabajadores`. Se acota igual -- es gratis, y una tabla
-- vacía con DELETE incondicional sigue siendo una puerta abierta el día que
-- alguien la vuelva a usar.
ALTER POLICY authenticated_delete_movimientos_diarios_empleados
  ON public.movimientos_diarios_empleados
  USING ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

ALTER POLICY authenticated_delete_movimientos_diarios_trabajadores
  ON public.movimientos_diarios_trabajadores
  USING ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

-- ---------------------------------------------------------------------------
-- 3. Segunda capa: `anon` pierde el GRANT de DELETE (precedente 081).
--    Hoy lo tiene en las siete y sólo lo detiene no figurar en ninguna política.
--    No se toca SELECT ni INSERT: eso cambiaría el comportamiento de la app.
-- ---------------------------------------------------------------------------
REVOKE DELETE ON public.aplicaciones_productos FROM anon;
REVOKE DELETE ON public.aplicaciones_calculos FROM anon;
REVOKE DELETE ON public.aplicaciones_lotes FROM anon;
REVOKE DELETE ON public.aplicaciones_compras FROM anon;
REVOKE DELETE ON public.movimientos_diarios_productos FROM anon;
REVOKE DELETE ON public.movimientos_diarios_empleados FROM anon;
REVOKE DELETE ON public.movimientos_diarios_trabajadores FROM anon;

-- ---------------------------------------------------------------------------
-- 4. Post-condiciones.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_tablas text[] := ARRAY[
    'aplicaciones_productos',
    'aplicaciones_calculos',
    'aplicaciones_lotes',
    'aplicaciones_compras',
    'movimientos_diarios_productos',
    'movimientos_diarios_empleados',
    'movimientos_diarios_trabajadores'
  ];
  v_t text;
  v_n integer;
  v_pred text;
  v_conteos text;
  v_antes integer;
  v_ahora integer;
BEGIN
  v_conteos := nullif(current_setting('escociaos.mig110_conteos', true), '');
  IF v_conteos IS NULL THEN
    RAISE WARNING 'POST 4.3: no se pudo leer el conteo previo (la sentencia 1.5 corrió en otra sesión). La comprobación de "cero filas tocadas" NO se ejecutó.';
  END IF;

  FOREACH v_t IN ARRAY v_tablas LOOP
    -- 4.1 El predicado quedó acotado a los dos roles, vía get_user_role.
    SELECT pg_get_expr(p.polqual, p.polrelid) INTO v_pred
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = v_t
      AND p.polname = 'authenticated_delete_' || v_t
      AND p.polcmd = 'd';

    IF v_pred IS NULL
       OR v_pred NOT LIKE '%get_user_role%'
       OR v_pred NOT LIKE '%Gerencia%'
       OR v_pred NOT LIKE '%Administrador%'
       OR btrim(v_pred) = 'true' THEN
      RAISE EXCEPTION 'POST 4.1 (%): el predicado DELETE no quedó acotado por rol. Actual: %', v_t, coalesce(v_pred, '<nulo>');
    END IF;

    -- 4.2 Siguen siendo 3 políticas: no se perdió ninguna, no se creó ninguna.
    SELECT count(*) INTO v_n
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = v_t;

    IF v_n <> 3 THEN
      RAISE EXCEPTION 'POST 4.2 (%): quedaron % políticas en vez de 3.', v_t, v_n;
    END IF;

    -- 4.3 Cero filas tocadas, contra la línea base capturada en 1.5.
    IF v_conteos IS NOT NULL THEN
      v_antes := split_part(split_part(v_conteos, v_t || '=', 2), ';', 1)::integer;
      EXECUTE format('SELECT count(*) FROM public.%I', v_t) INTO v_ahora;
      IF v_ahora <> v_antes THEN
        RAISE EXCEPTION 'POST 4.3 (%): el conteo de filas cambió de % a %. Un ALTER POLICY no puede hacer eso; abortar.', v_t, v_antes, v_ahora;
      END IF;
    END IF;

    -- 4.4 `anon` ya no puede borrar.
    IF has_table_privilege('anon', 'public.' || v_t, 'DELETE') THEN
      RAISE EXCEPTION 'POST 4.4 (%): `anon` conserva el privilegio DELETE.', v_t;
    END IF;

    -- 4.5 Leer y escribir NO se tocaron: sus predicados siguen siendo `true`.
    --     Es la comprobación de que el alcance fue sólo el DELETE.
    SELECT count(*) INTO v_n
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = v_t
      AND p.polcmd IN ('r', 'a')
      AND btrim(coalesce(pg_get_expr(p.polqual, p.polrelid), pg_get_expr(p.polwithcheck, p.polrelid))) = 'true';

    IF v_n <> 2 THEN
      RAISE EXCEPTION 'POST 4.5 (%): se esperaban intactas las 2 políticas de select/insert, coinciden %.', v_t, v_n;
    END IF;

    -- 4.6 `authenticated` conserva el GRANT de tabla: la reja es RLS, no el grant.
    IF NOT has_table_privilege('authenticated', 'public.' || v_t, 'DELETE') THEN
      RAISE EXCEPTION 'POST 4.6 (%): `authenticated` perdió el GRANT de DELETE. Eso rompería el borrar-y-reinsertar de la Calculadora para TODOS los roles.', v_t;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (ejecutable, devuelve las siete a como estaban):
--
--   ALTER POLICY authenticated_delete_aplicaciones_productos            ON public.aplicaciones_productos            USING (true);
--   ALTER POLICY authenticated_delete_aplicaciones_calculos             ON public.aplicaciones_calculos             USING (true);
--   ALTER POLICY authenticated_delete_aplicaciones_lotes                ON public.aplicaciones_lotes                USING (true);
--   ALTER POLICY authenticated_delete_aplicaciones_compras              ON public.aplicaciones_compras              USING (true);
--   ALTER POLICY authenticated_delete_movimientos_diarios_productos     ON public.movimientos_diarios_productos     USING (true);
--   ALTER POLICY authenticated_delete_movimientos_diarios_empleados     ON public.movimientos_diarios_empleados     USING (true);
--   ALTER POLICY authenticated_delete_movimientos_diarios_trabajadores  ON public.movimientos_diarios_trabajadores  USING (true);
--
--   GRANT DELETE ON public.aplicaciones_productos            TO anon;
--   GRANT DELETE ON public.aplicaciones_calculos             TO anon;
--   GRANT DELETE ON public.aplicaciones_lotes                TO anon;
--   GRANT DELETE ON public.aplicaciones_compras              TO anon;
--   GRANT DELETE ON public.movimientos_diarios_productos     TO anon;
--   GRANT DELETE ON public.movimientos_diarios_empleados     TO anon;
--   GRANT DELETE ON public.movimientos_diarios_trabajadores  TO anon;
--
-- El GRANT del rollback restaura el estado exacto previo. Vale aclarar que
-- devolvérselo a `anon` NO reabre por sí solo el borrado anónimo: seguiría sin
-- figurar en ninguna política. Está sólo para que el rollback sea fiel.
-- ---------------------------------------------------------------------------
