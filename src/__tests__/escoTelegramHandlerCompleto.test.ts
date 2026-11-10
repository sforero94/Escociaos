// Local webhook integration, not a production webhook/Telegram delivery test.
// Real grammY middleware + conversations engine, real Supabase SDK and real chat loop.
// Unentered write conversations are forbidden callbacks, as in the replay fixture.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
import * as grammy from 'grammy';
import * as conversations from '@grammyjs/conversations';
import { createClient } from '@supabase/supabase-js';

type Row = Record<string, unknown>;
const DB = 'https://telegram-handler-fixture.invalid';
const MODEL = 'https://openrouter.ai/api/v1/chat/completions';
const PRIVATE = ['SYN_TG_HISTORY_PERSON', 'SYN_TG_ASSISTANT_SALARY', 'SYN_TG_TOOL_NOTE',
  'SYN_TG_METADATA_PERSON', 'SYN_TG_QUOTED_PROVIDER', 'SYN_TG_RAW_EMPLOYEE', 'SYN_TG_ERROR_DETAIL'];
const QUESTION = 'Resumen de labores por lote del 2034-05-01 al 2034-05-07, jornales y costo registrado.';
const FALSE_PROSE = 'FALSO_TG_TODOS_COSTARON_145_50';
const CHART = '```chart\n{"type":"bar","title":"FALSO","data":[{"x":"inventado","y":999}],"xKey":"x","yKey":"y"}\n```';
interface Options {
  secret?: string | null; active?: boolean; modules?: string[];
  fresh?: 'linked' | 'unlinked' | 'revoked' | 'error';
  mode?: 'labor' | 'purchase' | 'source_error' | 'unsupported' | 'empty';
  telegramFailure?: boolean;
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

async function fixture(options: Options = {}) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2034-05-08T17:00:00Z'));
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const inherited = vi.fn(async (): Promise<Response> => { throw Error('Inherited network forbidden'); });
  vi.stubGlobal('fetch', inherited);
  const environment: Record<string, string | undefined> = {
    ESCO_MOTOR_TELEGRAM: undefined,
    SUPABASE_URL: DB, SUPABASE_SERVICE_ROLE_KEY: 'synthetic-sdk-key', OPENROUTER_API_KEY: 'synthetic-model-key',
    TELEGRAM_BOT_TOKEN: '123:synthetic', TELEGRAM_WEBHOOK_SECRET: options.secret === null ? undefined : options.secret ?? 'synthetic-webhook-secret',
  };
  const rejected: string[] = [], envRejected: string[] = [];
  const deno = { env: { get(key: string) {
    if (!Object.prototype.hasOwnProperty.call(environment, key)) { envRejected.push(key); throw Error('Closed environment'); }
    return environment[key];
  } } };
  vi.stubGlobal('Deno', deno);
  const bodies: Row[] = [], requests: Array<{ method: string; url: URL; body?: unknown }> = [];
  const telegram: Array<{ method: string; payload: Row }> = [], inserted: Row[] = [];
  const historyReturned: Row[][] = [];
  const storage = new Map<string, unknown>();
  const user = { id: 'telegram-fixture-row', telegram_id: 123, activo: options.active !== false,
    usuario_id: '11111111-1111-4111-8111-111111111111', nombre_display: 'Cuenta sintética', modulos_permitidos: options.modules ?? ['consultas'] };
  const conversationId = '22222222-2222-4222-8222-222222222222';
  const history: Row[] = [
    { id: 'history-u', role: 'user', content: `Consulta personal antigua ${PRIVATE[0]}; compras por proveedor ${PRIVATE[4]}; salario y observaciones ${PRIVATE[3]}`, created_at: '2034-05-08T16:00:00Z' },
    { id: 'history-a', role: 'assistant', content: PRIVATE[1] + CHART, created_at: '2034-05-08T16:01:00Z', metadata: {
      tool_interactions: [{ tool: 'get_employee_activity', args: { employee_name: PRIVATE[3] }, result_summary: PRIVATE[2] }],
      application_cohort: PRIVATE[3], memorias: PRIVATE[3],
    } },
    { id: 'history-t', role: 'tool', content: PRIVATE[2], created_at: '2034-05-08T16:02:00Z' },
  ].map(row => ({ conversation_id: conversationId, ...row }));
  let authReads = 0, botCreations = 0;
  const tables: Record<string, Row[]> = {
    lotes: [{ id: 'lot-a', nombre: 'Lote A sintético' }, { id: 'lot-b', nombre: 'Lote B sintético' }],
    registros_trabajo: [80.25, 210.75].map((cost, i) => ({ id: `work-${i}`, fecha_trabajo: '2034-05-02', lote_id: i ? 'lot-b' : 'lot-a',
      fraccion_jornal: '1', costo_jornal: String(cost), empleado: { nombre: PRIVATE[5], salario: '987654321' }, observaciones: PRIVATE[5] })),
    compras: [{ id: 'purchase-a', producto_id: 'product-a', fecha_compra: '2034-05-03', cantidad: '2', unidad: 'Kilos',
      costo_unitario: '40.125', costo_total: '80.25', producto: { nombre: 'Producto sintético' },
      proveedor_id: 'supplier-a', proveedor: 'Proveedor Actual Sintético', observaciones: PRIVATE[5] }],
  };
  function filtered(rows: Row[], p: URLSearchParams): Row[] {
    return rows.filter(row => [...p].every(([key, filter]) => {
      if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(key)) return true;
      const dot = filter.indexOf('.'), op = filter.slice(0, dot), value = filter.slice(dot + 1);
      if (op === 'eq') return String(row[key]) === value;
      if (op === 'gte') return String(row[key]) >= value;
      if (op === 'lte') return String(row[key]) <= value;
      if (op === 'in') return value.slice(1, -1).split(',').map(v => v.replace(/^"|"$/g, '')).includes(String(row[key]));
      rejected.push(`filter:${key}:${op}`); throw Error('Closed REST filter');
    }));
  }
  const closedFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init), url = new URL(request.url);
    if (url.href === MODEL && request.method === 'POST') {
      const body = JSON.parse(await request.text()) as Row; bodies.push(body);
      if (bodies.length > 4) { rejected.push('provider-budget'); throw Error('Closed provider budget'); }
      const mode = options.mode ?? 'labor';
      const name = mode === 'unsupported' ? 'synthetic_unsupported' : mode === 'purchase' ? 'get_purchase_history' : 'get_labor_summary';
      const message = mode === 'empty' ? { role: 'assistant', content: null } : {
        role: 'assistant', content: FALSE_PROSE + CHART,
        tool_calls: [{ id: `fixture-${bodies.length}`, type: 'function', function: { name,
          arguments: JSON.stringify({ date_from: '2034-05-01', date_to: '2034-05-07' }) } }],
      };
      return Response.json({ choices: [{ message }] });
    }
    if (url.origin !== DB || !/^\/rest\/v1\/[a-z_]+$/.test(url.pathname)) {
      rejected.push(`${request.method} ${url.origin}${url.pathname}`); throw Error('Closed HTTP route');
    }
    const table = url.pathname.slice('/rest/v1/'.length), method = request.method;
    const body = method === 'POST' ? JSON.parse(await request.text()) as Row : undefined;
    requests.push({ method, url, body });
    if (method === 'POST') {
      if (['telegram_sessions', 'telegram_conversations'].includes(table)) {
        storage.set(`${table}:${body!.key}`, structuredClone(body!.session)); return new Response(null, { status: 201 });
      }
      if (table === 'chat_messages') {
        expect(body!.conversation_id).toBe(conversationId);
        inserted.push(structuredClone(body!)); history.push({ ...body, created_at: new Date().toISOString() });
        return new Response(null, { status: 201 });
      }
      rejected.push(`POST:${table}`); throw Error('Closed persistence table');
    }
    if (method !== 'GET') { rejected.push(`${method}:${table}`); throw Error('Closed method'); }
    const p = url.searchParams;
    let rows: Row[];
    if (table === 'telegram_usuarios') {
      authReads++;
      expect(p.get('telegram_id')).toBe('eq.123'); expect(p.get('activo')).toBe('eq.true');
      if (authReads > 1 && options.fresh === 'error') return Response.json({ message: PRIVATE[6] }, { status: 503 });
      rows = options.active === false || authReads > 1 && options.fresh === 'revoked' ? [] : [{ ...user,
        ...(authReads > 1 && options.fresh === 'unlinked' ? { usuario_id: null } : {}),
      }];
    } else if (['telegram_sessions', 'telegram_conversations'].includes(table)) {
      const key = p.get('key')?.slice(3); const session = storage.get(`${table}:${key}`);
      rows = session ? [{ key, session }] : [];
    } else if (table === 'chat_conversations') {
      expect(p.get('user_id')).toBe(`eq.${user.usuario_id}`); expect(p.get('updated_at')).toMatch(/^gte\./);
      rows = [{ id: conversationId, user_id: user.usuario_id, updated_at: new Date().toISOString() }];
    } else if (table === 'chat_messages') {
      expect(p.get('conversation_id')).toBe(`eq.${conversationId}`);
      rows = [...history].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || String(b.id).localeCompare(String(a.id)));
    } else if (Object.prototype.hasOwnProperty.call(tables, table)) {
      if (table === 'registros_trabajo' && options.mode === 'source_error') return Response.json({ message: PRIVATE[6] }, { status: 503 });
      rows = tables[table];
    } else { rejected.push(`GET:${table}`); throw Error('Closed source table'); }
    rows = filtered(rows, p);
    const total = rows.length, offset = Number(p.get('offset') ?? 0);
    rows = rows.slice(offset, offset + Number(p.get('limit') ?? 200));
    if (table === 'chat_messages') historyReturned.push(structuredClone(rows));
    const headers = { 'content-range': rows.length ? `${offset}-${offset + rows.length - 1}/${total}` : `*/${total}` };
    if (request.headers.get('accept')?.includes('vnd.pgrst.object+json')) {
      return rows.length === 1 ? Response.json(rows[0], { headers })
        : Response.json({ code: 'PGRST116', message: 'Synthetic absent row' }, { status: 406, headers });
    }
    return Response.json(rows, { headers });
  };
  vi.stubGlobal('fetch', closedFetch);
  // Actual loop exports, not a stubbed CHAT dependency. Variable import prevents
  // frontend TypeScript from following Deno's npm: specifiers.
  const chatPath = '../supabase/functions/server/chat.tsx';
  const chatExports = await import(chatPath) as Record<string, unknown>;
  const cache = new Map<string, Record<string, unknown>>();
  const base = resolve('src/supabase/functions/server/telegram');
  class Bot extends grammy.Bot {
    constructor(token: string, config: grammy.BotConfig<grammy.Context>) {
      botCreations++;
      super(token, { ...config, client: { fetch: async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input)), method = url.pathname.split('/').pop()!;
        const payload = JSON.parse(String(init?.body)) as Row; telegram.push({ method, payload });
        if (url.origin !== 'https://api.telegram.org' || !['sendMessage', 'sendChatAction', 'setMyCommands'].includes(method)) {
          rejected.push(`Telegram:${method}`); throw Error('Closed Telegram method');
        }
        if (method !== 'setMyCommands') expect(payload.chat_id).toBe(123);
        if (method === 'sendMessage' && options.telegramFailure) {
          return Response.json({ ok: false, error_code: 403, description: PRIVATE[6] }, { status: 403 });
        }
        return Response.json({ ok: true, result: method === 'sendMessage'
          ? { message_id: telegram.length, date: 1, chat: { id: 123, type: 'private' }, text: payload.text } : true });
      } } });
    }
  }
  const forbidden = (name: string) => () => { rejected.push(`dependency:${name}`); throw Error('Unentered dependency'); };
  function load(file: string): Record<string, unknown> {
    if (cache.has(file)) return cache.get(file)!;
    const module = { exports: {} as Record<string, unknown> }; cache.set(file, module.exports);
    const js = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const requireModule = (specifier: string): unknown => {
      if (specifier === 'npm:grammy@1') return { ...grammy, Bot };
      if (specifier === 'npm:@grammyjs/conversations@2') return conversations;
      if (specifier === 'npm:@supabase/supabase-js@2') return { createClient: (url: string, key: string) =>
        createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: closedFetch } }) };
      if (specifier === '../chat.tsx') return chatExports;
      if (specifier.endsWith('resolverUsuarioTelegram.ts') || specifier.endsWith('escoCohorteAplicaciones.ts') || /^\.\/escoSql(?:Contrato|Cliente|Sesion|Acceso|Render|Flujo)\.ts$/.test(specifier)) return load(resolve(dirname(file), specifier));
      if (['@esco-sql/formato.ts', '@esco-sql/bloques.ts', '@esco-sql/respuesta.ts'].includes(specifier)) return load(resolve('src/utils/escoSql', specifier.slice('@esco-sql/'.length)));
      if (file.startsWith(resolve('src/utils/escoSql')) && ['./formato.ts', './respuesta.ts', './bloques.ts'].includes(specifier)) return load(resolve(dirname(file), specifier));
      return new Proxy({}, { get: (_target, key) => key === '__esModule' ? true : forbidden(`${specifier}:${String(key)}`) });
    };
    new Function('require', 'module', 'exports', 'Deno', 'fetch', js)(requireModule, module, module.exports, deno, closedFetch);
    return module.exports;
  }
  const webhook = load(resolve(base, 'bot.ts')).handleWebhook as (context: unknown) => Promise<Response>;
  const parsed = vi.fn();
  async function update(body: unknown, secret: string | null = 'synthetic-webhook-secret') {
    return webhook({ req: { header: () => secret ?? undefined, json: async () => { parsed(); return body; } },
      json: (value: unknown, status = 200) => Response.json(value, { status }) });
  }
  async function send(question = QUESTION, secret: string | null = 'synthetic-webhook-secret') {
    const body = { update_id: 1, message: { message_id: 1, date: 2034, chat: { id: 123, type: 'private' },
      from: { id: 123, is_bot: false, first_name: 'Synthetic' }, text: question,
      reply_to_message: { message_id: 99, date: 1, chat: { id: 123, type: 'private' },
        from: { id: 456, is_bot: false, first_name: PRIVATE[4] }, text: PRIVATE[4] + CHART },
    } };
    return update(body, secret);
  }
  return { send, update, parsed, bodies, requests, inserted, telegram, rejected, envRejected, inherited, historyReturned,
    logs: () => [...log.mock.calls, ...warn.mock.calls, ...error.mock.calls].map(call => call.map(value =>
      value instanceof Error ? { ...value, name: value.name, message: value.message, stack: value.stack } : value)),
    authReads: () => authReads, botCreations: () => botCreations,
    replies: () => telegram.filter(c => c.method === 'sendMessage').map(c => String(c.payload.text)).join('\n') };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function closed(f: Fixture) {
  expect(f.rejected, 'every transport matched an explicitly closed route').toEqual([]);
  expect(f.envRejected).toEqual([]); expect(f.inherited).not.toHaveBeenCalled();
  expect(f.telegram.some(c => /photo|document/i.test(c.method))).toBe(false);
}
function minimized(f: Fixture) {
  expect(f.bodies.length, 'actual loop/provider request exercised').toBeGreaterThan(0);
  expect(f.historyReturned).toHaveLength(1);
  expect(f.historyReturned[0].map(row => row.id)).toEqual(expect.arrayContaining(['history-u', 'history-a', 'history-t', f.inserted[0].id]));
  const tools = f.bodies[0].tools as Array<{ function: { name: string } }>;
  expect(tools.map(tool => tool.function.name)).not.toContain('get_employee_activity');
  for (const body of f.bodies) for (const sentinel of PRIVATE) expect(JSON.stringify(body)).not.toContain(sentinel);
  const assistant = f.inserted.filter(row => row.role === 'assistant');
  expect(assistant).toHaveLength(1);
  for (const value of [assistant, f.telegram]) {
    for (const sentinel of PRIVATE) expect(JSON.stringify(value)).not.toContain(sentinel);
    expect(JSON.stringify(value)).not.toContain(FALSE_PROSE); expect(JSON.stringify(value)).not.toContain('inventado');
  }
  expect(f.requests.some(r => /\/(empleados|contratistas|esco_memorias)$/.test(r.url.pathname))).toBe(false);
  closed(f);
}

