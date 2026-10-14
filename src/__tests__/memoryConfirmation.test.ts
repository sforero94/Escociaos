import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
import * as source from '../supabase/functions/server/memory-confirmation';
import * as deployed from '../../supabase/functions/make-server-1ccce916/memory-confirmation';
import { cuentaActivaTelegram } from '../../supabase/functions/make-server-1ccce916/telegram/cuentaActivaTelegram';

const owner = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const token = 'mem_synthetic_33333333-3333-4333-8333-333333333333';
const receipt = { saved: true, id, saved_at: '2026-10-10T10:00:00Z', content: 'Exact proposed content', replayed: false };
const roots = ['src/supabase/functions/server', 'supabase/functions/make-server-1ccce916'];
let calls: Array<{ path: string; method: string; body: Record<string, unknown> | undefined }>;
let profile: unknown;
let registration: unknown;
let rpcFailure: string | null;
let overrideResult: unknown;
const client = () => createClient('https://supabase.invalid', 'synthetic-service', { auth: { persistSession: false, autoRefreshToken: false } });
beforeEach(() => {
  calls = []; profile = [{ id: owner, activo: true, rol: 'Gerencia' }]; rpcFailure = null; overrideResult = undefined;
  registration = [{ usuario_id: owner, activo: true, modulos_permitidos: ['consultas'] }];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const body = typeof options?.body === 'string' ? JSON.parse(options.body) : undefined;
    calls.push({ path: url.pathname, method: options?.method ?? 'GET', body });
    let data: unknown;
    if (url.pathname === '/rest/v1/usuarios') data = profile;
    else if (url.pathname === '/rest/v1/telegram_usuarios') data = registration;
    else if (url.pathname === '/rest/v1/rpc/esco_purge_memory_confirmation_payloads') data = { receipts_purged: 0, proposals_purged: 0 };
    else if (url.pathname === '/rest/v1/rpc/esco_register_memory_proposal') data = overrideResult ?? { _memory_proposal: true, token: body.p_token, content: body.p_content, reason: body.p_reason };
    else if (url.pathname === '/rest/v1/rpc/esco_confirm_telegram_memory') data = overrideResult ?? receipt;
    else throw new Error(`Unexpected history/direct-memory/model request ${url}`);
    const failed = rpcFailure && url.pathname.endsWith(rpcFailure);
    return new Response(JSON.stringify(failed ? { message: 'synthetic denied' } : data), {
      status: failed ? 403 : 200, headers: { 'Content-Type': 'application/json' },
    });
  }));
});
afterEach(() => vi.unstubAllGlobals());

