-- SCRIPT 1: VERIFY DUPLICATES
-- Run this FIRST. Review the output to confirm every row is a true duplicate.
-- Matches fin_gastos/fin_ingresos records against fin_transacciones_ganado by fecha + valor.

-- ============================================================
-- 1A. Gastos that match ganado COMPRAS (by fecha + valor)
-- ============================================================
SELECT
  g.id AS gasto_id,
  g.fecha,
  g.nombre AS gasto_nombre,
  g.valor AS gasto_valor,
  t.id AS ganado_id,
  t.finca,
  t.cliente_proveedor,
  t.cantidad_cabezas,
  t.valor_total AS ganado_valor,
  n.nombre AS negocio
FROM fin_gastos g
JOIN fin_transacciones_ganado t
  ON g.fecha = t.fecha
  AND ABS(g.valor - t.valor_total) < 1  -- tolerance for rounding
  AND t.tipo = 'compra'
LEFT JOIN fin_negocios n ON g.negocio_id = n.id
ORDER BY g.fecha DESC;

-- ============================================================
-- 1B. Ingresos that match ganado VENTAS (by fecha + valor)
-- ============================================================
SELECT
  i.id AS ingreso_id,
  i.fecha,
  i.nombre AS ingreso_nombre,
  i.valor AS ingreso_valor,
  t.id AS ganado_id,
  t.finca,
  t.cliente_proveedor,
  t.cantidad_cabezas,
  t.valor_total AS ganado_valor,
  n.nombre AS negocio
FROM fin_ingresos i
JOIN fin_transacciones_ganado t
  ON i.fecha = t.fecha
  AND ABS(i.valor - t.valor_total) < 1
  AND t.tipo = 'venta'
LEFT JOIN fin_negocios n ON i.negocio_id = n.id
ORDER BY i.fecha DESC;

-- ============================================================
-- 1C. Summary counts
-- ============================================================
SELECT 'Gastos duplicados' AS tipo,
  COUNT(*) AS cantidad,
  SUM(g.valor) AS valor_total
FROM fin_gastos g
JOIN fin_transacciones_ganado t
  ON g.fecha = t.fecha
  AND ABS(g.valor - t.valor_total) < 1
  AND t.tipo = 'compra'

UNION ALL

SELECT 'Ingresos duplicados' AS tipo,
  COUNT(*) AS cantidad,
  SUM(i.valor) AS valor_total
FROM fin_ingresos i
JOIN fin_transacciones_ganado t
  ON i.fecha = t.fecha
  AND ABS(i.valor - t.valor_total) < 1
  AND t.tipo = 'venta';
