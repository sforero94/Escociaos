import {recoverChequeoWeb,chequeoWeb,type ChequeoRpcClient} from '../importHato/preparedChequeoRpc';
import {chequeoIntent,sameChequeo,validateChequeoResult,type ChequeoIntent,type ChequeoResult} from '../importHato/preparedChequeo';
export interface ChequeoBrowserClient extends ChequeoRpcClient {prepare(key:string,intent:ChequeoIntent):Promise<unknown>;auth:{getUser():PromiseLike<{data:{user:{id:string}|null};error:unknown}>}}
export interface ChequeoBrowserAttempt {owner:string;key:string;intent:ChequeoIntent;result:ChequeoResult|null}
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const slot=(owner:string)=>`hato_chequeo_v1:${owner}`;
const fail=():never=>{throw Error('Conserve y verifique el intento original antes de iniciar otro.');};
export function pendingChequeoBrowser(owner:string):ChequeoBrowserAttempt|null{
 if(!uuid(owner))return fail();const raw=localStorage.getItem(slot(owner));if(raw===null)return null;
 try{const a=JSON.parse(raw) as ChequeoBrowserAttempt;
  if(!a||Object.keys(a).sort().join('|')!=='intent|key|owner|result'||a.owner!==owner||!uuid(a.key)||!sameChequeo(a.intent,chequeoIntent(a.intent)))return fail();
  if(a.result!==null)validateChequeoResult(a.result,owner,a.key,a.intent);return a;
 }catch{return fail();}
}
async function authorize(c:ChequeoBrowserClient,owner:string,current:()=>boolean){const r=await c.auth.getUser();if(r.error||r.data.user?.id!==owner||!current())throw Error('La sesión o el formulario cambió. Conserve el intento original.');}
/** Preparing never posts: human review uses the returned original snapshot. */
export async function runChequeoBrowser(c:ChequeoBrowserClient,owner:string,intent:ChequeoIntent|null,mode:'prepare'|'post'|'status'|'resolve'|'new',current:()=>boolean,reviewed:ChequeoBrowserAttempt|null=null):Promise<ChequeoBrowserAttempt|null>{
 if(!uuid(owner)||!['prepare','post','status','resolve','new'].includes(mode)||!globalThis.navigator?.locks)throw Error('Use un navegador actualizado con HTTPS para aprobar el chequeo.');
 return navigator.locks.request(slot(owner),{mode:'exclusive'},async()=>{
  await authorize(c,owner,current);let a=pendingChequeoBrowser(owner);
  if(!a&&!reviewed&&(mode==='prepare'||mode==='status')){
   const result=await recoverChequeoWeb(c,owner);await authorize(c,owner,current);
   if(result){const recovered={owner,key:result.requestKey,intent:result.intent!,result};if(pendingChequeoBrowser(owner)!==null)return fail();localStorage.setItem(slot(owner),JSON.stringify(recovered));if(!sameChequeo(pendingChequeoBrowser(owner),recovered))return fail();return recovered;}
  }
  if(!a&&reviewed){
   if(reviewed.owner!==owner||!uuid(reviewed.key)||!sameChequeo(chequeoIntent(reviewed.intent),reviewed.intent))return fail();
   if(reviewed.result)validateChequeoResult(reviewed.result,owner,reviewed.key,reviewed.intent);
   a=reviewed;localStorage.setItem(slot(owner),JSON.stringify(a));if(!sameChequeo(pendingChequeoBrowser(owner),a))return fail();
  }
  if(!a){if(mode!=='prepare'||!intent)return null;const p=chequeoIntent(intent);a={owner,key:crypto.randomUUID(),intent:p,result:null};localStorage.setItem(slot(owner),JSON.stringify(a));if(!sameChequeo(pendingChequeoBrowser(owner),a))return fail();}
  else if(mode==='prepare'&&intent&&!sameChequeo(a.intent,chequeoIntent(intent)))return fail();
  if(['post','resolve','new'].includes(mode)&&(!reviewed||reviewed.owner!==owner||reviewed.key!==a.key||!sameChequeo(reviewed.intent,a.intent)))return fail();
  if(mode==='post'){
   if(reviewed?.result?.state!=='pending'||!a.result||!sameChequeo(reviewed.result,a.result)||!sameChequeo(reviewed.result.intent,a.intent))return fail();
   validateChequeoResult(reviewed.result,owner,a.key,a.intent);
  }
  if(mode==='new'&&!['committed','canceled'].includes(a.result?.state??''))return fail();
  await authorize(c,owner,current);
  let result:ChequeoResult;
  if(mode==='prepare')result=validateChequeoResult(await c.prepare(a.key,a.intent),owner,a.key,a.intent);
  else if(mode==='post'){
   if(a.result?.state==='committed'||a.result?.state==='canceled')result=await chequeoWeb(c,owner,a.key,'status',a.result??undefined);
   else {if(a.result?.state!=='pending'||!a.result.intent||!a.result.original)return fail();result=await chequeoWeb(c,owner,a.key,'post',a.result??undefined);}
  }else result=await chequeoWeb(c,owner,a.key,mode==='resolve'?'resolve':mode==='new'?'acknowledge':'status',a.result??undefined);
  validateChequeoResult(result,owner,a.key,a.intent);
  if(a.result?.original&&(!sameChequeo(result.original,a.result.original)||!sameChequeo(result.plan,a.result.plan)||result.effectiveDate!==a.result.effectiveDate))return fail();
  if(a.result&&['committed','canceled'].includes(a.result.state)&&!sameChequeo(a.result,{...result,acknowledged:a.result.acknowledged}))return fail();
  await authorize(c,owner,current);
  if(!sameChequeo(pendingChequeoBrowser(owner),a))return fail();
  if(mode==='new'){
   if(!result.acknowledged||!['committed','canceled'].includes(result.state))return fail();localStorage.removeItem(slot(owner));if(pendingChequeoBrowser(owner)!==null)return fail();return null;
  }
  const next={...a,result};localStorage.setItem(slot(owner),JSON.stringify(next));if(!sameChequeo(pendingChequeoBrowser(owner),next))return fail();return next;
 });
}
