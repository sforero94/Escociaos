-- ============================================================================
-- 182_lotes_erradicados_activo_fecha -- ESCO-139 (PR 2 de 3, clase datos)
-- ============================================================================
-- ESCRITA, SIN APLICAR -- REQUIERE FECHAS DE SANTIAGO.
-- Tal como esta, ABORTA a proposito: las cinco fechas de erradicacion van en
-- NULL con un `-- TODO Santiago: fecha`, y la primera guarda exige que esten
-- todas. Las fechas no se adivinan: el PR trae la tabla de fechas candidatas
-- con su evidencia. Santiago llena las cinco en el PR y la aplica en vivo con
-- SUPABASE_APPLY_A_MIGRATION.
--
-- DEPENDE DE LA 181 (`lotes.fecha_erradicacion`). Sin ella aborta en la
-- pre-condicion.
--
-- DECISION (Santiago, 2026-10-12, en vivo):
--   «Ya activos solo quedan Piedra Paula, Salto, Australia y La Vega. Los demas
--    se erradicaron entre abril y junio. El analisis de costos deberia
--    prorratear esto.»
--
-- QUE HACE (5 filas de public.lotes, por id literal):
--   a. `activo = false` para 8. Irlanda, 9. Acueducto y 10. Santa Rosa
--      (hoy siguen en true).
--   b. `fecha_erradicacion = <fecha>` para 5. Pedregal, 6. La Union, 8, 9 y 10.
--
-- QUE NO HACE:
--   - NO toca `total_arboles` ni `arboles_*`: el prorrateo por arbol-dia del
--     PR 3 los necesita para los meses en que el lote si existia. Una guarda
--     posterior exige que queden identicos al respaldo.
--   - NO inventa el conteo historico de Pedregal y La Union. Hoy tienen 0
--     arboles; el conteo anterior se perdio. Con 0 arboles no reciben gasto
--     general en ningun periodo, tampoco en los meses en que producian. Es un
--     limite documentado, no algo que esta migracion arregle.
--   - NO toca los otros 4 lotes (guarda: su fila completa queda identica).
--
-- TRAZA: `lotes` no tiene triggers, asi que ni `globalgap_correcciones` (113)
-- ni `hato_correcciones` (084) registran este UPDATE. El respaldo
-- `respaldos.backup_182_lotes_erradicacion` (patron 081: esquema no expuesto,
-- RLS activa sin politicas, sin grants para anon/authenticated/PUBLIC) es el
-- unico registro del estado anterior.
--
-- EFECTO EN PANTALLA AL APLICARLA (leer antes de aplicar): 12 lectores de la
-- app filtran `lotes.activo = true`. Con esta migracion, Irlanda, Acueducto y
-- Santa Rosa dejan de aparecer en los selectores de monitoreo, labores,
-- conductividad y produccion, y en el costo por kilo (`useCostoKg.ts:83`)
-- desaparecen de TODOS los anos, 2025 incluido, hasta que se fusione el PR 3
-- (prorrateo por arbol-dia, que deja de filtrar por `activo`). Aplicar esta
-- migracion y fusionar el PR 3 en la misma sesion evita esa ventana.
--
-- ORDEN DE DESPLIEGUE:
--   1. 181 (columna).
--   2. Esta, con las cinco fechas llenas.
--   3. PR 3 (frontend). Idealmente en la misma sesion que el paso 2.
--
-- ROLLBACK (restaura las 5 filas desde el respaldo):
--   UPDATE public.lotes l
--      SET activo = b.activo,
--          fecha_erradicacion = b.fecha_erradicacion
--     FROM respaldos.backup_182_lotes_erradicacion b
--    WHERE l.id = b.id;
--   DROP TABLE respaldos.backup_182_lotes_erradicacion;
--
-- NO trae BEGIN;/COMMIT; -- apply_migration ya envuelve en una transaccion.
-- ============================================================================

DO $$
DECLARE
  -- -------------------------------------------------------------------------
  -- FECHAS DE ERRADICACION. Las unicas lineas que Santiago edita.
  -- Formato: DATE 'AAAA-MM-DD'. Mientras alguna quede en NULL, la migracion
  -- aborta en la primera guarda y no toca nada.
  -- -------------------------------------------------------------------------
  f_pedregal    date := NULL;  -- TODO Santiago: fecha (5. Pedregal)
  f_la_union    date := NULL;  -- TODO Santiago: fecha (6. La Union)
  f_irlanda     date := NULL;  -- TODO Santiago: fecha (8. Irlanda)
  f_acueducto   date := NULL;  -- TODO Santiago: fecha (9. Acueducto)
  f_santa_rosa  date := NULL;  -- TODO Santiago: fecha (10. Santa Rosa)

  -- Ids literales, leidos del catalogo vivo el 2026-10-16.
  c_pedregal   CONSTANT uuid := 'fa5864d0-85a7-4b6e-b222-c71417f5a6ee';
  c_la_union   CONSTANT uuid := 'ccdd4075-6a24-4d19-b345-e21a47e6a81e';
  c_irlanda    CONSTANT uuid := 'c1ce4ce0-76a7-4d8f-a320-36c7395613df';
  c_acueducto  CONSTANT uuid := '95ce6644-2fbe-4ff8-b5b8-3a3ec57bc0b6';
  c_santa_rosa CONSTANT uuid := '21da24a0-a420-4446-9b91-a59e234eb603';
  c_objetivo   uuid[];

  v_filas_antes   bigint;
  v_filas_despues bigint;
  v_otros_antes   text;
  v_otros_despues text;
  v_n             bigint;
  r               record;
