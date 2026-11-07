// Independent SQL numeric source versus HTTP monetary contract, with literal source values.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { dependencies, forbidNetwork, request } from './esco2P2Harness.ts';
import { task4QaDb, task4QaSeed } from './esco2P3Task4QaHarness.ts';
import { T3 } from './esco2P3Task3QaHarness.ts';

let db: PGlite;
beforeAll(async () => { forbidNetwork(); db = await task4QaDb(); }, 30_000);
beforeEach(async () => { await task4QaSeed(db); });
afterAll(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); await db?.close(); });
async function cost(aplicacion_id: string) {
  const h = dependencies(db, [{ nombre: 'consultar_costos_aplicacion', argumentos: JSON.stringify({ aplicacion_id }) }]);
  const response = await manejar(request({ pregunta: 'Costo de la aplicación sintética seleccionada' }), h.deps);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.resultados).toHaveLength(1);
  return body;
}

describe('M6 QA: monetary detail and reconciliation use the same unrounded basis', () => {
  it('preserves more than twelve significant source digits in current valuation and exact detail', async () => {
    await db.query('update productos set precio_unitario=1234567.1234567 where id=$1', [T3.productR]);
    await db.query('update movimientos_diarios_productos set cantidad_utilizada=1 where movimiento_diario_id=$1', [T3.liquidMovement]);
    const oracle = await db.query<{ exacto: string }>('select precio_unitario::text exacto from productos where id=$1', [T3.productR]);
    expect(oracle.rows[0].exacto).toBe('1234567.1234567');
    const body = await cost(T3.liquid);
    expect(body.resultados[0].ejecucion.total).toBe(Number(oracle.rows[0].exacto));
    expect(body.resultados[0].ejecucion.filas[0].costo).toBe(Number(oracle.rows[0].exacto));
    expect(body.respuesta).toContain('1.234.567,1234567');
    expect(body.respuesta).toMatch(/aprox/i);
  });

  it('does not certify a frozen mismatch hidden by twelve-significant-digit rounding', async () => {
    await db.query('update aplicaciones set costo_total_insumos=123456789.123456,costo_total_mano_obra=0,costo_total=123456789.123457 where id=$1', [T3.fertilizer]);
    const oracle = await db.query<{ diferencia: string }>('select (costo_total-costo_total_insumos-costo_total_mano_obra)::text diferencia from aplicaciones where id=$1', [T3.fertilizer]);
    expect(oracle.rows[0].diferencia).toBe('0.000001');
    const body = await cost(T3.fertilizer);
    expect(body.resultados[0].congelado.estado).toBe('discrepancia');
    expect(body.resultados[0].congelado.total).toBeNull();
  });

  it('retains an exactly reconciled fractional frozen cost as a substantive control', async () => {
    await db.query('update aplicaciones set costo_total_insumos=1.25,costo_total_mano_obra=2.25,costo_total=3.5 where id=$1', [T3.fertilizer]);
    const body = await cost(T3.fertilizer);
    expect(body.resultados[0].congelado).toMatchObject({ estado: 'conocido', insumos: 1.25, mano_obra: 2.25, total: 3.5 });
    expect(body.respuesta).toContain('3,5');
  });

  it('does not lose monetary precision while grouping two source quantities before valuation', async () => {
    await db.query('update productos set precio_unitario=1 where id=$1', [T3.productR]);
    await db.query('update movimientos_diarios_productos set cantidad_utilizada=1.2345678912345 where movimiento_diario_id=$1', [T3.liquidMovement]);
    await db.query(`insert into movimientos_diarios_productos select '86000000-0000-4000-8000-000000000008',movimiento_diario_id,producto_id,producto_nombre,producto_categoria,cantidad_utilizada,unidad from movimientos_diarios_productos where movimiento_diario_id=$1`, [T3.liquidMovement]);
    const oracle = await db.query<{ exacto: string }>('select sum(cantidad_utilizada)::text exacto from movimientos_diarios_productos where movimiento_diario_id=$1', [T3.liquidMovement]);
    const expected = Number(oracle.rows[0].exacto);
    expect(expected).toBe(2.469135782469);
    const body = await cost(T3.liquid);
    expect(body.resultados[0].ejecucion.total).toBe(expected);
    expect(body.resultados[0].ejecucion.filas[0].cantidad).toBe(expected);
  });
});
