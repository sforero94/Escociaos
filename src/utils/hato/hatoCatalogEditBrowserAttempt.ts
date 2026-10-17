import {recoverCatalogEditWeb,catalogEditIntent,catalogEditWeb,sameCatalogEdit,validateCatalogEditResult,type CatalogEditClient,type CatalogEditIntent,type CatalogEditResult} from './hatoCatalogEditProtocol';
export interface CatalogEditBrowserClient extends CatalogEditClient {auth:{getUser():PromiseLike<{data:{user:{id:string}|null};error:unknown}>}}
export interface CatalogEditBrowserAttempt {owner:string;key:string;intent:CatalogEditIntent;result:CatalogEditResult|null}
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const slot=(owner:string)=>`hato_catalog_edit_v1:${owner}`;
const fail=():never=>{throw Error('Conserve y verifique el intento original antes de iniciar otro.');};
export function pendingCatalogEditBrowser(owner:string):CatalogEditBrowserAttempt|null{
 if(!uuid(owner))return fail();const raw=localStorage.getItem(slot(owner));if(raw===null)return null;
 try{const a=JSON.parse(raw) as CatalogEditBrowserAttempt;
  if(!a||Object.keys(a).sort().join('|')!=='intent|key|owner|result'||a.owner!==owner||!uuid(a.key)||!sameCatalogEdit(a.intent,catalogEditIntent(a.intent)))return fail();
  if(a.result!==null)validateCatalogEditResult(a.result,owner,a.key,a.intent);return a;
 }catch{return fail();}
}
async function authorize(c:CatalogEditBrowserClient,owner:string,current:()=>boolean){const r=await c.auth.getUser();if(r.error||r.data.user?.id!==owner||!current())throw Error('La sesión o el formulario cambió. Conserve el intento original.');}
/** Preparing never posts: human review uses the returned original snapshot. */
export async function runCatalogEditBrowser(c:CatalogEditBrowserClient,owner:string,intent:CatalogEditIntent|null,mode:'prepare'|'post'|'status'|'resolve'|'new',current:()=>boolean,reviewed:CatalogEditBrowserAttempt|null=null):Promise<CatalogEditBrowserAttempt|null>{
 if(!uuid(owner)||!['prepare','post','status','resolve','new'].includes(mode)||!globalThis.navigator?.locks)throw Error('Use un navegador actualizado con HTTPS para editar el toro.');
 return navigator.locks.request(slot(owner),{mode:'exclusive'},async()=>{
  await authorize(c,owner,current);let a=pendingCatalogEditBrowser(owner);
  if(!a&&!reviewed&&(mode==='prepare'||mode==='status')){
   const result=await recoverCatalogEditWeb(c,owner);await authorize(c,owner,current);
   if(result){const recovered={owner,key:result.requestKey,intent:result.intent!,result};if(pendingCatalogEditBrowser(owner)!==null)return fail();localStorage.setItem(slot(owner),JSON.stringify(recovered));if(!sameCatalogEdit(pendingCatalogEditBrowser(owner),recovered))return fail();return recovered;}
  }
  if(!a&&reviewed){
   if(reviewed.owner!==owner||!uuid(reviewed.key)||!sameCatalogEdit(catalogEditIntent(reviewed.intent),reviewed.intent))return fail();
   if(reviewed.result)validateCatalogEditResult(reviewed.result,owner,reviewed.key,reviewed.intent);
   a=reviewed;localStorage.setItem(slot(owner),JSON.stringify(a));if(!sameCatalogEdit(pendingCatalogEditBrowser(owner),a))return fail();
  }
  if(!a){if(mode!=='prepare'||!intent)return null;const p=catalogEditIntent(intent);a={owner,key:crypto.randomUUID(),intent:p,result:null};localStorage.setItem(slot(owner),JSON.stringify(a));if(!sameCatalogEdit(pendingCatalogEditBrowser(owner),a))return fail();}
  else if(mode==='prepare'&&intent&&!sameCatalogEdit(a.intent,catalogEditIntent(intent)))return fail();
  if(['post','resolve','new'].includes(mode)&&(!reviewed||reviewed.owner!==owner||reviewed.key!==a.key||!sameCatalogEdit(reviewed.intent,a.intent)))return fail();
  if(mode==='post'){
   if(reviewed?.result?.state!=='pending'||!a.result||!sameCatalogEdit(reviewed.result,a.result)||!sameCatalogEdit(reviewed.result.intent,a.intent))return fail();
   validateCatalogEditResult(reviewed.result,owner,a.key,a.intent);
  }
  if(mode==='new'&&!['committed','canceled'].includes(a.result?.state??''))return fail();
  await authorize(c,owner,current);
  let result:CatalogEditResult;
  if(mode==='prepare')result=await catalogEditWeb(c,owner,a.key,'prepare',a.intent,a.result??undefined);
  else if(mode==='post'){
   if(a.result?.state==='committed'||a.result?.state==='canceled')result=await catalogEditWeb(c,owner,a.key,'status',null,a.result??undefined);
   else {if(a.result?.state!=='pending'||!a.result.intent||!a.result.original)return fail();result=await catalogEditWeb(c,owner,a.key,'post',null,a.result??undefined);}
  }else result=await catalogEditWeb(c,owner,a.key,mode==='resolve'?'resolve':mode==='new'?'acknowledge':'status',null,a.result??undefined);
  validateCatalogEditResult(result,owner,a.key,a.intent);
  if(a.result?.original&&(!sameCatalogEdit(result.original,a.result.original)||!sameCatalogEdit(result.plan,a.result.plan)||result.effectiveDate!==a.result.effectiveDate))return fail();
  if(a.result&&['committed','canceled'].includes(a.result.state)&&!sameCatalogEdit(a.result,{...result,acknowledged:a.result.acknowledged}))return fail();
  await authorize(c,owner,current);
  if(!sameCatalogEdit(pendingCatalogEditBrowser(owner),a))return fail();
  if(mode==='new'){
   if(!result.acknowledged||!['committed','canceled'].includes(result.state))return fail();localStorage.removeItem(slot(owner));if(pendingCatalogEditBrowser(owner)!==null)return fail();return null;
  }
  const next={...a,result};localStorage.setItem(slot(owner),JSON.stringify(next));if(!sameCatalogEdit(pendingCatalogEditBrowser(owner),next))return fail();return next;
 });
}
