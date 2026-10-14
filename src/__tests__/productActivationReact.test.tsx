import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import {InventoryList} from '../components/inventory/InventoryList';
import {activationPayload,pendingCatalog} from '../utils/productCatalogIntegrity';
import {owner,other,product,memory,storage,testLocks,sdkHarness} from './purchaseProtocolFixtures';
import {originalRow,catalogReceipt,catalogStatus} from './productCatalogFixtures';
const state=vi.hoisted(()=>({owner:'',permitted:true,client:null as unknown,toast:{success:vi.fn(),error:vi.fn(),info:vi.fn()}}));
vi.mock('@/utils/supabase/client',()=>({getSupabase:()=>state.client}));
vi.mock('@/utils/supabase/config',()=>({getSupabaseConfig:()=>({url:'https://toggle.invalid'})}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:state.owner},profile:{id:state.owner,rol:'Administrador',activo:state.permitted}})}));
vi.mock('@/contexts/SafeModeContext',()=>({useSafeMode:()=>({isSafeModeEnabled:false})}));
vi.mock('react-router-dom',()=>({useNavigate:()=>vi.fn(),Link:({children}:{children:React.ReactNode})=><div>{children}</div>}));
vi.mock('@/components/inventory/InventorySubNav',()=>({InventorySubNav:()=>null}));
vi.mock('@/components/inventory/ExportarInventarioDialog',()=>({ExportarInventarioDialog:()=>null}));
vi.mock('sonner',()=>({toast:state.toast}));
let tree:ReactTestRenderer;let row:Record<string,unknown>;let requests:Array<Record<string,unknown>>;
function view(){return <InventoryList productosIniciales={[row] as unknown as Parameters<typeof InventoryList>[0]['productosIniciales']}/>;}
async function mount(){await act(async()=>{tree=create(view());});}
async function setup(run:(body:Record<string,unknown>)=>unknown|Promise<unknown>){const h=await sdkHarness(()=>{throw new Error('No direct DML/RPC fallback');});state.client=h.client;
 vi.stubGlobal('fetch',vi.fn(async(url:unknown,init:RequestInit)=>{expect(String(url)).toContain('/inventario/toggle-producto-activo');expect(new Headers(init.headers).get('Authorization')).toMatch(/^Bearer /);
  const body=JSON.parse(String(init.body));requests.push(body);const value=await run(body);return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});}));return h;}
function receipt(b:Record<string,unknown>){return catalogReceipt({p_request_key:b.requestKey,p_payload:activationPayload(b.original as Record<string,unknown>,b.activo as boolean)});}
function status(b:Record<string,unknown>,committed:boolean){return catalogStatus({p_request_key:b.requestKey,p_payload:activationPayload(b.original as Record<string,unknown>,b.activo as boolean)},committed);}
async function toggle(){await act(async()=>{tree.root.findAllByType('button').find(b=>b.props.title?.includes('activar producto'))!.props.onClick({stopPropagation:vi.fn()});});}
async function click(text:string){await act(async()=>{tree.root.findAllByType('button').find(b=>b.children.includes(text))!.props.onClick({stopPropagation:vi.fn()});});}
beforeEach(()=>{memory.clear();row=originalRow();requests=[];state.owner=owner;state.permitted=true;Object.values(state.toast).forEach(fn=>fn.mockClear());vi.stubGlobal('localStorage',storage);vi.stubGlobal('navigator',{locks:testLocks});});
afterEach(()=>{act(()=>tree?.unmount());vi.unstubAllGlobals();});
describe('mounted inventory activation with actual SDK session and durable route',()=>{
 it('uses displayed full original, updates verified row only and never refetches to rebase',async()=>{
  const h=await setup(receipt);await mount();await toggle();await vi.waitFor(()=>expect(state.toast.success).toHaveBeenCalledOnce());
  expect(requests[0]).toMatchObject({original:row,activo:false,action:'post'});expect(h.calls).toHaveLength(0);expect(pendingCatalog(owner,product)).toBeNull();
 });
 it('unknown outcome preserves original and exposes same-key retry',async()=>{
  let lost=true;await setup(b=>lost?null:receipt(b));await mount();await toggle();await vi.waitFor(()=>expect(state.toast.error).toHaveBeenCalled());const first=pendingCatalog(owner,product)!;
  lost=false;await click('Reintentar estado pendiente');await vi.waitFor(()=>expect(state.toast.success).toHaveBeenCalledOnce());expect(requests[1].requestKey).toBe(first.key);expect(requests[1].original).toEqual(first.payload.original);
 });
 it('status cancellation clears only stored proof without a second mutation',async()=>{
  await setup(b=>b.action==='resolve'?status(b,false):null);await mount();await toggle();await vi.waitFor(()=>expect(state.toast.error).toHaveBeenCalled());await click('Verificar estado pendiente');
  await vi.waitFor(()=>expect(state.toast.info).toHaveBeenCalledOnce());expect(requests.map(b=>b.action)).toEqual(['post','resolve']);expect(pendingCatalog(owner,product)).toBeNull();
 });
 it('shows null current active as undefined and deliberately targets true',async()=>{
  row={...row,activo:null};await setup(receipt);await mount();expect(JSON.stringify(tree.toJSON())).toContain('Estado sin definir');
  await act(async()=>tree.root.findAllByType('button').find(b=>b.props.title==='Estado sin definir: Activar producto')!.props.onClick({stopPropagation:vi.fn()}));
  await vi.waitFor(()=>expect(state.toast.success).toHaveBeenCalledOnce());expect(requests[0]).toMatchObject({original:{activo:null},activo:true});
 });
 it('incomplete display snapshot refuses before reservation and leaves no false pending controls',async()=>{
  delete row.updated_at;await setup(receipt);await mount();await toggle();await vi.waitFor(()=>expect(state.toast.error).toHaveBeenCalled());
  expect(requests).toHaveLength(0);expect(pendingCatalog(owner,product)).toBeNull();expect(JSON.stringify(tree.toJSON())).not.toContain('Verificar estado pendiente');
 });
 it('denied browser profile performs no mutation request',async()=>{
  state.permitted=false;await setup(receipt);await mount();await toggle();expect(requests).toHaveLength(0);expect(state.toast.error).toHaveBeenCalled();
 });
 it('account switch or unmount after posting keeps original pending evidence and suppresses old result',async()=>{
  let release!:(v:unknown)=>void;let b!:Record<string,unknown>;await setup(body=>{b=body;return new Promise(resolve=>{release=resolve;});});await mount();await toggle();await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
  state.owner=other;await act(async()=>tree.update(view()));await act(async()=>release(receipt(b)));await vi.waitFor(()=>expect(pendingCatalog(owner,product)).not.toBeNull());expect(state.toast.success).not.toHaveBeenCalled();
 });
 it('profile revocation during pending result retains evidence and permits status after restoration',async()=>{
  let release!:(v:unknown)=>void;let b!:Record<string,unknown>;await setup(body=>body.action==='resolve'?status(body,true):new Promise(resolve=>{b=body;release=resolve;}));await mount();await toggle();await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
  state.permitted=false;await act(async()=>tree.update(view()));await act(async()=>release(receipt(b)));expect(pendingCatalog(owner,product)).not.toBeNull();expect(state.toast.success).not.toHaveBeenCalled();
  state.permitted=true;await act(async()=>tree.update(view()));await click('Verificar estado pendiente');await vi.waitFor(()=>expect(state.toast.success).toHaveBeenCalledOnce());
 });
});
