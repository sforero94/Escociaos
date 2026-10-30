import { afterEach, describe, expect, it, vi } from 'vitest';
import { BASE_SINTETICA, MODELO_URL, correrCasoCongelado, firmaHttp, instalarHttpCongelado } from '../../evals/esco/lib/ejecutorCongelado';
import { hashFixture, type PaqueteFixtures } from '../utils/escoEvals/fixtures';
import type { CasoDorado } from '../utils/escoEvals/tipos';

const PROMPT = 'Control sintético: no uses datos externos.';
const QUESTION = '¿Qué partos hubo en septiembre?';
const FOLLOWUP = '¿Qué madre aparece en esos partos?';
const modelHeaders = { authorization: 'Bearer synthetic-placeholder', 'content-type': 'application/json' };
const dbHeaders = { ...modelHeaders, apikey: 'synthetic-placeholder', prefer: 'count=exact' };
const result = (body: unknown, status = 200, headers: Record<string, string> = { 'content-type': 'application/json' }) => ({ body: JSON.stringify(body), status, headers });
const message = (m: unknown) => result({ choices: [{ message: m }] });
const call = { role: 'assistant', content: null, tool_calls: [{ id: 'synthetic-call', type: 'function',
  function: { name: 'get_hato_partos', arguments: JSON.stringify({ date_from: '2026-09-01', date_to: '2026-09-30' }) } }] };

