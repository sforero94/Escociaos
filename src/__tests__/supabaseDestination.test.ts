import { afterEach, describe, expect, it, vi } from 'vitest';
import { validarConfiguracionSupabase, getSupabaseConfig } from '@/utils/supabase/config';
import { readFileSync } from 'node:fs';
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });
describe('one configured Supabase destination', () => {
  it.each(['https://staging.example.test/', 'http://localhost:54321', 'http://127.0.0.1:54321', 'http://[::1]:54321'])('supports %s', url => {
    expect(validarConfiguracionSupabase(url, ' public-key ')).toEqual({ url: new URL(url).origin, anonKey: 'public-key' });
  });
  it.each(['http://remote.test', 'https://user:secret@example.test', 'https://example.test/prefix', 'https://example.test/?query=1', 'https://example.test/#hash', '', 'file:///tmp/a'])('rejects unsafe %s', url => {
    expect(() => validarConfiguracionSupabase(url, 'public-key')).toThrow();
  });
  it('fails closed on missing configuration', () => {
    vi.stubEnv('VITE_SUPABASE_URL', ''); vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    expect(() => getSupabaseConfig()).toThrow();
  });
  it('uses the isolated destination for an actual SDK read', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://isolated.example.test'); vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-public-key');
    const requests: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      requests.push(String(input)); return new Response('[]', { headers: { 'content-type': 'application/json' } });
    }));
    const { getSupabase } = await import('@/utils/supabase/client');
    const result = await getSupabase().from('productos').select('id');
    expect(result.error).toBeNull(); expect(requests).toHaveLength(1);
    expect(new URL(requests[0]).origin).toBe('https://isolated.example.test');
  });
  it('refuses malformed role/module profiles without granting a default role', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://isolated.example.test'); vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-public-key');
    const id = '10000000-0000-4000-8000-000000000001';
    let row: Record<string, unknown> = { id, activo: true, rol: 'Gerencia', modulos_acceso: [] };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([row]), { headers: { 'content-type': 'application/json' } })));
    const { getUserProfile } = await import('@/utils/supabase/client');
    for (const extra of [{ rol: '' }, { rol: null }, { rol: 'Invented' }, { activo: 'true' },
      { modulos_acceso: 'finanzas' }, { modulos_acceso: [false] }, { id: 'foreign' }]) {
      row = { id, activo: true, rol: 'Gerencia', modulos_acceso: [], ...extra };
      expect(await getUserProfile(id)).toBeNull();
    }
    row = { id, activo: false, rol: 'Monitor', modulos_acceso: null };
    expect(await getUserProfile(id)).toMatchObject({ id, activo: false, rol: 'Monitor', modulos: [] });
  });
  it('all eleven live edge consumers use configured destination without generated project imports', () => {
    for (const path of ['src/utils/chatService.ts', 'src/utils/reporteSemanalService.ts', 'src/utils/informesVisita/clienteProponer.ts',
      'src/components/configuracion/UsuariosConfig.tsx', 'src/components/dashboard/ClimaCard.tsx',
      'src/components/inventory/ImportarProductosCSV.tsx', 'src/components/inventory/InventoryList.tsx',
      'src/components/clima/components/ActualizarClima.tsx', 'src/components/hato/hooks/useOcrLiquidacionPomar.ts',
      'src/components/hato/hooks/useSubirChequeoExcel.ts', 'src/components/hato/hooks/useSubirPesajeFoto.ts']) {
      const text = readFileSync(path, 'utf8'); expect(text).toContain('getSupabaseConfig');
      expect(text).not.toContain('supabase/info'); expect(text).not.toContain('projectId');
    }
  });
});
