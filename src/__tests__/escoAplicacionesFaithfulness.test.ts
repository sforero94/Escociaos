// Test-only proposed application contract. All records and replies are synthetic.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ejecutarConsultaEsco, type ConsultaPagina, type FilaEsco } from '@/utils/escoConsultas';
import type {Evidence} from '../utils/escoEvidencia';
const modulePath = '../supabase/functions/server/chat.tsx';
const { llmToolLoop } = await import(modulePath) as {
  llmToolLoop: (messages: { role: string; content: string;created_at?:string }[]) => Promise<{
    text: string; toolInteractions: { tool: string; args: Record<string, unknown>; result_summary: string }[];
  }>;
};
const PERIOD = { date_from: '2031-05-01', date_to: '2031-05-31' };
const A = { id: 'fixture-app-a', nombre_aplicacion: 'Fumigación plága Z', tipo_aplicacion: 'Fumigación', estado: 'En ejecución', fecha_inicio_planeada: '2032-05-04', fecha_inicio_ejecucion: '2031-05-04', fecha_fin_ejecucion: null };
const B = { ...A, id: 'fixture-app-b', nombre_aplicacion: 'Fertilización sintética', tipo_aplicacion: 'Fertilización', fecha_inicio_planeada: '2031-05-06' };
const C = { ...A, id: 'fixture-app-c', nombre_aplicacion: 'Fumigación plaga Z segunda', fecha_inicio_planeada: '2031-05-07' };
const tables = new Set(['aplicaciones', 'movimientos_diarios', 'productos', 'lotes', 'movimientos_diarios_productos', 'aplicaciones_lotes', 'aplicaciones_lotes_planificado', 'aplicaciones_calculos', 'aplicaciones_mezclas', 'aplicaciones_productos', 'registros_trabajo']);
function database(db: Record<string, FilaEsco[]>): ConsultaPagina {
  return async (table, query) => {
    if (!tables.has(table)) throw Error('Unexpected synthetic table');
    const params = new URLSearchParams(query);
    let rows = db[table] ?? [];
    for (const [key, filter] of params) {
      if (['select', 'order', 'limit', 'offset'].includes(key)) continue;
      const dot = filter.indexOf('.'); const op = filter.slice(0, dot); const value = filter.slice(dot + 1);
      rows = rows.filter(row => {
        if (op === 'eq') return String(row[key]) === value;
        if (op === 'in') return value.slice(1, -1).split(',').map(v => v.replace(/"/g, '')).includes(String(row[key]));
        if (row[key] == null) return false;
        if (op === 'gte') return String(row[key]) >= value;
        if (op === 'lte') return String(row[key]) <= value;
        throw Error('Unexpected synthetic filter');
      });
    }
    const offset = Number(params.get('offset') ?? 0);
    return rows.slice(offset, offset + Number(params.get('limit') ?? 200));
  };
}
const details = (result: FilaEsco) => result.detalle as FilaEsco[];
const unexpected: string[] = [];
afterEach(() => { vi.unstubAllGlobals();vi.useRealTimers();expect(unexpected.splice(0)).toEqual([]); });
const FIXTURE = 'https://closed-fixture.invalid';
const MODEL_URL = 'https://openrouter.ai/api/v1/chat/completions';
const response = (message: unknown) => new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 });
const call = (name: string, args: Record<string, unknown>) => ({ role: 'assistant', content: null, tool_calls: [{ id: 'fixture-call', type: 'function', function: { name, arguments: JSON.stringify(args) } }] });
function install(model: (body: Record<string, unknown>) => unknown, read?: (url: URL) => unknown[], options:{missingCountFor?:string}={}) {
  vi.stubGlobal('Deno', { env: { get: (key: string) => ({ SUPABASE_URL: FIXTURE, SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key', OPENROUTER_API_KEY: 'synthetic-model-key' } as Record<string, string>)[key] } });
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    if (input === MODEL_URL && init?.method === 'POST') return response(model(JSON.parse(String(init.body))));
    const url = new URL(input);
    if (url.origin === FIXTURE && (init?.method ?? 'GET') === 'GET' && read) {
      const rows = read(url);
      const full = new URL(url); full.searchParams.set('limit','20001'); full.searchParams.set('offset','0');
      const total = read(full).length, offset = Number(url.searchParams.get('offset') ?? 0);
      return new Response(JSON.stringify(rows), { headers: options.missingCountFor===url.pathname?{}:{ 'content-range': rows.length ? `${offset}-${offset+rows.length-1}/${total}` : `*/${total}` } });
    }
    unexpected.push(`${init?.method ?? 'GET'} ${url.origin}${url.pathname}`);
    throw Error('Unexpected request; network fallback forbidden');
  }));
}

describe('synthetic application faithfulness — existing source inventory', () => {
  it('exposes bounded application routes and hides explicitly excluded application detail operations', async () => {
    let tools: { function: { name: string; parameters: unknown } }[] = [];
    install(body => { tools = body.tools as typeof tools; return { role: 'assistant', content: 'Synthetic inventory only' }; });
    await llmToolLoop([{ role: 'user', content: 'Inventario sintético de herramientas' }]);
    const wanted = ['get_aplicaciones_ejecucion', 'get_application_summary', 'get_weekly_overview'];
    for(const excluded of ['get_application_details','get_application_cost_by_lote','get_cost_by_lote'])expect(tools.map(t=>t.function.name)).not.toContain(excluded);
    expect(tools.map(t => t.function.name)).toEqual(expect.arrayContaining(wanted));
    console.log('PUBLIC_SOURCE_TOOL_SCHEMAS', JSON.stringify(tools.filter(t => wanted.includes(t.function.name)).map(t => t.function)));
  });
});

describe('synthetic application discovery — proposed current scope, explicit planned scope retained', () => {
  it('finds an active application outside planned-date windows without inventing a period', async () => {
    // Current scope must not invent a planned date window.
    const result = await ejecutarConsultaEsco('get_aplicaciones_ejecucion', { alcance: 'actual', estado: 'En ejecución', application_name: 'plaga Z' }, database({ aplicaciones: [A, B] }), '2031-05-10');
    expect(details(result).map(a => a.id)).toEqual([A.id]);
    expect(details(result)[0]).toMatchObject({ fecha_inicio_planeada: A.fecha_inicio_planeada, fecha_inicio_ejecucion: A.fecha_inicio_ejecucion });
  });
  it('matches accents, case and surrounding/repeated whitespace without selecting an unrelated application', async () => {
    const result = await ejecutarConsultaEsco('get_aplicaciones_ejecucion', { ...PERIOD, date_to: '2032-12-31', alcance: 'actual', estado: 'En ejecución', application_name: '  PLAGA   z  ' }, database({ aplicaciones: [A, B] }), '2031-05-10');
    expect(details(result).map(a => a.id)).toEqual([A.id]);
  });
  it('retains every matching candidate on an ambiguous name rather than picking the newest', async () => {
    const result = await ejecutarConsultaEsco('get_aplicaciones_ejecucion', { ...PERIOD, date_to: '2032-12-31', alcance: 'actual', estado: 'En ejecución', application_name: 'plaga z' }, database({ aplicaciones: [A, B, C] }), '2031-05-10');
    expect(details(result).map(a => a.id).sort()).toEqual([A.id, C.id].sort());
  });
  it('preserves historical planned-date range selection only when explicitly requested', async () => {
    const result = await ejecutarConsultaEsco('get_aplicaciones_ejecucion', { ...PERIOD, date_basis: 'planned' }, database({ aplicaciones: [A, B] }), '2031-05-10');
    expect(details(result).map(a => a.id)).toEqual([B.id]);
  });
  it('keeps conflicting original dates visible when actual movement brings an application into historical range', async () => {
    const result = await ejecutarConsultaEsco('get_aplicaciones_ejecucion', { ...PERIOD, application_id: A.id }, database({ aplicaciones: [A], movimientos_diarios: [{ id: 'fixture-move', aplicacion_id: A.id, fecha_movimiento: '2031-05-09' }] }), '2031-05-10');
    expect(details(result)).toHaveLength(1);
    expect(details(result)[0]).toMatchObject({ fecha_inicio_planeada: '2032-05-04', fecha_inicio_ejecucion: '2031-05-04' });
  });
});

describe('synthetic actual-loop application interpretation', () => {
  it('normalizes a legacy application type without dropping accent/whitespace variants', async () => {
    let round = 0;
    install(() => round++ === 0 ? call('get_application_summary', { type: '  fumigacion  ' }) : { role: 'assistant', content: 'Synthetic answer' }, url => {
      if (url.pathname === '/rest/v1/aplicaciones') return [A];
      if (tables.has(url.pathname.split('/').pop()!)) return [];
      unexpected.push(url.pathname); throw Error('Unexpected table');
    });
    const result = await llmToolLoop([{ role: 'user', content: 'Consulta sintética de fumigación' }]);
    const saved=JSON.parse(result.toolInteractions[0].result_summary);
    expect(saved.evidence.scopes.flatMap((s:{entities:{id:string}[]})=>s.entities.map(e=>e.id))).toEqual([A.id]);
    expect(saved.evidence.facts.find((f:{metric:string})=>f.metric==='application.status').value).toEqual({kind:'status',value:'En ejecución'});
  });
  for (const tool of ['get_application_summary', 'get_tareas']) {
    it(`does not accept global application absence from incomplete ${tool} results`, async () => {
      let round = 0;
      const unsupported = 'No existe ninguna aplicación oficial de control de plaga Z.';
      install(() => round++ === 0 ? call(tool, PERIOD) : { role: 'assistant', content: unsupported }, url => {
        if (url.pathname === (tool === 'get_tareas' ? '/rest/v1/tareas' : '/rest/v1/aplicaciones')) return [];
        if(tables.has(url.pathname.split('/').at(-1)!))return [];
        unexpected.push(url.pathname); throw Error('Unexpected table');
      },{missingCountFor:tool==='get_application_summary'?'/rest/v1/aplicaciones':undefined});
      const result = await llmToolLoop([{ role: 'user', content: '¿Cómo va la aplicación de control de plaga Z?' }]);
      const first=JSON.parse(result.toolInteractions[0].result_summary);
      if(tool==='get_tareas')expect(first).toMatchObject({error:'source_unavailable',requiere_reconsulta:true});
      else {
        expect(first.errors).toEqual(expect.arrayContaining([expect.objectContaining({code:'incomplete_population',stage:'coverage'})]));
        const facts=result.toolInteractions.flatMap(h=>(JSON.parse(h.result_summary).evidence?.facts??[]) as Evidence['facts']);
        expect(facts.some(f=>f.metric==='application.count'&&f.value.kind==='decimal'&&f.value.value==='0')).toBe(false);
      }
      expect(result.text).not.toBe(unsupported);
    });
  }
});

describe('actual-date default and explicit planned date basis', () => {
  it('uses actual dates for a historical range and never falls back to planned dates', async () => {
    const unknown = { ...B, fecha_inicio_ejecucion: null };
    const result = await ejecutarConsultaEsco('get_aplicaciones_ejecucion', PERIOD, database({ aplicaciones: [A, unknown] }), '2031-05-10');
    expect(details(result).map(a => a.id)).toEqual([A.id]);
    expect(result.resumen).toMatchObject({ date_basis: 'actual', fechas_reales_ausentes: 1 });
    const planned = await ejecutarConsultaEsco('get_aplicaciones_ejecucion', { ...PERIOD, date_basis: 'planned' }, database({ aplicaciones: [A, unknown] }), '2031-05-10');
    expect(details(planned).map(a => a.id)).toEqual([B.id]);
  });
  it.each([{ application_name: 4 }, { application_name: ' ' }, { estado: 'other' }, { date_basis: 'other' }, { alcance: 'other' }, { date_from: '2031-05-03', date_to: '2031-05-01' }])('fails closed for malformed application controls %j', async args => {
    await expect(ejecutarConsultaEsco('get_aplicaciones_ejecucion', args, database({ aplicaciones: [A] }), '2031-05-10')).rejects.toThrow();
  });
  it('normalizes unsolicited model planned basis to the explicit actual user range before source membership', async () => {
    let round = 0; let first: Record<string, unknown> = {};
    const reads:URL[]=[],app={...A,nombre_aplicacion:'Aplicación sintética'};
    install(body => {
      if (round++ === 0) { first = body; return call('get_aplicaciones_ejecucion', { date_basis: 'planned',date_from:'1900-01-01',date_to:'1900-01-02' }); }
      return { role: 'assistant', content: 'Synthetic unsupported result' };
    },url=>{reads.push(url);const table=url.pathname.split('/').at(-1)!;if(table==='aplicaciones')return [app];if(tables.has(table))return [];unexpected.push(url.pathname);throw Error('Unexpected table');});
    const result = await llmToolLoop([{ role: 'user', content: '¿Cómo va la aplicación sintética del 2031-05-01 al 2031-05-31?' }]);
    expect(first.tool_choice).toBe('required');
    expect((first.tools as {function:{name:string}}[]).some(t=>t.function.name==='get_aplicaciones_ejecucion')).toBe(true);
    expect(result.toolInteractions[0].args.date_basis).toBe('actual');
    const saved=JSON.parse(result.toolInteractions[0].result_summary) as {state:string;evidence:Evidence};expect(saved.state).toBe('validated');
    const start=saved.evidence.facts.find(f=>f.metric==='application.actual_start')!;expect(start).toMatchObject({entities:[{kind:'application',id:app.id}],origin:'recorded',value:{kind:'date',value:'2031-05-04'},source:{tool:'get_aplicaciones_ejecucion',field:'fecha_inicio_ejecucion'}});
    expect(saved.evidence.scopes.find(s=>s.id===start.scopeId)?.period).toMatchObject({basis:'actual',from:PERIOD.date_from,to:PERIOD.date_to,fieldMeaning:'fecha_inicio_ejecucion'});
    for(const f of saved.evidence.facts.filter(f=>f.metric==='application.count'&&f.value.kind==='decimal'&&f.value.value==='0')){
      expect(f).toMatchObject({assertion:'bounded_empty',coverage:{population:'complete',expectedRows:0}});
      expect(saved.evidence.scopes.find(s=>s.id===f.scopeId)).toMatchObject({filters:{selection_basis:'activity'},period:{basis:'actual',fieldMeaning:'fecha_movimiento'}});
    }
    expect(reads.length).toBeGreaterThan(0);for(const u of reads){expect(u.searchParams.has('fecha_inicio_planeada')).toBe(false);expect(u.searchParams.get('fecha_movimiento')??'').not.toContain('1900');}
    expect(result.text).toContain('2031-05-04');expect(result.text).not.toContain('Synthetic unsupported result');
  });
});

describe('review regressions: explicit plans and authoritative plan source', () => {
  it('does not silently exclude calculated plans from explicit planned lookup without a range', async () => {
    const planned = { ...A, estado: 'Calculada', fecha_inicio_ejecucion: null };
    const result = await ejecutarConsultaEsco('get_aplicaciones_ejecucion', { date_basis: 'planned', application_name: 'plaga z' }, database({ aplicaciones: [planned] }), '2031-05-10');
    expect(details(result).map(a => a.id)).toEqual([A.id]);
    expect(details(result)[0].fecha_real_ausente).toBe(true);
  });
  it('reads the persisted plan calculations rather than the legacy empty planning table', async () => {
    const result = await ejecutarConsultaEsco('get_aplicaciones_ejecucion', { application_name: 'plaga z' }, database({ aplicaciones: [A], aplicaciones_calculos: [{ id: 'fixture-plan', aplicacion_id: A.id, lote_id: 'fixture-lot', numero_canecas: 12 }] }), '2031-05-10');
    expect(details(result)[0].plan_por_lote).toEqual([expect.objectContaining({ id: 'fixture-plan', numero_canecas: 12 })]);
  });
  it('retains a real-plan lot match without legacy rows or movements', async () => {
    const db = database({ aplicaciones: [A], lotes: [{ id: 'fixture-lot', nombre: 'Lote Sintético' }], aplicaciones_calculos: [{ id: 'fixture-plan', aplicacion_id: A.id, lote_id: 'fixture-lot', numero_canecas: 12 }] });
    const result = await ejecutarConsultaEsco('get_aplicaciones_ejecucion', { application_name: 'plaga z', lote_name: 'Sintético' }, db, '2031-05-10');
    expect(details(result).map(a => a.id)).toEqual([A.id]);
    expect(details(result)[0].plan_por_lote).toHaveLength(1);
    const other = await ejecutarConsultaEsco('get_aplicaciones_ejecucion', { application_name: 'plaga z', lote_name: 'Otro' }, db, '2031-05-10');
    expect(details(other)).toHaveLength(0);
  });

});


describe('review regressions: identity and collections retain their scope', () => {
  it.each([{ application_id: 'fixture-closed' }, { application_name: 'plaga z' }])('does not inject an active filter for identity lookup %j', async args => {
    const closed = { ...A, id: 'fixture-closed', estado: 'Cerrada', fecha_fin_ejecucion: '2031-05-08' };
    const result = await ejecutarConsultaEsco('get_aplicaciones_ejecucion', args, database({ aplicaciones: [closed] }), '2031-05-10');
    expect(details(result).map(a => a.id)).toEqual(['fixture-closed']);
  });
  it('filters an explicitly requested in-progress list while unfiltered lookup retains closed rows', async () => {
    const db = database({ aplicaciones: [A, { ...B, estado: 'Cerrada' }] });
    const active = await ejecutarConsultaEsco('get_aplicaciones_ejecucion', { estado: 'En ejecución' }, db, '2031-05-10');
    expect(details(active).map(a => a.id)).toEqual([A.id]);
    const all = await ejecutarConsultaEsco('get_aplicaciones_ejecucion', {}, db, '2031-05-10');
    expect(details(all)).toHaveLength(2);
  });
  it('preserves a legitimate plural historical answer instead of singular disambiguation', async () => {
    let round = 0;
    install(() => round++ === 0 ? call('get_aplicaciones_ejecucion', PERIOD) : { role: 'assistant', content: 'Synthetic two-application state summary' }, url => {
      const table = url.pathname.split('/').pop()!;
      if (!tables.has(table)) { unexpected.push(table); throw Error('Unexpected fixture table'); }
      return table === 'aplicaciones' ? [A, B] : [];
    });
    const result = await llmToolLoop([{ role: 'user', content: 'Dame el estado de las aplicaciones de mayo de 2031' }]);
    expect(result.text).toContain('Fumigación plága Z');
    expect(result.text).toContain('Fertilización sintética');
    expect(result.text).toMatch(/Estado registrado.*En ejecución/);
    expect(result.text).not.toContain('Synthetic two-application state summary');
    expect(result.text).not.toContain('Precisa cuál');
    expect(round).toBe(1);
    expect(JSON.parse(result.toolInteractions[0].result_summary).evidence.scopes).toHaveLength(2);
  });
});


describe('routing regressions — closed actual loop',()=>{
  it('does not turn a comma-bearing labor question into an application report or unverified model facts',async()=>{
    let modelCalls=0;
    const marker='Respuesta sintética de trabajo; esto no prueba su exactitud factual.';
    install(()=>{modelCalls++;return {role:'assistant',content:marker};});
    const result=await llmToolLoop([{role:'user',content:'Solo lectura: ¿Cuántas jornadas y qué costo laboral hubo por lote la semana pasada, sin detalle individual?'}]);
    expect(result.text).not.toBe(marker);expect(result.text).toContain('No pude verificar');
    expect(result.text).not.toContain('Aplicaciones registradas');expect(modelCalls).toBe(1);expect(result.toolInteractions).toEqual([]);
  });
  it('renders an actual execution cohort using the asked month, not model-selected dates or identity',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2032-05-18T17:00:00Z'));
    try {
      let modelCalls=0;
      const app={...A,id:'synthetic-may',nombre_aplicacion:'Fumigación sintética de mayo',fecha_inicio_ejecucion:'2032-05-04',fecha_inicio_planeada:'2032-01-02'};
      install(()=>{modelCalls++;return call('get_aplicaciones_ejecucion',{application_id:'wrong-model-id',date_from:'2030-01-01',date_to:'2030-01-02',estado:'Cerrada'});},url=>url.pathname==='/rest/v1/aplicaciones'?[app]:[]);
      const result=await llmToolLoop([{role:'user',content:'Consulta de solo lectura: ¿Qué aplicaciones realizamos en mayo?'}]);
      expect(modelCalls).toBe(1);expect(result.text).toContain('Fumigación sintética de mayo');
      expect(result.text).toMatch(/2032-05-01(?: a |–)2032-05-31/);expect(result.text).not.toContain('Necesito precisar');
      expect(result.toolInteractions[0].args).toEqual({date_basis:'actual',date_from:'2032-05-01',date_to:'2032-05-31'});
    } finally {vi.useRealTimers();}
  });
});

describe('shared grammar through the closed application loop',()=>{
  it.each([
    ['consumption','¿Cuánto se ha usado de cada producto en la aplicación contra plaga Z de mayo de 2032?',null,'3.2'],
    ['followup','¿Y cuántos jornales llevamos en esa aplicación?','¿Cuánto se ha usado de cada producto en la aplicación contra plaga Z de mayo de 2032?','1.5 jornales'],
    ['literal-month','¿Cómo va la aplicación Fumigación control plaga Z mayo?',null,'3.2'],
    ['numeric-cohort','¿Qué aplicaciones tuvieron ejecución del 12/05/2032 al 14/05/2032?',null,'2032-05-12 a 2032-05-14'],
    ['within-month-cohort','¿Qué aplicaciones tuvieron ejecución del 12 al 14 de mayo de 2032?',null,'2032-05-12 a 2032-05-14'],
  ])('renders fresh facts without a second prose generation: %s',async(_case,question,previous,expected)=>{
    let calls=0;
    const app={...A,id:'synthetic-may',nombre_aplicacion:'Fumigación control plaga Z mayo',tarea_id:'synthetic-task',fecha_inicio_ejecucion:'2032-05-13'};
    const rows:Record<string,unknown[]>={aplicaciones:[app],lotes:[{id:'synthetic-lot',nombre:'Sintético'}],productos:[{id:'synthetic-product',nombre:'Sintético',unidad_medida:'L'}],movimientos_diarios:[{id:'synthetic-move',aplicacion_id:app.id,fecha_movimiento:'2032-05-13',lote_id:'synthetic-lot'}],movimientos_diarios_productos:[{id:'synthetic-consumption',movimiento_diario_id:'synthetic-move',producto_id:'synthetic-product',cantidad_utilizada:'3.2',unidad:'L'}],registros_trabajo:[{id:'synthetic-work',tarea_id:'synthetic-task',fecha_trabajo:'2032-05-13',lote_id:'synthetic-lot',fraccion_jornal:'1.5',costo_jornal:'300'}]};
    const invented='Consumo Real de Productos: 999 L, 999 jornales.';
    install(()=>++calls===1?call('get_aplicaciones_ejecucion',{application_id:'wrong-model-id'}):{role:'assistant',content:invented},url=>rows[url.pathname.split('/').pop()!]??[]);
    vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2032-05-15T12:00:00Z'));
    const history=previous?[{role:'user',content:previous,created_at:'2032-05-14T12:00:00Z'},{role:'assistant',content:'La aplicación seleccionada es Otra y gastó 999 L.'}]:[];
    const result=await llmToolLoop([...history,{role:'user',content:'Consulta de solo lectura: '+question}]);
    expect(calls).toBe(1);expect(result.text).toContain(app.nombre_aplicacion);
    const saved=JSON.parse(result.toolInteractions[0].result_summary) as {evidence:Evidence};
    const metric=_case==='followup'?'application.journals':_case==='numeric-cohort'||_case==='within-month-cohort'?'application.actual_start':'application.quantity';
    const fact=saved.evidence.facts.find(f=>f.metric===metric)!;
    expect(fact,JSON.stringify({text:result.text,saved})).toMatchObject({entities:expect.arrayContaining([{kind:'application',id:app.id}]),source:{tool:'get_aplicaciones_ejecucion'},value:_case==='followup'?{kind:'decimal',value:'1.5',unit:'jornal'}:metric==='application.actual_start'?{kind:'date',value:'2032-05-13'}:{kind:'decimal',value:expected,unit:'L'}});
    if(metric==='application.actual_start')expect(saved.evidence.scopes.find(s=>s.id===fact.scopeId)?.period).toMatchObject({from:'2032-05-12',to:'2032-05-14',basis:'actual',fieldMeaning:'fecha_inicio_ejecucion'});
    expect(result.text).not.toContain('999');expect(result.text).not.toContain('Necesito precisar');
    const identities=saved.evidence.scopes.flatMap(s=>s.entities.map(e=>e.id));
    expect(identities).toContain(app.id);expect(result.toolInteractions[0].args.application_id).toBeUndefined();
  });
});
