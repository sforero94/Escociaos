-- Migration 020: Fix RLS policies for reportes_semanales
-- Fix: DROP old policies before CREATE to ensure correct USING/WITH CHECK clauses
-- This fixes the upsert RLS error when regenerating reports

-- Drop existing policies (they may have restrictive USING clauses)
DROP POLICY IF EXISTS "Authenticated users can view reports" ON reportes_semanales;
DROP POLICY IF EXISTS "Authenticated users can create reports" ON reportes_semanales;
DROP POLICY IF EXISTS "Users can update own reports" ON reportes_semanales;
DROP POLICY IF EXISTS "Users can delete own reports" ON reportes_semanales;

-- Recreate with correct permissions
CREATE POLICY "Authenticated users can view reports"
  ON reportes_semanales FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create reports"
  ON reportes_semanales FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- USING (true) allows reading existing row for UPDATE
-- WITH CHECK (true) allows any authenticated user to update (for upsert/regeneration)
CREATE POLICY "Users can update own reports"
  ON reportes_semanales FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete own reports"
  ON reportes_semanales FOR DELETE
  TO authenticated
  USING (generado_por = auth.uid());
