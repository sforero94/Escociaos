-- SCRIPT 3: DELETE DUPLICATE INGRESOS
-- Only run AFTER verifying with Script 1 that all matches are correct.
-- Deletes fin_ingresos records that have a matching venta in fin_transacciones_ganado.

BEGIN;

-- Show what will be deleted
SELECT i.id, i.fecha, i.nombre, i.valor
FROM fin_ingresos i
WHERE EXISTS (
  SELECT 1 FROM fin_transacciones_ganado t
  WHERE t.tipo = 'venta'
    AND t.fecha = i.fecha
    AND ABS(i.valor - t.valor_total) < 1
);

-- Delete
DELETE FROM fin_ingresos i
WHERE EXISTS (
  SELECT 1 FROM fin_transacciones_ganado t
  WHERE t.tipo = 'venta'
    AND t.fecha = i.fecha
    AND ABS(i.valor - t.valor_total) < 1
);

-- Verify count after deletion
SELECT COUNT(*) AS ingresos_remaining FROM fin_ingresos;

COMMIT;
-- If something looks wrong, change COMMIT to ROLLBACK and re-run.
