-- =============================================================================
-- 082_endurecer_funciones_y_grants.sql
--
-- Cierra los hallazgos WARN/INFO que quedaron abiertos despues de 081 (el
-- ERROR critico `rls_disabled_in_public`). Aprobado por Santiago 2026-08-04.
--
-- Todo lo de aqui se verifico contra produccion con pruebas desechables antes
-- de escribirlo. Dos resultados mandan sobre el diseno de esta migracion:
--
--   1. Una politica RLS que llama a una funcion SI exige EXECUTE al rol que
--      consulta. Probado: revocar EXECUTE y consultar como `authenticated` da
--      `permission denied for function`. Por eso `es_usuario_gerencia()` y
--      `get_user_role()` NO se tocan -- ver PARTE 5.
--
--   2. Un trigger SI dispara aunque el rol no tenga EXECUTE sobre la funcion
--      del trigger. Postgres verifica EXECUTE al hacer CREATE TRIGGER, no al
--      dispararlo. Probado insertando como `authenticated` con EXECUTE
--      revocado: la fila salio marcada por el trigger. Por eso la PARTE 2 es
--      segura y no cambia comportamiento.
--
-- Filas de datos afectadas: 0. Todo son privilegios, `search_path` y una
-- guarda de autorizacion.
--
-- Correr el archivo COMPLETO de una sola vez, para que sea una transaccion.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PARTE 1 -- `fn_cleanup_compra_dependencies`: DELETE sin autenticar sobre
--            `fin_gastos`.
--
-- Estado encontrado: SECURITY DEFINER, sin ninguna verificacion de quien llama,
-- y con EXECUTE para `anon`. El cuerpo entero era:
--
--     DELETE FROM fin_gastos WHERE compra_id = p_compra_id;
--
-- O sea: cualquiera con la llave `anon` del bundle podia pegarle a
-- /rest/v1/rpc/fn_cleanup_compra_dependencies con un uuid y borrar gastos,
-- saltandose la RLS Gerencia-only de `fin_gastos` -- que es justamente lo que
-- el SECURITY DEFINER esta ahi para saltarse.
--
-- Hoy es LATENTE, no explotable: `fin_gastos.compra_id` esta poblado en 0 de
-- 4.438 filas (la migracion 079 elimino el trigger compra -> gasto que lo
-- llenaba), asi que el DELETE no encuentra nada. Se arma solo el dia que
-- alguien vuelva a poblar esa columna, y los ids de `compras` son legibles por
-- cualquier usuario autenticado.
--
-- La funcion se conserva -- `PurchaseHistory.tsx:354` la llama de verdad para
-- borrar una compra -- pero pasa a verificar su propio llamante. Una funcion
-- SECURITY DEFINER tiene que hacer esa verificacion adentro: por definicion la
-- RLS ya no la esta protegiendo.
--
-- La guarda replica exactamente la RLS de `compras` (unicas dos politicas
-- DELETE que existen sobre esa tabla):
--     "Administrador puede todo en compras" -> get_user_role() = 'Administrador'
--     "Gerencia acceso total"               -> get_user_role() = 'Gerencia'
-- de modo que quien puede borrar la compra puede limpiar sus gastos, y nadie mas.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_cleanup_compra_dependencies(p_compra_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rol public.rol_usuario;
BEGIN
  -- `auth.uid()` sigue leyendo el JWT de la sesion dentro de un SECURITY
  -- DEFINER (es un current_setting, no depende del rol efectivo), asi que
  -- `get_user_role()` responde por el usuario real que llamo.
  v_rol := public.get_user_role();

  IF v_rol IS NULL
     OR v_rol NOT IN ('Administrador'::public.rol_usuario,
                      'Gerencia'::public.rol_usuario) THEN
    RAISE EXCEPTION 'No autorizado: solo Administrador o Gerencia pueden limpiar las dependencias de una compra.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.fin_gastos WHERE compra_id = p_compra_id;
END;
$function$;

-- `anon` no tiene por que poder invocarla nunca. `authenticated` la conserva
-- porque el navegador la llama; la guarda de adentro decide si procede.
REVOKE ALL ON FUNCTION public.fn_cleanup_compra_dependencies(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cleanup_compra_dependencies(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_cleanup_compra_dependencies(uuid) IS
  'Borra los `fin_gastos` colgados de una compra. SECURITY DEFINER a proposito '
  '(la RLS de fin_gastos es Gerencia-only y el Administrador tambien debe poder '
  'borrar su compra), por lo que verifica su propio llamante contra la misma '
  'regla que la RLS de `compras`: Administrador o Gerencia. Migracion 039 la '
  'creo; la 082 le agrego la guarda y le quito EXECUTE a `anon`.';


-- -----------------------------------------------------------------------------
-- PARTE 2 -- Quitar EXECUTE a las funciones de TRIGGER.
--
-- Una funcion de trigger no tiene por que ser invocable como RPC: no se puede
-- llamar utilmente (necesita un contexto de trigger) y estar publicada solo
-- suma superficie. Postgres le da EXECUTE a PUBLIC por omision a toda funcion,
-- y de ahi lo heredan `anon` y `authenticated`.
--
-- Como quedo probado arriba, revocar NO afecta el disparo de los triggers. El
-- dueno (`postgres`) conserva EXECUTE siempre, asi que un CREATE TRIGGER futuro
-- en otra migracion sigue funcionando.
--
-- Se hace en bucle sobre el catalogo en vez de listar 31 nombres a mano: el
-- selector es la propiedad que importa (`prorettype = trigger`), asi que
-- tambien cubre las funciones de trigger que se agreguen despues si esta
-- migracion se vuelve a correr. Se excluyen las funciones que pertenezcan a una
-- extension (hoy: ninguna), que no son nuestras para modificar.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  r          record;
  v_contador integer := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS firma
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prorettype = 'trigger'::regtype
       AND NOT EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.objid = p.oid AND d.deptype = 'e')
       AND (has_function_privilege('anon',          p.oid, 'EXECUTE')
         OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.firma);
    v_contador := v_contador + 1;
  END LOOP;

  RAISE NOTICE '082 PARTE 2: EXECUTE revocado en % funcion(es) de trigger.', v_contador;
END $$;


-- -----------------------------------------------------------------------------
-- PARTE 3 -- Fijar `search_path` en las funciones que no lo tienen.
--
-- Contexto honesto sobre la severidad: esto es higiene, no un agujero. Las 31
-- funciones que el linter marca son TODAS SECURITY INVOKER (las 9 SECURITY
-- DEFINER ya venian fijadas por 065/073), o sea que corren con los permisos de
-- quien llama y no otorgan nada. Y ni `anon` ni `authenticated` tienen CREATE
-- sobre el esquema `public` (verificado), asi que no hay donde plantar un
-- objeto que le haga sombra a uno de `public`.
--
-- Se fija igual porque cuesta nada y elimina la dependencia de esas dos
-- condiciones: si alguna vez se otorga CREATE, o si una de estas funciones pasa
-- a SECURITY DEFINER, el problema aparece sin que nadie lo note.
--
-- `pg_temp` va al FINAL a proposito. Si no se menciona, Postgres busca el
-- esquema temporal PRIMERO para nombres de tablas, que es exactamente el vector
-- de sombra que se quiere cerrar. Ninguna de estas funciones referencia objetos
-- del esquema `extensions` (verificado), asi que `public, pg_temp` alcanza.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  r          record;
  v_contador integer := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS firma
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proconfig IS NULL
       AND NOT EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.firma);
    v_contador := v_contador + 1;
  END LOOP;

  RAISE NOTICE '082 PARTE 3: `search_path` fijado en % funcion(es).', v_contador;
END $$;

-- Normalizacion de las que YA estaban fijadas pero como `search_path=public`
-- solamente (8 funciones, entre ellas las SECURITY DEFINER de 039/044/065). Sin
-- `pg_temp` explicito el esquema temporal queda implicitamente PRIMERO para
-- nombres de relacion -- justo donde mas importa, porque estas si corren con los
-- privilegios del dueno. El linter no las marca; se corrigen por lo mismo.
DO $$
DECLARE
  r          record;
  v_contador integer := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS firma
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proconfig IS NOT NULL
       AND array_to_string(p.proconfig, ',') IN ('search_path=public', 'search_path="public"')
       AND NOT EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.firma);
    v_contador := v_contador + 1;
  END LOOP;

  RAISE NOTICE '082 PARTE 3b: `pg_temp` agregado en % funcion(es) ya fijadas.', v_contador;
