/** Pure, unwired treatment protocol. No generated retry key or direct domain CRUD. */
export type JsonRow=Record<string,unknown>;
export interface TreatmentProposal {version:1;animalId:string;nombre:string;fechaInicio:string;nota:string|null;fechaProximoPaso:string|null;descripcionPaso:string|null;observedAnimal:JsonRow}
export interface TelegramTreatmentAction {sender:number;chatId:number;messageId:number}
export interface TreatmentActor {origin:'web'|'telegram';profileId:string|null;registrationId?:string;sender?:number;displayName?:string|null}
export interface TreatmentReceipt {version:1;requestKey:string;actor:TreatmentActor;payload:TreatmentProposal;action:TelegramTreatmentAction|null;before:{animal:JsonRow};after:{header:JsonRow;steps:JsonRow[]}}
export interface TreatmentResult {version:1;requestKey:string|null;actor:TreatmentActor;payload:TreatmentProposal;action:TelegramTreatmentAction|null;state:'pending'|'committed'|'canceled'|'unknown';receipt:TreatmentReceipt|null}
export interface TreatmentAttempt extends TreatmentResult {requestKey:string;state:'pending'|'committed'|'canceled'}
export interface TreatmentClient {rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}>}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const object=(v:unknown):v is JsonRow=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:unknown,names:string[]):v is JsonRow=>object(v)&&Object.keys(v).length===names.length&&names.every(k=>Object.prototype.hasOwnProperty.call(v,k));
const fail=():never=>{throw new Error('Tratamiento no verificable. Conserve la propuesta y el intento original.');};
function same(a:unknown,b:unknown):boolean{
 if(a===b)return true;if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((v,i)=>same(v,b[i]));
 return object(a)&&object(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.prototype.hasOwnProperty.call(b,k)&&same(a[k],b[k]));
}
function jsonValue(v:unknown):boolean{return v===null||typeof v==='string'||typeof v==='boolean'||(typeof v==='number'&&Number.isFinite(v))||(Array.isArray(v)&&v.every(jsonValue))||(object(v)&&Object.getPrototypeOf(v)===Object.prototype&&Object.values(v).every(jsonValue));}
function isoDate(v:unknown):v is string{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;}
function timestamp(v:unknown):v is string{return typeof v==='string'&&Number.isFinite(Date.parse(v))&&/^\d{4}-\d{2}-\d{2}T/.test(v);}
export function canonicalTreatmentProposal(p:TreatmentProposal):TreatmentProposal{
 if(!keys(p,['version','animalId','nombre','fechaInicio','nota','fechaProximoPaso','descripcionPaso','observedAnimal'])||p.version!==1||!uuid(p.animalId)||typeof p.nombre!=='string'||!p.nombre.trim()||!isoDate(p.fechaInicio)||!object(p.observedAnimal)||!jsonValue(p.observedAnimal)||p.observedAnimal.id!==p.animalId)return fail();
 for(const v of [p.nota,p.descripcionPaso])if(v!==null&&typeof v!=='string')return fail();
 if(p.fechaProximoPaso!==null&&(!isoDate(p.fechaProximoPaso)||p.fechaProximoPaso<p.fechaInicio))return fail();
 return JSON.parse(JSON.stringify({...p,nombre:p.nombre.trim(),nota:p.nota?.trim()||null,descripcionPaso:p.descripcionPaso?.trim()||null})) as TreatmentProposal;
}
function actionProof(a:unknown):a is TelegramTreatmentAction{return keys(a,['sender','chatId','messageId'])&&Number.isSafeInteger(a.sender)&&Number(a.sender)>0&&a.chatId===a.sender&&Number.isSafeInteger(a.messageId)&&Number(a.messageId)>0;}
function actorProof(a:unknown,owner:string|null,action:TelegramTreatmentAction|null):a is TreatmentActor{
 if(action)return keys(a,['origin','profileId','registrationId','sender','displayName'])&&a.origin==='telegram'&&uuid(a.registrationId)&&(a.profileId===null||uuid(a.profileId))&&a.sender===action.sender&&(a.displayName===null||typeof a.displayName==='string');
 return keys(a,['origin','profileId'])&&a.origin==='web'&&uuid(owner)&&a.profileId===owner;
}
function receiptProof(r:unknown,result:TreatmentResult):r is TreatmentReceipt{
 if(!keys(r,['version','requestKey','actor','payload','action','before','after'])||r.version!==1||r.requestKey!==result.requestKey||!same(r.actor,result.actor)||!same(r.payload,result.payload)||!same(r.action,result.action)||!keys(r.before,['animal'])||!same(r.before.animal,result.payload.observedAnimal)||!keys(r.after,['header','steps'])||!Array.isArray(r.after.steps))return false;
 const h=r.after.header,p=result.payload;
 if(!keys(h,['id','animal_id','chequeo_id','protocolo_id','nombre','fecha_inicio','estado','nota','created_at','created_by','fuente'])||!uuid(h.id)||h.animal_id!==p.animalId||h.chequeo_id!==null||h.protocolo_id!==null||h.nombre!==p.nombre||h.fecha_inicio!==p.fechaInicio||h.nota!==p.nota||h.fuente!==result.actor.origin||h.created_by!==result.actor.profileId||!timestamp(h.created_at))return false;
 if(p.fechaProximoPaso===null)return h.estado==='completado'&&r.after.steps.length===0;
 if(h.estado!=='activo'||r.after.steps.length!==1)return false;
 const s=r.after.steps[0];return keys(s,['id','tratamiento_id','paso_num','descripcion','offset_dias','fecha_programada','fecha_ejecutada','requiere_confirmacion','created_at'])&&uuid(s.id)&&s.tratamiento_id===h.id&&s.paso_num===1&&s.descripcion===p.descripcionPaso&&s.offset_dias===(Date.parse(p.fechaProximoPaso+'T00:00:00Z')-Date.parse(p.fechaInicio+'T00:00:00Z'))/86400000&&s.fecha_programada===p.fechaProximoPaso&&s.fecha_ejecutada===null&&s.requiere_confirmacion===true&&s.created_at===h.created_at;
}
export function validateTreatmentResult(data:unknown,owner:string|null,proposal:TreatmentProposal,action:TelegramTreatmentAction|null,key:string|null=null,expectedActor?:TreatmentActor):TreatmentResult{
 const p=canonicalTreatmentProposal(proposal);
 if(action&&!actionProof(action))return fail();
 if(!keys(data,['version','requestKey','actor','payload','action','state','receipt'])||data.version!==1||!same(data.payload,p)||!same(data.action,action)||!actorProof(data.actor,owner,action)||(expectedActor&&!same(data.actor,expectedActor))||!['pending','committed','canceled','unknown'].includes(String(data.state))||(key!==null&&data.requestKey!==key)||(data.requestKey!==null&&!uuid(data.requestKey))||(data.state!=='unknown'&&!uuid(data.requestKey)))return fail();
 const result=data as unknown as TreatmentResult;
 if(result.state==='committed'){if(!receiptProof(result.receipt,result))return fail();}else if(result.receipt!==null)return fail();
 return result;
}
async function call(client:TreatmentClient,name:string,args:Record<string,unknown>,owner:string|null,p:TreatmentProposal,action:TelegramTreatmentAction|null,key:string|null,actor?:TreatmentActor){
 const result=await client.rpc(name,args);if(result.error)throw new Error('Resultado de tratamiento desconocido. Conserve el intento original.');return validateTreatmentResult(result.data,owner,p,action,key,actor);
}
export async function prepareWebTreatment(client:TreatmentClient,owner:string,key:string,proposal:TreatmentProposal):Promise<TreatmentAttempt>{
 if(!uuid(owner)||!uuid(key))return fail();const p=canonicalTreatmentProposal(proposal);
 const r=await call(client,'fn_hato_treatment_create_web',{p_action:'prepare',p_request_key:key,p_payload:p,p_expected_owner:owner},owner,p,null,key);if(r.state==='unknown')return fail();return r as TreatmentAttempt;
}
export async function queryWebTreatment(client:TreatmentClient,owner:string,attempt:TreatmentAttempt,action:'post'|'status'|'resolve'):Promise<TreatmentResult>{
 if(!['post','status','resolve'].includes(action))return fail();validateTreatmentResult(attempt,owner,attempt.payload,null,attempt.requestKey);
 return call(client,'fn_hato_treatment_create_web',{p_action:action,p_request_key:attempt.requestKey,p_payload:attempt.payload,p_expected_owner:owner},owner,attempt.payload,null,attempt.requestKey,attempt.actor);
}
export async function prepareTelegramTreatment(client:TreatmentClient,action:TelegramTreatmentAction,proposal:TreatmentProposal):Promise<TreatmentAttempt>{
 if(!actionProof(action))return fail();const p=canonicalTreatmentProposal(proposal);
 const r=await call(client,'fn_hato_treatment_create_telegram',{p_action:'prepare',p_sender:action.sender,p_chat_id:action.chatId,p_message_id:action.messageId,p_payload:p,p_request_key:null},null,p,action,null);if(r.state==='unknown')return fail();return r as TreatmentAttempt;
}
export async function queryTelegramTreatment(client:TreatmentClient,attempt:TreatmentAttempt,action:'post'|'status'|'resolve'):Promise<TreatmentResult>{
 if(!['post','status','resolve'].includes(action)||!attempt.action||!actionProof(attempt.action))return fail();validateTreatmentResult(attempt,null,attempt.payload,attempt.action,attempt.requestKey);
 return call(client,'fn_hato_treatment_create_telegram',{p_action:action,p_sender:attempt.action.sender,p_chat_id:attempt.action.chatId,p_message_id:attempt.action.messageId,p_payload:attempt.payload,p_request_key:attempt.requestKey},null,attempt.payload,attempt.action,attempt.requestKey,attempt.actor);
}
/** Explicit cancellation/status after a lost FIRST prepare uses its original action/payload. */
export async function resolveTelegramTreatmentAction(client:TreatmentClient,action:TelegramTreatmentAction,proposal:TreatmentProposal,mode:'status'|'resolve'):Promise<TreatmentResult>{
 if(!actionProof(action)||!['status','resolve'].includes(mode))return fail();const p=canonicalTreatmentProposal(proposal);
 return call(client,'fn_hato_treatment_create_telegram',{p_action:mode,p_sender:action.sender,p_chat_id:action.chatId,p_message_id:action.messageId,p_payload:p,p_request_key:null},null,p,action,null);
}

/** Recover or cancel a lost first browser prepare using the persisted original key/proposal. */
export async function resolveWebTreatmentKey(client:TreatmentClient,owner:string,key:string,proposal:TreatmentProposal,mode:'status'|'resolve'):Promise<TreatmentResult>{
 if(!uuid(owner)||!uuid(key)||!['status','resolve'].includes(mode))return fail();const p=canonicalTreatmentProposal(proposal);
 return call(client,'fn_hato_treatment_create_web',{p_action:mode,p_request_key:key,p_payload:p,p_expected_owner:owner},owner,p,null,key);
}
