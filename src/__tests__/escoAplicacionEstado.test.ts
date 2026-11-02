// Synthetic recorded facts and mocked generation only; no farm records or model calls.
import {afterEach,describe,expect,it,vi} from 'vitest';
import {aclaracionPlanAplicacion,argumentosRespuestaAplicacion,planRespuestaAplicacion,resolverSeleccionAplicacion,respuestaDeterministaAplicacion,type FilaEsco} from '../utils/escoConsultas';
import {hechosEjecucionAplicacion} from '../utils/escoAplicacionHechos';
import {mensajesDesdeHistorial} from '../utils/escoEvals/mensajes';
const today='2034-05-02';
const question='Consulta de solo lectura: ¿Sigue abierta la aplicación Fertilización mes de abril?';
const app={id:'status-app',nombre_aplicacion:'Fertilización mes de abril',tipo_aplicacion:'Fertilizacion',estado:'Cerrada',fecha_inicio_ejecucion:'2034-04-02',fecha_fin_ejecucion:'2034-04-20',tarea_id:null};
const falseProse='Se usaron 188 kg del Producto sintético A. La labor terminó satisfactoriamente.';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
function database(state=app.estado){
 const rows:Record<string,FilaEsco[]>={aplicaciones:[{...app,estado:state}],productos:[{id:'product-a',nombre:'Producto sintético A',unidad_medida:'kg'}],lotes:[{id:'lot-a',nombre:'Lote sintético'}],
 movimientos_diarios:[{id:'movement-a',aplicacion_id:app.id,lote_id:'lot-a',fecha_movimiento:'2034-04-03',numero_bultos:7}],
 movimientos_diarios_productos:[{id:'consumption-a',movimiento_diario_id:'movement-a',producto_id:'product-a',producto_nombre:'Producto sintético A',cantidad_utilizada:'189',unidad:'kg'}],
 aplicaciones_mezclas:[{id:'mix-a',aplicacion_id:app.id,nombre_mezcla:'Plan sintético',aplicaciones_productos:[{producto:{nombre:'Producto sintético A'},dosis_por_caneca:'2',cantidad_total_necesaria:'188.52',unidad_dosis:'kg'}]}],
 aplicaciones_productos:[{id:'plan-a',mezcla_id:'mix-a',producto_id:'product-a',producto_nombre:'Producto sintético A',cantidad_total_necesaria:'188.52',unidad_dosis:'kg',dosis_por_caneca:'2'}],
 aplicaciones_lotes:[],aplicaciones_lotes_planificado:[],aplicaciones_calculos:[],registros_trabajo:[]};
 return async(table:string,query:string)=>{
  if(!Object.prototype.hasOwnProperty.call(rows,table))throw Error('Unexpected synthetic table');let out=rows[table];const p=new URLSearchParams(query);
  for(const[k,v]of p){if(['select','order','offset','limit'].includes(k))continue;const i=v.indexOf('.'),op=v.slice(0,i),value=v.slice(i+1);
   out=out.filter(x=>op==='eq'?String(x[k])===value:op==='in'?value.slice(1,-1).split(',').map(y=>y.replace(/"/g,'')).includes(String(x[k])):op==='gte'?x[k]!=null&&String(x[k])>=value:op==='lte'?x[k]!=null&&String(x[k])<=value:false);}
  return out.slice(Number(p.get('offset')??0),Number(p.get('offset')??0)+Number(p.get('limit')??200));
 };
}
async function loopProbe(channel:'Web'|'Telegram',discovery=false,state=app.estado,wrongType=false){
 const modulePath='../supabase/functions/server/chat.tsx';const {llmToolLoop}=await import(modulePath) as {llmToolLoop:(messages:unknown[],user:string)=>Promise<{text:string;toolInteractions:{tool:string;args:FilaEsco;result_summary:string}[]}>};const read=database(state);let model=0;const observed:Record<string,unknown>[]=[];
 vi.stubGlobal('Deno',{env:{get:(key:string)=>key==='SUPABASE_URL'?'https://status-fixture.invalid':'synthetic-key'}});
 vi.stubGlobal('fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
  const req=new Request(input,init),url=new URL(req.url);
  if(req.url==='https://openrouter.ai/api/v1/chat/completions'&&req.method==='POST'){
   const n=++model;const body=JSON.parse(await req.text()) as Record<string,unknown>;observed.push(body);
   const calls:Array<{name:string;args:FilaEsco}>=[{name:'get_aplicaciones_ejecucion',args:{application_name:app.nombre_aplicacion,estado:'En ejecución',date_basis:'actual',date_from:'2034-04-01',date_to:'2034-04-30'}},
    {name:'get_aplicaciones_ejecucion',args:{application_name:'Fertilización abril',date_basis:'actual'}},
    {name:'get_application_summary',args:{type:'Fertilizacion',date_from:'2034-04-01',date_to:'2034-04-30'}}];
   if(wrongType)calls[0]={name:'get_application_summary',args:{type:'Fumigacion',date_basis:'actual'}};
   const chosen=discovery?(n===1?calls[2]:calls[0]):calls[n-1];
   if(n===4)return Response.json({choices:[{message:{role:'assistant',content:falseProse}}]});
   if(!chosen)throw Error('Unexpected mocked model round');
   return Response.json({choices:[{message:{role:'assistant',content:null,tool_calls:[{id:'call-'+n,type:'function',function:{name:chosen.name,arguments:JSON.stringify(chosen.args)}}]}}]});
  }
  if(url.origin!=='https://status-fixture.invalid'||req.method!=='GET'||!url.pathname.startsWith('/rest/v1/'))throw Error('Closed synthetic transport');
  const rows=await read(url.pathname.split('/').at(-1)!,url.search.slice(1));return Response.json(rows,{headers:{'content-range':rows.length?`0-${rows.length-1}/${rows.length}`:'*/0'}});
 });
 const result=await llmToolLoop(mensajesDesdeHistorial([{role:'user',content:question}], 'Synthetic system prompt',channel),'synthetic-user');
 return {model,result,observed};
}
function expectRegisteredStatus(result:Awaited<ReturnType<typeof loopProbe>>['result'],state:string){
 const row=result.text.split('\n').find(line=>line.includes('`Estado registrado`'));
 expect(row,'one rendered status fact, not a zero-record replacement').toBeDefined();
 expect(row).toContain(app.nombre_aplicacion);
 expect(row).toContain(state==='Calculada'?'Calculada (Planificada en la interfaz)':'`'+state+'`');
 const contexts=result.toolInteractions.map(h=>JSON.parse(h.result_summary) as {state?:string;evidence?:{facts?:Array<{metric:string;entities:Array<{id:string}>;value:{kind:string;value?:string};source:{tool:string}}>}});
 const facts=contexts.flatMap(c=>c.evidence?.facts??[]);
 expect(facts.some(f=>f.metric==='application.count'&&f.value.value==='0')).toBe(false);
 const statuses=facts.filter(f=>f.metric==='application.status');
 expect(statuses).toHaveLength(1);expect(statuses[0]).toMatchObject({entities:[{kind:'application',id:app.id}],value:{kind:'status',value:state},source:{tool:'get_aplicaciones_ejecucion'}});
 expect(result.text).not.toContain(falseProse);expect(result.text).not.toContain('satisfactoriamente');
 expect(result.text).toContain('No acreditan por sí solos');
}
describe('registered application status versus planned consumption',()=>{
 it.each([question,question.replace('Consulta de solo lectura: ',''),question.replace('Sigue abierta','Está abierta'),question.replace('Sigue abierta','Continúa en ejecución'),question.replace('Sigue abierta','Permanece cerrada'),question.replace('Sigue abierta','Está activa')])('recognizes status without filtering away a closed application: %s',q=>{
  const p=planRespuestaAplicacion(q,today);expect(p).toMatchObject({tipo:'aplicacion',estado:true,consumos:false,trabajo:false,base:'actual',rango:null,estadoFiltro:null});
  expect(argumentosRespuestaAplicacion(p,{estado:'En ejecución',date_from:'2034-04-01',date_to:'2034-04-30'})).toEqual({date_basis:'actual',alcance:'actual'});
  expect(aclaracionPlanAplicacion(p)).toBeNull();
 });
 it.each(['Web','Telegram'] as const)('answers closed status on %s without reaching three-query planned-data fallback',async channel=>{
  const r=await loopProbe(channel);expect(r.model).toBe(1);expectRegisteredStatus(r.result,'Cerrada');
  expect(r.result.toolInteractions).toHaveLength(1);expect(r.result.toolInteractions[0].args).not.toHaveProperty('estado');
  expect(r.result.text).not.toContain('188');expect(r.result.text).not.toContain('189');expect(r.result.text).not.toContain('satisfactoriamente');expect(r.result.text).toContain('No acreditan por sí solos');
 });
 it('does not let an unsolicited model type remove the canonically named application',async()=>{const r=await loopProbe('Web',false,'Cerrada',true);expect(r.result.text).toContain('`Estado registrado` | `Cerrada`');expect(r.result.text).not.toContain('0 `registro`');});
 it('resolves the summary alias through fresh execution facts, never planned consumption',async()=>{
  const r=await loopProbe('Web',true);expect(r.model).toBe(1);expect(r.result.toolInteractions.map(x=>x.tool)).toEqual(['get_application_summary']);
  expectRegisteredStatus(r.result,'Cerrada');expect(r.result.text).not.toContain('188.52');expect(r.result.text).not.toContain(falseProse);
 });
 it.each(['En ejecución','Calculada'])('reports the recorded %s state without inferring physical success',async state=>{const r=await loopProbe('Web',false,state);expect(r.model).toBe(1);expectRegisteredStatus(r.result,state);expect(r.result.text).not.toContain('satisfactoriamente');expect(r.result.text).not.toContain('188');});
 it('rejects a partial legacy plan summary as authoritative status/consumption evidence',()=>{const plan=planRespuestaAplicacion(question,today),args=argumentosRespuestaAplicacion(plan,{});const r=respuestaDeterministaAplicacion(plan,JSON.stringify({aplicaciones:[app],mezclas_productos:[{cantidad_total_necesaria:'188.52'}],_evidencia:{consulta_completa:false}}),args);expect(r).toMatchObject({tipo:'texto',texto:expect.stringContaining('No pude verificar')});expect(JSON.stringify(r)).not.toContain('188.52');});
 it('binds literal month identity against all fresh candidates, never a different month',()=>{const other={...app,id:'other-month',nombre_aplicacion:'Fertilización mes de mayo'};expect(resolverSeleccionAplicacion({pregunta:question},[app,other],[],false)).toMatchObject({estado:'verificada',aplicacion_ids:[app.id]});expect(resolverSeleccionAplicacion({pregunta:question},[other],[],false)).toMatchObject({estado:'aclarar'});expect(resolverSeleccionAplicacion({pregunta:'¿Sigue abierta esa aplicación?',anterior:question},[app,other],[],false)).toMatchObject({estado:'verificada',aplicacion_ids:[app.id],referencia:'usuario_anterior'});expect(resolverSeleccionAplicacion({pregunta:question.replace('abril?','abril ID other-month?')},[app,other],[],false)).toMatchObject({estado:'aclarar'});});
 it('retains genuine duplicate name and conflicting user identity ambiguity',()=>{
  expect(resolverSeleccionAplicacion({pregunta:question},[app,{...app,id:'duplicate'}],[],false)).toMatchObject({estado:'aclarar'});
  expect(resolverSeleccionAplicacion({pregunta:question.replace('mes de abril','mes de abril ID other-app')},[app,{...app,id:'other-app',nombre_aplicacion:'Otra aplicación'}],[],false)).toMatchObject({estado:'aclarar'});
 });
 it('keeps other domains and unsupported physical-quality requests outside status rendering',()=>{
  expect(planRespuestaAplicacion('¿Sigue abierta la aplicación de software?',today)).toMatchObject({tipo:'fuera',motivo:'otro_dominio'});
  expect(aclaracionPlanAplicacion(planRespuestaAplicacion(question.replace('abril?','abril y por qué funcionó?'),today))).toBeTruthy();
  expect(aclaracionPlanAplicacion(planRespuestaAplicacion('¿Sigue abierta la aplicación sintética en abril?',today))).toBeTruthy();
 });
 it('preserves exact near-integer recorded decimals; never floors or substitutes a nearby plan',()=>{
  const movements=[{id:'m',aplicacion_id:app.id,fecha_movimiento:'2034-04-03',lote_id:'lot-a',consumos:[
   {id:'c-a',producto_id:'p-a',producto_nombre:'Producto A',unidad:'kg',cantidad_utilizada:149.99999999999997},
   {id:'c-b',producto_id:'p-b',producto_nombre:'Producto B',unidad:'kg',cantidad_utilizada:'179.49'},
   {id:'c-c',producto_id:'p-b',producto_nombre:'Producto B',unidad:'kg',cantidad_utilizada:'0.51'}]}];
  const facts=hechosEjecucionAplicacion(movements,[],{aplicacionId:app.id,tareaId:null,tareaExclusiva:false,desde:null,hasta:null,loteIds:null,consultaCompleta:true,baseSeleccion:'actual'});
  expect(facts.consumos.productos.map(p=>p.cantidad_total)).toEqual(['149.99999999999997','180']);
  // A separately bound no-period literal identity for the existing renderer.
  const plan=planRespuestaAplicacion('Consumo de la aplicación sintética',today),args=argumentosRespuestaAplicacion(plan,{});
  const result={seleccion:{estado:'verificada',version:'aplicacion_selector_v1',aplicacion_ids:[app.id],lote_ids:null,referencia:'actual'},_evidencia:{herramienta:'get_aplicaciones_ejecucion',consulta_completa:true,detalle_completo:true,total_hechos:1,rango:{desde:null,hasta:null}},resumen:{date_basis:'actual'},detalle:[{...app,movimientos:movements,registros_trabajo:[],hechos_ejecucion:facts,productos_planeados:[{cantidad_total_necesaria:'148.52'}]}]};
  const rendered=respuestaDeterministaAplicacion(plan,JSON.stringify(result),args);expect(rendered.tipo).toBe('texto');
  if(rendered.tipo==='texto'){expect(rendered.texto).toContain('| kg | 149.99999999999997 |');expect(rendered.texto).toContain('| kg | 180 |');expect(rendered.texto).not.toContain('148.52');expect(rendered.texto).not.toContain('satisfactoriamente');}
 });
});
