// Synthetic source evidence, not a model-quality campaign.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Evidence, Fact } from '../utils/escoEvidencia';
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
function transport(rows: ReturnType<typeof pesaje>[], failOffset?: number, animalNumero?: number, countMode = 'exact', countTable = 'hato_pesajes_leche', quincenasRequested = false, modelPeriod = period) {
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
          name: 'get_hato_produccion', arguments: JSON.stringify({ date_from: modelPeriod.desde, date_to: modelPeriod.hasta, num_quincenas: quincenasRequested ? 1 : undefined, animal_numero: animalNumero }),
        } }] } : { role: 'assistant', content: 'Respuesta sintética de control.' } }] });
    }
    if (u.origin === 'https://leche-fixture.invalid' && request.method === 'GET') {
      const offset = Number(u.searchParams.get('offset') ?? 0);
      const limit = Number(u.searchParams.get('limit') ?? 200);
      if (u.pathname === '/rest/v1/hato_pesajes_leche') {
        expect(u.searchParams.get('select')).toBe('animal_id,fecha,litros_total,animal:hato_animales(numero,nombre)');
        expect(u.searchParams.getAll('fecha')).toEqual(['gte.' + period.desde, 'lte.' + period.hasta]);
        if (offset === failOffset) return Response.json({ message: 'synthetic unavailable' }, { status: 503 });
        const filter = u.searchParams.get('animal_id');
        const selected = rows.filter(row => !filter || (filter.startsWith('eq.') ? row.animal_id === filter.slice(3) : filter === 'in.(animal-a,animal-b)'));
        const page = selected.slice(offset, offset + limit);
        return Response.json(page, { headers: countHeaders('hato_pesajes_leche', offset, page.length, selected.length) });
      }
      if (u.pathname === '/rest/v1/hato_animales') {
        expect(u.searchParams.get('numero')).toBe('eq.87');
        const animals = [...new Set(rows.map(r => r.animal_id))].map(id => ({ id, numero: 87 }));
        return Response.json(animals, { headers: countHeaders('hato_animales', 0, animals.length, animals.length) });
      }
      if (u.pathname === '/rest/v1/hato_produccion_quincenal') return Response.json([], { headers: countHeaders('hato_produccion_quincenal', 0, 0, 0) });
    }
    unmatched.push(request.method + ' ' + request.url); throw Error('Unmatched synthetic request');
  });
  return { requests, unmatched, modelBodies };
}
interface SavedContext { state?: 'validated' | 'unavailable'; evidence?: Evidence; error?: string; consulta_completa?: boolean; code?: string; essentialFactsUnavailable?: boolean; omittedDetail?: boolean }
async function run(rows: ReturnType<typeof pesaje>[], failOffset?: number, animalNumero?: number, countMode = 'exact', countTable = 'hato_pesajes_leche', quincenasRequested = false, modelPeriod = period) {
  const f = transport(rows, failOffset, animalNumero, countMode, countTable, quincenasRequested, modelPeriod);
  const question = `Compara los pesajes medidos del ${period.desde} al ${period.hasta}${animalNumero === undefined ? '' : ` de la vaca con número ${animalNumero}`}${quincenasRequested ? ' y la serie quincenal' : ''}.`;
  const result = await llmToolLoop([{ role: 'system', content: getSystemPrompt() }, { role: 'user', content: question }]);
  expect(f.unmatched).toEqual([]); expect(f.modelBodies).toHaveLength(1);
  expect(result.toolInteractions).toHaveLength(1);
  expect(f.modelBodies[0].messages.filter(m => m.content === question)).toHaveLength(1);
  expect(f.modelBodies[0].messages.some(m => m.role === 'tool')).toBe(false);
  const saved = JSON.parse(result.toolInteractions[0].result_summary) as SavedContext;
  // Source observations and the legacy DTO never become another model request.
  expect(JSON.stringify(f.modelBodies)).not.toContain('VACA SINTETICA');
  expect(JSON.stringify(saved)).not.toMatch(/pesajes_semanales|muestras_recientes|litros_am|litros_pm|observaciones|created_by/);
  return { ...f, saved, result };
}
function savedFact(result: Awaited<ReturnType<typeof run>>, metric: Fact['metric'], animalId?: string): Fact {
  expect(result.saved.state, JSON.stringify(result.saved)).toBe('validated');
  const fact = result.saved.evidence?.facts.find(f => f.metric === metric && (animalId === undefined ? f.entities.length === 0 : f.entities.some(e => e.kind === 'animal' && e.id === animalId)));
  expect(fact).toBeDefined();
  return fact!;
}
function expectUnavailable(result: Awaited<ReturnType<typeof run>>) {
  expect(result.saved.state).not.toBe('validated');
  if (result.saved.state === 'unavailable') expect(result.saved).toEqual({ state: 'unavailable', code: 'source_unavailable', essentialFactsUnavailable: true, omittedDetail: true });
  else expect(result.saved).toMatchObject({ error: expect.any(String), consulta_completa: false });
  expect(result.saved.evidence).toBeUndefined();
  expect(result.result.text).not.toContain('Respuesta sintética de control.');
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
  it('reads the 2001st observation and persists bounded canonical facts without exposing source values to the model', async () => {
    const r = await run([...Array.from({ length: 2000 }, (_, i) => pesaje('animal-a', 10, i)), pesaje('animal-b', 90, 2000)]);
    expect(savedFact(r, 'milk.count').value).toEqual({ kind: 'decimal', value: '2001', unit: 'registro' });
    expect(savedFact(r, 'milk.volume').value).toEqual({ kind: 'decimal', value: '20090', unit: 'L' });
    expect(savedFact(r, 'milk.count').coverage).toMatchObject({ population: 'complete', rowsRead: 2001, expectedRows: 2001, identityUnique: true });
    expect(savedFact(r, 'milk.mean').value.kind).toBe('unknown'); // No rounded mean is multiplied back into a volume.
    expect(Buffer.byteLength(JSON.stringify(r.saved))).toBeLessThanOrEqual(24000);
    expect(savedFact(r, 'milk.count', 'animal-a').value).toEqual({ kind: 'decimal', value: '2000', unit: 'registro' });
    expect(savedFact(r, 'milk.volume', 'animal-a').value).toEqual({ kind: 'decimal', value: '20000', unit: 'L' });
    expect(savedFact(r, 'milk.mean', 'animal-a').value).toEqual({ kind: 'decimal', value: '10', unit: 'L/pesaje', denominator: 'pesaje_observado' });
    expect(savedFact(r, 'milk.count', 'animal-b').value).toEqual({ kind: 'decimal', value: '1', unit: 'registro' });
    expect(savedFact(r, 'milk.volume', 'animal-b').value).toEqual({ kind: 'decimal', value: '90', unit: 'L' });
    expect(savedFact(r, 'milk.mean', 'animal-b').value).toEqual({ kind: 'decimal', value: '90', unit: 'L/pesaje', denominator: 'pesaje_observado' });
    expect(r.saved.evidence?.facts).toHaveLength(9);
    expect(r.saved.evidence?.facts.filter(f => f.metric === 'milk.mean' && f.entities.length > 0).map(f => f.entities[0].id)).toEqual(['animal-b', 'animal-a']);
    expect(r.requests.some(url => new URL(url).pathname.endsWith('/hato_pesajes_leche') && new URL(url).searchParams.get('offset') === '2000')).toBe(true);
  });
  it('asks to disambiguate a recycled number rather than merging historical UUIDs', async () => {
    const r = await run([pesaje('animal-a', 28), pesaje('animal-b', 12)], undefined, 87);
    expectUnavailable(r);
    expect(r.requests.some(url => new URL(url).pathname.endsWith('/hato_pesajes_leche'))).toBe(false);
    expect(JSON.stringify(r.saved)).not.toMatch(/animal-a|animal-b/);
    expect(r.result.text).toMatch(/aclara|precisa|identidad|ambigu|UUID|más de un/i);
  });
  it('preserves a complete short result and its exact mean without context loss', async () => {
    const r = await run([pesaje('animal-a', 28), pesaje('animal-a', 30, 7)]);
    expect(savedFact(r, 'milk.count').value).toEqual({ kind: 'decimal', value: '2', unit: 'registro' });
    expect(savedFact(r, 'milk.volume').value).toEqual({ kind: 'decimal', value: '58', unit: 'L' });
    expect(savedFact(r, 'milk.mean').value).toEqual({ kind: 'decimal', value: '29', unit: 'L/pesaje', denominator: 'pesaje_observado' });
    expect(r.saved.evidence?.scopes[0].period).toMatchObject({ from: period.desde, to: period.hasta, clock: 'America/Bogota', basis: 'observation', fieldMeaning: 'fecha' });
  });
  it('uses the actual explicit user period instead of model-proposed historical dates', async () => {
    const r = await run([pesaje('animal-a', 28)], undefined, undefined, 'exact', 'hato_pesajes_leche', false, { desde: '1999-01-01', hasta: '1999-01-07' });
    expect(savedFact(r, 'milk.count').value).toEqual({ kind: 'decimal', value: '1', unit: 'registro' });
    expect(r.saved.evidence?.scopes.every(s => s.period?.from === period.desde && s.period.to === period.hasta)).toBe(true);
    expect(JSON.stringify(r.saved)).not.toContain('1999-01');
    expect(r.requests.filter(url => new URL(url).pathname.endsWith('/hato_pesajes_leche')).every(url => JSON.stringify(new URL(url).searchParams.getAll('fecha')) === JSON.stringify(['gte.' + period.desde, 'lte.' + period.hasta]))).toBe(true);
  });
  it('binds an unambiguous cow number to one permanent UUID and preserves its attribution', async () => {
    const r = await run([pesaje('animal-a', 28), pesaje('animal-a', 30, 7)], undefined, 87);
    expect(savedFact(r, 'milk.mean', 'animal-a').entities).toEqual([{ kind: 'animal', id: 'animal-a' }]);
    expect(r.saved.evidence?.scopes[0].filters).toEqual({ animal_id: 'animal-a' });
    expect(r.requests.filter(url => new URL(url).pathname.endsWith('/hato_pesajes_leche')).every(url => new URL(url).searchParams.get('animal_id') === 'eq.animal-a')).toBe(true);
  });
  it('bounds canonical persistence for 20000 observations and never submits the source DTO for generation', async () => {
    const r = await run(Array.from({ length: 20000 }, (_, i) => pesaje('animal-' + (i % 10), 10, Math.floor(i / 10))));
    expect(Buffer.byteLength(JSON.stringify(r.saved))).toBeLessThanOrEqual(24000);
    expect(savedFact(r, 'milk.count').value).toEqual({ kind: 'decimal', value: '20000', unit: 'registro' });
    expect(savedFact(r, 'milk.volume').value).toEqual({ kind: 'decimal', value: '200000', unit: 'L' });
    expect(savedFact(r, 'milk.mean').value).toEqual({ kind: 'decimal', value: '10', unit: 'L/pesaje', denominator: 'pesaje_observado' });
    expect(r.saved.evidence!.facts.length).toBeGreaterThan(3);
    expect(r.saved.evidence!.facts.length).toBeLessThanOrEqual(200);
    expect(r.saved.evidence?.state).toBe('partial');
    expect(r.saved.evidence?.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'budget_exceeded' })]));
    const childCounts = r.saved.evidence?.facts.filter(f => f.metric === 'milk.count' && f.entities.length > 0) ?? [];
    expect(childCounts.length).toBeGreaterThan(0);
    expect(childCounts.length).toBeLessThan(10);
    expect(childCounts.every(f => f.value.kind === 'decimal' && f.value.value === '2000')).toBe(true);
    expect(childCounts.reduce((n, f) => n + (f.value.kind === 'decimal' ? Number(f.value.value) : 0), 0)).toBeLessThan(20000);
  });
  it('finishes an exact full page using its verified total without an unnecessary empty read', async () => {
    const r = await run(Array.from({ length: 200 }, (_, i) => pesaje('animal-a', 10, i)));
    expect(savedFact(r, 'milk.count').coverage.population).toBe('complete');
    expect(r.requests.filter(url => new URL(url).pathname.endsWith('/hato_pesajes_leche'))).toHaveLength(1);
  });
  it('accepts exactly 20000 verified rows without inventing a stricter limit', async () => {
    const r = await run(Array.from({ length: 20000 }, (_, i) => pesaje('animal-' + (i % 10), 10, Math.floor(i / 10))));
    expect(savedFact(r, 'milk.count').coverage).toMatchObject({ population: 'complete', rowsRead: 20000, expectedRows: 20000 });
    expect(r.requests.filter(url => new URL(url).pathname.endsWith('/hato_pesajes_leche'))).toHaveLength(100);
  });
  it('fails closed at the existing 20000-row safety ceiling instead of publishing partial averages', async () => {
    const rows = Array.from({ length: 20001 }, (_, i) => pesaje('animal-' + (i % 10), 10, Math.floor(i / 10)));
    const r = await run(rows); expectUnavailable(r);
    expect(r.result.text).not.toMatch(/\|[^\n]*Promedio por pesaje observado[^\n]*\|/);
  });
  it.each(['missing', 'wildcard', 'wrong-range'])('never certifies unverifiable weight coverage: %s', async mode => {
    const r = await run(Array.from({ length: 80 }, (_, i) => pesaje('animal-a', 10, i)), undefined, undefined, mode);
    expectUnavailable(r);
  });
  it('rejects changing exact totals across pages rather than claiming a stable universe', async () => {
    const r = await run(Array.from({ length: 400 }, (_, i) => pesaje('animal-a', 10, i)), undefined, undefined, 'changing');
    expectUnavailable(r);
  });
  it('requires an exact coverage proof before resolving a cow number', async () => {
    const r = await run([pesaje('animal-a', 10)], undefined, 87, 'missing', 'hato_animales');
    expectUnavailable(r);
    expect(r.requests.some(url => new URL(url).pathname.endsWith('/hato_pesajes_leche'))).toBe(false);
  });
  it('does not certify quincenal data when that separate source is unverified or unsupported', async () => {
    const r = await run([pesaje('animal-a', 10)], undefined, undefined, 'missing', 'hato_produccion_quincenal', true);
    expect(savedFact(r, 'milk.count').value).toEqual({ kind: 'decimal', value: '1', unit: 'registro' });
    expect(r.saved.evidence?.state).toBe('partial');
    expect(r.saved.evidence?.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'unsupported_operation' })]));
    expect(r.requests.some(url => new URL(url).pathname.endsWith('/hato_produccion_quincenal'))).toBe(false);
    expect(r.result.text).toMatch(/fuera del contrato|no verificable|no disponible|no puedo verificar/i);
  });
  it('does not aggregate an available first page after a later source failure', async () => {
    const r = await run(Array.from({ length: 201 }, (_, i) => pesaje('animal-a', 10, i)), 200);
    expectUnavailable(r);
    expect(r.requests.some(url => new URL(url).pathname.endsWith('/hato_pesajes_leche') && new URL(url).searchParams.get('offset') === '200')).toBe(true);
  });
  it('rejects duplicated composite identities across source pages before publishing their totals', async () => {
    const rows = Array.from({ length: 201 }, (_, i) => pesaje('animal-a', 10, i)); rows[200] = pesaje('animal-a', 90, 0);
    expectUnavailable(await run(rows));
  });
  it('counts distinct UUIDs on the same observation date once each despite identical labels', async () => {
    const r = await run([pesaje('animal-a', 28), pesaje('animal-b', 12)]);
    expect(savedFact(r, 'milk.count').value).toEqual({ kind: 'decimal', value: '2', unit: 'registro' });
    for (const id of ['animal-a', 'animal-b']) {
      expect(savedFact(r, 'milk.count', id).value).toEqual({ kind: 'decimal', value: '1', unit: 'registro' });
      expect(savedFact(r, 'milk.count', id).coverage).toMatchObject({ rowsRead: 1, expectedRows: 1, identityUnique: true });
    }
    expect(savedFact(r, 'milk.mean', 'animal-a').value).toEqual({ kind: 'decimal', value: '28', unit: 'L/pesaje', denominator: 'pesaje_observado' });
    expect(savedFact(r, 'milk.mean', 'animal-b').value).toEqual({ kind: 'decimal', value: '12', unit: 'L/pesaje', denominator: 'pesaje_observado' });
  });
  it('preserves exact per-animal means and ties without inventing differences from a rounded DTO', async () => {
    const r = await run([pesaje('animal-a', 20.01), pesaje('animal-b', 20.04), pesaje('animal-c', 20.04)]);
    const means = r.saved.evidence?.facts.filter(f => f.metric === 'milk.mean' && f.entities.length > 0) ?? [];
    expect(means.map(f => f.value.kind === 'decimal' ? f.value.value : null)).toEqual(['20.04', '20.04', '20.01']);
    expect(new Set(means.slice(0, 2).map(f => f.entities[0].id))).toEqual(new Set(['animal-b', 'animal-c']));
    expect(savedFact(r, 'milk.count').value).toEqual({ kind: 'decimal', value: '3', unit: 'registro' });
  });
  it('reports a verified empty observation population without inventing zero animal production', async () => {
    const r = await run([]);
    expect(savedFact(r, 'milk.count').value).toEqual({ kind: 'decimal', value: '0', unit: 'registro' });
    expect(savedFact(r, 'milk.count').assertion).toBe('bounded_empty');
    expect(savedFact(r, 'milk.volume').value.kind).toBe('unknown');
    expect(savedFact(r, 'milk.mean').value.kind).toBe('unknown');
    expect(r.saved.evidence?.facts.some(f => f.entities.length > 0)).toBe(false);
  });
  it('preserves the global population while explicitly bounding high-cardinality animal detail', async () => {
    const r = await run(Array.from({ length: 201 }, (_, i) => pesaje('animal-' + i, 10)));
    expect(savedFact(r, 'milk.count').value).toEqual({ kind: 'decimal', value: '201', unit: 'registro' });
    expect(savedFact(r, 'milk.volume').value).toEqual({ kind: 'decimal', value: '2010', unit: 'L' });
    expect(r.saved.evidence!.facts.length).toBeLessThanOrEqual(200);
    expect(r.saved.evidence!.facts.filter(f => f.entities.length > 0).length).toBeLessThan(201 * 3);
    expect(r.saved.evidence?.state).toBe('partial');
    expect(r.saved.evidence?.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'budget_exceeded' })]));
    expect(r.result.text).toMatch(/omitid|limitad|no.*exhaustiv/i);
  });
  it('keeps a distinctive source value out of every model body and persists only the canonical result', async () => {
    const contaminated = { ...pesaje('animal-a', 887766.125), observaciones: 'SYN_PRIVATE_MILK_NOTE', created_by: 'SYN_PRIVATE_WORKER_ID', salario: 'SYN_PRIVATE_PAY' };
    const r = await run([contaminated]);
    expect(savedFact(r, 'milk.volume').value).toEqual({ kind: 'decimal', value: '887766.125', unit: 'L' });
    expect(JSON.stringify(r.modelBodies)).not.toContain('887766.125');
    expect(JSON.stringify(r.modelBodies)).not.toContain('animal-a');
    expect(JSON.stringify(r.saved)).not.toMatch(/SYN_PRIVATE_MILK_NOTE|SYN_PRIVATE_WORKER_ID|SYN_PRIVATE_PAY/);
    expect(JSON.stringify(r.modelBodies)).not.toMatch(/SYN_PRIVATE_MILK_NOTE|SYN_PRIVATE_WORKER_ID|SYN_PRIVATE_PAY/);
    expect(r.requests.filter(url => new URL(url).pathname.endsWith('/hato_pesajes_leche')).every(url => new URL(url).searchParams.get('select') === 'animal_id,fecha,litros_total,animal:hato_animales(numero,nombre)')).toBe(true);
  });
});
