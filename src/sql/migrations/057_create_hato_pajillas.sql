-- =====================================================================
-- 057: Hato Lechero — pajillas de inseminación (Épica G)
-- Fecha: 2026-07-22
--
-- Parte del PR único de S1 (hato) — plan docs/plan_hato_lechero_module.md
-- §7.1–7.2, renumerado 050→053…057→060 (ver brief S1, Decisión 1).
--
-- Renombrado desde el nombre del plan "create_hato_toros_pajillas": el catálogo
-- hato_toros se movió a 053 (core) porque hato_animales.padre_toro_id y
-- hato_eventos.toro_id lo referencian y ambas tablas se crean antes que
-- este archivo (brief Decisión 2). Este archivo conserva solo la
-- funcionalidad de pajillas.
--
-- Deliberadamente mínimo (G1-G3): sin proveedor/costo — no solicitados.
-- El toro se referencia desde el catálogo hato_toros (V12), nunca texto
-- suelto.
--
-- Tablas:
--   hato_pajillas      — inventario: toro + cantidad inicial.
--   hato_pajillas_uso  — log de uso append-only (mismo patrón de capa de
--                         eventos que hato_eventos); vaca servida es
--                         opcional (G2 — mejor registrar el uso sin la
--                         vaca que no registrarlo).
--
-- Vista v_hato_pajillas_stock: cantidad_actual = cantidad_inicial -
-- COUNT(usos), sin tabla de stock materializada (volumen trivial, §7.1).
-- Puede quedar negativa — la UI advierte, no bloquea (G3).
--
-- RLS: patrón 044 — SELECT para authenticated, escritura Administrador +
-- Gerencia.
--
-- Idempotente: seguro de re-ejecutar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. hato_pajillas — inventario de pajillas por toro
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hato_pajillas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  toro_id UUID NOT NULL REFERENCES hato_toros(id),
  cantidad_inicial INTEGER NOT NULL CHECK (cantidad_inicial >= 0),
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_hato_pajillas_toro_id ON hato_pajillas(toro_id);

-- ---------------------------------------------------------------------
-- 2. hato_pajillas_uso — log de uso, append-only
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hato_pajillas_uso (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pajilla_id UUID NOT NULL REFERENCES hato_pajillas(id),
  fecha_uso DATE NOT NULL,
  animal_id UUID REFERENCES hato_animales(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_hato_pajillas_uso_pajilla_id ON hato_pajillas_uso(pajilla_id);

-- ---------------------------------------------------------------------
-- 3. RLS — patrón 044
-- ---------------------------------------------------------------------

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['hato_pajillas', 'hato_pajillas_uso']
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
-- 4. Vista v_hato_pajillas_stock
-- ---------------------------------------------------------------------

CREATE OR REPLACE VIEW v_hato_pajillas_stock AS
SELECT
  p.id AS pajilla_id,
  p.toro_id,
  p.cantidad_inicial,
  COUNT(u.id) AS usos,
  (p.cantidad_inicial - COUNT(u.id)) AS cantidad_actual
FROM hato_pajillas p
LEFT JOIN hato_pajillas_uso u ON u.pajilla_id = p.id
GROUP BY p.id;

-- Ver nota de security_invoker en 056 (mismo fix que 033 aplicó a las
-- vistas financieras — nunca SECURITY DEFINER).
ALTER VIEW v_hato_pajillas_stock SET (security_invoker = true);
