-- =============================================================================
-- 077_rls_initplan_select_wrap.sql
--
-- Cierra las 62 advertencias `auth_rls_initplan` del linter de Supabase
-- (item 5 del issue #96, aprobado por Santiago).
--
-- QUE PASA HOY
-- ------------
-- `auth.uid()` es una funcion STABLE sin argumentos, pero escrita SUELTA dentro
-- del predicado de una policy el planeador la trata como parte de la condicion
-- de filtro y la evalua UNA VEZ POR FILA analizada. En `monitoreos` (4.155
-- filas) o `hato_chequeo_vacas` (~1.5k) eso son miles de llamadas por consulta,
-- y en las policies que ademas hacen `EXISTS (SELECT 1 FROM usuarios ...)` la
-- subconsulta entera se repite con ella.
--
-- Envolverla como `(SELECT auth.uid())` la convierte en un InitPlan: Postgres
-- la evalua UNA sola vez al inicio de la consulta y reutiliza el escalar.
--
-- POR QUE ES SEMANTICAMENTE IDENTICO
-- ----------------------------------
-- `auth.uid()`, `auth.role()` y `auth.jwt()` son STABLE (verificado en
-- produccion contra `pg_proc.provolatile = 's'`): por contrato devuelven el
-- mismo valor durante toda la sentencia. Un `(SELECT f())` de una funcion
-- STABLE sin argumentos y sin correlacion con la fila devuelve exactamente ese
-- mismo valor. Lo unico que cambia es CUANTAS VECES se evalua, nunca QUE
-- devuelve. Ninguna fila que hoy es visible deja de serlo, y ninguna que hoy
-- esta bloqueada se abre.
--
-- Ningun predicado se reescribe, se simplifica ni se reordena: cada uno se
-- reproduce verbatim y solo se le agregan los parentesis del SELECT. El
-- predicado original va como comentario encima de cada cambio para que el diff
-- sea auditable linea por linea.
--
-- Se usa `ALTER POLICY` y no `DROP` + `CREATE`: es atomico, no deja una ventana
-- en la que la tabla quede sin esa policy, y no puede perder por accidente el
-- `TO <rol>` ni el `AS PERMISSIVE` originales. Tambien lo hace idempotente:
-- correr la migracion dos veces deja el mismo predicado.
--
-- En las policies `FOR ALL` cuyo `with_check` esta en NULL (hereda el USING) se
-- toca SOLO el USING, para que siga heredando. Poner un WITH CHECK explicito
-- ahi seria un cambio de forma innecesario.
--
-- LO QUE ESTA MIGRACION DELIBERADAMENTE NO HACE
-- ---------------------------------------------
-- 1. NO toca las 485 advertencias `multiple_permissive_policies`. Consolidar
--    policies permisivas cambia el modelo de acceso (dos policies OR-eadas no
--    son una sola policy con el OR adentro cuando cambian los roles, los
--    comandos o las columnas alcanzadas) y exige revision de seguridad propia.
--    Fuera de alcance por decision explicita.
--
-- 2. NO envuelve `es_usuario_gerencia()` ni `get_user_role()`. Envolverlas
--    seria el mismo tipo de arreglo SOLO si fueran STABLE, y no lo son:
--    ambas estan declaradas VOLATILE en produccion (`provolatile = 'v'`).
--    Postgres nunca hoistea una funcion VOLATILE a InitPlan -- `(SELECT
--    get_user_role())` seguiria ejecutandose por fila, asi que el cambio no
--    ganaria nada y su equivalencia dependeria de una premisa falsa. Marcarlas
--    STABLE es un cambio de contrato de la funcion, con su propio analisis, y
--    no cabe en una migracion "mecanicamente equivalente".
--    Consecuencia: las ~100 policies que dependen SOLO de esas dos funciones
--    (todas las `fin_*`, `aplicaciones*`, `despachos*`, `productos`, ...) no
--    aparecen en las 62 advertencias y quedan igual que hoy. Es trabajo
--    pendiente aparte, no un olvido.
--
-- 3. NO toca las 12 policies de `storage.objects` (facturas, chequeos-fotos).
--    Tambien llaman `auth.uid()` suelto, pero el linter no las reporta -- el
--    schema `storage` es de Supabase y sus policies se administran desde el
--    dashboard. Se listan al final para que quede constancia.
--
-- Filas de datos afectadas: 0. Es un cambio de predicado, no de contenido.
-- Policies reescritas: 62 (las 62 que reporta el linter, todas en `public`).
--
-- Referencia: https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOQUE 1 -- Propiedad directa de la fila (`auth.uid()` comparado con columna)
-- -----------------------------------------------------------------------------

-- esco_memorias_owner_all [ALL] -- USING y WITH CHECK, ambos: (user_id = auth.uid())
ALTER POLICY "esco_memorias_owner_all" ON public.esco_memorias
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- movimientos_diarios "Usuarios pueden actualizar sus propios movimientos" [UPDATE]
-- original USING: (created_by = auth.uid())   -- with_check NULL, no se toca
ALTER POLICY "Usuarios pueden actualizar sus propios movimientos" ON public.movimientos_diarios
  USING (created_by = (SELECT auth.uid()));

-- movimientos_diarios "Usuarios pueden eliminar sus propios movimientos" [DELETE]
-- original USING: (created_by = auth.uid())
ALTER POLICY "Usuarios pueden eliminar sus propios movimientos" ON public.movimientos_diarios
  USING (created_by = (SELECT auth.uid()));

-- reportes_semanales "Users can delete own reports" [DELETE]
-- original USING: (generado_por = auth.uid())
ALTER POLICY "Users can delete own reports" ON public.reportes_semanales
  USING (generado_por = (SELECT auth.uid()));

-- usuarios "Usuario ve su perfil" [SELECT]
-- original USING: ((id = auth.uid()) OR (get_user_role() = 'Gerencia'::rol_usuario))
-- Solo se envuelve `auth.uid()`. `get_user_role()` es VOLATILE -- ver nota 2 del
-- encabezado. Con `auth.uid()` envuelta la advertencia de esta policy cierra
-- igual, porque el linter solo mira `auth.*` y `current_setting`.
ALTER POLICY "Usuario ve su perfil" ON public.usuarios
  USING ((id = (SELECT auth.uid())) OR (get_user_role() = 'Gerencia'::rol_usuario));


-- -----------------------------------------------------------------------------
-- BLOQUE 2 -- Chat de Esco (propiedad de la fila + rol Gerencia)
-- -----------------------------------------------------------------------------

-- chat_conversations_select [SELECT] / _delete [DELETE] / _insert [INSERT]
-- original (identico en los tres):
--   ((auth.uid() = user_id) AND (EXISTS ( SELECT 1
--      FROM usuarios
--     WHERE ((usuarios.id = auth.uid()) AND (usuarios.rol = 'Gerencia'::rol_usuario)))))
-- Se envuelven las DOS ocurrencias de auth.uid() (la de la columna y la del EXISTS).
ALTER POLICY "chat_conversations_select" ON public.chat_conversations
  USING (
    ((SELECT auth.uid()) = user_id)
    AND (EXISTS ( SELECT 1
                    FROM usuarios
                   WHERE ((usuarios.id = (SELECT auth.uid()))
                     AND (usuarios.rol = 'Gerencia'::rol_usuario))))
  );

ALTER POLICY "chat_conversations_delete" ON public.chat_conversations
  USING (
    ((SELECT auth.uid()) = user_id)
    AND (EXISTS ( SELECT 1
                    FROM usuarios
                   WHERE ((usuarios.id = (SELECT auth.uid()))
                     AND (usuarios.rol = 'Gerencia'::rol_usuario))))
  );

ALTER POLICY "chat_conversations_insert" ON public.chat_conversations
  WITH CHECK (
    ((SELECT auth.uid()) = user_id)
    AND (EXISTS ( SELECT 1
                    FROM usuarios
                   WHERE ((usuarios.id = (SELECT auth.uid()))
                     AND (usuarios.rol = 'Gerencia'::rol_usuario))))
  );

-- chat_messages_select [SELECT] / _insert [INSERT]
-- original (identico en ambos):
--   (EXISTS ( SELECT 1
--      FROM chat_conversations
--     WHERE ((chat_conversations.id = chat_messages.conversation_id)
--       AND (chat_conversations.user_id = auth.uid()))))
ALTER POLICY "chat_messages_select" ON public.chat_messages
  USING (
    EXISTS ( SELECT 1
               FROM chat_conversations
              WHERE ((chat_conversations.id = chat_messages.conversation_id)
                AND (chat_conversations.user_id = (SELECT auth.uid()))))
  );

ALTER POLICY "chat_messages_insert" ON public.chat_messages
  WITH CHECK (
    EXISTS ( SELECT 1
               FROM chat_conversations
              WHERE ((chat_conversations.id = chat_messages.conversation_id)
                AND (chat_conversations.user_id = (SELECT auth.uid()))))
  );


-- -----------------------------------------------------------------------------
-- BLOQUE 3 -- Labores y empleados (patron `usuarios` sin alias, con `activo`)
-- -----------------------------------------------------------------------------
-- Tres predicados se repiten literalmente en este bloque. Se escriben completos
-- en cada ALTER a proposito -- no hay forma de parametrizar un predicado de
-- policy, y una macro haria el diff imposible de auditar.
--
--   (A) Gerencia activa:
--       EXISTS (SELECT 1 FROM usuarios
--                WHERE usuarios.id = auth.uid()
--                  AND usuarios.rol = 'Gerencia'::rol_usuario
--                  AND usuarios.activo = true)
--   (B) Administrador o Gerencia, activos:
--       ... usuarios.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]) ...
--   (C) Verificador activo:
--       ... usuarios.rol = 'Verificador'::rol_usuario ...

