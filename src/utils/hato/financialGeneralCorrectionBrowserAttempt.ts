import {recoverGeneralCorrection,generalCorrectionIntent,generalCorrectionWeb,sameGeneralCorrection,generalCorrectionResult,generalCorrectionDraft,generalCorrectionCapture,type GeneralCorrectionClient,type GeneralCorrectionIntent,type GeneralCorrectionResult,type GeneralCorrectionDraft} from './financialGeneralCorrectionProtocol';
export interface GeneralCorrectionBrowserClient extends GeneralCorrectionClient {auth:{getUser():PromiseLike<{data:{user:{id:string}|null};error:unknown}>}}
export interface GeneralCorrectionBrowserAttempt {owner:string;key:string;intent:GeneralCorrectionIntent;result:GeneralCorrectionResult|null}
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const slot=(owner:string)=>`financial_general_correction_v1:${owner}`;
const fail=():never=>{throw Error('Conserve y verifique el intento original antes de iniciar otro.');};
export function pendingGeneralCorrectionBrowser(owner:string):GeneralCorrectionBrowserAttempt|null{
 if(!uuid(owner))return fail();const raw=localStorage.getItem(slot(owner));if(raw===null)return null;
 try{const a=JSON.parse(raw) as GeneralCorrectionBrowserAttempt;
  if(!a||Object.keys(a).sort().join('|')!=='intent|key|owner|result'||a.owner!==owner||!uuid(a.key)||!sameGeneralCorrection(a.intent,generalCorrectionIntent(a.intent)))return fail();
  if(a.result!==null)generalCorrectionResult(a.result,owner,a.key,a.intent);return a;
 }catch{return fail();}
}
async function authorize(c:GeneralCorrectionBrowserClient,owner:string,current:()=>boolean){const r=await c.auth.getUser();if(r.error||r.data.user?.id!==owner||!current())throw Error('La sesión o el formulario cambió. Conserve el intento original.');}
/** Preparing never posts: human review uses the returned original snapshot. */
export async function runGeneralCorrectionBrowser(c:GeneralCorrectionBrowserClient,owner:string,draft:GeneralCorrectionDraft|null,mode:'prepare'|'post'|'status'|'resolve'|'new',current:()=>boolean,reviewed:GeneralCorrectionBrowserAttempt|null=null):Promise<GeneralCorrectionBrowserAttempt|null>{
 if(!uuid(owner)||!['prepare','post','status','resolve','new'].includes(mode)||!globalThis.navigator?.locks)throw Error('Use un navegador actualizado con HTTPS para revisar la corrección financiera.');
 return navigator.locks.request(slot(owner),{mode:'exclusive'},async()=>{
  await authorize(c,owner,current);let a=pendingGeneralCorrectionBrowser(owner);
  if(!a&&!reviewed&&(mode==='prepare'||mode==='status')){
   const result=await recoverGeneralCorrection(c,owner);await authorize(c,owner,current);
   if(result){const recovered={owner,key:result.requestKey,intent:result.intent!,result};if(pendingGeneralCorrectionBrowser(owner)!==null)return fail();localStorage.setItem(slot(owner),JSON.stringify(recovered));if(!sameGeneralCorrection(pendingGeneralCorrectionBrowser(owner),recovered))return fail();return recovered;}
  }
  if(!a&&reviewed){
   if(reviewed.owner!==owner||!uuid(reviewed.key)||!sameGeneralCorrection(generalCorrectionIntent(reviewed.intent),reviewed.intent))return fail();
   if(reviewed.result)generalCorrectionResult(reviewed.result,owner,reviewed.key,reviewed.intent);
   a=reviewed;localStorage.setItem(slot(owner),JSON.stringify(a));if(!sameGeneralCorrection(pendingGeneralCorrectionBrowser(owner),a))return fail();
  }
  if(!a){if(mode!=='prepare'||!draft)return null;const d=generalCorrectionDraft(draft),capture=await generalCorrectionCapture(c,owner,d);await authorize(c,owner,current);const p=generalCorrectionIntent({...d,...capture});a={owner,key:crypto.randomUUID(),intent:p,result:null};localStorage.setItem(slot(owner),JSON.stringify(a));if(!sameGeneralCorrection(pendingGeneralCorrectionBrowser(owner),a))return fail();}
  else if(mode==='prepare'&&draft&&!sameGeneralCorrection({version:a.intent.version,kind:a.intent.kind,targetId:a.intent.targetId,fields:a.intent.fields},generalCorrectionDraft(draft)))return fail();
  if(['post','resolve','new'].includes(mode)&&(!reviewed||reviewed.owner!==owner||reviewed.key!==a.key||!sameGeneralCorrection(reviewed.intent,a.intent)))return fail();
  if(mode==='post'){
   if(reviewed?.result?.state!=='pending'||!a.result||!sameGeneralCorrection(reviewed.result,a.result)||!sameGeneralCorrection(reviewed.result.intent,a.intent))return fail();
   generalCorrectionResult(reviewed.result,owner,a.key,a.intent);
  }
  if(mode==='new'&&!['committed','canceled'].includes(a.result?.state??''))return fail();
  await authorize(c,owner,current);
  let result:GeneralCorrectionResult;
  if(mode==='prepare')result=await generalCorrectionWeb(c,owner,a.key,'prepare',a.intent,a.result??undefined);
  else if(mode==='post'){
   if(a.result?.state==='committed'||a.result?.state==='canceled')result=await generalCorrectionWeb(c,owner,a.key,'status',null,a.result??undefined);
   else {if(a.result?.state!=='pending'||!a.result.intent||!a.result.original)return fail();result=await generalCorrectionWeb(c,owner,a.key,'post',null,a.result??undefined);}
  }else result=await generalCorrectionWeb(c,owner,a.key,mode==='resolve'?'resolve':mode==='new'?'acknowledge':'status',null,a.result??undefined);
  generalCorrectionResult(result,owner,a.key,a.intent);
  if(a.result?.original&&(!sameGeneralCorrection(result.original,a.result.original)||!sameGeneralCorrection(result.plan,a.result.plan)||result.effectiveDate!==a.result.effectiveDate))return fail();
  if(a.result&&['committed','canceled'].includes(a.result.state)&&!sameGeneralCorrection(a.result,{...result,acknowledged:a.result.acknowledged}))return fail();
  await authorize(c,owner,current);
  if(!sameGeneralCorrection(pendingGeneralCorrectionBrowser(owner),a))return fail();
  if(mode==='new'){
   if(!result.acknowledged||!['committed','canceled'].includes(result.state))return fail();localStorage.removeItem(slot(owner));if(pendingGeneralCorrectionBrowser(owner)!==null)return fail();return null;
  }
  const next={...a,result};localStorage.setItem(slot(owner),JSON.stringify(next));if(!sameGeneralCorrection(pendingGeneralCorrectionBrowser(owner),next))return fail();return next;
 });
}
