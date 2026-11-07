// Fixed upstream intention versus omitted, added or altered transformations over real SQL sources.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import type { ClienteLLM } from '../utils/esco2/llm.ts';
import { dependencies, forbidNetwork, ID, plan, request } from './esco2P2Harness.ts';
import { ceQaDb, CE_QA } from './esco2P4Task2QaHarness.ts';
import { milkQaDb, HATO_QA } from './esco2P4Task5QaHarness.ts';

let ce: PGlite, milk: PGlite;
beforeAll(async () => { forbidNetwork(); [ce, milk] = await Promise.all([ceQaDb(), milkQaDb()]); }, 30_000);
afterAll(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); await Promise.all([ce?.close(), milk?.close()]); });
const q = 'Consulta sintética de la transformación requerida sobre la población visible';
const period = (base_fecha: string) => ({ tipo: 'intervalo', desde: '2026-10-01', hasta: '2026-11-01', base_fecha });
const obligation = (capacidad: string, entidad: string, base: string, metricas: string[], extra: Record<string, unknown> = {}): Record<string, unknown> => ({ id: 'o1', evidencias: [{ mensaje: 'actual', inicio: 0, fin: q.length }], capacidad, poblacion: { tipo: 'todas_visibles', entidad }, periodo: period(base), metricas, agrupaciones: [], condiciones: [], detalle: 'resumen', ...extra });
async function execute(db: PGlite, ob: Record<string, unknown>, name: string, args: Record<string, unknown>) {
  let count = 0;
  const llm: ClienteLLM = { async completar(s) { return { texto: '', llamadas: count++ === 0 ? [{ nombre: 'declarar_intencion', argumentos: JSON.stringify({ version: 1, obligaciones: [ob], residuales: [] }) }] : [{ nombre: name, argumentos: JSON.stringify({ ...args, parte_ids: ['s1'], cobertura: { version: 1, partes: [{ id: 's1', texto: q, capacidad: ob.capacidad, disposicion: 'consultar' }] } }) }], uso: { entrada: 1, salida: 1, razonamiento: 0, costoUsd: 0 }, ms: 0, modelo: s.modelo, finishReason: 'stop' }; } };
  const h = dependencies(db, [], { modoCobertura: 'obligatoria', crearLLM: () => llm });
  const response = await manejar(request({ pregunta: q }), { ...h.deps, modoIntencion: 'obligatoria' as const });
  expect(response.status).toBe(200);
  return response.json();
}
const dates = { desde: '2026-10-01', hasta: '2026-11-01' };
const rank = { metrica: 'jornales', direccion: 'desc', n: 2, empates: 'incluir' };

