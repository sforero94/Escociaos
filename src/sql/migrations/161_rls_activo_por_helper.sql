-- =============================================================================
-- 161_rls_activo_por_helper.sql
--
-- Notion ESCO-119. Las 45 políticas RLS de `public` que leen `usuarios` EN
-- LÍNEA pasan a leer el rol por los helpers `get_user_role()` /
-- `es_usuario_gerencia()`, que desde la 137 filtran `usuarios.activo = true`.
--
-- NO APLICAR DESDE ESTE AGENTE. Este archivo se abre en PR para revisión
-- adversarial independiente y lo aplica Santiago.
--
-- Numerada 161: número libre verificado en vivo el 2026-09-21 sobre las CUATRO
-- fuentes que manda el runbook, no heredado de ningún documento --
-- `src/sql/migrations/` (máximo 158), el ledger
-- `supabase_migrations.schema_migrations` (máximo `20260921132809`,
-- `150_retirar_stock_15_15_15_prueba`), el esquema `respaldos` (sin rastro de
-- 159/160/161) y el barrido de TODAS las ramas de `origin` (lección de la 144:
-- tres renumeraciones forzadas en dos semanas, dos de ellas por números
-- ocupados en ramas abiertas que ninguna de las otras tres fuentes muestra).
-- 159 y 160 también estaban libres; 161 es el número asignado a esta ficha.
--
-- -----------------------------------------------------------------------------
-- QUÉ CIERRA
-- -----------------------------------------------------------------------------
-- La 137 hizo que `get_user_role()` y `es_usuario_gerencia()` filtraran
-- `usuarios.activo = true`, así que una cuenta desactivada pierde sus
-- privilegios en las ~125 políticas que llaman a un helper. **45 políticas no
-- llaman a ninguno de los dos.** Leen `usuarios` en línea y comprueban sólo el
-- rol:
--
--   EXISTS (SELECT 1 FROM usuarios u
--           WHERE u.id = (SELECT auth.uid())
--             AND u.rol = ANY (ARRAY['Administrador','Gerencia']))
--
-- La política SELECT de `usuarios` es
-- `(id = (SELECT auth.uid())) OR ((SELECT get_user_role()) = 'Gerencia')`, o sea
-- **toda cuenta lee su propia fila y ahí no hay filtro de `activo`**. Por eso el
-- `EXISTS` en línea sigue diciendo que sí después de desactivar a alguien.
--
-- -----------------------------------------------------------------------------
-- CALIBRACIÓN DEL RIESGO -- sin inflarlo
-- -----------------------------------------------------------------------------
-- El camino de desactivación de la propia aplicación
-- (`src/supabase/functions/server/usuarios.tsx:188-192`) **también banea la
-- cuenta de auth**, así que por ahí la exposición se acaba cuando vence el
-- access token, alrededor de una hora. Eso NO es el caso que justifica esta
-- migración.
--
-- El caso que la justifica es la desactivación **fuera de banda** -- editor SQL,
-- editor de tablas, el conector de escritura -- donde `activo` pasa a `false`
-- sin baneo ninguno y las 45 quedan abiertas **indefinidamente**. Es un camino
-- al que un mantenedor llega solo, sin hacer nada raro.
--
-- -----------------------------------------------------------------------------
-- ALCANCE MEDIDO EN VIVO (2026-09-21)
-- -----------------------------------------------------------------------------
-- Consulta canónica -- guardarla al lado de las de DELETE (110/120) e
-- INSERT/UPDATE (133). Nótese que NO filtra por `cmd` ni por rol: esta clase no
-- se define por el verbo sino por leer `usuarios` sin pasar por el helper.
--
--   SELECT c.relname, p.polname
--   FROM pg_policy p
--   JOIN pg_class c ON c.oid = p.polrelid
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public'
--     AND (COALESCE(pg_get_expr(p.polqual,p.polrelid),'') || ' ' ||
--          COALESCE(pg_get_expr(p.polwithcheck,p.polrelid),'')) ~ 'FROM usuarios'
--     AND (COALESCE(pg_get_expr(p.polqual,p.polrelid),'') || ' ' ||
--          COALESCE(pg_get_expr(p.polwithcheck,p.polrelid),'')) !~ 'activo';
--
-- Devuelve **45 políticas sobre 31 tablas**. El barrido ancho (sin el `!~
-- 'activo'`) devuelve 62: las otras **17 ya traen el filtro escrito a mano** y
-- por eso quedan fuera -- `empleados` (4), `registros_trabajo` (3), `tareas`
-- (6), `tipos_tareas` (4). Ésas están bien hoy; se dejan como están porque
-- reescribirlas no cambia ningún comportamiento y sí toca políticas que nadie
-- pidió tocar.
--
-- Reparto de las 45:
--     8  fin_transacciones_ganado_*        (4 Administrador solo, 4 Gerencia solo)
--     4  fin_presupuestos_*                (Gerencia solo, TO PUBLIC)
--     2  fin_proveedores_admin_*           (Administrador SOLO -- no lleva Gerencia)
--     7  gan_*_write_admin_gerencia
--    14  hato_*_write_admin_gerencia
--     3  chat_conversations_*              (Gerencia solo, TO PUBLIC, predicado compuesto)
--     2  revisiones_periodicas_*
--     2  acciones_*
--     1  alertas_catalogo_write_gerencia
--     1  Gerencia puede gestionar telegram_usuarios
--     1  Gerencia puede gestionar telegram_alertas_suscripciones
--
-- **Los 45 predicados se leyeron uno por uno con `pg_get_expr`, no se asumieron
-- uniformes.** Tres formas que no encajan en el molde y que un reescritor
-- automático habría estropeado:
--
--   a) `fin_proveedores_admin_select` / `_insert` son **Administrador SOLO**
--      (migración 037). Pasarlas a Administrador+Gerencia sería ampliarlas.
--      Quedan `get_user_role() = 'Administrador'`.
--   b) `fin_transacciones_ganado` tiene **ocho** políticas, una por verbo y por
--      rol, cada una con UN rol. No se fusionan: fusionarlas cambia el modelo de
--      acceso y eso es otra revisión.
--   c) `chat_conversations_*` llevan predicado **compuesto**
--      `auth.uid() = user_id AND EXISTS(...)`. La cláusula de propiedad se
--      conserva intacta; sólo se reemplaza el `EXISTS`.
--
-- Y dos formas que importan para el DDL, porque `ALTER POLICY` no las adivina:
--   * `fin_presupuestos_update`, `fin_transacciones_ganado_update_admin` y
--     `_update_gerencia` tienen `with_check` **NULL**. Se altera SÓLO el
--     `USING`. Agregarles un `WITH CHECK` sería una restricción nueva.
--   * `acciones_recomendadas_update_operativo` y
--     `revisiones_periodicas_reloj_operativo` sí traen los dos, y los conservan.
--
-- -----------------------------------------------------------------------------
-- POR QUÉ ENVUELTO EN `(SELECT ...)` -- precedente 093
-- -----------------------------------------------------------------------------
-- Un `SELECT` escalar NO correlacionado se convierte en InitPlan por una
-- consecuencia **estructural** de no estar correlacionado; el planificador no
-- consulta la volatilidad para esa decisión. Medido en producción por la 093:
-- `fin_gastos` 126,3 ms / 9.367 buffers → 3,2 ms / 517. Llamar al helper pelado
-- lo re-evalúa una vez POR FILA y además envenena la estimación de
-- cardinalidad. El beneficio de rendimiento es lateral; heredar el filtro de
-- `activo` es el objetivo.
--
-- -----------------------------------------------------------------------------
-- `ALTER POLICY`, NUNCA `DROP` + `CREATE` -- precedente 077
-- -----------------------------------------------------------------------------
-- `ALTER POLICY` es atómico, conserva `TO <rol>` y `AS PERMISSIVE`, y no abre
-- una ventana en la que la tabla se queda sin política. Un `DROP` + `CREATE`
-- sí la abre. **No cambia el conjunto de roles**, así que las siete políticas
-- `TO PUBLIC` (`polroles` NULL: las 4 de `fin_presupuestos` y las 3 de
-- `chat_conversations`) siguen siendo `TO PUBLIC` después -- verificado contra
-- `pg_policy.polroles`, no supuesto, y la post-condición lo comprueba fila a
-- fila contra la línea base.
--
-- -----------------------------------------------------------------------------
-- NOMBRES TRUNCADOS -- comprobado, acá NO hay ninguno
-- -----------------------------------------------------------------------------
-- La 133 documenta que Postgres corta los identificadores en 63 caracteres y
-- que escribir el nombre completo hace abortar el `ALTER POLICY` con «policy
-- does not exist». Se midió `length(polname)` de las 45: el máximo es **55**
-- (`Gerencia puede gestionar telegram_alertas_suscripciones`) y le sigue 46
-- (`hato_produccion_quincenal_write_admin_gerencia`). Ninguno llega al corte.
-- Aun así los 45 nombres están copiados byte a byte del catálogo, no
-- re-derivados del patrón.
--
-- -----------------------------------------------------------------------------
-- LAS 4 POLÍTICAS DEL MOTOR RETIRADO -- SE INCLUYEN, Y ES DELIBERADO
-- -----------------------------------------------------------------------------
-- `acciones_recomendadas_update_operativo`, `acciones_silencios_write_operativo`,
-- `revisiones_periodicas_reloj_operativo` y `revisiones_periodicas_write_gerencia`
-- pertenecen al motor de «acciones recomendadas», retirado por la 156. Sus
-- tablas se conservan sin tocar una fila, como evidencia histórica.
--
-- Endurecerlas no protege ninguna pantalla viva. Se incluyen igual por una
-- razón que no es de seguridad sino de detectabilidad: **dejarlas fuera deja el
-- barrido canónico devolviendo 4 filas para siempre**, y entonces la
-- post-condición no puede exigir cero y cada barrido futuro tiene que volver a
-- litigar si esas cuatro son «la excepción conocida» o una regresión nueva. Esa
-- es exactamente la forma de deuda que crearon las always-true.
-- Además las tablas siguen expuestas por PostgREST con su RLS viva: un INSERT
-- en `acciones_silencios` sigue siendo un INSERT. Costo de incluirlas: 4
-- `ALTER POLICY`, cero filas. Costo de excluirlas: una línea base sucia
-- permanente.
--
-- -----------------------------------------------------------------------------
-- NADIE PIERDE CAPACIDAD HOY, Y NADIE GANA
-- -----------------------------------------------------------------------------
-- Padrón 2026-09-21: **10 cuentas, 4 Administrador + 6 Gerencia, CERO
-- inactivas.** Como no hay ninguna cuenta con `activo = false`, el filtro nuevo
-- no excluye a nadie. Filas afectadas: **cero** -- esto no toca datos.
--
-- Que nadie GANE acceso es la mitad que hay que argumentar, porque los dos
-- helpers son `SECURITY DEFINER` y por tanto **saltan la RLS de `usuarios`**,
-- cosa que el `EXISTS` en línea no hace. El razonamiento: la política SELECT de
-- `usuarios` es `(id = (SELECT auth.uid())) OR ((SELECT get_user_role()) =
-- 'Gerencia')`, así que **toda cuenta autenticada ya ve su propia fila**. El
-- `EXISTS` en línea nunca estuvo limitado por esa RLS, porque sólo mira la fila
-- propia. El helper mira esa misma fila y le suma `activo = true`. El conjunto
-- nuevo es por construcción **igual o más chico** que el viejo, nunca más
-- grande. Si la política de `usuarios` hubiera impedido leer la fila propia, el
-- cambio sí podría abrir algo -- por eso se comprobó y se deja escrito.
--
-- Comportamiento nuevo, idéntico al de la 137: cuenta con `activo = false` → el
-- helper no encuentra fila → `get_user_role()` devuelve NULL y
-- `es_usuario_gerencia()` devuelve `false`. `NULL = ANY(ARRAY[...])` es NULL,
-- que la RLS trata como falso. Falla cerrado.
--
-- -----------------------------------------------------------------------------
-- FUERA DE ALCANCE A PROPÓSITO: LAS 23 DE `storage.objects`
-- -----------------------------------------------------------------------------
-- El mismo barrido sobre `storage.objects` devuelve **23 políticas** con la
-- misma falla (buckets `facturas`, `reportes-semanales`, `chequeos-fotos`,
-- `hato-pesajes-fotos`, `hato-liquidaciones-fotos`). **No pueden ir en este
-- archivo.**
--
-- `ALTER POLICY` exige ser DUEÑO de la tabla y ningún `GRANT` lo confiere.
-- Verificado en vivo el 2026-09-21: `storage.objects` pertenece a
-- `supabase_storage_admin`; `apply_migration` corre como `postgres`, que no
-- llega a ese rol por ninguna vía (`pg_has_role` falso en USAGE y en MEMBER,
-- `rolsuper` falso) -- es lo que documenta la **109**, que por eso se aplicó
-- desde el panel de Storage y **no dejó fila en el ledger**.
--
-- Un archivo que mezclara las dos cosas **abortaría a mitad de camino** y
-- dejaría la impresión de que las 45 fallaron. Las 23 sentencias están en
-- `docs/rls_activo_storage_objects.sql`, marcadas como no aplicables por este
-- carril, con sus consultas de comprobación al pie.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. LÍNEA BASE -- se toma en vivo, nunca se escribe un literal que una
--    escritura concurrente pueda mover (lección de la 103 y de la 120: un
--    literal absoluto tomado el día anterior aborta una migración sana).
--    Los conteos de POLÍTICAS sí son estables -- ninguna escritura de datos los
--    mueve -- así que el 45 sí va literal: es la afirmación de que el esquema
--    es el que se revisó. El total de políticas de las 31 tablas va relativo.
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS pg_temp.tmp_161_base;
DROP TABLE IF EXISTS pg_temp.tmp_161_total;

