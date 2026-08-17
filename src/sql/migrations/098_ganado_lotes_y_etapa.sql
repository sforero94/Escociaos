-- =====================================================================
-- 098: Ganado — nivel "lote" (tabla), "etapa" productiva del potrero, y
--      agrupación de traslados (grupo_id).
--
-- Plan: docs/plan_ganado_inventario_v2_implementacion.md §3, §4, §5.1.
-- Brief de producto: docs/plan_ganado_inventario_v2.md (CPO).
--
-- ADITIVA, RIESGO NULO: no mueve un solo dato de gan_potreros/gan_fincas.
-- Se puede aplicar el día que se escriba, antes de tener el Apéndice A
-- (mapeo de los 34 potreros) completo — eso lo consume la 099, no ésta.
--
-- Qué agrega:
--   1. Tabla gan_lotes — nivel ubicación → finca → LOTE → potrero. Es
--      tabla y no columna de texto: el mismo argumento que motivó la
--      migración 075 (un lote tecleado dos veces con un espacio de más
--      se ve como dos lotes chicos, no como un error). Único por
--      (finca_id, lower(btrim(nombre))) — combina las dos lecciones del
--      repo: lower() (044, gan_fincas_nombre_unique) y btrim() (075).
--   2. gan_potreros.lote_id — nullable, FK COMPUESTA (lote_id, finca_id)
--      -> gan_lotes(id, finca_id). Un potrero no puede colgar de un lote
--      de otra finca; con MATCH SIMPLE (default) la FK no se evalúa si
--      lote_id es NULL, que es exactamente "potrero sin lote".
--   3. gan_potreros.etapa — TEXT + CHECK, nullable. Sigue el patrón del
--      proyecto (hato_animales.etapa, gan_movimientos.tipo/estado,
--      fin_transacciones_ganado.tipo, clima_resumen_diario.lluvia_confianza
--      — el único ENUM real de la base es rol_usuario, heredado del
--      esquema original de Figma). NULL = sin clasificar, NUNCA un
--      centinela ni un DEFAULT — mismo criterio que la 062 tomó para
--      hato_chequeo_vacas.estado.
--   4. gan_movimientos.grupo_id — uuid nullable, para agrupar traslados
--      N->M (y, por separado, el conteo físico / carga inicial) en una
--      sola fila visual. Una compra/venta repartida NO usa esta columna:
--      agrupa por transaccion_ganado_id, que ya existe, ya es FK, y ya
--      es la clave sobre la que la 097 construyó
--      fn_gan_validar_cabezas_transaccion(). Una segunda clave para el
--      mismo hecho es una clave que se puede desincronizar.
--   5. CREATE OR REPLACE de fn_ganado_registrar_traslado_multi (097): el
--      cuerpo se reproduce VERBATIM salvo tres cambios puntuales — un
--      v_grupo_id := gen_random_uuid() en el DECLARE, y esa variable
--      agregada a la lista de columnas/VALUES de los dos INSERT (orígenes
--      y destinos). SECURITY INVOKER, search_path pineado y los mismos
--      REVOKE/GRANT se conservan y se re-emiten explícitamente (mismo
--      precedente que 059 con fn_crear_movimiento_pendiente_ganado y que
--      068 con el rollup de clima: reemplazar el CUERPO de una función de
--      una migración ya aplicada, en un archivo nuevo, NO es "editar una
--      migración existente" — 097 no se toca).
--
--      Va acá y no en la 099 a propósito: si el CREATE OR REPLACE fuera a
--      la 099, entre esta migración y esa habría una ventana en la que
--      grupo_id existe pero nadie lo llena — cualquier traslado registrado
--      en esos días nacería sin agrupar. Poniéndolo acá esa ventana es
--      CERO.
--
--   fn_ganado_confirmar_pendiente_multi() y fn_gan_validar_cabezas_transaccion()
--   (ambas de la 097) NO se tocan — consecuencia directa de la decisión
--   de dos claves de agrupación (§3.3 del plan). Las guardas de cierre lo
--   verifican, no solo lo asumen.
--
-- Idempotente en columnas/tabla/índices (IF NOT EXISTS) y en la función
-- (CREATE OR REPLACE). Las dos ALTER TABLE ... ADD CONSTRAINT (la FK
-- compuesta y el CHECK de etapa) se envuelven en un DO condicional para
-- que una segunda corrida no falle con "ya existe".
--
-- Corre completo de una sola vez (sin BEGIN/COMMIT explícitos, igual que
-- 075/076/077/080/081/082): los RAISE EXCEPTION de las guardas de cierre
-- dependen de que todo el archivo sea una sola transacción.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Tabla gan_lotes
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gan_lotes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id   UUID NOT NULL REFERENCES gan_fincas(id),
  nombre     TEXT NOT NULL CHECK (btrim(nombre) <> ''),
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Destino de la FK compuesta de gan_potreros.lote_id, más abajo.
  CONSTRAINT gan_lotes_id_finca_unique UNIQUE (id, finca_id)
);

