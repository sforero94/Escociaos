// Synthetic temporal binding tests against the real shared loop. No external HTTP.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mensajesDesdeHistorial, type MensajeLlm } from '@/utils/escoEvals/mensajes';

const DB = 'https://time-loop-fixture.invalid';
const PROVIDER = 'https://openrouter.ai/api/v1/chat/completions';
const FAKE_PROSE = 'SYN_TIME_UNVERIFIED_PROSE total 999999 COP para cualquier fecha.';
const OLD_TEXT = 'SYN_TIME_ASSISTANT_UNTRUSTED_445566';
// Optional explicit local test target: audit an integrator worktree read-only without
// copying its runtime or changing this portable test's default relative import.
const configuredRuntime = process.env.ESCO_TIEMPO_RUNTIME;
const runtimeFile = configuredRuntime ? resolve(configuredRuntime) : resolve(process.cwd(), 'src/supabase/functions/server/chat.tsx');
type Period = { from: string; to: string };
type Message = MensajeLlm & { id?: string; created_at?: string };
interface LoopResult { text: string; toolInteractions: Array<{ tool: string; args: Record<string, unknown>; result_summary: string }> }
interface ProbeOptions {
  channel: 'Web' | 'Telegram'; question: string; now?: string; expected?: Period;
  previous?: { question: string; created_at?: string };
  authoritativeCurrentMissingFromHistory?: boolean;
  omitCurrentMessageId?: boolean;
  historyOverride?: Message[];
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

async function probe(options: ProbeOptions) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(options.now ?? '2034-05-10T17:00:00Z'));
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const requests: Array<{ messages?: Message[] }> = [];
  const reads: URL[] = [];
  const rejected: string[] = [];
  const inherited = vi.fn(async (): Promise<Response> => { throw new Error('Inherited network forbidden'); });
  vi.stubGlobal('fetch', inherited);
  const env: Record<string, string> = { SUPABASE_URL: DB, SUPABASE_SERVICE_ROLE_KEY: 'synthetic-db', OPENROUTER_API_KEY: 'synthetic-model' };
  vi.stubGlobal('Deno', { env: { get: (key: string) => {
    if (!Object.prototype.hasOwnProperty.call(env, key)) { rejected.push(`env:${key}`); throw new Error('Closed synthetic environment'); }
    return env[key];
  } } });
  const observedDate = options.expected?.from ?? '2034-05-02';
  const rows = [
    { id: 'work-a', fecha_trabajo: observedDate, lote_id: 'lot-a', fraccion_jornal: '1', costo_jornal: '80.25', lote: { nombre: 'Lote sintético A' } },
    { id: 'work-b', fecha_trabajo: options.expected?.to ?? observedDate, lote_id: 'lot-b', fraccion_jornal: '1', costo_jornal: '210.75', lote: { nombre: 'Lote sintético B' } },
    { id: 'outside-period', fecha_trabajo: '1999-01-01', lote_id: 'outside-lot', fraccion_jornal: '1', costo_jornal: '888888', lote: { nombre: 'SYN_OUTSIDE_REQUEST_PERIOD' } },
  ];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (request.url === PROVIDER && request.method === 'POST') {
      requests.push(JSON.parse(await request.text()));
      if (requests.length > 5) { rejected.push('provider-budget'); throw new Error('Closed provider budget'); }
      // The model proposes deliberately wrong broad dates. Server-resolved user dates,
      // not model arguments or prior assistant numbers, must bind the actual source read.
      return Response.json({ choices: [{ message: requests.length === 1 ? { role: 'assistant', content: null, tool_calls: [{
        id: 'wrong-model-period', type: 'function', function: { name: 'get_labor_summary',
          arguments: JSON.stringify({ date_from: '1999-01-01', date_to: '2039-12-31' }) },
      }] } : { role: 'assistant', content: FAKE_PROSE } }] });
    }
    if (url.origin !== DB || request.method !== 'GET' || url.hash || url.pathname !== '/rest/v1/registros_trabajo') {
      rejected.push(`${request.method} ${url.origin}${url.pathname}`); throw new Error('Closed synthetic HTTP route');
    }
    reads.push(url);
    const from = url.searchParams.get('fecha_trabajo');
    const filters = url.searchParams.getAll('fecha_trabajo');
    const filtered = rows.filter(row => filters.every(filter => filter.startsWith('gte.') ? row.fecha_trabajo >= filter.substring(4) :
      filter.startsWith('lte.') ? row.fecha_trabajo <= filter.substring(4) : false));
    if (!from) { rejected.push('unbounded-work-read'); throw new Error('Unbounded synthetic source'); }
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const page = filtered.slice(offset, offset + Number(url.searchParams.get('limit') ?? 200));
    return Response.json(page, { headers: { 'content-range': page.length ? `${offset}-${offset + page.length - 1}/${filtered.length}` : `*/${filtered.length}` } });
  });
  const history: Parameters<typeof mensajesDesdeHistorial>[0][number][] = [];
  if (options.previous) history.push({ role: 'user', content: options.previous.question }, { role: 'assistant', content: `${OLD_TEXT}: 1970-01-01 al 1970-01-31; costo 445566.` });
  if (!options.authoritativeCurrentMissingFromHistory) history.push({ role: 'user', content: options.question });
  const messages: Message[] = options.historyOverride ?? mensajesDesdeHistorial(history, 'Sistema sintético sin contexto externo.', options.channel);
  const currentMessageId = 'synthetic-server-current-message';
  messages.forEach((message, index) => { message.id ??= `synthetic-server-history-${index}`; });
  if (!options.authoritativeCurrentMissingFromHistory) {
    const current = [...messages].reverse().find(message => message.role === 'user');
    if (current) current.id = currentMessageId;
  }
  if (options.previous?.created_at) {
    const previous = messages.find(m => m.role === 'user' && m.content === options.previous!.question);
    if (previous) previous.created_at = options.previous.created_at;
  }
  const events: unknown[] = [];
  const modulePath = configuredRuntime ?? '../supabase/functions/server/chat.tsx';
  const { llmToolLoop } = await import(modulePath) as {
    llmToolLoop: (messages: Message[], user: string, onEvent: (event: unknown) => void, cohort?: unknown, current?: { pregunta: string; messageId?: string }) => Promise<LoopResult>;
  };
  const result = await llmToolLoop(messages, 'synthetic-user', event => events.push(structuredClone(event)), undefined,
    { pregunta: options.question, ...(!options.omitCurrentMessageId ? { messageId: currentMessageId } : {}) });
  expect(rejected, 'every request ended inside the closed synthetic transport').toEqual([]);
  expect(inherited).not.toHaveBeenCalled();
  for (const body of requests) expect(JSON.stringify(body), 'old assistant text must not enter any provider request').not.toContain(OLD_TEXT);
  expect(JSON.stringify(result)).not.toContain(OLD_TEXT);
  expect(result.text).not.toContain(FAKE_PROSE);
  return { result, reads, requests, events };
}

