import {useLayoutEffect} from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {create,act,type ReactTestRenderer} from 'react-test-renderer';
import {useHatoAlertas} from '@/components/hato/hooks/useHatoAlertas';
import {ALERT,ANIMAL,prepared} from './fixtures/clinicalStep';
const state=vi.hoisted(()=>({client:null as unknown}));
vi.mock('@/utils/supabase/client',()=>({getSupabase:()=>state.client}));
let api:ReturnType<typeof useHatoAlertas>,renderer:ReactTestRenderer|undefined;
function Hook(){const value=useHatoAlertas();useLayoutEffect(()=>{api=value;});return null;}
beforeEach(()=>{const row=prepared().original!.alerts[0];state.client={from:vi.fn((table:string)=>({select:()=>table==='hato_alertas'?{order:async()=>({data:[row],error:null})}:{in:async()=>({data:[{id:ANIMAL,numero:1,nombre:'Synthetic animal'}],error:null})},update:vi.fn(()=>{throw Error('Direct mutation forbidden in clinical handler');})}))};});
afterEach(async()=>{if(renderer)await act(async()=>renderer!.unmount());renderer=undefined;});
it('actual legacy hook refuses clinical si before any alert claim or direct step write',async()=>{await act(async()=>{renderer=create(<Hook/>);});expect(api.alertas).toHaveLength(1);const client=state.client as {from:ReturnType<typeof vi.fn>};client.from.mockClear();await act(async()=>{await expect(api.responderAlerta(ALERT,'si','Untrusted display')).rejects.toThrow('intento preparado');});expect(client.from).not.toHaveBeenCalled();});
it('actual legacy hook refuses unknown IDs before claiming any target',async()=>{await act(async()=>{renderer=create(<Hook/>);});const client=state.client as {from:ReturnType<typeof vi.fn>};client.from.mockClear();await expect(api.responderAlerta(ANIMAL,'si',null)).rejects.toThrow('original');expect(client.from).not.toHaveBeenCalled();});