-- lower() + btrim(): las dos lecciones del repo en un solo índice
-- (044 para lower(), 075 para btrim() — nunca una sola de las dos).
CREATE UNIQUE INDEX IF NOT EXISTS gan_lotes_finca_nombre_unique
  ON gan_lotes (finca_id, lower(btrim(nombre)));

COMMENT ON TABLE gan_lotes IS
  'Nivel "lote" entre finca y potrero (ubicación -> finca -> LOTE -> '
  'potrero). El nombre solo es único DENTRO de su finca (índice '
  'gan_lotes_finca_nombre_unique sobre finca_id + lower(btrim(nombre))) '
  '-- dos fincas distintas pueden tener cada una un lote "Carrizal". '
  'Migración 098, plan docs/plan_ganado_inventario_v2_implementacion.md §3.1.';


-- ---------------------------------------------------------------------
-- 2. gan_potreros.lote_id — nullable, FK compuesta a (gan_lotes.id, finca_id)
-- ---------------------------------------------------------------------

ALTER TABLE gan_potreros
  ADD COLUMN IF NOT EXISTS lote_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'gan_potreros_lote_misma_finca'
       AND conrelid = 'public.gan_potreros'::regclass
  ) THEN
    ALTER TABLE gan_potreros
      ADD CONSTRAINT gan_potreros_lote_misma_finca
      FOREIGN KEY (lote_id, finca_id) REFERENCES gan_lotes (id, finca_id);
  END IF;
END $$;

COMMENT ON COLUMN gan_potreros.lote_id IS
  'NULL = potrero sin lote asignado (nunca un centinela). La FK compuesta '
  'gan_potreros_lote_misma_finca impide que un potrero cuelgue de un lote '
  'de OTRA finca -- mover un potrero de finca obliga a corregir su lote '
  'en el mismo UPDATE. Migración 098.';


-- ---------------------------------------------------------------------
-- 3. gan_potreros.etapa — TEXT + CHECK, nullable
-- ---------------------------------------------------------------------

ALTER TABLE gan_potreros
  ADD COLUMN IF NOT EXISTS etapa TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'gan_potreros_etapa_check'
       AND conrelid = 'public.gan_potreros'::regclass
  ) THEN
    ALTER TABLE gan_potreros
      ADD CONSTRAINT gan_potreros_etapa_check
      CHECK (etapa IN ('terneros', 'levante', 'ceba', 'repele'));
  END IF;
END $$;

COMMENT ON COLUMN gan_potreros.etapa IS
  'Etapa productiva del potrero: terneros | levante | ceba | repele. '
  'NULL = sin clasificar -- NUNCA un centinela, NUNCA un DEFAULT (mismo '
  'criterio que la 062 tomó para hato_chequeo_vacas.estado). Sin '
  'historia: un movimiento viejo se lee con la etapa de HOY (R-3 del '
  'brief del CPO). Migración 098.';


-- ---------------------------------------------------------------------
-- 4. gan_movimientos.grupo_id — agrupa traslados N->M y conteos físicos
-- ---------------------------------------------------------------------

ALTER TABLE gan_movimientos
  ADD COLUMN IF NOT EXISTS grupo_id UUID;

COMMENT ON COLUMN gan_movimientos.grupo_id IS
  'Agrupa varias filas que son UN solo hecho: (a) traslado N->M -- N '
  'traslado_salida + M traslado_entrada, lo estampa '
  'fn_ganado_registrar_traslado_multi() con un gen_random_uuid() interno; '
  '(b) conteo físico / carga inicial -- N ajuste, lo estampa el cliente '
  '(construirAjustesMasivos / cargarInventarioInicial), que es quien '
  'construye esas filas. Una compra/venta repartida NO usa esta columna: '
  'agrupa por transaccion_ganado_id, que ya es FK y ya es la clave de '
  'fn_gan_validar_cabezas_transaccion() (097) -- una segunda clave para '
  'el mismo hecho se puede desincronizar. NULL = fila suelta, sin grupo. '
  'Migración 098.';


