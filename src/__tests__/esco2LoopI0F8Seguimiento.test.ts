// F8: the deictic population guard only owns application and animal members.
// A follow-up about another entity (lotes, tareas, plagas…) must keep the #451 path:
// no early clarification and no injected application/animal population.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { resolverReferenciaPoblacion } from '../utils/esco2/contextoPoblaciones.ts';
import type { ClienteLLM, SolicitudLLM } from '../utils/esco2/llm.ts';
import { dependencies, forbidNetwork, request } from './esco2P2Harness.ts';
import { APPS, task2QaDb, task2QaSeed } from './esco2P3Task2QaHarness.ts';

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const tresApps = { poblacionesPrevias: [{ operacion_id: 'p1', entidad: 'aplicaciones' as const, ids: [u(1), u(2), u(3)], estado: 'completa' as const }] };
const dosVacas = { poblacionesPrevias: [{ operacion_id: 'p1', entidad: 'animales' as const, ids: [u(4), u(5)], estado: 'completa' as const }] };
const visibles = { aplicaciones: [u(1), u(2), u(3)].map(id => ({ id })), animales: [u(4), u(5)].map(id => ({ id })) };

const otrasEntidades = [
  '¿Y en esos dos lotes, cuántos jornales hubo en octubre?',
  '¿Y los mismos lotes en septiembre?',
  '¿Y las mismas tareas en octubre?',
  'En esas tres plagas, ¿cómo va la incidencia?',
  '¿Y esos dos sublotes?',
  'Para las mismas labores, ¿cuánto costó?',
  '¿Y esas dos rondas?',
  'Esos tres productos, ¿cuánto queda?',
];

describe('Loop I0 F8: deictic guard ignores members of other entities', () => {
  it.each(otrasEntidades)('"%s" is not an application/animal reference, with or without state', q => {
    expect(resolverReferenciaPoblacion(q, [], undefined, visibles)).toEqual({ tipo: 'no_deictica' });
    expect(resolverReferenciaPoblacion(q, [], { poblacionesPrevias: [] }, visibles)).toEqual({ tipo: 'no_deictica' });
    expect(resolverReferenciaPoblacion(q, [], tresApps, visibles)).toEqual({ tipo: 'no_deictica' });
    expect(resolverReferenciaPoblacion(q, [], dosVacas, visibles)).toEqual({ tipo: 'no_deictica' });
  });

  it('keeps resolving application and animal members', () => {
    expect(resolverReferenciaPoblacion('¿Cuáles son esas tres?', [], tresApps, visibles)).toMatchObject({ tipo: 'resuelta', entidad: 'aplicaciones' });
    expect(resolverReferenciaPoblacion('¿Y esas tres aplicaciones en octubre?', [], tresApps, visibles)).toMatchObject({ tipo: 'resuelta', entidad: 'aplicaciones' });
    expect(resolverReferenciaPoblacion('¿Y esas dos vacas, cuánta leche?', [], dosVacas, visibles)).toMatchObject({ tipo: 'resuelta', entidad: 'animales' });
    expect(resolverReferenciaPoblacion('¿Y los mismos animales?', [], dosVacas, visibles)).toMatchObject({ tipo: 'resuelta', entidad: 'animales' });
  });

  it('keeps clarifying an application/animal reference without state', () => {
    expect(resolverReferenciaPoblacion('¿Y esas tres aplicaciones?', [], undefined, visibles)).toMatchObject({ tipo: 'aclaracion' });
    expect(resolverReferenciaPoblacion('¿Cuáles son esas tres?', [], { poblacionesPrevias: [] }, visibles)).toMatchObject({ tipo: 'aclaracion' });
  });

  it('keeps attribute references (mismas fechas) out of the guard', () => {
    expect(resolverReferenciaPoblacion('¿Y en las mismas fechas?', [], tresApps, visibles)).toEqual({ tipo: 'no_deictica' });
  });
});

let db: PGlite;
beforeAll(async () => { forbidNetwork(); db = await task2QaDb(); }, 30_000);
beforeEach(async () => { await task2QaSeed(db); });
afterAll(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); await db?.close(); });

const selected = [APPS.closed, APPS.unlinked, APPS.nullMetadata].sort();
const date = new Date('2026-11-07T17:00:00Z');
const firstQuestion = `Aplicaciones ${selected.join(', ')} con inicio planeado del 2026-11-01 al 2026-11-03`;
function primerTurno() {
  const intent = { version: 1, obligaciones: [{ id: 'o1', evidencias: [{ mensaje: 'actual', inicio: 0, fin: firstQuestion.length }], capacidad: 'aplicaciones', poblacion: { tipo: 'explicita', entidad: 'aplicaciones', ids: selected }, periodo: { tipo: 'intervalo', desde: '2026-11-01', hasta: '2026-11-03', base_fecha: 'fecha_inicio_planeada' }, metricas: ['conteo'], agrupaciones: [], condiciones: [], detalle: 'resumen' }], residuales: [] };
  let n = 0;
  const llm: ClienteLLM = { async completar(s) {
    n++;
    return { texto: '', llamadas: n === 1 ? [{ nombre: 'declarar_intencion', argumentos: JSON.stringify(intent) }] : [{ nombre: 'consultar_aplicaciones', argumentos: JSON.stringify({ desde: '2026-11-01', hasta: '2026-11-03', base_fecha: 'fecha_inicio_planeada', aplicacion_ids: selected, cobertura: { version: 1, partes: [{ id: 's1', texto: firstQuestion, capacidad: 'aplicaciones', disposicion: 'consultar' }] }, parte_ids: ['s1'] }) }], uso: { entrada: 1, salida: 1, razonamiento: 0, costoUsd: 0 }, ms: 0, modelo: s.modelo, finishReason: 'stop' };
  } };
  const h = dependencies(db, [], { modoCobertura: 'obligatoria', crearLLM: () => llm, ahora: () => date });
  return { ...h.deps, modoIntencion: 'obligatoria' as const };
}

describe('Loop I0 F8 over HTTP: a lote/tarea follow-up after an application turn', () => {
  it.each(['¿Y en esos dos lotes, cuántos jornales hubo en octubre?', '¿Y los mismos lotes en septiembre?', '¿Y las mismas tareas en octubre?'])('"%s" reaches the extractor without the application population', async q => {
    const first = await (await manejar(request({ pregunta: firstQuestion }), primerTurno())).json();
    expect(first.estadoToken).toBeTruthy();
    const solicitudes: SolicitudLLM[] = [];
    const completar = vi.fn(async (s: SolicitudLLM) => { solicitudes.push(structuredClone(s)); throw new Error('STOP_AFTER_EXTRACTOR_INPUT'); });
    const deps = { ...primerTurno(), crearLLM: () => ({ completar }) };
    const response = await manejar(request({ pregunta: q, estadoToken: first.estadoToken, historial: [{ rol: 'user', texto: firstQuestion }, { rol: 'assistant', texto: first.respuesta }] }), deps);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.origen).not.toBe('aclaracion');
    expect(completar).toHaveBeenCalled();
    const entrada = solicitudes[0].mensajes.map(m => m.content).join('\n');
    // The IDs may still appear in the user's own earlier message (ordinary history, #451 path);
    // what must not appear is the guard's binding of that population to this turn.
    expect(entrada).not.toContain('Población previa verificada');
    expect(entrada).not.toContain('conserva exactamente esos miembros');
  });
});
