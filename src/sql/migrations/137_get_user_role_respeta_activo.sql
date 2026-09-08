-- =============================================================================
-- 137_get_user_role_respeta_activo.sql
--
-- Issue #201 / Notion ESCO-81 (P1). Cierra la asimetría documentada en la
-- nota (d) de la 093 y repetida como grieta conocida en 110/114/120/123/133:
-- `es_usuario_gerencia()` exige `usuarios.activo = true`; `get_user_role()`
-- NO. El interruptor «Usuario activo» de Configuración escribía
-- `usuarios.activo = false` y Finanzas se cerraba, pero el resto de la app
-- no: ~125 políticas RLS llaman a `get_user_role()` (ALL 37 / DELETE 21 /
-- INSERT 33 / UPDATE 23 / SELECT 11 = 114 de escritura sobre 46 tablas).
-- Además `usuarios` está gateada por `get_user_role() = 'Gerencia'`, así que
-- una Gerencia desactivada podía reactivarse a sí misma.
--
-- CREATE OR REPLACE only. Nunca se editan 073 ni 093 (ya aplicadas).
--
-- NO APLICAR DESDE ESTE AGENTE. Este archivo se abre en PR; lo aplica
-- Santiago. Filas afectadas: 0. Cuentas que pierden capacidad hoy: 0
-- (padrón 2026-09-08: 10 usuarios, 0 inactivos). La guarda previa aborta
-- si ese conteo no es cero, para no echar a nadie en el mismo instante.
--
-- Comportamiento nuevo: usuario con `activo = false` → la función no
-- encuentra fila → devuelve NULL. Las comparaciones `=` / `IN` de las
-- políticas fallan cerrado (igual que `auth.uid()` nulo).
-- `fn_cleanup_compra_dependencies` (082) ya hace RAISE 42501 sobre NULL.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- PRE: abortar si hay cuentas inactivas, o si la función no existe, o si
--      el filtro `activo = true` ya está en el cuerpo (ya aplicada).
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_inactivos integer;
BEGIN
  IF to_regprocedure('public.get_user_role()') IS NULL THEN
    RAISE EXCEPTION '137 ABORTADA (pre): public.get_user_role() no existe.';
  END IF;

  SELECT count(*) INTO v_inactivos
    FROM public.usuarios
   WHERE activo = false;

  IF v_inactivos <> 0 THEN
    RAISE EXCEPTION '137 ABORTADA (pre): hay % usuario(s) con activo = false. Esta migracion cambia get_user_role() para devolver NULL en esas cuentas y cierra ~125 politicas RLS de un golpe. Aplicarla con cuentas inactivas las echaria de esas politicas en el mismo instante. Esperar a 0 inactivos (ventana medida 2026-09-08) o reactivarlas antes.', v_inactivos;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'get_user_role'
       AND pg_get_functiondef(p.oid) ILIKE '%activo = true%'
  ) THEN
    RAISE EXCEPTION '137 ABORTADA (pre): get_user_role() YA filtra por activo = true -- la causa mas probable es que esta migracion ya se aplico. Revisar a mano antes de reintentar.';
  END IF;

  RAISE NOTICE '137 PRE OK: get_user_role() existe, 0 usuarios inactivos, el cuerpo todavia no filtra por activo.';
END $$;


CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS rol_usuario
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT rol FROM usuarios WHERE id = auth.uid() AND activo = true
$$;


COMMENT ON FUNCTION public.get_user_role() IS
  'Devuelve el rol del usuario autenticado solo si usuarios.activo = true; '
  'si no, NULL (fail-closed). SECURITY DEFINER. search_path = public, pg_temp. '
  'EXECUTE para anon y authenticated es permanente: las politicas RLS que la '
  'llaman lo exigen (082). Cuerpo alineado con es_usuario_gerencia() por la '
  '137 (ESCO-81 / issue #201); 073 solo pino el search_path y no se edita.';


-- ---------------------------------------------------------------------------
-- POST: el cuerpo filtra activo, sigue SECURITY DEFINER, search_path queda
--       public, pg_temp, y EXECUTE sigue otorgado a anon y authenticated
--       (precedente 082: revocar cualquiera tumba las politicas que la llaman).
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_def     TEXT;
  v_secdef  BOOLEAN;
  v_searchp TEXT[];
  v_anon    BOOLEAN;
  v_auth    BOOLEAN;
BEGIN
  SELECT pg_get_functiondef(p.oid), p.prosecdef, p.proconfig
    INTO v_def, v_secdef, v_searchp
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_user_role';

  IF v_def IS NULL THEN
    RAISE EXCEPTION '137 ABORTADA (post): get_user_role() desaparecio.';
  END IF;

  IF v_def NOT ILIKE '%activo = true%' THEN
    RAISE EXCEPTION '137 ABORTADA (post): el cuerpo no filtra por activo = true.';
  END IF;

  IF v_secdef IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION '137 ABORTADA (post): get_user_role() dejo de ser SECURITY DEFINER (prosecdef=true).';
  END IF;

  -- CREATE OR REPLACE con SET search_path TO 'public', 'pg_temp' debe dejar
  -- exactamente este elemento en proconfig. pg_get_functiondef omite detalles
  -- de ACL; prosecdef/proconfig son las columnas que hay que mirar (130).
  IF NOT ('search_path=public, pg_temp' = ANY(COALESCE(v_searchp, ARRAY[]::TEXT[]))) THEN
    RAISE EXCEPTION '137 ABORTADA (post): search_path no quedo en public, pg_temp. proconfig actual: %', v_searchp;
  END IF;

  SELECT has_function_privilege('anon',          'public.get_user_role()', 'EXECUTE'),
         has_function_privilege('authenticated', 'public.get_user_role()', 'EXECUTE')
    INTO v_anon, v_auth;

  IF NOT v_anon THEN
    RAISE EXCEPTION '137 ABORTADA (post): anon perdio EXECUTE sobre get_user_role(); las politicas TO public que la llaman se caen (precedente 082).';
  END IF;
  IF NOT v_auth THEN
    RAISE EXCEPTION '137 ABORTADA (post): authenticated perdio EXECUTE sobre get_user_role(); eso rompe las politicas RLS que la llaman (precedente 082).';
  END IF;

  RAISE NOTICE '137 OK: get_user_role() filtra activo = true, SECURITY DEFINER, search_path=public, pg_temp, EXECUTE intacto para anon y authenticated.';
END $$;


-- =============================================================================
-- ROLLBACK (no ejecutar salvo instruccion explicita del dueno)
-- =============================================================================
-- Restaurar el cuerpo previo, SIN el filtro de activo:
--
--   CREATE OR REPLACE FUNCTION public.get_user_role()
--   RETURNS rol_usuario
--   LANGUAGE sql
--   SECURITY DEFINER
--   SET search_path TO 'public', 'pg_temp'
--   AS $$
--     SELECT rol FROM usuarios WHERE id = auth.uid()
--   $$;
--
-- Revertir reabre la grieta de la nota (d) de la 093. Filas: 0.
-- =============================================================================
