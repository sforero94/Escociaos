import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
import { esConsultaGrupoEsco } from '../../supabase/functions/make-server-1ccce916/telegram/politicaGrupoEsco';
import { cuentaActivaTelegram } from '../../supabase/functions/make-server-1ccce916/telegram/cuentaActivaTelegram';

import { handleHatoUndoReview } from '../../supabase/functions/make-server-1ccce916/telegram/hatoUndoReview';

const undoTarget = '22222222-2222-4222-8222-222222222222';
const undoKey = '33333333-3333-4333-8333-333333333333';
const id = '11111111-1111-4111-8111-111111111111';
let registration: unknown; let profiles: unknown; let fail: string | null;
let calls: Array<{ path: string; method: string }>; let profileReads: number;
let revoked: boolean;
const client = () => createClient('https://supabase.invalid', 'test-key', { auth: { persistSession: false, autoRefreshToken: false } });
beforeEach(() => {
  registration = [{ usuario_id: id, activo: true, modulos_permitidos: ['consultas'] }];
  profiles = [{ id, activo: true, rol: 'Gerencia' }]; fail = null; revoked = false; calls = []; profileReads = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, opts?: RequestInit) => {
    const u = new URL(String(input)); calls.push({ path: u.pathname, method: opts?.method ?? 'GET' });
    let body: unknown = [];
    if (u.pathname.includes('/rpc/fn_hato_undo_review_')) {
      const profile = Array.isArray(profiles) && profiles.length === 1 ? profiles[0] : null;
      const roleAllowed = profile && profile.id === id && profile.activo === true && profile.rol === 'Gerencia';
      const deliveryRevoked = revoked && u.pathname.endsWith('/fn_hato_undo_review_deliver');
      if (!roleAllowed || deliveryRevoked) return new Response(JSON.stringify({message:'Current active Gerencia required'}), {status:403,headers:{'content-type':'application/json'}});
      body = {version:1,key:undoKey,state:'pending',receipt:null,animal:{numero:157,nombre:'ALINA'},payload:{actor:id,sender:123,operation:'treatment',target_id:undoTarget,
        snapshot:{target:{id:undoTarget,animal_id:id,fuente:'telegram',estado:'activo',chequeo_id:null,nombre:'Tratamiento'},steps:[]}}};
    }
    if (u.pathname.endsWith('/telegram_usuarios')) {
      const accept = new Headers(opts?.headers).get('accept');
      body = accept?.includes('application/vnd.pgrst.object+json') && Array.isArray(registration)
        ? registration[0] ?? null : registration;
    }
    if (u.pathname.endsWith('/usuarios')) { profileReads++; body = revoked && profileReads > 1 ? [{ id, activo: false, rol: 'Gerencia' }] : profiles; }
    if (u.pathname.endsWith('/hato_tratamientos')) body = { id: 'event', fuente: 'telegram', hato_tratamiento_pasos: [] };
    if (u.pathname.endsWith('/hato_eventos')) body = null;
    return new Response(JSON.stringify(fail === u.pathname ? { message: 'offline' } : body), {
      status: fail === u.pathname ? 503 : 200, headers: { 'content-type': 'application/json' },
    });
  }));
});
afterEach(() => vi.unstubAllGlobals());

