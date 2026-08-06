-- =============================================================================
-- 084_hato_correcciones.sql
--
-- S3 T4b — corrección con traza append-only (docs/plan_hato_ciclo_manual_override.md
-- §4-§5, decisión del dueño P-2 en docs/plan_hato_ronda_agosto_2026.md §0 D-6/D-21).
--
-- Numerada 084, no 083: la 083 la escribió otro agente en paralelo (S1,
-- inventario definitivo de agosto 2026) y no se toca ni se lee aquí.
--
-- QUÉ HACE:
--   1. Tabla `hato_correcciones` (append-only, nunca UPDATE/DELETE) que
--      guarda el valor ANTERIOR completo de cualquier UPDATE/DELETE humano
--      sobre 5 tablas del módulo Hato Lechero.
--   2. Un trigger genérico `fn_hato_registrar_correccion()`, AFTER UPDATE OR
--      DELETE, sobre esas 5 tablas -- así es IMPOSIBLE corregir sin dejar
--      traza (a diferencia de un RPC, que un PATCH directo se saltaría).
--   3. D-23 (docs/plan_hato_ronda_agosto_2026.md §0): sube
--      `hato_config.dias_espera_voluntaria_post_parto` de 60 (provisional,
--      migración 062) a 90.
--
-- POR QUÉ CORRECCIÓN EN SITIO (Opción A) Y NO EVENTO CORRECTIVO (Opción B):
-- decisión del `cto` documentada en el diseño §4 -- el módulo YA corrige en
-- sitio en 3 de sus 4 superficies (pesajes, quincenal, hato_animales), y
-- `hato_eventos` dejó de ser append-only en la PRÁCTICA (065 borra y
-- re-inserta; las tres rondas de limpieza de julio borraron >1.200 filas).
-- Diseñar T4b contra un invariante que el código no sostiene sería
-- exactamente lo aspiracional que CLAUDE.md prohíbe. No se repite ese
-- argumento aquí -- ver el diseño.
--
-- QUÉ NO TOCA esta migración (a propósito, fuera de alcance de S3 backend):
--   * El contrato de `fn_hato_commit_chequeo` (065) -- una corrección sobre
--     un evento derivado de un chequeo sigue caducando si Martha vuelve a
--     aprobar ESE chequeo (diseño §4.4, riesgo R-4). No se cambia aquí.
--   * `hato_chequeo_vacas` NO gana UI de edición (diseño §4.5) -- pero SÍ
--     lleva el trigger de auditoría (barato dejarlo cubierto por si algún
--     día se toca, ver §5.2 del diseño).
--   * RLS de escritura de las 5 tablas fuente -- sigue siendo el patrón 044
--     (Administrador + Gerencia). Esta migración no la endurece a
--     Gerencia-only (D-7 aplica al ciclo manual de T4a, que se escribe
--     desde `src/components/`, fuera de este backend; ver el diseño §3.5
--     "RLS no se toca", riesgo R-7).
--   * Ningún dato existente se modifica -- 0 filas de las 5 tablas fuente
--     se tocan. Solo se agrega la tabla nueva, el trigger, y el UPDATE de
--     UNA fila de `hato_config` (D-23).
--
-- Correr el archivo COMPLETO de una sola vez (SQL editor o `apply_migration`),
-- para que sea una transacción -- los `RAISE EXCEPTION` de las guardas de
-- cierre dependen de eso para deshacer todo si algo no cuadra. Misma
-- convención que 075/076/077/080/081/082.
--
-- Idempotente: `CREATE TABLE IF NOT EXISTS`, `DROP TRIGGER IF EXISTS` +
-- `CREATE TRIGGER`, `CREATE OR REPLACE FUNCTION`. El UPDATE de D-23 es
-- idempotente por construcción (fija el mismo valor final si se re-corre).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Tabla `hato_correcciones` -- traza append-only.
--
-- Va en `public` (no en `respaldos`, a diferencia de los backups forenses de
-- 080/081): es operativa, se lee desde la app (Hoja de Vida, S3 Fase 4) y
-- desde Esco algún día -- `respaldos` es solo para respaldos forenses que
-- PostgREST no debe exponer nunca.
--
-- `datos_anteriores`/`datos_nuevos` son jsonb, no columnas tipadas: las 5
-- tablas fuente tienen formas completamente distintas y esta tabla no debe
-- conocerlas -- es la misma razón por la que el trigger de abajo usa
-- `to_jsonb(OLD)`/`to_jsonb(NEW)` en vez de listar columnas.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.hato_correcciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tabla TEXT NOT NULL CHECK (tabla IN (
    'hato_eventos',
    'hato_pesajes_leche',
    'hato_produccion_quincenal',
    'hato_animales',
    'hato_chequeo_vacas'
  )),
  fila_id UUID NOT NULL,
  operacion TEXT NOT NULL CHECK (operacion IN ('update', 'delete')),
  datos_anteriores JSONB NOT NULL,
  -- NULL en 'delete' -- no hay valor "nuevo" cuando la fila desaparece.
  datos_nuevos JSONB,
  -- Desnormalizado a propósito: "correcciones de este animal" sin tener que
  -- conocer la forma de cada una de las 5 tablas (ver el trigger).
  animal_id UUID,
  -- Tomado de `datos->>'motivo_correccion'` cuando existe (hoy solo
  -- `hato_eventos` tiene columna `datos`) -- ver §5.3 del diseño. Opcional:
  -- quién/cuándo/qué cambió es lo que sostiene la auditoría, el porqué no.
  motivo TEXT,
  corregido_por UUID REFERENCES auth.users(id),
  corregido_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hato_correcciones_tabla_fila
  ON public.hato_correcciones (tabla, fila_id);

