// Real HTTP/readers + independent SQL fixtures exercise the closed analytic pipeline.
// No expected value comes from a previous executor result or evaluation reference.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { dependencies, forbidNetwork, ID, request } from './esco2P2Harness.ts';
import { plan } from './esco2P2Harness.ts';
import { climaQaDb, climaQaSeed } from './esco2P4Task3QaHarness.ts';
import { ceQaDb, ceQaSeed, CE_QA } from './esco2P4Task2QaHarness.ts';
import { milkQaDb, milkQaSeed, HATO_QA, MILK } from './esco2P4Task5QaHarness.ts';

let climate: PGlite, ce: PGlite, milk: PGlite;
beforeAll(async () => { forbidNetwork(); [climate, ce, milk] = await Promise.all([climaQaDb(), ceQaDb(), milkQaDb()]); }, 30_000);
afterAll(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); await Promise.all([climate?.close(), ce?.close(), milk?.close()]); });

async function run(db: PGlite, name: string, args: Record<string, unknown>) {
  const h = dependencies(db, [{ nombre: name, argumentos: JSON.stringify(args) }]);
  const response = await manejar(request({ pregunta: 'Análisis sintético sobre observaciones visibles' }), h.deps);
  expect(response.status).toBe(200);
  const body = await response.json();
  return { body, result: body.resultados[0], h };
}

describe('M6 QA analytic climate: calendar, NULL, partial rain and detail', () => {
  beforeEach(async () => { await climaQaSeed(climate); });
  const args = { desde: '2026-10-01', hasta: '2026-10-03', variables: ['lluvia_total_mm'], station_id: 'QA-A' };

  it('does not classify a partial rain subtotal as a complete monthly total or a failed threshold', async () => {
    const { result } = await run(climate, 'consultar_clima', { ...args, analisis: { agrupar_por: ['mes'], condiciones: [{ metrica: 'lluvia_total_mm', operador: 'gt', valor: 0, unidad: 'mm' }] } });
    expect(result.analisis.estado).toBe('parcial');
    expect(result.analisis.filas).toHaveLength(1);
    expect(result.analisis.filas[0].metricas.lluvia_total_mm).toMatchObject({ valor: null, observado: 7, esperados: 3, usables: 2, unidad: 'mm', estado: 'parcial' });
    expect(result.analisis.filas[0].seleccion).toBe('indeterminado');
  });

  it('groups only the requested calendar interval across a month boundary', async () => {
    await climate.exec(`insert into clima_resumen_diario(fecha,station_id,temp_c_avg,lluvia_confianza,lecturas_count,cobertura_hueco_max_min) values
      ('2026-10-31','QA-A',4,'ok',48,30),('2026-11-01','QA-A',8,'ok',48,30)`);
    const { result } = await run(climate, 'consultar_clima', { desde: '2026-10-31', hasta: '2026-11-01', variables: ['temp_c_avg'], station_id: 'QA-A', analisis: { agrupar_por: ['mes'] } });
    expect(result.analisis.estado).toBe('ok');
    expect(result.analisis.filas.map((f: { metricas: { temp_c_avg: { valor: number; esperados: number } } }) => [f.metricas.temp_c_avg.valor, f.metricas.temp_c_avg.esperados])).toEqual([[4, 1], [8, 1]]);
    expect(result.analisis.filas.map((f: { periodo: unknown }) => f.periodo)).toEqual([{ desde: '2026-10-31', hasta: '2026-10-31' }, { desde: '2026-11-01', hasta: '2026-11-01' }]);
  });

  it('reports every calendar row structurally while explicitly limiting the rendered analytic detail', async () => {
    const { result, body } = await run(climate, 'consultar_clima', { ...args, hasta: '2026-11-04', analisis: { agrupar_por: ['dia'] } });
    expect(result.analisis.filas).toHaveLength(35);
    expect(result.analisis.detalle).toEqual({ filas_totales: 35, filas_mostradas: 30, limitado: true });
    expect(body.respuesta).toMatch(/30 de 35/);
    expect(body.respuesta).toMatch(/no es una lista exhaustiva/i);
  });

  it('rejects a mismatched metric unit before publishing any analytic number', async () => {
    const { body } = await run(climate, 'consultar_clima', { ...args, analisis: { condiciones: [{ metrica: 'lluvia_total_mm', operador: 'gt', valor: 0, unidad: 'L' }] } });
    expect(body.origen).toBe('error_plan');
    expect(body.resultados).toEqual([]);
  });

  it('does not label an overflowed monthly aggregate complete when every source value is finite', async () => {
    await climate.exec(`truncate clima_resumen_diario;
      insert into clima_resumen_diario(fecha,station_id,lluvia_total_mm,lluvia_confianza,lecturas_count,cobertura_hueco_max_min) values
      ('2026-10-01','QA-A',1e308,'ok',48,30),('2026-10-02','QA-A',1e308,'ok',48,30)`);
    const { result, body } = await run(climate, 'consultar_clima', { ...args, hasta: '2026-10-02', analisis: { agrupar_por: ['mes'] } });
    expect(result.analisis.estado).not.toBe('ok');
    expect(result.analisis.filas[0].metricas.lluvia_total_mm.valor).toBeNull();
    expect(result.analisis.filas[0].metricas.lluvia_total_mm.estado).not.toBe('completo');
    expect(body.respuesta).not.toMatch(/Infinity|NaN|∞/);
  });
});