CREATE TEMP TABLE tmp_161_base AS
SELECT c.relname                                             AS tabla,
       p.polname                                             AS politica,
       p.polcmd                                              AS cmd,
       p.polpermissive                                       AS permisiva,
       COALESCE(p.polroles, '{}'::oid[])                     AS roles,
       (p.polqual IS NOT NULL)                               AS tiene_using,
       (p.polwithcheck IS NOT NULL)                          AS tiene_check
FROM pg_policy p
JOIN pg_class c     ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND (COALESCE(pg_get_expr(p.polqual, p.polrelid), '') || ' ' ||
       COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '')) ~ 'FROM usuarios'
  AND (COALESCE(pg_get_expr(p.polqual, p.polrelid), '') || ' ' ||
       COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '')) !~ 'activo';

CREATE TEMP TABLE tmp_161_total AS
SELECT count(*)::integer AS n
FROM pg_policy p
JOIN pg_class c     ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (SELECT tabla FROM tmp_161_base);


-- ---------------------------------------------------------------------------
-- 1. PRE
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_politicas integer;
  v_tablas    integer;
  v_total     integer;
  v_def       text;
BEGIN
  SELECT count(*), count(DISTINCT tabla) INTO v_politicas, v_tablas FROM tmp_161_base;

  IF v_politicas <> 45 THEN
    RAISE EXCEPTION
      'PRE 1.1: se esperaban 45 politicas que leen usuarios en linea sin filtro de activo, hay %. El esquema no es el que se reviso -- rehace el barrido antes de aplicar.',
      v_politicas;
  END IF;

  IF v_tablas <> 31 THEN
    RAISE EXCEPTION 'PRE 1.2: se esperaban 31 tablas en alcance, hay %.', v_tablas;
  END IF;

  -- Los dos helpers tienen que existir, ser SECURITY DEFINER y filtrar activo.
  -- Si alguno no filtrara, esta migracion seria un no-op disfrazado de arreglo.
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_user_role' AND p.pronargs = 0;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'PRE 1.3: public.get_user_role() no existe.';
  END IF;
  IF v_def !~ 'activo' THEN
    RAISE EXCEPTION 'PRE 1.4: public.get_user_role() no filtra activo. Falta aplicar la 137; sin ella esta migracion no arregla nada.';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'es_usuario_gerencia' AND p.pronargs = 0;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'PRE 1.5: public.es_usuario_gerencia() no existe.';
  END IF;
  IF v_def !~ 'activo' THEN
    RAISE EXCEPTION 'PRE 1.6: public.es_usuario_gerencia() no filtra activo.';
  END IF;

  SELECT count(*)::integer INTO v_total
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('get_user_role','es_usuario_gerencia')
    AND p.pronargs = 0
    AND p.prosecdef;

  IF v_total <> 2 THEN
    RAISE EXCEPTION 'PRE 1.7: se esperaban los dos helpers como SECURITY DEFINER, hay %. Sin DEFINER no pueden leer usuarios por debajo de la RLS de esa tabla.', v_total;
  END IF;

  -- `authenticated` tiene que conservar EXECUTE sobre los dos. Es la leccion
  -- (a) de la 082: una politica RLS necesita EXECUTE sobre la funcion que
  -- llama, desde el rol que consulta. Sin esto las 45 quedarian con
  -- `permission denied for function` en vez de con un predicado mas estricto.
  IF NOT has_function_privilege('authenticated', 'public.get_user_role()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.es_usuario_gerencia()', 'EXECUTE') THEN
    RAISE EXCEPTION 'PRE 1.8: authenticated perdio EXECUTE sobre alguno de los dos helpers. Aplicar esto ahora romperia las 45 politicas en vez de endurecerlas.';
  END IF;

  IF NOT has_function_privilege('anon', 'public.get_user_role()', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.es_usuario_gerencia()', 'EXECUTE') THEN
    RAISE EXCEPTION 'PRE 1.9: anon perdio EXECUTE sobre alguno de los dos helpers. Siete de las 45 son TO PUBLIC, que incluye a anon.';
  END IF;

  SELECT n INTO v_total FROM tmp_161_total;
  RAISE NOTICE 'PRE ok: 45 politicas en alcance sobre 31 tablas; % politicas en total en esas tablas (linea base relativa).', v_total;
END $$;


-- ---------------------------------------------------------------------------
-- 2. LAS 45 -- `ALTER POLICY`, nunca DROP + CREATE (077). El predicado va
--    envuelto en `(SELECT ...)` (093). El conjunto de roles NO se toca: eso
--    `ALTER POLICY` no lo cambia, y la post-condicion lo verifica.
-- ---------------------------------------------------------------------------

-- 2.1  Ganado -- Administrador + Gerencia (7).
ALTER POLICY "gan_fincas_write_admin_gerencia" ON public.gan_fincas
  USING ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))
  WITH CHECK ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]));
