// Synthetic actual-loop regression. Every HTTP request terminates in this file.
// No provider, database, identity, credential, or personnel record is contacted.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mensajesDesdeHistorial, type MensajeLlm } from '@/utils/escoEvals/mensajes';

const DB = 'https://privacy-loop-fixture.invalid';
const MODEL = 'https://openrouter.ai/api/v1/chat/completions';
const DATES = { date_from: '2034-05-01', date_to: '2034-05-07' };
const QUESTION = 'Resumen semanal de labores por lote del 2034-05-01 al 2034-05-07: jornales y costo registrado por lote.';
const FALSE_PROSE = 'Resultado inventado: cada lote costó 145.50 y el total fue 123456789 COP. Todo quedó pagado.';
const PRIVATE = {
  user: 'SYN_PRIVATE_PREVIOUS_USER', assistant: 'SYN_PRIVATE_PREVIOUS_ASSISTANT',
  metadata: 'SYN_PRIVATE_METADATA_EMPLOYEE', tool: 'SYN_PRIVATE_OLD_TOOL_EMPLOYEE',
  memory: 'SYN_PRIVATE_MEMORY_EMPLOYEE', modelArg: 'SYN_PRIVATE_MODEL_EMPLOYEE',
  row: 'SYN_PRIVATE_ROW_EMPLOYEE', note: 'SYN_PRIVATE_OBSERVATION',
  salaryText: 'SYN_PRIVATE_SALARY', salaryNumber: '987654321', error: 'SYN_PRIVATE_SOURCE_ERROR',
};
const SENTINELS = Object.values(PRIVATE);
type Json = Record<string, unknown>;
interface Call { name: string; args: Json }
interface Interaction { tool: string; args: Json; result_summary: string }
interface LoopResult { text: string; toolInteractions: Interaction[] }
interface ProviderBody { messages?: MensajeLlm[]; tools?: Array<{ function?: { name?: string } }> }
type Mode = 'labor' | 'overview' | 'personnel_tool' | 'employee_argument' | 'source_error' | 'fallback';

const lots = [{ id: 'lot-a', nombre: 'Lote sintético A' }, { id: 'lot-b', nombre: 'Lote sintético B' }];
const laborRows: Json[] = lots.map((lote, index) => ({
  id: `work-${index}`, fecha_trabajo: '2034-05-02', lote_id: lote.id, fraccion_jornal: '1',
  costo_jornal: index === 0 ? '80.25' : '210.75', lote,
  // Deliberately returned even for a narrow SELECT: downstream context must rebuild
  // the permitted fields, rather than copy a raw server response into model history.
  empleado: { id: 'synthetic-person', nombre: PRIVATE.row, salario: Number(PRIVATE.salaryNumber) },
  observaciones: PRIVATE.note,
}));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function contaminatedMessages(channel: 'Web' | 'Telegram'): MensajeLlm[] {
  const messages = mensajesDesdeHistorial([
    { role: 'user', content: `Consulta individual anterior: ${PRIVATE.user}; salario ${PRIVATE.salaryText}; ${PRIVATE.note}.` },
    { role: 'assistant', content: `Respuesta anterior ${PRIVATE.assistant}; salario ${PRIVATE.salaryNumber}.`, herramientas: [{
      tool: 'get_employee_activity', args: { worker_name: PRIVATE.metadata },
      result_summary: JSON.stringify({ empleado: { nombre: PRIVATE.metadata, salario: PRIVATE.salaryNumber }, observaciones: PRIVATE.note }),
    }] },
    { role: 'user', content: QUESTION },
  ], `Sistema sintético. Memorias persistidas: ${PRIVATE.memory}; salario ${PRIVATE.salaryText}; notas ${PRIVATE.note}.`, channel);
  messages.splice(messages.length - 1, 0,
    { role: 'assistant', content: null, tool_calls: [{ id: 'historical-private-call', type: 'function',
      function: { name: 'get_employee_activity', arguments: JSON.stringify({ worker_name: PRIVATE.tool }) } }] },
    { role: 'tool', name: 'get_employee_activity', tool_call_id: 'historical-private-call',
      content: JSON.stringify({ nombre: PRIVATE.tool, salario: PRIVATE.salaryNumber, observaciones: PRIVATE.note }) });
  return messages;
}

