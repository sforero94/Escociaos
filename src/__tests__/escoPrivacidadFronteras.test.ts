// Independent synthetic boundary regressions: every request terminates here.
import {afterEach,expect,it,vi} from 'vitest';
const DB='https://boundary-fixture.invalid';
const MODEL='https://openrouter.ai/api/v1/chat/completions';
const PRIVATE='SYN_OLD_PRIVATE_MEMORY';
const historyTask='SYN_UNREQUESTED_TASK';
type Row=Record<string,unknown>;
type Mode='memory'|'forget'|'births'|'inventory'|'inventoryExclude'|'lotDiscovery'|'laborMissing'|'activity'|'salary';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
async function run(mode:Mode){
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2034-05-08T17:00:00Z'));
 vi.spyOn(console,'log').mockImplementation(()=>undefined);vi.spyOn(console,'error').mockImplementation(()=>undefined);
 const bodies:Row[]=[],reads:URL[]=[],rejected:string[]=[];
 const inherited=vi.fn(async()=>{throw Error('Inherited transport forbidden');});vi.stubGlobal('fetch',inherited);
 const env:Record<string,string>={SUPABASE_URL:DB,SUPABASE_SERVICE_ROLE_KEY:'synthetic-db-key',OPENROUTER_API_KEY:'synthetic-model-key'};
 vi.stubGlobal('Deno',{env:{get:(key:string)=>{if(!(key in env))throw Error('Unknown synthetic environment key');return env[key];}}});
 vi.stubGlobal('fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
  const request=new Request(input,init),url=new URL(request.url);
  if(request.url===MODEL&&request.method==='POST'){
   bodies.push(JSON.parse(await request.text()));if(bodies.length>3)throw Error('Synthetic round budget');
   if(mode==='memory'||mode==='forget'&&bodies.length>1)return Response.json({choices:[{message:{role:'assistant',content:'Solicitud de memoria sintética recibida.'}}]});
   const name=mode==='laborMissing'?'get_labor_summary':mode==='lotDiscovery'?(bodies.length===1?'get_lot_info':'get_aplicaciones_ejecucion'):mode==='births'?'get_hato_partos':mode==='forget'?'forget_memory':['inventory','inventoryExclude'].includes(mode)?'get_inventory_status':'get_employee_activity';
   const args=mode==='laborMissing'?{date_from:'2034-05-01',date_to:'2034-05-07'}:mode==='lotDiscovery'?(bodies.length===1?{lote_name:'Lote sintético'}:{application_name:'Fertilización mes de abril',estado:'En ejecución'}):mode==='births'?{date_from:'1999-01-01',date_to:'1999-01-07'}:mode==='forget'?{match_text:'formato'}:['inventory','inventoryExclude'].includes(mode)?{product_name:'Producto Azul'}:mode==='activity'?{worker_name:'Ana Sintetica',date_from:'1999-01-01',date_to:'1999-01-07'}:{worker_name:'Ana Sintetica'};
   return Response.json({choices:[{message:{role:'assistant',content:null,tool_calls:[{id:'synthetic-call',type:'function',function:{name,arguments:JSON.stringify(args)}}]}}]});
  }
  if(mode==='forget'&&url.origin===DB&&url.pathname==='/rest/v1/esco_memorias'&&request.method==='PATCH'&&url.searchParams.get('id')==='in.(memory-id)'){expect(await request.json()).toEqual({archived_at:'2034-05-08T17:00:00.000Z'});return new Response(null,{status:204});}
  if(url.origin!==DB||request.method!=='GET'||url.hash){rejected.push('unknown-route');throw Error('Closed synthetic route');}
  reads.push(url);let rows:Row[];
  if(mode==='laborMissing'&&url.pathname==='/rest/v1/lotes')rows=[{id:'north',nombre:'Norte'},{id:'south',nombre:'Sur'}];
  else if(mode==='laborMissing'&&url.pathname==='/rest/v1/registros_trabajo')rows=[{id:'south-work',fecha_trabajo:'2034-05-02',lote_id:'south',lote:{nombre:'Sur'},fraccion_jornal:1,costo_jornal:'80.25'}];
  else if(mode==='lotDiscovery'&&url.pathname==='/rest/v1/aplicaciones')rows=[{id:'app-april',nombre_aplicacion:'Fertilización mes de abril',tipo_aplicacion:'Fertilizacion',estado:'Cerrada',fecha_inicio_ejecucion:'2034-04-02',fecha_fin_ejecucion:'2034-04-20',fecha_inicio_planeada:'2034-04-01',fecha_fin_planeada:'2034-04-21',tarea_id:null}];
  else if(mode==='lotDiscovery'&&url.pathname==='/rest/v1/lotes')rows=[{id:'lot-a',nombre:'Lote sintético'}];
  else if(mode==='lotDiscovery'&&['movimientos_diarios','movimientos_diarios_productos','aplicaciones_lotes','aplicaciones_lotes_planificado','aplicaciones_calculos','aplicaciones_mezclas','aplicaciones_productos'].some(t=>url.pathname==='/rest/v1/'+t))rows=[];
  else if(mode==='births'&&['/rest/v1/hato_animales','/rest/v1/hato_eventos'].includes(url.pathname))rows=[];
  else if(mode==='forget'&&url.pathname==='/rest/v1/esco_memorias')rows=[{id:'memory-id',user_id:'synthetic-user',archived_at:null,content:'formato '+PRIVATE}];
  else if(url.pathname==='/rest/v1/productos')rows=[{id:'red',nombre:'Producto Rojo',activo:true,unidad_medida:'Kilos',cantidad_actual:5,stock_minimo:1},{id:'blue',nombre:'Producto Azul',activo:true,unidad_medida:'Kilos',cantidad_actual:7,stock_minimo:1}];
  else if(url.pathname==='/rest/v1/empleados')rows=[{id:'ana',nombre:'Ana Sintetica',salario:2000,cargo:'campo',tipo_contrato:'synthetic',activo:true}];
  else if(url.pathname==='/rest/v1/registros_trabajo')rows=[{fecha_trabajo:'2034-05-02',fraccion_jornal:1,costo_jornal:447,tarea:{nombre:historyTask},lote:{nombre:'Lote sintético'}}];
  else {rejected.push('unknown-table');throw Error('Closed synthetic table');}
  for(const [key,filter]of url.searchParams){
   if(['select','order','offset','limit'].includes(key))continue;
   const dot=filter.indexOf('.'),op=filter.slice(0,dot),value=filter.slice(dot+1);
   if(!['eq','gte','lte','ilike','is','in'].includes(op)){rejected.push('unknown-filter');throw Error('Closed synthetic filter');}
   rows=rows.filter(r=>op==='in'?value.slice(1,-1).split(',').map(x=>x.replace(/"/g,'')).includes(String(r[key])):op==='is'?value==='null'&&r[key]===null:op==='eq'?String(r[key])===value:op==='gte'?String(r[key])>=value:op==='lte'?String(r[key])<=value:value.startsWith('*')&&value.endsWith('*')?String(r[key]).toLowerCase().includes(value.slice(1,-1).toLowerCase()):String(r[key]).toLowerCase()===value.toLowerCase());
  }
  const total=rows.length,offset=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit')??200),page=rows.slice(offset,offset+limit);
  return Response.json(page,{headers:{'content-range':page.length?`${offset}-${offset+page.length-1}/${total}`:`*/${total}`}});
 });
 const question=mode==='laborMissing'?'Costo registrado del lote Norte del 2034-05-01 al 2034-05-07':mode==='inventoryExclude'?'Inventario general, sin Producto Azul':mode==='lotDiscovery'?'¿Sigue abierta la aplicación Fertilización mes de abril?':mode==='births'?'Partos registrados del 2034-05-01 al 2034-05-07':mode==='forget'?'olvida la memoria sobre formato':mode==='memory'?'recuerda que prefiero respuestas breves':mode==='inventory'?'Inventario del producto Producto Rojo':mode==='activity'?'Actividad del empleado Ana Sintetica del 2034-05-01 al 2034-05-07':'Salario del empleado Ana Sintetica';
 const modulePath='../supabase/functions/server/chat.tsx';
 const {llmToolLoop}=await import(modulePath) as {llmToolLoop:(messages:Array<{role:string;content:string}>,user:string)=>Promise<{text:string;toolInteractions:unknown[]}>};
 const result=await llmToolLoop([{role:'system',content:'Memorias previas: '+PRIVATE},{role:'user',content:question}],'synthetic-user');
 expect(rejected).toEqual([]);expect(inherited).not.toHaveBeenCalled();
 return {bodies,reads,result};
}
it('does not forward historical system memories even for an explicit memory operation',async()=>{
 const r=await run('memory');expect(r.bodies.length).toBeGreaterThan(0);expect(JSON.stringify(r.bodies).includes(PRIVATE)).toBe(false);
});
it('does not let model product arguments replace the current user selector',async()=>{
 const r=await run('inventory');expect(r.result.text).not.toContain('Producto Azul');
 // A supported unambiguous catalog selector remains useful, not blanket refusal.
 expect(r.result.text).toContain('Producto Rojo');expect(r.result.text).toMatch(/5/);
});
it('binds individual activity source reads to the actual user period',async()=>{
 const r=await run('activity'),reads=r.reads.filter(u=>u.pathname==='/rest/v1/registros_trabajo');expect(reads.length).toBeGreaterThan(0);
 for(const u of reads)expect(u.searchParams.getAll('fecha_trabajo')).toEqual(['gte.2034-05-01','lte.2034-05-07']);
 expect(JSON.stringify(r.result)).not.toContain('1999-01');
});
it('does not fetch or persist activity for a salary-only request',async()=>{
 const r=await run('salary');expect(r.reads.filter(u=>u.pathname==='/rest/v1/registros_trabajo')).toEqual([]);
 expect(JSON.stringify(r.result.toolInteractions)).not.toContain(historyTask);expect(JSON.stringify(r.result.toolInteractions)).not.toContain('447');expect(r.result.text).toContain('2000');
});

it('does not resend stored private memory excerpts when confirming a forget operation',async()=>{
 const r=await run('forget');expect(r.bodies.length).toBe(2);expect(JSON.stringify(r.bodies).includes(PRIVATE)).toBe(false);expect(JSON.stringify(r.result.toolInteractions).includes(PRIVATE)).toBe(false);
});

it('binds an approved legacy birth read to the actual user period',async()=>{
 const r=await run('births'),reads=r.reads.filter(u=>u.pathname==='/rest/v1/hato_eventos');expect(reads.length).toBeGreaterThan(0);
 for(const u of reads)expect(u.searchParams.getAll('fecha')).toEqual(['gte.2034-05-01','lte.2034-05-07']);expect(JSON.stringify(r.result)).not.toContain('1999-01');
});

it('does not reinterpret an expressly excluded inventory label as the requested selector',async()=>{
 const r=await run('inventoryExclude');expect(r.result.text).not.toMatch(/\|[^\n]*Producto Azul[^\n]*\|/);expect(r.result.text).toMatch(/no pude|Falta|precisa|aclara/i);
});
it('preserves one minimized lot-discovery round before a fresh application status read',async()=>{
 const r=await run('lotDiscovery');expect(r.bodies.length).toBe(2);expect(r.result.text).toMatch(/Estado registrado[^\n]*Cerrada/);expect(r.result.text).toContain('Fertilización mes de abril');
 expect(r.reads.some(u=>u.pathname==='/rest/v1/lotes')).toBe(true);expect(r.reads.some(u=>u.pathname==='/rest/v1/aplicaciones')).toBe(true);expect(JSON.stringify(r.bodies).includes(PRIVATE)).toBe(false);
});

it('does not replace a requested lot without observations by another observed lot when model omits its selector',async()=>{
 const r=await run('laborMissing');expect(r.result.text).not.toContain('Sur');expect(r.result.text).not.toContain('80.25');
 expect(r.result.text).toContain('`Norte`');expect(r.result.text).toContain('0 `COP`');
 const work=r.reads.filter(u=>u.pathname==='/rest/v1/registros_trabajo');expect(work.length).toBe(1);expect(work[0].searchParams.get('lote_id')).toBe('eq.north');
 expect(JSON.stringify(r.result.toolInteractions)).not.toContain('south-work');
});
