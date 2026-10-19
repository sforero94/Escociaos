import {milkAction,beginMilk,nativeMilkSource,type MilkAction} from './milkWeighing.ts';
import {photoFail,photoKeys,photoSame,photoUuid,photoBucket,photoObject,photoIntent,validatePhotoResult,type PhotoRpc,type PhotoRow,type PhotoResult} from '../hatoPhotoUploadProtocol.ts';
import {validatePhotoBytes} from '../hatoPhotoBytes.ts';
import {validatePhotoPreviewResult,validatePhotoOutcome,type PhotoPreviewResult} from '../hatoPhotoPreviewProtocol.ts';
import type {PhotoServiceClient,PhotoInput,VerifiedPhotoUpload} from '../hatoPhotoUploadService.ts';
export interface NativePhoto {version:1;actor:PhotoRow;action:MilkAction;requestKey:string|null;result:PhotoPreviewResult|null}
const actionKeys=['sender','chatId','messageId'];
function validAction(a:MilkAction){if(!photoKeys(a,actionKeys)||a.sender!==a.chatId||![a.sender,a.messageId].every(n=>Number.isSafeInteger(n)&&n>0))return photoFail();}
async function call(c:PhotoRpc,a:MilkAction,channel:string,mode:string,payload:unknown=null,expected?:NativePhoto):Promise<Omit<NativePhoto,'result'>&{result:unknown}>{
 validAction(a);const r=await c.rpc('fn_hato_photo_telegram',{p_channel:channel,p_action:mode,p_sender:a.sender,p_chat_id:a.chatId,p_message_id:a.messageId,p_payload:payload});if(r.error)return photoFail();const x=r.data;
 if(!photoKeys(x,['version','actor','action','requestKey','result'])||x.version!==1||!photoKeys(x.actor,['origin','registrationId','profileId','sender','displayName'])||x.actor.origin!=='telegram'||x.actor.sender!==a.sender||!photoUuid(x.actor.registrationId)||!photoUuid(x.actor.profileId)||(x.actor.displayName!==null&&typeof x.actor.displayName!=='string')||!photoKeys(x.action,actionKeys))return photoFail();
 validAction(x.action as unknown as MilkAction);if(x.action.sender!==a.sender||(channel!=='recover'&&!photoSame(x.action,a))||(expected&&(!photoSame(x.actor,expected.actor)||x.requestKey!==expected.requestKey||!photoSame(x.action,expected.action))))return photoFail();
 if(x.requestKey===null){if(x.result!==null||mode!=='status')return photoFail();}else if(!photoUuid(x.requestKey))return photoFail();return x as unknown as Omit<NativePhoto,'result'>&{result:unknown};
}
export async function nativePhoto(c:PhotoRpc,a:MilkAction,mode:'status'|'recover'|'claim'|'record'|'acknowledge'='status',payload:unknown=null,expected?:NativePhoto):Promise<NativePhoto>{
 const x=await call(c,a,mode==='recover'?'recover':'preview',mode==='recover'?'status':mode,payload,expected);
 const result=x.result===null?null:validatePhotoPreviewResult(x.result,String(x.actor.profileId),String(x.requestKey),expected?.result??undefined,x.actor);
 if(result?.permit!==null&&mode!=='claim'&&result!==null)return photoFail();return {...x,result} as unknown as NativePhoto;
}
async function uploadStep(c:PhotoRpc,a:MilkAction,mode:string,payload:unknown=null,expected?:NativePhoto,prior?:PhotoResult){const x=await call(c,a,'upload',mode,payload,expected);const result=validatePhotoResult(x.result,String(x.actor.profileId),String(x.requestKey),mode==='reserve'?photoIntent(payload):undefined,prior,x.actor);if(result.permit!==null&&mode!=='claim')return photoFail();return {native:{...x,result:null} as unknown as NativePhoto,upload:result};}
async function observe(c:PhotoServiceClient,a:MilkAction,n:NativePhoto,original:PhotoResult):Promise<VerifiedPhotoUpload>{
 const inspect=async()=>{const x=await call(c,a,'inspect','status',null,n),v=x.result;if(!photoKeys(v,['version','original','bucket','objects'])||v.version!==1||!photoBucket(v.bucket)||!photoSame(v.bucket,original.bucket)||!Array.isArray(v.objects)||v.objects.length!==original.paths?.length)return photoFail();validatePhotoResult(v.original,String(n.actor.profileId),n.requestKey!,undefined,original,n.actor);v.objects.forEach((o,i)=>{if(!photoKeys(o,['page','row'])||o.page!==i+1||!photoObject(o.row,original.paths![i]))return photoFail();});return v;};
 const before=await inspect(),photos:VerifiedPhotoUpload['photos']=[];
 for(let i=0;i<original.intent!.files.length;i++){await nativePhoto(c,a,'status',null,n);const f=original.intent!.files[i],r=await c.storage.from('hato-pesajes-fotos').download(original.paths![i]);if(r.error||!r.data||r.data.size!==f.size)return photoFail();const bytes=new Uint8Array(await r.data.arrayBuffer()),file=await validatePhotoBytes(bytes,f.mime,i+1);if(!photoSame(file,f))return photoFail();photos.push({file,bytes});}
 const after=await inspect();if(!photoSame(before,after))return photoFail();const verified=await uploadStep(c,a,'observe',{permissionId:original.permissionId,objects:photos.map(({file},i)=>({page:file.page,row:(after.objects as PhotoRow[])[i].row,sha256:file.sha256,size:file.size,mime:file.mime}))},n,original);
 if(verified.upload.state!=='verified'||verified.upload.permit!==null)return photoFail();return {original:verified.upload,photos};
}
/** The original private message is the idempotency key. Only a fresh returned
 * permission can authorize Storage/model I/O; status is always read-only. */
