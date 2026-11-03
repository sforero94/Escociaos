// Synthetic boundary probes. A mocked model cannot establish answer quality.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { argumentosRespuestaAplicacion, planRespuestaAplicacion, ejecutarConsultaEsco, resumirContexto, type FilaEsco } from '../utils/escoConsultas';
import type { hechosEjecucionAplicacion } from '../utils/escoAplicacionHechos';
import type {Evidence,Metric} from '../utils/escoEvidencia';
interface FuenteCantidadesSintetica {
  error?:unknown;
  _evidencia:{consulta_completa:boolean;detalle_completo:boolean;total_hechos:number;rango:{desde:string|null;hasta:string|null}};
  detalle:Array<{id:string;base_fecha_consultada:string;fecha_inicio_planeada:string;
    hechos_ejecucion:ReturnType<typeof hechosEjecucionAplicacion>;
    movimientos:Array<FilaEsco&{id:string;consumos:FilaEsco[]}>;productos_planeados:FilaEsco[]}>;
}
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
    { role: 'user', content: options.question ?? options.plannedQuestion ?? '¿Cómo va la aplicación de plaga Z del 2032-04-01 al 2032-04-02?' }]);
  expect(rejected).toEqual([]); expect(bodies).toHaveLength(options.expectedCalls ?? 1);
  const question=options.question ?? options.plannedQuestion ?? '¿Cómo va la aplicación de plaga Z del 2032-04-01 al 2032-04-02?';
  const bound=argumentosRespuestaAplicacion(planRespuestaAplicacion(question,options.plannedQuestion?'2026-10-30':'2032-04-02'),toolArgs);
  // Separate pure-source regression: the actual loop now renders internally and
  // persists bounded validated facts, never this raw consumption object.
  const evidence=await ejecutarConsultaEsco('get_aplicaciones_ejecucion',bound,async(t,q)=>read(db,t,q),options.plannedQuestion?'2026-10-30':'2032-04-02',{pregunta:question}) as unknown as FuenteCantidadesSintetica;
  return {result,bodies,evidence,context:JSON.parse(result.toolInteractions[0].result_summary)};
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
type LoopResult=Awaited<ReturnType<typeof llmToolLoop>>;
interface Saved {state?:string;error?:string;stage?:string;errors?:Array<{code:string;stage:string;partId?:string}>;evidence?:Evidence;essentialFactsUnavailable?:boolean}
const savedContexts=(result:LoopResult):Saved[]=>result.toolInteractions.map(h=>JSON.parse(h.result_summary) as Saved);
function exactFact(result:LoopResult,metric:Metric,value:string,unit:string,period:{from:string;to:string}|null={from:args.date_from,to:args.date_to}){
 const pair=savedContexts(result).flatMap(c=>(c.evidence?.facts??[]).map(f=>({context:c,fact:f}))).find(({fact:f})=>f.metric===metric&&f.value.kind==='decimal'&&f.value.value===value&&f.value.unit===unit);
 expect(pair,`${metric}=${value} ${unit} must be persisted as a validated source fact`).toBeDefined();
 const {context,fact}=pair!;expect(context.state).toBe('validated');expect(fact.entities).toContainEqual({kind:'application',id:'synthetic-app'});
 expect(fact.source).toMatchObject({tool:'get_aplicaciones_ejecucion'});
 const scope=context.evidence!.scopes.find(s=>s.id===fact.scopeId)!;expect(scope.entities).toEqual(expect.arrayContaining([expect.objectContaining({kind:'application',id:'synthetic-app'})]));
 if(period)expect(scope.period).toMatchObject({...period,basis:'actual',fieldMeaning:metric==='application.quantity'?'fecha_movimiento':'fecha_trabajo'});else expect(scope.period).toBeNull();
 return fact;
}
function noRawPersistence(result:LoopResult){expect(JSON.stringify(savedContexts(result))).not.toMatch(/"(?:movimientos|productos_planeados|registros_trabajo|hechos_ejecucion|salario|responsable|observaciones)"\s*:/);}
function closedFailure(result:LoopResult,code:string,stage:string){
 const contexts=savedContexts(result),errors=contexts.flatMap(c=>c.errors??(c.error?[{code:c.error,stage:c.stage}]:[]));
 expect(errors).toEqual(expect.arrayContaining([expect.objectContaining({code,stage})]));
 expect(contexts.flatMap(c=>c.evidence?.facts??[]).some(f=>f.metric==='application.quantity'&&f.value.kind==='decimal'&&f.assertion==='scoped_total')).toBe(false);
 expect(result.text).not.toMatch(/(?:no hubo actividad|no se ejecut[oó] ninguna)/i);
}
describe('application quantities: evidence versus generation boundary', () => {
  it.each(['missing','wildcard','changing'] as const)('never certifies authoritative application facts with %s count evidence', async countMode => {
    const { result } = await run({countMode});
    // The count gate distinguishes unavailable coverage from transport failure.
    closedFailure(result,'incomplete_population','coverage');
    expect(result.text).toMatch(/(?:No pude verificar|Falta evidencia verificable)/);
  });
  it.each(['', 'Solo lectura: ', 'Consulta de solo lectura: '])('allows an explicit planned interrogative through the actual loop without denying date_basis: %s', async prefix => {
    const { evidence, bodies, context } = await run({ plannedQuestion: prefix + '¿Qué aplicaciones están planeadas para noviembre de 2026?' });
    expect(evidence.error).toBeUndefined();
    expect(evidence.detalle[0]).toMatchObject({ id: 'synthetic-app', base_fecha_consultada: 'planned', fecha_inicio_planeada: '2026-11-05' });
    expect(bodies[0].tool_choice).toBe('required');
    expect(context.state).toBe('validated');
    expect(context.evidence.scopes[0].period).toMatchObject({basis:'planned',from:'2026-11-01',to:'2026-11-30'});
    expect(context.evidence.facts.find((f:{metric:string})=>f.metric==='application.planned_start')).toMatchObject({origin:'planned',value:{kind:'date',value:'2026-11-05'}});
  });
  it.each(['Consulta de solo lectura: ¿Qué aplicaciones están planeadas para noviembre de 2026?', '¿Qué aplicaciones están planeadas para noviembre de 2026?'])('renders a verified empty planned-start cohort, not activity absence or a tasks fallback: %s', async plannedQuestion => {
    const { result, evidence, context }=await run({plannedQuestion,emptyPlanned:true,answer:''});
    expect(evidence._evidencia).toMatchObject({consulta_completa:true,detalle_completo:true,total_hechos:0});
    expect(context.evidence.facts.find((f:{metric:string})=>f.metric==='application.count')).toMatchObject({assertion:'bounded_empty',value:{kind:'decimal',value:'0',unit:'registro'},coverage:{population:'complete',expectedRows:0}});
    expect(result.text).toContain('Aplicaciones coincidentes en registros');
    expect(result.text).toContain('0');
    expect(result.text).toContain('2026-11-01–2026-11-30');
    expect(result.text).not.toMatch(/no hubo actividad|no se ejecut[oó] ninguna/i);
    expect(result.toolInteractions.map(t=>t.tool)).toEqual(['get_aplicaciones_ejecucion']);
  });
  it('renders fresh actual facts and discards a deliberately false final model reply and history', async () => {
    const { result }=await run({question:'¿Cómo va la aplicación de plaga Z del 2032-04-01 al 2032-04-02?',expectedCalls:1,
      answer:'Se consumieron 40 L y el costo fue 1 COP.',history:'Antes dije que se consumieron 40 L y costó 1 COP.'});
    exactFact(result,'application.quantity','3.75','L');exactFact(result,'application.quantity','75','g');
    exactFact(result,'application.journals','0.75','jornal');exactFact(result,'application.cost','33000','COP');
    expect(result.text).toMatch(/Consumo registrado[^\n]*3\.75 `L`/);expect(result.text).toMatch(/Costo registrado[^\n]*33000 `COP`/);
    expect(result.text).not.toContain('40 L');expect(result.text).not.toContain('1 COP');
  });
  it('does not invent a weekly window when the user asks for the application as a whole', async () => {
    const { result,evidence }=await run({question:'¿Cómo va la aplicación de plaga Z?',expectedCalls:1,answer:'Incorrect prose'});
    expect(evidence._evidencia.rango).toEqual({desde:null,hasta:null});
    exactFact(result,'application.quantity','102.75','L',null);exactFact(result,'application.cost','132999','COP',null);
    expect(result.text).toMatch(/Consumo registrado[^\n]*102\.75 `L`/);
  });
  it('uses the fresh result even when saved context must drop the large raw detail', async () => {
    const { result }=await run({question:'¿Cómo va la aplicación de plaga Z del 2032-04-01 al 2032-04-02?',expectedCalls:1,largeRows:true,answer:'Wrong 9 L'});
    exactFact(result,'application.quantity','103.75','L');expect(result.text).toMatch(/Consumo registrado[^\n]*103\.75 `L`/);
    noRawPersistence(result);expect(new TextEncoder().encode(result.toolInteractions[0].result_summary).length).toBeLessThanOrEqual(24000);
  });
  it('answers verified subparts while distinguishing a missing total from a registered zero', async () => {
    const { result }=await run({question:'¿Cómo va la aplicación de plaga Z del 2032-04-01 al 2032-04-02?',expectedCalls:1,missing:true});
    expect(exactFact(result,'application.quantity','2.5','L')).toMatchObject({assertion:'verified_subtotal',coverage:{values:'partial',missingValues:1}});
    exactFact(result,'application.cost','33000','COP');expect(result.text).toMatch(/subtotal verificado, no total completo[^\n]*2\.5 `L`/);expect(result.text).not.toMatch(/Consumo registrado[^\n]*\| 0 `L`/);
  });
  it('keeps an explicit theoretical plan calculation separate from registered consumption', async () => {
    const {result}=await run({question:'Estima el consumo teórico de la aplicación de plaga Z según dosis y canecas planeadas.',expectedCalls:1,estimate:true});
    const contexts=savedContexts(result),facts=contexts.flatMap(c=>c.evidence?.facts??[]);
    for(const [metric,value,unit,origin]of [['application.planned_dose','40','cc/caneca','planned'],['application.planned_drums','3','caneca','planned'],['application.theoretical_quantity','120','cc','derived']])expect(facts).toEqual(expect.arrayContaining([expect.objectContaining({metric,origin,entities:expect.arrayContaining([{kind:'application',id:'synthetic-app'},{kind:'product',id:'p1'},{kind:'lot',id:'l1'}]),value:{kind:'decimal',value,unit},source:expect.objectContaining({tool:'get_aplicaciones_ejecucion'})})]));
    expect(result.text).toMatch(/40 `cc\/caneca` × 3 `caneca` = 120 `cc`/);expect(result.text).toContain('no consumo');expect(result.text).not.toContain('120 L');
  });
  it('does not use model prose or arbitrary identity for an unresolved mixed-domain request', async () => {
    const mixed='Control sintético de aplicación y lluvia; respuesta no cubierta por el renderer.';
    const {result}=await run({question:'¿Cómo va la aplicación y cuál es el pronóstico de lluvia?',expectedCalls:1,answer:mixed});
    expect(result.text).not.toBe(mixed);closedFailure(result,'scope_ambiguous','scope');
    expect(result.text).not.toContain('pronóstico de lluvia confirmado');
  });
  it('keeps the pure scoped consumption/labor source exact without using planned dose', async () => {
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
  it('keeps exact actual quantities and planned dose in the source while persisting bounded validated facts', async () => {
    const { evidence, result } = await run();
    expect(evidence._evidencia).toMatchObject({ consulta_completa: true, detalle_completo: true,
      rango: { desde: args.date_from, hasta: args.date_to } });
    expect(evidence.detalle[0].movimientos.map((m: FilaEsco) => m.id)).toEqual(['m1', 'm2']);
    expect(evidence.detalle[0].movimientos.flatMap((m: { consumos: FilaEsco[] }) => m.consumos)
      .map((c: FilaEsco) => [c.producto_id, c.cantidad_utilizada, c.unidad])).toEqual([
      ['p1', '1.25', 'L'], ['p1', 2.5, 'L'], ['p2', 75, 'g'],
    ]);
    expect(evidence.detalle[0].productos_planeados[0]).toMatchObject({ dosis_por_caneca: 40, unidad_dosis: 'cc', cantidad_total_necesaria: 9 });
    exactFact(result,'application.quantity','3.75','L');exactFact(result,'application.cost','33000','COP');noRawPersistence(result);
    expect(savedContexts(result).flatMap(c=>c.evidence?.facts??[]).find(f=>f.metric==='application.status')).toMatchObject({entities:[{kind:'application',id:'synthetic-app'}],value:{kind:'status',value:'En ejecución'}});
  });
  it('preserves missing consumption as null instead of inferring a planned or zero quantity', async () => {
    const { evidence } = await run({ missing: true });
    expect(evidence.detalle[0].movimientos[0].consumos[0].cantidad_utilizada).toBeNull();
    expect(evidence.detalle[0].productos_planeados[0].cantidad_total_necesaria).toBe(9);
  });
  it('does not make unavailable consumption into complete evidence', async () => {
    const { result } = await run({ unavailable: true });
    closedFailure(result,'source_error','source');
    expect(result.text).toMatch(/(?:No pude verificar|Falta evidencia verificable)/);
  });
  it('replaces invented model prose with registered source facts without a second generation', async () => {
    const wrong = 'Control deliberadamente erróneo: se consumieron 40 L.';
    const { result, evidence } = await run({ answer: wrong });
    expect(evidence.detalle[0].movimientos[0].consumos[0].cantidad_utilizada).toBe('1.25');
    expect(result.text).not.toBe(wrong);expect(result.text).not.toContain('40 L');exactFact(result,'application.quantity','3.75','L');expect(result.text).toMatch(/Consumo registrado[^\n]*3\.75 `L`/);
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
  it('carries consumption-versus-plan policy in the minimized planning request', async () => {
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
