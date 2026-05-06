-- Migration 040: Allow Administrador to delete their own tareas
--
-- Bug: Administrador users cannot delete tareas because the existing
-- "Gerencia full access on tareas" policy only grants ALL to Gerencia,
-- and the Administrador-specific policies cover only SELECT/INSERT/UPDATE.
--
-- Fix:
--  1. BEFORE INSERT trigger to populate `created_by` = auth.uid() so the
--     ownership check has data to match against (covers frontend inserts
--     and the auto-tarea-from-aplicacion trigger from migration 004).
--  2. New DELETE policy for Administrador scoped to created_by = auth.uid()
--     OR created_by IS NULL (legacy rows have NULL created_by; allowing
--     Administrador to clean those up is acceptable per product decision).
--
-- The existing `prevent_linked_tarea_deletion` trigger (migration 007)
-- continues to block deletion of tareas linked to an aplicacion for ALL
-- roles. Gerencia's existing "full access" policy is unchanged.

-- 1. BEFORE INSERT trigger to populate created_by
CREATE OR REPLACE FUNCTION set_tarea_created_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_tarea_created_by ON tareas;
CREATE TRIGGER trigger_set_tarea_created_by
  BEFORE INSERT ON tareas
  FOR EACH ROW
  EXECUTE FUNCTION set_tarea_created_by();

-- 2. Administrador DELETE policy
DROP POLICY IF EXISTS "Administrador delete own tareas" ON tareas;
CREATE POLICY "Administrador delete own tareas"
ON tareas
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM usuarios
    WHERE usuarios.id = auth.uid()
      AND usuarios.rol = 'Administrador'::rol_usuario
      AND usuarios.activo = true
  )
  AND (created_by = auth.uid() OR created_by IS NULL)
);
