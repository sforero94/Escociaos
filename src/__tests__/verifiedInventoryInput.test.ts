import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { build } from 'esbuild';
import { createClient } from '@supabase/supabase-js';

const actor = '11111111-1111-4111-8111-111111111111';
const productId = '22222222-2222-4222-8222-222222222222';
const otherId = '33333333-3333-4333-8333-333333333333';
type Handler = (c: ReturnType<typeof context>) => Promise<Response>;
const loaded: Array<{ csv: Record<string, Handler>; products: Record<string, Handler> }> = [];

async function loadEdge(file: string) {
  const path = resolve(file);
  const contents = readFileSync(path, 'utf8').replace(
    /import \{ createClient \} from ['"](?:npm:@supabase\/supabase-js@2\.39\.3|jsr:@supabase\/supabase-js@2)['"];/,
    'const createClient = globalThis.__verifiedInventoryCreateClient;',
  );
  const bundle = await build({ stdin: { contents, resolveDir: dirname(path), loader: 'tsx' },
    bundle: true, write: false, format: 'cjs', platform: 'node' });
  const module = { exports: {} as Record<string, Handler> };
  new Function('module', 'exports', bundle.outputFiles![0].text)(module, module.exports);
  return module.exports;
}
function context(body: unknown) {
  return { req: { header: () => 'Bearer valid-human-jwt', json: async () => body },
    json: (value: unknown, status = 200) => new Response(JSON.stringify(value), {
      status, headers: { 'Content-Type': 'application/json' },
    }) };
}
const headers = 'nombre,categoria,grupo,unidad_medida,cantidad_actual';
const row = (quantity: string, name = 'Producto') => `${name},Fertilizante,Agroinsumos,Kilos,${quantity}`;
let profile: unknown;
let productReply: unknown;
let calls: Array<{ url: URL; method: string; body: Record<string, unknown> | undefined }>;
let profileFailure: boolean;

beforeAll(async () => {
  vi.stubGlobal('__verifiedInventoryCreateClient', (url: string, key: string) => createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));
  for (const root of ['src/supabase/functions/server', 'supabase/functions/make-server-1ccce916']) {
    loaded.push({ csv: await loadEdge(`${root}/importar-productos.tsx`), products: await loadEdge(`${root}/productos.tsx`) });
  }
});
beforeEach(() => {
  profile = [{ id: actor, rol: 'Administrador', activo: true }];
  productReply = { id: productId, activo: false };
  profileFailure = false;
  calls = [];
  vi.stubGlobal('Deno', { env: { get: (key: string) => key === 'SUPABASE_URL' ? 'https://supabase.invalid' : 'service-test-key' } });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = options?.method ?? 'GET';
    const body = typeof options?.body === 'string' ? JSON.parse(options.body) : undefined;
    calls.push({ url, method, body });
    const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
      status, headers: { 'Content-Type': 'application/json' },
    });
    if (url.pathname === '/auth/v1/user') return reply({ id: actor });
    if (url.pathname === '/rest/v1/usuarios') return reply(profileFailure ? { message: 'offline' } : profile, profileFailure ? 503 : 200);
    if (url.pathname === '/rest/v1/productos' && method === 'POST') return reply([]);
    if (url.pathname === '/rest/v1/productos' && method === 'PATCH') return reply(productReply);
    throw new Error(`Unexpected HTTP ${method} ${url}`);
  }));
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

