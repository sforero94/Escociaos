import {sameAlertResponse,validAlertResponseAnimal,validAlertResponseEvent,type JsonRow,type AlertResponseClient} from './alertResponseProtocol';
import {calcularSiguienteChapetaCria,construirFichaCria,elegirToroDelServicio} from './criaAutomatica';
export const sameBirth=sameAlertResponse;
export interface BirthAction {sender:number;chatId:number;messageId:number}
export interface BirthActor {origin:'telegram';registrationId:string;profileId:string|null;sender:number;displayName:string|null}
export interface BirthIntent {version:1;animalId:string;fecha:string;criaDestino:'retenida'|'hembra_vendida'|'macho_vendido'|'muerta'|'aborto'|null;observedAnimal:JsonRow}
export interface BirthGraph {animal:JsonRow;events:JsonRow[];headers:JsonRow[];steps:JsonRow[];alerts:JsonRow[];checks:JsonRow[];checkHeaders:JsonRow[]}
export interface BirthOriginal {graph:BirthGraph;animals:JsonRow[];config:JsonRow[];toros:JsonRow[];view:JsonRow}
export interface BirthPlan {events:JsonRow[];calf:JsonRow|null}
export interface BirthReceipt {version:1;requestKey:string;actor:BirthActor;action:BirthAction;intent:BirthIntent;original:BirthOriginal;plan:BirthPlan;effectiveDate:string;recordedAt:string;after:BirthGraph;calf:JsonRow|null}
export interface BirthResult {version:1;requestKey:string|null;actor:BirthActor;action:BirthAction;state:'unknown'|'pending'|'committed'|'canceled';intent:BirthIntent|null;original:BirthOriginal|null;plan:BirthPlan|null;effectiveDate:string|null;receipt:BirthReceipt|null}
export type BirthClient=AlertResponseClient;
const record=(x:unknown):x is JsonRow=>!!x&&typeof x==='object'&&!Array.isArray(x);
const keys=(x:unknown,k:string[]):x is JsonRow=>record(x)&&Object.keys(x).sort().join('|')===[...k].sort().join('|');
const uuid=(x:unknown):x is string=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x);
const date=(x:unknown)=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString()===x+'T00:00:00.000Z';
const fail=():never=>{throw Error('No pude verificar el parto original. Conserve el mensaje privado original.');};
export function birthAction(x:unknown):BirthAction{if(!keys(x,['sender','chatId','messageId'])||!Number.isSafeInteger(x.sender)||Number(x.sender)<1||x.chatId!==x.sender||!Number.isSafeInteger(x.messageId)||Number(x.messageId)<1)return fail();return x as unknown as BirthAction;}
export function birthIntent(x:unknown):BirthIntent{if(!keys(x,['version','animalId','fecha','criaDestino','observedAnimal'])||x.version!==1||!uuid(x.animalId)||!date(x.fecha)||(x.criaDestino!==null&&!['retenida','hembra_vendida','macho_vendido','muerta','aborto'].includes(String(x.criaDestino)))||!validAlertResponseAnimal(x.observedAnimal)||x.observedAnimal.id!==x.animalId||x.observedAnimal.estado!=='activa')return fail();return x as unknown as BirthIntent;}
function rows(x:unknown):x is JsonRow[]{return Array.isArray(x)&&x.every(v=>record(v)&&uuid(v.id))&&new Set(x.map(v=>v.id)).size===x.length&&sameBirth(x,[...x].sort((a,b)=>String(a.id).localeCompare(String(b.id))));}
function graph(x:unknown,id:string):x is BirthGraph{
 if(!keys(x,['animal','events','headers','steps','alerts','checks','checkHeaders'])||!validAlertResponseAnimal(x.animal)||x.animal.id!==id||!['events','headers','steps','alerts','checks','checkHeaders'].every(k=>rows(x[k])))return false;const g=x as unknown as BirthGraph;
 return g.events.every(e=>validAlertResponseEvent(e)&&e.animal_id===id)&&[...g.headers,...g.alerts,...g.checks].every(r=>r.animal_id===id)&&g.steps.every(r=>g.headers.some(h=>h.id===r.tratamiento_id))&&g.checks.every(r=>g.checkHeaders.some(h=>h.id===r.chequeo_id));
}
export function expectedBirthPlan(p:BirthIntent,b:BirthOriginal,ids:{event:string;calf:string|null},actor:BirthActor):BirthPlan{
 if(!uuid(ids.event)||b.graph.events.some(e=>e.id===ids.event))return fail();let calf:JsonRow|null=null;
 if(p.criaDestino==='retenida'){
  if(!uuid(ids.calf)||ids.calf===ids.event||b.animals.some(a=>a.id===ids.calf))return fail();
  const fields=construirFichaCria({numero:calcularSiguienteChapetaCria(b.animals.map(a=>({numero:a.numero as number|null,estado:String(a.estado)}))),madreId:p.animalId,fincaId:b.graph.animal.finca_id as string|null,fechaParto:p.fecha,fechaPartoConfianza:'exacta',padreToroId:elegirToroDelServicio(b.graph.events.filter(e=>e.tipo==='servicio').map(e=>({fecha:String(e.fecha),toro_id:e.toro_id as string|null})),p.fecha),createdBy:actor.profileId,fuente:'telegram'});
  calf={...Object.fromEntries(Object.keys(b.graph.animal).map(k=>[k,null])),...fields,id:ids.calf,confianza:'alta',etapa_forzada:false};
 }else if(ids.calf!==null)return fail();
 const e={...Object.fromEntries(['id','animal_id','tipo','fecha','fecha_confianza','toro_id','tipo_servicio','cria_id','cria_destino','sx_raw','chequeo_vaca_id','alerta_id','transaccion_ganado_id','fin_ingreso_id','fuente','datos','created_at','created_by'].map(k=>[k,null])),id:ids.event,animal_id:p.animalId,tipo:'parto',fecha:p.fecha,fecha_confianza:'exacta',cria_destino:p.criaDestino,cria_id:ids.calf,fuente:'telegram',datos:{origen:'telegram',registrado_por:actor.displayName},created_by:actor.profileId};return {events:[e],calf};
}
export function validateBirthResult(x:unknown,action:BirthAction,intent?:BirthIntent,expectedActor?:BirthActor):BirthResult{
 birthAction(action);if(!keys(x,['version','requestKey','actor','action','state','intent','original','plan','effectiveDate','receipt'])||x.version!==1||!sameBirth(x.action,action)||!keys(x.actor,['origin','registrationId','profileId','sender','displayName'])||x.actor.origin!=='telegram'||!uuid(x.actor.registrationId)||(x.actor.profileId!==null&&!uuid(x.actor.profileId))||x.actor.sender!==action.sender||(x.actor.displayName!==null&&typeof x.actor.displayName!=='string')||(expectedActor&&!sameBirth(x.actor,expectedActor))||!['unknown','pending','committed','canceled'].includes(String(x.state))||(x.state==='unknown'?x.requestKey!==null:!uuid(x.requestKey)))return fail();
 if(x.intent===null||x.original===null||x.plan===null||x.effectiveDate===null){if(x.intent!==null||x.original!==null||x.plan!==null||x.effectiveDate!==null||!['unknown','canceled'].includes(String(x.state))||x.receipt!==null)return fail();return x as unknown as BirthResult;}
 const p=birthIntent(x.intent),b=x.original;if((intent&&!sameBirth(p,intent))||!date(x.effectiveDate)||p.fecha>String(x.effectiveDate)||x.state==='unknown'||!keys(b,['graph','animals','config','toros','view'])||!graph(b.graph,p.animalId)||!sameBirth(b.graph.animal,p.observedAnimal)||!rows(b.animals)||!b.animals.every(validAlertResponseAnimal)||!b.animals.some(a=>sameBirth(a,(b.graph as BirthGraph).animal))||!Array.isArray(b.config)||!b.config.every(record)||!rows(b.toros)||!record(b.view)||b.view.animal_id!==p.animalId||!keys(x.plan,['events','calf'])||!Array.isArray(x.plan.events)||x.plan.events.length!==1||!record(x.plan.events[0])||(x.plan.calf!==null&&!record(x.plan.calf)))return fail();
 const r=x as unknown as BirthResult,original=b as unknown as BirthOriginal,plan=x.plan as unknown as BirthPlan;
 if(!sameBirth(plan,expectedBirthPlan(p,original,{event:String(plan.events[0].id),calf:plan.calf===null?null:String(plan.calf.id)},r.actor)))return fail();
 if(r.state!=='committed'){if(r.receipt!==null)return fail();return r;}
 const q=r.receipt;if(!keys(q,['version','requestKey','actor','action','intent','original','plan','effectiveDate','recordedAt','after','calf'])||q.version!==1||q.requestKey!==r.requestKey||!sameBirth(q.actor,r.actor)||!sameBirth(q.action,action)||!sameBirth(q.intent,p)||!sameBirth(q.original,b)||!sameBirth(q.plan,plan)||q.effectiveDate!==r.effectiveDate||typeof q.recordedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(q.recordedAt)||!Number.isFinite(Date.parse(q.recordedAt)))return fail();
 const events:JsonRow[]=plan.events.map(e=>({...e,created_at:q.recordedAt}));if(!events.every(validAlertResponseEvent)||!sameBirth(q.after,{...original.graph,events:[...original.graph.events,...events].sort((a,b)=>String(a.id).localeCompare(String(b.id)))}))return fail();
 if(!sameBirth(q.calf,plan.calf===null?null:{...plan.calf,created_at:q.recordedAt})||(q.calf!==null&&!validAlertResponseAnimal(q.calf)))return fail();return r;
}
export async function birthTelegram(c:BirthClient,action:BirthAction,mode:'prepare'|'post'|'status'|'resolve',intent:BirthIntent|null=null,expected?:BirthResult){
 birthAction(action);if(!['prepare','post','status','resolve'].includes(mode)||(mode==='prepare'?intent===null:intent!==null))return fail();if(intent)birthIntent(intent);
 const r=await c.rpc('fn_hato_birth_telegram',{p_action:mode,p_sender:action.sender,p_chat_id:action.chatId,p_message_id:action.messageId,p_intent:intent});if(r.error)throw Error('Resultado desconocido. Conserve el mensaje original para verificar.');
 const result=validateBirthResult(r.data,action,expected?.intent??intent??undefined,expected?.actor);
 if(expected&&expected.state!=='unknown'&&(result.requestKey!==expected.requestKey||(expected.original&&(!sameBirth(result.original,expected.original)||!sameBirth(result.plan,expected.plan)||result.effectiveDate!==expected.effectiveDate))||(['committed','canceled'].includes(expected.state)&&!sameBirth(result,expected))))return fail();return result;
}
