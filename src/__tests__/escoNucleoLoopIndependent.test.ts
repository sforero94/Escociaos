// Independent boundaries for selected-core wiring; synthetic transport only.
import {afterEach,expect,it,vi} from 'vitest';
import {mensajesDesdeHistorial} from '../utils/escoEvals/mensajes';
import {crearContextoNucleo} from '../utils/escoNucleoSolicitud';
import {crearPuertoNucleo} from '../utils/escoNucleoTransporte';
const now=new Date('2034-05-08T12:00:00.000Z');
it.each([
 ['Compras, no quiero mostrar proveedores','supplier'],
 ['No mostrar clientes en los despachos','client'],
] as const)('does not grant counterparty purpose from an explicitly negated request: %s',(question,kind)=>{
 const ctx=crearContextoNucleo({question,now});expect(ctx.identities[kind]).toBe(false);expect(ctx.identityLabels?.[kind]).toBe(false);
});
it('keeps actual counterparty requests useful and separates grouping from display labels',()=>{
 expect(crearContextoNucleo({question:'Compras por proveedor',now})).toMatchObject({identities:{supplier:true},identityLabels:{supplier:true}});
 expect(crearContextoNucleo({question:'Despachos por cliente sin nombres',now})).toMatchObject({identities:{client:true},identityLabels:{client:false}});
});
it.each([
 ['compras','select=id&proveedor=eq.ProveedorSintetico'],
 ['despachos','select=id,kilos_despachados&cliente_id=eq.synthetic-client'],
] as const)('rejects an unrequested counterparty filter before backend I/O: %s',async(table,query)=>{
 const page=vi.fn(async (..._args:[string,string])=>({rows:[],total:0}));
 const ctx=crearContextoNucleo({question:'Totales registrados',now});
 const port=crearPuertoNucleo(ctx,{page,now:()=>now.toISOString()});
 await expect(port.read(table,query)).rejects.toThrow();expect(page).not.toHaveBeenCalled();
});
it('adds a canonical identity tie-breaker to requested nonunique source order',async()=>{
 const page=vi.fn(async (..._args:[string,string])=>({rows:[],total:0}));
 const port=crearPuertoNucleo(crearContextoNucleo({question:'Compras registradas',now}),{page,now:()=>now.toISOString()});
 await port.read('compras','select=id,fecha_compra&order=fecha_compra.desc');
 expect(page).toHaveBeenCalledTimes(1);const query=page.mock.calls[0]?.[1];
 expect(new URLSearchParams(query).get('order')).toBe('fecha_compra.desc,id.asc');
});

