// Synthetic transport only: protocol validation and source rendering, not model quality.
import { afterEach, describe, expect, it, vi } from 'vitest';
const modulePath = '../supabase/functions/server/chat.tsx';
const { llmToolLoop } = await import(modulePath) as {
  llmToolLoop: (messages: { role: string; content: string }[]) => Promise<{ text: string; toolInteractions: Array<{ result_summary: string }> }>;
};
const MODEL = 'https://openrouter.ai/api/v1/chat/completions';
const DB = 'https://terminal-fixture.invalid';
const QUESTION = 'Resume los registros consultados del 2034-05-01 al 2034-05-30.';
const FALSE_PROSE = 'SYN_TERMINAL_FALSE_PROSE: no hubo registros y se pagaron 87654321 COP.';
const RAW_NOTE = 'SYN_TERMINAL_RAW_NOTE';
const badContent: unknown[] = ['', ' \n\t ', null, undefined, 0, 87, [], { text: 'not protocol text' }];
const tool = (index: number, content: unknown) => ({ role: 'assistant', content, tool_calls: [{
  id: `synthetic-${index}`, type: 'function', function: { name: 'get_hato_partos',
    arguments: JSON.stringify({ date_from: '1999-01-01', date_to: '2039-12-31' }) },
}] });
function fixture(content: unknown, calls: number, unavailable = false, firstChoice: unknown = 'required', empty = false) {
  let models = 0;
  const unexpected: string[] = [];
  const bodies: unknown[] = [];
  const inherited = vi.fn(async (): Promise<Response> => { throw Error('Inherited network forbidden'); });
  vi.stubGlobal('fetch', inherited);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.stubGlobal('Deno', { env: { get: (key: string) => {
    if (key === 'SUPABASE_URL') return DB;
    if (['SUPABASE_SERVICE_ROLE_KEY', 'OPENROUTER_API_KEY'].includes(key)) return 'synthetic-placeholder';
    unexpected.push(`env:${key}`); throw Error('Unexpected synthetic environment key');
  } } });
  const requests: { url: string; method: string }[] = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const r = new Request(input, init); requests.push({ url: r.url, method: r.method });
    if (r.url === MODEL && r.method === 'POST') {
      const body = JSON.parse(await r.text()); bodies.push(body);
      expect(body.tool_choice).toEqual(models === 3 ? 'none' : models === 0 ? firstChoice : 'auto');
      const message = models < calls ? tool(models, content) : { role: 'assistant', content };
      models++;
      return Response.json({ choices: [{ finish_reason: 'tool_calls' in message ? 'tool_calls' : 'stop', message }] });
    }
    const u = new URL(r.url);
    if (u.origin === DB && r.method === 'GET' && ['/rest/v1/hato_animales', '/rest/v1/hato_eventos'].includes(u.pathname)) {
      if (unavailable) return Response.json({ message: 'SYN_TERMINAL_SOURCE_ERROR ' + RAW_NOTE }, { status: 503 });
      const rows = empty ? [] : u.pathname.endsWith('/hato_eventos')
        ? [{ id: 'event-terminal', animal_id: 'animal-terminal', tipo: 'parto', fecha: '2034-05-20', datos: { note: RAW_NOTE } }]
        : [{ id: 'animal-terminal', numero: 87, nombre: 'MADRE TERMINAL SINTETICA', estado: 'activa' }];
      if (u.pathname.endsWith('/hato_eventos')) expect(u.searchParams.getAll('fecha')).toEqual(['gte.2034-05-01', 'lte.2034-05-30']);
      return Response.json(rows, { headers: { 'content-range': rows.length ? '0-0/1' : '*/0' } });
    }
    unexpected.push(`${r.method} ${r.url}`); throw Error('Unmatched synthetic request');
  });
  return { requests, bodies, unexpected, inherited, count: () => models };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function closed(f: ReturnType<typeof fixture>) {
  expect(f.unexpected).toEqual([]); expect(f.inherited).not.toHaveBeenCalled();
}
describe('Esco protocol validation and deterministic source completion', () => {
  it.each(badContent.map((content, index) => ({ content, index })))('rejects malformed/empty terminal protocol $index with zero tool rounds', async ({ content }) => {
    const f = fixture(content, 0);
    await expect(llmToolLoop([{ role: 'user', content: QUESTION }])).rejects.toThrow(/No pude completar la consulta/);
    expect(f.count()).toBe(1); expect(f.requests).toHaveLength(1); closed(f);
  });
  it('does not publish plausible nonempty model claims without source evidence', async () => {
    const f = fixture(FALSE_PROSE, 0);
    const result = await llmToolLoop([{ role: 'user', content: QUESTION }]);
    expect(result.text).toContain('No pude verificar');
    expect(result.text).not.toContain(FALSE_PROSE); expect(result.text).not.toContain('87654321');
    expect(result.toolInteractions).toEqual([]); expect(f.count()).toBe(1); closed(f);
  });
  it.each(badContent.map((content, index) => ({ content, index })))('renders known fresh source facts despite malformed tool-call prose $index, without another generation', async ({ content }) => {
    const f = fixture(content, 1);
    const result = await llmToolLoop([{ role: 'user', content: QUESTION }]);
    expect(result.text).toContain('MADRE TERMINAL SINTETICA'); expect(result.text).toContain('2034-05-20');
    expect(result.text.trim()).not.toBe('');
    expect(JSON.stringify(result)).not.toContain(RAW_NOTE);
    expect(JSON.parse(result.toolInteractions[0].result_summary)).toMatchObject({ _evidencia: { consulta_completa: true }, resumen: { total_eventos: 1 } });
    expect(f.count()).toBe(1); expect(f.requests).toHaveLength(3); closed(f);
  });
  it.each([1, 3])('does not reach model prose or free fallback after fresh evidence (scripted rounds: %s)', async calls => {
    const f = fixture(FALSE_PROSE, calls);
    const result = await llmToolLoop([{ role: 'user', content: QUESTION }]);
    expect(result.text).toContain('MADRE TERMINAL SINTETICA');
    expect(result.text).not.toContain(FALSE_PROSE); expect(result.text).not.toContain('87654321');
    expect(f.count()).toBe(1); closed(f);
  });
  it('renders verified empty results as bounded records instead of accepting model global absence', async () => {
    const f = fixture(FALSE_PROSE, 1, false, 'required', true);
    const result = await llmToolLoop([{ role: 'user', content: QUESTION }]);
    expect(result.text).toContain('Total de registros verificados: 0');
    expect(result.text).toContain('bajo esos filtros'); expect(result.text).not.toContain(FALSE_PROSE);
    expect(f.count()).toBe(1); closed(f);
  });
  it('returns a safe explicit limit after source failure without another model call or raw diagnostic', async () => {
    const f = fixture(FALSE_PROSE, 1, true);
    const result = await llmToolLoop([{ role: 'user', content: QUESTION }]);
    expect(result.text).toContain('No pude verificar'); expect(result.text).not.toContain(FALSE_PROSE);
    expect(JSON.stringify(result)).not.toMatch(/SYN_TERMINAL_SOURCE_ERROR|SYN_TERMINAL_RAW_NOTE/);
    expect(JSON.parse(result.toolInteractions[0].result_summary)).toMatchObject({ error: 'source_unavailable', requiere_reconsulta: true, _evidencia: { consulta_completa: false } });
    expect(f.requests.some(r => r.url.startsWith(DB))).toBe(true); expect(f.count()).toBe(1); closed(f);
  });
  it('keeps incomplete-birth evidence unavailable when the same model message has empty content', async () => {
    const f = fixture('', 1, true, { type: 'function', function: { name: 'get_hato_partos' } });
    const result = await llmToolLoop([{ role: 'user', content: '¿Qué partos hubo del 2034-05-01 al 2034-05-30?' }]);
    expect(result.text).toContain('No pude verificar');
    expect(result.text).not.toContain('No hay partos'); expect(f.count()).toBe(1); closed(f);
  });
  it('does not let prior prose substitute for a malformed zero-source current answer', async () => {
    const f = fixture('', 0);
    await expect(llmToolLoop([
      { role: 'user', content: 'Pregunta sintética anterior.' },
      { role: 'assistant', content: 'SYN_PREVIOUS_TERMINAL_87' },
      { role: 'user', content: QUESTION },
    ])).rejects.toThrow(/No pude completar la consulta/);
    expect(JSON.stringify(f.bodies)).not.toContain('SYN_PREVIOUS_TERMINAL_87');
    expect(f.count()).toBe(1); expect(f.requests).toHaveLength(1); closed(f);
  });
});