-- ---------------------------------------------------------------------
-- 5. Índices
-- ---------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_gan_potreros_lote
  ON gan_potreros (lote_id);

CREATE INDEX IF NOT EXISTS idx_gan_potreros_etapa
  ON gan_potreros (etapa) WHERE etapa IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gan_movimientos_grupo
  ON gan_movimientos (grupo_id) WHERE grupo_id IS NOT NULL;


-- ---------------------------------------------------------------------
-- 6. RLS de gan_lotes -- patrón 044, con (SELECT auth.uid()) envuelto
--    desde el nacimiento (regla 077/093 del proyecto: nunca auth.uid()
--    pelado en una política nueva).
-- ---------------------------------------------------------------------

ALTER TABLE gan_lotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gan_lotes_select_authenticated" ON gan_lotes;
CREATE POLICY "gan_lotes_select_authenticated" ON gan_lotes
  FOR SELECT TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "gan_lotes_write_admin_gerencia" ON gan_lotes;
CREATE POLICY "gan_lotes_write_admin_gerencia" ON gan_lotes
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.id = (SELECT auth.uid())
        AND u.rol IN ('Administrador'::rol_usuario, 'Gerencia'::rol_usuario)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.id = (SELECT auth.uid())
        AND u.rol IN ('Administrador'::rol_usuario, 'Gerencia'::rol_usuario)
    )
  );

-- Las políticas son TO authenticated, así que anon ya está denegado por
-- RLS -- esto quita el GRANT de tabla que Supabase regala por omisión
-- (ALTER DEFAULT PRIVILEGES ... TO anon, authenticated) y que no tiene
-- ningún call site. Mismo precedente que 082 parte 4.
REVOKE ALL ON TABLE gan_lotes FROM anon;


