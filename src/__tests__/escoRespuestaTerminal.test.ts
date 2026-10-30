// Synthetic transport only: this tests completion boundaries, not model quality.
import { afterEach, describe, expect, it, vi } from 'vitest';
const modulePath = '../supabase/functions/server/chat.tsx';
const { llmToolLoop } = await import(modulePath) as {
  llmToolLoop: (messages: { role: string; content: string }[]) => Promise<{ text: string }>;
};
const MODEL = 'https://openrouter.ai/api/v1/chat/completions';
const DB = 'https://terminal-fixture.invalid';
const badContent: unknown[] = ['', ' \n\t ', null, undefined, 0, 87, [], { text: 'not protocol text' }];
const tool = (index: number) => ({ role: 'assistant', content: null, tool_calls: [{
  id: `synthetic-${index}`, type: 'function', function: { name: 'get_hato_partos',
    arguments: JSON.stringify({ date_from: `2031-05-0${index + 1}`, date_to: '2031-05-30' }) },
}] });
function fixture(content: unknown, calls: number, unavailable = false, firstChoice: unknown = 'required') {
  let models = 0;
  const unexpected: string[] = [];
  vi.stubGlobal('Deno', { env: { get: (key: string) => {
    if (key === 'SUPABASE_URL') return DB;
    if (['SUPABASE_SERVICE_ROLE_KEY', 'OPENROUTER_API_KEY'].includes(key)) return 'synthetic-placeholder';
    throw Error('Unexpected synthetic environment key');
  } } });
  const requests: { url: string; method: string }[] = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const r = new Request(input, init); requests.push({ url: r.url, method: r.method });
    if (r.url === MODEL && r.method === 'POST') {
      const body = JSON.parse(await r.text());
      expect(body.tool_choice).toEqual(models === 3 ? 'none' : models === 0 ? firstChoice : 'auto');
      const message = models < calls ? tool(models) : { role: 'assistant', content };
      models++;
      return Response.json({ choices: [{ finish_reason: 'tool_calls' in message ? 'tool_calls' : 'stop', message }] });
    }
    const u = new URL(r.url);
    if (u.origin === DB && r.method === 'GET' && ['/rest/v1/hato_animales', '/rest/v1/hato_eventos'].includes(u.pathname)) {
      return unavailable ? Response.json({ message: 'synthetic unavailable' }, { status: 503 })
        : Response.json([], { headers: { 'content-range': '*/0' } });
    }
    unexpected.push(`${r.method} ${r.url}`); throw Error('Unmatched synthetic request');
  });
  return { requests, unexpected, count: () => models };
}
afterEach(() => { vi.unstubAllGlobals(); });
describe('Esco terminal text is a nonempty protocol string', () => {
  for (const calls of [0, 1, 3]) {
    it.each(badContent.map((content, index) => ({ content, index })))('rejects malformed/empty answer $index after ' + calls + ' tool rounds', async ({ content }) => {
      const f = fixture(content, calls);
      await expect(llmToolLoop([{ role: 'user', content: 'Resume los registros consultados.' }])).rejects.toThrow(/No pude completar la consulta/);
      expect(f.count()).toBe(calls + 1); expect(f.unexpected).toEqual([]);
      expect(f.requests).toHaveLength(calls * 3 + 1);
    });
    it('preserves valid nonempty content unchanged after ' + calls + ' tool rounds', async () => {
      const text = '  No encontré registros dentro del período consultado.\n';
      const f = fixture(text, calls);
      expect((await llmToolLoop([{ role: 'user', content: 'Resume los registros consultados.' }])).text).toBe(text);
      expect(f.count()).toBe(calls + 1); expect(f.unexpected).toEqual([]);
    });
  }
  it('preserves an explicit limitation after unavailable synthetic evidence', async () => {
    const text = 'No pude verificar los registros porque la consulta falló.';
    const f = fixture(text, 1, true);
    expect((await llmToolLoop([{ role: 'user', content: 'Resume los registros consultados.' }])).text).toBe(text);
    expect(f.count()).toBe(2); expect(f.unexpected).toEqual([]);
  });
  it('keeps the existing incomplete-birth-evidence guard ahead of terminal validation', async () => {
    const f = fixture('', 1, true, { type: 'function', function: { name: 'get_hato_partos' } });
    expect((await llmToolLoop([{ role: 'user', content: '¿Qué partos hubo en mayo?' }])).text).toContain('No pude verificar');
    expect(f.count()).toBe(2); expect(f.unexpected).toEqual([]);
  });
  it('does not let prior prose substitute for a missing new answer', async () => {
    const f = fixture('', 1);
    await expect(llmToolLoop([
      { role: 'user', content: 'Pregunta sintética anterior.' },
      { role: 'assistant', content: 'Respuesta anterior sintética 87.' },
      { role: 'user', content: 'Resume los registros consultados.' },
    ])).rejects.toThrow(/No pude completar la consulta/);
    expect(f.count()).toBe(2); expect(f.unexpected).toEqual([]);
  });
});