END $$;


-- -----------------------------------------------------------------------------
-- PARTE 4 -- Quitar los grants sobrantes en las tablas de solo-edge-function.
--
-- `kv_store_1ccce916` y las tres `telegram_*` tienen RLS habilitada y CERO
-- politicas, o sea deny-all para todo rol sujeto a RLS. Eso ya es correcto y es
-- el estado final buscado (el INFO `rls_enabled_no_policy` del linter sobre
-- ellas no se va a ir, ni debe: para una tabla que ningun rol del navegador
-- debe tocar, deny-all ES la politica).
--
-- Lo que sobra son los 56 grants a `anon`/`authenticated` que Supabase les puso
-- por omision al crearlas en `public`. Hoy no sirven de nada porque la RLS los
-- anula, pero dejan toda la proteccion colgando de un solo hilo: el dia que
-- alguien agregue una politica permisiva sin pensarlo, los grants ya estan.
--
-- Las cuatro tablas se usan UNICAMENTE desde `src/supabase/functions/` con el
-- service_role (verificado con grep: cero call sites en el navegador), y
-- `service_role` conserva sus grants intactos.
-- -----------------------------------------------------------------------------

REVOKE ALL ON TABLE public.kv_store_1ccce916      FROM anon, authenticated;
REVOKE ALL ON TABLE public.telegram_sessions      FROM anon, authenticated;
REVOKE ALL ON TABLE public.telegram_mensajes      FROM anon, authenticated;
REVOKE ALL ON TABLE public.telegram_conversations FROM anon, authenticated;


