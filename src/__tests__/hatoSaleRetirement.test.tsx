import {useLayoutEffect} from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {create,act,type ReactTestRenderer} from 'react-test-renderer';
import {useRegistrarSalidaHato} from '@/components/hato/hooks/useRegistrarSalidaHato';
import {useVentaAnimalesHato} from '@/components/hato/hooks/useVentaAnimalesHato';
import {OWNER,ANIMAL} from './fixtures/hatoSale';
const state=vi.hoisted(()=>({get:vi.fn(),client:null as unknown}));
vi.mock('@/utils/supabase/client',()=>({getSupabase:()=>state.get()}));
let renderer:ReactTestRenderer|undefined;
beforeEach(()=>{state.get.mockReset();});
afterEach(async()=>{await act(async()=>renderer?.unmount());renderer=undefined;});
it('unused cached direct-sale/death helper refuses before Auth/client/database access',async()=>{
 state.get.mockImplementation(()=>{throw Error('Must never obtain a client');});let api!:ReturnType<typeof useRegistrarSalidaHato>;
 function Hook(){const value=useRegistrarSalidaHato();useLayoutEffect(()=>{api=value;});return null;}
 await act(async()=>{renderer=create(<Hook/>);});
 expect(await api.registrarVenta(ANIMAL,{id:OWNER,fecha:'2026-10-14'})).toMatchObject({ok:false,error:expect.stringContaining('venta con revisión preparada')});
 expect((await api.registrarMuerte()).ok).toBe(false);expect(api.guardando).toBe(false);expect(state.get).not.toHaveBeenCalled();
});
it('former070 hook still reads picker data but refuses all legacy sale mutations',async()=>{
 const rpc=vi.fn(),insert=vi.fn(),update=vi.fn(),query={select:vi.fn(),eq:vi.fn(),order:vi.fn(async()=>({data:[],error:null})),insert,update};query.select.mockReturnValue(query);query.eq.mockReturnValue(query);state.get.mockReturnValue({from:vi.fn(()=>query),rpc});
 let api!:ReturnType<typeof useVentaAnimalesHato>;function Hook(){const value=useVentaAnimalesHato();useLayoutEffect(()=>{api=value;});return null;}
 await act(async()=>{renderer=create(<Hook/>);});
 await expect(api.registrarVenta({tipo:'terneros',cabezas:1,valor:100,fecha:'2026-10-14',regionId:OWNER,medioPagoId:OWNER,compradorId:null,nombre:null,animalIds:[ANIMAL]})).rejects.toThrow('revisión preparada');
 expect(query.order).toHaveBeenCalledOnce();expect(rpc).not.toHaveBeenCalled();expect(insert).not.toHaveBeenCalled();expect(update).not.toHaveBeenCalled();
});