describe('M6 QA: transformations belong to the upstream intention', () => {
  it('returns a substantive ranking whose metric, direction, count and tie policy match the intention', async () => {
    const ob = obligation('labores', 'labores', 'fecha_trabajo', ['jornales'], { agrupaciones: ['lote'], ranking: rank });
    const body = await execute(ce, ob, 'consultar_labores', plan({ ...dates, metricas: ['jornales'], agrupar_por: ['lote'], ranking: rank }));
    expect(body.origen).toBe('determinista');
    expect(body.resultados[0].filas).toHaveLength(2);
    expect(body.resultados[0].filas.map((f: { jornales: number }) => f.jornales)).toEqual([1, 0.75]);
  });

  it.each([
    ['missing', undefined], ['count', { ...rank, n: 1 }], ['direction', { ...rank, direccion: 'asc' }], ['ties', { ...rank, empates: 'exactamente_n_por_id' }],
  ])('rejects a %s ranking change while the extracted requirement stays fixed', async (_name, ranking) => {
    const ob = obligation('labores', 'labores', 'fecha_trabajo', ['jornales'], { agrupaciones: ['lote'], ranking: rank });
    const body = await execute(ce, ob, 'consultar_labores', plan({ ...dates, metricas: ['jornales'], agrupar_por: ['lote'], ranking }));
    expect(body.origen).toBe('error_plan');
    expect(body.resultados).toEqual([]);
  });

  it('rejects a ranking that the extracted intention did not request', async () => {
    const body = await execute(ce, obligation('labores', 'labores', 'fecha_trabajo', ['jornales'], { agrupaciones: ['lote'] }), 'consultar_labores', plan({ ...dates, metricas: ['jornales'], agrupar_por: ['lote'], ranking: rank }));
    expect(body.origen).toBe('error_plan');
  });

  it('keeps the latest-per-entity transformation in a valid substantive CE plan', async () => {
    const body = await execute(ce, obligation('conductividad', 'lotes', 'fecha_monitoreo', ['valor_ce'], { agrupaciones: ['lote'], ultima_por_entidad: true }), 'consultar_conductividad', { ...dates, analisis: { agrupar_por: ['lote'], ultima_por_entidad: true } });
    expect(body.origen).toBe('determinista');
    expect(body.resultados[0].analisis.filas.flatMap((f: { miembros: string[] }) => f.miembros).sort()).toEqual([CE_QA.first, CE_QA.second].sort());
  });

  it.each([true, false])('rejects last-per-entity omission/addition (requested=%s)', async requested => {
    const body = await execute(ce, obligation('conductividad', 'lotes', 'fecha_monitoreo', ['valor_ce'], { agrupaciones: ['lote'], ...(requested ? { ultima_por_entidad: true } : {}) }), 'consultar_conductividad', { ...dates, analisis: { agrupar_por: ['lote'], ...(!requested ? { ultima_por_entidad: true } : {}) } });
    expect(body.origen).toBe('error_plan');
    expect(body.resultados).toEqual([]);
  });

  const key = (lote: string, registro: string, date: string) => JSON.stringify(['conductividad', [['lote', lote], ['registro', registro]], date, date]);
  const comparison = { metrica: 'valor_ce', izquierda: key(ID.l1, CE_QA.first, '2026-10-02'), derecha: key(ID.l2, CE_QA.second, '2026-10-03') };
  it('preserves comparison orientation and its deterministic delta', async () => {
    const body = await execute(ce, obligation('conductividad', 'lotes', 'fecha_monitoreo', ['valor_ce'], { comparacion: comparison }), 'consultar_conductividad', { ...dates, analisis: { comparacion: comparison } });
    expect(body.origen).toBe('determinista');
    expect(body.resultados[0].analisis.comparacion.delta).toBe(-7.25);
  });

  it.each(['omitted', 'added', 'reversed'])('rejects a comparison %s downstream', async mutation => {
    const ob = obligation('conductividad', 'lotes', 'fecha_monitoreo', ['valor_ce'], mutation === 'added' ? {} : { comparacion: comparison });
    const analisis = mutation === 'omitted' ? { agrupar_por: [] } : { comparacion: mutation === 'reversed' ? { ...comparison, izquierda: comparison.derecha, derecha: comparison.izquierda } : comparison };
    const body = await execute(ce, ob, 'consultar_conductividad', { ...dates, analisis });
    expect(body.origen).toBe('error_plan');
    expect(body.resultados).toEqual([]);
  });

  it('accepts the usable dated-milk metric in extraction and a latest-observation threshold plan', async () => {
    const ob = obligation('pesajes_leche', 'animales', 'fecha', ['litros_usable'], { poblacion: { tipo: 'explicita', entidad: 'animales', ids: [HATO_QA.main] }, ultima_por_entidad: true, condiciones: [{ metrica: 'litros_usable', operador: 'gt', valor: 0, unidad: 'L' }] });
    const body = await execute(milk, ob, 'consultar_pesajes_leche', { ...dates, animal_ids: [HATO_QA.main], analisis: { ultima_por_entidad: true, condiciones: [{ metrica: 'litros_usable', operador: 'gt', valor: 0, unidad: 'L' }] } });
    expect(body.origen).toBe('determinista');
    expect(body.resultados[0].analisis.filas).toHaveLength(1);
    expect(body.resultados[0].analisis.filas[0].metricas.litros_usable.valor).toBe(8);
  });

  it('rejects an incompatible threshold unit during extraction before asking for a plan', async () => {
    const condition = { metrica: 'valor_ce', operador: 'gt', valor: 1, unidad: 'L' };
    const body = await execute(ce, obligation('conductividad', 'lotes', 'fecha_monitoreo', ['valor_ce'], { condiciones: [condition] }), 'consultar_conductividad', { ...dates, analisis: { condiciones: [condition] } });
    expect(body.origen).toBe('error_plan');
    expect(body.llamadas.map((l: { etapa: string }) => l.etapa)).toEqual(['intencion']);
  });

  it('does not accept a numeric condition on a nonnumeric ficha metric merely because the domain advertises that metric', async () => {
    const ob = obligation('hato', 'animales', 'fecha', ['ficha'], { periodo: { tipo: 'actual' }, condiciones: [{ metrica: 'ficha', operador: 'gt', valor: 1, unidad: 'animales' }] });
    const body = await execute(ce, ob, 'consultar_hato', { poblacion: {} });
    expect(body.origen).toBe('error_plan');
    expect(body.llamadas.map((l: { etapa: string }) => l.etapa)).toEqual(['intencion']);
  });

  it('retains the positive numeric threshold with its registered physical unit', async () => {
    const condition = { metrica: 'valor_ce', operador: 'gt', valor: 1, unidad: 'dS/m' };
    const body = await execute(ce, obligation('conductividad', 'lotes', 'fecha_monitoreo', ['valor_ce'], { condiciones: [condition] }), 'consultar_conductividad', { ...dates, analisis: { condiciones: [condition] } });
    expect(body.origen).toBe('determinista');
    expect(body.resultados[0].analisis.filas.filter((f: { seleccion: string }) => f.seleccion === 'seleccionado')).toHaveLength(1);
  });

  it('answers the known CE metric despite unrelated NULL pH while retaining that missing-field evidence', async () => {
    const body = await execute(ce, obligation('conductividad', 'lotes', 'fecha_monitoreo', ['valor_ce']), 'consultar_conductividad', dates);
    expect(body.origen).toBe('determinista');
    expect(body.resultados[0].filas.some((f: { ph: number | null }) => f.ph === null)).toBe(true);
    expect(body.resultados[0].filas.every((f: { valor_ce: number | null }) => typeof f.valor_ce === 'number')).toBe(true);
    expect(body.cobertura.partes[0].disposicion).toBe('respondida');
    expect(body.cobertura.partes[0].verificacion.medidas).toBe('completas');
  });

  it('does not promote the same NULL pH to a complete answer when pH is the requested metric', async () => {
    const body = await execute(ce, obligation('conductividad', 'lotes', 'fecha_monitoreo', ['ph']), 'consultar_conductividad', dates);
    expect(body.origen).toBe('determinista');
    expect(body.cobertura.partes[0].disposicion).toBe('fuente_no_disponible');
    expect(body.cobertura.partes[0].verificacion.medidas).toBe('parciales');
  });

  it.each([false, true])('treats the entire explicitly selected ranking as exhaustive, including boundary ties=%s', async ties => {
    try {
      if (ties) await ce.query("update registros_trabajo set fraccion_jornal='0.75' where id=$1", [ID.r2]);
      const ranking = { ...rank, n: ties ? 2 : 3 };
      const ob = obligation('labores', 'labores', 'fecha_trabajo', ['jornales'], { agrupaciones: ['lote'], ranking, detalle: 'exhaustivo' });
      const body = await execute(ce, ob, 'consultar_labores', plan({ ...dates, metricas: ['jornales'], agrupar_por: ['lote'], ranking }));
      expect(body.origen).toBe('determinista');
      expect(body.resultados[0].filas).toHaveLength(3);
      expect(body.resultados[0].cobertura.grupos_totales).toBe(4);
      expect(body.cobertura.partes[0].disposicion).toBe('respondida');
    } finally {
      if (ties) await ce.query("update registros_trabajo set fraccion_jornal='0.5' where id=$1", [ID.r2]);
    }
  });
});
