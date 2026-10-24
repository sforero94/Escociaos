import {recoverSaleCorrection,saleCorrectionIntent,saleCorrectionWeb,sameSaleCorrection,saleCorrectionResult,saleCorrectionDraft,saleCorrectionCapture,type SaleCorrectionClient,type SaleCorrectionIntent,type SaleCorrectionResult,type SaleCorrectionDraft} from './financialSaleCorrectionProtocol';
export interface SaleCorrectionBrowserClient extends SaleCorrectionClient {auth:{getUser():PromiseLike<{data:{user:{id:string}|null};error:unknown}>}}
export interface SaleCorrectionBrowserAttempt {owner:string;key:string;intent:SaleCorrectionIntent;result:SaleCorrectionResult|null}
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const slot=(owner:string)=>`financial_sale_correction_v1:${owner}`;
const fail=():never=>{throw Error('Conserve y verifique el intento original antes de iniciar otro.');};
export function pendingSaleCorrectionBrowser(owner:string):SaleCorrectionBrowserAttempt|null{
 if(!uuid(owner))return fail();const raw=localStorage.getItem(slot(owner));if(raw===null)return null;
 try{const a=JSON.parse(raw) as SaleCorrectionBrowserAttempt;
  if(!a||Object.keys(a).sort().join('|')!=='intent|key|owner|result'||a.owner!==owner||!uuid(a.key)||!sameSaleCorrection(a.intent,saleCorrectionIntent(a.intent)))return fail();
  if(a.result!==null)saleCorrectionResult(a.result,owner,a.key,a.intent);return a;
 }catch{return fail();}
}
async function authorize(c:SaleCorrectionBrowserClient,owner:string,current:()=>boolean){const r=await c.auth.getUser();if(r.error||r.data.user?.id!==owner||!current())throw Error('La sesión o el formulario cambió. Conserve el intento original.');}
/** Preparing never posts: human review uses the returned original snapshot. */
export async function runSaleCorrectionBrowser(c:SaleCorrectionBrowserClient,owner:string,draft:SaleCorrectionDraft|null,mode:'prepare'|'post'|'status'|'resolve'|'new',current:()=>boolean,reviewed:SaleCorrectionBrowserAttempt|null=null):Promise<SaleCorrectionBrowserAttempt|null>{
 if(!uuid(owner)||!['prepare','post','status','resolve','new'].includes(mode)||!globalThis.navigator?.locks)throw Error('Use un navegador actualizado con HTTPS para revisar la corrección financiera.');
 return navigator.locks.request(slot(owner),{mode:'exclusive'},async()=>{
  await authorize(c,owner,current);let a=pendingSaleCorrectionBrowser(owner);
  if(!a&&!reviewed&&(mode==='prepare'||mode==='status')){
   const result=await recoverSaleCorrection(c,owner);await authorize(c,owner,current);
   if(result){const recovered={owner,key:result.requestKey,intent:result.intent!,result};if(pendingSaleCorrectionBrowser(owner)!==null)return fail();localStorage.setItem(slot(owner),JSON.stringify(recovered));if(!sameSaleCorrection(pendingSaleCorrectionBrowser(owner),recovered))return fail();return recovered;}
  }
  if(!a&&reviewed){
   if(reviewed.owner!==owner||!uuid(reviewed.key)||!sameSaleCorrection(saleCorrectionIntent(reviewed.intent),reviewed.intent))return fail();
   if(reviewed.result)saleCorrectionResult(reviewed.result,owner,reviewed.key,reviewed.intent);
   a=reviewed;localStorage.setItem(slot(owner),JSON.stringify(a));if(!sameSaleCorrection(pendingSaleCorrectionBrowser(owner),a))return fail();
  }
  if(!a){if(mode!=='prepare'||!draft)return null;const d=saleCorrectionDraft(draft),capture=await saleCorrectionCapture(c,owner,d);await authorize(c,owner,current);const p=saleCorrectionIntent({...d,...capture});a={owner,key:crypto.randomUUID(),intent:p,result:null};localStorage.setItem(slot(owner),JSON.stringify(a));if(!sameSaleCorrection(pendingSaleCorrectionBrowser(owner),a))return fail();}
  else if(mode==='prepare'&&draft&&!sameSaleCorrection({version:a.intent.version,kind:a.intent.kind,targetId:a.intent.targetId,fields:a.intent.fields},saleCorrectionDraft(draft)))return fail();
  if(['post','resolve','new'].includes(mode)&&(!reviewed||reviewed.owner!==owner||reviewed.key!==a.key||!sameSaleCorrection(reviewed.intent,a.intent)))return fail();
  if(mode==='post'){
   if(reviewed?.result?.state!=='pending'||!a.result||!sameSaleCorrection(reviewed.result,a.result)||!sameSaleCorrection(reviewed.result.intent,a.intent))return fail();
   saleCorrectionResult(reviewed.result,owner,a.key,a.intent);
  }
  if(mode==='new'&&!['committed','canceled'].includes(a.result?.state??''))return fail();
  await authorize(c,owner,current);
  let result:SaleCorrectionResult;
  if(mode==='prepare')result=await saleCorrectionWeb(c,owner,a.key,'prepare',a.intent,a.result??undefined);
  else if(mode==='post'){
   if(a.result?.state==='committed'||a.result?.state==='canceled')result=await saleCorrectionWeb(c,owner,a.key,'status',null,a.result??undefined);
   else {if(a.result?.state!=='pending'||!a.result.intent||!a.result.original)return fail();result=await saleCorrectionWeb(c,owner,a.key,'post',null,a.result??undefined);}
  }else result=await saleCorrectionWeb(c,owner,a.key,mode==='resolve'?'resolve':mode==='new'?'acknowledge':'status',null,a.result??undefined);
  saleCorrectionResult(result,owner,a.key,a.intent);
  if(a.result?.original&&(!sameSaleCorrection(result.original,a.result.original)||!sameSaleCorrection(result.plan,a.result.plan)||result.effectiveDate!==a.result.effectiveDate))return fail();
  if(a.result&&['committed','canceled'].includes(a.result.state)&&!sameSaleCorrection(a.result,{...result,acknowledged:a.result.acknowledged}))return fail();
  await authorize(c,owner,current);
  if(!sameSaleCorrection(pendingSaleCorrectionBrowser(owner),a))return fail();
  if(mode==='new'){
   if(!result.acknowledged||!['committed','canceled'].includes(result.state))return fail();localStorage.removeItem(slot(owner));if(pendingSaleCorrectionBrowser(owner)!==null)return fail();return null;
  }
  const next={...a,result};localStorage.setItem(slot(owner),JSON.stringify(next));if(!sameSaleCorrection(pendingSaleCorrectionBrowser(owner),next))return fail();return next;
 });
}
