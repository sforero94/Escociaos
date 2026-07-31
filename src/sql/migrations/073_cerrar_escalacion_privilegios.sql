-- =============================================================================
-- 073_cerrar_escalacion_privilegios.sql
--
-- Cierra dos vias de escalacion de privilegios encontradas y verificadas en la
-- corrida de mantenimiento 2026-07-31-dryrun-lunes. Aprobadas por Santiago.
--
-- Ninguna de las dos toca datos: son cambios de privilegios y de politica.
-- Filas afectadas: 0.
--
-- Reporte: escociaos-po/reports/2026-07-31-dryrun-lunes.md (hallazgos #3 y #4)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PARTE 1 -- `usuarios`: cualquier usuario autenticado podia ascenderse a Gerencia
-- -----------------------------------------------------------------------------
-- La politica "Usuario actualiza su login" era USING (id = auth.uid()) /
-- WITH CHECK (id = auth.uid()): restringe QUE FILA, nunca QUE COLUMNAS. Con
-- UPDATE otorgado a nivel de tabla, un PATCH /rest/v1/usuarios?id=eq.<uid> con
-- body {"rol":"Gerencia","activo":true} satisfacia ambas clausulas.
--
-- Eso derrotaba TODA la autorizacion de la app: `es_usuario_gerencia()` y
-- `get_user_role()` leen exactamente esa columna, y de ellas cuelgan las 13
-- tablas fin_*, `hato_config` y la propia `usuarios`.
--
-- Verificado antes de escribir esto: no hay trigger ni regla en `usuarios`
-- (pg_trigger -> vacio), no hay politica RESTRICTIVE, y los 8 call sites de
-- `from('usuarios')` en el navegador son TODOS `select`. Ningun codigo escribe
-- `last_login`, asi que la politica protegia una escritura que no existe.
--
-- `service_role` (que es quien hace las mutaciones reales desde el edge
-- function) conserva su propio grant y no se ve afectado.

REVOKE UPDATE ON public.usuarios FROM authenticated, anon;

DROP POLICY IF EXISTS "Usuario actualiza su login" ON public.usuarios;

-- Nota para el futuro: si algun dia se agrega "editar mi propio perfil" en el
-- navegador, NO restaurar el grant a nivel de tabla. Usar un grant por columna
-- (`GRANT UPDATE (nombre_completo) ON public.usuarios TO authenticated;`) junto
-- con una politica que vuelva a acotar la fila, o rutearlo por el edge function.


-- -----------------------------------------------------------------------------
-- PARTE 2 -- funciones de inventario SECURITY DEFINER abiertas a PUBLIC
-- -----------------------------------------------------------------------------
-- Tres funciones SECURITY DEFINER (owner `postgres`, que tiene rolbypassrls)
-- tenian EXECUTE otorgado a PUBLIC/anon/authenticated, sin ningun chequeo de
-- autorizacion en su cuerpo y sin `search_path` fijado.
--
-- La unica realmente explotable era `actualizar_cantidad_producto(uuid, numeric)`:
-- su cuerpo entero es
--     UPDATE productos SET cantidad_actual = cantidad_actual + p_diferencia ...
-- sin auditoria y SIN escribir fila en `movimientos_inventario` (verificado: los
-- unicos triggers en `productos` son los dos `set_updated_at`). Un usuario
-- autenticado de bajo privilegio (Monitor, Verificador) que puede leer los uuid
-- de `productos` podia mutar el stock de cualquiera saltandose las policies.
--
-- Las otras dos son superficie muerta e inerte, pero se cierran igual:
--   * `registrar_salida_inventario` recibe p_producto_id INTEGER y lo compara
--     contra `productos.id UUID` -- falla en su primer SELECT, antes de escribir.
--   * `registrar_compra` referencia la tabla inexistente `detalles_compra` e
--     inserta en columnas que `compras` no tiene -- aborta con rollback.
--
-- Las tres son codigo muerto: el unico rastro en el repo son los tipos
-- generados en `src/types/database.ts`. No hay ningun `.rpc()` que las llame y
-- ningun trigger que las use (la referencia a un trigger
-- `actualizar_stock_producto` en docs/supabase_tablas.md:1456 es documentacion
-- obsoleta: ese trigger no existe en produccion, y tampoco existe una version
-- de cero argumentos de la funcion).
--
-- Se REVOCA primero y se DROPEA despues, en la misma migracion: si el DROP
-- fallara por una dependencia no detectada, el REVOKE ya habria cerrado la
-- puerta.

REVOKE EXECUTE ON FUNCTION public.actualizar_cantidad_producto(uuid, numeric)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.registrar_salida_inventario(integer, numeric, text, integer, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.registrar_compra(date, text, text, numeric, jsonb, uuid)
  FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.actualizar_cantidad_producto(uuid, numeric);
DROP FUNCTION IF EXISTS public.registrar_salida_inventario(integer, numeric, text, integer, text, uuid);
DROP FUNCTION IF EXISTS public.registrar_compra(date, text, text, numeric, jsonb, uuid);


-- -----------------------------------------------------------------------------
-- PARTE 3 -- fijar search_path en las dos funciones de autorizacion
-- -----------------------------------------------------------------------------
-- `es_usuario_gerencia()` y `get_user_role()` son SECURITY DEFINER con
-- `proconfig = null`, a diferencia de las funciones mas nuevas del repo
-- (`fn_hato_commit_chequeo`, `fn_aplicar_movimiento_ganado`,
-- `fn_cleanup_compra_dependencies`), que ya fijan `search_path = public`.
--
-- Hoy no es explotable -- PostgREST no permite fijar `search_path` por peticion
-- -- pero estas dos son el UNICO predicado de autorizacion de toda la app, asi
-- que se alinean con el resto del repo.

ALTER FUNCTION public.es_usuario_gerencia() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_user_role() SET search_path = public, pg_temp;


-- =============================================================================
-- ROLLBACK (si hiciera falta revertir)
-- =============================================================================
-- Parte 1:
--   GRANT UPDATE ON public.usuarios TO authenticated, anon;
--   CREATE POLICY "Usuario actualiza su login" ON public.usuarios
--     FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());
--
-- Parte 2: las tres funciones eran codigo muerto y roto (dos de ellas ni
--   siquiera ejecutaban contra el esquema real). Restaurarlas exigiria
--   recuperar su cuerpo del historial de `supabase_migrations.schema_migrations`.
--   No se recomienda: reintroduciria la misma vulnerabilidad.
--
-- Parte 3:
--   ALTER FUNCTION public.es_usuario_gerencia() RESET search_path;
--   ALTER FUNCTION public.get_user_role() RESET search_path;
-- =============================================================================
