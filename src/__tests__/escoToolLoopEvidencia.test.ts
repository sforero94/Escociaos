import { describe, it, expect, vi, afterEach } from 'vitest';
// Import dinámico para ejecutar Deno bajo Vitest sin incluirlo en tsc del navegador.
const chatModulePath = '../supabase/functions/server/chat.tsx';
const { llmToolLoop } = await import(chatModulePath) as { llmToolLoop: (messages: Array<{ role: string; content: string }>, userId?: string, onEvent?: (event: { type: string; ok?: boolean }) => void, toolTransport?: (name: string, args: Record<string, unknown>) => Promise<string>) => Promise<{ text: string; toolInteractions: Array<{ tool: string; result_summary: string }> }> };
const respuestaModelo = (message: Record<string, unknown>) => new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 });
const llamada = (name: string, args: Record<string, unknown>) => ({ role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name, arguments: JSON.stringify(args) } }] });
afterEach(() => vi.unstubAllGlobals());
describe('typed summary transport (synthetic)', () => {
  it('delivers full evidence immediately and persists conservative metadata', async () => {
    vi.stubGlobal('Deno', { env: { get: () => 'synthetic-key' } });
    const full = JSON.stringify({ _evidencia: { herramienta: 'get_hato_animales',
      consulta_completa: true, detalle_completo: true, total_hechos: 1,
      rango: { desde: '2026-09-01', hasta: '2026-09-30' } },
      resumen: { total: 1 }, detalle: [{ id: 'synthetic-animal', nota: 'x'.repeat(25000) }] });
    let round = 0;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, opts: RequestInit) => {
      const body = JSON.parse(String(opts.body));
      if (round++ === 0) return respuestaModelo(llamada('get_hato_animales', {}));
      expect(body.messages.find((m: { role: string }) => m.role === 'tool').content).toBe(full);
      return respuestaModelo({ role: 'assistant', content: 'Resultado sintético.' });
    }));
    const result = await llmToolLoop([{ role: 'user', content: 'Consulta la ficha del animal.' }], undefined, undefined, async () => full);
    const persisted = JSON.parse(result.toolInteractions[0].result_summary);
    expect(persisted._evidencia_v1).toMatchObject({ outcome: 'partial', complete: false,
      retrieval_complete: true, detail_complete: false, truncation: { context: true } });
    expect(persisted._evidencia.consulta_completa).toBe(false);
    expect(persisted.detalle).toBeUndefined();
  });
});
describe('Integración del loop de Esco con consulta obligatoria de partos', () => {
  it('enruta la pregunta original al historial completo y persiste evidencia verificable', async () => {
    vi.stubGlobal('Deno', { env: { get: (key: string) => key === 'SUPABASE_URL' ? 'https://example.test' : 'fixture-key' } });
    let ronda = 0;
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, opts: RequestInit) => {
      if (url.includes('/rest/v1/')) {
        const u = new URL(url);
        if (u.pathname.endsWith('/hato_eventos')) {
          expect(u.searchParams.get('tipo')).toBe('eq.parto');
          expect(u.searchParams.get('fecha')).toBe('gte.2026-09-01');
          return new Response(JSON.stringify([{ id: 'e', animal_id: 'a', tipo: 'parto', fecha: '2026-09-20' }]), { headers: { 'content-range': '0-0/1' } });
        }
        return new Response(JSON.stringify([{ id: 'a', numero: 1, nombre: 'MADRE A', estado: 'activa' }]), { headers: { 'content-range': '0-0/1' } });
      }
      bodies.push(JSON.parse(String(opts.body)));
      return ronda++ === 0 ? respuestaModelo(llamada('get_hato_partos', { date_from: '2026-09-01', date_to: '2026-10-07' })) : respuestaModelo({ role: 'assistant', content: 'MADRE A tuvo un parto el 20 de septiembre.' });
    }));
    const r = await llmToolLoop([{ role: 'user', content: '¿Qué partos hay en septiembre y octubre?' }]);
    expect(bodies[0].tool_choice).toEqual({ type: 'function', function: { name: 'get_hato_partos' } });
    expect(r.text).toContain('MADRE A');
    expect(JSON.parse(r.toolInteractions[0].result_summary)._evidencia.consulta_completa).toBe(true);
    expect(JSON.parse(r.toolInteractions[0].result_summary).detalle[0].madre_o_animal.numero).toBe(1);
    const immediate = JSON.parse((bodies[1].messages as Array<{ role: string; content: string }>).find(m => m.role === 'tool')!.content);
    const persisted = JSON.parse(r.toolInteractions[0].result_summary);
    expect(immediate._evidencia_v1).toEqual(persisted._evidencia_v1);
    expect(immediate._evidencia_v1).toMatchObject({ outcome: 'success', complete: true,
      source_refs: [{ table: 'hato_eventos', id: 'e' }], scope: { entity_ids: ['a'] } });
  });
  it('si la consulta falla, reemplaza una negación fabricada por falta de verificación', async () => {
    vi.stubGlobal('Deno', { env: { get: () => 'fixture-key' } });
    let ronda = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/rest/v1/')) return new Response('fallo de consulta', { status: 503 });
      return ronda++ === 0 ? respuestaModelo(llamada('get_hato_partos', { date_from: '2026-09-01', date_to: '2026-10-07' })) : respuestaModelo({ role: 'assistant', content: 'No hay partos registrados.' });
    }));
    const r = await llmToolLoop([{ role: 'user', content: '¿Qué nuevos partos tenemos?' }]);
    expect(r.text).toContain('No pude verificar');
    expect(r.text).not.toBe('No hay partos registrados.');
    expect(JSON.parse(r.toolInteractions[0].result_summary)._evidencia_v1).toMatchObject({ outcome: 'unavailable', complete: false });
  });
  it('servidor con max_rows menor que la página no se considera consulta completa', async () => {
    vi.stubGlobal('Deno', { env: { get: () => 'fixture-key' } });
    let ronda = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/rest/v1/')) return new Response(JSON.stringify([{ id: 'e' }]), { headers: { 'content-range': '0-0/300' } });
      return ronda++ === 0 ? respuestaModelo(llamada('get_hato_partos', { date_from: '2026-09-01', date_to: '2026-10-07' })) : respuestaModelo({ role: 'assistant', content: 'Solo hubo un parto.' });
    }));
    const r = await llmToolLoop([{ role: 'user', content: '¿Qué partos hubo?' }]);
    expect(r.text).toContain('No pude verificar');
    expect(JSON.parse(r.toolInteractions[0].result_summary).error).toContain('recortó');
  });
});


describe('typed tool event consumer (synthetic)', () => {
  it('reports unavailable typed evidence as failed even without a raw error key', async () => {
    const { adaptarEvidenciaLegada } = await import('@/utils/escoEvidencia');
    vi.stubGlobal('Deno', { env: { get: () => 'synthetic-key' } });
    let round = 0;
    vi.stubGlobal('fetch', vi.fn(async () => round++ === 0
      ? respuestaModelo(llamada('get_hato_animales', {}))
      : respuestaModelo({ role: 'assistant', content: 'Sin verificación.' })));
    const events: Array<{ type: string; ok?: boolean }> = [];
    await llmToolLoop([{ role: 'user', content: 'Consulta la ficha.' }], undefined,
      event => events.push(event), async () => JSON.stringify({ _evidencia_v1: adaptarEvidenciaLegada({ error: true }) }));
    expect(events.find(e => e.type === 'tool_done')?.ok).toBe(false);
  });
});
