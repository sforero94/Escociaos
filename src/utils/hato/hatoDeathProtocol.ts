import {sameAlertResponse,validAlertResponseAnimal,validAlertResponseEvent,type JsonRow,type AlertResponseClient} from './alertResponseProtocol';
export const sameDeath=sameAlertResponse;
export interface DeathIntent {version:1;animalId:string;date:string;cause:string;observedAnimal:JsonRow}
export interface DeathSnapshot {animal:JsonRow;events:JsonRow[];headers:JsonRow[];steps:JsonRow[];alerts:JsonRow[];checks:JsonRow[];checkHeaders:JsonRow[]}
export interface DeathReceipt {version:1;requestKey:string;owner:string;intent:DeathIntent;original:DeathSnapshot;eventId:string;actor:{origin:'web';profileId:string};recordedAt:string;after:DeathSnapshot;correction:JsonRow}
export interface DeathResult {version:1;requestKey:string;owner:string;state:'unknown'|'pending'|'committed'|'canceled';intent:DeathIntent|null;original:DeathSnapshot|null;eventId:string|null;receipt:DeathReceipt|null}
export type DeathClient=AlertResponseClient;
const record=(x:unknown):x is JsonRow=>!!x&&typeof x==='object'&&!Array.isArray(x);
const keys=(x:unknown,k:string[]):x is JsonRow=>record(x)&&Object.keys(x).sort().join('|')===[...k].sort().join('|');
const uuid=(x:unknown):x is string=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x);
const date=(x:unknown)=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString()===x+'T00:00:00.000Z';
const fail=():never=>{throw Error('No pude verificar la muerte original. Conserve y verifique el mismo intento.');};
export function deathIntent(x:unknown):DeathIntent{
 if(!keys(x,['version','animalId','date','cause','observedAnimal'])||x.version!==1||!uuid(x.animalId)||!date(x.date)||typeof x.cause!=='string'||x.cause.trim()!==x.cause||x.cause.length>4000||!validAlertResponseAnimal(x.observedAnimal)||x.observedAnimal.id!==x.animalId||x.observedAnimal.estado!=='activa')return fail();
 return x as unknown as DeathIntent;
}
function rows(x:unknown):x is JsonRow[]{return Array.isArray(x)&&x.every(v=>record(v)&&uuid(v.id))&&new Set(x.map(v=>v.id)).size===x.length&&sameDeath(x,[...x].sort((a,b)=>String(a.id).localeCompare(String(b.id))));}
export function validDeathSnapshot(x:unknown,p:Pick<DeathIntent,'animalId'>):x is DeathSnapshot{
 if(!keys(x,['animal','events','headers','steps','alerts','checks','checkHeaders'])||!validAlertResponseAnimal(x.animal)||x.animal.id!==p.animalId||!['events','headers','steps','alerts','checks','checkHeaders'].every(k=>rows(x[k])))return false;
 const s=x as unknown as DeathSnapshot;
 return s.events.every(e=>validAlertResponseEvent(e)&&e.animal_id===p.animalId)&&[...s.headers,...s.alerts,...s.checks].every(v=>v.animal_id===p.animalId)&&s.steps.every(v=>s.headers.some(h=>h.id===v.tratamiento_id))&&s.checks.every(v=>s.checkHeaders.some(h=>h.id===v.chequeo_id));
}
export function validateDeathResult(x:unknown,owner:string,key:string,intent?:DeathIntent):DeathResult{
 if(!uuid(owner)||!uuid(key)||!keys(x,['version','requestKey','owner','state','intent','original','eventId','receipt'])||x.version!==1||x.requestKey!==key||x.owner!==owner||!['unknown','pending','committed','canceled'].includes(String(x.state)))return fail();
 if(x.intent===null||x.original===null||x.eventId===null){if(x.intent!==null||x.original!==null||x.eventId!==null||!['unknown','canceled'].includes(String(x.state))||x.receipt!==null)return fail();}
 else{const p=deathIntent(x.intent);if((intent&&!sameDeath(p,intent))||!uuid(x.eventId)||!validDeathSnapshot(x.original,p)||!sameDeath(x.original.animal,p.observedAnimal)||x.state==='unknown')return fail();}
 const r=x as unknown as DeathResult;
 if(r.state!=='committed'){if(r.receipt!==null)return fail();return r;}
 const q=r.receipt,p=r.intent,b=r.original;
 if(!p||!b||!keys(q,['version','requestKey','owner','intent','original','eventId','actor','recordedAt','after','correction'])||q.version!==1||q.requestKey!==key||q.owner!==owner||q.eventId!==r.eventId||!sameDeath(q.intent,p)||!sameDeath(q.original,b)||!sameDeath(q.actor,{origin:'web',profileId:owner})||typeof q.recordedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(q.recordedAt)||!Number.isFinite(Date.parse(q.recordedAt))||!validDeathSnapshot(q.after,p))return fail();
 const event:JsonRow=Object.fromEntries(['id','animal_id','tipo','fecha','fecha_confianza','toro_id','tipo_servicio','cria_id','cria_destino','sx_raw','chequeo_vaca_id','alerta_id','transaccion_ganado_id','fuente','datos','created_at','created_by','fin_ingreso_id'].map(k=>[k,null]));
 Object.assign(event,{id:r.eventId,animal_id:p.animalId,tipo:'muerte',fecha:p.date,fecha_confianza:'exacta',fuente:'web',datos:p.cause?{causa:p.cause}:null,created_by:owner,created_at:q.recordedAt});
 const animal={...b.animal,estado:'muerta',fecha_estado:p.date};
 if(!sameDeath(q.after,{...b,animal,events:[...b.events,event].sort((a,b)=>String(a.id).localeCompare(String(b.id)))}))return fail();
 if(!record(q.correction)||!uuid(q.correction.id)||!sameDeath(q.correction,{id:q.correction.id,tabla:'hato_animales',fila_id:p.animalId,operacion:'update',datos_anteriores:b.animal,datos_nuevos:animal,animal_id:p.animalId,corregido_por:owner,corregido_en:q.recordedAt,motivo:null}))return fail();
 return r;
}
export async function deathWeb(c:DeathClient,owner:string,key:string,mode:'prepare'|'post'|'status'|'resolve',intent:DeathIntent|null=null,expected?:DeathIntent){
 if(!uuid(owner)||!uuid(key)||!['prepare','post','status','resolve'].includes(mode)||(mode==='prepare'?intent===null:intent!==null))return fail();
 if(intent)deathIntent(intent);const r=await c.rpc('fn_hato_death_web',{p_action:mode,p_request_key:key,p_intent:intent,p_expected_owner:owner});
 if(r.error)throw Error('Resultado desconocido. Verifique el intento original antes de continuar.');return validateDeathResult(r.data,owner,key,expected??intent??undefined);
}
