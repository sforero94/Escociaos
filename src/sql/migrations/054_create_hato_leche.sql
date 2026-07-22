-- =====================================================================
-- 054: Hato Lechero — producción de leche (pesajes + producción quincenal)
-- Fecha: 2026-07-22
--
-- Parte del PR único de S1 (hato) — plan docs/plan_hato_lechero_module.md
-- §7.1–7.2, renumerado 050→053…057→060 (ver brief S1, Decisión 1).
--
-- Tablas:
--   hato_pesajes_leche       — pesaje semanal por vaca (AM/PM), V2/D1.
--   hato_produccion_quincenal — litros al camión por quincena (V3, D2),
--     reemplaza el concepto "litros diarios" del plan original. UNIQUE
--     corregido a (anio, mes, quincena) — el plan tenía UNIQUE(anio,
--     quincena), que solo permite 2 filas por año; ver brief Decisión 4
--     / Desviación 4.
--
-- Regla D4/D7 del módulo (Épica D): "vaca no pesada = sin dato (—), nunca
-- 0" es una regla de fila-ausente que se aplica en UI — hato_pesajes_leche
-- no necesita una columna de "no pesada".
--
-- RLS: patrón 044 — SELECT para authenticated, escritura Administrador +
-- Gerencia.
--
-- Idempotente: seguro de re-ejecutar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. hato_pesajes_leche — pesaje semanal por vaca
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hato_pesajes_leche (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id UUID NOT NULL REFERENCES hato_animales(id),
  fecha DATE NOT NULL,
  litros_am NUMERIC,
  litros_pm NUMERIC,
  litros_total NUMERIC GENERATED ALWAYS AS (COALESCE(litros_am, 0) + COALESCE(litros_pm, 0)) STORED,
  fuente TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE (animal_id, fecha)
);

-- El UNIQUE (animal_id, fecha) ya cubre las búsquedas por animal; este
-- índice adicional cubre las búsquedas por fecha (curva de producción
-- del hato completo).
CREATE INDEX IF NOT EXISTS idx_hato_pesajes_leche_fecha ON hato_pesajes_leche(fecha);

-- ---------------------------------------------------------------------
-- 2. hato_produccion_quincenal — litros al camión por quincena (V3)
--    Productividad = litros_total / num_vacas_ordeno (derivada, nunca
--    almacenada).
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hato_produccion_quincenal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anio INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  quincena INTEGER NOT NULL CHECK (quincena IN (1, 2)),
  fecha_inicio DATE,
  fecha_fin DATE,
  litros_total NUMERIC NOT NULL CHECK (litros_total >= 0),
  litros_pomar_confirmado NUMERIC,
  num_vacas_ordeno INTEGER,
  notas TEXT,
  fuente TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE (anio, mes, quincena)
);

CREATE INDEX IF NOT EXISTS idx_hato_produccion_quincenal_anio_mes ON hato_produccion_quincenal(anio, mes);

-- ---------------------------------------------------------------------
-- 3. RLS — patrón 044
-- ---------------------------------------------------------------------

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['hato_pesajes_leche', 'hato_produccion_quincenal']
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