-- ---- empleados ----

-- "Gerencia full access on empleados" [ALL] -- USING y WITH CHECK, ambos (A)
ALTER POLICY "Gerencia full access on empleados" ON public.empleados
  USING (EXISTS ( SELECT 1
                    FROM usuarios
                   WHERE ((usuarios.id = (SELECT auth.uid()))
                     AND (usuarios.rol = 'Gerencia'::rol_usuario)
                     AND (usuarios.activo = true))))
  WITH CHECK (EXISTS ( SELECT 1
                    FROM usuarios
                   WHERE ((usuarios.id = (SELECT auth.uid()))
                     AND (usuarios.rol = 'Gerencia'::rol_usuario)
                     AND (usuarios.activo = true))));

-- "Administrador read access on empleados" [SELECT] -- USING (B)
ALTER POLICY "Administrador read access on empleados" ON public.empleados
  USING (EXISTS ( SELECT 1
                    FROM usuarios
                   WHERE ((usuarios.id = (SELECT auth.uid()))
                     AND (usuarios.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))
                     AND (usuarios.activo = true))));

-- "Administrador insert access on empleados" [INSERT] -- WITH CHECK (B)
ALTER POLICY "Administrador insert access on empleados" ON public.empleados
  WITH CHECK (EXISTS ( SELECT 1
                    FROM usuarios
                   WHERE ((usuarios.id = (SELECT auth.uid()))
                     AND (usuarios.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))
                     AND (usuarios.activo = true))));

