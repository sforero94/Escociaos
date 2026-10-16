import {sameAlertResponse,validAlertResponseAnimal,validAlertResponseEvent,type JsonRow,type AlertResponseClient} from './alertResponseProtocol';
export const sameEventCorrection=sameAlertResponse;
export interface EventCorrectionChanges {fecha:string;fecha_confianza:'exacta'|'aproximada'|'desconocida';tipo_servicio:'monta'|'inseminacion'|null;toro_id:string|null;cria_destino:'retenida'|'hembra_vendida'|'macho_vendido'|'muerta'|'aborto'|null;nota:string;motivo:string}
export interface EventCorrectionIntent {version:1;eventId:string;mode:'edit'|'delete';observedEvent:JsonRow;changes:EventCorrectionChanges|null}
export interface EventCorrectionGraph {animal:JsonRow;events:JsonRow[];headers:JsonRow[];steps:JsonRow[];alerts:JsonRow[];checks:JsonRow[];checkHeaders:JsonRow[]}
export interface EventCorrectionOriginal {event:JsonRow;graph:EventCorrectionGraph;toro:JsonRow|null}
export interface EventCorrectionPlan {event:JsonRow|null}
export interface EventCorrectionReceipt {version:1;requestKey:string;owner:string;intent:EventCorrectionIntent;original:EventCorrectionOriginal;plan:EventCorrectionPlan;effectiveDate:string;actor:{origin:'web';profileId:string};recordedAt:string;after:{event:JsonRow|null;graph:EventCorrectionGraph;toro:JsonRow|null};correction:JsonRow}
export interface EventCorrectionResult {version:1;requestKey:string;owner:string;state:'unknown'|'pending'|'committed'|'canceled';intent:EventCorrectionIntent|null;original:EventCorrectionOriginal|null;plan:EventCorrectionPlan|null;effectiveDate:string|null;receipt:EventCorrectionReceipt|null}
export type EventCorrectionClient=AlertResponseClient;
const record=(x:unknown):x is JsonRow=>!!x&&typeof x==='object'&&!Array.isArray(x);
const keys=(x:unknown,k:string[]):x is JsonRow=>record(x)&&Object.keys(x).sort().join('|')===[...k].sort().join('|');
const uuid=(x:unknown):x is string=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x);
const date=(x:unknown):x is string=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString()===x+'T00:00:00.000Z';
const timestamp=(x:unknown)=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(x)&&Number.isFinite(Date.parse(x));
const fail=():never=>{throw Error('No pude verificar la corrección original. Conserve y verifique el mismo intento.');};
export function eventCorrectionIntent(x:unknown):EventCorrectionIntent{
 if(!keys(x,['version','eventId','mode','observedEvent','changes'])||x.version!==1||!uuid(x.eventId)||!validAlertResponseEvent(x.observedEvent)||x.observedEvent.id!==x.eventId||!['edit','delete'].includes(String(x.mode)))return fail();
 const e=x.observedEvent;if(!['servicio','celo','confirmacion_prenez','parto','aborto','secado_real','rechequeo'].includes(String(e.tipo))||e.cria_id!==null||e.alerta_id!==null||e.transaccion_ganado_id!==null||e.fin_ingreso_id!==null||e.cria_destino==='retenida'||e.tipo_servicio==='inseminacion'||(record(e.datos)&&'pajilla_uso_id' in e.datos))return fail();
 if(x.mode==='delete'){if(x.changes!==null)return fail();return x as unknown as EventCorrectionIntent;}
 const v=x.changes;if(!keys(v,['fecha','fecha_confianza','tipo_servicio','toro_id','cria_destino','nota','motivo'])||!date(v.fecha)||!['exacta','aproximada','desconocida'].includes(String(v.fecha_confianza))||(v.tipo_servicio!==null&&v.tipo_servicio!=='monta')||(v.toro_id!==null&&!uuid(v.toro_id))||(v.cria_destino!==null&&!['hembra_vendida','macho_vendido','muerta','aborto'].includes(String(v.cria_destino)))||['nota','motivo'].some(k=>typeof v[k]!=='string'||String(v[k]).trim()!==v[k]||String(v[k]).length>4000)||(e.tipo!=='servicio'&&(v.tipo_servicio!==e.tipo_servicio||v.toro_id!==e.toro_id))||(e.tipo!=='parto'&&v.cria_destino!==e.cria_destino))return fail();
 if(v.motivo===''&&record(e.datos)&&e.datos.motivo_correccion!==undefined&&e.datos.motivo_correccion!==null&&typeof e.datos.motivo_correccion!=='string')return fail();return x as unknown as EventCorrectionIntent;
}
export function expectedEventCorrection(p:EventCorrectionIntent):EventCorrectionPlan{
 eventCorrectionIntent(p);if(p.mode==='delete')return {event:null};const v=p.changes!,data={...(p.observedEvent.datos as JsonRow|null??{})};if(v.nota)data.nota=v.nota;else delete data.nota;if(v.motivo)data.motivo_correccion=v.motivo;
 return {event:{...p.observedEvent,fecha:v.fecha,fecha_confianza:v.fecha_confianza,tipo_servicio:v.tipo_servicio,toro_id:v.toro_id,cria_destino:v.cria_destino,datos:Object.keys(data).length?data:null}};
}
function rows(x:unknown):x is JsonRow[]{return Array.isArray(x)&&x.every(v=>record(v)&&uuid(v.id))&&new Set(x.map(v=>v.id)).size===x.length&&sameEventCorrection(x,[...x].sort((a,b)=>String(a.id).localeCompare(String(b.id))));}
function graph(x:unknown,id:string):x is EventCorrectionGraph{
 if(!keys(x,['animal','events','headers','steps','alerts','checks','checkHeaders'])||!validAlertResponseAnimal(x.animal)||x.animal.id!==id||!['events','headers','steps','alerts','checks','checkHeaders'].every(k=>rows(x[k])))return false;const g=x as unknown as EventCorrectionGraph;
 return g.events.every(e=>validAlertResponseEvent(e)&&e.animal_id===id)&&[...g.headers,...g.alerts,...g.checks].every(r=>r.animal_id===id)&&g.steps.every(r=>g.headers.some(h=>h.id===r.tratamiento_id))&&g.checks.every(r=>g.checkHeaders.some(h=>h.id===r.chequeo_id));
}
export function validateEventCorrectionResult(x:unknown,owner:string,key:string,intent?:EventCorrectionIntent):EventCorrectionResult{
 if(!uuid(owner)||!uuid(key)||!keys(x,['version','requestKey','owner','state','intent','original','plan','effectiveDate','receipt'])||x.version!==1||x.requestKey!==key||x.owner!==owner||!['unknown','pending','committed','canceled'].includes(String(x.state)))return fail();
 if(x.intent===null||x.original===null||x.plan===null||x.effectiveDate===null){if(x.intent!==null||x.original!==null||x.plan!==null||x.effectiveDate!==null||!['unknown','canceled'].includes(String(x.state))||x.receipt!==null)return fail();return x as unknown as EventCorrectionResult;}
 const p=eventCorrectionIntent(x.intent),b=x.original;if((intent&&!sameEventCorrection(p,intent))||!date(x.effectiveDate)||(p.mode==='edit'&&p.changes!.fecha>x.effectiveDate)||x.state==='unknown'||!keys(b,['event','graph','toro'])||!sameEventCorrection(b.event,p.observedEvent)||!graph(b.graph,String(p.observedEvent.animal_id))||!b.graph.events.some(e=>sameEventCorrection(e,p.observedEvent))||!sameEventCorrection(x.plan,expectedEventCorrection(p)))return fail();
 const toro=p.mode==='edit'?p.changes!.toro_id:p.observedEvent.toro_id;if(toro===null?b.toro!==null:!record(b.toro)||b.toro.id!==toro)return fail();
 const r=x as unknown as EventCorrectionResult;if(r.state!=='committed'){if(r.receipt!==null)return fail();return r;}
 const q=r.receipt,original=r.original!,plan=r.plan!;if(!keys(q,['version','requestKey','owner','intent','original','plan','effectiveDate','actor','recordedAt','after','correction'])||q.version!==1||q.requestKey!==key||q.owner!==owner||!sameEventCorrection(q.actor,{origin:'web',profileId:owner})||!sameEventCorrection(q.intent,p)||!sameEventCorrection(q.original,original)||!sameEventCorrection(q.plan,plan)||q.effectiveDate!==r.effectiveDate||!timestamp(q.recordedAt))return fail();
 const events=original.graph.events.filter(e=>e.id!==p.eventId);if(plan.event)events.push(plan.event);events.sort((a,b)=>String(a.id).localeCompare(String(b.id)));
 if(!sameEventCorrection(q.after,{...original,event:plan.event,graph:{...original.graph,events}})||!record(q.correction)||!uuid(q.correction.id)||!sameEventCorrection(q.correction,{id:q.correction.id,tabla:'hato_eventos',fila_id:p.eventId,operacion:p.mode==='edit'?'update':'delete',datos_anteriores:p.observedEvent,datos_nuevos:plan.event,animal_id:p.observedEvent.animal_id,corregido_por:owner,corregido_en:q.recordedAt,motivo:p.mode==='edit'?(plan.event?.datos as JsonRow|null)?.motivo_correccion??null:null}))return fail();return r;
}
export async function eventCorrectionWeb(c:EventCorrectionClient,owner:string,key:string,mode:'prepare'|'post'|'status'|'resolve',intent:EventCorrectionIntent|null=null,expected?:EventCorrectionResult){
 if(!uuid(owner)||!uuid(key)||!['prepare','post','status','resolve'].includes(mode)||(mode==='prepare'?intent===null:intent!==null))return fail();if(intent)eventCorrectionIntent(intent);
 const r=await c.rpc('fn_hato_event_correction_web',{p_action:mode,p_request_key:key,p_intent:intent,p_expected_owner:owner});if(r.error)throw Error('Resultado desconocido. Verifique la corrección original antes de continuar.');const result=validateEventCorrectionResult(r.data,owner,key,expected?.intent??intent??undefined);
 if(expected&&expected.state!=='unknown'&&(!sameEventCorrection(result.original,expected.original)||!sameEventCorrection(result.plan,expected.plan)||result.effectiveDate!==expected.effectiveDate||(['committed','canceled'].includes(expected.state)&&!sameEventCorrection(result,expected))))return fail();return result;
}
