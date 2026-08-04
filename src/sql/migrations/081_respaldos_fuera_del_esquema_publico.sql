-- =============================================================================
-- 081_respaldos_fuera_del_esquema_publico.sql
--
-- Cierra el hallazgo CRITICO `rls_disabled_in_public` que el linter de Supabase
-- reporto por correo el 2026-08-03 sobre el proyecto Escocia OS
-- (ywhtjwawnkeqlwxbvgup):
--
--   Table `public.backup_080_hato_partos_imposibles` is public, but RLS has not
--   been enabled.
--
-- El aviso es correcto y la exposicion es real. Verificado contra produccion
-- antes de escribir esto:
--
--   * `relrowsecurity = false`, 0 politicas.
--   * `anon` y `authenticated` tienen SELECT, INSERT, UPDATE, DELETE, TRUNCATE,
--     REFERENCES y TRIGGER sobre la tabla.
--
-- `anon` es la llave que viaja en el bundle del navegador (VITE_SUPABASE_ANON_KEY),
-- o sea publica por diseno. Con RLS apagada y ese grant, cualquiera con la URL
-- del proyecto podia leer la tabla y, peor, borrarla o truncarla via PostgREST.
--
-- Lo que se pierde en ese caso no son datos operativos: son las 33 filas de
-- `hato_eventos` que la migracion 080 borro, es decir la UNICA copia de lo que
-- 080 elimino y el unico camino de ROLLBACK documentado al pie de ese archivo.
-- El riesgo es de integridad y trazabilidad, no de confidencialidad.
--
-- Causa raiz -- no es un descuido puntual de 080. Supabase deja configurado
-- `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,
-- authenticated, service_role`, asi que TODA tabla creada en `public` nace con
-- DML completo para `anon`. Un `CREATE TABLE public.backup_NNN_* AS SELECT ...`
-- -- el patron de 075, 076 y 080 -- publica el respaldo por omision. Arreglar
-- solo esta tabla dejaria la trampa armada para la proxima limpieza.
--
-- Por eso la correccion es estructural: los respaldos forenses salen de `public`
-- a un esquema `respaldos` que PostgREST no expone. Tres capas independientes,
-- de forma que ninguna sola equivocacion futura vuelva a publicar la tabla:
--
--   1. Esquema fuera de la API (PostgREST expone `public` y `graphql_public`).
--   2. Sin grants para `anon`/`authenticated`/`PUBLIC`, ni sobre el esquema ni
--      sobre la tabla.
--   3. RLS habilitada y sin politicas (deny-all), por si alguien algun dia
--      agrega `respaldos` a los esquemas expuestos.
--
-- `service_role` y `postgres` tienen `rolbypassrls = true` (verificado), asi que
-- el edge function y el SQL editor conservan el acceso que ya tenian: el
-- ROLLBACK de 080 sigue siendo ejecutable tal cual, cambiando el prefijo del
-- esquema.
--
-- No se toca ni una fila de datos. Filas afectadas: 0.
--
-- Correr el archivo COMPLETO de una sola vez (SQL editor o `apply_migration`),
-- para que sea una transaccion: los `RAISE EXCEPTION` de las guardas dependen de
-- eso para deshacer todo. Misma convencion que 075/076/077/080, que tampoco
-- escriben BEGIN/COMMIT explicitos.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. Guardas previas -- estado esperado antes de mover nada.
--
-- El respaldo debe estar intacto: 33 filas / 31 animales / 1 caso de
-- precedencia, exactamente lo que 080 documento. Si no coinciden, alguien ya
-- escribio en la tabla por la via que esta migracion viene a cerrar, y entonces
-- mover la tabla en silencio seria lo peor que se puede hacer: hay que mirar
-- primero. Misma disciplina de 075/076/080 -- `RAISE EXCEPTION` aborta toda la
-- transaccion.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_existe_publico  boolean;
  v_existe_destino  boolean;
  v_filas           integer;
  v_animales        integer;
  v_precedencia     integer;
