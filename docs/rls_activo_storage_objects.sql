-- =============================================================================
-- rls_activo_storage_objects.sql
--
-- *** NO APLICABLE POR EL CARRIL DE MIGRACIONES -- PEGAR EN
-- *** Supabase -> Storage -> Policies
--
-- Companero de `src/sql/migrations/161_rls_activo_por_helper.sql`. La 161 cierra
-- las 45 politicas de `public`; estas 23 son la misma falla sobre
-- `storage.objects`, y NO pueden ir en ese archivo.
--
-- -----------------------------------------------------------------------------
-- POR QUE NO PUEDE IR EN UNA MIGRACION
-- -----------------------------------------------------------------------------
-- `ALTER POLICY` exige ser DUENO de la tabla, y ningun `GRANT` lo confiere.
-- `storage.objects` pertenece a `supabase_storage_admin`; `apply_migration` corre
-- como `postgres`, que no llega a ese rol por ninguna via (`pg_has_role` falso
-- en USAGE y en MEMBER, `rolsuper` falso). Es exactamente lo que documenta la
-- migracion **109**, que por eso se aplico desde el panel de Storage y **no dejo
-- fila en el ledger**.
--
-- Propiedad verificada en vivo el 2026-09-21:
--
--   SELECT pg_get_userbyid(c.relowner)
--   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'storage' AND c.relname = 'objects';
--   -- supabase_storage_admin
--
-- Un archivo que mezclara las 45 de `public` con estas 23 **abortaria a mitad de
-- camino** con `42501` y dejaria la impresion de que fallaron las 45. Por eso
-- van separadas, y por eso este archivo vive en `docs/` y no en
-- `src/sql/migrations/`: no es una migracion, no lleva numero y no debe recibir
-- uno -- el ledger no va a registrarlo nunca.
--
-- -----------------------------------------------------------------------------
-- QUE CIERRAN
-- -----------------------------------------------------------------------------
-- Lo mismo que la 161: leen `usuarios` en linea y comprueban solo el rol, asi que
-- **no heredan el filtro `usuarios.activo = true`** que la 137 puso dentro de
-- `get_user_role()` y `es_usuario_gerencia()`. Una cuenta desactivada fuera de
-- banda -- editor SQL, editor de tablas, conector de escritura, donde no hay
-- baneo de auth que acote la ventana -- conserva acceso a los cinco buckets:
-- `facturas`, `reportes-semanales`, `chequeos-fotos`, `hato-pesajes-fotos` y
-- `hato-liquidaciones-fotos`.
--
-- Las 23, medidas en vivo el 2026-09-21: 8 de `facturas`, 3 de
-- `reportes-semanales` y 12 de los tres buckets del hato (4 por bucket).
--
-- **Los conjuntos de roles NO son uniformes y se reproducen tal cual.** Tres
-- formas distintas conviven:
--   * `facturas` lleva politicas SEPARADAS por rol (037/039): cuatro de
--     Administrador y cuatro de Gerencia, cada una con UN rol.
--   * `reportes-semanales` lleva el DELETE acotado a Gerencia sola (esa es la
--     109), y UPDATE/upload a Gerencia+Administrador.
--   * los tres buckets del hato (072) llevan lectura/escritura para
--     Administrador+Gerencia y **DELETE solo Gerencia** -- borrar la foto destruye
--     la trazabilidad del chequeo, asi que no es una accion operativa.
-- Homogeneizarlos aqui seria cambiar el modelo de acceso, no endurecerlo.
--
-- `ALTER POLICY`, nunca `DROP` + `CREATE` (precedente 077): es atomico y no abre
-- una ventana con el bucket sin politica. El predicado va envuelto en
-- `(SELECT ...)` (precedente 093). La clausula `bucket_id = '...'` se conserva
-- intacta en las 23: sin ella una politica de un bucket alcanzaria a todos.
--
-- Filas afectadas: **cero**. Cuentas que pierden capacidad hoy: **cero**
-- (padron 2026-09-21: 10 cuentas, 4 Administrador + 6 Gerencia, ninguna
-- inactiva).
--
-- -----------------------------------------------------------------------------
-- COMO APLICARLO
-- -----------------------------------------------------------------------------
-- Supabase -> Storage -> Policies. Esa UI pasa por el servicio de Storage, que
-- SI corre como el dueno de la tabla. Se edita la clausula `USING` (o
-- `WITH CHECK`) de cada politica, una por una, con el texto de abajo.
--
-- **Las guardas `RAISE EXCEPTION` de una migracion no viajan por esa UI.** Por
-- eso al pie van las consultas de comprobacion: hay que correrlas a mano, antes
-- y despues, desde el conector de solo lectura.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- LAS 23 SENTENCIAS
-- -----------------------------------------------------------------------------

