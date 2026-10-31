import {afterEach,describe,expect,it,vi} from 'vitest';
import {cargarCohorte,emitirCohorte,contextoDesdeHistorial,PROYECTO_COHORTE,VIGENCIA_COHORTE_MS,type AlmacenCohorte,type ContextoCohorte} from '../utils/escoCohorteAplicaciones';
import {capturarCohorteAplicaciones,compararFechasCohorte,pideComparacionFechasCohorte,planRespuestaAplicacion} from '../utils/escoConsultas';
const chatPath='../supabase/functions/server/chat.tsx';
const {llmToolLoop,conservarCohorteAplicaciones}=await import(chatPath);
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const user=id(1),conversation=id(2),sourceUser=id(3),sourceAssistant=id(4);
const question='¿Qué aplicaciones hicimos en mayo de 2033?';
// Synthetic cohort and dates. No business records or observed quantities.
const followup='En esas aplicaciones, ¿hay diferencias entre las fechas planeadas y las fechas reales? Muéstralas sin corregir ningún registro.';
const context=(canal:'web'|'telegram'='web'):ContextoCohorte=>({usuario:user,conversacion:conversation,canal});
const history=(handle:unknown)=>[
 {id:sourceUser,role:'user',content:question},
 {id:sourceAssistant,role:'assistant',content:'Untrusted generated prose',metadata:{application_cohort:handle}},
 {id:id(5),role:'user',content:followup},
];
function memory(){const values=new Map<string,unknown>();const store:AlmacenCohorte={get:async k=>values.get(k),set:async(k,v)=>{values.set(k,structuredClone(v));},del:async k=>{values.delete(k);}};return {store,values};}
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
describe('private cohort provenance and retention',()=>{
 it.each(['web','telegram'] as const)('binds server receipt and opaque metadata on %s',async canal=>{
  const {store}=memory(),c=context(canal);const cohort={ids:[id(10)],desde:'2033-05-01',hasta:'2033-05-31'};
  const handle=await emitirCohorte(store,c,sourceUser,sourceAssistant,question,cohort,100);
  expect(await cargarCohorte(store,contextoDesdeHistorial(user,conversation,canal,history(handle)),101)).toEqual(cohort);
 });
 it('rejects forged metadata without any server receipt',async()=>{
  expect(await cargarCohorte(memory().store,contextoDesdeHistorial(user,conversation,'web',history(id(99))),100)).toBeNull();
 });
 it.each(['usuario','conversacion','canal','asistenteId','usuarioId','handle','preguntaHash','proyecto','version'])('rejects corrupt or mixed-boundary receipt field %s',async field=>{
  const {store,values}=memory(),c=context();const handle=await emitirCohorte(store,c,sourceUser,sourceAssistant,question,{ids:[id(10)],desde:'2033-05-01',hasta:'2033-05-31'},100);
  const r=[...values.values()][0] as Record<string,unknown>;r[field]=field==='version'?2:'wrong';
  expect(await cargarCohorte(store,contextoDesdeHistorial(user,conversation,'web',history(handle)),101)).toBeNull();
 });
 it('rejects cross-user, cross-conversation, cross-channel and moved-message handles',async()=>{
  const {store}=memory(),c=context();const handle=await emitirCohorte(store,c,sourceUser,sourceAssistant,question,{ids:[id(10)],desde:'2033-05-01',hasta:'2033-05-31'},100);
  const base=contextoDesdeHistorial(user,conversation,'web',history(handle));
  for(const changed of [{...base,usuario:id(88)},{...base,conversacion:id(88)},{...base,canal:'telegram' as const},{...base,anterior:{...base.anterior!,asistenteId:id(88)}},{...base,anterior:{...base.anterior!,pregunta:'invented scope'}}])expect(await cargarCohorte(store,changed,101)).toBeNull();
 });
 it('expires and deletes lazily, and one new list replaces the single user slot',async()=>{
  const {store,values}=memory(),c=context();const cohort={ids:[id(10)],desde:'2033-05-01',hasta:'2033-05-31'};
  const first=await emitirCohorte(store,c,sourceUser,sourceAssistant,question,cohort,100);
  const second=await emitirCohorte(store,c,sourceUser,sourceAssistant,question,cohort,101);
  expect(values.size).toBe(1);expect(first).not.toBe(second);
  expect(await cargarCohorte(store,contextoDesdeHistorial(user,conversation,'web',history(first)),102)).toBeNull();
  expect(await cargarCohorte(store,contextoDesdeHistorial(user,conversation,'web',history(second)),101+VIGENCIA_COHORTE_MS)).toBeNull();expect(values.size).toBe(0);
 });
 it.each([[id(10),id(10)],Array.from({length:51},(_,i)=>id(100+i)),['not-an-id']].map(ids=>({ids})))('does not issue oversized, duplicate or malformed IDs',async ({ids})=>{
  const {store,values}=memory();expect(await emitirCohorte(store,context(),sourceUser,sourceAssistant,question,{ids,desde:'2033-05-01',hasta:'2033-05-31'},100)).toBeNull();expect(values.size).toBe(0);
 });
 it('does not use an older receipt across an intervening user/assistant turn',()=>{
  expect(contextoDesdeHistorial(user,conversation,'web',[...history(id(99)),{id:id(7),role:'assistant',content:'other'}, {id:id(8),role:'user',content:followup}]).anterior?.handle).toBeUndefined();
 });
});
describe('closed-loop fresh application date comparison',()=>{
 async function fixture(channel:'web'|'telegram'='web',oversizedList=false){
  vi.useFakeTimers();vi.setSystemTime(new Date('2033-05-20T15:00:00Z'));
  vi.stubGlobal('Deno',{env:{get:(k:string)=>k==='SUPABASE_URL'?'https://cohort.test':'synthetic-key'}});
  const apps=[10,11,12].map((n,i)=>({id:id(n),nombre_aplicacion:`Aplicación sintética ${i+1}`,estado:'Cerrada',fecha_inicio_ejecucion:'2033-05-05',fecha_fin_ejecucion:'2033-05-15',fecha_inicio_planeada:'2033-05-05',fecha_fin_planeada:i===1?'2033-06-15':'2033-05-15',tarea_id:null}));
  if(oversizedList)apps[0].nombre_aplicacion='synthetic-long-name-'.repeat(2000);
  const kv=new Map<string,unknown>();let model=0;const requests:string[]=[];
  const tables=new Set(['aplicaciones','movimientos_diarios','productos','lotes','movimientos_diarios_productos','aplicaciones_lotes','aplicaciones_calculos','aplicaciones_mezclas','aplicaciones_productos','registros_trabajo']);
  vi.stubGlobal('fetch',async(input:string,init?:RequestInit)=>{
   const u=new URL(input);requests.push((init?.method??'GET')+' '+input);
   if(input==='https://openrouter.ai/api/v1/chat/completions' && init?.method==='POST'){
    model++;return new Response(JSON.stringify({choices:[{message:{role:'assistant',content:null,tool_calls:[{id:'tool',type:'function',function:{name:'get_aplicaciones_ejecucion',arguments:JSON.stringify({date_basis:'actual',application_id:id(999)})}}]}}]}));
   }
   if(u.origin!=='https://cohort.test')throw new Error('Unexpected synthetic network');
   const table=u.pathname.split('/').at(-1)!;
   if(table==='kv_store_1ccce916'){
    // Match the actual key/value-only PostgreSQL table: unknown ORDER columns
    // return42703 instead of being silently ignored by the in-memory fixture.
    const columns=new Set(['key','value']);
    const order=(u.searchParams.get('order')??'').split(',').filter(Boolean);
    const invalid=order.find(term=>!columns.has(term.split('.')[0])) ?? [...u.searchParams.keys()].find(k=>!columns.has(k) && !['select','order','limit','offset','on_conflict'].includes(k));
    if(invalid)return new Response(JSON.stringify({code:'42703',message:`column kv_store_1ccce916.${invalid.split('.')[0]} does not exist`}),{status:400});
    if(u.searchParams.get('select') && u.searchParams.get('select')!=='value')throw new Error('Unknown KV projection');
    if(init?.method==='POST'){const b=JSON.parse(String(init.body));expect(Object.keys(b).sort()).toEqual(['key','value']);expect(typeof b.key).toBe('string');expect(b.value).not.toBeNull();expect(u.searchParams.get('on_conflict')).toBe('key');kv.set(b.key,b.value);return new Response(null,{status:201});}
    const key=u.searchParams.get('key')?.replace(/^eq\./,'')??'';
    if(init?.method==='DELETE'){expect([...u.searchParams.keys()]).toEqual(['key']);kv.delete(key);return new Response(null,{status:204});}
    return new Response(JSON.stringify(kv.has(key)?[{value:kv.get(key)}]:[]));
   }
   if((init?.method??'GET')!=='GET'||!tables.has(table))throw new Error('Unexpected synthetic request');
   const rows=table==='aplicaciones'?apps:[];
   return new Response(JSON.stringify(rows),{headers:{'content-range':rows.length?`0-${rows.length-1}/${rows.length}`:'*/0'}});
  });
  const first=await llmToolLoop([{role:'user',content:question}],user);
  if(oversizedList)expect(first.cohorteAplicaciones).toBeUndefined();
  else expect(first.cohorteAplicaciones?.ids).toEqual(apps.map(a=>a.id));
  const handle=await conservarCohorteAplicaciones(context(channel),sourceUser,sourceAssistant,question,first.cohorteAplicaciones);
  const bound=contextoDesdeHistorial(user,conversation,channel,history(handle));
  return {apps,kv,requests,bound,first,model:()=>model,compare:()=>llmToolLoop([{role:'user',content:question},{role:'assistant',content:'Incorrect prose: physical compliance proven'},{role:'user',content:followup}],user,undefined,bound)};
 }
 it.each(['web','telegram'] as const)('R02 to LC02 reuses actual membership and replaces model prose on %s',async channel=>{
  const f=await fixture(channel),answer=await f.compare();
  expect(answer.text).toContain('3 aplicaciones');expect(answer.text).toContain('Fin: planeada 2033-06-15; real 2033-05-15; diferentes.');
  expect(answer.text).toContain('iguales.');expect(answer.text).not.toContain('physical compliance proven');expect(f.model()).toBe(1);
  expect(answer.toolInteractions).toHaveLength(1);expect(answer.toolInteractions[0].args).toMatchObject({date_basis:'actual',date_from:'2033-05-01',date_to:'2033-05-31'});
 });
 it('KV adapter writes, reads and deletes using only key/value schema',async()=>{
  const f=await fixture();await f.compare();
  await conservarCohorteAplicaciones(f.bound,id(8),id(9),followup);
  expect((await f.compare()).text).toContain('listado reciente y verificable');
  const reads=f.requests.filter(r=>r.startsWith('GET ') && r.includes('/kv_store_1ccce916?'));
  expect(reads.length).toBe(2);for(const request of reads){const u=new URL(request.slice(4));expect(u.searchParams.get('order')).toBe('key.asc');expect(u.searchParams.get('select')).toBe('value');expect(u.searchParams.get('limit')).toBe('1');expect(u.searchParams.get('offset')).toBe('0');}
  expect(f.requests.filter(r=>r.startsWith('POST ') && r.includes('/kv_store_1ccce916?'))).toHaveLength(1);
  expect(f.requests.filter(r=>r.startsWith('DELETE ') && r.includes('/kv_store_1ccce916?'))).toHaveLength(1);
 });
 it('upserts one private user slot without an id column or repeated application query',async()=>{
  const f=await fixture();const replacement=await conservarCohorteAplicaciones(context(),id(20),id(21),question,f.first.cohorteAplicaciones);
  expect(replacement).toBeTruthy();expect(replacement).not.toBe(f.bound.anterior?.handle);expect(f.kv.size).toBe(1);
  expect((await f.compare()).text).toContain('listado reciente y verificable');expect(f.model()).toBe(1);
 });
 it('deletes an expired receipt through its exact key and requests a fresh list',async()=>{
  const f=await fixture();vi.setSystemTime(new Date(Date.now()+VIGENCIA_COHORTE_MS+1));
  expect((await f.compare()).text).toContain('listado reciente y verificable');expect(f.kv.size).toBe(0);
  expect(f.requests.some(r=>r.startsWith('DELETE ') && r.includes('/kv_store_1ccce916?key=eq.'))).toBe(true);
 });
 it.each([{status:400,code:'42703',message:'column kv_store_1ccce916.id does not exist'},{status:403,code:'42501',message:'permission denied for table kv_store_1ccce916'},{status:503,code:'PGRST002',message:'Could not query the database for the schema cache'}])('keeps KV read failure explicit and actionable without exposing SQL: $status',async ({status,code,message})=>{
  const f=await fixture(),original=globalThis.fetch;const diagnostic=vi.spyOn(console,'error').mockImplementation(()=>{});
  vi.stubGlobal('fetch',async(input:string,init?:RequestInit)=>input.includes('/kv_store_1ccce916?') && (init?.method??'GET')==='GET'?new Response(JSON.stringify({code,message}),{status}):original(input,init));
  let error:unknown;try{await f.compare();}catch(e){error=e;}
  expect(error).toBeInstanceOf(Error);expect((error as Error).message).toContain('No pude recuperar el contexto verificado');expect((error as Error).message).toContain('Consulta de nuevo el listado');
  expect((error as Error).message).not.toMatch(/kv_store|42703|42501|PGRST002|column/);expect(JSON.stringify(diagnostic.mock.calls)).toContain(code);expect(f.model()).toBe(1);diagnostic.mockRestore();
 });
 it.each(['transport','malformed-json'] as const)('KV %s failure never becomes an answer or raw client error',async mode=>{
  const f=await fixture(),original=globalThis.fetch;
  vi.stubGlobal('fetch',async(input:string,init?:RequestInit)=>{
   if(input.includes('/kv_store_1ccce916?') && (init?.method??'GET')==='GET'){
    if(mode==='transport')throw new TypeError('synthetic transport detail');return new Response('invalid synthetic JSON');
   }
   return original(input,init);
  });
  await expect(f.compare()).rejects.toThrow('No pude recuperar el contexto verificado');expect(f.model()).toBe(1);
 });
 it('context write failure issues no new handle and does not erase an earlier slot ad hoc',async()=>{
  const f=await fixture(),original=globalThis.fetch;vi.stubGlobal('fetch',async(input:string,init?:RequestInit)=>input.includes('/kv_store_1ccce916?') && init?.method==='POST'?new Response(null,{status:503}):original(input,init));
  expect(await conservarCohorteAplicaciones(context(),id(20),id(21),question,f.first.cohorteAplicaciones)).toBeUndefined();expect(f.kv.size).toBe(1);
 });
 it.each(['add','remove','replace'] as const)('rejects changed exact membership: %s',async change=>{
  const f=await fixture();if(change==='add')f.apps.push({...f.apps[0],id:id(99)});else if(change==='remove')f.apps.pop();else f.apps[0].id=id(99);
  expect((await f.compare()).text).toContain('No pude verificar la misma cohorte');expect(f.model()).toBe(1);
 });
 it('does not substitute a newly planned application without actual membership',async()=>{
  const f=await fixture();f.apps.push({...f.apps[0],id:id(99),fecha_inicio_ejecucion:null as unknown as string,fecha_fin_ejecucion:null as unknown as string});
  expect((await f.compare()).text).toContain('3 aplicaciones');
 });
 it('renders null/invalid pairs unknown and contradictory pairs without delay or causes',async()=>{
  const f=await fixture();f.apps[0].fecha_fin_ejecucion=null as unknown as string;f.apps[1].fecha_fin_planeada='2033-02-30';f.apps[2].fecha_fin_ejecucion='2033-05-01';
  const answer=await f.compare();expect(answer.text.match(/no verificable/g)?.length).toBeGreaterThanOrEqual(3);expect(answer.text).toContain('par inicio/final contradictorio');
  expect(f.model()).toBe(1);
 });
 it('never issues a receipt when the original complete list could not be shown',async()=>{
  const f=await fixture('web',true);expect(f.first.text).toContain('exceden el tamaño');expect(f.kv.size).toBe(0);
  expect((await f.compare()).text).toContain('listado reciente y verificable');expect(f.model()).toBe(1);
 });
 it('bounds fresh date output without claiming a silently shortened cohort is complete',async()=>{
  const f=await fixture();f.apps[0].nombre_aplicacion='synthetic-long-name-'.repeat(2000);
  const answer=await f.compare();expect(new TextEncoder().encode(answer.text).byteLength).toBeLessThanOrEqual(24000);expect(answer.text).toContain('listado más pequeño');expect(f.model()).toBe(1);
 });
 it('KV invalidation failure cannot block an unrelated completed answer or issue a forged handle',async()=>{
  const f=await fixture(),original=globalThis.fetch;
  vi.stubGlobal('fetch',async(input:string,init?:RequestInit)=>init?.method==='DELETE'?new Response(null,{status:503}):original(input,init));
  await expect(conservarCohorteAplicaciones(f.bound,id(8),id(9),'Jornales por lote')).resolves.toBeUndefined();
  const after=contextoDesdeHistorial(user,conversation,'web',[...history(f.bound.anterior?.handle),{id:id(9),role:'assistant',content:'labor result'},{id:id(10),role:'user',content:followup}]);
  expect(await cargarCohorte({get:async()=>{throw new Error('Must not access store without handle');},set:async()=>{},del:async()=>{}},after)).toBeNull();
 });
 it('missing old receipt clarifies without consulting a model or source',async()=>{
  const f=await fixture();f.kv.clear();const before=f.requests.length;
  expect((await f.compare()).text).toContain('listado reciente y verificable');expect(f.requests.slice(before)).toHaveLength(1);expect(f.model()).toBe(1);
 });
});
describe('bounded date contract',()=>{
 it('does not capture unrelated labor or planned-dose versus consumed quantity',()=>{
  for(const q of ['¿Cuántos jornales hubo por lote la semana pasada?','Compara el consumo real con las dosis planeadas de esas aplicaciones','En esas aplicaciones, ¿hay diferencias entre fechas planeadas y reales y por qué?'])expect(pideComparacionFechasCohorte(q)).toBe(false);
  expect(pideComparacionFechasCohorte(followup)).toBe(true);
 });
 it('rejects incomplete, duplicate and malformed evidence; empty complete cohort is valid',()=>{
  const plan=planRespuestaAplicacion(question,'2033-05-20'),args={date_basis:'actual',date_from:'2033-05-01',date_to:'2033-05-31'};
  const r={_evidencia:{herramienta:'get_aplicaciones_ejecucion',consulta_completa:true,detalle_completo:true,total_hechos:0,rango:{desde:args.date_from,hasta:args.date_to}},resumen:{date_basis:'actual'},seleccion:{estado:'verificada',version:'aplicacion_selector_v1',aplicacion_ids:null,lote_ids:null},detalle:[]};
  const cohort=capturarCohorteAplicaciones(plan,JSON.stringify(r),args,true);expect(cohort?.ids).toEqual([]);
  expect(capturarCohorteAplicaciones(plan,JSON.stringify(r),args,false)).toBeNull();
  expect(compararFechasCohorte(cohort!,plan,JSON.stringify(r),args)).toContain('vacío y sigue vacío');
  for(const changed of [{...r,contexto_recortado:true},{...r,error:null},{...r,_evidencia:{...r._evidencia,detalle_completo:false}},{...r,_evidencia:{...r._evidencia,total_hechos:1}},{...r,detalle:[{id:id(10)},{id:id(10)}],_evidencia:{...r._evidencia,total_hechos:2}}])expect(capturarCohorteAplicaciones(plan,JSON.stringify(changed),args,true)).toBeNull();
  expect(PROYECTO_COHORTE).toBe('ywhtjwawnkeqlwxbvgup');
 });
});
