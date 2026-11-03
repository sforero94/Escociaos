// Independent family acceptance: synthetic source, actual dispatcher and actual loop.
import {afterEach,expect,it,vi} from 'vitest';
import {ejecutarLlamadasVerificadas} from '../utils/escoTurnoVerificado';
import type {PuertoFuente} from '../utils/escoDispatcherVerificado';
import {mensajesDesdeHistorial} from '../utils/escoEvals/mensajes';
import {APPLICATION_METRICS,OperationFailure} from '../utils/escoOperacionContrato';
import {hechosEjecucionAplicacion} from '../utils/escoAplicacionHechos';
import {NUCLEO_EJECUTABLE} from '../utils/escoNucleoCatalogo';
import {readFile} from 'node:fs/promises';
import {resolverReferenciaSolicitud} from '../utils/escoReferenciaSolicitud';
import {resolverSeleccionAplicacion} from '../utils/escoConsultas';
const now='2034-05-08T12:00:00.000Z',day='2034-05-08';
const PRIVATE='SYN_PRIVATE_FAMILY_441100',FALSE='FABRICATED_GENERATION_99999';
const app={id:'app-q',nombre_aplicacion:'Aplicación plaga Q',tipo_aplicacion:'Fumigacion',estado:'Cerrada',tarea_id:'task-q',fecha_inicio_ejecucion:'2034-04-02',fecha_fin_ejecucion:null,fecha_inicio_planeada:'2034-03-31',fecha_fin_planeada:'2034-04-19'};
const call=(name:string,args:unknown)=>({id:'synthetic-call',function:{name,arguments:JSON.stringify(args)}});
const rows:Record<string,Record<string,unknown>[]>= {
 aplicaciones:[app],lotes:[{id:'lot-q',nombre:'Río Claro'}],productos:[{id:'product-q',nombre:'Producto Q',unidad_medida:'kg'}],
 movimientos_diarios:[{id:'movement-q',aplicacion_id:app.id,lote_id:'lot-q',fecha_movimiento:'2034-04-03',numero_canecas:5}],
 movimientos_diarios_productos:[{id:'consumption-q',movimiento_diario_id:'movement-q',producto_id:'product-q',producto_nombre:'Producto Q',cantidad_utilizada:'189',unidad:'kg'}],
 aplicaciones_mezclas:[{id:'mix-q',aplicacion_id:app.id,nombre_mezcla:'Plan Q',aplicaciones_productos:[{producto:{nombre:'Producto Q'},dosis_por_caneca:'2',cantidad_total_necesaria:'188.52',unidad_dosis:'kg'}]}],
 aplicaciones_productos:[{id:'plan-q',mezcla_id:'mix-q',producto_id:'product-q',producto_nombre:'Producto Q',cantidad_total_necesaria:'188.52',unidad_dosis:'kg',dosis_por_caneca:'2'}],
 aplicaciones_lotes:[],aplicaciones_lotes_planificado:[],aplicaciones_calculos:[{id:'calculation-q',aplicacion_id:app.id,lote_id:'lot-q',mezcla_id:'mix-q',numero_canecas:'5',litros_mezcla:'1000'}],
 registros_trabajo:[{id:'work-q',tarea_id:'task-q',fecha_trabajo:'2034-05-02',lote_id:'lot-q',lote:{nombre:'Río Claro'},fraccion_jornal:'0.5',costo_jornal:'17.5'}],
};
function applicationRow(){const movements=rows.movimientos_diarios.map(m=>({...m,consumos:rows.movimientos_diarios_productos}));return {...app,movimientos:movements,registros_trabajo:rows.registros_trabajo,productos_planeados:rows.aplicaciones_productos,plan_por_lote:rows.aplicaciones_calculos,hechos_ejecucion:hechosEjecucionAplicacion(movements,rows.registros_trabajo,{aplicacionId:app.id,tareaId:app.tarea_id,tareaExclusiva:true,desde:null,hasta:null,loteIds:null,consultaCompleta:true,baseSeleccion:'actual'})};}
function project(row:Record<string,unknown>,select:string):Record<string,unknown>{
 const fields:string[]=[];let depth=0,start=0;for(let i=0;i<select.length;i++){if(select[i]==='(')depth++;if(select[i]===')')depth--;if(select[i]===','&&depth===0){fields.push(select.slice(start,i));start=i+1;}}fields.push(select.slice(start));
 expect(select).not.toContain('*');return Object.fromEntries(fields.filter(Boolean).map(field=>{const key=field.split(/[:(]/)[0];return [key,row[key]??null];}));
}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
it('keeps the 28-row matrix exactly aligned with the real catalogue without claiming 28 complete capabilities',async()=>{
 const matrix=await readFile(new URL('../../docs/faithfulness/family-repair-contract-matrix-local.md',import.meta.url),'utf8');
 const names=[...matrix.matchAll(/^\| `([a-z_]+)` \|/gm)].map(m=>m[1]);expect(names).toHaveLength(28);expect([...new Set(names)].sort()).toEqual([...NUCLEO_EJECUTABLE].sort());expect(matrix).toContain('not 28 complete natural-language capabilities');
});
function safePort(question:string,options:{fail?:boolean;missing?:boolean}={}){
 const reads:string[]=[],applicationArgs:Record<string,unknown>[]=[];
 const port:PuertoFuente={currentUserText:question,now:()=>now,read:async(table,query)=>{reads.push(table+'?'+query);if(options.fail)throw Error(PRIVATE);return {rows:rows[table]??[],total:options.missing?null:(rows[table]??[]).length};},applications:async args=>{applicationArgs.push(args);return {rows:[applicationRow()],complete:true};}};
 return {port,reads,applicationArgs};
}
const typed=(calls:ReturnType<typeof call>[],port:PuertoFuente)=>ejecutarLlamadasVerificadas({calls,port,policy:{mode:'aggregate'},referenceDay:day,turnStartedAt:now,modelText:FALSE});
function storedFacts(interactions:{result_summary:string}[]):Array<{metric:string;value:{kind:string;value?:string}}> {return interactions.flatMap(h=>(JSON.parse(h.result_summary).evidence?.facts??[]) as Array<{metric:string;value:{kind:string;value?:string}}>);}
it.each([...APPLICATION_METRICS,undefined,['status','dates','quantity']].map(metric=>({metric})))('dispatches offered application metric $metric without presentation metadata in source filters',async({metric})=>{
 const f=safePort(metric==='theoretical'?'Cálculo teórico según dosis por canecas planeadas de la aplicación plaga Q':'Estado, fechas y consumo de la aplicación plaga Q');
 const r=await typed([call('get_aplicaciones_ejecucion',{application_name:app.nombre_aplicacion,...(metric===undefined?{}:{metric})})],f.port);
 expect(f.applicationArgs.length).toBeGreaterThan(0);
 for(const args of f.applicationArgs)for(const key of ['metric','reference_day','type'])expect(args).not.toHaveProperty(key);
 expect(r?.parts.some(p=>p.state==='answered'||p.state==='partial')).toBe(true);expect(r?.text).not.toContain(FALSE);
 const fs=storedFacts(r!.interactions);
 if(metric===undefined){expect(fs.some(f=>f.metric==='application.status'&&f.value.value==='Cerrada')).toBe(true);expect(fs.some(f=>f.metric==='application.actual_start'&&f.value.value==='2034-04-02')).toBe(true);}
 if(Array.isArray(metric)){expect(fs.some(f=>f.metric==='application.quantity'&&f.value.value==='189')).toBe(true);expect(fs.some(f=>f.metric==='application.status'&&f.value.value==='Cerrada')).toBe(true);}
});
it.each([[],['dates','alien'],null,42,{},['status','dates','quantity','labor','theoretical','date_comparison','status']].map(metric=>({metric})))('rejects malformed metric $metric before source I/O with a closed argument failure',async({metric})=>{
 const f=safePort('Estado de la aplicación plaga Q');const r=await typed([call('get_aplicaciones_ejecucion',{metric})],f.port);
 expect(f.applicationArgs).toEqual([]);expect(f.reads).toEqual([]);
 expect(JSON.parse(r!.interactions[0].result_summary)).toMatchObject({error:'invalid_arguments',stage:'arguments'});
});
it.each(['{broken', '[]', 'null', '"arguments"'])('rejects malformed tool argument envelope %s before reader',async argumentsText=>{
 const f=safePort('Estado de la aplicación plaga Q');const c=call('get_aplicaciones_ejecucion',{});c.function.arguments=argumentsText;
 const r=await typed([c],f.port);expect(f.applicationArgs).toEqual([]);expect(f.reads).toEqual([]);expect(JSON.parse(r!.interactions[0].result_summary)).toMatchObject({error:'invalid_arguments',stage:'arguments'});
});
it('keeps useful recorded labor when a sibling source fails, with no private exception text',async()=>{
 const f=safePort('Costo laboral y lluvia del 2034-05-01 al 2034-05-07');
 const read=f.port.read;f.port.read=async(t,q)=>{if(t==='clima_resumen_diario')throw Error(PRIVATE);return read(t,q);};
 const r=await typed([call('get_labor_summary',{date_from:'2034-05-01',date_to:'2034-05-07'}),call('get_climate_data',{date_from:'2034-05-01',date_to:'2034-05-07'})],f.port);
 expect(r?.text).toContain('17.5');expect(r?.parts.some(p=>p.state==='answered')).toBe(true);expect(r?.parts.some(p=>p.state==='unavailable')).toBe(true);
 expect(JSON.stringify(r)).not.toMatch(new RegExp(PRIVATE+'|'+FALSE));
});
it('does not fabricate zero or change population when exact source count is missing',async()=>{
 const f=safePort('Costo laboral del 2034-05-01 al 2034-05-07',{missing:true});
 const r=await typed([call('get_labor_summary',{date_from:'2034-05-01',date_to:'2034-05-07'})],f.port);
 expect(r?.parts.every(p=>p.state==='unavailable')).toBe(true);expect(r?.text).not.toContain('0 `COP`');
});
it.each([
 {question:'¿Qué puedes hacer con compras? No quiero información de inventario ni conciliación.',allowed:false},
 {question:'¿Qué puedes hacer con compras? Ejemplo: "inventario conciliación".',allowed:false},
 {question:'¿Qué puedes hacer con inventario y conciliación?',allowed:true},
])('binds capability metadata to one positive actual USER clause: $question',async({question,allowed})=>{
 const f=safePort('¿Qué puedes hacer con inventario y conciliación?');f.port.currentRequestText=question;
 const r=await typed([call('get_recorded_state_definition',{domain:'capability',state:'get_inventario_conciliacion'})],f.port);
 expect(f.reads).toEqual([]);expect(f.applicationArgs).toEqual([]);
 const context=JSON.parse(r!.interactions[0].result_summary);
 if(allowed){expect(context).toMatchObject({definition:true,domain:'capability',state:'get_inventario_conciliacion'});expect(r?.text).toContain('conciliación de conteos físicos');}
 else {expect(context).toMatchObject({error:'unsupported_operation',stage:'arguments',reason:'irrelevant_definition'});expect(r?.text).not.toContain('conciliación de conteos físicos');}
});
it.each([{code:'source_error',stage:'source'},{code:'budget_exceeded',stage:'budget'},{code:'incomplete_population',stage:'coverage'},{code:'scope_ambiguous',stage:'scope'}] as const)('retains closed operation failure $code/$stage while keeping a sibling useful',async({code,stage})=>{
 const f=safePort('Costo laboral y aplicaciones');f.port.applications=async()=>{throw new OperationFailure(code,stage);};
 const r=await typed([call('get_labor_summary',{date_from:'2034-05-01',date_to:'2034-05-07'}),call('get_aplicaciones_ejecucion',{metric:'status'})],f.port);
 expect(r?.text).toContain('17.5');expect(JSON.parse(r!.interactions[1].result_summary)).toMatchObject({error:code,stage});expect(r?.parts.some(p=>p.state==='unavailable')).toBe(true);
});
async function loop(channel:'Web'|'Telegram',question:string,calls:ReturnType<typeof call>[],options:{sourceFailure?:boolean;fallback?:boolean;invalidFirst?:boolean;preModelClarification?:boolean;applications?:Record<string,unknown>[];previousUser?:string;previousUsers?:string[];callsAfterFirst?:ReturnType<typeof call>[];invalidPriorTime?:boolean;workRows?:Record<string,unknown>[];lots?:Record<string,unknown>[];terminalAfterFirst?:boolean}={}){
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(now));vi.spyOn(console,'log').mockImplementation(()=>{});vi.spyOn(console,'error').mockImplementation(()=>{});
 const payloads:Record<string,unknown>[]=[],reads:URL[]=[],events:unknown[]=[],denied:string[]=[];
 const keys:Record<string,string>={SUPABASE_URL:'https://family-fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-db',OPENROUTER_API_KEY:'synthetic-provider'};
 vi.stubGlobal('Deno',{env:{get:(k:string)=>{if(!(k in keys))throw Error('Unlisted synthetic env');return keys[k];}}});
 vi.stubGlobal('fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
  const req=new Request(input,init),url=new URL(req.url);
  if(req.url==='https://openrouter.ai/api/v1/chat/completions'&&req.method==='POST'){
   payloads.push(JSON.parse(await req.text()));if(payloads.length>3){denied.push('excess-model-rounds');throw Error('Excess synthetic rounds');}
   if(options.fallback&&payloads.length===1)return Response.json({choices:[{message:{role:'assistant',content:FALSE}}]});
   if(options.terminalAfterFirst&&payloads.length>1)return Response.json({choices:[{message:{role:'assistant',content:FALSE}}]});
   if(options.invalidFirst&&payloads.length===1)return Response.json({choices:[{message:{role:'assistant',content:FALSE,tool_calls:[{...call('get_aplicaciones_ejecucion',{application_name:app.nombre_aplicacion,metric:'alien'}),type:'function'}]}}]});
   const proposed=payloads.length>1&&options.callsAfterFirst?options.callsAfterFirst:calls;
   return Response.json({choices:[{message:{role:'assistant',content:FALSE,tool_calls:proposed.map(c=>({...c,type:'function'}))}}]});
  }
  if(req.method!=='GET'||url.origin!=='https://family-fixture.invalid'||!url.pathname.startsWith('/rest/v1/')){denied.push(req.method+' '+url.origin);throw Error('Closed transport');}
  const table=url.pathname.split('/').at(-1)!;if(!Object.prototype.hasOwnProperty.call(rows,table)){denied.push(table);throw Error('Unlisted fixture table');}reads.push(url);
  if(options.sourceFailure)return Response.json({code:'PGRST002',message:PRIVATE},{status:503});
  let out=table==='aplicaciones'&&options.applications?options.applications:table==='registros_trabajo'&&options.workRows?options.workRows:table==='lotes'&&options.lots?options.lots:rows[table];
  for(const [key,filter]of url.searchParams){if(['select','order','limit','offset'].includes(key))continue;const dot=filter.indexOf('.'),op=filter.slice(0,dot),value=filter.slice(dot+1);
   if(!['eq','in','gte','lte','lt','ilike'].includes(op)){denied.push('operator:'+op);throw Error('Unlisted operator');}
   out=out.filter(r=>op==='eq'?String(r[key])===value:op==='in'?value.slice(1,-1).split(',').map(x=>x.replace(/"/g,'')).includes(String(r[key])):op==='ilike'?String(r[key]).toLowerCase()===value.replace(/\*/g,'').toLowerCase():r[key]!=null&&(op==='gte'?String(r[key])>=value:op==='lte'?String(r[key])<=value:String(r[key])<value));
  }
  const total=out.length,offset=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit')??200),page=out.slice(offset,offset+limit);
  const select=url.searchParams.get('select');expect(select).toBeTruthy();
  return Response.json(page.map(row=>project(row,select!)),{headers:{'content-range':page.length?`${offset}-${offset+page.length-1}/${total}`:`*/${total}`}});
 });
 const history=(options.previousUsers??[options.previousUser??PRIVATE+' old user']).flatMap(content=>[{role:'user' as const,content},{role:'assistant' as const,content:PRIVATE+' old answer',herramientas:[{tool:'get_employee_activity',args:{worker_name:PRIVATE},result_summary:PRIVATE}]}]);
 let userOrdinal=0;
 const messages=mensajesDesdeHistorial([...history,{role:'user',content:question}],PRIVATE+' old memory',channel).map((m,i)=>{if(m.role==='user')userOrdinal++;return {...m,...(m.role==='user'?{id:'family-user-'+i,...(options.invalidPriorTime&&userOrdinal===history.length/2?{}:{created_at:'2034-05-08T11:50:00.000Z'})}:{})};});
 const path='../supabase/functions/server/chat.tsx';const {llmToolLoop}=await import(path) as {llmToolLoop:(m:unknown[],u:string,e:(x:unknown)=>void)=>Promise<{text:string;toolInteractions:{tool:string;args:unknown;result_summary:string}[]}>};
 const result=await llmToolLoop(messages,'synthetic-user',e=>events.push(e));
 const diagnostics=vi.mocked(console.error).mock.calls;
 expect(denied).toEqual([]);if(!options.preModelClarification)expect(payloads.length).toBeGreaterThan(0);expect(JSON.stringify([payloads,result,events,diagnostics])).not.toMatch(new RegExp(PRIVATE+'|'+FALSE));
 return {result,reads,payloads,diagnostics};
}
it.each(['Web','Telegram'] as const)('answers historical labor without requiring a lot on %s and overrides model range',async channel=>{
 const r=await loop(channel,'¿Cuál fue el costo laboral registrado la semana pasada?',[call('get_labor_summary',{date_from:'1900-01-01',date_to:'1900-01-02'})]);
 expect(r.result.text).toContain('17.5');expect(r.result.text).toContain('Río Claro');
 const work=r.reads.find(u=>u.pathname.endsWith('/registros_trabajo'));expect(work).toBeDefined();expect(work!.searchParams.get('fecha_trabajo')).toContain('2034-05-01');
});
it.each(['Web','Telegram'] as const)('does not answer orphan application identity with unrelated capability metadata on %s',async channel=>{
 const r=await loop(channel,'¿Y esa aplicación cómo quedó?',[call('get_recorded_state_definition',{domain:'capability',state:'get_inventario_conciliacion'})],{preModelClarification:true});
 expect(r.reads).toEqual([]);expect(r.result.text).toMatch(/identidad|aplicaci[oó]n.*(?:nombre|precis|cu[aá]l)/i);expect(r.result.text).not.toContain('conteos físicos');
});
it.each(['Web','Telegram'] as const)('keeps explicitly requested registered-state definition useful without operational reads on %s',async channel=>{
 const r=await loop(channel,'¿Qué significa el estado registrado Cerrada de una aplicación?',[call('get_recorded_state_definition',{domain:'application',state:'Cerrada'})]);
 expect(r.reads).toEqual([]);expect(r.result.text).toMatch(/Cerrada/i);expect(r.result.text).toMatch(/registr|estado/i);
});
it.each(['Web','Telegram'] as const)('resolves a unique previous USER application against fresh catalog rather than wrong model identity on %s',async channel=>{
 const r=await loop(channel,'¿Y las fechas de esa aplicación?',[call('get_aplicaciones_ejecucion',{application_name:'Otra inventada',application_id:'wrong-model-id',metric:'dates'})],{previousUser:'Estado de la aplicación plaga Q'});
 const reference=resolverReferenciaSolicitud({question:'¿Y las fechas de esa aplicación?',previousUserText:'Estado de la aplicación plaga Q',previousUserAt:'2034-05-08T11:50:00.000Z',now:new Date(now)});
 const selection=resolverSeleccionAplicacion({pregunta:reference.effectiveQuestion,anterior:'Estado de la aplicación plaga Q'},[app],rows.lotes,false);
 expect(r.result.text,JSON.stringify({reference,selection,reads:r.reads.map(u=>u.href),diagnostics:r.diagnostics})).toContain(app.nombre_aplicacion);expect(r.result.text).toContain('2034-04-02');expect(r.result.text).not.toContain('Otra inventada');
 expect(r.reads.some(u=>u.pathname.endsWith('/aplicaciones'))).toBe(true);
});
it.each(['Web','Telegram'] as const)('keeps source failure bounded through actual fallback on %s',async channel=>{
 const r=await loop(channel,'Costo laboral del 2034-05-01 al 2034-05-07',[call('get_labor_summary',{})],{invalidFirst:true,sourceFailure:true});
 expect(r.reads.some(u=>u.pathname.endsWith('/registros_trabajo'))).toBe(true);
 expect(r.result.text).not.toContain('17.5');expect(r.result.text).not.toContain('0 `COP`');expect(r.result.text).toMatch(/verific|pendiente|fuente/i);
});
it.each(['Web','Telegram'] as const)('keeps terminal prose unavailable when there is no fresh source on %s',async channel=>{
 const r=await loop(channel,'Costo laboral del 2034-05-01 al 2034-05-07',[call('get_labor_summary',{})],{fallback:true});
 expect(r.reads).toEqual([]);expect(r.result.text).not.toContain('17.5');expect(r.result.text).not.toContain('0 `COP`');
});
const metricCases=[
 {metric:'status',question:'Estado registrado de la aplicación plaga Q',expected:'Cerrada'},
 {metric:'dates',question:'Fechas de la aplicación plaga Q',expected:'2034-04-02'},
 {metric:'date_comparison',question:'Compara fechas planeadas y reales de la aplicación plaga Q',expected:'2034-03-31'},
 {metric:'quantity',question:'Consumo registrado de la aplicación plaga Q',expected:'189'},
 {metric:'labor',question:'Trabajo registrado de la aplicación plaga Q',expected:'17.5'},
 {metric:'theoretical',question:'Cálculo teórico dosis por canecas de la aplicación plaga Q',expected:'10'},
];
it.each((['Web','Telegram'] as const).flatMap(channel=>['status','dates','labor',['status','dates']].map(metric=>({channel,metric}))))('keeps USER quantity task when a valid $metric proposal selects another part on $channel',async({channel,metric})=>{
 const r=await loop(channel,'¿Qué productos se usaron en la aplicación plaga Q?',[call('get_aplicaciones_ejecucion',{application_name:app.nombre_aplicacion,metric})]);
 expect(storedFacts(r.result.toolInteractions)).toEqual(expect.arrayContaining([expect.objectContaining({metric:'application.quantity',value:expect.objectContaining({kind:'decimal',value:'189'})})]));
 expect(r.result.text).toContain('Producto Q');expect(r.result.text).toContain('189');
 expect(r.reads.some(u=>u.pathname.endsWith('/movimientos_diarios_productos'))).toBe(true);
 expect(storedFacts(r.result.toolInteractions).some(f=>f.metric==='application.journals')).toBe(false);
});
it.each(['Web','Telegram'] as const)('repairs a valid wrong-domain proposal before it can read general labor for application labor on %s',async channel=>{
 const r=await loop(channel,'Trabajo registrado de la aplicación plaga Q',[call('get_labor_summary',{date_from:'2034-05-01',date_to:'2034-05-07'})],{callsAfterFirst:[call('get_aplicaciones_ejecucion',{application_name:app.nombre_aplicacion,metric:'status'})]});
 expect(r.payloads).toHaveLength(2);expect(r.result.text).toContain('17.5');
 const work=r.reads.filter(u=>u.pathname.endsWith('/registros_trabajo'));
 expect(work.length).toBeGreaterThan(0);expect(work.every(u=>u.searchParams.has('tarea_id'))).toBe(true);
 expect(r.result.toolInteractions.some(h=>JSON.parse(h.result_summary).reason==='operation_mismatch')).toBe(true);
});
it.each((['Web','Telegram'] as const).flatMap(channel=>['Explica el estado Cerrada de una aplicación','¿Qué implica que una aplicación figure Cerrada?'].map(question=>({channel,question}))))('keeps semantic definition useful without record identity: $question / $channel',async({channel,question})=>{
 const r=await loop(channel,question,[call('get_recorded_state_definition',{domain:'application',state:'Cerrada'})]);
 expect(r.reads).toEqual([]);expect(r.result.text).toContain('Cerrada');expect(r.result.text).toMatch(/no (?:prueba|demuestra|garantiza)|no implica/i);
 expect(r.result.text).not.toContain('precisar la identidad');
});
it.each(['Web','Telegram'] as const)('preserves a nonprefix USER reference and chained scope without prior assistant facts on %s',async channel=>{
 const r=await loop(channel,'¿Cuántos jornales llevamos en esa aplicación?',[call('get_aplicaciones_ejecucion',{application_name:'Otra inventada',metric:'status',date_from:'1900-01-01',date_to:'1900-01-02'})],{previousUsers:['Trabajo registrado de la aplicación plaga Q del 2034-05-01 al 2034-05-07','¿Cuáles fueron las fechas de esa aplicación?'],workRows:[...rows.registros_trabajo,{...rows.registros_trabajo[0],id:'outside-period',fecha_trabajo:'2034-04-30',costo_jornal:'999',fraccion_jornal:'30'}]});
 expect(r.result.text,JSON.stringify(r.result.toolInteractions)).toContain('17.5');
 expect(r.result.text).not.toContain('Otra inventada');
 const payload=JSON.stringify(r.payloads[0]);expect(payload).toContain('2034-05-01');expect(payload).toContain('referencia USER resuelta');expect(payload).not.toContain('plaga q');
 const work=r.reads.find(u=>u.pathname.endsWith('/registros_trabajo'));expect(work).toBeDefined();
 const context=r.result.toolInteractions.map(h=>JSON.parse(h.result_summary)).find(c=>c.evidence?.facts?.some((f:{metric:string})=>f.metric==='application.cost'));
 expect(context.evidence.scopes.every((s:{period:{from:string;to:string}})=>s.period.from==='2034-05-01'&&s.period.to==='2034-05-07')).toBe(true);
 expect(r.result.text).not.toContain('999');
});
it.each(['Web','Telegram'] as const)('offers only aggregate labor arguments and corrects personal null before source on %s',async channel=>{
 const r=await loop(channel,'Jornales y costos por lote desglosados la semana pasada',[call('get_labor_summary',{employee_name:null})],{callsAfterFirst:[call('get_labor_summary',{lote_name:null})]});
 expect(r.payloads).toHaveLength(2);expect(r.result.text).toContain('17.5');
 const tools=r.payloads[0].tools as Array<{function:{name:string;parameters:{properties:Record<string,unknown>}}}>;
 const labor=tools.find(t=>t.function.name==='get_labor_summary')!;
 expect(Object.keys(labor.function.parameters.properties).sort()).toEqual(['date_from','date_to','lote_name']);
 expect(r.reads.every(u=>!u.search.includes('empleado')&&!u.search.includes('salario'))).toBe(true);
});
it.each(['Web','Telegram'] as const)('keeps definition and obtains the separate requested facts on %s',async channel=>{
 const r=await loop(channel,'Qué significa Cerrada; muestra consumo registrado de la aplicación plaga Q',[call('get_recorded_state_definition',{domain:'application',state:'Cerrada'})],{callsAfterFirst:[call('get_aplicaciones_ejecucion',{metric:'status',application_name:app.nombre_aplicacion})]});
 expect(r.payloads).toHaveLength(2);expect(r.result.text).toContain('Cerrada');expect(r.result.text).toContain('189');
 expect(r.result.text).not.toContain('Queda pendiente la consulta de la aplicación');
});
it.each(['Web','Telegram'] as const)('retains a verified definition if the missing-data retry ends without tools on %s',async channel=>{
 const r=await loop(channel,'Qué significa Cerrada; muestra consumo registrado de la aplicación plaga Q',[call('get_recorded_state_definition',{domain:'application',state:'Cerrada'})],{terminalAfterFirst:true});
 expect(r.payloads).toHaveLength(2);expect(r.reads).toEqual([]);expect(r.result.text).toContain('Cerrada');expect(r.result.text).toMatch(/pendiente|no pude verificar/i);expect(r.result.text).not.toContain('189');
});
it.each(['Web','Telegram'] as const)('does not restore explicitly excluded application fields from valid model metadata on %s',async channel=>{
 const r=await loop(channel,'No muestres estado; no incluyas fechas de la aplicación plaga Q',[call('get_aplicaciones_ejecucion',{metric:'status',application_name:app.nombre_aplicacion})]);
 expect(r.reads).toEqual([]);expect(r.result.text).not.toContain('Cerrada');expect(r.result.text).toMatch(/excluye|precisa/);
});
it.each(['Web','Telegram'] as const)('never reinserts a historical USER note as a model selector on %s',async channel=>{
 const r=await loop(channel,'¿Y las fechas de esa aplicación?',[call('get_aplicaciones_ejecucion',{metric:'dates'})],{previousUser:'Estado de la aplicación plaga Q observaciones '+PRIVATE});
 expect(JSON.stringify(r.payloads)).not.toContain(PRIVATE);expect(r.result.text).not.toContain(PRIVATE);
 expect(r.reads.some(u=>u.pathname.endsWith('/registros_trabajo'))).toBe(false);
});
it.each(['Web','Telegram'] as const)('does not skip an invalid latest USER link to reuse an older identity on %s',async channel=>{
 const r=await loop(channel,'¿Y las fechas de esa aplicación?',[call('get_aplicaciones_ejecucion',{metric:'dates'})],{previousUsers:['Estado de la aplicación Sol','Estado de la aplicación Luna'],invalidPriorTime:true,preModelClarification:true});
 expect(r.payloads).toEqual([]);expect(r.reads).toEqual([]);expect(r.result.text).toMatch(/identificar|nombre/);
});
it.each(['Web','Telegram'] as const)('keeps an aggregate continuation with explicit personal exclusions useful on %s',async channel=>{
 const r=await loop(channel,'¿Y el costo registrado por lote?',[call('get_labor_summary',{})],{previousUser:'Jornales y costo por lote la semana pasada, sin salarios individuales'});
 expect(r.result.text,JSON.stringify(r.result.toolInteractions)).toContain('17.5');
 expect(r.reads.every(u=>!u.search.includes('empleado')&&!u.search.includes('salario'))).toBe(true);
});
it.each(['Web','Telegram'] as const)('does not borrow a sibling labor period or metric for application status on %s',async channel=>{
 const r=await loop(channel,'Estado de la aplicación plaga Q; por separado, jornales y costo de todas las labores por lote la semana pasada',[call('get_aplicaciones_ejecucion',{metric:['status','labor'],date_from:'1900-01-01',date_to:'1900-01-02'}),call('get_labor_summary',{})]);
 const facts=storedFacts(r.result.toolInteractions);expect(facts.some(f=>f.metric==='application.status'&&f.value.value==='Cerrada')).toBe(true);
 expect(facts.some(f=>f.metric==='labor.cost'&&f.value.value==='17.5')).toBe(true);expect(facts.some(f=>f.metric==='application.cost')).toBe(false);
 const appContext=r.result.toolInteractions.map(h=>JSON.parse(h.result_summary)).find(c=>c.evidence?.facts?.some((f:{metric:string})=>f.metric==='application.status'));
 expect(appContext.evidence.scopes.every((s:{period:unknown})=>s.period===null)).toBe(true);
});
it.each(['Web','Telegram'] as const)('keeps two explicit periods bound to their own requested domains on %s',async channel=>{
 const r=await loop(channel,'Estado de la aplicación plaga Q del 2034-04-01 al 2034-04-30; por separado, jornales y costo de todas las labores por lote del 2034-05-01 al 2034-05-07',[call('get_aplicaciones_ejecucion',{metric:'labor'}),call('get_labor_summary',{})]);
 const contexts=r.result.toolInteractions.map(h=>JSON.parse(h.result_summary));
 const appContext=contexts.find(c=>c.evidence?.facts?.some((f:{metric:string})=>f.metric==='application.status'));
 const laborContext=contexts.find(c=>c.evidence?.facts?.some((f:{metric:string})=>f.metric==='labor.cost'));
 expect(appContext.evidence.scopes.every((s:{period:{from:string;to:string}})=>s.period.from==='2034-04-01'&&s.period.to==='2034-04-30')).toBe(true);
 expect(laborContext.evidence.scopes.every((s:{period:{from:string;to:string}})=>s.period.from==='2034-05-01'&&s.period.to==='2034-05-07')).toBe(true);
 expect(r.result.text).toContain('Cerrada');expect(r.result.text).toContain('17.5');
});
it.each(['Web','Telegram'] as const)('does not apply a purchase activity word as an application type filter on %s',async channel=>{
 const r=await loop(channel,'Estado de la aplicación plaga Q; consulta las compras de fertilización de abril de 2034',[call('get_aplicaciones_ejecucion',{metric:'status',type:'Fertilizacion'})]);
 expect(r.result.text).toContain('Cerrada');expect(r.result.text).toMatch(/pendientes.*fuente.*compras/i);
 expect(storedFacts(r.result.toolInteractions).some(f=>f.metric==='application.status'&&f.value.value==='Cerrada')).toBe(true);
});
it.each(['Web','Telegram'] as const)('binds a new explicit lot on a reference before partitioning registered work on %s',async channel=>{
 const r=await loop(channel,'¿Cuántos jornales llevamos en esa aplicación en el lote Sur del 2034-05-01 al 2034-05-07?',[call('get_aplicaciones_ejecucion',{metric:'status',lote_name:'Río Claro'})],{previousUser:'Trabajo registrado de la aplicación plaga Q en el lote Río Claro',lots:[...rows.lotes,{id:'lot-south',nombre:'Sur'}],workRows:[...rows.registros_trabajo,{...rows.registros_trabajo[0],id:'work-south',lote_id:'lot-south',lote:{nombre:'Sur'},fraccion_jornal:'2',costo_jornal:'73'}]});
 expect(r.result.text,JSON.stringify(r.result.toolInteractions)).toContain('73');expect(r.result.text).not.toContain('17.5');
 expect(storedFacts(r.result.toolInteractions).some(f=>f.metric==='application.cost'&&f.value.value==='73')).toBe(true);
});
it.each(metricCases.flatMap(c=>(['Web','Telegram'] as const).map(channel=>({...c,channel}))))('keeps actual application utility for announced $metric on $channel through real loop',async({metric,question,expected,channel})=>{
 const r=await loop(channel,question,[call('get_aplicaciones_ejecucion',{application_name:app.nombre_aplicacion,metric})]);
 expect(r.result.text).toContain(expected);expect(r.reads.some(u=>u.pathname.endsWith('/aplicaciones'))).toBe(true);
 if(metric==='quantity'){expect(r.result.text).not.toContain('188.52');expect(r.result.text).not.toContain('10 `kg`');}
 if(metric==='dates')expect(r.result.text).toMatch(/no verific|desconocid|ausente/i);
 if(metric==='theoretical')expect(r.result.text).toMatch(/te[oó]ric|estimaci[oó]n|planead/i);
 const fs=storedFacts(r.result.toolInteractions);
 if(metric==='quantity')expect(fs,JSON.stringify(r.result.toolInteractions)).toEqual(expect.arrayContaining([expect.objectContaining({metric:'application.quantity',value:expect.objectContaining({kind:'decimal',value:'189'})})]));
 if(metric==='labor')for(const [m,v]of [['application.cost','17.5'],['application.journals','0.5']])expect(fs.some(f=>f.metric===m&&f.value.value===v)).toBe(true);
 if(metric==='theoretical')expect(fs.some(f=>f.metric==='application.theoretical_quantity'&&f.value.value==='10')).toBe(true);
});
it.each(['Web','Telegram'] as const)('keeps actual quantity useful through fallback without replacing it with generated plan on %s',async channel=>{
 const r=await loop(channel,'Consumo registrado de la aplicación plaga Q',[call('get_aplicaciones_ejecucion',{application_name:app.nombre_aplicacion,metric:'quantity'})],{invalidFirst:true});
 expect(r.result.text).toContain('189');expect(r.result.text).not.toContain('188.52');expect(r.result.text).not.toContain(FALSE);
});
it.each((['Web','Telegram'] as const).flatMap(channel=>[undefined,['status','dates','quantity']].map(metric=>({channel,metric}))))('keeps omitted/multiple metric $metric useful on $channel through actual reader',async({channel,metric})=>{
 const q=metric?'Estado, fechas y consumo registrado de la aplicación plaga Q':'Estado y fechas de la aplicación plaga Q';
 const r=await loop(channel,q,[call('get_aplicaciones_ejecucion',{application_name:app.nombre_aplicacion,...(metric?{metric}:{})})]);
 const fs=storedFacts(r.result.toolInteractions);expect(fs.some(f=>f.metric==='application.status'&&f.value.value==='Cerrada')).toBe(true);expect(fs.some(f=>f.metric==='application.actual_start'&&f.value.value==='2034-04-02')).toBe(true);
 if(metric)expect(fs.some(f=>f.metric==='application.quantity'&&f.value.value==='189')).toBe(true);
});
it.each((['Web','Telegram'] as const).flatMap(channel=>[{question:'Consumo registrado de la aplicación plaga Q',metric:'application.quantity',value:'189'},{question:'Costo laboral registrado de la aplicación plaga Q',metric:'application.cost',value:'17.5'}].map(c=>({...c,channel}))))('binds omitted metric to explicit user purpose $metric on $channel',async({question,metric,value,channel})=>{
 const r=await loop(channel,question,[call('get_aplicaciones_ejecucion',{application_name:app.nombre_aplicacion})]);
 expect(storedFacts(r.result.toolInteractions).some(f=>f.metric===metric&&f.value.value===value)).toBe(true);expect(r.result.text).toContain(value);
});
it.each(['Web','Telegram'] as const)('rejects conflicting user dates before source read rather than trusting valid model dates on %s',async channel=>{
 const r=await loop(channel,'Costo laboral del 2034-05-07 al 2034-05-01',[call('get_labor_summary',{date_from:'2034-05-01',date_to:'2034-05-07'})]);
 expect(r.reads).toEqual([]);expect(r.result.text).not.toContain('17.5');expect(r.result.text).toMatch(/per[ií]odo|rango|fecha/i);
});
it.each(['actual','planned'] as const)('keeps %s start membership distinct from movement date and missing start',async basis=>{
 const alternative={...app,id:'other-q',nombre_aplicacion:'Aplicación alternativa Q',fecha_inicio_ejecucion:'2034-05-02',fecha_inicio_planeada:'2034-04-05'};
 const unknown={...app,id:'unknown-q',nombre_aplicacion:'Aplicación sin fecha Q',fecha_inicio_ejecucion:null,fecha_inicio_planeada:null};
 const question=basis==='actual'?'¿Qué aplicaciones tuvieron ejecución en abril de 2034?':'¿Qué aplicaciones tienen fechas planeadas en abril de 2034?';
 const r=await loop('Web',question,[call('get_aplicaciones_ejecucion',{date_basis:basis,date_from:'2034-04-01',date_to:'2034-04-30',metric:'dates'})],{applications:[app,alternative,unknown]});
 expect(r.result.text).toContain(basis==='actual'?app.nombre_aplicacion:alternative.nombre_aplicacion);
 expect(r.result.text).not.toContain(basis==='actual'?alternative.nombre_aplicacion:app.nombre_aplicacion);expect(r.result.text).not.toContain(unknown.nombre_aplicacion);
});
