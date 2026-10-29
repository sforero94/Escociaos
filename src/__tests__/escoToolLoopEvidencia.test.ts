import { describe, it, expect, vi, afterEach } from 'vitest';
// Import dinámico para ejecutar Deno bajo Vitest sin incluirlo en tsc del navegador.
const chatModulePath = '../supabase/functions/server/chat.tsx';
const { llmToolLoop } = await import(chatModulePath) as { llmToolLoop: (messages: Array<{ role: string; content: string }>) => Promise<{ text: string; toolInteractions: Array<{ tool: string; result_summary: string }> }> };
const respuestaModelo = (message: Record<string, unknown>) => new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 });
const llamada = (name: string, args: Record<string, unknown>) => ({ role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name, arguments: JSON.stringify(args) } }] });
afterEach(() => vi.unstubAllGlobals());
describe('Integración del loop de Esco con consulta obligatoria de partos', () => {
  it('conserva el resultado inmediato completo y rechaza la negación tras perder detalle de contexto', async () => {
    const database = 'https://fixture.test';
    const provider = 'https://openrouter.ai/api/v1/chat/completions';
    const note = 'synthetic-detail-'.repeat(1600);
    vi.stubGlobal('Deno', { env: { get: (key: string) => key === 'SUPABASE_URL' ? database : 'synthetic-key' } });
    let round = 0;
    const requests: string[] = [];
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string, opts?: RequestInit) => {
      const url = new URL(input); requests.push(input);
      if (url.origin === database && ['hato_animales', 'hato_eventos'].some(t => url.pathname === `/rest/v1/${t}`)
        && (opts?.method ?? 'GET') === 'GET') {
        const rows = url.pathname.endsWith('/hato_eventos')
          ? [{ id: 'e', animal_id: 'a', tipo: 'parto', fecha: '2026-09-20', datos: { note } }]
          : [{ id: 'a', numero: 87, nombre: 'MADRE SINTETICA', estado: 'activa' }];
        return new Response(JSON.stringify(rows), { headers: { 'content-range': '0-0/1' } });
      }
      if (input !== provider || opts?.method !== 'POST') throw new Error('Unmatched synthetic request');
      bodies.push(JSON.parse(String(opts.body)));
      return round++ === 0 ? respuestaModelo(llamada('get_hato_partos', { date_from: '2026-09-01', date_to: '2026-10-07' }))
        : respuestaModelo({ role: 'assistant', content: 'No hay partos registrados.' });
    }));
    const r = await llmToolLoop([{ role: 'user', content: '¿Qué partos hubo en septiembre?' }]);
    const immediate = JSON.parse((bodies[1].messages as { role: string; content: string }[]).find(m => m.role === 'tool')!.content);
    expect(immediate.detalle[0].datos.note).toBe(note);
    expect(immediate._evidencia.consulta_completa).toBe(true);
    const saved = JSON.parse(r.toolInteractions[0].result_summary);
    expect(saved).toMatchObject({ contexto_recortado: true, _evidencia: { consulta_completa: false, detalle_completo: false } });
    expect(saved.detalle).toBeUndefined(); expect(saved.resumen.total_eventos).toBe(1);
    expect(r.text).toContain('No pude verificar'); expect(r.text).not.toBe('No hay partos registrados.');
    expect(requests).toHaveLength(4);
    expect(requests.filter(u => u.startsWith(database))).toHaveLength(2);
  });
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
