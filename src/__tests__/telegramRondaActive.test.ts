import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
afterEach(() => vi.unstubAllGlobals());
const tgId = '11111111-1111-4111-8111-111111111111';
const owner = '22222222-2222-4222-8222-222222222222';
for (const base of ['src/supabase/functions/server', 'supabase/functions/make-server-1ccce916']) {
 const source = readFileSync(`${base}/telegram/ronda-helpers.ts`, 'utf8');
 const sf = ts.createSourceFile('helpers.ts', source, ts.ScriptTarget.Latest, true);
 const fn = sf.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'esUsuarioTelegramGerencia')!;
 const text = ts.transpileModule(fn.getText(sf).replace('export ', ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
 const run = new Function(`${text};return esUsuarioTelegramGerencia;`)();
 describe(base, () => {
  it.each([
   { tgActive: true, profileActive: true, role: 'Gerencia', expected: true },
   { tgActive: false, profileActive: true, role: 'Gerencia', expected: false },
   { tgActive: true, profileActive: false, role: 'Gerencia', expected: false },
   { tgActive: true, profileActive: undefined, role: 'Gerencia', expected: false },
   { tgActive: true, profileActive: true, role: 'Administrador', expected: false },
   { tgActive: true, profileActive: true, role: 'Monitor', expected: false },
  ])('requires fresh linked active Gerencia $expected ($tgActive/$profileActive/$role)', async test => {
   vi.stubGlobal('fetch', vi.fn(async input => {
    const url = new URL(String(input));
    const body = url.pathname.endsWith('/telegram_usuarios')
     ? { id: tgId, usuario_id: owner, activo: test.tgActive }
     : { id: owner, activo: test.profileActive, rol: test.role };
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
   }));
   const client = createClient('https://supabase.invalid', 'test-key', { auth: { persistSession: false, autoRefreshToken: false } });
   expect(await run(client, tgId)).toBe(test.expected);
  });
  it('refuses database errors before listing approvals', async () => {
   vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"offline"}', { status: 503, headers: { 'content-type': 'application/json' } })));
   expect(await run(createClient('https://supabase.invalid', 'test-key'), tgId)).toBe(false);
  });
 });
}
