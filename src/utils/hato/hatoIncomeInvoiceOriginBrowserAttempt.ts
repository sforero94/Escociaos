import {recoverInvoiceOrigin,reserveInvoiceOrigin,invoiceOriginSource,originResult,type IncomeInvoiceOrigin} from './hatoIncomeInvoiceOriginProtocol';
import {runIncomeInvoice,pendingIncomeInvoice,incomeInvoiceScope,type IncomeInvoiceAttempt} from './hatoIncomeInvoiceAttempt';
import {pendingMetadataBrowser} from './hatoIncomeMetadataBrowserAttempt';
import {recoverMetadata,type MetadataClient} from './hatoIncomeMetadataProtocol';
import {verifyInvoiceOwner,validateInvoiceSelection,uploadReservedInvoice,pendingInvoice,recoverCompletedInvoice,type InvoiceClient,type InvoiceReceipt} from '../invoiceUpload';
import {incomeInvoiceReceipt} from './hatoIncomeInvoiceProof';
import {photoKeys as keys,photoSame as same,photoUuid as uuid} from './hatoPhotoUploadProtocol';
interface Anchor {version:1;owner:string;incomeId:string;requestKey:string;origin:IncomeInvoiceOrigin|null;dispatched:boolean}
export interface OriginInvoiceAttempt {owner:string;incomeId:string;targetKey:string|null;requestKey:string|null;receipt:InvoiceReceipt|null;legacy:boolean;held:boolean}
const slot=(owner:string,id:string)=>`measured_income_invoice_origin_v1:${owner}:${id}`;
const fail=():never=>{throw Error('Conserva y consulta la reserva original antes de iniciar otra factura.');};
function anchor(owner:string,id:string):Anchor|null{if(!uuid(owner)||!uuid(id))return fail();const raw=localStorage.getItem(slot(owner,id));if(raw===null)return null;try{const a=JSON.parse(raw);if(!keys(a,['version','owner','incomeId','requestKey','origin','dispatched'])||a.version!==1||a.owner!==owner||a.incomeId!==id||!uuid(a.requestKey)||typeof a.dispatched!=='boolean')return fail();if(a.origin!==null&&originResult(a.origin,owner,id).requestKey!==a.requestKey)return fail();return a as unknown as Anchor;}catch{return fail();}}
function save(a:Anchor){localStorage.setItem(slot(a.owner,a.incomeId),JSON.stringify(a));if(!same(anchor(a.owner,a.incomeId),a))return fail();}
function view(a:Anchor):OriginInvoiceAttempt{const o=a.origin,r=o?.invoice.state==='committed'?incomeInvoiceReceipt(o.invoice,a.owner):null;return {owner:a.owner,incomeId:a.incomeId,targetKey:o?.original.identity.targetKey??null,requestKey:a.requestKey,receipt:r,legacy:false,held:r===null};}
const legacy=(a:IncomeInvoiceAttempt):OriginInvoiceAttempt=>({...a,requestKey:null,legacy:true,held:!a.receipt});
export function pendingOriginInvoice(owner:string,id:string):OriginInvoiceAttempt|null{const a=anchor(owner,id);if(a)return view(a);const old=pendingIncomeInvoice(owner,id);return old?legacy(old):null;}
export async function runOriginInvoice(c:InvoiceClient&MetadataClient,owner:string,id:string,mode:'upload'|'status',file:File|null,current:()=>boolean):Promise<OriginInvoiceAttempt|null>{
 if(!uuid(owner)||!uuid(id)||!navigator.locks)return fail();
 return navigator.locks.request(slot(owner,id),{mode:'exclusive'},async()=>{
  await verifyInvoiceOwner(c,owner,current);if(localStorage.getItem(`measured_income_invoice_release_v1:${owner}:${id}`)!==null)return fail();let a=anchor(owner,id);
  const original=await recoverInvoiceOrigin(c,owner,id);await verifyInvoiceOwner(c,owner,current);
  if(original){if(a&&(a.requestKey!==original.requestKey||a.origin&&!same(a.origin.original,original.original)||a.origin?.invoice.state==='committed'&&!same(a.origin.invoice,original.invoice)))return fail();if(original.invoice.state==='committed'&&pendingInvoice(owner,incomeInvoiceScope(id))){if(!same(pendingInvoice(owner,incomeInvoiceScope(id))?.identity,original.original.identity))return fail();const proof=await recoverCompletedInvoice(c,owner,incomeInvoiceScope(id),original.original.identity.targetKey,current);await verifyInvoiceOwner(c,owner,current);if(!same(proof,incomeInvoiceReceipt(original.invoice,owner)))return fail();}a={version:1,owner,incomeId:id,requestKey:original.requestKey,origin:original,dispatched:true};save(a);return view(a);}
  if(a){if(a.origin!==null)return fail();return view(a);} // Absence cannot settle a delayed reservation or a previously captured origin.
  if(pendingIncomeInvoice(owner,id)){const old=await runIncomeInvoice(c,owner,id,'status',null,current);return old?legacy(old):null;}
  const metadata=await recoverMetadata(c,owner);await verifyInvoiceOwner(c,owner,current);
  if(metadata){if(metadata.intent?.targetId!==id||!metadata.intent.attachment)return fail();return legacy({version:1,owner,incomeId:id,targetKey:metadata.intent.attachment.identity.targetKey,receipt:incomeInvoiceReceipt(metadata.intent.attachment,owner)});}
  if(pendingMetadataBrowser(owner)||pendingInvoice(owner,incomeInvoiceScope(id)))return fail();if(mode!=='upload'||!file)return null;
  const claims=await validateInvoiceSelection(file),source=await invoiceOriginSource(c,owner,id);await verifyInvoiceOwner(c,owner,current);
  a={version:1,owner,incomeId:id,requestKey:crypto.randomUUID(),origin:null,dispatched:false};save(a);
  const reserved=await reserveInvoiceOrigin(c,owner,id,a.requestKey,source,claims);await verifyInvoiceOwner(c,owner,current);if(!same(anchor(owner,id),a))return fail();
  a={...a,origin:reserved,dispatched:true};save(a); // Durable send fence precedes byte transport.
  const proof=await uploadReservedInvoice(c,owner,incomeInvoiceScope(id),reserved.original.identity,file,current);await verifyInvoiceOwner(c,owner,current);
  if(!same(anchor(owner,id),a)||!same(proof.identity,reserved.original.identity))return fail();
  a={...a,origin:originResult({...reserved,invoice:proof},owner,id)};save(a);return view(a);
 });
}

/** A different later original must survive recovery of a historical release. */
export function clearReleasedOriginEvidence(owner:string,id:string,key:string,identity:unknown){
 const a=anchor(owner,id);if(!a||a.requestKey!==key)return;
 if(a.origin&&!same(a.origin.original.identity,identity))return fail();
 localStorage.removeItem(slot(owner,id));if(localStorage.getItem(slot(owner,id))!==null)return fail();
}
