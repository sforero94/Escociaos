-- ============================================================================
-- Migración 019: Columnas para generación rápida de reportes semanales
-- ============================================================================
-- Agrega dos columnas opcionales (nullable, backward compatible) a la tabla
-- reportes_semanales para soportar el flujo de generación rápida:
--
--   html_storage           → ruta en Storage del HTML generado (para reportes
--                            creados sin pasar por el wizard del frontend)
--   generado_automaticamente → indica si fue generado por el botón rápido
--                              (sin intervención del wizard de 4 pasos)
--
-- Los reportes generados por el wizard siguen funcionando exactamente igual:
--   url_storage  → ruta del PDF (como antes)
--   html_storage → null (campo no utilizado por el wizard)
-- ============================================================================

ALTER TABLE reportes_semanales
  ADD COLUMN IF NOT EXISTS html_storage TEXT,
  ADD COLUMN IF NOT EXISTS generado_automaticamente BOOLEAN DEFAULT FALSE;

-- Comentarios descriptivos
COMMENT ON COLUMN reportes_semanales.html_storage IS
  'Ruta en el bucket reportes-semanales del archivo HTML. Usada por la generación rápida. El PDF se genera en el cliente bajo demanda.';

COMMENT ON COLUMN reportes_semanales.generado_automaticamente IS
  'TRUE si fue generado por el endpoint /generar-semanal-rapido sin pasar por el wizard de 4 pasos.';
