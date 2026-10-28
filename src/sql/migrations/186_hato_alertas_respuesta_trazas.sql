-- =====================================================================
-- 186: hato_alertas_respuesta_trazas -- trayectoria de cada callback
-- `hato_alerta:{id}:{si|no|otro}` (issue #355).
-- Fecha: 2026-10-28
--
-- QUÉ CREA
--   hato_alertas_respuesta_trazas -- una fila por PASO de un callback:
--     callback recibido, usuario resuelto, alerta encontrada (con su
--     estado), alerta cerrada, evento creado, mensajes de los demás
--     editados, confirmación enviada. Cada fila es `ok` o `error` y
--     guarda el detalle. Así un Sí que no aparece en el feed se ubica
--     en el paso exacto, en vez de en un log de edge function que
--     vive 24 horas.
--   v_hato_alertas_respuesta_trazas -- la misma tabla, con
--     security_invoker, para consultar por alerta:
--
--       SELECT paso, estado, detalle, telegram_id, callback_data,
--              update_id, creado_en
--       FROM v_hato_alertas_respuesta_trazas
--       WHERE alerta_id = '<uuid>'
--       ORDER BY creado_en;
--
--   Un cron diario borra filas de más de 90 días. Es SQL puro, sin
--   HTTP y sin secreto: no toca el ruteo de destinatarios ni el tick.
--
-- POR QUÉ NO HAY FK A hato_alertas. Un callback con un id que ya no
-- existe (o que nunca existió) es justo el caso que hay que poder
-- registrar. Una FK rechazaría esa fila y, si el insert de la traza
-- se tragaba el error, perderíamos la única evidencia. `alerta_id`
-- queda indexado, sin restricción.
--
-- RLS -- se hereda la forma de la 116 (`hato_alertas_tick_runs`), la
-- tabla vecina de instrumentación del mismo módulo, y NO el patrón
-- 044 (escritura Administrador+Gerencia): esta tabla la escribe SOLO
-- la edge function con service_role. Un GRANT de INSERT al navegador
-- sería una capacidad que el gestor web no ejerce (su autor viaja en
-- `hato_eventos.created_by`) y que sí permitiría fabricar trazas.
-- SELECT queda abierto a `authenticated`: es diagnóstico operativo,
-- sin cifras `fin_*`.
--
-- Trampa 081: Supabase concede ALL a anon/authenticated por defecto
-- en tablas nuevas de `public`. Los REVOKE de abajo son carga útil.
--
-- `alerta_id` sin FK también evita que un DELETE de alerta (no es el
-- camino normal: la cola es historia) tumbe el diagnóstico a medias.
--
-- NO SE APLICA por la sesión que la escribe. No hay backfill: los
-- tres `secado_real` históricos con `created_by` NULL se corrigen
-- aparte.
--
-- El número 186 es el siguiente libre: el mayor fichero del repo es
-- 185 (`inventario_guardado_atomico`).
-- =====================================================================

CREATE TABLE IF NOT EXISTS hato_alertas_respuesta_trazas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corrida_id    UUID NOT NULL,
  alerta_id     UUID,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paso          TEXT NOT NULL CHECK (paso IN (
                  'callback_recibido',
                  'usuario_resuelto',
                  'alerta_encontrada',
                  'alerta_cerrada',
                  'evento_creado',
                  'mensajes_editados',
                  'confirmacion_enviada'
                )),
  estado        TEXT NOT NULL CHECK (estado IN ('ok', 'error')),
  detalle       JSONB NOT NULL DEFAULT '{}'::jsonb,
  telegram_id   TEXT,
  callback_data TEXT,
  update_id     BIGINT
);

CREATE INDEX IF NOT EXISTS idx_hato_alertas_respuesta_trazas_alerta
  ON hato_alertas_respuesta_trazas (alerta_id, creado_en);

CREATE INDEX IF NOT EXISTS idx_hato_alertas_respuesta_trazas_creado
  ON hato_alertas_respuesta_trazas (creado_en);