CREATE INDEX IF NOT EXISTS idx_hato_correcciones_animal_fecha
  ON public.hato_correcciones (animal_id, corregido_en DESC);

COMMENT ON TABLE public.hato_correcciones IS
  'Traza append-only de UPDATE/DELETE humanos sobre 5 tablas del módulo Hato '
  'Lechero (hato_eventos, hato_pesajes_leche, hato_produccion_quincenal, '
  'hato_animales, hato_chequeo_vacas). Escrita EXCLUSIVAMENTE por el trigger '
  '`fn_hato_registrar_correccion()` -- nunca por PostgREST directo (sin '
  'política de INSERT/UPDATE/DELETE, y REVOKE explícito a anon/authenticated '
  'más abajo). D-6/D-21 del dueño (docs/plan_hato_ronda_agosto_2026.md §0): '
  'toda corrección debe quedar rastreable, incluido el borrado. Migración 084.';


-- -----------------------------------------------------------------------------
-- 2. Trigger genérico `fn_hato_registrar_correccion()`.
--
-- Por qué un trigger y no un RPC: un trigger corre en la MISMA transacción
-- que la escritura, así que es imposible que exista la corrección sin su
-- traza, o la traza sin la corrección. Un RPC exige que todo llamador se
-- acuerde de usarlo, y basta un PATCH directo por PostgREST para saltárselo
-- -- mismo criterio que 040/050/063/074 aplicaron a `created_by`.
--
-- SECURITY DEFINER: la tabla deniega INSERT a los roles del navegador (no
-- hay política de escritura, ver más abajo), así que el trigger necesita
-- correr con los privilegios de su dueño para poder escribir. Verificado dos
-- veces contra producción (comentario de la migración 082, PARTE 2/nota
-- final): un trigger SÍ dispara aunque el rol que escribe no tenga EXECUTE
-- sobre la función del trigger -- Postgres comprueba ese privilegio en
-- CREATE TRIGGER, no por disparo -- así que revocar EXECUTE de
-- anon/authenticated más abajo es seguro y no rompe el disparo.
--
-- `pg_temp` al final del `search_path`, obligatorio (migración 082 PARTE 3):
-- si no se menciona, Postgres busca el esquema temporal PRIMERO para
-- nombres de relación, que es exactamente el vector de sombra que se quiere
-- cerrar en una función SECURITY DEFINER.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_hato_registrar_correccion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_animal_id UUID;
  v_motivo TEXT;