-- facturas -- politicas separadas por rol (8)
ALTER POLICY "Administrador puede actualizar facturas" ON storage.objects
  USING ((bucket_id = 'facturas'::text) AND ((SELECT public.get_user_role()) = 'Administrador'::rol_usuario));
ALTER POLICY "Administrador puede eliminar facturas" ON storage.objects
  USING ((bucket_id = 'facturas'::text) AND ((SELECT public.get_user_role()) = 'Administrador'::rol_usuario));
ALTER POLICY "Administrador puede leer facturas" ON storage.objects
  USING ((bucket_id = 'facturas'::text) AND ((SELECT public.get_user_role()) = 'Administrador'::rol_usuario));
ALTER POLICY "Administrador puede subir facturas" ON storage.objects
  WITH CHECK ((bucket_id = 'facturas'::text) AND ((SELECT public.get_user_role()) = 'Administrador'::rol_usuario));
ALTER POLICY "Gerencia puede actualizar facturas" ON storage.objects
  USING ((bucket_id = 'facturas'::text) AND ((SELECT public.es_usuario_gerencia())));
ALTER POLICY "Gerencia puede eliminar facturas" ON storage.objects
  USING ((bucket_id = 'facturas'::text) AND ((SELECT public.es_usuario_gerencia())));
ALTER POLICY "Gerencia puede leer facturas" ON storage.objects
  USING ((bucket_id = 'facturas'::text) AND ((SELECT public.es_usuario_gerencia())));
ALTER POLICY "Gerencia puede subir facturas" ON storage.objects
  WITH CHECK ((bucket_id = 'facturas'::text) AND ((SELECT public.es_usuario_gerencia())));

-- reportes-semanales -- DELETE solo Gerencia, es la 109 (3)
ALTER POLICY "Authenticated users can delete reports" ON storage.objects
  USING ((bucket_id = 'reportes-semanales'::text) AND ((SELECT public.es_usuario_gerencia())));
ALTER POLICY "Authenticated users can update reports" ON storage.objects
  USING ((bucket_id = 'reportes-semanales'::text) AND ((SELECT public.get_user_role()) = ANY (ARRAY['Gerencia'::rol_usuario, 'Administrador'::rol_usuario])));
ALTER POLICY "Authenticated users can upload reports" ON storage.objects
  WITH CHECK ((bucket_id = 'reportes-semanales'::text) AND ((SELECT public.get_user_role()) = ANY (ARRAY['Gerencia'::rol_usuario, 'Administrador'::rol_usuario])));

-- chequeos-fotos -- patron 072, DELETE solo Gerencia (4)
ALTER POLICY "Hato: actualizar fotos de chequeo" ON storage.objects
  USING ((bucket_id = 'chequeos-fotos'::text) AND ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])));
ALTER POLICY "Hato: eliminar fotos de chequeo" ON storage.objects
  USING ((bucket_id = 'chequeos-fotos'::text) AND ((SELECT public.es_usuario_gerencia())));
ALTER POLICY "Hato: leer fotos de chequeo" ON storage.objects
  USING ((bucket_id = 'chequeos-fotos'::text) AND ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])));
ALTER POLICY "Hato: subir fotos de chequeo" ON storage.objects
  WITH CHECK ((bucket_id = 'chequeos-fotos'::text) AND ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])));

-- hato-pesajes-fotos -- patron 072, DELETE solo Gerencia (4)
ALTER POLICY "Hato: actualizar fotos de pesaje" ON storage.objects
  USING ((bucket_id = 'hato-pesajes-fotos'::text) AND ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])));
ALTER POLICY "Hato: eliminar fotos de pesaje" ON storage.objects
  USING ((bucket_id = 'hato-pesajes-fotos'::text) AND ((SELECT public.es_usuario_gerencia())));
ALTER POLICY "Hato: leer fotos de pesaje" ON storage.objects
  USING ((bucket_id = 'hato-pesajes-fotos'::text) AND ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])));
ALTER POLICY "Hato: subir fotos de pesaje" ON storage.objects
  WITH CHECK ((bucket_id = 'hato-pesajes-fotos'::text) AND ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])));

-- hato-liquidaciones-fotos -- patron 072, DELETE solo Gerencia (4)
ALTER POLICY "Hato: actualizar fotos de liquidacion" ON storage.objects
  USING ((bucket_id = 'hato-liquidaciones-fotos'::text) AND ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])));
ALTER POLICY "Hato: eliminar fotos de liquidacion" ON storage.objects
  USING ((bucket_id = 'hato-liquidaciones-fotos'::text) AND ((SELECT public.es_usuario_gerencia())));
ALTER POLICY "Hato: leer fotos de liquidacion" ON storage.objects
  USING ((bucket_id = 'hato-liquidaciones-fotos'::text) AND ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])));
