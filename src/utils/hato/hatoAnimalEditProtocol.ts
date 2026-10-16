import {sameAlertResponse,validAlertResponseAnimal,validAlertResponseEvent,type JsonRow,type AlertResponseClient} from './alertResponseProtocol';
export const sameAnimalEdit=sameAlertResponse;
export interface AnimalEditChanges {numero:number|null;nombre:string|null;etapa:'ternera'|'novilla'|'vaca'|'toro';raza:string|null;fecha_nacimiento:string|null;etapa_forzada:boolean;madre_id:string|null;padre_toro_id:string|null}
export interface AnimalEditIntent {version:1;animalId:string;observedAnimal:JsonRow;changes:AnimalEditChanges}
export interface AnimalEditSnapshot {animal:JsonRow;events:JsonRow[];headers:JsonRow[];steps:JsonRow[];alerts:JsonRow[];checks:JsonRow[];checkHeaders:JsonRow[];refs:{mother:JsonRow|null;toro:JsonRow|null}}
export interface AnimalEditReceipt {version:1;requestKey:string;owner:string;intent:AnimalEditIntent;original:AnimalEditSnapshot;effectiveDate:string;actor:{origin:'web';profileId:string};recordedAt:string;after:AnimalEditSnapshot;correction:JsonRow}
export interface AnimalEditResult {version:1;requestKey:string;owner:string;state:'unknown'|'pending'|'committed'|'canceled';intent:AnimalEditIntent|null;original:AnimalEditSnapshot|null;effectiveDate:string|null;receipt:AnimalEditReceipt|null}
export type AnimalEditClient=AlertResponseClient;
const record=(x:unknown):x is JsonRow=>!!x&&typeof x==='object'&&!Array.isArray(x);
const keys=(x:unknown,k:string[]):x is JsonRow=>record(x)&&Object.keys(x).sort().join('|')===[...k].sort().join('|');
const uuid=(x:unknown):x is string=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x);
const date=(x:unknown)=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString()===x+'T00:00:00.000Z';
const fail=():never=>{throw Error('No pude verificar la edición original. Conserve y verifique el mismo intento.');};
export function animalEditIntent(x:unknown):AnimalEditIntent{
 if(!keys(x,['version','animalId','observedAnimal','changes'])||x.version!==1||!uuid(x.animalId)||!validAlertResponseAnimal(x.observedAnimal)||x.observedAnimal.id!==x.animalId||!keys(x.changes,['numero','nombre','etapa','raza','fecha_nacimiento','etapa_forzada','madre_id','padre_toro_id']))return fail();
 const v=x.changes;
 if((v.numero!==null&&(!Number.isInteger(v.numero)||Math.abs(Number(v.numero))>2147483647))||!['ternera','novilla','vaca','toro'].includes(String(v.etapa))||typeof v.etapa_forzada!=='boolean'||['nombre','raza'].some(k=>v[k]!==null&&(typeof v[k]!=='string'||!(v[k] as string).trim()||(v[k] as string).trim()!==v[k]||(v[k] as string).length>4000))||(v.fecha_nacimiento!==null&&!date(v.fecha_nacimiento))||['madre_id','padre_toro_id'].some(k=>v[k]!==null&&!uuid(v[k]))||v.madre_id===x.animalId)return fail();
 return x as unknown as AnimalEditIntent;
}
function rows(x:unknown):x is JsonRow[]{return Array.isArray(x)&&x.every(v=>record(v)&&uuid(v.id))&&new Set(x.map(v=>v.id)).size===x.length&&sameAnimalEdit(x,[...x].sort((a,b)=>String(a.id).localeCompare(String(b.id))));}
function snapshot(x:unknown,p:AnimalEditIntent):x is AnimalEditSnapshot{
 if(!keys(x,['animal','events','headers','steps','alerts','checks','checkHeaders','refs'])||!validAlertResponseAnimal(x.animal)||x.animal.id!==p.animalId||!['events','headers','steps','alerts','checks','checkHeaders'].every(k=>rows(x[k])))return false;
 if(!keys(x.refs,['mother','toro'])||(x.refs.mother!==null&&(!validAlertResponseAnimal(x.refs.mother)||x.refs.mother.id!==p.changes.madre_id))||(x.refs.toro!==null&&(!record(x.refs.toro)||x.refs.toro.id!==p.changes.padre_toro_id))||((x.refs.mother===null)!==(p.changes.madre_id===null))||((x.refs.toro===null)!==(p.changes.padre_toro_id===null)))return false;
 const s=x as unknown as AnimalEditSnapshot;
 return s.events.every(e=>validAlertResponseEvent(e)&&e.animal_id===p.animalId)&&[...s.headers,...s.alerts,...s.checks].every(v=>v.animal_id===p.animalId)&&s.steps.every(v=>s.headers.some(h=>h.id===v.tratamiento_id))&&s.checks.every(v=>s.checkHeaders.some(h=>h.id===v.chequeo_id));
}
export function validateAnimalEditResult(x:unknown,owner:string,key:string,intent?:AnimalEditIntent):AnimalEditResult{
 if(!uuid(owner)||!uuid(key)||!keys(x,['version','requestKey','owner','state','intent','original','effectiveDate','receipt'])||x.version!==1||x.requestKey!==key||x.owner!==owner||!['unknown','pending','committed','canceled'].includes(String(x.state)))return fail();
 if(x.intent===null||x.original===null||x.effectiveDate===null){if(x.intent!==null||x.original!==null||x.effectiveDate!==null||!['unknown','canceled'].includes(String(x.state))||x.receipt!==null)return fail();}
 else{const p=animalEditIntent(x.intent);if((intent&&!sameAnimalEdit(p,intent))||!date(x.effectiveDate)||!snapshot(x.original,p)||!sameAnimalEdit((x.original as unknown as AnimalEditSnapshot).animal,p.observedAnimal)||x.state==='unknown')return fail();}
 const r=x as unknown as AnimalEditResult;
 if(r.state!=='committed'){if(r.receipt!==null)return fail();return r;}
 const q=r.receipt,p=r.intent,b=r.original;
 if(!p||!b||!keys(q,['version','requestKey','owner','intent','original','effectiveDate','actor','recordedAt','after','correction'])||q.version!==1||q.requestKey!==key||q.owner!==owner||q.effectiveDate!==r.effectiveDate||!sameAnimalEdit(q.intent,p)||!sameAnimalEdit(q.original,b)||!sameAnimalEdit(q.actor,{origin:'web',profileId:owner})||typeof q.recordedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(q.recordedAt)||!Number.isFinite(Date.parse(q.recordedAt))||!snapshot(q.after,p))return fail();
 const animal={...b.animal,...p.changes};
 if(!sameAnimalEdit(q.after,{...b,animal}))return fail();
 if(!record(q.correction)||!uuid(q.correction.id)||!sameAnimalEdit(q.correction,{id:q.correction.id,tabla:'hato_animales',fila_id:p.animalId,operacion:'update',datos_anteriores:b.animal,datos_nuevos:animal,animal_id:p.animalId,corregido_por:owner,corregido_en:q.recordedAt,motivo:null}))return fail();
 return r;
}
export async function animalEditWeb(c:AnimalEditClient,owner:string,key:string,mode:'prepare'|'post'|'status'|'resolve',intent:AnimalEditIntent|null=null,expected?:AnimalEditIntent){
 if(!uuid(owner)||!uuid(key)||!['prepare','post','status','resolve'].includes(mode)||(mode==='prepare'?intent===null:intent!==null))return fail();
 if(intent)animalEditIntent(intent);const r=await c.rpc('fn_hato_animal_edit_web',{p_action:mode,p_request_key:key,p_intent:intent,p_expected_owner:owner});
 if(r.error)throw Error('Resultado desconocido. Verifique el intento original antes de continuar.');return validateAnimalEditResult(r.data,owner,key,expected??intent??undefined);
}
