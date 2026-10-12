-- Local review candidate only; unapplied. Unused Calculada plans only.
-- Whole DEFINER boundary with captured-policy equivalence; no stock credits.
BEGIN;
CREATE SCHEMA application_plan_delete;
REVOKE ALL ON SCHEMA application_plan_delete FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE application_plan_delete.requests(
 actor uuid NOT NULL, request_key uuid NOT NULL, application_id uuid NOT NULL, expected jsonb NOT NULL,
 state text NOT NULL CHECK(state IN ('started','committed','cancelled')), receipt jsonb, archive jsonb,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(actor,request_key)
);
ALTER TABLE application_plan_delete.requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON application_plan_delete.requests FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION application_plan_delete.authorize() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE profile public.usuarios%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Human authentication required'; END IF;
 SELECT * INTO profile FROM public.usuarios WHERE id=auth.uid() FOR SHARE;
 IF NOT FOUND OR profile.activo IS DISTINCT FROM true OR profile.rol IS NULL OR profile.rol::text NOT IN ('Administrador','Gerencia') THEN
 RAISE EXCEPTION 'Current active Administrador or Gerencia required'; END IF;
 RETURN profile.id;
END $$;
CREATE FUNCTION application_plan_delete.assert_boundary() RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE policies jsonb; table_name text; role_helper record;
BEGIN
  SELECT p.prosecdef,p.proconfig,p.prosrc,p.proowner INTO role_helper FROM pg_proc p
  WHERE p.oid=to_regprocedure('public.get_user_role()');
  IF NOT FOUND OR NOT role_helper.prosecdef
    OR NOT ('search_path=public, pg_temp'=ANY(coalesce(role_helper.proconfig,ARRAY[]::text[])))
    OR lower(btrim(regexp_replace(role_helper.prosrc,'\s+',' ','g')))
       <> 'select rol from usuarios where id = auth.uid() and activo = true' THEN
    RAISE EXCEPTION 'Plan-delete active-role policy helper drift';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('tablename',p.tablename,'policyname',p.policyname,
    'cmd',p.cmd,'permissive',p.permissive,'qual',p.qual,'with_check',p.with_check,'roles',p.roles)
    ORDER BY p.tablename COLLATE "C",p.policyname COLLATE "C"),'[]') INTO policies FROM pg_catalog.pg_policies p
    WHERE p.schemaname='public' AND p.tablename=ANY(ARRAY['aplicaciones','aplicaciones_calculos','aplicaciones_cierre','aplicaciones_lotes','aplicaciones_mezclas','aplicaciones_productos','contratistas','empleados','lotes','movimientos_diarios','movimientos_diarios_productos','movimientos_inventario','productos','registros_trabajo','tareas']);
  -- The only additionally accepted policy is the exact reviewed AND-only
  -- productos policy from active-account-rls.sql. No extra permission is allowed.
  SELECT coalesce(jsonb_agg(value ORDER BY (value->>'tablename') COLLATE "C",(value->>'policyname') COLLATE "C"),'[]') INTO policies
  FROM jsonb_array_elements(policies) WHERE value IS DISTINCT FROM
    '{"tablename":"productos","policyname":"active_account_required","cmd":"ALL","permissive":"RESTRICTIVE","roles":["authenticated"],"qual":"(( SELECT get_user_role() AS get_user_role) IS NOT NULL)","with_check":"(( SELECT get_user_role() AS get_user_role) IS NOT NULL)"}'::jsonb;
  IF policies IS DISTINCT FROM '[{"tablename": "aplicaciones", "policyname": "Administrador puede todo en aplicaciones", "cmd": "ALL", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Administrador''::rol_usuario)", "with_check": null, "roles": ["public"]}, {"tablename": "aplicaciones", "policyname": "Gerencia acceso total", "cmd": "ALL", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Gerencia''::rol_usuario)", "with_check": null, "roles": ["public"]}, {"tablename": "aplicaciones_calculos", "policyname": "authenticated_delete_aplicaciones_calculos", "cmd": "DELETE", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "with_check": null, "roles": ["authenticated"]}, {"tablename": "aplicaciones_calculos", "policyname": "authenticated_insert_aplicaciones_calculos", "cmd": "INSERT", "permissive": "PERMISSIVE", "qual": null, "with_check": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "roles": ["authenticated"]}, {"tablename": "aplicaciones_calculos", "policyname": "authenticated_select_aplicaciones_calculos", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "true", "with_check": null, "roles": ["authenticated"]}, {"tablename": "aplicaciones_cierre", "policyname": "Administrador puede todo en cierre", "cmd": "ALL", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Administrador''::rol_usuario)", "with_check": null, "roles": ["public"]}, {"tablename": "aplicaciones_cierre", "policyname": "Gerencia acceso total", "cmd": "ALL", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Gerencia''::rol_usuario)", "with_check": null, "roles": ["public"]}, {"tablename": "aplicaciones_lotes", "policyname": "authenticated_delete_aplicaciones_lotes", "cmd": "DELETE", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "with_check": null, "roles": ["authenticated"]}, {"tablename": "aplicaciones_lotes", "policyname": "authenticated_insert_aplicaciones_lotes", "cmd": "INSERT", "permissive": "PERMISSIVE", "qual": null, "with_check": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "roles": ["authenticated"]}, {"tablename": "aplicaciones_lotes", "policyname": "authenticated_select_aplicaciones_lotes", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "true", "with_check": null, "roles": ["authenticated"]}, {"tablename": "aplicaciones_mezclas", "policyname": "Administrador puede todo en mezclas", "cmd": "ALL", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Administrador''::rol_usuario)", "with_check": null, "roles": ["public"]}, {"tablename": "aplicaciones_mezclas", "policyname": "Gerencia acceso total", "cmd": "ALL", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Gerencia''::rol_usuario)", "with_check": null, "roles": ["public"]}, {"tablename": "aplicaciones_productos", "policyname": "authenticated_delete_aplicaciones_productos", "cmd": "DELETE", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "with_check": null, "roles": ["authenticated"]}, {"tablename": "aplicaciones_productos", "policyname": "authenticated_insert_aplicaciones_productos", "cmd": "INSERT", "permissive": "PERMISSIVE", "qual": null, "with_check": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "roles": ["authenticated"]}, {"tablename": "aplicaciones_productos", "policyname": "authenticated_select_aplicaciones_productos", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "true", "with_check": null, "roles": ["authenticated"]}, {"tablename": "contratistas", "policyname": "authenticated_delete_contratistas", "cmd": "DELETE", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "with_check": null, "roles": ["authenticated"]}, {"tablename": "contratistas", "policyname": "authenticated_insert_contratistas", "cmd": "INSERT", "permissive": "PERMISSIVE", "qual": null, "with_check": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "roles": ["authenticated"]}, {"tablename": "contratistas", "policyname": "authenticated_select_contratistas", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "with_check": null, "roles": ["authenticated"]}, {"tablename": "contratistas", "policyname": "authenticated_update_contratistas", "cmd": "UPDATE", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "with_check": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "roles": ["authenticated"]}, {"tablename": "empleados", "policyname": "Administrador insert access on empleados", "cmd": "INSERT", "permissive": "PERMISSIVE", "qual": null, "with_check": "(EXISTS ( SELECT 1\n   FROM usuarios\n  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ANY (ARRAY[''Administrador''::rol_usuario, ''Gerencia''::rol_usuario])) AND (usuarios.activo = true))))", "roles": ["authenticated"]}, {"tablename": "empleados", "policyname": "Administrador read access on empleados", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "(EXISTS ( SELECT 1\n   FROM usuarios\n  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ANY (ARRAY[''Administrador''::rol_usuario, ''Gerencia''::rol_usuario])) AND (usuarios.activo = true))))", "with_check": null, "roles": ["authenticated"]}, {"tablename": "empleados", "policyname": "Gerencia full access on empleados", "cmd": "ALL", "permissive": "PERMISSIVE", "qual": "(EXISTS ( SELECT 1\n   FROM usuarios\n  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ''Gerencia''::rol_usuario) AND (usuarios.activo = true))))", "with_check": "(EXISTS ( SELECT 1\n   FROM usuarios\n  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ''Gerencia''::rol_usuario) AND (usuarios.activo = true))))", "roles": ["authenticated"]}, {"tablename": "empleados", "policyname": "Verificador read active empleados", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "((estado = ''Activo''::estado_empleado) AND (EXISTS ( SELECT 1\n   FROM usuarios\n  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ANY (ARRAY[''Verificador''::rol_usuario, ''Administrador''::rol_usuario, ''Gerencia''::rol_usuario])) AND (usuarios.activo = true)))))", "with_check": null, "roles": ["authenticated"]}, {"tablename": "lotes", "policyname": "Administrador lee lotes", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Administrador''::rol_usuario)", "with_check": null, "roles": ["public"]}, {"tablename": "lotes", "policyname": "Gerencia acceso total", "cmd": "ALL", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Gerencia''::rol_usuario)", "with_check": null, "roles": ["public"]}, {"tablename": "lotes", "policyname": "Usuarios autenticados pueden actualizar lotes", "cmd": "UPDATE", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "with_check": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "roles": ["authenticated"]}, {"tablename": "lotes", "policyname": "Usuarios autenticados pueden eliminar lotes", "cmd": "DELETE", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "with_check": null, "roles": ["authenticated"]}, {"tablename": "lotes", "policyname": "Usuarios autenticados pueden insertar lotes", "cmd": "INSERT", "permissive": "PERMISSIVE", "qual": null, "with_check": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "roles": ["authenticated"]}, {"tablename": "lotes", "policyname": "Usuarios autenticados pueden leer lotes", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "true", "with_check": null, "roles": ["authenticated"]}, {"tablename": "movimientos_diarios", "policyname": "Usuarios autenticados pueden crear movimientos diarios", "cmd": "INSERT", "permissive": "PERMISSIVE", "qual": null, "with_check": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "roles": ["authenticated"]}, {"tablename": "movimientos_diarios", "policyname": "Usuarios autenticados pueden leer movimientos diarios", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "true", "with_check": null, "roles": ["authenticated"]}, {"tablename": "movimientos_diarios", "policyname": "Usuarios pueden actualizar sus propios movimientos", "cmd": "UPDATE", "permissive": "PERMISSIVE", "qual": "(created_by = ( SELECT auth.uid() AS uid))", "with_check": null, "roles": ["authenticated"]}, {"tablename": "movimientos_diarios", "policyname": "Usuarios pueden eliminar sus propios movimientos", "cmd": "DELETE", "permissive": "PERMISSIVE", "qual": "(created_by = ( SELECT auth.uid() AS uid))", "with_check": null, "roles": ["authenticated"]}, {"tablename": "movimientos_diarios_productos", "policyname": "authenticated_delete_movimientos_diarios_productos", "cmd": "DELETE", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "with_check": null, "roles": ["authenticated"]}, {"tablename": "movimientos_diarios_productos", "policyname": "authenticated_insert_movimientos_diarios_productos", "cmd": "INSERT", "permissive": "PERMISSIVE", "qual": null, "with_check": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "roles": ["authenticated"]}, {"tablename": "movimientos_diarios_productos", "policyname": "authenticated_select_movimientos_diarios_productos", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "true", "with_check": null, "roles": ["authenticated"]}, {"tablename": "movimientos_inventario", "policyname": "Administrador puede todo en movimientos", "cmd": "ALL", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Administrador''::rol_usuario)", "with_check": null, "roles": ["public"]}, {"tablename": "movimientos_inventario", "policyname": "Gerencia acceso total", "cmd": "ALL", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Gerencia''::rol_usuario)", "with_check": null, "roles": ["public"]}, {"tablename": "movimientos_inventario", "policyname": "Verificador lee movimientos", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Verificador''::rol_usuario)", "with_check": null, "roles": ["public"]}, {"tablename": "productos", "policyname": "Administrador actualiza productos", "cmd": "UPDATE", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Administrador''::rol_usuario)", "with_check": null, "roles": ["public"]}, {"tablename": "productos", "policyname": "Administrador escritura productos", "cmd": "INSERT", "permissive": "PERMISSIVE", "qual": null, "with_check": "(( SELECT get_user_role() AS get_user_role) = ''Administrador''::rol_usuario)", "roles": ["public"]}, {"tablename": "productos", "policyname": "Administrador lectura productos", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Administrador''::rol_usuario)", "with_check": null, "roles": ["public"]}, {"tablename": "productos", "policyname": "Gerencia acceso total", "cmd": "ALL", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Gerencia''::rol_usuario)", "with_check": null, "roles": ["public"]}, {"tablename": "productos", "policyname": "Permitir lectura de precios a usuarios autenticados", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "true", "with_check": null, "roles": ["authenticated"]}, {"tablename": "productos", "policyname": "Usuarios autenticados leen productos", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "true", "with_check": null, "roles": ["authenticated"]}, {"tablename": "productos", "policyname": "Verificador lee productos", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Verificador''::rol_usuario)", "with_check": null, "roles": ["public"]}, {"tablename": "registros_trabajo", "policyname": "Administrador access registros_trabajo", "cmd": "ALL", "permissive": "PERMISSIVE", "qual": "(EXISTS ( SELECT 1\n   FROM usuarios\n  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ANY (ARRAY[''Administrador''::rol_usuario, ''Gerencia''::rol_usuario])) AND (usuarios.activo = true))))", "with_check": null, "roles": ["authenticated"]}, {"tablename": "registros_trabajo", "policyname": "Gerencia full access on registros_trabajo", "cmd": "ALL", "permissive": "PERMISSIVE", "qual": "(EXISTS ( SELECT 1\n   FROM usuarios\n  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ''Gerencia''::rol_usuario) AND (usuarios.activo = true))))", "with_check": null, "roles": ["authenticated"]}, {"tablename": "registros_trabajo", "policyname": "Verificador read registros_trabajo", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "(EXISTS ( SELECT 1\n   FROM usuarios\n  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ''Verificador''::rol_usuario) AND (usuarios.activo = true))))", "with_check": null, "roles": ["authenticated"]}, {"tablename": "registros_trabajo", "policyname": "authenticated_insert_registros_trabajo", "cmd": "INSERT", "permissive": "PERMISSIVE", "qual": null, "with_check": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "roles": ["authenticated"]}, {"tablename": "registros_trabajo", "policyname": "authenticated_select_registros_trabajo", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "true", "with_check": null, "roles": ["authenticated"]}, {"tablename": "registros_trabajo", "policyname": "authenticated_update_registros_trabajo", "cmd": "UPDATE", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "with_check": "(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))", "roles": ["authenticated"]}, {"tablename": "tareas", "policyname": "Administrador delete own tareas", "cmd": "DELETE", "permissive": "PERMISSIVE", "qual": "((EXISTS ( SELECT 1\n   FROM usuarios\n  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ''Administrador''::rol_usuario) AND (usuarios.activo = true)))) AND ((created_by = ( SELECT auth.uid() AS uid)) OR (created_by IS NULL)))", "with_check": null, "roles": ["authenticated"]}, {"tablename": "tareas", "policyname": "Administrador insert tareas", "cmd": "INSERT", "permissive": "PERMISSIVE", "qual": null, "with_check": "(EXISTS ( SELECT 1\n   FROM usuarios\n  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ANY (ARRAY[''Administrador''::rol_usuario, ''Gerencia''::rol_usuario])) AND (usuarios.activo = true))))", "roles": ["authenticated"]}, {"tablename": "tareas", "policyname": "Administrador read tareas", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "(EXISTS ( SELECT 1\n   FROM usuarios\n  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ANY (ARRAY[''Administrador''::rol_usuario, ''Gerencia''::rol_usuario])) AND (usuarios.activo = true))))", "with_check": null, "roles": ["authenticated"]}, {"tablename": "tareas", "policyname": "Administrador update tareas", "cmd": "UPDATE", "permissive": "PERMISSIVE", "qual": "(EXISTS ( SELECT 1\n   FROM usuarios\n  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ANY (ARRAY[''Administrador''::rol_usuario, ''Gerencia''::rol_usuario])) AND (usuarios.activo = true))))", "with_check": null, "roles": ["authenticated"]}, {"tablename": "tareas", "policyname": "Gerencia full access on tareas", "cmd": "ALL", "permissive": "PERMISSIVE", "qual": "(EXISTS ( SELECT 1\n   FROM usuarios\n  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ''Gerencia''::rol_usuario) AND (usuarios.activo = true))))", "with_check": null, "roles": ["authenticated"]}, {"tablename": "tareas", "policyname": "Verificador read tareas", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "(EXISTS ( SELECT 1\n   FROM usuarios\n  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ''Verificador''::rol_usuario) AND (usuarios.activo = true))))", "with_check": null, "roles": ["authenticated"]}]'::jsonb THEN RAISE EXCEPTION 'Plan-delete policy boundary drift; coordinated review required'; END IF;
  FOREACH table_name IN ARRAY ARRAY['aplicaciones','aplicaciones_calculos','aplicaciones_cierre','aplicaciones_lotes','aplicaciones_mezclas','aplicaciones_productos','contratistas','empleados','lotes','movimientos_diarios','movimientos_diarios_productos','movimientos_inventario','productos','registros_trabajo','tareas'] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c WHERE c.oid=('public.'||table_name)::regclass
      AND c.relrowsecurity AND NOT c.relforcerowsecurity)
      OR NOT has_table_privilege('authenticated','public.'||table_name,'SELECT')
      OR NOT has_table_privilege('authenticated','public.'||table_name,'INSERT')
      OR NOT has_table_privilege('authenticated','public.'||table_name,'UPDATE')
      OR NOT has_table_privilege('authenticated','public.'||table_name,'DELETE') THEN
      RAISE EXCEPTION 'Plan-delete grant or RLS prerequisite drift: %',table_name;
    END IF;
  END LOOP;