-- "Verificador read active empleados" [SELECT]
-- original USING: ((estado = 'Activo'::estado_empleado) AND (EXISTS ( SELECT 1
--    FROM usuarios
--   WHERE ((usuarios.id = auth.uid())
--     AND (usuarios.rol = ANY (ARRAY['Verificador'::rol_usuario, 'Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))
--     AND (usuarios.activo = true)))))
ALTER POLICY "Verificador read active empleados" ON public.empleados
  USING (
    (estado = 'Activo'::estado_empleado)
    AND (EXISTS ( SELECT 1
                    FROM usuarios
                   WHERE ((usuarios.id = (SELECT auth.uid()))
                     AND (usuarios.rol = ANY (ARRAY['Verificador'::rol_usuario, 'Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))
                     AND (usuarios.activo = true))))
  );

-- ---- registros_trabajo ----
-- Las dos policies [ALL] tienen with_check en NULL: solo se toca el USING.

-- "Gerencia full access on registros_trabajo" [ALL] -- USING (A)
ALTER POLICY "Gerencia full access on registros_trabajo" ON public.registros_trabajo
  USING (EXISTS ( SELECT 1
                    FROM usuarios
                   WHERE ((usuarios.id = (SELECT auth.uid()))
                     AND (usuarios.rol = 'Gerencia'::rol_usuario)
                     AND (usuarios.activo = true))));

-- "Administrador access registros_trabajo" [ALL] -- USING (B)
ALTER POLICY "Administrador access registros_trabajo" ON public.registros_trabajo
  USING (EXISTS ( SELECT 1
                    FROM usuarios
                   WHERE ((usuarios.id = (SELECT auth.uid()))
                     AND (usuarios.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))
                     AND (usuarios.activo = true))));

-- "Verificador read registros_trabajo" [SELECT] -- USING (C)
ALTER POLICY "Verificador read registros_trabajo" ON public.registros_trabajo
  USING (EXISTS ( SELECT 1
                    FROM usuarios
                   WHERE ((usuarios.id = (SELECT auth.uid()))
                     AND (usuarios.rol = 'Verificador'::rol_usuario)
                     AND (usuarios.activo = true))));

-- ---- tareas ----

-- "Gerencia full access on tareas" [ALL] -- with_check NULL, solo USING (A)
ALTER POLICY "Gerencia full access on tareas" ON public.tareas
  USING (EXISTS ( SELECT 1
                    FROM usuarios
                   WHERE ((usuarios.id = (SELECT auth.uid()))
                     AND (usuarios.rol = 'Gerencia'::rol_usuario)
                     AND (usuarios.activo = true))));

-- "Administrador read tareas" [SELECT] -- USING (B)
ALTER POLICY "Administrador read tareas" ON public.tareas
  USING (EXISTS ( SELECT 1
                    FROM usuarios
                   WHERE ((usuarios.id = (SELECT auth.uid()))
                     AND (usuarios.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))
                     AND (usuarios.activo = true))));

-- "Administrador update tareas" [UPDATE] -- with_check NULL, solo USING (B)
ALTER POLICY "Administrador update tareas" ON public.tareas
  USING (EXISTS ( SELECT 1
                    FROM usuarios
                   WHERE ((usuarios.id = (SELECT auth.uid()))
                     AND (usuarios.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))
                     AND (usuarios.activo = true))));

-- "Administrador insert tareas" [INSERT] -- WITH CHECK (B)
ALTER POLICY "Administrador insert tareas" ON public.tareas
  WITH CHECK (EXISTS ( SELECT 1
                    FROM usuarios
                   WHERE ((usuarios.id = (SELECT auth.uid()))
                     AND (usuarios.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))
                     AND (usuarios.activo = true))));

-- "Verificador read tareas" [SELECT] -- USING (C)
ALTER POLICY "Verificador read tareas" ON public.tareas
  USING (EXISTS ( SELECT 1
                    FROM usuarios
                   WHERE ((usuarios.id = (SELECT auth.uid()))
                     AND (usuarios.rol = 'Verificador'::rol_usuario)
                     AND (usuarios.activo = true))));

-- "Administrador delete own tareas" [DELETE] -- la policy que instalo la 040.
-- original USING: ((EXISTS ( SELECT 1
--    FROM usuarios
--   WHERE ((usuarios.id = auth.uid())
--     AND (usuarios.rol = 'Administrador'::rol_usuario)
--     AND (usuarios.activo = true))))
--  AND ((created_by = auth.uid()) OR (created_by IS NULL)))
-- Se envuelven las dos ocurrencias. La rama `created_by IS NULL` (filas legacy)
-- se conserva intacta.
ALTER POLICY "Administrador delete own tareas" ON public.tareas
  USING (
    (EXISTS ( SELECT 1
                FROM usuarios
               WHERE ((usuarios.id = (SELECT auth.uid()))
                 AND (usuarios.rol = 'Administrador'::rol_usuario)
                 AND (usuarios.activo = true))))
    AND ((created_by = (SELECT auth.uid())) OR (created_by IS NULL))
  );

-- ---- tipos_tareas ----

-- "Gerencia full access on tipos_tareas" [ALL] -- with_check NULL, solo USING (A)
ALTER POLICY "Gerencia full access on tipos_tareas" ON public.tipos_tareas
  USING (EXISTS ( SELECT 1
                    FROM usuarios
                   WHERE ((usuarios.id = (SELECT auth.uid()))
                     AND (usuarios.rol = 'Gerencia'::rol_usuario)
                     AND (usuarios.activo = true))));

-- "Administrador read tipos_tareas" [SELECT] -- USING (B)
ALTER POLICY "Administrador read tipos_tareas" ON public.tipos_tareas
  USING (EXISTS ( SELECT 1
                    FROM usuarios
                   WHERE ((usuarios.id = (SELECT auth.uid()))
                     AND (usuarios.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))
                     AND (usuarios.activo = true))));

-- "Administrador insert tipos_tareas" [INSERT] -- WITH CHECK (B)
ALTER POLICY "Administrador insert tipos_tareas" ON public.tipos_tareas
  WITH CHECK (EXISTS ( SELECT 1
                    FROM usuarios
                   WHERE ((usuarios.id = (SELECT auth.uid()))
                     AND (usuarios.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))
                     AND (usuarios.activo = true))));

