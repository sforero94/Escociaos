import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateToolRound } from '../../supabase/functions/make-server-1ccce916/esco-tool-request';
const path = '../supabase/functions/server/chat.tsx';
const { llmToolLoop } = await import(path) as { llmToolLoop: (messages: Array<{ role: string; content: string }>) => Promise<unknown> };
const call = (args = '{}') => ({ id: 'call-1', type: 'function', function: { name: 'get_lot_info', arguments: args } });
afterEach(() => vi.unstubAllGlobals());
describe('complete model tool round validation', () => {
  it('accepts bounded object arguments and the inclusive 8-call round boundary', () => {
    const calls = Array.from({ length: 8 }, (_, i) => ({ ...call(), id: `call-${i}` }));
    expect(validateToolRound(calls, new Set(['get_lot_info']), 16)).toHaveLength(8);
    expect(() => validateToolRound(calls, new Set(['get_lot_info']), 17)).toThrow();
  });
  it.each(['null', '[]', 'invalid', '"text"'])('refuses invalid args %s rather than running an empty query', args => {
    expect(() => validateToolRound([call(args)], new Set(['get_lot_info']), 0)).toThrow();
  });
  it('rejects oversized argument bytes and repeated call IDs', () => {
    expect(() => validateToolRound([call(JSON.stringify({ q: 'é'.repeat(8192) }))], new Set(['get_lot_info']), 0)).toThrow();
    expect(() => validateToolRound([call(), call()], new Set(['get_lot_info']), 0)).toThrow();
  });
  it.each([
    [call(), { ...call(), id: 'call-2', function: { name: 'invented_write', arguments: '{}' } }],
    [call(), { ...call('['), id: 'call-2' }],
    Array.from({ length: 9 }, (_, i) => ({ ...call(), id: `call-${i}` })),
    'malformed-list',
  ])('refuses the real LLM round before any valid earlier tool can execute', async tool_calls => {
    vi.stubGlobal('Deno', { env: { get: () => 'fixture-key' } });
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (!String(input).includes('openrouter.ai')) throw Error('Unexpected domain request');
      return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', tool_calls } }] }));
    });
    vi.stubGlobal('fetch', fetcher);
    await expect(llmToolLoop([{ role: 'user', content: 'Consulta sintética' }])).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(String(fetcher.mock.calls[0][0])).toContain('openrouter.ai');
  });
});
