-- =====================================================================
-- 058: Hato Lechero — parámetros configurables (Épica H, "Ajustes del Hato")
-- Fecha: 2026-07-22
--
-- Parte del PR único de S1 (hato) — plan docs/plan_hato_lechero_module.md
-- §7.1–7.2, renumerado 050→053…057→060 (ver brief S1, Decisión 1).
--
-- Tabla genérica clave/valor (jsonb) para las condicionales de las
-- fórmulas del motor de fechas (calculosHato.ts, S2) y del motor de
-- alertas (§7.3): catálogo de razas, meses de secado por raza, umbrales
-- y ventanas. NINGUNA de estas constantes vive en código — se leen de
-- aquí (brief S1 Decisión 6).
--
-- jsonb (no numeric, a diferencia de fin_parametros/052): los valores son
-- heterogéneos — lista (razas), mapa (meses_secado por raza) y escalares
-- — y jsonb los guarda todos de forma uniforme sin fragmentar un mismo
-- concepto en varias filas.
--
-- UNIQUE(clave) es un índice de columna simple, sin el COALESCE de
-- fin_parametros (052): no hay eje anio/negocio aquí, así que un upsert
-- de PostgREST es seguro (a diferencia de 052).
--
-- Seed: 9 claves con sus defaults (tabla completa en el brief S1
-- Decisión 6) — hace que el motor de fechas/alertas funcione sin UI de
-- Ajustes desde el día uno. ON CONFLICT (clave) DO NOTHING: una
-- re-ejecución nunca sobrescribe una edición ya hecha por Gerencia.
--
-- RLS: SELECT para cualquier authenticated (el motor de fechas en el
-- frontend necesita leer los parámetros para cualquier rol que use el
-- módulo); escritura Gerencia-only vía es_usuario_gerencia() — la misma
-- función que usan fin_gastos/fin_ingresos/fin_parametros (052). No se
-- redefine aquí: si falta en un entorno, es un problema de aprovisionamiento
-- de ese entorno, no algo que esta migración deba resolver.
--
-- Idempotente: seguro de re-ejecutar.
-- =====================================================================

CREATE TABLE IF NOT EXISTS hato_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clave TEXT NOT NULL,
  valor JSONB NOT NULL,
  descripcion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS hato_config_clave_unique
  ON hato_config (clave);

DROP TRIGGER IF EXISTS update_hato_config_updated_at ON hato_config;
CREATE TRIGGER update_hato_config_updated_at
  BEFORE UPDATE ON hato_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

ALTER TABLE hato_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hato_config_select ON hato_config;
CREATE POLICY hato_config_select ON hato_config
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS hato_config_insert ON hato_config;
CREATE POLICY hato_config_insert ON hato_config
  FOR INSERT TO authenticated WITH CHECK (es_usuario_gerencia());

DROP POLICY IF EXISTS hato_config_update ON hato_config;
CREATE POLICY hato_config_update ON hato_config
  FOR UPDATE TO authenticated USING (es_usuario_gerencia());

DROP POLICY IF EXISTS hato_config_delete ON hato_config;
CREATE POLICY hato_config_delete ON hato_config
  FOR DELETE TO authenticated USING (es_usuario_gerencia());

-- ---------------------------------------------------------------------
-- Seed: defaults del motor de fechas/alertas (brief S1 Decisión 6)
-- ---------------------------------------------------------------------

INSERT INTO hato_config (clave, valor, descripcion)
VALUES
  ('razas', '["jersey","holstein","normanda"]'::jsonb,
    'Catálogo de razas (V6/H1)'),
  ('meses_secado_por_raza', '{"jersey":2,"holstein":2,"normanda":3,"_default":2}'::jsonb,
    'Meses de secado antes del parto por raza; _default aplica cuando la raza no se conoce (§7.1)'),
  ('meses_gestacion_default', '9'::jsonb,
    'PP = fecha de servicio + meses de gestación (B2)'),
  ('umbral_partos_reemplazo', '9'::jsonb,
    'Umbral de partos para el indicador "próxima a reemplazo" (A7/V9/H2)'),
  ('ventana_proxima_secar_dias', '30'::jsonb,
    'Ventana en días de la lista "próximas a secar" del tablero (E1)'),
  ('ventana_proximo_parir_dias', '30'::jsonb,
    'Ventana en días de la lista "próximas a parir" del tablero (E1)'),
  ('dias_parto_proximo_alerta', '14'::jsonb,
    'Ventana en días de la alerta parto_proximo (§7.3, distinta de la ventana del tablero)'),
  ('dias_servicio_sin_confirmacion', '45'::jsonb,
    'Días desde el servicio sin confirmación/celo/aborto/parto para disparar servicio_sin_confirmacion (§7.3/H2)'),
  ('dias_rechequeo_due', '60'::jsonb,
    'Días desde el último chequeo para disparar rechequeo_due a nivel hato (§7.3/H2)')
ON CONFLICT (clave) DO NOTHING;
