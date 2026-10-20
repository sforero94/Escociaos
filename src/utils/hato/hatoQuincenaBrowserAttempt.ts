import {recoverQuincena,quincenaIntent,quincenaWeb,sameQuincena,validateQuincenaResult,quincenaDraft,quincenaSource,type QuincenaClient,type QuincenaIntent,type QuincenaResult,type QuincenaDraft} from './hatoQuincenaProtocol';
export interface QuincenaBrowserClient extends QuincenaClient {auth:{getUser():PromiseLike<{data:{user:{id:string}|null};error:unknown}>}}
export interface QuincenaBrowserAttempt {owner:string;key:string;intent:QuincenaIntent;result:QuincenaResult|null}
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const slot=(owner:string)=>`hato_quincena_v1:${owner}`;
const fail=():never=>{throw Error('Conserve y verifique el intento original antes de iniciar otro.');};
export function pendingQuincenaBrowser(owner:string):QuincenaBrowserAttempt|null{
 if(!uuid(owner))return fail();const raw=localStorage.getItem(slot(owner));if(raw===null)return null;
 try{const a=JSON.parse(raw) as QuincenaBrowserAttempt;
  if(!a||Object.keys(a).sort().join('|')!=='intent|key|owner|result'||a.owner!==owner||!uuid(a.key)||!sameQuincena(a.intent,quincenaIntent(a.intent)))return fail();
  if(a.result!==null)validateQuincenaResult(a.result,owner,a.key,a.intent);return a;
 }catch{return fail();}
}
async function authorize(c:QuincenaBrowserClient,owner:string,current:()=>boolean){const r=await c.auth.getUser();if(r.error||r.data.user?.id!==owner||!current())throw Error('La sesión o el formulario cambió. Conserve el intento original.');}
/** Preparing never posts: human review uses the returned original snapshot. */
export async function runQuincenaBrowser(c:QuincenaBrowserClient,owner:string,draft:QuincenaDraft|null,mode:'prepare'|'post'|'status'|'resolve'|'new',current:()=>boolean,reviewed:QuincenaBrowserAttempt|null=null):Promise<QuincenaBrowserAttempt|null>{
 if(!uuid(owner)||!['prepare','post','status','resolve','new'].includes(mode)||!globalThis.navigator?.locks)throw Error('Use un navegador actualizado con HTTPS para revisar la quincena.');
 return navigator.locks.request(slot(owner),{mode:'exclusive'},async()=>{
  await authorize(c,owner,current);let a=pendingQuincenaBrowser(owner);
  if(!a&&!reviewed&&(mode==='prepare'||mode==='status')){
   const result=await recoverQuincena(c,owner);await authorize(c,owner,current);
   if(result){const recovered={owner,key:result.requestKey,intent:result.intent!,result};if(pendingQuincenaBrowser(owner)!==null)return fail();localStorage.setItem(slot(owner),JSON.stringify(recovered));if(!sameQuincena(pendingQuincenaBrowser(owner),recovered))return fail();return recovered;}
  }
  if(!a&&reviewed){
   if(reviewed.owner!==owner||!uuid(reviewed.key)||!sameQuincena(quincenaIntent(reviewed.intent),reviewed.intent))return fail();
   if(reviewed.result)validateQuincenaResult(reviewed.result,owner,reviewed.key,reviewed.intent);
   a=reviewed;localStorage.setItem(slot(owner),JSON.stringify(a));if(!sameQuincena(pendingQuincenaBrowser(owner),a))return fail();
  }
  if(!a){if(mode!=='prepare'||!draft)return null;const d=quincenaDraft(draft),observed=await quincenaSource(c,owner,d);await authorize(c,owner,current);const p=quincenaIntent({...d,observed});a={owner,key:crypto.randomUUID(),intent:p,result:null};localStorage.setItem(slot(owner),JSON.stringify(a));if(!sameQuincena(pendingQuincenaBrowser(owner),a))return fail();}
  else if(mode==='prepare'&&draft&&!sameQuincena({version:a.intent.version,kind:a.intent.kind,targetId:a.intent.targetId,fields:a.intent.fields},quincenaDraft(draft)))return fail();
  if(['post','resolve','new'].includes(mode)&&(!reviewed||reviewed.owner!==owner||reviewed.key!==a.key||!sameQuincena(reviewed.intent,a.intent)))return fail();
  if(mode==='post'){
   if(reviewed?.result?.state!=='pending'||!a.result||!sameQuincena(reviewed.result,a.result)||!sameQuincena(reviewed.result.intent,a.intent))return fail();
   validateQuincenaResult(reviewed.result,owner,a.key,a.intent);
  }
  if(mode==='new'&&!['committed','canceled'].includes(a.result?.state??''))return fail();
  await authorize(c,owner,current);
  let result:QuincenaResult;
  if(mode==='prepare')result=await quincenaWeb(c,owner,a.key,'prepare',a.intent,a.result??undefined);
  else if(mode==='post'){
   if(a.result?.state==='committed'||a.result?.state==='canceled')result=await quincenaWeb(c,owner,a.key,'status',null,a.result??undefined);
   else {if(a.result?.state!=='pending'||!a.result.intent||!a.result.original)return fail();result=await quincenaWeb(c,owner,a.key,'post',null,a.result??undefined);}
  }else result=await quincenaWeb(c,owner,a.key,mode==='resolve'?'resolve':mode==='new'?'acknowledge':'status',null,a.result??undefined);
  validateQuincenaResult(result,owner,a.key,a.intent);
  if(a.result?.original&&(!sameQuincena(result.original,a.result.original)||!sameQuincena(result.plan,a.result.plan)||result.effectiveDate!==a.result.effectiveDate))return fail();
  if(a.result&&['committed','canceled'].includes(a.result.state)&&!sameQuincena(a.result,{...result,acknowledged:a.result.acknowledged}))return fail();
  await authorize(c,owner,current);
  if(!sameQuincena(pendingQuincenaBrowser(owner),a))return fail();
  if(mode==='new'){
   if(!result.acknowledged||!['committed','canceled'].includes(result.state))return fail();localStorage.removeItem(slot(owner));if(pendingQuincenaBrowser(owner)!==null)return fail();return null;
  }
  const next={...a,result};localStorage.setItem(slot(owner),JSON.stringify(next));if(!sameQuincena(pendingQuincenaBrowser(owner),next))return fail();return next;
 });
}
