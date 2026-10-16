import {cycleIntent,cycleWeb,sameCycle,validateCycleResult,type CycleClient,type CycleIntent,type CycleResult} from './hatoCycleProtocol';
export interface CycleBrowserClient extends CycleClient {auth:{getUser():PromiseLike<{data:{user:{id:string}|null};error:unknown}>}}
export interface CycleBrowserAttempt {owner:string;key:string;intent:CycleIntent;result:CycleResult|null}
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const slot=(owner:string)=>`hato_cycle_v1:${owner}`;
const fail=():never=>{throw Error('Conserve y verifique el intento original antes de iniciar otro.');};
export function pendingCycleBrowser(owner:string):CycleBrowserAttempt|null{
 if(!uuid(owner))return fail();const raw=localStorage.getItem(slot(owner));if(raw===null)return null;
 try{const a=JSON.parse(raw) as CycleBrowserAttempt;
  if(!a||Object.keys(a).sort().join('|')!=='intent|key|owner|result'||a.owner!==owner||!uuid(a.key)||!sameCycle(a.intent,cycleIntent(a.intent)))return fail();
  if(a.result!==null)validateCycleResult(a.result,owner,a.key,a.intent);return a;
 }catch{return fail();}
}
async function authorize(c:CycleBrowserClient,owner:string,current:()=>boolean){const r=await c.auth.getUser();if(r.error||r.data.user?.id!==owner||!current())throw Error('La sesión o el formulario cambió. Conserve el intento original.');}
/** Preparing never posts: human review uses the returned original snapshot. */
export async function runCycleBrowser(c:CycleBrowserClient,owner:string,intent:CycleIntent|null,mode:'prepare'|'post'|'status'|'resolve'|'new',current:()=>boolean,reviewed:CycleBrowserAttempt|null=null):Promise<CycleBrowserAttempt|null>{
 if(!uuid(owner)||!['prepare','post','status','resolve','new'].includes(mode)||!globalThis.navigator?.locks)throw Error('Use un navegador actualizado con HTTPS para marcar el ciclo.');
 return navigator.locks.request(slot(owner),{mode:'exclusive'},async()=>{
  await authorize(c,owner,current);let a=pendingCycleBrowser(owner);
  if(!a&&reviewed){
   if(reviewed.owner!==owner||!uuid(reviewed.key)||!sameCycle(cycleIntent(reviewed.intent),reviewed.intent))return fail();
   if(reviewed.result)validateCycleResult(reviewed.result,owner,reviewed.key,reviewed.intent);
   a=reviewed;localStorage.setItem(slot(owner),JSON.stringify(a));if(!sameCycle(pendingCycleBrowser(owner),a))return fail();
  }
  if(!a){if(mode!=='prepare'||!intent)return null;const p=cycleIntent(intent);a={owner,key:crypto.randomUUID(),intent:p,result:null};localStorage.setItem(slot(owner),JSON.stringify(a));if(!sameCycle(pendingCycleBrowser(owner),a))return fail();}
  else if(mode==='prepare'&&intent&&!sameCycle(a.intent,cycleIntent(intent)))return fail();
  if(['post','resolve','new'].includes(mode)&&(!reviewed||reviewed.owner!==owner||reviewed.key!==a.key||!sameCycle(reviewed.intent,a.intent)))return fail();
  if(mode==='post'){
   if(reviewed?.result?.state!=='pending'||!a.result||!sameCycle(reviewed.result,a.result)||!sameCycle(reviewed.result.intent,a.intent))return fail();
   validateCycleResult(reviewed.result,owner,a.key,a.intent);
  }
  await authorize(c,owner,current);
  let result:CycleResult;
  if(mode==='prepare')result=await cycleWeb(c,owner,a.key,'prepare',a.intent);
  else if(mode==='post'){
   if(a.result?.state==='committed'||a.result?.state==='canceled')result=await cycleWeb(c,owner,a.key,'status',null,a.intent);
   else {if(a.result?.state!=='pending'||!a.result.intent||!a.result.original)return fail();result=await cycleWeb(c,owner,a.key,'post',null,a.intent);}
  }else result=await cycleWeb(c,owner,a.key,mode==='resolve'?'resolve':'status',null,a.intent);
  validateCycleResult(result,owner,a.key,a.intent);
  if(a.result?.original&&(!sameCycle(result.original,a.result.original)||result.effectiveDate!==a.result.effectiveDate||!sameCycle(result.plan,a.result.plan)))return fail();
  if(a.result&&['committed','canceled'].includes(a.result.state)&&!sameCycle(a.result,result))return fail();
  await authorize(c,owner,current);
  if(!sameCycle(pendingCycleBrowser(owner),a))return fail();
  if(mode==='new'){
   if(result.state!=='committed'&&result.state!=='canceled')return fail();localStorage.removeItem(slot(owner));return null;
  }
  const next={...a,result};localStorage.setItem(slot(owner),JSON.stringify(next));return next;
 });
}
