import {photoKeys,photoUuid,photoSame,photoFail} from './hatoPhotoUploadProtocol';
export interface UploadDisposition {captureId:string;discardedAt:string;removedCount:number;retained:true}
export interface UploadHistory {version:1;owner:string;year:number;month:number;entries:UploadDisposition[]}
export interface HistoryClient {auth:{getUser():PromiseLike<{data:{user:{id:string}|null};error:unknown}>};rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}>}
export function validateUploadHistory(x:unknown,owner:string,year:number,month:number):UploadHistory{
 if(!photoUuid(owner)||!Number.isInteger(year)||year<2020||year>2100||!Number.isInteger(month)||month<1||month>12||!photoKeys(x,['version','owner','year','month','entries'])||x.version!==1||x.owner!==owner||x.year!==year||x.month!==month||!Array.isArray(x.entries)||x.entries.length>5000)return photoFail();
 const ids:string[]=[];for(const e of x.entries){if(!photoKeys(e,['captureId','discardedAt','removedCount','retained'])||!photoUuid(e.captureId)||typeof e.discardedAt!=='string'||!/^\d{4}-\d\d-\d\dT/.test(e.discardedAt)||!Number.isFinite(Date.parse(e.discardedAt))||!Number.isInteger(e.removedCount)||Number(e.removedCount)<1||Number(e.removedCount)>2000||e.retained!==true)return photoFail();ids.push(e.captureId);}
 if(new Set(ids).size!==ids.length||!photoSame(ids,[...ids].sort()))return photoFail();return x as unknown as UploadHistory;
}
export async function readUploadHistory(c:HistoryClient,owner:string,year:number,month:number,current:()=>boolean){
 validateUploadHistory({version:1,owner,year,month,entries:[]},owner,year,month);
 const authorize=async()=>{const a=await c.auth.getUser();if(a.error||a.data.user?.id!==owner||!current())return photoFail();};await authorize();
 const r=await c.rpc('fn_hato_upload_discard_history_web',{p_year:year,p_month:month,p_expected_owner:owner});if(r.error)throw Error('No se pudo verificar el estado de las subidas. Actualiza para consultar el historial.');const result=validateUploadHistory(r.data,owner,year,month);await authorize();return result;
}
