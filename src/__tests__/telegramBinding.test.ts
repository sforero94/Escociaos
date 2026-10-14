import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
import { vincularCuentaTelegram as sourceBinding } from '../supabase/functions/server/telegram/vincularCuentaTelegram';
import { vincularCuentaTelegram as mirroredBinding } from '../../supabase/functions/make-server-1ccce916/telegram/vincularCuentaTelegram';

const owner = '11111111-1111-4111-8111-111111111111';
const registration = { id: '22222222-2222-4222-8222-222222222222', telegram_id: 123, telegram_username: 'worker',
  usuario_id: owner, empleado_id: null, contratista_id: null, nombre_display: 'Synthetic worker', rol_bot: 'campo',
  modulos_permitidos: ['labores'], activo: true, codigo_vinculacion: null, codigo_expira_at: null };
let result: unknown;
let failed: boolean;
let calls: Array<{ path: string; method: string; body: unknown }>;
const client = () => createClient('https://binding.invalid', 'synthetic-service', {
  auth: { persistSession: false, autoRefreshToken: false },
});
beforeEach(() => {
  result = { registration: { ...registration }, linked_profile: { id: owner, activo: true, rol: 'Administrador' } };
  failed = false; calls = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push({ path: url.pathname, method: options?.method ?? 'GET', body: JSON.parse(options?.body as string) });
    return new Response(JSON.stringify(failed ? { message: 'binding unavailable' } : result), {
      status: failed ? 403 : 200, headers: { 'Content-Type': 'application/json' },
    });
  }));
});
afterEach(() => vi.unstubAllGlobals());
function handler(root: string, binding: typeof sourceBinding, menu: ReturnType<typeof vi.fn>) {
  const text = readFileSync(`${root}/telegram/bot.ts`, 'utf8');
  const sf = ts.createSourceFile('bot.ts', text, ts.ScriptTarget.Latest, true);
  let found: ts.Node | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isArrowFunction(node) && ts.isCallExpression(node.parent) && node.parent.expression.getText(sf) === 'bot.command' &&
        node.parent.arguments[0].getText(sf) === '"start"') found = node;
    ts.forEachChild(node, visit);
  };
  visit(sf); if (!found) throw new Error('Actual /start handler missing');
  const js = ts.transpileModule(`const handler=${found.getText(sf)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function('vincularCuentaTelegram', 'getSupabaseAdmin', 'sendMainMenu', `${js};return handler;`)(binding, client, menu);
}
for (const [root, binding] of [['src/supabase/functions/server', sourceBinding], ['supabase/functions/make-server-1ccce916', mirroredBinding]] as const) {
  describe(`${root} atomic binding caller and actual SDK serialization`, () => {
    it('calls only the atomic RPC with the actual sender; retains configured lower bot role', async () => {
      expect(await binding(client(), 'CODE0001', 123, 'worker')).toEqual(registration);
      expect(calls).toEqual([{ path: '/rest/v1/rpc/telegram_consume_binding_code', method: 'POST',
        body: { p_code: 'CODE0001', p_telegram_id: 123, p_username: 'worker' } }]);
    });
    it.each([undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid sender %s before RPC', async sender => {
      expect(await binding(client(), 'CODE0001', sender)).toBeNull(); expect(calls).toHaveLength(0);
    });
    it.each(['', 'CODE001', 'CODE00001', ' code001', 'code0001', 'CODE000!'])('rejects malformed code %s before RPC', async code => {
      expect(await binding(client(), code, 123)).toBeNull(); expect(calls).toHaveLength(0);
    });
    it.each([null, [], { registration: null }, { registration: { ...registration, telegram_id: 999 } },
      { registration: { ...registration, activo: false } }, { registration: { ...registration, codigo_vinculacion: 'CODE0001' } },
      { registration: { ...registration, codigo_expira_at: '2099-01-01' } }])('refuses unconfirmed/foreign binding responses (%j)', async response => {
      result = response; expect(await binding(client(), 'CODE0001', 123, 'worker')).toBeNull();
    });
    it.each([null, { id: owner, activo: false, rol: 'Gerencia' }, { id: owner, activo: null, rol: 'Gerencia' },
      { id: 'foreign', activo: true, rol: 'Gerencia' }, { id: owner, activo: true, rol: '' }])('requires current linked profile evidence (%j)', async profile => {
      result = { registration, linked_profile: profile }; expect(await binding(client(), 'CODE0001', 123, 'worker')).toBeNull();
    });
    it('preserves the unlinked configured worker lane without inventing app-account authority', async () => {
      result = { registration: { ...registration, usuario_id: null }, linked_profile: null };
      expect((await binding(client(), 'CODE0001', 123, 'worker'))?.usuario_id).toBeNull();
      result = { registration: { ...registration, usuario_id: null }, linked_profile: { id: owner, activo: true, rol: 'Gerencia' } };
      expect(await binding(client(), 'CODE0001', 123, 'worker')).toBeNull();
    });
    it('normalizes schema-permitted NULL modules to an empty menu, preserving configured authority', async () => {
      result = { registration: { ...registration, modulos_permitidos: null }, linked_profile: { id: owner, activo: true, rol: 'Monitor' } };
      expect((await binding(client(), 'CODE0001', 123, 'worker'))?.modulos_permitidos).toEqual([]);
    });
    it('refuses missing module evidence rather than assuming a menu', async () => {
      result = { registration: { ...registration, modulos_permitidos: undefined }, linked_profile: { id: owner, activo: true, rol: 'Monitor' } };
      expect(await binding(client(), 'CODE0001', 123, 'worker')).toBeNull();
    });
    it('actual /start publishes success/menu only after the typed atomic result', async () => {
      const menu = vi.fn(); const ctx = { match: 'CODE0001', from: { id: 123, username: 'worker' }, telegramUser: null, reply: vi.fn() };
      await handler(root, binding, menu)(ctx);
      expect(ctx.telegramUser).toEqual(registration); expect(menu).toHaveBeenCalledWith(ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('exitosamente'));
      expect(calls.every(call => call.path.endsWith('/rpc/telegram_consume_binding_code'))).toBe(true);
    });
    it('actual /start refuses missing RPC rollout without direct PATCH fallback or success', async () => {
      failed = true; const menu = vi.fn(); const ctx = { match: 'CODE0001', from: { id: 123, username: 'worker' }, telegramUser: null, reply: vi.fn() };
      await handler(root, binding, menu)(ctx); expect(ctx.telegramUser).toBeNull(); expect(menu).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('No pudimos confirmar'));
      expect(calls).toHaveLength(1); expect(calls[0].method).toBe('POST');
    });
    it('ordinary /start retains an already registered configured worker without consuming a code', async () => {
      const menu = vi.fn(); const ctx = { match: '', from: { id: 123 }, telegramUser: { ...registration, usuario_id: null }, reply: vi.fn() };
      await handler(root, binding, menu)(ctx); expect(menu).toHaveBeenCalledWith(ctx); expect(calls).toHaveLength(0);
    });
  });
}
