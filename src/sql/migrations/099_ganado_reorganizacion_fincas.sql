-- =====================================================================
-- 099: Ganado — reorganización de fincas (9 -> 4) y siembra de lote/etapa
--      sobre los 34 potreros (Apéndice A).
--
-- Plan: docs/plan_ganado_inventario_v2_implementacion.md §5.2 y Apéndice A.
-- REQUIERE la 098 aplicada (usa gan_potreros.lote_id / .etapa y la tabla
-- gan_lotes).
--
-- ES LA MIGRACIÓN RIESGOSA DEL PLAN: mueve datos de producción. No mueve
-- NINGÚN ANIMAL -- los potreros cambian de finca, los movimientos y el
-- inventario referencian potrero_id, que no cambia -- pero sí reasigna
-- finca_id, crea una finca, siembra ~20 lotes, desactiva 4 fincas y borra
-- físicamente 2. Guardas RAISE EXCEPTION antes y después (patrón
-- 075/080/081): si algo no cuadra exactamente con lo verificado en
-- producción el 2026-08-17, la transacción entera se cae y no se mueve
-- nada.
--
-- DECISIONES DEL DUEÑO QUE ESTA MIGRACIÓN EJECUTA (§1 del plan, cerradas,
-- no rediseñar):
--   - Escocia absorbe los potreros de Maryland (1) y Mochuelos (2) ->
--     20 potreros, 238 cabezas. Maryland y Mochuelos pasan a ser LOTES
--     de Escocia.
--   - Finca nueva Supatá (ubicación Supata) recibe los potreros de
--     Carrizal (5) y Andalucia (3) -> 8 potreros, 64 cabezas. Lotes:
--     La Joya, Andalucía, Carrizal.
--   - santimp queda igual, con ese nombre -- no se renombra.
--   - Macondo queda inactiva (ya lo estaba).
--   - "Escocia (lote)" y "aumento emilio" se borran físicamente (0
--     potreros, 0 movimientos, re-verificado inmediatamente antes del
--     DELETE).
--   - Maryland, Mochuelos, Carrizal y Andalucia quedan sin potreros y se
--     desactivan (no se borran: tuvieron movimientos e historia).
--   - Excepciones de mapeo confirmadas por el dueño: "Peña Blanca" y
--     "Peña Blanca Repele" pertenecen al lote Carrizal (no al lote "Peña
--     Blanca" que derivaría el nombre); "Peña Blanca" tiene etapa ceba.
--     Los 4 potreros "General" quedan sin lote, sin etapa, inactivos.
--     Bosque/Quebradas/Colinas/Los Olivos quedan sin etapa (56 cabezas).
--
-- COLISIÓN QUE ESTA MIGRACIÓN RESUELVE ANTES DE REASIGNAR: Carrizal y
-- Andalucia tienen cada una un potrero llamado "General", y ambas van a
-- la finca Supatá. gan_potreros_finca_id_nombre_key es un ÍNDICE ÚNICO
-- sobre (finca_id, nombre) -- no aparece en pg_constraint porque no es una
-- constraint -- y activo = false NO exime de él. Se renombran ambos
-- ("General (Carrizal)" / "General (Andalucía)") ANTES del UPDATE de
-- finca_id, en la misma transacción. Es el único renombre de potrero de
-- toda esta migración; no toca ningún id.
--
-- NÚMEROS DE REFERENCIA (línea base de TODAS las guardas, verificados en
-- producción 2026-08-17 -- ver también §1/§1-bis del plan, re-basados
-- después de la migración 097/PR #124):
--   369 cabezas · 3 ubicaciones · 9 fincas · 34 potreros · 53 movimientos
--   · 0 pendientes.
--   Por finca hoy: Escocia 197 (17 potreros), santimp 67 (6), Carrizal 45
--   (5), Mochuelos 23 (2), Andalucia 19 (3), Maryland 18 (1).
--   Tras la reorganización: Escocia 238 (20 potreros), Supatá 64 (8),
--   santimp 67 (6) -> 369.
--   NOTA: el propio plan (§5.2, tabla de guardas C5) trae "Escocia (17,
--   216)" para el estado PRE-reorganización -- es un número obsoleto de
--   un borrador anterior del documento; el volcado real de Apéndice A
--   (y la verificación de producción del 2026-08-17) dan 197, no 216.
--   Esta migración usa 197. Mismo caso con "49 movimientos" en esa misma
--   sección del plan -- el número correcto, re-basado post-097 en §1-bis,
--   es 53; esta migración usa 53.
--
-- RESPALDOS en el esquema `respaldos`, JAMÁS en `public` (081: un
-- CREATE TABLE public.backup_* hereda el ALTER DEFAULT PRIVILEGES de
-- Supabase y publica el respaldo a `anon` sin RLS). RLS habilitada y sin
-- políticas (deny-all) en las tres, igual que backup_080/081.
--
-- IDEMPOTENTE: si la finca Supatá ya existe y todos los potreros activos
-- ya tienen lote_id, la migración emite RAISE NOTICE y sale sin error
-- (early return dentro del bloque). Si Supatá existe pero el estado es
-- intermedio (no debería pasar nunca -- solo esta migración crea esa
-- finca, y lo hace después de pasar todas las guardas), aborta en vez de
-- adivinar.
--
-- Corre completo de una sola vez (sin BEGIN/COMMIT explícitos, igual que
-- 075/076/077/080/081/082/098): un solo RAISE EXCEPTION en cualquier
-- punto deshace TODO, incluidos los respaldos recién creados.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. Esquema de respaldos (creado por 081; se asegura por si acaso,
--    mismo patrón que 095).
-- ---------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS respaldos;
REVOKE ALL ON SCHEMA respaldos FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA respaldos TO service_role;

-- Snapshots completos ANTES de tocar nada. CREATE TABLE IF NOT EXISTS es
-- idempotente a propósito: si esta migración ya corrió una vez, una
-- segunda corrida NO debe pisar el respaldo original con el estado YA
-- reorganizado.
CREATE TABLE IF NOT EXISTS respaldos.backup_099_gan_potreros AS
  SELECT id, nombre, finca_id, activo, lote_id, etapa FROM gan_potreros;
CREATE TABLE IF NOT EXISTS respaldos.backup_099_gan_fincas AS
  SELECT id, nombre, ubicacion_id, hectareas, activa FROM gan_fincas;
CREATE TABLE IF NOT EXISTS respaldos.backup_099_gan_inventario AS
  SELECT potrero_id, novillos, toros, peso_promedio_kg FROM gan_inventario;

ALTER TABLE respaldos.backup_099_gan_potreros ENABLE ROW LEVEL SECURITY;
ALTER TABLE respaldos.backup_099_gan_fincas ENABLE ROW LEVEL SECURITY;
ALTER TABLE respaldos.backup_099_gan_inventario ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE respaldos.backup_099_gan_potreros IS
  'Snapshot de gan_potreros (id, nombre, finca_id, activo, lote_id, etapa) '
  'tomado por la migración 099 antes de reorganizar fincas. Fuente del '
  'ROLLBACK documentado al pie de 099.';
COMMENT ON TABLE respaldos.backup_099_gan_fincas IS
  'Snapshot de gan_fincas tomado por la migración 099 antes de borrar '
  '"Escocia (lote)" y "aumento emilio" y de desactivar Maryland/Mochuelos/'
  'Carrizal/Andalucia. Incluye los ids originales para re-insertar sin '
  'dejar nada colgando en un ROLLBACK.';
COMMENT ON TABLE respaldos.backup_099_gan_inventario IS
  'Snapshot de gan_inventario tomado por la migración 099. La '
  'reorganización NO debe tocar el inventario -- esta tabla es la línea '
  'base contra la que la guarda de cierre lo verifica.';


-- ---------------------------------------------------------------------
-- El resto de la migración corre dentro de un único bloque PL/pgSQL para
-- poder hacer un RETURN real de idempotencia (§ idempotencia arriba).
-- DDL/DML plano (CREATE TABLE, ALTER TABLE, INSERT/UPDATE/DELETE) corre
-- directo dentro de DO sin necesitar EXECUTE dinámico -- mismo mecanismo
-- que usa la 081 para su ALTER TABLE ... SET SCHEMA condicional.
-- ---------------------------------------------------------------------

DO $$
DECLARE
  -- Idempotencia
  v_supata_existe       boolean;
  v_activos_sin_lote     integer;
  -- Mapeo (Apéndice A)
  v_mapeo_total          integer;
  v_resueltos            integer;
  -- Colisiones de re-parentado
  v_dupes_total          integer;
  v_dupes_general        integer;
  -- Guardas previas §1
  v_ubicaciones          integer;
  v_fincas               integer;
  v_potreros             integer;
  v_movimientos          integer;
  v_cabezas_totales      integer;
  v_finca_mismatch       integer;
  v_fincas_basura        integer;
  v_mov_huerfanos        integer;
  v_supata_previa        integer;
  -- Mutaciones
  v_insertados           integer;
  v_renombrados          integer;
  v_reparentados          integer;
  v_lotes_creados        integer;
  v_asignados            integer;
  v_generales_desact     integer;
  v_fincas_desact        integer;
  v_borradas             integer;
  v_tx_huerfanas         integer;
  v_check_potreros       integer;
  -- Cierre §10
  v_c1                   integer;
  v_c2a                  integer;
  v_c2b                  integer;
  v_c3                   integer;
  v_c4_total             integer;
  v_c4_activas           integer;
  v_c4_inactivas         integer;
  v_c5                   integer;
  v_c6                   integer;
  v_c7                   integer;
  v_c8                   integer;
  v_c9                   integer;
  v_c10                  integer;
  v_c11                  integer;
BEGIN
  -- =====================================================================
  -- Idempotencia: si Supatá ya existe, esta migración ya corrió.
  -- =====================================================================
  SELECT EXISTS (SELECT 1 FROM gan_fincas WHERE lower(nombre) = lower('Supatá'))
    INTO v_supata_existe;

  IF v_supata_existe THEN
    SELECT count(*) INTO v_activos_sin_lote
      FROM gan_potreros WHERE activo = true AND lote_id IS NULL;

    IF v_activos_sin_lote = 0 THEN
      RAISE NOTICE '099: la finca Supatá ya existe y todos los potreros activos tienen lote_id -- la migración ya corrió. Nada que hacer.';
      RETURN;
    ELSE
      RAISE EXCEPTION '099 ABORTADA: la finca Supatá ya existe pero % potrero(s) activo(s) no tienen lote_id -- estado intermedio inesperado (no debería poder pasar). Revisar a mano antes de reintentar.', v_activos_sin_lote;
    END IF;
  END IF;

  -- =====================================================================
  -- Apéndice A -- mapeo literal y auditable de los 34 potreros. Lista
  -- literal, no una expresión regular en SQL (§5.2 del plan): una regex
  -- que se equivoca asigna una etapa mal en silencio; esta lista es lo
  -- que las guardas de cierre pueden contar línea por línea.
  -- =====================================================================
  CREATE TEMP TABLE gan_099_mapeo (
    n                 INTEGER PRIMARY KEY,
    finca_actual      TEXT NOT NULL,
    potrero           TEXT NOT NULL,
    finca_destino     TEXT NOT NULL,
    lote              TEXT,
    etapa             TEXT CHECK (etapa IN ('terneros', 'levante', 'ceba', 'repele')),
    cabezas_esperadas INTEGER NOT NULL
  );

  INSERT INTO gan_099_mapeo (n, finca_actual, potrero, finca_destino, lote, etapa, cabezas_esperadas) VALUES
    ( 1, 'Escocia',   'Bosque',                'Escocia', 'Bosque',        NULL,          19),
    ( 2, 'Escocia',   'Escocia ceba',          'Escocia', 'Escocia',       'ceba',        12),
    ( 3, 'Escocia',   'Escocia repele',        'Escocia', 'Escocia',       'repele',      10),
    ( 4, 'Escocia',   'General',               'Escocia', NULL,            NULL,           0),
    ( 5, 'Escocia',   'La Molina Ceba',        'Escocia', 'La Molina',     'ceba',        11),
    ( 6, 'Escocia',   'La Molina Repele',      'Escocia', 'La Molina',     'repele',       8),
    ( 7, 'Escocia',   'Normandía Ceba',        'Escocia', 'Normandía',     'ceba',        10),
    ( 8, 'Escocia',   'Normandía Repele',      'Escocia', 'Normandía',     'repele',       8),
    ( 9, 'Escocia',   'Piedra Gorda Ceba',     'Escocia', 'Piedra Gorda',  'ceba',        11),
    (10, 'Escocia',   'Piedra Gorda Repele',   'Escocia', 'Piedra Gorda',  'repele',       8),
    (11, 'Escocia',   'Quebradas',             'Escocia', 'Quebradas',     NULL,          13),
    (12, 'Escocia',   'Sierra Morena Ceba',    'Escocia', 'Sierra Morena', 'ceba',        10),
    (13, 'Escocia',   'Sierra Morena Repele',  'Escocia', 'Sierra Morena', 'repele',       8),
    (14, 'Escocia',   'Terneros Cedral',       'Escocia', 'Cedral',        'terneros',    23),
    (15, 'Escocia',   'Terneros Pedregal',     'Escocia', 'Pedregal',      'terneros',    12),
    (16, 'Escocia',   'Terneros Rancho',       'Escocia', 'Rancho',        'terneros',    15),
    (17, 'Escocia',   'Terneros San Juan',     'Escocia', 'San Juan',      'terneros',    19),
    (18, 'Maryland',  'Terneros Maryland',     'Escocia', 'Maryland',      'terneros',    18),
    (19, 'Mochuelos', 'Mochuelos Ceba',        'Escocia', 'Mochuelos',     'ceba',        12),
    (20, 'Mochuelos', 'Mochuelos Repele',      'Escocia', 'Mochuelos',     'repele',      11),
    (21, 'Carrizal',  'La Joya Ceba',          'Supatá',  'La Joya',       'ceba',        13),
    (22, 'Carrizal',  'La Joya Repele',        'Supatá',  'La Joya',       'repele',      11),
    (23, 'Carrizal',  'Peña Blanca',           'Supatá',  'Carrizal',      'ceba',        12),
    (24, 'Carrizal',  'Peña Blanca Repele',    'Supatá',  'Carrizal',      'repele',       9),
    (25, 'Carrizal',  'General',               'Supatá',  NULL,            NULL,           0),
    (26, 'Andalucia', 'Andalucía Ceba',        'Supatá',  'Andalucía',     'ceba',        12),
    (27, 'Andalucia', 'Andalucia Repele',      'Supatá',  'Andalucía',     'repele',       7),
    (28, 'Andalucia', 'General',               'Supatá',  NULL,            NULL,           0),
    (29, 'santimp',   'Colinas',               'santimp', 'Colinas',       NULL,          12),
    (30, 'santimp',   'Cortijo Ceba',          'santimp', 'Cortijo',       'ceba',        12),
    (31, 'santimp',   'Cortijo Repele',        'santimp', 'Cortijo',       'repele',      11),
    (32, 'santimp',   'Encantado Levante',     'santimp', 'Encantado',     'levante',     20),
    (33, 'santimp',   'General',               'santimp', NULL,            NULL,           0),
    (34, 'santimp',   'Los Olivos',            'santimp', 'Los Olivos',    NULL,          12);

  -- =====================================================================
  -- §1 -- Guardas previas. Cualquier falla aborta TODA la transacción.
  -- =====================================================================

  -- 1.1 Conteos globales.
  SELECT count(*) INTO v_ubicaciones FROM gan_ubicaciones;
  SELECT count(*) INTO v_fincas FROM gan_fincas;
  SELECT count(*) INTO v_potreros FROM gan_potreros;
  SELECT count(*) INTO v_movimientos FROM gan_movimientos;
  SELECT COALESCE(sum(novillos + toros), 0) INTO v_cabezas_totales FROM gan_inventario;

  IF v_ubicaciones <> 3 OR v_fincas <> 9 OR v_potreros <> 34 OR v_movimientos <> 53 THEN
    RAISE EXCEPTION '099 ABORTADA: estado global es (ubicaciones=%, fincas=%, potreros=%, movimientos=%), se esperaba (3, 9, 34, 53). Producción divergió desde la verificación del 2026-08-17 -- revisar a mano.',
      v_ubicaciones, v_fincas, v_potreros, v_movimientos;
  END IF;
  IF v_cabezas_totales <> 369 THEN
    RAISE EXCEPTION '099 ABORTADA: el inventario tiene % cabezas en total, se esperaban 369.', v_cabezas_totales;
  END IF;

  -- 1.2 Las 6 fincas con ganado tienen exactamente (potreros, cabezas).
  WITH esperado(finca, potreros_esp, cabezas_esp) AS (
    VALUES
      ('Escocia',   17, 197),
      ('santimp',    6,  67),
      ('Carrizal',   5,  45),
      ('Mochuelos',  2,  23),
      ('Andalucia',  3,  19),
      ('Maryland',   1,  18)
  ),
  real AS (
    SELECT f.nombre AS finca,
           count(p.id) AS potreros_real,
           COALESCE(sum(COALESCE(i.novillos, 0) + COALESCE(i.toros, 0)), 0) AS cabezas_real
      FROM gan_fincas f
      JOIN gan_potreros p ON p.finca_id = f.id
      LEFT JOIN gan_inventario i ON i.potrero_id = p.id
     WHERE f.nombre IN (SELECT finca FROM esperado)
     GROUP BY f.nombre
  )
  SELECT count(*) INTO v_finca_mismatch
    FROM esperado e
    LEFT JOIN real r ON r.finca = e.finca
   WHERE COALESCE(r.potreros_real, 0) <> e.potreros_esp
      OR COALESCE(r.cabezas_real, 0) <> e.cabezas_esp;

  IF v_finca_mismatch <> 0 THEN
    RAISE EXCEPTION '099 ABORTADA: % de las 6 fincas con ganado no coinciden con (potreros, cabezas) esperado (Escocia 17/197, santimp 6/67, Carrizal 5/45, Mochuelos 2/23, Andalucia 3/19, Maryland 1/18). Revisar a mano.', v_finca_mismatch;
  END IF;

  -- 1.3 "Escocia (lote)", "aumento emilio" y Macondo existen con 0 potreros.
  SELECT count(*) INTO v_fincas_basura
    FROM gan_fincas f
   WHERE f.nombre IN ('Escocia (lote)', 'aumento emilio', 'Macondo')
     AND NOT EXISTS (SELECT 1 FROM gan_potreros p WHERE p.finca_id = f.id);
  IF v_fincas_basura <> 3 THEN
    RAISE EXCEPTION '099 ABORTADA: se esperaban exactamente 3 fincas ("Escocia (lote)", "aumento emilio", "Macondo") con 0 potreros, se encontraron %.', v_fincas_basura;
  END IF;

  -- 1.4 "Escocia (lote)" y "aumento emilio" tienen 0 movimientos (por potrero).
  SELECT count(*) INTO v_mov_huerfanos
    FROM gan_movimientos m
    JOIN gan_potreros p ON p.id IN (m.potrero_origen_id, m.potrero_destino_id)
    JOIN gan_fincas f ON f.id = p.finca_id
   WHERE f.nombre IN ('Escocia (lote)', 'aumento emilio');
  IF v_mov_huerfanos <> 0 THEN
    RAISE EXCEPTION '099 ABORTADA: "Escocia (lote)"/"aumento emilio" tienen % movimiento(s) asociado(s) vía potrero -- no deberían tener ninguno para poder borrarse.', v_mov_huerfanos;
  END IF;

  -- 1.5 No existe ya una finca "Supatá"/"Supata".
  SELECT count(*) INTO v_supata_previa
    FROM gan_fincas WHERE lower(nombre) IN (lower('Supatá'), lower('Supata'));
  IF v_supata_previa <> 0 THEN
    RAISE EXCEPTION '099 ABORTADA: ya existe % finca(s) con nombre "Supatá"/"Supata". Investigar antes de crear una nueva.', v_supata_previa;
  END IF;

  -- 1.6 El mapeo del Apéndice A tiene exactamente 34 filas.
  SELECT count(*) INTO v_mapeo_total FROM gan_099_mapeo;
  IF v_mapeo_total <> 34 THEN
    RAISE EXCEPTION '099 ABORTADA: el mapeo del Apéndice A tiene % filas, se esperaban exactamente 34.', v_mapeo_total;
  END IF;

  -- 1.7 Cada (finca_actual, potrero) resuelve a EXACTAMENTE un potrero.
  SELECT count(*) INTO v_resueltos
    FROM gan_099_mapeo m
    JOIN gan_fincas fo ON lower(fo.nombre) = lower(m.finca_actual)
    JOIN gan_potreros p ON p.finca_id = fo.id AND p.nombre = m.potrero;
  IF v_resueltos <> 34 THEN
    RAISE EXCEPTION '099 ABORTADA: solo % de las 34 filas del Apéndice A resuelven a exactamente un potrero existente (0 o 2+ matches en alguna). Revisar nombres/tildes contra la base.', v_resueltos;
  END IF;

  -- 1.8 Sin colisiones de re-parentado, salvo la única esperada: los dos
  --     potreros "General" (Carrizal + Andalucia) van ambos a Supatá.
  WITH movidos AS (
    SELECT m.finca_destino, m.potrero AS nombre
      FROM gan_099_mapeo m
      JOIN gan_fincas fo ON lower(fo.nombre) = lower(m.finca_actual)
     WHERE lower(m.finca_actual) <> lower(m.finca_destino)
  ),
  existentes AS (
    SELECT fd.nombre AS finca_destino, p.nombre
      FROM gan_potreros p
      JOIN gan_fincas fd ON fd.id = p.finca_id
     WHERE fd.nombre = 'Escocia'  -- Supatá aún no existe en este punto
  ),
  combinado AS (
    SELECT * FROM movidos
    UNION ALL
    SELECT * FROM existentes
  ),
  dupes AS (
    SELECT finca_destino, nombre, count(*) AS n
      FROM combinado
     GROUP BY 1, 2
    HAVING count(*) > 1
  )
  SELECT count(*), count(*) FILTER (WHERE nombre = 'General' AND n = 2)
    INTO v_dupes_total, v_dupes_general
    FROM dupes;

  IF v_dupes_total <> 1 OR v_dupes_general <> 1 THEN
    RAISE EXCEPTION '099 ABORTADA: colisiones de re-parentado inesperadas (% grupo(s) totales, % son "General" x2). Se esperaba exactamente 1: Carrizal + Andalucia -> Supatá, ambos "General".', v_dupes_total, v_dupes_general;
  END IF;

  RAISE NOTICE '099: guardas previas OK -- 369 cabezas, 34 potreros resueltos, 1 colisión esperada ("General" x2). Procediendo.';

  -- =====================================================================
  -- §2 -- Crear la finca Supatá en la ubicación Supata (resuelta por
  --       nombre, no por uuid literal).
  -- =====================================================================
  INSERT INTO gan_fincas (nombre, ubicacion_id, hectareas, activa)
  SELECT 'Supatá', u.id, 0, true
    FROM gan_ubicaciones u
   WHERE lower(u.nombre) = lower('Supata');

  GET DIAGNOSTICS v_insertados = ROW_COUNT;
  IF v_insertados <> 1 THEN
    RAISE EXCEPTION '099 ABORTADA: no se pudo crear la finca Supatá (ubicación "Supata" no encontrada en gan_ubicaciones, o ya existía).';
  END IF;

  -- =====================================================================
  -- §3 -- Renombrar los dos "General" colisionantes, y re-parentar los
  --       11 potreros que cambian de finca.
  -- =====================================================================

  UPDATE gan_potreros p
     SET nombre = 'General (Carrizal)'
    FROM gan_fincas f
   WHERE p.finca_id = f.id AND lower(f.nombre) = lower('Carrizal') AND p.nombre = 'General';
  GET DIAGNOSTICS v_renombrados = ROW_COUNT;
  IF v_renombrados <> 1 THEN
    RAISE EXCEPTION '099 ABORTADA: se renombraron % fila(s) de "Carrizal"/"General", se esperaba exactamente 1.', v_renombrados;
  END IF;

  UPDATE gan_potreros p
     SET nombre = 'General (Andalucía)'
    FROM gan_fincas f
   WHERE p.finca_id = f.id AND lower(f.nombre) = lower('Andalucia') AND p.nombre = 'General';
  GET DIAGNOSTICS v_renombrados = ROW_COUNT;
  IF v_renombrados <> 1 THEN
    RAISE EXCEPTION '099 ABORTADA: se renombraron % fila(s) de "Andalucia"/"General", se esperaba exactamente 1.', v_renombrados;
  END IF;

  UPDATE gan_potreros p
     SET finca_id = fd.id
    FROM gan_099_mapeo m
    JOIN gan_fincas fo ON lower(fo.nombre) = lower(m.finca_actual)
    JOIN gan_fincas fd ON lower(fd.nombre) = lower(m.finca_destino)
   WHERE p.finca_id = fo.id
     AND p.nombre = CASE
                       WHEN m.finca_actual = 'Carrizal'  AND m.potrero = 'General' THEN 'General (Carrizal)'
                       WHEN m.finca_actual = 'Andalucia' AND m.potrero = 'General' THEN 'General (Andalucía)'
                       ELSE m.potrero
                     END
     AND lower(m.finca_actual) <> lower(m.finca_destino);

  GET DIAGNOSTICS v_reparentados = ROW_COUNT;
  IF v_reparentados <> 11 THEN
    RAISE EXCEPTION '099 ABORTADA: se re-parentaron % potrero(s), se esperaban exactamente 11 (Maryland 1 + Mochuelos 2 + Carrizal 5 + Andalucia 3).', v_reparentados;
  END IF;

  -- =====================================================================
  -- §4 -- Sembrar gan_lotes: un lote distinto por cada (finca_destino,
  --       lote) no nulo del Apéndice A, con la finca_id YA re-parentada.
  -- =====================================================================
  INSERT INTO gan_lotes (finca_id, nombre, activo)
  SELECT DISTINCT fd.id, m.lote, true
    FROM gan_099_mapeo m
    JOIN gan_fincas fd ON lower(fd.nombre) = lower(m.finca_destino)
   WHERE m.lote IS NOT NULL
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_lotes_creados = ROW_COUNT;
  IF v_lotes_creados <> 20 THEN
    RAISE EXCEPTION '099 ABORTADA: se sembraron % lote(s), se esperaban exactamente 20 (Escocia 13, Supatá 3, santimp 4).', v_lotes_creados;
  END IF;

  -- =====================================================================
  -- §5 -- Asignar lote_id y etapa a los 34 potreros.
  -- =====================================================================
  UPDATE gan_potreros p
     SET lote_id = gl.id,
         etapa   = m.etapa
    FROM gan_099_mapeo m
    JOIN gan_fincas fd ON lower(fd.nombre) = lower(m.finca_destino)
    LEFT JOIN gan_lotes gl
      ON gl.finca_id = fd.id AND lower(btrim(gl.nombre)) = lower(btrim(m.lote))
   WHERE p.finca_id = fd.id
     AND p.nombre = CASE
                       WHEN m.finca_actual = 'Carrizal'  AND m.potrero = 'General' THEN 'General (Carrizal)'
                       WHEN m.finca_actual = 'Andalucia' AND m.potrero = 'General' THEN 'General (Andalucía)'
                       ELSE m.potrero
                     END;

  GET DIAGNOSTICS v_asignados = ROW_COUNT;
  IF v_asignados <> 34 THEN
    RAISE EXCEPTION '099 ABORTADA: se asignó lote_id/etapa a % potrero(s), se esperaban exactamente 34.', v_asignados;
  END IF;

  -- =====================================================================
  -- §6 -- Desactivar los 4 potreros "General" (0 cabezas cada uno).
  -- =====================================================================
  UPDATE gan_potreros p
     SET activo = false
    FROM gan_099_mapeo m
    JOIN gan_fincas fd ON lower(fd.nombre) = lower(m.finca_destino)
   WHERE p.finca_id = fd.id
     AND m.potrero = 'General'
     AND p.nombre = CASE
                       WHEN m.finca_actual = 'Carrizal'  THEN 'General (Carrizal)'
                       WHEN m.finca_actual = 'Andalucia' THEN 'General (Andalucía)'
                       ELSE m.potrero
                     END;

  GET DIAGNOSTICS v_generales_desact = ROW_COUNT;
  IF v_generales_desact <> 4 THEN
    RAISE EXCEPTION '099 ABORTADA: se desactivaron % potrero(s) "General", se esperaban exactamente 4.', v_generales_desact;
  END IF;

  -- =====================================================================
  -- §7 -- Desactivar Maryland, Mochuelos, Carrizal y Andalucia (ya sin
  --       potreros).
  -- =====================================================================
  UPDATE gan_fincas
     SET activa = false
   WHERE lower(nombre) IN (lower('Maryland'), lower('Mochuelos'), lower('Carrizal'), lower('Andalucia'));

  GET DIAGNOSTICS v_fincas_desact = ROW_COUNT;
  IF v_fincas_desact <> 4 THEN
    RAISE EXCEPTION '099 ABORTADA: se desactivaron % finca(s), se esperaban exactamente 4 (Maryland, Mochuelos, Carrizal, Andalucia).', v_fincas_desact;
  END IF;

  -- =====================================================================
  -- §8 -- Macondo a inactiva (ya lo estaba; UPDATE idempotente).
  -- =====================================================================
  UPDATE gan_fincas SET activa = false WHERE lower(nombre) = lower('Macondo') AND activa = true;

  -- =====================================================================
  -- §9 -- Borrar físicamente "Escocia (lote)" y "aumento emilio".
  --       Re-verificación INMEDIATAMENTE antes del DELETE.
  -- =====================================================================
  SELECT count(*) INTO v_check_potreros
    FROM gan_potreros p
    JOIN gan_fincas f ON f.id = p.finca_id
   WHERE lower(f.nombre) IN (lower('Escocia (lote)'), lower('aumento emilio'));

  IF v_check_potreros <> 0 THEN
    RAISE EXCEPTION '099 ABORTADA: "Escocia (lote)"/"aumento emilio" tienen % potrero(s) justo antes del DELETE -- no deberían tener ninguno.', v_check_potreros;
  END IF;

  -- Informativo, NO bloqueante: fin_transacciones_ganado.finca es texto
  -- libre sin FK, así que las transacciones históricas conservan su texto
  -- intacto -- lo único que se pierde es la opción en el dropdown del
  -- formulario de finanzas.
  SELECT count(*) INTO v_tx_huerfanas
    FROM fin_transacciones_ganado
   WHERE lower(finca) IN (lower('Escocia (lote)'), lower('aumento emilio'));
  RAISE NOTICE '099: % transacción(es) histórica(s) de finanzas mencionan "Escocia (lote)"/"aumento emilio" en texto libre; no se tocan (finca es texto sin FK).', v_tx_huerfanas;

  DELETE FROM gan_fincas WHERE lower(nombre) IN (lower('Escocia (lote)'), lower('aumento emilio'));
  GET DIAGNOSTICS v_borradas = ROW_COUNT;
  IF v_borradas <> 2 THEN
    RAISE EXCEPTION '099 ABORTADA: se esperaba borrar exactamente 2 fincas ("Escocia (lote)" y "aumento emilio"), se borraron %.', v_borradas;
  END IF;

  -- =====================================================================
  -- §10 -- Guardas de cierre. Todas dentro de la misma transacción.
  -- =====================================================================

  -- C1: total de cabezas idéntico al de antes -- la reorganización no
  --     mueve ni un animal.
  SELECT COALESCE(sum(novillos + toros), 0) INTO v_c1 FROM gan_inventario;
  IF v_c1 <> 369 THEN
    RAISE EXCEPTION '099 ABORTADA (C1): el total de cabezas tras la reorganización es %, se esperaban 369.', v_c1;
  END IF;

  -- C2: siguen existiendo los mismos 34 potreros (mismos ids).
  SELECT count(*) INTO v_c2a FROM gan_potreros;
  SELECT count(*) INTO v_c2b
    FROM gan_potreros p
   WHERE NOT EXISTS (SELECT 1 FROM respaldos.backup_099_gan_potreros b WHERE b.id = p.id);
  IF v_c2a <> 34 OR v_c2b <> 0 THEN
    RAISE EXCEPTION '099 ABORTADA (C2): % potreros existen (esperados 34), % no están en el respaldo original (esperados 0) -- no deben crearse ni borrarse potreros.', v_c2a, v_c2b;
  END IF;

  -- C3: el log de movimientos no se tocó.
  SELECT count(*) INTO v_c3 FROM gan_movimientos;
  IF v_c3 <> 53 THEN
    RAISE EXCEPTION '099 ABORTADA (C3): gan_movimientos tiene % filas, se esperaban 53 -- la reorganización no debe tocar el log.', v_c3;
  END IF;

  -- C4: 8 fincas (9 - 2 borradas + 1 nueva); 3 activas, 5 inactivas.
  SELECT count(*), count(*) FILTER (WHERE activa), count(*) FILTER (WHERE NOT activa)
    INTO v_c4_total, v_c4_activas, v_c4_inactivas
    FROM gan_fincas;
  IF v_c4_total <> 8 OR v_c4_activas <> 3 OR v_c4_inactivas <> 5 THEN
    RAISE EXCEPTION '099 ABORTADA (C4): % finca(s) total, % activa(s), % inactiva(s) -- se esperaban 8/3/5.', v_c4_total, v_c4_activas, v_c4_inactivas;
  END IF;

  -- C5: cabezas por finca activa == lo que arroja el Apéndice A.
  WITH esperado AS (
    SELECT finca_destino AS finca, count(*) AS potreros_esp, sum(cabezas_esperadas) AS cabezas_esp
      FROM gan_099_mapeo
     GROUP BY finca_destino
  ),
  real AS (
    SELECT f.nombre AS finca, count(p.id) AS potreros_real,
           COALESCE(sum(COALESCE(i.novillos, 0) + COALESCE(i.toros, 0)), 0) AS cabezas_real
      FROM gan_fincas f
      JOIN gan_potreros p ON p.finca_id = f.id
      LEFT JOIN gan_inventario i ON i.potrero_id = p.id
     WHERE f.activa
     GROUP BY f.nombre
  )
  SELECT count(*) INTO v_c5
    FROM esperado e
    FULL JOIN real r ON lower(r.finca) = lower(e.finca)
   WHERE COALESCE(r.potreros_real, 0) <> e.potreros_esp
      OR COALESCE(r.cabezas_real, 0) <> e.cabezas_esp;
  IF v_c5 <> 0 THEN
    RAISE EXCEPTION '099 ABORTADA (C5): % finca(s) activa(s) no coinciden con el (potreros, cabezas) esperado tras la reorganización (Escocia 238/20, Supatá 64/8, santimp 67/6).', v_c5;
  END IF;

  -- C6: 0 cabezas en potreros de finca inactiva.
  SELECT COALESCE(sum(i.novillos + i.toros), 0) INTO v_c6
    FROM gan_inventario i
    JOIN gan_potreros p ON p.id = i.potrero_id
    JOIN gan_fincas f ON f.id = p.finca_id
   WHERE NOT f.activa;
  IF v_c6 <> 0 THEN
    RAISE EXCEPTION '099 ABORTADA (C6): quedan % cabeza(s) en potreros de finca inactiva.', v_c6;
  END IF;

  -- C7: 0 potreros activos sin lote_id (la lista blanca del Apéndice A
  --     está vacía).
  SELECT count(*) INTO v_c7 FROM gan_potreros WHERE activo AND lote_id IS NULL;
  IF v_c7 <> 0 THEN
    RAISE EXCEPTION '099 ABORTADA (C7): % potrero(s) activo(s) sin lote_id.', v_c7;
  END IF;

  -- C8: 0 potreros cuyo lote pertenezca a otra finca (redundante con la
  --     FK compuesta de la 098; se verifica igual).
  SELECT count(*) INTO v_c8
    FROM gan_potreros p JOIN gan_lotes l ON l.id = p.lote_id
   WHERE l.finca_id <> p.finca_id;
  IF v_c8 <> 0 THEN
    RAISE EXCEPTION '099 ABORTADA (C8): % potrero(s) con lote de otra finca.', v_c8;
  END IF;

  -- C9: distribución de cabezas por etapa == Apéndice A.
  WITH esperado AS (
    SELECT COALESCE(etapa, 'sin_clasificar') AS bucket, sum(cabezas_esperadas) AS cabezas
      FROM gan_099_mapeo
     GROUP BY 1
  ),
  real AS (
    SELECT COALESCE(p.etapa, 'sin_clasificar') AS bucket,
           COALESCE(sum(COALESCE(i.novillos, 0) + COALESCE(i.toros, 0)), 0) AS cabezas
      FROM gan_potreros p
      LEFT JOIN gan_inventario i ON i.potrero_id = p.id
     GROUP BY 1
  )
  SELECT count(*) INTO v_c9
    FROM esperado e
    FULL JOIN real r ON r.bucket = e.bucket
   WHERE COALESCE(e.cabezas, 0) <> COALESCE(r.cabezas, 0);
  IF v_c9 <> 0 THEN
    RAISE EXCEPTION '099 ABORTADA (C9): la distribución de cabezas por etapa no coincide con el Apéndice A en % bucket(s).', v_c9;
  END IF;

  -- C10: 56 cabezas sin etapa (Bosque 19 + Quebradas 13 + Colinas 12 +
  --      Los Olivos 12).
  SELECT COALESCE(sum(COALESCE(i.novillos, 0) + COALESCE(i.toros, 0)), 0) INTO v_c10
    FROM gan_potreros p
    LEFT JOIN gan_inventario i ON i.potrero_id = p.id
   WHERE p.etapa IS NULL;
  IF v_c10 <> 56 THEN
    RAISE EXCEPTION '099 ABORTADA (C10): % cabeza(s) sin etapa, se esperaban 56.', v_c10;
  END IF;

  -- C11: 0 potreros "General*" activos.
  SELECT count(*) INTO v_c11 FROM gan_potreros WHERE nombre LIKE 'General%' AND activo;
  IF v_c11 <> 0 THEN
    RAISE EXCEPTION '099 ABORTADA (C11): quedan % potrero(s) "General*" activos.', v_c11;
  END IF;

  DROP TABLE gan_099_mapeo;

  RAISE NOTICE '099 OK: 369 cabezas conservadas, 34 potreros intactos, 53 movimientos sin tocar, 8 fincas (3 activas: Escocia 238/20, Supatá 64/8, santimp 67/6), 0 cabezas en finca inactiva, 20 lotes sembrados, distribución de etapas y de "sin etapa" (56) coincide con el Apéndice A, 0 potreros "General" activos.';
END $$;


-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Ningún animal se movió durante la migración (C1 lo prueba), así que el
-- rollback tampoco mueve ninguno.
--
--   -- 1. Restaurar finca_id / activo / lote_id / etapa de los 34 potreros:
--   UPDATE gan_potreros p
--      SET finca_id = b.finca_id, activo = b.activo, lote_id = b.lote_id, etapa = b.etapa
--     FROM respaldos.backup_099_gan_potreros b
--    WHERE p.id = b.id;
--
--   -- 1b. Deshacer el renombre de los dos "General":
--   UPDATE gan_potreros p
--      SET nombre = 'General'
--     FROM respaldos.backup_099_gan_potreros b
--    WHERE p.id = b.id AND b.nombre = 'General' AND p.nombre <> 'General';
--
--   -- 2. Borrar los lotes sembrados por esta migración:
--   DELETE FROM gan_lotes
--    WHERE finca_id IN (
--      SELECT id FROM gan_fincas WHERE lower(nombre) IN (lower('Escocia'), lower('Supatá'), lower('santimp'))
--    );
--
--   -- 3. Reactivar las 4 fincas desactivadas:
--   UPDATE gan_fincas SET activa = true
--    WHERE lower(nombre) IN (lower('Maryland'), lower('Mochuelos'), lower('Carrizal'), lower('Andalucia'));
--
--   -- 4. Re-insertar las 2 fincas borradas, CON SU ID ORIGINAL (para que
--   --    nada quede colgando):
--   INSERT INTO gan_fincas (id, nombre, ubicacion_id, hectareas, activa)
--   SELECT id, nombre, ubicacion_id, hectareas, activa
--     FROM respaldos.backup_099_gan_fincas
--    WHERE nombre IN ('Escocia (lote)', 'aumento emilio');
--
--   -- 5. Borrar la finca Supatá:
--   DELETE FROM gan_fincas WHERE lower(nombre) = lower('Supatá');
--
-- Los respaldos (respaldos.backup_099_*) se dejan en la base a propósito,
-- igual que backup_075_*/backup_080_*. Bórralos cuando Santiago confirme
-- que /ganado y /ganado/movimientos se ven correctos.
-- =============================================================================
