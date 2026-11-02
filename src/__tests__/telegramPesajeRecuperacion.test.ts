import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import ts from 'typescript';
import * as grammy from 'grammy';
import * as conversations from '@grammyjs/conversations';
import type { Update } from 'grammy/types';
import legacyState from './fixtures/telegramPesajeLegacyState.json';

// Run the original router and conversations through the real grammY replay
// engine. All database, Telegram, download and pipeline I/O stays synthetic.
// A fresh module cache simulates a new edge isolate over the same JSON storage.
const trees = ['src/supabase/functions/server', 'supabase/functions/make-server-1ccce916'];
type State = { version: number[]; state: Record<string, unknown[]> };
type User = { id: string; usuario_id: string | null; nombre_display: string; modulos_permitidos: string[] };
type Options = { registered?: boolean; lookupThrows?: boolean; missingKey?: boolean; staleAck?: boolean; preview?: boolean };

function fixture(tree: string, options: Options = {}) {
  const base = resolve(tree, 'telegram');
  const messages: string[] = [];
  const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];
  const storage = new Map<string, unknown>();
  const pipeline = vi.fn(() => ({ ok: true, resultado: {
    rosterAnimales: [], fechasPorSemana: {}, diff: [],
    ocr: { filasNoLeidas: [], vacasSinLeer: [], paginasNoLeidas: [] },
  } }));
  const attribution = vi.fn();
  const user: User = { id: 'synthetic-row', usuario_id: 'synthetic-user', nombre_display: 'Synthetic', modulos_permitidos: ['hato_produccion'] };
  let sequence = 0;
  let cache = new Map<string, Record<string, unknown>>();
  const db = { from(table: string) {
    const filters: Record<string, unknown> = {};
    const checkStorage = () => {
      if (!['telegram_sessions', 'telegram_conversations'].includes(table)) throw Error(`Unexpected database access: ${table}`);
    };
    const query = {
      select() { return query; },
      eq(key: string, value: unknown) { filters[key] = value; return query; },
      async single() {
        if (table === 'telegram_usuarios') return { data: options.registered === false ? null : user, error: null };
        checkStorage();
        const value = storage.get(`${table}:${filters.key}`);
        return value ? { data: { session: structuredClone(value) }, error: null } : { data: null, error: { code: 'PGRST116' } };
      },
      async maybeSingle() {
        if (table !== 'telegram_usuarios') throw Error(`Unexpected attribution access: ${table}`);
        attribution();
        if (options.lookupThrows) throw Error('Synthetic transport rejection: detail must stay out of chat');
        return { data: user, error: null };
      },
      async upsert(row: { key: string; session: unknown }) {
        checkStorage(); storage.set(`${table}:${row.key}`, structuredClone(row.session)); return { error: null };
      },
      delete() {
        checkStorage();
        return { async eq(_key: string, value: string) { storage.delete(`${table}:${value}`); return { error: null }; } };
      },
    };
    return query;
  } };
  const environment: Record<string, string> = {
    SUPABASE_URL: 'https://synthetic.invalid', SUPABASE_SERVICE_ROLE_KEY: 'synthetic',
    TELEGRAM_BOT_TOKEN: '123:synthetic', OPENROUTER_API_KEY: 'synthetic',
  };
  if (options.missingKey) delete environment.OPENROUTER_API_KEY;
  class Bot extends grammy.Bot {
    constructor(token: string, config: grammy.BotConfig<grammy.Context>) {
      super(token, { ...config, client: { fetch: async (url: string | URL | Request, init?: RequestInit) => {
        const method = String(url).split('/').pop()!;
        const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
        calls.push({ method, payload });
        let result: unknown = true;
        if (method === 'sendMessage') {
          messages.push(String(payload.text));
          result = { message_id: ++sequence, date: 1, chat: { id: 123, type: 'private' }, text: payload.text };
        } else if (method === 'answerCallbackQuery' && options.staleAck) {
          return new Response(JSON.stringify({ ok: false, error_code: 400, description: 'query is too old' }));
        } else if (!['setMyCommands', 'answerCallbackQuery', 'editMessageText', 'sendChatAction'].includes(method)) {
          throw Error(`Unexpected Telegram method: ${method}`);
        }
        return new Response(JSON.stringify({ ok: true, result }));
      } } });
    }
  }
  const forbidden = (name: string) => () => { throw Error(`Unexpected dependency: ${name}`); };
  const localFetch = async (url: string) => {
    if (!options.preview) throw Error('Unexpected download');
    if (url.startsWith('https://api.telegram.org/bot123:synthetic/getFile?')) {
      return new Response(JSON.stringify({ result: { file_path: 'synthetic.jpg' } }));
    }
    if (url === 'https://api.telegram.org/file/bot123:synthetic/synthetic.jpg') return new Response(new Uint8Array([1, 2]));
    throw Error('Unexpected fetch');
  };
  function load(file: string): Record<string, unknown> {
    const cached = cache.get(file);
    if (cached) return cached;
    const module = { exports: {} as Record<string, unknown> };
    cache.set(file, module.exports);
    let source = readFileSync(file, 'utf8');
    if (file === resolve(base, 'bot.ts')) source += '\nexport { getBot };\n';
    const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const requireModule = (specifier: string): unknown => {
      if (specifier === 'npm:grammy@1') return { ...grammy, Bot };
      if (specifier === 'npm:@grammyjs/conversations@2') return conversations;
      if (specifier === 'npm:@supabase/supabase-js@2') return { createClient: () => db };
      if (specifier.endsWith('hato-pesaje-pipeline.ts')) return {
        MAXIMO_FOTOS_PESAJE: 6, TIPOS_ACEPTADOS_FOTO_PESAJE: new Set(['image/jpeg']),
        ejecutarPipelinePesajeFoto: options.preview ? pipeline : forbidden('pipeline'),
        ejecutarCommitPesaje: forbidden('commit'), llamarModeloCorreccionPesaje: forbidden('model'),
      };
      if (specifier.endsWith('importHato/ocrPesaje.ts')) return { construirRosterPesaje: () => [], SEMANAS_PESAJE: [1, 2, 3, 4, 5] };
      if (specifier.startsWith('.')) {
        const target = resolve(dirname(file), specifier);
        if (['bot.ts', 'conversations/pesajeLeche.ts', 'conversations/eventoHato.ts', 'resolverUsuarioTelegram.ts'].includes(relative(base, target))) return load(target);
      }
      return new Proxy({}, { get(_target, key) { return key === '__esModule' ? true : forbidden(`${specifier}:${String(key)}`); } });
    };
    new Function('require', 'module', 'exports', 'Deno', 'fetch', javascript)(
      requireModule, module, module.exports, { env: { get: (key: string) => environment[key] } }, localFetch,
    );
    return module.exports;
  }
  function createBot() { return (load(resolve(base, 'bot.ts')).getBot as () => grammy.Bot)(); }
  let bot = createBot();
  async function update(value: unknown) {
    const before = messages.length;
    await bot.handleUpdate(value as Update);
    return messages.slice(before);
  }
  const from = { id: 123, is_bot: false, first_name: 'Synthetic' };
  const chat = { id: 123, type: 'private' };
  const send = (text: string) => update({ update_id: ++sequence, message: {
    message_id: sequence, date: 1, chat, from, text,
    ...(text.startsWith('/') ? { entities: [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }] } : {}),
  } });
  const callback = (data: string) => update({ update_id: ++sequence, callback_query: {
    id: String(sequence), from, chat_instance: 'synthetic', data, message: { message_id: 1, date: 1, chat },
  } });
  const photo = () => update({ update_id: ++sequence, message: { message_id: sequence, date: 1, chat, from,
    photo: [{ file_id: 'synthetic', file_unique_id: 'synthetic', width: 1, height: 1 }],
  } });
  return {
    send, callback, photo, messages, calls, storage, user, pipeline, attribution,
    state: () => structuredClone(storage.get('telegram_conversations:123')) as State | undefined,
    restart() { cache = new Map(); bot = createBot(); },
  };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => { throw Error('Live network forbidden in Telegram regression'); }));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe.each(trees)('recuperación de /pesaje: %s', (tree) => {
  it('avisa antes de que /evento consuma /pesaje y conserva el estado persistido', async () => {
    const f = fixture(tree); await f.send('/evento'); const before = f.state(); f.restart();
    expect((await f.send('/pesaje'))[0]).toMatch(/operación pendiente.*\/cancelar.*\/pesaje/s);
    expect(f.state()).toEqual(before); expect(f.attribution).not.toHaveBeenCalled();
  });
  it('avisa también con el botón del menú y reconoce el callback', async () => {
    const f = fixture(tree); await f.send('/evento'); const before = f.state();
    expect((await f.callback('start_pesajeLeche'))[0]).toContain('operación pendiente');
    expect(f.calls.some(c => c.method === 'answerCallbackQuery')).toBe(true);
    expect(f.state()).toEqual(before);
  });
  it.each(['mes', 'fotos', 'correcciones'])('conserva el propio pesaje pendiente en %s', async (stage) => {
    const f = fixture(tree, { preview: true }); await f.send('/pesaje');
    if (stage !== 'mes') await f.callback('mes_actual');
    if (stage === 'correcciones') { await f.photo(); await f.callback('fotos_listo'); }
    const before = f.state(); const pipelineCalls = f.pipeline.mock.calls.length; f.restart();
    expect((await f.send('/pesaje'))[0]).toContain('operación pendiente');
    expect(f.state()).toEqual(before); expect(f.pipeline).toHaveBeenCalledTimes(pipelineCalls);
    expect((await f.callback('start_pesajeLeche'))[0]).toContain('operación pendiente');
    expect(f.state()).toEqual(before);
  });
  it.each(['jornal', 'monitoreo', 'ingreso', 'cierreRonda', 'excepcionDavid'])('avisa sin reanudar el otro flujo %s', async (name) => {
    const f = fixture(tree); await f.send('/evento');
    const state = f.state()!; state.state[name] = state.state.eventoHato; delete state.state.eventoHato;
    f.storage.set('telegram_conversations:123', state); f.restart();
    expect((await f.send('/pesaje'))[0]).toContain('operación pendiente');
    expect(f.state()).toEqual(state);
  });
  it('mantiene /cancelar y permite iniciar un pesaje después', async () => {
    const f = fixture(tree); await f.send('/evento'); await f.send('/pesaje'); f.restart();
    expect((await f.send('/cancelar'))[0]).toContain('cancelada'); f.restart();
    expect((await f.send('/pesaje'))[0]).toContain('qué mes');
  });
  it.each(['/pesaje', 'botón'])('mantiene la autorización revocada sin borrar el borrador: %s', async (entry) => {
    const f = fixture(tree); await f.send('/evento'); const before = f.state(); f.user.modulos_permitidos = []; f.restart();
    expect((await (entry === '/pesaje' ? f.send(entry) : f.callback('start_pesajeLeche')))[0]).toContain('No tienes acceso');
    expect(f.state()).toEqual(before);
  });
  it('no permite entrar a un usuario sin registro', async () => {
    const f = fixture(tree, { registered: false }); expect((await f.send('/pesaje'))[0]).toContain('No estás registrado');
    expect(f.attribution).not.toHaveBeenCalled(); expect(f.state()).toBeUndefined();
  });
  it.each(['/pesaje', '/pesaje@escociaos_bot', '/pesaje con argumentos'])('inicia normalmente sin operación pendiente: %s', async (text) => {
    const f = fixture(tree); expect((await f.send(text))[0]).toContain('qué mes');
  });
  it('reconoce el sufijo propio y deja pasar el comando dirigido a otro bot', async () => {
    const f = fixture(tree); await f.send('/evento'); const before = f.state();
    expect((await f.send('/pesaje@escociaos_bot'))[0]).toContain('operación pendiente');
    expect(await f.send('/pesaje@otro_bot')).toEqual([]); expect(f.state()).toEqual(before);
  });
  it.each([false, true])('una confirmación de callback vencida no oculta la respuesta (pendiente=%s)', async (pending) => {
    const f = fixture(tree, { staleAck: true }); if (pending) await f.send('/evento');
    expect((await f.callback('start_pesajeLeche'))[0]).toContain(pending ? 'operación pendiente' : 'qué mes');
  });
  it('deja los botones del flujo en su conversación y no inventa nuevas entradas', async () => {
    const f = fixture(tree); await f.send('/evento'); const before = f.state();
    expect(await f.callback('mes_actual')).toEqual([]); expect(f.state()).toEqual(before);
    expect((await f.callback('cancel_flow'))[0]).toContain('cancelada');
  });
  it('conserva las fotos previas y reanuda el replay después del aviso', async () => {
    const f = fixture(tree, { preview: true }); await f.send('/pesaje'); await f.callback('mes_actual');
    expect((await f.photo())[0]).toContain('Foto 1 recibida'); const before = f.state(); f.restart();
    await f.send('/pesaje'); expect(f.state()).toEqual(before); f.restart();
    expect((await f.photo())[0]).toContain('Foto 2 recibida'); expect(f.attribution).toHaveBeenCalledTimes(1);
  });
  it('reanuda el estado creado por la fuente anterior sin repetir la atribución', async () => {
    // Captured synthetically at 95c85b3 before the fix, grammY 1.46.0 /
    // conversations 2.1.1. Contains one synthetic photo, no real user data.
    const f = fixture(tree);
    for (const [key, value] of Object.entries(legacyState)) f.storage.set(key, structuredClone(value));
    const before = f.state(); f.restart();
    expect((await f.send('/pesaje'))[0]).toContain('operación pendiente'); expect(f.state()).toEqual(before);
    f.restart(); expect((await f.photo())[0]).toContain('Foto 2 recibida');
    expect(f.attribution).not.toHaveBeenCalled(); expect(f.pipeline).not.toHaveBeenCalled();
  });
  it('no trata el estado transitorio de inventario como una conversación ni lo borra', async () => {
    const f = fixture(tree); const session = { pendienteNotaRonda: { tipo: 'proponer', excepcionId: 'synthetic' } };
    f.storage.set('telegram_sessions:123', session); f.restart();
    expect((await f.send('/pesaje'))[0]).toContain('qué mes'); expect(f.storage.get('telegram_sessions:123')).toEqual(session);
  });
  it('convierte una excepción de atribución en un mensaje seguro y permite reintentar', async () => {
    const options = { lookupThrows: true }; const f = fixture(tree, options);
    expect((await f.send('/pesaje'))[0]).toContain('No pude consultar tu cuenta');
    expect(f.messages.join('\n')).not.toContain('Synthetic transport');
    expect(f.state()?.state.pesajeLeche).toBeUndefined();
    options.lookupThrows = false; f.restart(); expect((await f.send('/pesaje'))[0]).toContain('qué mes');
  });
  it('conserva el rechazo explícito de una cuenta sin vínculo', async () => {
    const f = fixture(tree); f.user.usuario_id = null; expect((await f.send('/pesaje'))[0]).toContain('no está vinculada');
  });
  it('mantiene el límite de configuración y no procesa fotos sueltas', async () => {
    const f = fixture(tree, { missingKey: true }); expect((await f.send('/pesaje'))[0]).toContain('falta configuración');
    expect(await f.photo()).toEqual([]); expect(f.pipeline).not.toHaveBeenCalled();
  });
});

it('mantiene la paridad entre los árboles de Telegram y los endpoints web', () => {
  for (const file of ['telegram/bot.ts', 'telegram/conversations/pesajeLeche.ts', 'hato-pesaje-foto.ts', 'hato-pesaje-commit.ts']) {
    expect(readFileSync(resolve(trees[0], file), 'utf8')).toBe(readFileSync(resolve(trees[1], file), 'utf8'));
  }
});
