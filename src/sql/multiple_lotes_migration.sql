-- =====================================================
-- MIGRATION: Multiple Lotes Support for Tasks
-- =====================================================
-- This migration adds support for tasks to be assigned to multiple lotes
-- by creating a junction table and migrating existing data

-- =====================================================
-- 1. CREATE JUNCTION TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS tareas_lotes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tarea_id UUID NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
    lote_id UUID NOT NULL REFERENCES lotes(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Ensure no duplicate assignments
    UNIQUE(tarea_id, lote_id),

    -- Indexes for performance
    INDEX idx_tareas_lotes_tarea_id (tarea_id),
    INDEX idx_tareas_lotes_lote_id (lote_id)
);

-- =====================================================
-- 2. ADD RLS POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE tareas_lotes ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to read
CREATE POLICY "Users can view tareas_lotes" ON tareas_lotes
    FOR SELECT USING (auth.role() = 'authenticated');

-- Policy for authenticated users to insert
CREATE POLICY "Users can insert tareas_lotes" ON tareas_lotes
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Policy for authenticated users to update
CREATE POLICY "Users can update tareas_lotes" ON tareas_lotes
    FOR UPDATE USING (auth.role() = 'authenticated');

-- Policy for authenticated users to delete
CREATE POLICY "Users can delete tareas_lotes" ON tareas_lotes
    FOR DELETE USING (auth.role() = 'authenticated');

-- =====================================================
-- 3. MIGRATE EXISTING DATA
-- =====================================================

-- Insert existing single lote assignments into junction table
-- Only migrate tasks that have a lote_id assigned
INSERT INTO tareas_lotes (tarea_id, lote_id)
SELECT
    t.id as tarea_id,
    t.lote_id as lote_id
FROM tareas t
WHERE t.lote_id IS NOT NULL
ON CONFLICT (tarea_id, lote_id) DO NOTHING;

-- =====================================================
-- 4. UPDATE VIEWS (if they reference lote data)
-- =====================================================

-- Update vista_tareas_resumen to include multiple lotes information
-- This view will need to be updated to aggregate lote information

-- First, drop the existing view
DROP VIEW IF EXISTS vista_tareas_resumen;

-- Recreate with multiple lotes support
CREATE VIEW vista_tareas_resumen AS
SELECT
    t.*,

    -- Aggregate lote information
    STRING_AGG(DISTINCT l.nombre, ', ') as lote_nombres,
    STRING_AGG(DISTINCT l.nombre, ', ') as lote_nombre, -- For backward compatibility
    COUNT(DISTINCT tl.lote_id) as num_lotes,

    -- Keep existing fields
    tt.nombre as tipo_tarea_nombre,
    tt.categoria as tipo_tarea_categoria,

    e.nombre as responsable_nombre,

    -- Calculate progress from work records
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

-- =====================================================
-- 5. ADD HELPER FUNCTIONS
-- =====================================================

-- Function to get lotes for a task
CREATE OR REPLACE FUNCTION get_tareas_lotes(tarea_uuid UUID)
RETURNS TABLE (
    id UUID,
    nombre TEXT,
    area_hectareas DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT l.id, l.nombre, l.area_hectareas
    FROM tareas_lotes tl
    JOIN lotes l ON tl.lote_id = l.id
    WHERE tl.tarea_id = tarea_uuid
    ORDER BY l.nombre;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to assign multiple lotes to a task
CREATE OR REPLACE FUNCTION assign_tareas_lotes(
    tarea_uuid UUID,
    lote_ids UUID[]
) RETURNS VOID AS $$
BEGIN
    -- Delete existing assignments
    DELETE FROM tareas_lotes WHERE tarea_id = tarea_uuid;

    -- Insert new assignments
    INSERT INTO tareas_lotes (tarea_id, lote_id)
    SELECT tarea_uuid, unnest(lote_ids)
    ON CONFLICT (tarea_id, lote_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 6. VALIDATION QUERIES
-- =====================================================

-- Verify migration was successful
-- Check that all tasks with lote_id have corresponding entries in tareas_lotes
SELECT
    'Migration Check' as check_type,
    COUNT(*) as tasks_with_lote,
    COUNT(CASE WHEN tl.tarea_id IS NOT NULL THEN 1 END) as migrated_tasks
FROM tareas t
LEFT JOIN tareas_lotes tl ON t.id = tl.tarea_id
WHERE t.lote_id IS NOT NULL;

-- Check for any orphaned records
SELECT
    'Orphaned Check' as check_type,
    COUNT(*) as orphaned_tareas_lotes
FROM tareas_lotes tl
LEFT JOIN tareas t ON tl.tarea_id = t.id
WHERE t.id IS NULL;

-- =====================================================
-- 7. BACKWARD COMPATIBILITY NOTES
-- =====================================================

/*
IMPORTANT: After this migration, the lote_id column in tareas table
should be considered deprecated. New functionality should use the
tareas_lotes junction table for multiple lote assignments.

The vista_tareas_resumen view maintains backward compatibility by
aggregating lote information, but applications should be updated
to handle multiple lotes properly.

Migration completed successfully if:
- All tasks with lote_id have entries in tareas_lotes
- No orphaned records in tareas_lotes
- View returns expected aggregated data
*/

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================