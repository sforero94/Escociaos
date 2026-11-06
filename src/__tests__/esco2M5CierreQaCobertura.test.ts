// Independent regression oracle frozen before the M5 close-out repair.
// Synthetic SQL/JWT/RLS only; no model, network, production or held-out.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { dependencies, forbidNetwork, ID, request } from './esco2P2Harness.ts';
import { APPS, task2QaDb } from './esco2P3Task2QaHarness.ts';
import { validarPlan, type LlamadaHerramienta } from '../utils/esco2/registro.ts';

type Part = { id: string; texto: string; capacidad: string; disposicion: string };
let db: PGlite;
beforeAll(async () => { forbidNetwork(); db = await task2QaDb(); }, 30000);
afterAll(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); await db?.close(); });

const laborText = 'Muestra los jornales de la aplicación seleccionada';
const laborPart: Part = { id: 's1', texto: laborText, capacidad: 'labor_aplicacion', disposicion: 'consultar' };
const outside = (texto: string, id = 's2'): Part => ({ id, texto, capacidad: 'fuera_de_contrato', disposicion: 'fuera_de_contrato' });
const call = (partes: Part[], extra: Record<string, unknown> = {}): LlamadaHerramienta => ({
  nombre: 'consultar_labor_aplicacion',
  argumentos: JSON.stringify({ aplicacion_ids: [APPS.closed], parte_ids: ['s1'], cobertura: { version: 1, partes }, ...extra }),
});
async function execute(parts: Part[], calls = [call(parts)], pregunta = parts.map(p => p.texto).join(' y ')) {
  const h = dependencies(db, calls, { modoCobertura: 'obligatoria' });
  const response = await manejar(request({ pregunta }), h.deps);
  return { ...h, response, body: await response.json() };
}

describe('M5 close-out independent QA: supported lot grouping is not outside the contract', () => {
  it('establishes the SQL-backed positive control and the existing per-lot output without adding a grouping requirement', async () => {
    const h = await execute([laborPart]);
    expect(h.response.status).toBe(200);
    expect(h.body.origen).toBe('determinista');
    expect(h.body.resultados).toHaveLength(1);
    expect(h.body.resultados[0]).toMatchObject({ tipo: 'labor_aplicacion', total: { jornales: 1.25, costo: 100 } });
    expect(h.body.resultados[0].filas[0].lotes).toEqual(expect.arrayContaining([
      expect.objectContaining({ lote_id: ID.l1, total: expect.objectContaining({ jornales: 1, costo: 100 }) }),
      expect.objectContaining({ lote_id: null, total: expect.objectContaining({ jornales: 0.25, costo: 0 }) }),
    ]));
    expect(h.body.cobertura.partes).toMatchObject([{ capacidad: 'labor_aplicacion', disposicion: 'respondida', resultado_ids: ['p1'] }]);
  });

  it.each(['separa los lotes', 'desglosa por lote', 'separado por lote'])('keeps the already-supported constraint "%s" answered by the same operation and exact results', async text => {
    const positive = await execute([laborPart]);
    const h = await execute([laborPart, outside(text)]);
    expect(h.response.status).toBe(200);
    expect(h.body.origen).toBe('determinista');
    expect(h.body.resultados).toEqual(positive.body.resultados);
    expect(h.body.cobertura.partes).toMatchObject([
      { id: 's1', capacidad: 'labor_aplicacion', disposicion: 'respondida', resultado_ids: ['p1'] },
      { id: 's2', capacidad: 'labor_aplicacion', disposicion: 'respondida', resultado_ids: ['p1'] },
    ]);
    expect(h.body.respuesta).not.toMatch(/fuera del alcance actual|Respuesta parcial/);
    expect(h.solicitudes).toHaveLength(1);
  });

  it.each([
    'separa por vaca',
    'separa los lotes y recomienda qué fumigar',
    'separa los lotes según rentabilidad',
    'calcula litros por vaca',
    'separa los lotes y cambia sus nombres',
  ])('preserves genuinely unsupported or composite intent "%s" despite a supported labor operation', async text => {
    const h = await execute([laborPart, outside(text)]);
    expect(h.body.origen).toBe('determinista');
    expect(h.body.resultados[0].total.jornales).toBe(1.25);
    expect(h.body.cobertura.partes[1]).toMatchObject({ capacidad: 'fuera_de_contrato', disposicion: 'fuera_de_contrato', resultado_ids: [] });
    expect(h.body.respuesta).toContain('Esta parte está fuera del alcance actual');
  });

  it('preserves a separate real exclusion while correcting only the pure lot-grouping fragment', async () => {
    const parts = [laborPart, outside('separa los lotes'), outside('recomienda qué fumigar', 's3')];
    const h = await execute(parts);
    expect(h.body.cobertura.partes).toMatchObject([
      { capacidad: 'labor_aplicacion', disposicion: 'respondida', resultado_ids: ['p1'] },
      { capacidad: 'labor_aplicacion', disposicion: 'respondida', resultado_ids: ['p1'] },
      { capacidad: 'fuera_de_contrato', disposicion: 'fuera_de_contrato', resultado_ids: [] },
    ]);
    expect(h.body.resultados[0].total.jornales).toBe(1.25);
  });

  it('does not claim the constraint is supported when no operation can supply its lot breakdown', async () => {
    const parts: Part[] = [outside('separa los lotes', 's1')];
    const h = await execute(parts, [{ nombre: 'fuera_de_alcance', argumentos: JSON.stringify({ motivo: 'sin operación de dominio', cobertura: { version: 1, partes: parts } }) }]);
    expect(h.body.resultados).toEqual([]);
    expect(h.body.cobertura.partes[0]).toMatchObject({ capacidad: 'fuera_de_contrato', disposicion: 'fuera_de_contrato', resultado_ids: [] });
  });

  it('does not pick an arbitrary application operation for an unbound grouping fragment', async () => {
    const parts = [laborPart, { ...laborPart, id: 's2', texto: 'Muestra los jornales de otra aplicación seleccionada' }, outside('separa los lotes', 's3')];
    const h = await execute(parts, [call(parts), call(parts, { aplicacion_ids: [APPS.future], parte_ids: ['s2'], cobertura: undefined })]);
    expect(h.body.origen).toBe('determinista');
    expect(h.body.resultados).toHaveLength(2);
    expect(h.body.cobertura.partes[2]).toMatchObject({ capacidad: 'fuera_de_contrato', disposicion: 'fuera_de_contrato', resultado_ids: [] });
  });

  it('does not transfer an unsupported milk breakdown to an unrelated labor operation in the same question', () => {
    const milkPart: Part = { id: 's2', texto: 'litros quincenales', capacidad: 'litros_quincenales', disposicion: 'consultar' };
    const parts = [laborPart, milkPart, outside('por lote', 's3')];
    const pregunta = `${laborText} y litros quincenales por lote`;
    const plan = validarPlan([
      call(parts),
      { nombre: 'consultar_litros_quincenales', argumentos: JSON.stringify({ desde: '2026-10-01', hasta: '2026-10-31', parte_ids: ['s2'] }) },
    ], { pregunta, preguntaActual: pregunta, exigirCobertura: true });
    expect(plan.tipo).toBe('operaciones');
    if (plan.tipo !== 'operaciones') throw new Error('Expected both existing operations');
    expect(plan.operaciones.map(o => o.parte_ids)).toEqual([['s1'], ['s2']]);
    expect(plan.cobertura?.partes[2]).toMatchObject({ capacidad: 'fuera_de_contrato', disposicion: 'fuera_de_contrato' });
  });
});
