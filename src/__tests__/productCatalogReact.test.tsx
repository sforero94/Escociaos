import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import {ProductForm} from '../components/inventory/ProductForm';
import {pendingCatalog} from '../utils/productCatalogIntegrity';
import {draftStorageKey,writeOwnedDraft} from '../utils/draftStorage';
import {owner,other,product,memory,storage,testLocks,sdkHarness,type Call} from './purchaseProtocolFixtures';
import {formFields,originalRow,catalogReceipt,catalogStatus} from './productCatalogFixtures';
const state=vi.hoisted(()=>({owner:'',client:null as unknown}));
vi.mock('@/utils/supabase/client',()=>({getSupabase:()=>state.client}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:state.owner}})}));
let tree:ReactTestRenderer;let target:string|null=null;
const closed=vi.fn();const success=vi.fn();
function view(open=true){return <ProductForm isOpen={open} productId={target} onClose={closed} onSuccess={success}/>;}
async function mount(){await act(async()=>{tree=create(view());});}
async function setup(run:(c:Call)=>unknown|Promise<unknown>){const h=await sdkHarness(run);state.client=h.client;return h;}
function change(name:string,value:string){act(()=>{tree.root.findAll(n=>n.props.name===name && typeof n.props.onChange==='function')[0].props.onChange({target:{name,value,type:['cantidad_actual','precio_unitario'].includes(name)?'number':'text'}});});}
async function submit(){await act(async()=>{await tree.root.findByType('form').props.onSubmit({preventDefault:vi.fn()});});}
async function click(label:string){await act(async()=>{await tree.root.findAllByType('button').find(b=>b.children.includes(label))!.props.onClick();});}
function draftKey(){return draftStorageKey(owner,target?`producto-edit-${target}`:'producto-new-v1')!;}
function saved(fields=formFields(),original:Record<string,unknown>|null=null){writeOwnedDraft(draftKey(),owner,{fields,original});}
beforeEach(()=>{memory.clear();state.owner=owner;target=null;closed.mockClear();success.mockClear();vi.stubGlobal('localStorage',storage);vi.stubGlobal('navigator',{locks:testLocks});vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn()});});
afterEach(()=>{act(()=>tree?.unmount());vi.unstubAllGlobals();});
describe('mounted ProductForm original snapshot and actual SDK protocol',()=>{
 it('restores create fields and submits atomic create instead of direct DML',async()=>{
  saved();const h=await setup(c=>catalogReceipt(c.body));await mount();expect(tree.root.findByProps({name:'nombre'}).props.value).toBe('Synthetic');await submit();
  expect(h.calls.map(c=>c.url.pathname)).toEqual(['/rest/v1/rpc/fn_product_catalog_post']);expect(success).toHaveBeenCalledOnce();expect(closed).toHaveBeenCalledOnce();expect(pendingCatalog(owner,null)).toBeNull();expect(memory.has(draftKey())).toBe(false);
 });
 it('loads complete original once and persists it together with immediate edited fields',async()=>{
  target=product;const row=originalRow();const h=await setup(c=>c.method==='GET'?row:catalogReceipt(c.body));await mount();change('nombre','Edited');
  const stored=JSON.parse(memory.get(draftKey())!).data;expect(stored.original).toEqual(row);expect(stored.fields.nombre).toBe('Edited');await submit();
  const p=h.calls.find(c=>c.method==='POST')!.body.p_payload;expect(p).toMatchObject({mode:'edit',original:row,fields:{nombre:'Edited'}});expect((p as {fields:unknown}).fields).not.toHaveProperty('cantidad_actual');
 });
 it('restored edits never fetch or silently rebase complete original',async()=>{
  target=product;const row=originalRow();saved({...formFields(),nombre:'Restored'},row);const h=await setup(c=>catalogReceipt(c.body));await mount();await submit();
  expect(h.calls).toHaveLength(1);expect(h.calls[0].body.p_payload).toMatchObject({original:row,fields:{nombre:'Restored'}});
 });
 it('legacy edit draft stays visible and refuses submit until explicit discard/reload',async()=>{
  target=product;writeOwnedDraft(draftKey(),owner,formFields());const h=await setup(c=>c.method==='GET'?originalRow():catalogReceipt(c.body));await mount();
  expect(JSON.stringify(tree.toJSON())).toContain('versión original');expect(tree.root.findByProps({name:'nombre'}).props.value).toBe('Synthetic');await submit();expect(h.calls).toHaveLength(0);
  await click('Empezar de nuevo');expect(h.calls[0].method).toBe('GET');expect(JSON.parse(memory.get(draftKey())!).data.original).toEqual(originalRow());
 });
 it('lost receipt persists original attempt and later unsent edits survive canceled resolution',async()=>{
  saved();const h=await setup(c=>c.url.pathname.endsWith('_status')?catalogStatus(c.body,false):null);await mount();await submit();expect(pendingCatalog(owner,null)).not.toBeNull();change('nombre','Later draft');
  await click('Verificar intento pendiente');expect(tree.root.findByProps({name:'nombre'}).props.value).toBe('Later draft');expect(JSON.stringify(tree.toJSON())).toContain('no se registró');expect(pendingCatalog(owner,null)).toBeNull();expect(h.calls).toHaveLength(2);
 });
 it('committed pending resolution preserves later draft with its original snapshot',async()=>{
  target=product;const row=originalRow();saved(formFields(),row);await setup(c=>c.url.pathname.endsWith('_status')?catalogStatus(c.body,true):null);await mount();await submit();change('nombre','Later edit');await click('Verificar intento pendiente');
  expect(tree.root.findByProps({name:'nombre'}).props.value).toBe('Later edit');expect(JSON.parse(memory.get(draftKey())!).data.original).toEqual(row);expect(closed).not.toHaveBeenCalled();expect(success).toHaveBeenCalledOnce();
 });
 it('account switch pending response preserves previous evidence and new owner draft',async()=>{
  saved();let release!:(v:unknown)=>void;let b!:Record<string,unknown>;await setup(c=>{b=c.body;return new Promise(resolve=>{release=resolve;});});await mount();
  let posting!:Promise<unknown>;act(()=>{posting=tree.root.findByType('form').props.onSubmit({preventDefault:vi.fn()});});await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
  state.owner=other;await act(async()=>tree.update(view()));change('nombre','New owner');await act(async()=>{release(catalogReceipt(b));await posting;});
  expect(tree.root.findByProps({name:'nombre'}).props.value).toBe('New owner');expect(pendingCatalog(owner,null)).not.toBeNull();expect(success).not.toHaveBeenCalled();
 });
 it('close/reopen and unmount invalidate delayed original response without clearing pending',async()=>{
  saved();let release!:(v:unknown)=>void;let b!:Record<string,unknown>;await setup(c=>{b=c.body;return new Promise(resolve=>{release=resolve;});});await mount();
  let posting!:Promise<unknown>;act(()=>{posting=tree.root.findByType('form').props.onSubmit({preventDefault:vi.fn()});});await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
  await act(async()=>tree.update(view(false)));await act(async()=>tree.update(view()));change('nombre','Reopened draft');await act(async()=>{release(catalogReceipt(b));await posting;});
  expect(tree.root.findByProps({name:'nombre'}).props.value).toBe('Reopened draft');expect(pendingCatalog(owner,null)).not.toBeNull();expect(success).not.toHaveBeenCalled();
 });
 it('deferred product read cannot overwrite user edits or another product session',async()=>{
  target=product;let release!:(v:unknown)=>void;const h=await setup(c=>c.method==='GET'?new Promise(resolve=>{release=resolve;}):catalogReceipt(c.body));await mount();change('nombre','User edit while loading');
  await act(async()=>release(originalRow()));expect(tree.root.findByProps({name:'nombre'}).props.value).toBe('User edit while loading');change('grupo','Agroinsumos');change('categoria','Fertilizante');change('unidad_medida','Kilos');await submit();expect(h.calls).toHaveLength(1);expect(JSON.stringify(tree.toJSON())).toContain('original');
 });
});