-- ---------------------------------------------------------------------
-- 7. CREATE OR REPLACE de fn_ganado_registrar_traslado_multi (097)
--
--    Cuerpo VERBATIM de la 097 salvo tres cambios: v_grupo_id en el
--    DECLARE, y esa variable agregada a los dos INSERT (orígenes y
--    destinos). Nada más cambia: misma firma, mismas validaciones, mismo
--    orden salidas-antes-que-entradas.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_ganado_registrar_traslado_multi(
  p_fecha DATE,
  p_origenes JSONB,
  p_destinos JSONB,
  p_peso_promedio_kg NUMERIC DEFAULT NULL,
  p_notas TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_novillos_origen  INTEGER := 0;
  v_toros_origen     INTEGER := 0;
  v_novillos_destino INTEGER := 0;
  v_toros_destino    INTEGER := 0;
  v_potreros_origen  UUID[] := ARRAY[]::UUID[];
  v_potreros_destino UUID[] := ARRAY[]::UUID[];
  v_fila             JSONB;
  v_potrero          UUID;
  v_novillos         INTEGER;
  v_toros            INTEGER;
  v_n                INTEGER := 0;
  v_grupo_id         UUID := gen_random_uuid();
BEGIN
  IF p_fecha IS NULL THEN
    RAISE EXCEPTION 'La fecha es requerida';
  END IF;
  IF p_origenes IS NULL OR jsonb_typeof(p_origenes) <> 'array' OR jsonb_array_length(p_origenes) = 0 THEN
    RAISE EXCEPTION 'El traslado no tiene potreros de origen';
  END IF;
  IF p_destinos IS NULL OR jsonb_typeof(p_destinos) <> 'array' OR jsonb_array_length(p_destinos) = 0 THEN
    RAISE EXCEPTION 'El traslado no tiene potreros de destino';
  END IF;

  FOR v_fila IN SELECT * FROM jsonb_array_elements(p_origenes) LOOP
    v_potrero  := (v_fila->>'potrero_id')::UUID;
    v_novillos := COALESCE((v_fila->>'novillos')::INTEGER, 0);
    v_toros    := COALESCE((v_fila->>'toros')::INTEGER, 0);
    IF v_potrero IS NULL THEN RAISE EXCEPTION 'Hay un origen sin potrero'; END IF;
    IF v_novillos < 0 OR v_toros < 0 THEN RAISE EXCEPTION 'Las cantidades no pueden ser negativas'; END IF;
    IF v_novillos + v_toros = 0 THEN RAISE EXCEPTION 'Hay un origen en cero'; END IF;
    IF v_potrero = ANY(v_potreros_origen) THEN RAISE EXCEPTION 'Hay un potrero de origen repetido'; END IF;
    v_potreros_origen := v_potreros_origen || v_potrero;
    v_novillos_origen := v_novillos_origen + v_novillos;
    v_toros_origen := v_toros_origen + v_toros;
  END LOOP;

  FOR v_fila IN SELECT * FROM jsonb_array_elements(p_destinos) LOOP
    v_potrero  := (v_fila->>'potrero_id')::UUID;
    v_novillos := COALESCE((v_fila->>'novillos')::INTEGER, 0);
    v_toros    := COALESCE((v_fila->>'toros')::INTEGER, 0);
    IF v_potrero IS NULL THEN RAISE EXCEPTION 'Hay un destino sin potrero'; END IF;
    IF v_novillos < 0 OR v_toros < 0 THEN RAISE EXCEPTION 'Las cantidades no pueden ser negativas'; END IF;
    IF v_novillos + v_toros = 0 THEN RAISE EXCEPTION 'Hay un destino en cero'; END IF;
    IF v_potrero = ANY(v_potreros_destino) THEN RAISE EXCEPTION 'Hay un potrero de destino repetido'; END IF;
    IF v_potrero = ANY(v_potreros_origen) THEN
      RAISE EXCEPTION 'Un mismo potrero no puede ser origen y destino del traslado';
    END IF;
    v_potreros_destino := v_potreros_destino || v_potrero;
    v_novillos_destino := v_novillos_destino + v_novillos;
    v_toros_destino := v_toros_destino + v_toros;
  END LOOP;

  IF v_novillos_origen <> v_novillos_destino OR v_toros_origen <> v_toros_destino THEN
    RAISE EXCEPTION
      'El traslado no cierra: salen % novillos y % toros, entran % novillos y % toros',
      v_novillos_origen, v_toros_origen, v_novillos_destino, v_toros_destino;
  END IF;

  FOR v_fila IN SELECT * FROM jsonb_array_elements(p_origenes) LOOP
    INSERT INTO gan_movimientos (
      tipo, estado, fecha, potrero_origen_id, novillos_delta, toros_delta, notas, grupo_id
    ) VALUES (
      'traslado_salida', 'confirmado', p_fecha,
      (v_fila->>'potrero_id')::UUID,
      -COALESCE((v_fila->>'novillos')::INTEGER, 0),
      -COALESCE((v_fila->>'toros')::INTEGER, 0),
      p_notas, v_grupo_id
    );
    v_n := v_n + 1;
  END LOOP;

  FOR v_fila IN SELECT * FROM jsonb_array_elements(p_destinos) LOOP
    INSERT INTO gan_movimientos (
      tipo, estado, fecha, potrero_destino_id, novillos_delta, toros_delta,
      peso_promedio_kg, notas, grupo_id
    ) VALUES (
      'traslado_entrada', 'confirmado', p_fecha,
      (v_fila->>'potrero_id')::UUID,
      COALESCE((v_fila->>'novillos')::INTEGER, 0),
      COALESCE((v_fila->>'toros')::INTEGER, 0),
      p_peso_promedio_kg, p_notas, v_grupo_id
    );
    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$$;

-- CREATE OR REPLACE no garantiza los grants si la firma cambiara -- no
-- cambia (grupo_id se genera adentro), pero se re-emiten explícitamente
-- de todos modos: la migración debe leerse como una afirmación de
-- acceso, no depender de lo que Postgres conserve por omisión (mismo
-- criterio que 081 §1).
REVOKE EXECUTE ON FUNCTION fn_ganado_registrar_traslado_multi(DATE, JSONB, JSONB, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_ganado_registrar_traslado_multi(DATE, JSONB, JSONB, NUMERIC, TEXT) TO authenticated;

COMMENT ON FUNCTION fn_ganado_registrar_traslado_multi(DATE, JSONB, JSONB, NUMERIC, TEXT) IS
  'Registra un traslado de N potreros origen a M potreros destino en una '
  'sola transacción. Los totales de novillos y toros deben coincidir '
  'entre ambos lados. Desde la migración 098 estampa un grupo_id común '
  '(generado internamente, gen_random_uuid()) en todas las filas que '
  'produce, para que la UI las muestre como un solo evento '
  '"Origen(es) -> Destino(s) · N cabezas" en vez de N filas sueltas.';


-- ---------------------------------------------------------------------
-- 8. Guardas de cierre
-- ---------------------------------------------------------------------

DO $$
DECLARE
  v_lote_id_ok         boolean;
  v_etapa_col_ok       boolean;
  v_grupo_id_ok        boolean;
  v_etapa_check_ok     boolean;
  v_fk_ok              boolean;
  v_lotes_rls          boolean;
  v_lotes_policies     integer;
  v_lotes_anon_grants  integer;
  v_idx_lote           boolean;
  v_idx_etapa          boolean;
  v_idx_grupo          boolean;
  v_traslado_oid       regprocedure;
  v_traslado_secdef    boolean;
  v_traslado_cfg       text;
  v_traslado_auth_exec boolean;
  v_traslado_anon_exec boolean;
  v_confirmar_existe   boolean;
  v_validar_existe     boolean;
BEGIN
  -- 8.1 Las 3 columnas nuevas existen, con el tipo correcto y nullable.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'gan_potreros'
      AND column_name = 'lote_id' AND data_type = 'uuid' AND is_nullable = 'YES'
  ) INTO v_lote_id_ok;
  IF NOT v_lote_id_ok THEN
    RAISE EXCEPTION '098 ABORTADA: gan_potreros.lote_id no existe o no es uuid nullable.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'gan_potreros'
      AND column_name = 'etapa' AND data_type = 'text' AND is_nullable = 'YES'
  ) INTO v_etapa_col_ok;
  IF NOT v_etapa_col_ok THEN
    RAISE EXCEPTION '098 ABORTADA: gan_potreros.etapa no existe o no es text nullable.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'gan_movimientos'
      AND column_name = 'grupo_id' AND data_type = 'uuid' AND is_nullable = 'YES'
  ) INTO v_grupo_id_ok;
  IF NOT v_grupo_id_ok THEN
    RAISE EXCEPTION '098 ABORTADA: gan_movimientos.grupo_id no existe o no es uuid nullable.';
  END IF;

  -- 8.2 El CHECK de etapa y la FK compuesta existen.
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'gan_potreros_etapa_check' AND conrelid = 'public.gan_potreros'::regclass AND contype = 'c'
  ) INTO v_etapa_check_ok;
  IF NOT v_etapa_check_ok THEN
    RAISE EXCEPTION '098 ABORTADA: no existe el CHECK gan_potreros_etapa_check.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'gan_potreros_lote_misma_finca' AND conrelid = 'public.gan_potreros'::regclass AND contype = 'f'
  ) INTO v_fk_ok;
  IF NOT v_fk_ok THEN
    RAISE EXCEPTION '098 ABORTADA: no existe la FK compuesta gan_potreros_lote_misma_finca.';
  END IF;

  -- 8.3 gan_lotes: RLS activa, exactamente 2 políticas, anon sin privilegios.
  SELECT c.relrowsecurity INTO v_lotes_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'gan_lotes';
  IF v_lotes_rls IS NOT TRUE THEN
    RAISE EXCEPTION '098 ABORTADA: gan_lotes no tiene RLS habilitada.';
  END IF;

  SELECT count(*) INTO v_lotes_policies FROM pg_policies WHERE schemaname = 'public' AND tablename = 'gan_lotes';
  IF v_lotes_policies <> 2 THEN
    RAISE EXCEPTION '098 ABORTADA: gan_lotes tiene % política(s), se esperaban exactamente 2.', v_lotes_policies;
  END IF;

  SELECT count(*) INTO v_lotes_anon_grants
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'gan_lotes' AND grantee = 'anon';
  IF v_lotes_anon_grants <> 0 THEN
    RAISE EXCEPTION '098 ABORTADA: anon conserva % privilegio(s) sobre gan_lotes.', v_lotes_anon_grants;
  END IF;

  -- 8.4 Los 3 índices nuevos existen.
  SELECT to_regclass('public.idx_gan_potreros_lote') IS NOT NULL INTO v_idx_lote;
  SELECT to_regclass('public.idx_gan_potreros_etapa') IS NOT NULL INTO v_idx_etapa;
  SELECT to_regclass('public.idx_gan_movimientos_grupo') IS NOT NULL INTO v_idx_grupo;
  IF NOT (v_idx_lote AND v_idx_etapa AND v_idx_grupo) THEN
    RAISE EXCEPTION '098 ABORTADA: falta al menos uno de los 3 índices nuevos (lote=%, etapa=%, grupo=%).', v_idx_lote, v_idx_etapa, v_idx_grupo;
  END IF;

  -- 8.5 fn_ganado_registrar_traslado_multi sigue INVOKER, con search_path
  --     pineado y los mismos grants: authenticated sí, anon no.
  v_traslado_oid := 'public.fn_ganado_registrar_traslado_multi(date, jsonb, jsonb, numeric, text)'::regprocedure;

  SELECT p.prosecdef, array_to_string(p.proconfig, ',')
    INTO v_traslado_secdef, v_traslado_cfg
    FROM pg_proc p WHERE p.oid = v_traslado_oid;

  IF v_traslado_secdef IS DISTINCT FROM false THEN
    RAISE EXCEPTION '098 ABORTADA: fn_ganado_registrar_traslado_multi pasó a SECURITY DEFINER por accidente.';
  END IF;
  IF v_traslado_cfg IS NULL OR v_traslado_cfg !~ 'search_path=public,\s*pg_temp' THEN
    RAISE EXCEPTION '098 ABORTADA: fn_ganado_registrar_traslado_multi perdió el search_path pineado (encontrado: %).', v_traslado_cfg;
  END IF;

  SELECT has_function_privilege('authenticated', v_traslado_oid, 'EXECUTE'),
         has_function_privilege('anon', v_traslado_oid, 'EXECUTE')
    INTO v_traslado_auth_exec, v_traslado_anon_exec;
  IF NOT v_traslado_auth_exec THEN
    RAISE EXCEPTION '098 ABORTADA: authenticated perdió EXECUTE sobre fn_ganado_registrar_traslado_multi; el traslado dejaría de funcionar.';
  END IF;
  IF v_traslado_anon_exec THEN
    RAISE EXCEPTION '098 ABORTADA: anon ganó EXECUTE sobre fn_ganado_registrar_traslado_multi.';
  END IF;

  -- 8.6 Las otras dos RPC de la 097 no se tocaron: siguen presentes.
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_ganado_confirmar_pendiente_multi'
  ) INTO v_confirmar_existe;
  IF NOT v_confirmar_existe THEN
    RAISE EXCEPTION '098 ABORTADA: fn_ganado_confirmar_pendiente_multi desapareció (la 098 no debía tocarla).';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_gan_validar_cabezas_transaccion'
  ) INTO v_validar_existe;
  IF NOT v_validar_existe THEN
    RAISE EXCEPTION '098 ABORTADA: fn_gan_validar_cabezas_transaccion desapareció (la 098 no debía tocarla).';
  END IF;

  RAISE NOTICE '098 OK: gan_lotes creada (RLS + 2 políticas, anon sin privilegios), lote_id/etapa/grupo_id en su lugar con FK y CHECK, 3 índices nuevos, fn_ganado_registrar_traslado_multi sigue INVOKER con search_path pineado y grants correctos, las otras dos RPC de la 097 intactas.';
