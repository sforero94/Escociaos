// Independent HTTP integration: extraction is fixed before proposing any plan.
// Mutating the plan cannot redefine the upstream obligation oracle.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import type { ClienteLLM, SolicitudLLM } from '../utils/esco2/llm.ts';
import { dependencies, forbidNetwork, ID, p2Db, plan, request } from './esco2P2Harness.ts';

let db: PGlite;
beforeAll(async () => { forbidNetwork(); db = await p2Db(); }, 30_000);
afterAll(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); await db?.close(); });

const sentence = 'Jornales y costo del 2026-10-26 al 2026-11-01 por lote, incluidos los registros sin lote.';
const detail = 'Detalle de jornales por tarea en el mismo período.';
const question = `${sentence} ${detail}`;
const contract = {
  version: 1,
  obligaciones: [
    { id: 'o1', evidencias: [{ mensaje: 'actual', inicio: 0, fin: sentence.length }], capacidad: 'labores', poblacion: { tipo: 'todas_visibles', entidad: 'labores', sin_lote: 'incluir' }, periodo: { tipo: 'intervalo', desde: '2026-10-26', hasta: '2026-11-01', base_fecha: 'fecha_trabajo' }, metricas: ['jornales', 'costo'], agrupaciones: ['lote'], condiciones: [], detalle: 'resumen' },
    { id: 'o2', evidencias: [{ mensaje: 'actual', inicio: sentence.length + 1, fin: question.length }], capacidad: 'labores', poblacion: { tipo: 'todas_visibles', entidad: 'labores', sin_lote: 'incluir' }, periodo: { tipo: 'intervalo', desde: '2026-10-26', hasta: '2026-11-01', base_fecha: 'fecha_trabajo' }, metricas: ['jornales'], agrupaciones: ['tarea'], condiciones: [], detalle: 'resumen' },
  ],
  residuales: [],
};
const coverage = { version: 1, partes: [
  { id: 's1', texto: sentence, capacidad: 'labores', disposicion: 'consultar' },
  { id: 's2', texto: detail, capacidad: 'labores', disposicion: 'consultar' },
] };
function proposed(mutation: Record<string, unknown> = {}, omitSecond = false) {
  const first = { nombre: 'consultar_labores', argumentos: JSON.stringify(plan({ proposito: 'MUTACION_PROPOSITO_INTERNO', agrupar_por: ['lote'], sin_lote: 'incluir', cobertura: omitSecond ? { version: 1, partes: [coverage.partes[0]] } : coverage, parte_ids: ['s1'], ...mutation })) };
  const second = { nombre: 'consultar_labores', argumentos: JSON.stringify(plan({ agrupar_por: ['tarea'], metricas: ['jornales'], sin_lote: 'incluir', parte_ids: ['s2'] })) };
  return omitSecond ? [first] : [first, second];
}
async function execute(mutation: Record<string, unknown> = {}, omitSecond = false, intention: unknown = contract) {
  const requests: SolicitudLLM[] = [];
  const llm: ClienteLLM = { async completar(s) {
    requests.push(structuredClone(s));
    return { texto: '', llamadas: requests.length === 1 ? [{ nombre: 'declarar_intencion', argumentos: JSON.stringify(intention) }] : proposed(mutation, omitSecond), uso: { entrada: 1, salida: 1, razonamiento: 0, costoUsd: 0 }, ms: 0, modelo: s.modelo, finishReason: 'stop' };
  } };
  const h = dependencies(db, [], { crearLLM: () => llm, modoCobertura: 'obligatoria' });
  const response = await manejar(request({ pregunta: question }), { ...h.deps, modoIntencion: 'obligatoria' as const });
  return { requests, response, body: await response.json(), events: h.events };
}

describe('M6 QA: upstream intention survives downstream plan mutations', () => {
  it('returns substantive facts for both obligations and extracts before seeing the proposed plan', async () => {
    const { body, requests, response } = await execute();
    expect(response.status).toBe(200);
    expect(body.origen).toBe('determinista');
    expect(body.resultados).toHaveLength(2);
    // costo_jornal is already the stored cost of each record, not a daily rate.
    expect(body.resultados[0].total).toMatchObject({ jornales: 2.5, costo: 250 });
    expect(body.cobertura.partes.map((p: { disposicion: string }) => p.disposicion)).toEqual(['respondida', 'respondida']);
    expect(requests.length).toBe(2);
    expect(requests[0].mensajes.map(m => m.content).join('\n')).not.toContain('MUTACION_PROPOSITO_INTERNO');
    const names = (requests[0].herramientas as { function: { name: string } }[]).map(t => t.function.name);
    expect(names).toEqual(['declarar_intencion']);
  });

  it.each([
    ['metric omission', { metricas: ['jornales'] }],
    ['group changed', { agrupar_por: ['tarea'] }],
    ['shorter period', { hasta: '2026-10-31' }],
    ['different period', { desde: '2026-10-01', hasta: '2026-10-25' }],
    ['excluded null-lot population', { sin_lote: 'excluir' }],
    ['different visible population by ID', { lote_ids: [ID.l3] }],
    ['different task population', { tarea_ids: [ID.t1] }],
    ['different temporal basis', { cohorte: 'tarea_programada', base_fecha: 'fecha_estimada_inicio' }],
  ])('does not certify the original obligation after %s', async (_name, mutation) => {
    const { body, response } = await execute(mutation);
    expect(response.status).toBe(200);
    expect(body.origen).toBe('error_plan');
    expect(body.resultados).toEqual([]);
    expect(body.cobertura.partes?.some((p: { disposicion: string }) => p.disposicion === 'respondida') ?? false).toBe(false);
  });

  it('rejects an omitted obligation even when the plan and its own coverage agree', async () => {
    const { body } = await execute({}, true);
    expect(body.origen).toBe('error_plan');
    expect(body.resultados).toEqual([]);
  });

  it('rejects literal evidence outside the current question instead of accepting a fabricated span', async () => {
    const altered = structuredClone(contract);
    altered.obligaciones[0].evidencias[0].fin = question.length + 1;
    const { body, requests } = await execute({}, false, altered);
    expect(body.origen).toBe('error_plan');
    expect(body.resultados).toEqual([]);
    expect(requests.length).toBeLessThanOrEqual(2);
  });

  it('does not mark exhaustive detail answered after the plan limits the source groups', async () => {
    const exhaustive = structuredClone(contract);
    exhaustive.obligaciones[0].detalle = 'exhaustivo';
    const { body } = await execute({ limite: 1 }, false, exhaustive);
    // A safe rejection is acceptable; a substantive limited result must retain pending detail.
    expect(body.cobertura.partes?.find((p: { id: string }) => p.id === 's1')?.disposicion).not.toBe('respondida');
    if (body.resultados.length) {
      expect(body.resultados[0].cobertura.grupos_mostrados).toBeLessThan(body.resultados[0].cobertura.grupos_totales);
      expect(body.respuesta).toMatch(/parcial|pendiente|limitad|exhaustiv/i);
    }
  });

  it('keeps an uninterpreted residual visible while preserving supported substantive answers', async () => {
    const residual: Record<string, unknown> = structuredClone(contract);
    residual.residuales = [{ inicio: 0, fin: 8, motivo: 'no_interpretado' }];
    const { body } = await execute({}, false, residual);
    expect(body.resultados).toHaveLength(2);
    expect(body.intencion.residuales).toHaveLength(1);
    expect(body.respuesta).toMatch(/pendiente|interpret|aclara/i);
  });
});
