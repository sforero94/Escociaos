import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { PropsWithChildren } from 'react';
import { NuevoMovimientoModal } from '@/components/inventory/NuevoMovimientoModal';
import { owner, other, product, movement, memory, storage, testLocks, sdkHarness, type Call } from './purchaseProtocolFixtures';
import { draftStorageKey } from '@/utils/draftStorage';
import type { ManualMovementPayload } from '@/utils/manualStockMovement';
const state=vi.hoisted(()=>({owner:'',client:null as unknown}));
vi.mock('@/utils/supabase/client',()=>({getSupabase:()=>state.client}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:state.owner}})}));
vi.mock('@/components/ui/dialog',()=>{
 const Box=({children}:PropsWithChildren)=><section>{children}</section>;
 return {Dialog:Box,DialogContent:Box,DialogHeader:Box,DialogTitle:Box,DialogDescription:Box,DialogBody:Box,DialogFooter:Box};
});
let tree:ReactTestRenderer;let props:{isOpen:boolean;onClose:()=>void;onSuccess:()=>void};
function result(c:Call){const p=c.body.p_payload as ManualMovementPayload;const after=p.tipo==='Entrada'?10+p.quantity:p.tipo==='Salida Otros'?10-p.quantity:p.quantity;return {actor:owner,request_key:c.body.p_request_key,producto_id:product,movement_id:after===10?null:movement,quantity_before:10,quantity_after:after,delta:Math.round((after-10)*100)/100,noop:after===10,p};}
async function harness(run:(c:Call)=>unknown|Promise<unknown>){
 const h=await sdkHarness(c=>c.url.pathname==='/rest/v1/productos'?[{id:product,nombre:'Synthetic product',unidad_medida:'Kilos',cantidad_actual:10,precio_unitario:1,activo:true,updated_at:'2026-10-10T10:00:00.123456+00:00'}]:run(c));state.client=h.client;return h;
}
async function mount(){await act(async()=>{tree=create(<NuevoMovimientoModal {...props}/>);});}
async function select(){
 await act(async()=>{tree.root.findAllByType('input').find(i=>i.props.placeholder==='Buscar producto por nombre...')!.props.onChange({target:{value:'Synthetic'}});});
 act(()=>{tree.root.findAllByType('button').find(b=>b.findAllByType('p').some(p=>p.children.includes('Synthetic product')))!.props.onClick();});
 act(()=>{tree.root.findAllByType('input').find(i=>i.props.type==='number')!.props.onChange({target:{value:'2.345'}});});
}
async function submit(){await act(async()=>{await tree.root.findByType('form').props.onSubmit({preventDefault:vi.fn()});});}
const slot=`manual_stock_attempt_v1:${owner}:${product}`;
beforeEach(()=>{memory.clear();state.owner=owner;props={isOpen:true,onClose:vi.fn(),onSuccess:vi.fn()};vi.stubGlobal('localStorage',storage);vi.stubGlobal('navigator',{locks:testLocks});});
afterEach(()=>{act(()=>tree?.unmount());vi.unstubAllGlobals();vi.useRealTimers();});
describe('mounted manual movement actual SDK and draft hook',()=>{
 it('keeps form after uncertain response and reuses original key, without direct writes',async()=>{
  let lose=true;const h=await harness(c=>{const {p:_,...r}=result(c);return lose?null:r;});await mount();await select();await submit();
  expect(props.onSuccess).not.toHaveBeenCalled();expect(memory.has(slot)).toBe(true);
  expect(tree.root.findAllByType('input').find(i=>i.props.type==='number')!.props.value).toBe('2.345');
  lose=false;await submit();const rpc=h.calls.filter(c=>c.url.pathname.includes('/rpc/'));
  expect(rpc[0].body).toEqual(rpc[1].body);expect(memory.has(slot)).toBe(false);expect(JSON.stringify(tree.toJSON())).toContain('Movimiento registrado exitosamente');
  expect(h.calls.every(c=>c.method==='GET'||c.url.pathname==='/rest/v1/rpc/fn_manual_stock_movement')).toBe(true);
 });
 it('shows explicit no-op confirmation when the corrected target equals current stock',async()=>{
  await harness(c=>{const {p:_,...r}=result(c);return r;});await mount();await select();
  act(()=>{tree.root.findAllByType('button').find(b=>b.children.includes('Ajuste'))!.props.onClick();tree.root.findAllByType('input').find(i=>i.props.type==='number')!.props.onChange({target:{value:'10'}});});
  await submit();expect(JSON.stringify(tree.toJSON())).toContain('No se creó un movimiento.');expect(memory.has(slot)).toBe(false);
 });
 it('keeps the reviewed form after SQL rejection and clears only a verified fenced-unposted attempt',async()=>{
  const h=await harness(c=>c.url.pathname.endsWith('fn_manual_stock_request_status')?{committed:false,result:null}:new Response(JSON.stringify({message:'Stock changed',code:'P0001'}),{status:400,headers:{'Content-Type':'application/json'}}));await mount();await select();await submit();
  expect(JSON.stringify(tree.toJSON())).toContain('El movimiento no se registró');expect(memory.has(slot)).toBe(false);expect(props.onSuccess).not.toHaveBeenCalled();
  expect(h.calls.filter(c=>c.url.pathname.includes('/rpc/')).map(c=>c.url.pathname)).toEqual(['/rest/v1/rpc/fn_manual_stock_movement','/rest/v1/rpc/fn_manual_stock_request_status']);
 });
 it('refuses changed input while a result remains unverified',async()=>{
  const h=await harness(()=>null);await mount();await select();await submit();
  act(()=>tree.root.findAllByType('input').find(i=>i.props.type==='number')!.props.onChange({target:{value:'3'}}));await submit();
  expect(h.calls.filter(c=>c.url.pathname.includes('/rpc/'))).toHaveLength(1);expect(JSON.stringify(tree.toJSON())).toContain('pendiente de verificar');
 });
 it('ignores a deferred posting after escape close and reopen, preserving the new form and original attempt',async()=>{
  let release!:(v:unknown)=>void;let original!:Call;
  await harness(c=>{original=c;return new Promise(resolve=>{release=resolve;});});await mount();await select();
  let pending!:Promise<void>;
  await act(async()=>{pending=tree.root.findByType('form').props.onSubmit({preventDefault:vi.fn()});});
  act(()=>tree.root.findAll(n=>typeof n.props.onOpenChange==='function')[0].props.onOpenChange(false));
  props={...props,isOpen:false};act(()=>tree.update(<NuevoMovimientoModal {...props}/>));
  props={...props,isOpen:true};act(()=>tree.update(<NuevoMovimientoModal {...props}/>));await select();
  act(()=>tree.root.findAllByType('input').find(i=>i.props.type==='number')!.props.onChange({target:{value:'3'}}));
  const key=draftStorageKey(owner,'movimiento-new-v1')!;
  memory.set(key,'new-form-draft');
  await act(async()=>{const {p:_,...r}=result(original);release(r);await pending;});
  expect(tree.root.findAllByType('input').find(i=>i.props.type==='number')!.props.value).toBe('3');
  expect(memory.get(key)).toBe('new-form-draft');expect(memory.has(slot)).toBe(true);
  expect(props.onSuccess).not.toHaveBeenCalled();expect(props.onClose).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(tree.toJSON())).not.toContain('Movimiento registrado exitosamente');
 });
 it('cancels a success timer when the form closes and reopens',async()=>{
  await harness(c=>{const {p:_,...r}=result(c);return r;});await mount();await select();vi.useFakeTimers();await submit();
  act(()=>tree.root.findAll(n=>typeof n.props.onOpenChange==='function')[0].props.onOpenChange(false));
  props={...props,isOpen:false};act(()=>tree.update(<NuevoMovimientoModal {...props}/>));
  props={...props,isOpen:true};act(()=>tree.update(<NuevoMovimientoModal {...props}/>));await select();
  act(()=>tree.root.findAllByType('input').find(i=>i.props.type==='number')!.props.onChange({target:{value:'3'}}));
  await act(async()=>{vi.advanceTimersByTime(2000);});
  expect(props.onSuccess).not.toHaveBeenCalled();expect(props.onClose).toHaveBeenCalledTimes(1);
  expect(tree.root.findAllByType('input').find(i=>i.props.type==='number')!.props.value).toBe('3');
 });
 it('ignores deferred old-owner search results after account switch',async()=>{
  let release!:(v:unknown)=>void;
  const h=await sdkHarness(c=>{
   if(c.url.pathname!=='/rest/v1/productos') throw new Error('Unexpected request');
   if(c.url.searchParams.get('nombre')==='ilike.%Old%') return new Promise(resolve=>{release=resolve;});
   return [{id:product,nombre:'New owner result',unidad_medida:'Kilos',cantidad_actual:10,precio_unitario:1,activo:true,updated_at:'2026-10-10T10:00:00Z'}];
  });state.client=h.client;await mount();
  await act(async()=>tree.root.findAllByType('input').find(i=>i.props.type==='text')!.props.onChange({target:{value:'Old'}}));
  state.owner=other;h.switchOwner(other);await act(async()=>tree.update(<NuevoMovimientoModal {...props}/>));
  await act(async()=>tree.root.findAllByType('input').find(i=>i.props.type==='text')!.props.onChange({target:{value:'New'}}));
  await act(async()=>release([{id:product,nombre:'Old owner result',unidad_medida:'Kilos',cantidad_actual:10,precio_unitario:1,activo:true,updated_at:'2026-10-10T10:00:00Z'}]));
  expect(JSON.stringify(tree.toJSON())).toContain('New owner result');expect(JSON.stringify(tree.toJSON())).not.toContain('Old owner result');
 });
 it('ignores an earlier query after a newer query completes',async()=>{
  let release!:(v:unknown)=>void;
  const h=await sdkHarness(c=>c.url.searchParams.get('nombre')==='ilike.%Old%'?new Promise(resolve=>{release=resolve;}):[{id:product,nombre:'Current query result',unidad_medida:'Kilos',cantidad_actual:10,precio_unitario:1,activo:true,updated_at:'2026-10-10T10:00:00Z'}]);
  state.client=h.client;await mount();
  await act(async()=>tree.root.findAllByType('input').find(i=>i.props.type==='text')!.props.onChange({target:{value:'Old'}}));
  await act(async()=>tree.root.findAllByType('input').find(i=>i.props.type==='text')!.props.onChange({target:{value:'New'}}));
  await act(async()=>release([{id:product,nombre:'Old query result',unidad_medida:'Kilos',cantidad_actual:10,precio_unitario:1,activo:true,updated_at:'2026-10-10T10:00:00Z'}]));
  expect(JSON.stringify(tree.toJSON())).toContain('Current query result');expect(JSON.stringify(tree.toJSON())).not.toContain('Old query result');
 });
 it('blocks same-render double submit and preserves owner evidence after an account switch',async()=>{
  let release!:(v:unknown)=>void;let original!:Call;const h=await harness(c=>{original=c;return new Promise(resolve=>{release=resolve;});});await mount();await select();
  const handler=tree.root.findByType('form').props.onSubmit;let pending!:Promise<void>;
  await act(async()=>{pending=handler({preventDefault:vi.fn()});await handler({preventDefault:vi.fn()});});
  expect(h.calls.filter(c=>c.url.pathname.includes('/rpc/'))).toHaveLength(1);
  state.owner=other;h.switchOwner(other);act(()=>tree.update(<NuevoMovimientoModal {...props}/>));
  await act(async()=>{const {p:_,...r}=result(original);release(r);await pending;});
  expect(props.onSuccess).not.toHaveBeenCalled();expect(props.onClose).not.toHaveBeenCalled();expect(memory.has(slot)).toBe(true);
  expect(JSON.stringify(tree.toJSON())).not.toContain('Movimiento registrado exitosamente');
 });
});