function boundToUser(r: Awaited<ReturnType<typeof probe>>, expected: Period) {
  expect(r.reads.length, 'supported fresh source query executed').toBeGreaterThan(0);
  for (const url of r.reads) {
    expect(url.searchParams.getAll('fecha_trabajo')).toEqual([`gte.${expected.from}`, `lte.${expected.to}`]);
  }
  expect(JSON.stringify(r.requests[0]), 'FIRST model request receives only a server date hint').toContain(expected.from);
  expect(JSON.stringify(r.requests[0])).toContain(expected.to);
  expect(r.result.text).toMatch(/80[.,]25/);
  expect(r.result.text).toMatch(/210[.,]75/);
  expect(JSON.stringify(r.result)).not.toMatch(/888888|SYN_OUTSIDE_REQUEST_PERIOD/);
  expect(r.events.some(event => (event as { type?: string }).type === 'tool_done')).toBe(true);
}

describe('actual shared-loop temporal context with closed synthetic HTTP', () => {
  it.each(['Web', 'Telegram'] as const)('binds current ISO user dates instead of the model broad period on %s', async channel => {
    const expected = { from: '2034-05-01', to: '2034-05-07' };
    const r = await probe({ channel, question: 'Jornales y costo registrado por lote del 2034-05-01 al 2034-05-07.', expected });
    boundToUser(r, expected);
  });
  it.each([
    ['2034-01-01T04:59:59Z', 'hoy', '2033-12-31', '2033-12-31'],
    ['2034-01-01T05:00:00Z', 'hoy', '2034-01-01', '2034-01-01'],
    ['2034-01-02T17:00:00Z', 'semana pasada', '2033-12-26', '2034-01-01'],
  ])('anchors current relative user dates at the Bogotá boundary %s: %s', async (now, expression, from, to) => {
    const expected = { from, to };
    boundToUser(await probe({ channel: 'Telegram', now, question: `Jornales y costos por lote ${expression}.`, expected }), expected);
  });
  it.each(['Web', 'Telegram'] as const)('uses the prior USER server timestamp for a relative follow-up on %s', async channel => {
    const expected = { from: '2034-04-01', to: '2034-04-05' };
    const r = await probe({ channel, question: '¿Y el costo por lote?', expected,
      previous: { question: 'Jornales registrados por lote este mes.', created_at: '2034-04-05T17:00:00Z' } });
    boundToUser(r, expected);
  });
  it.each(['Jornales por lote este mes.', 'Jornales por lote esta semana del año 2034.'])('does not rebase a prior relative period when its server timestamp is missing: %s', async question => {
    const r = await probe({ channel: 'Telegram', question: '¿Y el costo por lote?', previous: { question } });
    expect(r.reads).toEqual([]);
    expect(r.result.text.trim()).not.toBe('');
  });
  it('rejects an invalid previous server timestamp instead of using the current day', async () => {
    const r = await probe({ channel: 'Web', question: '¿Y el costo por lote?',
      previous: { question: 'Jornales por lote este mes.', created_at: 'invalid-synthetic-timestamp' } });
    expect(r.reads).toEqual([]);
  });
  it.each(['Web', 'Telegram'] as const)('does not inherit a previous relative period without current server message identity on %s', async channel => {
    const r = await probe({ channel, question: '¿Y el costo por lote?', omitCurrentMessageId: true,
      previous: { question: 'Jornales registrados por lote este mes.', created_at: '2034-04-05T17:00:00Z' } });
    expect(r.reads).toEqual([]);
    expect(r.result.text.trim()).not.toBe('');
  });
  it.each(['Web', 'Telegram'] as const)('uses the authoritative fifth-argument question when fresh history is absent on %s', async channel => {
    const expected = { from: '2034-05-01', to: '2034-05-07' };
    const r = await probe({ channel, expected, authoritativeCurrentMissingFromHistory: true,
      question: 'Jornales y costos por lote del 2034-05-01 al 2034-05-07.',
      previous: { question: 'Jornales por lote del 2034-04-01 al 2034-04-07.', created_at: '2034-04-08T17:00:00Z' } });
    boundToUser(r, expected);
  });
  it.each([false, true])('does not identify a missing fresh follow-up by an identical older USER string (missing ID: %s)', async omitCurrentMessageId => {
    const expected = { from: '2034-04-01', to: '2034-04-05' };
    const question = '¿Y el costo por lote?';
    const r = await probe({ channel: 'Web', question, expected, omitCurrentMessageId, authoritativeCurrentMissingFromHistory: true, historyOverride: [
      { role: 'system', content: 'Sistema sintético.' },
      { role: 'user', content: 'Jornales por lote del 2034-03-01 al 2034-03-07.', created_at: '2034-03-08T17:00:00Z' },
      { role: 'assistant', content: OLD_TEXT },
      { role: 'user', content: question, created_at: '2034-03-08T17:01:00Z' },
      { role: 'assistant', content: OLD_TEXT },
      { role: 'user', content: 'Jornales registrados por lote este mes.', created_at: '2034-04-05T17:00:00Z' },
      { role: 'assistant', content: OLD_TEXT },
    ] });
    expect(JSON.stringify(r.requests[0]), 'a repeated string is not the current turn identity').not.toContain('2034-03-01');
    if (omitCurrentMessageId) expect(r.reads).toEqual([]);
    else if (r.reads.length) boundToUser(r, expected);
    else expect(r.result.text.trim()).not.toBe(''); // Safe unavailable is acceptable without trusted current-turn identity.
  });
  it.each(['Costos por lote del 2034-05-01 al 2034-05-07 o del 2034-06-01 al 2034-06-07.',
    'Costos por lote del 2034-05-07 al 2034-05-01.', 'Costo registrado por lote.'])('refuses only an unresolved temporal scope without a model-date fallback: %s', async question => {
    const r = await probe({ channel: 'Web', question });
    expect(r.reads).toEqual([]);
    expect(r.result.text.trim()).not.toBe('');
  });
});

