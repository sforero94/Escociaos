import {sameAlertResponse,validAlertResponseSnapshot,validAlertResponseAnimal,validAlertResponseEvent,type AlertResponseSnapshot,type JsonRow} from './alertResponseProtocol';
import {validClinicalSnapshot,type ClinicalSnapshot} from './clinicalStepConfirmationProtocol';
export const sameAlertManagement=sameAlertResponse;
export type AlertManagementIntent={version:1;kind:'create';tipo:string;animalId:string|null;pasoId:string|null;fechaProgramada:string;nota:string}|{version:1;kind:'edit';alerts:JsonRow[];fechaProgramada:string;nota:string}|{version:1;kind:'discard';alerts:JsonRow[]};
export interface AlertManagementSnapshot {targetId:string|null;targets:AlertResponseSnapshot[];animal:JsonRow|null;clinical:ClinicalSnapshot|null;events:JsonRow[]}
export interface AlertManagementActor {origin:'web';profileId:string}
export interface AlertManagementReceipt {version:1;recordedAt:string;requestKey:string;actor:AlertManagementActor;intent:AlertManagementIntent;original:AlertManagementSnapshot;action:null;before:AlertManagementSnapshot;after:AlertManagementSnapshot}
export interface AlertManagementResult {version:1;requestKey:string;actor:AlertManagementActor;intent:AlertManagementIntent|null;original:AlertManagementSnapshot|null;action:null;state:'unknown'|'pending'|'committed'|'canceled';receipt:AlertManagementReceipt|null}
export interface AlertManagementClient {rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}>}
const record=(x:unknown):x is JsonRow=>!!x&&typeof x==='object'&&!Array.isArray(x);
const keys=(x:unknown,k:string[]):x is JsonRow=>record(x)&&Object.keys(x).sort().join('|')===[...k].sort().join('|');
const uuid=(x:unknown):x is string=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x);
const date=(x:unknown):x is string=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString()===x+'T00:00:00.000Z';
const fail=():never=>{throw Error('No pude verificar la gestión original de alertas. Conserve el intento.');};
export function alertManagementIntent(x:unknown):AlertManagementIntent{
 if(!record(x)||x.version!==1)return fail();
 if(x.kind==='create'){
  if(!keys(x,['version','kind','tipo','animalId','pasoId','fechaProgramada','nota'])||typeof x.tipo!=='string'||!['secado_due','tratamiento_paso','rechequeo_due','servicio_sin_confirmacion','parto_proximo'].includes(String(x.tipo))||(x.tipo==='rechequeo_due'?x.animalId!==null:!uuid(x.animalId))||(x.tipo==='tratamiento_paso'?!uuid(x.pasoId):x.pasoId!==null))return fail();
 }else if(x.kind==='edit'||x.kind==='discard'){
  if(!keys(x,x.kind==='edit'?['version','kind','alerts','fechaProgramada','nota']:['version','kind','alerts'])||!Array.isArray(x.alerts)||x.alerts.length<1||x.alerts.length>50||(x.kind==='edit'&&x.alerts.length!==1)||x.alerts.some(a=>!record(a)||!uuid(a.id))||new Set(x.alerts.map(a=>(a as JsonRow).id)).size!==x.alerts.length||!sameAlertManagement(x.alerts,[...x.alerts].sort((a,b)=>String(a.id).localeCompare(String(b.id)))))return fail();
 }else return fail();
 if(x.kind!=='discard'&&(!date(x.fechaProgramada)||typeof x.nota!=='string'||x.nota.trim()!==x.nota||x.nota.length>4000))return fail();
 return x as unknown as AlertManagementIntent;
}
function snapshot(x:unknown,p:AlertManagementIntent,after:boolean):x is AlertManagementSnapshot{
 if(!keys(x,['targetId','targets','animal','clinical','events'])||!Array.isArray(x.targets)||!x.targets.every(validAlertResponseSnapshot)||!Array.isArray(x.events)||!x.events.every(validAlertResponseEvent)||new Set(x.events.map(e=>e.id)).size!==x.events.length)return false;
 if(p.kind==='create'){
  if(!uuid(x.targetId)||x.targets.length!==(after?1:0)||(p.animalId===null?x.animal!==null:!validAlertResponseAnimal(x.animal)||x.animal.id!==p.animalId))return false;
  if(p.pasoId!==null){if(!record(x.clinical)||!record(x.clinical.header)||!sameAlertManagement(x.clinical.animal,x.animal)||!validClinicalSnapshot(x.clinical,{version:1,stepId:p.pasoId,fechaEjecutada:String(x.clinical.header.fecha_inicio),alertId:null},true))return false;}else if(x.clinical!==null)return false;
  if(x.events.some(e=>e.animal_id!==p.animalId))return false;
  if(after&&(x.targets[0].alert.id!==x.targetId||!sameAlertManagement(x.targets[0].animal,x.animal)||!sameAlertManagement(x.targets[0].clinical,x.clinical)||!sameAlertManagement(x.targets[0].events,x.events)))return false;
 }else{
  if(x.targetId!==null||x.animal!==null||x.clinical!==null||x.events.length!==0||x.targets.length!==p.alerts.length)return false;
  for(let i=0;i<p.alerts.length;i++)if(x.targets[i].alert.id!==p.alerts[i].id||(!after&&!sameAlertManagement(x.targets[i].alert,p.alerts[i])))return false;
 }
 return true;
}
function receipt(x:unknown,r:AlertManagementResult):x is AlertManagementReceipt{
 if(!keys(x,['version','recordedAt','requestKey','actor','intent','original','action','before','after'])||x.version!==1||typeof x.recordedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(x.recordedAt)||!Number.isFinite(Date.parse(x.recordedAt))||x.requestKey!==r.requestKey||x.action!==null||!sameAlertManagement(x.actor,r.actor)||!sameAlertManagement(x.intent,r.intent)||!sameAlertManagement(x.original,r.original)||!sameAlertManagement(x.before,r.original)||!r.intent||!r.original||!snapshot(x.after,r.intent,true))return false;
 const p=r.intent,b=r.original,a=x.after as unknown as AlertManagementSnapshot;
 if(a.targetId!==b.targetId||!sameAlertManagement(a.animal,b.animal)||!sameAlertManagement(a.events,b.events))return false;
 if(p.kind==='create'){
  const expected={id:b.targetId,tipo:p.tipo,animal_id:p.animalId,paso_id:p.pasoId,regla_clave:`manual:${p.tipo}:${p.animalId??'hato'}:${p.fechaProgramada}:${r.requestKey}`,fecha_programada:p.fechaProgramada,estado:'pendiente',intentos:0,destinatario_telegram_id:null,respuesta:null,respondida_por:null,datos:{origen:'manual',...(p.nota?{nota:p.nota}:{})},escalada_at:null,created_at:x.recordedAt,updated_at:x.recordedAt,created_by:r.actor.profileId};
  if(!sameAlertManagement(a.targets[0].alert,expected))return false;
  const clinical=b.clinical===null?null:{...b.clinical,alerts:[...b.clinical.alerts,expected].sort((u,v)=>String(u.id).localeCompare(String(v.id)))};
  return sameAlertManagement(a.clinical,clinical);
 }
 const alerts=b.targets.map((t,i)=>{const expected:JsonRow={...t.alert,updated_at:x.recordedAt};if(p.kind==='edit'){if(t.alert.datos!==null&&!record(t.alert.datos))return null;const datos={...(t.alert.datos as JsonRow??{})};delete datos.nota_gestor;if(p.nota)datos.nota_gestor=p.nota;Object.assign(expected,{fecha_programada:p.fechaProgramada,datos});}else{if(typeof a.targets[i].alert.respondida_por!=='string')return null;Object.assign(expected,{estado:'descartada',respondida_por:a.targets[i].alert.respondida_por});}return expected;});
 if(alerts.some(a=>a===null))return false;
 for(let i=0;i<b.targets.length;i++){
  const old=b.targets[i],clinical=old.clinical===null?null:{...old.clinical,alerts:old.clinical.alerts.map(v=>alerts.find(a=>a!.id===v.id)??v)};
  if(!sameAlertManagement(a.targets[i],{...old,alert:alerts[i],clinical}))return false;
 }
 return true;
}
export function validateAlertManagementResult(x:unknown,owner:string,_action:null,key:string,expectedIntent?:AlertManagementIntent,expectedActor?:AlertManagementActor):AlertManagementResult{
 if(!uuid(owner)||!uuid(key)||!keys(x,['version','requestKey','actor','intent','original','action','state','receipt'])||x.version!==1||x.requestKey!==key||x.action!==null||!keys(x.actor,['origin','profileId'])||x.actor.origin!=='web'||x.actor.profileId!==owner||(expectedActor&&!sameAlertManagement(x.actor,expectedActor))||!['unknown','pending','committed','canceled'].includes(String(x.state)))return fail();
 if(x.intent===null||x.original===null){if(x.intent!==null||x.original!==null||!['unknown','canceled'].includes(String(x.state))||x.receipt!==null)return fail();}
 else{const p=alertManagementIntent(x.intent);if((expectedIntent&&!sameAlertManagement(p,expectedIntent))||!snapshot(x.original,p,false))return fail();}
 const r=x as unknown as AlertManagementResult;if(r.state==='committed'){if(!receipt(r.receipt,r))return fail();}else if(r.receipt!==null)return fail();if(r.state==='unknown'&&r.intent!==null)return fail();return r;
}
async function rpc(c:AlertManagementClient,owner:string,key:string,mode:string,intent:AlertManagementIntent|null,expected?:AlertManagementIntent,actor?:AlertManagementActor){if(!uuid(owner)||!uuid(key))return fail();const r=await c.rpc('fn_alert_management_web',{p_action:mode,p_request_key:key,p_intent:intent,p_expected_owner:owner});if(r.error)throw Error('Resultado de gestión desconocido. Verifique el mismo intento.');return validateAlertManagementResult(r.data,owner,null,key,expected,actor);}
export function prepareAlertManagementWeb(c:AlertManagementClient,o:string,k:string,p:AlertManagementIntent){return rpc(c,o,k,'prepare',alertManagementIntent(p),p);}
export function resolveAlertManagementWeb(c:AlertManagementClient,o:string,k:string,m:'status'|'resolve'){return rpc(c,o,k,m,null);}
export function queryAlertManagementWeb(c:AlertManagementClient,o:string,a:AlertManagementResult,m:'post'|'status'|'resolve'){validateAlertManagementResult(a,o,null,a.requestKey);return rpc(c,o,a.requestKey,m,null,a.intent??undefined,a.actor);}

const alertFields=['id','tipo','animal_id','regla_clave','fecha_programada','estado','destinatario_telegram_id','intentos','respuesta','respondida_por','paso_id','datos','escalada_at','created_at','updated_at','created_by'];
export function observedManagementAlerts(rows:JsonRow[]):JsonRow[]{return rows.map(row=>Object.fromEntries(alertFields.map(k=>[k,row[k]]))).sort((a,b)=>String(a.id).localeCompare(String(b.id)));}