describe('Telegram handleWebhook → real grammY gates → real llmToolLoop (closed synthetic transport)', () => {
  it.each([{ configured: null, supplied: 'synthetic-webhook-secret', status: 503 },
    { configured: '', supplied: 'synthetic-webhook-secret', status: 503 },
    { configured: 'synthetic-webhook-secret', supplied: undefined, status: 401 },
    { configured: 'synthetic-webhook-secret', supplied: '', status: 401 },
    { configured: 'synthetic-webhook-secret', supplied: 'wrong-synthetic-secret', status: 401 }])(
    'rejects secret gate $status before parsing, bot initialization, auth or model', async ({ configured, supplied, status }) => {
      const f = await fixture({ secret: configured });
      const response = await f.send(QUESTION, supplied ?? null);
      expect(response.status).toBe(status); expect(f.parsed).not.toHaveBeenCalled();
      expect(f.botCreations()).toBe(0); expect(f.requests).toEqual([]); expect(f.bodies).toEqual([]); closed(f);
    });
  it.each([{ active: false, modules: ['consultas'], message: 'No estás registrado', reads: 1 },
    { active: true, modules: [], message: 'No tienes acceso a consultas', reads: 1 }])(
    'enforces active/module gate without model or chat writes ($message)', async ({ active, modules, message, reads }) => {
      const f = await fixture({ active, modules }); expect((await f.send()).status).toBe(200);
      expect(f.replies()).toContain(message); expect(f.authReads()).toBe(reads); expect(f.bodies).toEqual([]);
      expect(f.inserted).toEqual([]);
      expect(f.requests.every(r => /\/(telegram_sessions|telegram_conversations|telegram_usuarios)$/.test(r.url.pathname))).toBe(true); closed(f);
    });
  it.each([{ fresh: 'unlinked' as const, message: 'no está vinculada' },
    { fresh: 'revoked' as const, message: 'No estás registrado' },
    { fresh: 'error' as const, message: 'No pude consultar tu cuenta' }])(
    'rechecks linked active identity after middleware ($fresh)', async ({ fresh, message }) => {
      const f = await fixture({ fresh }); expect((await f.send()).status).toBe(200);
      expect(f.authReads()).toBe(2); expect(f.replies()).toContain(message);
      expect(f.bodies).toEqual([]); expect(f.inserted).toEqual([]); expect(f.replies()).not.toContain(PRIVATE[6]); expect(JSON.stringify(f.logs())).not.toContain(PRIVATE[6]); closed(f);
    });
  it('persists and replies with fresh unequal lot costs, without historical/quoted/source personnel or chart prose', async () => {
    const f = await fixture(); expect((await f.send()).status).toBe(200); minimized(f);
    expect(f.authReads()).toBe(2); expect(f.parsed).toHaveBeenCalledOnce(); expect(f.botCreations()).toBe(1);
    expect(f.inserted[0]).toMatchObject({ role: 'user', content: QUESTION });
    expect(f.inserted[0].id).toEqual(expect.any(String));
    const metadata = f.inserted.find(row => row.role === 'assistant')!.metadata as Row;
    expect(metadata.tool_interactions).toEqual(expect.arrayContaining([expect.objectContaining({ tool: 'get_labor_summary', result_summary: expect.any(String) })]));
    expect(f.replies()).toMatch(/80[.,]25/); expect(f.replies()).toMatch(/210[.,]75/);
    expect(f.replies()).not.toMatch(/145[.,]50/);
    const source = f.requests.filter(r => r.url.pathname.endsWith('/registros_trabajo'));
    expect(source.length).toBeGreaterThan(0);
    for (const r of source) {
      expect(r.url.searchParams.get('select')).toBe('id,fecha_trabajo,lote_id,lote:lotes(nombre),fraccion_jornal,costo_jornal');
      expect(r.url.searchParams.getAll('fecha_trabajo')).toEqual(['gte.2034-05-01', 'lte.2034-05-07']);
    }
  });
  it.each([{ suffix: '', supplier: false, names: false },
    { suffix: ' por proveedor sin nombres', supplier: true, names: false },
    { suffix: ' por proveedor con nombres', supplier: true, names: true }])(
    'binds counterpart projection only to current purpose ($suffix), ignoring quoted/history identities', async ({ suffix, supplier, names }) => {
      const f = await fixture({ mode: 'purchase' });
      expect((await f.send(`Compras${suffix} del 2034-05-01 al 2034-05-07.`)).status).toBe(200); minimized(f);
      const reads = f.requests.filter(r => r.url.pathname.endsWith('/compras')); expect(reads.length).toBeGreaterThan(0);
      for (const r of reads) {
        const fields = r.url.searchParams.get('select')!.split(',');
        expect(fields.includes('proveedor_id')).toBe(supplier); expect(fields.includes('proveedor')).toBe(names);
        expect(fields).not.toContain('observaciones');
      }
      expect(f.replies()).toMatch(/80[.,]25/);
      if (names) expect(f.replies()).toContain('Proveedor Actual Sintético');
      else expect(f.replies()).not.toContain('Proveedor Actual Sintético');
    });
  it.each(['source_error', 'unsupported'] as const)('fails safely without free model prose, raw error or QuickChart (%s)', async mode => {
    const f = await fixture({ mode }); expect((await f.send()).status).toBe(200); minimized(f);
    expect(f.replies()).toMatch(/no pude|no disponible|no verific|límite|fuente|alcance/i);
  });
  it('keeps malformed terminal protocol inside the generic Telegram error path without persisting an assistant', async () => {
    const f = await fixture({ mode: 'empty' }); expect((await f.send()).status).toBe(200);
    expect(f.bodies).toHaveLength(1); expect(f.replies()).toContain('Hubo un error al procesar tu consulta');
    expect(f.inserted.map(row => row.role)).toEqual(['user']); closed(f);
  });
  it('does not expose private Telegram API rejection descriptions or bot tokens in webhook responses/logs', async () => {
    const f = await fixture({ telegramFailure: true });
    const response = await f.send();
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ error: 'Webhook error' });
    expect(f.telegram.filter(call => call.method === 'sendMessage').length).toBeGreaterThan(0);
    expect.soft(body).not.toContain(PRIVATE[6]);
    expect.soft(body).not.toContain('123:synthetic');
    expect.soft(JSON.stringify(f.logs())).not.toContain(PRIVATE[6]);
    expect.soft(JSON.stringify(f.logs())).not.toContain('123:synthetic');
    expect(f.logs()).toContainEqual(['[Telegram] Webhook error:', 'WEBHOOK_PROCESSING_FAILED']);
    closed(f);
  });
  it.each([null, PRIVATE[6], [], { update_id: Number.MAX_SAFE_INTEGER + 1 }, { update_id: 2, message: { message_id: 2, date: 1,
    chat: { id: 123, type: 'private' }, from: { id: 123, is_bot: false, first_name: 'Synthetic' }, text: 123 } }])(
    'rejects malformed update with 400 before bot initialization or any transport (%j)', async body => {
      const f = await fixture(); const response = await f.update(body);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Update inválido.' });
      expect(f.parsed).toHaveBeenCalledOnce(); expect(f.botCreations()).toBe(0);
      expect(f.requests).toEqual([]); expect(f.telegram).toEqual([]); expect(f.authReads()).toBe(0);
      expect(f.bodies).toEqual([]); expect(f.inserted).toEqual([]);
      expect.soft(JSON.stringify(f.logs())).not.toMatch(/TypeError|Cannot read|is not a function|startsWith|SYN_TG_ERROR_DETAIL/);
      expect(JSON.stringify(f.logs())).not.toContain('123:synthetic'); closed(f);
    });
});
