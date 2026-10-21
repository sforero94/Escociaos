import type {InvoiceIdentity,InvoiceReceipt} from '../invoiceUpload';
import {incomeInvoiceReceipt} from './hatoIncomeInvoiceProof';
import {metadataSource,type MetadataClient} from './hatoIncomeMetadataProtocol';
import {photoKeys as keys,photoSame as same,photoUuid as uuid} from './hatoPhotoUploadProtocol';
import {validateQuincenaSource,type QuincenaSource} from './hatoQuincenaProtocol';
export type InvoiceFileClaims=Pick<InvoiceIdentity,'sha256'|'size'|'mime'|'extension'|'sourceExtension'>;
export interface IncomeInvoiceOrigin {version:1;owner:string;incomeId:string;requestKey:string;original:{source:QuincenaSource;file:InvoiceFileClaims;identity:InvoiceIdentity;reservedAt:string;reservation:Omit<InvoiceReceipt,'state'>&{state:'pending'}};invoice:Omit<InvoiceReceipt,'state'|'cleanupPending'>&{state:'pending'|'uploaded'|'committed'|'quarantined';cleanupPending:boolean}}
const fail=():never=>{throw Error('No se pudo verificar la reserva original de factura. Consérvala y consulta su resultado.');};
export function originResult(x:unknown,owner:string,income:string):IncomeInvoiceOrigin{
 if(!uuid(owner)||!uuid(income)||!keys(x,['version','owner','incomeId','requestKey','original','invoice'])||x.version!==1||x.owner!==owner||x.incomeId!==income||!uuid(x.requestKey)||!keys(x.original,['source','file','identity','reservedAt','reservation'])||typeof x.original.reservedAt!=='string'||!Number.isFinite(Date.parse(x.original.reservedAt)))return fail();
 const o=x.original,r=o.reservation,v=x.invoice;
 if(!keys(o.file,['sha256','size','mime','extension','sourceExtension'])||!keys(r,['actor','identity','receiptId','path','state','cleanupPending'])||r.state!=='pending'||r.cleanupPending!==false)return fail();
 incomeInvoiceReceipt({...r,state:'committed'},owner);
 if(!same(o.identity,r.identity)||!same(o.file,Object.fromEntries(['sha256','size','mime','extension','sourceExtension'].map(k=>[k,(o.identity as Record<string,unknown>)[k]]))))return fail();
 if(!keys(v,['actor','identity','receiptId','path','state','cleanupPending'])||!['pending','uploaded','committed','quarantined'].includes(String(v.state))||typeof v.cleanupPending!=='boolean'||v.state==='committed'&&v.cleanupPending||!same({...v,state:'pending',cleanupPending:false},r))return fail();
 if(!o.source||typeof o.source!=='object'||!('production'in o.source)||!o.source.production||typeof o.source.production!=='object'||!('id'in o.source.production))return fail();
 const source=validateQuincenaSource(o.source,{version:1,kind:'delete',targetId:String(o.source.production.id),fields:null});
 if(source.income?.id!==income||source.production?.origen_dato!=='medido'||source.aliases.length!==1||source.events.length!==0||source.protectedClaims.length!==0)return fail();
 return x as unknown as IncomeInvoiceOrigin;
}
export async function recoverInvoiceOrigin(c:MetadataClient,owner:string,income:string){if(!uuid(owner)||!uuid(income))return fail();const r=await c.rpc('fn_hato_income_invoice_origin_web',{p_action:'recover',p_request_key:null,p_income_id:income,p_observed:null,p_file:null,p_expected_owner:owner});if(r.error)return fail();return r.data===null?null:originResult(r.data,owner,income);}
export async function reserveInvoiceOrigin(c:MetadataClient,owner:string,income:string,key:string,source:QuincenaSource,file:InvoiceFileClaims){if(!uuid(key))return fail();const r=await c.rpc('fn_hato_income_invoice_origin_web',{p_action:'reserve',p_request_key:key,p_income_id:income,p_observed:source,p_file:file,p_expected_owner:owner});if(r.error)return fail();const original=originResult(r.data,owner,income);if(original.requestKey!==key||!same(original.original.source,source)||!same(original.original.file,file)||original.invoice.state!=='pending')return fail();return original;}
export const invoiceOriginSource=(c:MetadataClient,owner:string,income:string)=>metadataSource(c,owner,{version:1,kind:'metadata',targetId:income,fields:{observations:null,invoice:null}});
