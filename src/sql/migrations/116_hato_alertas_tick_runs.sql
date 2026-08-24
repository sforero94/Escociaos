-- =====================================================================
-- 116: hato_alertas_tick_runs -- instrumentación del tick diario de
-- alertas del Hato Lechero.
-- Fecha: 2026-08-24
-- Fuente: hallazgo #4 del PO (2026-08-24) -- "las alertas del hato están
-- calladas: una cada quince días, y de 65 históricas solo una se
-- respondió. El motor corre a diario sin fallar, pero 62 de 65 vacas no
-- tienen `raza` registrada y nadie puede decir si no hay nada que alertar
-- o si el motor NO PUEDE alertar." Decisión del dueño: instrumentar
-- PRIMERO, no tocar ningún umbral/regla/destinatario hasta que el
-- desglose por motivo responda la pregunta.
--
-- QUÉ CREA
--   hato_alertas_tick_runs -- una fila por ejecución del tick
--   (`POST .../hato/alertas/tick`, `hato-alertas-tick.ts`). Guarda:
--     (a) el desglose de COBERTURA que produce el nuevo
--         `resumirCoberturaAlertas` (`hatoAlertas.ts`) -- cuántos
--         animales/pasos se evaluaron y, por cada uno de los 5 tipos de
--         regla, cuántas alertas se generaron y POR QUÉ no se generaron
--         las demás (sin ciclo reproductivo, sin servicio ancla, bajo el
--         umbral todavía, ya generada, silenciada por un humano...);
--     (b) los conteos que las fases (b)/(c)/(d) del tick YA calculaban
--         (enviadas, escaladas, expiradas...) pero que hasta hoy solo
--         vivían en el cuerpo JSON de una respuesta HTTP que nadie lee:
--         el llamador es el pg_cron de la migración 060 vía `net.http_post`,
--         y la migración 105 ya dejó registrado que
--         `cron.job_run_details` dice "succeeded" aunque el POST haya
--         devuelto un error -- el estado real vive en `net._http_response`,
--         que nadie consulta a diario. Sin esta tabla, CERO de estos
--         números sobrevivía más allá de la respuesta HTTP efímera.
--
-- POR QUÉ UNA TABLA Y NO SOLO LOGS ESTRUCTURADOS: el propio brief de este
-- hallazgo advierte que `query_logs` (edge functions) tiene una ventana
-- de 24h -- suficiente para revisar la corrida de esta madrugada, inútil
-- para confirmar el patrón "una alerta cada quince días" contra varios
-- días de historia. El handler SÍ emite además una línea de
-- `console.log` estructurada (ver `hato-alertas-tick.ts`) como señal
-- barata de mismo-día que funciona incluso ANTES de que esta migración
-- se aplique -- la tabla es el canal que sobrevive más de 24h.
--
-- MISMO PATRÓN QUE `acciones_corridas` (migración 101, "una fila por
-- ejecución del tick diario... la auditoría: sin esto no se puede
-- contestar de dónde salió esta recomendación"). Se hereda el patrón
-- (RLS, revokes), no la tabla -- `acciones_corridas` es del motor de
-- acciones recomendadas, un dominio distinto (cruza tres negocios, tiene
-- costo de LLM); esta tabla es solo del hato y no invoca ningún modelo.
--
-- RLS -- patrón 044/101: SELECT abierto a `authenticated` (diagnóstico
-- operativo, sin ninguna cifra `fin_*`); INSERT solo `service_role`
-- (el handler ya usa el cliente de service role para todo lo demás);
-- ninguna política de UPDATE/DELETE -- esta tabla es un log de
-- ejecuciones, append-only por diseño, igual que `acciones_corridas`.
--
-- Trampa 081: Supabase concede ALL a anon/authenticated por defecto en
-- tablas nuevas de `public` (ALTER DEFAULT PRIVILEGES). Los REVOKE de
-- abajo son carga útil, no decoración.
--
-- VERIFICACIÓN CONTRA EL ESQUEMA VIVO antes de escribir esta migración:
--   - 116 es el siguiente número libre: la última migración en el árbol
--     es 112 (`productos_updated_by`, en una rama paralela sin fusionar
--     todavía) y 109-112 no tienen ningún archivo `hato_alertas*` que
--     colisione.
--   - No existe ninguna tabla `hato_alertas_tick_runs` previa (grep
--     limpio en migraciones y en `information_schema` en vivo).
--   - `usuarios.rol` / `es_usuario_gerencia()` no se referencian: esta
--     tabla no necesita distinguir Gerencia de Administrador para SELECT,
--     mismo criterio que `acciones_corridas`.
--
-- NO SE APLICA por la sesión que la escribe: la aplica el orquestador con
-- el conector autenticado (mismo criterio que 086/091/095/096/101).
-- =====================================================================

CREATE TABLE IF NOT EXISTS hato_alertas_tick_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ejecutado_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Fecha Bogotá de referencia del tick (`fechaReferencia` del handler,
  -- ya derivada de la hora del servidor -- el cron corre a las 05:45
  -- Bogotá, ver migración 060).
  fecha_referencia  DATE NOT NULL,
  estado            TEXT NOT NULL CHECK (estado IN ('ok', 'error')),
  error             TEXT,
  duracion_ms       INTEGER,

  -- ---- Cobertura (resumirCoberturaAlertas, hatoAlertas.ts) --------------
  animales_evaluados          INTEGER,
  animales_sin_raza           INTEGER,
  pasos_tratamiento_evaluados INTEGER,
  -- La forma exacta de `ResumenCoberturaAlertas['por_tipo']`, serializada
  -- tal cual: `{ secado_due: { generadas, omitidas: {no_activa, ...} }, ... }`.
  -- Es la respuesta a "¿por qué no se generó una alerta?", por regla.
  cobertura                   JSONB,

  -- ---- Resultado de las fases (b)/(c)/(d) del tick -----------------------
  generadas                   INTEGER,
  enviadas                    INTEGER,
  mensajes_enviados           INTEGER,
  saltadas_sin_destinatario   INTEGER,
  escaladas                   INTEGER,
  mensajes_escalamiento       INTEGER,
  expiradas                   INTEGER,
  expiradas_atascadas         INTEGER
);