export async function processNativePhoto(c:PhotoServiceClient,a:MilkAction,input:{year:number;month:number;photos:readonly PhotoInput[]}|null,ocr:(v:VerifiedPhotoUpload)=>Promise<unknown>):Promise<NativePhoto>{
 let n=await nativePhoto(c,a),verified:VerifiedPhotoUpload|undefined;
 if(n.result?.preview)return n;
 if(input){
  if(input.photos.length<1||input.photos.length>6)return photoFail();const photos=input.photos.map(p=>({bytes:new Uint8Array(p.bytes),mime:p.mime})),files=[];
  for(let i=0;i<photos.length;i++)files.push(await validatePhotoBytes(photos[i].bytes,photos[i].mime,i+1));const intent=photoIntent({version:1,year:input.year,month:input.month,files});
  const reserve=await uploadStep(c,a,'reserve',intent,n.requestKey?n:undefined);n=reserve.native;let original=reserve.upload;
  if(original.state==='reserved'){
   const claim=await uploadStep(c,a,'claim',null,n,original);original=claim.upload;
   if(original.permit!==null)for(let i=0;i<photos.length;i++){
    const current=await uploadStep(c,a,'status',null,n,original);if(current.upload.state!=='held'||current.upload.permissionId!==original.permit)return photoFail();
    try{const r=await c.storage.from('hato-pesajes-fotos').upload(original.paths![i],photos[i].bytes,{contentType:files[i].mime,upsert:false});if(r.error)break;}catch{break;}
   }
  }
  if(!['held','verified'].includes(original.state))return photoFail();verified=await observe(c,a,n,original);
 }else if(n.result&&['held','verified'].includes(n.result.upload.state))verified=await observe(c,a,n,n.result.upload);else return n;
 if(!verified)return photoFail();n=await nativePhoto(c,a,'claim',null,n);if(!n.result)return photoFail();const permit=n.result.permit;
 if(permit!==null){await nativePhoto(c,a,'status',null,n);const outcome=await ocr(verified);if(photoKeys(outcome,['ok','status','error','uncertain'])&&outcome.uncertain===true)return {...n,result:{...n.result,permit:null}};if(outcome&&typeof outcome==='object'&&'uncertain'in outcome&&outcome.uncertain===true)return {...n,result:{...n.result,permit:null}};validatePhotoOutcome(outcome,verified.original,'telegram');n=await nativePhoto(c,a,'record',{permissionId:permit,outcome},n);}
 return {...n,result:n.result?{...n.result,permit:null}:null};
}
const recovery={inline_keyboard:[[{text:'Consultar fotos originales',callback_data:'hmp:status'}]]};
export async function renderNativePhoto(ctx:any,n:NativePhoto){
 const p=n.result?.preview,outcome=p?.outcome;let text='Conserve este mensaje original. Resultado pendiente de verificar; no reenvíe las fotos.',keyboard=recovery;
 if(p?.state==='ready'&&outcome){if(outcome.ok){const r=outcome.resultado as PhotoRow;const diff=r.diff as PhotoRow[];const lines=[`Lectura conservada ${r.mes}/${r.anio}`,`Original: ${n.requestKey}`,...diff.map(d=>`${String(d.nombre).replace(/[\r\n\t]/g,' ').slice(0,80)} · ${d.fecha} · AM ${d.litrosAm??'sin dato'} / PM ${d.litrosPm??'sin dato'}`)];let page='';for(const line of lines){if(page.length+line.length>3300){await ctx.api.sendMessage(n.action.chatId,page);page='';}page+=(page?'\n':'')+line;}if(page)await ctx.api.sendMessage(n.action.chatId,page);text=`Lectura original ${n.requestKey} conservada. Revise los valores arriba. Preparar revisión no guarda el pesaje; requiere otra confirmación explícita.`;keyboard={inline_keyboard:[[{text:'Preparar revisión del pesaje',callback_data:'hmp:review'}],...recovery.inline_keyboard,[{text:'Cerrar lectura original',callback_data:'hmp:acknowledge'}]]};}
 else{text=`Lectura original rechazada: ${String(outcome.error).slice(0,1800)}. No se registró ningún pesaje.`;keyboard={inline_keyboard:[...recovery.inline_keyboard,[{text:'Cerrar lectura original',callback_data:'hmp:acknowledge'}]]};}}
 else if(n.result&&!p&&['held','verified'].includes(n.result.upload.state))keyboard={inline_keyboard:[[{text:'Verificar y leer original una vez',callback_data:'hmp:read'}],...recovery.inline_keyboard]};
 if(n.result?.upload.acknowledged){text='Lectura original cerrada; historial conservado.';keyboard={inline_keyboard:[]};}
 await ctx.api.editMessageText(n.action.chatId,n.action.messageId,text,{reply_markup:keyboard});
}
export async function beginNativePhoto(ctx:any,c:PhotoServiceClient,input:{year:number;month:number;photos:readonly PhotoInput[]},ocr:(v:VerifiedPhotoUpload)=>Promise<unknown>){
 const current=milkAction(ctx),old=await nativePhoto(c,current,'recover');if(old.result){await renderNativePhoto(ctx,old);return old;}
 const message=await ctx.reply(`Fotos de ${input.month}/${input.year}: ${input.photos.length}. Preparando lectura; conserve este mensaje original.`,{reply_markup:recovery}),a=milkAction({...ctx,callbackQuery:{message}});
 try{const n=await processNativePhoto(c,a,input,ocr);await renderNativePhoto(ctx,n);return n;}catch{try{await renderNativePhoto(ctx,await nativePhoto(c,a));}catch{/* The original anchor remains recoverable. */}await ctx.reply('No pude verificar la lectura original. Consulte su mensaje; no reenvíe las fotos.');return null;}
}
export async function handlePhotoRecovery(ctx:any,next:()=>Promise<void>,c:PhotoServiceClient,ocr:(v:VerifiedPhotoUpload)=>Promise<unknown>){
 if(!ctx.callbackQuery?.data?.startsWith('hmp:'))return next();await ctx.answerCallbackQuery();try{const a=milkAction(ctx),mode=ctx.callbackQuery.data.slice(4);let n=await nativePhoto(c,a);
 if(mode==='read')n=await processNativePhoto(c,a,null,ocr);
 else if(mode==='acknowledge'){if(n.result?.preview?.state!=='ready')return photoFail();n=await nativePhoto(c,a,'acknowledge',null,n);}
 else if(mode==='review'){const outcome=n.result?.preview?.outcome;if(!outcome?.ok||n.result?.upload.acknowledged)return photoFail();const r=outcome.resultado as PhotoRow,source=await nativeMilkSource(c,a);const cells=(r.diff as PhotoRow[]).filter(d=>d.litrosAm!==null||d.litrosPm!==null).map(d=>({animalId:String(d.animalId),date:String(d.fecha),am:d.litrosAm as number|null,pm:d.litrosPm as number|null,observed:source.rows.find(row=>row.animal_id===d.animalId&&row.fecha===d.fecha)??null}));await beginMilk(ctx,c,{version:1,year:Number(r.anio),month:Number(r.mes),captureId:n.requestKey,cells});return;}
 else if(mode!=='status')return photoFail();await renderNativePhoto(ctx,n);
 }catch{await ctx.reply('No pude verificar las fotos originales. Conserve su mensaje privado; no repita el envío.');}
}
