// Closed dependent selections through actual HTTP and independent SQL/RLS fixtures.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import type { ClienteLLM } from '../utils/esco2/llm.ts';
import { dependencies, forbidNetwork, request } from './esco2P2Harness.ts';
import { task4QaDb, task4QaSeed } from './esco2P3Task4QaHarness.ts';
import { T3 } from './esco2P3Task3QaHarness.ts';
import { milkQaDb, milkQaSeed } from './esco2P4Task5QaHarness.ts';

let apps: PGlite, milk: PGlite;
beforeAll(async () => { forbidNetwork(); [apps, milk] = await Promise.all([task4QaDb(), milkQaDb()]); }, 30_000);
afterAll(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); await Promise.all([apps?.close(), milk?.close()]); });
const call = (nombre: string, args: Record<string, unknown>) => ({ nombre, argumentos: JSON.stringify(args) });
const select = (extra: Record<string, unknown> = {}) => call('consultar_aplicaciones', { desde: '2026-11-01', hasta: '2026-11-03', base_fecha: 'fecha_inicio_planeada', aplicacion_ids: [T3.fertilizer, T3.liquid], ...extra });
async function run(db: PGlite, calls: ReturnType<typeof call>[]) {
  const h = dependencies(db, calls);
  const response = await manejar(request({ pregunta: 'Selección y consulta dependiente sintética por identidades visibles' }), h.deps);
  expect(response.status).toBe(200);
  return { body: await response.json(), h };
}

