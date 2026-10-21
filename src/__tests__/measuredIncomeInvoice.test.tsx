import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import original from './fixtures/hatoIncomeMetadata.json';
import {incomeInvoiceReceipt,type IncomeInvoiceCapture} from '@/utils/hato/hatoIncomeInvoiceProof';
import {metadataResult,type MetadataResult} from '@/utils/hato/hatoIncomeMetadataProtocol';
import {runIncomeInvoice,pendingIncomeInvoice} from '@/utils/hato/hatoIncomeInvoiceAttempt';
import {pendingOriginInvoice} from '@/utils/hato/hatoIncomeInvoiceOriginBrowserAttempt';
import {MeasuredIncomeInvoiceUploader} from '@/components/hato/components/MeasuredIncomeInvoiceUploader';
const state=vi.hoisted(()=>({owner:'',allowed:true,upload:vi.fn(),recover:vi.fn(),pending:vi.fn(),close:vi.fn(),origin:null as unknown}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:state.owner},hasRole:()=>state.allowed})}));
vi.mock('@/utils/supabase/client',()=>({getSupabase:()=>({rpc:async()=>({data:null,error:null})})}));
vi.mock('@/utils/invoiceUpload',()=>({uploadInvoice:(...a:unknown[])=>state.upload(...a),uploadReservedInvoice:(...a:unknown[])=>state.upload(...a),validateInvoiceSelection:async()=>({sha256:'a'.repeat(64),size:67,mime:'image/png',extension:'png',sourceExtension:'png'}),recoverCompletedInvoice:(...a:unknown[])=>state.recover(...a),pendingInvoice:(...a:unknown[])=>state.pending(...a),closeInvoiceTarget:(...a:unknown[])=>state.close(...a),verifyInvoiceOwner:async(_c:unknown,o:string,current:()=>boolean)=>{if(o!==state.owner||!current())throw Error('owner changed');}}));
vi.mock('@/utils/hato/hatoIncomeInvoiceOriginProtocol',async importOriginal=>{
 const actual=await importOriginal<typeof import('@/utils/hato/hatoIncomeInvoiceOriginProtocol')>();
 return {...actual,recoverInvoiceOrigin:async()=>state.origin,invoiceOriginSource:async()=>original.original,
 reserveInvoiceOrigin:async(_c:unknown,o:string,i:string,k:string,source:unknown,file:unknown)=>{const r=receipt();return state.origin={version:1,owner:o,incomeId:i,requestKey:k,original:{source,file,identity:r.identity,reservedAt:original.receipt!.recordedAt,reservation:{...r,state:'pending'}},invoice:{...r,state:'pending'}};}};
});
const owner=original.owner,id=original.intent!.targetId,target='11111111-1111-4111-8111-111111111111',request='22222222-2222-4222-8222-222222222222',receiptId='33333333-3333-4333-8333-333333333333',generation='44444444-4444-4444-8444-444444444444';
const receipt=()=>incomeInvoiceReceipt({actor:owner,identity:{requestKey:request,protocolVersion:1,targetKey:target,generation,tipo:'venta',sha256:'a'.repeat(64),size:67,mime:'image/png',extension:'png',sourceExtension:'png'},receiptId,path:`verified/${receiptId}.png`,state:'committed',cleanupPending:false});
function result(){const x=structuredClone(original) as MetadataResult;const proof=receipt();x.intent!.fields.invoice=proof.path;x.intent!.attachment=proof;x.intent!.observedAttachment={receipt:proof,storageFingerprint:'b'.repeat(64),targetGeneration:generation} as IncomeInvoiceCapture;x.plan!.afterIncome.url_factura=proof.path;x.receipt!.intent=structuredClone(x.intent);x.receipt!.plan=structuredClone(x.plan);(x.receipt!.after as {income:Record<string,unknown>}).income.url_factura=proof.path;return x;}
let renderer:ReactTestRenderer|undefined;
beforeEach(()=>{state.owner=owner;state.allowed=true;state.origin=null;state.upload.mockReset().mockResolvedValue(receipt());state.recover.mockReset().mockResolvedValue(receipt());state.pending.mockReset().mockReturnValue(null);state.close.mockReset().mockResolvedValue({active:false});const store=new Map();vi.stubGlobal('localStorage',{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v),removeItem:(k:string)=>store.delete(k),clear:()=>store.clear()});vi.stubGlobal('navigator',{locks:{request:async(_k:unknown,_o:unknown,f:()=>unknown)=>f()}});vi.spyOn(crypto,'randomUUID').mockReturnValue(target);});
afterEach(async()=>{if(renderer)await act(async()=>renderer!.unmount());renderer=undefined;vi.restoreAllMocks();vi.unstubAllGlobals();});
it('strict metadata receipt captures verified attachment without changing any financial/production field',()=>{const x=result();expect(metadataResult(x,owner,x.requestKey)).toEqual(x);expect(x.plan!.afterIncome.valor).toBe(original.plan!.afterIncome.valor);expect(x.plan!.afterProduction).toEqual(original.plan!.afterProduction);});
it.each(['owner','path','mime','size','tipo','generation','fingerprint','extra'])('strict proof refuses altered %s against original capture',kind=>{const x=result(),expected=structuredClone(x.intent!),r=x.intent!.attachment!;if(kind==='owner')r.actor=request;if(kind==='path')r.path='legacy/fake.png';if(kind==='mime')Object.assign(r.identity,{mime:'image/svg+xml'});if(kind==='size')r.identity.size=0;if(kind==='tipo')r.identity.tipo='compra';if(kind==='generation')r.identity.generation=request;if(kind==='fingerprint')x.intent!.observedAttachment!.storageFingerprint='c'.repeat(64);if(kind==='extra')Object.assign(r,{fake:true});expect(()=>metadataResult(x,owner,x.requestKey,expected)).toThrow();});
it('write/readback failure refuses before upload transport',async()=>{vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw Error('quota');});await expect(runIncomeInvoice({rpc:async()=>({data:null,error:null})} as never,owner,id,'upload',{} as File,()=>true)).rejects.toThrow();expect(state.upload).not.toHaveBeenCalled();});
it('held original always queries status and never resends or replaces UUID',async()=>{state.pending.mockReturnValue({identity:{targetKey:target}});state.recover.mockResolvedValue(null);await runIncomeInvoice({rpc:async()=>({data:null,error:null})} as never,owner,id,'upload',{} as File,()=>true);expect(state.upload).not.toHaveBeenCalled();expect(state.recover).toHaveBeenCalledTimes(1);expect(pendingIncomeInvoice(owner,id)?.targetKey).toBe(target);});
it('original metadata recovery parses complete attachment proof without uploader/File/local receipt',()=>{const x=result();expect(metadataResult(structuredClone(x),owner,x.requestKey).intent!.attachment).toEqual(receipt());});
it.each(['owner','target','close','role'] as const)('mounted late upload after %s change cannot publish another form receipt',async kind=>{let resolve!:(r:ReturnType<typeof receipt>)=>void;state.upload.mockImplementation(()=>new Promise(r=>{resolve=r;}));const ready=vi.fn(),hold=vi.fn();await act(async()=>{renderer=create(<MeasuredIncomeInvoiceUploader incomeId={id} open disabled={false} onReceipt={ready} onHold={hold}/>);});let pending!:Promise<unknown>;await act(async()=>{renderer!.root.findByType('input').props.onChange({target:{files:[{}]}});await new Promise(r=>setTimeout(r,0));});if(kind==='owner')state.owner=request;if(kind==='role')state.allowed=false;await act(async()=>{renderer!.update(<MeasuredIncomeInvoiceUploader incomeId={kind==='target'?request:id} open={kind!=='close'} disabled={false} onReceipt={ready} onHold={hold}/>);});await act(async()=>{resolve(receipt());await new Promise(r=>setTimeout(r,0));});expect(ready).not.toHaveBeenCalled();expect(state.upload).toHaveBeenCalledTimes(1);void pending;});

