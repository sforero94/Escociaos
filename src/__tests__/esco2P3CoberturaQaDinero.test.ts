// Independent synthetic HTTP/SQL/renderer money oracle, frozen before exact-detail repair.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { dependencies, forbidNetwork, request } from './esco2P2Harness.ts';
import { task4QaDb, task4QaSeed } from './esco2P3Task4QaHarness.ts';
import { T3 } from './esco2P3Task3QaHarness.ts';
let db: PGlite;
beforeAll(async () => { forbidNetwork(); db = await task4QaDb(); }, 30000);
beforeEach(async () => { await task4QaSeed(db); });
afterAll(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); await db?.close(); });
async function execute() {
  const h = dependencies(db, [{ nombre: 'consultar_costos_aplicacion', argumentos: JSON.stringify({ aplicacion_id: T3.fertilizer }) }]);
  const response = await manejar(request({ pregunta: 'Costos de la aplicación sintética con detalle exacto del dinero' }), h.deps);
  return { ...h, response, body: await response.json() };
}
describe('P3 coverage QA: rounded money keeps D43 and independently auditable exact value', () => {
  it('Given rounded millions and fractional pesos, When real HTTP renders closure costs, Then exact result values remain visible without changing D43', async () => {
    await db.query('update aplicaciones set costo_total_insumos=50432198,costo_total_mano_obra=100.4,costo_total=50432298.4 where id=$1', [T3.fertilizer]);
    const h = await execute();
    expect(h.response.status).toBe(200);
    expect(h.body.resultados[0].congelado).toMatchObject({ insumos: 50432198, mano_obra: 100.4, total: 50432298.4 });
    expect(h.body.respuesta).toContain('aprox. $50,4M (valor exacto: $50.432.198)');
    expect(h.body.respuesta).toContain('aprox. $100 (valor exacto: $100,4)');
    expect(h.body.respuesta).not.toContain('COP');
  });
  it('Given original magnitude below one million rounds across its boundary, When rendered, Then the original band and exact decimal both survive', async () => {
    await db.query('update aplicaciones set costo_total_insumos=999999.6,costo_total_mano_obra=0,costo_total=999999.6 where id=$1', [T3.fertilizer]);
    const h = await execute();
    expect(h.body.respuesta).toContain('aprox. $1.000.000 (valor exacto: $999.999,6)');
    expect(h.body.respuesta).toContain('mano de obra: $0');
    expect(h.body.respuesta).not.toContain('aprox. $1,0M');
  });
  it('Given already exact integer amounts, When rendered, Then no redundant exact-detail suffix is fabricated', async () => {
    const h = await execute();
    expect(h.body.respuesta).toContain('Insumos: $120; mano de obra: $80; total: $200.');
    expect(h.body.respuesta).not.toContain('valor exacto');
  });
});
