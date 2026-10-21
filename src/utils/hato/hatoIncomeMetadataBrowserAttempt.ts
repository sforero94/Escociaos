import {recoverMetadata,metadataIntent,metadataWeb,sameMetadata,metadataResult,metadataDraft,metadataCapture,type MetadataClient,type MetadataIntent,type MetadataResult,type MetadataDraft} from './hatoIncomeMetadataProtocol';
export interface MetadataBrowserClient extends MetadataClient {auth:{getUser():PromiseLike<{data:{user:{id:string}|null};error:unknown}>}}
export interface MetadataBrowserAttempt {owner:string;key:string;intent:MetadataIntent;result:MetadataResult|null}
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const slot=(owner:string)=>`hato_income_metadata_v1:${owner}`;
const fail=():never=>{throw Error('Conserve y verifique el intento original antes de iniciar otro.');};
export function pendingMetadataBrowser(owner:string):MetadataBrowserAttempt|null{
 if(!uuid(owner))return fail();const raw=localStorage.getItem(slot(owner));if(raw===null)return null;
 try{const a=JSON.parse(raw) as MetadataBrowserAttempt;
  if(!a||Object.keys(a).sort().join('|')!=='intent|key|owner|result'||a.owner!==owner||!uuid(a.key)||!sameMetadata(a.intent,metadataIntent(a.intent)))return fail();
  if(a.result!==null)metadataResult(a.result,owner,a.key,a.intent);return a;
 }catch{return fail();}
}
async function authorize(c:MetadataBrowserClient,owner:string,current:()=>boolean){const r=await c.auth.getUser();if(r.error||r.data.user?.id!==owner||!current())throw Error('La sesión o el formulario cambió. Conserve el intento original.');}
/** Preparing never posts: human review uses the returned original snapshot. */
export async function runMetadataBrowser(c:MetadataBrowserClient,owner:string,draft:MetadataDraft|null,mode:'prepare'|'post'|'status'|'resolve'|'new',current:()=>boolean,reviewed:MetadataBrowserAttempt|null=null):Promise<MetadataBrowserAttempt|null>{
 if(!uuid(owner)||!['prepare','post','status','resolve','new'].includes(mode)||!globalThis.navigator?.locks)throw Error('Use un navegador actualizado con HTTPS para revisar la quincena.');
 return navigator.locks.request(slot(owner),{mode:'exclusive'},async()=>{
  await authorize(c,owner,current);let a=pendingMetadataBrowser(owner);
  if(!a&&!reviewed&&(mode==='prepare'||mode==='status')){
   const result=await recoverMetadata(c,owner);await authorize(c,owner,current);
   if(result){const recovered={owner,key:result.requestKey,intent:result.intent!,result};if(pendingMetadataBrowser(owner)!==null)return fail();localStorage.setItem(slot(owner),JSON.stringify(recovered));if(!sameMetadata(pendingMetadataBrowser(owner),recovered))return fail();return recovered;}
  }
  if(!a&&reviewed){
   if(reviewed.owner!==owner||!uuid(reviewed.key)||!sameMetadata(metadataIntent(reviewed.intent),reviewed.intent))return fail();
   if(reviewed.result)metadataResult(reviewed.result,owner,reviewed.key,reviewed.intent);
   a=reviewed;localStorage.setItem(slot(owner),JSON.stringify(a));if(!sameMetadata(pendingMetadataBrowser(owner),a))return fail();
  }
  if(!a){if(mode!=='prepare'||!draft)return null;const d=metadataDraft(draft),capture=await metadataCapture(c,owner,d);await authorize(c,owner,current);const p=metadataIntent({...d,...capture});a={owner,key:crypto.randomUUID(),intent:p,result:null};localStorage.setItem(slot(owner),JSON.stringify(a));if(!sameMetadata(pendingMetadataBrowser(owner),a))return fail();}
  else if(mode==='prepare'&&draft&&!sameMetadata({version:a.intent.version,kind:a.intent.kind,targetId:a.intent.targetId,fields:a.intent.fields,...(a.intent.attachment?{attachment:a.intent.attachment}:{})},metadataDraft(draft)))return fail();
  if(['post','resolve','new'].includes(mode)&&(!reviewed||reviewed.owner!==owner||reviewed.key!==a.key||!sameMetadata(reviewed.intent,a.intent)))return fail();
  if(mode==='post'){
   if(reviewed?.result?.state!=='pending'||!a.result||!sameMetadata(reviewed.result,a.result)||!sameMetadata(reviewed.result.intent,a.intent))return fail();
   metadataResult(reviewed.result,owner,a.key,a.intent);
  }
  if(mode==='new'&&!['committed','canceled'].includes(a.result?.state??''))return fail();
  await authorize(c,owner,current);
  let result:MetadataResult;
  if(mode==='prepare')result=await metadataWeb(c,owner,a.key,'prepare',a.intent,a.result??undefined);
  else if(mode==='post'){
   if(a.result?.state==='committed'||a.result?.state==='canceled')result=await metadataWeb(c,owner,a.key,'status',null,a.result??undefined);
   else {if(a.result?.state!=='pending'||!a.result.intent||!a.result.original)return fail();result=await metadataWeb(c,owner,a.key,'post',null,a.result??undefined);}
  }else result=await metadataWeb(c,owner,a.key,mode==='resolve'?'resolve':mode==='new'?'acknowledge':'status',null,a.result??undefined);
  metadataResult(result,owner,a.key,a.intent);
  if(a.result?.original&&(!sameMetadata(result.original,a.result.original)||!sameMetadata(result.plan,a.result.plan)||result.effectiveDate!==a.result.effectiveDate))return fail();
  if(a.result&&['committed','canceled'].includes(a.result.state)&&!sameMetadata(a.result,{...result,acknowledged:a.result.acknowledged}))return fail();
  await authorize(c,owner,current);
  if(!sameMetadata(pendingMetadataBrowser(owner),a))return fail();
  if(mode==='new'){
   if(!result.acknowledged||!['committed','canceled'].includes(result.state))return fail();localStorage.removeItem(slot(owner));if(pendingMetadataBrowser(owner)!==null)return fail();return null;
  }
  const next={...a,result};localStorage.setItem(slot(owner),JSON.stringify(next));if(!sameMetadata(pendingMetadataBrowser(owner),next))return fail();return next;
 });
}
