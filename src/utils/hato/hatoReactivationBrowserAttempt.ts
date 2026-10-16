import {reactivationIntent,reactivationWeb,sameReactivation,validateReactivationResult,type ReactivationClient,type ReactivationIntent,type ReactivationResult} from './hatoReactivationProtocol';
export interface ReactivationBrowserClient extends ReactivationClient {auth:{getUser():PromiseLike<{data:{user:{id:string}|null};error:unknown}>}}
export interface ReactivationBrowserAttempt {owner:string;key:string;intent:ReactivationIntent;result:ReactivationResult|null}
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const slot=(owner:string)=>`hato_reactivation_v1:${owner}`;
const fail=():never=>{throw Error('Conserve y verifique el intento original antes de iniciar otro.');};
export function pendingReactivationBrowser(owner:string):ReactivationBrowserAttempt|null{
 if(!uuid(owner))return fail();const raw=localStorage.getItem(slot(owner));if(raw===null)return null;
 try{const a=JSON.parse(raw) as ReactivationBrowserAttempt;
  if(!a||Object.keys(a).sort().join('|')!=='intent|key|owner|result'||a.owner!==owner||!uuid(a.key)||!sameReactivation(a.intent,reactivationIntent(a.intent)))return fail();
  if(a.result!==null)validateReactivationResult(a.result,owner,a.key,a.intent);return a;
 }catch{return fail();}
}
async function authorize(c:ReactivationBrowserClient,owner:string,current:()=>boolean){const r=await c.auth.getUser();if(r.error||r.data.user?.id!==owner||!current())throw Error('La sesión o el formulario cambió. Conserve el intento original.');}
/** Preparing never posts: human review uses the returned original snapshot. */
export async function runReactivationBrowser(c:ReactivationBrowserClient,owner:string,intent:ReactivationIntent|null,mode:'prepare'|'post'|'status'|'resolve'|'new',current:()=>boolean,reviewed:ReactivationBrowserAttempt|null=null):Promise<ReactivationBrowserAttempt|null>{
 if(!uuid(owner)||!['prepare','post','status','resolve','new'].includes(mode)||!globalThis.navigator?.locks)throw Error('Use un navegador actualizado con HTTPS para reactivar el animal.');
 return navigator.locks.request(slot(owner),{mode:'exclusive'},async()=>{
  await authorize(c,owner,current);let a=pendingReactivationBrowser(owner);
  if(!a&&reviewed){
   if(reviewed.owner!==owner||!uuid(reviewed.key)||!sameReactivation(reactivationIntent(reviewed.intent),reviewed.intent))return fail();
   if(reviewed.result)validateReactivationResult(reviewed.result,owner,reviewed.key,reviewed.intent);
   a=reviewed;localStorage.setItem(slot(owner),JSON.stringify(a));if(!sameReactivation(pendingReactivationBrowser(owner),a))return fail();
  }
  if(!a){if(mode!=='prepare'||!intent)return null;const p=reactivationIntent(intent);a={owner,key:crypto.randomUUID(),intent:p,result:null};localStorage.setItem(slot(owner),JSON.stringify(a));if(!sameReactivation(pendingReactivationBrowser(owner),a))return fail();}
  else if(mode==='prepare'&&intent&&!sameReactivation(a.intent,reactivationIntent(intent)))return fail();
  if(['post','resolve','new'].includes(mode)&&(!reviewed||reviewed.owner!==owner||reviewed.key!==a.key||!sameReactivation(reviewed.intent,a.intent)))return fail();
  if(mode==='post'){
   if(reviewed?.result?.state!=='pending'||!a.result||!sameReactivation(reviewed.result,a.result)||!sameReactivation(reviewed.result.intent,a.intent))return fail();
   validateReactivationResult(reviewed.result,owner,a.key,a.intent);
  }
  await authorize(c,owner,current);
  let result:ReactivationResult;
  if(mode==='prepare')result=await reactivationWeb(c,owner,a.key,'prepare',a.intent);
  else if(mode==='post'){
   if(a.result?.state==='committed'||a.result?.state==='canceled')result=await reactivationWeb(c,owner,a.key,'status',null,a.intent);
   else {if(a.result?.state!=='pending'||!a.result.intent||!a.result.original)return fail();result=await reactivationWeb(c,owner,a.key,'post',null,a.intent);}
  }else result=await reactivationWeb(c,owner,a.key,mode==='resolve'?'resolve':'status',null,a.intent);
  validateReactivationResult(result,owner,a.key,a.intent);
  if(a.result?.original&&(!sameReactivation(result.original,a.result.original)||result.effectiveDate!==a.result.effectiveDate))return fail();
  if(a.result&&['committed','canceled'].includes(a.result.state)&&!sameReactivation(a.result,result))return fail();
  await authorize(c,owner,current);
  if(!sameReactivation(pendingReactivationBrowser(owner),a))return fail();
  if(mode==='new'){
   if(result.state!=='committed'&&result.state!=='canceled')return fail();localStorage.removeItem(slot(owner));return null;
  }
  const next={...a,result};localStorage.setItem(slot(owner),JSON.stringify(next));return next;
 });
}