ALTER POLICY "Hato: subir fotos de liquidacion" ON storage.objects
  WITH CHECK ((bucket_id = 'hato-liquidaciones-fotos'::text) AND ((SELECT public.get_user_role()) = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])));


-- -----------------------------------------------------------------------------
-- COMPROBACION -- correr ANTES y DESPUES desde el conector de SOLO LECTURA
-- -----------------------------------------------------------------------------
-- 1. El barrido canonico sobre `storage.objects`. Antes: 23. Despues: 0.
--
--   SELECT p.polname, p.polcmd
--   FROM pg_policy p
--   JOIN pg_class c ON c.oid = p.polrelid
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'storage' AND c.relname = 'objects'
--     AND (COALESCE(pg_get_expr(p.polqual,p.polrelid),'') || ' ' ||
--          COALESCE(pg_get_expr(p.polwithcheck,p.polrelid),'')) ~ 'FROM usuarios'
--     AND (COALESCE(pg_get_expr(p.polqual,p.polrelid),'') || ' ' ||
--          COALESCE(pg_get_expr(p.polwithcheck,p.polrelid),'')) !~ 'activo'
--   ORDER BY p.polname;
--
-- 2. El total de politicas de `storage.objects` NO se movio. `ALTER POLICY` no
--    crea ni borra ninguna; si este numero cambia, alguien uso DROP + CREATE y
--    hubo una ventana sin politica.
--
--   SELECT count(*) FROM pg_policy p
--   JOIN pg_class c ON c.oid = p.polrelid
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'storage' AND c.relname = 'objects';
--
-- 3. Ninguna politica perdio su `bucket_id`. Tienen que seguir siendo 23 filas,
--    cada una nombrando su bucket. Un predicado sin `bucket_id` alcanza TODOS
--    los buckets -- es la forma mas facil de romper esto y la mas dificil de ver.
--
--   SELECT p.polname,
--          substring(COALESCE(pg_get_expr(p.polqual,p.polrelid),
--                             pg_get_expr(p.polwithcheck,p.polrelid))
--                    from 'bucket_id = ''[a-z-]+''') AS bucket
--   FROM pg_policy p
--   JOIN pg_class c ON c.oid = p.polrelid
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'storage' AND c.relname = 'objects'
--   ORDER BY 2, 1;
--
-- 4. Las 23 llaman ahora a un helper, y lo llaman ENVUELTO (093). Tiene que dar
--    23. `pg_get_expr` imprime `( SELECT get_user_role() AS get_user_role)` --
--    sin el prefijo `public.` -- asi que la expresion regular no lo exige.
--
--   SELECT count(*) FROM pg_policy p
--   JOIN pg_class c ON c.oid = p.polrelid
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'storage' AND c.relname = 'objects'
--     AND (COALESCE(pg_get_expr(p.polqual,p.polrelid),'') || ' ' ||
--          COALESCE(pg_get_expr(p.polwithcheck,p.polrelid),''))
--         ~ '\( SELECT (get_user_role|es_usuario_gerencia)';
--
-- 5. `authenticated` conserva EXECUTE sobre los dos helpers. Sin eso las 23
--    quedarian con `permission denied for function` en vez de con un predicado
--    mas estricto (leccion (a) de la 082). Las 23 son `TO authenticated`.
--
--   SELECT has_function_privilege('authenticated','public.get_user_role()','EXECUTE'),
--          has_function_privilege('authenticated','public.es_usuario_gerencia()','EXECUTE');


