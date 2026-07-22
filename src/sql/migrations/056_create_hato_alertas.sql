-- =====================================================================
-- 056: Hato Lechero — cola de alertas + vista de estado actual
-- Fecha: 2026-07-22
--
-- Parte del PR único de S1 (hato) — plan docs/plan_hato_lechero_module.md
-- §7.1–7.2, renumerado 050→053…057→060 (ver brief S1, Decisión 1).
--
-- Contenido:
--   1. hato_alertas         — cola de tareas salientes (Telegram, C1-C4).
--                              `regla_clave UNIQUE` es la idempotencia del
--                              motor: INSERT ... ON CONFLICT (regla_clave)
--                              DO NOTHING regenera sin duplicar (§7.3).
--   2. hato_alertas_config  — destinatario/horas de escalamiento por tipo,
--                              sembrada con las 5 reglas para que el motor
--                              corra sin UI de Ajustes (Épica H).
--   3. Back-patch del FK hato_eventos.alerta_id → hato_alertas(id), que
--      053 dejó sin constraint por orden de dependencia (brief Decisión 2).
--   4. Vista v_hato_estado_actual — SOLO HECHOS, sin constantes de negocio
--      ni clasificación de estado reproductivo (esa lógica vive en
--      calculosHato.ts, S2). Ver brief Decisión 3 para el contrato de
--      columnas completo.
--
-- `hato_alertas`/`hato_alertas_config`: el tick diario y el bot de
-- Telegram escriben con la service_role key, que ya bypasea RLS —no se
-- agrega una política `TO service_role` (sería redundante y confunde:
-- ver brief S1 Decisión 5). Las políticas Administrador+Gerencia de
-- abajo son para que un humano pueda responder/descartar alertas desde
-- AlertasView.
--
-- RLS: patrón 044 en ambas tablas. La vista no lleva política propia —
-- corre con permisos del invocador y hereda la RLS de las tablas base
-- (security_invoker = true, mismo fix que 033 aplicó a las vistas
-- financieras — nunca SECURITY DEFINER).
--
-- Idempotente: seguro de re-ejecutar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. hato_alertas
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hato_alertas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('secado_due', 'tratamiento_paso', 'rechequeo_due', 'servicio_sin_confirmacion', 'parto_proximo')),
  animal_id UUID REFERENCES hato_animales(id),
  regla_clave TEXT NOT NULL UNIQUE,
  fecha_programada DATE NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'enviada', 'respondida', 'confirmada', 'descartada', 'escalada', 'expirada')),
  destinatario_telegram_id TEXT,
  intentos INTEGER NOT NULL DEFAULT 0,
  respuesta TEXT,
  respondida_por TEXT,
  paso_id UUID REFERENCES hato_tratamiento_pasos(id),
  datos JSONB,
  escalada_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_hato_alertas_estado ON hato_alertas(estado);
CREATE INDEX IF NOT EXISTS idx_hato_alertas_tipo_fecha ON hato_alertas(tipo, fecha_programada);
CREATE INDEX IF NOT EXISTS idx_hato_alertas_animal_id ON hato_alertas(animal_id);

DROP TRIGGER IF EXISTS update_hato_alertas_updated_at ON hato_alertas;
CREATE TRIGGER update_hato_alertas_updated_at
  BEFORE UPDATE ON hato_alertas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------
-- 2. hato_alertas_config — tipo → destinatario / horas de escalamiento
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hato_alertas_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL UNIQUE CHECK (tipo IN ('secado_due', 'tratamiento_paso', 'rechequeo_due', 'servicio_sin_confirmacion', 'parto_proximo')),
  destinatario_telegram_id TEXT,
  horas_escalamiento INTEGER NOT NULL DEFAULT 48,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_hato_alertas_config_updated_at ON hato_alertas_config;
CREATE TRIGGER update_hato_alertas_config_updated_at
  BEFORE UPDATE ON hato_alertas_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Seed: una fila por tipo, escalamiento a 48h (§7.3), sin destinatario
-- fijo todavía (se asigna desde Ajustes/Configuración, C6).
INSERT INTO hato_alertas_config (tipo, horas_escalamiento, activo, destinatario_telegram_id)
VALUES
  ('secado_due', 48, TRUE, NULL),
  ('tratamiento_paso', 48, TRUE, NULL),
  ('rechequeo_due', 48, TRUE, NULL),
  ('servicio_sin_confirmacion', 48, TRUE, NULL),
  ('parto_proximo', 48, TRUE, NULL)
ON CONFLICT (tipo) DO NOTHING;

