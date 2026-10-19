import {photoKeys,photoRecord,photoUuid,photoSame,photoFail,validatePhotoResult,type PhotoRow} from './hatoPhotoUploadProtocol';
import {validatePhotoPreviewResult} from './hatoPhotoPreviewProtocol';
import {validateMilkWeighingResult,type MilkWeighingActor} from './hatoMilkWeighingProtocol';
import {validateMilkWeekResult} from './hatoMilkWeekProtocol';
export interface DiscardResult {request_key:string;owner_id:string;capture_id:string|null;source:PhotoRow|null;plan:PhotoRow[]|null;state:'pending'|'committed'|'canceled';receipt:PhotoRow|null;acknowledged:boolean}
const rows=(v:unknown):PhotoRow[]=>{if(!Array.isArray(v)||!v.every(photoRecord))return photoFail();return v;};
// SQL week boundaries are calendar dates derived from captured YYYY-MM-DD values, never wall-clock today.
const calendar=(d:Date)=>`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
const sorted=(v:PhotoRow[])=>[...v].sort((a,b)=>String(a.id).localeCompare(String(b.id)));
const sourceActor=(a:PhotoRow,owner:string)=>a.origin==='web'?photoSame(a,{origin:'web',profileId:owner}):a.origin==='telegram'&&photoKeys(a,['origin','registrationId','profileId','sender','displayName'])&&photoUuid(a.registrationId)&&a.profileId===owner&&Number.isSafeInteger(a.sender)&&Number(a.sender)>0&&(a.displayName===null||typeof a.displayName==='string');
export function validateDiscard(x:unknown,owner:string,key:string,capture?:string,expected?:DiscardResult):DiscardResult{
 if(!photoKeys(x,['request_key','owner_id','capture_id','source','plan','state','receipt','acknowledged'])||!photoUuid(owner)||!photoUuid(key)||x.owner_id!==owner||x.request_key!==key||!['pending','committed','canceled'].includes(String(x.state))||typeof x.acknowledged!=='boolean'||x.acknowledged&&x.state==='pending'||capture&&x.capture_id!==capture&&!(x.state==='canceled'&&x.capture_id===null))return photoFail();
 if(x.source===null){if(x.state!=='canceled'||x.capture_id!==null||x.plan!==null||x.receipt!==null)return photoFail();}
 else{
  if(!photoUuid(x.capture_id)||!photoKeys(x.source,['capture','upload','preview','milk','rows'])||!photoRecord(x.source.upload)||!photoRecord(x.source.preview)||!photoRecord(x.source.milk)||!Array.isArray(x.plan)||!x.plan.length||x.plan.length>6)return photoFail();const s=x.source,u=s.upload as PhotoRow,q=s.preview as PhotoRow,m=s.milk as PhotoRow;
  if(!photoKeys(u,['request_key','owner_id','intent','bucket','paths','state','permission_id','receipt','acknowledged'])||!photoKeys(m,['request_key','owner_id','intent','original','plan','effective_date','state','receipt','acknowledged']))return photoFail();
  const receipt=u.receipt;if(!photoRecord(receipt)||!photoRecord(receipt.actor)||!photoUuid(u.owner_id)||!sourceActor(receipt.actor,u.owner_id))return photoFail();
  const upload=validatePhotoResult({version:1,requestKey:u.request_key,owner:u.owner_id,intent:u.intent,bucket:u.bucket,paths:u.paths,state:u.state,permissionId:u.permission_id,permit:null,receipt:u.receipt,acknowledged:u.acknowledged},u.owner_id,x.capture_id,undefined,undefined,receipt.actor);
  validatePhotoPreviewResult({version:1,upload,preview:q,permit:null},u.owner_id,x.capture_id,undefined,receipt.actor);
  if(!photoRecord(m.receipt)||!photoRecord(m.receipt.actor)||!sourceActor(m.receipt.actor,u.owner_id)||m.receipt.actor.origin!==receipt.actor.origin||m.state!=='committed'||!photoRecord(q.outcome)||q.outcome.ok!==true)return photoFail();
  const milk=validateMilkWeighingResult({version:1,requestKey:m.request_key,owner:m.owner_id,intent:m.intent,original:m.original,plan:m.plan,effectiveDate:m.effective_date,state:m.state,receipt:m.receipt,acknowledged:m.acknowledged},u.owner_id,String(m.request_key),undefined,m.receipt.actor as unknown as MilkWeighingActor);
  const inserted=milk.plan!.accepted;if(inserted.some(e=>e.before!==null)||!photoSame(s.rows,sorted(rows(milk.receipt!.after)))||!photoSame(s.capture,milk.receipt!.capture.after)||!photoSame(q.capture_after,milk.receipt!.capture.before)||milk.intent?.captureId!==x.capture_id)return photoFail();
  const plan=x.plan as PhotoRow[];if(plan.some(p=>!photoKeys(p,['key','start','end'])||!photoUuid(p.key)||typeof p.start!=='string'||typeof p.end!=='string')||new Set(plan.map(p=>p.key)).size!==plan.length||new Set(plan.map(p=>p.start)).size!==plan.length)return photoFail();
  const starts=[...new Set(rows(s.rows).map(row=>{const d=new Date(String(row.fecha)+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return calendar(d);} ))].sort();if(!photoSame(plan.map(p=>({start:p.start,end:p.end})),starts.map(start=>({start,end:calendar(new Date(Date.parse(start+'T00:00:00Z')+6*86400000))}))))return photoFail();
  if(x.state!=='committed'){if(x.receipt!==null)return photoFail();}
  else{const r=x.receipt;if(!photoKeys(r,['version','requestKey','owner','actor','source','plan','removed','weekReceipts','corrections','retained','recordedAt'])||r.version!==1||r.requestKey!==key||r.owner!==owner||!photoSame(r.actor,{origin:'web',profileId:owner})||!photoSame(r.source,s)||!photoSame(r.plan,plan)||!photoSame(r.removed,s.rows)||r.retained!==true||!Array.isArray(r.weekReceipts)||r.weekReceipts.length!==plan.length)return photoFail();
   const removed:PhotoRow[]=[],traces:PhotoRow[]=[];r.weekReceipts.forEach((v,i)=>{if(!photoRecord(v))return photoFail();const w=validateMilkWeekResult({version:1,requestKey:v.requestKey,owner:v.owner,state:'committed',intent:v.intent,original:v.original,plan:v.plan,effectiveDate:v.effectiveDate,receipt:v,acknowledged:true},owner,String(plan[i].key));if(w.intent!.start!==plan[i].start||w.intent!.end!==plan[i].end||w.plan!.changes.some(e=>e.after!==null)||v.recordedAt!==r.recordedAt)return photoFail();removed.push(...rows(v.before));traces.push(...rows(v.corrections));});
   if(!photoSame(sorted(removed),s.rows)||!photoSame(traces,r.corrections))return photoFail();
  }
 }
 const result=x as unknown as DiscardResult;if(expected&&(!photoSame(result.source,expected.source)||!photoSame(result.plan,expected.plan)||result.capture_id!==expected.capture_id||expected.acknowledged&&!result.acknowledged||expected.state!=='pending'&&!photoSame({...result,acknowledged:expected.acknowledged},expected)))return photoFail();return result;
}
export interface DiscardClient {auth:{getUser():PromiseLike<{data:{user:{id:string}|null};error:unknown}>};rpc(n:string,a:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}>}
interface Anchor {owner:string;key:string;capture:string|null}
const slot=(owner:string)=>'hato_upload_discard_v1:'+owner;
function pending(owner:string):Anchor|null{const raw=localStorage.getItem(slot(owner));if(raw===null)return null;const a=JSON.parse(raw);if(!photoKeys(a,['owner','key','capture'])||a.owner!==owner||!photoUuid(a.key)||!(a.capture===null||photoUuid(a.capture)))return photoFail();return a as unknown as Anchor;}
export async function runDiscard(c:DiscardClient,owner:string,mode:'prepare'|'post'|'status'|'resolve'|'new',current:()=>boolean,capture?:string,reviewed?:DiscardResult|null):Promise<DiscardResult|null>{
 if(!photoUuid(owner)||!globalThis.navigator?.locks)return photoFail();return navigator.locks.request(slot(owner),{mode:'exclusive'},async()=>{
 const auth=async()=>{const a=await c.auth.getUser();if(a.error||a.data.user?.id!==owner||!current())return photoFail();};await auth();let a=pending(owner);
 if(!a){const recovered=await c.rpc('fn_hato_upload_discard_recover_web',{p_expected_owner:owner});if(recovered.error)return photoFail();await auth();if(recovered.data!==null){if(!photoRecord(recovered.data)||!photoUuid(recovered.data.request_key)||!(recovered.data.capture_id===null||photoUuid(recovered.data.capture_id)))return photoFail();const r=validateDiscard(recovered.data,owner,recovered.data.request_key);a={owner,key:r.request_key,capture:r.capture_id};localStorage.setItem(slot(owner),JSON.stringify(a));if(!photoSame(pending(owner),a))return photoFail();return r;}}
 if(!a){if(mode!=='prepare')return null;if(!photoUuid(capture))return photoFail();a={owner,key:crypto.randomUUID(),capture};localStorage.setItem(slot(owner),JSON.stringify(a));if(!photoSame(pending(owner),a))return photoFail();}
 if(mode==='prepare'&&capture!==a.capture)return photoFail();
 if(['post','new'].includes(mode)&&(!reviewed||reviewed.request_key!==a.key||reviewed.owner_id!==owner))return photoFail();
 if(reviewed)validateDiscard(reviewed,owner,a.key,a.capture??undefined);
 if(mode==='post'&&reviewed?.state!=='pending')return photoFail();if(mode==='new'&&(!reviewed||reviewed.state==='pending'))return photoFail();
 await auth();if(mode==='post'){const status=await c.rpc('fn_hato_upload_discard_web',{p_action:'status',p_request_key:a.key,p_capture:null,p_expected_owner:owner});if(status.error||!photoSame(validateDiscard(status.data,owner,a.key,a.capture??undefined),reviewed))return photoFail();await auth();}
 const r=await c.rpc('fn_hato_upload_discard_web',{p_action:mode==='new'?'acknowledge':mode,p_request_key:a.key,p_capture:mode==='prepare'?a.capture:null,p_expected_owner:owner});if(r.error)return photoFail();await auth();if(!photoSame(pending(owner),a))return photoFail();if(r.data===null&&mode==='status')return null;
 const result=validateDiscard(r.data,owner,a.key,a.capture??undefined,reviewed??undefined);if(mode==='new'){if(!result.acknowledged)return photoFail();localStorage.removeItem(slot(owner));if(pending(owner)!==null)return photoFail();return null;}return result;
 });
}
