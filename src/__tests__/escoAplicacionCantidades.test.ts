// Synthetic boundary probes. A mocked model cannot establish answer quality.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ejecutarConsultaEsco, resumirContexto, type FilaEsco } from '../utils/escoConsultas';
const modulePath = '../supabase/functions/server/chat.tsx';
const { llmToolLoop, getSystemPrompt } = await import(modulePath) as {
  llmToolLoop: (messages: { role: string; content: string }[]) => Promise<{
    text: string; toolInteractions: { tool: string; result_summary: string }[];
  }>;
  getSystemPrompt: () => string;
};
const args = { application_id: 'synthetic-app', date_from: '2032-04-01', date_to: '2032-04-02' };
function fixture(missing = false): Record<string, FilaEsco[]> {
  return {
    aplicaciones: [{ id: 'synthetic-app', nombre_aplicacion: 'Control sintético plaga Z', estado: 'En ejecución',
      fecha_inicio_planeada: '2032-03-20', fecha_fin_planeada: '2032-03-21',
      fecha_inicio_ejecucion: '2032-04-01', fecha_fin_ejecucion: null, tarea_id: 'task' }],
    movimientos_diarios: [
      { id: 'm1', aplicacion_id: 'synthetic-app', lote_id: 'l1', fecha_movimiento: '2032-04-01', numero_canecas: 3 },
      { id: 'm2', aplicacion_id: 'synthetic-app', lote_id: 'l2', fecha_movimiento: '2032-04-02', numero_canecas: 4 },
      { id: 'outside', aplicacion_id: 'synthetic-app', lote_id: 'l1', fecha_movimiento: '2032-03-31', numero_canecas: 2 },
    ],
    movimientos_diarios_productos: [
      { id: 'c1', movimiento_diario_id: 'm1', producto_id: 'p1', producto_nombre: 'Insumo sintético', cantidad_utilizada: missing ? null : '1.25', unidad: 'L' },
      { id: 'c2', movimiento_diario_id: 'm2', producto_id: 'p1', producto_nombre: 'Insumo sintético', cantidad_utilizada: 2.5, unidad: 'L' },
      { id: 'c3', movimiento_diario_id: 'm2', producto_id: 'p2', producto_nombre: 'Otro insumo', cantidad_utilizada: 75, unidad: 'g' },
      { id: 'c4', movimiento_diario_id: 'outside', producto_id: 'p1', cantidad_utilizada: 99, unidad: 'L' },
    ],
    productos: [{ id: 'p1', nombre: 'Insumo sintético', unidad_medida: 'L' }, { id: 'p2', nombre: 'Otro insumo', unidad_medida: 'g' }],
    lotes: [{ id: 'l1', nombre: 'Lote Uno' }, { id: 'l2', nombre: 'Lote Dos' }],
    aplicaciones_mezclas: [{ id: 'mix', aplicacion_id: 'synthetic-app' }],
    aplicaciones_productos: [{ id: 'recipe', mezcla_id: 'mix', producto_id: 'p1', producto_nombre: 'Insumo sintético',
      dosis_por_caneca: 40, unidad_dosis: 'cc', cantidad_total_necesaria: 9 }],
    aplicaciones_lotes: [], aplicaciones_calculos: [], registros_trabajo: [
      { id: 'w1', tarea_id: 'task', lote_id: 'l1', fecha_trabajo: '2032-04-01', fraccion_jornal: '0.25', costo_jornal: 11000 },
      { id: 'w2', tarea_id: 'task', lote_id: 'l2', fecha_trabajo: '2032-04-02', fraccion_jornal: '0.5', costo_jornal: 22000 },
      { id: 'outside-work', tarea_id: 'task', lote_id: 'l1', fecha_trabajo: '2032-03-31', fraccion_jornal: 1, costo_jornal: 99999 },
    ],
  };
}
function read(db: Record<string, FilaEsco[]>, table: string, query: string) {
  if (!Object.prototype.hasOwnProperty.call(db, table)) throw Error('Unlisted synthetic table');
  const p = new URLSearchParams(query);
  let rows = db[table];
  for (const [key, value] of p) {
    if (['select', 'order', 'limit', 'offset'].includes(key)) continue;
    const dot = value.indexOf('.'), op = value.slice(0, dot), arg = value.slice(dot + 1);
    rows = rows.filter(r => {
      if (op === 'eq') return String(r[key]) === arg;
      if (op === 'in') return arg.slice(1, -1).split(',').map(v => v.replace(/"/g, '')).includes(String(r[key]));
      if (op === 'gte') return r[key] != null && String(r[key]) >= arg;
      if (op === 'lte') return r[key] != null && String(r[key]) <= arg;
      throw Error('Unlisted synthetic filter');
    });
  }
  const offset = Number(p.get('offset') ?? 0), limit = Number(p.get('limit') ?? 200);
  const columns = p.get('select')?.split(',');
  if (!columns || columns.some(c => !/^[a-z_]+$/.test(c))) throw Error('Unlisted synthetic projection');
  return rows.slice(offset, offset + limit).map(row => Object.fromEntries(columns.map(c => [c, row[c]])));
}
async function run(options: { missing?: boolean; unavailable?: boolean; answer?: string; plannedQuestion?: string; question?: string; expectedCalls?: number;
  emptyPlanned?: boolean; estimate?: boolean; largeRows?: boolean; history?: string; countMode?: 'missing' | 'wildcard' | 'changing' } = {}) {
  const db = fixture(options.missing), bodies: { messages: { role: string; content: string }[]; tool_choice?: unknown }[] = [];
  const toolArgs = options.plannedQuestion ? { ...args, date_from: '2026-11-01', date_to: '2026-11-30', date_basis: 'planned' } : args;
  if (options.plannedQuestion) Object.assign(db.aplicaciones[0], { fecha_inicio_planeada: '2026-11-05', fecha_fin_planeada: '2026-11-10', fecha_inicio_ejecucion: null });
  if (options.emptyPlanned) Object.assign(db.aplicaciones[0], {fecha_inicio_planeada:'2026-10-05',fecha_fin_planeada:'2026-10-10',fecha_inicio_ejecucion:null});
  if (options.estimate) db.aplicaciones_calculos=[{id:'calculation',aplicacion_id:'synthetic-app',lote_id:'l1',mezcla_id:'mix',numero_canecas:3}];
  if (options.largeRows) db.movimientos_diarios_productos.push(...Array.from({length:1000},(_,i)=>({id:'large-'+i,movimiento_diario_id:'m1',producto_id:'p1',unidad:'L',cantidad_utilizada:'0.1'})));
  if (options.countMode === 'changing') db.movimientos_diarios_productos.push(...Array.from({length:201},(_,i)=>({id:'extra-'+i,movimiento_diario_id:'m1',producto_id:'p1',unidad:'L',cantidad_utilizada:'0.1'})));
  const rejected: string[] = [];
  vi.stubGlobal('Deno', { env: { get(key: string) {
    if (key === 'SUPABASE_URL') return 'https://applications-fixture.invalid';
    if (['SUPABASE_SERVICE_ROLE_KEY', 'OPENROUTER_API_KEY'].includes(key)) return 'synthetic-placeholder';
    throw Error('Unlisted synthetic environment');
  } } });
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init), u = new URL(request.url);
    if (request.method === 'POST' && request.url === 'https://openrouter.ai/api/v1/chat/completions') {
      bodies.push(JSON.parse(await request.text()));
      if (bodies.length > 2) throw Error('Unexpected extra model request');
      return Response.json({ choices: [{ message: bodies.length === 1 ? {
        role: 'assistant', content: null, tool_calls: [{ id: 'synthetic-call', type: 'function', function: {
          name: 'get_aplicaciones_ejecucion', arguments: JSON.stringify(toolArgs),
        } }],
      } : { role: 'assistant', content: options.answer ?? 'Control sintético: cantidades registradas disponibles.' } }] });
    }
    if (request.method === 'GET' && u.origin === 'https://applications-fixture.invalid' && u.pathname.startsWith('/rest/v1/')) {
      const table = u.pathname.slice('/rest/v1/'.length);
      if (options.unavailable && table === 'movimientos_diarios_productos') return Response.json({ error: 'synthetic unavailable' }, { status: 503 });
      let page = read(db, table, u.search.slice(1));
      const offset = Number(u.searchParams.get('offset') ?? 0);
      const all = new URLSearchParams(u.search); all.set('limit','20001'); all.set('offset','0');
      let total = read(db,table,all.toString()).length;
      if (table === 'movimientos_diarios_productos' && options.countMode === 'changing' && offset > 0) { page = page.slice(0,-1); total--; }
      const range = page.length ? `${offset}-${offset+page.length-1}/${total}` : `*/${total}`;
      const headers: Record<string, string> = table === 'movimientos_diarios_productos' && options.countMode === 'missing' ? {} : {
        'content-range': table === 'movimientos_diarios_productos' && options.countMode === 'wildcard' ? range.replace(/\/\d+$/,'/*') : range,
      };
      return Response.json(page,{headers});
    }
    rejected.push(request.method + ' ' + request.url); throw Error('Unmatched synthetic request');
  });
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(options.plannedQuestion?'2026-10-30T17:00:00Z':'2032-04-02T17:00:00Z'));
  const result = await llmToolLoop([{ role: 'system', content: getSystemPrompt() },
    ...(options.history?[{role:'assistant',content:options.history}]:[]),
    { role: 'user', content: options.question ?? options.plannedQuestion ?? '¿Cómo va la aplicación de plaga Z y cuál es el pronóstico de lluvia?' }]);
  expect(rejected).toEqual([]); expect(bodies).toHaveLength(options.expectedCalls ?? (options.plannedQuestion?1:2));
  return { result, bodies, evidence: JSON.parse(bodies[1]?.messages.find(m => m.role === 'tool')?.content ?? result.toolInteractions[0].result_summary) };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('application quantities: evidence versus generation boundary', () => {
  it.each(['missing','wildcard','changing'] as const)('never certifies authoritative application facts with %s count evidence', async countMode => {
    const { evidence, result } = await run({countMode});
    expect(evidence.error).toBeTruthy();
    expect(evidence._evidencia?.consulta_completa).not.toBe(true);
    expect(result.text).toContain('No pude verificar');
  });
  it.each(['', 'Solo lectura: ', 'Consulta de solo lectura: '])('allows an explicit planned interrogative through the actual loop without denying date_basis: %s', async prefix => {
    const { evidence, bodies } = await run({ plannedQuestion: prefix + '¿Qué aplicaciones están planeadas para noviembre de 2026?' });
    expect(evidence.error).toBeUndefined();
    expect(evidence.detalle[0]).toMatchObject({ id: 'synthetic-app', base_fecha_consultada: 'planned', fecha_inicio_planeada: '2026-11-05' });
    expect(bodies[0].tool_choice).toEqual({type:'function',function:{name:'get_aplicaciones_ejecucion'}});
  });
  it.each(['Consulta de solo lectura: ¿Qué aplicaciones están planeadas para noviembre de 2026?', '¿Qué aplicaciones están planeadas para noviembre de 2026?'])('renders a verified empty planned-start cohort, not activity absence or a tasks fallback: %s', async plannedQuestion => {
    const { result, evidence }=await run({plannedQuestion,emptyPlanned:true,answer:''});
    expect(evidence._evidencia).toMatchObject({consulta_completa:true,detalle_completo:true,total_hechos:0});
    expect(result.text).toContain('No encontré registros');
    expect(result.text).toContain('inicio planeado: 2026-11-01 a 2026-11-30');
    expect(result.text).toContain('no demuestra ausencia de actividad física');
    expect(result.toolInteractions.map(t=>t.tool)).toEqual(['get_aplicaciones_ejecucion']);
  });
  it('renders fresh actual facts and discards a deliberately false final model reply and history', async () => {
    const { result }=await run({question:'¿Cómo va la aplicación de plaga Z del 2032-04-01 al 2032-04-02?',expectedCalls:1,
      answer:'Se consumieron 40 L y el costo fue 1 COP.',history:'Antes dije que se consumieron 40 L y costó 1 COP.'});
    expect(result.text).toContain('| L | 3.75 |');expect(result.text).toContain('| g | 75 |');
    expect(result.text).toContain('0.75 jornales');expect(result.text).toContain('33000 COP');
    expect(result.text).not.toContain('40 L');expect(result.text).not.toContain('1 COP');
  });
  it('does not invent a weekly window when the user asks for the application as a whole', async () => {
    const { result,evidence }=await run({question:'¿Cómo va la aplicación de plaga Z?',expectedCalls:1,answer:'Incorrect prose'});
    expect(evidence._evidencia.rango).toEqual({desde:null,hasta:null});
    expect(result.text).toContain('| L | 102.75 |');expect(result.text).toContain('132999 COP');
  });
  it('uses the fresh result even when saved context must drop the large raw detail', async () => {
    const { result }=await run({question:'¿Cómo va la aplicación de plaga Z del 2032-04-01 al 2032-04-02?',expectedCalls:1,largeRows:true,answer:'Wrong 9 L'});
    expect(result.text).toContain('| L | 103.75 |');
    expect(JSON.parse(result.toolInteractions[0].result_summary).contexto_recortado).toBe(true);
  });
  it('answers verified subparts while distinguishing a missing total from a registered zero', async () => {
    const { result }=await run({question:'¿Cómo va la aplicación de plaga Z del 2032-04-01 al 2032-04-02?',expectedCalls:1,missing:true});
    expect(result.text).toContain('2.5 (subtotal verificado; total desconocido)');
    expect(result.text).toContain('33000 COP');expect(result.text).not.toContain('| L | 0 |');
  });
  it('keeps an explicit theoretical plan calculation separate from registered consumption', async () => {
    const {result}=await run({question:'Estima el consumo teórico de la aplicación de plaga Z según dosis y canecas planeadas.',expectedCalls:1,estimate:true});
    expect(result.text).toContain('40 cc/caneca × 3 canecas planeadas = 120 cc estimados');
    expect(result.text).toContain('no es consumo real');expect(result.text).not.toContain('120 L');
  });
  it('does not hijack a mixed-domain request with a generic application report', async () => {
    const mixed='Control sintético de aplicación y lluvia; respuesta no cubierta por el renderer.';
    const {result}=await run({question:'¿Cómo va la aplicación y cuál es el pronóstico de lluvia?',expectedCalls:2,answer:mixed});
    expect(result.text).toBe(mixed);expect(result.text).not.toContain('Costo laboral registrado');
  });
  it('computes authoritative scoped quantities and labor before generation without using planned dose', async () => {
    const { evidence } = await run();
    const facts = evidence.detalle[0].hechos_ejecucion;
    expect(facts.consumos.productos).toEqual(expect.arrayContaining([
      expect.objectContaining({ producto_id: 'p1', unidad: 'L', cantidad_total: '3.75' }),
      expect.objectContaining({ producto_id: 'p2', unidad: 'g', cantidad_total: '75' }),
    ]));
    expect(facts.trabajo).toMatchObject({ jornales_total: '0.75', costo_total_cop: '33000', registros_en_alcance: 2 });
    expect(facts.alcance).toMatchObject({ desde: args.date_from, hasta: args.date_to });
  });
  it('keeps a partial registered subtotal while leaving an unverified consumption total null', async () => {
    const { evidence } = await run({ missing: true });
    expect(evidence.detalle[0].hechos_ejecucion.consumos.productos[0]).toMatchObject({
      producto_id: 'p1', cantidad_total: null, cantidad_verificada: '2.5', registros_invalidos: 1,
    });
  });
  it('delivers exact actual quantities, planned dose and independent units to the model', async () => {
    const { evidence, result } = await run();
    expect(evidence._evidencia).toMatchObject({ consulta_completa: true, detalle_completo: true,
      rango: { desde: args.date_from, hasta: args.date_to } });
    expect(evidence.detalle[0].movimientos.map((m: FilaEsco) => m.id)).toEqual(['m1', 'm2']);
    expect(evidence.detalle[0].movimientos.flatMap((m: { consumos: FilaEsco[] }) => m.consumos)
      .map((c: FilaEsco) => [c.producto_id, c.cantidad_utilizada, c.unidad])).toEqual([
      ['p1', '1.25', 'L'], ['p1', 2.5, 'L'], ['p2', 75, 'g'],
    ]);
    expect(evidence.detalle[0].productos_planeados[0]).toMatchObject({ dosis_por_caneca: 40, unidad_dosis: 'cc', cantidad_total_necesaria: 9 });
    expect(JSON.parse(result.toolInteractions[0].result_summary)).toEqual(evidence);
  });
  it('preserves missing consumption as null instead of inferring a planned or zero quantity', async () => {
    const { evidence } = await run({ missing: true });
    expect(evidence.detalle[0].movimientos[0].consumos[0].cantidad_utilizada).toBeNull();
    expect(evidence.detalle[0].productos_planeados[0].cantidad_total_necesaria).toBe(9);
  });
  it('does not make unavailable consumption into complete evidence', async () => {
    const { evidence, result } = await run({ unavailable: true });
    expect(evidence.error).toBeTruthy();
    expect(evidence._evidencia?.consulta_completa).not.toBe(true);
    expect(result.text).toContain('No pude verificar');
  });
  it('documents the limit: an invented nonempty mocked answer still passes the current final path', async () => {
    const wrong = 'Control deliberadamente erróneo: se consumieron 40 L.';
    const { result, evidence } = await run({ answer: wrong });
    expect(evidence.detalle[0].movimientos[0].consumos[0].cantidad_utilizada).toBe('1.25');
    expect(result.text).toBe(wrong); // This is not a model-quality pass.
  });
  it('confirms long saved context loses raw consumption but requires a fresh query', async () => {
    const db = fixture();
    const evidence = await ejecutarConsultaEsco('get_aplicaciones_ejecucion', args, async (t, q) => read(db, t, q));
    const compact = JSON.parse(resumirContexto(JSON.stringify(evidence), 100));
    expect(compact.contexto_recortado).toBe(true);
    expect(compact._evidencia.consulta_completa).toBe(false);
    expect(compact.detalle).toBeUndefined();
    expect(compact.resumen).not.toHaveProperty('consumos');
    expect(compact.instruccion).toContain('Vuelve a consultar');
  });
  it('carries explicit consumption-versus-plan policy in both generation requests', async () => {
    const { bodies } = await run();
    for (const body of bodies) {
      const system = body.messages.find(m => m.role === 'system')!.content;
      expect(system).toContain('CANTIDADES DE APLICACIONES');
      expect(system).toContain('movimientos[].consumos[].cantidad_utilizada');
      expect(system).toContain('dosis_por_caneca');
      expect(system).toContain('no sustituyen el consumo registrado');
      expect(system).toContain('No sumes unidades distintas');
      expect(system).toContain('no implica cero');
      expect(system).toContain('Si el usuario pide un cálculo teórico');
    }
  });
});
