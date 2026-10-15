import {opsIntent,opsSame,opsUuid,queryOps,validateOps,type OpsIntent,type OpsResult,type OpsRpc} from './alertCronOperationsProtocol';
export interface OpsBrowserClient extends OpsRpc {auth:{getUser():PromiseLike<{data:{user:{id:string}|null};error:unknown}>}}
export interface OpsAttempt {owner:string;key:string;intent:OpsIntent;result:OpsResult|null}
const slot=(owner:string)=>'hato_alert_cron_operator_v1:'+owner;
const fail=():never=>{throw Error('Conserve la operación original y verifique su resultado.');};
export function pendingOps(owner:string):OpsAttempt|null{
 if(!opsUuid(owner))return fail();const raw=localStorage.getItem(slot(owner));if(raw===null)return null;
 try{const a=JSON.parse(raw) as OpsAttempt;if(!a||Object.keys(a).sort().join('|')!=='intent|key|owner|result'||a.owner!==owner||!opsUuid(a.key)||!opsSame(opsIntent(a.intent),a.intent))return fail();if(a.result!==null)validateOps(a.result,owner,a.key,a.intent);return a;}catch{return fail();}
}
async function authorize(c:OpsBrowserClient,owner:string,current:()=>boolean){const a=await c.auth.getUser();if(a.error||a.data.user?.id!==owner||!current())throw Error('La cuenta cambió. Conserve la operación original.');}
export async function runOps(c:OpsBrowserClient,owner:string,mode:'prepare'|'post'|'status'|'cancel'|'clear',intent:OpsIntent|null,current:()=>boolean,reviewed:OpsAttempt|null=null):Promise<OpsAttempt|null>{
 if(!opsUuid(owner)||!navigator.locks)throw Error('Use un navegador actualizado con HTTPS.');
 return navigator.locks.request(slot(owner),{mode:'exclusive'},async()=>{
  await authorize(c,owner,current);let a=pendingOps(owner);
  if(!a&&reviewed){if(reviewed.owner!==owner||!opsUuid(reviewed.key))return fail();opsIntent(reviewed.intent);if(reviewed.result)validateOps(reviewed.result,owner,reviewed.key,reviewed.intent);a=reviewed;localStorage.setItem(slot(owner),JSON.stringify(a));}
  if(!a){if(mode!=='prepare'||!intent)return null;a={owner,key:crypto.randomUUID(),intent:opsIntent(intent),result:null};localStorage.setItem(slot(owner),JSON.stringify(a));}
  if(!opsSame(a,pendingOps(owner)))return fail();
  if(mode==='prepare'&&intent&&!opsSame(a.intent,opsIntent(intent)))return fail();
  if(['post','cancel','clear'].includes(mode)&&(!reviewed||reviewed.key!==a.key||!opsSame(reviewed.intent,a.intent)))return fail();
  if(mode==='post'&&(!a.result||a.result.state!=='pending'||!opsSame(reviewed?.result,a.result)))return fail();
  await authorize(c,owner,current);
  const result=await queryOps(c,owner,a.key,mode==='clear'?'status':mode,a.intent);
  await authorize(c,owner,current);if(!opsSame(pendingOps(owner),a))return fail();
  if(mode==='clear'){if(!['committed','canceled'].includes(result.state))return fail();localStorage.removeItem(slot(owner));return null;}
  const next={...a,result};localStorage.setItem(slot(owner),JSON.stringify(next));if(!opsSame(pendingOps(owner),next))return fail();return next;
 });
}

export async function restoreRecordedOps(c:OpsBrowserClient,owner:string,result:OpsResult,current:()=>boolean){
 if(!navigator.locks)throw Error('Use un navegador actualizado con HTTPS.');
 return navigator.locks.request(slot(owner),{mode:'exclusive'},async()=>{await authorize(c,owner,current);validateOps(result,owner,result.requestKey);if(result.state!=='committed'||!result.intent)return fail();const previous=pendingOps(owner);if(previous&&previous.key!==result.requestKey)return fail();const verified=await queryOps(c,owner,result.requestKey,'status',result.intent);await authorize(c,owner,current);if(!opsSame(pendingOps(owner),previous)||!opsSame(verified,result))return fail();const attempt={owner,key:result.requestKey,intent:result.intent,result:verified};localStorage.setItem(slot(owner),JSON.stringify(attempt));if(!opsSame(pendingOps(owner),attempt))return fail();return attempt;});
}
