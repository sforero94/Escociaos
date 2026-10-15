import {CrearAlertaManualDialog} from '@/components/hato/components/CrearAlertaManualDialog';
import {EditarAlertaDialog} from '@/components/hato/components/EditarAlertaDialog';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {create,act,type ReactTestRenderer} from 'react-test-renderer';
import {AlertasView} from '@/components/hato/AlertasView';
import {AlertManagementDialog} from '@/components/hato/components/AlertManagementDialog';
import {OWNER,KEY,ALERT,prepared,committed} from './fixtures/alertManagement';
import {memory,storage,testLocks} from './purchaseProtocolFixtures';
const state=vi.hoisted(()=>({client:null as unknown,rows:[] as unknown[],fila:[] as Array<{alerta:{id:string};onResponder?:(id:string,response:'si'|'no'|'otro')=>Promise<void>}>,responder:vi.fn(),reload:vi.fn()}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:'10000000-0000-4000-8000-000000000001'},profile:{rol:'Gerencia',nombre:'Synthetic manager'}})}));
vi.mock('@/utils/supabase/client',()=>({getSupabase:()=>state.client}));
vi.mock('@/components/hato/hooks/useHatoAlertas',()=>({useHatoAlertas:()=>({alertas:state.rows,loading:false,error:null,reload:state.reload,responderAlerta:state.responder,actualizarEstadoAlertas:vi.fn(),editarAlerta:vi.fn(),crearAlertaManual:vi.fn()})}));
vi.mock('react-router-dom',()=>({useNavigate:()=>vi.fn(),useSearchParams:()=>[new URLSearchParams(),vi.fn()]}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn()}}));
vi.mock('@/components/ui/tabs',()=>{const F=({children}:{children?:React.ReactNode})=><div>{children}</div>;return {Tabs:F,TabsContent:F,TabsList:F,TabsTrigger:F};});
vi.mock('@/components/ui/dialog',()=>({Dialog:({children,open}:{children:React.ReactNode;open:boolean})=>open?<div>{children}</div>:null,DialogContent:({children}:{children:React.ReactNode})=><div>{children}</div>,DialogHeader:({children}:{children:React.ReactNode})=><div>{children}</div>,DialogTitle:({children}:{children:React.ReactNode})=><h2>{children}</h2>,DialogDescription:({children}:{children:React.ReactNode})=><p>{children}</p>,DialogBody:({children}:{children:React.ReactNode})=><div>{children}</div>,DialogFooter:({children}:{children:React.ReactNode})=><div>{children}</div>}));
vi.mock('@/components/hato/components/AlertaFila',()=>({AlertaFila:(props:typeof state.fila[number])=>{state.fila.push(props);return null;}}));
vi.mock('@/components/hato/components/AlertaGrupoInformativo',()=>({AlertaGrupoInformativo:()=>null}));
vi.mock('@/components/hato/components/AlertaHistorialTabla',()=>({AlertaHistorialTabla:()=>null}));
vi.mock('@/components/hato/components/CrearAlertaManualDialog',()=>({CrearAlertaManualDialog:()=>null}));
vi.mock('@/components/hato/components/EditarAlertaDialog',()=>({EditarAlertaDialog:()=>null}));
vi.mock('@/components/hato/components/HatoPageHeader',()=>({HatoPageHeader:()=>null}));
let renderer:ReactTestRenderer|undefined;
beforeEach(()=>{memory.clear();state.fila=[];state.responder.mockClear();state.reload.mockClear();const p=committed();state.rows=[{...p.receipt!.after.targets[0].alert,created_at:'2026-10-14T12:00:00Z',animalNumero:1,animalNombre:'Synthetic animal',animalNumeroEsProvisional:false}];let current=prepared();state.client={auth:{getUser:async()=>({data:{user:{id:OWNER}},error:null})},rpc:vi.fn(async(_name,args)=>{if(args.p_action==='prepare')current=prepared(KEY,args.p_intent);return {data:args.p_action==='post'?committed(current):current,error:null};})};vi.stubGlobal('localStorage',storage);vi.stubGlobal('navigator',{locks:testLocks});vi.spyOn(crypto,'randomUUID').mockReturnValue(KEY);vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-15T00:30:00Z'));});
afterEach(async()=>{if(renderer)await act(async()=>renderer!.unmount());renderer=undefined;vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});
describe('actual management caller cutover',()=>{
 it('prepares creation and posts only from its prepared review dialog',async()=>{
  await act(async()=>{renderer=create(<AlertasView/>);});
  await act(async()=>{await renderer!.root.findByType(CrearAlertaManualDialog).props.onCrear({tipo:'secado_due',animalId:'40000000-0000-4000-8000-000000000001',pasoId:null,fechaProgramada:'2026-10-14',nota:'Synthetic manual note'});});
  const client=state.client as {rpc:ReturnType<typeof vi.fn>};expect(client.rpc.mock.calls.map(c=>c[1].p_action)).toEqual(['prepare']);expect(client.rpc.mock.calls[0][0]).toBe('fn_alert_management_web');
  expect(renderer!.root.findByType(AlertManagementDialog).props.attempt.result.state).toBe('pending');
  await act(async()=>{renderer!.root.findByType(AlertManagementDialog).props.onAction('post');});expect(client.rpc.mock.calls.map(c=>c[1].p_action)).toEqual(['prepare','post']);expect(state.reload).toHaveBeenCalledOnce();
 });
 it('captures exact observed alert fields when preparing an edit',async()=>{
  await act(async()=>{renderer=create(<AlertasView/>);});
  const original=state.rows[0];await act(async()=>{await renderer!.root.findByType(EditarAlertaDialog).props.onGuardar(original,{fechaProgramada:'2026-10-15',nota:'Review note'});});
  const client=state.client as {rpc:ReturnType<typeof vi.fn>};const args=client.rpc.mock.calls[0][1];expect(args.p_intent).toMatchObject({kind:'edit',fechaProgramada:'2026-10-15',nota:'Review note'});expect(args.p_intent.alerts[0]).not.toHaveProperty('animalNombre');expect(renderer!.root.findByType(AlertManagementDialog).props.attempt.result.state).toBe('pending');
 });
});
