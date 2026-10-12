import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { build } from 'esbuild';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

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
  if(body && typeof body==='object' && 'csvData' in body)body={requestKey:otherId,action:'import',...body};
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
let csvRpcReply: unknown;
let csvRpcFailure: boolean;
let registrationReply: unknown;
let registrationFailure: boolean;
function csvReceipt(body:Record<string,unknown>){
  const p=body.p_payload as {raw_csv:string;products:Array<Record<string,unknown>>};
  return {success:true,actor,requestKey:body.p_request_key,parserVersion:1,csvSha256:createHash('sha256').update(p.raw_csv).digest('hex'),
    total:p.products.length,importados:p.products.length,message:'Imported atomically',products:p.products.map(v=>({product_id:productId,
      opening_quantity:v.cantidad_actual??0,movement_id:Number(v.cantidad_actual??0)>0?otherId:null,
      product:{...v,id:productId,cantidad_actual:v.cantidad_actual??0,updated_by:actor}}))};
}

beforeAll(async () => {
  vi.stubGlobal('__verifiedInventoryCreateClient', (url: string, key: string, options: Parameters<typeof createClient>[2]) => createClient(url, key, {
    ...options,
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
  csvRpcReply = undefined;
  csvRpcFailure = false;
  registrationReply = undefined;
  registrationFailure = false;
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
    if (url.pathname === '/rest/v1/rpc/fn_csv_product_import_register') {
      expect(new Headers(options?.headers).get('Authorization')).toBe('Bearer service-test-key');
      expect(body!.p_actor).toBe(actor);
      if(registrationFailure)return reply({message:'synthetic registration unavailable'},503);
      const p=body!.p_payload as {raw_csv:string};
      return reply(registrationReply ?? {actor,requestKey:body!.p_request_key,parserVersion:1,
        csvSha256:createHash('sha256').update(p.raw_csv).digest('hex'),payload:p});
    }
    if (url.pathname.startsWith('/rest/v1/rpc/fn_csv_product_import')) {
      expect(new Headers(options?.headers).get('Authorization')).toBe('Bearer valid-human-jwt');
      if(csvRpcFailure)return reply({message:'synthetic RPC unavailable'},503);
      if(csvRpcReply!==undefined)return reply(csvRpcReply);
      const r=csvReceipt(body!);
      return reply(url.pathname.endsWith('_status')?{actor,requestKey:r.requestKey,parserVersion:1,csvSha256:r.csvSha256,committed:true,result:r}:r);
    }
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
        expect(result.errores[0], token).toContain('Fila 3: cantidad_actual');
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
        expect(post.url.pathname).toBe('/rest/v1/rpc/fn_csv_product_import');
        expect((post.body!.p_payload as {products:unknown[]}).products[0]).toHaveProperty('cantidad_actual', expected);
      }
    });
    it('leaves blank or absent opening stock omitted for the existing database default', async () => {
      for (const csvData of [`${headers}\n${row('')}`, 'nombre,categoria,grupo,unidad_medida\nProducto,Fertilizante,Agroinsumos,Kilos']) {
        const response = await loaded[index].csv.handleImportarProductos(context({ csvData }));
        expect((await response.json()).success).toBe(true);
        expect((calls.filter(call => call.method === 'POST').slice(-1)[0]!.body!.p_payload as {products:unknown[]}).products[0]).not.toHaveProperty('cantidad_actual');
      }
    });
    it('preserves active Gerencia import permission', async () => {
      profile = [{ id: actor, rol: 'Gerencia', activo: true }];
      const response = await loaded[index].csv.handleImportarProductos(context({ csvData: `${headers}\n${row('5')}` }));
      expect((await response.json()).success).toBe(true);
    });
    it('registers exact trusted parsed payload with verified actor before human posting',async()=>{
      const response=await loaded[index].csv.handleImportarProductos(context({csvData:`${headers}\n${row('5')}`,actor:otherId,p_actor:otherId}));
      expect(response.status).toBe(200);
      const posts=calls.filter(c=>c.method==='POST');
      expect(posts.map(c=>c.url.pathname)).toEqual(['/rest/v1/rpc/fn_csv_product_import_register','/rest/v1/rpc/fn_csv_product_import']);
      expect(posts[0].body).toEqual({...posts[1].body,p_actor:actor});
    });
    it('refuses registration errors and forged acknowledgements before human mutation',async()=>{
      const body={csvData:`${headers}\n${row('5')}`};
      registrationFailure=true;
      expect((await loaded[index].csv.handleImportarProductos(context(body))).status).toBe(500);
      registrationFailure=false;
      const posted=calls.find(c=>c.method==='POST')!.body!;
      const payload=posted.p_payload as {raw_csv:string;products:Array<Record<string,unknown>>};
      const proof={actor,requestKey:otherId,parserVersion:1,csvSha256:createHash('sha256').update(payload.raw_csv).digest('hex'),payload};
      for(const patch of [{actor:otherId},{requestKey:actor},{parserVersion:2},{csvSha256:'0'.repeat(64)},
        {payload:{...payload,raw_csv:'forged'}},{payload:{...payload,products:[{...payload.products[0],cantidad_actual:8}]}},{extra:true}]){
        registrationReply={...proof,...patch};
        expect((await loaded[index].csv.handleImportarProductos(context(body))).status).toBe(500);
      }
      expect(calls.filter(c=>c.method==='POST').every(c=>c.url.pathname==='/rest/v1/rpc/fn_csv_product_import_register')).toBe(true);
    });
    it('routes resolution through the human JWT status RPC and validates bound cancellation proofs',async()=>{
      const body={csvData:`${headers}\n${row('5')}`,requestKey:otherId,action:'resolve'};
      let response=await loaded[index].csv.handleImportarProductos(context(body));
      expect(response.status).toBe(200);expect((await response.json()).committed).toBe(true);
      const post=calls.filter(c=>c.method==='POST').slice(-1)[0]!;
      expect(post.url.pathname).toBe('/rest/v1/rpc/fn_csv_product_import_status');
      const r=csvReceipt(post.body!);
      const proof={actor,requestKey:otherId,parserVersion:1,csvSha256:r.csvSha256,committed:false,result:null};
      csvRpcReply=proof;response=await loaded[index].csv.handleImportarProductos(context(body));
      expect(response.status).toBe(200);expect(await response.json()).toEqual(proof);
      for(const patch of [{actor:otherId},{requestKey:actor},{parserVersion:2},{csvSha256:'0'.repeat(64)},{result:{}},{committed:true},{extra:true}]){
        csvRpcReply={...proof,...patch};expect((await loaded[index].csv.handleImportarProductos(context(body))).status).toBe(500);
      }
      expect(calls.filter(c=>c.method!=='GET').every(c=>c.url.pathname==='/rest/v1/rpc/fn_csv_product_import_status')).toBe(true);
    });
    it('fails without per-row fallback on RPC error or forged opening receipt',async()=>{
      const body={csvData:`${headers}\n${row('5')}`};
      csvRpcFailure=true;expect((await loaded[index].csv.handleImportarProductos(context(body))).status).toBe(500);
      csvRpcFailure=false;const post=calls.find(c=>c.method==='POST')!;const r=csvReceipt(post.body!);
      for(const patch of [{actor:otherId},{requestKey:actor},{parserVersion:2},{csvSha256:'0'.repeat(64)},{products:[{...r.products[0],movement_id:null}]}]){
        csvRpcReply={...r,...patch};expect((await loaded[index].csv.handleImportarProductos(context(body))).status).toBe(500);
      }
      expect(calls.filter(c=>c.method!=='GET').every(c=>['/rest/v1/rpc/fn_csv_product_import_register','/rest/v1/rpc/fn_csv_product_import'].includes(c.url.pathname))).toBe(true);
    });
    it('rejects invalid request identity, strict flags and numeric business bounds before any RPC',async()=>{
      for(const patch of [{requestKey:null},{requestKey:'invalid'},{action:'write'},{action:undefined}])
        expect((await loaded[index].csv.handleImportarProductos(context({csvData:`${headers}\n${row('5')}`,...patch}))).status).toBe(400);
      for(const [field,value] of [['permitido_gerencia','tru'],['activo','garbage'],['stock_minimo','-1'],['precio_unitario','3usd'],['nitrogeno','100.001']])
        expect((await loaded[index].csv.handleImportarProductos(context({csvData:`${headers},${field}\n${row('5')},${value}`}))).status).toBe(400);
      expect(calls.every(c=>c.method==='GET')).toBe(true);
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
