import {ejecutarPipelinePesajeFoto} from './hato-pesaje-pipeline.ts';
import type {PhotoServiceClient,VerifiedPhotoUpload} from './hatoPhotoUploadService.ts';
async function boundedTelegram(response:Response,limit:number){if(!response.ok)return Promise.reject(Error('No se pudo descargar la foto original.'));const size=response.headers.get('content-length');if(size&&(!/^\d+$/.test(size)||Number(size)>limit))throw Error('Foto demasiado grande.');const reader=response.body?.getReader();if(!reader)throw Error('Foto sin contenido.');const chunks:Uint8Array[]=[];let n=0;try{while(true){const p=await reader.read();if(p.done)break;n+=p.value.length;if(n>limit){void reader.cancel();throw Error('Foto demasiado grande.');}chunks.push(p.value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(n);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}return bytes;}
/** Authenticated native transport only; credentials are never returned/logged.
 * Redirects, arbitrary hosts/paths and unbounded response bodies fail closed. */
export async function downloadNativePhoto(fileId:string,botToken:string):Promise<Uint8Array>{
 if(typeof fileId!=='string'||fileId.length<1||fileId.length>512||!botToken)throw Error('Referencia de foto inválida.');const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),25000);
 try{const info=JSON.parse(new TextDecoder().decode(await boundedTelegram(await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`,{signal:ctrl.signal,redirect:'error'}),65536))),path=info?.result?.file_path;
 if(info?.ok!==true||typeof path!=='string'||path.length>1024||!/^[-a-zA-Z0-9_/\.]+$/.test(path)||path.startsWith('/')||path.split('/').some((p:string)=>p==='..'||p==='.'||p===''))throw Error('Ruta de foto inválida.');return await boundedTelegram(await fetch(`https://api.telegram.org/file/bot${botToken}/${path}`,{signal:ctrl.signal,redirect:'error'}),15728640);
 }finally{clearTimeout(timer);}
}
export async function nativePhotoOCR(supabase:PhotoServiceClient,verified:VerifiedPhotoUpload){
 const apiKey=Deno.env.get('OPENROUTER_API_KEY');if(!apiKey)return {ok:false,status:500,error:'La lectura por foto no está disponible.'};
 return ejecutarPipelinePesajeFoto({supabase,apiKey,anio:verified.original.intent!.year,mes:verified.original.intent!.month,origen:'telegram',createdBy:verified.original.owner,protectedCapture:{id:verified.original.requestKey,prefix:`verified-milk-native/${verified.original.owner}/${verified.original.requestKey}`,paths:verified.original.paths!},fotos:verified.photos.map(p=>({pagina:p.file.page,nombre:`pagina-${p.file.page}.${p.file.extension}`,tipo:p.file.mime,bytes:p.bytes}))});
}
