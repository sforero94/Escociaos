import {normalizarRutaFactura} from '../archivoFactura';
import type {MetadataClient} from './hatoIncomeMetadataProtocol';
import {originResult} from './hatoIncomeInvoiceOriginProtocol';
import {photoKeys as keys,photoSame as same,photoUuid as uuid} from './hatoPhotoUploadProtocol';
export type ReleaseDisposition='held'|'committed_settled'|'unused_fenced'|'quarantine_settled_absent';
type Row=Record<string,unknown>;
export interface InvoiceReleasePreview {version:1;owner:string;incomeId:string;originKey:string;origin:Row;request:Row;target:{owner:string;target_key:string;generation:string;active:boolean};executions:{owner:string;request_key:string;execution_id:string;settled:boolean}[];object:Row|null;references:{table:string;row:Row}[];metadataClaims:Row[];income:Row|null;disposition:ReleaseDisposition}
export interface InvoiceReleaseReceipt {version:1;owner:string;incomeId:string;originKey:string;actor:{origin:'web';profileId:string};recordedAt:string;disposition:Exclude<ReleaseDisposition,'held'>;preview:InvoiceReleasePreview;afterTarget:InvoiceReleasePreview['target'];beforeDomainSha256:string;beforePrivateSha256:string}
const fail=():never=>{throw Error('La liberación original no se pudo verificar. Conserva el intento y consulta su resultado.');};
const row=(x:unknown):x is Row=>!!x&&typeof x==='object'&&!Array.isArray(x);
const timestamp=(x:unknown)=>typeof x==='string'&&Number.isFinite(Date.parse(x));
export function releasePreview(x:unknown,owner:string,income:string,key?:string):InvoiceReleasePreview{
 if(!uuid(owner)||!uuid(income)||!keys(x,['version','owner','incomeId','originKey','origin','request','target','executions','object','references','metadataClaims','income','disposition'])||x.version!==1||x.owner!==owner||x.incomeId!==income||!uuid(x.originKey)||key!==undefined&&x.originKey!==key||JSON.stringify(x).length>4194304)return fail();
 const o=x.origin,r=x.request,t=x.target;
 if(!keys(o,['request_key','owner_id','income_id','original','file_claims','identity','reservation','created_at'])||o.request_key!==x.originKey||o.owner_id!==owner||o.income_id!==income||!timestamp(o.created_at)||!keys(r,['owner','request_key','receipt_id','path','identity','state','cleanup_pending','cleanup_observed_at','cleanup_observed_absent','reason','created_at'])||r.owner!==owner||!timestamp(r.created_at)||typeof r.cleanup_pending!=='boolean'||r.cleanup_observed_at!==null&&!timestamp(r.cleanup_observed_at)||r.cleanup_observed_absent!==null&&typeof r.cleanup_observed_absent!=='boolean'||r.reason!==null&&typeof r.reason!=='string')return fail();
 const original=originResult({version:1,owner,incomeId:income,requestKey:x.originKey,original:{source:o.original,file:o.file_claims,identity:o.identity,reservedAt:o.created_at,reservation:o.reservation},invoice:{actor:owner,identity:r.identity,receiptId:r.receipt_id,path:r.path,state:r.state,cleanupPending:r.cleanup_pending}},owner,income);
 const id=original.original.identity;
 if(r.request_key!==id.requestKey||!keys(t,['owner','target_key','generation','active'])||t.owner!==owner||t.target_key!==id.targetKey||t.generation!==id.generation||typeof t.active!=='boolean'||!Array.isArray(x.executions)||!Array.isArray(x.references)||!Array.isArray(x.metadataClaims))return fail();
 const seen=new Set();for(const e of x.executions){if(!keys(e,['owner','request_key','execution_id','settled'])||e.owner!==owner||e.request_key!==id.requestKey||!uuid(e.execution_id)||typeof e.settled!=='boolean'||seen.has(e.execution_id))return fail();seen.add(e.execution_id);}
 // Domain/Storage rows are opaque captured evidence: retain every field for exact CAS,
 // while proving association and the absence conditions independently of disposition.
 if(x.object!==null&&(!row(x.object)||!uuid(x.object.id)||x.object.bucket_id!=='facturas'||x.object.name!==r.path))return fail();
 for(const ref of x.references)if(!keys(ref,['table','row'])||!['compras','fin_gastos','fin_ingresos'].includes(String(ref.table))||!row(ref.row)||!uuid(ref.row.id)||![ref.row.url_factura,...(ref.table==='compras'?[ref.row.link_factura]:[])].some(v=>typeof v==='string'&&normalizarRutaFactura(v)===r.path))return fail();
 for(const claim of x.metadataClaims)if(!row(claim)||!uuid(claim.request_key)||!uuid(claim.owner_id)||claim.acknowledged!==false||!['pending','committed'].includes(String(claim.state))||!row(claim.intent)||claim.intent.targetId!==income)return fail();
 if(x.income!==null&&(!row(x.income)||x.income.id!==income))return fail();
 let disposition:ReleaseDisposition='held';
 if(x.metadataClaims.length===0&&x.executions.every(e=>e.settled)){
  if(r.state==='committed'&&!r.cleanup_pending)disposition='committed_settled';
  else if(r.state==='pending'&&!r.cleanup_pending&&r.reason===null&&r.cleanup_observed_at===null&&r.cleanup_observed_absent===null&&x.executions.length===0&&x.object===null&&x.references.length===0)disposition='unused_fenced';
  else if(r.state==='quarantined'&&!r.cleanup_pending&&r.cleanup_observed_absent===true&&r.cleanup_observed_at!==null&&x.object===null&&x.references.length===0)disposition='quarantine_settled_absent';
 }
 if(x.disposition!==disposition)return fail();return x as unknown as InvoiceReleasePreview;
}
export function releaseReceipt(x:unknown,owner:string,income:string,expected?:InvoiceReleasePreview):InvoiceReleaseReceipt{
 if(!keys(x,['version','owner','incomeId','originKey','actor','recordedAt','disposition','preview','afterTarget','beforeDomainSha256','beforePrivateSha256'])||x.version!==1||x.owner!==owner||x.incomeId!==income||!keys(x.actor,['origin','profileId'])||x.actor.origin!=='web'||x.actor.profileId!==owner||!timestamp(x.recordedAt)||typeof x.beforeDomainSha256!=='string'||!/^[0-9a-f]{64}$/.test(x.beforeDomainSha256)||typeof x.beforePrivateSha256!=='string'||!/^[0-9a-f]{64}$/.test(x.beforePrivateSha256))return fail();
 const p=releasePreview(x.preview,owner,income);if(p.disposition==='held'||p.originKey!==x.originKey||p.disposition!==x.disposition||!same(x.afterTarget,{...p.target,active:false})||expected&&!same(p,expected))return fail();return x as unknown as InvoiceReleaseReceipt;
}
export async function invoiceRelease(c:MetadataClient,owner:string,income:string,action:'preview',key:string,preview?:never):Promise<InvoiceReleasePreview>;
export async function invoiceRelease(c:MetadataClient,owner:string,income:string,action:'release',key:string,preview:InvoiceReleasePreview):Promise<InvoiceReleaseReceipt>;
export async function invoiceRelease(c:MetadataClient,owner:string,income:string,action:'recover',key?:string):Promise<InvoiceReleaseReceipt|null>;
export async function invoiceRelease(c:MetadataClient,owner:string,income:string,action:'preview'|'release'|'recover',key?:string,preview?:InvoiceReleasePreview){
 if(!uuid(owner)||!uuid(income)||key!==undefined&&!uuid(key)||action!=='recover'&&!key)return fail();if(action==='release'){releasePreview(preview,owner,income,key);if(preview?.disposition==='held')return fail();}
 const r=await c.rpc('fn_hato_income_invoice_release_web',{p_action:action,p_origin_key:key??null,p_income_id:income,p_preview:preview??null,p_expected_owner:owner});if(r.error)return fail();if(action==='recover'&&r.data===null)return null;return action==='preview'?releasePreview(r.data,owner,income,key):releaseReceipt(r.data,owner,income,preview);
}
