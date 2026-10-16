import {eventCorrectionIntent,eventCorrectionWeb,sameEventCorrection,validateEventCorrectionResult,type EventCorrectionClient,type EventCorrectionIntent,type EventCorrectionResult} from './hatoEventCorrectionProtocol';
export interface EventCorrectionBrowserClient extends EventCorrectionClient {auth:{getUser():PromiseLike<{data:{user:{id:string}|null};error:unknown}>}}
export interface EventCorrectionBrowserAttempt {owner:string;key:string;intent:EventCorrectionIntent;result:EventCorrectionResult|null}
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const slot=(owner:string)=>`hato_event_correction_v1:${owner}`;
const fail=():never=>{throw Error('Conserve y verifique el intento original antes de iniciar otro.');};
export function pendingEventCorrectionBrowser(owner:string):EventCorrectionBrowserAttempt|null{
 if(!uuid(owner))return fail();const raw=localStorage.getItem(slot(owner));if(raw===null)return null;
 try{const a=JSON.parse(raw) as EventCorrectionBrowserAttempt;
  if(!a||Object.keys(a).sort().join('|')!=='intent|key|owner|result'||a.owner!==owner||!uuid(a.key)||!sameEventCorrection(a.intent,eventCorrectionIntent(a.intent)))return fail();
  if(a.result!==null)validateEventCorrectionResult(a.result,owner,a.key,a.intent);return a;
 }catch{return fail();}
}
async function authorize(c:EventCorrectionBrowserClient,owner:string,current:()=>boolean){const r=await c.auth.getUser();if(r.error||r.data.user?.id!==owner||!current())throw Error('La sesión o el formulario cambió. Conserve el intento original.');}
/** Preparing never posts: human review uses the returned original snapshot. */
export async function runEventCorrectionBrowser(c:EventCorrectionBrowserClient,owner:string,intent:EventCorrectionIntent|null,mode:'prepare'|'post'|'status'|'resolve'|'new',current:()=>boolean,reviewed:EventCorrectionBrowserAttempt|null=null):Promise<EventCorrectionBrowserAttempt|null>{
 if(!uuid(owner)||!['prepare','post','status','resolve','new'].includes(mode)||!globalThis.navigator?.locks)throw Error('Use un navegador actualizado con HTTPS para corregir el evento.');
 return navigator.locks.request(slot(owner),{mode:'exclusive'},async()=>{
  await authorize(c,owner,current);let a=pendingEventCorrectionBrowser(owner);
  if(!a&&reviewed){
   if(reviewed.owner!==owner||!uuid(reviewed.key)||!sameEventCorrection(eventCorrectionIntent(reviewed.intent),reviewed.intent))return fail();
   if(reviewed.result)validateEventCorrectionResult(reviewed.result,owner,reviewed.key,reviewed.intent);
   a=reviewed;localStorage.setItem(slot(owner),JSON.stringify(a));if(!sameEventCorrection(pendingEventCorrectionBrowser(owner),a))return fail();
  }
  if(!a){if(mode!=='prepare'||!intent)return null;const p=eventCorrectionIntent(intent);a={owner,key:crypto.randomUUID(),intent:p,result:null};localStorage.setItem(slot(owner),JSON.stringify(a));if(!sameEventCorrection(pendingEventCorrectionBrowser(owner),a))return fail();}
  else if(mode==='prepare'&&intent&&!sameEventCorrection(a.intent,eventCorrectionIntent(intent)))return fail();
  if(['post','resolve','new'].includes(mode)&&(!reviewed||reviewed.owner!==owner||reviewed.key!==a.key||!sameEventCorrection(reviewed.intent,a.intent)))return fail();
  if(mode==='post'){
   if(reviewed?.result?.state!=='pending'||!a.result||!sameEventCorrection(reviewed.result,a.result)||!sameEventCorrection(reviewed.result.intent,a.intent))return fail();
   validateEventCorrectionResult(reviewed.result,owner,a.key,a.intent);
  }
  await authorize(c,owner,current);
  let result:EventCorrectionResult;
  if(mode==='prepare')result=await eventCorrectionWeb(c,owner,a.key,'prepare',a.intent,a.result??undefined);
  else if(mode==='post'){
   if(a.result?.state==='committed'||a.result?.state==='canceled')result=await eventCorrectionWeb(c,owner,a.key,'status',null,a.result??undefined);
   else {if(a.result?.state!=='pending'||!a.result.intent||!a.result.original)return fail();result=await eventCorrectionWeb(c,owner,a.key,'post',null,a.result??undefined);}
  }else result=await eventCorrectionWeb(c,owner,a.key,mode==='resolve'?'resolve':'status',null,a.result??undefined);
  validateEventCorrectionResult(result,owner,a.key,a.intent);
  if(a.result?.original&&(!sameEventCorrection(result.original,a.result.original)||!sameEventCorrection(result.plan,a.result.plan)||result.effectiveDate!==a.result.effectiveDate))return fail();
  if(a.result&&['committed','canceled'].includes(a.result.state)&&!sameEventCorrection(a.result,result))return fail();
  await authorize(c,owner,current);
  if(!sameEventCorrection(pendingEventCorrectionBrowser(owner),a))return fail();
  if(mode==='new'){
   if(result.state!=='committed'&&result.state!=='canceled')return fail();localStorage.removeItem(slot(owner));if(localStorage.getItem(slot(owner))!==null)return fail();return null;
  }
  const next={...a,result};localStorage.setItem(slot(owner),JSON.stringify(next));if(!sameEventCorrection(pendingEventCorrectionBrowser(owner),next))return fail();return next;
 });
}