CREATE INDEX IF NOT EXISTS idx_hato_alertas_tick_runs_ejecutado
  ON hato_alertas_tick_runs (ejecutado_at DESC);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
ALTER TABLE hato_alertas_tick_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hato_alertas_tick_runs_select_authenticated" ON hato_alertas_tick_runs;
CREATE POLICY "hato_alertas_tick_runs_select_authenticated" ON hato_alertas_tick_runs
  FOR SELECT TO authenticated USING (TRUE);

REVOKE ALL ON TABLE hato_alertas_tick_runs FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE hato_alertas_tick_runs FROM authenticated;

-- ---------------------------------------------------------------------
-- Verificación (informativa -- no aborta; esta migración es puramente
-- aditiva y no toca ninguna fila existente).
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_politicas integer;
BEGIN
  SELECT count(*) INTO v_politicas
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  WHERE c.relname = 'hato_alertas_tick_runs';

  IF v_politicas <> 1 THEN
    RAISE EXCEPTION '116: se esperaba 1 política sobre hato_alertas_tick_runs, hay %.', v_politicas;
  END IF;

  IF has_table_privilege('anon', 'hato_alertas_tick_runs', 'SELECT') THEN
    RAISE EXCEPTION '116: anon no debería tener SELECT sobre hato_alertas_tick_runs.';
  END IF;

  IF has_table_privilege('authenticated', 'hato_alertas_tick_runs', 'INSERT') THEN
    RAISE EXCEPTION '116: authenticated no debería tener INSERT sobre hato_alertas_tick_runs -- solo service_role escribe (el handler del tick).';
  END IF;

  RAISE NOTICE '116 OK: hato_alertas_tick_runs creada, RLS activo, 1 política SELECT, sin grants de escritura para anon/authenticated.';
END $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (ejecutable, si hubiera que revertir):
--
--   DROP TABLE IF EXISTS hato_alertas_tick_runs;
--
-- Nada que preservar: es un log de ejecuciones que se repuebla solo desde
-- el siguiente tick, mismo criterio que `acciones_corridas` (101).
-- ---------------------------------------------------------------------------
