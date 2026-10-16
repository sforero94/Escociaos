import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {create,act,type ReactTestRenderer} from 'react-test-renderer';
import {MuerteAnimalDialog} from '@/components/hato/components/MuerteAnimalDialog';
import {pendingDeathBrowser,type DeathBrowserClient} from '@/utils/hato/hatoDeathBrowserAttempt';
import {prepared,committed,intent,OWNER,OTHER,KEY} from './fixtures/hatoDeath';
import type {DeathResult} from '@/utils/hato/hatoDeathProtocol';
import type {HatoAnimalRow} from '@/types/hato';
const state=vi.hoisted(()=>({owner:'',client:null as unknown}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:state.owner}})}));
vi.mock('@/utils/supabase/client',()=>({getSupabase:()=>state.client}));
vi.mock('@/components/ui/dialog',()=>{const F=({children}:{children?:React.ReactNode})=><div>{children}</div>;return {Dialog:F,DialogContent:F,DialogHeader:F,DialogTitle:F,DialogBody:F,DialogFooter:F};});
let renderer:ReactTestRenderer|undefined,saved:DeathResult|null;const refresh=vi.fn(),close=vi.fn();
const animal=intent.observedAnimal as unknown as HatoAnimalRow;
beforeEach(()=>{vi.stubGlobal('window',new EventTarget());state.owner=OWNER;saved=null;refresh.mockClear();close.mockClear();const store=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v),removeItem:(k:string)=>store.delete(k)});vi.stubGlobal('navigator',{locks:{request:async(_k:unknown,_o:unknown,fn:()=>unknown)=>fn()}});vi.spyOn(crypto,'randomUUID').mockReturnValue(KEY);state.client={auth:{getUser:vi.fn(async()=>({data:{user:{id:state.owner}},error:null}))},rpc:vi.fn(async(_n:string,a:Record<string,unknown>)=>{if(a.p_action==='prepare')saved=prepared(String(a.p_request_key),a.p_intent as typeof intent);if(a.p_action==='post')saved=committed(saved!);return {data:saved,error:null};})};});
afterEach(async()=>{await act(async()=>renderer?.unmount());renderer=undefined;vi.unstubAllGlobals();vi.restoreAllMocks();});
const button=(label:string)=>renderer!.root.findAllByType('button').find(b=>b.children.join('')===label)!;
const click=async(label:string)=>act(async()=>{button(label).props.onClick();});
const mount=async()=>act(async()=>{renderer=create(<MuerteAnimalDialog open animal={animal} onGuardado={refresh} onOpenChange={close}/>);});
it('actual dialog prepares captured animal/date/cause then separately posts and clears verified result',async()=>{
 await mount();await act(async()=>{renderer!.root.findByProps({id:'muerte-fecha'}).props.onChange({target:{value:intent.date}});renderer!.root.findByProps({id:'muerte-causa'}).props.onChange({target:{value:intent.cause}});});
 await click('Preparar revisión');expect(JSON.stringify(renderer!.toJSON())).toContain(intent.cause);expect(JSON.stringify(renderer!.toJSON())).toContain(intent.date);expect(JSON.stringify(renderer!.toJSON())).toContain('Synthetic animal');expect((state.client as DeathBrowserClient).rpc).toHaveBeenCalledTimes(1);expect(refresh).not.toHaveBeenCalled();
 await click('Confirmar muerte preparada');expect(JSON.stringify(renderer!.toJSON())).toContain('Muerte registrada y comprobada');expect(pendingDeathBrowser(OWNER)?.result?.state).toBe('committed');await click('Finalizar intento verificado');expect(refresh).toHaveBeenCalledTimes(1);expect(close).toHaveBeenCalledWith(false);expect(pendingDeathBrowser(OWNER)).toBeNull();
});
it('closing/remounting after lost post recovers original committed request without another post',async()=>{
 await mount();await click('Preparar revisión');const rpc=vi.mocked((state.client as DeathBrowserClient).rpc),original=rpc.getMockImplementation()!;rpc.mockImplementation(async(n,a)=>{const r=await original(n,a);if(a.p_action==='post')throw Error('lost original response');return r;});
 await click('Confirmar muerte preparada');expect(pendingDeathBrowser(OWNER)?.result?.state).toBe('pending');await click('Cerrar');await act(async()=>renderer!.unmount());await mount();expect(JSON.stringify(renderer!.toJSON())).toContain('Muerte registrada y comprobada');expect(rpc.mock.calls.filter(c=>c[1].p_action==='post')).toHaveLength(1);
});
it('account and target changes preserve the old owner attempt and show only its captured target',async()=>{
 await mount();await click('Preparar revisión');await act(async()=>renderer!.update(<MuerteAnimalDialog open animal={{...animal,id:OTHER,nombre:'Different target'}} onGuardado={refresh} onOpenChange={close}/>));expect(JSON.stringify(renderer!.toJSON())).toContain('Synthetic animal');expect(JSON.stringify(renderer!.toJSON())).not.toContain('Different target');
 state.owner=OTHER;await act(async()=>renderer!.update(<MuerteAnimalDialog open animal={animal} onGuardado={refresh} onOpenChange={close}/>));expect(pendingDeathBrowser(OWNER)?.key).toBe(KEY);expect(JSON.stringify(renderer!.toJSON())).not.toContain(KEY);
});
