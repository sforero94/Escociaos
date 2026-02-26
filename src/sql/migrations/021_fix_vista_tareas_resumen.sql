-- Migration 021: Fix vista_tareas_resumen to use tareas.lote_ids array
-- Problem: The view was using tareas_lotes junction table which is now empty
-- because lotes are stored directly in tareas.lote_ids array column
-- Solution: Use UNNEST(lote_ids) to expand the array and join with lotes

-- ============================================================================
-- DROP AND RECREATE VIEW
-- ============================================================================

DROP VIEW IF EXISTS vista_tareas_resumen;

CREATE VIEW vista_tareas_resumen AS
SELECT
    t.*,

    -- Aggregate lote information from lote_ids array
    COALESCE(
        STRING_AGG(DISTINCT l.nombre, ', ' ORDER BY l.nombre),
        ''
    ) as lote_nombres,

    -- Keep for backward compatibility (single lote display)
    COALESCE(
        STRING_AGG(DISTINCT l.nombre, ', ' ORDER BY l.nombre),
        ''
    ) as lote_nombre,

    -- Count of lotes from array
    COALESCE(ARRAY_LENGTH(t.lote_ids, 1), 0) as num_lotes,

    -- Task type information
    tt.nombre as tipo_tarea_nombre,
    tt.categoria as tipo_tarea_categoria,

    -- Employee information
    e.nombre as responsable_nombre,

    -- Calculate progress from work records
    -- fraccion_jornal is an ENUM type ('0.0', '0.25', '0.5', '0.75', '1.0')
    -- First cast to text, then to numeric for SUM
    COALESCE(SUM(rt.fraccion_jornal::text::numeric), 0) as jornales_reales,
    COALESCE(SUM(rt.costo_jornal), 0) as costo_total,
    COUNT(DISTINCT rt.empleado_id) as num_empleados,
    COUNT(DISTINCT DATE(rt.fecha_trabajo)) as dias_trabajados

FROM tareas t
-- Expand lote_ids array and join with lotes table
LEFT JOIN LATERAL UNNEST(t.lote_ids) AS unnested_lote_id ON TRUE
LEFT JOIN lotes l ON l.id = unnested_lote_id
LEFT JOIN tipos_tareas tt ON t.tipo_tarea_id = tt.id
LEFT JOIN empleados e ON t.responsable_id = e.id
LEFT JOIN registros_trabajo rt ON t.id = rt.tarea_id
GROUP BY t.id, tt.nombre, tt.categoria, e.nombre;

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================

-- Run this to verify the view works correctly:
-- SELECT id, nombre, tipo_tarea_nombre, lote_nombres, num_lotes
-- FROM vista_tareas_resumen
-- WHERE num_lotes > 0
-- LIMIT 5;

-- ============================================================================
-- NOTES
-- ============================================================================

-- This migration fixes the issue where lotes appeared empty in the reporte semanal
-- because the old view used tareas_lotes junction table which is no longer populated.
-- The new approach uses the lote_ids array column added in previous migrations.

-- The view now correctly shows:
-- - lote_nombres: Comma-separated list of lot names
-- - lote_nombre: Same as lote_nombres (for backward compatibility)
-- - num_lotes: Count of lotes assigned to the task
-- - tipo_tarea_nombre: Name of the task type (no longer shows "—")
