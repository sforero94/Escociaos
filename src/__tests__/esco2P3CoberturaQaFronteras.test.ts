// Independent synthetic integration controls for the four pre-campaign contract boundaries.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import * as core from '../utils/esco2/nucleo.ts';
import { construirCoberturaFinal } from '../utils/esco2/cobertura.ts';
import { validarMensajeFinal } from '../utils/esco2/mensajes.ts';
import type { LlamadaHerramienta } from '../utils/esco2/registro.ts';
import { dependencies, forbidNetwork, request } from './esco2P2Harness.ts';
import { task3QaDb, T3 } from './esco2P3Task3QaHarness.ts';

let db: PGlite;
beforeAll(async () => { forbidNetwork(); db = await task3QaDb(); }, 30000);
afterAll(async () => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); await db?.close(); });
const supported = { id: 's1', texto: 'productos ejecutados de Líquido sintético', capacidad: 'cantidades_aplicacion', disposicion: 'consultar' };
const excluded = { id: 's2', texto: 'calibración por árbol', capacidad: 'fuera_de_contrato', disposicion: 'fuera_de_contrato' };
const pregunta = supported.texto + ' y ' + excluded.texto;
const call = (partes = [supported, excluded], extra: Record<string, unknown> = {}): LlamadaHerramienta => ({ nombre: 'consultar_cantidades_aplicacion', argumentos: JSON.stringify({ aplicacion_id: T3.liquid, parte_ids: ['s1'], cobertura: { version: 1, partes }, ...extra }) });
async function execute(llamada: LlamadaHerramienta = call()) {
  const h = dependencies(db, [llamada]);
  const deps = { ...h.deps, modoCobertura: 'obligatoria' as const };
  const response = await manejar(request({ pregunta }), deps);
  return { ...h, deps, response, body: await response.json() };
}
function substantive(body: Awaited<ReturnType<typeof execute>>['body']) {
  expect(body.origen).toBe('determinista');
  expect(body.resultados).toHaveLength(1);
  expect(body.respuesta).toContain('0,01 L');
  expect(body.cobertura.partes.map((p: { disposicion: string }) => p.disposicion)).toEqual(['respondida', 'fuera_de_contrato']);
}

describe('P3 coverage QA: exact four contract mutation boundaries', () => {
  // Contract change 2026-11-05 (M4): a forgotten link with exactly ONE call of the part's
  // capacity is repaired, because it has only one possible reading. The repaired turn must
  // equal the linked positive control: same results, same coverage. Ambiguous links are
  // still rejected (esco2CoberturaBackend.test.ts).
  it('orphan operation: a forgotten unambiguous link is repaired to the exact positive control', async () => {
    const positive = await execute(); substantive(positive.body);
    const mutated = await execute(call(undefined, { parte_ids: [] }));
    substantive(mutated.body);
    expect(mutated.body.resultados).toEqual(positive.body.resultados);
    expect(mutated.body.cobertura).toEqual(positive.body.cobertura);
  });
  it('crossed capacity or selection: positive substantive control passes, mismatched operation and result entity are rejected', async () => {
    const positive = await execute(); substantive(positive.body);
    const crossCapacity = await execute(call([{ ...supported, capacidad: 'costos_aplicacion' }, excluded]));
    expect(crossCapacity.body.origen).toBe('error_plan');
    expect(crossCapacity.body.resultados).toEqual([]);
    const results = structuredClone(positive.body.resultados);
    results[0].aplicacion.id = T3.fertilizer;
    expect(() => construirCoberturaFinal(positive.body.plan, results, '2026-11-05')).toThrow();
  });
  it('altered final disposition: positive substantive control passes, core validation rejects tampered text and HTTP restores it canonically', async () => {
    const positive = await execute(); substantive(positive.body);
    const altered = positive.body.respuesta.replace('Esta parte está fuera del alcance actual; no hago ese cálculo.', 'Esta parte está respondida.');
    expect(altered).not.toBe(positive.body.respuesta);
    expect(validarMensajeFinal(positive.body.respuesta, positive.body.resultados, undefined, undefined, positive.body.cobertura)).toBe(true);
    expect(validarMensajeFinal(altered, positive.body.resultados, undefined, undefined, positive.body.cobertura)).toBe(false);
    const original = core.responderTurnoDesdeFuente;
    const spy = vi.spyOn(core, 'responderTurnoDesdeFuente').mockImplementationOnce(async args => ({ ...await original(args), respuesta: altered }));
    try {
      const restored = await execute(); substantive(restored.body);
      expect(restored.body.respuesta).toBe(positive.body.respuesta);
      expect(restored.body.respuesta).not.toBe(altered);
    } finally { spy.mockRestore(); }
  });
  it('omitted inventory and operation: positive substantive control passes, structurally valid omission fails the independent obligation list', async () => {
    const expected = ['cantidades_aplicacion:respondida', 'fuera_de_contrato:fuera_de_contrato'];
    const audit = (body: Awaited<ReturnType<typeof execute>>['body']) => expected.every(key => body.cobertura.partes.some((p: { capacidad: string; disposicion: string }) => `${p.capacidad}:${p.disposicion}` === key));
    const positive = await execute(); substantive(positive.body); expect(audit(positive.body)).toBe(true);
    const omitted = await execute(call([supported]));
    expect(omitted.body.origen).toBe('determinista');
    expect(omitted.body.resultados).toHaveLength(1);
    expect(omitted.body.cobertura.estado).toBe('declarada_validada');
    expect(omitted.body.cobertura.exhaustividad).toBe('no_certificada');
    expect(audit(omitted.body)).toBe(false);
  });
});
