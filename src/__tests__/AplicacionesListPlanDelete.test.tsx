import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {act,create,type ReactTestRenderer,type ReactTestInstance} from 'react-test-renderer';
import type {PropsWithChildren} from 'react';
import {AplicacionesList} from '@/components/aplicaciones/AplicacionesList';
import {owner,other,purchase as app,product,memory,storage,testLocks,sdkHarness,type Call} from './purchaseProtocolFixtures';
import {planDeleteSlot} from '@/utils/applicationPlanDelete';
const state=vi.hoisted(()=>({owner:'',client:null as unknown,success:vi.fn()}));
vi.mock('@/utils/supabase/client',()=>({getSupabase:()=>state.client}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:state.owner}})}));
vi.mock('react-router-dom',()=>({useNavigate:()=>vi.fn()}));
vi.mock('sonner',()=>({toast:{success:state.success,error:vi.fn()}}));
vi.mock('@/components/aplicaciones/IniciarEjecucionModal',()=>({IniciarEjecucionModal:()=>null}));
vi.mock('@/components/aplicaciones/DetalleAplicacion',()=>({DetalleAplicacion:()=>null}));
vi.mock('@/components/ui/dropdown-menu',()=>{
 const Box=({children}:PropsWithChildren)=><div>{children}</div>;
 return {DropdownMenu:Box,DropdownMenuContent:Box,DropdownMenuItem:(p:React.ComponentProps<'button'>)=><button {...p}/>,DropdownMenuSeparator:Box,DropdownMenuTrigger:Box};
});
vi.mock('@/components/ui/select',()=>{const Box=({children}:PropsWithChildren)=><div>{children}</div>;return {Select:Box,SelectContent:Box,SelectItem:Box,SelectTrigger:Box,SelectValue:Box};});
vi.mock('@/components/ui/toggle-group',()=>{const Box=({children}:PropsWithChildren)=><div>{children}</div>;return {ToggleGroup:Box,ToggleGroupItem:Box};});
vi.mock('@/components/ui/alert-dialog',()=>{
 const Box=({children}:PropsWithChildren)=><div>{children}</div>;
 return {AlertDialog:({children,open}:PropsWithChildren<{open:boolean}>)=>open?<div>{children}</div>:null,AlertDialogContent:Box,AlertDialogHeader:Box,AlertDialogTitle:Box,AlertDialogDescription:Box,AlertDialogFooter:Box,AlertDialogCancel:(p:React.ComponentProps<'button'>)=><button {...p}/>,AlertDialogAction:(p:React.ComponentProps<'button'>)=><button {...p}/>};
});
const expected={aplicaciones:{id:app,nombre_aplicacion:'Reviewed plan',estado:'Calculada'},tarea:{id:product},aplicaciones_lotes:[],aplicaciones_mezclas:[],aplicaciones_productos:[],aplicaciones_calculos:[],aplicaciones_compras:[]};
const receipt=(key:unknown)=>({actor:owner,request_key:key,application_id:app,deleted:{aplicaciones:[app],aplicaciones_lotes:[],aplicaciones_mezclas:[],aplicaciones_productos:[],aplicaciones_calculos:[],aplicaciones_compras:[]},preserved_task_id:product});
let tree:ReactTestRenderer;
async function harness(mutate:(c:Call)=>unknown|Promise<unknown>,unsafe=false){
 const h=await sdkHarness(c=>{
  if(c.url.pathname==='/rest/v1/aplicaciones')return [{id:app,nombre_aplicacion:'Saved plan',codigo_aplicacion:'P1',estado:'Calculada',tipo_aplicacion:'Fumigación',created_at:'2026-10-12',aplicaciones_lotes:[],aplicaciones_calculos:[]}];
  if(c.url.pathname.endsWith('_snapshot'))return unsafe?new Response(JSON.stringify({message:'Solo puede eliminar un plan sin ejecución, trabajo ni movimientos de inventario.'}),{status:400}):{application_id:app,expected};
  return mutate(c);
 });state.client=h.client;return h;
}
const text=(n:ReactTestInstance):string=>n.children.map(c=>typeof c==='string'?c:text(c)).join('');
const button=(label:string)=>tree.root.findAllByType('button').filter(b=>text(b).trim()===label).at(-1)!;
async function click(label:string){await act(async()=>{button(label).props.onClick({preventDefault(){}});await new Promise(r=>setTimeout(r,0));});}
async function mount(){await act(async()=>{tree=create(<AplicacionesList/>);});}
const deletes=(h:Awaited<ReturnType<typeof harness>>)=>h.calls.filter(c=>c.url.pathname.endsWith('fn_application_plan_delete'));
beforeEach(()=>{vi.clearAllMocks();memory.clear();state.owner=owner;vi.stubGlobal('localStorage',storage);vi.stubGlobal('navigator',{locks:testLocks});});
afterEach(()=>{act(()=>tree?.unmount());vi.unstubAllGlobals();});
describe('actual application list unused-plan deletion',()=>{
 it('reviews before confirmation and sends exact original without direct deletes',async()=>{const h=await harness(c=>({request_key:c.body.p_request_key,receipt:receipt(c.body.p_request_key)}));await mount();await click('Eliminar');expect(JSON.stringify(tree.toJSON())).toContain('Reviewed plan');await click('Eliminar');expect(deletes(h)).toHaveLength(1);expect(deletes(h)[0].body.p_expected).toEqual(expected);expect(h.calls.some(c=>c.method==='DELETE')).toBe(false);expect(state.success).toHaveBeenCalled();expect(memory.has(planDeleteSlot(owner,app))).toBe(false);});
 it('unsafe execution/history refuses before showing delete confirmation',async()=>{const h=await harness(()=>null,true);await mount();await click('Eliminar');expect(JSON.stringify(tree.toJSON())).toContain('Solo puede eliminar un plan sin ejecución');expect(deletes(h)).toHaveLength(0);expect(state.success).not.toHaveBeenCalled();});
 it('malformed result retains original and explicit cancelled resolution never resubmits',async()=>{const h=await harness(c=>c.url.pathname.endsWith('_status')?{state:'cancelled',request_key:c.body.p_request_key}:null);await mount();await click('Eliminar');await click('Eliminar');expect(memory.has(planDeleteSlot(owner,app))).toBe(true);await click('Verificar eliminación pendiente');expect(deletes(h)).toHaveLength(1);expect(memory.has(planDeleteSlot(owner,app))).toBe(false);expect(JSON.stringify(tree.toJSON())).toContain('El plan no se eliminó');});
 it('lost receipt resolves committed original after remount',async()=>{const h=await harness(c=>c.url.pathname.endsWith('_status')?{state:'committed',request_key:c.body.p_request_key,receipt:receipt(c.body.p_request_key)}:null);await mount();await click('Eliminar');await click('Eliminar');act(()=>tree.unmount());await mount();await click('Eliminar');await click('Verificar eliminación pendiente');expect(deletes(h)).toHaveLength(1);expect(state.success).toHaveBeenCalled();});
 it('same-frame confirmation double-click posts once',async()=>{const h=await harness(()=>null);await mount();await click('Eliminar');const action=tree.root.findAllByType('button').filter(b=>text(b).trim()==='Eliminar').at(-1)!;await act(async()=>{action.props.onClick({preventDefault(){}});action.props.onClick({preventDefault(){}});await new Promise(r=>setTimeout(r,0));});expect(deletes(h)).toHaveLength(1);});
 it('account change while deleting cannot erase evidence or report success',async()=>{let release!:(v:unknown)=>void;let response:unknown;const h=await harness(c=>{response={request_key:c.body.p_request_key,receipt:receipt(c.body.p_request_key)};return new Promise(r=>{release=r;});});await mount();await click('Eliminar');const action=tree.root.findAllByType('button').filter(b=>text(b).trim()==='Eliminar').at(-1)!;await act(async()=>{action.props.onClick({preventDefault(){}});await new Promise(r=>setTimeout(r,0));});state.owner=other;h.switchOwner(other);act(()=>tree.update(<AplicacionesList/>));await act(async()=>{release(response);await new Promise(r=>setTimeout(r,0));});expect(memory.has(planDeleteSlot(owner,app))).toBe(true);expect(state.success).not.toHaveBeenCalled();});
});