END $$;
CREATE FUNCTION application_plan_delete.assert_graph() RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $guard$
DECLARE r record; target text; source text; from_col text; to_col text; edge text[];
BEGIN
 -- Purchase-plan boundary comes from local migrations 033/110; unsupported live
 -- variants fail rather than silently widening the captured role intersection.
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.aplicaciones_compras'::regclass AND relrowsecurity AND NOT relforcerowsecurity)
 OR NOT has_table_privilege('authenticated','public.aplicaciones_compras','SELECT') OR NOT has_table_privilege('authenticated','public.aplicaciones_compras','DELETE')
 OR (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='aplicaciones_compras')<>3
 OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='aplicaciones_compras' AND policyname='authenticated_select_aplicaciones_compras' AND cmd='SELECT' AND permissive='PERMISSIVE' AND roles=ARRAY['authenticated']::name[] AND qual='true' AND with_check IS NULL)
 OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='aplicaciones_compras' AND policyname='authenticated_insert_aplicaciones_compras' AND cmd='INSERT' AND permissive='PERMISSIVE' AND roles=ARRAY['authenticated']::name[] AND qual IS NULL AND with_check='true')
 OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='aplicaciones_compras' AND policyname='authenticated_delete_aplicaciones_compras' AND cmd='DELETE' AND permissive='PERMISSIVE' AND roles=ARRAY['authenticated']::name[]
 AND qual='(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Gerencia''::rol_usuario, ''Administrador''::rol_usuario]))' AND with_check IS NULL)
 THEN RAISE EXCEPTION 'Unsupported purchase-plan policy/grant schema'; END IF;
 -- Reject every unreviewed inbound FK, including finance and cross-schema links.
 FOR r IN SELECT c.*,c.conrelid::regclass::text source,c.confrelid::regclass::text target FROM pg_constraint c
 WHERE c.contype='f' AND c.confrelid=ANY(ARRAY['public.aplicaciones'::regclass,'public.aplicaciones_lotes'::regclass,
 'public.aplicaciones_mezclas'::regclass,'public.aplicaciones_productos'::regclass,'public.aplicaciones_calculos'::regclass,'public.aplicaciones_compras'::regclass]) LOOP
 SELECT attname INTO from_col FROM pg_attribute WHERE attrelid=r.conrelid AND attnum=r.conkey[1];
 SELECT attname INTO to_col FROM pg_attribute WHERE attrelid=r.confrelid AND attnum=r.confkey[1];
 IF cardinality(r.conkey)<>1 OR cardinality(r.confkey)<>1 OR to_col<>'id'
 OR NOT ((r.confrelid='public.aplicaciones'::regclass AND from_col='aplicacion_id' AND r.conrelid=ANY(ARRAY[
 'public.aplicaciones_lotes'::regclass,'public.aplicaciones_mezclas'::regclass,'public.aplicaciones_calculos'::regclass,
 'public.aplicaciones_compras'::regclass,'public.aplicaciones_cierre'::regclass,'public.movimientos_diarios'::regclass,'public.movimientos_inventario'::regclass]))
 OR (r.confrelid='public.aplicaciones_mezclas'::regclass AND from_col='mezcla_id' AND r.conrelid=ANY(ARRAY[
 'public.aplicaciones_productos'::regclass,'public.aplicaciones_calculos'::regclass])))
 OR r.confupdtype<>'a' OR r.confdeltype NOT IN ('a','c') OR r.condeferrable OR NOT r.convalidated THEN
 RAISE EXCEPTION 'Unsupported plan-delete relationship: %.%',r.source,from_col; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint c WHERE c.contype='f' AND c.conrelid='public.aplicaciones_lotes'::regclass
 AND c.confrelid='public.aplicaciones'::regclass AND c.confdeltype='c' AND c.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.conrelid AND attname='aplicacion_id')])
 THEN RAISE EXCEPTION 'Verified application-lot cascade required'; END IF;
 -- Required FKs prevent delayed direct child writers creating orphans after commit.
 FOREACH edge SLICE 1 IN ARRAY ARRAY[
 ['aplicaciones_mezclas','aplicacion_id','aplicaciones'],['aplicaciones_calculos','aplicacion_id','aplicaciones'],
 ['aplicaciones_calculos','mezcla_id','aplicaciones_mezclas'],['aplicaciones_productos','mezcla_id','aplicaciones_mezclas'],
 ['aplicaciones_compras','aplicacion_id','aplicaciones'],['movimientos_diarios','aplicacion_id','aplicaciones'],
 ['movimientos_inventario','aplicacion_id','aplicaciones'],['aplicaciones_cierre','aplicacion_id','aplicaciones']] LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_constraint c WHERE c.contype='f' AND c.conrelid=('public.'||edge[1])::regclass
 AND c.confrelid=('public.'||edge[3])::regclass AND c.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.conrelid AND attname=edge[2])]
 AND c.confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.confrelid AND attname='id')] AND c.convalidated AND NOT c.condeferrable)
 THEN RAISE EXCEPTION 'Required plan relationship missing: %.%',edge[1],edge[2]; END IF;
 END LOOP;
 -- Reject semantic application references even when no FK enforces them.
 FOR r IN SELECT n.nspname,c.relname,a.attname FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE a.attnum>0 AND NOT a.attisdropped AND c.relkind IN ('r','p') AND a.attname IN ('aplicacion_id','application_id') AND n.nspname NOT IN ('pg_catalog','information_schema') LOOP
 IF NOT ((r.nspname='public' AND r.relname=ANY(ARRAY['aplicaciones_lotes','aplicaciones_mezclas','aplicaciones_calculos','aplicaciones_compras','aplicaciones_cierre','movimientos_diarios','movimientos_inventario','globalgap_correcciones']))
 OR (r.nspname=ANY(ARRAY['application_closure','application_plan_delete']) AND r.relname='requests' AND r.attname='application_id')) THEN
 RAISE EXCEPTION 'Unsupported application reference: %.%',r.nspname,r.relname; END IF;
 END LOOP;
 -- Only known DELETE triggers are permitted. Full bodies must match reviewed sources.
 FOR r IN SELECT t.tgname,t.tgrelid,t.tgtype,p.prosrc,p.prosecdef,p.proconfig FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
 WHERE NOT t.tgisinternal AND t.tgenabled<>'D' AND (t.tgtype::integer & 8)<>0 AND t.tgrelid=ANY(ARRAY[
 'public.aplicaciones'::regclass,'public.aplicaciones_lotes'::regclass,'public.aplicaciones_mezclas'::regclass,
 'public.aplicaciones_productos'::regclass,'public.aplicaciones_calculos'::regclass,'public.aplicaciones_compras'::regclass]) LOOP
 IF r.tgname='trg_globalgap_correccion' AND r.tgtype=25 AND r.prosecdef
 AND 'search_path=public, pg_temp'=ANY(coalesce(r.proconfig,ARRAY[]::text[])) AND md5(r.prosrc)=md5($gg$
DECLARE
  v_aplicacion_id UUID;
BEGIN
  -- Regla dura, idéntica a la 084: sólo sesiones humanas de navegador dejan
  -- traza. auth.uid() es NULL para service_role (bot de Telegram, migraciones,
  -- el commit de chequeo del hato) -- limitación conocida, misma que
  -- 050/063/074 aceptaron para `created_by`.
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- No-op: un UPDATE que reenvía el mismo valor no es una corrección real.
  IF TG_OP = 'UPDATE' AND to_jsonb(OLD) = to_jsonb(NEW) THEN
    RETURN NEW;
  END IF;

  -- `aplicacion_id`: sin SQL dinámico, `to_jsonb(...)->>'columna'` resuelve
  -- columnas que no existen en todas las tablas (ej. aplicaciones_productos no
  -- tiene aplicacion_id, sólo mezcla_id) sin romper la compilación de plpgsql
  -- -- misma técnica que la 084 usó para animal_id.
  IF TG_TABLE_NAME = 'aplicaciones' THEN
    v_aplicacion_id := (to_jsonb(OLD) ->> 'id')::uuid;
  ELSE
    v_aplicacion_id := (to_jsonb(OLD) ->> 'aplicacion_id')::uuid;
  END IF;

  INSERT INTO public.globalgap_correcciones (
    tabla, fila_id, operacion, datos_anteriores, datos_nuevos,
    aplicacion_id, corregido_por
  )
  VALUES (
    TG_TABLE_NAME,
    (to_jsonb(OLD) ->> 'id')::uuid,
    lower(TG_OP),
    to_jsonb(OLD),
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    v_aplicacion_id,
    auth.uid()
  );

  RETURN COALESCE(NEW, OLD);
END;
$gg$) THEN NULL;
 ELSIF r.tgrelid='public.aplicaciones_lotes'::regclass AND r.tgname='trigger_sync_tarea_lotes_on_aplicaciones_lotes_change'
 AND r.tgtype=29 AND NOT r.prosecdef AND md5(r.prosrc)=md5($sync$
DECLARE
  linked_tarea_id UUID;
  has_trabajo BOOLEAN;
BEGIN
  -- Get the linked tarea_id for this aplicacion
  SELECT tarea_id INTO linked_tarea_id
  FROM aplicaciones
  WHERE id = COALESCE(NEW.aplicacion_id, OLD.aplicacion_id);

  -- Skip if no linked tarea
  IF linked_tarea_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Check if tarea has registered work
  SELECT EXISTS (
    SELECT 1
    FROM registros_trabajo
    WHERE tarea_id = linked_tarea_id
  ) INTO has_trabajo;

  -- Only sync if tarea has no registered work (safety check)
  IF NOT has_trabajo THEN
    UPDATE tareas
    SET
      lote_ids = (
        SELECT ARRAY_AGG(lote_id)
        FROM aplicaciones_lotes
        WHERE aplicacion_id = COALESCE(NEW.aplicacion_id, OLD.aplicacion_id)
      ),
      updated_at = NOW()
    WHERE id = linked_tarea_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$sync$) THEN NULL;
 ELSE RAISE EXCEPTION 'Unsupported plan-delete trigger: %',r.tgname; END IF;
 END LOOP;
 FOREACH target IN ARRAY ARRAY['aplicaciones','aplicaciones_lotes','aplicaciones_productos','aplicaciones_calculos','aplicaciones_compras'] LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('public.'||target)::regclass AND tgname='trg_globalgap_correccion' AND tgenabled='O' AND tgtype=25)
 THEN RAISE EXCEPTION 'Required plan correction trigger missing: %',target; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE contype='f' AND conrelid='application_plan_delete.requests'::regclass)
 OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=ANY(ARRAY['public.globalgap_correcciones'::regclass,'application_plan_delete.requests'::regclass]) AND NOT tgisinternal AND tgenabled<>'D') THEN
 RAISE EXCEPTION 'Unsupported correction/proof dependency or trigger'; END IF;
 FOR r IN SELECT * FROM pg_constraint WHERE contype='f' AND conrelid='public.globalgap_correcciones'::regclass LOOP
 IF r.confrelid IS DISTINCT FROM to_regclass('auth.users') OR cardinality(r.conkey)<>1 OR cardinality(r.confkey)<>1
 OR r.confdeltype<>'a' OR r.confupdtype<>'a' OR r.condeferrable OR NOT r.convalidated
 OR r.conkey IS DISTINCT FROM ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=r.conrelid AND attname='corregido_por')]
 OR r.confkey IS DISTINCT FROM ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=r.confrelid AND attname='id')] THEN
 RAISE EXCEPTION 'Unsupported correction foreign key'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class=ANY(ARRAY['public.aplicaciones'::regclass,'public.aplicaciones_lotes'::regclass,'public.aplicaciones_mezclas'::regclass,'public.aplicaciones_productos'::regclass,'public.aplicaciones_calculos'::regclass,'public.aplicaciones_compras'::regclass,'public.globalgap_correcciones'::regclass,'application_plan_delete.requests'::regclass])) THEN RAISE EXCEPTION 'Unsupported plan-delete rewrite rule'; END IF;
 -- Drift in required relation columns must abort rather than dynamically deleting by inferred names.
 FOREACH target IN ARRAY ARRAY['aplicaciones','aplicaciones_lotes','aplicaciones_mezclas','aplicaciones_productos','aplicaciones_calculos','aplicaciones_compras','tareas','registros_trabajo','movimientos_diarios','movimientos_inventario','aplicaciones_cierre'] LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=('public.'||target)::regclass AND relkind='r') OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhparent=('public.'||target)::regclass OR inhrelid=('public.'||target)::regclass) OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=('public.'||target)::regclass AND attname='id' AND atttypid='uuid'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Plan UUID schema prerequisite drift'; END IF;
 END LOOP;
