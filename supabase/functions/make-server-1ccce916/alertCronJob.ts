import { planAlertCron, cronObject, cronRows, cronUuid, type JsonRow, type CronPlan } from './alertCronPlan.ts';
import { sameAlertResponse } from './telegram/alertResponseProtocol.ts';
import type { CronRpc } from './telegram/alertCronDelivery.ts';
const keys=(x:unknown,expected:string[]):x is JsonRow=>cronObject(x)&&Object.keys(x).sort().join('|')===[...expected].sort().join('|');
const fail=():never=>{throw Error('Original job proof could not be verified; preserve its reservation.');};
export interface CronRun {id:string;slot:string;actor:JsonRow;reference_at:string;source:JsonRow;state:'prepared'|'committed'|'canceled';plan:CronPlan|null;receipt:JsonRow|null}
export function verifyCronRun(x:unknown,expected:{slot?:string;actor:JsonRow;id?:string}):CronRun {
  if(!keys(x,['id','slot','actor','reference_at','source','state','plan','receipt'])||!cronUuid(x.id)||typeof x.slot!=='string'||!sameAlertResponse(x.actor,expected.actor)||typeof x.reference_at!=='string'||!Number.isFinite(Date.parse(x.reference_at))||!['prepared','committed','canceled'].includes(String(x.state))||(expected.id!==undefined&&x.id!==expected.id)||(expected.slot!==undefined&&x.slot!==expected.slot))return fail();
  if(x.state==='canceled'){if(x.plan!==null||x.receipt!==null)return fail();return x as unknown as CronRun;}
  if(!cronObject(x.source)||!cronObject(x.source.domain))return fail();
  for(const key of ['alerts','animals','events','headers','steps','corrections'])cronRows(x.source.domain[key]);
  for(const key of ['animalsView','config','alertConfig','registrations','profiles','subscriptions'])cronRows(x.source[key]);
  if(x.state==='prepared'&&(x.plan!==null||x.receipt!==null))return fail();
  const run=x as unknown as CronRun;
  if(x.state==='committed'){const plan=planAlertCron(run.source,run.reference_at);if(!sameAlertResponse(x.plan,plan))return fail();verifyCronReceipt(x.receipt,run,plan);}
  return run;
}
export function verifyCronReceipt(x:unknown,run:CronRun,plan:CronPlan):JsonRow {
  if(!keys(x,['version','runId','initiator','executor','recordedAt','source','plan','after','deliveries'])||x.version!==1||x.runId!==run.id||!sameAlertResponse(x.initiator,run.actor)||!sameAlertResponse(x.executor,{origin:'executor',principal:'service_role',job:'hato_alertas_tick'})||typeof x.recordedAt!=='string'||!Number.isFinite(Date.parse(x.recordedAt))||Date.parse(x.recordedAt)<Date.parse(run.reference_at)||!sameAlertResponse(x.source,run.source)||!sameAlertResponse(x.plan,plan)||!cronObject(x.after)||!cronObject(x.after.domain))return fail();
  const source=run.source,domain=source.domain as JsonRow;
  const before=cronRows(domain.alerts),after=cronRows(x.after.domain.alerts);
  const expected=before.map(a=>({...a}));const ids=new Set(expected.map(a=>a.id));
  for(const a of plan.generate){
    const row=after.find(b=>b.regla_clave===a.regla_clave);
    if(!row||!cronUuid(row.id)||ids.has(row.id))return fail();ids.add(row.id);
    expected.push({...a,id:row.id,estado:'pendiente',intentos:0,created_at:x.recordedAt,updated_at:x.recordedAt,created_by:run.actor.profileId??null,respuesta:null,respondida_por:null,destinatario_telegram_id:null,escalada_at:null});
  }
  for(const update of plan.updates){const a=expected.find(a=>a.id===update.id);if(!a)return fail();Object.assign(a,update.patch,{updated_at:x.recordedAt});if(update.patch.estado==='escalada')a.escalada_at=x.recordedAt;}
  const attempted=new Set<string>();
  for(const delivery of plan.deliveries){if(delivery.phase!=='delivery'||attempted.has(delivery.reglaClave))continue;attempted.add(delivery.reglaClave);const a=expected.find(a=>a.regla_clave===delivery.reglaClave);if(!a)return fail();a.intentos=Number(a.intentos)+1;a.updated_at=x.recordedAt;}
  expected.sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  if(!sameAlertResponse(x.after,{...source,domain:{...domain,alerts:expected}}))return fail();
  const rows=cronRows(x.deliveries),seen=new Set<unknown>();
  if(rows.length!==plan.deliveries.length)return fail();
  const unmatched=[...plan.deliveries];
  for(const d of rows){
    if(!keys(d,['id','run_id','alert_id','registration_id','recipient','phase','round','body','context','state','claim_key','claimed_at','result'])||!cronUuid(d.id)||seen.has(d.id)||d.run_id!==run.id||d.state!=='queued'||d.claim_key!==null||d.claimed_at!==null||d.result!==null||!cronObject(d.body)||!cronObject(d.context))return fail();seen.add(d.id);
    const alert=expected.find(a=>a.id===d.alert_id),reg=cronRows(source.registrations).find(a=>a.id===d.registration_id);
    const match=unmatched.findIndex(p=>p.reglaClave===alert?.regla_clave&&p.registrationId===d.registration_id&&p.phase===d.phase&&sameAlertResponse(d.body,{text:p.text,callbackToken:d.id}));
    if(match<0||!alert||!reg||d.recipient!==reg.telegram_id||d.round!==(d.phase==='delivery'?alert.intentos:1))return fail();unmatched.splice(match,1);
    const semantic={...alert};delete semantic.updated_at;delete semantic.intentos;delete semantic.destinatario_telegram_id;
    if(semantic.datos===null)semantic.datos={};
    if(cronObject(semantic.datos)){semantic.datos={...semantic.datos};delete (semantic.datos as JsonRow).enviada_en;}
    if(['pendiente','enviada'].includes(String(semantic.estado)))semantic.estado='delivery_open';
    let clinical:unknown=null;
    if(alert.paso_id!==null){const step=cronRows(domain.steps).find(s=>s.id===alert.paso_id);const header=cronRows(domain.headers).find(h=>h.id===step?.tratamiento_id);if(!header)return fail();clinical={header,steps:cronRows(domain.steps).filter(s=>s.tratamiento_id===header.id)};}
    const context={alert:semantic,animal:cronRows(domain.animals).find(a=>a.id===alert.animal_id)??null,events:cronRows(domain.events).filter(e=>e.animal_id===alert.animal_id),clinical,recipient:{id:reg.id,telegramId:reg.telegram_id,profileId:reg.usuario_id,modules:reg.modulos_permitidos},profile:reg.usuario_id===null?null:((p:JsonRow|undefined)=>p?{id:p.id,activo:p.activo}:null)(cronRows(source.profiles).find(p=>p.id===reg.usuario_id)),config:cronRows(source.alertConfig).find(c=>c.tipo===alert.tipo),subscription:cronRows(source.subscriptions).find(s=>s.telegram_usuario_id===reg.id&&s.alerta_clave==='hato.'+alert.tipo)};
    if(!sameAlertResponse(d.context,context))return fail();
  }
  return x;
}
async function service(c:CronRpc,action:string,key:string|null,payload:unknown=null){const r=await c.rpc('fn_alert_cron_service',{p_action:action,p_key:key,p_payload:payload});if(r.error)throw Error('Original job result unknown; retain reservation.');return r.data;}
/** Never replaces a stale reservation; lost posting recovers only this original job. */
export async function postReservedAlertCron(c:CronRpc,run:CronRun):Promise<JsonRow> {
  if(run.state==='canceled')throw Error('Original job is canceled.');
  const plan=planAlertCron(run.source,run.reference_at);
  if(run.state==='committed')return verifyCronReceipt(run.receipt,run,plan);
  try{return verifyCronReceipt(await service(c,'post',run.id,plan),run,plan);}catch{
    const status=verifyCronRun(await service(c,'status',run.id),{id:run.id,slot:run.slot,actor:run.actor});
    if(!sameAlertResponse(status.source,run.source)||status.reference_at!==run.reference_at)return fail();
    if(status.state!=='committed')throw Error('Original job is unresolved or stale; do not allocate a replacement.');
    return verifyCronReceipt(status.receipt,run,plan);
  }
}
