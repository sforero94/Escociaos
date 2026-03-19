-- Migration 010: Backfill missing costs for contractor work records
-- Updates existing contractor records that have costo_jornal = 0 or NULL
-- Date: 2026-01-06

-- Update contractor work records with missing costs
-- Formula: tarifa_jornal * fraccion_jornal
-- Note: fraccion_jornal is an enum, so we cast to text first, then to numeric
UPDATE registros_trabajo rt
SET costo_jornal = (c.tarifa_jornal * rt.fraccion_jornal::text::numeric)
FROM contratistas c
WHERE rt.contratista_id = c.id
  AND rt.contratista_id IS NOT NULL
  AND (rt.costo_jornal = 0 OR rt.costo_jornal IS NULL);

-- Verification query
-- SELECT
--   rt.id,
--   rt.fecha_trabajo,
--   c.nombre as contratista,
--   c.tarifa_jornal,
--   rt.fraccion_jornal,
--   rt.costo_jornal,
--   (c.tarifa_jornal * rt.fraccion_jornal::numeric) as costo_esperado
-- FROM registros_trabajo rt
-- JOIN contratistas c ON rt.contratista_id = c.id
-- WHERE rt.contratista_id IS NOT NULL
-- ORDER BY rt.fecha_trabajo DESC
-- LIMIT 20;
