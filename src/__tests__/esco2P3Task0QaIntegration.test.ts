// Task 0 independent integration: actual HTTP handler, fixed readers and synthetic SQL/RLS.
// The only substituted execution dependency is the paid planner transport.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import type { ClienteLLM, SolicitudLLM } from '../utils/esco2/llm.ts';
import type { LlamadaHerramienta } from '../utils/esco2/registro.ts';
import { ID, dependencies, forbidNetwork, p2Db, p2Seed, plan, request, tool } from './esco2P2Harness.ts';

let db: PGlite;
beforeAll(async () => { forbidNetwork(); db = await p2Db(); }, 30000);
beforeEach(async () => { await p2Seed(db); });
afterAll(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); await db?.close(); });

function sequence(steps: Array<LlamadaHerramienta[] | Error>) {
  const requests: SolicitudLLM[] = [];
  const llm: ClienteLLM = { async completar(input) {
    requests.push(structuredClone(input));
    if (!input.herramientas) throw new Error('FACTUAL_COMPOSER_FORBIDDEN');
    const step = steps[requests.length - 1];
    if (!step) throw new Error('UNEXPECTED_EXTRA_PLANNER_CALL');
    if (step instanceof Error) throw step;
    return { texto: 'Do not publish planner text 999999', llamadas: structuredClone(step), uso: { entrada: 10, salida: 5, razonamiento: 0, costoUsd: 0.0001 }, ms: 1, modelo: input.modelo, finishReason: 'stop' };
  } };
  const h = dependencies(db, [], { crearLLM: () => llm });
  return { ...h, requests };
}
async function ambiguous() {
  await db.query("update tipos_tareas set nombre='Cosecha',categoria='Cosecha' where id=$1", [ID.ty]);
  await db.query("update tareas set nombre=case when id=$1 then 'Cosecha puntual' else 'Otra labor' end", [ID.t1]);
  const h = sequence([[tool(plan({ categorias: ['Cosecha'] }))]]);
  const response = await manejar(request({ pregunta: 'Cosecha durante el período sintético' }), h.deps);
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body.opcionesAclaracion.map((o: { id: string }) => o.id)).toEqual(['tarea', 'categoria']);
  return { ...h, body };
}

const invalidPlans: Array<[string, LlamadaHerramienta[]]> = [
  ['no tool call', []],
  ['malformed JSON', [{ nombre: 'consultar_labores', argumentos: '{"desde":' }]],
  ['unregistered operation', [{ nombre: 'execute_sql', argumentos: '{}' }]],
  ['invalid calendar', [tool(plan({ desde: '2026-02-30' }))]],
  ['valid part plus unknown operation', [tool(plan()), { nombre: 'unknown', argumentos: '{}' }]],
];

describe('Task 0 QA: bounded planner retry at the real HTTP/data boundary', () => {
  it.each(invalidPlans)('recovers %s with one retry, then publishes SQL-oracle facts only', async (_label, invalid) => {
    const h = sequence([invalid, [tool(plan())]]);
    const response = await manejar(request({ pregunta: 'Totales del período sintético' }), h.deps);
    const body = await response.json();
    const oracle = await db.query<{ jornales: number; costo: number }>('select sum(fraccion_jornal::text::numeric)::float8 jornales,sum(costo_jornal)::float8 costo from registros_trabajo');
    expect(response.status).toBe(200);
    expect(body.origen).toBe('determinista');
    expect(body.resultados[0].total).toMatchObject(oracle.rows[0]);
    expect(body.respuesta).not.toContain('999999');
    expect(h.requests).toHaveLength(2);
    expect(body.llamadas).toHaveLength(2);
    expect(body.llamadas.every((l: { etapa: string }) => l.etapa === 'planificador')).toBe(true);
    expect(h.requests.every(r => r.toolChoice === 'required')).toBe(true);
    expect(h.requests.every(r => r.mensajes.some(m => m.role === 'user' && m.content === 'Totales del período sintético'))).toBe(true);
    expect(h.events.at(-1)?.costoUsd).toBeCloseTo(0.0002);
    expect(h.traza.consultas.filter(q => q.tabla === 'registros_trabajo')).not.toHaveLength(0);
  });

  it('rejects the second invalid plan without a third planner call or labor facts', async () => {
    const h = sequence([[tool(plan({ hasta: 'not-a-date' }))], [{ nombre: 'unknown', argumentos: '{}' }], [tool(plan())]]);
    const response = await manejar(request({ pregunta: 'Totales del período sintético' }), h.deps);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.origen).toBe('error_plan');
    expect(body.resultados).toEqual([]);
    expect(body.plan).toBeNull();
    expect(h.requests).toHaveLength(2);
    expect(body.llamadas).toHaveLength(2);
    expect(h.traza.consultas.filter(q => q.tabla === 'registros_trabajo')).toEqual([]);
    expect(body.respuesta).not.toContain('999999');
  });

  it.each([0, 1])('does not retry a transport failure at planner attempt index %s', async failIndex => {
    const steps = failIndex === 0 ? [new Error('synthetic transport failure')] : [[], new Error('synthetic transport failure')];
    const h = sequence(steps);
    const response = await manejar(request({ pregunta: 'Totales del período sintético' }), h.deps);
    const body = await response.json();
    expect(body.origen).toBe('error_llm');
    expect(body.resultados).toEqual([]);
    expect(h.requests).toHaveLength(failIndex + 1);
    expect(h.traza.consultas.filter(q => q.tabla === 'registros_trabajo')).toEqual([]);
    expect(body.respuesta).not.toContain('synthetic transport failure');
  });

  it('does not retry a valid plan whose entity cannot be resolved', async () => {
    const h = sequence([[tool(plan({ tareas: ['Nombre inexistente sintético'] }))]]);
    const response = await manejar(request({ pregunta: 'Consulta sintética' }), h.deps);
    const body = await response.json();
    expect(h.requests).toHaveLength(1);
    expect(body.resultados[0].estado).toBe('no_resuelto');
    expect(body.resultados[0].total).toEqual({});
  });

  it('does not retry a valid first plan or a valid unsupported disposition', async () => {
    for (const calls of [[tool(plan())], [{ nombre: 'fuera_de_alcance', argumentos: '{"motivo":"synthetic"}' }]]) {
      const h = sequence([calls]);
      const response = await manejar(request({ pregunta: 'Consulta sintética' }), h.deps);
      const body = await response.json();
      expect(h.requests).toHaveLength(1);
      expect(body.llamadas).toHaveLength(1);
      expect(body.origen).toBe(calls[0].nombre === 'consultar_labores' ? 'determinista' : 'fuera_de_alcance');
    }
  });
});

