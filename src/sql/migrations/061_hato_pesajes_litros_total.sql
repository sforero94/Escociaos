-- =====================================================================
-- 061: hato_pesajes_leche — litros_total pasa a ser el dato canónico
-- Fecha: 2026-07-22
--
-- Corrige un supuesto del esquema de S1 (migración 054) que la realidad
-- operativa desmintió.
--
-- QUÉ ASUMÍA 054: que el pesaje se registra partido en dos ordeños,
-- `litros_am` + `litros_pm`, y que el total es derivado:
--     litros_total NUMERIC GENERATED ALWAYS AS
--       (COALESCE(litros_am,0) + COALESCE(litros_pm,0)) STORED
--
-- QUÉ PASA EN LA FINCA (confirmado por el dueño, 2026-07-22): el pesaje se
-- hace en la finca y **se necesita una sola lectura por vaca por jornada de
-- pesaje — el total (am + pm) ya sumado**. No existe el desglose por ordeño,
-- ni en el histórico 2019-2026 (las planillas `PROMEDIO DE LECHE` traen una
-- sola cifra por día) ni en el flujo futuro.
--
-- POR QUÉ NO SE PODÍA DEJAR ASÍ: con la columna generada, cargar un total
-- obligaba a elegir entre dos mentiras — meter el total en `litros_am`
-- (afirmar que se ordeñó todo en la mañana) o dejar am/pm en NULL, que da
-- `litros_total = 0`. Ese 0 es exactamente lo que el módulo prohíbe: la
-- regla "vaca no pesada = sin dato (—), nunca 0" (plan §6 Épica D, mismo
-- contrato que "ausencia de fila = no visto" en monitoreo). Un 0 almacenado
-- es indistinguible de "esta vaca dio 0 litros".
--
-- QUÉ HACE:
--   (a) `DROP EXPRESSION` convierte `litros_total` en columna normal
--       conservando los valores existentes (PostgreSQL 14+; producción
--       corre 17). No se elimina y recrea la columna: eso perdería datos si
--       la tabla no estuviera vacía.
--   (b) `SET NOT NULL` — el total es el dato, no un derivado opcional. Una
--       fila sin total no tiene razón de existir: la ausencia de pesaje se
--       representa con la AUSENCIA DE FILA, nunca con un total nulo o cero.
--   (c) CHECK >= 0.
--   (d) `litros_am`/`litros_pm` se conservan, nullable, como detalle
--       OPCIONAL por si algún día se separa el ordeño. Ya no alimentan a
--       `litros_total`: quien escriba ambos es responsable de la coherencia.
--
-- SEGURIDAD: verificado antes de aplicar que `hato_pesajes_leche` tiene 0
-- filas (S1 creó la tabla el 2026-07-22 y todavía no se ha cargado nada),
-- así que (b) no puede fallar por datos preexistentes.
--
-- REVERSIBLE: para volver al diseño de 054 basta con
--   ALTER TABLE hato_pesajes_leche DROP COLUMN litros_total;
--   ALTER TABLE hato_pesajes_leche ADD COLUMN litros_total NUMERIC
--     GENERATED ALWAYS AS (COALESCE(litros_am,0)+COALESCE(litros_pm,0)) STORED;
-- (destructivo sobre los totales ya cargados — sólo mientras la tabla siga vacía).
--
-- No se edita 054: regla dura del repo, una migración aplicada no se toca.
--
-- Idempotente: seguro de re-ejecutar.
-- =====================================================================

DO $$
BEGIN
  -- (a) Quitar la expresión generada, sólo si todavía la tiene.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'hato_pesajes_leche'
      AND column_name = 'litros_total'
      AND is_generated = 'ALWAYS'
  ) THEN
    ALTER TABLE hato_pesajes_leche ALTER COLUMN litros_total DROP EXPRESSION;
  END IF;

  -- (b) El total es obligatorio: sin dato no hay fila.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'hato_pesajes_leche'
      AND column_name = 'litros_total'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE hato_pesajes_leche ALTER COLUMN litros_total SET NOT NULL;
  END IF;
END $$;

-- (c) Un pesaje negativo no existe.
ALTER TABLE hato_pesajes_leche
  DROP CONSTRAINT IF EXISTS hato_pesajes_leche_litros_total_no_negativo;
ALTER TABLE hato_pesajes_leche
  ADD CONSTRAINT hato_pesajes_leche_litros_total_no_negativo
  CHECK (litros_total >= 0);

-- (d) Documentar el contrato en el catálogo, donde no se pierde.
COMMENT ON COLUMN hato_pesajes_leche.litros_total IS
  'Litros totales de la jornada de pesaje (am + pm ya sumados). DATO CANÓNICO: '
  'es lo que se captura en la finca. Ausencia de pesaje = ausencia de fila, '
  'nunca 0 ni NULL (plan §6 Épica D).';
COMMENT ON COLUMN hato_pesajes_leche.litros_am IS
  'Detalle opcional por ordeño. Desde la migración 061 ya NO alimenta a '
  'litros_total; normalmente NULL.';
COMMENT ON COLUMN hato_pesajes_leche.litros_pm IS
  'Detalle opcional por ordeño. Desde la migración 061 ya NO alimenta a '
  'litros_total; normalmente NULL.';
