import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { build } from 'esbuild';
import { createClient } from '@supabase/supabase-js';

const actor = '11111111-1111-4111-8111-111111111111';
const target = '22222222-2222-4222-8222-222222222222';
const conversation = '33333333-3333-4333-8333-333333333333';
type Handler = (c: ReturnType<typeof context>) => Promise<Response>;
const loaded: Array<{ users: Record<string, Handler>; chat: Record<string, Handler> }> = [];

// Bundle the real edge handlers, changing only the Deno SDK import to the
// installed SDK. All HTTP is intercepted; no Supabase/LLM request leaves tests.
async function loadEdge(file: string) {
  const path = resolve(file);
  const contents = readFileSync(path, 'utf8').replace(
    "import { createClient } from 'jsr:@supabase/supabase-js@2';",
    'const createClient = globalThis.__activeHumanCreateClient;',
  );
  const result = await build({ stdin: { contents, resolveDir: dirname(path), loader: 'tsx' },
    bundle: true, write: false, format: 'cjs', platform: 'node' });
  const module = { exports: {} as Record<string, Handler> };
  new Function('module', 'exports', result.outputFiles![0].text)(module, module.exports);
  return module.exports;
}
function context(body: unknown, token = 'test-human-jwt') {
  return { req: { header: () => `Bearer ${token}`, json: async () => body,
    raw: new Request('https://edge.invalid/chat', { method: 'POST', body: JSON.stringify(body) }) },
    json: (value: unknown, status = 200) => new Response(JSON.stringify(value), {
      status, headers: { 'Content-Type': 'application/json' },
    }) };
}
const editBody = { id: target, email: 'target@example.test', nombre_completo: 'Target', rol: 'Administrador' };
let profile: unknown;
let writeRows: unknown;
let ownerRows: unknown;
let calls: Array<{ url: URL; method: string; body: Record<string, unknown> | undefined }>;
let profileFailure: boolean;
let ownerFailure: boolean;