BEGIN
  SELECT to_regclass('public.backup_080_hato_partos_imposibles')    IS NOT NULL
    INTO v_existe_publico;
  SELECT to_regclass('respaldos.backup_080_hato_partos_imposibles') IS NOT NULL
    INTO v_existe_destino;

  -- Idempotencia: si la tabla ya vive en `respaldos` y no quedo nada en
  -- `public`, la migracion ya corrio. Se sale sin error.
  IF NOT v_existe_publico AND v_existe_destino THEN
    RAISE NOTICE '081: la tabla ya esta en `respaldos`, nada que mover.';
    RETURN;
  END IF;

  IF NOT v_existe_publico THEN
    RAISE EXCEPTION '081 ABORTADA: no existe public.backup_080_hato_partos_imposibles ni respaldos.backup_080_hato_partos_imposibles. El respaldo de la migracion 080 desaparecio; investigar antes de continuar.';
  END IF;

  IF v_existe_destino THEN
    RAISE EXCEPTION '081 ABORTADA: existen AMBAS copias (public y respaldos). Hay que decidir a mano cual es la buena; esta migracion no elige por ti.';
  END IF;

  SELECT count(*),
         count(DISTINCT animal_id),
         count(*) FILTER (WHERE es_precedencia)
    INTO v_filas, v_animales, v_precedencia
    FROM public.backup_080_hato_partos_imposibles;

  IF v_filas <> 33 OR v_animales <> 31 OR v_precedencia <> 1 THEN
    RAISE EXCEPTION
      '081 ABORTADA: el respaldo de 080 no esta intacto. Esperado 33 filas / 31 animales / 1 precedencia; encontrado % / % / %. La tabla estuvo escribible por `anon`: revisar si fue manipulada ANTES de moverla.',
      v_filas, v_animales, v_precedencia;
  END IF;
END $$;


-- -----------------------------------------------------------------------------
-- 1. Esquema `respaldos` -- destino de las copias forenses de limpiezas.
--
-- No se agrega a los esquemas expuestos de la API (Settings -> API -> Exposed
-- schemas). Esa es justamente la propiedad que lo hace util: lo que viva aqui
-- no es alcanzable por PostgREST ni con la llave `anon` ni con un JWT valido.
-- -----------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS respaldos;

COMMENT ON SCHEMA respaldos IS
  'Copias de seguridad forenses de migraciones de limpieza (075, 076, 080, ...). '
  'Fuera de los esquemas expuestos por PostgREST a proposito: no es alcanzable '
  'desde el navegador. Solo `service_role`/`postgres` (rolbypassrls) leen aqui. '
  'Las tablas nuevas de este esquema NO heredan los grants a `anon` que Supabase '
  'define por omision para `public` -- ese es el punto. Migracion 081.';

-- `CREATE SCHEMA` no otorga USAGE a nadie mas que al dueno, pero lo dejamos
-- explicito: la migracion debe ser legible como una afirmacion de acceso, no
-- depender de lo que Postgres haga por omision.
REVOKE ALL ON SCHEMA respaldos FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA respaldos TO service_role;


-- -----------------------------------------------------------------------------
-- 2. Mover el respaldo de 080 fuera de `public`.
--
-- `ALTER TABLE ... SET SCHEMA` CONSERVA los grants de la tabla -- mover no es
-- revocar. Por eso el REVOKE del paso 3 es imprescindible y no redundante.
--
-- Va dentro de un DO condicional para que re-correr la migracion no falle: si la
-- tabla ya se movio, `public.backup_080_...` ya no existe y un ALTER a secas
-- reventaria. El paso 0 ya descarto el caso ambiguo (existir en los dos lados).
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.backup_080_hato_partos_imposibles') IS NOT NULL THEN
    ALTER TABLE public.backup_080_hato_partos_imposibles
      SET SCHEMA respaldos;
  END IF;
END $$;

COMMENT ON TABLE respaldos.backup_080_hato_partos_imposibles IS
  'Las 33 filas de `hato_eventos` (tipo=parto) que borro la migracion 080, '
  'guardadas antes de borrarlas. Unica fuente para el ROLLBACK documentado al '
  'pie de 080 -- usar `respaldos.` en vez de `public.` en ese INSERT. La columna '
  '`es_precedencia` es diagnostico de 080 y no existe en `hato_eventos`: hay que '
  'excluirla al restaurar. Movida desde `public` por la migracion 081 (estaba '
  'expuesta a `anon` con DML completo y sin RLS). Borrar cuando Santiago '
  'confirme que la Hoja de Vida y el motor de alertas se ven bien para los 31 '
  'animales afectados.';


-- -----------------------------------------------------------------------------
-- 3. Quitar los grants heredados de `public`.
--
-- Estos son los privilegios que `CREATE TABLE ... AS SELECT` en `public` le
-- regalo a `anon` y `authenticated` el 2026-08-03, y que viajaron con la tabla
-- al cambiarla de esquema.
-- -----------------------------------------------------------------------------

REVOKE ALL ON TABLE respaldos.backup_080_hato_partos_imposibles
  FROM PUBLIC, anon, authenticated;


-- -----------------------------------------------------------------------------
-- 4. RLS deny-all como ultima red.
--
-- Habilitada y deliberadamente SIN politicas: nadie sujeto a RLS ve ni escribe
-- una fila. `service_role` y `postgres` la evaden por `rolbypassrls`, de modo
-- que el ROLLBACK de 080 y las consultas de auditoria siguen funcionando.
--
-- Esto hace que el linter reporte `rls_enabled_no_policy` (nivel INFO) sobre
-- esta tabla, igual que ya lo hace con `kv_store_1ccce916` y las tablas
-- `telegram_*`. Es el resultado buscado, no un pendiente: para una tabla que
-- ningun rol del navegador debe tocar, "RLS sin politicas" ES la politica.
-- -----------------------------------------------------------------------------

