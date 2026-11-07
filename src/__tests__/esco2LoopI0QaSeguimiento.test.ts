// Source-defined selected application population, opaque state and deictic follow-ups.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import type { ClienteLLM, SolicitudLLM } from '../utils/esco2/llm.ts';
import { dependencies, forbidNetwork, request } from './esco2P2Harness.ts';
import { APPS, task2QaDb, task2QaSeed } from './esco2P3Task2QaHarness.ts';

let db: PGlite;
beforeAll(async () => { forbidNetwork(); db = await task2QaDb(); }, 30_000);
beforeEach(async () => { await task2QaSeed(db); });
afterAll(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); await db?.close(); });
const selected = [APPS.closed, APPS.unlinked, APPS.nullMetadata].sort();
const date = new Date('2026-11-07T17:00:00Z');
const firstQuestion = `Aplicaciones ${selected.join(', ')} con inicio planeado del 2026-11-01 al 2026-11-03`;
const followQuestion = '¿Cuáles son esas tres?';
function provider(q: string, ids: string[] | 'todas' = selected) {
  const requests: SolicitudLLM[] = [];
  const population = ids === 'todas' ? { tipo: 'todas_visibles', entidad: 'aplicaciones' } : { tipo: 'explicita', entidad: 'aplicaciones', ids };
  const intent = { version: 1, obligaciones: [{ id: 'o1', evidencias: [{ mensaje: 'actual', inicio: 0, fin: q.length }], capacidad: 'aplicaciones', poblacion: population, periodo: { tipo: 'intervalo', desde: '2026-11-01', hasta: '2026-11-03', base_fecha: 'fecha_inicio_planeada' }, metricas: ['conteo'], agrupaciones: [], condiciones: [], detalle: 'resumen' }], residuales: [] };
  const llm: ClienteLLM = { async completar(s) {
    requests.push(structuredClone(s));
    return { texto: '', llamadas: requests.length === 1 ? [{ nombre: 'declarar_intencion', argumentos: JSON.stringify(intent) }] : [{ nombre: 'consultar_aplicaciones', argumentos: JSON.stringify({ desde: '2026-11-01', hasta: '2026-11-03', base_fecha: 'fecha_inicio_planeada', ...(ids === 'todas' ? {} : { aplicacion_ids: ids }), cobertura: { version: 1, partes: [{ id: 's1', texto: q, capacidad: 'aplicaciones', disposicion: 'consultar' }] }, parte_ids: ['s1'] }) }], uso: { entrada: 1, salida: 1, razonamiento: 0, costoUsd: 0 }, ms: 0, modelo: s.modelo, finishReason: 'stop' };
  } };
  const h = dependencies(db, [], { modoCobertura: 'obligatoria', crearLLM: () => llm, ahora: () => date });
  return { requests, deps: { ...h.deps, modoIntencion: 'obligatoria' as const } };
}
async function start(expectedCount = 3) {
  const h = provider(firstQuestion);
  const response = await manejar(request({ pregunta: firstQuestion }), h.deps);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.origen).toBe('determinista');
  expect(body.resultados[0].conteo).toBe(expectedCount);
  expect(body.estadoToken).toBeTruthy();
  return body;
}

