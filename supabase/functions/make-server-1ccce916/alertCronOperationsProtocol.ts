import {sameAlertResponse} from './telegram/alertResponseProtocol.ts';
export type Row=Record<string,unknown>;
export interface OpsRpc {rpc(name:string,args:Row):PromiseLike<{data:unknown;error:unknown}>}
export const opsSame=sameAlertResponse;
const object=(v:unknown):v is Row=>!!v&&typeof v==='object'&&!Array.isArray(v);
export const opsUuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const keys=(v:unknown,w:string[]):v is Row=>object(v)&&Object.keys(v).sort().join('|')===[...w].sort().join('|');
const time=(v:unknown):v is string=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const digest=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{32}$/.test(v);
const integer=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0;
const fail=():never=>{throw Error('No pude verificar la operación original. Consérvela; no cree un reemplazo.');};
function actor(v:unknown){return keys(v,['origin','profileId'])&&v.origin==='manual'&&opsUuid(v.profileId)||opsSame(v,{origin:'cron',principal:'service_role',job:'hato_alertas_tick'});}
export interface RunSummary extends Row {id:string;slot:string;actor:Row;referenceAt:string;state:'prepared'|'committed'|'canceled';revision:string;sourceChanged:boolean;generated:number;changed:number;replacementId:string|null}
export function opsRun(v:unknown):v is RunSummary{return keys(v,['id','slot','actor','referenceAt','state','revision','sourceChanged','generated','changed','replacementId'])&&opsUuid(v.id)&&typeof v.slot==='string'&&actor(v.actor)&&time(v.referenceAt)&&['prepared','committed','canceled'].includes(String(v.state))&&digest(v.revision)&&typeof v.sourceChanged==='boolean'&&integer(v.generated)&&integer(v.changed)&&(v.replacementId===null||opsUuid(v.replacementId));}
export interface DeliverySummary extends Row {id:string;runId:string;alertId:string;registrationId:string;recipient:number;phase:'delivery'|'escalation';round:number;state:string;claimedAt:string|null;revision:string;evidence:Row|null;acknowledged:boolean}
export function opsDelivery(v:unknown):v is DeliverySummary{return keys(v,['id','runId','alertId','registrationId','recipient','phase','round','state','claimedAt','revision','evidence','acknowledged'])&&['id','runId','alertId','registrationId'].every(k=>opsUuid(v[k]))&&integer(v.recipient)&&Number(v.recipient)>0&&['delivery','escalation'].includes(String(v.phase))&&integer(v.round)&&Number(v.round)>=1&&Number(v.round)<=3&&['queued','sending','sent','rejected','unknown','not_attempted','canceled'].includes(String(v.state))&&(v.claimedAt===null||time(v.claimedAt))&&digest(v.revision)&&typeof v.acknowledged==='boolean'&&(v.evidence===null||keys(v.evidence,['kind','messageId','recordedAt'])&&['accepted_api','original_private_callback'].includes(String(v.evidence.kind))&&integer(v.evidence.messageId)&&Number(v.evidence.messageId)>0&&time(v.evidence.recordedAt));}
export type OpsKind='cancel_run'|'replan_run'|'cancel_delivery'|'acknowledge_hold';
export interface OpsIntent {kind:OpsKind;targetId:string;observed:RunSummary|DeliverySummary;reason:string}
export function opsIntent(v:unknown):OpsIntent{
 if(!keys(v,['kind','targetId','observed','reason'])||!['cancel_run','replan_run','cancel_delivery','acknowledge_hold'].includes(String(v.kind))||!opsUuid(v.targetId)||typeof v.reason!=='string'||v.reason.trim().length<1||v.reason.trim().length>500||(String(v.kind).endsWith('_run')?!opsRun(v.observed):!opsDelivery(v.observed))||(v.observed as Row).id!==v.targetId)return fail();return v as unknown as OpsIntent;
}
export interface OpsResult {version:1;requestKey:string;owner:string;state:'unknown'|'pending'|'committed'|'canceled';intent:OpsIntent|null;original:RunSummary|DeliverySummary|null;receipt:Row|null}
export function validateOps(v:unknown,owner:string,key:string,intent?:OpsIntent):OpsResult{
 if(!keys(v,['version','requestKey','owner','state','intent','original','receipt'])||v.version!==1||!opsUuid(key)||v.requestKey!==key||v.owner!==owner||!opsUuid(owner)||!['unknown','pending','committed','canceled'].includes(String(v.state)))return fail();
 if(v.intent!==null){opsIntent(v.intent);if(intent&&!opsSame(v.intent,intent)||!opsSame(v.original,(v.intent as OpsIntent).observed))return fail();}
 else if(v.original!==null||!['unknown','canceled'].includes(String(v.state)))return fail();
 if(v.state!=='committed'){if(v.receipt!==null)return fail();return v as unknown as OpsResult;}
 const p=v.intent as OpsIntent|null,r=v.receipt;
 if(!p||!keys(r,['version','requestKey','owner','intent','original','after','replacement','recordedAt'])||r.version!==1||r.requestKey!==key||r.owner!==owner||!opsSame(r.intent,p)||!opsSame(r.original,p.observed)||!time(r.recordedAt))return fail();
 const original=p.observed;
 if(p.kind==='cancel_run'||p.kind==='replan_run'){
  if(!opsRun(original)||original.state!=='prepared'||!opsRun(r.after)||r.after.state!=='canceled'||r.after.sourceChanged!==false||!opsSame({...r.after,state:original.state,sourceChanged:original.sourceChanged,revision:original.revision,replacementId:original.replacementId},original))return fail();
  if(p.kind==='replan_run'){
   const n=r.replacement;if(!original.sourceChanged||!opsRun(n)||n.id===original.id||n.slot!=='replan:'+original.id||n.state!=='prepared'||n.sourceChanged||n.generated!==0||n.changed!==0||n.replacementId!==null||!opsSame(n.actor,original.actor)||n.referenceAt!==r.recordedAt||r.after.replacementId!==n.id)return fail();
  }else if(r.replacement!==null||r.after.replacementId!==null)return fail();
 }else{
  if(!opsDelivery(original)||!opsDelivery(r.after)||r.replacement!==null)return fail();
  if(p.kind==='cancel_delivery'){
   if(original.state!=='queued'||original.claimedAt!==null||r.after.state!=='canceled'||!opsSame({...r.after,state:original.state,revision:original.revision},original))return fail();
  }else if(!['sending','unknown'].includes(original.state)||original.evidence!==null||r.after.acknowledged!==true||!opsSame({...r.after,acknowledged:original.acknowledged},original))return fail();
 }
 return v as unknown as OpsResult;
}
function coverage(v:unknown){
 if(!keys(v,['fecha_referencia','animales_evaluados','animales_sin_raza','pasos_tratamiento_evaluados','por_tipo'])||typeof v.fecha_referencia!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v.fecha_referencia)||!['animales_evaluados','animales_sin_raza','pasos_tratamiento_evaluados'].every(k=>integer(v[k]))||!keys(v.por_tipo,['secado_due','tratamiento_paso','rechequeo_due','servicio_sin_confirmacion','parto_proximo']))return false;
 const omissions=['no_activa','sin_historia_reproductiva','sin_ciclo_reproductivo','evento_no_clasificado','sin_servicio_ancla','sin_chequeo','agrupada','fecha_futura','bajo_umbral','ya_generada','silenciada'];
 return Object.values(v.por_tipo).every(t=>keys(t,['generadas','omitidas'])&&integer(t.generadas)&&keys(t.omitidas,omissions)&&Object.values(t.omitidas).every(integer));
}
export interface OpsMonitor {version:1;owner:string;observedAt:string;runs:RunSummary[];metrics:Row[];selectedRun:string|null;deliveries:DeliverySummary[];audit:Row[];operations:OpsResult[];auditMore:boolean;more:boolean;before:{at:string;id:string}|null}
export function validateOpsMonitor(v:unknown,owner:string,selected:string|null):OpsMonitor{
 if(!keys(v,['version','owner','observedAt','runs','metrics','selectedRun','deliveries','audit','auditMore','more','before','operations'])||v.version!==1||v.owner!==owner||!time(v.observedAt)||v.selectedRun!==selected||!Array.isArray(v.runs)||v.runs.length>50||!v.runs.every(opsRun)||new Set(v.runs.map(r=>r.id)).size!==v.runs.length||!Array.isArray(v.deliveries)||v.deliveries.length>1000||!v.deliveries.every(opsDelivery)||new Set(v.deliveries.map(d=>d.id)).size!==v.deliveries.length||v.deliveries.some(d=>d.runId!==selected)||!Array.isArray(v.metrics)||v.metrics.some(m=>!keys(m,['run_id','source_digest','coverage','recorded_at'])||!(v.runs as RunSummary[]).some((r:RunSummary)=>r.id===m.run_id)||!digest(m.source_digest)||!coverage(m.coverage)||!time(m.recorded_at))||!Array.isArray(v.audit)||v.audit.length>200||v.audit.some(a=>!keys(a,['id','objectId','event','actor','recordedAt'])||!opsUuid(a.id)||!opsUuid(a.objectId)||typeof a.event!=='string'||!object(a.actor)||!time(a.recordedAt))||typeof v.more!=='boolean'||typeof v.auditMore!=='boolean'||!(v.before===null||keys(v.before,['at','id'])&&time(v.before.at)&&opsUuid(v.before.id)))return fail();
 if(!Array.isArray(v.operations)||v.operations.length>50)return fail();for(const op of v.operations){if(!object(op)||typeof op.requestKey!=='string')return fail();const validated=validateOps(op,owner,op.requestKey);if(validated.state!=='committed'||validated.intent?.kind!=='replan_run')return fail();}
 if(selected===null&&(v.deliveries.length||v.audit.length)||selected!==null&&v.runs.some(r=>r.id!==selected))return fail();return v as unknown as OpsMonitor;
}
export async function queryOps(c:OpsRpc,owner:string,key:string,mode:'prepare'|'post'|'status'|'cancel',intent:OpsIntent){
 const {data,error}=await c.rpc('fn_alert_cron_operator',{p_action:mode,p_request_key:key,p_intent:mode==='prepare'?opsIntent(intent):null,p_expected_owner:owner});if(error)throw Error('Operación original no verificada. Conserve el intento.');return validateOps(data,owner,key,intent);
}
export async function readOpsMonitor(c:OpsRpc,owner:string,selected:string|null=null,before:OpsMonitor['before']=null){const r=await c.rpc('fn_alert_cron_monitor',{p_owner:owner,p_before:before,p_run:selected});if(r.error)throw Error('No pude verificar las corridas de alertas.');return validateOpsMonitor(r.data,owner,selected);}