ALTER POLICY "gan_inventario_write_admin_gerencia" ON public.gan_inventario
  USING ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))
  WITH CHECK ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]));
ALTER POLICY "gan_lotes_write_admin_gerencia" ON public.gan_lotes
  USING ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))
  WITH CHECK ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]));
ALTER POLICY "gan_movimientos_write_admin_gerencia" ON public.gan_movimientos
  USING ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))
  WITH CHECK ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]));
ALTER POLICY "gan_pesos_historico_write_admin_gerencia" ON public.gan_pesos_historico
  USING ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))
  WITH CHECK ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]));
ALTER POLICY "gan_potreros_write_admin_gerencia" ON public.gan_potreros
  USING ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))
  WITH CHECK ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]));
ALTER POLICY "gan_ubicaciones_write_admin_gerencia" ON public.gan_ubicaciones
  USING ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))
  WITH CHECK ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]));

-- 2.2  Hato Lechero -- Administrador + Gerencia (14).
ALTER POLICY "hato_alertas_write_admin_gerencia" ON public.hato_alertas
  USING ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))
  WITH CHECK ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]));
ALTER POLICY "hato_alertas_config_write_admin_gerencia" ON public.hato_alertas_config
  USING ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))
  WITH CHECK ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]));
ALTER POLICY "hato_animales_write_admin_gerencia" ON public.hato_animales
  USING ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))
  WITH CHECK ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]));
