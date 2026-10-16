import {construirNotaReactivacion} from './reactivacionAnimal';
import {sameAlertResponse,validAlertResponseAnimal,validAlertResponseEvent,type JsonRow,type AlertResponseClient} from './alertResponseProtocol';
export const sameReactivation=sameAlertResponse;
export interface ReactivationIntent {version:1;animalId:string;fechaChequeo:string|null;motivo:string;observedCandidate:{id:string;numero:number;nombre:string|null;estado:string}}
export interface ReactivationSnapshot {animal:JsonRow;events:JsonRow[];headers:JsonRow[];steps:JsonRow[];alerts:JsonRow[];checks:JsonRow[];checkHeaders:JsonRow[]}
export interface ReactivationReceipt {version:1;requestKey:string;owner:string;intent:ReactivationIntent;original:ReactivationSnapshot;effectiveDate:string;actor:{origin:'web';profileId:string};recordedAt:string;after:ReactivationSnapshot;correction:JsonRow}
export interface ReactivationResult {version:1;requestKey:string;owner:string;state:'unknown'|'pending'|'committed'|'canceled';intent:ReactivationIntent|null;original:ReactivationSnapshot|null;effectiveDate:string|null;receipt:ReactivationReceipt|null}
export type ReactivationClient=AlertResponseClient;
const record=(x:unknown):x is JsonRow=>!!x&&typeof x==='object'&&!Array.isArray(x);
const keys=(x:unknown,k:string[]):x is JsonRow=>record(x)&&Object.keys(x).sort().join('|')===[...k].sort().join('|');
const uuid=(x:unknown):x is string=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x);
const date=(x:unknown)=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString()===x+'T00:00:00.000Z';
const fail=():never=>{throw Error('No pude verificar la reactivación original. Conserve y verifique el mismo intento.');};
export function reactivationIntent(x:unknown):ReactivationIntent{
 if(!keys(x,['version','animalId','fechaChequeo','motivo','observedCandidate'])||x.version!==1||!uuid(x.animalId)||(x.fechaChequeo!==null&&!date(x.fechaChequeo))||typeof x.motivo!=='string'||x.motivo.trim()!==x.motivo||x.motivo.length>4000||!keys(x.observedCandidate,['id','numero','nombre','estado'])||x.observedCandidate.id!==x.animalId||!Number.isSafeInteger(x.observedCandidate.numero)||(x.observedCandidate.nombre!==null&&typeof x.observedCandidate.nombre!=='string')||!['vendida','muerta','descartada'].includes(String(x.observedCandidate.estado)))return fail();
 return x as unknown as ReactivationIntent;
}
function rows(x:unknown):x is JsonRow[]{return Array.isArray(x)&&x.every(v=>record(v)&&uuid(v.id))&&new Set(x.map(v=>v.id)).size===x.length&&sameReactivation(x,[...x].sort((a,b)=>String(a.id).localeCompare(String(b.id))));}
function snapshot(x:unknown,p:ReactivationIntent):x is ReactivationSnapshot{
 if(!keys(x,['animal','events','headers','steps','alerts','checks','checkHeaders'])||!validAlertResponseAnimal(x.animal)||x.animal.id!==p.animalId||!['events','headers','steps','alerts','checks','checkHeaders'].every(k=>rows(x[k])))return false;
 const s=x as unknown as ReactivationSnapshot;
 return s.events.every(e=>validAlertResponseEvent(e)&&e.animal_id===p.animalId)&&[...s.headers,...s.alerts,...s.checks].every(v=>v.animal_id===p.animalId)&&s.steps.every(v=>s.headers.some(h=>h.id===v.tratamiento_id))&&s.checks.every(v=>s.checkHeaders.some(h=>h.id===v.chequeo_id));
}
export function validateReactivationResult(x:unknown,owner:string,key:string,intent?:ReactivationIntent):ReactivationResult{
 if(!uuid(owner)||!uuid(key)||!keys(x,['version','requestKey','owner','state','intent','original','effectiveDate','receipt'])||x.version!==1||x.requestKey!==key||x.owner!==owner||!['unknown','pending','committed','canceled'].includes(String(x.state)))return fail();
 if(x.intent===null||x.original===null||x.effectiveDate===null){if(x.intent!==null||x.original!==null||x.effectiveDate!==null||!['unknown','canceled'].includes(String(x.state))||x.receipt!==null)return fail();}
 else{const p=reactivationIntent(x.intent);if((intent&&!sameReactivation(p,intent))||!date(x.effectiveDate)||!snapshot(x.original,p)||!sameReactivation(Object.fromEntries(['id','numero','nombre','estado'].map(k=>[k,(x.original as unknown as ReactivationSnapshot).animal[k]])),p.observedCandidate)||x.state==='unknown')return fail();}
 const r=x as unknown as ReactivationResult;
 if(r.state!=='committed'){if(r.receipt!==null)return fail();return r;}
 const q=r.receipt,p=r.intent,b=r.original;
 if(!p||!b||!keys(q,['version','requestKey','owner','intent','original','effectiveDate','actor','recordedAt','after','correction'])||q.version!==1||q.requestKey!==key||q.owner!==owner||q.effectiveDate!==r.effectiveDate||!sameReactivation(q.intent,p)||!sameReactivation(q.original,b)||!sameReactivation(q.actor,{origin:'web',profileId:owner})||typeof q.recordedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(q.recordedAt)||!Number.isFinite(Date.parse(q.recordedAt))||!snapshot(q.after,p))return fail();
 const animal={...b.animal,estado:'activa',fecha_estado:r.effectiveDate,notas:construirNotaReactivacion({notasPrevias:b.animal.notas as string|null,estadoAnterior:String(b.animal.estado),fechaEstadoAnterior:b.animal.fecha_estado as string|null,fechaHoy:r.effectiveDate!,fechaChequeo:p.fechaChequeo,motivo:p.motivo})};
 if(!sameReactivation(q.after,{...b,animal}))return fail();
 if(!record(q.correction)||!uuid(q.correction.id)||!sameReactivation(q.correction,{id:q.correction.id,tabla:'hato_animales',fila_id:p.animalId,operacion:'update',datos_anteriores:b.animal,datos_nuevos:animal,animal_id:p.animalId,corregido_por:owner,corregido_en:q.recordedAt,motivo:null}))return fail();
 return r;
}
export async function reactivationWeb(c:ReactivationClient,owner:string,key:string,mode:'prepare'|'post'|'status'|'resolve',intent:ReactivationIntent|null=null,expected?:ReactivationIntent){
 if(!uuid(owner)||!uuid(key)||!['prepare','post','status','resolve'].includes(mode)||(mode==='prepare'?intent===null:intent!==null))return fail();
 if(intent)reactivationIntent(intent);const r=await c.rpc('fn_hato_reactivation_web',{p_action:mode,p_request_key:key,p_intent:intent,p_expected_owner:owner});
 if(r.error)throw Error('Resultado desconocido. Verifique el intento original antes de continuar.');return validateReactivationResult(r.data,owner,key,expected??intent??undefined);
}