END $guard$;
SELECT application_plan_delete.assert_boundary();
SELECT application_plan_delete.assert_graph();
CREATE FUNCTION application_plan_delete.snapshot(app uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE result jsonb; closure_proof boolean:=false;
BEGIN
 IF to_regclass('application_closure.requests') IS NOT NULL THEN
 EXECUTE 'SELECT EXISTS(SELECT 1 FROM application_closure.requests WHERE application_id=$1 AND state<>''cancelled'')' INTO closure_proof USING app; END IF;
 SELECT jsonb_build_object(
 'aplicaciones',(SELECT to_jsonb(a) FROM public.aplicaciones a WHERE id=app),
 'aplicaciones_lotes',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.aplicaciones_lotes x WHERE aplicacion_id=app),
 'aplicaciones_mezclas',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.aplicaciones_mezclas x WHERE aplicacion_id=app),
 'aplicaciones_productos',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.aplicaciones_productos x JOIN public.aplicaciones_mezclas m ON m.id=x.mezcla_id WHERE m.aplicacion_id=app),
 'aplicaciones_calculos',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.aplicaciones_calculos x WHERE aplicacion_id=app),
 'aplicaciones_compras',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.aplicaciones_compras x WHERE aplicacion_id=app),
 'tarea',(SELECT to_jsonb(t) FROM public.tareas t JOIN public.aplicaciones a ON a.tarea_id=t.id WHERE a.id=app),
 'trabajo',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.registros_trabajo x JOIN public.aplicaciones a ON a.tarea_id=x.tarea_id WHERE a.id=app),
 'task_references',(SELECT coalesce(jsonb_agg(a.id ORDER BY a.id),'[]') FROM public.aplicaciones a WHERE a.tarea_id=(SELECT tarea_id FROM public.aplicaciones WHERE id=app)),
 'daily',(SELECT coalesce(jsonb_agg(id ORDER BY id),'[]') FROM public.movimientos_diarios WHERE aplicacion_id=app),
 'ledger',(SELECT coalesce(jsonb_agg(id ORDER BY id),'[]') FROM public.movimientos_inventario WHERE aplicacion_id=app),
 'closure',(SELECT coalesce(jsonb_agg(id ORDER BY id),'[]') FROM public.aplicaciones_cierre WHERE aplicacion_id=app),
 'closure_proof',closure_proof,
 'cross_scope',EXISTS(SELECT 1 FROM public.aplicaciones_calculos c JOIN public.aplicaciones_mezclas m ON m.id=c.mezcla_id
 WHERE (c.aplicacion_id=app OR m.aplicacion_id=app) AND c.aplicacion_id IS DISTINCT FROM m.aplicacion_id)) INTO result;
 RETURN result;
