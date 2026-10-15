import {useLayoutEffect} from 'react';
import {useHatoAlertas} from '@/components/hato/hooks/useHatoAlertas';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {create,act,type ReactTestRenderer} from 'react-test-renderer';
import {CrearAlertaManualDialog} from '@/components/hato/components/CrearAlertaManualDialog';
import {validarAlertaManual,type InputAlertaManual} from '@/utils/hatoAlertasGestor';
import {OWNER,ANIMAL,OTHER,STEP} from './fixtures/clinicalStep';
const state=vi.hoisted(()=>({client:null as unknown,owner:'10000000-0000-4000-8000-000000000001'}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:state.owner}})}));
vi.mock('@/utils/supabase/client',()=>({getSupabase:()=>state.client}));
vi.mock('sonner',()=>({toast:{error:vi.fn(),success:vi.fn()}}));
vi.mock('@/components/ui/dialog',()=>{const F=({children}:{children?:React.ReactNode})=><div>{children}</div>;return {Dialog:F,DialogContent:F,DialogHeader:F,DialogTitle:F,DialogDescription:F,DialogBody:F,DialogFooter:F};});
vi.mock('@/components/ui/select',()=>{const F=({children,...props}:{children?:React.ReactNode})=><div {...props}>{children}</div>;return {Select:F,SelectContent:F,SelectItem:F,SelectTrigger:F,SelectValue:F};});
const input={tipo:'tratamiento_paso' as const,animalId:ANIMAL,fechaProgramada:'2026-10-14',nota:'Synthetic manual',idUnico:OWNER,pasoId:STEP};
const createAlert=vi.fn<(input:Omit<InputAlertaManual,'idUnico'>)=>Promise<void>>(async()=>{});
let renderer:ReactTestRenderer|undefined,stepQuery:{select:ReturnType<typeof vi.fn>;eq:ReturnType<typeof vi.fn>;is:ReturnType<typeof vi.fn>;order:ReturnType<typeof vi.fn>};
beforeEach(()=>{state.owner=OWNER;createAlert.mockReset();createAlert.mockResolvedValue(undefined);stepQuery={select:vi.fn(),eq:vi.fn(),is:vi.fn(),order:vi.fn(async()=>({data:[{id:STEP,descripcion:'Existing clinical step',fecha_programada:'2026-10-14'}],error:null}))};stepQuery.select.mockReturnValue(stepQuery);stepQuery.eq.mockReturnValue(stepQuery);stepQuery.is.mockReturnValue(stepQuery);const animals={select:vi.fn(),eq:vi.fn(),order:vi.fn(async()=>({data:[{id:ANIMAL,numero:1,nombre:'Synthetic animal'}],error:null}))};animals.select.mockReturnValue(animals);animals.eq.mockReturnValue(animals);state.client={from:vi.fn((table:string)=>table==='hato_animales'?animals:stepQuery)};});
afterEach(async()=>{if(renderer)await act(async()=>renderer!.unmount());renderer=undefined;vi.restoreAllMocks();});
async function mount(){await act(async()=>{renderer=create(<CrearAlertaManualDialog open onOpenChange={()=>{}} guardando={false} onCrear={createAlert}/>);});}
const selects=()=>renderer!.root.findAll(n=>typeof n.props.onValueChange==='function'&&typeof n.type==='function');
async function choose(){await act(async()=>selects()[0].props.onValueChange('tratamiento_paso'));await act(async()=>selects()[1].props.onValueChange(ANIMAL));}
async function submit(){await act(async()=>renderer!.root.findByType('form').props.onSubmit({preventDefault(){}}));}
it('passes the selected existing step through the manual payload without creating a treatment',()=>{const r=validarAlertaManual(input);expect(r.ok&&r.fila.paso_id).toBe(STEP);});
it.each([null,undefined,'not-a-step'])('refuses absent or invalid clinical step %s',pasoId=>expect(validarAlertaManual({...input,pasoId}).ok).toBe(false));
it('refuses a clinical step on a different alert type',()=>expect(validarAlertaManual({...input,tipo:'secado_due'}).ok).toBe(false));
it('loads only active treatment pending steps for selected animal and submits the explicit selection',async()=>{await mount();await choose();expect(stepQuery.eq.mock.calls).toEqual([['hato_tratamientos.animal_id',ANIMAL],['hato_tratamientos.estado','activo']]);expect(stepQuery.is).toHaveBeenCalledWith('fecha_ejecutada',null);await submit();expect(createAlert).not.toHaveBeenCalled();await act(async()=>selects()[2].props.onValueChange(STEP));await submit();expect(createAlert).toHaveBeenCalledWith(expect.objectContaining({tipo:'tratamiento_paso',animalId:ANIMAL,pasoId:STEP}));});
it('clears selected step when the animal changes',async()=>{await mount();await choose();await act(async()=>selects()[2].props.onValueChange(STEP));await act(async()=>selects()[1].props.onValueChange(OTHER));await submit();expect(createAlert).not.toHaveBeenCalled();});
it('ignores a stale step lookup after animal change',async()=>{let resolve!:(v:unknown)=>void;stepQuery.order.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}) as never);await mount();await choose();await act(async()=>selects()[1].props.onValueChange(OTHER));await act(async()=>resolve({data:[{id:OTHER,descripcion:'Stale other step',fecha_programada:'2026-10-14'}],error:null}));expect(JSON.stringify(renderer!.toJSON())).not.toContain('Stale other step');});
it('refuses a failed step lookup rather than posting an unlinked alert',async()=>{stepQuery.order.mockResolvedValueOnce({data:[],error:Error('synthetic failure')} as never);await mount();await choose();expect(JSON.stringify(renderer!.toJSON())).toContain('No se pudieron verificar');await submit();expect(createAlert).not.toHaveBeenCalled();});

it('actual creation hook includes the selected paso_id in its insert and refuses unlinked clinical input',async()=>{
 const insert=vi.fn(async()=>({error:null})),chain={select:vi.fn(),order:vi.fn(async()=>({data:[],error:null})),insert};chain.select.mockReturnValue(chain);state.client={from:vi.fn(()=>chain)};
 let api!:ReturnType<typeof useHatoAlertas>;function Hook(){const value=useHatoAlertas();useLayoutEffect(()=>{api=value;});return null;}
 await act(async()=>{renderer=create(<Hook/>);});
 await act(async()=>{await api.crearAlertaManual(input,OWNER);});expect(insert).toHaveBeenCalledWith(expect.objectContaining({paso_id:STEP,animal_id:ANIMAL,tipo:'tratamiento_paso'}));
 insert.mockClear();await expect(api.crearAlertaManual({...input,pasoId:null},OWNER)).rejects.toThrow('paso clínico');expect(insert).not.toHaveBeenCalled();
});