function plannedCalls(mode: Mode, round: number): Call[] | null {
  const labor = { name: 'get_labor_summary', args: { ...DATES } };
  if (mode === 'fallback') return round <= 3 ? [{ name: 'synthetic_unsupported_aggregate', args: { attempt: round } }] : null;
  if (mode === 'overview' && round === 1) return [{ name: 'get_weekly_overview', args: { ...DATES } }];
  if (mode === 'overview' && round === 2) return [labor];
  if (round !== 1) return null;
  if (mode === 'personnel_tool') return [{ name: 'get_employee_activity', args: { ...DATES, worker_name: PRIVATE.modelArg } }, labor];
  if (mode === 'employee_argument') return [{ name: 'get_labor_summary', args: { ...DATES, employee_name: PRIVATE.modelArg } }, labor];
  return [labor];
}

function closedTransport(mode: Mode) {
  const bodies: ProviderBody[] = [];
  const reads: URL[] = [];
  const rejected: string[] = [];
  const deniedEnv: string[] = [];
  const inherited = vi.fn(async (): Promise<Response> => { throw new Error('Inherited network must never run'); });
  // The sentinel is installed before the closed transport, and never called or captured
  // as a fallback by it. A separate ledger proves that no inherited fetch was used.
  vi.stubGlobal('fetch', inherited);
  const env: Record<string, string> = { SUPABASE_URL: DB, SUPABASE_SERVICE_ROLE_KEY: 'synthetic-db-key', OPENROUTER_API_KEY: 'synthetic-model-key' };
  vi.stubGlobal('Deno', { env: { get: (key: string) => {
    if (!Object.prototype.hasOwnProperty.call(env, key)) { deniedEnv.push(key); throw new Error('Unlisted synthetic environment key'); }
    return env[key];
  } } });
  const fetchClosed = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (request.url === MODEL && request.method === 'POST') {
      const body: ProviderBody = JSON.parse(await request.text());
      bodies.push(body);
      const round = bodies.length;
      if (round > 5) { rejected.push('provider-round-budget'); throw new Error('Synthetic provider budget exceeded'); }
      const calls = plannedCalls(mode, round);
      return Response.json({ choices: [{ message: calls ? { role: 'assistant', content: null,
        tool_calls: calls.map((c, index) => ({ id: `round-${round}-call-${index}`, type: 'function',
          function: { name: c.name, arguments: JSON.stringify(c.args) } })) } : { role: 'assistant', content: FALSE_PROSE } }] });
    }
    if (url.origin !== DB || request.method !== 'GET' || !/^\/rest\/v1\/[a-z_]+$/.test(url.pathname) || url.hash) {
      rejected.push(`${request.method} ${url.origin}${url.pathname}`);
      throw new Error('Closed synthetic HTTP route');
    }
    reads.push(url);
    const table = url.pathname.substring('/rest/v1/'.length);
    if (table === 'registros_trabajo' && mode === 'source_error') {
      return Response.json({ message: `${PRIVATE.error}; ${PRIVATE.row}; salario ${PRIVATE.salaryNumber}; ${PRIVATE.note}` }, { status: 503 });
    }
    // Empty legacy overview tables allow the old loop to complete so assertions
    // identify its unsafe worker SELECT, rather than hide it behind fixture errors.
    const fixtures: Record<string, Json[]> = {
      registros_trabajo: laborRows, lotes: lots,
      empleados: [{ id: 'synthetic-person', nombre: PRIVATE.modelArg, salario: Number(PRIVATE.salaryNumber) }], contratistas: [],
      monitoreos: [], aplicaciones: [], aplicaciones_mezclas: [], aplicaciones_productos: [],
      aplicaciones_calculos: [], cosechas: [], despachos: [], tareas: [], tipos_tareas: [],
    };
    if (!Object.prototype.hasOwnProperty.call(fixtures, table)) {
      rejected.push(`GET unlisted table ${table}`); throw new Error('Closed synthetic table');
    }
    let rows = fixtures[table];
    const p = url.searchParams;
    for (const key of ['fecha_trabajo', 'lote_id', 'id']) {
      for (const filter of p.getAll(key)) {
        const dot = filter.indexOf('.'); const op = filter.substring(0, dot); const value = filter.substring(dot + 1);
        rows = rows.filter(r => op === 'gte' ? String(r[key]) >= value : op === 'lte' ? String(r[key]) <= value :
          op === 'eq' ? String(r[key]) === value : op === 'in' ? value.substring(1, value.length - 1).split(',').includes(String(r[key])) : false);
      }
    }
    const total = rows.length;
    const offset = Number(p.get('offset') ?? 0);
    const limit = Number(p.get('limit') ?? 200);
    const page = rows.slice(offset, offset + limit);
    return Response.json(page, { headers: { 'content-range': page.length ? `${offset}-${offset + page.length - 1}/${total}` : `*/${total}` } });
  };
  vi.stubGlobal('fetch', fetchClosed);
  return { bodies, reads, rejected, deniedEnv, inherited, fetchClosed };
}

