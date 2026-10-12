// Requires the reviewed catalog candidate and coordinated grants; no DML fallback.
import {csvDecimal,CSV_NUMERIC10,CSV_NUMERIC12,CSV_INTEGER,CSV_PERCENT,CSV_FIELDS} from '../supabase/functions/server/csv-product-import';
export type CatalogRow=Record<string,unknown>;
export interface CatalogPayload {mode:'create'|'edit';product_id:string|null;original:CatalogRow|null;fields:CatalogRow}
export interface CatalogClient {
 auth:{getUser():PromiseLike<{data:{user:{id:string}|null};error:{message:string}|null}>};
 rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:{message:string}|null}>;
}
interface Attempt {owner:string;key:string;payload:CatalogPayload}
export const catalogCanonical=(v:unknown):string=>JSON.stringify(v,(_key,item:unknown)=>item && typeof item==='object' && !Array.isArray(item)
 ? Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))) : item);
const uuid=(v:unknown):v is string=>typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const object=(v:unknown):v is CatalogRow=>!!v && typeof v==='object' && !Array.isArray(v);
const fail=():never=>{throw new Error('No se pudo verificar el producto. Conserve el intento pendiente.');};
const slot=(owner:string,target:string|null)=>`product_catalog_attempt_v1:${owner}:${target??'new'}`;
const columns=[...CSV_FIELDS,'estado','id','created_at','updated_at','updated_by'].sort().join('|');
const fields=[...CSV_FIELDS.filter(k=>k!=='activo'),'estado'];
export function catalogPayload(data:CatalogRow,original:CatalogRow|null):CatalogPayload {
 const edit=original!==null;
 const names=edit?fields.filter(k=>k!=='cantidad_actual'):[...fields,'activo'];
 const v:CatalogRow={};
 for(const k of names) {
  const input=k==='activo'?true:data[k];
  if(input===undefined)throw new Error(`Campo de producto incompleto: ${k}`);
  let value=input===''?null:input;
  if(value!==null && [...CSV_NUMERIC10,...CSV_NUMERIC12,...CSV_INTEGER].includes(k)) {
   if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw new Error(`Valor inválido: ${k}`);
   value=csvDecimal(String(value),CSV_INTEGER.includes(k)?2147483647:CSV_PERCENT.includes(k)?100:CSV_NUMERIC12.includes(k)?9999999999.99:99999999.99,CSV_INTEGER.includes(k));
  }
  v[k]=value;
 }
 if(edit && !uuid(original.id))return fail();
 return {mode:edit?'edit':'create',product_id:edit?String(original.id):null,original:original?JSON.parse(JSON.stringify(original)):null,fields:v};
}
function validPayload(p:CatalogPayload) {
 if(!object(p)||Object.keys(p).sort().join('|')!=='fields|mode|original|product_id'||!object(p.fields)||!['create','edit'].includes(p.mode))return fail();
 if(p.mode==='edit'?(!uuid(p.product_id)||!object(p.original)||p.original.id!==p.product_id):(p.product_id!==null||p.original!==null))return fail();
 // Stored attempts must already contain canonical numeric fields and every UI field.
 const expected=catalogPayload(p.fields,p.original);
 if(catalogCanonical(p)!==catalogCanonical(expected))return fail();
}
export function pendingCatalog(owner:string,target:string|null):Attempt|null {
 const raw=localStorage.getItem(slot(owner,target));if(raw===null)return null;
 try {
  const a=JSON.parse(raw) as Attempt;
  if(!object(a)||Object.keys(a).sort().join('|')!=='key|owner|payload'||a.owner!==owner||!uuid(a.key)||a.payload?.product_id!==target) return fail();
  validPayload(a.payload);return a;
 }catch{return fail();}
}
export function validateCatalogReceipt(data:unknown,a:Attempt):CatalogRow {
 if(!object(data)||Object.keys(data).sort().join('|')!=='actor|audit|movement_id|opening|payload|product|request_key'||data.actor!==a.owner||data.request_key!==a.key
  ||catalogCanonical(data.payload)!==catalogCanonical(a.payload)||!object(data.product)||!uuid(data.product.id)||data.product.updated_by!==a.owner||typeof data.product.updated_at!=='string')return fail();
 const r=data.product;const p=a.payload;
 if(Object.keys(r).sort().join('|')!==columns||!Number.isFinite(Date.parse(String(r.updated_at)))||!Number.isFinite(Date.parse(String(r.created_at)))
  ||(p.mode==='create'&&r.created_at!==r.updated_at))return fail();
 for(const [key,value] of Object.entries(p.fields))if(r[key]!==((p.mode==='create'&&key==='cantidad_actual'&&value===null)?0:value))return fail();
 if(!object(data.audit)||Object.keys(data.audit).sort().join('|')!=='actor|after_row|before_row|created_at|mode|origin|product_id|request_key'||data.audit.actor!==a.owner||data.audit.request_key!==a.key||data.audit.product_id!==r.id||data.audit.mode!==p.mode||data.audit.origin!=='catalog_rpc'
  ||catalogCanonical(data.audit.before_row)!==catalogCanonical(p.original)||catalogCanonical(data.audit.after_row)!==catalogCanonical(r)||data.audit.created_at!==r.updated_at)return fail();
 if(p.mode==='edit') {
  if(r.id!==p.product_id||r.cantidad_actual!==p.original!.cantidad_actual||r.activo!==p.original!.activo||r.created_at!==p.original!.created_at||data.movement_id!==null||data.opening!==null)return fail();
 }else {
  if(!object(data.opening)||Object.keys(data.opening).sort().join('|')!=='actor|movement_id|movement_snapshot|product_id|product_snapshot|quantity_after|quantity_before|request_key'||data.opening.actor!==a.owner||data.opening.request_key!==a.key||data.opening.product_id!==r.id||data.opening.quantity_before!==0||data.opening.quantity_after!==r.cantidad_actual
   ||catalogCanonical(data.opening.product_snapshot)!==catalogCanonical(r)||data.opening.movement_id!==data.movement_id)return fail();
  if(Number(r.cantidad_actual)===0) {if(data.movement_id!==null||data.opening.movement_snapshot!==null)return fail();}
  else if(!uuid(data.movement_id)||!object(data.opening.movement_snapshot)||data.opening.movement_snapshot.id!==data.movement_id
   ||data.opening.movement_snapshot.producto_id!==r.id||data.opening.movement_snapshot.cantidad!==r.cantidad_actual||data.opening.movement_snapshot.saldo_anterior!==0
   ||data.opening.movement_snapshot.saldo_nuevo!==r.cantidad_actual||data.opening.movement_snapshot.tipo_movimiento!=='Entrada'||data.opening.movement_snapshot.valor_movimiento!==null)return fail();
 }
 return data;
}
async function authorize(c:CatalogClient,owner:string,current:()=>boolean) {
 const r=await c.auth.getUser();if(r.error||r.data.user?.id!==owner||!current())throw new Error('La sesión o el formulario cambió. Conserve el intento pendiente.');
}
export async function postCatalog(client:{auth:CatalogClient['auth'];rpc:unknown},owner:string,target:string|null,payload:CatalogPayload|null,action:'post'|'resolve'='post',current:()=>boolean=()=>true):Promise<CatalogRow|null> {
 if(typeof client.rpc!=='function')return fail();
 // The candidate is intentionally absent from generated deployed Database types.
 const c:CatalogClient={auth:client.auth,rpc:(name,args)=>(client.rpc as CatalogClient['rpc']).call(client,name,args)};
 if(!uuid(owner)||!globalThis.navigator?.locks)throw new Error('Use un navegador actualizado con HTTPS para guardar el producto.');
 await authorize(c,owner,current);
 const locks=navigator.locks;
 const a=await locks.request(slot(owner,target),{mode:'exclusive'},()=>{
  const saved=pendingCatalog(owner,target);
  if(saved) {
   if(action==='post'&&(!payload||catalogCanonical(saved.payload)!==catalogCanonical(payload)))throw new Error('Hay un producto pendiente. Verifique el intento original antes de guardar cambios nuevos.');
   return saved;
  }
  if(action==='resolve'||!payload)return fail();
  validPayload(payload);
  if(payload.product_id!==target)return fail();
  const attempt:Attempt={owner,key:crypto.randomUUID(),payload:JSON.parse(JSON.stringify(payload))};
  localStorage.setItem(slot(owner,target),JSON.stringify(attempt));return attempt;
 });
 await authorize(c,owner,current);
 const response=await c.rpc(action==='post'?'fn_product_catalog_post':'fn_product_catalog_status',{p_request_key:a.key,p_payload:a.payload});
 if(response.error)throw new Error(`${response.error.message} Conserve el intento pendiente y verifique su resultado.`);
 let result=response.data;
 if(action==='resolve') {
  if(!object(result)||Object.keys(result).sort().join('|')!=='actor|committed|payload|request_key|result'||result.actor!==owner||result.request_key!==a.key
   ||catalogCanonical(result.payload)!==catalogCanonical(a.payload)||typeof result.committed!=='boolean'||(!result.committed&&result.result!==null))return fail();
  result=result.committed?result.result:null;
 }
 if(result!==null||action==='post')validateCatalogReceipt(result,a);
 await authorize(c,owner,current);
 await locks.request(slot(owner,target),{mode:'exclusive'},()=>{
  if(!current()||catalogCanonical(pendingCatalog(owner,target))!==catalogCanonical(a))return fail();
  localStorage.removeItem(slot(owner,target));
 });
 return result as CatalogRow|null;
}
