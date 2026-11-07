// Independent loop-I0 identity integration: visible SQL population is the oracle.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { manejar, type Dependencias } from '../../supabase/functions/esco-consultas/manejador.ts';
import type { ClienteLLM } from '../utils/esco2/llm.ts';
import { dependencies, forbidNetwork, ID, overlayClient, plan, request } from './esco2P2Harness.ts';
import { APPS, task2QaDb, task2QaSeed } from './esco2P3Task2QaHarness.ts';
import { hatoQaDb, hatoQaSeed, HATO_QA } from './esco2P4Task4QaHarness.ts';

let db: PGlite, herd: PGlite;
beforeAll(async () => { forbidNetwork(); [db, herd] = await Promise.all([task2QaDb(), hatoQaDb()]); }, 30_000);
beforeEach(async () => { await Promise.all([task2QaSeed(db), hatoQaSeed(herd)]); });
afterAll(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); await Promise.all([db?.close(), herd?.close()]); });
const q = 'Consulta la población sintética solicitada por su nombre visible';
async function execute(capacidad: string, entidad: string, population: Record<string, unknown>, args: Record<string, unknown>, override: Partial<Dependencias> = {}) {
  const period = capacidad === 'hato' ? { tipo: 'actual' } : capacidad === 'labores' ? { tipo: 'intervalo', desde: '2026-10-26', hasta: '2026-11-01', base_fecha: 'fecha_trabajo' } : { tipo: 'intervalo', desde: '2026-11-01', hasta: '2026-11-03', base_fecha: 'fecha_inicio_planeada' };
  const intent = { version: 1, obligaciones: [{ id: 'o1', evidencias: [{ mensaje: 'actual', inicio: 0, fin: q.length }], capacidad, poblacion: { tipo: 'explicita', entidad, ...population }, periodo: period, metricas: capacidad === 'hato' ? ['ficha'] : capacidad === 'labores' ? ['jornales'] : ['conteo'], agrupaciones: [], condiciones: [], detalle: 'resumen' }], residuales: [] };
  let count = 0;
  const llm: ClienteLLM = { async completar(s) { return { texto: '', llamadas: count++ === 0 ? [{ nombre: 'declarar_intencion', argumentos: JSON.stringify(intent) }] : [{ nombre: capacidad === 'hato' ? 'consultar_hato' : capacidad === 'labores' ? 'consultar_labores' : 'consultar_aplicaciones', argumentos: JSON.stringify({ ...args, cobertura: { version: 1, partes: [{ id: 's1', texto: q, capacidad, disposicion: 'consultar' }] }, parte_ids: ['s1'] }) }], uso: { entrada: 1, salida: 1, razonamiento: 0, costoUsd: 0 }, ms: 0, modelo: s.modelo, finishReason: 'stop' }; } };
  const h = dependencies(capacidad === 'hato' ? herd : db, [], { modoCobertura: 'obligatoria', crearLLM: () => llm, ...override });
  const response = await manejar(request({ pregunta: q }), { ...h.deps, modoIntencion: 'obligatoria' as const });
  expect(response.status).toBe(200);
  return response.json();
}
const labor = (extra: Record<string, unknown>) => plan({ metricas: ['jornales'], agrupar_por: [], ...extra });

