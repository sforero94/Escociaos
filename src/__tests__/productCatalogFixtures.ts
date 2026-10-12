import {CSV_FIELDS,CSV_BOOLEAN} from '../supabase/functions/server/csv-product-import';
import {catalogPayload,type CatalogPayload,type CatalogRow} from '../utils/productCatalogIntegrity';
import {owner,product,movement} from './purchaseProtocolFixtures';
export function formFields():Record<string,unknown>{const data:Record<string,unknown>=Object.fromEntries([...CSV_FIELDS.filter(k=>k!=='activo'),'estado'].map(k=>[k,CSV_BOOLEAN.includes(k)?false:'']));return {...data,nombre:'Synthetic',categoria:'Fertilizante',grupo:'Agroinsumos',unidad_medida:'Kilos',estado:'OK',cantidad_actual:2.35,permitido_gerencia:null};}
export const timestamp='2026-10-12T15:00:00.123456+00:00';
export function originalRow(){return {...catalogPayload(formFields(),null).fields,id:product,created_at:timestamp,updated_at:timestamp,updated_by:owner};}
export function catalogReceipt(body:Record<string,unknown>){
 const p=body.p_payload as CatalogPayload;
 const row:CatalogRow={...p.original,...p.fields,id:p.product_id??product,created_at:p.original?.created_at??timestamp,updated_at:timestamp,updated_by:owner};
 if(p.mode==='create')row.cantidad_actual=p.fields.cantidad_actual??0;
 const positive=p.mode==='create'&&Number(row.cantidad_actual)>0;
 const movementId=positive?movement:null;
 const opening=p.mode==='create'?{actor:owner,request_key:body.p_request_key,product_id:product,product_snapshot:row,movement_id:movementId,
  movement_snapshot:positive?{id:movement,producto_id:product,cantidad:row.cantidad_actual,saldo_anterior:0,saldo_nuevo:row.cantidad_actual,tipo_movimiento:'Entrada',valor_movimiento:null}:null,quantity_before:0,quantity_after:row.cantidad_actual}:null;
 return {actor:owner,request_key:body.p_request_key,payload:p,product:row,movement_id:movementId,opening,
  audit:{actor:owner,request_key:body.p_request_key,product_id:product,mode:p.mode,origin:'catalog_rpc',before_row:p.original,after_row:row,created_at:timestamp}};
}
export function catalogStatus(body:Record<string,unknown>,committed:boolean){return {actor:owner,request_key:body.p_request_key,payload:body.p_payload,committed,result:committed?catalogReceipt(body):null};}