describe('source wiring for channel-owned current question and historical timestamps', () => {
  it('Web passes the actual current request separately from its historical message window', () => {
    const source = readFileSync(runtimeFile, 'utf8');
    const handler = source.substring(source.indexOf('export async function handleChatMessage'));
    const call = /await llmToolLoop\(([\s\S]*?)\n\s*\);/.exec(handler);
    expect(call, 'actual Web handler loop call located').not.toBeNull();
    expect(call![1]).toMatch(/pregunta\s*:\s*message(?:\.trim\(\))?/);
    expect(call![1]).toMatch(/messageId\s*:\s*usuarioMensajeId/);
    expect(handler).toContain('metadata,created_at');
    expect(handler).toMatch(/created_at\s*:\s*m\.created_at/);
    expect(handler).toMatch(/id\s*:\s*m\.id/);
  });
  it('Telegram preserves the selected previous USER created_at in loop messages', () => {
    const source = readFileSync(resolve(dirname(runtimeFile), 'telegram/bot.ts'), 'utf8');
    const start = source.indexOf('async function buildTelegramLlmMessages');
    const end = source.indexOf("contextoDesdeHistorial(userId,conversationId,'telegram'", start);
    const builder = source.substring(start, end);
    expect(start).toBeGreaterThan(-1); expect(end).toBeGreaterThan(start);
    expect(builder).toContain('metadata,created_at');
    expect(builder).toMatch(/created_at\s*:\s*m\.created_at/);
    expect(builder).toMatch(/id\s*:\s*m\.id/);
    const call = /llmToolLoop\(llmMessages,[^\n]*\{pregunta\s*:\s*userMessage[^}]*\}/.exec(source);
    expect(call, 'actual Telegram handler passes the current request separately').not.toBeNull();
    expect(call![0]).toMatch(/messageId\s*:\s*usuarioMensajeId/);
  });
});
