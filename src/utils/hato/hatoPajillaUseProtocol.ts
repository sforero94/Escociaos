import {sameAlertResponse,validAlertResponseAnimal,validAlertResponseEvent,type JsonRow,type AlertResponseClient} from './alertResponseProtocol';
export const samePajillaUse=sameAlertResponse;
export interface PajillaUseIntent {version:1;pajillaId:string;fechaUso:string;animalId:string|null}
export interface PajillaUseGraph {animal:JsonRow;events:JsonRow[];headers:JsonRow[];steps:JsonRow[];alerts:JsonRow[];checks:JsonRow[];checkHeaders:JsonRow[]}
export interface PajillaUseOriginal {lot:JsonRow;toro:JsonRow;graph:PajillaUseGraph|null;uses:JsonRow[];stock:{pajilla_id:string;toro_id:string;cantidad_inicial:number;usos:number;cantidad_actual:number}}
export interface PajillaUseReceipt {version:1;requestKey:string;owner:string;intent:PajillaUseIntent;original:PajillaUseOriginal;plan:JsonRow;effectiveDate:string;actor:{origin:'web';profileId:string};recordedAt:string;after:PajillaUseOriginal;usage:JsonRow}
export interface PajillaUseResult {version:1;requestKey:string;owner:string;state:'unknown'|'pending'|'committed'|'canceled';intent:PajillaUseIntent|null;original:PajillaUseOriginal|null;plan:JsonRow|null;effectiveDate:string|null;receipt:PajillaUseReceipt|null}
export type PajillaUseClient=AlertResponseClient;
const record=(x:unknown):x is JsonRow=>!!x&&typeof x==='object'&&!Array.isArray(x);
const keys=(x:unknown,k:string[]):x is JsonRow=>record(x)&&Object.keys(x).sort().join('|')===[...k].sort().join('|');
const uuid=(x:unknown):x is string=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x);
const date=(x:unknown):x is string=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString()===x+'T00:00:00.000Z';
const timestamp=(x:unknown)=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(x)&&Number.isFinite(Date.parse(x));
const fail=():never=>{throw Error('No pude verificar el uso de pajilla original. Conserve y verifique el mismo intento.');};
export function pajillaUseIntent(x:unknown):PajillaUseIntent{if(!keys(x,['version','pajillaId','fechaUso','animalId'])||x.version!==1||!uuid(x.pajillaId)||!date(x.fechaUso)||(x.animalId!==null&&!uuid(x.animalId)))return fail();return x as unknown as PajillaUseIntent;}
function rows(x:unknown):x is JsonRow[]{return Array.isArray(x)&&x.every(v=>record(v)&&uuid(v.id))&&new Set(x.map(v=>v.id)).size===x.length&&samePajillaUse(x,[...x].sort((a,b)=>String(a.id).localeCompare(String(b.id))));}
function graph(x:unknown,id:string):x is PajillaUseGraph{
 if(!keys(x,['animal','events','headers','steps','alerts','checks','checkHeaders'])||!validAlertResponseAnimal(x.animal)||x.animal.id!==id||x.animal.estado!=='activa'||!['events','headers','steps','alerts','checks','checkHeaders'].every(k=>rows(x[k])))return false;
 const g=x as unknown as PajillaUseGraph;return g.events.every(e=>validAlertResponseEvent(e)&&e.animal_id===id)&&[...g.headers,...g.alerts,...g.checks].every(r=>r.animal_id===id)&&g.steps.every(r=>g.headers.some(h=>h.id===r.tratamiento_id))&&g.checks.every(r=>g.checkHeaders.some(h=>h.id===r.chequeo_id));
}
function usage(x:unknown):x is JsonRow{return keys(x,['id','pajilla_id','animal_id','fecha_uso','created_at','created_by'])&&uuid(x.id)&&uuid(x.pajilla_id)&&(x.animal_id===null||uuid(x.animal_id))&&date(x.fecha_uso)&&(x.created_by===null||uuid(x.created_by))&&(x.created_at===null||timestamp(x.created_at));}
function original(x:unknown,p:PajillaUseIntent):x is PajillaUseOriginal{
 if(!keys(x,['lot','toro','graph','uses','stock'])||!keys(x.lot,['id','toro_id','cantidad_inicial','activa','created_at','created_by'])||x.lot.id!==p.pajillaId||!uuid(x.lot.toro_id)||!Number.isInteger(x.lot.cantidad_inicial)||Number(x.lot.cantidad_inicial)<0||Number(x.lot.cantidad_inicial)>2147483647||typeof x.lot.activa!=='boolean'||(x.lot.created_by!==null&&!uuid(x.lot.created_by))||(x.lot.created_at!==null&&!timestamp(x.lot.created_at))||!keys(x.toro,['id','nombre','tipo','raza','activo','created_at','created_by'])||x.toro.id!==x.lot.toro_id||typeof x.toro.nombre!=='string'||!['monta','inseminacion'].includes(String(x.toro.tipo))||(x.toro.raza!==null&&typeof x.toro.raza!=='string')||typeof x.toro.activo!=='boolean'||(x.toro.created_by!==null&&!uuid(x.toro.created_by))||(x.toro.created_at!==null&&!timestamp(x.toro.created_at))||(p.animalId===null?x.graph!==null:!graph(x.graph,p.animalId))||!rows(x.uses)||!x.uses.every(u=>usage(u)&&u.pajilla_id===p.pajillaId))return false;
 return samePajillaUse(x.stock,{pajilla_id:p.pajillaId,toro_id:x.lot.toro_id,cantidad_inicial:x.lot.cantidad_inicial,usos:x.uses.length,cantidad_actual:Number(x.lot.cantidad_inicial)-x.uses.length});
}
export function expectedPajillaUse(p:PajillaUseIntent,owner:string,id:string):JsonRow{if(!uuid(owner)||!uuid(id))return fail();return {id,pajilla_id:p.pajillaId,animal_id:p.animalId,fecha_uso:p.fechaUso,created_at:null,created_by:owner};}
export function validatePajillaUseResult(x:unknown,owner:string,key:string,intent?:PajillaUseIntent):PajillaUseResult{
 if(!uuid(owner)||!uuid(key)||!keys(x,['version','requestKey','owner','state','intent','original','plan','effectiveDate','receipt'])||x.version!==1||x.requestKey!==key||x.owner!==owner||!['unknown','pending','committed','canceled'].includes(String(x.state)))return fail();
 if(x.intent===null||x.original===null||x.plan===null||x.effectiveDate===null){if(x.intent!==null||x.original!==null||x.plan!==null||x.effectiveDate!==null||!['unknown','canceled'].includes(String(x.state))||x.receipt!==null)return fail();return x as unknown as PajillaUseResult;}
 const p=pajillaUseIntent(x.intent),planValue=x.plan;if((intent&&!samePajillaUse(intent,p))||!date(x.effectiveDate)||p.fechaUso>x.effectiveDate||!original(x.original,p)||!usage(planValue)||x.original.uses.some(u=>u.id===planValue.id)||!samePajillaUse(planValue,expectedPajillaUse(p,owner,String(planValue.id)))||x.state==='unknown')return fail();
 const r=x as unknown as PajillaUseResult;if(r.state!=='committed'){if(r.receipt!==null)return fail();return r;}
 const q=r.receipt,b=r.original!,plan=r.plan!;if(!keys(q,['version','requestKey','owner','intent','original','plan','effectiveDate','actor','recordedAt','after','usage'])||q.version!==1||q.requestKey!==key||q.owner!==owner||!samePajillaUse(q.actor,{origin:'web',profileId:owner})||!samePajillaUse(q.intent,p)||!samePajillaUse(q.original,b)||!samePajillaUse(q.plan,plan)||q.effectiveDate!==r.effectiveDate||!timestamp(q.recordedAt))return fail();
 const posted:JsonRow={...plan,created_at:q.recordedAt};if(!samePajillaUse(q.usage,posted)||!samePajillaUse(q.after,{...b,uses:[...b.uses,posted].sort((a,b)=>String(a.id).localeCompare(String(b.id))),stock:{...b.stock,usos:b.stock.usos+1,cantidad_actual:b.stock.cantidad_actual-1}}))return fail();return r;
}
export async function pajillaUseWeb(c:PajillaUseClient,owner:string,key:string,mode:'prepare'|'post'|'status'|'resolve'|'finish',intent:PajillaUseIntent|null=null,expected?:PajillaUseIntent){
 if(!uuid(owner)||!uuid(key)||!['prepare','post','status','resolve','finish'].includes(mode)||(mode==='prepare'?intent===null:intent!==null))return fail();if(intent)pajillaUseIntent(intent);
 const r=await c.rpc('fn_hato_pajilla_use_web',{p_action:mode,p_request_key:key,p_intent:intent,p_expected_owner:owner});if(r.error)throw Error('Resultado desconocido. Verifique el intento original antes de continuar.');return validatePajillaUseResult(r.data,owner,key,expected??intent??undefined);
}

/** Owner-scoped original recovery is read-only, including after browser storage loss. */
export async function recoverPajillaUseWeb(c:PajillaUseClient,owner:string):Promise<PajillaUseResult|null>{
 if(!uuid(owner))return fail();const r=await c.rpc('fn_hato_pajilla_use_recover_web',{p_expected_owner:owner});if(r.error)throw Error('No pude recuperar el intento original. No cree un reemplazo.');if(r.data===null)return null;
 if(!record(r.data)||!uuid(r.data.requestKey))return fail();const result=validatePajillaUseResult(r.data,owner,r.data.requestKey);if(!['pending','committed'].includes(result.state)||!result.intent)return fail();return result;
}