BEGIN
  c_objetivo := ARRAY[c_pedregal, c_la_union, c_irlanda, c_acueducto, c_santa_rosa];

  -- -------------------------------------------------------------------------
  -- 0. Fechas: todas llenas y verosimiles
  -- -------------------------------------------------------------------------
  IF f_pedregal IS NULL OR f_la_union IS NULL OR f_irlanda IS NULL
     OR f_acueducto IS NULL OR f_santa_rosa IS NULL THEN
    RAISE EXCEPTION '182 ABORTADA: falta al menos una fecha de erradicacion. '
      'Santiago debe llenar las cinco (ver tabla de candidatas en el PR). No se toco nada.';
  END IF;
  IF LEAST(f_pedregal, f_la_union, f_irlanda, f_acueducto, f_santa_rosa) < DATE '2026-01-01'
     OR GREATEST(f_pedregal, f_la_union, f_irlanda, f_acueducto, f_santa_rosa) > current_date THEN
    RAISE EXCEPTION '182 ABORTADA: una fecha cae fuera de [2026-01-01, hoy]. '
      'Toda la evidencia de erradicacion es de 2026; revisar el valor tecleado.';
  END IF;

  -- -------------------------------------------------------------------------
  -- 1. Pre-condiciones
  -- -------------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'lotes'
       AND column_name = 'fecha_erradicacion'
  ) THEN
    RAISE EXCEPTION '182 ABORTADA: falta lotes.fecha_erradicacion -- aplicar la 181 primero.';
  END IF;
  IF to_regclass('respaldos.backup_182_lotes_erradicacion') IS NOT NULL THEN
    RAISE EXCEPTION '182 ABORTADA: respaldos.backup_182_lotes_erradicacion ya existe -- ¿ya se aplico?';
  END IF;

  -- Estado exacto que esta migracion asume, fila por fila.
  FOR r IN
    SELECT * FROM (VALUES
      (c_pedregal,   '5. Pedregal',    false,    0,    0,    0, 0,   0),
      (c_la_union,   '6. La Unión',    false,    0,    0,    0, 0,   0),
      (c_irlanda,    '8. Irlanda',     true,  1206,  500,  370, 0, 336),
      (c_acueducto,  '9. Acueducto',   true,  3184, 1859, 1238, 0,  87),
      (c_santa_rosa, '10. Santa Rosa', true,     7,    0,    0, 0,   7)
    ) AS e(id, nombre, activo, total, grandes, medianos, pequenos, clonales)
  LOOP
    SELECT count(*) INTO v_n
      FROM public.lotes l
     WHERE l.id = r.id
       AND l.nombre = r.nombre
       AND l.activo IS NOT DISTINCT FROM r.activo
       AND l.total_arboles IS NOT DISTINCT FROM r.total
       AND l.arboles_grandes IS NOT DISTINCT FROM r.grandes
       AND l.arboles_medianos IS NOT DISTINCT FROM r.medianos
       AND l.arboles_pequenos IS NOT DISTINCT FROM r.pequenos
       AND l.arboles_clonales IS NOT DISTINCT FROM r.clonales
       AND l.fecha_erradicacion IS NULL;
    IF v_n <> 1 THEN
      RAISE EXCEPTION '182 ABORTADA: el lote % (%) ya no esta en el estado que asume la migracion '
        '(nombre/activo/arboles/fecha_erradicacion NULL). Releer antes de aplicar.', r.nombre, r.id;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_filas_antes FROM public.lotes;
  SELECT md5(string_agg(to_jsonb(l)::text, '|' ORDER BY l.id)) INTO v_otros_antes
    FROM public.lotes l WHERE l.id <> ALL (c_objetivo);

  -- -------------------------------------------------------------------------
  -- 2. Respaldo (patron 081)
  -- -------------------------------------------------------------------------
  CREATE TABLE respaldos.backup_182_lotes_erradicacion AS
    SELECT l.*, now() AS respaldado_en
      FROM public.lotes l
     WHERE l.id = ANY (c_objetivo);
  ALTER TABLE respaldos.backup_182_lotes_erradicacion ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON respaldos.backup_182_lotes_erradicacion FROM PUBLIC, anon, authenticated;
  COMMENT ON TABLE respaldos.backup_182_lotes_erradicacion IS
    'Respaldo de la migracion 182 (ESCO-139): las 5 filas de public.lotes antes de marcar '
    'activo=false y fecha_erradicacion. Unico registro del estado anterior (lotes no tiene '
    'trigger de correcciones). Rollback al pie de la 182.';

  SELECT count(*) INTO v_n FROM respaldos.backup_182_lotes_erradicacion;
  IF v_n <> 5 THEN
    RAISE EXCEPTION '182 ABORTADA: el respaldo tiene % filas (se esperaban 5).', v_n;
  END IF;

  -- -------------------------------------------------------------------------
  -- 3. Cambios
  -- -------------------------------------------------------------------------
  UPDATE public.lotes
     SET activo = false
   WHERE id IN (c_irlanda, c_acueducto, c_santa_rosa)
     AND activo = true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 3 THEN
    RAISE EXCEPTION '182 ABORTADA: activo=false toco % filas (se esperaban 3).', v_n;
  END IF;

  UPDATE public.lotes l
     SET fecha_erradicacion = f.fecha
    FROM (VALUES
      (c_pedregal,   f_pedregal),
      (c_la_union,   f_la_union),
      (c_irlanda,    f_irlanda),
      (c_acueducto,  f_acueducto),
      (c_santa_rosa, f_santa_rosa)
    ) AS f(id, fecha)
   WHERE l.id = f.id
     AND l.fecha_erradicacion IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 5 THEN
    RAISE EXCEPTION '182 ABORTADA: fecha_erradicacion toco % filas (se esperaban 5).', v_n;
  END IF;

  -- -------------------------------------------------------------------------
  -- 4. Post-condiciones
  -- -------------------------------------------------------------------------
  SELECT count(*) INTO v_filas_despues FROM public.lotes;
  IF v_filas_despues <> v_filas_antes THEN
    RAISE EXCEPTION '182 ABORTADA: lotes paso de % a % filas.', v_filas_antes, v_filas_despues;
  END IF;

  SELECT md5(string_agg(to_jsonb(l)::text, '|' ORDER BY l.id)) INTO v_otros_despues
    FROM public.lotes l WHERE l.id <> ALL (c_objetivo);
  IF v_otros_despues IS DISTINCT FROM v_otros_antes THEN
    RAISE EXCEPTION '182 ABORTADA: cambio una fila de lotes fuera de las 5 objetivo.';
  END IF;

  -- Las 5: activo=false, fecha puesta, todo lo demas identico al respaldo.
  SELECT count(*) INTO v_n
    FROM public.lotes l
    JOIN respaldos.backup_182_lotes_erradicacion b ON b.id = l.id
   WHERE l.activo = false
     AND l.fecha_erradicacion IS NOT NULL
     AND l.nombre = b.nombre
     AND l.numero_orden IS NOT DISTINCT FROM b.numero_orden
     AND l.area_hectareas IS NOT DISTINCT FROM b.area_hectareas
     AND l.total_arboles IS NOT DISTINCT FROM b.total_arboles
     AND l.arboles_grandes IS NOT DISTINCT FROM b.arboles_grandes
     AND l.arboles_medianos IS NOT DISTINCT FROM b.arboles_medianos
     AND l.arboles_pequenos IS NOT DISTINCT FROM b.arboles_pequenos
     AND l.arboles_clonales IS NOT DISTINCT FROM b.arboles_clonales
     AND l.fecha_siembra IS NOT DISTINCT FROM b.fecha_siembra;
  IF v_n <> 5 THEN
    RAISE EXCEPTION '182 ABORTADA: solo % de las 5 filas quedaron como se esperaba.', v_n;
  END IF;

  -- Activos: exactamente los 4 vivos de la decision.
  SELECT count(*) INTO v_n FROM public.lotes
   WHERE activo = true AND id <> ALL (c_objetivo);
  IF v_n <> (SELECT count(*) FROM public.lotes WHERE activo = true) THEN
    RAISE EXCEPTION '182 ABORTADA: queda un lote objetivo con activo=true.';
  END IF;

  -- Respaldo cerrado al navegador.
  IF NOT (SELECT relrowsecurity FROM pg_class
           WHERE oid = 'respaldos.backup_182_lotes_erradicacion'::regclass) THEN
    RAISE EXCEPTION '182 ABORTADA: el respaldo quedo sin RLS.';
  END IF;
  IF has_table_privilege('anon', 'respaldos.backup_182_lotes_erradicacion', 'SELECT')
     OR has_table_privilege('authenticated', 'respaldos.backup_182_lotes_erradicacion', 'SELECT') THEN
    RAISE EXCEPTION '182 ABORTADA: anon o authenticated pueden leer el respaldo.';
  END IF;

  RAISE NOTICE '182 OK: 3 lotes pasan a activo=false, 5 con fecha_erradicacion; arboles intactos.';
END
$$;