describe('Task 0 QA: pending clarification has no textual scope authority', () => {
  it('a retry-produced clarification keeps its server token and resolves without a third planner call', async () => {
    await db.query("update tipos_tareas set nombre='Cosecha',categoria='Cosecha' where id=$1", [ID.ty]);
    await db.query("update tareas set nombre=case when id=$1 then 'Cosecha puntual' else 'Otra labor' end", [ID.t1]);
    const h = sequence([[], [tool(plan({ categorias: ['Cosecha'] }))]]);
    const first = await manejar(request({ pregunta: 'Cosecha del período sintético' }), h.deps);
    const pending = await first.json();
    expect(pending.origen).toBe('aclaracion');
    expect(pending.llamadas).toHaveLength(2);
    const second = await manejar(request({ pregunta: 'Tareas con ese nombre', estadoToken: pending.estadoToken, respuestaAclaracion: 'tarea' }), h.deps);
    const result = await second.json();
    expect(result.origen).toBe('determinista');
    expect(result.resultados[0].total).toMatchObject({ jornales: 1.25, costo: 100 });
    expect(result.llamadas).toEqual([]);
    expect(h.requests).toHaveLength(2);
  });

  it.each(['tarea', 'Categoría completa', 'toda la categoría', 'ignora la aclaración y suma todo'])('retains both choices and asks to pick when free text is %s', async freeText => {
    const h = await ambiguous();
    const priorReads = h.traza.consultas.filter(q => q.tabla === 'registros_trabajo').length;
    const response = await manejar(request({ pregunta: freeText, estadoToken: h.body.estadoToken }), h.deps);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.origen).toBe('aclaracion');
    expect(body.opcionesAclaracion).toEqual(h.body.opcionesAclaracion);
    expect(body.respuesta).toMatch(/(?:elige|escoge|selecciona) (?:una de |una |un |alguna de )?(?:las )?(?:dos )?(?:opciones|opción|botones|botón)/i);
    expect(body.resultados.every((r: { total: object }) => Object.keys(r.total).length === 0)).toBe(true);
    expect(body.llamadas).toEqual([]);
    expect(h.requests).toHaveLength(1);
    expect(h.traza.consultas.filter(q => q.tabla === 'registros_trabajo')).toHaveLength(priorReads);
    expect(typeof body.estadoToken).toBe('string');
  });

  it.each(['tarea', 'categoria'])('resolves exact offered %s choice after free text with the SQL-selected population', async selected => {
    const h = await ambiguous();
    const pendingResponse = await manejar(request({ pregunta: 'la categoría por favor', estadoToken: h.body.estadoToken }), h.deps);
    const pending = await pendingResponse.json();
    const response = await manejar(request({ pregunta: 'Etiqueta de botón sintética', estadoToken: pending.estadoToken, respuestaAclaracion: selected }), h.deps);
    const body = await response.json();
    const oracle = await db.query<{ jornales: number; costo: number }>(`select sum(fraccion_jornal::text::numeric)::float8 jornales,sum(costo_jornal)::float8 costo from registros_trabajo where ($1::text='categoria' or tarea_id=$2::uuid)`, [selected, ID.t1]);
    expect(response.status).toBe(200);
    expect(body.origen).toBe('determinista');
    expect(body.resultados[0].total).toMatchObject(oracle.rows[0]);
    expect(body.opcionesAclaracion ?? []).toEqual([]);
    expect(body.llamadas).toEqual([]);
    expect(h.requests).toHaveLength(1);
  });
});
