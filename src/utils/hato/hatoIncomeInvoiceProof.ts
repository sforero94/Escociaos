import type {InvoiceReceipt} from '../invoiceUpload';
import {photoKeys as keys,photoUuid as uuid,photoSame as same} from './hatoPhotoUploadProtocol';
export interface IncomeInvoiceCapture {receipt:InvoiceReceipt;storageFingerprint:string;targetGeneration:string}
const fail=():never=>{throw Error('Recibo original de factura no verificable. Conserva el intento.');};
export function incomeInvoiceReceipt(x:unknown,owner?:string):InvoiceReceipt{
 if(!keys(x,['actor','identity','receiptId','path','state','cleanupPending'])||!uuid(x.actor)||owner!==undefined&&x.actor!==owner||!uuid(x.receiptId)||x.state!=='committed'||x.cleanupPending!==false||!keys(x.identity,['requestKey','protocolVersion','targetKey','generation','tipo','sha256','size','mime','extension','sourceExtension']))return fail();
 const i=x.identity;if(!uuid(i.requestKey)||!uuid(i.targetKey)||!uuid(i.generation)||i.protocolVersion!==1||i.tipo!=='venta'||typeof i.sha256!=='string'||!/^[a-f0-9]{64}$/.test(i.sha256)||!Number.isInteger(i.size)||Number(i.size)<1||Number(i.size)>5242880)return fail();
 const formats:Record<string,{extension:string;sources:string[]}>= {'image/jpeg':{extension:'jpg',sources:['jpg','jpeg']},'image/png':{extension:'png',sources:['png']},'image/gif':{extension:'gif',sources:['gif']},'application/pdf':{extension:'pdf',sources:['pdf']}};
 const f=formats[String(i.mime)];if(!f||i.extension!==f.extension||!f.sources.includes(String(i.sourceExtension))||x.path!==`verified/${x.receiptId}.${i.extension}`)return fail();return x as unknown as InvoiceReceipt;
}
export function incomeInvoiceCapture(x:unknown,receipt:InvoiceReceipt):IncomeInvoiceCapture{if(!keys(x,['receipt','storageFingerprint','targetGeneration'])||!same(incomeInvoiceReceipt(x.receipt,receipt.actor),receipt)||typeof x.storageFingerprint!=='string'||!/^[a-f0-9]{64}$/.test(x.storageFingerprint)||x.targetGeneration!==receipt.identity.generation)return fail();return x as unknown as IncomeInvoiceCapture;}