function caso(followup = false): CasoDorado {
  return { id: 'ESCO-GS-999001', key: 'SYN-http', title: 'Explicit synthetic actual-loop control',
    domain: 'synthetic', kind: 'behavior', channel: 'Web', channels_observed: ['Web'],
    as_of_bogota: '2026-10-28 12:00', question: QUESTION, paraphrases: [], prior_context: [],
    followup_turns: followup ? [{ rn: 2, user: FOLLOWUP }] : [],
    expected_behavior: { tools_must_include: ['get_hato_partos'], tools_any_of: [], tools_forbidden: [], max_tool_calls: followup ? 2 : 1 },
    reference: { type: 'rubric', sql: '', frozen_result: null, frozen_on: '2026-10-28', replayable_as_of: true },
    numeric_anchors: [{ claim: 'Synthetic mother number', value: 87 }], must: ['Usa solo las filas sintéticas'], must_not: [],
    original: { verdict: 'synthetic', issues: [], runs: [], answer_primary: '' }, tags: ['synthetic'],
    human_review: { verdict: 'no_verificable', verdict_raw: 'unadjudicated' }, include_in_golden: false,
    golden_status: 'synthetic-control-unadjudicated' };
}
const animalCols = 'id,numero,nombre,sexo,etapa,estado,fecha_estado,fecha_nacimiento,fecha_nacimiento_confianza,madre_id,padre_id,padre_toro_id,raza';
const eventCols = 'id,animal_id,tipo,fecha,fecha_confianza,cria_id,cria_destino,transaccion_ganado_id,fin_ingreso_id,fuente,datos';
const animalsUrl = `${BASE_SINTETICA}/rest/v1/hato_animales?select=${animalCols}&order=id.asc&limit=200&offset=0`;
const eventsUrl = `${BASE_SINTETICA}/rest/v1/hato_eventos?select=${eventCols}&order=fecha.asc,id.asc&fecha=gte.2026-09-01&fecha=lte.2026-09-30&tipo=eq.parto&limit=200&offset=0`;
// Pinned raw request-body hashes. Recompute only after reviewing intentional protocol changes.
const modelBodyHashes = ['cce2ab6e94f21a3839a0af93c289fa1f4ae6598efaae151b4b316e7cf52e9848', '63b0d47dd21a5953516bbc99dc9c181ca20b0a805a805aa328a567b62855e99b', 'f6ebd2de95958a896fcf9d7dddccf28683c7163b1ce6ca6622287291a928259c', 'b1952e5bd1a35905f04fd0523bdb04316b242400fe665ac2cb45d34c60e7bcaf'];
const unavailableBodyHash = '6fcbce6b5e6feed6f5286762c0f5c2fe01b0812c867b6e73d2114ebb99211d4c';
const partialBodyHash = 'abf105caacfda791ddf90c504e1e7c8cac017d0a1c1aaaeaa2a352e999e08000';
async function control(options: { followup?: boolean; answer?: string; status?: number; total?: number } = {}) {
  const c = caso(options.followup);
  const turns: PaqueteFixtures['scenarios'][0]['turns'] = [];
  const signatures = {
    model: { method: 'POST', url: MODELO_URL, headers_sha256: hashFixture([...new Headers(modelHeaders).entries()]) },
    animals: await firmaHttp(animalsUrl, { headers: dbHeaders }), events: await firmaHttp(eventsUrl, { headers: dbHeaders }),
  };
  for (let i = 0; i < (options.followup ? 2 : 1); i++) turns.push({ question: i ? FOLLOWUP : QUESTION, control_answer: '', fixtures: [
    { tool: 'http', args: { ...signatures.model, body_sha256: modelBodyHashes[i * 2] }, result: message(call) },
    { tool: 'http', args: signatures.animals, result: result([{ id: 'mother', numero: 87, nombre: 'MADRE SINTETICA', estado: 'activa' }], 200,
      { 'content-type': 'application/json', 'content-range': '0-0/1' }) },
    { tool: 'http', args: signatures.events, result: result(options.status === 503 ? { message: 'synthetic unavailable' } : [{ id: 'event', animal_id: 'mother', tipo: 'parto', fecha: '2026-09-20' }], options.status ?? 200,
      { 'content-type': 'application/json', 'content-range': `0-0/${options.total ?? 1}` }) },
    { tool: 'http', args: { ...signatures.model, body_sha256: options.status === 503 ? unavailableBodyHash : options.total === 300 ? partialBodyHash : modelBodyHashes[i * 2 + 1] },
      result: message({ role: 'assistant', content: options.answer ?? 'La madre sintética 87 tuvo un parto.' }) },
  ] });
  const s = { id: 'SYN-http', title: 'Synthetic actual-loop HTTP', seeds: ['synthetic'], channel: 'Web' as const,
    as_of_bogota: '2026-10-28 12:00:00', criteria: c.must, turns };
  const pack: PaqueteFixtures = { schema: 'esco-tool-fixtures/v1', source: 'explicitly-synthetic',
    reference_version: 'synthetic-http/v1', rubric_version: 'synthetic-http/v1', review_status: 'synthetic-control-unadjudicated',
    scenarios: [s], hashes: { [s.id]: hashFixture(s) } };
  return { c, pack };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
function redProhibida() {
  const network = vi.fn(async (..._args: Parameters<typeof fetch>): Promise<Response> => { throw new Error('Inherited network forbidden'); });
  // A plain wrapper keeps spyOn from reusing the sentinel's vi.fn and its call ledger.
  const sentinel: typeof fetch = (...args) => network(...args);
  vi.stubGlobal('fetch', sentinel);
  return { network, sentinel };
}
function rehash(pack: PaqueteFixtures) { pack.hashes['SYN-http'] = hashFixture(pack.scenarios[0]); }
async function directFixture(response: unknown = { status: 200, body: '[]', headers: {} }) {
  const { pack } = await control();
  pack.scenarios[0].turns[0].fixtures = [{ tool: 'http', args: await firmaHttp(`${BASE_SINTETICA}/rest/v1/control`), result: response }];
  rehash(pack); return pack;
}

describe('unchanged actual loop under closed HTTP fixtures', () => {
  it('executes the real read-only tool and preserves both follow-up history and zero network', async () => {
    const { network, sentinel } = redProhibida();
    const { c, pack } = await control({ followup: true });
    const r = await correrCasoCongelado(c, pack, 'SYN-http', PROMPT);
    if (r.resultado.corrida.error) throw new Error(JSON.stringify({ error: r.resultado.corrida.error, requests: r.intentos }));
    expect(network).not.toHaveBeenCalled(); expect(globalThis.fetch).toBe(sentinel);
    expect(r.resultado.corrida.turnos).toHaveLength(2);
    expect(r.resultado.corrida.turnos[0].herramientas[0].tool).toBe('get_hato_partos');
    expect(JSON.parse(r.resultado.corrida.turnos[0].herramientas[0].result_summary!).detalle[0].madre_o_animal.numero).toBe(87);
    expect(r.resultado.estado).toBe('pasa'); expect(r.medicion.exito_verificado).toBe(0);
    expect(r.meta).toMatchObject({ production_loop_exercised: true, quality_measured: false, usage: null, completed_turns: 2 });
    expect(r.mensajes[1].map(m => m.content).join('\n')).toContain('madre_o_animal');
    expect(r.mensajes[1].some(m => m.content === FOLLOWUP)).toBe(true);
    expect(r.resultado.corrida.asOf).toBe('2026-10-28T17:00:00.000Z');
    expect(r.resultado.corrida.tokens).toBeUndefined(); expect(vi.isFakeTimers()).toBe(false);
  });
  it('fails a seeded numeric contradiction while retaining unavailable judge/review', async () => {
    const { c, pack } = await control({ answer: 'La madre sintética 98 tuvo un parto.' });
    const r = await correrCasoCongelado(c, pack, 'SYN-http', PROMPT);
    expect(r.resultado.corrida.error).toBeUndefined(); expect(r.resultado.estado).toBe('falla');
    expect(r.medicion).toMatchObject({ exito_verificado: 0, juez_no_disponible: 1, sin_revision: 1 });
  });
  it.each(['unavailable', 'partial'])('retains actual tool error and prevents an unsupported absence claim: %s', async kind => {
    const { network } = redProhibida();
    const { c, pack } = await control({ status: kind === 'unavailable' ? 503 : 200, total: kind === 'partial' ? 300 : 1,
      answer: 'No hay partos registrados.' });
    const r = await correrCasoCongelado(c, pack, 'SYN-http', PROMPT);
    if (r.resultado.corrida.error) throw new Error(JSON.stringify({ error: r.resultado.corrida.error, requests: r.intentos }));
    expect(r.resultado.corrida.turnos[0].respuesta).toContain('No pude verificar');
    expect(r.resultado.corrida.turnos[0].herramientas[0].error).toBe(true);
    expect(r.medicion.exito_verificado).toBe(0); expect(r.resultado.juez).toBeNull();
    expect(network).not.toHaveBeenCalled();
  });
  it('invalidates swallowed unmatched reads and retains attempted requests and tool events', async () => {
    const { network } = redProhibida();
    const { c, pack } = await control(); pack.scenarios[0].turns[0].fixtures.splice(2, 1); rehash(pack);
    const r = await correrCasoCongelado(c, pack, 'SYN-http', PROMPT);
    expect(r.resultado.estado).toBe('inconcluso'); expect(r.medicion.ejecucion_fallida).toBe(1);
    expect(r.intentos.some(t => t.url === eventsUrl && t.estado === 'rechazado')).toBe(true);
    expect(r.eventos.some(e => e.type === 'tool_start')).toBe(true);
    expect(r.eventos.some(e => e.type === 'tool_done' && e.ok === false)).toBe(true);
    expect(r.errores.length).toBeGreaterThan(0); expect(network).not.toHaveBeenCalled();
  });
  it('runs turn finalization and refuses unused HTTP evidence', async () => {
    const { c, pack } = await control();
    pack.scenarios[0].turns[0].fixtures.push({ tool: 'http', args: await firmaHttp(`${BASE_SINTETICA}/rest/v1/unused`), result: result([]) }); rehash(pack);
    const r = await correrCasoCongelado(c, pack, 'SYN-http', PROMPT);
    expect(r.resultado.estado).toBe('inconcluso'); expect(r.resultado.corrida.error).toContain('fixture lifecycle');
    expect(r.meta.completed_turns).toBe(0); expect(r.eventos.some(e => e.type === 'tool_done')).toBe(true);
  });
  it.each([
    ['GET', `${BASE_SINTETICA}/rest/v1/unknown`], ['GET', `${BASE_SINTETICA}/rest/v1/control?unexpected=1`],
    ['POST', `${BASE_SINTETICA}/rest/v1/control`], ['PATCH', `${BASE_SINTETICA}/rest/v1/control`],
    ['DELETE', `${BASE_SINTETICA}/rest/v1/control`], ['PUT', `${BASE_SINTETICA}/rest/v1/control`],
    ['POST', `${MODELO_URL}?unexpected=1`], ['GET', MODELO_URL],
    ['POST', 'https://openrouter.ai.lookalike.invalid/api/v1/chat/completions'],
    ['GET', `${BASE_SINTETICA}/rest/v1/control#fragment`], ['GET', 'https://external.invalid/read'],
  ])('denies unmatched route or method %s %s without network', async (method, url) => {
    const { network, sentinel } = redProhibida();
    const g = instalarHttpCongelado(await directFixture(), 'SYN-http');
    try {
      g.iniciarTurno(0); await expect(fetch(new Request(url, { method }))).rejects.toThrow();
      g.errores.length = 0;
      expect(() => g.comprobar()).toThrow(); expect(() => g.verificarFin()).toThrow();
      expect(g.intentos[0].estado).toBe('rechazado'); expect(network).not.toHaveBeenCalled();
    } finally { g.restaurar(); }
    expect(globalThis.fetch).toBe(sentinel);
  });
  it('rejects body and header mismatches on the otherwise exact model route', async () => {
    for (const change of ['body', 'headers']) {
      const pack = await directFixture();
      pack.scenarios[0].turns[0].fixtures = [{ tool: 'http', args: await firmaHttp(MODELO_URL, { method: 'POST', body: 'expected', headers: modelHeaders }), result: result({}) }]; rehash(pack);
      const g = instalarHttpCongelado(pack, 'SYN-http');
      try {
        g.iniciarTurno(0);
        await expect(fetch(MODELO_URL, { method: 'POST', body: change === 'body' ? 'changed' : 'expected',
          headers: change === 'headers' ? {} : modelHeaders })).rejects.toThrow();
        expect(() => g.comprobar()).toThrow();
      } finally { g.restaurar(); }
    }
  });
  it.each([301, 302, 307, 308])('rejects fixture redirect %s before it can be followed', async status => {
    const g = instalarHttpCongelado(await directFixture({ status, body: null, headers: { location: 'https://external.invalid/' } }), 'SYN-http');
    try { g.iniciarTurno(0); await expect(fetch(`${BASE_SINTETICA}/rest/v1/control`)).rejects.toThrow(); expect(() => g.comprobar()).toThrow(); }
    finally { g.restaurar(); }
  });
  it.each([null, {}, { status: 200, body: 42, headers: {} }, { status: 999, body: '', headers: {} }])('rejects malformed HTTP response %s', async response => {
    const g = instalarHttpCongelado(await directFixture(response), 'SYN-http');
    try { g.iniciarTurno(0); await expect(fetch(`${BASE_SINTETICA}/rest/v1/control`)).rejects.toThrow(); }
    finally { g.restaurar(); }
  });
  it('makes lifecycle errors sticky, finalizes completed cases and isolates repeated installations', async () => {
    const pack = await directFixture();
    let g = instalarHttpCongelado(pack, 'SYN-http');
    try {
      g.iniciarTurno(0); expect(() => g.verificarCasoFin()).toThrow(); g.errores.length = 0;
      expect(() => g.comprobar()).toThrow(); expect(() => g.iniciarTurno(0)).toThrow();
    } finally { g.restaurar(); }
    for (let i = 0; i < 2; i++) {
      g = instalarHttpCongelado(pack, 'SYN-http');
      try { g.iniciarTurno(0); expect(await (await fetch(`${BASE_SINTETICA}/rest/v1/control`)).json()).toEqual([]); g.verificarFin(); g.verificarCasoFin(); }
      finally { g.restaurar(); g.restaurar(); }
    }
  });
  it('never delegates unknown Deno keys, restores existing globals and rejects overlapping installations', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Deno');
    const g = instalarHttpCongelado(await directFixture(), 'SYN-http');
    try {
      expect(() => instalarHttpCongelado({} as unknown, 'SYN-http')).toThrow();
      const deno = (globalThis as unknown as { Deno: { env: { get: (key: string) => string } } }).Deno;
      expect(deno.env.get('SUPABASE_URL')).toBe(BASE_SINTETICA);
      expect(() => deno.env.get('UNLISTED_KEY')).toThrow(); g.errores.length = 0;
      expect(() => g.comprobar()).toThrow();
    } finally { g.restaurar(); }
    expect(Object.getOwnPropertyDescriptor(globalThis, 'Deno')).toEqual(descriptor);
  });
  it('never mutates or clears an inherited mock implementation or call ledger', async () => {
    const inherited = vi.fn(async () => new Response('sentinel'));
    vi.stubGlobal('fetch', inherited);
    await inherited();
    const implementation = inherited.getMockImplementation();
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
    const g = instalarHttpCongelado(await directFixture(), 'SYN-http');
    try {
      g.iniciarTurno(0); await fetch(`${BASE_SINTETICA}/rest/v1/control`);
      expect(inherited).toHaveBeenCalledTimes(1); expect(inherited.getMockImplementation()).toBe(implementation);
      g.verificarFin(); g.verificarCasoFin();
    } finally { g.restaurar(); }
    expect(Object.getOwnPropertyDescriptor(globalThis, 'fetch')).toEqual(descriptor);
    expect(inherited).toHaveBeenCalledTimes(1); expect(await (await fetch('https://sentinel.invalid')).text()).toBe('sentinel');
    expect(inherited).toHaveBeenCalledTimes(2);
  });
  it('rejects a request still pending when its installation is restored', async () => {
    const g = instalarHttpCongelado(await directFixture(), 'SYN-http');
    g.iniciarTurno(0);
    const pending = fetch(`${BASE_SINTETICA}/rest/v1/control`); g.restaurar();
    await expect(pending).rejects.toThrow(); expect(g.intentos[0].estado).toBe('rechazado');
  });
  it('rejects mismatched cases, clock and existing fake-timer ownership before execution', async () => {
    const { c, pack } = await control();
    await expect(correrCasoCongelado({ ...c, domain: 'private' }, pack, 'SYN-http', PROMPT)).rejects.toThrow();
    await expect(correrCasoCongelado({ ...c, as_of_bogota: '2026-10-28 12:01' }, pack, 'SYN-http', PROMPT)).rejects.toThrow();
    vi.useFakeTimers();
    await expect(correrCasoCongelado(c, pack, 'SYN-http', PROMPT)).rejects.toThrow('ownership');
    expect(vi.isFakeTimers()).toBe(true);
  });
});
