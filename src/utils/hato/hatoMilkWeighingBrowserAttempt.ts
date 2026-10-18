import {recoverMilkWeighingWeb,milkWeighingIntent,milkWeighingWeb,sameMilkWeighing,validateMilkWeighingResult,type MilkWeighingClient,type MilkWeighingIntent,type MilkWeighingResult} from './hatoMilkWeighingProtocol';
export interface MilkWeighingBrowserClient extends MilkWeighingClient {auth:{getUser():PromiseLike<{data:{user:{id:string}|null};error:unknown}>}}
export interface MilkWeighingBrowserAttempt {owner:string;key:string;intent:MilkWeighingIntent;result:MilkWeighingResult|null}
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const slot=(owner:string)=>`hato_milk_weighing_v1:${owner}`;
const fail=():never=>{throw Error('Conserve y verifique el intento original antes de iniciar otro.');};
export function pendingMilkWeighingBrowser(owner:string):MilkWeighingBrowserAttempt|null{
 if(!uuid(owner))return fail();const raw=localStorage.getItem(slot(owner));if(raw===null)return null;
 try{const a=JSON.parse(raw) as MilkWeighingBrowserAttempt;
  if(!a||Object.keys(a).sort().join('|')!=='intent|key|owner|result'||a.owner!==owner||!uuid(a.key)||!sameMilkWeighing(a.intent,milkWeighingIntent(a.intent)))return fail();
  if(a.result!==null)validateMilkWeighingResult(a.result,owner,a.key,a.intent);return a;
 }catch{return fail();}
}
async function authorize(c:MilkWeighingBrowserClient,owner:string,current:()=>boolean){const r=await c.auth.getUser();if(r.error||r.data.user?.id!==owner||!current())throw Error('La sesión o el formulario cambió. Conserve el intento original.');}
/** Preparing never posts: human review uses the returned original snapshot. */
export async function runMilkWeighingBrowser(c:MilkWeighingBrowserClient,owner:string,intent:MilkWeighingIntent|null,mode:'prepare'|'post'|'status'|'resolve'|'new',current:()=>boolean,reviewed:MilkWeighingBrowserAttempt|null=null):Promise<MilkWeighingBrowserAttempt|null>{
 if(!uuid(owner)||!['prepare','post','status','resolve','new'].includes(mode)||!globalThis.navigator?.locks)throw Error('Use un navegador actualizado con HTTPS para registrar el pesaje.');
 return navigator.locks.request(slot(owner),{mode:'exclusive'},async()=>{
  await authorize(c,owner,current);let a=pendingMilkWeighingBrowser(owner);
  if(!a&&!reviewed&&(mode==='prepare'||mode==='status')){
   const result=await recoverMilkWeighingWeb(c,owner);await authorize(c,owner,current);
   if(result){const recovered={owner,key:result.requestKey,intent:result.intent!,result};if(pendingMilkWeighingBrowser(owner)!==null)return fail();localStorage.setItem(slot(owner),JSON.stringify(recovered));if(!sameMilkWeighing(pendingMilkWeighingBrowser(owner),recovered))return fail();return recovered;}
  }
  if(!a&&reviewed){
   if(reviewed.owner!==owner||!uuid(reviewed.key)||!sameMilkWeighing(milkWeighingIntent(reviewed.intent),reviewed.intent))return fail();
   if(reviewed.result)validateMilkWeighingResult(reviewed.result,owner,reviewed.key,reviewed.intent);
   a=reviewed;localStorage.setItem(slot(owner),JSON.stringify(a));if(!sameMilkWeighing(pendingMilkWeighingBrowser(owner),a))return fail();
  }
  if(!a){if(mode!=='prepare'||!intent)return null;const p=milkWeighingIntent(intent);a={owner,key:crypto.randomUUID(),intent:p,result:null};localStorage.setItem(slot(owner),JSON.stringify(a));if(!sameMilkWeighing(pendingMilkWeighingBrowser(owner),a))return fail();}
  else if(mode==='prepare'&&intent&&!sameMilkWeighing(a.intent,milkWeighingIntent(intent)))return fail();
  if(['post','resolve','new'].includes(mode)&&(!reviewed||reviewed.owner!==owner||reviewed.key!==a.key||!sameMilkWeighing(reviewed.intent,a.intent)))return fail();
  if(mode==='post'){
   if(reviewed?.result?.state!=='pending'||!a.result||!sameMilkWeighing(reviewed.result,a.result)||!sameMilkWeighing(reviewed.result.intent,a.intent))return fail();
   validateMilkWeighingResult(reviewed.result,owner,a.key,a.intent);
  }
  if(mode==='new'&&!['committed','canceled'].includes(a.result?.state??''))return fail();
  await authorize(c,owner,current);
  let result:MilkWeighingResult;
  if(mode==='prepare')result=await milkWeighingWeb(c,owner,a.key,'prepare',a.intent,a.result??undefined);
  else if(mode==='post'){
   if(a.result?.state==='committed'||a.result?.state==='canceled')result=await milkWeighingWeb(c,owner,a.key,'status',null,a.result??undefined);
   else {if(a.result?.state!=='pending'||!a.result.intent||!a.result.original)return fail();result=await milkWeighingWeb(c,owner,a.key,'post',null,a.result??undefined);}
  }else result=await milkWeighingWeb(c,owner,a.key,mode==='resolve'?'resolve':mode==='new'?'acknowledge':'status',null,a.result??undefined);
  validateMilkWeighingResult(result,owner,a.key,a.intent);
  if(a.result?.original&&(!sameMilkWeighing(result.original,a.result.original)||!sameMilkWeighing(result.plan,a.result.plan)||result.effectiveDate!==a.result.effectiveDate))return fail();
  if(a.result&&['committed','canceled'].includes(a.result.state)&&!sameMilkWeighing(a.result,{...result,acknowledged:a.result.acknowledged}))return fail();
  await authorize(c,owner,current);
  if(!sameMilkWeighing(pendingMilkWeighingBrowser(owner),a))return fail();
  if(mode==='new'){
   if(!result.acknowledged||!['committed','canceled'].includes(result.state))return fail();localStorage.removeItem(slot(owner));if(pendingMilkWeighingBrowser(owner)!==null)return fail();return null;
  }
  const next={...a,result};localStorage.setItem(slot(owner),JSON.stringify(next));if(!sameMilkWeighing(pendingMilkWeighingBrowser(owner),next))return fail();return next;
 });
}