END $$;


-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Sin pérdida de datos: esta migración no mueve ni un dato de gan_potreros
-- ni de gan_fincas. Los únicos valores que se pierden son los grupo_id que
-- ya se hayan estampado (se pueden regenerar corriendo la 100 de nuevo).
--
--   -- 1. Restaurar el cuerpo de fn_ganado_registrar_traslado_multi a la
--   --    versión de la 097 (sin grupo_id) -- copiar el cuerpo tal cual
--   --    vive en 097_ganado_reparto_multiple_potreros.sql.
--
--   -- 2. Quitar los índices, la FK, las 3 columnas y la tabla, en ese orden:
--   DROP INDEX IF EXISTS idx_gan_movimientos_grupo;
--   DROP INDEX IF EXISTS idx_gan_potreros_etapa;
--   DROP INDEX IF EXISTS idx_gan_potreros_lote;
--   ALTER TABLE gan_movimientos DROP COLUMN IF EXISTS grupo_id;
--   ALTER TABLE gan_potreros DROP CONSTRAINT IF EXISTS gan_potreros_etapa_check;
--   ALTER TABLE gan_potreros DROP COLUMN IF EXISTS etapa;
--   ALTER TABLE gan_potreros DROP CONSTRAINT IF EXISTS gan_potreros_lote_misma_finca;
--   ALTER TABLE gan_potreros DROP COLUMN IF EXISTS lote_id;
--   DROP TABLE IF EXISTS gan_lotes;
-- =============================================================================
