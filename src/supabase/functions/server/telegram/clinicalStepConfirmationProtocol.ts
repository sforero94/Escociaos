// Pure clinical confirmation protocol shared by browser and both edge roots.
export type JsonRow=Record<string,unknown>;
export interface ClinicalIntent {version:1;stepId:string;fechaEjecutada:string;alertId:string|null}
export interface ClinicalAction {sender:number;chatId:number;messageId:number}
export type ClinicalActor={origin:'web';profileId:string}|{origin:'telegram';registrationId:string;profileId:string|null;sender:number;displayName:string|null};
export interface ClinicalSnapshot {animal:JsonRow;header:JsonRow;steps:JsonRow[];alerts:JsonRow[]}
export interface ClinicalReceipt {version:1;recordedAt:string;requestKey:string;actor:ClinicalActor;intent:ClinicalIntent;original:ClinicalSnapshot;action:ClinicalAction|null;before:ClinicalSnapshot;after:ClinicalSnapshot}
export interface ClinicalResult {version:1;requestKey:string|null;actor:ClinicalActor;intent:ClinicalIntent|null;original:ClinicalSnapshot|null;action:ClinicalAction|null;state:'unknown'|'pending'|'committed'|'canceled';receipt:ClinicalReceipt|null}
export interface ClinicalClient {rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}>}
const record=(x:unknown):x is JsonRow=>!!x&&typeof x==='object'&&!Array.isArray(x);
const keys=(x:unknown,wanted:string[]):x is JsonRow=>record(x)&&Object.keys(x).sort().join('|')===[...wanted].sort().join('|');
const uuid=(x:unknown):x is string=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x);
const date=(x:unknown):x is string=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString()===x+'T00:00:00.000Z';
const time=(x:unknown):x is string=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(x)&&Number.isFinite(Date.parse(x));
const nullable=(x:unknown,test:(x:unknown)=>boolean)=>x===null||test(x);
const text=(x:unknown)=>typeof x==='string';
const integer=(x:unknown)=>Number.isSafeInteger(x);
function canonical(x:unknown):string{if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';if(record(x))return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';return JSON.stringify(x);}
export const sameClinical=(a:unknown,b:unknown)=>canonical(a)===canonical(b);
const fail=():never=>{throw Error('No pude verificar el intento clínico original. Consérvelo; no cree un reemplazo.');};
export function clinicalIntent(x:unknown):ClinicalIntent{
 if(!keys(x,['version','stepId','fechaEjecutada','alertId'])||x.version!==1||!uuid(x.stepId)||!date(x.fechaEjecutada)||!nullable(x.alertId,uuid))return fail();
 return {version:1,stepId:x.stepId,fechaEjecutada:x.fechaEjecutada,alertId:x.alertId as string|null};
}
export function clinicalAction(x:unknown):ClinicalAction{
 if(!keys(x,['sender','chatId','messageId'])||!Number.isSafeInteger(x.sender)||Number(x.sender)<1||x.chatId!==x.sender||!Number.isSafeInteger(x.messageId)||Number(x.messageId)<1)return fail();
 return {sender:Number(x.sender),chatId:Number(x.chatId),messageId:Number(x.messageId)};
}
function actor(x:unknown,owner:string|null,action:ClinicalAction|null):x is ClinicalActor{
 if(!record(x))return false;
 if(owner!==null)return uuid(owner)&&keys(x,['origin','profileId'])&&x.origin==='web'&&x.profileId===owner&&action===null;
 return action!==null&&keys(x,['origin','registrationId','profileId','sender','displayName'])&&x.origin==='telegram'&&uuid(x.registrationId)&&nullable(x.profileId,uuid)&&nullable(x.displayName,text)&&x.sender===action.sender;
}
const headerKeys=['id','animal_id','chequeo_id','protocolo_id','nombre','fecha_inicio','estado','nota','created_at','created_by','fuente'];
const stepKeys=['id','tratamiento_id','paso_num','descripcion','offset_dias','fecha_programada','fecha_ejecutada','requiere_confirmacion','created_at'];
const alertKeys=['id','tipo','animal_id','regla_clave','fecha_programada','estado','destinatario_telegram_id','intentos','respuesta','respondida_por','paso_id','datos','escalada_at','created_at','updated_at','created_by'];
function snapshot(x:unknown,intent:ClinicalIntent,original:boolean):x is ClinicalSnapshot{
 if(!keys(x,['animal','header','steps','alerts'])||!record(x.animal)||!uuid(x.animal.id)||!nullable(x.animal.numero,integer)||!nullable(x.animal.nombre,text)||!keys(x.header,headerKeys)||!Array.isArray(x.steps)||!Array.isArray(x.alerts))return false;
 const h=x.header;if(!uuid(h.id)||h.animal_id!==x.animal.id||!date(h.fecha_inicio)||!['activo','completado','cancelado'].includes(String(h.estado))||!nullable(h.nombre,text)||!nullable(h.nota,text)||!nullable(h.created_by,uuid)||!nullable(h.chequeo_id,uuid)||!nullable(h.protocolo_id,uuid)||!nullable(h.created_at,time)||!nullable(h.fuente,text))return false;
 const ids=new Set<string>(),nums=new Set<number>();
 for(const s of x.steps){if(!keys(s,stepKeys)||!uuid(s.id)||s.tratamiento_id!==h.id||!integer(s.paso_num)||!integer(s.offset_dias)||!nullable(s.descripcion,text)||!date(s.fecha_programada)||!nullable(s.fecha_ejecutada,date)||typeof s.requiere_confirmacion!=='boolean'||!nullable(s.created_at,time)||ids.has(s.id)||nums.has(Number(s.paso_num)))return false;ids.add(s.id);nums.add(Number(s.paso_num));}
 const selected=x.steps.find(s=>s.id===intent.stepId);if(!selected||(original&&(selected.fecha_ejecutada!==null||h.estado!=='activo'))||intent.fechaEjecutada<h.fecha_inicio)return false;
 const alerts=new Set<string>();for(const a of x.alerts){if(!keys(a,alertKeys)||!uuid(a.id)||!uuid(a.paso_id)||!ids.has(a.paso_id)||a.animal_id!==h.animal_id||alerts.has(a.id)||!date(a.fecha_programada)||!text(a.tipo)||!text(a.estado)||!text(a.regla_clave)||!integer(a.intentos)||!nullable(a.respuesta,text)||!nullable(a.respondida_por,text)||!nullable(a.destinatario_telegram_id,text)||!nullable(a.created_by,uuid)||!nullable(a.escalada_at,time)||!nullable(a.created_at,time)||!nullable(a.updated_at,time))return false;alerts.add(a.id);}
 if(original&&intent.alertId!==null&&!x.alerts.some(a=>a.id===intent.alertId&&a.paso_id===intent.stepId&&a.tipo==='tratamiento_paso'&&['pendiente','enviada','escalada','respondida'].includes(String(a.estado))))return false;
 return true;
}
function receipt(x:unknown,result:ClinicalResult):x is ClinicalReceipt{
 if(!keys(x,['version','recordedAt','requestKey','actor','intent','original','action','before','after'])||x.version!==1||!time(x.recordedAt)||x.requestKey!==result.requestKey||!sameClinical(x.actor,result.actor)||!sameClinical(x.intent,result.intent)||!sameClinical(x.action,result.action)||!sameClinical(x.original,result.original)||!sameClinical(x.before,result.original)||!result.intent||!result.original||!snapshot(x.after,result.intent,false))return false;
 const p=result.intent,b=result.original,a=x.after as unknown as ClinicalSnapshot;
 if(!sameClinical(a.animal,b.animal)||a.steps.length!==b.steps.length||a.alerts.length!==b.alerts.length)return false;
 for(const s of b.steps){const actual=a.steps.find(v=>v.id===s.id);if(!actual||!sameClinical(actual,s.id===p.stepId?{...s,fecha_ejecutada:p.fechaEjecutada}:s))return false;}
 const state=a.steps.some(s=>s.fecha_ejecutada===null)?'activo':'completado';if(!sameClinical(a.header,{...b.header,estado:state}))return false;
 let label:unknown;
 for(const old of b.alerts){const actual=a.alerts.find(v=>v.id===old.id);if(!actual)return false;
  if(old.paso_id===p.stepId&&old.tipo==='tratamiento_paso'&&['pendiente','enviada','escalada','respondida'].includes(String(old.estado))){
   if(!text(actual.respondida_por)||!time(actual.updated_at)||actual.updated_at!==x.recordedAt||(label!==undefined&&label!==actual.respondida_por)||!sameClinical(actual,{...old,estado:'confirmada',respuesta:'si',respondida_por:actual.respondida_por,updated_at:actual.updated_at}))return false;label=actual.respondida_por;
  }else if(!sameClinical(actual,old))return false;
 }
 return true;
}
export function validateClinicalResult(x:unknown,owner:string|null,action:ClinicalAction|null,key:string|null,expectedIntent?:ClinicalIntent,expectedActor?:ClinicalActor):ClinicalResult{
 if(action)clinicalAction(action);
 if(!keys(x,['version','requestKey','actor','intent','original','action','state','receipt'])||x.version!==1||!sameClinical(x.action,action)||!actor(x.actor,owner,action)||(expectedActor&&!sameClinical(x.actor,expectedActor))||!['unknown','pending','committed','canceled'].includes(String(x.state))||(key!==null&&x.requestKey!==key)||(x.requestKey!==null&&!uuid(x.requestKey))||(x.state!=='unknown'&&!uuid(x.requestKey)))return fail();
 if(x.intent===null||x.original===null){if(x.intent!==null||x.original!==null||!['unknown','canceled'].includes(String(x.state))||x.receipt!==null)return fail();}
 else {const p=clinicalIntent(x.intent);if(expectedIntent&&!sameClinical(p,expectedIntent)||!snapshot(x.original,p,true))return fail();}
 const result=x as unknown as ClinicalResult;if(result.state==='committed'){if(!receipt(result.receipt,result))return fail();}else if(result.receipt!==null)return fail();
 if(result.state==='unknown'&&(result.intent!==null||result.original!==null))return fail();return result;
}
async function rpc(client:ClinicalClient,name:string,args:Record<string,unknown>,owner:string|null,action:ClinicalAction|null,key:string|null,intent?:ClinicalIntent,expectedActor?:ClinicalActor){const r=await client.rpc(name,args);if(r.error)throw Error('Resultado clínico desconocido. Verifique el mismo intento antes de repetir.');return validateClinicalResult(r.data,owner,action,key,intent,expectedActor);}
export function prepareClinicalWeb(client:ClinicalClient,owner:string,key:string,intent:ClinicalIntent){if(!uuid(owner)||!uuid(key))return fail();const p=clinicalIntent(intent);return rpc(client,'fn_clinical_step_web',{p_action:'prepare',p_request_key:key,p_intent:p,p_expected_owner:owner},owner,null,key,p);}
export function resolveClinicalWeb(client:ClinicalClient,owner:string,key:string,mode:'status'|'resolve'){if(!uuid(owner)||!uuid(key)||!['status','resolve'].includes(mode))return fail();return rpc(client,'fn_clinical_step_web',{p_action:mode,p_request_key:key,p_intent:null,p_expected_owner:owner},owner,null,key);}
export function queryClinicalWeb(client:ClinicalClient,owner:string,attempt:ClinicalResult,mode:'post'|'status'|'resolve'){if(!['post','status','resolve'].includes(mode))return fail();validateClinicalResult(attempt,owner,null,attempt.requestKey);if(!attempt.requestKey||!attempt.intent)return fail();return rpc(client,'fn_clinical_step_web',{p_action:mode,p_request_key:attempt.requestKey,p_intent:null,p_expected_owner:owner},owner,null,attempt.requestKey,attempt.intent,attempt.actor);}
export function prepareClinicalTelegram(client:ClinicalClient,action:ClinicalAction,intent:ClinicalIntent){const a=clinicalAction(action),p=clinicalIntent(intent);return rpc(client,'fn_clinical_step_telegram',{p_action:'prepare',p_sender:a.sender,p_chat_id:a.chatId,p_message_id:a.messageId,p_intent:p},null,a,null,p);}
export function queryClinicalTelegram(client:ClinicalClient,action:ClinicalAction,mode:'post'|'status'|'resolve',attempt?:ClinicalResult){const a=clinicalAction(action);if(!['post','status','resolve'].includes(mode))return fail();if(attempt)validateClinicalResult(attempt,null,a,attempt.requestKey);return rpc(client,'fn_clinical_step_telegram',{p_action:mode,p_sender:a.sender,p_chat_id:a.chatId,p_message_id:a.messageId,p_intent:null},null,a,attempt?.requestKey??null,attempt?.intent??undefined,attempt?.actor);}