-- -----------------------------------------------------------------------------
-- PARTE 5 -- Lo que NO se toca, y por que (para que nadie lo "arregle" despues).
--
-- `es_usuario_gerencia()` y `get_user_role()` siguen con EXECUTE para `anon` y
-- `authenticated`, y el linter los va a seguir reportando como
-- `anon_security_definer_function_executable`. Es un falso positivo aqui y hay
-- que aceptarlo de forma permanente:
--
--   * 97 politicas RLS las invocan (90 con destino `{public}`, que incluye a
--     `anon`, y 7 con destino `{authenticated}`).
--   * Una politica RLS exige EXECUTE al rol que consulta -- probado, ver la
--     cabecera. Revocar cualquiera de las dos rompe las 13 tablas `fin_*`,
--     `hato_config` y `usuarios`: el modulo de Finanzas completo.
--   * Llamarlas como `anon` no filtra nada: ambas resuelven por `auth.uid()`,
--     que es NULL sin sesion, asi que devuelven false / NULL.
--
-- Son las primitivas de autorizacion del sistema, no superficie de ataque. El
-- linter no puede distinguir una cosa de la otra.
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- 6. Guardas de cierre -- se verifica el ESTADO FINAL (no los deltas), asi que
--    volver a correr la migracion pasa igual.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_trigger_expuestas integer;
  v_sin_path          integer;
  v_grants_tablas     integer;
  v_anon_cleanup      boolean;
  v_auth_cleanup      boolean;
  v_gerencia_ok       boolean;
  v_role_ok           boolean;