for (const [index, label] of ['source', 'deployment'].entries()) {
  describe(`${label} inventory input with real handler/SDK requests`, () => {
    it('requires a fresh active permitted profile for import and toggle', async () => {
      for (const rows of [[], [{ id: actor, rol: 'Administrador', activo: false }],
        [{ id: actor, rol: 'Gerencia', activo: null }], [{ id: actor, rol: 'Verificador', activo: true }],
        [{ id: otherId, rol: 'Gerencia', activo: true }]]) {
        profile = rows;
        expect((await loaded[index].csv.handleImportarProductos(context({ csvData: `${headers}\n${row('5')}` }))).status).toBe(403);
        expect((await loaded[index].products.toggleProductoActivo(context({ productoId: productId, activo: false }))).status).toBe(403);
      }
      expect(calls.every(call => call.method === 'GET')).toBe(true);
    });
    it('fails closed on an unreadable active profile', async () => {
      profileFailure = true;
      expect((await loaded[index].csv.handleImportarProductos(context({ csvData: `${headers}\n${row('5')}` }))).status).toBe(500);
      expect((await loaded[index].products.toggleProductoActivo(context({ productoId: productId, activo: false }))).status).toBe(500);
      expect(calls.every(call => call.method === 'GET')).toBe(true);
    });
    it('rejects missing, nonstring and blank CSV before inserts', async () => {
      for (const csvData of [undefined, null, false, 123, [], {}, '', ' \n\t ']) {
        const response = await loaded[index].csv.handleImportarProductos(context({ csvData }));
        expect(response.status).toBe(400);
        expect((await response.json()).success).toBe(false);
      }
      expect(calls.every(call => call.method === 'GET')).toBe(true);
    });
    it('preflights the entire file and rejects malformed/nonfinite/negative/out-of-range opening stock', async () => {
      for (const token of ['-1', '-1e2', 'NaN', 'Infinity', '1e309', '9999999999.991', '1e10',
        '12kilos', '1e', '0x10', '1 2', '1.2.3', '"1,2,3"', '--1']) {
        const response = await loaded[index].csv.handleImportarProductos(context({ csvData: `${headers}\n${row('5', 'Valid first row')}\n${row(token, 'Invalid second row')}` }));
        const result = await response.json();
        expect(result.success, token).toBe(false);
        expect(result.importados, token).toBe(0);
        expect(result.errores[0], token).toContain('Fila 3: Cantidad actual');
      }
      expect(calls.every(call => call.method === 'GET')).toBe(true);
    });
    it('preserves decimal/scientific tokens, quoted comma decimals, zero, and max supported opening stock', async () => {
      const examples: Array<[string, number]> = [['0', 0], ['1.25', 1.25], ['.5', 0.5], ['1e2', 100],
        ['+2.5E-1', 0.25], ['"1,25"', 1.25], ['9999999999.99', 9999999999.99]];
      for (const [token, expected] of examples) {
        const response = await loaded[index].csv.handleImportarProductos(context({ csvData: `${headers}\n${row(token)}` }));
        expect((await response.json()).importados).toBe(1);
        const post = calls.filter(call => call.method === 'POST').slice(-1)[0]!;
        expect(post.body).toHaveProperty('cantidad_actual', expected);
      }
    });
    it('leaves blank or absent opening stock omitted for the existing database default', async () => {
      for (const csvData of [`${headers}\n${row('')}`, 'nombre,categoria,grupo,unidad_medida\nProducto,Fertilizante,Agroinsumos,Kilos']) {
        const response = await loaded[index].csv.handleImportarProductos(context({ csvData }));
        expect((await response.json()).success).toBe(true);
        expect(calls.filter(call => call.method === 'POST').slice(-1)[0]!.body).not.toHaveProperty('cantidad_actual');
      }
    });
    it('preserves active Gerencia import permission', async () => {
      profile = [{ id: actor, rol: 'Gerencia', activo: true }];
      const response = await loaded[index].csv.handleImportarProductos(context({ csvData: `${headers}\n${row('5')}` }));
      expect((await response.json()).success).toBe(true);
    });
    it('requires a nonblank string target and a supplied boolean for toggle', async () => {
      for (const body of [{ productoId: productId }, { productoId: productId, activo: null },
        { productoId: productId, activo: 'false' }, { productoId: productId, activo: 0 },
        { productoId: 123, activo: false }, { productoId: ' ', activo: false }]) {
        expect((await loaded[index].products.toggleProductoActivo(context(body))).status).toBe(400);
      }
      expect(calls.every(call => call.method === 'GET')).toBe(true);
    });
    it('reports toggle success only for the exact returned target/state and mutates only activo', async () => {
      const response = await loaded[index].products.toggleProductoActivo(context({ productoId: productId, activo: false, cantidad_actual: 1000 }));
      expect(response.status).toBe(200);
      expect((await response.json()).producto).toEqual(productReply);
      const patch = calls.find(call => call.method === 'PATCH')!;
      expect(patch.url.searchParams.get('id')).toBe(`eq.${productId}`);
      expect(patch.body).toEqual({ activo: false });
      for (const reply of [null, [], [{ id: productId, activo: false }, { id: productId, activo: false }],
        { id: otherId, activo: false }, { id: productId, activo: true }, { id: productId, activo: 'false' }]) {
        productReply = reply;
        const failed = await loaded[index].products.toggleProductoActivo(context({ productoId: productId, activo: false }));
        expect(failed.status).toBe(500);
        expect((await failed.json()).success).toBe(false);
      }
    });
  });
}
