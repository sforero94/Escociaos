-- ============================================================================
-- Arreglar políticas RLS para todas las tablas relacionadas con monitoreo
-- ============================================================================
-- Este script configura las políticas RLS para todas las tablas que se usan
-- en el módulo de monitoreo de plagas y enfermedades
-- ============================================================================

-- ============================================================================
-- TABLA: lotes
-- ============================================================================
ALTER TABLE lotes ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas existentes
DROP POLICY IF EXISTS "Usuarios autenticados pueden leer lotes" ON lotes;
DROP POLICY IF EXISTS "Usuarios autenticados pueden insertar lotes" ON lotes;
DROP POLICY IF EXISTS "Usuarios autenticados pueden actualizar lotes" ON lotes;
DROP POLICY IF EXISTS "Usuarios autenticados pueden eliminar lotes" ON lotes;

-- Crear políticas
CREATE POLICY "Usuarios autenticados pueden leer lotes"
  ON lotes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Usuarios autenticados pueden insertar lotes"
  ON lotes FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar lotes"
  ON lotes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden eliminar lotes"
  ON lotes FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- TABLA: sublotes
-- ============================================================================
ALTER TABLE sublotes ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas existentes
DROP POLICY IF EXISTS "Usuarios autenticados pueden leer sublotes" ON sublotes;
DROP POLICY IF EXISTS "Usuarios autenticados pueden insertar sublotes" ON sublotes;
DROP POLICY IF EXISTS "Usuarios autenticados pueden actualizar sublotes" ON sublotes;
DROP POLICY IF EXISTS "Usuarios autenticados pueden eliminar sublotes" ON sublotes;

-- Crear políticas
CREATE POLICY "Usuarios autenticados pueden leer sublotes"
  ON sublotes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Usuarios autenticados pueden insertar sublotes"
  ON sublotes FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar sublotes"
  ON sublotes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden eliminar sublotes"
  ON sublotes FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- TABLA: plagas_enfermedades_catalogo
-- ============================================================================
ALTER TABLE plagas_enfermedades_catalogo ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas existentes
DROP POLICY IF EXISTS "Usuarios autenticados pueden leer plagas_enfermedades_catalogo" ON plagas_enfermedades_catalogo;
DROP POLICY IF EXISTS "Usuarios autenticados pueden insertar plagas_enfermedades_catalogo" ON plagas_enfermedades_catalogo;
DROP POLICY IF EXISTS "Usuarios autenticados pueden actualizar plagas_enfermedades_catalogo" ON plagas_enfermedades_catalogo;
DROP POLICY IF EXISTS "Usuarios autenticados pueden eliminar plagas_enfermedades_catalogo" ON plagas_enfermedades_catalogo;

-- Crear políticas
CREATE POLICY "Usuarios autenticados pueden leer plagas_enfermedades_catalogo"
  ON plagas_enfermedades_catalogo FOR SELECT TO authenticated USING (true);

CREATE POLICY "Usuarios autenticados pueden insertar plagas_enfermedades_catalogo"
  ON plagas_enfermedades_catalogo FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar plagas_enfermedades_catalogo"
  ON plagas_enfermedades_catalogo FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden eliminar plagas_enfermedades_catalogo"
  ON plagas_enfermedades_catalogo FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- Verificación
-- ============================================================================
-- Muestra todas las políticas configuradas para cada tabla
SELECT
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE tablename IN ('lotes', 'sublotes', 'plagas_enfermedades_catalogo', 'monitoreos')
ORDER BY tablename, policyname;

-- ============================================================================
-- Instrucciones
-- ============================================================================
-- 1. Copia todo este script
-- 2. Ve a Supabase Dashboard → SQL Editor
-- 3. Pega el script y ejecuta (Run)
-- 4. Verifica que aparezcan políticas para las 4 tablas
-- 5. Intenta registrar un monitoreo nuevamente en la aplicación
-- 6. El error 404 debería desaparecer completamente
-- ============================================================================
