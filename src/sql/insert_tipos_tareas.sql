-- ============================================
-- INSERT: Nuevos tipos de tareas para Escosia Hass
-- SISTEMA: Gestión de Labores Agrícolas
-- ============================================

-- Insertar nuevos tipos de tareas
INSERT INTO tipos_tareas (nombre, categoria, descripcion, activo) VALUES
-- Administrativas
('Registro de archivos', 'Administrativas', 'Toda tarea relacionada con registros', true),
('Preparativos Certificaciones', 'Administrativas', 'Todos los esfuerzos para prepararse para auditorías', true),
('Visitas técnicas', 'Administrativas', 'Atender las visitas de agrónomos y expertos', true),

-- Mantenimiento del cultivo
('Herbicida', 'Mantenimiento del cultivo', 'Aplicación de herbicida para control de malezas', true),

-- Fertilización y Enmiendas
('Enmiendas', 'Fertilización y Enmiendas', 'Aplicación de enmiendas', true),
('Aplicación en Drench', 'Fertilización y Enmiendas', 'Aplicación de fertilizantes en Drench', true),

-- Infraestructura
('Mantenimiento fumiducto', 'Infraestructura', 'Mantenimiento del fumiducto', true),

-- Cosecha
('Raleo', 'Cosecha', 'Recolección de fruto no apto para cosecha', true),

-- Proyectos Especiales
('Mezclas microbiología', 'Proyectos Especiales', 'Mezclas para producir micro organismos', true),
('Mantenimiento Abejas', 'Proyectos Especiales', 'Mantenimiento de las colmenas de abejas', true),
('Aplicación Materia Orgánica', 'Proyectos Especiales', 'Aplicación de mezclas de materia orgánica y compochar', true),
('Producción de Biochar', 'Proyectos Especiales', 'Quema de biomasas para la producción de biochar', true)
ON CONFLICT (nombre) DO UPDATE SET
    categoria = EXCLUDED.categoria,
    descripcion = EXCLUDED.descripcion,
    activo = EXCLUDED.activo,
    updated_at = now();

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Verificar que se insertaron correctamente
SELECT
    nombre,
    categoria,
    descripcion,
    activo,
    created_at
FROM tipos_tareas
WHERE nombre IN (
    'Registro de archivos',
    'Preparativos Certificaciones',
    'Visitas técnicas',
    'Herbicida',
    'Enmiendas',
    'Mantenimiento fumiducto',
    'Raleo',
    'Mezclas microbiología',
    'Mantenimiento Abejas',
    'Aplicación en Drench',
    'Aplicación Materia Orgánica',
    'Producción de Biochar'
)
ORDER BY categoria, nombre;

-- Contar por categoría
SELECT
    categoria,
    COUNT(*) as cantidad_tareas
FROM tipos_tareas
WHERE activo = true
GROUP BY categoria
ORDER BY categoria;

-- Total de tareas activas
SELECT
    COUNT(*) as total_tareas_activas
FROM tipos_tareas
WHERE activo = true;