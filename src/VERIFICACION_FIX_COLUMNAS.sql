-- =====================================================
-- FIX: Agregar columnas faltantes a tablas existentes
-- =====================================================
-- Ejecuta este script si ya tienes las tablas pero te falta
-- el campo 'aprobado' u otros campos
-- =====================================================

-- Agregar columnas faltantes a verificaciones_inventario
DO $$
BEGIN
    -- Agregar campo 'updated_at' si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'verificaciones_inventario' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE verificaciones_inventario ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
        RAISE NOTICE '✅ Columna updated_at agregada a verificaciones_inventario';
    ELSE
        RAISE NOTICE 'ℹ️ Columna updated_at ya existe en verificaciones_inventario';
    END IF;

    -- Agregar campo 'motivo_rechazo' si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'verificaciones_inventario' AND column_name = 'motivo_rechazo'
    ) THEN
        ALTER TABLE verificaciones_inventario ADD COLUMN motivo_rechazo TEXT;
        RAISE NOTICE '✅ Columna motivo_rechazo agregada a verificaciones_inventario';
    ELSE
        RAISE NOTICE 'ℹ️ Columna motivo_rechazo ya existe en verificaciones_inventario';
    END IF;
END $$;

-- Agregar columnas faltantes a verificaciones_detalle
DO $$
BEGIN
    -- Agregar campo 'aprobado' si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'verificaciones_detalle' AND column_name = 'aprobado'
    ) THEN
        ALTER TABLE verificaciones_detalle ADD COLUMN aprobado BOOLEAN DEFAULT false;
        RAISE NOTICE '✅ Columna aprobado agregada a verificaciones_detalle';
    ELSE
        RAISE NOTICE 'ℹ️ Columna aprobado ya existe en verificaciones_detalle';
    END IF;

    -- Agregar campo 'updated_at' si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'verificaciones_detalle' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE verificaciones_detalle ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
        RAISE NOTICE '✅ Columna updated_at agregada a verificaciones_detalle';
    ELSE
        RAISE NOTICE 'ℹ️ Columna updated_at ya existe en verificaciones_detalle';
    END IF;
END $$;

-- Agregar campo 'activo' a productos si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'productos' AND column_name = 'activo'
    ) THEN
        ALTER TABLE productos ADD COLUMN activo BOOLEAN DEFAULT true;
        RAISE NOTICE '✅ Columna activo agregada a productos';
    ELSE
        RAISE NOTICE 'ℹ️ Columna activo ya existe en productos';
    END IF;
END $$;

-- Verificar columnas agregadas
SELECT
    table_name,
    column_name,
    data_type,
    column_default
FROM information_schema.columns
WHERE table_name IN ('verificaciones_inventario', 'verificaciones_detalle', 'productos')
  AND column_name IN ('aprobado', 'updated_at', 'motivo_rechazo', 'activo')
ORDER BY table_name, column_name;

-- =====================================================
-- Mensaje final
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ Script completado exitosamente';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Ahora ejecuta el script completo:';
    RAISE NOTICE 'VERIFICACION_INVENTARIO_SETUP.sql';
    RAISE NOTICE '========================================';
END $$;
