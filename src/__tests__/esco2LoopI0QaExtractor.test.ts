// Fixed SQL oracle and explicit provider receipts test retries, never model accuracy.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { ErrorLLM, type ClienteLLM, type RespuestaLLM, type SolicitudLLM } from '../utils/esco2/llm.ts';
import { dependencies, forbidNetwork, ID, p2Db, plan, request } from './esco2P2Harness.ts';

let db: PGlite;
beforeAll(async () => { forbidNetwork(); db = await p2Db(); }, 30_000);
afterAll(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); await db?.close(); });
const q = 'Jornales del lote seleccionado del 2026-10-26 al 2026-11-01';
const intent = { version: 1, obligaciones: [{ id: 'o1', evidencias: [{ mensaje: 'actual', inicio: 0, fin: q.length }], capacidad: 'labores', poblacion: { tipo: 'explicita', entidad: 'lotes', ids: [ID.l3] }, periodo: { tipo: 'intervalo', desde: '2026-10-26', hasta: '2026-11-01', base_fecha: 'fecha_trabajo' }, metricas: ['jornales'], agrupaciones: [], condiciones: [], detalle: 'resumen' }], residuales: [] };
const declaration = { nombre: 'declarar_intencion', argumentos: JSON.stringify(intent) };
const proposal = { nombre: 'consultar_labores', argumentos: JSON.stringify(plan({ metricas: ['jornales'], agrupar_por: [], lote_ids: [ID.l3], parte_ids: ['s1'], cobertura: { version: 1, partes: [{ id: 's1', texto: q, capacidad: 'labores', disposicion: 'consultar' }] } })) };
const malformed = { nombre: 'declarar_intencion', argumentos: '{"version":1,"MALFORMED_PRIVATE_MARKER_998877":' };
type Receipt = { calls: RespuestaLLM['llamadas']; finish?: string } | Error;
async function execute(receipts: Receipt[]) {
  const requests: SolicitudLLM[] = [];
  const llm: ClienteLLM = { async completar(s) {
    requests.push(structuredClone(s));
    const r = receipts[requests.length - 1];
    if (!r) throw new ErrorLLM('UNPLANNED_PROVIDER_CALL');
    if (r instanceof Error) throw r;
    return { texto: '', llamadas: r.calls, uso: { entrada: 1, salida: 1, razonamiento: 0, costoUsd: 0 }, ms: 0, modelo: s.modelo, finishReason: r.finish ?? 'stop' };
  } };
  const h = dependencies(db, [], { modoCobertura: 'obligatoria', crearLLM: () => llm });
  const response = await manejar(request({ pregunta: q }), { ...h.deps, modoIntencion: 'obligatoria' as const });
  expect(response.status).toBe(200);
  return { body: await response.json(), requests };
}
function substantive(body: { origen: string; resultados: { total: { jornales: number } }[] }) {
  expect(body.origen).toBe('determinista');
  expect(body.resultados).toHaveLength(1);
  expect(body.resultados[0].total.jornales).toBe(0.75);
}
const toolNames = (s: SolicitudLLM) => (s.herramientas as { function: { name: string } }[]).map(t => t.function.name);

describe('Loop I0 F2: separate, bounded extraction and planning attempts', () => {
  it('repairs one invalid JSON receipt with a closed reason and returns factual source data', async () => {
    const { body, requests } = await execute([{ calls: [malformed] }, { calls: [declaration] }, { calls: [proposal] }]);
    substantive(body);
    expect(requests).toHaveLength(3);
    expect(toolNames(requests[0])).toEqual(['declarar_intencion']);
    expect(toolNames(requests[1])).toEqual(['declarar_intencion']);
    expect(requests[1].mensajes.length).toBeGreaterThan(requests[0].mensajes.length);
    const correction = requests[1].mensajes.at(-1)!;
    expect(correction.role).toBe('system');
    expect(correction.content).toMatch(/intencion_no_valida:[a-z_]+/);
    expect(requests[1].mensajes.map(m => m.content).join('\n')).not.toContain('MALFORMED_PRIVATE_MARKER_998877');
    expect(body.llamadas.map((l: { etapa: string }) => l.etapa)).toEqual(['intencion', 'intencion', 'planificador']);
  });

  it('uses at most two extractor and two planner receipts when both stages need repair', async () => {
    const invalid = { nombre: 'declarar_intencion', argumentos: JSON.stringify({ ...intent, version: 99 }) };
    const badPlan = { nombre: 'SQL_NO_REGISTRADO', argumentos: '{}' };
    const { body, requests } = await execute([{ calls: [invalid] }, { calls: [declaration] }, { calls: [badPlan] }, { calls: [proposal] }]);
    substantive(body);
    expect(requests).toHaveLength(4);
    expect(body.llamadas.map((l: { etapa: string }) => l.etapa)).toEqual(['intencion', 'intencion', 'planificador', 'planificador']);
  });

  it('stops after a second invalid extraction receipt without trying a third extraction or a plan', async () => {
    const { body, requests } = await execute([{ calls: [malformed] }, { calls: [malformed] }]);
    expect(body.origen).toBe('error_plan');
    expect(body.resultados).toEqual([]);
    expect(requests).toHaveLength(2);
    expect(requests.every(s => toolNames(s).join(',') === 'declarar_intencion')).toBe(true);
  });

  it('stops on a provider/unknown-receipt error before any retry or planning request', async () => {
    const { body, requests } = await execute([new ErrorLLM('UNKNOWN_RECEIPT_SYNTHETIC')]);
    expect(body.origen).toBe('error_llm');
    expect(body.resultados).toEqual([]);
    expect(requests).toHaveLength(1);
  });

  it('does not continue to a plan when the retry transport has an unknown receipt', async () => {
    const { body, requests } = await execute([{ calls: [malformed] }, new ErrorLLM('UNKNOWN_RECEIPT_ON_RETRY_SYNTHETIC')]);
    expect(body.origen).toBe('error_llm');
    expect(body.resultados).toEqual([]);
    expect(requests).toHaveLength(2);
  });

  it('does not trust a length-terminated extraction even when its JSON happens to parse', async () => {
    const { body, requests } = await execute([{ calls: [declaration], finish: 'length' }, { calls: [declaration] }, { calls: [proposal] }]);
    substantive(body);
    expect(requests).toHaveLength(3);
  });
});

describe('Loop I0 F3: valid source ranges do not certify semantic extraction', () => {
  it('keeps a valid one-character range without promoting it into certified semantic exhaustiveness', async () => {
    const narrow = structuredClone(intent);
    narrow.obligaciones[0].evidencias[0].fin = 1;
    const { body } = await execute([{ calls: [{ nombre: 'declarar_intencion', argumentos: JSON.stringify(narrow) }] }, { calls: [proposal] }]);
    substantive(body);
    expect(body.intencion.obligaciones[0].evidencias[0]).toMatchObject({ inicio: 0, fin: 1 });
    expect(body.cobertura.exhaustividad).toBe('no_certificada');
  });
});
