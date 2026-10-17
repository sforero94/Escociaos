import {recoverCatalogCreationWeb,catalogCreationIntent,catalogCreationWeb,sameCatalogCreation,validateCatalogCreationResult,type CatalogCreationClient,type CatalogCreationIntent,type CatalogCreationResult} from './hatoCatalogCreationProtocol';
export interface CatalogCreationBrowserClient extends CatalogCreationClient {auth:{getUser():PromiseLike<{data:{user:{id:string}|null};error:unknown}>}}
export interface CatalogCreationBrowserAttempt {owner:string;key:string;intent:CatalogCreationIntent;result:CatalogCreationResult|null}
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const slot=(owner:string)=>`hato_catalog_creation_v1:${owner}`;
const fail=():never=>{throw Error('Conserve y verifique el intento original antes de iniciar otro.');};
export function pendingCatalogCreationBrowser(owner:string):CatalogCreationBrowserAttempt|null{
 if(!uuid(owner))return fail();const raw=localStorage.getItem(slot(owner));if(raw===null)return null;
 try{const a=JSON.parse(raw) as CatalogCreationBrowserAttempt;
  if(!a||Object.keys(a).sort().join('|')!=='intent|key|owner|result'||a.owner!==owner||!uuid(a.key)||!sameCatalogCreation(a.intent,catalogCreationIntent(a.intent)))return fail();
  if(a.result!==null)validateCatalogCreationResult(a.result,owner,a.key,a.intent);return a;
 }catch{return fail();}
}
async function authorize(c:CatalogCreationBrowserClient,owner:string,current:()=>boolean){const r=await c.auth.getUser();if(r.error||r.data.user?.id!==owner||!current())throw Error('La sesión o el formulario cambió. Conserve el intento original.');}
/** Preparing never posts: human review uses the returned original snapshot. */
export async function runCatalogCreationBrowser(c:CatalogCreationBrowserClient,owner:string,intent:CatalogCreationIntent|null,mode:'prepare'|'post'|'status'|'resolve'|'new',current:()=>boolean,reviewed:CatalogCreationBrowserAttempt|null=null):Promise<CatalogCreationBrowserAttempt|null>{
 if(!uuid(owner)||!['prepare','post','status','resolve','new'].includes(mode)||!globalThis.navigator?.locks)throw Error('Use un navegador actualizado con HTTPS para crear el lote o toro.');
 return navigator.locks.request(slot(owner),{mode:'exclusive'},async()=>{
  await authorize(c,owner,current);let a=pendingCatalogCreationBrowser(owner);
  if(!a&&!reviewed&&(mode==='prepare'||mode==='status')){
   const result=await recoverCatalogCreationWeb(c,owner);await authorize(c,owner,current);
   if(result){const recovered={owner,key:result.requestKey,intent:result.intent!,result};if(pendingCatalogCreationBrowser(owner)!==null)return fail();localStorage.setItem(slot(owner),JSON.stringify(recovered));if(!sameCatalogCreation(pendingCatalogCreationBrowser(owner),recovered))return fail();return recovered;}
  }
  if(!a&&reviewed){
   if(reviewed.owner!==owner||!uuid(reviewed.key)||!sameCatalogCreation(catalogCreationIntent(reviewed.intent),reviewed.intent))return fail();
   if(reviewed.result)validateCatalogCreationResult(reviewed.result,owner,reviewed.key,reviewed.intent);
   a=reviewed;localStorage.setItem(slot(owner),JSON.stringify(a));if(!sameCatalogCreation(pendingCatalogCreationBrowser(owner),a))return fail();
  }
  if(!a){if(mode!=='prepare'||!intent)return null;const p=catalogCreationIntent(intent);a={owner,key:crypto.randomUUID(),intent:p,result:null};localStorage.setItem(slot(owner),JSON.stringify(a));if(!sameCatalogCreation(pendingCatalogCreationBrowser(owner),a))return fail();}
  else if(mode==='prepare'&&intent&&!sameCatalogCreation(a.intent,catalogCreationIntent(intent)))return fail();
  if(['post','resolve','new'].includes(mode)&&(!reviewed||reviewed.owner!==owner||reviewed.key!==a.key||!sameCatalogCreation(reviewed.intent,a.intent)))return fail();
  if(mode==='post'){
   if(reviewed?.result?.state!=='pending'||!a.result||!sameCatalogCreation(reviewed.result,a.result)||!sameCatalogCreation(reviewed.result.intent,a.intent))return fail();
   validateCatalogCreationResult(reviewed.result,owner,a.key,a.intent);
  }
  if(mode==='new'&&!['committed','canceled'].includes(a.result?.state??''))return fail();
  await authorize(c,owner,current);
  let result:CatalogCreationResult;
  if(mode==='prepare')result=await catalogCreationWeb(c,owner,a.key,'prepare',a.intent,a.result??undefined);
  else if(mode==='post'){
   if(a.result?.state==='committed'||a.result?.state==='canceled')result=await catalogCreationWeb(c,owner,a.key,'status',null,a.result??undefined);
   else {if(a.result?.state!=='pending'||!a.result.intent||!a.result.original)return fail();result=await catalogCreationWeb(c,owner,a.key,'post',null,a.result??undefined);}
  }else result=await catalogCreationWeb(c,owner,a.key,mode==='resolve'?'resolve':mode==='new'?'acknowledge':'status',null,a.result??undefined);
  validateCatalogCreationResult(result,owner,a.key,a.intent);
  if(a.result?.original&&(!sameCatalogCreation(result.original,a.result.original)||!sameCatalogCreation(result.plan,a.result.plan)||result.effectiveDate!==a.result.effectiveDate))return fail();
  if(a.result&&['committed','canceled'].includes(a.result.state)&&!sameCatalogCreation(a.result,{...result,acknowledged:a.result.acknowledged}))return fail();
  await authorize(c,owner,current);
  if(!sameCatalogCreation(pendingCatalogCreationBrowser(owner),a))return fail();
  if(mode==='new'){
   if(!result.acknowledged||!['committed','canceled'].includes(result.state))return fail();localStorage.removeItem(slot(owner));if(pendingCatalogCreationBrowser(owner)!==null)return fail();return null;
  }
  const next={...a,result};localStorage.setItem(slot(owner),JSON.stringify(next));if(!sameCatalogCreation(pendingCatalogCreationBrowser(owner),next))return fail();return next;
 });
}
