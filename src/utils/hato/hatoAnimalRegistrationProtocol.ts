import {sameAlertResponse,validAlertResponseAnimal,type JsonRow,type AlertResponseClient} from './alertResponseProtocol';
export const sameAnimalRegistration=sameAlertResponse;
export interface AnimalRegistrationInput {numero:number|null;nombre:string|null;etapa:'ternera'|'novilla'|'vaca'|'toro';raza:string|null;fecha_nacimiento:string|null;origen:'compra'|'nacimiento'}
export interface AnimalRegistrationIntent {version:1;input:AnimalRegistrationInput}
export interface AnimalRegistrationReceipt {version:1;requestKey:string;owner:string;intent:AnimalRegistrationIntent;original:{animals:JsonRow[]};plan:JsonRow;effectiveDate:string;actor:{origin:'web';profileId:string};recordedAt:string;before:null;after:JsonRow;footprints:{before:string;after:string}}
export interface AnimalRegistrationResult {version:1;requestKey:string;owner:string;state:'unknown'|'pending'|'committed'|'canceled';intent:AnimalRegistrationIntent|null;original:{animals:JsonRow[]}|null;plan:JsonRow|null;effectiveDate:string|null;receipt:AnimalRegistrationReceipt|null;acknowledged:boolean}
export type AnimalRegistrationClient=AlertResponseClient;
const record=(x:unknown):x is JsonRow=>!!x&&typeof x==='object'&&!Array.isArray(x);
const keys=(x:unknown,k:string[]):x is JsonRow=>record(x)&&Object.keys(x).sort().join('|')===[...k].sort().join('|');
const uuid=(x:unknown):x is string=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x);
const date=(x:unknown):x is string=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString()===x+'T00:00:00.000Z';
const fail=():never=>{throw Error('No pude verificar el registro original. Conserve y verifique el mismo intento.');};
export function animalRegistrationIntent(x:unknown):AnimalRegistrationIntent{
 if(!keys(x,['version','input'])||x.version!==1||!keys(x.input,['numero','nombre','etapa','raza','fecha_nacimiento','origen']))return fail();const v=x.input;
 if((v.numero!==null&&(!Number.isInteger(v.numero)||Math.abs(Number(v.numero))>2147483647||(Number(v.numero)>=800&&Number(v.numero)<=999)))||!['ternera','novilla','vaca','toro'].includes(String(v.etapa))||!['compra','nacimiento'].includes(String(v.origen))||['nombre','raza'].some(k=>v[k]!==null&&(typeof v[k]!=='string'||!(v[k] as string).trim()||(v[k] as string).trim()!==v[k]||(v[k] as string).length>4000))||(v.fecha_nacimiento!==null&&!date(v.fecha_nacimiento)))return fail();return x as unknown as AnimalRegistrationIntent;
}
export function expectedAnimalRegistration(p:AnimalRegistrationIntent,owner:string,id:string):JsonRow{
 animalRegistrationIntent(p);if(!uuid(owner)||!uuid(id))return fail();
 return {id,...p.input,sexo:'hembra',estado:'activa',fecha_estado:null,fecha_nacimiento_confianza:'desconocida',madre_id:null,padre_toro_id:null,padre_id:null,finca_id:null,confianza:'alta',import_meta:null,notas:null,created_at:null,created_by:owner,etapa_forzada:false};
}
export function validateAnimalRegistrationResult(x:unknown,owner:string,key:string,intent?:AnimalRegistrationIntent):AnimalRegistrationResult{
 if(!uuid(owner)||!uuid(key)||!keys(x,['version','requestKey','owner','state','intent','original','plan','effectiveDate','receipt','acknowledged'])||x.version!==1||x.owner!==owner||x.requestKey!==key||!['unknown','pending','committed','canceled'].includes(String(x.state))||typeof x.acknowledged!=='boolean'||(x.acknowledged&&!['committed','canceled'].includes(String(x.state))))return fail();
 if(x.intent===null||x.original===null||x.plan===null||x.effectiveDate===null){if(x.intent!==null||x.original!==null||x.plan!==null||x.effectiveDate!==null||!['unknown','canceled'].includes(String(x.state))||x.receipt!==null)return fail();return x as unknown as AnimalRegistrationResult;}
 const p=animalRegistrationIntent(x.intent),b=x.original,planValue=x.plan;
 if((intent&&!sameAnimalRegistration(p,intent))||!date(x.effectiveDate)||x.state==='unknown'||!keys(b,['animals'])||!Array.isArray(b.animals)||!b.animals.every(validAlertResponseAnimal)||new Set(b.animals.map(a=>a.id)).size!==b.animals.length||!sameAnimalRegistration(b.animals,[...b.animals].sort((a,b)=>String(a.id).localeCompare(String(b.id))))||!record(planValue)||!uuid(planValue.id)||b.animals.some(a=>a.id===planValue.id)||!sameAnimalRegistration(planValue,expectedAnimalRegistration(p,owner,planValue.id)))return fail();
 const r=x as unknown as AnimalRegistrationResult;if(r.state!=='committed'){if(r.receipt!==null)return fail();return r;}
 const q=r.receipt;
 if(!keys(q,['version','requestKey','owner','intent','original','plan','effectiveDate','actor','recordedAt','before','after','footprints'])||q.version!==1||q.requestKey!==key||q.owner!==owner||!sameAnimalRegistration(q.intent,p)||!sameAnimalRegistration(q.original,b)||!sameAnimalRegistration(q.plan,r.plan)||q.effectiveDate!==r.effectiveDate||!sameAnimalRegistration(q.actor,{origin:'web',profileId:owner})||q.before!==null||typeof q.recordedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(q.recordedAt)||!Number.isFinite(Date.parse(q.recordedAt))||!sameAnimalRegistration(q.after,{...r.plan,created_at:q.recordedAt})||!keys(q.footprints,['before','after'])||![q.footprints.before,q.footprints.after].every(s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s)))return fail();return r;
}
export async function animalRegistrationWeb(c:AnimalRegistrationClient,owner:string,key:string,mode:'prepare'|'post'|'status'|'resolve'|'acknowledge',intent:AnimalRegistrationIntent|null=null,expected?:AnimalRegistrationResult){
 if(!uuid(owner)||!uuid(key)||!['prepare','post','status','resolve','acknowledge'].includes(mode)||(mode==='prepare'?intent===null:intent!==null))return fail();if(intent)animalRegistrationIntent(intent);
 const r=await c.rpc('fn_hato_animal_registration_web',{p_action:mode,p_request_key:key,p_intent:intent,p_expected_owner:owner});if(r.error)throw Error('Resultado desconocido. Verifique el registro original antes de continuar.');const result=validateAnimalRegistrationResult(r.data,owner,key,expected?.intent??intent??undefined);
 if(expected&&expected.state!=='unknown'&&(!sameAnimalRegistration(result.original,expected.original)||!sameAnimalRegistration(result.plan,expected.plan)||result.effectiveDate!==expected.effectiveDate||(['committed','canceled'].includes(expected.state)&&!sameAnimalRegistration({...result,acknowledged:expected.acknowledged},expected))||(expected.acknowledged&&!result.acknowledged)))return fail();return result;
}
export async function recoverAnimalRegistrationWeb(c:AnimalRegistrationClient,owner:string):Promise<AnimalRegistrationResult|null>{
 if(!uuid(owner))return fail();const r=await c.rpc('fn_hato_animal_registration_recover_web',{p_expected_owner:owner});if(r.error)throw Error('Verifique el registro original antes de continuar.');if(r.data===null)return null;if(!record(r.data)||!uuid(r.data.requestKey))return fail();const result=validateAnimalRegistrationResult(r.data,owner,r.data.requestKey);if(result.acknowledged||!['pending','committed'].includes(result.state))return fail();return result;
}