BEGIN
  -- Regla dura del brief: nada escrito por una ruta de máquina se audita.
  -- `auth.uid()` es NULL para `service_role` (el commit de chequeo 065 --
  -- que borra y re-inserta por contrato y ya tiene su propia capa cruda --,
  -- las migraciones -- incluida la de S1, que hace ~68 UPDATE sobre
  -- `hato_animales` --, y el bot de Telegram). Limitación conocida,
  -- idéntica a la de 050/063/074: solo las ediciones humanas hechas desde
  -- una sesión de navegador dejan traza aquí.
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- No-op: un UPDATE que reenvía el mismo valor (ej. un guardado sin
  -- cambios reales) no es una corrección y no debe generar ruido.
  IF TG_OP = 'UPDATE' AND to_jsonb(OLD) = to_jsonb(NEW) THEN
    RETURN NEW;
  END IF;

  -- `animal_id`: sin SQL dinámico, `to_jsonb(...)->>'columna'` resuelve
  -- columnas que no existen en todas las tablas (ej. `hato_produccion_quincenal`
  -- no tiene `animal_id`, es un agregado del hato, no de un animal) sin
  -- romper la compilación de plpgsql -- a diferencia de referenciar
  -- `OLD.animal_id` directo, que fallaría a compilar sobre `hato_animales`,
  -- cuya identidad es su propio `id`.
  IF TG_TABLE_NAME = 'hato_animales' THEN
    v_animal_id := (to_jsonb(OLD) ->> 'id')::uuid;
  ELSE
    v_animal_id := (to_jsonb(OLD) ->> 'animal_id')::uuid;
  END IF;

  -- Motivo (§5.3 del diseño): solo `hato_eventos` tiene columna `datos`
  -- jsonb con `motivo_correccion` opcional. En DELETE no hay NEW -- se deja
  -- NULL explícitamente en vez de confiar en que `to_jsonb(NULL)` resuelva
  -- solo. No se intenta capturar con GUCs de sesión: cada request de
  -- PostgREST es su propia transacción y un `SET LOCAL` no sobrevive.
  v_motivo := CASE
    WHEN TG_OP = 'UPDATE' THEN to_jsonb(NEW) -> 'datos' ->> 'motivo_correccion'
    ELSE NULL
  END;

  INSERT INTO public.hato_correcciones (
    tabla, fila_id, operacion, datos_anteriores, datos_nuevos,
    animal_id, motivo, corregido_por
  )
  VALUES (
    TG_TABLE_NAME,
    (to_jsonb(OLD) ->> 'id')::uuid,
    lower(TG_OP),
    to_jsonb(OLD),
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    v_animal_id,
    v_motivo,
    auth.uid()
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Ni `anon` ni `authenticated` tienen por qué invocarla como RPC -- es
-- exclusivamente una función de trigger. `postgres` (dueño de la migración)
-- conserva EXECUTE siempre, así que el CREATE TRIGGER de abajo, y cualquier
-- CREATE TRIGGER futuro sobre estas tablas, sigue funcionando (082 PARTE 2).
REVOKE EXECUTE ON FUNCTION public.fn_hato_registrar_correccion() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_hato_registrar_correccion() IS
  'Trigger AFTER UPDATE OR DELETE sobre las 5 tablas de S3 T4b. Escribe una '
  'fila en hato_correcciones con el valor ANTERIOR completo. SECURITY '
  'DEFINER porque hato_correcciones deniega escritura a los roles del '
  'navegador; sin chequeo de rol interno porque no es invocable como RPC '
  '(EXECUTE revocado de PUBLIC/anon/authenticated). Ignora toda escritura '
  'con auth.uid() IS NULL (service_role) -- ver el cuerpo. Migración 084.';


-- -----------------------------------------------------------------------------
-- 3. Instalar el trigger en las 5 tablas.
--
-- Se ponen las 5 aunque solo 3 vayan a tener UI de edición nueva en la Fase
-- 4 (frontend, fuera de este backend): `hato_animales` ya se edita hoy sin
-- traza (`EditarAnimalDialog`, y viene una re-caravanación completa del
-- hato en S1), y `hato_chequeo_vacas` es barato dejarlo cubierto por si
-- algún día se toca. Un trigger de auditoría sobre una tabla que nadie edita
-- no cuesta nada; una edición sin traza sí.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'hato_eventos',
    'hato_pesajes_leche',
    'hato_produccion_quincenal',
    'hato_animales',
    'hato_chequeo_vacas'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_hato_correccion ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_hato_correccion AFTER UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_hato_registrar_correccion()',
      t
    );
  END LOOP;
END $$;


-- -----------------------------------------------------------------------------
-- 4. RLS de `hato_correcciones` -- SELECT-only para authenticated, deny-all
--    para todo lo demás.
--
-- Las 5 tablas fuente ya son SELECT-authenticated (patrón 044): la traza no
-- expone nada que un usuario del módulo no pudiera ya reconstruir viendo el
-- estado actual + su propia memoria. Sin política de INSERT/UPDATE/DELETE
-- -> denegado por RLS para cualquier rol sujeto a ella. El trigger DEFINER
-- escribe de todas formas (no está sujeto a la RLS de la tabla en la que
-- inserta, corre como su dueño).
-- -----------------------------------------------------------------------------

