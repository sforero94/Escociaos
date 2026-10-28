import { afterEach, describe, expect, it, vi } from 'vitest';
import { correrCaso, instalarGuardas, type GuardasInstaladas, type TransporteCongelado } from '../../evals/esco/lib/ejecutor';
import { casoBase } from './escoEvalsFixtures';

let guardas: GuardasInstaladas | undefined;
afterEach(() => {
  guardas?.restaurar();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const provider = 'https://openrouter.ai/api/v1/chat/completions';
const database = 'https://fixture.supabase.co';
function setup() {
  const red = vi.fn(() => { throw new Error('Network must never run'); });
  vi.stubGlobal('fetch', red);
  vi.stubEnv('SUPABASE_URL', database);
  vi.stubEnv('OPENROUTER_API_KEY', 'synthetic');
  const replay: TransporteCongelado = {
    errores: [],
    modelo: vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Synthetic control' } }] }))),
    lectura: vi.fn(async () => { throw new Error('Unmatched fixture'); }),
  };
  guardas = instalarGuardas({ supabaseUrl: database, verboso: false, replay });
  return { red, replay, guardas };
}

describe('frozen HTTP transport foundation (synthetic controls)', () => {
  it('runs the actual production loop with a mock model and controlled date without network', async () => {
    const { red, replay, guardas: g } = setup();
    const r = await correrCaso(casoBase(), 'Control', false, { fijarHora: true, guardas: g });
    expect(r.error).toBeUndefined();
    expect(r.turnos[0].respuesta).toBe('Synthetic control');
    expect(r.asOf).toBe('2026-08-16T22:01:00.000Z');
    expect(replay.modelo).toHaveBeenCalledOnce();
    expect(red).not.toHaveBeenCalled();
  });
  it('invalidates a run when a production tool catches an unmatched read', async () => {
    const { replay, guardas: g, red } = setup();
    let round = 0;
    replay.modelo = async () => new Response(JSON.stringify({ choices: [{ message: round++ === 0
      ? { role: 'assistant', content: null, tool_calls: [{ id: 'call', type: 'function', function: {
        name: 'get_hato_partos', arguments: JSON.stringify({ date_from: '2026-08-01', date_to: '2026-08-16' }),
      } }] }
      : { role: 'assistant', content: 'No data' } }] }));
    const result = await correrCaso(casoBase(), 'Consulta', false, { fijarHora: true, guardas: g });
    expect(result.error).toContain('Frozen replay invalid');
    expect(replay.errores.length).toBeGreaterThan(0);
    expect(red).not.toHaveBeenCalled();
  });
  it('rejects unmatched database, external and lookalike provider reads with sticky diagnostics', async () => {
    const { red, replay } = setup();
    for (const url of [`${database}/rest/v1/lotes`, 'https://weather.test/data', `${provider}?unexpected=1`]) {
      await expect(fetch(url)).rejects.toThrow('Frozen transport rejected');
    }
    expect(replay.errores).toHaveLength(3);
    expect(replay.modelo).not.toHaveBeenCalled();
    expect(red).not.toHaveBeenCalled();
  });
  it('blocks database and external writes and rejects fixture redirects', async () => {
    const { red, replay, guardas: g } = setup();
    expect((await fetch(`${database}/rest/v1/table`, { method: 'POST' })).status).toBe(403);
    expect(g.escrituras).toHaveLength(1);
    await expect(fetch('https://external.test/save', { method: 'POST' })).rejects.toThrow();
    replay.lectura = async () => new Response(null, { status: 302, headers: { location: database } });
    await expect(fetch('https://fixture.test/read')).rejects.toThrow();
    expect(red).not.toHaveBeenCalled();
  });
  it('uses only explicit fixture responses and does not reuse another installation state', async () => {
    const first = setup();
    first.replay.lectura = async () => new Response('[1]');
    expect(await (await fetch(`${database}/read`)).json()).toEqual([1]);
    first.guardas.restaurar();
    const second = setup();
    await expect(fetch(`${database}/read`)).rejects.toThrow();
    expect(first.replay.errores).toEqual([]);
    expect(second.replay.errores).toHaveLength(1);
    expect(second.red).not.toHaveBeenCalled();
  });
});