-- "Verificador read tipos_tareas" [SELECT] -- USING (C)
ALTER POLICY "Verificador read tipos_tareas" ON public.tipos_tareas
  USING (EXISTS ( SELECT 1
                    FROM usuarios
                   WHERE ((usuarios.id = (SELECT auth.uid()))
                     AND (usuarios.rol = 'Verificador'::rol_usuario)
                     AND (usuarios.activo = true))));


-- -----------------------------------------------------------------------------
-- BLOQUE 4 -- Finanzas (patron con alias `u`, SIN chequeo de `activo`)
-- -----------------------------------------------------------------------------
-- OJO: estas policies NO filtran por `u.activo`, a diferencia del bloque 3. Esa
-- asimetria existe hoy en produccion y se conserva tal cual -- corregirla seria
-- un cambio del modelo de acceso, no un arreglo de initplan.

-- ---- fin_presupuestos (migracion 034) ----
-- original (identico en las cuatro):
--   (EXISTS ( SELECT 1 FROM usuarios u
--     WHERE ((u.id = auth.uid()) AND (u.rol = 'Gerencia'::rol_usuario))))

ALTER POLICY "fin_presupuestos_select" ON public.fin_presupuestos
  USING (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid())) AND (u.rol = 'Gerencia'::rol_usuario))));

