import {deathIntent,deathWeb,sameDeath,validateDeathResult,type DeathClient,type DeathIntent,type DeathResult} from './hatoDeathProtocol';
export interface DeathBrowserClient extends DeathClient {auth:{getUser():PromiseLike<{data:{user:{id:string}|null};error:unknown}>}}
export interface DeathBrowserAttempt {owner:string;key:string;intent:DeathIntent;result:DeathResult|null}
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const slot=(owner:string)=>`hato_death_v1:${owner}`;
const fail=():never=>{throw Error('Conserve y verifique el intento original antes de iniciar otro.');};
export function pendingDeathBrowser(owner:string):DeathBrowserAttempt|null{
 if(!uuid(owner))return fail();const raw=localStorage.getItem(slot(owner));if(raw===null)return null;
 try{const a=JSON.parse(raw) as DeathBrowserAttempt;
  if(!a||Object.keys(a).sort().join('|')!=='intent|key|owner|result'||a.owner!==owner||!uuid(a.key)||!sameDeath(a.intent,deathIntent(a.intent)))return fail();
  if(a.result!==null)validateDeathResult(a.result,owner,a.key,a.intent);return a;
 }catch{return fail();}
}
async function authorize(c:DeathBrowserClient,owner:string,current:()=>boolean){const r=await c.auth.getUser();if(r.error||r.data.user?.id!==owner||!current())throw Error('La sesión o el formulario cambió. Conserve el intento original.');}
/** Preparing never posts: human review uses the returned original snapshot. */
export async function runDeathBrowser(c:DeathBrowserClient,owner:string,intent:DeathIntent|null,mode:'prepare'|'post'|'status'|'resolve'|'new',current:()=>boolean,reviewed:DeathBrowserAttempt|null=null):Promise<DeathBrowserAttempt|null>{
 if(!uuid(owner)||!['prepare','post','status','resolve','new'].includes(mode)||!globalThis.navigator?.locks)throw Error('Use un navegador actualizado con HTTPS para registrar la muerte.');
 return navigator.locks.request(slot(owner),{mode:'exclusive'},async()=>{
  await authorize(c,owner,current);let a=pendingDeathBrowser(owner);
  if(!a&&reviewed){
   if(reviewed.owner!==owner||!uuid(reviewed.key)||!sameDeath(deathIntent(reviewed.intent),reviewed.intent))return fail();
   if(reviewed.result)validateDeathResult(reviewed.result,owner,reviewed.key,reviewed.intent);
   a=reviewed;localStorage.setItem(slot(owner),JSON.stringify(a));if(!sameDeath(pendingDeathBrowser(owner),a))return fail();
  }
  if(!a){if(mode!=='prepare'||!intent)return null;const p=deathIntent(intent);a={owner,key:crypto.randomUUID(),intent:p,result:null};localStorage.setItem(slot(owner),JSON.stringify(a));if(!sameDeath(pendingDeathBrowser(owner),a))return fail();}
  else if(mode==='prepare'&&intent&&!sameDeath(a.intent,deathIntent(intent)))return fail();
  if(['post','resolve','new'].includes(mode)&&(!reviewed||reviewed.owner!==owner||reviewed.key!==a.key||!sameDeath(reviewed.intent,a.intent)))return fail();
  if(mode==='post'){
   if(reviewed?.result?.state!=='pending'||!a.result||!sameDeath(reviewed.result,a.result)||!sameDeath(reviewed.result.intent,a.intent))return fail();
   validateDeathResult(reviewed.result,owner,a.key,a.intent);
  }
  await authorize(c,owner,current);
  let result:DeathResult;
  if(mode==='prepare')result=await deathWeb(c,owner,a.key,'prepare',a.intent);
  else if(mode==='post'){
   if(a.result?.state==='committed'||a.result?.state==='canceled')result=await deathWeb(c,owner,a.key,'status',null,a.intent);
   else {if(a.result?.state!=='pending'||!a.result.intent||!a.result.original)return fail();result=await deathWeb(c,owner,a.key,'post',null,a.intent);}
  }else result=await deathWeb(c,owner,a.key,mode==='resolve'?'resolve':'status',null,a.intent);
  validateDeathResult(result,owner,a.key,a.intent);
  if(a.result?.original&&(!sameDeath(result.original,a.result.original)||result.eventId!==a.result.eventId))return fail();
  await authorize(c,owner,current);
  if(!sameDeath(pendingDeathBrowser(owner),a))return fail();
  if(mode==='new'){
   if(result.state!=='committed'&&result.state!=='canceled')return fail();localStorage.removeItem(slot(owner));return null;
  }
  const next={...a,result};localStorage.setItem(slot(owner),JSON.stringify(next));return next;
 });
}