ALTER POLICY "hato_chequeo_vacas_write_admin_gerencia" ON public.hato_chequeo_vacas
  USING ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))
  WITH CHECK ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]));
ALTER POLICY "hato_chequeos_write_admin_gerencia" ON public.hato_chequeos
  USING ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))
  WITH CHECK ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]));
ALTER POLICY "hato_eventos_write_admin_gerencia" ON public.hato_eventos
  USING ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))
  WITH CHECK ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]));
ALTER POLICY "hato_pajillas_write_admin_gerencia" ON public.hato_pajillas
  USING ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))
  WITH CHECK ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]));
ALTER POLICY "hato_pajillas_uso_write_admin_gerencia" ON public.hato_pajillas_uso
  USING ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))
  WITH CHECK ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]));
ALTER POLICY "hato_pesajes_leche_write_admin_gerencia" ON public.hato_pesajes_leche
  USING ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))
  WITH CHECK ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]));
ALTER POLICY "hato_produccion_quincenal_write_admin_gerencia" ON public.hato_produccion_quincenal
  USING ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))
  WITH CHECK ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]));
ALTER POLICY "hato_protocolos_write_admin_gerencia" ON public.hato_protocolos
  USING ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))
  WITH CHECK ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]));
ALTER POLICY "hato_toros_write_admin_gerencia" ON public.hato_toros
  USING ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))
  WITH CHECK ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]));
