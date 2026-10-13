/** Audit proof: real SDK sessions/headers, synthetic server commits; no live requests. */
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { postPurchase } from '../utils/purchaseIntegrity';
import { postManualMovement, buildManualMovementPayload } from '../utils/manualStockMovement';
import { postCatalog, postActivation, catalogPayload, activationPayload } from '../utils/productCatalogIntegrity';
import { closeApplication } from '../utils/applicationClosureIntegrity';
import { deleteUnusedPlan } from '../utils/applicationPlanDelete';
import { construirPayloadCierreAplicacion } from '../utils/calculosCierreAplicacion';
import { importCsvProducts } from '../utils/csvProductImport';
import { parseCsvProducts } from '../supabase/functions/server/csv-product-import';
import { owner, other, product, purchase, movement, line, expected, memory, storage, testLocks } from './purchaseProtocolFixtures';
import { formFields, originalRow, catalogReceipt } from './productCatalogFixtures';
const jwt = (actor:string) => `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify({sub:actor,exp:4102444800}))}.c3ludGhldGlj`;
const fromBearer = (headers:HeadersInit|undefined) => {
 const token=new Headers(headers).get('Authorization')?.replace(/^Bearer /,'');
 if(!token || token.split('.').length!==3)throw Error('No actual SDK Bearer');
 return JSON.parse(atob(token.split('.')[1])).sub as string;
};
const raw='nombre,categoria,grupo,unidad_medida,cantidad_actual\nSynthetic,Fertilizante,Agroinsumos,Kilos,2.345';
const closureExpected={aplicacion:{id:purchase,updated_at:'2026-10-10T10:00:00.123456Z'},registros_trabajo:[],empleados:[],contratistas:[]};
const planExpected={aplicaciones:{id:purchase,estado:'Calculada'},tarea:{id:product},aplicaciones_lotes:[{id:product}],aplicaciones_mezclas:[],aplicaciones_productos:[],aplicaciones_calculos:[],aplicaciones_compras:[]};
function catalogForActor(body:Record<string,unknown>,actor:string){
 const r=catalogReceipt(body);r.actor=actor;r.product.updated_by=actor;r.audit.actor=actor;if(r.opening)r.opening.actor=actor;return r;
}
function serverReceipt(name:string,body:Record<string,unknown>,actor:string):unknown {
 if(name==='fn_purchase_post')return{purchases:[{purchase_id:purchase,movement_id:movement,expected:{...expected,usuario_registro:`${actor}@synthetic.invalid`}}]};
 if(name==='fn_manual_stock_movement')return{actor,request_key:body.p_request_key,producto_id:product,movement_id:movement,quantity_before:10,quantity_after:12,delta:2,noop:false};
 if(name==='fn_product_catalog_post')return catalogForActor(body,actor);
 if(name==='fn_application_close')return{request_key:body.p_request_key,receipt:{aplicacionId:purchase,cierreId:movement,registrosEliminados:0,registrosInsertados:0,registrosActualizados:0,productosActualizados:1}};
 if(name==='fn_application_plan_delete')return{request_key:body.p_request_key,receipt:{actor,request_key:body.p_request_key,application_id:purchase,deleted:{aplicaciones:[purchase],aplicaciones_lotes:[product],aplicaciones_mezclas:[],aplicaciones_productos:[],aplicaciones_calculos:[],aplicaciones_compras:[]},preserved_task_id:product}};
 if(name==='activation')return catalogForActor({p_request_key:body.requestKey,p_payload:activationPayload(body.original as Record<string,unknown>,body.activo as boolean)},actor);
 if(name==='csv'){
  const p=parseCsvProducts(String(body.csvData));return{success:true,actor,requestKey:body.requestKey,parserVersion:1,csvSha256:createHash('sha256').update(p.raw_csv).digest('hex'),total:1,importados:1,message:'Imported atomically',products:p.products.map(v=>({product_id:product,opening_quantity:v.cantidad_actual,movement_id:movement,product:{...v,id:product,updated_by:actor}}))};
 }
 throw Error(`Unexpected synthetic endpoint ${name}`);
}
async function harness(switchAtGuard=0){
 let userReads=0,switched=false,guardCalls=0;let switchPromise:Promise<unknown>|undefined;
 const events:Array<{kind:string;actor:string;name?:string;body?:Record<string,unknown>}>=[];
 const commits:Array<{actor:string;name:string;body:Record<string,unknown>}>=[];
 const requests:Array<{actor:string;name:string;body:Record<string,unknown>}>=[];
 const transport=async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(String(input));if(url.hostname!=='localhost.invalid')throw Error(`Network escape ${url}`);
  const actor=fromBearer(init?.headers);
  if(url.pathname==='/auth/v1/user'){userReads++;events.push({kind:'getUser',actor});return new Response(JSON.stringify({id:actor,email:`${actor}@synthetic.invalid`}),{headers:{'Content-Type':'application/json'}});}
  const name=url.pathname.split('/').pop()!;const body=JSON.parse(String(init?.body));events.push({kind:'request',actor,name,body});
  requests.push({actor,name,body});
  // Mirrors separately exercised SQL equality admission; real actual-headers remain the actor.
  if(name.startsWith('fn_')&&(body.p_expected_owner===null||body.p_expected_owner!==actor))return new Response(JSON.stringify({message:'Expected operation owner/session mismatch',code:'42501'}),{status:403,headers:{'Content-Type':'application/json'}});
  // HTTP controls use a captured verified human token.
  commits.push({actor,name,body});return new Response(JSON.stringify(serverReceipt(name,body,actor)),{headers:{'Content-Type':'application/json'}});
 };
 const client=createClient('https://localhost.invalid','synthetic-anon',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:transport}});
 const initial=await client.auth.setSession({access_token:jwt(owner),refresh_token:'synthetic-A'});expect(initial.error).toBeNull();userReads=0;events.length=0;
 vi.stubGlobal('fetch',transport);
 // Called by the unchanged helper after its real final getUser check. Keep old UI current=true.
 const current=()=>{
  guardCalls++;
  if(userReads===2&&!switched&&guardCalls>=switchAtGuard){switched=true;events.push({kind:'switch-start',actor:other});switchPromise=client.auth.setSession({access_token:jwt(other),refresh_token:'synthetic-B'}).then(r=>{expect(r.error).toBeNull();events.push({kind:'switch-complete',actor:other});});}
  return true;
 };
 return{client,current,commits,requests,events,settled:async()=>{await switchPromise;expect((await client.auth.getSession()).data.session?.user.id).toBe(other);}};
}
beforeEach(()=>{memory.clear();vi.stubGlobal('localStorage',storage);vi.stubGlobal('navigator',{locks:testLocks});});afterEach(()=>vi.unstubAllGlobals());
const runs=[
 {name:'purchase',call:(h:Awaited<ReturnType<typeof harness>>)=>postPurchase(h.client,owner,{lines:[line]},h.current)},
 {name:'manual',call:(h:Awaited<ReturnType<typeof harness>>)=>postManualMovement(h.client,owner,buildManualMovementPayload({id:product,cantidad_actual:10,updated_at:'2026-10-10T10:00:00Z'},'Entrada','2','2026-10-10','Original'),h.current)},
 {name:'catalog',call:(h:Awaited<ReturnType<typeof harness>>)=>postCatalog(h.client,owner,null,catalogPayload(formFields(),null),'post',h.current)},
 {name:'closure',call:(h:Awaited<ReturnType<typeof harness>>)=>closeApplication(h.client,owner,construirPayloadCierreAplicacion({aplicacionId:purchase,registrosEditados:[],datosFinales:{fechaInicioReal:'2026-10-10',fechaFinReal:'2026-10-10',observaciones:'Original'},lotes:[{lote_id:product,nombre:'Lot',arboles:100}],movimientos:[{producto_id:product,producto_nombre:'Product',cantidad_utilizada:2.345,costo_unitario:2}]}),closureExpected,h.current)},
 {name:'plan-delete',call:(h:Awaited<ReturnType<typeof harness>>)=>deleteUnusedPlan(h.client,owner,purchase,planExpected,h.current)},
];
it.each(runs)('REGRESSION: $name rejects switched JWT before mutation and preserves original owner attempt',async({call})=>{
 const h=await harness();await expect(call(h)).rejects.toThrow();await h.settled();
 expect(h.commits).toHaveLength(0);expect(h.requests).toHaveLength(1);expect(h.requests[0].actor).toBe(other);expect(h.requests[0].body.p_expected_owner).toBe(owner);
 expect(h.events.filter(e=>e.kind==='getUser').slice(0,2).map(e=>e.actor)).toEqual([owner,owner]);
 const sent=h.events.findIndex(e=>e.kind==='request');expect(h.events.findIndex(e=>e.kind==='switch-start')).toBeLessThan(sent);
 expect([...memory.keys()].some(k=>k.includes(owner))).toBe(true);expect([...memory.keys()].some(k=>k.includes(other))).toBe(false);
 const saved=JSON.parse([...memory.entries()].find(([key])=>key.includes(owner))![1]);expect(saved.owner).toBe(owner);expect(saved.key).toBe(h.requests[0].body.p_request_key);
});
it('CONTROL: activation checks changed SDK session before any HTTP mutation',async()=>{
 const h=await harness();await expect(postActivation(h.client,'https://localhost.invalid/activation',owner,product,originalRow(),false,'post',h.current)).rejects.toThrow();await h.settled();expect(h.commits).toEqual([]);
});
it('CONTROL: CSV retains captured owner token across later singleton session switch',async()=>{
 const h=await harness();await expect(importCsvProducts(h.client,'https://localhost.invalid/csv',owner,raw,'import',h.current)).rejects.toThrow();await h.settled();expect(h.commits).toHaveLength(1);expect(h.commits[0].actor).toBe(owner);expect([...memory.keys()].some(k=>k.includes(owner))).toBe(true);
});

it('CONTROL: activation also keeps fixed A Bearer when switch occurs after captured-session owner check',async()=>{
 // First authorize, final authorize, then the adapter's captured-session current check.
 const h=await harness(3);await postActivation(h.client,'https://localhost.invalid/activation',owner,product,originalRow(),false,'post',h.current).catch(()=>null);await h.settled();
 expect(h.commits).toHaveLength(1);expect(h.commits[0].actor).toBe(owner);
});
