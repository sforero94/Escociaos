import {recoverMetadata,type MetadataClient} from './hatoIncomeMetadataProtocol';
import {pendingMetadataBrowser} from './hatoIncomeMetadataBrowserAttempt';
import {closeInvoiceTarget,uploadInvoice,pendingInvoice,recoverCompletedInvoice,verifyInvoiceOwner,type InvoiceClient,type InvoiceReceipt} from '../invoiceUpload';
import {incomeInvoiceReceipt} from './hatoIncomeInvoiceProof';
import {photoKeys as keys,photoUuid as uuid,photoSame as same} from './hatoPhotoUploadProtocol';
export interface IncomeInvoiceAttempt {version:1;owner:string;incomeId:string;targetKey:string;receipt:InvoiceReceipt|null}
const slot=(owner:string,id:string)=>`measured_income_invoice_v1:${owner}:${id}`;
export const incomeInvoiceScope=(id:string)=>`measured-income:${id}`;
const fail=():never=>{throw Error('Conserva y consulta la factura original antes de iniciar otra.');};
export function pendingIncomeInvoice(owner:string,id:string):IncomeInvoiceAttempt|null{
 if(!uuid(owner)||!uuid(id))return fail();const raw=localStorage.getItem(slot(owner,id));if(raw===null)return null;
 try{const a=JSON.parse(raw);if(!keys(a,['version','owner','incomeId','targetKey','receipt'])||a.version!==1||a.owner!==owner||a.incomeId!==id||!uuid(a.targetKey))return fail();if(a.receipt!==null&&incomeInvoiceReceipt(a.receipt,owner).identity.targetKey!==a.targetKey)return fail();return a as unknown as IncomeInvoiceAttempt;}catch{return fail();}
}
export async function runIncomeInvoice(c:InvoiceClient & MetadataClient,owner:string,id:string,mode:'upload'|'status',file:File|null,current:()=>boolean):Promise<IncomeInvoiceAttempt|null>{
 if(!uuid(owner)||!uuid(id)||!navigator.locks)return fail();
 return navigator.locks.request(slot(owner,id),{mode:'exclusive'},async()=>{
  await verifyInvoiceOwner(c,owner,current);let a=pendingIncomeInvoice(owner,id);
  if(!a){const original=await recoverMetadata(c,owner);await verifyInvoiceOwner(c,owner,current);if(original){if(original.intent?.targetId!==id||!original.intent.attachment)return fail();const receipt=incomeInvoiceReceipt(original.intent.attachment,owner);a={version:1,owner,incomeId:id,targetKey:receipt.identity.targetKey,receipt};localStorage.setItem(slot(owner,id),JSON.stringify(a));if(!same(pendingIncomeInvoice(owner,id),a))return fail();return a;}if(pendingMetadataBrowser(owner))return fail();if(mode!=='upload'||!file)return null;a={version:1,owner,incomeId:id,targetKey:crypto.randomUUID(),receipt:null};localStorage.setItem(slot(owner,id),JSON.stringify(a));if(!same(pendingIncomeInvoice(owner,id),a))return fail();}
  const before=a;let receipt:InvoiceReceipt|null;
  if(mode==='status'||a.receipt||pendingInvoice(owner,incomeInvoiceScope(id)))receipt=await recoverCompletedInvoice(c,owner,incomeInvoiceScope(id),a.targetKey,current);
  else {if(!file)return fail();receipt=await uploadInvoice(c,owner,incomeInvoiceScope(id),a.targetKey,'venta',file,current);}
  await verifyInvoiceOwner(c,owner,current);if(!same(pendingIncomeInvoice(owner,id),before))return fail();
  if(!receipt)return a;incomeInvoiceReceipt(receipt,owner);if(receipt.identity.targetKey!==a.targetKey)return fail();
  const next={...a,receipt};localStorage.setItem(slot(owner,id),JSON.stringify(next));if(!same(pendingIncomeInvoice(owner,id),next))return fail();return next;
 });
}
export async function releaseIncomeInvoice(owner:string,id:string,receipt:InvoiceReceipt){
 await navigator.locks.request(slot(owner,id),{mode:'exclusive'},()=>{const a=pendingIncomeInvoice(owner,id);if(a&&same(a.receipt,receipt)){if(pendingInvoice(owner,incomeInvoiceScope(id)))return fail();localStorage.removeItem(slot(owner,id));if(pendingIncomeInvoice(owner,id)!==null)return fail();}});
}
export async function cancelIncomeInvoice(c:InvoiceClient,owner:string,id:string,current:()=>boolean){
 return navigator.locks.request(slot(owner,id),{mode:'exclusive'},async()=>{await verifyInvoiceOwner(c,owner,current);const a=pendingIncomeInvoice(owner,id);if(!a)return;await closeInvoiceTarget(c,owner,incomeInvoiceScope(id),a.targetKey,current);await verifyInvoiceOwner(c,owner,current);if(!same(pendingIncomeInvoice(owner,id),a))return fail();localStorage.removeItem(slot(owner,id));if(pendingIncomeInvoice(owner,id)!==null)return fail();});
}
