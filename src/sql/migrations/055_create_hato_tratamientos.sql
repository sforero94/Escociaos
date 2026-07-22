-- =====================================================================
-- 055: Hato Lechero — tratamientos veterinarios (protocolos + pasos)
-- Fecha: 2026-07-22
--
-- Parte del PR único de S1 (hato) — plan docs/plan_hato_lechero_module.md
-- §7.1–7.2, renumerado 050→053…057→060 (ver brief S1, Decisión 1).
--
-- Tablas:
--   hato_protocolos        — catálogo reusable (ej. "Estrumate": día 0
--                             aplicar → día 7 servir → día 9 verificar
--                             celo) para que Martha elija en vez de
--                             digitar (B3).
--   hato_tratamientos       — prescripción del chequeo (protocolo o
--                             tratamiento libre — nota libre siempre
--                             disponible, B3).
--   hato_tratamiento_pasos  — pasos programados/ejecutados; el motor de
--                             alertas (056+) lee los pendientes
--                             (`tratamiento_paso`, §7.3).
--
-- RLS: patrón 044 — SELECT para authenticated, escritura Administrador +
-- Gerencia.
--
-- Idempotente: seguro de re-ejecutar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. hato_protocolos — catálogo de protocolos de tratamiento
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hato_protocolos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  descripcion TEXT,
  -- Array de {paso_num, offset_dias, descripcion, requiere_confirmacion}
  pasos_default JSONB,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS hato_protocolos_nombre_unique
  ON hato_protocolos (lower(nombre));

-- ---------------------------------------------------------------------
-- 2. hato_tratamientos — prescripción por animal
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hato_tratamientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id UUID NOT NULL REFERENCES hato_animales(id),
  chequeo_id UUID REFERENCES hato_chequeos(id),
  protocolo_id UUID REFERENCES hato_protocolos(id),
  nombre TEXT,
  fecha_inicio DATE NOT NULL,
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'completado', 'cancelado')),
  nota TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_hato_tratamientos_animal_id ON hato_tratamientos(animal_id);

-- ---------------------------------------------------------------------
-- 3. hato_tratamiento_pasos — pasos programados de cada tratamiento
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hato_tratamiento_pasos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tratamiento_id UUID NOT NULL REFERENCES hato_tratamientos(id) ON DELETE CASCADE,
  paso_num INTEGER NOT NULL,
  descripcion TEXT,
  offset_dias INTEGER NOT NULL DEFAULT 0,
  fecha_programada DATE NOT NULL,
  fecha_ejecutada DATE,
  requiere_confirmacion BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tratamiento_id, paso_num)
);

-- Parcial: el motor de alertas lee solo los pasos pendientes
-- (regla tratamiento_paso, §7.3).
CREATE INDEX IF NOT EXISTS idx_hato_tratamiento_pasos_pendientes
  ON hato_tratamiento_pasos(fecha_programada) WHERE fecha_ejecutada IS NULL;

-- ---------------------------------------------------------------------
-- 4. RLS — patrón 044
-- ---------------------------------------------------------------------

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['hato_protocolos', 'hato_tratamientos', 'hato_tratamiento_pasos']
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
