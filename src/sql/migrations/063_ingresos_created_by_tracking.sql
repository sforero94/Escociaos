-- Migration 063: Track who registers an ingreso + one-time backfill to Santiago
--
-- Context: fin_ingresos.created_by has existed since the original schema
-- (src/sql/create_finanzas_tables.sql, the fin_ingresos CREATE TABLE — it
-- REFERENCEs auth.users(id) just like fin_gastos.created_by did before
-- migration 050), but no app code path ever populates it. Every row today
-- has created_by = NULL. This blocks a new "Usuario" filter in the Ingresos
-- historial view being built in parallel.
--
-- This is the exact same bug migration 050 fixed for fin_gastos (and, in the
-- same migration, for fin_transacciones_ganado — that trigger already exists
-- and covers ganado ventas, so it is NOT re-added here).
--
-- Fix (mirrors migration 050's set_gasto_created_by(), which itself mirrors
-- migration 040's set_tarea_created_by()):
--  1. A BEFORE INSERT trigger on fin_ingresos that sets
--     created_by := COALESCE(created_by, auth.uid()) going forward.
--  2. A one-time backfill of every fin_ingresos row with created_by IS NULL
--     to Santiago (sforero94@gmail.com), who loaded the historical income
--     data. This deliberately differs from migration 050: there, pre-2026
--     gastos were left NULL because the author was genuinely unknown and
--     unrecoverable. Here the author of every historical row is known, so
--     the backfill is unconditional (not scoped to a year) rather than a
--     partial attribution.
--
-- Known gap (accepted, same as it already is for fin_gastos post-050): the
-- Telegram bot inserts ingresos via the service role
-- (src/supabase/functions/server/telegram/conversations/ingreso.ts, the
-- fin_ingresos insert in the confirm step), where auth.uid() is NULL. Those
-- bot-created rows will continue to land as "Sin usuario" after this
-- migration — the trigger only fills the value auth.uid() actually has.
--
-- Nota sobre el correo: 'sforero94@gmail.com' lo indico Santiago
-- explicitamente; no es el correo con el que trabaja el repo
-- (santiago@thinksid.co), que en usuarios no corresponde a esta cuenta. El
-- DO de abajo aborta con RAISE EXCEPTION si el lookup no encuentra fila, asi
-- que un correo inexistente falla ruidosamente y nunca escribe NULLs.

-- ============================================================================
-- PART 1: AUTO-POPULATE created_by GOING FORWARD
-- ============================================================================

CREATE OR REPLACE FUNCTION set_ingreso_created_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_ingreso_created_by ON fin_ingresos;
CREATE TRIGGER trigger_set_ingreso_created_by
  BEFORE INSERT ON fin_ingresos
  FOR EACH ROW
  EXECUTE FUNCTION set_ingreso_created_by();

-- ============================================================================
-- PART 2: ONE-TIME BACKFILL — ALL NULL ROWS ATTRIBUTED TO SANTIAGO
-- ============================================================================
-- Unlike migration 050 (which split 2026 gastos between two people and left
-- earlier years untouched because the author was unknown), every historical
-- fin_ingresos row was loaded by Santiago, so this backfill is not scoped to
-- a year: every row still lacking a created_by gets attributed to him.
-- Guarded by created_by IS NULL so this block is idempotent and never
-- overwrites an already-attributed row.

DO $$
DECLARE
  v_santiago_id UUID;
BEGIN
  SELECT id INTO v_santiago_id FROM usuarios WHERE email = 'sforero94@gmail.com';

  IF v_santiago_id IS NULL THEN
    RAISE EXCEPTION 'No se encontro usuario con email sforero94@gmail.com; backfill abortado';
  END IF;

  UPDATE fin_ingresos
  SET created_by = v_santiago_id
  WHERE created_by IS NULL;

  RAISE NOTICE 'Ingresos asignados a Santiago: %', (SELECT count(*) FROM fin_ingresos WHERE created_by = v_santiago_id);
END $$;
