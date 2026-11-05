// Independent coverage acceptance oracle. Entirely synthetic SQL/RLS and real HTTP handler.
// Declared coverage cannot certify extraction: an external immutable part list is required.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { dependencies, forbidNetwork, request } from './esco2P2Harness.ts';
import { task4QaDb, task4QaSeed } from './esco2P3Task4QaHarness.ts';
import { T3 } from './esco2P3Task3QaHarness.ts';
import { qaFaultClient } from './esco2P3Task2QaHarness.ts';
import type { LlamadaHerramienta } from '../utils/esco2/registro.ts';
import type { RespuestaPostgrest } from '../utils/esco2/fuente.ts';
type Part = { id: string; texto: string; capacidad: string; disposicion: string };
type Answer = { respuesta: string; resultados: Array<{ id: string; aplicacion?: { id: string }; congelado?: { insumos: number | null } }>; cobertura?: { estado: string; exhaustividad: string; partes: Array<Part & { resultado_ids: string[] }> } };
let db: PGlite;
beforeAll(async () => { forbidNetwork(); db = await task4QaDb(); }, 30000);
beforeEach(async () => { await task4QaSeed(db); });
afterAll(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); await db?.close(); });
const qPart: Part = { id: 's1', texto: 'productos ejecutados de Líquido sintético', capacidad: 'cantidades_aplicacion', disposicion: 'consultar' };
const unsupported: Part = { id: 's2', texto: 'calibración por árbol', capacidad: 'fuera_de_contrato', disposicion: 'fuera_de_contrato' };
const costPart: Part = { id: 's2', texto: 'costos al cierre de Fertilizante sintético', capacidad: 'costos_aplicacion', disposicion: 'consultar' };
const quantity = (parts: Part[] = [qPart], extra: Record<string, unknown> = {}): LlamadaHerramienta => ({ nombre: 'consultar_cantidades_aplicacion', argumentos: JSON.stringify({ aplicacion_id: T3.liquid, parte_ids: ['s1'], cobertura: { version: 1, partes: parts }, ...extra }) });
const cost = (extra: Record<string, unknown> = {}): LlamadaHerramienta => ({ nombre: 'consultar_costos_aplicacion', argumentos: JSON.stringify({ aplicacion_id: T3.fertilizer, parte_ids: ['s2'], ...extra }) });
async function execute(calls: LlamadaHerramienta[], pregunta = 'productos ejecutados de Líquido sintético y calibración por árbol', fault?: (table: string, response: RespuestaPostgrest) => RespuestaPostgrest) {
  const h = dependencies(db, calls, fault ? { crearClienteUsuario: jwt => qaFaultClient(db, jwt, { consultas: [] }, [], fault) } : {});
  const deps = { ...h.deps, modoCobertura: 'obligatoria' as const };
  const response = await manejar(request({ pregunta }), deps);
  return { ...h, deps, response, body: await response.json() };
}
// Independent external oracle. It never calls executor, renderer or coverage constructors.
function audit(answer: Answer, parts: Array<{ texto: string; capacidad: string; disposicion: string; app?: string }>, checks: { nullCost?: boolean; qualifier?: string } = {}) {
  if (answer.cobertura?.estado !== 'declarada_validada' || answer.cobertura.exhaustividad !== 'no_certificada') return false;
  if (answer.cobertura.partes.length !== parts.length) return false;
  for (const expected of parts) {
    const actual = answer.cobertura.partes.find(p => p.texto === expected.texto && p.capacidad === expected.capacidad);
    if (!actual || actual.disposicion !== expected.disposicion) return false;
    if (expected.app && !actual.resultado_ids.some(id => answer.resultados.some(r => r.id === id && r.aplicacion?.id === expected.app))) return false;
  }
  if (checks.nullCost && answer.resultados.some(r => r.congelado && r.congelado.insumos !== null)) return false;
  if (checks.qualifier && !answer.respuesta.includes(checks.qualifier)) return false;
  return true;
}
describe('P3 coverage QA: independent obligations through real handler', () => {
  it('Given supported quantities plus excluded calibration, When one existing tool declares both parts, Then facts and separate closed disposition survive HTTP', async () => {
    const h = await execute([quantity([qPart, unsupported])]);
    expect(h.response.status).toBe(200);
    expect(h.body.origen).toBe('determinista');
    expect(h.body.resultados).toHaveLength(1);
    expect(h.body.respuesta).toMatch(/0,01 L/);
    expect(audit(h.body, [{ ...qPart, disposicion: 'respondida', app: T3.liquid }, unsupported])).toBe(true);
    expect(h.body.cobertura.partes[1].resultado_ids).toEqual([]);
    expect(h.body.respuesta).toMatch(/fuera|no (?:est[aá]|disponible)|sin capacidad|parcial/i);
  });
  it('Given a declared supported part without an executable mapping, When the invalid plan repeats, Then no partial factual answer escapes', async () => {
    const h = await execute([quantity([qPart, costPart])], qPart.texto + ' y ' + costPart.texto);
    expect(h.body.origen).toBe('error_plan');
    expect(h.body.resultados).toEqual([]);
  });
  it('Given a nonliteral invented request fragment, When coverage is validated, Then the plan is rejected', async () => {
    const h = await execute([quantity([{ ...qPart, texto: 'texto que el usuario nunca dijo' }])]);
    expect(h.body.origen).toBe('error_plan');
  });
  it('Given no manifest in mandatory mode, When a legacy tool returns, Then the turn is not certified', async () => {
    const h = await execute([{ nombre: 'consultar_cantidades_aplicacion', argumentos: JSON.stringify({ aplicacion_id: T3.liquid }) }]);
    expect(h.body.origen).toBe('error_plan');
    expect(h.body.resultados).toEqual([]);
  });
  it('Given nine declared obligations, When a single mapped operation is proposed, Then the handler rejects rather than answering a truncated inventory', async () => {
    const partes = Array.from({ length: 9 }, (_, i) => ({ ...qPart, id: `s${i + 1}` }));
    const h = await execute([quantity(partes, { parte_ids: partes.map(p => p.id) })], qPart.texto);
    expect(h.body.origen).toBe('error_plan');
    expect(h.body.resultados).toEqual([]);
    expect(h.traza.consultas.filter(q => q.tabla === 'movimientos_diarios')).toHaveLength(0);
  });
  it('Given five mapped calls, When all obligations otherwise fit the inventory, Then the handler executes no prefix beyond the four-call bound', async () => {
    const calls = Array.from({ length: 5 }, (_, i) => quantity([qPart], i ? { cobertura: undefined } : {}));
    const h = await execute(calls, qPart.texto);
    expect(h.body.origen).toBe('error_plan');
    expect(h.body.resultados).toEqual([]);
    expect(h.traza.consultas.filter(q => q.tabla === 'movimientos_diarios')).toHaveLength(0);
  });
  it('Given one failed movement reader and independent closure costs, When both parts run, Then unavailable remains separate from answered', async () => {
    const h = await execute([quantity([qPart, costPart]), cost()], qPart.texto + ' y ' + costPart.texto, (table, response) => table === 'movimientos_diarios' ? { data: null, error: { message: 'synthetic failure' }, count: null } : response);
    expect(h.body.resultados).toHaveLength(2);
    expect(audit(h.body, [{ ...qPart, disposicion: 'fuente_no_disponible', app: T3.liquid }, { ...costPart, disposicion: 'respondida', app: T3.fertilizer }])).toBe(true);
    expect(h.body.resultados[1].congelado.insumos).toBe(120);
  });
  it('Given NULL closure cost, When queried, Then its derived disposition is unavailable and does not fabricate zero', async () => {
    await db.query('update aplicaciones set costo_total_insumos=null where id=$1', [T3.fertilizer]);
    const p: Part = { ...costPart, id: 's1' };
    const h = await execute([cost({ parte_ids: ['s1'], cobertura: { version: 1, partes: [p] } })], p.texto);
    expect(audit(h.body, [{ ...p, disposicion: 'fuente_no_disponible', app: T3.fertilizer }], { nullCost: true })).toBe(true);
    expect(h.body.respuesta).not.toMatch(/insumos: \$0/i);
  });
  it('Given valid independent obligations, When a whole declared part is removed, Then the external oracle catches extraction loss', async () => {
    const h = await execute([quantity([qPart, unsupported])]);
    const expected = [{ ...qPart, disposicion: 'respondida', app: T3.liquid }, unsupported];
    expect(audit(h.body, expected)).toBe(true);
    const mutated = structuredClone(h.body);
    mutated.cobertura.partes.pop();
    expect(audit(mutated, expected)).toBe(false);
  });
  it('Given valid bound results, When another application ID replaces the answer entity, Then the external oracle detects it', async () => {
    const h = await execute([quantity()]);
    const expected = [{ ...qPart, disposicion: 'respondida', app: T3.liquid }];
    expect(audit(h.body, expected)).toBe(true);
    const mutated = structuredClone(h.body);
    mutated.resultados[0].aplicacion.id = T3.fertilizer;
    expect(audit(mutated, expected)).toBe(false);
  });
  it('Given supported NULL source and a valid qualifier, When NULL becomes zero or the qualifier is removed, Then independent checks reject both mutations', async () => {
    await db.query('update aplicaciones set costo_total_insumos=null where id=$1', [T3.fertilizer]);
    const p: Part = { ...costPart, id: 's1' };
    const h = await execute([cost({ parte_ids: ['s1'], cobertura: { version: 1, partes: [p] } })], p.texto);
    const expected = [{ ...p, disposicion: 'fuente_no_disponible', app: T3.fertilizer }];
    const checks = { nullCost: true, qualifier: 'Costo congelado al cierre' };
    expect(audit(h.body, expected, checks)).toBe(true);
    const zero = structuredClone(h.body); zero.resultados[0].congelado.insumos = 0;
    expect(audit(zero, expected, checks)).toBe(false);
    const noQualifier = structuredClone(h.body); noQualifier.respuesta = noQualifier.respuesta.replace('Costo congelado al cierre', 'Costo');
    expect(audit(noQualifier, expected, checks)).toBe(false);
  });
});
