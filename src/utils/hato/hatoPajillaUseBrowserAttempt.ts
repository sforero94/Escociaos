import {recoverPajillaUseWeb,pajillaUseIntent,pajillaUseWeb,samePajillaUse,validatePajillaUseResult,type PajillaUseClient,type PajillaUseIntent,type PajillaUseResult} from './hatoPajillaUseProtocol';
export interface PajillaUseBrowserClient extends PajillaUseClient {auth:{getUser():PromiseLike<{data:{user:{id:string}|null};error:unknown}>}}
export interface PajillaUseBrowserAttempt {owner:string;key:string;intent:PajillaUseIntent;result:PajillaUseResult|null}
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const slot=(owner:string)=>`hato_pajilla_use_v1:${owner}`;
const fail=():never=>{throw Error('Conserve y verifique el intento original antes de iniciar otro.');};
export function pendingPajillaUseBrowser(owner:string):PajillaUseBrowserAttempt|null{
 if(!uuid(owner))return fail();const raw=localStorage.getItem(slot(owner));if(raw===null)return null;
 try{const a=JSON.parse(raw) as PajillaUseBrowserAttempt;
  if(!a||Object.keys(a).sort().join('|')!=='intent|key|owner|result'||a.owner!==owner||!uuid(a.key)||!samePajillaUse(a.intent,pajillaUseIntent(a.intent)))return fail();
  if(a.result!==null)validatePajillaUseResult(a.result,owner,a.key,a.intent);return a;
 }catch{return fail();}
}
async function authorize(c:PajillaUseBrowserClient,owner:string,current:()=>boolean){const r=await c.auth.getUser();if(r.error||r.data.user?.id!==owner||!current())throw Error('La sesión o el formulario cambió. Conserve el intento original.');}
/** Preparing never posts: human review uses the returned original snapshot. */
export async function runPajillaUseBrowser(c:PajillaUseBrowserClient,owner:string,intent:PajillaUseIntent|null,mode:'prepare'|'post'|'status'|'resolve'|'new',current:()=>boolean,reviewed:PajillaUseBrowserAttempt|null=null):Promise<PajillaUseBrowserAttempt|null>{
 if(!uuid(owner)||!['prepare','post','status','resolve','new'].includes(mode)||!globalThis.navigator?.locks)throw Error('Use un navegador actualizado con HTTPS para registrar el uso de pajilla.');
 return navigator.locks.request(slot(owner),{mode:'exclusive'},async()=>{
  await authorize(c,owner,current);let a=pendingPajillaUseBrowser(owner);
  if(!a&&!reviewed&&(mode==='prepare'||mode==='status')){
   const result=await recoverPajillaUseWeb(c,owner);await authorize(c,owner,current);
   if(result){const recovered={owner,key:result.requestKey,intent:result.intent!,result};if(pendingPajillaUseBrowser(owner)!==null)return fail();localStorage.setItem(slot(owner),JSON.stringify(recovered));if(!samePajillaUse(pendingPajillaUseBrowser(owner),recovered))return fail();return recovered;}
  }
  if(!a&&reviewed){
   if(reviewed.owner!==owner||!uuid(reviewed.key)||!samePajillaUse(pajillaUseIntent(reviewed.intent),reviewed.intent))return fail();
   if(reviewed.result)validatePajillaUseResult(reviewed.result,owner,reviewed.key,reviewed.intent);
   a=reviewed;localStorage.setItem(slot(owner),JSON.stringify(a));if(!samePajillaUse(pendingPajillaUseBrowser(owner),a))return fail();
  }
  if(!a){if(mode!=='prepare'||!intent)return null;const p=pajillaUseIntent(intent);a={owner,key:crypto.randomUUID(),intent:p,result:null};localStorage.setItem(slot(owner),JSON.stringify(a));if(!samePajillaUse(pendingPajillaUseBrowser(owner),a))return fail();}
  else if(mode==='prepare'&&intent&&!samePajillaUse(a.intent,pajillaUseIntent(intent)))return fail();
  if(['post','resolve','new'].includes(mode)&&(!reviewed||reviewed.owner!==owner||reviewed.key!==a.key||!samePajillaUse(reviewed.intent,a.intent)))return fail();
  if(mode==='post'){
   if(reviewed?.result?.state!=='pending'||!a.result||!samePajillaUse(reviewed.result,a.result)||!samePajillaUse(reviewed.result.intent,a.intent))return fail();
   validatePajillaUseResult(reviewed.result,owner,a.key,a.intent);
  }
  await authorize(c,owner,current);
  let result:PajillaUseResult;
  if(mode==='prepare')result=await pajillaUseWeb(c,owner,a.key,'prepare',a.intent);
  else if(mode==='post'){
   if(a.result?.state==='committed'||a.result?.state==='canceled')result=await pajillaUseWeb(c,owner,a.key,'status',null,a.intent);
   else {if(a.result?.state!=='pending'||!a.result.intent||!a.result.original)return fail();result=await pajillaUseWeb(c,owner,a.key,'post',null,a.intent);}
  }else result=await pajillaUseWeb(c,owner,a.key,mode==='resolve'?'resolve':mode==='new'?'finish':'status',null,a.intent);
  validatePajillaUseResult(result,owner,a.key,a.intent);
  if(a.result?.original&&(!samePajillaUse(result.original,a.result.original)||!samePajillaUse(result.plan,a.result.plan)||result.effectiveDate!==a.result.effectiveDate))return fail();
  if(a.result&&['committed','canceled'].includes(a.result.state)&&!samePajillaUse(a.result,result))return fail();
  await authorize(c,owner,current);
  if(!samePajillaUse(pendingPajillaUseBrowser(owner),a))return fail();
  if(mode==='new'){
   if(result.state!=='committed'&&result.state!=='canceled')return fail();localStorage.removeItem(slot(owner));if(pendingPajillaUseBrowser(owner)!==null)return fail();return null;
  }
  const next={...a,result};localStorage.setItem(slot(owner),JSON.stringify(next));if(!samePajillaUse(pendingPajillaUseBrowser(owner),next))return fail();return next;
 });
}
