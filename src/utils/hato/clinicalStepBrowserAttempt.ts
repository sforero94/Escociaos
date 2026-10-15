import {clinicalIntent,prepareClinicalWeb,queryClinicalWeb,resolveClinicalWeb,sameClinical,validateClinicalResult,type ClinicalClient,type ClinicalIntent,type ClinicalResult} from './clinicalStepConfirmationProtocol';
export interface ClinicalBrowserClient extends ClinicalClient {auth:{getUser():PromiseLike<{data:{user:{id:string}|null};error:unknown}>}}
export interface ClinicalBrowserAttempt {owner:string;key:string;intent:ClinicalIntent;result:ClinicalResult|null}
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const slot=(owner:string)=>`hato_clinical_step_v1:${owner}`;
const fail=():never=>{throw Error('Conserve y verifique el intento clínico original antes de iniciar otro.');};
export function pendingClinicalBrowser(owner:string):ClinicalBrowserAttempt|null{
 if(!uuid(owner))return fail();const raw=localStorage.getItem(slot(owner));if(raw===null)return null;
 try{const a=JSON.parse(raw) as ClinicalBrowserAttempt;
  if(!a||Object.keys(a).sort().join('|')!=='intent|key|owner|result'||a.owner!==owner||!uuid(a.key)||!sameClinical(a.intent,clinicalIntent(a.intent)))return fail();
  if(a.result!==null)validateClinicalResult(a.result,owner,null,a.key,a.intent);return a;
 }catch{return fail();}
}
async function authorize(c:ClinicalBrowserClient,owner:string,current:()=>boolean){const r=await c.auth.getUser();if(r.error||r.data.user?.id!==owner||!current())throw Error('La sesión o el formulario cambió. Conserve el intento original.');}
/** Preparing never posts: human review uses the returned original snapshot. */
export async function runClinicalBrowser(c:ClinicalBrowserClient,owner:string,intent:ClinicalIntent|null,mode:'prepare'|'post'|'status'|'resolve'|'new',current:()=>boolean,reviewed:ClinicalBrowserAttempt|null=null):Promise<ClinicalBrowserAttempt|null>{
 if(!uuid(owner)||!['prepare','post','status','resolve','new'].includes(mode)||!globalThis.navigator?.locks)throw Error('Use un navegador actualizado con HTTPS para confirmar el paso.');
 return navigator.locks.request(slot(owner),{mode:'exclusive'},async()=>{
  await authorize(c,owner,current);let a=pendingClinicalBrowser(owner);
  if(!a&&reviewed){
   if(reviewed.owner!==owner||!uuid(reviewed.key)||!sameClinical(clinicalIntent(reviewed.intent),reviewed.intent))return fail();
   if(reviewed.result)validateClinicalResult(reviewed.result,owner,null,reviewed.key,reviewed.intent);
   a=reviewed;localStorage.setItem(slot(owner),JSON.stringify(a));if(!sameClinical(pendingClinicalBrowser(owner),a))return fail();
  }
  if(!a){if(mode!=='prepare'||!intent)return null;const p=clinicalIntent(intent);a={owner,key:crypto.randomUUID(),intent:p,result:null};localStorage.setItem(slot(owner),JSON.stringify(a));if(!sameClinical(pendingClinicalBrowser(owner),a))return fail();}
  else if(mode==='prepare'&&intent&&!sameClinical(a.intent,clinicalIntent(intent)))return fail();
  if(['post','resolve','new'].includes(mode)&&(!reviewed||reviewed.owner!==owner||reviewed.key!==a.key||!sameClinical(reviewed.intent,a.intent)))return fail();
  if(mode==='post'){
   if(reviewed?.result?.state!=='pending'||!a.result||!sameClinical(reviewed.result.original,a.result.original)||!sameClinical(reviewed.result.actor,a.result.actor)||!sameClinical(reviewed.result.intent,a.intent))return fail();
   validateClinicalResult(reviewed.result,owner,null,a.key,a.intent);
  }
  await authorize(c,owner,current);
  let result:ClinicalResult;
  if(mode==='prepare')result=await prepareClinicalWeb(c,owner,a.key,a.intent);
  else if(mode==='post'){
   if(a.result?.state==='committed'||a.result?.state==='canceled')result=await resolveClinicalWeb(c,owner,a.key,'status');
   else {if(a.result?.state!=='pending'||!a.result.intent||!a.result.original)return fail();result=await queryClinicalWeb(c,owner,a.result,'post');}
  }else result=await resolveClinicalWeb(c,owner,a.key,mode==='resolve'?'resolve':'status');
  validateClinicalResult(result,owner,null,a.key,a.intent,a.result?.actor);
  await authorize(c,owner,current);
  if(!sameClinical(pendingClinicalBrowser(owner),a))return fail();
  if(mode==='new'){
   if(result.state!=='committed'&&result.state!=='canceled')return fail();localStorage.removeItem(slot(owner));return null;
  }
  const next={...a,result};localStorage.setItem(slot(owner),JSON.stringify(next));return next;
 });
}