ALTER POLICY "hato_tratamiento_pasos_write_admin_gerencia" ON public.hato_tratamiento_pasos
  USING ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))
  WITH CHECK ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]));
ALTER POLICY "hato_tratamientos_write_admin_gerencia" ON public.hato_tratamientos
  USING ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))
  WITH CHECK ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]));

-- 2.3  Motor de acciones recomendadas, retirado por la 156 (4).
--      Se incluyen para que el barrido canonico pueda exigir cero. Ver la
--      seccion del encabezado: las tablas se conservan como evidencia.
ALTER POLICY "acciones_recomendadas_update_operativo" ON public.acciones_recomendadas
  USING ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))
  WITH CHECK ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]));
ALTER POLICY "acciones_silencios_write_operativo" ON public.acciones_silencios
  USING ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))
  WITH CHECK ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]));
ALTER POLICY "revisiones_periodicas_reloj_operativo" ON public.revisiones_periodicas
  USING ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))
  WITH CHECK ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]));
ALTER POLICY "revisiones_periodicas_write_gerencia" ON public.revisiones_periodicas
  USING ((SELECT public.es_usuario_gerencia()))
  WITH CHECK ((SELECT public.es_usuario_gerencia()));

-- 2.4  Catalogo de alertas y configuracion de Telegram -- Gerencia sola (3).
--      `telegram_*` copian la politica real de `telegram_usuarios` (096):
--      una sola ALL, Gerencia incluso para leer, porque se editan desde esa
--      misma pantalla.
ALTER POLICY "alertas_catalogo_write_gerencia" ON public.alertas_catalogo
  USING ((SELECT public.es_usuario_gerencia()))
  WITH CHECK ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "Gerencia puede gestionar telegram_usuarios" ON public.telegram_usuarios
  USING ((SELECT public.es_usuario_gerencia()))
  WITH CHECK ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "Gerencia puede gestionar telegram_alertas_suscripciones" ON public.telegram_alertas_suscripciones
  USING ((SELECT public.es_usuario_gerencia()))
  WITH CHECK ((SELECT public.es_usuario_gerencia()));

-- 2.5  `fin_presupuestos` -- Gerencia sola, TO PUBLIC (4).
--      `_update` tiene `with_check` NULL: se altera SOLO el USING.
ALTER POLICY "fin_presupuestos_select" ON public.fin_presupuestos
  USING ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_presupuestos_insert" ON public.fin_presupuestos
  WITH CHECK ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_presupuestos_update" ON public.fin_presupuestos
  USING ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_presupuestos_delete" ON public.fin_presupuestos
  USING ((SELECT public.es_usuario_gerencia()));

-- 2.6  `fin_transacciones_ganado` -- ocho politicas, una por verbo y por
--      rol, cada una con UN rol. No se fusionan (eso cambiaria el modelo de
--      acceso). Las dos de UPDATE tienen `with_check` NULL.
ALTER POLICY "fin_transacciones_ganado_select_gerencia" ON public.fin_transacciones_ganado
  USING ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_transacciones_ganado_insert_gerencia" ON public.fin_transacciones_ganado
  WITH CHECK ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_transacciones_ganado_update_gerencia" ON public.fin_transacciones_ganado
  USING ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_transacciones_ganado_delete_gerencia" ON public.fin_transacciones_ganado
  USING ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_transacciones_ganado_select_admin" ON public.fin_transacciones_ganado
  USING ((SELECT public.get_user_role()) = 'Administrador'::rol_usuario);
ALTER POLICY "fin_transacciones_ganado_insert_admin" ON public.fin_transacciones_ganado
  WITH CHECK ((SELECT public.get_user_role()) = 'Administrador'::rol_usuario);
