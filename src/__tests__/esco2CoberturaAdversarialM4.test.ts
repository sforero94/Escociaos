// Independent synthetic HTTP + planner validation + SQL/RLS acceptance controls.
// No external models, private cases or production data.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { dependencies, forbidNetwork, request } from './esco2P2Harness.ts';
import { task3QaDb, T3 } from './esco2P3Task3QaHarness.ts';
import type { LlamadaHerramienta } from '../utils/esco2/registro.ts';

let db: PGlite;
beforeAll(async () => { forbidNetwork(); db = await task3QaDb(); }, 30000);
afterAll(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); await db?.close(); });
const supported = { id: 's1', texto: 'productos ejecutados de Líquido sintético', capacidad: 'cantidades_aplicacion', disposicion: 'consultar' };
const excluded = { id: 's2', texto: 'calibración por árbol', capacidad: 'fuera_de_contrato', disposicion: 'fuera_de_contrato' };
const pregunta = `${supported.texto} y ${excluded.texto}`;
const inventory = { version: 1, partes: [supported, excluded] };
const quantities = (extra: Record<string, unknown> = {}): LlamadaHerramienta => ({ nombre: 'consultar_cantidades_aplicacion', argumentos: JSON.stringify({ aplicacion_id: T3.liquid, cobertura: inventory, parte_ids: ['s1'], ...extra }) });
const carrier = (extra: Record<string, unknown> = {}): LlamadaHerramienta => ({ nombre: 'fuera_de_alcance', argumentos: JSON.stringify({ motivo: 'fuera de contrato', ...extra }) });
async function execute(calls: LlamadaHerramienta[]) {
  const h = dependencies(db, calls);
  const response = await manejar(request({ pregunta }), { ...h.deps, modoCobertura: 'obligatoria' });
  return { ...h, response, body: await response.json() };
}
function substantive(body: Awaited<ReturnType<typeof execute>>['body']) {
  expect(body.origen).toBe('determinista');
  expect(body.resultados).toHaveLength(1);
  expect(body.respuesta).toContain('0,01 L');
  expect(body.cobertura.partes.map((p: { disposicion: string }) => p.disposicion)).toEqual(['respondida', 'fuera_de_contrato']);
}
function rejected(h: Awaited<ReturnType<typeof execute>>) {
  expect(h.body.origen).toBe('error_plan');
  expect(h.body.resultados).toEqual([]);
  expect(h.traza.consultas.filter(q => q.tabla === 'movimientos_diarios')).toHaveLength(0);
}

describe('M4 independent adversarial repair boundaries through real HTTP handler', () => {
  it.each([{}, { parte_ids: [] }])('Given redundant carrier with no bindings, When its outside part is already declared, Then supported facts remain identical (%j)', async extra => {
    const positive = await execute([quantities()]); substantive(positive.body);
    const repaired = await execute([quantities(), carrier(extra)]); substantive(repaired.body);
    expect(repaired.body.resultados).toEqual(positive.body.resultados);
    expect(repaired.body.cobertura).toEqual(positive.body.cobertura);
  });

  it.each(['s1', null, 1, { id: 's1' }])('Given malformed carrier parte_ids=%j, When a supported operation and outside part coexist, Then normalization cannot hide invalid metadata', async parte_ids => {
    rejected(await execute([quantities(), carrier({ parte_ids })]));
  });

  it.each([['s1'], ['s2'], ['s9']])('Given carrier with explicit binding %j, When the normalizer sees an outside part, Then it cannot silently discard that binding', async (...parte_ids) => {
    rejected(await execute([quantities(), carrier({ parte_ids })]));
  });

  it.each([
    { motivo: null },
    { motivo: 1 },
    { otro_argumento: 'no registrado' },
  ])('Given malformed outside carrier domain arguments %j, When discarded, Then closed domain validation still rejects the proposal', async extra => {
    rejected(await execute([quantities(), carrier(extra)]));
  });

  it.each([
    { motivo: 'falta identidad' },
    { pregunta: 1 },
    { pregunta: '  ' },
    { pregunta: '¿Cuál?', otro_argumento: true },
  ])('Given malformed clarification carrier arguments %j, When mixed with an operation, Then normalization cannot bypass its domain schema', async args => {
    const pending = { ...excluded, capacidad: 'costos_aplicacion', disposicion: 'aclarar' };
    rejected(await execute([
      quantities({ cobertura: { version: 1, partes: [supported, pending] } }),
      { nombre: 'pedir_aclaracion', argumentos: JSON.stringify(args) },
    ]));
  });

  it('Given a valid redundant clarification carrier and declared pending part, When normalized, Then the substantive operation and clarification disposition survive', async () => {
    const pending = { ...excluded, capacidad: 'costos_aplicacion', disposicion: 'aclarar' };
    const h = await execute([
      quantities({ cobertura: { version: 1, partes: [supported, pending] } }),
      { nombre: 'pedir_aclaracion', argumentos: JSON.stringify({ pregunta: '¿Cuál aplicación?', motivo: 'falta identidad' }) },
    ]);
    expect(h.body.origen).toBe('determinista');
    expect(h.body.resultados).toHaveLength(1);
    expect(h.body.respuesta).toContain('0,01 L');
    expect(h.body.cobertura.partes.map((p: { disposicion: string }) => p.disposicion)).toEqual(['respondida', 'aclarar']);
  });

  it('Given five original calls including one redundant carrier, When the carrier is removed, Then the four-call bound still rejects the original oversized proposal', async () => {
    rejected(await execute([quantities(), quantities(), quantities(), quantities(), carrier()]));
  });

  it('Given distinct partial inventories, When merged without invalid metadata, Then supported facts and outside disposition both survive', async () => {
    const h = await execute([
      quantities({ cobertura: { version: 1, partes: [supported] } }),
      carrier({ cobertura: { version: 1, partes: [excluded] } }),
    ]);
    substantive(h.body);
  });

  it('Given a partial inventory with an unregistered property, When merged with another partial inventory, Then closed-schema rejection cannot be erased', async () => {
    rejected(await execute([
      quantities({ cobertura: { version: 1, partes: [supported], ignorarValidacion: true } }),
      carrier({ cobertura: { version: 1, partes: [excluded] } }),
    ]));
  });

  it('Given an internally duplicated part id, When merged with a different inventory, Then deduplication cannot hide the malformed declaration', async () => {
    rejected(await execute([
      quantities({ cobertura: { version: 1, partes: [supported, supported] } }),
      carrier({ cobertura: { version: 1, partes: [excluded] } }),
    ]));
  });

  it('Given the same part id with contradictory dispositions in different inventories, When merged, Then the handler rejects before reading facts', async () => {
    rejected(await execute([
      quantities(),
      carrier({ cobertura: { version: 1, partes: [{ ...supported, disposicion: 'aclarar' }, excluded] } }),
    ]));
  });
});