-- ---------------------------------------------------------------------
-- 3. Back-patch: hato_eventos.alerta_id → hato_alertas(id)
--    (brief S1 Decisión 2 — 053 lo dejó sin FK porque hato_alertas no
--    existía todavía)
-- ---------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hato_eventos_alerta_id_fkey'
  ) THEN
    ALTER TABLE hato_eventos
      ADD CONSTRAINT hato_eventos_alerta_id_fkey
      FOREIGN KEY (alerta_id) REFERENCES hato_alertas(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 4. RLS — patrón 044 (SELECT authenticated, escritura Admin+Gerencia;
--    ver nota de service_role arriba)
-- ---------------------------------------------------------------------

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['hato_alertas', 'hato_alertas_config']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_select_authenticated" ON %I', t, t);
    EXECUTE format($pol$
      CREATE POLICY "%s_select_authenticated" ON %I
        FOR SELECT TO authenticated
        USING (TRUE)
    $pol$, t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_write_admin_gerencia" ON %I', t, t);
    EXECUTE format($pol$
      CREATE POLICY "%s_write_admin_gerencia" ON %I
        FOR ALL TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM usuarios u
            WHERE u.id = auth.uid()
            AND u.rol IN ('Administrador'::rol_usuario, 'Gerencia'::rol_usuario)
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM usuarios u
            WHERE u.id = auth.uid()
            AND u.rol IN ('Administrador'::rol_usuario, 'Gerencia'::rol_usuario)
          )
        )
    $pol$, t, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 5. Vista v_hato_estado_actual — hechos, sin constantes de negocio
--    (brief S1 Decisión 3: no calcula fecha_secar, no clasifica estado
--    reproductivo, no aplica ningún umbral de hato_config).
--    Una fila por animal en hato_animales.
-- ---------------------------------------------------------------------

CREATE OR REPLACE VIEW v_hato_estado_actual AS
WITH ultimo_chequeo AS (
  SELECT DISTINCT ON (cv.animal_id)
    cv.animal_id,
    cv.id AS chequeo_vaca_id,
    c.fecha AS chequeo_fecha,
    cv.pl,
    cv.meses_prenez,
    cv.fecha_secar,
    cv.fecha_probable_parto
  FROM hato_chequeo_vacas cv
  JOIN hato_chequeos c ON c.id = cv.chequeo_id
  ORDER BY cv.animal_id, c.fecha DESC, cv.created_at DESC
),
ultimo_servicio AS (
  SELECT DISTINCT ON (animal_id)
    animal_id,
    fecha,
    toro_id,
    tipo_servicio
  FROM hato_eventos
  WHERE tipo = 'servicio'
  ORDER BY animal_id, fecha DESC
),
ultimo_parto AS (
  SELECT animal_id, MAX(fecha) AS fecha, COUNT(*) AS num_partos
  FROM hato_eventos
  WHERE tipo = 'parto'
  GROUP BY animal_id
),
ultimo_secado_real AS (
  SELECT animal_id, MAX(fecha) AS fecha
  FROM hato_eventos
  WHERE tipo = 'secado_real'
  GROUP BY animal_id
),
ultima_confirmacion AS (
  SELECT animal_id, MAX(fecha) AS fecha
  FROM hato_eventos
  WHERE tipo = 'confirmacion_prenez'
  GROUP BY animal_id
),
ultimo_evento AS (
  SELECT animal_id, MAX(fecha) AS fecha
  FROM hato_eventos
  GROUP BY animal_id
)
SELECT
  a.id AS animal_id,
  a.numero,
  a.nombre,
  a.etapa,
  a.raza,
  a.estado,
  uc.chequeo_vaca_id AS ultimo_chequeo_vaca_id,
  uc.chequeo_fecha AS ultimo_chequeo_fecha,
  uc.pl,
  uc.meses_prenez,
  uc.fecha_secar,
  uc.fecha_probable_parto,
  us.fecha AS ultimo_servicio_fecha,
  us.toro_id AS ultimo_servicio_toro_id,
  us.tipo_servicio AS ultimo_tipo_servicio,
  up.fecha AS ultimo_parto_fecha,
  COALESCE(up.num_partos, 0) AS num_partos,
  usr.fecha AS ultimo_secado_real_fecha,
  ucp.fecha AS ultima_confirmacion_prenez_fecha,
  ue.fecha AS ultimo_evento_fecha
FROM hato_animales a
LEFT JOIN ultimo_chequeo uc ON uc.animal_id = a.id
LEFT JOIN ultimo_servicio us ON us.animal_id = a.id
LEFT JOIN ultimo_parto up ON up.animal_id = a.id
LEFT JOIN ultimo_secado_real usr ON usr.animal_id = a.id
LEFT JOIN ultima_confirmacion ucp ON ucp.animal_id = a.id
LEFT JOIN ultimo_evento ue ON ue.animal_id = a.id;

-- PostgreSQL 15+ por defecto NO propaga la RLS del invocador en vistas
-- (security_invoker = false). Sin esto la vista correría con los
-- permisos de su dueño y filtraría filas que la RLS de las tablas base
-- debería ocultar — el mismo problema que 033 corrigió. NUNCA marcar
-- esta vista SECURITY DEFINER.
ALTER VIEW v_hato_estado_actual SET (security_invoker = true);
