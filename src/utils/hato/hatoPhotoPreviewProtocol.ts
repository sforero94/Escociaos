import {photoKeys,photoRecord,photoSame,photoFail,photoUuid,validatePhotoResult,type PhotoResult,type PhotoRow,type PhotoRpc} from './hatoPhotoUploadProtocol';
import {validateMilkWeighingSnapshot,type MilkWeighingSnapshot} from './hatoMilkWeighingProtocol';
export interface PhotoPreview {request_key:string;owner_id:string;permission_id:string;actor:PhotoRow;claimed_at:string;source:MilkWeighingSnapshot;capture_before:PhotoRow;state:'held'|'ready';outcome:PhotoRow|null;capture_after:PhotoRow|null;receipt:PhotoRow|null}
export interface PhotoPreviewResult {version:1;upload:PhotoResult;preview:PhotoPreview|null;permit:string|null}
const time=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT/.test(v)&&Number.isFinite(Date.parse(v));
export function validatePhotoOutcome(x:unknown,upload:PhotoResult,origin='web'):PhotoRow{
 if(!photoRecord(x)||typeof x.ok!=='boolean'||new TextEncoder().encode(JSON.stringify(x)).length>2097152)return photoFail();
 if(!x.ok){if(!photoKeys(x,['ok','status','error'])||![422,500,502].includes(Number(x.status))||typeof x.error!=='string'||x.error.length<1||x.error.length>2000)return photoFail();return x;}
 if(!photoKeys(x,['ok','resultado'])||!photoKeys(x.resultado,['generadoEn','anio','mes','capturaId','fechasPorSemana','diff','rosterAnimales','ocr']))return photoFail();const r=x.resultado;
 if(!time(r.generadoEn)||r.anio!==upload.intent?.year||r.mes!==upload.intent?.month||r.capturaId!==upload.requestKey||!Array.isArray(r.diff)||r.diff.length>5000||!Array.isArray(r.rosterAnimales)||!photoKeys(r.fechasPorSemana,['1','2','3','4','5'])||!photoRecord(r.ocr)||!Array.isArray(r.ocr.fotos)||r.ocr.fotos.length!==upload.intent?.files.length||!photoRecord(r.ocr.almacenamiento)||r.ocr.almacenamiento.bucket!=='hato-pesajes-fotos'||r.ocr.almacenamiento.ok!==true||!photoSame(r.ocr.almacenamiento.errores,[])||!photoRecord(r.ocr.resumen))return photoFail();

 const ocr=r.ocr;if(!photoKeys(ocr,['modelo','fotos','almacenamiento','paginasNoLeidas','filasNoLeidas','vacasSinLeer','advertencias','resumen'])||typeof ocr.modelo!=='string'||!photoKeys(ocr.almacenamiento,['bucket','prefijo','ok','errores'])||ocr.almacenamiento.prefijo!==`${origin==='telegram'?'verified-milk-native':'verified-milk'}/${upload.owner}/${upload.requestKey}`||!Array.isArray(ocr.paginasNoLeidas)||!ocr.paginasNoLeidas.every(v=>typeof v==='string')||!Array.isArray(ocr.advertencias)||!ocr.advertencias.every(v=>typeof v==='string')||!Array.isArray(ocr.filasNoLeidas)||!ocr.filasNoLeidas.every(photoRecord)||!Array.isArray(ocr.vacasSinLeer)||!ocr.vacasSinLeer.every(v=>photoKeys(v,['id','nombre'])&&photoUuid(v.id)&&typeof v.nombre==='string'))return photoFail();
 if(!photoKeys(ocr.resumen,['vacasEnRoster','fotosRecibidas','fotosLeidas','filasConfirmadas','filasNoLeidas','vacasSinLeer','celdasNoConfiables'])||!Object.values(ocr.resumen).every(v=>Number.isInteger(v)&&Number(v)>=0)||ocr.resumen.fotosRecibidas!==upload.intent!.files.length||Number(ocr.resumen.fotosLeidas)>upload.intent!.files.length||ocr.resumen.filasNoLeidas!==ocr.filasNoLeidas.length||ocr.resumen.vacasSinLeer!==ocr.vacasSinLeer.length)return photoFail();
 (ocr.fotos as unknown[]).forEach((f,i)=>{const expected=upload.intent!.files[i];if(!photoKeys(f,['pagina','nombre','tipo','bytes','rutaStorage'])||f.pagina!==i+1||typeof f.nombre!=='string'||f.tipo!==expected.mime||f.bytes!==expected.size||f.rutaStorage!==upload.paths![i])return photoFail();});
 if(!r.rosterAnimales.every(v=>photoKeys(v,['id','nombre'])&&photoUuid(v.id)&&typeof v.nombre==='string')||new Set(r.rosterAnimales.map(v=>v.id)).size!==r.rosterAnimales.length)return photoFail();
 const dates=r.fechasPorSemana as PhotoRow;for(const date of Object.values(dates)){if(date!==null&&(typeof date!=='string'||!/^\d{4}-\d\d-\d\d$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||Number(date.slice(0,4))!==r.anio||Number(date.slice(5,7))!==r.mes))return photoFail();}
 for(const d of r.diff){if(!photoKeys(d,['animalId','nombre','semana','fecha','litrosAm','litrosPm','litrosTotal','soloUnOrdeno','existenteId','clasificacion','noConfiable'])||!photoUuid(d.animalId)||typeof d.nombre!=='string'||!Number.isInteger(d.semana)||![1,2,3,4,5].includes(Number(d.semana))||d.fecha!==dates[String(d.semana)]||![d.litrosAm,d.litrosPm,d.litrosTotal].every(v=>v===null||typeof v==='number'&&Number.isFinite(v)&&v>=0)||typeof d.noConfiable!=='boolean'||typeof d.soloUnOrdeno!=='boolean'||!['nuevo','sin_cambio','cambio','sin_dato'].includes(String(d.clasificacion))||(d.existenteId!==null&&!photoUuid(d.existenteId)))return photoFail();}

 return x;
}
export function validatePhotoPreviewResult(x:unknown,owner:string,key?:string,expected?:PhotoPreviewResult,actor:PhotoRow={origin:'web',profileId:owner}):PhotoPreviewResult{
 if(!photoKeys(x,['version','upload','preview','permit'])||x.version!==1||!photoRecord(x.upload)||!photoUuid(x.upload.requestKey)||(key&&x.upload.requestKey!==key))return photoFail();const upload=validatePhotoResult(x.upload,owner,x.upload.requestKey,undefined,expected?.upload,actor);if(upload.permit!==null)return photoFail();
 const q=x.preview;
 if(q===null){if(x.permit!==null)return photoFail();return x as unknown as PhotoPreviewResult;}
 if(!photoKeys(q,['request_key','owner_id','permission_id','actor','claimed_at','source','capture_before','state','outcome','capture_after','receipt'])||q.request_key!==upload.requestKey||q.owner_id!==owner||!photoUuid(q.permission_id)||!photoSame(q.actor,actor)||!time(q.claimed_at)||!['held','ready'].includes(String(q.state))||upload.state!=='verified'||!photoSame(q.capture_before,upload.receipt?.capture))return photoFail();validateMilkWeighingSnapshot(q.source);
 if(x.permit!==null&&(x.permit!==q.permission_id||q.state!=='held'))return photoFail();
 if(q.state==='held'){if(q.outcome!==null||q.capture_after!==null||q.receipt!==null)return photoFail();}
 else {
  const outcome=validatePhotoOutcome(q.outcome,upload,String(actor.origin)),receipt=q.receipt;
  if(!photoKeys(receipt,['version','requestKey','owner','permissionId','actor','recordedAt','source','outcome','captureBefore','captureAfter'])||receipt.version!==1||receipt.requestKey!==upload.requestKey||receipt.owner!==owner||receipt.permissionId!==q.permission_id||!photoSame(receipt.actor,q.actor)||!time(receipt.recordedAt)||!photoSame(receipt.source,q.source)||!photoSame(receipt.outcome,outcome)||!photoSame(receipt.captureBefore,q.capture_before)||!photoSame(receipt.captureAfter,q.capture_after))return photoFail();
  let capture:PhotoRow={...(q.capture_before as PhotoRow),actualizado_en:receipt.recordedAt};
  if(outcome.ok){const data=outcome.resultado as PhotoRow,ocr=data.ocr as PhotoRow;capture={...capture,modelo:ocr.modelo,celdas_leidas_ocr:(data.diff as PhotoRow[]).filter(d=>d.litrosAm!==null||d.litrosPm!==null).length};}
  else capture={...capture,desenlace:outcome.status===500?'error':'ocr_fallo',detalle:outcome.error};if(!photoSame(capture,q.capture_after))return photoFail();
 }
 const result=x as unknown as PhotoPreviewResult;
 if(expected?.preview){if(!photoSame({...result.preview,state:expected.preview.state,outcome:expected.preview.outcome,capture_after:expected.preview.capture_after,receipt:expected.preview.receipt},expected.preview)||(expected.preview.state==='ready'&&!photoSame(result.preview,expected.preview)))return photoFail();}
 return result;
}
export async function photoPreviewStep(c:PhotoRpc,owner:string,key:string|null,action:'recover'|'status'|'claim'|'record'|'acknowledge'|'cancel',payload:unknown=null,expected?:PhotoPreviewResult):Promise<PhotoPreviewResult|null>{
 if(!photoUuid(owner)||(action!=='recover'&&!photoUuid(key))||!['recover','status','claim','record','acknowledge','cancel'].includes(action)||(action!=='record'&&payload!==null))return photoFail();
 const r=await c.rpc('fn_hato_photo_preview_service',{p_action:action,p_request_key:key,p_owner:owner,p_payload:payload});if(r.error)return photoFail();if(r.data===null&&action==='recover')return null;const result=validatePhotoPreviewResult(r.data,owner,key??undefined,expected);if(result.permit!==null&&action!=='claim')return photoFail();return result;
}
