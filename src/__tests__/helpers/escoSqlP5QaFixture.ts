// Independent QA P5: real router and grammY; external transports closed and synthetic.
// Real grammY middleware, conversations and Supabase SDK; legacy loop mocked explicitly.
// Unentered write conversations are forbidden callbacks, as in the replay fixture.
import { expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
import * as grammy from 'grammy';
import * as conversations from '@grammyjs/conversations';
import { createClient } from '@supabase/supabase-js';
import { leerMultipartTelegramQa } from './escoSqlP5QaMultipart';

type Row = Record<string, unknown>;
const DB = 'https://telegram-handler-fixture.invalid';
const PRIVATE = ['SYN_TG_HISTORY_PERSON', 'SYN_TG_ASSISTANT_SALARY', 'SYN_TG_TOOL_NOTE',
  'SYN_TG_METADATA_PERSON', 'SYN_TG_QUOTED_PROVIDER', 'SYN_TG_RAW_EMPLOYEE', 'SYN_TG_ERROR_DETAIL'];
const QUESTION = 'Resumen de labores por lote del 2034-05-01 al 2034-05-07, jornales y costo registrado.';
const CHART = '```chart\n{"type":"bar","title":"FALSO","data":[{"x":"inventado","y":999}],"xKey":"x","yKey":"y"}\n```';
export interface Options {
  motor?: string | null; sqlSecret?: string | null; sqlStatus?: number; sqlBody?: unknown; sqlThrows?: boolean; htmlReject?: boolean; role?: string; profileActive?: boolean; freshModules?: string[]; sqlStream?: boolean;
  secret?: string | null; active?: boolean; modules?: string[];
  fresh?: 'linked' | 'unlinked' | 'revoked' | 'error';
  mode?: 'labor' | 'purchase' | 'source_error' | 'unsupported' | 'empty';
  telegramFailure?: boolean;
}


export async function fixture(options: Options = {}) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2034-05-08T17:00:00Z'));
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const inherited = vi.fn(async (): Promise<Response> => { throw Error('Inherited network forbidden'); });
  vi.stubGlobal('fetch', inherited);
  const environment: Record<string, string | undefined> = {
    ESCO_MOTOR_TELEGRAM: options.motor === null ? undefined : options.motor ?? 'sql',
    ESCO_TELEGRAM_SECRET: options.sqlSecret === null ? undefined : options.sqlSecret ?? 'synthetic-sql-secret',
    SUPABASE_URL: DB, SUPABASE_SERVICE_ROLE_KEY: 'synthetic-sdk-key', OPENROUTER_API_KEY: 'synthetic-model-key',
    TELEGRAM_BOT_TOKEN: '123:synthetic', TELEGRAM_WEBHOOK_SECRET: options.secret === null ? undefined : options.secret ?? 'synthetic-webhook-secret',
  };
  const rejected: string[] = [], envRejected: string[] = [];
  const deno = { env: { get(key: string) {
    if (!Object.prototype.hasOwnProperty.call(environment, key)) { envRejected.push(key); throw Error('Closed environment'); }
    return environment[key];
  } } };
  vi.stubGlobal('Deno', deno);
  const state = { linked: true, active: true, modules: options.modules ?? ['consultas'], role: options.role ?? 'Gerencia', profileActive: options.profileActive !== false };
  const sql: Array<{ request: Request; body: Row }> = [];
  const stream = { pulls: 0, canceled: false };
  const legacy = vi.fn(async () => ({ text: 'SYN_LEGACY_RESPONSE', toolInteractions: [] }));
  const bodies: Row[] = [], requests: Array<{ method: string; url: URL; body?: unknown }> = [];
  const telegram: Array<{ method: string; payload: Row; messageId: number; files: Record<string, Uint8Array> }> = [], inserted: Row[] = [];
  const historyReturned: Row[][] = [];
  const storage = new Map<string, unknown>();
  const user = { id: 'telegram-fixture-row', telegram_id: 123, activo: options.active !== false,
    usuario_id: '11111111-1111-4111-8111-111111111111', nombre_display: 'Cuenta sintética', modulos_permitidos: options.modules ?? ['consultas'] };
  const conversationId = '22222222-2222-4222-8222-222222222222';
  const conversationsDb: Row[] = [{id:conversationId,user_id:user.usuario_id,updated_at:new Date().toISOString()}];
  const history: Row[] = [
    { id: 'history-u', role: 'user', content: `Consulta personal antigua ${PRIVATE[0]}; compras por proveedor ${PRIVATE[4]}; salario y observaciones ${PRIVATE[3]}`, created_at: '2034-05-08T16:00:00Z' },
    { id: 'history-a', role: 'assistant', content: PRIVATE[1] + CHART, created_at: '2034-05-08T16:01:00Z', metadata: {
      tool_interactions: [{ tool: 'get_employee_activity', args: { employee_name: PRIVATE[3] }, result_summary: PRIVATE[2] }],
      application_cohort: PRIVATE[3], memorias: PRIVATE[3],
    } },
    { id: 'history-t', role: 'tool', content: PRIVATE[2], created_at: '2034-05-08T16:02:00Z' },
  ].map(row => ({ conversation_id: conversationId, ...row }));
  let authReads = 0, botCreations = 0, htmlRejected = false, messageId = 100;
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
      if (op === 'eq') return String(key === 'metadata->>motor' ? (row.metadata as Row)?.motor : row[key]) === value;
      if (op === 'gte') return String(row[key]) >= value;
      if (op === 'lte') return String(row[key]) <= value;
      if (op === 'in') return value.slice(1, -1).split(',').map(v => v.replace(/^"|"$/g, '')).includes(String(row[key]));
      rejected.push(`filter:${key}:${op}`); throw Error('Closed REST filter');
    }));
  }
  const closedFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, { ...init, signal: undefined }), url = new URL(request.url);
    if (url.origin === DB && url.pathname === '/functions/v1/esco-consultas' && request.method === 'POST') {
      const body = await request.json() as Row; sql.push({ request, body });
      if (options.sqlThrows) throw Error('SYN_P5_ERROR_DETAIL');
      if (options.sqlStream) return new Response(new ReadableStream({
        pull(controller) { stream.pulls++; controller.enqueue(new Uint8Array(65536).fill(32)); if (stream.pulls >= 100) controller.close(); },
        cancel() { stream.canceled = true; },
      }), { headers: { 'Content-Type': 'application/json' } });
      return Response.json(options.sqlBody ?? respuesta(), { status: options.sqlStatus ?? 200 });
    }
    if (url.origin !== DB || !/^\/rest\/v1\/[a-z_]+$/.test(url.pathname)) {
      rejected.push(`${request.method} ${url.origin}${url.pathname}`); throw Error('Closed HTTP route');
    }
    const table = url.pathname.slice('/rest/v1/'.length), method = request.method;
    const body = method === 'POST' ? JSON.parse(await request.text()) as Row : undefined;
    requests.push({ method, url, body });
    if (method === 'POST') {
      if (["telegram_sessions", "telegram_conversations"].includes(table)) {
        if (String(body!.key).startsWith("esco-sql-context:v1:")) {
          expect(table).toBe("telegram_sessions");
          expect(Object.keys(body!).sort()).toEqual(["key", "session"]);
          expect(body!.key).toBe(
            `esco-sql-context:v1:${user.usuario_id}:${
              (body!.session as Row).telegramId
            }:${(body!.session as Row).chatId}`,
          );
          const merge = request.headers.get("prefer")?.includes(
            "resolution=merge-duplicates",
          );
          if (!merge && storage.has(`${table}:${body!.key}`)) {
            return Response.json({
              code: "23505",
              message: "Synthetic authority already initialized",
            }, { status: 409 });
          }
        }
        storage.set(`${table}:${body!.key}`, structuredClone(body!.session));
        return new Response(null, { status: 201 });
      }
      if (table === "chat_conversations") {
        expect(body!.user_id).toBe(user.usuario_id);
        const created = {
          ...structuredClone(body!),
          id: crypto.randomUUID(),
          updated_at: new Date().toISOString(),
        };
        conversationsDb.push(created);
        return Response.json(created, { status: 201 });
      }
      if (table === "chat_messages") {
        const batch = Array.isArray(body) ? body as Row[] : [body!];
        for (const row of batch) {
          expect(
            conversationsDb.some((conv) => conv.id === row.conversation_id),
          ).toBe(true);
        }
        const bulk = Array.isArray(body);
        if (!bulk && history.some((row) => row.id === body!.id)) {
          return Response.json({
            code: "23505",
            message: "Synthetic duplicate",
          }, { status: 409 });
        }
        for (const row of batch) {
          inserted.push(structuredClone(row));
          const i = history.findIndex((old) => old.id === row.id);
          if (i >= 0) history[i] = structuredClone(row);
          else history.push(structuredClone(row));
        }
        return new Response(null, { status: 201 });
      }
      rejected.push(`POST:${table}`); throw Error('Closed persistence table');
    }
    if (method !== 'GET') { rejected.push(`${method}:${table}`); throw Error('Closed method'); }
    const p = url.searchParams;
    let rows: Row[];
    if (table === 'telegram_usuarios') {
      authReads++;
      expect(p.get('telegram_id')).toMatch(/^eq\.(123|124)$/); expect(p.get('activo')).toBe('eq.true');
      if (authReads > 1 && options.fresh === 'error') return Response.json({ message: PRIVATE[6] }, { status: 503 });
      rows = options.active === false || !state.active || authReads > 1 && options.fresh === 'revoked' ? [] : [{ ...user, telegram_id: Number(p.get('telegram_id')?.slice(3)), modulos_permitidos: authReads > 1 && options.freshModules ? options.freshModules : state.modules, ...(state.linked ? {} : { usuario_id: null }),
        ...(authReads > 1 && options.fresh === 'unlinked' ? { usuario_id: null } : {}),
      }];
    } else if (table === 'usuarios') {
      rows = [{ id: user.usuario_id, rol: state.role, activo: state.profileActive }];
    } else if (['telegram_sessions', 'telegram_conversations'].includes(table)) {
      const key = p.get('key')?.slice(3); const session = storage.get(`${table}:${key}`);
      rows = session ? [{ key, session }] : [];
    } else if (table === 'chat_conversations') {
      expect(p.get('user_id')).toBe(`eq.${user.usuario_id}`);
      if(p.has('updated_at'))expect(p.get('updated_at')).toMatch(/^gte\./);
      else expect(p.get('id')).toMatch(/^eq\.[0-9a-f-]{36}$/);
      rows = conversationsDb;
    } else if (table === 'chat_messages') {
      if(p.get('conversation_id')===null) {
        expect([...p.keys()].sort()).toEqual(['id','select']);expect(p.get('select')).toBe('id');expect(p.get('id')).toMatch(/^eq\.[0-9a-f-]{36}$/);
      } else expect(conversationsDb.some(row=>p.get('conversation_id')===`eq.${row.id}`)).toBe(true);
      rows = [...history].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))||String(b.id).localeCompare(String(a.id)));
    } else if (Object.prototype.hasOwnProperty.call(tables, table)) {
      if (table === 'registros_trabajo' && options.mode === 'source_error') return Response.json({ message: PRIVATE[6] }, { status: 503 });
      rows = tables[table];
    } else { rejected.push(`GET:${table}`); throw Error('Closed source table'); }
    rows = filtered(rows, p);
    const total = rows.length, offset = Number(p.get('offset') ?? 0);
    rows = rows.slice(offset, offset + Number(p.get('limit') ?? 200));
    if (p.get('select') && p.get('select') !== '*') rows = rows.map(row => Object.fromEntries(p.get('select')!.split(',').filter(key => key in row).map(key => [key, row[key]])));
    if (table === 'chat_messages') historyReturned.push(structuredClone(rows));
    const headers = { 'content-range': rows.length ? `${offset}-${offset + rows.length - 1}/${total}` : `*/${total}` };
    if (request.headers.get('accept')?.includes('vnd.pgrst.object+json')) {
      return rows.length === 1 ? Response.json(rows[0], { headers })
        : Response.json({ code: 'PGRST116', message: 'Synthetic absent row' }, { status: 406, headers });
    }
    return Response.json(rows, { headers });
  };
  vi.stubGlobal('fetch', closedFetch);
  // Only the legacy loop is mocked; SQL client/session/render code stays real.
  const chatExports = { llmToolLoop: legacy, getSystemPrompt: () => 'Synthetic prompt', conservarCohorteAplicaciones: async () => null };
  const resvg = await import('@resvg/resvg-wasm');
  const cache = new Map<string, Record<string, unknown>>();
  const base = resolve('src/supabase/functions/server/telegram');
  class Bot extends grammy.Bot {
    constructor(token: string, config: grammy.BotConfig<grammy.Context>) {
      botCreations++;
      super(token, { ...config, client: { fetch: async (input: string | URL | Request, init?: RequestInit) => {
        try {
        // grammY supplies a realm-specific AbortSignal; only serialize its payload here.
        const request = new Request(input, { ...init, signal: undefined, duplex: 'half' } as RequestInit), url = new URL(request.url), method = url.pathname.split('/').pop()!;
        const payload: Row = {}, files: Record<string, Uint8Array> = {};
        if (request.headers.get('content-type')?.includes('multipart/form-data')) {
          for (const [key, value] of await leerMultipartTelegramQa(request)) {
            if (typeof value === 'string') payload[key] = value;
            else { payload[key] = value.name; files[key] = new Uint8Array(await value.arrayBuffer()); }
          }
        } else Object.assign(payload, await request.json());
        telegram.push({ method, payload, files, messageId: ++messageId });
        if (url.origin !== 'https://api.telegram.org' || !['sendMessage', 'sendChatAction', 'setMyCommands', 'sendPhoto', 'sendDocument', 'answerCallbackQuery', 'editMessageReplyMarkup'].includes(method)) {
          rejected.push(`Telegram:${method}`); throw Error('Closed Telegram method');
        }
        if (method === 'sendMessage' && options.htmlReject && payload.parse_mode === 'HTML' && !htmlRejected) {
          htmlRejected = true;
          return Response.json({ ok: false, error_code: 400, description: "Bad Request: can't parse entities: unsupported start tag" }, { status: 400 });
        }
        if (method === 'sendMessage' && options.telegramFailure) {
          return Response.json({ ok: false, error_code: 403, description: PRIVATE[6] }, { status: 403 });
        }
        return Response.json({ ok: true, result: ['sendMessage', 'sendPhoto', 'sendDocument'].includes(method)
          ? { message_id: messageId, date: 1, chat: { id: 123, type: 'private' }, text: payload.text } : true });
        } catch (e) { rejected.push('telegram-fixture:' + String(e)); throw e; }
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
      if (specifier === '@resvg/resvg-wasm') return resvg;
      const local = specifier.startsWith('.') ? resolve(dirname(file), specifier) : '';
      if (local && (specifier.endsWith('resolverUsuarioTelegram.ts') || specifier.endsWith('escoCohorteAplicaciones.ts') || (/\/telegram\/escoSql[^/]*\.ts$/.test(local) || /\/telegram\/vendor\/escoSql(?:Wasm|Font|FontCoverage)\.ts$/.test(local)))) return load(local);
      if (['@esco-sql/formato.ts', '@esco-sql/bloques.ts', '@esco-sql/respuesta.ts', '@esco-sql/historial.ts', '@esco-sql/turno.ts'].includes(specifier)) return load(resolve('src/utils/escoSql', specifier.slice('@esco-sql/'.length)));
      if (local && /\/utils\/escoSql\/(?:formato|bloques|respuesta|historial|turno)\.ts$/.test(local)) return load(local);

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
  let updateId = 0;
  async function send(question = QUESTION, secret: string | null = 'synthetic-webhook-secret') {
    const body = { update_id: ++updateId, message: { message_id: updateId, date: 2034, chat: { id: 123, type: 'private' },
      from: { id: 123, is_bot: false, first_name: 'Synthetic' }, text: question,
      reply_to_message: { message_id: 99, date: 1, chat: { id: 123, type: 'private' },
        from: { id: 456, is_bot: false, first_name: PRIVATE[4] }, text: PRIVATE[4] + CHART },
    } };
    return update(body, secret);
  }
  async function tap(data: string, messageId: number, from = 123, chat = 123) {
    return update({ update_id: ++updateId, callback_query: { id: 'qa-' + updateId, data, from: { id: from, is_bot: false, first_name: 'Synthetic' }, chat_instance: 'qa', message: { message_id: messageId, date: 2034, chat: { id: chat, type: 'private' }, from: { id: 8759479581, is_bot: true, first_name: 'Bot' }, text: 'Synthetic answer' } } });
  }
  return { send, update, tap, state, environment, sql, stream, legacy, parsed, bodies, requests, inserted, telegram, rejected, envRejected, inherited, historyReturned,
    logs: () => [...log.mock.calls, ...warn.mock.calls, ...error.mock.calls].map(call => call.map(value =>
      value instanceof Error ? { ...value, name: value.name, message: value.message, stack: value.stack } : value)),
    authReads: () => authReads, botCreations: () => botCreations,
    replies: () => telegram.filter(c => c.method === 'sendMessage').map(c => String(c.payload.text)).join('\n') };
}

export function respuesta(overrides: Row = {}) {
  return { motor: 'sql', texto: 'Respuesta sintética', bloques: [], sugerencias: ['Ver tendencia'], consultas: [{ sql: 'SELECT 1 AS total', proposito: 'Control sintético', n_filas: 1, truncado: false, error: null, ms: 1 }], ms: 2, ...overrides };
}
export type Fixture = Awaited<ReturnType<typeof fixture>>;
export function closed(f: Fixture) { expect(f.rejected).toEqual([]); expect(f.envRejected).toEqual([]); expect(f.inherited).not.toHaveBeenCalled(); for (const r of f.requests) expect(r.url.pathname).toMatch(/^\/rest\/v1\/(telegram_sessions|telegram_conversations|telegram_usuarios|usuarios|chat_conversations|chat_messages)$/); }
export function buttons(f: Fixture) {
  return f.telegram.flatMap(t => {
    const markup = typeof t.payload.reply_markup === 'string' ? JSON.parse(t.payload.reply_markup) as Row : t.payload.reply_markup as Row | undefined;
    const rows = markup?.inline_keyboard as Array<Array<{ text: string; callback_data: string }>> | undefined;
    return (rows ?? []).flat().map(b => ({ ...b, messageId: Number(t.payload.message_id ?? t.messageId) }));
  });
}
