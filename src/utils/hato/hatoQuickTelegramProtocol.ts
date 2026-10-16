import {sameAlertResponse,validAlertResponseAnimal,validAlertResponseEvent,type JsonRow,type AlertResponseClient} from './alertResponseProtocol';
export const sameQuick=sameAlertResponse;
export interface QuickAction {sender:number;chatId:number;messageId:number}
export interface QuickActor {origin:'telegram';registrationId:string;profileId:string|null;sender:number;displayName:string|null}
export interface QuickIntent {version:1;animalId:string;fecha:string;kind:'monta'|'inseminacion'|'secado'|'aborto';toroId:string|null;pajillaId:string|null;observedAnimal:JsonRow}
export interface QuickGraph {animal:JsonRow;events:JsonRow[];headers:JsonRow[];steps:JsonRow[];alerts:JsonRow[];checks:JsonRow[];checkHeaders:JsonRow[]}
export interface QuickOriginal {graph:QuickGraph;animals:JsonRow[];config:JsonRow[];toros:JsonRow[];lots:JsonRow[];uses:JsonRow[];stock:JsonRow[];view:JsonRow}
export interface QuickPlan {events:JsonRow[];usage:JsonRow|null}
export interface QuickReceipt {version:1;requestKey:string;actor:QuickActor;action:QuickAction;intent:QuickIntent;original:QuickOriginal;plan:QuickPlan;effectiveDate:string;recordedAt:string;after:QuickGraph;usage:JsonRow|null}
export interface QuickResult {version:1;requestKey:string|null;actor:QuickActor;action:QuickAction;state:'unknown'|'pending'|'committed'|'canceled';intent:QuickIntent|null;original:QuickOriginal|null;plan:QuickPlan|null;effectiveDate:string|null;receipt:QuickReceipt|null}
export type QuickClient=AlertResponseClient;
const record=(x:unknown):x is JsonRow=>!!x&&typeof x==='object'&&!Array.isArray(x);
const keys=(x:unknown,k:string[]):x is JsonRow=>record(x)&&Object.keys(x).sort().join('|')===[...k].sort().join('|');
const uuid=(x:unknown):x is string=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x);
const date=(x:unknown)=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString()===x+'T00:00:00.000Z';
const fail=():never=>{throw Error('No pude verificar el evento original. Conserve el mensaje privado original.');};
export function quickAction(x:unknown):QuickAction{if(!keys(x,['sender','chatId','messageId'])||!Number.isSafeInteger(x.sender)||Number(x.sender)<1||x.chatId!==x.sender||!Number.isSafeInteger(x.messageId)||Number(x.messageId)<1)return fail();return x as unknown as QuickAction;}
export function quickIntent(x:unknown):QuickIntent{if(!keys(x,['version','animalId','fecha','kind','toroId','pajillaId','observedAnimal'])||x.version!==1||!uuid(x.animalId)||!date(x.fecha)||!['monta','inseminacion','secado','aborto'].includes(String(x.kind))||(['monta','inseminacion'].includes(String(x.kind))?!uuid(x.toroId):x.toroId!==null)||(x.pajillaId!==null&&(x.kind!=='inseminacion'||!uuid(x.pajillaId)))||!validAlertResponseAnimal(x.observedAnimal)||x.observedAnimal.id!==x.animalId||x.observedAnimal.estado!=='activa')return fail();return x as unknown as QuickIntent;}