END $$;
CREATE FUNCTION application_plan_delete.eligible(e jsonb) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF e->'aplicaciones'='null'::jsonb OR e->'aplicaciones'->>'estado' IS DISTINCT FROM 'Calculada'
 OR e->'aplicaciones'->>'fecha_inicio_ejecucion' IS NOT NULL OR e->'aplicaciones'->>'fecha_fin_ejecucion' IS NOT NULL OR e->'aplicaciones'->>'fecha_cierre' IS NOT NULL
 OR e->'trabajo'<>'[]'::jsonb OR e->'daily'<>'[]'::jsonb OR e->'ledger'<>'[]'::jsonb OR e->'closure'<>'[]'::jsonb
 OR (e->>'closure_proof')::boolean OR (e->>'cross_scope')::boolean OR jsonb_array_length(e->'task_references')>1 THEN
 RAISE EXCEPTION 'Solo puede eliminar un plan sin ejecución, trabajo ni movimientos de inventario.'; END IF;
 IF e->'aplicaciones'->>'tarea_id' IS NOT NULL AND e->'tarea'='null'::jsonb THEN RAISE EXCEPTION 'Linked task unavailable'; END IF;
END $$;
CREATE FUNCTION public.fn_application_plan_delete_snapshot(p_application_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE e jsonb;
BEGIN
 PERFORM application_plan_delete.authorize(); PERFORM application_plan_delete.assert_boundary(); PERFORM application_plan_delete.assert_graph();
 e:=application_plan_delete.snapshot(p_application_id); PERFORM application_plan_delete.eligible(e);
 RETURN jsonb_build_object('application_id',p_application_id,'expected',e);
END $$;
CREATE FUNCTION application_plan_delete.retained() RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE t text; result jsonb:='{}'; fingerprint text;
BEGIN
 FOREACH t IN ARRAY ARRAY['productos','movimientos_inventario','tareas','registros_trabajo','movimientos_diarios','aplicaciones_cierre'] LOOP
 EXECUTE format('SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY id)::text,''[]'')) FROM public.%I x',t) INTO fingerprint;
 result:=result||jsonb_build_object(t,fingerprint); END LOOP;
 IF to_regclass('application_closure.requests') IS NOT NULL THEN
 EXECUTE 'SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY actor,request_key)::text,''[]'')) FROM application_closure.requests x' INTO fingerprint;
 result:=result||jsonb_build_object('closure_proofs',fingerprint); END IF;
 RETURN result;
END $$;
CREATE FUNCTION public.fn_application_plan_delete(p_request_key uuid,p_application_id uuid,p_expected jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' AS $$
<<del>>
DECLARE actor uuid; r application_plan_delete.requests%ROWTYPE; e jsonb; baseline jsonb; audit_before jsonb; table_name text; row jsonb; expected_ids jsonb; actual_ids jsonb; deleted jsonb:='{}'; result jsonb;
BEGIN
 actor:=application_plan_delete.authorize(); PERFORM application_plan_delete.assert_boundary(); PERFORM application_plan_delete.assert_graph();
 IF p_request_key IS NULL OR p_application_id IS NULL OR jsonb_typeof(p_expected) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Exact plan-delete original required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('plan-delete:'||actor::text||':'||p_request_key::text,0));
 SELECT * INTO r FROM application_plan_delete.requests q WHERE q.actor=del.actor AND q.request_key=p_request_key FOR UPDATE;
 IF FOUND THEN
 IF r.application_id IS DISTINCT FROM p_application_id OR r.expected IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Original key conflict'; END IF;
 IF r.state<>'committed' OR r.receipt IS NULL OR r.archive IS NULL THEN RAISE EXCEPTION 'Delete key cancelled or incomplete'; END IF;
 RETURN jsonb_build_object('request_key',p_request_key,'receipt',r.receipt); END IF;
 LOCK TABLE public.aplicaciones,public.aplicaciones_calculos,public.aplicaciones_cierre,public.aplicaciones_compras,public.aplicaciones_lotes,public.aplicaciones_mezclas,public.aplicaciones_productos,
 public.contratistas,public.empleados,public.globalgap_correcciones,public.lotes,public.movimientos_diarios,public.movimientos_diarios_productos,public.movimientos_inventario,public.productos,public.registros_trabajo,public.tareas IN SHARE ROW EXCLUSIVE MODE;
 IF to_regclass('application_closure.requests') IS NOT NULL THEN EXECUTE 'LOCK TABLE application_closure.requests IN SHARE ROW EXCLUSIVE MODE'; END IF;
 -- Check again under schema-stable relation locks, before any business mutation.
 PERFORM application_plan_delete.assert_graph(); e:=application_plan_delete.snapshot(p_application_id);
 IF e IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'El plan cambió. Vuelva a revisar antes de eliminar.'; END IF;
 PERFORM application_plan_delete.eligible(e); baseline:=application_plan_delete.retained();
 SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.id),'[]') INTO audit_before FROM public.globalgap_correcciones c;
 INSERT INTO application_plan_delete.requests(actor,request_key,application_id,expected,state,archive)
 VALUES(actor,p_request_key,p_application_id,p_expected,'started',e) RETURNING * INTO r;
 IF NOT FOUND OR r.actor IS DISTINCT FROM actor OR r.request_key IS DISTINCT FROM p_request_key OR r.application_id IS DISTINCT FROM p_application_id OR r.expected IS DISTINCT FROM p_expected OR r.archive IS DISTINCT FROM e OR r.state<>'started' OR r.receipt IS NOT NULL THEN RAISE EXCEPTION 'Delete archive not confirmed'; END IF;
 -- Remove mixtures before parent; lots MUST cascade after parent disappears, preserving task context.
 FOREACH table_name IN ARRAY ARRAY['aplicaciones_productos','aplicaciones_calculos','aplicaciones_compras','aplicaciones_mezclas','aplicaciones'] LOOP
 SELECT coalesce(jsonb_agg(value->'id' ORDER BY value->>'id'),'[]') INTO expected_ids FROM jsonb_array_elements(CASE WHEN table_name='aplicaciones' THEN jsonb_build_array(e->table_name) ELSE e->table_name END);
 EXECUTE format('WITH gone AS (DELETE FROM public.%I WHERE id IN (SELECT value::text::uuid FROM jsonb_array_elements_text($1)) RETURNING id) SELECT coalesce(jsonb_agg(id ORDER BY id),''[]'') FROM gone',table_name) INTO actual_ids USING expected_ids;
 IF actual_ids IS DISTINCT FROM expected_ids THEN RAISE EXCEPTION 'Plan deletion suppressed or scope changed: %',table_name; END IF;
 deleted:=deleted||jsonb_build_object(table_name,actual_ids);
 END LOOP;
 SELECT coalesce(jsonb_agg(value->'id' ORDER BY value->>'id'),'[]') INTO expected_ids FROM jsonb_array_elements(e->'aplicaciones_lotes');
 deleted:=deleted||jsonb_build_object('aplicaciones_lotes',expected_ids);
 FOREACH table_name IN ARRAY ARRAY['aplicaciones','aplicaciones_lotes','aplicaciones_productos','aplicaciones_calculos','aplicaciones_compras','aplicaciones_mezclas'] LOOP
 EXECUTE format('SELECT to_jsonb(EXISTS(SELECT 1 FROM public.%I WHERE id IN (SELECT value::text::uuid FROM jsonb_array_elements_text($1))))',table_name) INTO row USING deleted->table_name;
 IF row::text='true' THEN RAISE EXCEPTION 'Deleted plan row remains'; END IF;
 IF table_name<>'aplicaciones_mezclas' THEN
 FOR row IN SELECT value FROM jsonb_array_elements(CASE WHEN table_name='aplicaciones' THEN jsonb_build_array(e->table_name) ELSE e->table_name END) LOOP
 IF NOT EXISTS(SELECT 1 FROM public.globalgap_correcciones c WHERE c.tabla=table_name AND c.fila_id=(row->>'id')::uuid AND c.operacion='delete'
 AND c.datos_anteriores=row AND c.datos_nuevos IS NULL AND c.corregido_por=actor AND NOT audit_before @> jsonb_build_array(to_jsonb(c))) THEN RAISE EXCEPTION 'Plan correction audit not confirmed'; END IF;
 END LOOP; END IF;
 END LOOP;
 IF application_plan_delete.retained() IS DISTINCT FROM baseline OR EXISTS(SELECT 1 FROM jsonb_array_elements(audit_before) old WHERE NOT EXISTS(SELECT 1 FROM public.globalgap_correcciones c WHERE to_jsonb(c)=old)) THEN RAISE EXCEPTION 'Retained task/work/stock/audit/proof changed'; END IF;
 result:=jsonb_build_object('actor',actor,'request_key',p_request_key,'application_id',p_application_id,'deleted',deleted,'preserved_task_id',e->'tarea'->'id');
 UPDATE application_plan_delete.requests SET state='committed',receipt=result WHERE requests.actor=del.actor AND request_key=p_request_key RETURNING * INTO r;
 IF NOT FOUND OR r.state<>'committed' OR r.actor IS DISTINCT FROM actor OR r.request_key IS DISTINCT FROM p_request_key OR r.application_id IS DISTINCT FROM p_application_id OR r.expected IS DISTINCT FROM p_expected OR r.archive IS DISTINCT FROM e OR r.receipt IS DISTINCT FROM result THEN RAISE EXCEPTION 'Plan receipt not confirmed'; END IF;
 RETURN jsonb_build_object('request_key',p_request_key,'receipt',result);
