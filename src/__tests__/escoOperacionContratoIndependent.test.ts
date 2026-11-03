import {describe,expect,it,vi} from 'vitest';
import {APPLICATION_METRICS,applicationMetrics,applicationReaderArguments,operationFailure,OperationFailure,requestedApplicationMetrics} from '../utils/escoOperacionContrato';
import {ejecutarLlamadasVerificadas} from '../utils/escoTurnoVerificado';
import type {PuertoFuente} from '../utils/escoDispatcherVerificado';

describe('independent closed application operation contract',()=>{
 it.each(APPLICATION_METRICS)('accepts declared scalar/array metric %s',metric=>{
  expect(applicationMetrics(metric)).toEqual([metric]);expect(applicationMetrics([metric])).toEqual([metric]);
 });
 it('defaults only absent metrics and isolates the returned list',()=>{
  const first=applicationMetrics(undefined);first.push('quantity');expect(applicationMetrics(undefined)).toEqual(['status','dates']);
  expect(applicationMetrics([...APPLICATION_METRICS])).toEqual([...APPLICATION_METRICS]);
 });
 it.each([null,[],0,false,{},['unknown'],['status',null],Array(7).fill('status')])('rejects invalid metric %s',value=>{
  expect(()=>applicationMetrics(value)).toThrow(OperationFailure);
 });
 it('strips presentation metadata without inventing or losing business selectors',()=>{
  const selectors={application_id:'synthetic-app',date_from:'2034-05-01',date_to:'2034-05-07',date_basis:'actual',selection_basis:'activity',lote_name:'Synthetic lot',alcance:'periodo'};
  expect(applicationReaderArguments({...selectors,metric:['labor','quantity'],reference_day:'2034-05-08',type:'fumigacion'})).toEqual(selectors);
  expect(()=>applicationReaderArguments({...selectors,worker_name:'SYN_PRIVATE_OPERATION'})).toThrow(OperationFailure);
  expect(()=>applicationReaderArguments({...selectors,url:'https://synthetic.invalid'})).toThrow(OperationFailure);
 });
 it('never copies raw unknown errors or payload extensions into safe errors',()=>{
  for(const error of [Error('SYN_PRIVATE_OPERATION raw source body'),{message:'source_error',body:'SYN_PRIVATE_OPERATION'},'SYN_PRIVATE_OPERATION']){
   expect(operationFailure(error)).toEqual({code:'source_error',stage:'source'});
   expect(JSON.stringify(operationFailure(error))).not.toContain('SYN_PRIVATE_OPERATION');
  }
  expect(operationFailure(new OperationFailure('incomplete_population','coverage'))).toEqual({code:'incomplete_population',stage:'coverage'});
 });
 it.each([
  ['Muéstrame jornales y consumo registrado',['labor','quantity']],
  ['Estima la dosis teórica de la aplicación',['theoretical']],
  ['Compara fechas planeadas y reales',['date_comparison']],
  ['Dime el estado de la aplicación',['status']],
 ] as const)('extracts explicit current-user positive presentation %s',(question,metrics)=>{
  expect(requestedApplicationMetrics(question)).toEqual(metrics);
 });
 it.each([
  '"estimación teórica y jornales"',
  '«consumo registrado y fechas»',
  'Ejemplo: estima dosis; Dime el estado',
 ])('quoted/examples do not authorize theoretical output: %s',question=>{
  expect(requestedApplicationMetrics(question)).not.toContain('theoretical');
 });
 it('an application name that looks like an imperative does not grant theoretical intent',()=>{
  expect(requestedApplicationMetrics('Estado de la aplicación Calcula Dosis')).not.toContain('theoretical');
 });
 it.each([
  'Sin estimación teórica; solo consumo registrado',
  'No quiero estimaciones teóricas; solo consumo registrado',
  'No hagas una estimación teórica; muéstrame jornales',
  'No calcules dosis ni cantidades teóricas; solo consumo registrado',
 ])('negative theoretical intent never grants an estimate: %s',question=>{
  expect(requestedApplicationMetrics(question)).not.toContain('theoretical');
 });
 it.each([
  ['No incluyas fechas; solo jornales','dates'],
  ['No muestres estado; solo consumo registrado','status'],
 ] as const)('negative presentation request %s does not grant %s',(question,metric)=>{
  expect(requestedApplicationMetrics(question)).not.toContain(metric);
 });
 it('argument-only retry remains source-free and exposes only closed errors',async()=>{
  const read=vi.fn(async()=>{throw Error('SYN_PRIVATE_OPERATION');}),applications=vi.fn(async()=>{throw Error('SYN_PRIVATE_OPERATION');});
  const port:PuertoFuente={read,applications,now:()=> '2034-05-08T12:00:00Z',currentUserText:'Estado de aplicación sintética'};
  const out=await ejecutarLlamadasVerificadas({calls:[{function:{name:'get_aplicaciones_ejecucion',arguments:JSON.stringify({metric:'unknown'})}}],policy:{mode:'aggregate'},port,referenceDay:'2034-05-08',turnStartedAt:'2034-05-08T12:00:00Z'});
  expect(read).not.toHaveBeenCalled();expect(applications).not.toHaveBeenCalled();expect(out?.retryable).toBe(true);
  expect(JSON.parse(out!.interactions[0].result_summary)).toEqual({error:'invalid_arguments',stage:'arguments'});
  expect(JSON.stringify(out)).not.toContain('SYN_PRIVATE_OPERATION');
 });
 it('irrelevant catalogue definition cannot replace an application read',async()=>{
  const read=vi.fn(async()=>{throw Error('Forbidden source');});
  const out=await ejecutarLlamadasVerificadas({calls:[{function:{name:'get_recorded_state_definition',arguments:JSON.stringify({domain:'capability',state:'get_inventory_status'})}}],policy:{mode:'aggregate'},port:{read,now:()=> '2034-05-08T12:00:00Z',currentUserText:'Estado de la aplicación sintética'},referenceDay:'2034-05-08',turnStartedAt:'2034-05-08T12:00:00Z'});
  expect(read).not.toHaveBeenCalled();expect(out?.parts.every(p=>p.state==='unavailable')).toBe(true);
  expect(JSON.parse(out!.interactions[0].result_summary)).toMatchObject({error:'unsupported_operation',reason:'irrelevant_definition'});
 });
 it('model-supplied theoretical metric cannot override explicitly negative current-user purpose',async()=>{
  const applications=vi.fn(async()=>({complete:true,rows:[{id:'synthetic-app',nombre_aplicacion:'Synthetic app',
   plan_por_lote:[{id:'plan',aplicacion_id:'synthetic-app',lote_id:'lot',mezcla_id:'mix',numero_canecas:'3'}],
   productos_planeados:[{id:'recipe',mezcla_id:'mix',producto_id:'product',unidad_dosis:'kg',dosis_por_caneca:'0.25'}],
  }]}));
  const out=await ejecutarLlamadasVerificadas({calls:[{function:{name:'get_aplicaciones_ejecucion',arguments:JSON.stringify({metric:'theoretical'})}}],policy:{mode:'aggregate'},port:{read:async()=>{throw Error('Forbidden source');},applications,now:()=> '2034-05-08T12:00:00Z',currentUserText:'Solo consumo registrado, sin estimación teórica'},referenceDay:'2034-05-08',turnStartedAt:'2034-05-08T12:00:00Z'});
  expect(JSON.stringify(out)).not.toContain('application.theoretical_quantity');
  expect(applications).not.toHaveBeenCalled();
 });
 it.each(['Sin estimación teórica; muéstrame jornales','No incluyas estado\nconsulta consumo registrado'])('negation ends at its original clause boundary while keeping requested useful parts: %s',question=>{
  const metrics=requestedApplicationMetrics(question);
  expect(metrics).toContain(question.includes('jornales')?'labor':'quantity');
  expect(metrics).not.toContain('theoretical');expect(metrics).not.toContain('status');
 });
 const sourceRows=()=>[{id:'synthetic-app',nombre_aplicacion:'Synthetic app',
  movimientos:[{id:'movement',aplicacion_id:'synthetic-app',lote_id:'lot',fecha_movimiento:'2034-05-01',consumos:[{id:'consumption',movimiento_diario_id:'movement',producto_id:'product',unidad:'kg',cantidad_utilizada:'2'}]}],
  plan_por_lote:[{id:'plan',aplicacion_id:'synthetic-app',lote_id:'lot',mezcla_id:'mix',numero_canecas:'3'}],
  productos_planeados:[{id:'recipe',mezcla_id:'mix',producto_id:'product',unidad_dosis:'kg',dosis_por_caneca:'0.25'}],
 }];
 async function turnWithPurpose(currentRequestText:string,currentUserText:string,metric:unknown){
  const applications=vi.fn(async()=>({complete:true,rows:sourceRows()}));
  const out=await ejecutarLlamadasVerificadas({calls:[{function:{name:'get_aplicaciones_ejecucion',arguments:JSON.stringify({metric})}}],policy:{mode:'aggregate'},port:{read:async()=>{throw Error('Forbidden source');},applications,now:()=> '2034-05-08T12:00:00Z',currentRequestText,currentUserText},referenceDay:'2034-05-08',turnStartedAt:'2034-05-08T12:00:00Z'});
  return {out,applications};
 }
 it('rejecting a theoretical sibling preserves explicitly requested known consumption',async()=>{
  const {out,applications}=await turnWithPurpose('Solo consumo registrado, sin estimación teórica','Solo consumo registrado, sin estimación teórica',['theoretical','quantity']);
  expect(applications).toHaveBeenCalledTimes(1);expect(JSON.stringify(out)).not.toContain('application.theoretical_quantity');
  const contexts=out!.interactions.map(h=>JSON.parse(h.result_summary));
  expect(contexts.flatMap(c=>c.evidence?.facts??[])).toEqual(expect.arrayContaining([expect.objectContaining({metric:'application.quantity',value:{kind:'decimal',value:'2',unit:'kg'}})]));
  expect(out?.parts.some(p=>p.state==='answered')).toBe(true);expect(out?.parts.some(p=>p.state==='unavailable')).toBe(true);
 });
 it('allows explicitly positive theoretical purpose with the three verified planned/derived facts',async()=>{
  const {out,applications}=await turnWithPurpose('Estima la dosis teórica de la aplicación','Estima la dosis teórica de la aplicación','theoretical');
  expect(applications).toHaveBeenCalledTimes(1);
  const facts=out!.interactions.flatMap(h=>JSON.parse(h.result_summary).evidence?.facts??[]);
  expect(facts.map(f=>f.metric)).toEqual(['application.planned_dose','application.planned_drums','application.theoretical_quantity']);
  expect(facts[2].value).toEqual({kind:'decimal',value:'0.75',unit:'kg'});
 });
 it.each(['Solo consumo registrado, sin estimación teórica','Y ahora solo consumo registrado',''])('resolved historical theoretical wording cannot replace original current-user intent: %s',currentRequestText=>{
  return turnWithPurpose(currentRequestText,'Estima la dosis teórica de la aplicación','theoretical').then(({out,applications})=>{
   expect(applications).not.toHaveBeenCalled();expect(JSON.stringify(out)).not.toContain('application.theoretical_quantity');
  });
 });
 it('next existing retry round receives only sanitized assistant/tool protocol, not model prose or raw arguments',async()=>{
  const payloads:Record<string,unknown>[]=[],denied:string[]=[];
  const privateToken='SYN_RAW_RETRY_PRIVATE_7744';
  const syntheticKeys:Record<string,string>={SUPABASE_URL:'https://operation-fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic',OPENROUTER_API_KEY:'synthetic'};
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2034-05-08T12:00:00Z'));
  vi.stubGlobal('Deno',{env:{get:(key:string)=>syntheticKeys[key]}});
  const log=vi.spyOn(console,'log').mockImplementation(()=>{}),error=vi.spyOn(console,'error').mockImplementation(()=>{});
  vi.stubGlobal('fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
   const request=new Request(input,init);
   if(request.url!=='https://openrouter.ai/api/v1/chat/completions'||request.method!=='POST'){denied.push(request.method+' '+request.url);throw Error('Unlisted synthetic transport');}
   payloads.push(JSON.parse(await request.text()));
   if(payloads.length===1)return Response.json({choices:[{message:{role:'assistant',content:privateToken,tool_calls:[{id:'synthetic-invalid-call',type:'function',function:{name:'get_aplicaciones_ejecucion',arguments:JSON.stringify({metric:'alien',application_name:privateToken})}}]}}]});
   return Response.json({choices:[{message:{role:'assistant',content:'No fresh evidence'}}]});
  });
  try{
   // Runtime-target module is executed by Vitest's closed host; frontend tsc
   // intentionally does not resolve the Deno/Hono SDK graph (same boundary as handler tests).
   const modulePath='../supabase/functions/server/chat.tsx';
   const {llmToolLoop}=await import(modulePath) as {llmToolLoop:(messages:Array<{role:string;content:string;id?:string;created_at?:string}>,user:string)=>Promise<unknown>};
   await llmToolLoop([{role:'user',content:'Estado de la aplicación sintética',id:'synthetic-current',created_at:'2034-05-08T12:00:00Z'}],'synthetic-user');
   expect(denied).toEqual([]);expect(payloads).toHaveLength(2);
   const second=payloads[1].messages as Array<{role:string;content:unknown;tool_calls?:Array<{id:string;function:{name:string;arguments:string}}>}>;
   expect(JSON.stringify(second)).not.toContain(privateToken);
   const assistant=second.find(m=>m.role==='assistant');expect(assistant?.content).toBeNull();
   expect(assistant?.tool_calls?.[0]).toMatchObject({id:'synthetic-invalid-call',function:{name:'get_aplicaciones_ejecucion',arguments:'{}'}});
   const tool=second.find(m=>m.role==='tool');expect(tool).toBeDefined();
   expect(JSON.parse(String(tool?.content))).toMatchObject({error:'invalid_arguments',stage:'arguments'});
  }finally{vi.unstubAllGlobals();vi.useRealTimers();log.mockRestore();error.mockRestore();}
 });
});