function load(source: string, locate: (n: ts.Node) => boolean, dependencies: Record<string, unknown>) {
  const sf = ts.createSourceFile('bot.ts', source, ts.ScriptTarget.Latest, true);
  let found: ts.Node | undefined;
  const visit = (n: ts.Node) => { if (!found && locate(n)) found = n; ts.forEachChild(n, visit); };
  visit(sf); if (!found) throw Error('handler not found');
  const text = ts.transpileModule(`const handler = ${found.getText(sf)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  return new Function(...Object.keys(dependencies), `${text}; return handler;`)(...Object.values(dependencies));
}
function callback(source: string, route: string) {
  return load(source, n => ts.isArrowFunction(n) && ts.isCallExpression(n.parent)
    && n.parent.expression.getText().includes('bot.callbackQuery') && n.parent.arguments[0].getText().includes(route), {
    getSupabaseAdmin: client, handleHatoUndoReview,
  });
}
for (const root of ['src/supabase/functions/server', 'supabase/functions/make-server-1ccce916']) {
  const source = readFileSync(`${root}/telegram/bot.ts`, 'utf8');
  describe(root, () => {
    it('requires fresh Gerencia on all four approval callback stages before domain reads or writes', async () => {
      const sf = ts.createSourceFile('bot.ts', source, ts.ScriptTarget.Latest, true);
      const nodes: ts.Node[] = [];
      const visit = (node: ts.Node) => {
        if (ts.isArrowFunction(node) && ts.isCallExpression(node.parent)
          && node.parent.expression.getText(sf) === 'bot.callbackQuery'
          && node.parent.arguments[0].getText(sf).startsWith('/^rda:')) nodes.push(node);
        ts.forEachChild(node, visit);
      };
      visit(sf); expect(nodes).toHaveLength(4);
      for (const node of nodes) {
        const permission = vi.fn(async () => false);
        const handler = load(source, candidate => candidate.getText() === node.getText(sf), { tieneAccesoAprobacionGerencia: permission });
        const ctx = { answerCallbackQuery: vi.fn(), telegramUser: { id: 'registration' }, match: ['data', 'id'] };
        await handler(ctx);
        expect(permission).toHaveBeenCalledWith(ctx);
        expect(ctx.answerCallbackQuery).toHaveBeenCalledOnce();
      }
    });
    for (const route of ['hato_ev_undo', 'hato_tr_undo']) {
      it.each(['Administrador', 'Monitor', 'Verificador'])(`${route} denies fresh %s before domain reads`, async rol => {
        profiles = [{ id, activo: true, rol }]; const ctx = { from: { id: 123 }, chat: {id:123,type:'private'}, callbackQuery: { data: `${route}:${undoTarget}` },
          answerCallbackQuery: vi.fn(async()=>{}), api:{sendMessage:vi.fn(async()=>({message_id:77,chat:{id:123}}))} };
        await callback(source, route)(ctx);
        expect(calls).toEqual([{path:'/rest/v1/rpc/fn_hato_undo_review_begin',method:'POST'}]);
        expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('No se confirmó') }));
      });
    }
    it('rechecks current treatment authority after DM delivery and preserves the server attempt on revocation', async () => {
      revoked = true; const ctx = { from: { id: 123 }, chat:{id:123,type:'private'}, callbackQuery: { data:`hato_tr_undo:${undoTarget}` },
        answerCallbackQuery:vi.fn(async()=>{}),api:{sendMessage:vi.fn(async()=>({message_id:77,chat:{id:123}}))} };
      await callback(source, 'hato_tr_undo')(ctx);
      expect(calls.map(c=>c.path)).toEqual(['/rest/v1/rpc/fn_hato_undo_review_begin','/rest/v1/rpc/fn_hato_undo_review_deliver']);
      expect(calls.every(c => c.method === 'POST' && c.path.includes('/rpc/'))).toBe(true);
    });
    it('forwarded undo button cannot inherit private message or sender authority', async () => {
      const ctx={from:{id:456},chat:{id:-99,type:'group'},callbackQuery:{data:`hato_tr_undo:${undoKey}:c`,message:{message_id:77}},
        answerCallbackQuery:vi.fn(),api:{sendMessage:vi.fn()}};
      await callback(source,'hato_tr_undo')(ctx);expect(calls).toEqual([]);expect(ctx.api.sendMessage).not.toHaveBeenCalled();
      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith({text:'Abre el chat privado con Esco para revisar esta operación.'});
    });
    it.each([false, true])('keeps every Esco answer private, long text=%s', async long => {
      const sent: Array<{ destination: number; text: string }> = []; const secret = 'SECRET'.repeat(long ? 900 : 1);
      const ctx = { from: { id: 123 }, chat: { id: -100, type: 'group' }, message: { text: 'question' },
        reply: vi.fn(async (text: string) => { sent.push({ destination: -100, text }); }),
        api: { sendMessage: vi.fn(async (destination: number, text: string) => { sent.push({ destination, text }); }), sendChatAction: vi.fn(), sendPhoto: vi.fn() } };
      const handler = load(source, n => ts.isFunctionDeclaration(n) && n.name?.text === 'responderConsultaEsco', {
        cuentaActivaTelegram, getSupabaseAdmin: client,
        getOrCreateTelegramConversation: vi.fn(async () => 'conversation'), saveTelegramMessage: vi.fn(),
        buildTelegramLlmMessages: vi.fn(async () => []), llmToolLoop: vi.fn(async () => ({ text: secret, toolInteractions: [] })),
        findMemoryProposal: () => null, extractChartsAndText: (text: string) => ({ textParts: [text], charts: [] }),
        formatForTelegram: (text: string) => text, splitMessage: (text: string, max: number) => text.match(new RegExp(`.{1,${max}}`, 'g')),
      });
      await handler(ctx, true);
      expect(sent.filter(x => x.destination === -100).every(x => !x.text.includes('SECRET'))).toBe(true);
      expect(sent.filter(x => x.destination === 123).map(x => x.text).join('')).toContain(secret);
    });
    it('refuses group inference/persistence when private delivery cannot start', async () => {
      const llm = vi.fn(); const persist = vi.fn();
      const ctx = { from: { id: 123 }, chat: { id: -100, type: 'group' }, message: { text: 'question' }, reply: vi.fn(),
        api: { sendMessage: vi.fn(async () => { throw Error('DM unavailable'); }), sendChatAction: vi.fn() } };
      const handler = load(source, n => ts.isFunctionDeclaration(n) && n.name?.text === 'responderConsultaEsco', {
        cuentaActivaTelegram, getSupabaseAdmin: client, llmToolLoop: llm, saveTelegramMessage: persist,
      });
      await handler(ctx, true); expect(llm).not.toHaveBeenCalled(); expect(persist).not.toHaveBeenCalled();
    });
    it('keeps proposals, chart captions, Markdown fallback and processing errors private', async () => {
      const messages: Array<{ destination: number; text: string }> = [];
      const photos: Array<{ destination: number; caption: string }> = [];
      const ctx = { from: { id: 123 }, chat: { id: -100, type: 'group' }, message: { text: 'question' },
        reply: vi.fn(async (text: string) => { messages.push({ destination: -100, text }); }),
        api: { sendMessage: vi.fn(async (destination: number, text: string, options?: { parse_mode?: string }) => {
          messages.push({ destination, text });
          if (options?.parse_mode) throw Error('invalid Markdown');
        }), sendChatAction: vi.fn(), sendPhoto: vi.fn(async (destination: number, _url: string, options: { caption: string }) => {
          photos.push({ destination, caption: options.caption });
        }) } };
      class Keyboard { text() { return this; } }
      const llm = vi.fn(async () => ({ text: 'SECRET response', toolInteractions: [] }));
      const handler = load(source, n => ts.isFunctionDeclaration(n) && n.name?.text === 'responderConsultaEsco', {
        cuentaActivaTelegram, getSupabaseAdmin: client, InlineKeyboard: Keyboard,
        getOrCreateTelegramConversation: vi.fn(async () => 'conversation'), saveTelegramMessage: vi.fn(),
        buildTelegramLlmMessages: vi.fn(async () => []), llmToolLoop: llm,
        findMemoryProposal: () => ({ token: 'token', content: 'SECRET memory' }),
        extractChartsAndText: () => ({ textParts: ['SECRET response'], charts: [{ title: 'SECRET chart' }] }),
        formatForTelegram: (text: string) => text, buildQuickChartUrl: () => 'https://chart.invalid/synthetic',
      });
      await handler(ctx, true);
      expect(messages.some(x => x.destination === 123 && x.text.includes('SECRET memory'))).toBe(true);
      expect(messages.filter(x => x.destination === -100).every(x => !x.text.includes('SECRET'))).toBe(true);
      expect(photos).toEqual([{ destination: 123, caption: 'SECRET chart' }]);
      llm.mockRejectedValueOnce(Error('SECRET failure'));
      await handler(ctx, true);
      expect(messages.at(-1)).toEqual({ destination: 123, text: 'Hubo un error al procesar tu consulta. Intenta de nuevo.' });
    });
    it('blocks linked inactive identities before conversation resume and preserves unlinked registration', async () => {
      const handler = load(source, n => ts.isArrowFunction(n) && ts.isCallExpression(n.parent)
        && n.parent.expression.getText() === 'bot.use' && n.getText().includes('linkedProfile'), { getSupabaseAdmin: client });
      const ctx = { from: { id: 123 }, message: { text: '/jornal' }, reply: vi.fn(), telegramUser: null };
      for (const rows of [[], [{ id, activo: false }], [{ id, activo: null }], [{ id: 'foreign', activo: true }]]) {
        profiles = rows; const next = vi.fn(); await handler(ctx, next); expect(next).not.toHaveBeenCalled();
      }
      fail = '/rest/v1/usuarios'; const blocked = vi.fn(); await handler(ctx, blocked); expect(blocked).not.toHaveBeenCalled();
      fail = null; profiles = [{ id, activo: true }]; const linked = vi.fn(); await handler(ctx, linked); expect(linked).toHaveBeenCalledOnce();
      registration = [{ usuario_id: null, activo: true }]; const unlinked = vi.fn(); await handler(ctx, unlinked); expect(unlinked).toHaveBeenCalledOnce();
    });
    it('routes groups before shared session/conversation middleware', async () => {
      const next = vi.fn(); const responder = vi.fn(); const ctx = { chat: { type: 'supergroup' }, me: { id: 987, username: 'escociaos_bot' }, from: { id: 123 }, message: { text: '@escociaos_bot question', entities: [{ type: 'mention', offset: 0, length: 14 }] }, reply: vi.fn() };
      const handler = load(source, n => ts.isArrowFunction(n) && ts.isCallExpression(n.parent)
        && n.parent.expression.getText() === 'bot.use' && n.getText().includes('responderConsultaEsco'), { responderConsultaEsco: responder, esConsultaGrupoEsco });
      await handler(ctx, next); expect(next).not.toHaveBeenCalled(); expect(responder).toHaveBeenCalledWith(ctx, true);
      ctx.message.text = '/start credential'; await handler(ctx, next);
      expect(responder).toHaveBeenCalledTimes(1); expect(ctx.reply).toHaveBeenCalled();
    });
  });
}
describe('fresh linked admission', () => {
  it.each([undefined, 0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])('rejects invalid sender %s', async sender => {
    expect(await cuentaActivaTelegram(client(), sender)).toBeNull(); expect(calls).toEqual([]);
  });
  it('requires unique active registration and exact active matching profile', async () => {
    for (const rows of [[], [{ usuario_id: id, activo: false }], [{ usuario_id: id, activo: true }, { usuario_id: id, activo: true }]]) {
      registration = rows; expect(await cuentaActivaTelegram(client(), 123)).toBeNull();
    }
    registration = [{ usuario_id: id, activo: true, modulos_permitidos: ['consultas'] }];
    for (const rows of [[], [{ id: 'foreign', activo: true, rol: 'Gerencia' }], [{ id, activo: false, rol: 'Gerencia' }]]) {
      profiles = rows; expect(await cuentaActivaTelegram(client(), 123)).toBeNull();
    }
  });
  it('requires current module grant and fails closed on SDK errors', async () => {
    expect(await cuentaActivaTelegram(client(), 123, 'missing')).toBeNull();
    fail = '/rest/v1/usuarios'; expect(await cuentaActivaTelegram(client(), 123, 'consultas')).toBeNull();
  });
});