ALTER POLICY "fin_presupuestos_update" ON public.fin_presupuestos
  USING (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid())) AND (u.rol = 'Gerencia'::rol_usuario))));

ALTER POLICY "fin_presupuestos_delete" ON public.fin_presupuestos
  USING (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid())) AND (u.rol = 'Gerencia'::rol_usuario))));

ALTER POLICY "fin_presupuestos_insert" ON public.fin_presupuestos
  WITH CHECK (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid())) AND (u.rol = 'Gerencia'::rol_usuario))));

-- ---- fin_proveedores (migracion 037) -- sin alias, solo Administrador ----
-- original: (EXISTS ( SELECT 1 FROM usuarios
--   WHERE ((usuarios.id = auth.uid()) AND (usuarios.rol = 'Administrador'::rol_usuario))))
-- Las otras cuatro policies de esta tabla (fin_proveedores_select/insert/
-- update/delete) usan `es_usuario_gerencia()` y quedan intactas -- ver nota 2.

ALTER POLICY "fin_proveedores_admin_select" ON public.fin_proveedores
  USING (EXISTS ( SELECT 1 FROM usuarios
                   WHERE ((usuarios.id = (SELECT auth.uid()))
                     AND (usuarios.rol = 'Administrador'::rol_usuario))));

ALTER POLICY "fin_proveedores_admin_insert" ON public.fin_proveedores
  WITH CHECK (EXISTS ( SELECT 1 FROM usuarios
                   WHERE ((usuarios.id = (SELECT auth.uid()))
                     AND (usuarios.rol = 'Administrador'::rol_usuario))));

-- ---- fin_transacciones_ganado (migracion 023, extendida por la 059) ----
-- GlobalGAP: tabla de trazabilidad financiera del ganado. Ocho policies, cuatro
-- pares admin/gerencia. Original de cada una, con alias `u` y sin `activo`:
--   (EXISTS ( SELECT 1 FROM usuarios u
--     WHERE ((u.id = auth.uid()) AND (u.rol = '<ROL>'::rol_usuario))))

