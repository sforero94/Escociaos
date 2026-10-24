import type {IngresoFormData} from '@/types/finanzas';
import {saleCorrectionDraft,sameSaleCorrection,type SaleCorrectionIntent} from './financialSaleCorrectionProtocol';
export function saleCorrectionFromForm(targetId:string,form:IngresoFormData){return saleCorrectionDraft({version:1,kind:'saleFinancial',targetId,fields:{date:form.fecha,businessId:form.negocio_id,categoryId:form.categoria_id,name:form.nombre,regionId:form.region_id,mediumId:form.medio_pago_id,buyerId:form.comprador_id||null,value:String(form.valor)}});}
export function saleCorrectionMatchesForm(targetId:string|undefined,form:IngresoFormData,intent:SaleCorrectionIntent){
 if(targetId!==intent.targetId)return false;
 try{const income=intent.observed.income,fields=saleCorrectionFromForm(targetId,form).fields;return sameSaleCorrection({...fields,value:Number(fields.value)},{...intent.fields,value:Number(intent.fields.value)})&&sameSaleCorrection({observaciones:form.observaciones||null,url_factura:form.url_factura||null,cantidad:form.cantidad??null,precio_unitario:form.precio_unitario??null},{observaciones:income.observaciones,url_factura:income.url_factura,cantidad:income.cantidad,precio_unitario:income.precio_unitario});}catch{return false;}
}
