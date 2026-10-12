import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {catalogPayload,postCatalog,pendingCatalog} from '../utils/productCatalogIntegrity';
import {owner,other,product,memory,storage,testLocks,sdkHarness} from './purchaseProtocolFixtures';
import {formFields,originalRow,catalogReceipt,catalogStatus} from './productCatalogFixtures';
beforeEach(()=>{memory.clear();vi.stubGlobal('localStorage',storage);vi.stubGlobal('navigator',{locks:testLocks});});
afterEach(()=>vi.unstubAllGlobals());
describe('actual Auth SDK catalog RPC and durable protocol',()=>{
 it('creates exact nullable fields and opening with stable human RPC key',async()=>{
  const h=await sdkHarness(c=>catalogReceipt(c.body));const p=catalogPayload(formFields(),null);expect((await postCatalog(h.client,owner,null,p))?.product).toBeDefined();
  expect(h.calls).toHaveLength(1);expect(h.calls[0].url.pathname).toBe('/rest/v1/rpc/fn_product_catalog_post');expect(h.calls[0].body.p_payload).toEqual(p);expect(pendingCatalog(owner,null)).toBeNull();
 });
 it('blank and explicit zero opening receipts require zero proof and no ledger',async()=>{
  for(const quantity of ['',0]){
   const h=await sdkHarness(c=>catalogReceipt(c.body));const result=await postCatalog(h.client,owner,null,catalogPayload({...formFields(),cantidad_actual:quantity},null));
   expect(result?.movement_id).toBeNull();expect(result?.opening).toMatchObject({quantity_before:0,quantity_after:0,movement_snapshot:null});
  }
 });
 it('edits preserve full ORIGINAL snapshot and omit stock and activation',async()=>{
  const h=await sdkHarness(c=>catalogReceipt(c.body));const original=originalRow();const p=catalogPayload({...formFields(),nombre:'Edited'},original);
  await postCatalog(h.client,owner,product,p);expect(p.original).toEqual(original);expect(p.fields).not.toHaveProperty('cantidad_actual');expect(p.fields).not.toHaveProperty('activo');
 });
 it('validates every numeric value before reserving and rounds positive decimal exactly',()=>{
  expect(catalogPayload({...formFields(),precio_unitario:1.005},null).fields.precio_unitario).toBe(1.01);
  for(const field of ['precio_unitario','stock_minimo','cantidad_actual','concentracion_ia_3','nitrogeno','periodo_carencia_dias'])for(const value of [NaN,Infinity,-0.0001])expect(()=>catalogPayload({...formFields(),[field]:value},null)).toThrow();
  for(const [key,value] of [['periodo_carencia_dias',1.5],['nitrogeno',101],['cantidad_actual',1e10]])expect(()=>catalogPayload({...formFields(),[key]:value},null)).toThrow();
 });
 it('unknown response retains exact original payload and key; changed request cannot replace',async()=>{
  let lost=true;const h=await sdkHarness(c=>lost?null:catalogReceipt(c.body));const p=catalogPayload(formFields(),originalRow());
  await expect(postCatalog(h.client,owner,product,p)).rejects.toThrow('pendiente');const pending=pendingCatalog(owner,product)!;
  await expect(postCatalog(h.client,owner,product,catalogPayload({...formFields(),nombre:'New'},originalRow()))).rejects.toThrow('original');
  lost=false;await postCatalog(h.client,owner,product,p);expect(h.calls[1].body.p_request_key).toBe(pending.key);expect(h.calls[1].body.p_payload).toEqual(pending.payload);
 });
 it('resolve uses status only and retains later unsent fields outside the attempt',async()=>{
  const h=await sdkHarness(c=>c.url.pathname.endsWith('_status')?catalogStatus(c.body,true):null);
  await expect(postCatalog(h.client,owner,null,catalogPayload(formFields(),null))).rejects.toThrow();
  const before=pendingCatalog(owner,null)!;expect(await postCatalog(h.client,owner,null,null,'resolve')).toBeDefined();
  expect(h.calls[1].body).toEqual({p_request_key:before.key,p_payload:before.payload});expect(h.calls[1].url.pathname).toBe('/rest/v1/rpc/fn_product_catalog_status');expect(pendingCatalog(owner,null)).toBeNull();
 });
 it('clears only exact canceled proof and preserves malformed status evidence',async()=>{
  let forged=true;const h=await sdkHarness(c=>c.url.pathname.endsWith('_status')?{...catalogStatus(c.body,false),...(forged?{actor:other}:{})}:null);
  await expect(postCatalog(h.client,owner,null,catalogPayload(formFields(),null))).rejects.toThrow();
  await expect(postCatalog(h.client,owner,null,null,'resolve')).rejects.toThrow();expect(pendingCatalog(owner,null)).not.toBeNull();
  forged=false;expect(await postCatalog(h.client,owner,null,null,'resolve')).toBeNull();expect(pendingCatalog(owner,null)).toBeNull();
 });
 it('refuses forged audit, payload, stock or opening proofs without clearing',async()=>{
  const mutations:Array<(r:ReturnType<typeof catalogReceipt>)=>unknown>=[(r:ReturnType<typeof catalogReceipt>)=>({...r,actor:other}),r=>({...r,payload:{...r.payload,mode:'edit'}}),
   r=>({...r,audit:{...r.audit,before_row:{}}}),r=>({...r,product:{...r.product,cantidad_actual:99}}),r=>({...r,movement_id:null}),
   r=>({...r,opening:{...r.opening!,quantity_after:99}})];
  for(const mutation of mutations){
   memory.clear();const h=await sdkHarness(c=>mutation(catalogReceipt(c.body)));await expect(postCatalog(h.client,owner,null,catalogPayload(formFields(),null))).rejects.toThrow();expect(pendingCatalog(owner,null)).not.toBeNull();
  }
 });
 it('refuses SDK account switch before reservation and stale lifecycle after response',async()=>{
  const h=await sdkHarness(c=>catalogReceipt(c.body));h.switchOwner(other);await expect(postCatalog(h.client,owner,null,catalogPayload(formFields(),null))).rejects.toThrow('sesión');expect(memory.size).toBe(0);
  let release!:(v:unknown)=>void;let b!:Record<string,unknown>;let current=true;
  const deferred=await sdkHarness(c=>{b=c.body;return new Promise(resolve=>{release=resolve;});});
  const posting=postCatalog(deferred.client,owner,null,catalogPayload(formFields(),null),'post',()=>current);
  await vi.waitFor(()=>expect(release).toBeTypeOf('function'));current=false;release(catalogReceipt(b));await expect(posting).rejects.toThrow('formulario');expect(pendingCatalog(owner,null)).not.toBeNull();
 });
 it('cross-tab changed reservation cannot double post',async()=>{
  let release!:(v:unknown)=>void;let b!:Record<string,unknown>;const h=await sdkHarness(c=>{b=c.body;return new Promise(resolve=>{release=resolve;});});
  const posting=postCatalog(h.client,owner,null,catalogPayload(formFields(),null));await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
  await expect(postCatalog(h.client,owner,null,catalogPayload({...formFields(),nombre:'Other'},null))).rejects.toThrow('pendiente');release(catalogReceipt(b));await posting;expect(h.calls).toHaveLength(1);
 });
});
