// Supplemental independent metric-availability integration oracle. Synthetic source only.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { dependencies, forbidNetwork, p2Db, plan, request, tool } from './esco2P2Harness.ts';
let db: PGlite;
beforeAll(async () => { forbidNetwork(); db = await p2Db(); }, 30000);
afterAll(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); await db?.close(); });
describe('P3 coverage QA: requested metric availability', () => {
  it('Given readable labor rows and one NULL requested cost, When aggregate row state is ok, Then coverage still declares requested money unavailable', async () => {
    await db.exec('update registros_trabajo set costo_jornal=null where fraccion_jornal::text=\'0.5\'');
    const pregunta = 'jornales y costo laboral del período';
    const call = tool(plan({ cobertura: { version: 1, partes: [{ id: 's1', texto: pregunta, capacidad: 'labores', disposicion: 'consultar' }] }, parte_ids: ['s1'] }));
    const h = dependencies(db, [call]);
    const response = await manejar(request({ pregunta }), { ...h.deps, modoCobertura: 'obligatoria' as const });
    const body = await response.json();
    expect(body.resultados[0].estado).toBe('ok');
    expect(body.resultados[0].total.jornales).toBe(2.5);
    expect(body.resultados[0].total.costo).toBeNull();
    expect(body.cobertura.partes[0]).toMatchObject({ disposicion: 'fuente_no_disponible', parcial: true });
    expect(body.respuesta).not.toMatch(/costo de mano de obra: \$0/i);
  });
});
