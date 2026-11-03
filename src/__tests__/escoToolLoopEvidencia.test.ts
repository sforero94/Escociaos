import { describe, it, expect, vi, afterEach } from 'vitest';
// Dynamic import keeps Deno runtime imports out of frontend TypeScript.
const chatModulePath = '../supabase/functions/server/chat.tsx';
const { llmToolLoop } = await import(chatModulePath) as { llmToolLoop: (messages: Array<{ role: string; content: string }>) => Promise<{ text: string; toolInteractions: Array<{ tool: string; result_summary: string }> }> };
const DB = 'https://birth-source-fixture.invalid';
const PROVIDER = 'https://openrouter.ai/api/v1/chat/completions';
const FALSE_ABSENCE = 'No hay partos registrados. SYN_GENERATED_ABSENCE';
const NOTE = 'synthetic-detail-'.repeat(1600);
interface ProbeOptions { unavailable?: boolean; capped?: boolean; to?: string }
function fixture(options: ProbeOptions = {}) {
  const requests: Request[] = [];
  const bodies: Array<{ tool_choice?: unknown; messages?: unknown[] }> = [];
  const rejected: string[] = [];
  const inherited = vi.fn(async (): Promise<Response> => { throw Error('Inherited network forbidden'); });
  vi.stubGlobal('fetch', inherited);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.stubGlobal('Deno', { env: { get: (key: string) => {
    if (key === 'SUPABASE_URL') return DB;
    if (['SUPABASE_SERVICE_ROLE_KEY', 'OPENROUTER_API_KEY'].includes(key)) return 'synthetic-key';
    rejected.push(`env:${key}`); throw Error('Unlisted synthetic environment key');
  } } });
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init); requests.push(request);
    const url = new URL(request.url);
    if (request.url === PROVIDER && request.method === 'POST') {
      bodies.push(JSON.parse(await request.text()));
      return Response.json({ choices: [{ message: bodies.length === 1 ? { role: 'assistant', content: FALSE_ABSENCE, tool_calls: [{
        id: 'call-birth-source', type: 'function', function: { name: 'get_hato_partos',
          // Wrong proposal: explicit USER dates must independently bind the source query.
          arguments: JSON.stringify({ date_from: '1999-01-01', date_to: '2039-12-31' }) },
      }] } : { role: 'assistant', content: FALSE_ABSENCE } }] });
    }
    if (url.origin !== DB || request.method !== 'GET' || !['/rest/v1/hato_animales', '/rest/v1/hato_eventos'].includes(url.pathname)) {
      rejected.push(`${request.method} ${url.origin}${url.pathname}`); throw Error('Closed synthetic transport');
    }
    if (options.unavailable) return Response.json({ message: 'SYN_SOURCE_ERROR_NOT_FOR_CONTEXT' }, { status: 503 });
    const rows = url.pathname.endsWith('/hato_eventos')
      ? [{ id: 'synthetic-event', animal_id: 'synthetic-mother', tipo: 'parto', fecha: '2034-09-20', datos: { note: NOTE } }]
      : [{ id: 'synthetic-mother', numero: 87, nombre: 'MADRE SINTETICA', estado: 'activa' }];
    if (url.pathname.endsWith('/hato_eventos')) {
      expect(url.searchParams.get('tipo')).toBe('eq.parto');
      expect(url.searchParams.getAll('fecha')).toEqual(['gte.2034-09-01', `lte.${options.to ?? '2034-09-30'}`]);
    }
    return Response.json(rows, { headers: { 'content-range': options.capped ? '0-0/300' : '0-0/1' } });
  });
  return { requests, bodies, rejected, inherited };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function assertClosed(f: ReturnType<typeof fixture>) {
  expect(f.rejected).toEqual([]); expect(f.inherited).not.toHaveBeenCalled();
  expect(f.bodies).toHaveLength(1); // Sources/limitations do not need another prose generation.
  expect(f.bodies[0].tool_choice).toEqual({ type: 'function', function: { name: 'get_hato_partos' } });
}

describe('Shared loop birth evidence and positive context projection', () => {
  it('preserves complete identities/dates while removing a huge note before context persistence', async () => {
    const f = fixture();
    const result = await llmToolLoop([{ role: 'user', content: '¿Qué partos hubo del 2034-09-01 al 2034-09-30?' }]);
    const saved = JSON.parse(result.toolInteractions[0].result_summary);
    expect(saved._evidencia).toMatchObject({ consulta_completa: true, detalle_completo: true, rango: { desde: '2034-09-01', hasta: '2034-09-30' } });
    expect(saved.resumen.total_eventos).toBe(1);
    expect(saved.detalle[0]).toMatchObject({ fecha: '2034-09-20', madre_o_animal: { numero: 87, nombre: 'MADRE SINTETICA' } });
    expect(saved.detalle[0].datos).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('synthetic-detail-');
    expect(JSON.stringify(f.bodies)).not.toContain('synthetic-detail-');
    expect(result.text).toContain('MADRE SINTETICA'); expect(result.text).toContain('2034-09-20');
    expect(result.text).not.toContain(FALSE_ABSENCE);
    expect(f.requests).toHaveLength(3); assertClosed(f);
  });
  it('forces the birth tool, binds the explicit USER range, and renders fresh facts instead of model absence', async () => {
    const f = fixture({ to: '2034-10-07' });
    const result = await llmToolLoop([{ role: 'user', content: '¿Qué partos hubo del 2034-09-01 al 2034-10-07?' }]);
    expect(result.text).toContain('MADRE SINTETICA');
    expect(result.text).toContain('Total de registros verificados: 1');
    expect(result.text).not.toContain(FALSE_ABSENCE);
    const saved = JSON.parse(result.toolInteractions[0].result_summary);
    expect(saved._evidencia.consulta_completa).toBe(true);
    expect(saved.detalle[0].madre_o_animal.numero).toBe(87); assertClosed(f);
  });
  it('returns an explicit limit on failed fresh reads without raw errors or invented absence', async () => {
    const f = fixture({ unavailable: true });
    const result = await llmToolLoop([{ role: 'user', content: '¿Qué nuevos partos hubo del 2034-09-01 al 2034-09-30?' }]);
    expect(result.text).toContain('No pude verificar'); expect(result.text).not.toContain(FALSE_ABSENCE);
    expect(f.requests.some(request => request.url.startsWith(DB))).toBe(true);
    expect(JSON.stringify(result)).not.toContain('SYN_SOURCE_ERROR_NOT_FOR_CONTEXT');
    expect(JSON.parse(result.toolInteractions[0].result_summary)).toMatchObject({ error: 'source_unavailable', _evidencia: { consulta_completa: false }, requiere_reconsulta: true });
    assertClosed(f);
  });
  it('never certifies a short capped page as complete; persistence keeps only safe unavailable evidence', async () => {
    const f = fixture({ capped: true });
    const result = await llmToolLoop([{ role: 'user', content: '¿Qué partos hubo del 2034-09-01 al 2034-09-30?' }]);
    expect(result.text).toContain('No pude verificar');
    expect(result.text).not.toContain('Total de registros verificados: 1');
    const saved = JSON.parse(result.toolInteractions[0].result_summary);
    expect(saved).toMatchObject({ error: 'source_unavailable', _evidencia: { consulta_completa: false }, requiere_reconsulta: true });
    expect(saved.detalle).toBeUndefined();
    expect(f.requests.some(request => request.url.startsWith(DB))).toBe(true); assertClosed(f);
  });
});
