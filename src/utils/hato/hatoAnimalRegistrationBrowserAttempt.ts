import {recoverAnimalRegistrationWeb,animalRegistrationIntent,animalRegistrationWeb,sameAnimalRegistration,validateAnimalRegistrationResult,type AnimalRegistrationClient,type AnimalRegistrationIntent,type AnimalRegistrationResult} from './hatoAnimalRegistrationProtocol';
export interface AnimalRegistrationBrowserClient extends AnimalRegistrationClient {auth:{getUser():PromiseLike<{data:{user:{id:string}|null};error:unknown}>}}
export interface AnimalRegistrationBrowserAttempt {owner:string;key:string;intent:AnimalRegistrationIntent;result:AnimalRegistrationResult|null}
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const slot=(owner:string)=>`hato_animal_registration_v1:${owner}`;
const fail=():never=>{throw Error('Conserve y verifique el intento original antes de iniciar otro.');};
export function pendingAnimalRegistrationBrowser(owner:string):AnimalRegistrationBrowserAttempt|null{
 if(!uuid(owner))return fail();const raw=localStorage.getItem(slot(owner));if(raw===null)return null;
 try{const a=JSON.parse(raw) as AnimalRegistrationBrowserAttempt;
  if(!a||Object.keys(a).sort().join('|')!=='intent|key|owner|result'||a.owner!==owner||!uuid(a.key)||!sameAnimalRegistration(a.intent,animalRegistrationIntent(a.intent)))return fail();
  if(a.result!==null)validateAnimalRegistrationResult(a.result,owner,a.key,a.intent);return a;
 }catch{return fail();}
}
async function authorize(c:AnimalRegistrationBrowserClient,owner:string,current:()=>boolean){const r=await c.auth.getUser();if(r.error||r.data.user?.id!==owner||!current())throw Error('La sesión o el formulario cambió. Conserve el intento original.');}
/** Preparing never posts: human review uses the returned original snapshot. */
export async function runAnimalRegistrationBrowser(c:AnimalRegistrationBrowserClient,owner:string,intent:AnimalRegistrationIntent|null,mode:'prepare'|'post'|'status'|'resolve'|'new',current:()=>boolean,reviewed:AnimalRegistrationBrowserAttempt|null=null):Promise<AnimalRegistrationBrowserAttempt|null>{
 if(!uuid(owner)||!['prepare','post','status','resolve','new'].includes(mode)||!globalThis.navigator?.locks)throw Error('Use un navegador actualizado con HTTPS para registrar el animal.');
 return navigator.locks.request(slot(owner),{mode:'exclusive'},async()=>{
  await authorize(c,owner,current);let a=pendingAnimalRegistrationBrowser(owner);
  if(!a&&!reviewed&&(mode==='prepare'||mode==='status')){
   const result=await recoverAnimalRegistrationWeb(c,owner);await authorize(c,owner,current);
   if(result){const recovered={owner,key:result.requestKey,intent:result.intent!,result};if(pendingAnimalRegistrationBrowser(owner)!==null)return fail();localStorage.setItem(slot(owner),JSON.stringify(recovered));if(!sameAnimalRegistration(pendingAnimalRegistrationBrowser(owner),recovered))return fail();return recovered;}
  }
  if(!a&&reviewed){
   if(reviewed.owner!==owner||!uuid(reviewed.key)||!sameAnimalRegistration(animalRegistrationIntent(reviewed.intent),reviewed.intent))return fail();
   if(reviewed.result)validateAnimalRegistrationResult(reviewed.result,owner,reviewed.key,reviewed.intent);
   a=reviewed;localStorage.setItem(slot(owner),JSON.stringify(a));if(!sameAnimalRegistration(pendingAnimalRegistrationBrowser(owner),a))return fail();
  }
  if(!a){if(mode!=='prepare'||!intent)return null;const p=animalRegistrationIntent(intent);a={owner,key:crypto.randomUUID(),intent:p,result:null};localStorage.setItem(slot(owner),JSON.stringify(a));if(!sameAnimalRegistration(pendingAnimalRegistrationBrowser(owner),a))return fail();}
  else if(mode==='prepare'&&intent&&!sameAnimalRegistration(a.intent,animalRegistrationIntent(intent)))return fail();
  if(['post','resolve','new'].includes(mode)&&(!reviewed||reviewed.owner!==owner||reviewed.key!==a.key||!sameAnimalRegistration(reviewed.intent,a.intent)))return fail();
  if(mode==='post'){
   if(reviewed?.result?.state!=='pending'||!a.result||!sameAnimalRegistration(reviewed.result,a.result)||!sameAnimalRegistration(reviewed.result.intent,a.intent))return fail();
   validateAnimalRegistrationResult(reviewed.result,owner,a.key,a.intent);
  }
  if(mode==='new'&&!['committed','canceled'].includes(a.result?.state??''))return fail();
  await authorize(c,owner,current);
  let result:AnimalRegistrationResult;
  if(mode==='prepare')result=await animalRegistrationWeb(c,owner,a.key,'prepare',a.intent,a.result??undefined);
  else if(mode==='post'){
   if(a.result?.state==='committed'||a.result?.state==='canceled')result=await animalRegistrationWeb(c,owner,a.key,'status',null,a.result??undefined);
   else {if(a.result?.state!=='pending'||!a.result.intent||!a.result.original)return fail();result=await animalRegistrationWeb(c,owner,a.key,'post',null,a.result??undefined);}
  }else result=await animalRegistrationWeb(c,owner,a.key,mode==='resolve'?'resolve':mode==='new'?'acknowledge':'status',null,a.result??undefined);
  validateAnimalRegistrationResult(result,owner,a.key,a.intent);
  if(a.result?.original&&(!sameAnimalRegistration(result.original,a.result.original)||!sameAnimalRegistration(result.plan,a.result.plan)||result.effectiveDate!==a.result.effectiveDate))return fail();
  if(a.result&&['committed','canceled'].includes(a.result.state)&&!sameAnimalRegistration(a.result,{...result,acknowledged:a.result.acknowledged}))return fail();
  await authorize(c,owner,current);
  if(!sameAnimalRegistration(pendingAnimalRegistrationBrowser(owner),a))return fail();
  if(mode==='new'){
   if(!result.acknowledged||!['committed','canceled'].includes(result.state))return fail();localStorage.removeItem(slot(owner));if(pendingAnimalRegistrationBrowser(owner)!==null)return fail();return null;
  }
  const next={...a,result};localStorage.setItem(slot(owner),JSON.stringify(next));if(!sameAnimalRegistration(pendingAnimalRegistrationBrowser(owner),next))return fail();return next;
 });
}