describe('Loop I0 F5: deictic follow-ups refer to a verified prior entity selection', () => {
  it('provides the selected three IDs to extraction with a valid token and keeps exactly that population', async () => {
    const first = await start();
    const next = provider(followQuestion);
    const response = await manejar(request({ pregunta: followQuestion, estadoToken: first.estadoToken, historial: [{ rol: 'assistant', texto: first.respuesta }] }), next.deps);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.origen).toBe('determinista');
    expect(body.resultados[0].filas.map((r: { id: string }) => r.id).sort()).toEqual(selected);
    expect(body.resultados[0].conteo).toBe(3);
    const extractionInput = next.requests[0].mensajes.map(m => m.content).join('\n');
    for (const id of selected) expect(extractionInput).toContain(id);
    expect(extractionInput).not.toContain(APPS.future);
  });

  it.each(['missing', 'expired'])('asks for clarification with %s state instead of inferring membership from omitted assistant prose', async mode => {
    const first = await start();
    const called = vi.fn(async () => { throw new Error('NO_INFERENCE_WITH_MISSING_DEICTIC_CONTEXT'); });
    const next = provider(followQuestion);
    const response = await manejar(request({ pregunta: followQuestion, ...(mode === 'expired' ? { estadoToken: first.estadoToken } : {}), historial: [{ rol: 'assistant', texto: first.respuesta }] }), { ...next.deps, ahora: () => new Date(date.getTime() + 16 * 60_000), crearLLM: () => ({ completar: called }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.origen).toBe('aclaracion');
    expect(body.resultados).toEqual([]);
    expect(called).not.toHaveBeenCalled();
  });

  it.each(['fourth ID', 'all visible'])('does not expand the three selected members to %s on a deictic follow-up', async mutation => {
    await db.query("update aplicaciones set fecha_inicio_planeada='2026-11-02' where id=$1", [APPS.future]);
    const first = await start();
    const next = provider(followQuestion, mutation === 'fourth ID' ? [...selected, APPS.future] : 'todas');
    const response = await manejar(request({ pregunta: followQuestion, estadoToken: first.estadoToken }), next.deps);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.origen).not.toBe('determinista');
    expect(body.resultados).toEqual([]);
  });

  it('does not treat the three requested selectors as three confirmed members when one date is unknown', async () => {
    await db.query('update aplicaciones set fecha_inicio_planeada=null where id=$1', [APPS.nullMetadata]);
    const first = await start(2);
    expect(first.resultados[0].excluidos.sin_fecha).toBe(1);
    const called = vi.fn(async () => { throw new Error('NO_INFERENCE_FROM_PARTIAL_POPULATION'); });
    const next = provider(followQuestion);
    const response = await manejar(request({ pregunta: followQuestion, estadoToken: first.estadoToken }), { ...next.deps, crearLLM: () => ({ completar: called }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.origen).toBe('aclaracion');
    expect(body.resultados).toEqual([]);
    expect(called).not.toHaveBeenCalled();
  });

  it('revalidates current visibility before sending a stored member ID into the next extraction', async () => {
    const first = await start();
    await db.exec(`create policy qa_loop_revoked_member on aplicaciones as restrictive for select to authenticated using(id <> '${APPS.closed}'::uuid)`);
    try {
      const called = vi.fn(async () => { throw new Error('NO_PROVIDER_WITH_REVOKED_POPULATION_MEMBER'); });
      const next = provider(followQuestion);
      const response = await manejar(request({ pregunta: followQuestion, estadoToken: first.estadoToken }), { ...next.deps, crearLLM: () => ({ completar: called }) });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.origen).toBe('aclaracion');
      expect(body.resultados).toEqual([]);
      expect(called).not.toHaveBeenCalled();
    } finally {
      await db.exec('drop policy qa_loop_revoked_member on aplicaciones');
    }
  });

  it.each([
    ['negated', `No consultes estas aplicaciones ${selected.join(', ')}`],
    ['ambiguous', `Podrían ser ${selected.join(', ')} o ${[APPS.unlinked, APPS.nullMetadata, APPS.future].join(', ')}. No he elegido un conjunto.`],
  ])('does not infer affirmative membership from %s UUID mentions in earlier user prose', async (_name, previous) => {
    const called = vi.fn(async () => { throw new Error('NO_INFERENCE_FROM_UNRESOLVED_USER_UUID_MENTIONS'); });
    const next = provider(followQuestion);
    const response = await manejar(request({ pregunta: followQuestion, historial: [{ rol: 'user', texto: previous }] }), { ...next.deps, crearLLM: () => ({ completar: called }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.origen).toBe('aclaracion');
    expect(body.resultados).toEqual([]);
    expect(called).not.toHaveBeenCalled();
  });

  it('does not confuse an explicit current population with an inherited date range when no token exists', async () => {
    const q = 'Usa las mismas fechas para todas las aplicaciones';
    const next = provider(q, 'todas');
    const response = await manejar(request({ pregunta: q, historial: [{ rol: 'user', texto: 'Consulta por inicio planeado del 2026-11-01 al 2026-11-03' }] }), next.deps);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.origen).toBe('determinista');
    expect(next.requests).toHaveLength(2);
    expect(body.resultados[0].consulta).toMatchObject({ desde: '2026-11-01', hasta: '2026-11-03', base_fecha: 'fecha_inicio_planeada' });
    expect(body.resultados[0].conteo).toBe(3);
    expect(body.resultados[0].excluidos.sin_fecha).toBe(1);
  });
});
