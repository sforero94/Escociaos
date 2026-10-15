// Pure alert response protocol shared by browser and both edge roots.
export type JsonRow=Record<string,unknown>;
export interface AlertResponseIntent {version:1;alertId:string;respuesta:'si'|'no'|'otro';fecha:string}
export interface AlertResponseAction {sender:number;chatId:number;messageId:number}
export type AlertResponseActor={origin:'web';profileId:string}|{origin:'telegram';registrationId:string;profileId:string|null;sender:number;displayName:string|null};
export interface AlertResponseSnapshot {alert:JsonRow;animal:JsonRow|null;events:JsonRow[];clinical:{animal:JsonRow;header:JsonRow;steps:JsonRow[];alerts:JsonRow[]}|null}
export interface AlertResponseReceipt {version:1;recordedAt:string;requestKey:string;actor:AlertResponseActor;intent:AlertResponseIntent;original:AlertResponseSnapshot;action:AlertResponseAction|null;before:AlertResponseSnapshot;after:AlertResponseSnapshot}
export interface AlertResponseResult {version:1;requestKey:string|null;actor:AlertResponseActor;intent:AlertResponseIntent|null;original:AlertResponseSnapshot|null;action:AlertResponseAction|null;state:'unknown'|'pending'|'committed'|'canceled';receipt:AlertResponseReceipt|null}
export interface AlertResponseClient {rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}>}
const record=(x:unknown):x is JsonRow=>!!x&&typeof x==='object'&&!Array.isArray(x);
const keys=(x:unknown,wanted:string[]):x is JsonRow=>record(x)&&Object.keys(x).sort().join('|')===[...wanted].sort().join('|');
const uuid=(x:unknown):x is string=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x);
const date=(x:unknown):x is string=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString()===x+'T00:00:00.000Z';
const time=(x:unknown):x is string=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(x)&&Number.isFinite(Date.parse(x));
const nullable=(x:unknown,test:(x:unknown)=>boolean)=>x===null||test(x);
const text=(x:unknown)=>typeof x==='string';
const integer=(x:unknown)=>Number.isSafeInteger(x);
function canonical(x:unknown):string{if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';if(record(x))return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';return JSON.stringify(x);}
export const sameAlertResponse=(a:unknown,b:unknown)=>canonical(a)===canonical(b);
const fail=():never=>{throw Error('No pude verificar el intento de respuesta original. Consérvelo; no cree un reemplazo.');};
export function alertResponseIntent(x:unknown):AlertResponseIntent{
 if(!keys(x,['version','alertId','respuesta','fecha'])||x.version!==1||!uuid(x.alertId)||!date(x.fecha)||(typeof x.respuesta!=='string'||!['si','no','otro'].includes(x.respuesta)))return fail();
 return {version:1,alertId:x.alertId,respuesta:x.respuesta as 'si'|'no'|'otro',fecha:x.fecha};
}
export function alertResponseAction(x:unknown):AlertResponseAction{
 if(!keys(x,['sender','chatId','messageId'])||!Number.isSafeInteger(x.sender)||Number(x.sender)<1||x.chatId!==x.sender||!Number.isSafeInteger(x.messageId)||Number(x.messageId)<1)return fail();
 return {sender:Number(x.sender),chatId:Number(x.chatId),messageId:Number(x.messageId)};
}
function actor(x:unknown,owner:string|null,action:AlertResponseAction|null):x is AlertResponseActor{
 if(!record(x))return false;
 if(owner!==null)return uuid(owner)&&keys(x,['origin','profileId'])&&x.origin==='web'&&x.profileId===owner&&action===null;
 return action!==null&&keys(x,['origin','registrationId','profileId','sender','displayName'])&&x.origin==='telegram'&&uuid(x.registrationId)&&nullable(x.profileId,uuid)&&nullable(x.displayName,text)&&x.sender===action.sender;
}
const headerKeys=['id','animal_id','chequeo_id','protocolo_id','nombre','fecha_inicio','estado','nota','created_at','created_by','fuente'];
const stepKeys=['id','tratamiento_id','paso_num','descripcion','offset_dias','fecha_programada','fecha_ejecutada','requiere_confirmacion','created_at'];
const alertKeys=['id','tipo','animal_id','regla_clave','fecha_programada','estado','destinatario_telegram_id','intentos','respuesta','respondida_por','paso_id','datos','escalada_at','created_at','updated_at','created_by'];
const eventKeys=['id','animal_id','tipo','fecha','fecha_confianza','toro_id','tipo_servicio','cria_id','cria_destino','sx_raw','chequeo_vaca_id','alerta_id','transaccion_ganado_id','fuente','datos','created_at','created_by','fin_ingreso_id'];
const animalKeys=['id','numero','nombre','sexo','etapa','raza','estado','fecha_estado','fecha_nacimiento','fecha_nacimiento_confianza','madre_id','padre_toro_id','padre_id','finca_id','origen','confianza','import_meta','notas','created_at','created_by','etapa_forzada'];
function alertRow(a:unknown):a is JsonRow{return keys(a,alertKeys)&&uuid(a.id)&&['secado_due','tratamiento_paso','rechequeo_due','servicio_sin_confirmacion','parto_proximo'].includes(String(a.tipo))&&['pendiente','enviada','respondida','confirmada','descartada','escalada','expirada'].includes(String(a.estado))&&nullable(a.animal_id,uuid)&&nullable(a.paso_id,uuid)&&date(a.fecha_programada)&&text(a.regla_clave)&&integer(a.intentos)&&nullable(a.respuesta,text)&&nullable(a.respondida_por,text)&&nullable(a.destinatario_telegram_id,text)&&nullable(a.created_by,uuid)&&nullable(a.escalada_at,time)&&nullable(a.created_at,time)&&nullable(a.updated_at,time);}
function animalRow(x:unknown):x is JsonRow{return keys(x,animalKeys)&&uuid(x.id)&&nullable(x.numero,integer)&&nullable(x.nombre,text)&&['activa','vendida','muerta','descartada'].includes(String(x.estado))&&['hembra','macho'].includes(String(x.sexo))&&['ternera','novilla','vaca','toro'].includes(String(x.etapa))&&typeof x.etapa_forzada==='boolean'&&['madre_id','padre_toro_id','padre_id','finca_id','created_by'].every(k=>nullable(x[k],uuid))&&['fecha_estado','fecha_nacimiento'].every(k=>nullable(x[k],date))&&['raza','origen','notas','confianza','fecha_nacimiento_confianza'].every(k=>nullable(x[k],text))&&nullable(x.created_at,time);}
function eventRow(x:unknown):x is JsonRow{return keys(x,eventKeys)&&uuid(x.id)&&uuid(x.animal_id)&&date(x.fecha)&&text(x.tipo)&&text(x.fecha_confianza)&&['toro_id','cria_id','chequeo_vaca_id','alerta_id','transaccion_ganado_id','created_by','fin_ingreso_id'].every(k=>nullable(x[k],uuid))&&['tipo_servicio','cria_destino','sx_raw','fuente'].every(k=>nullable(x[k],text))&&nullable(x.created_at,time);}
function clinicalGraph(x:unknown,animal:JsonRow|null,alert:JsonRow):boolean{
 if(!keys(x,['animal','header','steps','alerts'])||!sameAlertResponse(x.animal,animal)||!keys(x.header,headerKeys)||!uuid(x.header.id)||x.header.animal_id!==animal?.id||!Array.isArray(x.steps)||!Array.isArray(x.alerts))return false;
 const h=x.header;if(!date(h.fecha_inicio)||!['activo','completado','cancelado'].includes(String(h.estado))||!['nombre','nota','fuente'].every(k=>nullable(h[k],text))||!['created_by','chequeo_id','protocolo_id'].every(k=>nullable(h[k],uuid))||!nullable(h.created_at,time))return false;
 const ids=new Set<string>(),nums=new Set<unknown>();
 for(const s of x.steps){if(!keys(s,stepKeys)||!uuid(s.id)||s.tratamiento_id!==x.header.id||!integer(s.paso_num)||!integer(s.offset_dias)||!nullable(s.descripcion,text)||!date(s.fecha_programada)||!nullable(s.fecha_ejecutada,date)||typeof s.requiere_confirmacion!=='boolean'||!nullable(s.created_at,time)||ids.has(s.id)||nums.has(s.paso_num))return false;ids.add(s.id);nums.add(s.paso_num);}
 const seen=new Set<unknown>();for(const a of x.alerts){if(!alertRow(a)||!ids.has(String(a.paso_id))||a.animal_id!==animal?.id||seen.has(a.id))return false;seen.add(a.id);}
 return ids.has(String(alert.paso_id))&&x.alerts.some(a=>sameAlertResponse(a,alert));
}
function snapshot(x:unknown,p:AlertResponseIntent,original:boolean):x is AlertResponseSnapshot{
 if(!keys(x,['alert','animal','events','clinical'])||!alertRow(x.alert)||x.alert.id!==p.alertId||!Array.isArray(x.events))return false;
 if(x.alert.animal_id===null?x.animal!==null:!animalRow(x.animal)||x.animal.id!==x.alert.animal_id)return false;
 const seen=new Set<unknown>();for(const e of x.events){if(!eventRow(e)||e.animal_id!==x.alert.animal_id||seen.has(e.id))return false;seen.add(e.id);}
 if(x.alert.tipo==='tratamiento_paso'&&x.alert.paso_id!==null){if(!clinicalGraph(x.clinical,x.animal as JsonRow|null,x.alert))return false;}else if(x.clinical!==null)return false;
 if(original&&(!['pendiente','enviada','escalada','respondida'].includes(String(x.alert.estado))||(x.alert.tipo==='tratamiento_paso'&&p.respuesta==='si')||(x.alert.tipo==='secado_due'&&p.respuesta==='si'&&(!record(x.animal)||x.animal.estado!=='activa'))))return false;
 return true;
}
function receipt(x:unknown,result:AlertResponseResult):x is AlertResponseReceipt{
 if(!keys(x,['version','recordedAt','requestKey','actor','intent','original','action','before','after'])||x.version!==1||!time(x.recordedAt)||x.requestKey!==result.requestKey||!sameAlertResponse(x.actor,result.actor)||!sameAlertResponse(x.intent,result.intent)||!sameAlertResponse(x.action,result.action)||!sameAlertResponse(x.original,result.original)||!sameAlertResponse(x.before,result.original)||!result.intent||!result.original||!snapshot(x.after,result.intent,false))return false;
 const p=result.intent,b=result.original,a=x.after as unknown as AlertResponseSnapshot;
 if(!sameAlertResponse(a.animal,b.animal)||!text(a.alert.respondida_por))return false;
 const expectedAlert={...b.alert,estado:p.respuesta==='si'?'confirmada':'respondida',respuesta:p.respuesta,respondida_por:a.alert.respondida_por,updated_at:x.recordedAt};
 if(!sameAlertResponse(a.alert,expectedAlert))return false;
 const expectedClinical=b.clinical===null?null:{...b.clinical,alerts:b.clinical.alerts.map(v=>v.id===p.alertId?expectedAlert:v)};
 if(!sameAlertResponse(a.clinical,expectedClinical))return false;
 for(const old of b.events)if(!a.events.some(v=>sameAlertResponse(v,old)))return false;
 const additions=a.events.filter(v=>!b.events.some(old=>old.id===v.id)),secado=p.respuesta==='si'&&b.alert.tipo==='secado_due';
 if(a.events.length!==b.events.length+(secado?1:0)||additions.length!==(secado?1:0))return false;
 if(secado){const e=additions[0],expected:JsonRow=Object.fromEntries(eventKeys.map(k=>[k,null]));Object.assign(expected,{id:e.id,animal_id:b.alert.animal_id,tipo:'secado_real',fecha:p.fecha,fecha_confianza:'aproximada',alerta_id:p.alertId,fuente:'alerta',created_at:x.recordedAt,created_by:result.actor.profileId});if(!sameAlertResponse(e,expected))return false;}
 if(result.actor.origin==='telegram'&&a.alert.respondida_por!==(result.actor.displayName??`Telegram ${result.actor.sender}`))return false;
 return true;
}
export function validateAlertResponseResult(x:unknown,owner:string|null,action:AlertResponseAction|null,key:string|null,expectedIntent?:AlertResponseIntent,expectedActor?:AlertResponseActor):AlertResponseResult{
 if(action)alertResponseAction(action);
 if(!keys(x,['version','requestKey','actor','intent','original','action','state','receipt'])||x.version!==1||!sameAlertResponse(x.action,action)||!actor(x.actor,owner,action)||(expectedActor&&!sameAlertResponse(x.actor,expectedActor))||!['unknown','pending','committed','canceled'].includes(String(x.state))||(key!==null&&x.requestKey!==key)||(x.requestKey!==null&&!uuid(x.requestKey))||(x.state!=='unknown'&&!uuid(x.requestKey)))return fail();
 if(x.intent===null||x.original===null){if(x.intent!==null||x.original!==null||!['unknown','canceled'].includes(String(x.state))||x.receipt!==null)return fail();}
 else {const p=alertResponseIntent(x.intent);if(expectedIntent&&!sameAlertResponse(p,expectedIntent)||!snapshot(x.original,p,true))return fail();}
 const result=x as unknown as AlertResponseResult;if(result.state==='committed'){if(!receipt(result.receipt,result))return fail();}else if(result.receipt!==null)return fail();
 if(result.state==='unknown'&&(result.intent!==null||result.original!==null))return fail();return result;
}
async function rpc(client:AlertResponseClient,name:string,args:Record<string,unknown>,owner:string|null,action:AlertResponseAction|null,key:string|null,intent?:AlertResponseIntent,expectedActor?:AlertResponseActor){const r=await client.rpc(name,args);if(r.error)throw Error('Resultado de respuesta desconocido. Verifique el mismo intento antes de repetir.');return validateAlertResponseResult(r.data,owner,action,key,intent,expectedActor);}
export function prepareAlertResponseWeb(client:AlertResponseClient,owner:string,key:string,intent:AlertResponseIntent){if(!uuid(owner)||!uuid(key))return fail();const p=alertResponseIntent(intent);return rpc(client,'fn_alert_response_web',{p_action:'prepare',p_request_key:key,p_intent:p,p_expected_owner:owner},owner,null,key,p);}
export function resolveAlertResponseWeb(client:AlertResponseClient,owner:string,key:string,mode:'status'|'resolve'){if(!uuid(owner)||!uuid(key)||!['status','resolve'].includes(mode))return fail();return rpc(client,'fn_alert_response_web',{p_action:mode,p_request_key:key,p_intent:null,p_expected_owner:owner},owner,null,key);}
export function queryAlertResponseWeb(client:AlertResponseClient,owner:string,attempt:AlertResponseResult,mode:'post'|'status'|'resolve'){if(!['post','status','resolve'].includes(mode))return fail();validateAlertResponseResult(attempt,owner,null,attempt.requestKey);if(!attempt.requestKey||!attempt.intent)return fail();return rpc(client,'fn_alert_response_web',{p_action:mode,p_request_key:attempt.requestKey,p_intent:null,p_expected_owner:owner},owner,null,attempt.requestKey,attempt.intent,attempt.actor);}
export function prepareAlertResponseTelegram(client:AlertResponseClient,action:AlertResponseAction,intent:AlertResponseIntent){const a=alertResponseAction(action),p=alertResponseIntent(intent);return rpc(client,'fn_alert_response_telegram',{p_action:'prepare',p_sender:a.sender,p_chat_id:a.chatId,p_message_id:a.messageId,p_intent:p},null,a,null,p);}
export function queryAlertResponseTelegram(client:AlertResponseClient,action:AlertResponseAction,mode:'post'|'status'|'resolve',attempt?:AlertResponseResult){const a=alertResponseAction(action);if(!['post','status','resolve'].includes(mode))return fail();if(attempt)validateAlertResponseResult(attempt,null,a,attempt.requestKey);return rpc(client,'fn_alert_response_telegram',{p_action:mode,p_sender:a.sender,p_chat_id:a.chatId,p_message_id:a.messageId,p_intent:null},null,a,attempt?.requestKey??null,attempt?.intent??undefined,attempt?.actor);}
