-- =============================================================================
-- 190 — SELECT de lotes y registros_trabajo solo para cuentas activas
-- =============================================================================
-- ESCRITA, SIN APLICAR. Decisión D28 de Santiago (2026-11-03, Esco 2.0 M3).
-- Se aplica solo con su aprobación, después del ensayo con po_sonda.
--
-- QUÉ CIERRA
-- La sonda de RLS de Esco 2.0 (docs/esco2/m3-rls.md) encontró dos políticas
-- SELECT con predicado literalmente `true`, `TO authenticated`:
--   lotes              "Usuarios autenticados pueden leer lotes"
--   registros_trabajo  "authenticated_select_registros_trabajo"
-- Las políticas PERMISSIVE se suman con OR, así que estas dos dejan leer a
-- cualquier sesión autenticada: también a una cuenta desactivada
-- (usuarios.activo = false) y a una sesión sin fila en `usuarios`. Es la misma
-- clase que cerraron la 137 (get_user_role respeta activo) y la 161 (45
-- políticas pasan por el helper), pero en SELECT, que ninguna de las dos barrió.
--
-- CÓMO
-- El predicado pasa de `true` a `(SELECT public.get_user_role()) IS NOT NULL`.
-- Desde la 137, get_user_role() devuelve NULL para una cuenta inactiva o sin
-- perfil, y el rol para cualquier cuenta activa. O sea:
--   * Gerencia, Administrador y Verificador activos: siguen leyendo igual.
--     No hace falta una lista de roles, y por eso no se puede olvidar uno.
--     (Verificador lee `lotes` SOLO por esta política: una lista de roles que
--     lo omitiera le quitaría la lectura.)
--   * Cuenta desactivada o sin perfil: deja de leer.
--   * service_role (bot de Telegram, edge functions con la llave de servicio):
--     sin cambio, tiene rolbypassrls.
--   * anon: sin cambio, la política es TO authenticated.
-- ALTER POLICY, nunca DROP + CREATE (precedente 077): es atómico y conserva
-- TO y PERMISSIVE. Predicado envuelto en (SELECT …) (precedente 093).
--
-- EXECUTE sobre get_user_role() para `authenticated` es precondición (lección
-- (a) de la 082): sin él la política daría "permission denied for function".
--
-- Filas de dominio afectadas: cero. Cuentas que pierden lectura hoy: cero
-- (padrón 2026-11-03: 10 cuentas, 10 activas, todas con perfil).
-- Ensayo: po_sonda, ver docs/esco2/m3-rls.md (sección D28).
-- ROLLBACK al pie.
-- =============================================================================

-- 0. Precondiciones ------------------------------------------------------------
DO $pre$
DECLARE
  v_qual text;
  v_roles text;
BEGIN
  SELECT qual, roles::text INTO v_qual, v_roles FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'lotes'
     AND policyname = 'Usuarios autenticados pueden leer lotes' AND cmd = 'SELECT';
  IF NOT FOUND THEN RAISE EXCEPTION '190: falta la política SELECT de lotes'; END IF;
  IF btrim(v_qual) <> 'true' OR v_roles <> '{authenticated}' THEN
    RAISE EXCEPTION '190: la política SELECT de lotes cambió (qual %, roles %). Revisa antes de aplicar.', v_qual, v_roles;
  END IF;

  SELECT qual, roles::text INTO v_qual, v_roles FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'registros_trabajo'
     AND policyname = 'authenticated_select_registros_trabajo' AND cmd = 'SELECT';
  IF NOT FOUND THEN RAISE EXCEPTION '190: falta la política SELECT de registros_trabajo'; END IF;
  IF btrim(v_qual) <> 'true' OR v_roles <> '{authenticated}' THEN
    RAISE EXCEPTION '190: la política SELECT de registros_trabajo cambió (qual %, roles %). Revisa antes de aplicar.', v_qual, v_roles;
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.get_user_role()', 'EXECUTE') THEN
    RAISE EXCEPTION '190: authenticated no tiene EXECUTE sobre get_user_role(); la política daría permission denied.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM usuarios WHERE activo AND rol IN ('Gerencia', 'Administrador')) THEN
    RAISE EXCEPTION '190: no hay cuentas Gerencia/Administrador activas.';
  END IF;

  -- Informativo, nunca bloquea (precedente 120/133): el día que exista una
  -- cuenta inactiva es justo el día en que esta migración hace falta.
  IF EXISTS (SELECT 1 FROM usuarios WHERE NOT activo) THEN
    RAISE WARNING '190: hay cuentas inactivas; dejarán de leer lotes y registros_trabajo.';
  END IF;
END
$pre$;

-- 1. Cambio --------------------------------------------------------------------
ALTER POLICY "Usuarios autenticados pueden leer lotes" ON public.lotes
  USING ((SELECT public.get_user_role()) IS NOT NULL);

ALTER POLICY "authenticated_select_registros_trabajo" ON public.registros_trabajo
  USING ((SELECT public.get_user_role()) IS NOT NULL);

-- 2. Postcondiciones -----------------------------------------------------------
DO $post$
DECLARE
  v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename IN ('lotes', 'registros_trabajo')
     AND cmd IN ('SELECT', 'ALL') AND btrim(coalesce(qual, 'true')) = 'true';
  IF v_n <> 0 THEN
    RAISE EXCEPTION '190: quedan % políticas SELECT/ALL con predicado true en lotes/registros_trabajo', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public'
     AND ((tablename = 'lotes' AND policyname = 'Usuarios autenticados pueden leer lotes')
       OR (tablename = 'registros_trabajo' AND policyname = 'authenticated_select_registros_trabajo'))
     AND roles::text = '{authenticated}' AND permissive = 'PERMISSIVE'
     AND qual ILIKE '%get_user_role()%IS NOT NULL%';
  IF v_n <> 2 THEN
    RAISE EXCEPTION '190: las dos políticas no quedaron con el predicado nuevo (encontradas %)', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename IN ('lotes', 'registros_trabajo');
  IF v_n <> 12 THEN
    RAISE EXCEPTION '190: el número de políticas cambió (esperadas 12, hay %)', v_n;
  END IF;
END
$post$;

-- =============================================================================
-- ROLLBACK (no ejecutar salvo decisión explícita)
-- ALTER POLICY "Usuarios autenticados pueden leer lotes" ON public.lotes USING (true);
-- ALTER POLICY "authenticated_select_registros_trabajo" ON public.registros_trabajo USING (true);
-- =============================================================================
