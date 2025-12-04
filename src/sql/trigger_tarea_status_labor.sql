-- ============================================
-- TRIGGER: Automatic task status change when registering labor
-- SISTEMA: Escosia Hass - Gestión Aguacate
-- ============================================

-- Function to automatically change task status to "En Proceso" when labor is registered
CREATE OR REPLACE FUNCTION actualizar_estado_tarea_labor()
RETURNS TRIGGER AS $$
BEGIN
    -- Only update if the task is not already "En Proceso", "Completada", or "Cancelada"
    UPDATE tareas
    SET estado = 'En Proceso',
        fecha_inicio_real = COALESCE(fecha_inicio_real, NEW.fecha_trabajo),
        updated_at = now()
    WHERE id = NEW.tarea_id
    AND estado NOT IN ('En Proceso', 'Completada', 'Cancelada');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on registros_trabajo table
DROP TRIGGER IF EXISTS trigger_actualizar_estado_tarea_labor ON registros_trabajo;
CREATE TRIGGER trigger_actualizar_estado_tarea_labor
    AFTER INSERT ON registros_trabajo
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_estado_tarea_labor();

-- ============================================
-- VALIDATION: Prevent tasks with jornales > 0 from being in invalid states
-- ============================================

-- Function to validate task status based on registered labor
CREATE OR REPLACE FUNCTION validar_estado_tarea_jornales()
RETURNS TRIGGER AS $$
DECLARE
    total_jornales NUMERIC;
BEGIN
    -- Calculate total jornales for the task
    SELECT COALESCE(SUM(rt.fraccion_jornal::text::numeric), 0)
    INTO total_jornales
    FROM registros_trabajo rt
    WHERE rt.tarea_id = NEW.id;

    -- If task has registered labor (jornales > 0), it must be "En Proceso"
    IF total_jornales > 0 AND NEW.estado NOT IN ('En Proceso', 'Completada', 'Cancelada') THEN
        RAISE EXCEPTION 'La tarea tiene % jornales registrados. Debe estar en estado "En Proceso", "Completada" o "Cancelada".',
                        total_jornales;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on tareas table to validate status changes
DROP TRIGGER IF EXISTS trigger_validar_estado_tarea_jornales ON tareas;
CREATE TRIGGER trigger_validar_estado_tarea_jornales
    BEFORE UPDATE OF estado ON tareas
    FOR EACH ROW
    WHEN (OLD.estado IS DISTINCT FROM NEW.estado)
    EXECUTE FUNCTION validar_estado_tarea_jornales();

-- ============================================
-- INDEXES for performance
-- ============================================

-- Index for faster labor status validation queries
CREATE INDEX IF NOT EXISTS idx_registros_trabajo_tarea_fecha
ON registros_trabajo (tarea_id, fecha_trabajo);

-- Index for task status validation
CREATE INDEX IF NOT EXISTS idx_tareas_estado
ON tareas (estado);

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Check tasks with registered labor
SELECT
    t.id,
    t.nombre,
    t.estado,
    COALESCE(SUM(rt.fraccion_jornal::text::numeric), 0) as jornales_reales,
    COUNT(rt.id) as registros_labor
FROM tareas t
LEFT JOIN registros_trabajo rt ON t.id = rt.tarea_id
GROUP BY t.id, t.nombre, t.estado
HAVING COALESCE(SUM(rt.fraccion_jornal::text::numeric), 0) > 0
ORDER BY jornales_reales DESC;

-- Check for any tasks that violate the rule (should return empty after trigger is active)
SELECT
    t.id,
    t.nombre,
    t.estado,
    COALESCE(SUM(rt.fraccion_jornal::text::numeric), 0) as jornales_reales
FROM tareas t
LEFT JOIN registros_trabajo rt ON t.id = rt.tarea_id
GROUP BY t.id, t.nombre, t.estado
HAVING COALESCE(SUM(rt.fraccion_jornal::text::numeric), 0) > 0
AND t.estado NOT IN ('En Proceso', 'Completada', 'Cancelada');