function rows(x:unknown):x is JsonRow[]{return Array.isArray(x)&&x.every(v=>record(v)&&uuid(v.id))&&new Set(x.map(v=>v.id)).size===x.length&&sameQuick(x,[...x].sort((a,b)=>String(a.id).localeCompare(String(b.id))));}
function graph(x:unknown,id:string):x is QuickGraph{
 if(!keys(x,['animal','events','headers','steps','alerts','checks','checkHeaders'])||!validAlertResponseAnimal(x.animal)||x.animal.id!==id||!['events','headers','steps','alerts','checks','checkHeaders'].every(k=>rows(x[k])))return false;const g=x as unknown as QuickGraph;
 return g.events.every(e=>validAlertResponseEvent(e)&&e.animal_id===id)&&[...g.headers,...g.alerts,...g.checks].every(r=>r.animal_id===id)&&g.steps.every(r=>g.headers.some(h=>h.id===r.tratamiento_id))&&g.checks.every(r=>g.checkHeaders.some(h=>h.id===r.chequeo_id));
}
export function expectedQuickPlan(p:QuickIntent,b:QuickOriginal,ids:{event:string;usage:string|null},actor:QuickActor):QuickPlan{
 if(!uuid(ids.event)||b.graph.events.some(e=>e.id===ids.event))return fail();let usage:JsonRow|null=null;
 if(p.toroId&&!b.toros.some(t=>t.id===p.toroId&&t.activo===true&&t.tipo===p.kind))return fail();
 if(p.pajillaId){
  if(!uuid(ids.usage)||ids.usage===ids.event||b.uses.some(a=>a.id===ids.usage)||!b.lots.some(l=>l.id===p.pajillaId&&l.toro_id===p.toroId&&l.activa===true))return fail();
  usage={id:ids.usage,pajilla_id:p.pajillaId,animal_id:p.animalId,fecha_uso:p.fecha,created_at:null,created_by:actor.profileId};
 }else if(ids.usage!==null)return fail();
 const e={...Object.fromEntries(['id','animal_id','tipo','fecha','fecha_confianza','toro_id','tipo_servicio','cria_id','cria_destino','sx_raw','chequeo_vaca_id','alerta_id','transaccion_ganado_id','fin_ingreso_id','fuente','datos','created_at','created_by'].map(k=>[k,null])),id:ids.event,animal_id:p.animalId,tipo:p.kind==='monta'||p.kind==='inseminacion'?'servicio':p.kind==='secado'?'secado_real':'aborto',tipo_servicio:p.kind==='monta'||p.kind==='inseminacion'?p.kind:null,toro_id:p.toroId,fecha:p.fecha,fecha_confianza:'exacta',fuente:'telegram',datos:{origen:'telegram',registrado_por:actor.displayName,...(usage?{pajilla_uso_id:usage.id}:{})},created_by:actor.profileId};return {events:[e],usage};
}
export function validateQuickResult(x:unknown,action:QuickAction,intent?:QuickIntent,expectedActor?:QuickActor):QuickResult{
 quickAction(action);if(!keys(x,['version','requestKey','actor','action','state','intent','original','plan','effectiveDate','receipt'])||x.version!==1||!sameQuick(x.action,action)||!keys(x.actor,['origin','registrationId','profileId','sender','displayName'])||x.actor.origin!=='telegram'||!uuid(x.actor.registrationId)||(x.actor.profileId!==null&&!uuid(x.actor.profileId))||x.actor.sender!==action.sender||(x.actor.displayName!==null&&typeof x.actor.displayName!=='string')||(expectedActor&&!sameQuick(x.actor,expectedActor))||!['unknown','pending','committed','canceled'].includes(String(x.state))||(x.state==='unknown'?x.requestKey!==null:!uuid(x.requestKey)))return fail();
 if(x.intent===null||x.original===null||x.plan===null||x.effectiveDate===null){if(x.intent!==null||x.original!==null||x.plan!==null||x.effectiveDate!==null||!['unknown','canceled'].includes(String(x.state))||x.receipt!==null)return fail();return x as unknown as QuickResult;}
 const p=quickIntent(x.intent),b=x.original;if((intent&&!sameQuick(p,intent))||!date(x.effectiveDate)||p.fecha>String(x.effectiveDate)||x.state==='unknown'||!keys(b,['graph','animals','config','toros','lots','uses','stock','view'])||!graph(b.graph,p.animalId)||!sameQuick(b.graph.animal,p.observedAnimal)||!rows(b.animals)||!b.animals.every(validAlertResponseAnimal)||!b.animals.some(a=>sameQuick(a,(b.graph as QuickGraph).animal))||!Array.isArray(b.config)||!b.config.every(record)||!rows(b.toros)||!rows(b.lots)||!rows(b.uses)||!Array.isArray(b.stock)||!b.stock.every(v=>keys(v,['pajilla_id','toro_id','cantidad_inicial','usos','cantidad_actual'])&&uuid(v.pajilla_id)&&uuid(v.toro_id)&&Number.isInteger(v.cantidad_inicial)&&Number.isInteger(v.usos)&&Number.isInteger(v.cantidad_actual)&&v.cantidad_actual===Number(v.cantidad_inicial)-Number(v.usos))||!sameQuick(b.stock,b.lots.map(l=>({pajilla_id:l.id,toro_id:l.toro_id,cantidad_inicial:l.cantidad_inicial,usos:(b.uses as JsonRow[]).filter(u=>u.pajilla_id===l.id).length,cantidad_actual:Number(l.cantidad_inicial)-(b.uses as JsonRow[]).filter(u=>u.pajilla_id===l.id).length})))||!record(b.view)||b.view.animal_id!==p.animalId||!keys(x.plan,['events','usage'])||!Array.isArray(x.plan.events)||x.plan.events.length!==1||!record(x.plan.events[0])||(x.plan.usage!==null&&!record(x.plan.usage)))return fail();
 const r=x as unknown as QuickResult,original=b as unknown as QuickOriginal,plan=x.plan as unknown as QuickPlan;
 if(!sameQuick(plan,expectedQuickPlan(p,original,{event:String(plan.events[0].id),usage:plan.usage===null?null:String(plan.usage.id)},r.actor)))return fail();
 if(r.state!=='committed'){if(r.receipt!==null)return fail();return r;}
 const q=r.receipt;if(!keys(q,['version','requestKey','actor','action','intent','original','plan','effectiveDate','recordedAt','after','usage'])||q.version!==1||q.requestKey!==r.requestKey||!sameQuick(q.actor,r.actor)||!sameQuick(q.action,action)||!sameQuick(q.intent,p)||!sameQuick(q.original,b)||!sameQuick(q.plan,plan)||q.effectiveDate!==r.effectiveDate||typeof q.recordedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(q.recordedAt)||!Number.isFinite(Date.parse(q.recordedAt)))return fail();
 const events:JsonRow[]=plan.events.map(e=>({...e,created_at:q.recordedAt}));if(!events.every(validAlertResponseEvent)||!sameQuick(q.after,{...original.graph,events:[...original.graph.events,...events].sort((a,b)=>String(a.id).localeCompare(String(b.id)))}))return fail();
 if(!sameQuick(q.usage,plan.usage===null?null:{...plan.usage,created_at:q.recordedAt}))return fail();return r;
}
export async function quickTelegram(c:QuickClient,action:QuickAction,mode:'prepare'|'post'|'status'|'resolve',intent:QuickIntent|null=null,expected?:QuickResult){
 quickAction(action);if(!['prepare','post','status','resolve'].includes(mode)||(mode==='prepare'?intent===null:intent!==null))return fail();if(intent)quickIntent(intent);
 const r=await c.rpc('fn_hato_quick_telegram',{p_action:mode,p_sender:action.sender,p_chat_id:action.chatId,p_message_id:action.messageId,p_intent:intent});if(r.error)throw Error('Resultado desconocido. Conserve el mensaje original para verificar.');
 const result=validateQuickResult(r.data,action,expected?.intent??intent??undefined,expected?.actor);
 if(expected&&expected.state!=='unknown'&&(result.requestKey!==expected.requestKey||(expected.original&&(!sameQuick(result.original,expected.original)||!sameQuick(result.plan,expected.plan)||result.effectiveDate!==expected.effectiveDate))||(['committed','canceled'].includes(expected.state)&&!sameQuick(result,expected))))return fail();return result;
}
