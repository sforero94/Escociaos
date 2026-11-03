// Actual Web handler + actual tool loop. Every HTTP request ends in this fixture.
import {afterEach,expect,it,vi} from 'vitest';
const DB='https://web-handler-fixture.invalid',MODEL='https://openrouter.ai/api/v1/chat/completions';
const USER='11111111-1111-4111-8111-111111111111',CONV='22222222-2222-4222-8222-222222222222';
const USER_TOKEN='synthetic-user-jwt',SERVICE='synthetic-service-key',MODEL_KEY='synthetic-model-key';
const PRIVATE='SYN_WEB_PRIVATE_HISTORY_OR_SOURCE',FALSE='SYN_MODEL_FALSE_PROSE_9000000';
const NOW='2034-05-08T12:00:00.000Z';
const QUESTION='Compras por producto del 2034-05-01 al 2034-05-07';
type Row=Record<string,unknown>;
type Mode='aggregate'|'supplier'|'quoted'|'source_error'|'terminal'|'persist_error'|'provider_json_error'|'user_persist_error';
interface Options {mode?:Mode;auth?:string|null;validJwt?:boolean;role?:string|null;owned?:boolean;body?:unknown;parseError?:boolean}
interface Network {method:string;url:string;body?:Row;authorization:string|null}
interface Event {type:string;content?:string;message?:string;ok?:boolean;conversation_id?:string}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
async function run(options:Options={}){
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(NOW));
 const logs:unknown[][]=[];vi.spyOn(console,'log').mockImplementation((...v)=>logs.push(v));vi.spyOn(console,'error').mockImplementation((...v)=>logs.push(v));
 const schedulerErrors:string[]=[],delays:number[]=[];
 const realSetTimeout=setTimeout.bind(globalThis),realClearTimeout=clearTimeout.bind(globalThis),guardTimers=new Set<ReturnType<typeof setTimeout>>();
 vi.stubGlobal('setTimeout',(callback:TimerHandler,delay?:number,...args:unknown[])=>{
  if(typeof callback!=='function'){schedulerErrors.push('nonfunction');throw Error('Unsupported scheduler callback');}
  // Preserve the real 55-second model deadline; the actual loop must clear it.
  if(delay===55000){const handle=realSetTimeout(()=>callback(...args),delay);guardTimers.add(handle);return handle;}
  if(delay!==15){schedulerErrors.push(String(delay));throw Error('Only SSE delay is accelerated');}
  delays.push(delay);queueMicrotask(()=>callback(...args));return 1;
 });
 vi.stubGlobal('clearTimeout',(handle:ReturnType<typeof setTimeout>)=>{guardTimers.delete(handle);realClearTimeout(handle);});
 const network:Network[]=[],providerBodies:Row[]=[],attemptedWrites:Row[]=[],stored:Row[]=[],rejected:string[]=[];
 const history:Row[]=[
  {id:'old-user',conversation_id:CONV,role:'user',content:PRIVATE+' old user salary 987654321',created_at:'2034-05-07T10:00:00Z'},
  {id:'old-assistant',conversation_id:CONV,role:'assistant',content:PRIVATE+' old answer',created_at:'2034-05-07T11:00:00Z',metadata:{tool_interactions:[{tool:'get_employee_activity',args:{worker_name:PRIVATE},result_summary:JSON.stringify({nombre:PRIVATE,salario:987654321,observaciones:PRIVATE})}]}}
 ];
 const inherited=vi.fn(async()=>{throw Error('Inherited network forbidden');});vi.stubGlobal('fetch',inherited);
 const env:Record<string,string>={SUPABASE_URL:DB,SUPABASE_SERVICE_ROLE_KEY:SERVICE,OPENROUTER_API_KEY:MODEL_KEY};
 vi.stubGlobal('Deno',{env:{get:(key:string)=>{if(!Object.prototype.hasOwnProperty.call(env,key)){rejected.push('environment');throw Error('Unlisted environment key');}return env[key];}}});
 const mode=options.mode??'aggregate';
 vi.stubGlobal('fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
  const request=new Request(input,init),url=new URL(request.url);
  const body=request.method==='POST'?JSON.parse(await request.text()) as Row:undefined;
  network.push({method:request.method,url:request.url,...(body?{body}:{}),authorization:request.headers.get('Authorization')});
  if(request.url===MODEL&&request.method==='POST'){
   expect(request.headers.get('Authorization')).toBe('Bearer '+MODEL_KEY);expect(request.headers.has('apikey')).toBe(false);
   providerBodies.push(body!);if(providerBodies.length>1){rejected.push('second-model-generation');throw Error('No second factual generation');}
   if(mode==='provider_json_error')return new Response('SYN_PRIVATE',{status:200,headers:{'Content-Type':'application/json'}});
   if(mode==='terminal')return Response.json({choices:[{message:{role:'assistant',content:FALSE}}]});
   return Response.json({choices:[{message:{role:'assistant',content:FALSE,tool_calls:[{id:'purchase-source',type:'function',function:{name:'get_purchase_history',arguments:'{}'}}]}}]});
  }
  if(url.origin!==DB||url.hash){rejected.push('route');throw Error('Closed HTTP route');}
  if(url.pathname==='/auth/v1/user'&&request.method==='GET'){
   expect(request.headers.get('Authorization')).toBe('Bearer '+USER_TOKEN);expect(request.headers.get('apikey')).toBe(SERVICE);
   return options.validJwt===false?Response.json({}, {status:401}):Response.json({id:USER});
  }
  expect(request.headers.get('Authorization')).toBe('Bearer '+SERVICE);expect(request.headers.get('apikey')).toBe(SERVICE);
  if(url.pathname==='/rest/v1/usuarios'&&request.method==='GET'){
   expect(url.searchParams.get('id')).toBe('eq.'+USER);expect(url.searchParams.get('select')).toBe('rol');
   return Response.json(options.role===null?[]:[{rol:options.role??'Gerencia'}]);
  }
  if(url.pathname==='/rest/v1/chat_conversations'&&request.method==='GET'){
   expect(url.searchParams.get('id')).toBe('eq.'+CONV);expect(url.searchParams.get('user_id')).toBe('eq.'+USER);
   return Response.json(options.owned===false?[]:[{id:CONV}]);
  }
  if(url.pathname==='/rest/v1/chat_messages'&&request.method==='POST'){
   expect(request.headers.get('Prefer')).toBe('return=representation');expect(body?.conversation_id).toBe(CONV);expect(['user','assistant']).toContain(body?.role);
   attemptedWrites.push(structuredClone(body!));
   if(body?.role==='assistant'&&mode==='persist_error'||body?.role==='user'&&mode==='user_persist_error')return Response.json({code:'PGRST002',message:PRIVATE,details:PRIVATE,hint:PRIVATE},{status:503});
   const row={...body,created_at:NOW};stored.push(structuredClone(row));return Response.json([row]);
  }
  if(url.pathname==='/rest/v1/chat_messages'&&request.method==='GET'){
   expect(url.searchParams.get('conversation_id')).toBe('eq.'+CONV);expect(url.searchParams.get('limit')).toBe('20');
   const rows=[...history,...stored].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
   return Response.json(structuredClone(rows),{headers:{'content-range':`0-${rows.length-1}/${rows.length}`}});
  }
  if(url.pathname==='/rest/v1/compras'&&request.method==='GET'){
   expect(request.headers.get('Prefer')).toBe('count=exact');expect(url.searchParams.getAll('fecha_compra')).toEqual(['gte.2034-05-01','lte.2034-05-07']);
   const select=url.searchParams.get('select')??'';expect(select).not.toMatch(/empleado|salario|observacion|factura|usuario|responsable|\*/);
   if(mode!=='supplier')expect(select).not.toMatch(/proveedor|cliente/);
   if(mode==='source_error')return Response.json({code:'PGRST002',message:PRIVATE},{status:503});
   const rows=[{id:'purchase-a',producto_id:'product-a',producto:{nombre:'Producto seguro'},fecha_compra:'2034-05-02',cantidad:'1.5',unidad:'Kilos',costo_unitario:'9.99',costo_total:'10.1',proveedor_id:'supplier-a',proveedor:'Proveedor Autorizado',observaciones:PRIVATE,empleado:{nombre:PRIVATE,salario:987654321}},
    {id:'purchase-b',producto_id:'product-a',producto:{nombre:'Producto seguro'},fecha_compra:'2034-05-03',cantidad:'2.5',unidad:'Kilos',costo_unitario:'7.77',costo_total:'20.2',proveedor_id:'supplier-a',proveedor:'Proveedor Autorizado',observaciones:PRIVATE}];
   const offset=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit')??200),page=rows.slice(offset,offset+limit);
   return Response.json(page,{headers:{'content-range':page.length?`${offset}-${offset+page.length-1}/${rows.length}`:`*/${rows.length}`}});
  }
  rejected.push(request.method+' '+url.pathname);throw Error('Closed synthetic table/method');
 });
 const question=mode==='supplier'?'Compras por proveedor del 2034-05-01 al 2034-05-07':mode==='quoted'?QUESTION+'. Ejemplo anterior: se hablaba de proveedores.':QUESTION;
 const parse=vi.fn(async()=>{if(options.parseError)throw Error('Synthetic bad JSON');return Object.prototype.hasOwnProperty.call(options,'body')?options.body:{message:question,conversation_id:CONV,user_id:'spoofed-owner',policy:{mode:'individual_explicit'}};});
 const auth=options.auth===null?undefined:options.auth??'Bearer '+USER_TOKEN;
 const c={req:{header:(name:string)=>name==='Authorization'?auth:undefined,json:parse},json:(value:unknown,status=200)=>Response.json(value,{status})};
 const modulePath='../supabase/functions/server/chat.tsx';const {handleChatMessage}=await import(modulePath) as {handleChatMessage:(ctx:typeof c)=>Promise<Response>};
 let response:Response|undefined,handlerError:unknown;
 try{response=await handleChatMessage(c);}catch(error){handlerError=error;}
 const text=response?await response.text():'';
 const events:Event[]=response?.headers.get('content-type')?.includes('text/event-stream')?text.split('\n\n').filter(Boolean).map(line=>{expect(line.startsWith('data: ')).toBe(true);return JSON.parse(line.slice(6));}):[];
 const answer=events.filter(e=>e.type==='text_delta').map(e=>e.content??'').join('');
 expect(schedulerErrors).toEqual([]);expect(guardTimers.size).toBe(0);expect(rejected).toEqual([]);expect(inherited).not.toHaveBeenCalled();
 return {response,handlerError,text,events,answer,network,providerBodies,attemptedWrites,stored,history,parse,delays,logs};
}
function clean(r:Awaited<ReturnType<typeof run>>){
 expect(r.handlerError).toBeUndefined();
 expect(JSON.stringify([r.providerBodies,r.events,r.attemptedWrites,r.logs]).includes(PRIVATE)).toBe(false);
 expect(JSON.stringify([r.providerBodies,r.events,r.attemptedWrites])).not.toMatch(/987654321|SYN_MODEL_FALSE_PROSE_9000000/);
 const assistant=r.stored.filter(row=>row.role==='assistant');expect(assistant).toHaveLength(1);expect(assistant[0].content).toBe(r.answer);
 expect(r.events.filter(e=>e.type==='done')).toEqual([{type:'done',conversation_id:CONV}]);expect(r.events.filter(e=>e.type==='error')).toEqual([]);
 expect(r.history[1].content).toContain(PRIVATE); // Stored history was preserved, not erased to pass privacy.
}
it('executes authenticated ownership-gated aggregate source, SSE and minimized persistence end to end',async()=>{
 const r=await run();expect(r.response?.status).toBe(200);expect(r.response?.headers.get('content-type')).toContain('text/event-stream');clean(r);
 expect(r.answer).toContain('30.3');expect(r.answer).toContain('4 `Kilos`');expect(r.delays.length).toBeGreaterThan(0);
 expect(r.providerBodies).toHaveLength(1);expect(r.stored.map(row=>row.role)).toEqual(['user','assistant']);expect(r.attemptedWrites[0].id).not.toBe(r.attemptedWrites[1].id);
 const tools=(r.providerBodies[0].tools as Array<{function:{name:string}}>).map(t=>t.function.name);expect(tools).toHaveLength(24);expect(tools).not.toContain('get_employee_activity');expect(tools).not.toContain('get_inventario_conciliacion');
 expect(r.events.some(e=>e.type==='tool_start')).toBe(true);expect(r.events.some(e=>e.type==='tool_done')).toBe(true);
 const paths=r.network.map(n=>new URL(n.url).pathname);expect(paths.slice(0,5)).toEqual(['/auth/v1/user','/rest/v1/usuarios','/rest/v1/chat_conversations','/rest/v1/chat_messages','/rest/v1/chat_messages']);
});
it('permits supplier labels only for the current requested purpose through SSE and storage',async()=>{
 const r=await run({mode:'supplier'});clean(r);expect(r.answer).toContain('Proveedor Autorizado');expect(r.answer).toContain('30.3');
 const read=r.network.find(n=>new URL(n.url).pathname==='/rest/v1/compras')!;expect(new URL(read.url).searchParams.get('select')).toContain('proveedor');
});
it('does not promote a quoted historical supplier mention into a personal source projection',async()=>{
 const r=await run({mode:'quoted'});clean(r);expect(r.answer).toContain('30.3');expect(r.answer).not.toContain('Proveedor Autorizado');
});
it('keeps a primary source error explicit without exposing its body through SSE or persistence',async()=>{
 const r=await run({mode:'source_error'});clean(r);expect(r.answer).not.toContain('30.3');expect(r.answer.length).toBeGreaterThan(0);expect(r.events.some(e=>e.type==='tool_done'&&e.ok===false)).toBe(true);
});
it('does not persist terminal model prose as facts when no source was called',async()=>{
 const r=await run({mode:'terminal'});clean(r);expect(r.answer).not.toContain('30.3');expect(r.network.some(n=>new URL(n.url).pathname==='/rest/v1/compras')).toBe(false);
});
it.each([null,'Basic synthetic'])('rejects missing/invalid bearer syntax before body parsing and all HTTP: %s',async auth=>{
 const r=await run({auth});expect(r.response?.status).toBe(401);expect(r.parse).not.toHaveBeenCalled();expect(r.network).toEqual([]);expect(r.attemptedWrites).toEqual([]);
});
it('rejects an invalid JWT before role, body, history, source or model access',async()=>{
 const r=await run({validJwt:false});expect(r.response?.status).toBe(401);expect(r.parse).not.toHaveBeenCalled();expect(r.network).toHaveLength(1);expect(r.attemptedWrites).toEqual([]);
});
it.each(['Monitor',null])('rejects a non-Gerencia actor before parsing the spoofed body: %s',async role=>{
 const r=await run({role});expect(r.response?.status).toBe(403);expect(r.parse).not.toHaveBeenCalled();expect(r.network).toHaveLength(2);expect(r.attemptedWrites).toEqual([]);
});
it('rejects another owner before any history, data, message write or model request',async()=>{
 const r=await run({owned:false});expect(r.response?.status).toBe(404);expect(r.network).toHaveLength(3);expect(r.attemptedWrites).toEqual([]);expect(r.providerBodies).toEqual([]);
});
it.each([{parseError:true},{body:{}},{body:{message:'   ',conversation_id:CONV}}])('returns a bounded 400 for malformed or empty message input %#',async options=>{
 const r=await run(options);expect(r.response?.status).toBe(400);expect(r.network).toHaveLength(2);expect(r.attemptedWrites).toEqual([]);
});
it.each([null,[],{message:123,conversation_id:CONV},{message:[],conversation_id:CONV}])('returns 400 rather than throwing for invalid JSON message shape %#',async body=>{
 const r=await run({body});expect(r.response?.status).toBe(400);expect(r.network).toHaveLength(2);expect(r.attemptedWrites).toEqual([]);
});
it('never publishes a persistence error body or marks a failed assistant save done',async()=>{
 const r=await run({mode:'persist_error'});expect(r.response?.status).toBe(200);expect(r.events.filter(e=>e.type==='done')).toEqual([]);expect(r.events.filter(e=>e.type==='error')).toHaveLength(1);
 expect(r.events.find(e=>e.type==='error')?.message).toBe('storage_error:503:PGRST002');
 expect(JSON.stringify([r.events,r.logs]).includes(PRIVATE)).toBe(false);expect(r.stored.filter(row=>row.role==='assistant')).toEqual([]);
});