BEGIN
  SELECT count(*) INTO v_trigger_expuestas
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prorettype = 'trigger'::regtype
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF v_trigger_expuestas <> 0 THEN
    RAISE EXCEPTION '082 ABORTADA: quedan % funcion(es) de trigger ejecutables por anon/authenticated.', v_trigger_expuestas;
  END IF;

  SELECT count(*) INTO v_sin_path
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proconfig IS NULL
     AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e');
  IF v_sin_path <> 0 THEN
    RAISE EXCEPTION '082 ABORTADA: quedan % funcion(es) sin search_path fijado.', v_sin_path;
  END IF;

  SELECT count(*) INTO v_grants_tablas
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name IN ('kv_store_1ccce916','telegram_sessions','telegram_mensajes','telegram_conversations')
     AND grantee IN ('anon','authenticated');
  IF v_grants_tablas <> 0 THEN
    RAISE EXCEPTION '082 ABORTADA: quedan % grant(s) a anon/authenticated en las tablas de edge function.', v_grants_tablas;
  END IF;

  -- El RPC de compras: cerrado para `anon`, abierto para `authenticated`.
  SELECT has_function_privilege('anon',          'public.fn_cleanup_compra_dependencies(uuid)', 'EXECUTE'),
         has_function_privilege('authenticated', 'public.fn_cleanup_compra_dependencies(uuid)', 'EXECUTE')
    INTO v_anon_cleanup, v_auth_cleanup;
  IF v_anon_cleanup THEN
    RAISE EXCEPTION '082 ABORTADA: `anon` todavia puede ejecutar fn_cleanup_compra_dependencies.';
  END IF;
  IF NOT v_auth_cleanup THEN
    RAISE EXCEPTION '082 ABORTADA: `authenticated` perdio EXECUTE sobre fn_cleanup_compra_dependencies; PurchaseHistory.tsx dejaria de borrar compras.';
  END IF;

  -- Y las dos primitivas de autorizacion siguen invocables (PARTE 5): si esto
  -- falla, la RLS de todo Finanzas se cae.
  SELECT has_function_privilege('authenticated', 'public.es_usuario_gerencia()', 'EXECUTE'),
         has_function_privilege('authenticated', 'public.get_user_role()',       'EXECUTE')
    INTO v_gerencia_ok, v_role_ok;
  IF NOT (v_gerencia_ok AND v_role_ok) THEN
    RAISE EXCEPTION '082 ABORTADA: `authenticated` perdio EXECUTE sobre es_usuario_gerencia()/get_user_role(); eso rompe 97 politicas RLS.';
  END IF;

  RAISE NOTICE '082 OK: 0 trigger fns expuestas, 0 funciones sin search_path, 0 grants sobrantes, RPC de compras cerrado a anon y abierto a authenticated, primitivas de autorizacion intactas.';
END $$;


-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Nada de esto toca datos, asi que revertir es solo devolver privilegios.
-- Restaurarlos REABRE lo que la migracion cierra; hacerlo solo con motivo.
--
--   -- PARTE 1 (deja el DELETE sin autenticar otra vez):
--   CREATE OR REPLACE FUNCTION public.fn_cleanup_compra_dependencies(p_compra_id uuid)
--   RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
--   AS $f$ BEGIN DELETE FROM fin_gastos WHERE compra_id = p_compra_id; END; $f$;
--   GRANT EXECUTE ON FUNCTION public.fn_cleanup_compra_dependencies(uuid) TO PUBLIC;
--
--   -- PARTES 2 y 3 (por funcion, segun haga falta):
--   GRANT EXECUTE ON FUNCTION public.<nombre>(<args>) TO PUBLIC;
--   ALTER FUNCTION public.<nombre>(<args>) RESET search_path;
--
--   -- PARTE 4:
--   GRANT ALL ON TABLE public.kv_store_1ccce916 TO anon, authenticated;  -- etc.
-- =============================================================================
