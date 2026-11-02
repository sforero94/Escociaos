import {afterEach,describe,expect,it,vi} from 'vitest';
import {mensajesDesdeHistorial} from '../utils/escoEvals/mensajes';
import {aclaracionPlanAplicacion,argumentosRespuestaAplicacion,ejecutarConsultaEsco,planRespuestaAplicacion,resolverSeleccionAplicacion,respuestaDeterministaAplicacion,type FilaEsco} from '../utils/escoConsultas';
const question='Consulta de solo lectura: En la aplicación contra plaga Q de mayo de 2033, ¿qué productos se usaron en el lote Río Claro y en qué cantidades?';
const target={id:'app-may',nombre_aplicacion:'Fumigación control plaga Q mayo',estado:'En ejecución',fecha_inicio_ejecucion:'2033-05-02'};
const other={...target,id:'app-april',nombre_aplicacion:'Fumigación control plaga Q abril',fecha_inicio_ejecucion:'2033-04-02'};
const lots=[{id:'lot-rio',nombre:'Río Claro'},{id:'lot-sur',nombre:'Sur'}];
const amounts=[2.25,7,0.5,11];
function fixture(extraApps:FilaEsco[]=[],extraLots:FilaEsco[]=[],partial=false){
 const products=amounts.map((_,i)=>({id:'p'+i,nombre:'Producto sintético '+i,unidad_medida:i%2?'kg':'L'}));
 const rows:Record<string,FilaEsco[]>={aplicaciones:[target,other,...extraApps],lotes:[...lots,...extraLots],productos:products,
  movimientos_diarios:[{id:'rio',aplicacion_id:target.id,lote_id:'lot-rio',fecha_movimiento:'2033-05-10'},{id:'sur',aplicacion_id:target.id,lote_id:'lot-sur',fecha_movimiento:'2033-05-10'}],
  movimientos_diarios_productos:products.flatMap((p,i)=>[{id:'c'+i,movimiento_diario_id:'rio',producto_id:p.id,producto_nombre:p.nombre,cantidad_utilizada:partial&&i===0?null:amounts[i],unidad:p.unidad_medida},{id:'wrong'+i,movimiento_diario_id:'sur',producto_id:p.id,producto_nombre:p.nombre,cantidad_utilizada:999,unidad:p.unidad_medida}]),
  aplicaciones_lotes:[],aplicaciones_calculos:[],aplicaciones_mezclas:[],aplicaciones_productos:[],registros_trabajo:[]};
 return async(table:string,query:string)=>{
  if(!(table in rows))throw new Error('Unexpected synthetic table');const p=new URLSearchParams(query);let r=rows[table];
  for(const[k,v]of p){if(['select','order','offset','limit'].includes(k))continue;const n=v.indexOf('.'),op=v.slice(0,n),value=v.slice(n+1);r=r.filter(x=>op==='eq'?String(x[k])===value:op==='in'?value.slice(1,-1).split(',').map(z=>z.replace(/"/g,'')).includes(String(x[k])):op==='gte'?x[k]!=null&&String(x[k])>=value:op==='lte'?x[k]!=null&&String(x[k])<=value:false);}
  return r.slice(Number(p.get('offset')??0),Number(p.get('offset')??0)+Number(p.get('limit')??200));
 };
}
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
describe('fronted application product/quantity question',()=>{
 it.each([question,question.replace('Consulta de solo lectura: ',''),question.replace(',',''),question.replace('se usaron','se utilizaron'),question.replace('qué productos','cuáles insumos'),question.replace(' y en qué cantidades','')])('binds the same existing consumption operation: %s',q=>{
  expect(planRespuestaAplicacion(q,'2033-06-01')).toMatchObject({tipo:'aplicacion',plural:false,base:'actual',rango:{desde:'2033-05-01',hasta:'2033-05-31'},loteSolicitado:true,consumos:true,estimacion:false});
 });
 it('preserves canonical application/lot identity instead of wrong model selectors',async()=>{
  const plan=planRespuestaAplicacion(question,'2033-06-01'),args=argumentosRespuestaAplicacion(plan,{application_id:other.id,lote_name:'Sur',date_from:'2030-01-01',date_to:'2030-01-31'});
  const result=await ejecutarConsultaEsco('get_aplicaciones_ejecucion',args,fixture(),'2033-06-01',{pregunta:question});
  expect(result.seleccion).toMatchObject({estado:'verificada',aplicacion_ids:[target.id],lote_ids:['lot-rio']});
  const answer=respuestaDeterministaAplicacion(plan,JSON.stringify(result),args);expect(answer.tipo).toBe('texto');
  if(answer.tipo==='texto'){for(let i=0;i<4;i++)expect(answer.texto).toContain(`| Producto sintético ${i} (p${i}) | ${i%2?'kg':'L'} | ${amounts[i]} |`);expect(answer.texto).not.toContain('999');}
 });
 it('keeps missing quantity coverage visible rather than replacing it with zero',async()=>{
  const plan=planRespuestaAplicacion(question,'2033-06-01'),args=argumentosRespuestaAplicacion(plan,{});
  const result=await ejecutarConsultaEsco('get_aplicaciones_ejecucion',args,fixture([],[],true),'2033-06-01',{pregunta:question});
  const answer=respuestaDeterministaAplicacion(plan,JSON.stringify(result),args);if(answer.tipo!=='texto')throw new Error('Expected covered answer');
  expect(answer.texto).toContain('Cobertura de consumo incompleta');expect(answer.texto).toContain('| Producto sintético 0 (p0) | L | no verificable |');expect(answer.texto).not.toContain('| L | 0 |');
 });
 it('preserves genuinely ambiguous names, duplicate lots, unknown lots and conflicting user IDs',()=>{
  expect(resolverSeleccionAplicacion({pregunta:question},[target,{...target,id:'duplicate'}],lots,false)).toMatchObject({estado:'aclarar'});
  expect(resolverSeleccionAplicacion({pregunta:question},[target], [...lots,{id:'duplicate-lot',nombre:'Rio Claro'}],false)).toMatchObject({estado:'aclarar'});
  expect(resolverSeleccionAplicacion({pregunta:question.replace('Río Claro','Desconocido')},[target],lots,false)).toMatchObject({estado:'aclarar'});
  expect(resolverSeleccionAplicacion({pregunta:question.replace('plaga Q','plaga Q ID app-april')},[target,other],lots,false)).toMatchObject({estado:'aclarar'});
 });
 it('uses only an unambiguous prior user selector after a fronted request',()=>{
  const follow='¿Cuántos jornales llevamos en esa aplicación?';
  expect(resolverSeleccionAplicacion({pregunta:follow,anterior:question},[target,other],lots,false)).toMatchObject({estado:'verificada',aplicacion_ids:[target.id],referencia:'usuario_anterior'});
  expect(resolverSeleccionAplicacion({pregunta:follow,anterior:question},[target,{...target,id:'duplicate'}],lots,false)).toMatchObject({estado:'aclarar'});
  expect(resolverSeleccionAplicacion({pregunta:follow},[target,other],lots,false)).toMatchObject({estado:'aclarar'});
 });
 it.each([
  question.replace('y en qué cantidades','y por qué funcionó'),
  question.replace('y en qué cantidades','y cuál es el clima'),
  question.replace('y en qué cantidades','y compara consumo real con dosis planeadas'),
  question.replace('mayo de 2033','mayo de 2033 y junio de 2033'),
  question.replace('mayo de 2033','del 20/05/2033 al 10/05/2033'),
  question+' ¿Cuánto se vendió?',
  question.replace(',','').replace('y en qué cantidades','y por qué funcionó'),
  question.replace(',','').replace('y en qué cantidades','y cuál es el clima'),
 ])('clarifies unsupported extra scope without widening: %s',q=>expect(aclaracionPlanAplicacion(planRespuestaAplicacion(q,'2033-06-01'))).toBeTruthy());
 it('does not capture software questions or unrelated labor',()=>{
  expect(planRespuestaAplicacion('En la aplicación de software, ¿qué productos se usaron?','2033-06-01')).toMatchObject({tipo:'fuera',motivo:'otro_dominio'});
  expect(planRespuestaAplicacion('¿Cuántos jornales hubo por lote la semana pasada?','2033-06-01')).toMatchObject({tipo:'fuera',motivo:'otro_dominio'});
 });
 it.each(['Web','Telegram'] as const)('actual shared loop renders source product quantities on %s without a second model answer',async channel=>{
  const path='../supabase/functions/server/chat.tsx';const {llmToolLoop}=await import(path);let model=0;const read=fixture();
  vi.stubGlobal('Deno',{env:{get:(k:string)=>k==='SUPABASE_URL'?'https://consumption.test':'synthetic-key'}});
  vi.stubGlobal('fetch',async(input:string,init?:RequestInit)=>{
   const u=new URL(input);
   if(input==='https://openrouter.ai/api/v1/chat/completions' && init?.method==='POST'){
    if(++model>1)throw new Error('Unexpected extra model round');return Response.json({choices:[{message:{role:'assistant',content:null,tool_calls:[{id:'call',type:'function',function:{name:'get_aplicaciones_ejecucion',arguments:JSON.stringify({application_id:other.id,lote_name:'Sur',date_basis:'actual',date_from:'2030-01-01',date_to:'2030-01-31'})}}]}}]});
   }
   if(u.origin!=='https://consumption.test'||(init?.method??'GET')!=='GET')throw new Error('Unmatched synthetic network');
   const rows=await read(u.pathname.split('/').at(-1)!,u.search.slice(1));return new Response(JSON.stringify(rows),{headers:{'content-range':rows.length?`0-${rows.length-1}/${rows.length}`:'*/0'}});
  });
  const result=await llmToolLoop(mensajesDesdeHistorial([{role:'user',content:question}], 'Synthetic system prompt', channel),'synthetic-user');expect(model).toBe(1);expect(result.toolInteractions).toHaveLength(1);
  for(let i=0;i<4;i++)expect(result.text).toContain(`| Producto sintético ${i} (p${i}) | ${i%2?'kg':'L'} | ${amounts[i]} |`);
  expect(result.text).not.toContain('999');expect(result.toolInteractions[0].args).toMatchObject({application_id:target.id,lote_name:'Río Claro',date_from:'2033-05-01',date_to:'2033-05-31'});
 });
});
