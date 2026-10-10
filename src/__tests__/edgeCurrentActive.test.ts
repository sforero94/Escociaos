import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
import { conReintento, esErrorPostgrestReintentable } from '../../supabase/functions/make-server-1ccce916/reintento';

const actor = '11111111-1111-4111-8111-111111111111';
const foreign = '22222222-2222-4222-8222-222222222222';
const files = [
  ['clima.tsx', 'verificarAccesoClima', 'handleClimaSync', true, 'CLIMA_SYNC_SECRET', 'x-clima-sync-secret'],
  ['generar-reporte-semanal-endpoint.ts', 'verificarAcceso', 'handleGenerarReporteSemanal', false],
  ['hato-chequeo-commit.ts', 'verificarAcceso', 'handleHatoChequeoCommit', false],
  ['hato-chequeo-preview.ts', 'verificarAcceso', 'handleHatoChequeoPreview', false],
  ['hato-chequeo-foto.ts', 'verificarAcceso', 'handleHatoChequeoFoto', false],
  ['hato-pesaje-commit.ts', 'verificarAcceso', 'handleHatoPesajeCommit', false],
  ['hato-pesaje-foto.ts', 'verificarAcceso', 'handleHatoPesajeFoto', false],
  ['hato-produccion-quincena-foto.ts', 'verificarAcceso', 'handleHatoProduccionQuincenaFoto', false],
  ['informes-visita-proponer.ts', 'verificarAcceso', 'handleProponerSnippets', false],
  ['ronda-inventario-tick.ts', 'verificarAuth', 'handleRondaInventarioTick', true, 'INVENTARIO_TICK_SECRET', 'x-inventario-tick-secret'],
  ['hato-alertas-tick.ts', 'verificarAuth', 'handleHatoAlertasTick', true, 'HATO_ALERTAS_TICK_SECRET', 'x-hato-tick-secret'],
] as const;
type Context = ReturnType<typeof context>;
type Auth = (c: Context, sdk: ReturnType<typeof sdkFixture>) => Promise<Response | { userId?: string; disparo?: string }>;

// Execute verbatim source guard and initial handler, including each mirror's
// profile helper and role declarations. Only unrelated module imports are omitted.
function load(root: string, file: string, guard: string, handler: string) {
  const source = readFileSync(`${root}/${file}`, 'utf8');
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const names = new Set([guard, handler, 'respuestaError', 'getSupabaseConfig', 'consultarConReintento']);
  const declarations = sf.statements.filter(node =>
    (ts.isFunctionDeclaration(node) && node.name && names.has(node.name.text)) ||
    (ts.isVariableStatement(node) && node.declarationList.declarations.some(d =>
      ['ROLES_PERMITIDOS', 'ROLES_DISPARO_MANUAL', 'INTENTOS_TICK'].includes(d.name.getText(sf)))));
  const helper = readFileSync(`${root}/perfilAplicacionActivo.ts`, 'utf8').replace('export function', 'function');
  const code = helper + '\n' + declarations.map(node => node.getText(sf).replace(/^export /, '')).join('\n');
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  return new Function('createClient', 'conReintento', 'esErrorPostgrestReintentable', `${js}; return {guard:${guard},handler:${handler}};`)(
    createClient, conReintento, esErrorPostgrestReintentable,
  ) as { guard: Auth; handler: (c: Context) => Promise<Response> };
}
function context(headers: Record<string, string> = { Authorization: 'Bearer human-token' }) {
  return {
    req: { header: (name: string) => headers[name], json: vi.fn(), parseBody: vi.fn(), query: vi.fn() },
    json: (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } }),
  };
}
let profile: unknown;
let failure: boolean;
let calls: Array<{ url: URL; method: string }>;
const env: Record<string, string> = { SUPABASE_URL: 'https://supabase.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-service', OPENROUTER_API_KEY: 'test-model' };
function sdkFixture() { return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }); }
beforeEach(() => {
  profile = { id: actor, rol: 'Gerencia', activo: true }; failure = false; calls = [];
  vi.stubGlobal('Deno', { env: { get: (key: string) => env[key] } });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push({ url, method: options?.method ?? 'GET' });
    if (url.pathname === '/auth/v1/user') return new Response(JSON.stringify({ id: actor }), { headers: { 'Content-Type': 'application/json' } });
    if (url.pathname === '/rest/v1/usuarios') return new Response(JSON.stringify(failure ? { message: 'offline' } : profile), {
      status: failure ? 503 : 200, headers: { 'Content-Type': 'application/json' },
    });
    throw new Error(`Unexpected domain, Storage, or model request: ${url}`);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

for (const root of ['src/supabase/functions/server', 'supabase/functions/make-server-1ccce916']) {
  for (const [file, guard, handler, gerenciaOnly, secretName, secretHeader] of files) {
    const loaded = load(root, file, guard, handler);
    describe(`${root}/${file} current active human gate with real SDK`, () => {
      it.each([false, null, 'true', undefined])('blocks inactive/malformed active=%s before body or domain work', async activo => {
        profile = { id: actor, rol: 'Gerencia', activo };
        const ctx = context();
        expect((await loaded.handler(ctx)).status).toBe(403);
        expect(ctx.req.json).not.toHaveBeenCalled(); expect(ctx.req.parseBody).not.toHaveBeenCalled(); expect(ctx.req.query).not.toHaveBeenCalled();
        expect(calls).toHaveLength(2);
        expect(calls.every(call => call.method === 'GET' && ['/auth/v1/user', '/rest/v1/usuarios'].includes(call.url.pathname))).toBe(true);
        expect(calls[1].url.searchParams.get('select')).toBe('id,rol,activo');
        expect(calls[1].url.searchParams.get('id')).toBe(`eq.${actor}`);
      });
      it('denies missing, foreign and duplicate profiles before handler input', async () => {
        for (const value of [null, { id: foreign, rol: 'Gerencia', activo: true },
          [{ id: actor, rol: 'Gerencia', activo: true }, { id: actor, rol: 'Gerencia', activo: true }]]) {
          profile = value;
          const ctx = context();
          expect([403, 500]).toContain((await loaded.handler(ctx)).status);
          expect(ctx.req.json).not.toHaveBeenCalled(); expect(ctx.req.parseBody).not.toHaveBeenCalled();
        }
        expect(calls.every(call => call.method === 'GET')).toBe(true);
      });
      it('fails closed on a fresh lookup error before body or business work', async () => {
        failure = true; const ctx = context();
        expect((await loaded.handler(ctx)).status).toBe(500);
        expect(ctx.req.json).not.toHaveBeenCalled(); expect(ctx.req.parseBody).not.toHaveBeenCalled();
        expect(calls.every(call => call.method === 'GET')).toBe(true);
      });
      it('preserves the existing allowed role set for active humans', async () => {
        const sdk = sdkFixture();
        for (const rol of ['Gerencia', 'Administrador', 'Verificador', 'Monitor']) {
          profile = { id: actor, rol, activo: true };
          const result = await loaded.guard(context(), sdk);
          if (rol === 'Gerencia' || (!gerenciaOnly && rol === 'Administrador')) expect(result).not.toBeInstanceOf(Response);
          else expect((result as Response).status).toBe(403);
        }
      });
      if (secretName && secretHeader) it('preserves cron-secret admission without any human lookup', async () => {
        env[secretName] = 'cron-secret';
        try {
          const sdk = sdkFixture();
          expect(await loaded.guard(context({ [secretHeader]: 'cron-secret' }), sdk)).toEqual({ disparo: 'cron' });
          expect(calls).toHaveLength(0);
        } finally { delete env[secretName]; }
      });
    });
  }
}