ALTER TABLE respaldos.backup_080_hato_partos_imposibles
  ENABLE ROW LEVEL SECURITY;


-- -----------------------------------------------------------------------------
-- 5. Guardas de cierre -- verificar el estado final dentro de la misma
--    transaccion, para que un resultado inesperado deshaga todo.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_filas       integer;
  v_rls         boolean;
  v_politicas   integer;
  v_grants      integer;
  v_en_publico  integer;
BEGIN
  -- Salida temprana si el paso 0 detecto que la migracion ya habia corrido.
  IF to_regclass('respaldos.backup_080_hato_partos_imposibles') IS NULL THEN
    RAISE EXCEPTION '081 ABORTADA: la tabla no quedo en `respaldos`.';
  END IF;

  SELECT count(*) INTO v_filas
    FROM respaldos.backup_080_hato_partos_imposibles;

  IF v_filas <> 33 THEN
    RAISE EXCEPTION '081 ABORTADA: se esperaban 33 filas despues de mover, hay %.', v_filas;
  END IF;

  SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'respaldos'
     AND c.relname = 'backup_080_hato_partos_imposibles';

  IF NOT v_rls THEN
    RAISE EXCEPTION '081 ABORTADA: RLS no quedo habilitada.';
  END IF;

  SELECT count(*) INTO v_politicas
    FROM pg_policies
   WHERE schemaname = 'respaldos'
     AND tablename  = 'backup_080_hato_partos_imposibles';

  IF v_politicas <> 0 THEN
    RAISE EXCEPTION '081 ABORTADA: se esperaba deny-all (0 politicas), hay %.', v_politicas;
  END IF;

  -- Ningun privilegio para los roles del navegador.
  SELECT count(*) INTO v_grants
    FROM information_schema.role_table_grants
   WHERE table_schema = 'respaldos'
     AND table_name   = 'backup_080_hato_partos_imposibles'
     AND grantee IN ('anon', 'authenticated', 'PUBLIC');

  IF v_grants <> 0 THEN
    RAISE EXCEPTION '081 ABORTADA: `anon`/`authenticated` conservan % privilegio(s) sobre el respaldo.', v_grants;
  END IF;

  -- Y ninguna tabla `backup_*` suelta en `public`, que es el hallazgo del linter.
  SELECT count(*) INTO v_en_publico
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind = 'r'
     AND c.relname LIKE 'backup\_%';

  IF v_en_publico <> 0 THEN
    RAISE EXCEPTION '081 ABORTADA: quedan % tabla(s) backup_* en `public`.', v_en_publico;
  END IF;

  RAISE NOTICE '081 OK: respaldo de 080 movido a `respaldos`, 33 filas, RLS deny-all, 0 grants a anon/authenticated, 0 tablas backup_* en `public`.';
END $$;


-- =============================================================================
-- NOTA PARA LA PROXIMA MIGRACION DE LIMPIEZA
-- =============================================================================
-- Crear el respaldo directamente en `respaldos`, nunca en `public`:
--
--   CREATE TABLE IF NOT EXISTS respaldos.backup_NNN_lo_que_sea AS
--   SELECT ... ;
--
-- No hace falta REVOKE despues: `respaldos` no tiene los DEFAULT PRIVILEGES a
-- `anon` que Supabase configura sobre `public`, que es de donde salio este
-- problema. Habilitar RLS igual, por si el esquema llegara a exponerse.
-- =============================================================================


-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Devuelve la tabla a `public` tal como estaba. Se restauran tambien los grants
-- a `anon`, porque ese era el estado previo -- o sea que este rollback REABRE la
-- vulnerabilidad. Solo tiene sentido si algo externo dependia de leer el
-- respaldo por PostgREST (nada en el repo lo hace: verificado con grep sobre
-- `src/`, sin un solo call site).
--
--   ALTER TABLE respaldos.backup_080_hato_partos_imposibles
--     DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE respaldos.backup_080_hato_partos_imposibles SET SCHEMA public;
--   GRANT ALL ON TABLE public.backup_080_hato_partos_imposibles
--     TO anon, authenticated, service_role;
--   DROP SCHEMA IF EXISTS respaldos;   -- solo si quedo vacio
--
-- Alternativa preferible si el respaldo de 080 ya cumplio su proposito: en vez
-- de revertir, borrarlo (DROP TABLE respaldos.backup_080_hato_partos_imposibles)
-- una vez Santiago confirme los 31 animales afectados.
-- =============================================================================
