// HTTP conversation/opaque-state tests explicitly enable the new intention contract.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import type { ClienteLLM, SolicitudLLM } from '../utils/esco2/llm.ts';
import { dependencies, forbidNetwork, ID, plan, request } from './esco2P2Harness.ts';
import { task2QaDb, task2QaSeed } from './esco2P3Task2QaHarness.ts';

let db: PGlite;
beforeAll(async () => { forbidNetwork(); db = await task2QaDb(); }, 30_000);
beforeEach(async () => { await task2QaSeed(db); });
afterAll(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); await db?.close(); });
const instant = new Date('2026-11-05T17:00:00Z');
const question = 'Aplicaciones del 2026-11-01 al 2026-11-03';
function intention(q: string, capacity: string, population: unknown, period: unknown, metrics: string[]) {
  return { version: 1, obligaciones: [{ id: 'o1', evidencias: [{ mensaje: 'actual', inicio: 0, fin: q.length }], capacidad: capacity, poblacion: population, periodo: period, metricas: metrics, agrupaciones: [], condiciones: [], detalle: 'resumen' }], residuales: [] };
}
function script(q: string, intent: unknown, name: string, args: Record<string, unknown>) {
  const requests: SolicitudLLM[] = [];
  const llm: ClienteLLM = { async completar(s) {
    requests.push(structuredClone(s));
    return { texto: '', llamadas: requests.length === 1 ? [{ nombre: 'declarar_intencion', argumentos: JSON.stringify(intent) }] : [{ nombre: name, argumentos: JSON.stringify({ ...args, cobertura: { version: 1, partes: [{ id: 's1', texto: q, capacidad: name === 'consultar_labores' ? 'labores' : 'aplicaciones', disposicion: 'consultar' }] }, parte_ids: ['s1'] }) }], uso: { entrada: 1, salida: 1, razonamiento: 0, costoUsd: 0 }, ms: 0, modelo: s.modelo, finishReason: 'stop' };
  } };
  const h = dependencies(db, [], { crearLLM: () => llm, modoCobertura: 'obligatoria', ahora: () => instant });
  return { requests, deps: { ...h.deps, modoIntencion: 'obligatoria' as const } };
}
async function startDate() {
  const h = script(question, intention(question, 'aplicaciones', { tipo: 'todas_visibles', entidad: 'aplicaciones' }, { tipo: 'sin_precisar' }, ['conteo', 'estado_actual']), 'consultar_aplicaciones', { desde: '2026-11-01', hasta: '2026-11-03', base_fecha: 'sin_precisar' });
  const response = await manejar(request({ pregunta: question }), h.deps);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.origen).toBe('aclaracion');
  expect(body.estadoToken).toBeTruthy();
  expect(body.opcionesAclaracion.map((o: { id: string }) => o.id)).toContain('fecha_inicio_planeada');
  return { ...h, body };
}

describe('M6 QA: intention-aware D26, state ownership and changed context', () => {
  it('resolves the date button without another provider call and stores the refined temporal contract', async () => {
    const first = await startDate();
    const blocked = vi.fn(async () => { throw new Error('NO_MODEL_FOR_BUTTON'); });
    const response = await manejar(request({ pregunta: question, estadoToken: first.body.estadoToken, respuestaAclaracion: 'fecha_inicio_planeada' }), { ...first.deps, crearLLM: () => ({ completar: blocked }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(blocked).not.toHaveBeenCalled();
    expect(body.origen).toBe('determinista');
    expect(body.resultados[0].conteo).toBe(3);
    expect(body.intencion.obligaciones[0].periodo).toEqual({ tipo: 'intervalo', desde: '2026-11-01', hasta: '2026-11-03', base_fecha: 'fecha_inicio_planeada' });
    expect(body.estadoToken).toBeTruthy();
  });

  it.each(['owner', 'expired'])('does not use an opaque state from another %s context', async kind => {
    const first = await startDate();
    const llm = vi.fn(async () => { throw new Error('NO_PROVIDER_ON_INVALID_STATE'); });
    const response = await manejar(request({ pregunta: question, estadoToken: first.body.estadoToken, respuestaAclaracion: 'fecha_inicio_planeada' }, kind === 'owner' ? ID.other : undefined), { ...first.deps, ahora: () => kind === 'expired' ? new Date(instant.getTime() + 16 * 60_000) : instant, crearLLM: () => ({ completar: llm }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.origen).toBe('aclaracion');
    expect(body.avisoEstado).toBe('contexto_no_disponible');
    expect(body.resultados).toEqual([]);
    expect(llm).not.toHaveBeenCalled();
  });

  it('gives a new explicit period priority over an unresolved earlier date clarification', async () => {
    const first = await startDate();
    const q = 'Ahora consulta aplicaciones con inicio planeado del 2026-11-01 al 2026-11-01';
    const next = script(q, intention(q, 'aplicaciones', { tipo: 'todas_visibles', entidad: 'aplicaciones' }, { tipo: 'intervalo', desde: '2026-11-01', hasta: '2026-11-01', base_fecha: 'fecha_inicio_planeada' }, ['conteo', 'estado_actual']), 'consultar_aplicaciones', { desde: '2026-11-01', hasta: '2026-11-01', base_fecha: 'fecha_inicio_planeada' });
    const response = await manejar(request({ pregunta: q, estadoToken: first.body.estadoToken }), next.deps);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(next.requests).toHaveLength(2);
    expect(body.origen).toBe('determinista');
    expect(body.resultados[0].consulta.hasta).toBe('2026-11-01');
    expect(body.resultados[0].conteo).toBe(2);
  });

  it('resolves the category/task button by visible IDs and preserves a valid refined intention state', async () => {
    await db.query("update tareas set nombre='Mantenimiento del cultivo sintético' where id=any($1::uuid[])", [[ID.t1, ID.t2]]);
    const q = 'Jornales de Mantenimiento del cultivo del 2026-10-26 al 2026-11-01';
    const first = script(q, intention(q, 'labores', { tipo: 'todas_visibles', entidad: 'labores', sin_lote: 'incluir', filtros: [{ campo: 'categorias', valores: ['Mantenimiento del cultivo'] }] }, { tipo: 'intervalo', desde: '2026-10-26', hasta: '2026-11-01', base_fecha: 'fecha_trabajo' }, ['jornales']), 'consultar_labores', plan({ categorias: ['Mantenimiento del cultivo'], metricas: ['jornales'], agrupar_por: [] }));
    const response = await manejar(request({ pregunta: q }), first.deps);
    expect(response.status).toBe(200);
    const pending = await response.json();
    expect(pending.estadoToken).toBeTruthy();
    expect(pending.opcionesAclaracion.map((o: { id: string }) => o.id)).toContain('tarea');
    const blocked = vi.fn(async () => { throw new Error('NO_MODEL_FOR_D26_BUTTON'); });
    const followup = await manejar(request({ pregunta: q, estadoToken: pending.estadoToken, respuestaAclaracion: 'tarea' }), { ...first.deps, crearLLM: () => ({ completar: blocked }) });
    expect(followup.status).toBe(200);
    const body = await followup.json();
    expect(blocked).not.toHaveBeenCalled();
    expect(body.origen).toBe('determinista');
    expect(body.resultados[0].alcance.tarea_ids.sort()).toEqual([ID.t1, ID.t2].sort());
    expect(body.resultados[0].total.jornales).toBe(2.5);
    expect(body.estadoToken).toBeTruthy();
  });
});
