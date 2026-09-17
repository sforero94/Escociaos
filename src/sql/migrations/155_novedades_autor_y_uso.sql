-- =====================================================================
-- 155: novedades_autor_y_uso -- fundación de "Novedades" (issue #266),
-- el bloque que reemplaza "Acciones recomendadas" en el Tablero General.
-- Fecha: 2026-09-17.
--
-- Brief de producto: docs/plan_novedades.md (CPO, 2026-09-16).
-- Plan técnico:       docs/plan_novedades_implementacion.md (CTO, 2026-09-16).
-- Decisiones del dueño (issue #266, 2026-09-16): D-1(a) sesión de captura,
-- D-2(a) 7 días, D-3(a) retiro en el mismo release, D-4(a) sin
-- correcciones, D-5(a) sin Telegram por ahora.
--
-- QUÉ TRAE, aditiva pura, cero filas afectadas:
--   1. Tabla `novedades_uso` -- instrumentación M-4 (expansión de "ver las
--      N restantes") / M-5 (navegación desde una línea). El bloque que se
--      retira murió sin poder evaluarse porque nadie registró los clics
--      (§9 del brief); esto no se repite.
--   2. Función `fn_novedades_autores(uuid[])`, `SECURITY DEFINER`, porque
--      la política SELECT de `usuarios` (migración 093, verificada contra
--      producción el 2026-09-17) es
--        USING ((id = (SELECT auth.uid())) OR ((SELECT get_user_role()) = 'Gerencia'::rol_usuario))
--      -- un Administrador (David, Fernando, Uriel, Santiago Admin) sólo
--      lee su propia fila. Sin este RPC, el feed de Novedades les
--      mostraría "sin autor registrado" en cada línea que no sea suya:
--      eso no es el hueco honesto que el brief bendice para un dato
--      genuinamente sin capturador (§4.3 del brief) sino una ceguera del
--      lector, porque el autor SÍ existe y está guardado.
--
-- LO QUE ESTA FUNCIÓN DELIBERADAMENTE NO ES (§3 del plan técnico): no lee
-- ninguna tabla de dominio, no decide visibilidad de módulo (eso lo hace
-- `puedeAccederModulo` en TypeScript, nunca reimplementado en SQL), y
-- nunca devuelve `rol`, `activo` ni `modulos_acceso` -- exactamente las
-- columnas con las que se arma una escalada de privilegios (precedente
-- 073). Devuelve DOS columnas, `id` y `nombre` -- no tres. La versión con
-- `correo` de respaldo que describe el §3 del plan técnico se descartó
-- tras verificar contra producción el 2026-09-16 que las 10 cuentas de
-- `usuarios` tienen `nombre_completo` poblado (0 filas NULL o vacías):
-- el respaldo por correo nunca se ejercería hoy, y resolverlo DENTRO de
-- la función (en vez de devolver el correo crudo hacia el navegador de
-- cualquier Administrador) es estrictamente más seguro sin costar nada.
--
-- Guarda contra su propio llamante (regla 082 -- "una función SECURITY
-- DEFINER tiene que comprobar a quién sirve, porque la RLS por
-- definición ya no la protege"): `RAISE EXCEPTION 42501` si
-- `get_user_role()` es NULL. Desde la 137 esa función ya filtra
-- `activo = true`, así que una cuenta desactivada falla cerrada sin una
-- línea más. Tope de entrada de 100 ids -- una ventana de 7 días no tiene
-- ni una decena de autores distintos; más que eso es un uso indebido y se
-- convierte en un error ruidoso, no en un truncado silencioso.
--
-- `novedades_uso`: patrón 116/146 (registro de sucesos append-only, no el
-- patrón 044). Sin texto libre, sin `jsonb`: sólo escribe el feed en toda
-- su vida (§9 del plan técnico), y una columna de más invita a usarla
-- para otra cosa -- riesgo R9 del plan ("la telemetría se convierte en
-- bitácora de auditoría por acumulación de columnas"). `INSERT` para
-- `authenticated` con `WITH CHECK (usuario_id = (SELECT auth.uid()))` --
-- impide registrar uso ajeno. `SELECT` Gerencia-only vía
-- `es_usuario_gerencia()`, porque es telemetría sobre personas con
-- nombre. Sin política de `UPDATE` ni `DELETE`, ni para Gerencia: es un
-- registro de sucesos, no un estado editable.
--
-- Trampa 081: Supabase concede ALL a anon/authenticated por defecto en
-- tablas nuevas de `public` (ALTER DEFAULT PRIVILEGES). Los REVOKE de
-- abajo son carga útil, no decoración.
--
-- VERIFICACIÓN DEL NÚMERO contra las fuentes que manda el runbook, el
-- 2026-09-17: ficheros del repo (el mayor en origin/main es 154);
-- `supabase_migrations.schema_migrations` en vivo (el nombre más alto es
-- `147_fn_ronda_resolver_con_captura_cantidad_confirmada`, 2026-09-16);
-- TODAS las ramas de `origin` (`git ls-tree` sobre `src/sql/migrations/`
-- en cada ref): ningún `155_*` ni `156_*` en ninguna.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Preconciones
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'usuarios'
       AND column_name = 'email' AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION '155 ABORTADA (pre): usuarios.email no existe como columna NOT NULL.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'usuarios'
       AND column_name = 'nombre_completo'
  ) THEN
    RAISE EXCEPTION '155 ABORTADA (pre): usuarios.nombre_completo no existe.';
  END IF;

  IF to_regprocedure('public.get_user_role()') IS NULL THEN
    RAISE EXCEPTION '155 ABORTADA (pre): get_user_role() no existe -- depende de migraciones previas (073/093/137).';
  END IF;

  IF to_regprocedure('public.es_usuario_gerencia()') IS NULL THEN
    RAISE EXCEPTION '155 ABORTADA (pre): es_usuario_gerencia() no existe.';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1. novedades_uso
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS novedades_uso (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- M-4 = expansión de "ver las N restantes"; M-5 = navegación desde una
  -- línea. Sin tercer valor "por si acaso".
  tipo           TEXT NOT NULL CHECK (tipo IN ('expansion', 'navegacion')),
  -- La fuente de la línea (p.ej. 'hato_eventos') para M-5; NULL para M-4,
  -- que no tiene una línea concreta que atribuir.
  fuente_novedad TEXT,
  usuario_id     UUID NOT NULL DEFAULT auth.uid(),
  ocurrido_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT novedades_uso_fuente_coherente CHECK (
    (tipo = 'expansion'  AND fuente_novedad IS NULL)
    OR
    (tipo = 'navegacion' AND fuente_novedad IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_novedades_uso_ocurrido
  ON novedades_uso (ocurrido_at DESC);

COMMENT ON TABLE novedades_uso IS
  'Migración 155. Una fila por evento de uso del bloque Novedades (issue #266): expansion (M-4) o navegacion (M-5). Sin texto libre ni jsonb -- sólo escribe el feed en toda su vida. Instrumentación desde el día uno, a diferencia del motor de Acciones recomendadas que murió sin poder evaluarse.';

-- ---------------------------------------------------------------------
-- RLS -- novedades_uso
-- ---------------------------------------------------------------------
ALTER TABLE novedades_uso ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "novedades_uso_insert_propio" ON novedades_uso;
CREATE POLICY "novedades_uso_insert_propio" ON novedades_uso
  FOR INSERT TO authenticated
  WITH CHECK (usuario_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "novedades_uso_select_gerencia" ON novedades_uso;
CREATE POLICY "novedades_uso_select_gerencia" ON novedades_uso
  FOR SELECT TO authenticated
  USING ((SELECT public.es_usuario_gerencia()));

REVOKE ALL ON TABLE novedades_uso FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE novedades_uso FROM authenticated;

-- ---------------------------------------------------------------------
-- 2. fn_novedades_autores -- el único puente autorizado a través del
-- muro de RLS de usuarios (§3 del plan técnico).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_novedades_autores(p_ids UUID[])
RETURNS TABLE (id UUID, nombre TEXT)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF (SELECT public.get_user_role()) IS NULL THEN
    RAISE EXCEPTION 'fn_novedades_autores: llamante sin rol resoluble (sesión sin JWT o cuenta desactivada).' USING ERRCODE = '42501';
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  IF array_length(p_ids, 1) > 100 THEN
    RAISE EXCEPTION 'fn_novedades_autores: % ids solicitados, tope 100 -- una ventana de 7 días no tiene esa cantidad de autores distintos.', array_length(p_ids, 1);
  END IF;

  RETURN QUERY
    SELECT u.id, COALESCE(NULLIF(btrim(u.nombre_completo), ''), u.email) AS nombre
    FROM public.usuarios u
    WHERE u.id = ANY(p_ids);
END;
$$;

COMMENT ON FUNCTION public.fn_novedades_autores(UUID[]) IS
  'Migración 155. Resuelve nombre para mostrar de hasta 100 ids de usuario, saltando el muro de RLS de usuarios (093: un Administrador sólo lee su propia fila). Nunca devuelve rol, activo ni modulos_acceso. Un id ausente en usuarios no produce fila -- el llamante lo mapea a "sin autor registrado", nunca se fabrica un nombre. Comprueba a su propio llamante (082): 42501 si get_user_role() es NULL.';

REVOKE EXECUTE ON FUNCTION public.fn_novedades_autores(UUID[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_novedades_autores(UUID[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_novedades_autores(UUID[]) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- Postcondiciones
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_politicas INTEGER;
  v_funciones INTEGER;
  v_correctas INTEGER;
BEGIN
  IF to_regclass('public.novedades_uso') IS NULL THEN
    RAISE EXCEPTION '155 ABORTADA (post): novedades_uso no existe.';
  END IF;

  SELECT count(*) INTO v_politicas
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relname = 'novedades_uso';
  IF v_politicas <> 2 THEN
    RAISE EXCEPTION '155 ABORTADA (post): se esperaban 2 políticas sobre novedades_uso (insert propio, select gerencia), hay %.', v_politicas;
  END IF;

  IF has_table_privilege('anon', 'novedades_uso', 'SELECT')
     OR has_table_privilege('anon', 'novedades_uso', 'INSERT')
     OR has_table_privilege('anon', 'novedades_uso', 'UPDATE')
     OR has_table_privilege('anon', 'novedades_uso', 'DELETE') THEN
    RAISE EXCEPTION '155 ABORTADA (post): anon no debería tener ningún privilegio sobre novedades_uso.';
  END IF;

  IF has_table_privilege('authenticated', 'novedades_uso', 'UPDATE')
     OR has_table_privilege('authenticated', 'novedades_uso', 'DELETE') THEN
    RAISE EXCEPTION '155 ABORTADA (post): authenticated no debería poder UPDATE/DELETE novedades_uso -- es un registro de sucesos append-only.';
  END IF;

  IF NOT has_table_privilege('authenticated', 'novedades_uso', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'novedades_uso', 'SELECT') THEN
    RAISE EXCEPTION '155 ABORTADA (post): authenticated necesita INSERT (dispara y olvida su propio uso) y SELECT (acotado por RLS a Gerencia).';
  END IF;

  IF to_regprocedure('public.fn_novedades_autores(uuid[])') IS NULL THEN
    RAISE EXCEPTION '155 ABORTADA (post): fn_novedades_autores(uuid[]) no existe.';
  END IF;

  SELECT count(*) INTO v_funciones
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_novedades_autores';
  IF v_funciones <> 1 THEN
    RAISE EXCEPTION '155 ABORTADA (post): se esperaba exactamente 1 función fn_novedades_autores (sin sobrecargas), hay %.', v_funciones;
  END IF;

  SELECT count(*) INTO v_correctas
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
   WHERE n.nspname = 'public'
     AND p.proname = 'fn_novedades_autores'
     AND p.prosecdef IS TRUE
     AND p.provolatile = 's'
     AND l.lanname = 'plpgsql'
     AND 'search_path=public, pg_temp' = ANY(COALESCE(p.proconfig, ARRAY[]::TEXT[]))
     AND p.proacl::TEXT LIKE '%authenticated=X%'
     AND p.proacl::TEXT LIKE '%service_role=X%'
     AND p.proacl::TEXT NOT LIKE '%anon%';
  IF v_correctas <> 1 THEN
    RAISE EXCEPTION '155 ABORTADA (post): fn_novedades_autores no quedó SECURITY DEFINER STABLE plpgsql con search_path pineado y ACL exacto (authenticated + service_role, sin anon).';
  END IF;

  -- La función nunca puede LEER rol/activo/modulos_acceso de usuarios: si
  -- algún día alguien "la mejora" añadiendo una columna, esta guarda lo
  -- detiene. Ojo con la forma del patrón: debe casar el acceso calificado
  -- (`u.rol`) y no cualquier aparición de la palabra "rol" en prosa -- el
  -- propio mensaje de error de esta función dice "sin rol resoluble", que
  -- una guarda por palabra suelta detecta como falso positivo.
  IF (SELECT prosrc FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'fn_novedades_autores')
       ~* '\yu\.(rol|activo|modulos_acceso)\y' THEN
    RAISE EXCEPTION '155 ABORTADA (post): fn_novedades_autores no debe leer rol, activo ni modulos_acceso de usuarios -- esas son exactamente las columnas de una escalada de privilegios (precedente 073).';
  END IF;

  RAISE NOTICE '155 OK: novedades_uso creada (RLS, 2 políticas, anon sin privilegios, authenticated sin UPDATE/DELETE); fn_novedades_autores creada (SECURITY DEFINER, guardada contra su propio llamante, sin rol/activo/modulos_acceso).';
END $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (ejecutable, si hubiera que revertir; nada que preservar --
-- migración aditiva, ninguna fila de dominio existente se tocó):
--
--   DROP FUNCTION IF EXISTS public.fn_novedades_autores(UUID[]);
--   DROP TABLE IF EXISTS novedades_uso;
-- ---------------------------------------------------------------------------