describe('M6 QA dependent application selection', () => {
  beforeEach(async () => { await task4QaSeed(apps); });

  it('uses every selected ID for quantities and costs while preserving frozen and current bases', async () => {
    const { body } = await run(apps, [select(), call('consultar_cantidades_aplicacion', { seleccion_de: 'p1' }), call('consultar_costos_aplicacion', { seleccion_de: 'p1' })]);
    expect(body.resultados).toHaveLength(3);
    const expected = [T3.fertilizer, T3.liquid].sort();
    for (const r of body.resultados.slice(1)) {
      expect(r.seleccion).toMatchObject({ estado: 'ok', ids: expected, de: 'p1' });
      expect(r.resultados_poblacion.map((m: { aplicacion: { id: string } }) => m.aplicacion.id).sort()).toEqual(expected);
    }
    const costs = body.resultados[2].resultados_poblacion;
    expect(costs.find((r: { aplicacion: { id: string } }) => r.aplicacion.id === T3.fertilizer).congelado.total).toBe(200);
    expect(costs.find((r: { aplicacion: { id: string } }) => r.aplicacion.id === T3.liquid).ejecucion.total).toBe(0.05);
    expect(body.respuesta).not.toMatch(/200[,.]05/);
  });

  it('keeps a verified empty selection empty without falling back to the catalog', async () => {
    const { body } = await run(apps, [select({ desde: '2026-10-01', hasta: '2026-10-02' }), call('consultar_cantidades_aplicacion', { seleccion_de: 'p1' })]);
    expect(body.resultados[0]).toMatchObject({ estado: 'vacio_verificado', conteo: 0 });
    expect(body.resultados[1].seleccion).toMatchObject({ estado: 'vacio_verificado', ids: [] });
    expect(body.resultados[1].resultados_poblacion).toEqual([]);
  });

  it.each(['consultar_labor_aplicacion', 'consultar_faltantes_aplicacion'])('preserves verified empty applications for %s without a global data read', async name => {
    const { body, h } = await run(apps, [select({ desde: '2026-10-01', hasta: '2026-10-02' }), call(name, { seleccion_de: 'p1' })]);
    expect(body.resultados[0]).toMatchObject({ estado: 'vacio_verificado', conteo: 0 });
    expect(body.resultados[1].seleccion).toMatchObject({ estado: 'vacio_verificado', ids: [] });
    expect(body.resultados[1].estado).toBe('ok');
    expect(body.resultados[1].filas).toEqual([]);
    expect(body.respuesta).toMatch(/vac[ií]a|sin aplicaciones|no hay aplicaciones/i);
    const prohibited = name === 'consultar_labor_aplicacion' ? ['registros_trabajo'] : ['productos', 'aplicaciones_productos'];
    expect(h.traza.consultas.some(c => prohibited.includes(c.tabla))).toBe(false);
  });

  it('does not expand a selection with unknown dates as if the selected IDs were exhaustive', async () => {
    const { body } = await run(apps, [select({ aplicacion_ids: undefined }), call('consultar_costos_aplicacion', { seleccion_de: 'p1' })]);
    expect(body.resultados[0].excluidos.sin_fecha).toBeGreaterThan(0);
    expect(body.resultados[1].seleccion.estado).toBe('no_disponible');
    expect(body.resultados[1].resultados_poblacion).toEqual([]);
  });

  it('rejects forward references and selectors mixed with a dependency', async () => {
    for (const calls of [
      [call('consultar_costos_aplicacion', { seleccion_de: 'p2' }), select()],
      [select(), call('consultar_costos_aplicacion', { seleccion_de: 'p1', aplicacion_id: T3.fertilizer })],
    ]) {
      const { body } = await run(apps, calls);
      expect(body.origen).toBe('error_plan');
      expect(body.resultados).toEqual([]);
    }
  });

  it('binds a derived obligation to its actual selection operation when obligation and operation indices differ', async () => {
    const q = 'Jornales registrados; aplicaciones seleccionadas; cantidades de esas aplicaciones';
    const evidence = [{ mensaje: 'actual', inicio: 0, fin: q.length }];
    const intent = { version: 1, obligaciones: [
      { id: 'o1', capacidad: 'labores', evidencias: evidence, poblacion: { tipo: 'todas_visibles', entidad: 'labores' }, periodo: { tipo: 'intervalo', desde: '2026-10-26', hasta: '2026-11-01', base_fecha: 'fecha_trabajo' }, metricas: ['jornales'], agrupaciones: [], condiciones: [], detalle: 'resumen' },
      { id: 'o2', capacidad: 'aplicaciones', evidencias: evidence, poblacion: { tipo: 'explicita', entidad: 'aplicaciones', ids: [T3.fertilizer, T3.liquid] }, periodo: { tipo: 'intervalo', desde: '2026-11-01', hasta: '2026-11-03', base_fecha: 'fecha_inicio_planeada' }, metricas: ['conteo', 'estado_actual'], agrupaciones: [], condiciones: [], detalle: 'resumen' },
      { id: 'o3', capacidad: 'cantidades_aplicacion', evidencias: evidence, poblacion: { tipo: 'derivada', entidad: 'aplicaciones', de: 'o2' }, periodo: { tipo: 'vida_completa' }, metricas: ['plan', 'ejecucion'], agrupaciones: ['lote'], condiciones: [], detalle: 'resumen' },
    ], residuales: [] };
    const coverage = { version: 1, partes: [
      { id: 's1', texto: 'Jornales registrados', capacidad: 'labores', disposicion: 'consultar' },
      { id: 's2', texto: 'aplicaciones seleccionadas', capacidad: 'aplicaciones', disposicion: 'consultar' },
      { id: 's3', texto: 'cantidades de esas aplicaciones', capacidad: 'cantidades_aplicacion', disposicion: 'consultar' },
    ] };
    const labor = { proposito: 'Labor sintética', desde: '2026-10-26', hasta: '2026-11-01', agrupar_por: [], metricas: ['jornales'], parte_ids: ['s1'] };
    const operations = [call('consultar_labores', { ...labor, cobertura: coverage }), call('consultar_labores', labor),
      call('consultar_aplicaciones', { desde: '2026-11-01', hasta: '2026-11-03', base_fecha: 'fecha_inicio_planeada', aplicacion_ids: [T3.fertilizer, T3.liquid], parte_ids: ['s2'] }),
      call('consultar_cantidades_aplicacion', { seleccion_de: 'p3', parte_ids: ['s3'] }),
    ];
    let count = 0;
    const llm: ClienteLLM = { async completar(s) { return { texto: '', llamadas: count++ === 0 ? [call('declarar_intencion', intent)] : operations, uso: { entrada: 1, salida: 1, razonamiento: 0, costoUsd: 0 }, ms: 0, modelo: s.modelo, finishReason: 'stop' }; } };
    const h = dependencies(apps, [], { modoCobertura: 'obligatoria', crearLLM: () => llm });
    const response = await manejar(request({ pregunta: q }), { ...h.deps, modoIntencion: 'obligatoria' as const });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.origen).toBe('determinista');
    expect(body.resultados).toHaveLength(4);
    expect(body.resultados[3].seleccion).toMatchObject({ de: 'p3', estado: 'ok', ids: [T3.fertilizer, T3.liquid].sort() });
    expect(body.resultados[3].resultados_poblacion).toHaveLength(2);
  });
});

describe('M6 QA dependent animal selection', () => {
  beforeEach(async () => { await milkQaSeed(milk); });

  it('does not replace a verified empty animal population with all visible animals', async () => {
    const { body } = await run(milk, [call('consultar_hato', { poblacion: { estados: ['muerta'] } }), call('consultar_pesajes_leche', { seleccion_de: 'p1', desde: '2026-10-01', hasta: '2026-10-05' })]);
    expect(body.resultados[0].estado).toBe('vacio_verificado');
    expect(body.resultados[1].estado).toBe('vacio_verificado');
    expect(body.resultados[1].filas).toEqual([]);
    expect(body.resultados[1].resumen).toEqual([]);
  });

  it('rejects an animal selection as the source of application costs', async () => {
    const { body } = await run(milk, [call('consultar_hato', { poblacion: { estados: ['activa'] } }), call('consultar_costos_aplicacion', { seleccion_de: 'p1' })]);
    expect(body.origen).toBe('error_plan');
    expect(body.resultados).toEqual([]);
  });
});