ALTER POLICY "fin_transacciones_ganado_select_gerencia" ON public.fin_transacciones_ganado
  USING (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid())) AND (u.rol = 'Gerencia'::rol_usuario))));

ALTER POLICY "fin_transacciones_ganado_update_gerencia" ON public.fin_transacciones_ganado
  USING (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid())) AND (u.rol = 'Gerencia'::rol_usuario))));

ALTER POLICY "fin_transacciones_ganado_delete_gerencia" ON public.fin_transacciones_ganado
  USING (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid())) AND (u.rol = 'Gerencia'::rol_usuario))));

ALTER POLICY "fin_transacciones_ganado_insert_gerencia" ON public.fin_transacciones_ganado
  WITH CHECK (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid())) AND (u.rol = 'Gerencia'::rol_usuario))));

ALTER POLICY "fin_transacciones_ganado_select_admin" ON public.fin_transacciones_ganado
  USING (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid())) AND (u.rol = 'Administrador'::rol_usuario))));

ALTER POLICY "fin_transacciones_ganado_update_admin" ON public.fin_transacciones_ganado
  USING (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid())) AND (u.rol = 'Administrador'::rol_usuario))));

ALTER POLICY "fin_transacciones_ganado_delete_admin" ON public.fin_transacciones_ganado
  USING (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid())) AND (u.rol = 'Administrador'::rol_usuario))));

ALTER POLICY "fin_transacciones_ganado_insert_admin" ON public.fin_transacciones_ganado
  WITH CHECK (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid())) AND (u.rol = 'Administrador'::rol_usuario))));


-- -----------------------------------------------------------------------------
-- BLOQUE 5 -- Telegram
-- -----------------------------------------------------------------------------

-- telegram_usuarios "Gerencia puede gestionar telegram_usuarios" [ALL]
-- original, IDENTICO en USING y WITH CHECK (aqui with_check SI esta poblado):
--   (EXISTS ( SELECT 1 FROM usuarios
--     WHERE ((usuarios.id = auth.uid()) AND (usuarios.rol = 'Gerencia'::rol_usuario))))
ALTER POLICY "Gerencia puede gestionar telegram_usuarios" ON public.telegram_usuarios
  USING (EXISTS ( SELECT 1 FROM usuarios
                   WHERE ((usuarios.id = (SELECT auth.uid()))
                     AND (usuarios.rol = 'Gerencia'::rol_usuario))))
  WITH CHECK (EXISTS ( SELECT 1 FROM usuarios
                   WHERE ((usuarios.id = (SELECT auth.uid()))
                     AND (usuarios.rol = 'Gerencia'::rol_usuario))));


-- -----------------------------------------------------------------------------
-- BLOQUE 6 -- Ganado (044) y Hato Lechero (053-057): patron 044 de escritura
-- -----------------------------------------------------------------------------
-- Veinte policies con el MISMO predicado exacto en USING y en WITH CHECK,
-- verificado con un GROUP BY sobre pg_policies (un solo grupo, n = 20):
--   (EXISTS ( SELECT 1 FROM usuarios u
--     WHERE ((u.id = auth.uid())
--       AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))))
--
-- Este bloque es el de mayor impacto medible: `hato_chequeo_vacas` (~1.5k filas)
-- y `hato_eventos` se leen en cada carga del modulo, que esta en rollout con
-- usuarios reales.

-- ---- gan_* (6) ----
ALTER POLICY "gan_ubicaciones_write_admin_gerencia" ON public.gan_ubicaciones
  USING (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))))
  WITH CHECK (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))));

ALTER POLICY "gan_fincas_write_admin_gerencia" ON public.gan_fincas
  USING (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))))
  WITH CHECK (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))));

ALTER POLICY "gan_potreros_write_admin_gerencia" ON public.gan_potreros
  USING (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))))
  WITH CHECK (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))));

ALTER POLICY "gan_inventario_write_admin_gerencia" ON public.gan_inventario
  USING (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))))
  WITH CHECK (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))));

