// Supplemental independent future-range control, with real HTTP handler and SQL/RLS source.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { dependencies, forbidNetwork, ID, p2Db, plan, request, tool } from './esco2P2Harness.ts';
let db: PGlite;
beforeAll(async () => { forbidNetwork(); db = await p2Db(); }, 30000);
afterAll(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); await db?.close(); });
describe('P3 coverage QA: unavailable future work is not zero', () => {
  it('Given only a future work interval, When clipping to today leaves no valid interval, Then coverage does not certify an inverted empty range as answered', async () => {
    const pregunta = 'jornales del 2027-01-01 al 2027-01-31';
    const h = dependencies(db, [tool(plan({ desde: '2027-01-01', hasta: '2027-01-31', metricas: ['jornales'], cobertura: { version: 1, partes: [{ id: 's1', texto: pregunta, capacidad: 'labores', disposicion: 'consultar' }] }, parte_ids: ['s1'] }))]);
    const response = await manejar(request({ pregunta }), { ...h.deps, modoCobertura: 'obligatoria' as const });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.cobertura.partes[0].disposicion).toBe('fuente_no_disponible');
    expect(body.respuesta).not.toMatch(/Se registraron 0 jornales/i);
    expect(h.traza.consultas.filter(q => q.tabla === 'registros_trabajo')).toHaveLength(0);
  });
  it('Given future scheduled tasks, When their explicit planned-start interval is queried, Then valid future membership is answered without reading historical work', async () => {
    const pregunta = 'tareas programadas para el 2026-11-10 al 2026-11-12';
    const h = dependencies(db, [tool(plan({ cohorte: 'tarea_programada', base_fecha: 'fecha_estimada_inicio', desde: '2026-11-10', hasta: '2026-11-12', agrupar_por: ['tarea'], metricas: [], cobertura: { version: 1, partes: [{ id: 's1', texto: pregunta, capacidad: 'labores', disposicion: 'consultar' }] }, parte_ids: ['s1'] }))]);
    const response = await manejar(request({ pregunta }), { ...h.deps, modoCobertura: 'obligatoria' as const });
    const body = await response.json();
    expect(body.cobertura.partes[0].disposicion).toBe('respondida');
    expect(body.resultados[0].semantica.miembros).toEqual([ID.t1, ID.t2]);
    expect(body.resultados[0].alcance.hasta).toBe('2026-11-12');
    expect(body.resultados[0].total.jornales).toBeUndefined();
    expect(h.traza.consultas.filter(q => q.tabla === 'registros_trabajo')).toHaveLength(0);
  });
});