describe('Loop I0 F1: equivalent labels and IDs preserve the visible source population', () => {
  it('accepts a unique lot name in intention with the same lot ID in the plan', async () => {
    const body = await execute('labores', 'lotes', { nombres: ['Otro'] }, labor({ lote_ids: [ID.l3] }));
    expect(body.origen).toBe('determinista');
    expect(body.resultados[0].total.jornales).toBe(0.75);
    expect(body.resultados[0].poblacion.miembros).toEqual([ID.r4]);
    expect(body.cobertura.partes[0].disposicion).toBe('respondida');
  });

  it('accepts the inverse representation without expanding the population', async () => {
    const body = await execute('labores', 'lotes', { ids: [ID.l3] }, labor({ lotes: ['Otro'] }));
    expect(body.origen).toBe('determinista');
    expect(body.resultados[0].poblacion.miembros).toEqual([ID.r4]);
  });

  it('does not resolve a duplicate lot name by accepting the single ID proposed by the planner', async () => {
    const body = await execute('labores', 'lotes', { nombres: ['Lote repetido'] }, labor({ lote_ids: [ID.l1] }));
    expect(body.origen).toBe('aclaracion');
    expect(body.resultados).toEqual([]);
  });

  it('asks for a missing label instead of treating an arbitrary visible ID as its resolution', async () => {
    const body = await execute('labores', 'lotes', { nombres: ['QA Inexistente'] }, labor({ lote_ids: [ID.l3] }));
    expect(body.origen).toBe('aclaracion');
    expect(body.resultados).toEqual([]);
  });

  it('retains unavailable catalog state instead of claiming empty or accepting a plan ID', async () => {
    const body = await execute('labores', 'lotes', { nombres: ['Otro'] }, labor({ lote_ids: [ID.l3] }), { crearClienteUsuario: jwt => overlayClient(db, jwt, (table, row) => { if (table === 'lotes') delete row.nombre; return row; }) });
    expect(body.origen).toBe('error_datos');
    expect(body.resultados).toEqual([]);
  });

  it('normalizes a permitted task-name fragment to the complete matching task-ID set', async () => {
    const body = await execute('labores', 'labores', { nombres: ['Labor igual'] }, labor({ tarea_ids: [ID.t1, ID.t2] }));
    expect(body.origen).toBe('determinista');
    expect(body.resultados[0].total.jornales).toBe(2.5);
    expect(body.resultados[0].alcance.tarea_ids.sort()).toEqual([ID.t1, ID.t2].sort());
  });

  it('resolves an application code in its own catalog even when a task has the same label', async () => {
    await db.query("update tareas set nombre='QA-B' where id=$1", [ID.t3]);
    const body = await execute('aplicaciones', 'aplicaciones', { nombres: ['QA-B'] }, { desde: '2026-11-01', hasta: '2026-11-03', base_fecha: 'fecha_inicio_planeada', aplicacion_ids: [APPS.unlinked] });
    expect(body.origen).toBe('determinista');
    expect(body.resultados[0].filas.map((f: { id: string }) => f.id)).toEqual([APPS.unlinked]);
    expect(body.resultados[0].conteo).toBe(1);
  });

  it('does not overwrite a contradictory name filter with the identity resolved from an ear tag', async () => {
    await herd.query('update hato_animales set numero=604 where id=$1', [HATO_QA.twinSold]);
    const body = await execute('hato', 'animales', { chapetas: [602], filtros: [{ campo: 'nombres', valores: ['QA Lira'] }] }, { animal_ids: [HATO_QA.twinActive] });
    expect(body.origen).not.toBe('determinista');
    expect(body.resultados).toEqual([]);
  });

  it('keeps a positive control when the name filter and ear tag resolve to the same animal', async () => {
    const body = await execute('hato', 'animales', { chapetas: [601], filtros: [{ campo: 'nombres', valores: ['QA Lira'] }] }, { animal_ids: [HATO_QA.main] });
    expect(body.origen).toBe('determinista');
    expect(body.resultados[0].filas.map((f: { animal_id: string }) => f.animal_id)).toEqual([HATO_QA.main]);
  });

  it('does not overwrite a conflicting primary ID selector with another ID filter', async () => {
    const body = await execute('hato', 'animales', { ids: [HATO_QA.main], filtros: [{ campo: 'animal_ids', valores: [HATO_QA.twinActive] }] }, { animal_ids: [HATO_QA.main] });
    expect(body.origen).not.toBe('determinista');
    expect(body.resultados).toEqual([]);
  });

  it('preserves the nonempty intersection between a primary selector and its additional ID filter', async () => {
    const body = await execute('hato', 'animales', { ids: [HATO_QA.main, HATO_QA.twinActive], filtros: [{ campo: 'animal_ids', valores: [HATO_QA.main] }] }, { animal_ids: [HATO_QA.main] });
    expect(body.origen).toBe('determinista');
    expect(body.resultados[0].filas.map((f: { animal_id: string }) => f.animal_id)).toEqual([HATO_QA.main]);
  });
});
