import {useLayoutEffect} from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {create,act,type ReactTestRenderer} from 'react-test-renderer';
import {EditarAnimalDialog} from '@/components/hato/components/EditarAnimalDialog';
import {useActualizarHatoAnimal,type HatoAnimalEdicion} from '@/components/hato/hooks/useActualizarHatoAnimal';
import {prepared} from './fixtures/hatoDeath';
import type {HatoAnimalRow} from '@/types/hato';
const state=vi.hoisted(()=>({client:null as unknown}));
vi.mock('@/utils/supabase/client',()=>({getSupabase:()=>state.client}));
vi.mock('@/components/hato/hooks/useCandidatosGenealogia',()=>({useCandidatosGenealogia:()=>({candidatos:{animales:[],toros:[]},loading:false})}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn()}}));
vi.mock('@/components/ui/dialog',()=>{const F=({children}:{children?:React.ReactNode})=><div>{children}</div>;return {Dialog:F,DialogContent:F,DialogHeader:F,DialogTitle:F,DialogBody:F,DialogFooter:F};});
vi.mock('@/components/ui/select',()=>{const F=({children}:{children?:React.ReactNode})=><div>{children}</div>;return {Select:F,SelectContent:F,SelectItem:F,SelectTrigger:F,SelectValue:F};});
let renderer:ReactTestRenderer|undefined;const update=vi.fn(),eq=vi.fn();
const animal=prepared().original!.animal as unknown as HatoAnimalRow;
beforeEach(()=>{update.mockReset();eq.mockReset();eq.mockResolvedValue({error:null});update.mockReturnValue({eq});state.client={from:vi.fn(()=>({update}))};});
afterEach(async()=>{await act(async()=>renderer?.unmount());renderer=undefined;});
it('shows current state read-only and normal edits never write lifecycle state/date',async()=>{
 await act(async()=>{renderer=create(<EditarAnimalDialog open animal={animal} onOpenChange={()=>{}} onGuardado={()=>{}}/>);});
 const input=renderer!.root.findByProps({id:'editar-animal-estado'});expect(input.props.readOnly).toBe(true);expect(input.props.value).toBe('activa');expect(input.props.onValueChange).toBeUndefined();
 await act(async()=>renderer!.root.findByType('form').props.onSubmit({preventDefault(){}}));expect(update).toHaveBeenCalledOnce();expect(update.mock.calls[0][0]).not.toHaveProperty('estado');expect(update.mock.calls[0][0]).not.toHaveProperty('fecha_estado');expect(eq).toHaveBeenCalledWith('id',animal.id);
 await act(async()=>renderer!.update(<EditarAnimalDialog open animal={{...animal,estado:'vendida'}} onOpenChange={()=>{}} onGuardado={()=>{}}/>));expect(renderer!.root.findByProps({id:'editar-animal-estado'}).props.value).toBe('vendida');
});
it('ignores stale/extra lifecycle fields at the actual hook boundary',async()=>{
 let api!:ReturnType<typeof useActualizarHatoAnimal>;function Hook(){const current=useActualizarHatoAnimal();useLayoutEffect(()=>{api=current;});return null;}
 await act(async()=>{renderer=create(<Hook/>);});
 const edit={numero:1,nombre:'Reviewed name',etapa:'vaca',raza:null,fecha_nacimiento:null,etapa_forzada:false,madre_id:null,padre_toro_id:null,estado:'muerta',fecha_estado:'2026-01-01',notas:'unreviewed'} as HatoAnimalEdicion;
 await act(async()=>{expect((await api.actualizar(animal.id,edit)).ok).toBe(true);});expect(update.mock.calls[0][0]).toEqual({numero:1,nombre:'Reviewed name',etapa:'vaca',raza:null,fecha_nacimiento:null,etapa_forzada:false,madre_id:null,padre_toro_id:null});
});