ALTER POLICY "gan_movimientos_write_admin_gerencia" ON public.gan_movimientos
  USING (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))))
  WITH CHECK (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))));

ALTER POLICY "gan_pesos_historico_write_admin_gerencia" ON public.gan_pesos_historico
  USING (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))))
  WITH CHECK (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))));

-- ---- hato_* (14) ----
ALTER POLICY "hato_toros_write_admin_gerencia" ON public.hato_toros
  USING (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))))
  WITH CHECK (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))));

ALTER POLICY "hato_animales_write_admin_gerencia" ON public.hato_animales
  USING (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))))
  WITH CHECK (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))));

ALTER POLICY "hato_chequeos_write_admin_gerencia" ON public.hato_chequeos
  USING (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))))
  WITH CHECK (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))));

ALTER POLICY "hato_chequeo_vacas_write_admin_gerencia" ON public.hato_chequeo_vacas
  USING (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))))
  WITH CHECK (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))));

ALTER POLICY "hato_eventos_write_admin_gerencia" ON public.hato_eventos
  USING (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))))
  WITH CHECK (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))));

ALTER POLICY "hato_pesajes_leche_write_admin_gerencia" ON public.hato_pesajes_leche
  USING (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))))
  WITH CHECK (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))));

ALTER POLICY "hato_produccion_quincenal_write_admin_gerencia" ON public.hato_produccion_quincenal
  USING (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))))
  WITH CHECK (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))));

ALTER POLICY "hato_protocolos_write_admin_gerencia" ON public.hato_protocolos
  USING (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))))
  WITH CHECK (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))));

ALTER POLICY "hato_tratamientos_write_admin_gerencia" ON public.hato_tratamientos
  USING (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))))
  WITH CHECK (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))));

ALTER POLICY "hato_tratamiento_pasos_write_admin_gerencia" ON public.hato_tratamiento_pasos
  USING (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))))
  WITH CHECK (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))));

ALTER POLICY "hato_alertas_write_admin_gerencia" ON public.hato_alertas
  USING (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))))
  WITH CHECK (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))));

ALTER POLICY "hato_alertas_config_write_admin_gerencia" ON public.hato_alertas_config
  USING (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))))
  WITH CHECK (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))));

ALTER POLICY "hato_pajillas_write_admin_gerencia" ON public.hato_pajillas
  USING (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))))
  WITH CHECK (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))));

ALTER POLICY "hato_pajillas_uso_write_admin_gerencia" ON public.hato_pajillas_uso
  USING (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))))
  WITH CHECK (EXISTS ( SELECT 1 FROM usuarios u
                   WHERE ((u.id = (SELECT auth.uid()))
                     AND (u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))));


-- =============================================================================
-- VERIFICACION
-- =============================================================================
-- Falla ruidosamente si queda alguna llamada a auth.uid() / auth.role() /
-- auth.jwt() SIN envolver en el schema `public`.
--
-- El chequeo no depende de como Postgres deparsee el subselect (que se
-- reescribe como `( SELECT auth.uid() AS uid)`): cuenta las ocurrencias totales
-- de `auth.uid()` y las compara con las ocurrencias de `SELECT auth.uid()`.
-- Toda ocurrencia envuelta contiene la segunda cadena; toda ocurrencia suelta
-- no. Si los dos conteos coinciden, no queda ninguna suelta.
-- =============================================================================

DO $$
DECLARE
  v_sueltas integer;
  v_detalle text;
BEGIN
  WITH p AS (
    SELECT tablename,
           policyname,
           coalesce(qual, '') || ' ' || coalesce(with_check, '') AS pred
      FROM pg_policies
     WHERE schemaname = 'public'
  ),
  conteo AS (
    SELECT tablename, policyname,
           (length(pred) - length(replace(pred, 'auth.uid()',        ''))) / length('auth.uid()')
         + (length(pred) - length(replace(pred, 'auth.role()',       ''))) / length('auth.role()')
         + (length(pred) - length(replace(pred, 'auth.jwt()',        ''))) / length('auth.jwt()')
           AS total,
           (length(pred) - length(replace(pred, 'SELECT auth.uid()',  ''))) / length('SELECT auth.uid()')
         + (length(pred) - length(replace(pred, 'SELECT auth.role()', ''))) / length('SELECT auth.role()')
         + (length(pred) - length(replace(pred, 'SELECT auth.jwt()',  ''))) / length('SELECT auth.jwt()')
           AS envueltas
      FROM p
  )
  SELECT count(*), string_agg(tablename || '.' || policyname, ', ' ORDER BY tablename, policyname)
    INTO v_sueltas, v_detalle
    FROM conteo
   WHERE total > envueltas;

  IF v_sueltas > 0 THEN
    RAISE EXCEPTION
      '077: quedan % policies con auth.*() sin envolver en public: %',
      v_sueltas, v_detalle;
  END IF;

  RAISE NOTICE '077 OK: 0 policies con auth.*() sin envolver en el schema public.';
