-- NONNUMBERED REVIEW CANDIDATE. Never applied by this file's synthetic harness to production.
-- AND-only additions: existing permissive roles, owners and object readers remain authoritative.
BEGIN;
DO $preflight$
DECLARE
  role_helper record;
  target text;
  bucket text;
BEGIN
  SELECT p.prosecdef, p.proconfig, p.prosrc, p.proowner INTO role_helper
  FROM pg_proc p WHERE p.oid = to_regprocedure('public.get_user_role()');
  IF NOT FOUND OR NOT role_helper.prosecdef
     OR NOT ('search_path=public, pg_temp' = ANY(coalesce(role_helper.proconfig, ARRAY[]::text[])))
     OR lower(btrim(regexp_replace(role_helper.prosrc, '\s+', ' ', 'g')))
        <> 'select rol from usuarios where id = auth.uid() and activo = true' THEN
    RAISE EXCEPTION 'Candidate prerequisite failed: captured active-account get_user_role helper changed or missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles owner_role, pg_class profile_table
    WHERE owner_role.oid=role_helper.proowner AND profile_table.oid=to_regclass('public.usuarios')
      AND (owner_role.rolsuper OR owner_role.rolbypassrls
           OR (profile_table.relowner=role_helper.proowner AND NOT profile_table.relforcerowsecurity))
  ) THEN
    RAISE EXCEPTION 'Candidate prerequisite failed: trusted helper owner cannot bypass profile RLS safely';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_user_role()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Candidate prerequisite failed: authenticated helper execute unavailable';
  END IF;
  FOREACH target IN ARRAY ARRAY['public.chat_conversations','public.chat_messages','public.esco_memorias',
    'public.productos','public.compras','public.fin_gastos','public.monitoreos','storage.objects'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=to_regclass(target) AND relrowsecurity) THEN
      RAISE EXCEPTION 'Candidate prerequisite failed: % missing or RLS disabled', target;
    END IF;
  END LOOP;
  -- Policy predicates were captured; bucket row existence is deliberately rechecked at application.
  FOREACH bucket IN ARRAY ARRAY['facturas','reportes-semanales','chequeos-fotos',
    'hato-liquidaciones-fotos','hato-pesajes-fotos','informes-visita'] LOOP
    IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id=bucket) THEN
      RAISE EXCEPTION 'Candidate prerequisite failed: captured bucket % missing', bucket;
    END IF;
  END LOOP;
END;
$preflight$;

CREATE POLICY active_account_required ON public.chat_conversations AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.get_user_role()) IS NOT NULL) WITH CHECK ((SELECT public.get_user_role()) IS NOT NULL);
CREATE POLICY active_account_required ON public.chat_messages AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.get_user_role()) IS NOT NULL) WITH CHECK ((SELECT public.get_user_role()) IS NOT NULL);
CREATE POLICY active_account_required ON public.esco_memorias AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.get_user_role()) IS NOT NULL) WITH CHECK ((SELECT public.get_user_role()) IS NOT NULL);
CREATE POLICY active_account_required ON public.productos AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.get_user_role()) IS NOT NULL) WITH CHECK ((SELECT public.get_user_role()) IS NOT NULL);
CREATE POLICY active_account_required ON public.compras AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.get_user_role()) IS NOT NULL) WITH CHECK ((SELECT public.get_user_role()) IS NOT NULL);
CREATE POLICY active_account_required ON public.fin_gastos AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.get_user_role()) IS NOT NULL) WITH CHECK ((SELECT public.get_user_role()) IS NOT NULL);
CREATE POLICY active_account_required ON public.monitoreos AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.get_user_role()) IS NOT NULL) WITH CHECK ((SELECT public.get_user_role()) IS NOT NULL);

-- Unknown buckets keep their existing rules. This restrictive expression grants no permission.
CREATE POLICY active_account_required_known_buckets ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
  USING (bucket_id NOT IN ('facturas','reportes-semanales','chequeos-fotos',
    'hato-liquidaciones-fotos','hato-pesajes-fotos','informes-visita') OR (SELECT public.get_user_role()) IS NOT NULL)
  WITH CHECK (bucket_id NOT IN ('facturas','reportes-semanales','chequeos-fotos',
    'hato-liquidaciones-fotos','hato-pesajes-fotos','informes-visita') OR (SELECT public.get_user_role()) IS NOT NULL);
COMMIT;
