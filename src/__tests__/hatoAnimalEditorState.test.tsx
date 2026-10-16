import {useLayoutEffect} from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {create,act,type ReactTestRenderer} from 'react-test-renderer';
import {EditarAnimalDialog} from '@/components/hato/components/EditarAnimalDialog';
import {useActualizarHatoAnimal,type HatoAnimalEdicion} from '@/components/hato/hooks/useActualizarHatoAnimal';
import {prepared,committed,OWNER,KEY} from './fixtures/hatoAnimalEdit';
import type {AnimalEditResult,AnimalEditIntent} from '@/utils/hato/hatoAnimalEditProtocol';
import {pendingAnimalEditBrowser} from '@/utils/hato/hatoAnimalEditBrowserAttempt';
import type {HatoAnimalRow} from '@/types/hato';
const state=vi.hoisted(()=>({client:null as unknown}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:OWNER},hasRole:()=>true})}));
vi.mock('@/utils/supabase/client',()=>({getSupabase:()=>state.client}));
vi.mock('@/components/hato/hooks/useCandidatosGenealogia',()=>({useCandidatosGenealogia:()=>({candidatos:{animales:[],toros:[]},loading:false})}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn()}}));
vi.mock('@/components/ui/dialog',()=>{const F=({children}:{children?:React.ReactNode})=><div>{children}</div>;return {Dialog:F,DialogContent:F,DialogHeader:F,DialogTitle:F,DialogBody:F,DialogFooter:F};});
vi.mock('@/components/ui/select',()=>{const F=({children}:{children?:React.ReactNode})=><div>{children}</div>;return {Select:F,SelectContent:F,SelectItem:F,SelectTrigger:F,SelectValue:F};});
let renderer:ReactTestRenderer|undefined,saved:AnimalEditResult|null;const refresh=vi.fn();
const animal=prepared().original!.animal as unknown as HatoAnimalRow;
beforeEach(()=>{saved=null;refresh.mockClear();vi.stubGlobal('window',new EventTarget());const store=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v),removeItem:(k:string)=>store.delete(k)});vi.stubGlobal('navigator',{locks:{request:async(_k:unknown,_o:unknown,fn:()=>unknown)=>fn()}});vi.spyOn(crypto,'randomUUID').mockReturnValue(KEY);state.client={auth:{getUser:vi.fn(async()=>({data:{user:{id:OWNER}},error:null}))},rpc:vi.fn(async(_n:string,a:Record<string,unknown>)=>{if(a.p_action==='prepare')saved=prepared(String(a.p_request_key),a.p_intent as AnimalEditIntent);if(a.p_action==='post')saved=committed(saved!);return {data:saved,error:null};})};});
afterEach(async()=>{await act(async()=>renderer?.unmount());renderer=undefined;vi.unstubAllGlobals();vi.restoreAllMocks();});
const mount=async()=>act(async()=>{renderer=create(<EditarAnimalDialog open animal={animal} onOpenChange={()=>{}} onGuardado={refresh}/>);});
const click=async(label:string)=>act(async()=>{renderer!.root.findAllByType('button').find(b=>b.children.join('')===label)!.props.onClick();});
it('shows current state read-only and normal edits never write lifecycle state/date',async()=>{
 await mount();
 const input=renderer!.root.findByProps({id:'editar-animal-estado'});expect(input.props.readOnly).toBe(true);expect(input.props.value).toBe('activa');expect(input.props.onValueChange).toBeUndefined();
 await act(async()=>renderer!.root.findByType('form').props.onSubmit({preventDefault(){}}));expect(saved?.state).toBe('pending');expect(saved!.intent!.changes).not.toHaveProperty('estado');expect(saved!.intent!.changes).not.toHaveProperty('fecha_estado');expect(refresh).not.toHaveBeenCalled();expect(JSON.stringify(renderer!.toJSON())).toContain('Revisión de edición');
 await click('Confirmar edición revisada');expect(saved?.state).toBe('committed');await click('Finalizar intento verificado');expect(refresh).toHaveBeenCalledOnce();expect(pendingAnimalEditBrowser(OWNER)).toBeNull();
});
it('lost response keeps original key and remount recovers without another post',async()=>{
 await mount();await act(async()=>renderer!.root.findByType('form').props.onSubmit({preventDefault(){}}));
 const client=state.client as {rpc:ReturnType<typeof vi.fn>},impl=client.rpc.getMockImplementation() as (n:string,a:Record<string,unknown>)=>Promise<unknown>;client.rpc.mockImplementation(async(n,a)=>{const r=await impl(n,a);if(a.p_action==='post')throw Error('lost');return r;});
 await click('Confirmar edición revisada');expect(pendingAnimalEditBrowser(OWNER)?.key).toBe(KEY);await act(async()=>renderer!.unmount());await mount();await click('Recuperar intento original');expect(JSON.stringify(renderer!.toJSON())).toContain('committed');await click('Finalizar intento verificado');expect(client.rpc.mock.calls.filter(c=>c[1].p_action==='post')).toHaveLength(1);expect(refresh).toHaveBeenCalledOnce();
});
it('stale direct hook refuses before any client access or mutation',async()=>{
 let api!:ReturnType<typeof useActualizarHatoAnimal>;function Hook(){const current=useActualizarHatoAnimal();useLayoutEffect(()=>{api=current;});return null;}
 await act(async()=>{renderer=create(<Hook/>);});
 await act(async()=>{expect((await api.actualizar(animal.id,{} as HatoAnimalEdicion)).ok).toBe(false);});expect((state.client as {rpc:ReturnType<typeof vi.fn>}).rpc).not.toHaveBeenCalled();
});
