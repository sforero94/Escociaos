-- ============================================
-- MIGRATION: Convert tareas.lote_id to array for multiple lotes
-- SISTEMA: Escosia Hass - Gestión Aguacate
-- WARNING: This changes database schema significantly
-- ============================================

-- Step 1: Create backup of current data
CREATE TABLE IF NOT EXISTS tareas_backup_pre_multiple_lotes AS
SELECT * FROM tareas;

-- Step 2: Add new array column for lote_ids
ALTER TABLE tareas ADD COLUMN lote_ids UUID[] DEFAULT '{}';

-- Step 3: Update RLS policies to include new column
-- (Assuming you have RLS enabled)

-- Step 4: Migrate existing data from junction table
UPDATE tareas
SET lote_ids = COALESCE(
    (
        SELECT ARRAY_AGG(tl.lote_id ORDER BY tl.created_at)
        FROM tareas_lotes tl
        WHERE tl.tarea_id = tareas.id
    ),
    '{}'::UUID[]
);

-- Step 5: For backward compatibility, set lote_id to first element of array
-- (This maintains compatibility with existing code that expects lote_id)
UPDATE tareas
SET lote_id = lote_ids[1]
WHERE lote_ids[1] IS NOT NULL;

-- Step 6: Update the view to use the new array column
DROP VIEW IF EXISTS vista_tareas_resumen;
CREATE VIEW vista_tareas_resumen AS
SELECT
    t.*,
    -- Multiple lotes information
    COALESCE(COUNT(tl.lote_id), 0) as num_lotes,
    STRING_AGG(DISTINCT l.nombre, ', ') as lote_nombres,
    -- Keep backward compatibility fields
    CASE
        WHEN array_length(t.lote_ids, 1) > 0 THEN t.lote_ids[1]
        ELSE NULL
    END as lote_id_legacy,
    -- Task type information
    tt.nombre as tipo_tarea_nombre,
    tt.categoria as tipo_tarea_categoria,
    -- Employee information
    e.nombre as responsable_nombre,
    -- Calculated fields
    COALESCE(SUM(rt.fraccion_jornal), 0) as jornales_reales,
    COALESCE(SUM(rt.costo_jornal), 0) as costo_total,
    COUNT(DISTINCT rt.empleado_id) as num_empleados,
    COUNT(DISTINCT DATE(rt.fecha_trabajo)) as dias_trabajados
FROM tareas t
LEFT JOIN tareas_lotes tl ON t.id = tl.tarea_id
LEFT JOIN lotes l ON tl.lote_id = l.id
LEFT JOIN tipos_tareas tt ON t.tipo_tarea_id = tt.id
LEFT JOIN empleados e ON t.responsable_id = e.id
LEFT JOIN registros_trabajo rt ON t.id = rt.tarea_id
GROUP BY t.id, tt.nombre, tt.categoria, e.nombre;

-- Step 7: Update indexes for performance
CREATE INDEX IF NOT EXISTS idx_tareas_lote_ids ON tareas USING GIN (lote_ids);

-- Step 8: Optional - Drop the junction table (CAUTION!)
-- WARNING: This will permanently remove the many-to-many relationship data
-- Only run this if you're absolutely sure you want to eliminate the junction table
-- DROP TABLE IF EXISTS tareas_lotes;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Check that migration worked
SELECT
    t.id,
    t.nombre,
    t.lote_ids,
    COUNT(tl.lote_id) as junction_table_count,
    STRING_AGG(l.nombre, ', ') as lote_names
FROM tareas t
LEFT JOIN tareas_lotes tl ON t.id = tl.tarea_id
LEFT JOIN lotes l ON tl.lote_id = l.id
GROUP BY t.id, t.nombre, t.lote_ids
ORDER BY t.id;

-- Count total tasks and lotes assignments
SELECT
    'Total Tasks' as metric,
    COUNT(*) as count
FROM tareas
UNION ALL
SELECT
    'Tasks with multiple lotes' as metric,
    COUNT(*) as count
FROM tareas
WHERE array_length(lote_ids, 1) > 1
UNION ALL
SELECT
    'Total lote assignments (array)' as metric,
    SUM(array_length(lote_ids, 1)) as count
FROM tareas;

-- ============================================
-- ROLLBACK SCRIPT (if needed)
-- ============================================

-- WARNING: Only run this if you need to rollback the migration
/*
-- Restore from backup
DROP TABLE tareas;
ALTER TABLE tareas_backup_pre_multiple_lotes RENAME TO tareas;

-- Recreate indexes and constraints
-- (Add back any indexes/constraints that were on the original table)

-- Recreate the view
CREATE VIEW vista_tareas_resumen AS
-- (Paste the original view definition here)
*/