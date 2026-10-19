import {validatePhotoBytes} from './hatoPhotoBytes';
import {photoIntent,photoSame,photoFail,photoKeys,photoUuid,type PhotoIntent} from './hatoPhotoUploadProtocol';
import {validatePhotoPreviewResult,type PhotoPreviewResult} from './hatoPhotoPreviewProtocol';
export interface BrowserPhotoClient {auth:{getUser():PromiseLike<{data:{user:{id:string}|null};error:unknown}>;getSession():PromiseLike<{data:{session:{access_token:string}|null};error:unknown}>}}
export interface BrowserPhotoAnchor {owner:string;key:string;intent:PhotoIntent}
export interface BrowserPhotoAttempt extends BrowserPhotoAnchor {result:PhotoPreviewResult|null}
const slot=(owner:string)=>'hato_photo_browser_v1:'+owner;
export function pendingBrowserPhoto(owner:string):BrowserPhotoAnchor|null{
 if(!photoUuid(owner))return photoFail();const raw=localStorage.getItem(slot(owner));if(raw===null)return null;
 try{const x=JSON.parse(raw);if(!photoKeys(x,['owner','key','intent'])||x.owner!==owner||!photoUuid(x.key))return photoFail();photoIntent(x.intent);return x as unknown as BrowserPhotoAnchor;}catch{return photoFail();}
}
async function authorize(c:BrowserPhotoClient,owner:string,current:()=>boolean){const a=await c.auth.getUser();if(a.error||a.data.user?.id!==owner||!current())return photoFail();const s=await c.auth.getSession();if(s.error||!s.data.session?.access_token||!current())return photoFail();return s.data.session.access_token;}
export async function runBrowserPhoto(c:BrowserPhotoClient,url:string,owner:string,mode:'upload'|'resume'|'new'|'cancel',current:()=>boolean,input?:{files:readonly File[];year:number;month:number},reviewed?:BrowserPhotoAttempt|null,transport:typeof fetch=fetch):Promise<BrowserPhotoAttempt|null>{
 if(!photoUuid(owner)||!navigator?.locks||!['upload','resume','new','cancel'].includes(mode))return photoFail();
 return navigator.locks.request(slot(owner),{mode:'exclusive'},async()=>{
  let token=await authorize(c,owner,current),anchor=pendingBrowserPhoto(owner);
  const send=async(body:FormData|Record<string,unknown>,key?:string,expected?:PhotoPreviewResult)=>{
   token=await authorize(c,owner,current);const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),145000);let response:Response;
   try{response=await transport(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body instanceof FormData?body:JSON.stringify(body),signal:controller.signal});const reader=response.body?.getReader();if(!reader)return photoFail();const chunks:Uint8Array[]=[];let size=0;try{while(true){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>12582912){void reader.cancel().catch(()=>undefined);return photoFail();}chunks.push(p.value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(size);let offset=0;for(const p of chunks){bytes.set(p,offset);offset+=p.length;}const raw=new TextDecoder().decode(bytes);if(!response.ok)return photoFail();const x=JSON.parse(raw);if(x===null)return null;const result=validatePhotoPreviewResult(x,owner,key,expected);if(result.permit!==null||(anchor&&result.upload.intent!==null&&!photoSame(result.upload.intent,anchor.intent)))return photoFail();await authorize(c,owner,current);return result;}finally{clearTimeout(timer);}
  };
  const persist=(a:BrowserPhotoAnchor)=>{if(!current())return photoFail();localStorage.setItem(slot(owner),JSON.stringify(a));if(!photoSame(pendingBrowserPhoto(owner),a))return photoFail();};
  if(!anchor){
   const recovered=await send({action:'recover',expectedOwner:owner,requestKey:null});
   if(recovered){if(!recovered.upload.intent)return photoFail();anchor={owner,key:recovered.upload.requestKey,intent:recovered.upload.intent};if(pendingBrowserPhoto(owner)!==null)return photoFail();persist(anchor);return {...anchor,result:recovered};}
  }
  if(mode==='resume'){
   if(!anchor)return null;const result=await send({action:'resume',expectedOwner:owner,requestKey:anchor.key},anchor.key);if(!result||pendingBrowserPhoto(owner)?.key!==anchor.key)return photoFail();return {...anchor,result};
  }
  if(mode==='new'||mode==='cancel'){
   if(!anchor||!reviewed||reviewed.key!==anchor.key||reviewed.owner!==owner||!photoSame(reviewed.intent,anchor.intent)||!reviewed.result)return photoFail();validatePhotoPreviewResult(reviewed.result,owner,anchor.key);
   if(mode==='new'&&reviewed.result.preview?.state!=='ready')return photoFail();if(mode==='cancel'&&!['unknown','reserved'].includes(reviewed.result.upload.state))return photoFail();
   const result=await send({action:mode==='new'?'acknowledge':'cancel',expectedOwner:owner,requestKey:anchor.key},anchor.key,reviewed.result);if(!result||(mode==='new'?(!result.upload.acknowledged||!photoSame(result.preview,reviewed.result.preview)):result.upload.state!=='canceled')||!photoSame(pendingBrowserPhoto(owner),anchor))return photoFail();
   await authorize(c,owner,current);localStorage.removeItem(slot(owner));if(pendingBrowserPhoto(owner)!==null)return photoFail();return null;
  }
  if(!input||input.files.length<1||input.files.length>6)return photoFail();const files:File[]=[],manifest=[];
  for(let i=0;i<input.files.length;i++){const f=input.files[i];if(f.size<1||f.size>15728640)return photoFail();const bytes=new Uint8Array(await f.arrayBuffer()),meta=await validatePhotoBytes(bytes,f.type,i+1);manifest.push(meta);files.push(new File([bytes as Uint8Array<ArrayBuffer>],`pagina-${i+1}.${meta.extension}`,{type:meta.mime}));}
  const intent=photoIntent({version:1,year:input.year,month:input.month,files:manifest});await authorize(c,owner,current);
  if(anchor){if(!photoSame(anchor.intent,intent))return photoFail();const result=await send({action:'resume',expectedOwner:owner,requestKey:anchor.key},anchor.key);if(!result)return photoFail();if(result.upload.state!=='reserved'||result.preview!==null)return {...anchor,result};}
  else {if(pendingBrowserPhoto(owner)!==null)return photoFail();anchor={owner,key:crypto.randomUUID(),intent};persist(anchor);}
  const form=new FormData();form.set('version','1');form.set('expectedOwner',owner);form.set('requestKey',anchor.key);form.set('anio',String(intent.year));form.set('mes',String(intent.month));files.forEach(f=>form.append('fotos',f));
  const result=await send(form,anchor.key);if(!result||!photoSame(result.upload.intent,intent)||!photoSame(pendingBrowserPhoto(owner),anchor))return photoFail();return {...anchor,result};
 });
}
