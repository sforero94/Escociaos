-- Migration 050: Track who registers a gasto/transaccion de ganado + backfill 2026
--
-- Context: fin_gastos.created_by and fin_transacciones_ganado.created_by have
-- existed since the original schema (both REFERENCE auth.users(id)), but no
-- app code path (GastoForm, GastosBatchTable, CargaMasivaGastos,
-- TransaccionGanadoForm, or the crear_gasto_pendiente_de_compra() trigger)
-- ever populates them. Every row today has created_by = NULL. This blocks a
-- new "Usuario" filter in the Gastos historial view (Efrain wants to see the
-- gastos he registers separated from everyone else's).
--
-- Fix (mirrors migration 040's set_tarea_created_by() pattern exactly):
--  1. BEFORE INSERT triggers on fin_gastos and fin_transacciones_ganado that
--     set created_by := COALESCE(created_by, auth.uid()) — covers manual
--     inserts, batch/CSV inserts, and the compra-to-gasto auto-trigger.
--  2. One-time backfill for 2026: a specific list of gastos Efrain confirmed
--     he registered gets attributed to him; every other still-unattributed
--     fin_gastos row dated in 2026 is attributed to Consuelo (the only other
--     person who registers gastos this year). Rows outside 2026, and any
--     already-attributed row, are left untouched.

-- ============================================================================
-- PART 1: AUTO-POPULATE created_by GOING FORWARD
-- ============================================================================

CREATE OR REPLACE FUNCTION set_gasto_created_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_gasto_created_by ON fin_gastos;
CREATE TRIGGER trigger_set_gasto_created_by
  BEFORE INSERT ON fin_gastos
  FOR EACH ROW
  EXECUTE FUNCTION set_gasto_created_by();

CREATE OR REPLACE FUNCTION set_transaccion_ganado_created_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_transaccion_ganado_created_by ON fin_transacciones_ganado;
CREATE TRIGGER trigger_set_transaccion_ganado_created_by
  BEFORE INSERT ON fin_transacciones_ganado
  FOR EACH ROW
  EXECUTE FUNCTION set_transaccion_ganado_created_by();

-- ============================================================================
-- PART 2: ONE-TIME BACKFILL FOR 2026
-- ============================================================================
-- Efrain (efraforero@gmail.com) identified the specific gastos below as his.
-- Matched on (fecha, nombre, valor) since no other identifier survives from
-- how the list was compiled. Verified row-by-row against production before
-- applying (list_projects/execute_sql via the Supabase MCP): 3 of the 45
-- entries have two rows sharing the exact same (fecha, nombre, valor) —
-- pre-existing duplicate data entry, unrelated to this migration — both get
-- attributed to Efrain since the match is on values, not a unique row id
-- (expect 48 physical rows updated, not 45). Guarded by created_by IS NULL
-- so this block is safe to re-run and never overwrites an already-attributed
-- row.

DO $$
DECLARE
  v_efrain_id UUID;
  v_consuelo_id UUID;
BEGIN
  SELECT id INTO v_efrain_id FROM usuarios WHERE email = 'efraforero@gmail.com';
  SELECT id INTO v_consuelo_id FROM usuarios WHERE email = 'consuelobn57@gmail.com';

  IF v_efrain_id IS NULL THEN
    RAISE EXCEPTION 'No se encontro usuario con email efraforero@gmail.com; backfill abortado';
  END IF;

  IF v_consuelo_id IS NULL THEN
    RAISE EXCEPTION 'No se encontro usuario con email consuelobn57@gmail.com; backfill abortado';
  END IF;

  -- 2a. Gastos confirmados como registrados por Efrain
  UPDATE fin_gastos
  SET created_by = v_efrain_id
  WHERE created_by IS NULL
    AND (fecha, nombre, valor) IN (
      ('2026-03-15', 'gasolina', 579000),
      ('2026-03-15', 'gasto ganado utica', 1900000),
      ('2026-03-15', 'viruta', 2100000),
      ('2026-03-15', 'jabon lavar uniformes', 75000),
      ('2026-03-15', 'dar vuelta supata', 100000),
      ('2026-03-15', 'vender ganado supata', 100000),
      ('2026-03-15', 'azucasr', 158000),
      ('2026-03-15', 'hewrrero', 1260000),
      ('2026-03-15', 'Contratos Rodriguez', 1050000),
      ('2026-03-15', 'luz', 235000),
      ('2026-03-15', 'ferreteria', 1319000),
      ('2026-03-15', 'droga novillo', 36000),
      ('2026-03-15', 'Calra 4 dias', 280000),
      ('2026-03-15', 'Boston tren y hotel', 7733000),
      ('2026-03-15', 'Zoe Santa Maria 2 saltos de Zafiro', 5000000),
      ('2026-03-15', 'Saltos Fenomenal de San Pedro', 5000000),
      ('2026-02-14', 'Contrato zanjas y roceria', 3000000),
      ('2026-06-07', 'suero microbiologia', 120000),
      ('2026-06-07', 'jornales eri apicultura', 210000),
      ('2026-06-07', 'luz', 204000),
      ('2026-06-07', 'ferreteria', 613000),
      ('2026-06-07', 'picar pasto', 230000),
      ('2026-06-07', 'abono moscas', 270000),
      ('2026-06-07', 'guadana australia', 2600000),
      ('2026-06-07', 'despinche braselio', 30000),
      ('2026-06-07', 'comida ganado', 650000),
      ('2026-06-07', 'droga supata', 500000),
      ('2026-06-07', 'jornal erradicacion 6', 450000),
      ('2026-06-07', 'herrero', 1120000),
      ('2026-06-07', 'veterinario', 150000),
      ('2026-06-07', 'cerveza almuerzo', 450000),
      ('2026-06-07', 'camioneta emiliano', 300000),
      ('2026-06-07', 'joirnales cosecha 33', 2475000),
      ('2026-06-07', 'arreglo guadana', 650000),
      ('2026-06-07', 'asrreglo picapasto', 90000),
      ('2026-06-07', 'castrada supata', 650000),
      ('2026-06-07', 'guadana irlanda', 600000),
      ('2026-06-07', 'herrero', 1200000),
      ('2026-06-07', 'vieuta', 2100000),
      ('2026-06-07', 'jornales ', 260000),
      ('2026-06-07', 'descargar viruta', 215000),
      ('2026-06-07', 'jornales prado', 260000),
      ('2026-06-07', 'azucar', 386000),
      ('2026-06-07', 'contrato zanjas', 900000),
      ('2026-06-07', 'heno', 2125000)
    );

  RAISE NOTICE 'Gastos asignados a Efrain: %', (SELECT count(*) FROM fin_gastos WHERE created_by = v_efrain_id);

  -- 2b. Todo lo demas de 2026 que siga sin usuario se asigna a Consuelo
  UPDATE fin_gastos
  SET created_by = v_consuelo_id
  WHERE created_by IS NULL
    AND fecha >= '2026-01-01'
    AND fecha <= '2026-12-31';

  RAISE NOTICE 'Gastos asignados a Consuelo: %', (SELECT count(*) FROM fin_gastos WHERE created_by = v_consuelo_id);
END $$;
