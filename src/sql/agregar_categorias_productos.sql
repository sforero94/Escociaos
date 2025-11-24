-- ============================================================================
-- SCRIPT: Agregar Categorías Faltantes al ENUM categoria_producto
-- ============================================================================
-- Proyecto: Escosia Hass - Sistema de Gestión Integral
-- Fecha: 2025-11-19
-- Propósito: Expandir el ENUM categoria_producto para soportar importación masiva
-- 
-- INSTRUCCIONES:
-- 1. Abre tu proyecto en Supabase Dashboard
-- 2. Ve a SQL Editor
-- 3. Copia y pega este script completo
-- 4. Ejecuta el script
-- 5. Verifica que no haya errores
-- 
-- IMPORTANTE: 
-- - ALTER TYPE ADD VALUE no puede ejecutarse dentro de una transacción
-- - Si un valor ya existe, PostgreSQL dará error pero no afectará los demás
-- - Este script es idempotente para valores nuevos
-- ============================================================================

-- Agregar categorías faltantes al ENUM categoria_producto
-- Nota: Si el valor ya existe, se producirá un error pero puedes ignorarlo

-- Categoría: Insecticida - Acaricida (productos con doble acción)
ALTER TYPE categoria_producto ADD VALUE IF NOT EXISTS 'Insecticida - Acaricida';

-- Categoría: Biológicos (productos biológicos/orgánicos)
ALTER TYPE categoria_producto ADD VALUE IF NOT EXISTS 'Biológicos';

-- Categoría: Regulador (reguladores de crecimiento)
ALTER TYPE categoria_producto ADD VALUE IF NOT EXISTS 'Regulador';

-- Categoría: Fitorregulador (reguladores fitosanitarios)
ALTER TYPE categoria_producto ADD VALUE IF NOT EXISTS 'Fitorregulador';

-- Categoría: Desinfectante (productos para desinfección)
ALTER TYPE categoria_producto ADD VALUE IF NOT EXISTS 'Desinfectante';

-- Categoría: Enmienda (enmiendas de suelo)
ALTER TYPE categoria_producto ADD VALUE IF NOT EXISTS 'Enmienda';

-- Categoría: Enmienda - regulador (productos con doble función)
ALTER TYPE categoria_producto ADD VALUE IF NOT EXISTS 'Enmienda - regulador';

-- Categoría: Maquinaria (maquinaria agrícola)
ALTER TYPE categoria_producto ADD VALUE IF NOT EXISTS 'Maquinaria';

-- ============================================================================
-- VERIFICACIÓN: Consultar todos los valores del ENUM
-- ============================================================================

SELECT 
    enumlabel as categoria,
    enumsortorder as orden
FROM pg_enum
WHERE enumtypid = 'categoria_producto'::regtype
ORDER BY enumsortorder;

-- ============================================================================
-- RESULTADO ESPERADO:
-- ============================================================================
-- Deberías ver 18 categorías en total:
-- 1. Fertilizante
-- 2. Fungicida
-- 3. Insecticida
-- 4. Acaricida
-- 5. Insecticida - Acaricida ← NUEVO
-- 6. Herbicida
-- 7. Biocontrolador
-- 8. Biológicos ← NUEVO
-- 9. Coadyuvante
-- 10. Regulador ← NUEVO
-- 11. Fitorregulador ← NUEVO
-- 12. Desinfectante ← NUEVO
-- 13. Enmienda ← NUEVO
-- 14. Enmienda - regulador ← NUEVO
-- 15. Herramienta
-- 16. Equipo
-- 17. Maquinaria ← NUEVO
-- 18. Otros
-- ============================================================================

-- NOTA IMPORTANTE SOBRE PostgreSQL < 14:
-- Si tu versión de PostgreSQL es anterior a la 14, no existe IF NOT EXISTS
-- En ese caso, ejecuta cada línea individualmente y ignora errores de duplicados
-- 
-- Para versiones < 14, usa este formato alternativo:
-- DO $$ 
-- BEGIN
--     ALTER TYPE categoria_producto ADD VALUE 'Insecticida - Acaricida';
-- EXCEPTION
--     WHEN duplicate_object THEN null;
-- END $$;
