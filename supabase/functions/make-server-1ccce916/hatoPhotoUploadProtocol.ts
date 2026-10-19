import {type PhotoFile} from './hatoPhotoBytes.ts';
export type PhotoRow=Record<string,unknown>;
export interface PhotoIntent {version:1;year:number;month:number;files:PhotoFile[]}
export interface PhotoResult {version:1;requestKey:string;owner:string;state:'unknown'|'reserved'|'held'|'verified'|'canceled';intent:PhotoIntent|null;bucket:PhotoRow|null;paths:string[]|null;permissionId:string|null;permit:string|null;receipt:PhotoRow|null;acknowledged:boolean}
export interface PhotoRpc {rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}>}
export const photoUuid=(x:unknown):x is string=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x);
export const photoRecord=(x:unknown):x is PhotoRow=>!!x&&typeof x==='object'&&!Array.isArray(x);
export const photoKeys=(x:unknown,k:string[]):x is PhotoRow=>photoRecord(x)&&Object.keys(x).sort().join('|')===[...k].sort().join('|');
export const photoSame=(a:unknown,b:unknown):boolean=>{if(a===b)return true;if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((v,i)=>photoSame(v,b[i]));if(photoRecord(a)&&photoRecord(b))return photoSame(Object.keys(a).sort(),Object.keys(b).sort())&&Object.keys(a).every(k=>photoSame(a[k],b[k]));return false;};
export const photoFail=():never=>{throw Error('Conserve y verifique la carga original. No vuelva a enviar las fotos.');};
const time=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT/.test(v)&&Number.isFinite(Date.parse(v));
export function photoIntent(x:unknown):PhotoIntent{
 if(!photoKeys(x,['version','year','month','files'])||x.version!==1||!Number.isInteger(x.year)||Number(x.year)<2020||Number(x.year)>2100||!Number.isInteger(x.month)||Number(x.month)<1||Number(x.month)>12||!Array.isArray(x.files)||x.files.length<1||x.files.length>6)return photoFail();
 x.files.forEach((f,i)=>{if(!photoKeys(f,['page','sha256','size','mime','extension'])||f.page!==i+1||typeof f.sha256!=='string'||!/^[a-f0-9]{64}$/.test(f.sha256)||!Number.isInteger(f.size)||Number(f.size)<1||Number(f.size)>15728640||!photoSame([f.mime,f.extension],({'image/jpeg':['image/jpeg','jpg'],'image/png':['image/png','png'],'image/webp':['image/webp','webp'],'image/heic':['image/heic','heic'],'image/heif':['image/heif','heif']} as Record<string,string[]>)[String(f.mime)]))return photoFail();});return x as unknown as PhotoIntent;
}
const bucketKeys=['id','name','owner','created_at','updated_at','public','avif_autodetection','file_size_limit','allowed_mime_types','owner_id','type','versioning_status','lifecycle_configuration','lifecycle_configuration_generation'];
export function photoBucket(x:unknown):x is PhotoRow{return photoKeys(x,bucketKeys)&&x.id==='hato-pesajes-fotos'&&x.public===false&&x.type==='STANDARD'&&time(x.created_at)&&time(x.updated_at);}
export function photoObject(x:unknown,path:string):x is PhotoRow{return photoKeys(x,['id','bucket_id','name','owner','created_at','updated_at','last_accessed_at','metadata','path_tokens','version','owner_id','user_metadata','archived_at','is_delete_marker','is_versioned'])&&photoUuid(x.id)&&x.bucket_id==='hato-pesajes-fotos'&&x.name===path&&time(x.created_at)&&time(x.updated_at)&&x.archived_at===null&&x.is_delete_marker!==true&&photoSame(x.path_tokens,path.split('/'));}
export function validatePhotoResult(x:unknown,owner:string,key:string,expectedIntent?:PhotoIntent,expected?:PhotoResult):PhotoResult{
 if(!photoUuid(owner)||!photoUuid(key)||!photoKeys(x,['version','requestKey','owner','state','intent','bucket','paths','permissionId','permit','receipt','acknowledged'])||x.version!==1||x.requestKey!==key||x.owner!==owner||!['unknown','reserved','held','verified','canceled'].includes(String(x.state))||typeof x.acknowledged!=='boolean'||(x.acknowledged&&!['verified','canceled'].includes(String(x.state))))return photoFail();
 if(x.intent===null){if(!['unknown','canceled'].includes(String(x.state))||x.bucket!==null||x.paths!==null||x.permissionId!==null||x.permit!==null||x.receipt!==null)return photoFail();}
 else {
  const intent=photoIntent(x.intent),paths=intent.files.map(f=>`verified-milk/${owner}/${key}/page-${f.page}.${f.extension}`);
  if(x.state==='unknown'||!photoBucket(x.bucket)||!photoSame(paths,x.paths)||(expectedIntent&&!photoSame(intent,expectedIntent)))return photoFail();
  if(['held','verified'].includes(String(x.state))?!photoUuid(x.permissionId):x.permissionId!==null)return photoFail();
  if(x.permit!==null&&(x.state!=='held'||x.permit!==x.permissionId))return photoFail();
  if(x.state!=='verified'){if(x.receipt!==null)return photoFail();}
  else {
   const q=x.receipt;if(!photoKeys(q,['version','requestKey','owner','actor','recordedAt','intent','bucket','paths','permissionId','objects','capture'])||q.version!==1||q.requestKey!==key||q.owner!==owner||!photoSame(q.actor,{origin:'web',profileId:owner})||!time(q.recordedAt)||!photoSame(q.intent,intent)||!photoSame(q.bucket,x.bucket)||!photoSame(q.paths,paths)||q.permissionId!==x.permissionId||!Array.isArray(q.objects)||q.objects.length!==intent.files.length)return photoFail();
   q.objects.forEach((ob,i)=>{if(!photoKeys(ob,['page','row','sha256','size','mime'])||!photoSame({page:ob.page,sha256:ob.sha256,size:ob.size,mime:ob.mime},{page:intent.files[i].page,sha256:intent.files[i].sha256,size:intent.files[i].size,mime:intent.files[i].mime})||!photoObject(ob.row,paths[i]))return photoFail();});
   // Compare all capture columns, including explicit unknown OCR/write counts.
   if(!photoRecord(q.capture)||!photoSame(q.capture,{id:key,creado_en:q.recordedAt,actualizado_en:q.recordedAt,tipo:'pesaje',origen:'web',desenlace:'pendiente',anio:intent.year,mes:intent.month,fecha:null,storage_bucket:'hato-pesajes-fotos',storage_prefijo:`verified-milk/${owner}/${key}`,storage_rutas:paths,storage_ok:true,fotos_recibidas:paths.length,modelo:null,celdas_leidas_ocr:null,celdas_confirmadas:null,filas_escritas:null,detalle:null,created_by:owner}))return photoFail();
  }
 }
 const r=x as unknown as PhotoResult;
 if(expected&&expected.state!=='unknown'){
  if(!photoSame(r.intent,expected.intent)||!photoSame(r.bucket,expected.bucket)||!photoSame(r.paths,expected.paths)||(expected.permissionId&&r.permissionId!==expected.permissionId)||(expected.acknowledged&&!r.acknowledged))return photoFail();
  const transitions={reserved:['reserved','held','canceled'],held:['held','verified'],verified:['verified'],canceled:['canceled']};if(!transitions[expected.state].includes(r.state))return photoFail();
  if(expected.receipt&&!photoSame(r.receipt,expected.receipt))return photoFail();
 }
 return r;
}
export async function photoStep(c:PhotoRpc,owner:string,key:string,action:'reserve'|'claim'|'observe'|'status'|'cancel'|'acknowledge',payload:unknown=null,expected?:PhotoResult){
 if(!photoUuid(owner)||!photoUuid(key)||!['reserve','claim','observe','status','cancel','acknowledge'].includes(action))return photoFail();if(action==='reserve')photoIntent(payload);else if(action!=='observe'&&payload!==null)return photoFail();
 const q=await c.rpc('fn_hato_photo_upload_service',{p_action:action,p_request_key:key,p_owner:owner,p_payload:payload});if(q.error)return photoFail();const result=validatePhotoResult(q.data,owner,key,action==='reserve'?payload as PhotoIntent:undefined,expected);
 if(result.permit!==null&&(action!=='claim'||expected?.state!=='reserved'))return photoFail();return result;
}
export interface PhotoInspection {version:1;original:PhotoResult;bucket:PhotoRow;objects:{page:number;row:PhotoRow|null}[]}
export async function inspectPhoto(c:PhotoRpc,owner:string,key:string,expected:PhotoResult):Promise<PhotoInspection>{
 const q=await c.rpc('fn_hato_photo_upload_inspect_service',{p_request_key:key,p_owner:owner});if(q.error||!photoKeys(q.data,['version','original','bucket','objects'])||q.data.version!==1||!photoBucket(q.data.bucket)||!photoSame(q.data.bucket,expected.bucket)||!Array.isArray(q.data.objects))return photoFail();
 const original=validatePhotoResult(q.data.original,owner,key,undefined,expected);if(!['held','verified'].includes(original.state)||original.permit!==null||!original.paths||q.data.objects.length!==original.paths.length)return photoFail();
 q.data.objects.forEach((o,i)=>{if(!photoKeys(o,['page','row'])||o.page!==i+1||(o.row!==null&&!photoObject(o.row,original.paths![i])))return photoFail();});return q.data as unknown as PhotoInspection;
}