ALTER TABLE public.hato_correcciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hato_correcciones_select ON public.hato_correcciones;
CREATE POLICY hato_correcciones_select ON public.hato_correcciones
  FOR SELECT TO authenticated USING (TRUE);

-- No decoración: Supabase trae `ALTER DEFAULT PRIVILEGES IN SCHEMA public
-- GRANT ALL ON TABLES TO anon, authenticated` -- así fue exactamente como
-- la migración 081 terminó con un backup expuesto al mundo. RLS y grants
-- son dos capas distintas; aquí se quieren las dos.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.hato_correcciones FROM anon, authenticated;


-- -----------------------------------------------------------------------------
-- 5. D-23 (docs/plan_hato_ronda_agosto_2026.md §0) -- sube
--    `dias_espera_voluntaria_post_parto` de 60 (provisional, migración 062)
--    a 90.
--
-- Es el criterio de respaldo que marca una vaca vacía como "problema" SOLO
-- cuando el veterinario no opinó en el último chequeo
-- (`clasificarVaciaProblema`, calculosHato.ts). Con chequeos bimensuales la
-- mayoría de vacas sí tiene opinión explícita, así que 90 deja el respaldo
-- para los casos donde de verdad se perdió el rastro -- sin este UPDATE, S6
-- mandaría alertas a Fernando con el número provisional de 062.
-- -----------------------------------------------------------------------------

UPDATE public.hato_config
SET valor = '90'::jsonb,
    descripcion =
      'Días tras el parto durante los cuales una vaca vacía se considera '
      'NORMAL (período de espera voluntario), no un problema -- SOLO cuando '
      'el veterinario no dejó una señal explícita de ESTADO en el último '
      'chequeo (clasificarVaciaProblema, calculosHato.ts). Subido de 60 '
      '(provisional, migración 062, D-2 2026-07-22) a 90 por decisión del '
      'dueño (D-23, docs/plan_hato_ronda_agosto_2026.md §0, 2026-08-06): '
      'con chequeos bimensuales la mayoría de vacas SÍ tiene opinión '
      'explícita, así que 90 deja este respaldo para los casos donde de '
      'verdad se perdió el rastro.'
WHERE clave = 'dias_espera_voluntaria_post_parto';


-- -----------------------------------------------------------------------------
-- 6. Guardas de cierre -- se verifica el ESTADO FINAL (no los deltas), así
--    que volver a correr la migración pasa igual. Patrón 080/081/082.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_tabla_existe       boolean;
  v_rls                boolean;
  v_politicas          integer;
  v_grants_indebidos   integer;
  v_select_ok          boolean;
  v_triggers           integer;
  v_secdef             boolean;
  v_search_path_ok     boolean;
  v_config_filas       integer;
  v_config_valor       jsonb;
