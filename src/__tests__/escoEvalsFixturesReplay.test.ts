import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { correrCaso, instalarGuardas, type GuardasInstaladas } from '../../evals/esco/lib/ejecutor';
import { canonico, casoDeEscenario, crearAdaptadorFixtures, hashFixture, modeloControl, validarPaquete, type PaqueteFixtures } from '../../evals/esco/lib/fixtures';
import type { MensajeLlm } from '@/utils/escoEvals/mensajes';

const pack = JSON.parse(readFileSync('evals/esco/fixtures/synthetic-v1.json', 'utf8')) as PaqueteFixtures;
let guardas: GuardasInstaladas | undefined;
afterEach(() => { guardas?.restaurar(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('synthetic tool fixture replay', () => {
  it('validates hashes, schema and provenance; rejects tampering and duplicate keys', () => {
    expect(() => validarPaquete(pack)).not.toThrow();
    const changed = structuredClone(pack);
    changed.scenarios[0].turns[0].fixtures[0].result = {};
    expect(() => validarPaquete(changed)).toThrow('hash');
    const duplicate = structuredClone(pack);
    duplicate.scenarios[0].turns[0].fixtures.push(duplicate.scenarios[0].turns[0].fixtures[0]);
    duplicate.hashes['SYN-01'] = hashFixture(duplicate.scenarios[0]);
    expect(() => validarPaquete(duplicate)).toThrow('Duplicate fixture key');
    expect(() => validarPaquete({ ...pack, schema: 'unknown' } as unknown as PaqueteFixtures)).toThrow('manifest');
  });
  it('canonicalizes nested object keys while retaining array order and null vs absence', () => {
    expect(canonico({ z: [{ b: 2, a: 1 }], a: false })).toBe(canonico({ a: false, z: [{ a: 1, b: 2 }] }));
    expect(canonico([1, 2])).not.toBe(canonico([2, 1]));
    expect(canonico({})).not.toBe(canonico({ a: null }));
  });
  it('rejects unlisted scenario, turn, tool, arguments, exhausted calls and unused evidence', async () => {
    const errors: string[] = [];
    const adapter = crearAdaptadorFixtures(pack, errors);
    expect(() => adapter.iniciarCaso('ESCO-GS-040')).toThrow('unknown scenario');
    adapter.iniciarCaso('SYN-01');
    expect(() => adapter.iniciarTurno(1)).toThrow('unexpected turn');
    adapter.iniciarTurno(0);
    expect(() => adapter.verificarFin()).toThrow('not consumed');
    await expect(adapter.ejecutar('forget_memory', {})).rejects.toThrow('unmatched');
    const fixture = pack.scenarios[0].turns[0].fixtures[0];
    await expect(adapter.ejecutar(fixture.tool, { ...fixture.args, extra: null })).rejects.toThrow('unmatched');
    const reversed = Object.fromEntries(Object.entries(fixture.args).reverse());
    expect(JSON.parse(await adapter.ejecutar(fixture.tool, reversed))).toEqual(fixture.result);
    expect(() => adapter.verificarFin()).not.toThrow();
    await expect(adapter.ejecutar(fixture.tool, fixture.args)).rejects.toThrow('unmatched');
    expect(errors).toHaveLength(6);
  });
  it('resets scenario state and takes an isolated validated snapshot', async () => {
    const copy = structuredClone(pack);
    const adapter = crearAdaptadorFixtures(copy, []);
    copy.scenarios[0].turns[0].fixtures[0].result = 'mutated';
    for (let i = 0; i < 2; i++) {
      adapter.iniciarCaso('SYN-01'); adapter.iniciarTurno(0);
      const f = pack.scenarios[0].turns[0].fixtures[0];
      expect(JSON.parse(await adapter.ejecutar(f.tool, f.args))).toEqual(f.result);
      adapter.verificarFin();
    }
    adapter.iniciarCaso('SYN-14'); adapter.iniciarTurno(0);
    await expect(adapter.ejecutar('get_financial_summary', pack.scenarios[0].turns[0].fixtures[0].args)).rejects.toThrow('unmatched');
  });

  for (const scenario of pack.scenarios) it(`${scenario.id}: runs production loop, delivers exact evidence, zero network`, async () => {
    const network = vi.fn(() => { throw new Error('Unexpected real network'); });
    vi.stubGlobal('fetch', network);
    vi.stubEnv('OPENROUTER_API_KEY', 'synthetic');
    const errors: string[] = [];
    const messages: MensajeLlm[][] = [];
    guardas = instalarGuardas({ supabaseUrl: 'https://fixture.supabase.co', verboso: false, replay: {
      errores: errors, fixtures: crearAdaptadorFixtures(pack, errors),
      modelo: modeloControl(scenario, m => messages.push(m as MensajeLlm[])),
      lectura: async () => { throw new Error('Tool replay forbids HTTP reads'); },
    } });
    const caso = casoDeEscenario(scenario);
    const result = await correrCaso(caso, caso.question, true, { fijarHora: true, guardas });
    expect(result.error).toBeUndefined();
    expect(result.modo).toBe('frozen');
    expect(result.asOf).toBe('2026-10-28T14:00:00.000Z');
    expect(result.turnos.map(t => t.respuesta)).toEqual(scenario.turns.map(t => t.control_answer));
    scenario.turns.forEach((turn, index) => {
      const finalRequest = messages[index * 2 + 1];
      const payloads = finalRequest.filter(m => m.role === 'tool').map(m => JSON.parse(m.content!));
      expect(payloads.slice(0, turn.fixtures.length)).toEqual(turn.fixtures.map(f => f.result));
      if (turn.duplicate) expect(payloads.at(-1).error).toContain('idéntica');
      if (index > 0) {
        expect(messages[index * 2].some(m => m.role === 'assistant' && m.content === scenario.turns[index - 1].control_answer)).toBe(true);
        expect(messages[index * 2].some(m => m.role === 'system' && m.content?.includes('Datos consultados'))).toBe(true);
      }
    });
    expect(errors).toEqual([]);
    expect(result.escriturasBloqueadas).toEqual([]);
    expect(network).not.toHaveBeenCalled();
  });

  it('rejects an uncontrolled replay date before calling the model', async () => {
    const model = vi.fn();
    guardas = instalarGuardas({ supabaseUrl: 'https://fixture.supabase.co', verboso: false, replay: {
      errores: [], modelo: model, lectura: vi.fn(),
    } });
    const s = pack.scenarios[0];
    const r = await correrCaso(casoDeEscenario(s), s.turns[0].question, true, { fijarHora: false, guardas });
    expect(r.modo).toBe('frozen');
    expect(r.error).toContain('controlled date');
    expect(model).not.toHaveBeenCalled();
  });

  it('fails a real production-loop run on an unexpected tool instead of falling through', async () => {
    const network = vi.fn(() => { throw new Error('No network'); }); vi.stubGlobal('fetch', network);
    vi.stubEnv('OPENROUTER_API_KEY', 'synthetic');
    const errors: string[] = [];
    const s = pack.scenarios[0];
    const altered = structuredClone(s); altered.turns[0].fixtures[0].tool = 'commit_memory_save';
    guardas = instalarGuardas({ supabaseUrl: 'https://fixture.supabase.co', verboso: false, replay: {
      errores: errors, fixtures: crearAdaptadorFixtures(pack, errors), modelo: modeloControl(altered),
      lectura: async () => { throw new Error('No reads'); },
    } });
    const r = await correrCaso(casoDeEscenario(s), s.turns[0].question, true, { fijarHora: true, guardas });
    expect(r.modo).toBe('frozen'); expect(r.error).toContain('unmatched');
    expect(errors).toHaveLength(1); expect(network).not.toHaveBeenCalled();
  });
});
