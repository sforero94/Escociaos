import {saleIntent,saleWeb,sameSale,validateSaleResult,type SaleClient,type SaleIntent,type SaleResult} from './hatoSaleProtocol';
export interface SaleBrowserClient extends SaleClient {auth:{getUser():PromiseLike<{data:{user:{id:string}|null};error:unknown}>}}
export interface SaleBrowserAttempt {owner:string;key:string;intent:SaleIntent;result:SaleResult|null}
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const slot=(owner:string)=>`hato_sale_v1:${owner}`;
const fail=():never=>{throw Error('Conserve y verifique el intento original antes de iniciar otro.');};
export function pendingSaleBrowser(owner:string):SaleBrowserAttempt|null{
 if(!uuid(owner))return fail();const raw=localStorage.getItem(slot(owner));if(raw===null)return null;
 try{const a=JSON.parse(raw) as SaleBrowserAttempt;
  if(!a||Object.keys(a).sort().join('|')!=='intent|key|owner|result'||a.owner!==owner||!uuid(a.key)||!sameSale(a.intent,saleIntent(a.intent)))return fail();
  if(a.result!==null)validateSaleResult(a.result,owner,a.key,a.intent);return a;
 }catch{return fail();}
}
async function authorize(c:SaleBrowserClient,owner:string,current:()=>boolean){const r=await c.auth.getUser();if(r.error||r.data.user?.id!==owner||!current())throw Error('La sesión o el formulario cambió. Conserve el intento original.');}
/** Preparing never posts: human review uses the returned original snapshot. */
export async function runSaleBrowser(c:SaleBrowserClient,owner:string,intent:SaleIntent|null,mode:'prepare'|'post'|'status'|'resolve'|'new',current:()=>boolean,reviewed:SaleBrowserAttempt|null=null):Promise<SaleBrowserAttempt|null>{
 if(!uuid(owner)||!['prepare','post','status','resolve','new'].includes(mode)||!globalThis.navigator?.locks)throw Error('Use un navegador actualizado con HTTPS para registrar la venta.');
 return navigator.locks.request(slot(owner),{mode:'exclusive'},async()=>{
  await authorize(c,owner,current);let a=pendingSaleBrowser(owner);
  if(!a&&reviewed){
   if(reviewed.owner!==owner||!uuid(reviewed.key)||!sameSale(saleIntent(reviewed.intent),reviewed.intent))return fail();
   if(reviewed.result)validateSaleResult(reviewed.result,owner,reviewed.key,reviewed.intent);
   a=reviewed;localStorage.setItem(slot(owner),JSON.stringify(a));if(!sameSale(pendingSaleBrowser(owner),a))return fail();
  }
  if(!a){if(mode!=='prepare'||!intent)return null;const p=saleIntent(intent);a={owner,key:crypto.randomUUID(),intent:p,result:null};localStorage.setItem(slot(owner),JSON.stringify(a));if(!sameSale(pendingSaleBrowser(owner),a))return fail();}
  else if(mode==='prepare'&&intent&&!sameSale(a.intent,saleIntent(intent)))return fail();
  if(['post','resolve','new'].includes(mode)&&(!reviewed||reviewed.owner!==owner||reviewed.key!==a.key||!sameSale(reviewed.intent,a.intent)))return fail();
  if(mode==='post'){
   if(reviewed?.result?.state!=='pending'||!a.result||!sameSale(reviewed.result,a.result)||!sameSale(reviewed.result.intent,a.intent))return fail();
   validateSaleResult(reviewed.result,owner,a.key,a.intent);
  }
  await authorize(c,owner,current);
  let result:SaleResult;
  if(mode==='prepare')result=await saleWeb(c,owner,a.key,'prepare',a.intent);
  else if(mode==='post'){
   if(a.result?.state==='committed'||a.result?.state==='canceled')result=await saleWeb(c,owner,a.key,'status',null,a.intent);
   else {if(a.result?.state!=='pending'||!a.result.intent||!a.result.original)return fail();result=await saleWeb(c,owner,a.key,'post',null,a.intent);}
  }else result=await saleWeb(c,owner,a.key,mode==='resolve'?'resolve':'status',null,a.intent);
  validateSaleResult(result,owner,a.key,a.intent);
  if(a.result?.original&&(!sameSale(result.original,a.result.original)||!sameSale(result.plan,a.result.plan)))return fail();
  if(a.result&&['committed','canceled'].includes(a.result.state)&&!sameSale(a.result,result))return fail();
  await authorize(c,owner,current);
  if(!sameSale(pendingSaleBrowser(owner),a))return fail();
  if(mode==='new'){
   if(result.state!=='committed'&&result.state!=='canceled')return fail();localStorage.removeItem(slot(owner));return null;
  }
  const next={...a,result};localStorage.setItem(slot(owner),JSON.stringify(next));return next;
 });
}