beforeAll(async () => {
  vi.stubGlobal('__activeHumanCreateClient', (url: string, key: string) => createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));
  for (const root of ['src/supabase/functions/server', 'supabase/functions/make-server-1ccce916']) {
    loaded.push({ users: await loadEdge(`${root}/usuarios.tsx`), chat: await loadEdge(`${root}/chat.tsx`) });
  }
});
beforeEach(() => {
  profile = [{ id: actor, rol: 'Gerencia', activo: true }];
  writeRows = [{ ...editBody, activo: false, modulos_acceso: ['ganado'] }];
  ownerRows = [];
  calls = [];
  profileFailure = false;
  ownerFailure = false;
  vi.stubGlobal('Deno', { env: { get: (key: string) => key === 'SUPABASE_URL' ? 'https://supabase.invalid' : 'test-service-key' } });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = options?.method ?? 'GET';
    const body = typeof options?.body === 'string' ? JSON.parse(options.body) : undefined;
    calls.push({ url, method, body });
    const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    if (url.pathname === '/auth/v1/user') return reply({ id: actor });
    if (url.pathname.startsWith('/auth/v1/admin/users')) return reply({ id: target });
    if (url.pathname === '/rest/v1/usuarios') {
      if (method === 'GET') return reply(profileFailure ? { message: 'offline' } : profile, profileFailure ? 503 : 200);
      return reply(writeRows);
    }
    if (url.pathname === '/rest/v1/chat_conversations' && method === 'GET') {
      return reply(ownerFailure ? { message: 'offline' } : ownerRows, ownerFailure ? 503 : 200);
    }
    if (url.pathname === '/rest/v1/chat_messages') {
      return reply(method === 'POST' ? [{ id: target, ...body }] : [{ role: 'user', content: 'hola' }]);
    }
    if (url.pathname === '/rest/v1/esco_memorias') return reply([]);
    if (url.hostname === 'openrouter.ai') return reply({ choices: [{ message: { role: 'assistant', content: 'ok' } }] });
    throw new Error(`Unexpected HTTP ${method} ${url}`);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

for (const [index, label] of ['source', 'deployment'].entries()) {
  describe(`${label} human security handlers with real Supabase SDK`, () => {
    it('rejects malformed, oversized and client-supplied authority fields before domain writes or inference', async () => {
      for (const body of [null, [], { message: 'hola', user_id: target }, { message: 'hola', messages: [] },
        { message: 'é'.repeat(8193) }, { message: 'x'.repeat(40000) }]) {
        const response = await loaded[index].chat.handleChatMessage(context(body));
        expect([400, 413]).toContain(response.status);
      }
      expect(calls.every(call => call.method === 'GET')).toBe(true);
      expect(calls.every(call => ['/auth/v1/user', '/rest/v1/usuarios'].includes(call.url.pathname))).toBe(true);
    });
    for (const value of [false, null, 'true']) {
      it(`denies an inactive or malformed active profile (${String(value)}) before user writes`, async () => {
        profile = [{ id: actor, rol: 'Gerencia', activo: value }];
        for (const name of ['crearUsuario', 'editarUsuario', 'eliminarUsuario']) {
          expect((await loaded[index].users[name](context(editBody))).status).toBe(403);
        }
        expect(calls.every(call => call.method === 'GET')).toBe(true);
      });
    }
    it('denies missing, wrong-owner and non-Gerencia actor profiles', async () => {
      for (const rows of [[], [{ id: target, rol: 'Gerencia', activo: true }], [{ id: actor, rol: 'Administrador', activo: true }]]) {
        profile = rows;
        expect((await loaded[index].users.editarUsuario(context(editBody))).status).toBe(403);
      }
    });
    it('fails closed when fresh profile lookup fails', async () => {
      profileFailure = true;
      expect((await loaded[index].users.editarUsuario(context(editBody))).status).toBe(500);
      expect((await loaded[index].chat.handleChatMessage(context({ message: 'hola' }))).status).toBe(500);
      expect(calls.every(call => call.method === 'GET')).toBe(true);
    });
    it('preserves omitted active/modules in the actual PATCH and returns the confirmed profile', async () => {
      const response = await loaded[index].users.editarUsuario(context(editBody));
      expect(response.status).toBe(200);
      expect((await response.json()).data).toEqual((writeRows as unknown[])[0]);
      const patch = calls.find(call => call.method === 'PATCH')!;
      expect(patch.body).toEqual({ nombre_completo: 'Target', rol: 'Administrador' });
      expect(patch.url.searchParams.get('id')).toBe(`eq.${target}`);
      expect(calls.find(call => call.method === 'PUT')!.body).not.toHaveProperty('ban_duration');
    });
    it('keeps explicit false/empty modules and bans the Auth account', async () => {
      await loaded[index].users.editarUsuario(context({ ...editBody, activo: false, modulos_acceso: [] }));
      expect(calls.find(call => call.method === 'PATCH')!.body).toMatchObject({ activo: false, modulos_acceso: [] });
      expect(calls.find(call => call.method === 'PUT')!.body).toHaveProperty('ban_duration', '876000h');
    });
    it('rejects supplied malformed booleans/modules before either provider writes', async () => {
      for (const extra of [{ activo: null }, { activo: 'false' }, { activo: 0 }, { modulos_acceso: null },
        { modulos_acceso: 'ganado' }, { modulos_acceso: [123] }, { modulos_acceso: ['unknown'] }]) {
        for (const name of ['crearUsuario', 'editarUsuario']) {
          expect((await loaded[index].users[name](context({ ...editBody, password: 'abcdef', ...extra }))).status).toBe(400);
        }
      }
      expect(calls.every(call => call.method === 'GET')).toBe(true);
    });
    it('does not report successful edits for zero, duplicate or mismatched returned profiles', async () => {
      for (const rows of [[], [{ id: actor }], [{ id: target }, { id: target }]]) {
        writeRows = rows;
        const response = await loaded[index].users.editarUsuario(context(editBody));
        expect(response.status).toBe(500);
        expect((await response.json()).success).toBe(false);
      }
    });
    it('creation returns the confirmed matching profile and refuses ambiguous confirmation', async () => {
      const body = { ...editBody, password: 'abcdef' };
      const response = await loaded[index].users.crearUsuario(context(body));
      expect(response.status).toBe(200);
      expect((await response.json()).data).toEqual((writeRows as unknown[])[0]);
      expect(calls.find(call => call.method === 'POST' && call.url.pathname === '/rest/v1/usuarios')!.body)
        .toMatchObject({ activo: true, modulos_acceso: [] });
      for (const rows of [[], [{ id: actor }], [{ id: target }, { id: target }]]) {
        writeRows = rows;
        expect((await loaded[index].users.crearUsuario(context(body))).status).toBe(500);
      }
    });
    it('permits a verified owned conversation through message persistence, history and SSE', async () => {
      ownerRows = [{ id: conversation, user_id: actor }];
      const response = await loaded[index].chat.handleChatMessage(context({ message: 'hola', conversation_id: conversation }));
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('"type":"done"');
      const posts = calls.filter(call => call.url.pathname === '/rest/v1/chat_messages' && call.method === 'POST');
      expect(posts).toHaveLength(2);
      expect(posts[0].body).toMatchObject({ conversation_id: conversation, role: 'user', content: 'hola' });
      expect(calls.findIndex(call => call.url.pathname === '/rest/v1/chat_conversations'))
        .toBeLessThan(calls.findIndex(call => call.url.pathname === '/rest/v1/chat_messages'));
    });
    it('chat requires active Gerencia even with a valid JWT', async () => {
      for (const rows of [[], [{ id: actor, rol: 'Gerencia', activo: false }], [{ id: actor, rol: 'Verificador', activo: true }],
        [{ id: actor, rol: 'Gerencia', activo: true }, { id: actor, rol: 'Gerencia', activo: true }]]) {
        profile = rows;
        expect((await loaded[index].chat.handleChatMessage(context({ message: 'hola' }))).status).toBe(403);
      }
      expect(calls.every(call => call.method === 'GET')).toBe(true);
    });
    it('rejects foreign/missing/ambiguous conversations before history, writes and LLM', async () => {
      for (const rows of [[], [{ id: conversation, user_id: target }], [{ id: target, user_id: actor }],
        [{ id: conversation, user_id: actor }, { id: conversation, user_id: actor }]]) {
        ownerRows = rows;
        expect((await loaded[index].chat.handleChatMessage(context({ message: 'hola', conversation_id: conversation }))).status).toBe(404);
      }
      const ownership = calls.find(call => call.url.pathname === '/rest/v1/chat_conversations')!;
      expect(ownership.url.searchParams.get('user_id')).toBe(`eq.${actor}`);
      expect(calls.every(call => call.method === 'GET')).toBe(true);
    });
    it('fails closed on ownership lookup failure and rejects PostgREST filter injection', async () => {
      ownerFailure = true;
      expect((await loaded[index].chat.handleChatMessage(context({ message: 'hola', conversation_id: conversation }))).status).toBe(500);
      expect((await loaded[index].chat.handleChatMessage(context({ message: 'hola', conversation_id: `${conversation}&user_id=neq.${actor}` }))).status).toBe(400);
      expect(calls.every(call => call.method === 'GET')).toBe(true);
    });
  });
}
