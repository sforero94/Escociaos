-- ============================================
-- POLÍTICAS DE STORAGE PARA BUCKET PRIVADO DE FACTURAS
-- ============================================
-- Created: 2025-12-16
-- Purpose: Configurar Row Level Security (RLS) en Storage para el bucket 'facturas'
-- Bucket Type: PRIVADO (no público)
-- ============================================

-- IMPORTANTE: Antes de ejecutar este script:
-- 1. Crea el bucket 'facturas' en Supabase Dashboard > Storage
-- 2. Márcalo como PRIVADO (no público)
-- 3. Las carpetas se crearán automáticamente al subir archivos

-- ============================================
-- POLÍTICAS DE STORAGE
-- ============================================

-- 1. Permitir a usuarios autenticados de rol Gerencia subir facturas
CREATE POLICY "Gerencia puede subir facturas"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'facturas' AND
  EXISTS (
    SELECT 1 FROM usuarios
    WHERE usuarios.id = auth.uid()
    AND usuarios.rol = 'Gerencia'
  )
);

-- 2. Permitir a usuarios autenticados de rol Gerencia leer facturas
-- Esto es necesario para generar signed URLs
CREATE POLICY "Gerencia puede leer facturas"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'facturas' AND
  EXISTS (
    SELECT 1 FROM usuarios
    WHERE usuarios.id = auth.uid()
    AND usuarios.rol = 'Gerencia'
  )
);

-- 3. Permitir a usuarios autenticados de rol Gerencia eliminar facturas
CREATE POLICY "Gerencia puede eliminar facturas"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'facturas' AND
  EXISTS (
    SELECT 1 FROM usuarios
    WHERE usuarios.id = auth.uid()
    AND usuarios.rol = 'Gerencia'
  )
);

-- 4. Permitir a usuarios autenticados de rol Gerencia actualizar facturas
CREATE POLICY "Gerencia puede actualizar facturas"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'facturas' AND
  EXISTS (
    SELECT 1 FROM usuarios
    WHERE usuarios.id = auth.uid()
    AND usuarios.rol = 'Gerencia'
  )
);

-- ============================================
-- NOTAS IMPORTANTES
-- ============================================

-- * El bucket 'facturas' debe ser PRIVADO (no público)
-- * Solo usuarios con rol 'Gerencia' pueden gestionar facturas
-- * Las URLs se generan como signed URLs temporales (válidas por 1 hora)
-- * Las signed URLs expiran automáticamente después de 1 hora
-- * No hay acceso público directo a los archivos
-- * La columna url_factura guarda el PATH, no una URL pública

-- ============================================
-- ESTRUCTURA DE CARPETAS
-- ============================================

-- facturas/
-- ├── facturas_compra/
-- │   └── [timestamp]-[random].pdf
-- └── facturas_venta/
--     └── [timestamp]-[random].jpg

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

DO $$
BEGIN
    RAISE NOTICE 'Políticas de Storage configuradas exitosamente!';
    RAISE NOTICE '';
    RAISE NOTICE 'Configuración completada:';
    RAISE NOTICE '✓ Políticas RLS para bucket privado "facturas"';
    RAISE NOTICE '✓ Solo usuarios con rol Gerencia pueden acceder';
    RAISE NOTICE '✓ Sistema de signed URLs temporales (1 hora)';
    RAISE NOTICE '';
    RAISE NOTICE 'Próximo paso:';
    RAISE NOTICE '→ Verifica que el bucket "facturas" esté marcado como PRIVADO';
    RAISE NOTICE '→ Prueba subiendo una factura desde el formulario';
END $$;
