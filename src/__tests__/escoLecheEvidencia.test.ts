// Synthetic source evidence, not a model-quality campaign.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildProduccionSummary, type HatoPesajeRow } from '../supabase/functions/server/hato-aggregation';
const path = '../supabase/functions/server/chat.tsx';
const { llmToolLoop, getSystemPrompt } = await import(path) as {
  llmToolLoop: (messages: { role: string; content: string }[]) => Promise<{
    text: string; toolInteractions: { tool: string; result_summary: string }[];
  }>;
  getSystemPrompt: () => string;
};
const period = { desde: '2030-01-01', hasta: '2036-12-31' };
const pesaje = (animal_id: string, litros_total: number, day = 0) => ({
  animal_id, fecha: new Date(Date.UTC(2030, 0, 1 + day)).toISOString().slice(0, 10),
  litros_am: null, litros_pm: null, litros_total,
  animal: { numero: 87, nombre: 'VACA SINTETICA' },
});
function calcular(rows: HatoPesajeRow[]) {
  return buildProduccionSummary({ periodo: period, pesajes: rows, produccionQuincenal: [] });
}
function transport(rows: ReturnType<typeof pesaje>[], failOffset?: number, animalNumero?: number, countMode = 'exact', countTable = 'hato_pesajes_leche') {
  function countHeaders(table: string, offset: number, length: number, total: number): Record<string, string> {
    if (table === countTable && countMode === 'missing') return {};
    if (table === countTable && countMode === 'wildcard') return { 'content-range': '0-79/*' };
    if (table === countTable && countMode === 'wrong-range') return { 'content-range': `1-${length}/${total}` };
    if (table === countTable && countMode === 'changing' && offset === 200) total++;
    return { 'content-range': length ? `${offset}-${offset + length - 1}/${total}` : `*/${total}` };
  }
  const requests: string[] = [];
  const unmatched: string[] = [];
  const modelBodies: { messages: { role: string; content: string }[] }[] = [];
  vi.stubGlobal('Deno', { env: { get: (key: string) => {
    if (key === 'SUPABASE_URL') return 'https://leche-fixture.invalid';
    if (['OPENROUTER_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY'].includes(key)) return 'synthetic-placeholder';
    throw Error('Unknown synthetic environment key');
  } } });
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init); requests.push(request.url);
    const u = new URL(request.url);
    if (request.url === 'https://openrouter.ai/api/v1/chat/completions' && request.method === 'POST') {
      modelBodies.push(JSON.parse(await request.text()));
      return Response.json({ choices: [{ message: modelBodies.length === 1
        ? { role: 'assistant', content: null, tool_calls: [{ id: 'synthetic', type: 'function', function: {
          name: 'get_hato_produccion', arguments: JSON.stringify({ date_from: period.desde, date_to: period.hasta, num_quincenas: 1, animal_numero: animalNumero }),
        } }] } : { role: 'assistant', content: 'Respuesta sintética de control.' } }] });
    }
    if (u.origin === 'https://leche-fixture.invalid' && request.method === 'GET') {
      const offset = Number(u.searchParams.get('offset') ?? 0);
      const limit = Number(u.searchParams.get('limit') ?? 200);
      if (u.pathname === '/rest/v1/hato_pesajes_leche') {
        expect(u.searchParams.getAll('fecha')).toEqual(['gte.' + period.desde, 'lte.' + period.hasta]);
        if (offset === failOffset) return Response.json({ message: 'synthetic unavailable' }, { status: 503 });
        const filter = u.searchParams.get('animal_id');
        const selected = rows.filter(row => !filter || (filter.startsWith('eq.') ? row.animal_id === filter.slice(3) : filter === 'in.(animal-a,animal-b)'));
        const page = selected.slice(offset, offset + limit);
        return Response.json(page, { headers: countHeaders('hato_pesajes_leche', offset, page.length, selected.length) });
      }
      if (u.pathname === '/rest/v1/hato_animales') {
        expect(u.searchParams.get('numero')).toBe('eq.87');
        const animals = [...new Set(rows.map(r => r.animal_id))].map(id => ({ id }));
        return Response.json(animals, { headers: countHeaders('hato_animales', 0, animals.length, animals.length) });
      }
      if (u.pathname === '/rest/v1/hato_produccion_quincenal') return Response.json([], { headers: countHeaders('hato_produccion_quincenal', 0, 0, 0) });
    }
    unmatched.push(request.method + ' ' + request.url); throw Error('Unmatched synthetic request');
  });
  return { requests, unmatched, modelBodies };
}
async function run(rows: ReturnType<typeof pesaje>[], failOffset?: number, animalNumero?: number, countMode = 'exact', countTable = 'hato_pesajes_leche') {
  const f = transport(rows, failOffset, animalNumero, countMode, countTable);
  const result = await llmToolLoop([{ role: 'system', content: getSystemPrompt() }, { role: 'user', content: 'Compara los pesajes medidos en el rango solicitado.' }]);
  expect(f.unmatched).toEqual([]); expect(f.modelBodies).toHaveLength(2);
  const immediate = JSON.parse(f.modelBodies[1].messages.find(m => m.role === 'tool')!.content);
  const saved = JSON.parse(result.toolInteractions[0].result_summary);
  return { ...f, immediate, saved };
}
afterEach(() => vi.unstubAllGlobals());
describe('milk evidence preserves measured identity, values and coverage', () => {
  it('does not merge two historical identities with the same recycled display label', () => {
    const r = calcular([pesaje('animal-a', 28), pesaje('animal-a', 30, 7), pesaje('animal-b', 12)]);
    expect(r.pesajes_semanales.por_vaca.map(v => [v.animal_id, v.promedio_litros, v.num_pesajes])).toEqual([
      ['animal-a', 29, 2], ['animal-b', 12, 1],
    ]);
  });
  it('preserves the existing observation-weighted mean and computes explicit per-animal order', () => {
    const r = calcular([pesaje('animal-a', 28), pesaje('animal-a', 30, 7), pesaje('animal-b', 12)]);
    expect(r.pesajes_semanales.promedio_litros_por_pesaje).toBe(23.3);
    expect(r.resumen.mayores_promedios.map(v => [v.animal_id, v.promedio_litros, v.puesto])).toEqual([
      ['animal-a', 29, 1], ['animal-b', 12, 2],
    ]);
    expect(r.resumen.unidad_pesajes).toBe('L/pesaje observado');
    expect(r.resumen.mayores_promedios[0]).toMatchObject({ primera_fecha: '2030-01-01', ultima_fecha: '2030-01-08', num_pesajes: 2 });
  });
  it('preserves AM/PM source components and a real zero without inventing missing components', () => {
    const r = calcular([{ ...pesaje('animal-a', 28), litros_am: 12, litros_pm: 16 }, pesaje('animal-b', 0)]);
    expect(r.pesajes_semanales.por_vaca[0].registros[0]).toMatchObject({ litros_am: 12, litros_pm: 16, litros_total: 28 });
    expect(r.resumen.menores_promedios[0]).toMatchObject({ animal_id: 'animal-b', promedio_litros: 0 });
    expect(r.pesajes_semanales.por_vaca[1].registros[0]).toMatchObject({ litros_am: null, litros_pm: null, litros_total: 0 });
  });
  it('reports equal rounded means as ties, not a fabricated unique leader', () => {
    const r = calcular([pesaje('animal-a', 20), pesaje('animal-b', 20), pesaje('animal-c', 10)]);
    expect(r.resumen.mayores_promedios.map(v => v.puesto)).toEqual([1, 1, 3]);
  });
  it.each([null, undefined, '', NaN, Infinity])('refuses missing/nonfinite source measurements instead of converting them to zero: %s', invalid => {
    expect(() => calcular([{ ...pesaje('animal-a', 10), litros_total: invalid }] as unknown as HatoPesajeRow[])).toThrow();
  });
  it('refuses a source row without permanent identity', () => {
    expect(() => calcular([{ ...pesaje('animal-a', 10), animal_id: '' }])).toThrow();
  });
  it('does not turn no observed weights into a zero-producing animal', () => {
    const r = calcular([]);
    expect(r.resumen).toMatchObject({ total_registros: 0, animales_con_pesaje: 0, promedio_litros_por_pesaje: null, mayores_promedios: [], menores_promedios: [] });
    expect(r.pesajes_semanales.por_vaca).toEqual([]);
  });
  it('marks the compact ranking slice as partial when more animals exist', () => {
    const r = calcular(Array.from({ length: 7 }, (_, i) => pesaje('animal-' + i, i + 10)));
    expect(r.resumen).toMatchObject({ animales_con_pesaje: 7, clasificacion_completa_en_resumen: false });
    expect(r.resumen.mayores_promedios).toHaveLength(5);
    expect(r.pesajes_semanales.por_vaca).toHaveLength(7);
  });
  it('reads the 2001st observation, bounds provider detail and preserves the saved evidence', async () => {
    const r = await run([...Array.from({ length: 2000 }, (_, i) => pesaje('animal-a', 10, i)), pesaje('animal-b', 90, 2000)]);
    expect(r.immediate.pesajes_semanales.total_registros).toBe(2001);
    expect(r.immediate.resumen.mayores_promedios[0]).toMatchObject({ animal_id: 'animal-b', promedio_litros: 90, puesto: 1, num_pesajes: 1 });
    expect(r.immediate._evidencia).toMatchObject({ consulta_completa: true, agregados_completos: true, detalle_completo: false, herramienta: 'get_hato_produccion', rango: period });
    expect(Buffer.byteLength(JSON.stringify(r.immediate))).toBeLessThanOrEqual(20000);
    expect(r.immediate._evidencia.recortes.pesajes_omitidos).toBe(1981);
    expect(r.immediate.pesajes_semanales.muestras_recientes).toHaveLength(20);
    expect(r.saved).toEqual(r.immediate);
    expect(r.requests.some(url => new URL(url).pathname.endsWith('/hato_pesajes_leche') && new URL(url).searchParams.get('offset') === '2000')).toBe(true);
  });
  it('retains all permanent identities when a queried number was recycled', async () => {
    const r = await run([pesaje('animal-a', 28), pesaje('animal-b', 12)], undefined, 87);
    expect(r.immediate.pesajes_semanales.por_vaca.map((v: { animal_id: string }) => v.animal_id)).toEqual(['animal-a', 'animal-b']);
    expect(r.immediate._evidencia).toMatchObject({ numero_ambiguo: true, identidades_para_numero: ['animal-a', 'animal-b'] });
  });
  it('preserves a complete short result without context loss', async () => {
    const r = await run([pesaje('animal-a', 28), pesaje('animal-a', 30, 7)]);
    expect(r.saved).toEqual(r.immediate);
    expect(r.immediate.resumen.mayores_promedios[0]).toMatchObject({ animal_id: 'animal-a', promedio_litros: 29 });
  });
  it('bounds provider evidence for 20000 observations before generation', async () => {
    const r = await run(Array.from({ length: 20000 }, (_, i) => pesaje('animal-' + (i % 10), 10, Math.floor(i / 10))));
    const content = r.modelBodies[1].messages.find(m => m.role === 'tool')!.content;
    expect(Buffer.byteLength(JSON.stringify(content))).toBeLessThanOrEqual(20000);
    expect(r.immediate.resumen.total_registros).toBe(20000);
    expect(r.immediate._evidencia).toMatchObject({ consulta_completa: true, agregados_completos: true, detalle_completo: false });
  });
  it('finishes an exact full page using its verified total without an unnecessary empty read', async () => {
    const r = await run(Array.from({ length: 200 }, (_, i) => pesaje('animal-a', 10, i)));
    expect(r.immediate._evidencia.consulta_completa).toBe(true);
    expect(r.requests.filter(url => new URL(url).pathname.endsWith('/hato_pesajes_leche'))).toHaveLength(1);
  });
  it('accepts exactly 20000 verified rows without inventing a stricter limit', async () => {
    const r = await run(Array.from({ length: 20000 }, (_, i) => pesaje('animal-' + (i % 10), 10, Math.floor(i / 10))));
    expect(r.immediate._evidencia.consulta_completa).toBe(true);
    expect(r.immediate.pesajes_semanales.total_registros).toBe(20000);
  });
  it('fails closed at the existing 20000-row safety ceiling instead of publishing partial averages', async () => {
    const rows = Array.from({ length: 20001 }, (_, i) => pesaje('animal-' + (i % 10), 10, Math.floor(i / 10)));
    const r = await run(rows);
    expect(r.immediate.error).toContain('reduce el rango'); expect(r.immediate.resumen).toBeUndefined();
    expect(r.immediate._evidencia).toBeUndefined();
  });
  it.each(['missing', 'wildcard', 'wrong-range'])('never certifies unverifiable weight coverage: %s', async mode => {
    const r = await run(Array.from({ length: 80 }, (_, i) => pesaje('animal-a', 10, i)), undefined, undefined, mode);
    expect(r.immediate.error).toBeTruthy(); expect(r.immediate._evidencia).toBeUndefined();
  });
  it('rejects changing exact totals across pages rather than claiming a stable universe', async () => {
    const r = await run(Array.from({ length: 400 }, (_, i) => pesaje('animal-a', 10, i)), undefined, undefined, 'changing');
    expect(r.immediate.error).toBeTruthy(); expect(r.immediate._evidencia).toBeUndefined();
  });
  it.each(['hato_animales', 'hato_produccion_quincenal'])('requires coverage proof for every milk source: %s', async table => {
    const r = await run([pesaje('animal-a', 10)], undefined, table === 'hato_animales' ? 87 : undefined, 'missing', table);
    expect(r.immediate.error).toBeTruthy(); expect(r.immediate._evidencia).toBeUndefined();
  });
  it('does not aggregate an available first page after a later source failure', async () => {
    const r = await run(Array.from({ length: 201 }, (_, i) => pesaje('animal-a', 10, i)), 200);
    expect(r.immediate.error).toBeTruthy(); expect(r.immediate.resumen).toBeUndefined();
    expect(r.saved).toEqual(r.immediate);
  });
});