it('does not expose an invalid provider JSON body through SSE or logs',async()=>{
 const r=await run({mode:'provider_json_error'});expect(r.response?.status).toBe(200);expect(r.events.filter(e=>e.type==='error')).toHaveLength(1);
 expect(r.events.find(e=>e.type==='error')?.message).toContain('ESCO_QUERY_FAILED');
 expect(JSON.stringify([r.events,r.logs]).includes('SYN_PRIVATE')).toBe(false);expect(r.events.filter(e=>e.type==='done')).toEqual([]);expect(r.stored.map(row=>row.role)).toEqual(['user']);
});
it('contains a failed initial user save as a bounded pre-SSE response, before any history/source/model access',async()=>{
 const r=await run({mode:'user_persist_error'});
 expect(String(r.handlerError??'').includes(PRIVATE)).toBe(false);expect(r.providerBodies).toEqual([]);expect(r.stored).toEqual([]);
 expect(r.network.map(n=>new URL(n.url).pathname)).toEqual(['/auth/v1/user','/rest/v1/usuarios','/rest/v1/chat_conversations','/rest/v1/chat_messages']);
 expect(r.response?.status).toBe(500);expect(r.handlerError).toBeUndefined();expect(r.events).toEqual([]);
 expect(JSON.parse(r.text)).toEqual({error:'storage_error:503:PGRST002'});expect(JSON.stringify([r.text,r.logs]).includes(PRIVATE)).toBe(false);
});