ALTER POLICY "fin_transacciones_ganado_update_admin" ON public.fin_transacciones_ganado
  USING ((SELECT public.get_user_role()) = 'Administrador'::rol_usuario);
ALTER POLICY "fin_transacciones_ganado_delete_admin" ON public.fin_transacciones_ganado
  USING ((SELECT public.get_user_role()) = 'Administrador'::rol_usuario);

-- 2.7  `fin_proveedores` -- Administrador SOLO, sin Gerencia (037) (2).
--      Agregarle Gerencia aqui seria ampliar la politica, no endurecerla.
ALTER POLICY "fin_proveedores_admin_select" ON public.fin_proveedores
  USING ((SELECT public.get_user_role()) = 'Administrador'::rol_usuario);
ALTER POLICY "fin_proveedores_admin_insert" ON public.fin_proveedores
  WITH CHECK ((SELECT public.get_user_role()) = 'Administrador'::rol_usuario);

-- 2.8  `chat_conversations` -- Gerencia sola, TO PUBLIC, predicado
--      compuesto (3). La clausula de propiedad `auth.uid() = user_id` se
--      conserva intacta: sin ella cualquier Gerencia leeria las
--      conversaciones de las demas.
ALTER POLICY "chat_conversations_select" ON public.chat_conversations
  USING ((SELECT auth.uid()) = user_id AND (SELECT public.es_usuario_gerencia()));
ALTER POLICY "chat_conversations_insert" ON public.chat_conversations
  WITH CHECK ((SELECT auth.uid()) = user_id AND (SELECT public.es_usuario_gerencia()));
ALTER POLICY "chat_conversations_delete" ON public.chat_conversations
  USING ((SELECT auth.uid()) = user_id AND (SELECT public.es_usuario_gerencia()));


-- ---------------------------------------------------------------------------
-- 3. POST
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_quedan     integer;
  v_total_post integer;
  v_total_pre  integer;
  v_derivadas  integer;
  v_por_helper integer;
  r            record;
BEGIN
  -- 3.1 El barrido canonico tiene que devolver CERO en `public`.
  SELECT count(*) INTO v_quedan
  FROM pg_policy p
  JOIN pg_class c     ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND (COALESCE(pg_get_expr(p.polqual, p.polrelid), '') || ' ' ||
         COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '')) ~ 'FROM usuarios'
    AND (COALESCE(pg_get_expr(p.polqual, p.polrelid), '') || ' ' ||
         COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '')) !~ 'activo';

  IF v_quedan <> 0 THEN
    RAISE EXCEPTION 'POST 3.1: quedan % politicas leyendo usuarios en linea sin filtro de activo. Se esperaba 0.', v_quedan;
  END IF;

  -- 3.2 El total de politicas de esas 31 tablas no se movio: `ALTER POLICY` no
  --     crea ni borra ninguna. Si esto cambia, alguien uso DROP+CREATE.
  SELECT n INTO v_total_pre FROM tmp_161_total;
  SELECT count(*) INTO v_total_post
  FROM pg_policy p
  JOIN pg_class c     ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN (SELECT tabla FROM tmp_161_base);

  IF v_total_post <> v_total_pre THEN
    RAISE EXCEPTION 'POST 3.2: el total de politicas de las 31 tablas paso de % a %. ALTER POLICY no crea ni borra: revisar.',
      v_total_pre, v_total_post;
  END IF;

  -- 3.3 Las 45 siguen existiendo con EL MISMO nombre, verbo, permisividad,
  --     conjunto de roles y la misma forma USING/WITH CHECK. Esto es lo que
  --     prueba que nadie perdio ni gano una capacidad por la forma del DDL:
  --     los siete `TO PUBLIC` siguen siendo `TO PUBLIC`, y a las tres UPDATE
  --     con `with_check` NULL no se les agrego uno.
  FOR r IN SELECT * FROM tmp_161_base LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policy p
      JOIN pg_class c     ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = r.tabla
        AND p.polname = r.politica
        AND p.polcmd  = r.cmd
        AND p.polpermissive = r.permisiva
        AND COALESCE(p.polroles, '{}'::oid[]) = r.roles
        AND (p.polqual IS NOT NULL)      = r.tiene_using
        AND (p.polwithcheck IS NOT NULL) = r.tiene_check
    ) THEN
      RAISE EXCEPTION 'POST 3.3: la politica %.% cambio de verbo, permisividad, roles o forma USING/WITH CHECK. Tenia que cambiar SOLO el predicado.',
        r.tabla, r.politica;
    END IF;
  END LOOP;

  -- 3.4 Las 45 llaman ahora a un helper, y lo llaman ENVUELTO (093). Un helper
  --     pelado se re-evalua una vez por fila.
  SELECT count(*) INTO v_por_helper
  FROM tmp_161_base b
  JOIN pg_class c     ON c.relname = b.tabla
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  JOIN pg_policy p    ON p.polrelid = c.oid AND p.polname = b.politica
  WHERE (COALESCE(pg_get_expr(p.polqual, p.polrelid), '') || ' ' ||
         COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), ''))
        ~ '\( SELECT (get_user_role|es_usuario_gerencia)';

  IF v_por_helper <> 45 THEN
    RAISE EXCEPTION 'POST 3.4: solo % de las 45 politicas llaman a un helper envuelto en (SELECT ...). Se esperaban 45.', v_por_helper;
  END IF;

  -- 3.5 Las 17 politicas que YA traian el filtro escrito a mano siguen intactas
  --     (empleados 4, registros_trabajo 3, tareas 6, tipos_tareas 4). Estaban
  --     fuera de alcance y tienen que seguir estandolo.
  SELECT count(*) INTO v_derivadas
  FROM pg_policy p
  JOIN pg_class c     ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND (COALESCE(pg_get_expr(p.polqual, p.polrelid), '') || ' ' ||
         COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '')) ~ 'FROM usuarios';

  IF v_derivadas <> 17 THEN
    RAISE EXCEPTION 'POST 3.5: se esperaban 17 politicas que siguen leyendo usuarios en linea CON filtro de activo, hay %.', v_derivadas;
  END IF;

  RAISE NOTICE 'POST ok: 45 politicas pasadas a helper, 0 restantes, % politicas totales sin cambio, 17 fuera de alcance intactas.', v_total_post;
