-- Migration: Add RLS Policies for registros_trabajo UPDATE operations
-- Description: Enable UPDATE operations for authenticated users on registros_trabajo table
-- Date: 2026-01-13

-- =====================================================
-- 1. ENABLE ROW LEVEL SECURITY (if not already enabled)
-- =====================================================

ALTER TABLE registros_trabajo ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 2. CREATE UPDATE POLICY FOR AUTHENTICATED USERS
-- =====================================================

-- Drop existing UPDATE policy if it exists (for idempotency)
DROP POLICY IF EXISTS "authenticated_update_registros_trabajo" ON registros_trabajo;

-- Create policy to allow UPDATE for authenticated users
CREATE POLICY "authenticated_update_registros_trabajo"
ON registros_trabajo
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- =====================================================
-- 3. CREATE OTHER POLICIES IF NOT EXIST (SELECT, INSERT, DELETE)
-- =====================================================

-- Policy for SELECT (read access)
DROP POLICY IF EXISTS "authenticated_select_registros_trabajo" ON registros_trabajo;
CREATE POLICY "authenticated_select_registros_trabajo"
ON registros_trabajo
FOR SELECT
TO authenticated
USING (true);

-- Policy for INSERT (create access)
DROP POLICY IF EXISTS "authenticated_insert_registros_trabajo" ON registros_trabajo;
CREATE POLICY "authenticated_insert_registros_trabajo"
ON registros_trabajo
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy for DELETE (optional - uncomment if needed)
-- DROP POLICY IF EXISTS "authenticated_delete_registros_trabajo" ON registros_trabajo;
-- CREATE POLICY "authenticated_delete_registros_trabajo"
-- ON registros_trabajo
-- FOR DELETE
-- TO authenticated
-- USING (true);

-- =====================================================
-- 4. VERIFICATION QUERIES
-- =====================================================

-- Uncomment to verify policies were created:

-- Check RLS status
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE tablename = 'registros_trabajo';

-- Check all policies
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename = 'registros_trabajo'
-- ORDER BY policyname;

-- =====================================================
-- NOTES
-- =====================================================

-- These policies allow all authenticated users to:
-- - SELECT (read) all work records
-- - INSERT (create) new work records
-- - UPDATE (edit) existing work records
-- - DELETE is disabled by default for data integrity

-- If you need more granular control (e.g., users can only edit their own records),
-- modify the USING and WITH CHECK clauses accordingly.

-- Example of user-specific policy (commented out):
-- CREATE POLICY "users_update_own_registros_trabajo"
-- ON registros_trabajo
-- FOR UPDATE
-- TO authenticated
-- USING (auth.uid() = created_by_user_id)
-- WITH CHECK (auth.uid() = created_by_user_id);
