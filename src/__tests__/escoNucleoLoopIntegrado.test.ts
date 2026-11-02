import {afterEach,expect,it,vi} from 'vitest';
import {HERRAMIENTAS_NUCLEO} from '../utils/escoNucleoComun';
const instant=new Date('2034-05-08T12:00:00.000Z');
const questions:Record<string,string>={
 get_ganado_inventory:'Existencias y densidad de ganado por ubicación',
 get_ganado_movimientos_detalle:'Traslados de ganado del 2034-05-01 al 2034-05-07',
 get_produccion_calidad:'Kilos de exportación y nacional por lote en 2034',
 get_monitoring_data:'Incidencia y severidad por lote del 2034-05-01 al 2034-05-07',
 get_production_data:'Kilos y productividad agrícola de 2034',
 get_harvest_shipments:'Cosechas y despachos del 2034-05-01 al 2034-05-07',
 get_purchase_history:'Compras por producto del 2034-05-01 al 2034-05-07',
 get_inventory_movements:'Entradas, salidas y ajustes del 2034-05-01 al 2034-05-07',
 get_tareas:'Tareas programadas del 2034-05-01 al 2034-05-07',
 get_radiation_context:'Radiación del 2034-05-01 al 2034-05-07',
 get_conductivity_data:'Conductividad por lote del 2034-05-01 al 2034-05-07',
};
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
it.each(HERRAMIENTAS_NUCLEO)('actual shared loop routes %s through minimized registered evidence, never legacy generation',async tool=>{
 vi.useFakeTimers();vi.setSystemTime(instant);vi.spyOn(console,'log').mockImplementation(()=>{});
 const messages:unknown[]=[],queries:string[]=[];
 vi.stubGlobal('Deno',{env:{get:(k:string)=>k==='SUPABASE_URL'?'https://selected-fixture.invalid':'synthetic-placeholder'}});
 vi.stubGlobal('fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
  const request=new Request(input,init),url=new URL(request.url);
  if(request.url==='https://openrouter.ai/api/v1/chat/completions'&&request.method==='POST'){
   messages.push(JSON.parse(await request.text()));if(messages.length>1)throw Error('No second generation permitted after typed source');
   return Response.json({choices:[{message:{role:'assistant',content:'SYNTHETIC_INVENTED_9000000',tool_calls:[{id:'selected',type:'function',function:{name:tool,arguments:'{}'}}]}}]});
  }
  if(url.origin!=='https://selected-fixture.invalid'||request.method!=='GET')throw Error('Closed synthetic network');
  const projection=url.searchParams.get('select');expect(projection).toBeTruthy();expect(projection).not.toMatch(/\*|empleado|contratista|observacion|salario|factura|responsable|notas|proveedor|cliente/);
  expect(request.headers.get('Prefer')).toBe('count=exact');queries.push(url.pathname+'?'+url.searchParams.toString());
  return Response.json([],{headers:{'content-range':'*/0'}});
 });
 const modulePath='../supabase/functions/server/chat.tsx';const {llmToolLoop}=await import(modulePath);
 const q=questions[tool];
 const result=await llmToolLoop([{role:'system',content:'SYNTHETIC_OLD_PERSON'},{role:'assistant',content:'SYNTHETIC_OLD_PRIVATE_RECORD'},{role:'user',content:q}],'synthetic-user');
 expect(messages).toHaveLength(1);expect(queries.length).toBeGreaterThan(0);
 expect(result.toolInteractions).toHaveLength(1);expect(result.toolInteractions[0].tool).toBe(tool);
 const context=JSON.parse(result.toolInteractions[0].result_summary);
 expect(context.error).toBeUndefined();expect(JSON.stringify([messages,result])).not.toMatch(/SYNTHETIC_OLD_|SYNTHETIC_INVENTED_9000000/);
 expect(result.text).not.toContain('Partes pendientes:');
 const tools=(messages[0] as {tools:Array<{function:{name:string}}>}).tools.map(t=>t.function.name);
 expect(tools).toContain(tool);expect(tools).not.toContain('get_employee_activity');expect(tools).not.toContain('get_compra_detalle');
});