END $$;
CREATE FUNCTION public.fn_application_plan_delete_status(p_request_key uuid,p_application_id uuid,p_expected jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' AS $$
<<status>>
DECLARE actor uuid; r application_plan_delete.requests%ROWTYPE;
BEGIN
 actor:=application_plan_delete.authorize(); PERFORM application_plan_delete.assert_boundary(); PERFORM application_plan_delete.assert_graph();
 IF p_request_key IS NULL OR p_application_id IS NULL OR jsonb_typeof(p_expected) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Exact plan-delete original required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('plan-delete:'||actor::text||':'||p_request_key::text,0));
 SELECT * INTO r FROM application_plan_delete.requests q WHERE q.actor=status.actor AND q.request_key=p_request_key FOR UPDATE;
 IF FOUND THEN
 IF r.application_id IS DISTINCT FROM p_application_id OR r.expected IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Original key conflict'; END IF;
 IF r.state='committed' AND r.receipt IS NOT NULL AND r.archive IS NOT NULL THEN RETURN jsonb_build_object('state','committed','request_key',p_request_key,'receipt',r.receipt); END IF;
 IF r.state<>'cancelled' THEN RAISE EXCEPTION 'Incomplete delete outcome'; END IF;
 ELSE
 INSERT INTO application_plan_delete.requests(actor,request_key,application_id,expected,state) VALUES(actor,p_request_key,p_application_id,p_expected,'cancelled') RETURNING * INTO r;
 IF NOT FOUND OR r.actor IS DISTINCT FROM actor OR r.request_key IS DISTINCT FROM p_request_key OR r.application_id IS DISTINCT FROM p_application_id OR r.expected IS DISTINCT FROM p_expected OR r.state<>'cancelled' OR r.receipt IS NOT NULL OR r.archive IS NOT NULL THEN RAISE EXCEPTION 'Plan cancellation not confirmed'; END IF;
 END IF;
 RETURN jsonb_build_object('state','cancelled','request_key',p_request_key);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA application_plan_delete FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_application_plan_delete_snapshot(uuid),public.fn_application_plan_delete(uuid,uuid,jsonb),public.fn_application_plan_delete_status(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_application_plan_delete_snapshot(uuid),public.fn_application_plan_delete(uuid,uuid,jsonb),public.fn_application_plan_delete_status(uuid,uuid,jsonb) TO authenticated;
COMMIT;