BEGIN
  -- 6.1 La tabla existe.
  SELECT to_regclass('public.hato_correcciones') IS NOT NULL INTO v_tabla_existe;
  IF NOT v_tabla_existe THEN
    RAISE EXCEPTION '084 ABORTADA: public.hato_correcciones no existe.';
  END IF;

  -- 6.2 RLS habilitada.
  SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'hato_correcciones';
  IF NOT v_rls THEN
    RAISE EXCEPTION '084 ABORTADA: RLS no quedó habilitada en hato_correcciones.';
  END IF;

  -- 6.3 Exactamente 1 política (la de SELECT).
  SELECT count(*) INTO v_politicas
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'hato_correcciones';
  IF v_politicas <> 1 THEN
    RAISE EXCEPTION '084 ABORTADA: se esperaba exactamente 1 política sobre hato_correcciones, hay %.', v_politicas;
  END IF;

  -- 6.4 anon/authenticated no pueden escribir.
  SELECT count(*) INTO v_grants_indebidos
    FROM (VALUES ('anon','INSERT'), ('anon','UPDATE'), ('anon','DELETE'), ('anon','TRUNCATE'),
                  ('authenticated','INSERT'), ('authenticated','UPDATE'), ('authenticated','DELETE'), ('authenticated','TRUNCATE')
         ) AS g(rol, priv)
   WHERE has_table_privilege(g.rol, 'public.hato_correcciones', g.priv);
  IF v_grants_indebidos <> 0 THEN
    RAISE EXCEPTION '084 ABORTADA: anon/authenticated conservan % privilegio(s) de escritura sobre hato_correcciones.', v_grants_indebidos;
  END IF;

  -- 6.5 Sanity: authenticated SÍ puede seleccionar (si esto falla, la
  --     política de lectura quedó inservible, no solo endurecida).
  SELECT has_table_privilege('authenticated', 'public.hato_correcciones', 'SELECT') INTO v_select_ok;
  IF NOT v_select_ok THEN
    RAISE EXCEPTION '084 ABORTADA: authenticated perdió SELECT sobre hato_correcciones -- la política de lectura quedaría inservible.';
  END IF;

  -- 6.6 Exactamente 5 triggers AFTER UPDATE OR DELETE apuntando a la función.
  SELECT count(*) INTO v_triggers
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'fn_hato_registrar_correccion'
     AND NOT t.tgisinternal;
  IF v_triggers <> 5 THEN
    RAISE EXCEPTION '084 ABORTADA: se esperaban 5 triggers sobre fn_hato_registrar_correccion, hay %.', v_triggers;
  END IF;

  -- 6.7 La función es SECURITY DEFINER con search_path pinneado
  --     (public, pg_temp, en ese orden -- pg_temp nunca primero).
  SELECT p.prosecdef,
         EXISTS (
           SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg
            WHERE cfg ILIKE 'search_path=%public%' AND cfg ILIKE '%pg_temp%'
         )
    INTO v_secdef, v_search_path_ok
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_hato_registrar_correccion';
  IF NOT v_secdef THEN
    RAISE EXCEPTION '084 ABORTADA: fn_hato_registrar_correccion no quedó SECURITY DEFINER.';
  END IF;
  IF NOT v_search_path_ok THEN
    RAISE EXCEPTION '084 ABORTADA: fn_hato_registrar_correccion no tiene search_path=public, pg_temp fijado.';
  END IF;

  -- 6.8 D-23: exactamente 1 fila de hato_config cambió a 90. `valor` es
  -- jsonb -- sin operador MAX/MIN nativo -- así que se cuenta y se lee por
  -- separado en vez de agregar ambas cosas en una sola consulta.
  SELECT count(*) INTO v_config_filas
    FROM public.hato_config
   WHERE clave = 'dias_espera_voluntaria_post_parto';
  SELECT valor INTO v_config_valor
    FROM public.hato_config
   WHERE clave = 'dias_espera_voluntaria_post_parto'
   LIMIT 1;
  IF v_config_filas <> 1 THEN
    RAISE EXCEPTION '084 ABORTADA: se esperaba exactamente 1 fila de hato_config para dias_espera_voluntaria_post_parto, hay %. ¿La migración 062 no está aplicada?', v_config_filas;
  END IF;
  IF v_config_valor IS DISTINCT FROM '90'::jsonb THEN
    RAISE EXCEPTION '084 ABORTADA: dias_espera_voluntaria_post_parto quedó en % en vez de 90 (D-23).', v_config_valor;
  END IF;

  RAISE NOTICE '084 OK: hato_correcciones creada (RLS on, 1 política SELECT, 0 grants de escritura para anon/authenticated), 5 triggers instalados sobre fn_hato_registrar_correccion (SECURITY DEFINER, search_path fijado), dias_espera_voluntaria_post_parto=90 (D-23).';
END $$;


-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Nada de esto toca datos de las 5 tablas fuente. Revertir es: quitar los 5
-- triggers, borrar la función, borrar la tabla (pierde la traza acumulada
-- hasta ese momento -- pensarlo dos veces si ya hay correcciones humanas
-- registradas), y devolver hato_config a 60 si hiciera falta.
--
--   DO $$
--   DECLARE t TEXT;
--   BEGIN
--     FOREACH t IN ARRAY ARRAY['hato_eventos','hato_pesajes_leche',
--       'hato_produccion_quincenal','hato_animales','hato_chequeo_vacas']
--     LOOP
--       EXECUTE format('DROP TRIGGER IF EXISTS trg_hato_correccion ON public.%I', t);
--     END LOOP;
--   END $$;
--
--   DROP FUNCTION IF EXISTS public.fn_hato_registrar_correccion();
--   DROP TABLE IF EXISTS public.hato_correcciones;
--
--   UPDATE public.hato_config
--     SET valor = '60'::jsonb,
--         descripcion = 'Días tras el parto durante los cuales una vaca '
--           'vacía se considera NORMAL (período de espera voluntario), no '
--           'un problema (D-2, 2026-07-22). DEFAULT PROVISIONAL -- pendiente '
--           'de confirmar con el dueño antes de que S6 dispare alertas con '
--           'base en él.'
--     WHERE clave = 'dias_espera_voluntaria_post_parto';
-- =============================================================================
