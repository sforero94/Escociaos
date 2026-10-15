import {alertManagementIntent,prepareAlertManagementWeb,queryAlertManagementWeb,resolveAlertManagementWeb,sameAlertManagement,validateAlertManagementResult,type AlertManagementClient,type AlertManagementIntent,type AlertManagementResult} from './alertManagementProtocol';
export interface AlertManagementBrowserClient extends AlertManagementClient {auth:{getUser():PromiseLike<{data:{user:{id:string}|null};error:unknown}>}}
export interface AlertManagementBrowserAttempt {owner:string;key:string;intent:AlertManagementIntent;result:AlertManagementResult|null}
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const slot=(owner:string)=>`hato_alert_management_v1:${owner}`;
const fail=():never=>{throw Error('Conserve y verifique el intento de respuesta original antes de iniciar otro.');};
export function pendingAlertManagementBrowser(owner:string):AlertManagementBrowserAttempt|null{
 if(!uuid(owner))return fail();const raw=localStorage.getItem(slot(owner));if(raw===null)return null;
 try{const a=JSON.parse(raw) as AlertManagementBrowserAttempt;
  if(!a||Object.keys(a).sort().join('|')!=='intent|key|owner|result'||a.owner!==owner||!uuid(a.key)||!sameAlertManagement(a.intent,alertManagementIntent(a.intent)))return fail();
  if(a.result!==null)validateAlertManagementResult(a.result,owner,null,a.key,a.intent);return a;
 }catch{return fail();}
}
async function authorize(c:AlertManagementBrowserClient,owner:string,current:()=>boolean){const r=await c.auth.getUser();if(r.error||r.data.user?.id!==owner||!current())throw Error('La sesión o el formulario cambió. Conserve el intento original.');}
/** Preparing never posts: human review uses the returned original snapshot. */
export async function runAlertManagementBrowser(c:AlertManagementBrowserClient,owner:string,intent:AlertManagementIntent|null,mode:'prepare'|'post'|'status'|'resolve'|'new',current:()=>boolean,reviewed:AlertManagementBrowserAttempt|null=null):Promise<AlertManagementBrowserAttempt|null>{
 if(!uuid(owner)||!['prepare','post','status','resolve','new'].includes(mode)||!globalThis.navigator?.locks)throw Error('Use un navegador actualizado con HTTPS para responder la alerta.');
 return navigator.locks.request(slot(owner),{mode:'exclusive'},async()=>{
  await authorize(c,owner,current);let a=pendingAlertManagementBrowser(owner);
  if(!a&&reviewed){
   if(reviewed.owner!==owner||!uuid(reviewed.key)||!sameAlertManagement(alertManagementIntent(reviewed.intent),reviewed.intent))return fail();
   if(reviewed.result)validateAlertManagementResult(reviewed.result,owner,null,reviewed.key,reviewed.intent);
   a=reviewed;localStorage.setItem(slot(owner),JSON.stringify(a));if(!sameAlertManagement(pendingAlertManagementBrowser(owner),a))return fail();
  }
  if(!a){if(mode!=='prepare'||!intent)return null;const p=alertManagementIntent(intent);a={owner,key:crypto.randomUUID(),intent:p,result:null};localStorage.setItem(slot(owner),JSON.stringify(a));if(!sameAlertManagement(pendingAlertManagementBrowser(owner),a))return fail();}
  else if(mode==='prepare'&&intent&&!sameAlertManagement(a.intent,alertManagementIntent(intent)))return fail();
  if(['post','resolve','new'].includes(mode)&&(!reviewed||reviewed.owner!==owner||reviewed.key!==a.key||!sameAlertManagement(reviewed.intent,a.intent)))return fail();
  if(mode==='post'){
   if(reviewed?.result?.state!=='pending'||!a.result||!sameAlertManagement(reviewed.result.original,a.result.original)||!sameAlertManagement(reviewed.result.actor,a.result.actor)||!sameAlertManagement(reviewed.result.intent,a.intent))return fail();
   validateAlertManagementResult(reviewed.result,owner,null,a.key,a.intent);
  }
  await authorize(c,owner,current);
  let result:AlertManagementResult;
  if(mode==='prepare')result=await prepareAlertManagementWeb(c,owner,a.key,a.intent);
  else if(mode==='post'){
   if(a.result?.state==='committed'||a.result?.state==='canceled')result=await resolveAlertManagementWeb(c,owner,a.key,'status');
   else {if(a.result?.state!=='pending'||!a.result.intent||!a.result.original)return fail();result=await queryAlertManagementWeb(c,owner,a.result,'post');}
  }else result=await resolveAlertManagementWeb(c,owner,a.key,mode==='resolve'?'resolve':'status');
  validateAlertManagementResult(result,owner,null,a.key,a.intent,a.result?.actor);
  await authorize(c,owner,current);
  if(!sameAlertManagement(pendingAlertManagementBrowser(owner),a))return fail();
  if(mode==='new'){
   if(result.state!=='committed'&&result.state!=='canceled')return fail();localStorage.removeItem(slot(owner));return null;
  }
  const next={...a,result};localStorage.setItem(slot(owner),JSON.stringify(next));return next;
 });
}
