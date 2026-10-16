import {sameAlertResponse,type JsonRow,type AlertResponseClient} from './alertResponseProtocol';
import {validDeathSnapshot,type DeathSnapshot} from './hatoDeathProtocol';
export const sameSale=sameAlertResponse;
export interface SalePicker {id:string;numero:number|null;nombre:string|null}
export interface SaleRef {id:string;nombre:string}
export interface SaleIntent {version:1;tipo:'terneros'|'descarte';cabezas:number;valor:string;fecha:string;regionId:string;medioPagoId:string;compradorId:string|null;nombre:string;animals:SalePicker[];refs:{region:SaleRef;medio:SaleRef;comprador:SaleRef|null}}
export interface SaleSnapshot {animals:DeathSnapshot[];refs:{negocio:JsonRow;categoria:JsonRow;region:JsonRow;medio:JsonRow;comprador:JsonRow|null}}
export interface SalePlan {incomeId:string;events:{animalId:string;eventId:string}[]}
export interface SaleReceipt {version:1;requestKey:string;owner:string;intent:SaleIntent;original:SaleSnapshot;plan:SalePlan;actor:{origin:'web';profileId:string};recordedAt:string;income:JsonRow;after:SaleSnapshot;corrections:JsonRow[]}
export interface SaleResult {version:1;requestKey:string;owner:string;state:'unknown'|'pending'|'committed'|'canceled';intent:SaleIntent|null;original:SaleSnapshot|null;plan:SalePlan|null;receipt:SaleReceipt|null}
export type SaleClient=AlertResponseClient;
const record=(x:unknown):x is JsonRow=>!!x&&typeof x==='object'&&!Array.isArray(x);
const keys=(x:unknown,k:string[]):x is JsonRow=>record(x)&&Object.keys(x).sort().join('|')===[...k].sort().join('|');
const uuid=(x:unknown):x is string=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x);
const date=(x:unknown)=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString()===x+'T00:00:00.000Z';
const ref=(x:unknown):x is SaleRef=>keys(x,['id','nombre'])&&uuid(x.id)&&typeof x.nombre==='string';
const picker=(x:unknown):x is SalePicker=>keys(x,['id','numero','nombre'])&&uuid(x.id)&&(x.numero===null||Number.isSafeInteger(x.numero))&&(x.nombre===null||typeof x.nombre==='string');
const fail=():never=>{throw Error('No pude verificar la venta original. Conserve y verifique el mismo intento.');};
export function saleIntent(x:unknown):SaleIntent{
 if(!keys(x,['version','tipo','cabezas','valor','fecha','regionId','medioPagoId','compradorId','nombre','animals','refs'])||x.version!==1||!['terneros','descarte'].includes(String(x.tipo))||!Number.isSafeInteger(x.cabezas)||Number(x.cabezas)<1||Number(x.cabezas)>2147483647||typeof x.valor!=='string'||!/^[1-9][0-9]{0,15}$/.test(x.valor)||!Number.isSafeInteger(Number(x.valor))||!date(x.fecha)||!uuid(x.regionId)||!uuid(x.medioPagoId)||(x.compradorId!==null&&!uuid(x.compradorId))||typeof x.nombre!=='string'||x.nombre.trim()!==x.nombre||x.nombre.length>4000||!Array.isArray(x.animals)||x.animals.length>50||!x.animals.every(picker)||(x.animals.length!==0&&x.animals.length!==x.cabezas)||new Set(x.animals.map(a=>a.id)).size!==x.animals.length||!sameSale(x.animals,[...x.animals].sort((a,b)=>a.id.localeCompare(b.id)))||!keys(x.refs,['region','medio','comprador'])||!ref(x.refs.region)||x.refs.region.id!==x.regionId||!ref(x.refs.medio)||x.refs.medio.id!==x.medioPagoId||(x.compradorId===null?x.refs.comprador!==null:!ref(x.refs.comprador)||x.refs.comprador.id!==x.compradorId))return fail();return x as unknown as SaleIntent;
}
function snapshot(x:unknown,p:SaleIntent,original:boolean):x is SaleSnapshot{
 if(!keys(x,['animals','refs'])||!Array.isArray(x.animals)||x.animals.length!==p.animals.length||!keys(x.refs,['negocio','categoria','region','medio','comprador']))return false;
 for(let i=0;i<p.animals.length;i++){const a=x.animals[i];if(!validDeathSnapshot(a,{animalId:p.animals[i].id})||(original&&(a.animal.estado!=='activa'||!sameSale(Object.fromEntries(['id','numero','nombre'].map(k=>[k,a.animal[k]])),p.animals[i]))))return false;}
 const r=x.refs;if(!record(r.negocio)||!uuid(r.negocio.id)||r.negocio.nombre!=='Hato Lechero'||r.negocio.activo!==true||!record(r.categoria)||!uuid(r.categoria.id)||r.categoria.negocio_id!==r.negocio.id||r.categoria.activo!==true||typeof r.categoria.nombre!=='string'||!r.categoria.nombre.toLowerCase().includes(p.tipo==='terneros'?'ternero':'descarte'))return false;
 for(const k of ['region','medio','comprador'] as const){const a=r[k],b=p.refs[k];if(b===null){if(a!==null)return false;}else if(!record(a)||a.id!==b.id||a.nombre!==b.nombre||a.activo!==true)return false;}return true;
}
export function validateSaleResult(x:unknown,owner:string,key:string,intent?:SaleIntent):SaleResult{
 if(!uuid(owner)||!uuid(key)||!keys(x,['version','requestKey','owner','state','intent','original','plan','receipt'])||x.version!==1||x.requestKey!==key||x.owner!==owner||!['unknown','pending','committed','canceled'].includes(String(x.state)))return fail();
 if(x.intent===null||x.original===null||x.plan===null){if(x.intent!==null||x.original!==null||x.plan!==null||!['unknown','canceled'].includes(String(x.state))||x.receipt!==null)return fail();}
 else{const p=saleIntent(x.intent);if((intent&&!sameSale(p,intent))||!snapshot(x.original,p,true)||!keys(x.plan,['incomeId','events'])||!uuid(x.plan.incomeId)||!Array.isArray(x.plan.events)||x.plan.events.length!==p.animals.length||x.plan.events.some((e,i)=>!keys(e,['animalId','eventId'])||e.animalId!==p.animals[i].id||!uuid(e.eventId))||new Set([x.plan.incomeId,...x.plan.events.map(e=>e.eventId)]).size!==p.animals.length+1||x.state==='unknown')return fail();}
 const r=x as unknown as SaleResult;if(r.state!=='committed'){if(r.receipt!==null)return fail();return r;}
 const q=r.receipt,p=r.intent,b=r.original,plan=r.plan;
 if(!p||!b||!plan||!keys(q,['version','requestKey','owner','intent','original','plan','actor','recordedAt','income','after','corrections'])||q.version!==1||q.requestKey!==key||q.owner!==owner||!sameSale(q.intent,p)||!sameSale(q.original,b)||!sameSale(q.plan,plan)||!sameSale(q.actor,{origin:'web',profileId:owner})||typeof q.recordedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(q.recordedAt)||!Number.isFinite(Date.parse(q.recordedAt))||!snapshot(q.after,p,false)||!Array.isArray(q.corrections)||q.corrections.length!==p.animals.length)return fail();
 const income:JsonRow=Object.fromEntries(['id','fecha','negocio_id','region_id','categoria_id','nombre','comprador_id','valor','medio_pago_id','observaciones','created_at','updated_at','created_by','updated_by','url_factura','cantidad','precio_unitario','cosecha','alianza','cliente','finca','cabezas'].map(k=>[k,null]));
 Object.assign(income,{id:plan.incomeId,fecha:p.fecha,negocio_id:b.refs.negocio.id,region_id:p.regionId,categoria_id:b.refs.categoria.id,nombre:p.nombre||`Venta ${p.tipo} (${p.cabezas} cabezas)`,comprador_id:p.compradorId,valor:Number(p.valor),medio_pago_id:p.medioPagoId,created_at:q.recordedAt,updated_at:q.recordedAt,created_by:owner,cabezas:p.cabezas});if(!sameSale(q.income,income))return fail();
 const after=structuredClone(b);
 for(let i=0;i<b.animals.length;i++){
  const old=b.animals[i],animal={...old.animal,estado:'vendida',fecha_estado:p.fecha},event:JsonRow=Object.fromEntries(['id','animal_id','tipo','fecha','fecha_confianza','toro_id','tipo_servicio','cria_id','cria_destino','sx_raw','chequeo_vaca_id','alerta_id','transaccion_ganado_id','fuente','datos','created_at','created_by','fin_ingreso_id'].map(k=>[k,null]));
  Object.assign(event,{id:plan.events[i].eventId,animal_id:p.animals[i].id,tipo:'venta',fecha:p.fecha,fecha_confianza:'exacta',fin_ingreso_id:plan.incomeId,fuente:'web',datos:{tipo_venta:p.tipo,cabezas_transaccion:p.cabezas,valor_transaccion:Number(p.valor)},created_by:owner,created_at:q.recordedAt});after.animals[i]={...old,animal,events:[...old.events,event].sort((a,b)=>String(a.id).localeCompare(String(b.id)))};
  const c=q.corrections[i];if(!record(c)||!uuid(c.id)||!sameSale(c,{id:c.id,tabla:'hato_animales',fila_id:p.animals[i].id,operacion:'update',datos_anteriores:old.animal,datos_nuevos:animal,animal_id:p.animals[i].id,corregido_por:owner,corregido_en:q.recordedAt,motivo:null}))return fail();
 }
 if(new Set(q.corrections.map(c=>(c as JsonRow).id)).size!==q.corrections.length||!sameSale(q.after,after))return fail();return r;
}
export async function saleWeb(c:SaleClient,owner:string,key:string,mode:'prepare'|'post'|'status'|'resolve',intent:SaleIntent|null=null,expected?:SaleIntent){if(!uuid(owner)||!uuid(key)||!['prepare','post','status','resolve'].includes(mode)||(mode==='prepare'?intent===null:intent!==null))return fail();if(intent)saleIntent(intent);const r=await c.rpc('fn_hato_sale_web',{p_action:mode,p_request_key:key,p_intent:intent,p_expected_owner:owner});if(r.error)throw Error('Resultado de venta desconocido. Verifique el intento original.');return validateSaleResult(r.data,owner,key,expected??intent??undefined);}