it('server original metadata prevents a replacement upload after all local storage is lost',async()=>{const x=result();const c={rpc:async()=>({data:x,error:null})};const a=await runIncomeInvoice(c as never,owner,id,'upload',{} as File,()=>true);expect(a?.receipt).toEqual(receipt());expect(state.upload).not.toHaveBeenCalled();expect(a?.targetKey).toBe(target);});


it.each(['owner','target','close','role','unmount'] as const)('parent hold releases after %s change without clearing the durable original or accepting a late receipt',async kind=>{
 let resolve!:(r:ReturnType<typeof receipt>)=>void;state.upload.mockImplementation(()=>new Promise(r=>{resolve=r;}));const ready=vi.fn(),hold=vi.fn();
 await act(async()=>{renderer=create(<MeasuredIncomeInvoiceUploader incomeId={id} open disabled={false} onReceipt={ready} onHold={hold}/>);});
 await act(async()=>{renderer!.root.findByType('input').props.onChange({target:{files:[{}]}});await new Promise(r=>setTimeout(r,0));});
 expect(hold.mock.lastCall).toEqual([true]);const originalAttempt=pendingOriginInvoice(owner,id);expect(originalAttempt?.targetKey).toBe(target);
 if(kind==='owner')state.owner=request;if(kind==='role')state.allowed=false;
 await act(async()=>{if(kind==='unmount'){renderer!.unmount();renderer=undefined;}else renderer!.update(<MeasuredIncomeInvoiceUploader incomeId={kind==='target'?request:id} open={kind!=='close'} disabled={false} onReceipt={ready} onHold={hold}/>);});
 expect(hold.mock.lastCall).toEqual([false]);expect(pendingOriginInvoice(owner,id)).toEqual(originalAttempt);expect(state.close).not.toHaveBeenCalled();
 await act(async()=>{resolve(receipt());await new Promise(r=>setTimeout(r,0));});
 expect(ready).not.toHaveBeenCalled();expect(hold.mock.lastCall).toEqual([false]);expect(pendingOriginInvoice(owner,id)).toEqual(originalAttempt);
});
it('reopening a held original restores the parent hold and status-only recovery without a replacement upload',async()=>{
 localStorage.setItem(`measured_income_invoice_v1:${owner}:${id}`,JSON.stringify({version:1,owner,incomeId:id,targetKey:target,receipt:null}));state.pending.mockReturnValue({identity:{targetKey:target}});state.recover.mockResolvedValue(null);const hold=vi.fn();
 await act(async()=>{renderer=create(<MeasuredIncomeInvoiceUploader incomeId={id} open disabled={false} onReceipt={vi.fn()} onHold={hold}/>);});expect(hold.mock.lastCall).toEqual([true]);
 await act(async()=>{await renderer!.root.findAllByType('button').find(b=>b.children.join('').includes('Consultar factura original'))!.props.onClick();});
 expect(hold.mock.lastCall).toEqual([true]);expect(state.recover).toHaveBeenCalledTimes(1);expect(state.upload).not.toHaveBeenCalled();expect(pendingIncomeInvoice(owner,id)?.targetKey).toBe(target);
});
it('admission: before metadata preparation total storage loss leaves no income-bound original for status to recover',async()=>{
 const client={rpc:vi.fn(async()=>({data:null,error:null}))};await runIncomeInvoice(client as never,owner,id,'upload',{} as File,()=>true);expect(pendingIncomeInvoice(owner,id)?.receipt).toEqual(receipt());localStorage.clear();
 expect(await runIncomeInvoice(client as never,owner,id,'status',null,()=>true)).toBeNull();expect(pendingIncomeInvoice(owner,id)).toBeNull();expect(state.upload).toHaveBeenCalledTimes(1);expect(state.recover).not.toHaveBeenCalled();expect(state.close).not.toHaveBeenCalled();
 // This is an admission counterexample, not proof that the original file is absent or settled.
 expect(client.rpc.mock.calls.length).toBe(2);
});