const DB='https://independent-core.invalid',MODEL='https://openrouter.ai/api/v1/chat/completions';
const SECRET='PRIVATE_INDEPENDENT_SOURCE',FALSE='INVENTED_PROSE_9000000';
const uid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
type Row=Record<string,unknown>;
type Family='commerce'|'crop'|'operations'|'cattle'|'memory'|'individual'|'capability';
type Channel='Web'|'Telegram';
const tools:Record<Family,string>={commerce:'get_purchase_history',crop:'get_production_data',operations:'get_conductivity_data',cattle:'get_ganado_inventory',memory:'propose_memory_save',individual:'get_employee_activity',capability:'get_recorded_state_definition'};
const questions:Record<Family,string>={commerce:'Compras por producto del 2034-05-01 al 2034-05-07',crop:'Producción agrícola de 2034',operations:'Conductividad por lote del 2034-05-01 al 2034-05-07',cattle:'Existencias y densidad de ceba por ubicación',memory:'recuerda que prefiero respuestas breves',individual:'Salario del empleado Ana Sintetica',capability:'Explica el límite de la conciliación de inventario'};
const bounded=['get_labor_summary','get_inventory_status','get_climate_data','get_aplicaciones_ejecucion','get_application_summary','get_hato_produccion','get_financial_summary','get_recorded_state_definition','get_hato_partos','get_hato_eventos','get_hato_animales','get_lot_info','get_weekly_overview','get_ganado_movimientos_detalle','get_ganado_inventory','get_produccion_calidad','get_monitoring_data','get_production_data','get_harvest_shipments','get_purchase_history','get_inventory_movements','get_tareas','get_radiation_context','get_conductivity_data'];
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
function fixtures():Record<string,Row[]>{return {
 compras:[{id:uid(1),producto_id:uid(11),fecha_compra:'2034-05-02',cantidad:'1.5',unidad:'Kilos',costo_unitario:'9.99',costo_total:'10.1',producto:{nombre:'Producto seguro'},proveedor:SECRET},{id:uid(2),producto_id:uid(11),fecha_compra:'2034-05-03',cantidad:'2.5',unidad:'Kilos',costo_unitario:'7.77',costo_total:'20.2',producto:{nombre:'Producto seguro'},proveedor:SECRET}],
 productos:[{id:uid(11),nombre:'Producto seguro'}],
 lotes:[{id:uid(21),nombre:'Norte'},{id:uid(22),nombre:'Sur'}],sublotes:[],
 produccion:[{id:uid(31),lote_id:uid(21),sublote_id:null,ano:2034,cosecha_tipo:'Principal',kg_totales:'100.1',arboles_registrados:10,kg_por_arbol:'10.01'},{id:uid(32),lote_id:uid(22),sublote_id:null,ano:2034,cosecha_tipo:'Principal',kg_totales:'20.2',arboles_registrados:10,kg_por_arbol:'2.02'}],
 mon_conductividad:[{id:uid(41),lote_id:uid(21),fecha_monitoreo:'2034-05-02',valor_ce:'1.25',ph:null,num_arboles:10,lote:{id:uid(21),nombre:'Norte'}},{id:uid(42),lote_id:uid(22),fecha_monitoreo:'2034-05-03',valor_ce:'3.5',ph:'7',num_arboles:10,lote:{id:uid(22),nombre:'Sur'}}],
 gan_ubicaciones:[{id:uid(101),nombre:'Ubicación segura'}],gan_fincas:[{id:uid(102),nombre:'Finca segura',ubicacion_id:uid(101),hectareas:'10',activa:true}],gan_lotes:[{id:uid(103),nombre:'Lote seguro',finca_id:uid(102),activo:true}],gan_potreros:[{id:uid(104),nombre:'Potrero seguro',finca_id:uid(102),lote_id:uid(103),etapa:'ceba',activo:true}],gan_inventario:[{id:uid(105),potrero_id:uid(104),novillos:4,toros:1,updated_at:'2034-05-08T10:00:00Z'}],gan_pesos_historico:[{id:uid(106),potrero_id:uid(104),fecha:'2034-05-07',peso_promedio_kg:'250.5'}],gan_movimientos:[],
 empleados:[{id:uid(201),nombre:'Ana Sintetica',cargo:'campo',salario:2000,tipo_contrato:'synthetic',activo:true}],
};}
async function actual(family:Family,channel:Channel,options:{mixed?:boolean;fail?:boolean;terminal?:boolean;args?:Row;question?:string;previous?:string}={}){
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(now);vi.spyOn(console,'log').mockImplementation(()=>{});vi.spyOn(console,'error').mockImplementation(()=>{});
 const bodies:Row[]=[],reads:URL[]=[],events:unknown[]=[],rejected:string[]=[];
 const inherited=vi.fn(async()=>{throw Error('Inherited network forbidden');});vi.stubGlobal('fetch',inherited);
 const env:Record<string,string>={SUPABASE_URL:DB,SUPABASE_SERVICE_ROLE_KEY:'synthetic-db-key',OPENROUTER_API_KEY:'synthetic-model-key'};
 vi.stubGlobal('Deno',{env:{get:(key:string)=>{if(!(key in env)){rejected.push('environment');throw Error('Unlisted environment key');}return env[key];}}});
 const db=fixtures();
 vi.stubGlobal('fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
  const request=new Request(input,init),url=new URL(request.url);
  if(request.url===MODEL&&request.method==='POST'){
   expect(request.headers.get('Authorization')).toBe('Bearer synthetic-model-key');bodies.push(JSON.parse(await request.text()));
   if(bodies.length>1){rejected.push('second-factual-generation');throw Error('Second factual generation forbidden');}
   if(options.terminal)return Response.json({choices:[{message:{role:'assistant',content:FALSE}}]});
   if(family==='memory')return Response.json({choices:[{message:{role:'assistant',content:'Solicitud de memoria sintética recibida.'}}]});
   const args=options.args??(family==='crop'?{year:2034}:family==='individual'?{worker_name:'Ana Sintetica'}:family==='capability'?{domain:'capability',state:'get_inventario_conciliacion'}:{});
   const calls=[{id:'typed-source',type:'function',function:{name:tools[family],arguments:JSON.stringify(args)}}];
   if(options.mixed)calls.push({id:'excluded-source',type:'function',function:{name:'get_inventario_conciliacion',arguments:'{}'}});
   return Response.json({choices:[{message:{role:'assistant',content:FALSE,tool_calls:calls}}]});
  }
  if(url.origin!==DB||request.method!=='GET'||url.hash){rejected.push('route');throw Error('Closed synthetic route');}
  expect(request.headers.get('Authorization')).toBe('Bearer synthetic-db-key');expect(request.headers.get('Prefer')).toBe('count=exact');
  const table=url.pathname.replace('/rest/v1/','');if(!Object.prototype.hasOwnProperty.call(db,table)){rejected.push('table:'+table);throw Error('Unlisted synthetic table');}
  reads.push(url);
  const select=url.searchParams.get('select')??'';expect(select).not.toMatch(/\*|observacion|responsable|monitor,|notas|factura|contratista/);
  if(family!=='individual')expect(select).not.toMatch(/empleado|salario|proveedor|cliente/);
  if(options.fail&&table==='compras')return Response.json({code:'PGRST002',message:SECRET},{status:503});
  let rows=db[table];
  for(const [key,filter]of url.searchParams){
   if(['select','order','limit','offset'].includes(key))continue;
   const dot=filter.indexOf('.'),op=filter.slice(0,dot),v=filter.slice(dot+1);
   if(!['eq','gte','lte','lt','in','ilike'].includes(op)){rejected.push('filter:'+key);throw Error('Unlisted synthetic filter');}
   rows=rows.filter(r=>op==='eq'?String(r[key])===v:op==='gte'?r[key]!=null&&String(r[key])>=v:op==='lte'?r[key]!=null&&String(r[key])<=v:op==='lt'?r[key]!=null&&String(r[key])<v:op==='in'?v.slice(1,-1).split(',').map(s=>s.replace(/"/g,'')).includes(String(r[key])):String(r[key]).toLowerCase()===v.replace(/^\*|\*$/g,'').toLowerCase());
  }
  const total=rows.length,offset=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit')??200);
  const page=rows.slice(offset,offset+limit).map(r=>({...r,observaciones:SECRET,empleado:{nombre:SECRET,salario:987654321}}));
  return Response.json(page,{headers:{'content-range':page.length?`${offset}-${offset+page.length-1}/${total}`:`*/${total}`}});
 });
 const question=options.question??questions[family];
 // These intentionally contaminated Web/Telegram-shaped builder inputs test the shared
 // boundary; they do not execute the production channel handlers or Telegram Auth.
 const messages=mensajesDesdeHistorial([{role:'user',content:options.previous??SECRET+' old user'},{role:'assistant',content:SECRET+' old assistant',herramientas:[{tool:'get_employee_activity',args:{worker_name:SECRET},result_summary:SECRET}]},{role:'user',content:question}],SECRET+' old memory',channel).map((m,i)=>({...m,...(m.role==='user'?{id:'user-'+i,created_at:'2034-05-08T11:00:00.000Z'}:{})}));
 const modulePath='../supabase/functions/server/chat.tsx';const {llmToolLoop}=await import(modulePath) as {llmToolLoop:(m:unknown[],user:string,event:(e:unknown)=>void,context?:unknown,current?:{pregunta:string;messageId:string})=>Promise<{text:string;toolInteractions:Array<{tool:string;result_summary:string}>}>};
 const current=messages.at(-1)!;
 const result=await llmToolLoop(messages,'synthetic-user',e=>events.push(e),undefined,{pregunta:question,messageId:current.id!});
 expect(rejected).toEqual([]);expect(inherited).not.toHaveBeenCalled();expect(bodies).toHaveLength(1);
 expect(JSON.stringify([bodies,result,events]).includes(SECRET)).toBe(false);expect(JSON.stringify([bodies,result,events])).not.toMatch(/987654321|INVENTED_PROSE_9000000/);
 return {result,bodies,reads};
}
function catalogue(body:Row):string[]{return (body.tools as Array<{function:{name:string}}>).map(t=>t.function.name).sort();}
function facts(result:Awaited<ReturnType<typeof actual>>['result']):Array<{metric:string;value:{kind:string;value?:string}}>{return result.toolInteractions.flatMap(h=>{const c=JSON.parse(h.result_summary);return c.evidence?.facts??[];});}
it.each(['Web','Telegram'] as const)('keeps useful recorded purchases and excludes unrequested supplier data on %s',async channel=>{
 const r=await actual('commerce',channel);expect(catalogue(r.bodies[0])).toEqual([...bounded].sort());
 expect(facts(r.result)).toEqual(expect.arrayContaining([expect.objectContaining({metric:'purchase.cost',value:{kind:'decimal',value:'30.3',unit:'COP'}}),expect.objectContaining({metric:'purchase.quantity',value:{kind:'decimal',value:'4',unit:'Kilos'}})]));
 expect(r.result.text).toContain('30.3');expect(r.reads.some(u=>u.pathname.endsWith('/compras'))).toBe(true);
});
it.each(['Web','Telegram'] as const)('keeps a useful annual crop population on %s',async channel=>{
 const r=await actual('crop',channel);expect(facts(r.result).some(f=>f.metric==='production.kg'&&f.value.value==='120.3')).toBe(true);expect(r.result.text).toContain('120.3');
});
it.each(['Web','Telegram'] as const)('keeps known conductivity while preserving null pH on %s',async channel=>{
 const r=await actual('operations',channel);
 expect(r.result.text).toMatch(/\| `Norte`[^\n]*`Media de registros de conductividad lote-fecha`[^\n]*1\.25/);
 expect(r.result.text).not.toMatch(/\| `Norte`[^\n]*`Media de pH registrado`/);
 expect(r.result.text).toContain('Datos no verificables: `Media de pH registrado`');
 for(const h of r.result.toolInteractions){const context=JSON.parse(h.result_summary);if(context.state==='validated')expect(context.evidence.facts.some((f:{metric:string;value:{kind:string}})=>f.metric==='conductivity.ph_mean'&&f.value.kind==='unknown')).toBe(true);
  else expect(context).toEqual({state:'unavailable',code:'budget_exceeded',essentialFactsUnavailable:true,omittedDetail:true});}
 // Explicit budget refusal is valid persistence, not permission to copy raw rows.
 // Even this small source can need a new read because month/lot views repeat facts.
});
it.each(['Web','Telegram'] as const)('keeps recorded cattle heads and compatible density on %s',async channel=>{
 const r=await actual('cattle',channel);const fs=facts(r.result);expect(fs.some(f=>f.metric==='ganado.stock.heads'&&f.value.value==='5')).toBe(true);expect(fs.some(f=>f.metric==='ganado.density'&&f.value.value==='0.5')).toBe(true);
});
it.each(['Web','Telegram'] as const)('preserves the covered part of a mixed excluded request on %s',async channel=>{
 const r=await actual('commerce',channel,{mixed:true});expect(r.result.text).toContain('30.3');expect(r.result.text).toContain('conciliación de conteos físicos no está incluida');expect(r.reads.every(u=>!u.pathname.includes('verificacion'))).toBe(true);
});
it.each(['Web','Telegram'] as const)('returns a bounded source-failure fallback without another factual generation on %s',async channel=>{
 const r=await actual('commerce',channel,{fail:true});expect(r.result.text).not.toContain('30.3');expect(r.result.text.trim().length).toBeGreaterThan(0);expect(r.reads.some(u=>u.pathname.endsWith('/compras'))).toBe(true);
});
it.each(['Web','Telegram'] as const)('serves fixed capability metadata with zero data I/O on %s',async channel=>{
 const r=await actual('capability',channel);expect(r.reads).toEqual([]);expect(r.result.text).toContain('conciliación de conteos físicos no está incluida');
});
it('offers only the three unchanged own-memory tools in a memory request',async()=>{
 const r=await actual('memory','Web');expect(catalogue(r.bodies[0])).toEqual(['commit_memory_save','forget_memory','propose_memory_save']);expect(r.reads).toEqual([]);
});
it('offers the individual tool only after the current named purpose is bound',async()=>{
 const r=await actual('individual','Telegram');expect(catalogue(r.bodies[0])).toEqual([...bounded,'get_employee_activity'].sort());expect(r.result.text).toContain('2000');expect(r.reads.every(u=>u.pathname.endsWith('/empleados'))).toBe(true);
});
it.each(['¿Y el promedio?','¿Y el promedio del 2034-05-01 al 2034-05-07?'])('clarifies an unresolved prior lot reference before source reads: %s',async question=>{
 const r=await actual('operations','Web',{question,previous:'Conductividad del lote Norte del 2034-05-01 al 2034-05-07'});expect(r.reads).toEqual([]);expect(r.result.text).toMatch(/precisa|inequívoc|aclar/i);
});

it.each([
 ['Compras totales del 2034-05-01 al 2034-05-07. Ejemplo anterior: se hablaba de proveedores.','supplier'],
 ['Despachos totales. El ejemplo anterior mencionaba clientes.','client'],
] as const)('does not promote historical explanatory mentions into current counterparty purpose: %s',(question,kind)=>{
 const ctx=crearContextoNucleo({question,now});expect(ctx.identities[kind]).toBe(false);expect(ctx.identityLabels?.[kind]).toBe(false);
});
it('keeps requested purchase totals useful without reading supplier names from a historical explanatory clause',async()=>{
 const r=await actual('commerce','Web',{question:'Compras totales del 2034-05-01 al 2034-05-07. Ejemplo anterior: se hablaba de proveedores.'});
 for(const u of r.reads)expect(u.searchParams.get('select')).not.toMatch(/proveedor|cliente/);
 expect(r.result.text).toContain('30.3');
});

it.each(['Web','Telegram'] as const)('does not turn terminal model prose without source calls into facts on %s',async channel=>{
 const r=await actual('commerce',channel,{terminal:true});expect(r.reads).toEqual([]);expect(r.result.text.trim().length).toBeGreaterThan(0);expect(r.result.text).not.toContain('30.3');
});
it('restarts from a current explicit fresh lot without retaining the prior lot',async()=>{
 const r=await actual('operations','Web',{question:'¿Y conductividad del lote Sur del 2034-05-01 al 2034-05-07?',previous:'Conductividad del lote Norte del 2034-05-01 al 2034-05-07',args:{lote_name:'Sur'}});
 const source=r.reads.filter(u=>u.pathname.endsWith('/mon_conductividad'));expect(source.length).toBe(1);expect(source[0].searchParams.get('lote_id')).toBe('eq.'+uid(22));
 expect(r.result.text).toContain('3.5');expect(r.result.text).not.toContain('Norte');
});