function extract(root: string, file: string, name: string, dependencies: Record<string, unknown>) {
  const text = readFileSync(`${root}/${file}`, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  let found: ts.Node | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    if (name === 'mem_save' && ts.isArrowFunction(node) && ts.isCallExpression(node.parent)
      && node.parent.expression.getText(sf) === 'bot.callbackQuery' && node.parent.arguments[0].getText(sf).includes('mem_save:')) found = node;
    ts.forEachChild(node, visit);
  };
  visit(sf); if (!found) throw new Error(`Missing ${name}`);
  const js = ts.transpileModule(`const handler = ${found.getText(sf)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(dependencies), `${js};return handler;`)(...Object.values(dependencies));
}

for (const [index, helpers] of [source, deployed].entries()) {
  describe(`${roots[index]} durable memory callers with actual SDK`, () => {
    it('registers a canonical exact owner-bound payload with a trusted cryptographic token', async () => {
      const proposal = await helpers.registrarPropuestaMemoria(client(), owner, { content: '  ' + 'x'.repeat(700) + '  ', reason: ' because ' });
      expect(proposal.content).toBe('x'.repeat(500)); expect(proposal.reason).toBe('because');
      expect(proposal.token).toMatch(/^mem_[a-z0-9]+_[a-f0-9-]{36}$/);
      expect(Buffer.byteLength('mem_save:' + proposal.token)).toBeLessThanOrEqual(64);
      expect(calls.map(c => c.path)).toEqual(['/rest/v1/rpc/esco_purge_memory_confirmation_payloads', '/rest/v1/rpc/esco_register_memory_proposal']);
      expect(calls[1].body).toEqual({ p_owner_id: owner, p_token: proposal.token, p_content: proposal.content, p_reason: 'because' });
    });
    it('confirms only through the exact RPC after fresh active linked consultation admission', async () => {
      expect(await helpers.confirmarMemoriaTelegram(client(), 123, token)).toEqual(receipt);
      expect(calls.map(c => c.path)).toEqual(['/rest/v1/telegram_usuarios', '/rest/v1/usuarios', '/rest/v1/rpc/esco_purge_memory_confirmation_payloads', '/rest/v1/rpc/esco_confirm_telegram_memory']);
      expect(calls[3].body).toEqual({ p_owner_id: owner, p_telegram_id: 123, p_token: token });
      expect(calls.every(c => !/chat_messages|esco_memorias$/.test(c.path))).toBe(true);
    });
    it.each([false, null, 'true'])('does not purge, consume, or write for application active=%s', async activo => {
      profile = [{ id: owner, activo, rol: 'Gerencia' }];
      await expect(helpers.confirmarMemoriaTelegram(client(), 123, token)).rejects.toThrow();
      expect(calls.every(c => c.method === 'GET')).toBe(true);
    });
    it('denies removed module, inactive/unlinked registration and demoted profiles before RPC', async () => {
      for (const data of [[], [{ usuario_id: owner, activo: true, modulos_permitidos: [] }],
        [{ usuario_id: owner, activo: false, modulos_permitidos: ['consultas'] }], [{ usuario_id: null, activo: true, modulos_permitidos: ['consultas'] }]]) {
        registration = data;
        await expect(helpers.confirmarMemoriaTelegram(client(), 123, token)).rejects.toThrow();
      }
      registration = [{ usuario_id: owner, activo: true, modulos_permitidos: ['consultas'] }];
      profile = [{ id: owner, activo: true, rol: 'Administrador' }];
      await expect(helpers.confirmarMemoriaTelegram(client(), 123, token)).rejects.toThrow();
      expect(calls.every(c => c.method === 'GET')).toBe(true);
    });
    it('fails closed on missing, foreign, ambiguous, or failed current profile lookups', async () => {
      for (const data of [[], [{ id, activo: true, rol: 'Gerencia' }],
        [{ id: owner, activo: true, rol: 'Gerencia' }, { id: owner, activo: true, rol: 'Gerencia' }]]) {
        profile = data;
        await expect(helpers.confirmarMemoriaTelegram(client(), 123, token)).rejects.toThrow();
      }
      rpcFailure = 'usuarios';
      await expect(helpers.confirmarMemoriaTelegram(client(), 123, token)).rejects.toThrow();
      expect(calls.every(c => c.method === 'GET')).toBe(true);
    });
    it('rejects malformed, unknown, and substring tokens without a history-search fallback', async () => {
      for (const value of ['unknown', token + '-suffix', 'prefix-' + token, 'mem_partial']) {
        await expect(helpers.confirmarMemoriaTelegram(client(), 123, value)).rejects.toThrow();
      }
      expect(calls).toHaveLength(0);
    });
    it('fails closed if candidate RPCs are absent or admission changed at the SQL boundary', async () => {
      rpcFailure = 'esco_purge_memory_confirmation_payloads';
      await expect(helpers.registrarPropuestaMemoria(client(), owner, { content: 'proposal' })).rejects.toThrow();
      expect(calls).toHaveLength(1);
      calls = []; rpcFailure = 'esco_confirm_telegram_memory';
      await expect(helpers.confirmarMemoriaTelegram(client(), 123, token)).rejects.toThrow();
      expect(calls.every(c => !c.path.endsWith('/esco_memorias'))).toBe(true);
    });
    it('returns an exact durable replay and rejects malformed success responses', async () => {
      overrideResult = { ...receipt, replayed: true };
      expect(await helpers.confirmarMemoriaTelegram(client(), 123, token)).toEqual(overrideResult);
      for (const result of [null, {}, { ...receipt, id: 'bad' }, { ...receipt, replayed: undefined }, { ...receipt, content: 'x'.repeat(501) }]) {
        overrideResult = result === null ? {} : result;
        await expect(helpers.confirmarMemoriaTelegram(client(), 123, token)).rejects.toThrow();
      }
    });
    it('does not accept an altered proposal returned from registration', async () => {
      overrideResult = { _memory_proposal: true, token, content: 'different', reason: null };
      await expect(helpers.registrarPropuestaMemoria(client(), owner, { content: 'exact' })).rejects.toThrow();
    });
    it('actual LLM commit tool never writes, regardless of token, claimed approval, or final-content override', async () => {
      const forbidden = vi.fn(() => { throw new Error('Model must not access SDK'); });
      const commit = extract(roots[index], 'chat.tsx', 'execCommitMemorySave', { createClient: forbidden });
      const result = JSON.parse(await commit({ token, final_content: 'Unconfirmed override', approved: true }, owner));
      expect(result.saved).toBe(false); expect(result.error).toContain('botón');
      expect(forbidden).not.toHaveBeenCalled(); expect(calls).toHaveLength(0);
    });
    it('actual proposal tool ignores model-supplied owner, token, and final-content overrides', async () => {
      vi.stubGlobal('Deno', { env: { get: (key: string) => key === 'SUPABASE_URL' ? 'https://supabase.invalid' : 'synthetic-service' } });
      const propose = extract(roots[index], 'chat.tsx', 'execProposeMemorySave', {
        createClient, registrarPropuestaMemoria: helpers.registrarPropuestaMemoria,
      });
      const proposal = JSON.parse(await propose({ content: 'Exact proposal', owner_id: id, token, final_content: 'Override' }, owner));
      expect(proposal.token).not.toBe(token); expect(proposal.content).toBe('Exact proposal');
      expect(calls[1].body).toMatchObject({ p_owner_id: owner, p_token: proposal.token, p_content: 'Exact proposal' });
    });
    it('proposal detector refuses malformed durable results instead of displaying model arguments', () => {
      const detect = extract(roots[index], 'telegram/bot.ts', 'findMemoryProposal', {});
      for (const result_summary of ['{', JSON.stringify({ _memory_proposal: true, token }),
        JSON.stringify({ _memory_proposal: true, token: 'unknown', content: 'text' }),
        JSON.stringify({ _memory_proposal: true, token, content: 'x'.repeat(501) })]) {
        expect(detect([{ tool: 'propose_memory_save', result_summary, args: { content: 'unregistered override' } }])).toBeNull();
      }
    });
    it.each([false, true])('actual responder displays all 500 proposal characters as plain text (group=%s)', async grupo => {
      const content = '[label](https://synthetic.invalid)_*'.padEnd(500, 'x');
      const proposal = { _memory_proposal: true, token, content };
      const interactions = [{ tool: 'propose_memory_save', result_summary: JSON.stringify(proposal) }];
      class Keyboard {
        text() { return this; }
      }
      const findMemoryProposal = extract(roots[index], 'telegram/bot.ts', 'findMemoryProposal', {});
      const responder = extract(roots[index], 'telegram/bot.ts', 'responderConsultaEsco', {
        getSupabaseAdmin: client, cuentaActivaTelegram,
        getOrCreateTelegramConversation: async () => 'synthetic-conversation',
        saveTelegramMessage: vi.fn(), buildTelegramLlmMessages: async () => [],
        llmToolLoop: async () => ({ text: '', toolInteractions: interactions }),
        findMemoryProposal, InlineKeyboard: Keyboard,
        extractChartsAndText: () => ({ textParts: [], charts: [] }),
      });
      const ctx = { from: { id: 123 }, chat: { id: 999 }, message: { text: 'Remember this' },
        reply: vi.fn(), api: { sendMessage: vi.fn(), sendChatAction: vi.fn() } };
      await responder(ctx, grupo);
      const preview = ctx.api.sendMessage.mock.calls.find((call: unknown[]) => String(call[1]).startsWith('📌'));
      expect(preview).toEqual([grupo ? 123 : 999, `📌 ¿Guardo esto para futuras conversaciones?\n\n${content}`, { reply_markup: expect.any(Keyboard) }]);
      expect(preview?.[2]).not.toHaveProperty('parse_mode');
    });
    it('actual human callback uses durable confirmation, with no metadata-token search or direct insert', async () => {
      const sb = client();
      const callback = extract(roots[index], 'telegram/bot.ts', 'mem_save', {
        getSupabaseAdmin: () => sb, cuentaActivaTelegram, confirmarMemoriaTelegram: helpers.confirmarMemoriaTelegram,
      });
      const ctx = { from: { id: 123 }, match: ['', token], answerCallbackQuery: vi.fn(), reply: vi.fn(), editMessageText: vi.fn() };
      await callback(ctx);
      expect(ctx.editMessageText).toHaveBeenCalledWith('✅ Guardado: Exact proposed content');
      expect(ctx.reply).not.toHaveBeenCalled();
      expect(calls[calls.length - 1]?.body).toEqual({ p_owner_id: owner, p_telegram_id: 123, p_token: token });
      expect(calls.every(c => !/chat_messages|esco_memorias$/.test(c.path))).toBe(true);
    });
    it('actual human callback does not claim success after a failed atomic confirm', async () => {
      rpcFailure = 'esco_confirm_telegram_memory';
      const callback = extract(roots[index], 'telegram/bot.ts', 'mem_save', {
        getSupabaseAdmin: client, cuentaActivaTelegram, confirmarMemoriaTelegram: helpers.confirmarMemoriaTelegram,
      });
      const ctx = { from: { id: 123 }, match: ['', token], answerCallbackQuery: vi.fn(), reply: vi.fn(), editMessageText: vi.fn() };
      await callback(ctx);
      expect(ctx.editMessageText).not.toHaveBeenCalled(); expect(ctx.reply).toHaveBeenCalledOnce();
    });
  });
}
