-- Migration 051: clasificación de costos directo / indirecto
-- Habilita la línea de Margen de Contribución en el P&G de /finanzas/reportes.
--
-- Un gasto es DIRECTO si crece con la operación del negocio (mano de obra,
-- alimentos, control de plagas, fletes) e INDIRECTO si es estructura que
-- existe aunque el negocio no produzca (impuestos, administración, casa).
--
-- Clasificar mal un gasto SOLO mueve la línea entre Margen de Contribución y
-- Utilidad Operativa; NUNCA cambia la Utilidad Operativa. Por eso es seguro
-- estrenar con estos defaults y que Gerencia los ajuste desde
-- Configuración → Finanzas → Clasificación de costos.
--
-- Idempotente: safe to re-run.

-- ── Columnas ────────────────────────────────────────────────────────────────

-- Default 'indirecto' a propósito: lo que nadie ha revisado cae DEBAJO de la
-- línea de margen y el motor lo reporta como advertencia, en vez de inflar
-- silenciosamente el Margen de Contribución.
ALTER TABLE fin_categorias_gastos
  ADD COLUMN IF NOT EXISTS tipo_costo TEXT NOT NULL DEFAULT 'indirecto';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fin_categorias_gastos_tipo_costo_check'
  ) THEN
    ALTER TABLE fin_categorias_gastos
      ADD CONSTRAINT fin_categorias_gastos_tipo_costo_check
      CHECK (tipo_costo IN ('directo', 'indirecto'));
  END IF;
END $$;

-- NULL = hereda de la categoría. Solo se llena para las excepciones puntuales
-- (un concepto que no se comporta como el resto de su categoría).
ALTER TABLE fin_conceptos_gastos
  ADD COLUMN IF NOT EXISTS tipo_costo TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fin_conceptos_gastos_tipo_costo_check'
  ) THEN
    ALTER TABLE fin_conceptos_gastos
      ADD CONSTRAINT fin_conceptos_gastos_tipo_costo_check
      CHECK (tipo_costo IS NULL OR tipo_costo IN ('directo', 'indirecto'));
  END IF;
END $$;

-- ── Semilla ─────────────────────────────────────────────────────────────────
-- Nombres verificados contra el catálogo real de producción (2026-07-21).
-- Se usa ILIKE con comodines en vez de igualdad exacta porque el catálogo ya
-- divergió una vez del SQL versionado: el código de costo/kg compara contra
-- 'Mano de Obra' y la categoría real se llama
-- 'Mano de Obra y Asistencia Técnica'.
--
-- Solo se siembran las filas que siguen en el default, para no pisar
-- reclasificaciones que Gerencia ya haya hecho desde la UI.

UPDATE fin_categorias_gastos SET tipo_costo = 'directo'
WHERE tipo_costo = 'indirecto'
  AND (
       nombre ILIKE '%mano de obra%'          -- Mano de Obra y Asistencia Técnica
    OR nombre ILIKE '%alimento%'              -- Alimentos y Fertilizantes
    OR nombre ILIKE '%fertilizante%'
    OR nombre ILIKE '%control de plagas%'
    OR nombre ILIKE '%transporte%'            -- Transporte y Logística
    OR nombre ILIKE '%siembra%'               -- Siembra de Arboles
    OR nombre ILIKE 'ganado'                  -- costos directos del hato
    OR nombre ILIKE 'caballos'
  );

-- El resto queda 'indirecto' por default:
--   Impuestos · Gastos Generales · Equipos y Herramientas · Gastos Casa ·
--   Mantenimiento de Instalaciones · Otros General · Proyectos Especiales

COMMENT ON COLUMN fin_categorias_gastos.tipo_costo IS
  'directo = costo que crece con la operación (entra antes del Margen de Contribución); indirecto = estructura (entra después).';
COMMENT ON COLUMN fin_conceptos_gastos.tipo_costo IS
  'Override opcional del tipo_costo de la categoría. NULL = hereda.';
