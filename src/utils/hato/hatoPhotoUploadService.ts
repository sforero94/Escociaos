import {validatePhotoBytes,type PhotoFile} from './hatoPhotoBytes';
import {inspectPhoto,photoFail,photoIntent,photoSame,photoStep,photoUuid,type PhotoIntent,type PhotoResult,type PhotoRpc} from './hatoPhotoUploadProtocol';
export interface PhotoServiceClient extends PhotoRpc {
 auth:{getUser(token:string):PromiseLike<{data:{user:{id:string}|null};error:unknown}>};
 storage:{from(bucket:string):{
  upload(path:string,bytes:Uint8Array,options:{contentType:string;upsert:false}):PromiseLike<{error:unknown}>;
  download(path:string):PromiseLike<{data:Blob|null;error:unknown}>;
 }};
}
export interface PhotoInput {bytes:Uint8Array;mime:string}
export interface VerifiedPhotoUpload {original:PhotoResult;photos:{file:PhotoFile;bytes:Uint8Array}[]}
async function authorize(c:PhotoServiceClient,token:string,owner:string){if(!photoUuid(owner)||!token)return photoFail();const a=await c.auth.getUser(token);if(a.error||a.data.user?.id!==owner)return photoFail();}
/** Only trusted server code may use this service client. The bearer is checked
 * independently, never installed as the service client's database identity. */
export async function observeOriginalPhoto(c:PhotoServiceClient,token:string,owner:string,key:string):Promise<VerifiedPhotoUpload>{
 await authorize(c,token,owner);const original=await photoStep(c,owner,key,'status');if(!['held','verified'].includes(original.state))return photoFail();
 const before=await inspectPhoto(c,owner,key,original),photos:VerifiedPhotoUpload['photos']=[];
 for(let i=0;i<before.objects.length;i++){
  if(before.objects[i].row===null)return photoFail();const file=original.intent!.files[i];await authorize(c,token,owner);
  const downloaded=await c.storage.from('hato-pesajes-fotos').download(original.paths![i]);if(downloaded.error||!downloaded.data||downloaded.data.size!==file.size)return photoFail();
  const bytes=new Uint8Array(await downloaded.data.arrayBuffer());const observed=await validatePhotoBytes(bytes,file.mime,i+1);if(!photoSame(observed,file))return photoFail();photos.push({file:observed,bytes});
 }
 await authorize(c,token,owner);const after=await inspectPhoto(c,owner,key,before.original);
 if(!photoSame(before,after))return photoFail();
 const payload={permissionId:original.permissionId,objects:photos.map(({file},i)=>({page:file.page,row:after.objects[i].row,sha256:file.sha256,size:file.size,mime:file.mime}))};
 const verified=await photoStep(c,owner,key,'observe',payload,after.original);
 if(verified.state!=='verified'||verified.permit!==null||!photoSame(verified.receipt?.objects,payload.objects))return photoFail();
 await authorize(c,token,owner);return {original:verified,photos};
}
/** Reserve/claim are never retried internally. A thrown/lost reply is recovered
 * with observeOriginalPhoto/status, without calling upload or allocating a key. */
export async function uploadOriginalPhoto(c:PhotoServiceClient,token:string,owner:string,key:string,year:number,month:number,input:readonly PhotoInput[]):Promise<VerifiedPhotoUpload>{
 if(!photoUuid(key)||input.length<1||input.length>6)return photoFail();await authorize(c,token,owner);
 // Snapshot caller buffers before awaiting: mutation cannot change bytes after hashing.
 if(input.some(p=>!(p.bytes instanceof Uint8Array)||p.bytes.length<1||p.bytes.length>15728640||typeof p.mime!=='string'))return photoFail();
 const photos=input.map(p=>({bytes:new Uint8Array(p.bytes),mime:p.mime}));const files:PhotoFile[]=[];
 for(let i=0;i<photos.length;i++)files.push(await validatePhotoBytes(photos[i].bytes,photos[i].mime,i+1));
 const intent:PhotoIntent=photoIntent({version:1,year,month,files});await authorize(c,token,owner);
 const reserved=await photoStep(c,owner,key,'reserve',intent);
 if(!['reserved','held','verified'].includes(reserved.state))return photoFail();
 if(reserved.state==='reserved'){
  await authorize(c,token,owner);const claim=await photoStep(c,owner,key,'claim',null,reserved);
  if(claim.permit!==null){
   for(let i=0;i<photos.length;i++){
    await authorize(c,token,owner);const current=await photoStep(c,owner,key,'status',null,claim);
    if(current.state!=='held'||current.permissionId!==claim.permit)return photoFail();
    try{const response=await c.storage.from('hato-pesajes-fotos').upload(claim.paths![i],photos[i].bytes,{contentType:files[i].mime,upsert:false});if(response.error)break;}
    catch{break;} // Outcome unknown: only inspect/download the same original.
   }
  }
 }
 return observeOriginalPhoto(c,token,owner,key);
}