async function probe(channel: 'Web' | 'Telegram', mode: Mode) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2034-05-08T17:00:00Z'));
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const transport = closedTransport(mode);
  const events: unknown[] = [];
  // Deliberately dynamic: frontend TypeScript must not traverse Deno runtime imports.
  const modulePath = '../supabase/functions/server/chat.tsx';
  const { llmToolLoop } = await import(modulePath) as {
    llmToolLoop: (messages: MensajeLlm[], user: string, onEvent: (event: unknown) => void) => Promise<LoopResult>;
  };
  const result = await llmToolLoop(contaminatedMessages(channel), 'synthetic-user', event => events.push(structuredClone(event)));
  return { ...transport, events, result };
}

function noPrivateValues(value: unknown, label: string) {
  const text = JSON.stringify(value);
  expect.soft(SENTINELS.filter(s => text.includes(s)), label).toEqual([]);
}

function minimized(probeResult: Awaited<ReturnType<typeof probe>>) {
  const r = probeResult;
  expect(r.bodies.length, 'actual provider loop exercised').toBeGreaterThan(0);
  noPrivateValues(r.bodies[0], 'FIRST provider body must be minimized before any send');
  // An implementation may safely stop early. Check every body that was actually
  // sent, including later/fallback bodies, without demanding extra model rounds.
  r.bodies.forEach((body, index) => noPrivateValues(body, `provider request ${index + 1}`));
  expect.soft(r.bodies[0].tools?.map(t => t.function?.name) ?? [], 'initial aggregate tool surface').not.toContain('get_employee_activity');
  noPrivateValues(r.result.text, 'final answer');
  noPrivateValues(r.result.toolInteractions, 'context persistence payload');
  noPrivateValues(r.events, 'onEvent frames');
  expect.soft(r.rejected, 'all actual HTTP requests matched closed fixtures').toEqual([]);
  expect.soft(r.deniedEnv, 'no inherited environment access').toEqual([]);
  expect(r.inherited).not.toHaveBeenCalled();
  expect.soft(r.reads.filter(u => /\/(?:empleados|contratistas)$/.test(u.pathname)), 'aggregate must never query personnel').toEqual([]);
  for (const u of r.reads.filter(u => u.pathname.endsWith('/registros_trabajo'))) {
    const select = u.searchParams.get('select') ?? '';
    expect.soft(select, 'aggregate labor SELECT excludes personal fields').not.toMatch(/emplead|contratist|salari|observacion|prestacion|auxilio|\*/i);
    const columns = select.replace(/lote:lotes\((?:id,)?nombre\)/g, 'lote_id').split(',');
    expect.soft(columns.filter(c => !['id', 'fecha_trabajo', 'lote_id', 'fraccion_jornal', 'costo_jornal'].includes(c)), 'only registered aggregate source fields').toEqual([]);
    expect.soft(select).toContain('costo_jornal');
    expect.soft(u.searchParams.has('empleado_id') || u.searchParams.has('contratista_id'), 'model arguments cannot add personnel selectors').toBe(false);
  }
  expect.soft(r.result.text).not.toContain(FALSE_PROSE);
  expect.soft(r.result.text).not.toContain('123456789');
}

