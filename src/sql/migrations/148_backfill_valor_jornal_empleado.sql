-- Migración 148: backfill de registros_trabajo.valor_jornal_empleado
-- histórico (hallazgo ESCO-45)
--
-- registros_trabajo.valor_jornal_empleado tiene dos significados guardados
-- en la misma columna: costo_jornal es lo pagado por la FRACCIÓN trabajada
-- ese día; valor_jornal_empleado debería ser la tarifa de UN jornal
-- completo (costo_jornal / fraccion_jornal), independiente de cuánto se
-- trabajó. Tres de los cuatro puntos de escritura (RegistrarTrabajoDialog,
-- EditarRegistroDialog, el conversation de Telegram jornal.ts) guardaban en
-- su lugar el salario mensual crudo del empleado -- ~30 veces el valor
-- real -- porque nunca llamaban al helper que ya calculaba el número
-- correcto (calcularValorJornalEmpleadoNuevo, calculosCierreAplicacion.ts).
-- El código ya se corrigió (PR #229): esta migración corrige el DATO ya
-- escrito con el bug, que el código nuevo no toca retroactivamente.
--
-- POR QUÉ SE DERIVA DE costo_jornal Y NUNCA DE empleados.salario. El primer
-- borrador de este arreglo iba a recalcular desde el salario/prestaciones/
-- auxilios ACTUALES del empleado -- y eso habría sido el error: esos campos
-- cambian con el tiempo (un aumento de sueldo, por ejemplo), así que el
-- salario de HOY no es el salario vigente cuando se capturó un registro de
-- hace nueve meses. Comprobado en vivo: para una muestra de filas de
-- 2025-12-26/27, `costo_jornal / fraccion_jornal` da 47.450, mientras que
-- `(salario+prestaciones+auxilios ACTUALES)/22` da 114.004 -- un número
-- completamente distinto, porque esos tres campos ya cambiaron desde
-- entonces. `costo_jornal` en cambio es un HECHO ya escrito: es lo que
-- realmente se calculó y se pagó ese día, con los datos del empleado
-- vigentes EN ESE MOMENTO. Por construcción (ver PR #229 y
-- src/utils/laborCosts.ts: `totalCost = dailyCost × fractionWorked`),
-- `costo_jornal / fraccion_jornal` reconstruye exactamente esa tarifa
-- diaria histórica sin necesitar ni adivinar el salario de la fecha -- es
-- una reparación de CONSISTENCIA INTERNA entre dos columnas de la misma
-- fila, no un recálculo contra una tabla externa que pudo haber cambiado.
--
-- ALCANCE: sólo filas con empleado_id (contratistas usan tarifa_jornal
-- fija, sin este defecto -- ver calculateContractorCost, que nunca guardó
-- el salario). fraccion_jornal es un ENUM con 4 valores, todos > 0 (CHECK
-- de la tabla), así que la división nunca falla por cero.
--
-- Verificado antes de escribir: 2.694 filas con empleado_id, 75 ya
-- correctas (coinciden con costo_jornal/fraccion_jornal dentro de 1
-- centavo), 2.619 a corregir. Ninguna fila tiene costo_jornal o
-- fraccion_jornal en NULL.
--
-- Respaldo completo en `respaldos.backup_148_valor_jornal_empleado`
-- (patrón 081, nunca en `public`) antes de escribir. Filas afectadas:
-- ~2.619 UPDATE. No se toca costo_jornal, fraccion_jornal ni ninguna otra
-- columna.

DO $$
DECLARE
  v_total_empleado integer;
  v_a_corregir integer;
  v_sin_costo integer;
  v_sin_fraccion integer;
BEGIN
  SELECT count(*) INTO v_total_empleado FROM registros_trabajo WHERE empleado_id IS NOT NULL;
  IF v_total_empleado = 0 THEN
    RAISE EXCEPTION '148 ABORTADA (pre): 0 filas con empleado_id -- no hay nada que corregir, algo cambió respecto a lo verificado.';
  END IF;

  SELECT count(*) INTO v_sin_costo FROM registros_trabajo WHERE empleado_id IS NOT NULL AND costo_jornal IS NULL;
  SELECT count(*) INTO v_sin_fraccion FROM registros_trabajo WHERE empleado_id IS NOT NULL AND fraccion_jornal IS NULL;
  IF v_sin_costo > 0 OR v_sin_fraccion > 0 THEN
    RAISE EXCEPTION '148 ABORTADA (pre): % filas sin costo_jornal y % sin fraccion_jornal -- la derivación no puede calcularse para todas las filas, revisar a mano antes de continuar.', v_sin_costo, v_sin_fraccion;
  END IF;

  SELECT count(*) INTO v_a_corregir
  FROM registros_trabajo
  WHERE empleado_id IS NOT NULL
    AND ABS(valor_jornal_empleado - ROUND(costo_jornal / fraccion_jornal::text::numeric, 2)) >= 0.01;
  IF v_a_corregir = 0 THEN
    RAISE EXCEPTION '148 ABORTADA (pre): 0 filas difieren de la tarifa derivada -- lo más probable es que esta migración ya se aplicó. Revisar a mano antes de reintentar.';
  END IF;

  RAISE NOTICE '148: % filas con empleado_id, % a corregir.', v_total_empleado, v_a_corregir;
END $$;

CREATE SCHEMA IF NOT EXISTS respaldos;

CREATE TABLE respaldos.backup_148_valor_jornal_empleado AS
SELECT id, empleado_id, fecha_trabajo, fraccion_jornal, costo_jornal, valor_jornal_empleado
FROM registros_trabajo
WHERE empleado_id IS NOT NULL
  AND ABS(valor_jornal_empleado - ROUND(costo_jornal / fraccion_jornal::text::numeric, 2)) >= 0.01;

ALTER TABLE respaldos.backup_148_valor_jornal_empleado ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON respaldos.backup_148_valor_jornal_empleado FROM anon, authenticated, PUBLIC;

UPDATE registros_trabajo
SET valor_jornal_empleado = ROUND(costo_jornal / fraccion_jornal::text::numeric, 2),
    updated_at = now()
WHERE empleado_id IS NOT NULL
  AND ABS(valor_jornal_empleado - ROUND(costo_jornal / fraccion_jornal::text::numeric, 2)) >= 0.01;

DO $$
DECLARE
  v_respaldadas integer;
  v_restantes integer;
  v_costo_tocado integer;
BEGIN
  SELECT count(*) INTO v_respaldadas FROM respaldos.backup_148_valor_jornal_empleado;

  SELECT count(*) INTO v_restantes
  FROM registros_trabajo
  WHERE empleado_id IS NOT NULL
    AND ABS(valor_jornal_empleado - ROUND(costo_jornal / fraccion_jornal::text::numeric, 2)) >= 0.01;
  IF v_restantes <> 0 THEN
    RAISE EXCEPTION '148 ABORTADA (post): quedan % filas sin converger con la tarifa derivada -- el UPDATE no cerró.', v_restantes;
  END IF;

  -- El UPDATE nunca debía tocar costo_jornal/fraccion_jornal: se compara
  -- fila a fila contra el respaldo para confirmar que sólo cambió lo que
  -- debía cambiar.
  SELECT count(*) INTO v_costo_tocado
  FROM registros_trabajo rt
  JOIN respaldos.backup_148_valor_jornal_empleado b ON b.id = rt.id
  WHERE rt.costo_jornal IS DISTINCT FROM b.costo_jornal
     OR rt.fraccion_jornal IS DISTINCT FROM b.fraccion_jornal;
  IF v_costo_tocado <> 0 THEN
    RAISE EXCEPTION '148 ABORTADA (post): % filas tienen costo_jornal o fraccion_jornal distintos del respaldo -- el UPDATE tocó columnas que no debía.', v_costo_tocado;
  END IF;

  RAISE NOTICE '148 OK: % filas respaldadas y corregidas, 0 restantes sin converger, costo_jornal/fraccion_jornal intactos.', v_respaldadas;
END $$;

-- ROLLBACK (no ejecutar salvo instrucción explícita del dueño):
-- UPDATE registros_trabajo rt
-- SET valor_jornal_empleado = b.valor_jornal_empleado
-- FROM respaldos.backup_148_valor_jornal_empleado b
-- WHERE rt.id = b.id;
