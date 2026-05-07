-- 041_remove_floracionless_monitoreos_20260423.sql
-- Issue #40: remove monitoreo rows from 2026-04-23 that predate floración tracking.
-- All 94 rows on this date have NULL/0 across the four floración columns and skew
-- weekly reports. No FK targets monitoreos, so a hard delete is safe.

BEGIN;

DELETE FROM monitoreos
WHERE fecha_monitoreo = '2026-04-23'
  AND COALESCE(floracion_sin_flor, 0)    = 0
  AND COALESCE(floracion_brotes, 0)      = 0
  AND COALESCE(floracion_flor_madura, 0) = 0
  AND COALESCE(floracion_cuaje, 0)       = 0;

COMMIT;
