import {alertResponseIntent,prepareAlertResponseWeb,queryAlertResponseWeb,resolveAlertResponseWeb,sameAlertResponse,validateAlertResponseResult,type AlertResponseClient,type AlertResponseIntent,type AlertResponseResult} from './alertResponseProtocol';
export interface AlertResponseBrowserClient extends AlertResponseClient {auth:{getUser():PromiseLike<{data:{user:{id:string}|null};error:unknown}>}}
export interface AlertResponseBrowserAttempt {owner:string;key:string;intent:AlertResponseIntent;result:AlertResponseResult|null}
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const slot=(owner:string)=>`hato_alert_response_v1:${owner}`;
const fail=():never=>{throw Error('Conserve y verifique el intento de respuesta original antes de iniciar otro.');};
export function pendingAlertResponseBrowser(owner:string):AlertResponseBrowserAttempt|null{
 if(!uuid(owner))return fail();const raw=localStorage.getItem(slot(owner));if(raw===null)return null;
 try{const a=JSON.parse(raw) as AlertResponseBrowserAttempt;
  if(!a||Object.keys(a).sort().join('|')!=='intent|key|owner|result'||a.owner!==owner||!uuid(a.key)||!sameAlertResponse(a.intent,alertResponseIntent(a.intent)))return fail();
  if(a.result!==null)validateAlertResponseResult(a.result,owner,null,a.key,a.intent);return a;
 }catch{return fail();}
}
async function authorize(c:AlertResponseBrowserClient,owner:string,current:()=>boolean){const r=await c.auth.getUser();if(r.error||r.data.user?.id!==owner||!current())throw Error('La sesión o el formulario cambió. Conserve el intento original.');}
/** Preparing never posts: human review uses the returned original snapshot. */
export async function runAlertResponseBrowser(c:AlertResponseBrowserClient,owner:string,intent:AlertResponseIntent|null,mode:'prepare'|'post'|'status'|'resolve'|'new',current:()=>boolean,reviewed:AlertResponseBrowserAttempt|null=null):Promise<AlertResponseBrowserAttempt|null>{
 if(!uuid(owner)||!['prepare','post','status','resolve','new'].includes(mode)||!globalThis.navigator?.locks)throw Error('Use un navegador actualizado con HTTPS para responder la alerta.');
 return navigator.locks.request(slot(owner),{mode:'exclusive'},async()=>{
  await authorize(c,owner,current);let a=pendingAlertResponseBrowser(owner);
  if(!a&&reviewed){
   if(reviewed.owner!==owner||!uuid(reviewed.key)||!sameAlertResponse(alertResponseIntent(reviewed.intent),reviewed.intent))return fail();
   if(reviewed.result)validateAlertResponseResult(reviewed.result,owner,null,reviewed.key,reviewed.intent);
   a=reviewed;localStorage.setItem(slot(owner),JSON.stringify(a));if(!sameAlertResponse(pendingAlertResponseBrowser(owner),a))return fail();
  }
  if(!a){if(mode!=='prepare'||!intent)return null;const p=alertResponseIntent(intent);a={owner,key:crypto.randomUUID(),intent:p,result:null};localStorage.setItem(slot(owner),JSON.stringify(a));if(!sameAlertResponse(pendingAlertResponseBrowser(owner),a))return fail();}
  else if(mode==='prepare'&&intent&&!sameAlertResponse(a.intent,alertResponseIntent(intent)))return fail();
  if(['post','resolve','new'].includes(mode)&&(!reviewed||reviewed.owner!==owner||reviewed.key!==a.key||!sameAlertResponse(reviewed.intent,a.intent)))return fail();
  if(mode==='post'){
   if(reviewed?.result?.state!=='pending'||!a.result||!sameAlertResponse(reviewed.result.original,a.result.original)||!sameAlertResponse(reviewed.result.actor,a.result.actor)||!sameAlertResponse(reviewed.result.intent,a.intent))return fail();
   validateAlertResponseResult(reviewed.result,owner,null,a.key,a.intent);
  }
  await authorize(c,owner,current);
  let result:AlertResponseResult;
  if(mode==='prepare')result=await prepareAlertResponseWeb(c,owner,a.key,a.intent);
  else if(mode==='post'){
   if(a.result?.state==='committed'||a.result?.state==='canceled')result=await resolveAlertResponseWeb(c,owner,a.key,'status');
   else {if(a.result?.state!=='pending'||!a.result.intent||!a.result.original)return fail();result=await queryAlertResponseWeb(c,owner,a.result,'post');}
  }else result=await resolveAlertResponseWeb(c,owner,a.key,mode==='resolve'?'resolve':'status');
  validateAlertResponseResult(result,owner,null,a.key,a.intent,a.result?.actor);
  await authorize(c,owner,current);
  if(!sameAlertResponse(pendingAlertResponseBrowser(owner),a))return fail();
  if(mode==='new'){
   if(result.state!=='committed'&&result.state!=='canceled')return fail();localStorage.removeItem(slot(owner));return null;
  }
  const next={...a,result};localStorage.setItem(slot(owner),JSON.stringify(next));return next;
 });
}
