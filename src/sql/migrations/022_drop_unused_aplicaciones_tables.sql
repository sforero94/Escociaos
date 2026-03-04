-- Migration 022: Drop unused aplicaciones ghost tables
-- These tables were part of a planned "planned vs. real" tracking design
-- that was never implemented. The actual architecture uses:
--   - aplicaciones_lotes_planificado  → planned lot data (KEEP - actively used)
--   - aplicaciones_productos          → planned product dosis per mezcla (KEEP - actively used)
--   - movimientos_diarios             → real execution tracking (KEEP - actively used)
--   - movimientos_diarios_productos   → real product usage (KEEP - actively used)
--
-- The tables below are confirmed unused (0 frontend references):

DROP TABLE IF EXISTS aplicaciones_lotes_real CASCADE;
DROP TABLE IF EXISTS aplicaciones_productos_real CASCADE;
DROP TABLE IF EXISTS aplicaciones_productos_planificado CASCADE;
DROP TABLE IF EXISTS aplicaciones_mezclas_productos CASCADE;
