import {afterEach,expect,it,vi} from 'vitest';
import {ejecutarLlamadasVerificadas} from '../utils/escoTurnoVerificado';
import type {PuertoFuente} from '../utils/escoDispatcherVerificado';
const now='2034-05-08T12:00:00.000Z';
const dates={date_from:'2034-05-01',date_to:'2034-05-07'};
const call=(name:string,args:Record<string,unknown>)=>({function:{name,arguments:JSON.stringify(args)}});
afterEach(()=>vi.unstubAllGlobals());
it('keeps a named zero-record lot instead of replacing it with another observed lot',async()=>{
 const queries:string[]=[];const port:PuertoFuente={currentUserText:'Costo registrado del lote Norte del 2034-05-01 al 2034-05-07',now:()=>now,read:async(table,query)=>{
  queries.push(table+'?'+query);
  if(table==='lotes')return {rows:[{id:'north',nombre:'Norte'},{id:'south',nombre:'Sur'}],total:2};
  expect(new URLSearchParams(query).get('lote_id')).toBe('eq.north');return {rows:[],total:0};
 }};
 const r=await ejecutarLlamadasVerificadas({calls:[call('get_labor_summary',dates)],port,policy:{mode:'aggregate'},referenceDay:'2034-05-08',turnStartedAt:now});
 expect(r?.text).toContain('`Norte`');expect(r?.text).toContain('0 `COP`');expect(r?.parts[0].state).toBe('answered');expect(r?.text).not.toContain('Sur');expect(queries).toHaveLength(2);
});
it('clarifies an unresolved requested lot before reading another population',async()=>{
 const reads:string[]=[];const port:PuertoFuente={currentUserText:'Costo registrado del lote Desconocido del 2034-05-01 al 2034-05-07',now:()=>now,read:async(table)=>{reads.push(table);return {rows:[{id:'south',nombre:'Sur'}],total:1};}};
 const r=await ejecutarLlamadasVerificadas({calls:[call('get_labor_summary',dates)],port,policy:{mode:'aggregate'},referenceDay:'2034-05-08',turnStartedAt:now});
 expect(reads).toEqual(['lotes']);expect(r?.text).toContain('identidad inequívoca');expect(r?.parts[0].state).toBe('unavailable');
});
it('binds expense versus income to the actual user request, not the model ledger',async()=>{
 const reads:string[]=[];const port:PuertoFuente={currentUserText:'Gastos registrados del 2034-05-01 al 2034-05-07',now:()=>now,read:async(table)=>{reads.push(table);if(table==='fin_negocios')return {rows:[],total:0};return {rows:[{id:'expense-a',fecha:'2034-05-03',valor:'80.25',estado:'Confirmado'}],total:1};}};
 const r=await ejecutarLlamadasVerificadas({calls:[call('get_financial_summary',{...dates,type:'ingresos'})],port,policy:{mode:'aggregate'},referenceDay:'2034-05-08',turnStartedAt:now});
 expect(reads).toEqual(['fin_negocios','fin_gastos']);expect(r?.text).toContain('80.25');expect(r?.text).not.toContain('Ingresos registrados');
});
it('preserves verified expenses when the independent income population fails',async()=>{
 const port:PuertoFuente={currentUserText:'Gastos e ingresos registrados del 2034-05-01 al 2034-05-07',now:()=>now,read:async(table)=>{if(table==='fin_negocios')return {rows:[],total:0};if(table==='fin_ingresos')throw Error('PRIVATE_ERROR_MUST_NOT_SURVIVE');return {rows:[{id:'expense-a',fecha:'2034-05-03',valor:'80.25',estado:'Confirmado'}],total:1};}};
 const r=await ejecutarLlamadasVerificadas({calls:[call('get_financial_summary',dates)],port,policy:{mode:'aggregate'},referenceDay:'2034-05-08',turnStartedAt:now});
 expect(r?.text).toContain('80.25');expect(r?.parts.map(p=>p.state)).toEqual(['answered','unavailable']);expect(JSON.stringify(r)).not.toContain('PRIVATE_ERROR_MUST_NOT_SURVIVE');
});
it.each(['get_hato_produccion','get_financial_summary'])('actual loop minimizes source and all model/persistence payloads for %s',async tool=>{
 const bodies:unknown[]=[],queries:string[]=[];const milk=tool==='get_hato_produccion';
 vi.stubGlobal('Deno',{env:{get:(k:string)=>k==='SUPABASE_URL'?'https://records-fixture.invalid':'synthetic-placeholder'}});
 vi.stubGlobal('fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
  const request=new Request(input,init),url=new URL(request.url);
  if(request.url==='https://openrouter.ai/api/v1/chat/completions'&&request.method==='POST'){
   bodies.push(JSON.parse(await request.text()));
   return Response.json({choices:[{message:{role:'assistant',content:'INVENTED_CASH_OR_VOLUME_99999',tool_calls:[{id:'source',type:'function',function:{name:tool,arguments:JSON.stringify({date_from:'1999-01-01',date_to:'1999-01-02',...(milk?{}:{type:'gastos'})})}}]}}]});
  }
  if(url.origin!=='https://records-fixture.invalid'||request.method!=='GET')throw Error('Closed transport');
  if(url.pathname.endsWith('/fin_negocios'))return Response.json([],{headers:{'content-range':'*/0'}});
  queries.push(url.search);
  expect(url.searchParams.getAll('fecha')).toEqual(['gte.'+dates.date_from,'lte.'+dates.date_to]);
  expect(url.searchParams.get('select')).not.toMatch(/empleado|salario|observacion|proveedor|comprador/);
  const extra={empleado:{nombre:'PRIVATE_SYNTHETIC_PERSON',salario:987654321},observaciones:'PRIVATE_SYNTHETIC_NOTE'};
  const rows=milk?[{animal_id:'cow-a',fecha:'2034-05-03',litros_total:'1.25',...extra},{animal_id:'cow-b',fecha:'2034-05-03',litros_total:'2.75',...extra}]:[{id:'expense-a',fecha:'2034-05-03',valor:'80.25',estado:'Confirmado',...extra}];
  return Response.json(rows,{headers:{'content-range':`0-${rows.length-1}/${rows.length}`}});
 });
 const path='../supabase/functions/server/chat.tsx';const {llmToolLoop}=await import(path);
 const q=(milk?'Litros y promedio de pesajes observados':'Gastos registrados')+' del 2034-05-01 al 2034-05-07';
 const r=await llmToolLoop([{role:'system',content:'PRIVATE_OLD_MEMORY'},{role:'assistant',content:'PRIVATE_OLD_ASSISTANT'},{role:'user',content:q}],'synthetic-user');
 expect(bodies).toHaveLength(1);expect(queries.length).toBeGreaterThan(0);
 expect(JSON.stringify([bodies,r])).not.toMatch(/PRIVATE_|987654321|99999/);
 expect(r.text).toContain(milk?'4 `L`':'80.25');
 const context=JSON.parse(r.toolInteractions[0].result_summary);expect(context.state).toBe('validated');
 if(milk){expect(context.evidence.facts.some((f:{metric:string;entities:unknown[]})=>f.metric==='milk.mean'&&f.entities.length===1)).toBe(true);}
});