describe('M6 QA analytic CE: last measurement is per entity, never an average of means', () => {
  beforeEach(async () => { await ceQaSeed(ce); });
  const later = '85000000-0000-4000-8000-000000000004';
  const tied = '85000000-0000-4000-8000-000000000005';

  it('retains same-date ties for one lot and the different latest date of another lot', async () => {
    await ce.query(`insert into mon_conductividad values($1,$3,null,'2026-10-04',8,'[{"arbol":1,"alta":8,"baja":8}]',1,null),($2,$3,null,'2026-10-04',9,'[{"arbol":1,"alta":9,"baja":9}]',1,null)`, [later, tied, ID.l1]);
    const { result } = await run(ce, 'consultar_conductividad', { desde: '2026-10-01', hasta: '2026-10-05', analisis: { ultima_por_entidad: true, agrupar_por: ['lote'], condiciones: [{ metrica: 'valor_ce', operador: 'gte', valor: 8, unidad: 'dS/m' }] } });
    expect(result.analisis.filas).toHaveLength(3);
    expect(result.analisis.filas.flatMap((f: { miembros: string[] }) => f.miembros).sort()).toEqual([later, tied, CE_QA.second].sort());
    expect(result.analisis.filas.filter((f: { seleccion: string }) => f.seleccion === 'seleccionado')).toHaveLength(2);
    expect(result.analisis.filas.map((f: { metricas: { valor_ce: { valor: number } } }) => f.metricas.valor_ce.valor).sort((a: number, b: number) => a - b)).toEqual([0, 8, 9]);
  });

  it('retains NULL pH as indeterminate and explicit zero CE as a known measurement', async () => {
    const { result } = await run(ce, 'consultar_conductividad', { desde: '2026-10-01', hasta: '2026-10-05', analisis: { condiciones: [{ metrica: 'ph', operador: 'lt', valor: 7, unidad: 'pH' }] } });
    const unknown = result.analisis.filas.find((f: { miembros: string[] }) => f.miembros.includes(CE_QA.second));
    expect(unknown.seleccion).toBe('indeterminado');
    expect(unknown.metricas.ph).toMatchObject({ valor: null, estado: 'sin_dato' });
    expect(unknown.metricas.valor_ce).toMatchObject({ valor: 0, estado: 'completo' });
  });

  it('calculates a deterministic delta but never divides a relative change by zero', async () => {
    const key = (lote: string, registro: string, date: string) => JSON.stringify(['conductividad', [['lote', lote], ['registro', registro]], date, date]);
    const { result } = await run(ce, 'consultar_conductividad', { desde: '2026-10-01', hasta: '2026-10-05', analisis: { comparacion: { metrica: 'valor_ce', izquierda: key(ID.l2, CE_QA.second, '2026-10-03'), derecha: key(ID.l1, CE_QA.first, '2026-10-02') } } });
    expect(result.analisis.comparacion).toMatchObject({ delta: 7.25, porcentaje: null, unidad: 'dS/m' });
  });

  it('does not mark an obligation answered when its requested transformation lacks a compatible grouping', async () => {
    const question = 'Jornales por mes';
    const h = dependencies(ce, [{ nombre: 'consultar_labores', argumentos: JSON.stringify(plan({ agrupar_por: ['lote'], metricas: ['jornales'], analisis: { agrupar_por: ['mes'] }, cobertura: { version: 1, partes: [{ id: 's1', texto: question, capacidad: 'labores', disposicion: 'consultar' }] }, parte_ids: ['s1'] })) }], { modoCobertura: 'obligatoria' });
    const response = await manejar(request({ pregunta: question }), h.deps);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.cobertura.partes?.some((p: { disposicion: string }) => p.disposicion === 'respondida') ?? false).toBe(false);
  });
});

describe('M6 QA analytic milk: latest observation by stable animal ID', () => {
  beforeEach(async () => { await milkQaSeed(milk); });
  const args = { animal_ids: [HATO_QA.main, HATO_QA.twinActive], desde: '2026-10-01', hasta: '2026-10-05' };

  it('selects each animal latest date instead of dropping older dates of other animals', async () => {
    const { result } = await run(milk, 'consultar_pesajes_leche', { ...args, analisis: { ultima_por_entidad: true, agrupar_por: ['animal'] } });
    expect(result.analisis.filas.flatMap((f: { miembros: string[] }) => f.miembros).sort()).toEqual([MILK.p4, 'a5500000-0000-4000-8000-000000000005'].sort());
    expect(result.analisis.filas.map((f: { metricas: { litros_usable: { valor: number } } }) => f.metricas.litros_usable.valor).sort((a: number, b: number) => a - b)).toEqual([8, 40]);
  });

  it('keeps the latest incomplete measurement instead of silently replacing it with an older usable day', async () => {
    const latest = 'a5500000-0000-4000-8000-000000000008';
    await milk.query("insert into hato_pesajes_leche values($1,$2,'2026-10-05',4,4,null,'qa-incompleto')", [latest, HATO_QA.main]);
    const { result } = await run(milk, 'consultar_pesajes_leche', { ...args, analisis: { ultima_por_entidad: true, condiciones: [{ metrica: 'litros_usable', operador: 'gt', valor: 0, unidad: 'L' }] } });
    const selected = result.analisis.filas.find((f: { miembros: string[] }) => f.miembros.includes(latest));
    expect(selected.seleccion).toBe('indeterminado');
    expect(selected.metricas.litros_usable.valor).toBeNull();
    expect(result.analisis.filas.flatMap((f: { miembros: string[] }) => f.miembros)).not.toContain(MILK.p4);
  });
});
