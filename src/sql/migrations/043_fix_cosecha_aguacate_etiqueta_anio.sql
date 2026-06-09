-- =====================================================================
-- 043: Corrección de etiquetado de cosechas de aguacate (issue #45)
--
-- La migración 042 etiquetó la cosecha Principal con el año de nov/dic,
-- pero la convención correcta es el año SIGUIENTE: la Principal que
-- ocurre en dic 2025 - feb 2026 es "Principal 2026".
--
-- Regla corregida:
--   - nov/dic           -> Principal (año + 1)
--   - ene-abr           -> Principal (mismo año)   [mar-abr = cola de venta]
--   - may-oct           -> Traviesa (mismo año)    [sep-oct = cola de venta]
--
-- Remapeo resultante: Principal 2023 -> 2024, 2024 -> 2025, 2025 -> 2026.
-- Traviesa no cambia.
-- =====================================================================

-- 1. Función corregida (el trigger trg_set_cosecha_aguacate la usa tal cual)
CREATE OR REPLACE FUNCTION fn_cosecha_aguacate(p_fecha date)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN EXTRACT(MONTH FROM p_fecha) IN (11, 12)
      THEN 'Principal ' || (EXTRACT(YEAR FROM p_fecha)::int + 1)
    WHEN EXTRACT(MONTH FROM p_fecha) BETWEEN 1 AND 4
      THEN 'Principal ' || EXTRACT(YEAR FROM p_fecha)::int
    ELSE 'Traviesa ' || EXTRACT(YEAR FROM p_fecha)::int
  END;
$$;

-- 2. Re-derivar las cosechas existentes de aguacate. Solo se tocan las
--    etiquetas con el formato auto-generado para no pisar valores manuales.
UPDATE fin_ingresos i
SET cosecha = fn_cosecha_aguacate(i.fecha)
FROM fin_negocios n
WHERE n.id = i.negocio_id
  AND n.nombre = 'Aguacate Hass'
  AND i.cosecha ~ '^(Principal|Traviesa) [0-9]{4}$'
  AND i.cosecha IS DISTINCT FROM fn_cosecha_aguacate(i.fecha);