COMMENT ON TABLE hato_alertas_respuesta_trazas IS
  'Una fila por paso de cada callback hato_alerta:{id}:{si|no|otro}. Retención 90 días (cron hato-alertas-respuesta-trazas-retencion). Consulta: SELECT * FROM v_hato_alertas_respuesta_trazas WHERE alerta_id = ''...'' ORDER BY creado_en.';

-- ---------------------------------------------------------------------
-- Vista por alerta. security_invoker para que aplique la RLS de la
-- tabla, no los privilegios del dueño de la vista.
-- ---------------------------------------------------------------------

CREATE OR REPLACE VIEW v_hato_alertas_respuesta_trazas
WITH (security_invoker = true) AS
SELECT
  id,
  corrida_id,
  alerta_id,
  creado_en,
  paso,
  estado,
  detalle,
  telegram_id,
  callback_data,
  update_id
FROM hato_alertas_respuesta_trazas;

COMMENT ON VIEW v_hato_alertas_respuesta_trazas IS
  'Trazas de respuesta de una alerta del hato. SELECT * FROM v_hato_alertas_respuesta_trazas WHERE alerta_id = ''<uuid>'' ORDER BY creado_en.';

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

ALTER TABLE hato_alertas_respuesta_trazas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hato_alertas_respuesta_trazas_select_authenticated"
  ON hato_alertas_respuesta_trazas;
CREATE POLICY "hato_alertas_respuesta_trazas_select_authenticated"
  ON hato_alertas_respuesta_trazas
  FOR SELECT TO authenticated
  USING (TRUE);

REVOKE ALL ON TABLE hato_alertas_respuesta_trazas FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE hato_alertas_respuesta_trazas FROM authenticated;

REVOKE ALL ON v_hato_alertas_respuesta_trazas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON v_hato_alertas_respuesta_trazas TO authenticated;

-- ---------------------------------------------------------------------
-- Retención: 90 días. 03:20 Bogotá = 08:20 UTC, lejos del tick de las
-- 05:45. cron.schedule hace upsert por nombre.
-- ---------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

SELECT cron.schedule(
  'hato-alertas-respuesta-trazas-retencion',
  '20 8 * * *',
  $$DELETE FROM public.hato_alertas_respuesta_trazas WHERE creado_en < now() - interval '90 days'$$
);

-- ---------------------------------------------------------------------
-- Verificación.
-- ---------------------------------------------------------------------

DO $$
DECLARE
  v_politicas integer;
BEGIN
  SELECT count(*) INTO v_politicas
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  WHERE c.relname = 'hato_alertas_respuesta_trazas';

  IF v_politicas <> 1 THEN
    RAISE EXCEPTION '186: se esperaba 1 política sobre hato_alertas_respuesta_trazas, hay %.', v_politicas;
  END IF;

  IF has_table_privilege('anon', 'hato_alertas_respuesta_trazas', 'SELECT') THEN
    RAISE EXCEPTION '186: anon no debería tener SELECT sobre hato_alertas_respuesta_trazas.';
  END IF;

  IF has_table_privilege('authenticated', 'hato_alertas_respuesta_trazas', 'INSERT') THEN
    RAISE EXCEPTION '186: authenticated no debería tener INSERT -- solo service_role escribe.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'hato-alertas-respuesta-trazas-retencion'
  ) THEN
    RAISE EXCEPTION '186: no quedó programado el cron de retención de 90 días.';
  END IF;

  RAISE NOTICE '186 OK: trazas creadas, RLS de solo lectura para authenticated, retención 90 días.';
END $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (ejecutable, si hubiera que revertir):
--
--   SELECT cron.unschedule('hato-alertas-respuesta-trazas-retencion');
--   DROP VIEW IF EXISTS v_hato_alertas_respuesta_trazas;
--   DROP TABLE IF EXISTS hato_alertas_respuesta_trazas;
--
-- Nada que preservar de negocio: es un log de callbacks. Los eventos
-- de secado viven en hato_eventos y esta tabla no los modifica.
-- ---------------------------------------------------------------------------
