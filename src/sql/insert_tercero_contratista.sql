-- Insert "Tercero / Contratista" record in empleados table
-- Date: 2025-12-04
-- Purpose: Enable handling of external contractors in labor registrations

-- Insert the contractor record with base values for cost calculations
INSERT INTO empleados (
    nombre,
    cargo,
    estado,
    salario,
    prestaciones_sociales,
    auxilios_no_salariales,
    horas_semanales
) VALUES (
    'Tercero / Contratista',
    'Externo',
    'Activo',
    50000,  -- Base salary for cost calculations (configurable)
    0,      -- No social benefits for contractors
    0,      -- No non-salary allowances for contractors
    48      -- Standard 48 hours per week
);

-- Verification query
SELECT
    id,
    nombre,
    cargo,
    estado,
    salario,
    prestaciones_sociales,
    auxilios_no_salariales,
    horas_semanales
FROM empleados
WHERE nombre = 'Tercero / Contratista';