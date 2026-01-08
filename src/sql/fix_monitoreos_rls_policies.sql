-- ============================================================================
-- Arreglar políticas RLS de la tabla monitoreos
-- ============================================================================
-- Este script configura las políticas de Row Level Security (RLS) para
-- permitir que usuarios autenticados puedan insertar, leer, actualizar
-- y eliminar registros de monitoreo
-- ============================================================================

-- 1. Habilitar RLS si no está habilitado
ALTER TABLE monitoreos ENABLE ROW LEVEL SECURITY;

-- 2. Eliminar políticas existentes (si existen)
DROP POLICY IF EXISTS "Usuarios autenticados pueden leer monitoreos" ON monitoreos;
DROP POLICY IF EXISTS "Usuarios autenticados pueden insertar monitoreos" ON monitoreos;
DROP POLICY IF EXISTS "Usuarios autenticados pueden actualizar monitoreos" ON monitoreos;
DROP POLICY IF EXISTS "Usuarios autenticados pueden eliminar monitoreos" ON monitoreos;

-- 3. Crear nuevas políticas permisivas

-- Política SELECT: Todos los usuarios autenticados pueden leer todos los registros
CREATE POLICY "Usuarios autenticados pueden leer monitoreos"
  ON monitoreos
  FOR SELECT
  TO authenticated
  USING (true);

-- Política INSERT: Todos los usuarios autenticados pueden insertar
CREATE POLICY "Usuarios autenticados pueden insertar monitoreos"
  ON monitoreos
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Política UPDATE: Todos los usuarios autenticados pueden actualizar
CREATE POLICY "Usuarios autenticados pueden actualizar monitoreos"
  ON monitoreos
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Política DELETE: Todos los usuarios autenticados pueden eliminar
CREATE POLICY "Usuarios autenticados pueden eliminar monitoreos"
  ON monitoreos
  FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================================
-- Verificación
-- ============================================================================
-- Muestra el estado de RLS
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'monitoreos';

-- Muestra todas las políticas configuradas
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'monitoreos'
ORDER BY policyname;

-- ============================================================================
-- Instrucciones
-- ============================================================================
-- 1. Copia todo este script
-- 2. Ve a Supabase Dashboard → SQL Editor
-- 3. Pega el script y ejecuta (Run)
-- 4. Verifica que aparezcan 4 políticas creadas en la salida
-- 5. Intenta registrar un monitoreo nuevamente en la aplicación
-- ============================================================================
