import { afterEach, describe, expect, it, vi } from 'vitest';
import { cargarEsco, correrCaso, instalarGuardas, type GuardasInstaladas } from '../../evals/esco/lib/ejecutor';
import { casoBase } from './escoEvalsFixtures';

const fetchOriginal = globalThis.fetch;
const SUPABASE = 'https://farm.supabase.co';
let guardas: GuardasInstaladas | undefined;
afterEach(() => {
  guardas?.restaurar();
  guardas = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function instalar(fetchImpl: typeof fetch) {
  vi.stubGlobal('fetch', fetchImpl);
  guardas = instalarGuardas({ supabaseUrl: SUPABASE, verboso: false });
  return guardas;
}

function respuestaLlm(message: object) {
  return new Response(JSON.stringify({ choices: [{ message }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
}

describe('Esco eval: runtime and read-only guard', () => {
  it('loads the actual production tool loop under Vitest', async () => {
    instalar(vi.fn());
    const esco = await cargarEsco();
    expect(typeof esco.llmToolLoop).toBe('function');
    expect(typeof esco.getSystemPrompt([])).toBe('string');
  });

  it('blocks writes using strings, URLs and Request methods before network I/O', async () => {
    const red = vi.fn();
    const g = instalar(red);
    const requests: [RequestInfo | URL, RequestInit?][] = [
      [`${SUPABASE}/rest/v1/esco_memorias`, { method: 'POST' }],
      [new URL(`${SUPABASE}/rest/v1/esco_memorias`), { method: 'PATCH' }],
      [new Request(`${SUPABASE}/rest/v1/esco_memorias`, { method: 'DELETE' })],
      [`${SUPABASE}/rest/v1/rpc/mutate`, { method: 'POST' }],
    ];
    for (const [input, init] of requests) expect((await fetch(input, init)).status).toBe(403);
    expect(g.escrituras).toHaveLength(4);
    expect(red).not.toHaveBeenCalled();
  });

  it('allows reads, rejects redirects and restores fetch after the run', async () => {
    const red = vi.fn(async () => new Response('[]'));
    const g = instalar(red);
    await fetch(`${SUPABASE}/rest/v1/lotes`);
    await fetch(`${SUPABASE}/rest/v1/lotes`, { method: 'HEAD' });
    expect(red).toHaveBeenCalledTimes(2);
    expect(red.mock.calls[0]).toEqual([`${SUPABASE}/rest/v1/lotes`, { redirect: 'error' }]);
    g.restaurar();
    expect(globalThis.fetch).toBe(fetchOriginal);
  });

  it('runs the actual tool loop with the original clock and counts tokens', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-only');
    vi.stubEnv('SUPABASE_URL', SUPABASE);
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only');
    const prompts: string[] = [];
    const red = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      prompts.push(String(init?.body));
      await new Promise((resolve) => setTimeout(resolve, 5));
      return respuestaLlm({ role: 'assistant', content: 'No hubo datos.' });
    });
    const g = instalar(red);
    const corrida = await correrCaso(casoBase(), '¿Cuándo?', true, { fijarHora: true, guardas: g });
    expect(corrida.error).toBeUndefined();
    expect(corrida.asOf).toBe('2026-08-16T22:01:00.000Z');
    expect(corrida.turnos[0].respuesta).toBe('No hubo datos.');
    expect(corrida.turnos[0].ms).toBeGreaterThan(0);
    expect(corrida.tokens).toEqual({ entrada: 10, salida: 5 });
    expect(prompts[0]).toContain('2026-08-16');
    expect(vi.isFakeTimers()).toBe(false);
  });

  it('blocks a memory write requested by the actual tool loop', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-only');
    vi.stubEnv('SUPABASE_URL', SUPABASE);
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only');
    let round = 0;
    const red = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).startsWith(SUPABASE)) return new Response(JSON.stringify([{ id: 'test', content: 'prueba' }]));
      round++;
      if (round === 1) return respuestaLlm({ role: 'assistant', content: null, tool_calls: [{
        id: 'proposal', type: 'function', function: { name: 'propose_memory_save', arguments: JSON.stringify({ content: 'Recordar prueba', tags: [] }) },
      }] });
      if (round === 2) return respuestaLlm({ role: 'assistant', content: null, tool_calls: [{
        id: 'forget', type: 'function', function: { name: 'forget_memory', arguments: JSON.stringify({ memory_id: 'test' }) },
      }] });
      return respuestaLlm({ role: 'assistant', content: 'No pude borrar la memoria.' });
    });
    const g = instalar(red);
    const corrida = await correrCaso(casoBase(), 'Olvida esa memoria', false, { fijarHora: false, guardas: g });
    expect(corrida.error).toBeUndefined();
    expect(corrida.escriturasBloqueadas).toHaveLength(1);
    expect(corrida.escriturasBloqueadas[0]).toContain('PATCH');
    expect(red).toHaveBeenCalledTimes(4); // Three LLM calls and one DB read; no DB write.
    expect(corrida.turnos[0].herramientas.some((h) => h.tool === 'forget_memory' && h.error)).toBe(true);
  });

  it('captures infrastructure errors and restores the clock', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-only');
    const g = instalar(vi.fn(async () => { throw new Error('offline'); }));
    const corrida = await correrCaso(casoBase(), 'Hola', false, { fijarHora: true, guardas: g });
    expect(corrida.error).toBe('offline');
    expect(vi.isFakeTimers()).toBe(false);
  });

  it('preserves prior context and follow-up questions in a multi-turn run', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-only');
    const bodies: { messages: { role: string; content: string }[] }[] = [];
    const g = instalar(vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return respuestaLlm({ role: 'assistant', content: bodies.length === 1 ? '¿Cuál animal?' : 'Ficha de 183.' });
    }));
    const caso = casoBase({
      channel: 'Telegram',
      prior_context: [{ rn: 1, user: 'Contexto inicial', assistant_original: 'Entendido' }],
      followup_turns: [{ rn: 3, user: '183' }],
    });
    const r = await correrCaso(caso, 'Una paráfrasis', true, { fijarHora: true, guardas: g });
    expect(r.error).toBeUndefined();
    expect(r.turnos).toHaveLength(2);
    expect(bodies[0].messages[0].content).toContain('Telegram');
    expect(bodies[0].messages[1].content).toBe('Contexto inicial');
    expect(bodies[1].messages.at(-1)?.content).toBe('183');
    expect(bodies[1].messages.some((m) => m.role === 'assistant' && m.content === '¿Cuál animal?')).toBe(true);
    expect(r.tokens).toEqual({ entrada: 20, salida: 10 });
  });
});
