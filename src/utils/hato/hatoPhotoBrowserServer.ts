import {uploadOriginalPhoto,observeOriginalPhoto,type PhotoServiceClient,type VerifiedPhotoUpload} from './hatoPhotoUploadService';
import {photoPreviewStep,validatePhotoOutcome,type PhotoPreviewResult} from './hatoPhotoPreviewProtocol';
import {photoKeys,photoRecord,photoUuid,photoFail} from './hatoPhotoUploadProtocol';
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
async function bounded(request:Request,limit:number){
 const length=request.headers.get('content-length');if(length&&(!/^\d+$/.test(length)||Number(length)>limit))return photoFail();const reader=request.body?.getReader();if(!reader)return photoFail();const chunks:Uint8Array[]=[];let size=0,expired=false;const deadline=setTimeout(()=>{expired=true;void reader.cancel().catch(()=>undefined);},25000);
 try{while(true){const p=await reader.read();if(expired)return photoFail();if(p.done)break;size+=p.value.length;if(size>limit){void reader.cancel().catch(()=>undefined);return photoFail();}chunks.push(p.value);}}finally{clearTimeout(deadline);reader.releaseLock();}
 const bytes=new Uint8Array(size);let i=0;for(const chunk of chunks){bytes.set(chunk,i);i+=chunk.length;}return bytes;
}
/** Pure actual HTTP orchestration; outer handler independently verifies current
 * active profile before reading the body. Service adapter rechecks bearer owner. */
export async function photoBrowserRequest(request:Request,owner:string,service:PhotoServiceClient,ocr:(original:VerifiedPhotoUpload)=>Promise<unknown>):Promise<Response>{
 try{
  const bearer=request.headers.get('Authorization');if(!bearer?.startsWith('Bearer ')||!photoUuid(owner))return json({error:'Sesión humana requerida'},401);const token=bearer.slice(7);const auth=await service.auth.getUser(token);if(auth.error||auth.data.user?.id!==owner)return json({error:'La sesión cambió'},403);
  let key:string|null=null,mode:string,original:VerifiedPhotoUpload|null=null;const content=request.headers.get('Content-Type')??'';
  if(content.toLowerCase().startsWith('multipart/form-data;')){
   const body=await bounded(request,6*15728640+65536),form=await new Response(body,{headers:{'Content-Type':content}}).formData(),names=['requestKey','expectedOwner','version','anio','mes','fotos'];
   if([...form.keys()].some(k=>!names.includes(k))||names.filter(k=>k!=='fotos').some(k=>form.getAll(k).length!==1)||form.get('version')!=='1'||form.get('expectedOwner')!==owner||!photoUuid(form.get('requestKey')))return photoFail();
   key=String(form.get('requestKey'));const year=String(form.get('anio')),month=String(form.get('mes'));if(!/^20\d\d$|^2100$/.test(year)||!/^([1-9]|1[0-2])$/.test(month))return photoFail();const files=form.getAll('fotos');if(!files.length||files.length>6||files.some(f=>typeof f==='string'||f.size<1||f.size>15728640))return photoFail();
   const photos=[];for(const file of files){if(typeof file==='string')return photoFail();photos.push({bytes:new Uint8Array(await file.arrayBuffer()),mime:file.type});}
   original=await uploadOriginalPhoto(service,token,owner,key,Number(year),Number(month),photos);mode='resume';
  }else{
   if(!content.toLowerCase().startsWith('application/json'))return photoFail();const body=JSON.parse(new TextDecoder().decode(await bounded(request,4096)));
   if(!photoKeys(body,['action','expectedOwner','requestKey'])||body.expectedOwner!==owner||!['recover','resume','acknowledge','cancel'].includes(String(body.action))||(body.action==='recover'?body.requestKey!==null:!photoUuid(body.requestKey)))return photoFail();mode=String(body.action);key=body.requestKey as string|null;
  }
  let result=await photoPreviewStep(service,owner,key,mode==='recover'?'recover':mode==='acknowledge'?'acknowledge':mode==='cancel'?'cancel':'status');if(!result||mode==='acknowledge'||mode==='cancel')return json(result);
  key=result.upload.requestKey;
  if(result.preview||!['held','verified'].includes(result.upload.state))return json(result);
  original=original??await observeOriginalPhoto(service,token,owner,key);
  result=await photoPreviewStep(service,owner,key,'claim',null,result);if(!result)return photoFail();
  if(result.permit!==null){
   const fresh=await service.auth.getUser(token);if(fresh.error||fresh.data.user?.id!==owner)return photoFail();
   const outcome=await ocr(original);if(photoRecord(outcome)&&outcome.uncertain===true)return json({...result,permit:null});
   validatePhotoOutcome(outcome,result.upload);
   result=await photoPreviewStep(service,owner,key,'record',{permissionId:result.permit,outcome},result);if(!result)return photoFail();
  }
  return json({...result,permit:null});
 }catch{return json({error:'Conserve la carga original y consulte su resultado. No vuelva a enviar las fotos.'},502);}
}
export type {PhotoPreviewResult};
