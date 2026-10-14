import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { buildManualMovementPayload, normalizeManualQuantity, postManualMovement, type ManualMovementPayload, type ManualStockClient } from '@/utils/manualStockMovement';
import { owner, other, product, movement, memory, storage, testLocks, sdkHarness } from './purchaseProtocolFixtures';
const selected = { id:product,cantidad_actual:10,updated_at:'2026-10-10T10:00:00.123456+00:00' };
const payload = () => buildManualMovementPayload(selected,'Entrada','2.345','2026-10-10','note');
const slot = `manual_stock_attempt_v1:${owner}:${product}`;
function receipt(body: Record<string,unknown>) {
  const p=body.p_payload as ManualMovementPayload;
  const after=p.tipo==='Entrada'?10+p.quantity:p.tipo==='Salida Otros'?10-p.quantity:p.quantity;
  return { actor:owner,request_key:body.p_request_key,producto_id:product,movement_id:after===10?null:movement,quantity_before:10,quantity_after:after,delta:after-10,noop:after===10 };
}
const client=(c:unknown)=>c as ManualStockClient;
beforeEach(()=>{memory.clear();vi.stubGlobal('localStorage',storage);vi.stubGlobal('navigator',{locks:testLocks});});
afterEach(()=>vi.unstubAllGlobals());
describe('manual movement actual SDK protocol',()=>{
 it('preserves original exact payload and key after response loss, including submillisecond revision',async()=>{
  let lose=true;const h=await sdkHarness(c=>lose?null:receipt(c.body));
  await expect(postManualMovement(client(h.client),owner,payload())).rejects.toThrow();
  const original=memory.get(slot);lose=false;
  await postManualMovement(client(h.client),owner,{...payload(),observed_quantity:12.35,observed_revision:'2026-10-10T11:00:00Z',fecha:'2026-10-11'});
  expect(h.calls[0].body).toEqual(h.calls[1].body);expect(original).toContain('.123456+00:00');expect(memory.has(slot)).toBe(false);
  expect(h.calls.every(c=>c.url.pathname==='/rest/v1/rpc/fn_manual_stock_movement')).toBe(true);
 });
 it('uses fenced status proof to clear a failed unposted request before fresh review',async()=>{
  const h=await sdkHarness(c=>c.url.pathname.endsWith('fn_manual_stock_request_status')?{committed:false,result:null}:new Response(JSON.stringify({message:'Stock changed',code:'P0001'}),{status:400,headers:{'Content-Type':'application/json'}}));
  await expect(postManualMovement(client(h.client),owner,payload())).rejects.toThrow('no se registró');
  expect(memory.has(slot)).toBe(false);expect(h.calls[0].body).toEqual(h.calls[1].body);
 });
 it('recovers a committed receipt through status after the original transport failed',async()=>{
  const h=await sdkHarness(c=>c.url.pathname.endsWith('fn_manual_stock_request_status')?{committed:true,result:receipt(c.body)}:new Response(JSON.stringify({message:'Lost gateway response'}),{status:502,headers:{'Content-Type':'application/json'}}));
  expect(await postManualMovement(client(h.client),owner,payload())).toEqual({noop:false});expect(memory.has(slot)).toBe(false);
 });
 it('retains evidence when status cannot prove either committed or fenced-unposted state',async()=>{
  const h=await sdkHarness(c=>c.url.pathname.endsWith('fn_manual_stock_request_status')?null:new Response(JSON.stringify({message:'Unknown'}),{status:502,headers:{'Content-Type':'application/json'}}));
  await expect(postManualMovement(client(h.client),owner,payload())).rejects.toThrow();expect(memory.has(slot)).toBe(true);
 });
 it('blocks altered business data while outcome is uncertain',async()=>{
  const h=await sdkHarness(()=>null);await expect(postManualMovement(client(h.client),owner,payload())).rejects.toThrow();
  await expect(postManualMovement(client(h.client),owner,{...payload(),quantity:3})).rejects.toThrow('pendiente');expect(h.calls).toHaveLength(1);
 });
 it('concurrent matching callers reserve one key before either response completes',async()=>{
  const h=await sdkHarness(()=>null);await Promise.allSettled([postManualMovement(client(h.client),owner,payload()),postManualMovement(client(h.client),owner,payload())]);
  expect(h.calls).toHaveLength(2);expect(h.calls[0].body).toEqual(h.calls[1].body);
 });
 it.each([null,{}, { actor:other },{ noop:true }])('retains retry state for malformed receipt %j',async value=>{
  const h=await sdkHarness(()=>value);await expect(postManualMovement(client(h.client),owner,payload())).rejects.toThrow();expect(memory.has(slot)).toBe(true);
 });
 it('accepts only consistent exact signed result and no-op shape',async()=>{
  for(const mutate of [(r:Record<string,unknown>)=>({...r,delta:999}),(r:Record<string,unknown>)=>({...r,quantity_after:999}),(r:Record<string,unknown>)=>({...r,actor:other}),(r:Record<string,unknown>)=>({...r,extra:true})]){
   memory.clear();const h=await sdkHarness(c=>mutate(receipt(c.body)));await expect(postManualMovement(client(h.client),owner,payload())).rejects.toThrow();expect(memory.has(slot)).toBe(true);
  }
  memory.clear();const h=await sdkHarness(c=>receipt(c.body));expect(await postManualMovement(client(h.client),owner,buildManualMovementPayload(selected,'Ajuste','10','2026-10-10','note'))).toEqual({noop:true});
 });
 it('retains original owner attempt after account switch during RPC',async()=>{
  const h=await sdkHarness(c=>{h.switchOwner(other);return receipt(c.body);});await expect(postManualMovement(client(h.client),owner,payload())).rejects.toThrow('sesión');expect(memory.has(slot)).toBe(true);
 });
 it('fails before RPC if session, durable storage or Web Locks cannot verify',async()=>{
  const h=await sdkHarness(c=>receipt(c.body));h.switchOwner(other);await expect(postManualMovement(client(h.client),owner,payload())).rejects.toThrow();expect(h.calls).toHaveLength(0);
  h.switchOwner(owner);vi.stubGlobal('localStorage',{...storage,setItem:()=>{throw new Error('quota');}});await expect(postManualMovement(client(h.client),owner,payload())).rejects.toThrow('quota');expect(h.calls).toHaveLength(0);
  vi.stubGlobal('navigator',{});await expect(postManualMovement(client(h.client),owner,payload())).rejects.toThrow('navegador');
 });
 it('refuses corrupt/foreign attempts without replacing evidence',async()=>{
  const h=await sdkHarness(c=>receipt(c.body));for(const raw of ['{',JSON.stringify({owner:other,key:movement,payload:payload()})]){
   memory.set(slot,raw);await expect(postManualMovement(client(h.client),owner,payload())).rejects.toThrow();expect(memory.get(slot)).toBe(raw);
  }expect(h.calls).toHaveLength(0);
 });
});
describe('decimal movement input',()=>{
 it.each([['1.005',1.01],['0.005',0.01],['9999999999.99',9999999999.99]])('normalizes %s exactly', (input,expected)=>expect(normalizeManualQuantity(input as string,false)).toBe(expected));
 it.each(['NaN','Infinity','1suffix','1e2','-1','0','0.004','9999999999.995'])('refuses invalid entry %s',input=>expect(()=>normalizeManualQuantity(input,false)).toThrow());
 it('preserves zero correction target',()=>expect(normalizeManualQuantity('0',true)).toBe(0));
});