END $$;

-- Consulta manual equivalente, para correr en el SQL editor despues de aplicar
-- (debe devolver 0 filas):
--
--   SELECT tablename, policyname, cmd
--     FROM pg_policies
--    WHERE schemaname = 'public'
--      AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ 'auth\.(uid|role|jwt)\(\)'
--      AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) !~ 'SELECT auth\.(uid|role|jwt)\(\)';
--
-- Y despues volver a correr el linter: `auth_rls_initplan` debe pasar de 62 a 0.


-- =============================================================================
-- POLICIES QUE SE DEJAN INTACTAS A PROPOSITO
-- =============================================================================
-- (a) ~100 policies cuyo unico predicado es `es_usuario_gerencia()` o
--     `get_user_role()`: todas las `fin_*` (gastos, ingresos, categorias,
--     conceptos, medios de pago, negocios, regiones, compradores, parametros,
--     proveedores), `aplicaciones*`, `despachos*`, `despachos_trazabilidad`,
--     `compras`, `cosechas`, `clientes`, `focos*`, `lotes`, `sublotes`,
--     `monitoreos`, `movimientos_inventario`, `productos`,
--     `plagas_enfermedades_catalogo`, `preselecciones`, `verificaciones_*`,
--     `logs_auditoria`, `hato_config`, `usuarios`.
--     Razon: ambas funciones son VOLATILE (verificado en produccion). Postgres
--     no hoistea funciones VOLATILE a InitPlan, asi que `(SELECT
--     es_usuario_gerencia())` seguiria evaluandose por fila. El arreglo real
--     seria marcarlas STABLE, lo que cambia el contrato de la funcion y merece
--     su propio analisis. El linter no las reporta, asi que esto NO afecta el
--     conteo de 62 -> 0.
--
-- (b) 12 policies de `storage.objects`:
--       "Administrador puede leer/subir/actualizar/eliminar facturas" (039)
--       "Gerencia puede leer/subir/actualizar/eliminar facturas"
--       "Hato: leer/subir/actualizar/eliminar fotos de chequeo" (072)
--     Llaman `auth.uid()` suelto y se beneficiarian del mismo envoltorio, pero
--     el linter no las reporta y viven en un schema administrado por Supabase.
--     Se documentan aqui para que no se pierdan; si se quieren arreglar, va en
--     una migracion aparte con el mismo patron.
--
-- (c) 485 advertencias `multiple_permissive_policies`. Fuera de alcance por
--     decision explicita: consolidarlas cambia el modelo de acceso y necesita
--     revision de seguridad. Ver el encabezado, nota 1.
--
-- (d) `usuarios."Usuario ve su perfil"` se envolvio solo a medias: `auth.uid()`
--     si, `get_user_role()` no, por el motivo (a). La advertencia cierra igual.
-- =============================================================================


-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Cada `ALTER POLICY` de arriba se revierte con el mismo ALTER quitando los
-- `(SELECT ...)`. El predicado original de cada policy esta transcrito verbatim
-- en el comentario que la precede, asi que el rollback se construye desde este
-- mismo archivo sin necesidad de un dump.
--
-- Dicho eso: revertir no deberia hacer falta nunca. El cambio no altera que
-- filas ve cada rol, solo cuantas veces se evalua el predicado. Si tras aplicar
-- aparece un problema de permisos, la causa NO esta aqui -- buscarla en las
-- policies permisivas multiples o en `usuarios.rol` del usuario afectado.
-- =============================================================================