-- -----------------------------------------------------------------------------
-- ROLLBACK (mismo carril: Supabase -> Storage -> Policies, no SQL)
-- -----------------------------------------------------------------------------
-- Reproduce el alias original de cada una: `facturas` y los tres buckets del
-- hato nombran la tabla entera y llaman `auth.uid()` PELADO (son anteriores a la
-- 093); `reportes-semanales` usa el alias `u` y ya lo trae envuelto.
--
--   ALTER POLICY "Administrador puede actualizar facturas" ON storage.objects
--     USING ((bucket_id = 'facturas'::text) AND (EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = auth.uid() AND usuarios.rol = 'Administrador'::rol_usuario)));
--   ALTER POLICY "Administrador puede eliminar facturas" ON storage.objects
--     USING ((bucket_id = 'facturas'::text) AND (EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = auth.uid() AND usuarios.rol = 'Administrador'::rol_usuario)));
--   ALTER POLICY "Administrador puede leer facturas" ON storage.objects
--     USING ((bucket_id = 'facturas'::text) AND (EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = auth.uid() AND usuarios.rol = 'Administrador'::rol_usuario)));
--   ALTER POLICY "Administrador puede subir facturas" ON storage.objects
--     WITH CHECK ((bucket_id = 'facturas'::text) AND (EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = auth.uid() AND usuarios.rol = 'Administrador'::rol_usuario)));
--   ALTER POLICY "Gerencia puede actualizar facturas" ON storage.objects
--     USING ((bucket_id = 'facturas'::text) AND (EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = auth.uid() AND usuarios.rol = 'Gerencia'::rol_usuario)));
--   ALTER POLICY "Gerencia puede eliminar facturas" ON storage.objects
--     USING ((bucket_id = 'facturas'::text) AND (EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = auth.uid() AND usuarios.rol = 'Gerencia'::rol_usuario)));
--   ALTER POLICY "Gerencia puede leer facturas" ON storage.objects
--     USING ((bucket_id = 'facturas'::text) AND (EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = auth.uid() AND usuarios.rol = 'Gerencia'::rol_usuario)));
--   ALTER POLICY "Gerencia puede subir facturas" ON storage.objects
--     WITH CHECK ((bucket_id = 'facturas'::text) AND (EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = auth.uid() AND usuarios.rol = 'Gerencia'::rol_usuario)));
--   ALTER POLICY "Authenticated users can delete reports" ON storage.objects
--     USING ((bucket_id = 'reportes-semanales'::text) AND (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = 'Gerencia'::rol_usuario)));
--   ALTER POLICY "Authenticated users can update reports" ON storage.objects
--     USING ((bucket_id = 'reportes-semanales'::text) AND (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Gerencia'::rol_usuario, 'Administrador'::rol_usuario]))));
--   ALTER POLICY "Authenticated users can upload reports" ON storage.objects
--     WITH CHECK ((bucket_id = 'reportes-semanales'::text) AND (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = (SELECT auth.uid()) AND u.rol = ANY (ARRAY['Gerencia'::rol_usuario, 'Administrador'::rol_usuario]))));
--   ALTER POLICY "Hato: actualizar fotos de chequeo" ON storage.objects
--     USING ((bucket_id = 'chequeos-fotos'::text) AND (EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = auth.uid() AND usuarios.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))));
--   ALTER POLICY "Hato: eliminar fotos de chequeo" ON storage.objects
--     USING ((bucket_id = 'chequeos-fotos'::text) AND (EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = auth.uid() AND usuarios.rol = 'Gerencia'::rol_usuario)));
--   ALTER POLICY "Hato: leer fotos de chequeo" ON storage.objects
--     USING ((bucket_id = 'chequeos-fotos'::text) AND (EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = auth.uid() AND usuarios.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))));
--   ALTER POLICY "Hato: subir fotos de chequeo" ON storage.objects
--     WITH CHECK ((bucket_id = 'chequeos-fotos'::text) AND (EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = auth.uid() AND usuarios.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))));
--   ALTER POLICY "Hato: actualizar fotos de pesaje" ON storage.objects
--     USING ((bucket_id = 'hato-pesajes-fotos'::text) AND (EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = auth.uid() AND usuarios.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))));
--   ALTER POLICY "Hato: eliminar fotos de pesaje" ON storage.objects
--     USING ((bucket_id = 'hato-pesajes-fotos'::text) AND (EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = auth.uid() AND usuarios.rol = 'Gerencia'::rol_usuario)));
--   ALTER POLICY "Hato: leer fotos de pesaje" ON storage.objects
--     USING ((bucket_id = 'hato-pesajes-fotos'::text) AND (EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = auth.uid() AND usuarios.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))));
--   ALTER POLICY "Hato: subir fotos de pesaje" ON storage.objects
--     WITH CHECK ((bucket_id = 'hato-pesajes-fotos'::text) AND (EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = auth.uid() AND usuarios.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))));
--   ALTER POLICY "Hato: actualizar fotos de liquidacion" ON storage.objects
--     USING ((bucket_id = 'hato-liquidaciones-fotos'::text) AND (EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = auth.uid() AND usuarios.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))));
--   ALTER POLICY "Hato: eliminar fotos de liquidacion" ON storage.objects
--     USING ((bucket_id = 'hato-liquidaciones-fotos'::text) AND (EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = auth.uid() AND usuarios.rol = 'Gerencia'::rol_usuario)));
--   ALTER POLICY "Hato: leer fotos de liquidacion" ON storage.objects
--     USING ((bucket_id = 'hato-liquidaciones-fotos'::text) AND (EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = auth.uid() AND usuarios.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))));
--   ALTER POLICY "Hato: subir fotos de liquidacion" ON storage.objects
--     WITH CHECK ((bucket_id = 'hato-liquidaciones-fotos'::text) AND (EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = auth.uid() AND usuarios.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario]))));
-- -----------------------------------------------------------------------------