END $$;

-- Las temporales se crean SIN `ON COMMIT DROP` a proposito: asi el archivo se
-- comporta igual lo envuelva `apply_migration` en su transaccion o lo pegue
-- alguien en el editor SQL. Se sueltan aca.
DROP TABLE IF EXISTS pg_temp.tmp_161_base;
DROP TABLE IF EXISTS pg_temp.tmp_161_total;


-- ---------------------------------------------------------------------------
-- ROLLBACK (ejecutable -- devuelve las 45 politicas exactamente a como estaban,
-- predicado en linea incluido). Reproduce el alias original de cada una: las de
-- `gan_*`, `hato_*`, `fin_presupuestos`, `fin_transacciones_ganado`,
-- `revisiones_periodicas` y `acciones_*` usan el alias `u`; las de
-- `alertas_catalogo`, `chat_conversations`, `fin_proveedores` y `telegram_*`
-- nombran la tabla entera. Las tres UPDATE con `with_check` NULL se restauran
-- alterando SOLO el USING, para que la forma tampoco derive al volver.
--
-- Deshacer esto reabre la ventana: una cuenta desactivada fuera de banda vuelve
-- a conservar sus privilegios en estas 45 politicas, sin limite de tiempo.
--
--   ALTER POLICY "gan_fincas_write_admin_gerencia" ON public.gan_fincas
--     USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))
--     WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])));
--   ALTER POLICY "gan_inventario_write_admin_gerencia" ON public.gan_inventario
--     USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))
--     WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])));
--   ALTER POLICY "gan_lotes_write_admin_gerencia" ON public.gan_lotes
--     USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))
--     WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])));
--   ALTER POLICY "gan_movimientos_write_admin_gerencia" ON public.gan_movimientos
--     USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))
--     WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])));
--   ALTER POLICY "gan_pesos_historico_write_admin_gerencia" ON public.gan_pesos_historico
--     USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))
--     WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])));
--   ALTER POLICY "gan_potreros_write_admin_gerencia" ON public.gan_potreros
--     USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))
--     WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])));
--   ALTER POLICY "gan_ubicaciones_write_admin_gerencia" ON public.gan_ubicaciones
--     USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))
--     WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])));
--   ALTER POLICY "hato_alertas_write_admin_gerencia" ON public.hato_alertas
--     USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))
--     WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])));
--   ALTER POLICY "hato_alertas_config_write_admin_gerencia" ON public.hato_alertas_config
--     USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))
--     WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])));
--   ALTER POLICY "hato_animales_write_admin_gerencia" ON public.hato_animales
--     USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))
--     WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])));
--   ALTER POLICY "hato_chequeo_vacas_write_admin_gerencia" ON public.hato_chequeo_vacas
--     USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))
--     WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])));
--   ALTER POLICY "hato_chequeos_write_admin_gerencia" ON public.hato_chequeos
--     USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))
--     WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])));
--   ALTER POLICY "hato_eventos_write_admin_gerencia" ON public.hato_eventos
--     USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))
--     WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])));
--   ALTER POLICY "hato_pajillas_write_admin_gerencia" ON public.hato_pajillas
--     USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))
--     WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])));
--   ALTER POLICY "hato_pajillas_uso_write_admin_gerencia" ON public.hato_pajillas_uso
--     USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))
--     WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])));
--   ALTER POLICY "hato_pesajes_leche_write_admin_gerencia" ON public.hato_pesajes_leche
--     USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))
--     WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])));
--   ALTER POLICY "hato_produccion_quincenal_write_admin_gerencia" ON public.hato_produccion_quincenal
--     USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))
--     WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])));
--   ALTER POLICY "hato_protocolos_write_admin_gerencia" ON public.hato_protocolos
--     USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))
--     WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])));
--   ALTER POLICY "hato_toros_write_admin_gerencia" ON public.hato_toros
--     USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))
--     WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])));
--   ALTER POLICY "hato_tratamiento_pasos_write_admin_gerencia" ON public.hato_tratamiento_pasos
--     USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))
--     WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])));
--   ALTER POLICY "hato_tratamientos_write_admin_gerencia" ON public.hato_tratamientos
--     USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))
--     WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])));
--   ALTER POLICY "acciones_recomendadas_update_operativo" ON public.acciones_recomendadas
--     USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))
--     WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])));
--   ALTER POLICY "acciones_silencios_write_operativo" ON public.acciones_silencios
--     USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))
--     WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])));
--   ALTER POLICY "revisiones_periodicas_reloj_operativo" ON public.revisiones_periodicas
--     USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])))
--     WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])));
--   ALTER POLICY "revisiones_periodicas_write_gerencia" ON public.revisiones_periodicas
--     USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = 'Gerencia'::rol_usuario))
--     WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = 'Gerencia'::rol_usuario));
--   ALTER POLICY "alertas_catalogo_write_gerencia" ON public.alertas_catalogo
--     USING (EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = (SELECT auth.uid()) AND usuarios.rol = 'Gerencia'::rol_usuario))
--     WITH CHECK (EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = (SELECT auth.uid()) AND usuarios.rol = 'Gerencia'::rol_usuario));
--   ALTER POLICY "Gerencia puede gestionar telegram_usuarios" ON public.telegram_usuarios
--     USING (EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = (SELECT auth.uid()) AND usuarios.rol = 'Gerencia'::rol_usuario))
--     WITH CHECK (EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = (SELECT auth.uid()) AND usuarios.rol = 'Gerencia'::rol_usuario));
--   ALTER POLICY "Gerencia puede gestionar telegram_alertas_suscripciones" ON public.telegram_alertas_suscripciones
--     USING (EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = (SELECT auth.uid()) AND usuarios.rol = 'Gerencia'::rol_usuario))
--     WITH CHECK (EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = (SELECT auth.uid()) AND usuarios.rol = 'Gerencia'::rol_usuario));
--   ALTER POLICY "fin_presupuestos_select" ON public.fin_presupuestos
--     USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = 'Gerencia'::rol_usuario));
--   ALTER POLICY "fin_presupuestos_insert" ON public.fin_presupuestos
--     WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = 'Gerencia'::rol_usuario));
--   ALTER POLICY "fin_presupuestos_update" ON public.fin_presupuestos
--     USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = 'Gerencia'::rol_usuario));
--   ALTER POLICY "fin_presupuestos_delete" ON public.fin_presupuestos
--     USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = 'Gerencia'::rol_usuario));
--   ALTER POLICY "fin_transacciones_ganado_select_gerencia" ON public.fin_transacciones_ganado
--     USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = 'Gerencia'::rol_usuario));
--   ALTER POLICY "fin_transacciones_ganado_insert_gerencia" ON public.fin_transacciones_ganado
--     WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = 'Gerencia'::rol_usuario));
--   ALTER POLICY "fin_transacciones_ganado_update_gerencia" ON public.fin_transacciones_ganado
--     USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = 'Gerencia'::rol_usuario));
--   ALTER POLICY "fin_transacciones_ganado_delete_gerencia" ON public.fin_transacciones_ganado
--     USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = 'Gerencia'::rol_usuario));
--   ALTER POLICY "fin_transacciones_ganado_select_admin" ON public.fin_transacciones_ganado
--     USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = 'Administrador'::rol_usuario));
--   ALTER POLICY "fin_transacciones_ganado_insert_admin" ON public.fin_transacciones_ganado
--     WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = 'Administrador'::rol_usuario));
--   ALTER POLICY "fin_transacciones_ganado_update_admin" ON public.fin_transacciones_ganado
--     USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = 'Administrador'::rol_usuario));
--   ALTER POLICY "fin_transacciones_ganado_delete_admin" ON public.fin_transacciones_ganado
--     USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = 'Administrador'::rol_usuario));
--   ALTER POLICY "fin_proveedores_admin_select" ON public.fin_proveedores
--     USING (EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = (SELECT auth.uid()) AND usuarios.rol = 'Administrador'::rol_usuario));
--   ALTER POLICY "fin_proveedores_admin_insert" ON public.fin_proveedores
--     WITH CHECK (EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = (SELECT auth.uid()) AND usuarios.rol = 'Administrador'::rol_usuario));
--   ALTER POLICY "chat_conversations_select" ON public.chat_conversations
--     USING ((SELECT auth.uid()) = user_id AND EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = (SELECT auth.uid()) AND usuarios.rol = 'Gerencia'::rol_usuario));
--   ALTER POLICY "chat_conversations_insert" ON public.chat_conversations
--     WITH CHECK ((SELECT auth.uid()) = user_id AND EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = (SELECT auth.uid()) AND usuarios.rol = 'Gerencia'::rol_usuario));
--   ALTER POLICY "chat_conversations_delete" ON public.chat_conversations
--     USING ((SELECT auth.uid()) = user_id AND EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = (SELECT auth.uid()) AND usuarios.rol = 'Gerencia'::rol_usuario));
-- ---------------------------------------------------------------------------
