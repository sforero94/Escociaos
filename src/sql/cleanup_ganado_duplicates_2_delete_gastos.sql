-- SCRIPT 2: DELETE DUPLICATE GASTOS
-- Only run AFTER verifying with Script 1 that all matches are correct.
-- Deletes fin_gastos records that have a matching compra in fin_transacciones_ganado.

BEGIN;

-- Show what will be deleted
SELECT g.id, g.fecha, g.nombre, g.valor
FROM fin_gastos g
WHERE EXISTS (
  SELECT 1 FROM fin_transacciones_ganado t
  WHERE t.tipo = 'compra'
    AND t.fecha = g.fecha
    AND ABS(g.valor - t.valor_total) < 1
);

-- Delete
DELETE FROM fin_gastos g
WHERE EXISTS (
  SELECT 1 FROM fin_transacciones_ganado t
  WHERE t.tipo = 'compra'
    AND t.fecha = g.fecha
    AND ABS(g.valor - t.valor_total) < 1
);

-- Verify count after deletion
SELECT COUNT(*) AS gastos_remaining FROM fin_gastos;

COMMIT;
-- If something looks wrong, change COMMIT to ROLLBACK and re-run.
