import {invoiceRelease,releasePreview,releaseReceipt,type InvoiceReleasePreview,type InvoiceReleaseReceipt} from './hatoIncomeInvoiceReleaseProtocol';
import {recoverInvoiceOrigin} from './hatoIncomeInvoiceOriginProtocol';
import {clearReleasedOriginEvidence} from './hatoIncomeInvoiceOriginBrowserAttempt';
import {incomeInvoiceScope} from './hatoIncomeInvoiceAttempt';
import {verifyInvoiceOwner,clearReleasedInvoiceEvidence,type InvoiceClient,type InvoiceIdentity} from '../invoiceUpload';
import type {MetadataClient} from './hatoIncomeMetadataProtocol';
import {photoKeys as keys,photoSame as same,photoUuid as uuid} from './hatoPhotoUploadProtocol';
export interface InvoiceReleaseAttempt {version:1;owner:string;incomeId:string;preview:InvoiceReleasePreview;receipt:InvoiceReleaseReceipt|null}
const slot=(owner:string,id:string)=>`measured_income_invoice_release_v1:${owner}:${id}`;
const fail=():never=>{throw Error('Conserva la liberación original y consulta su resultado antes de continuar.');};
export function pendingInvoiceRelease(owner:string,id:string):InvoiceReleaseAttempt|null{
 if(!uuid(owner)||!uuid(id))return fail();const raw=localStorage.getItem(slot(owner,id));if(raw===null)return null;
 try{const x=JSON.parse(raw);if(!keys(x,['version','owner','incomeId','preview','receipt'])||x.version!==1||x.owner!==owner||x.incomeId!==id)return fail();const p=releasePreview(x.preview,owner,id);if(p.disposition==='held')return fail();if(x.receipt!==null)releaseReceipt(x.receipt,owner,id,p);return x as unknown as InvoiceReleaseAttempt;}catch{return fail();}
}
function save(x:InvoiceReleaseAttempt){localStorage.setItem(slot(x.owner,x.incomeId),JSON.stringify(x));if(!same(pendingInvoiceRelease(x.owner,x.incomeId),x))return fail();}
export async function runInvoiceRelease(c:InvoiceClient&MetadataClient,owner:string,id:string,action:'preview'|'release'|'recover'|'acknowledge',current:()=>boolean,expected?:InvoiceReleasePreview):Promise<InvoiceReleasePreview|InvoiceReleaseAttempt|null>{
 if(!uuid(owner)||!uuid(id)||!navigator.locks)return fail();
 // Same outer lock as original reservation; shared envelope has its own inner lock.
 return navigator.locks.request(`measured_income_invoice_origin_v1:${owner}:${id}`,{mode:'exclusive'},async()=>{
  await verifyInvoiceOwner(c,owner,current);const local=pendingInvoiceRelease(owner,id);
  if(action==='preview'){
   if(local)return fail();const original=await recoverInvoiceOrigin(c,owner,id);await verifyInvoiceOwner(c,owner,current);if(!original)return fail();const p=await invoiceRelease(c,owner,id,'preview',original.requestKey);await verifyInvoiceOwner(c,owner,current);return p;
  }
  if(action==='acknowledge'){
   if(!local?.receipt||!expected||!same(local.preview,expected))return fail();
   // Re-authenticate and recover the immutable server receipt before any local deletion.
   const proof=await invoiceRelease(c,owner,id,'recover',local.preview.originKey);await verifyInvoiceOwner(c,owner,current);if(!same(proof,local.receipt)||!same(local,pendingInvoiceRelease(owner,id)))return fail();
   await clearReleasedInvoiceEvidence(c,owner,incomeInvoiceScope(id),local.preview.origin.identity as unknown as InvoiceIdentity,current);await verifyInvoiceOwner(c,owner,current);
   if(!same(local,pendingInvoiceRelease(owner,id)))return fail();clearReleasedOriginEvidence(owner,id,local.preview.originKey,local.preview.origin.identity);
   localStorage.removeItem(slot(owner,id));if(localStorage.getItem(slot(owner,id))!==null)return fail();return local;
  }
  if(action==='recover'){
   const receipt=await invoiceRelease(c,owner,id,'recover',local?.preview.originKey);await verifyInvoiceOwner(c,owner,current);
   if(!same(local,pendingInvoiceRelease(owner,id)))return fail();if(!receipt)return local;
   if(local&&!same(receipt.preview,local.preview))return fail();const a:InvoiceReleaseAttempt={version:1,owner,incomeId:id,preview:receipt.preview,receipt};save(a);return a;
  }
  if(!expected||local&&!same(local.preview,expected))return fail();releasePreview(expected,owner,id);if(expected.disposition==='held')return fail();
  const a:InvoiceReleaseAttempt=local??{version:1,owner,incomeId:id,preview:expected,receipt:null};save(a); // Durable original precedes mutation; failure keeps exact recovery key.
  const receipt=await invoiceRelease(c,owner,id,'release',expected.originKey,expected);await verifyInvoiceOwner(c,owner,current);if(!same(a,pendingInvoiceRelease(owner,id)))return fail();const done={...a,receipt};save(done);return done;
 });
}