function usefulRecordedCosts(r: Awaited<ReturnType<typeof probe>>) {
  expect(r.reads.some(u => u.pathname.endsWith('/registros_trabajo')), 'supported aggregate source was actually read').toBe(true);
  expect(r.result.toolInteractions.length, 'supported tool result was exercised, not skipped').toBeGreaterThan(0);
  expect(r.events.some(e => (e as Json).type === 'tool_done'), 'shared-loop event path was exercised').toBe(true);
  expect.soft(r.result.text).toMatch(/(?:Lote sintético A|lot-a)[^\n]*80[.,]25/);
  expect.soft(r.result.text).toMatch(/(?:Lote sintético B|lot-b)[^\n]*210[.,]75/);
  expect.soft(r.result.text, 'unequal stored costs must not be averaged across lots').not.toMatch(/145[.,]50/);
}

describe('actual shared loop aggregate privacy under closed synthetic transport', () => {
  it.each(['Web', 'Telegram'] as const)('minimizes prior user/assistant/tool/metadata/memory before FIRST and every later send on %s', async channel => {
    const r = await probe(channel, 'labor'); minimized(r); usefulRecordedCosts(r);
  });
  it('does not let a weekly-overview alias fetch legacy worker fields or bypass typed labor facts', async () => {
    const r = await probe('Web', 'overview'); minimized(r); usefulRecordedCosts(r);
  });
  it.each(['personnel_tool', 'employee_argument'] as const)('rejects model-proposed personnel scope without hijacking the supported aggregate part: %s', async mode => {
    const r = await probe('Telegram', mode); minimized(r); usefulRecordedCosts(r);
  });
  it.each(['Web', 'Telegram'] as const)('does not expose private source-error payloads through models, answers, metadata, or events on %s', async channel => {
    const r = await probe(channel, 'source_error'); minimized(r);
    expect(r.reads.some(u => u.pathname.endsWith('/registros_trabajo')), 'synthetic source error was exercised').toBe(true);
    expect(r.result.text).not.toMatch(/80[.,]25|210[.,]75/);
    expect(r.result.text.trim()).not.toBe('');
  });
  it.each(['Web', 'Telegram'] as const)('does not unlock raw facts or invented prose after unsupported aggregate tool rounds on %s', async channel => {
    const r = await probe(channel, 'fallback'); minimized(r);
    expect(r.result.text.trim()).not.toBe('');
    expect(r.result.text).not.toMatch(/80[.,]25|210[.,]75|145[.,]50/);
    // No exact round-count assertion: a safe unavailable answer can stop before
    // round three, rather than invoke a fourth free-form generation.
  });
  it('rejects unknown origins, methods and environment keys without invoking inherited transport', async () => {
    const t = closedTransport('labor');
    await expect(fetch('https://outside-fixture.invalid/read')).rejects.toThrow('Closed synthetic HTTP route');
    await expect(fetch(`${DB}/rest/v1/registros_trabajo`, { method: 'POST', body: '{}' })).rejects.toThrow('Closed synthetic HTTP route');
    const deno = (globalThis as unknown as { Deno: { env: { get: (key: string) => string } } }).Deno;
    expect(() => deno.env.get('UNLISTED_SYNTHETIC_SECRET')).toThrow('Unlisted synthetic environment key');
    expect(t.rejected).toHaveLength(2); expect(t.deniedEnv).toEqual(['UNLISTED_SYNTHETIC_SECRET']);
    expect(t.inherited).not.toHaveBeenCalled();
  });
});
