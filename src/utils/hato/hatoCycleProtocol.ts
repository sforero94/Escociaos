import {sameAlertResponse,validAlertResponseAnimal,validAlertResponseEvent,type JsonRow,type AlertResponseClient} from './alertResponseProtocol';
import {validDeathSnapshot,type DeathSnapshot} from './hatoDeathProtocol';
import {construirEventosMarcaCiclo,type InputMarcaCiclo} from '../hatoCicloManual';
import {calcularSiguienteChapetaCria,construirFichaCria,elegirToroDelServicio} from './criaAutomatica';
export const sameCycle=sameAlertResponse;
export interface CycleInput {marca:'preñada'|'confirmada'|'seca'|'parida';fecha:string;fechaConfianza:'exacta'|'aproximada';criaDestino:'retenida'|'hembra_vendida'|'macho_vendido'|'muerta'|'aborto'|null;nota:string;ancla:{modo:'ninguna'|'fecha_conocida'|'meses_prenez';fechaServicio:string|null;mesesPrenez:number|null}}
export interface CycleIntent {version:1;animalId:string;observedAnimal:JsonRow;input:CycleInput}
export interface CycleOriginal {graph:DeathSnapshot;animals:JsonRow[];config:JsonRow[];toros:JsonRow[];view:JsonRow}
export interface CyclePlan {events:JsonRow[];calf:JsonRow|null}
export interface CycleReceipt {version:1;requestKey:string;owner:string;intent:CycleIntent;original:CycleOriginal;plan:CyclePlan;effectiveDate:string;actor:{origin:'web';profileId:string};recordedAt:string;after:DeathSnapshot;calf:JsonRow|null}
export interface CycleResult {version:1;requestKey:string;owner:string;state:'unknown'|'pending'|'committed'|'canceled';intent:CycleIntent|null;original:CycleOriginal|null;plan:CyclePlan|null;effectiveDate:string|null;receipt:CycleReceipt|null}
export type CycleClient=AlertResponseClient;
const record=(x:unknown):x is JsonRow=>!!x&&typeof x==='object'&&!Array.isArray(x);
const keys=(x:unknown,k:string[]):x is JsonRow=>record(x)&&Object.keys(x).sort().join('|')===[...k].sort().join('|');
const uuid=(x:unknown):x is string=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x);
const date=(x:unknown)=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString()===x+'T00:00:00.000Z';
const fail=():never=>{throw Error('No pude verificar el ciclo original. Conserve y verifique el mismo intento.');};
export function canonicalCycleInput(p:InputMarcaCiclo):CycleInput{return {marca:p.marca,fecha:p.fecha,fechaConfianza:p.fechaConfianza,criaDestino:p.marca==='parida'?p.criaDestino??null:null,nota:p.nota?.trim()??'',ancla:{modo:p.ancla?.modo??'ninguna',fechaServicio:p.ancla?.modo==='fecha_conocida'?p.ancla.fechaServicio??null:null,mesesPrenez:p.ancla?.modo==='meses_prenez'?p.ancla.mesesPrenez??null:null}};}
export function cycleIntent(x:unknown):CycleIntent{
 if(!keys(x,['version','animalId','observedAnimal','input'])||x.version!==1||!uuid(x.animalId)||!validAlertResponseAnimal(x.observedAnimal)||x.observedAnimal.id!==x.animalId||x.observedAnimal.estado!=='activa'||!keys(x.input,['marca','fecha','fechaConfianza','criaDestino','nota','ancla']))return fail();
 const i=x.input,a=i.ancla;if(!['preñada','confirmada','seca','parida'].includes(String(i.marca))||!date(i.fecha)||!['exacta','aproximada'].includes(String(i.fechaConfianza))||typeof i.nota!=='string'||i.nota.trim()!==i.nota||i.nota.length>4000||!keys(a,['modo','fechaServicio','mesesPrenez'])||!['ninguna','fecha_conocida','meses_prenez'].includes(String(a.modo)))return fail();
 if(i.marca==='parida'?!['retenida','hembra_vendida','macho_vendido','muerta','aborto'].includes(String(i.criaDestino)):i.criaDestino!==null)return fail();
 if(a.modo==='ninguna'?(a.fechaServicio!==null||a.mesesPrenez!==null):a.modo==='fecha_conocida'?(!date(a.fechaServicio)||a.mesesPrenez!==null):(a.fechaServicio!==null||typeof a.mesesPrenez!=='number'||!Number.isFinite(a.mesesPrenez)||a.mesesPrenez<=0||a.mesesPrenez>120000))return fail();
 if(!['preñada','confirmada'].includes(String(i.marca))&&a.modo!=='ninguna')return fail();
 const p=x as unknown as CycleIntent;for(const e of cyclePayloads(p.input))if(!date(e.fecha))return fail();return p;
}
export function cyclePayloads(i:CycleInput){return construirEventosMarcaCiclo({...i,criaDestino:i.criaDestino??undefined,ancla:{modo:i.ancla.modo,fechaServicio:i.ancla.fechaServicio??undefined,mesesPrenez:i.ancla.mesesPrenez??undefined}});}
export function expectedCyclePlan(p:CycleIntent,b:CycleOriginal,ids:{events:string[];calf:string|null},owner:string):CyclePlan{
 const inputs=cyclePayloads(p.input);if(inputs.length!==ids.events.length||!ids.events.every(uuid)||new Set(ids.events).size!==ids.events.length)return fail();
 let calf:JsonRow|null=null;
 if(p.input.criaDestino==='retenida'){
  if(!uuid(ids.calf)||ids.events.includes(ids.calf)||b.animals.some(a=>a.id===ids.calf))return fail();
  const fields=construirFichaCria({numero:calcularSiguienteChapetaCria(b.animals.map(a=>({numero:a.numero as number|null,estado:String(a.estado)}))),madreId:p.animalId,fincaId:b.graph.animal.finca_id as string|null,fechaParto:p.input.fecha,fechaPartoConfianza:p.input.fechaConfianza,padreToroId:elegirToroDelServicio(b.graph.events.filter(e=>e.tipo==='servicio').map(e=>({fecha:String(e.fecha),toro_id:e.toro_id as string|null})),p.input.fecha),createdBy:owner,fuente:'web'});
  calf={...Object.fromEntries(Object.keys(b.graph.animal).map(k=>[k,null])),...fields,id:ids.calf,confianza:'alta',etapa_forzada:false};
 }else if(ids.calf!==null)return fail();
 const events=inputs.map((e,i)=>{if(b.graph.events.some(v=>v.id===ids.events[i]))return fail();return {...Object.fromEntries(['id','animal_id','tipo','fecha','fecha_confianza','toro_id','tipo_servicio','cria_id','cria_destino','sx_raw','chequeo_vaca_id','alerta_id','transaccion_ganado_id','fin_ingreso_id','fuente','datos','created_at','created_by'].map(k=>[k,null])),...e,id:ids.events[i],animal_id:p.animalId,created_by:owner,cria_id:e.tipo==='parto'?ids.calf:null};});
 return {events,calf};
}
export function validateCycleResult(x:unknown,owner:string,key:string,intent?:CycleIntent):CycleResult{
 if(!uuid(owner)||!uuid(key)||!keys(x,['version','requestKey','owner','state','intent','original','plan','effectiveDate','receipt'])||x.version!==1||x.requestKey!==key||x.owner!==owner||!['unknown','pending','committed','canceled'].includes(String(x.state)))return fail();
 if(x.intent===null||x.original===null||x.plan===null||x.effectiveDate===null){if(x.intent!==null||x.original!==null||x.plan!==null||x.effectiveDate!==null||!['unknown','canceled'].includes(String(x.state))||x.receipt!==null)return fail();return x as unknown as CycleResult;}
 const p=cycleIntent(x.intent),b=x.original;if((intent&&!sameCycle(p,intent))||!date(x.effectiveDate)||x.state==='unknown'||!keys(b,['graph','animals','config','toros','view'])||!validDeathSnapshot(b.graph,p)||!sameCycle(b.graph.animal,p.observedAnimal)||!Array.isArray(b.animals)||!b.animals.every(validAlertResponseAnimal)||new Set(b.animals.map(a=>a.id)).size!==b.animals.length||!b.animals.some(a=>sameCycle(a,(b.graph as DeathSnapshot).animal))||!Array.isArray(b.config)||!b.config.every(record)||!Array.isArray(b.toros)||!b.toros.every(v=>record(v)&&uuid(v.id))||!record(b.view)||b.view.animal_id!==p.animalId||!keys(x.plan,['events','calf'])||!Array.isArray(x.plan.events)||!x.plan.events.every(record)||(x.plan.calf!==null&&!record(x.plan.calf)))return fail();
 const original=b as unknown as CycleOriginal,plan=x.plan as unknown as CyclePlan;
 if(cyclePayloads(p.input).some(e=>e.fecha>String(x.effectiveDate))||!sameCycle(plan,expectedCyclePlan(p,original,{events:plan.events.map(e=>String(e.id)),calf:plan.calf===null?null:String(plan.calf.id)},owner)))return fail();
 const r=x as unknown as CycleResult;if(r.state!=='committed'){if(r.receipt!==null)return fail();return r;}
 const q=r.receipt;if(!keys(q,['version','requestKey','owner','intent','original','plan','effectiveDate','actor','recordedAt','after','calf'])||q.version!==1||q.requestKey!==key||q.owner!==owner||!sameCycle(q.intent,p)||!sameCycle(q.original,b)||!sameCycle(q.plan,plan)||q.effectiveDate!==r.effectiveDate||!sameCycle(q.actor,{origin:'web',profileId:owner})||typeof q.recordedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(q.recordedAt)||!Number.isFinite(Date.parse(q.recordedAt)))return fail();
 const events:JsonRow[]=plan.events.map(e=>({...e,created_at:q.recordedAt}));if(!events.every(validAlertResponseEvent)||!sameCycle(q.after,{...original.graph,events:[...original.graph.events,...events].sort((a,b)=>String(a.id).localeCompare(String(b.id)))}))return fail();
 if(!sameCycle(q.calf,plan.calf===null?null:{...plan.calf,created_at:q.recordedAt})||(q.calf!==null&&!validAlertResponseAnimal(q.calf)))return fail();return r;
}
export async function cycleWeb(c:CycleClient,owner:string,key:string,mode:'prepare'|'post'|'status'|'resolve',intent:CycleIntent|null=null,expected?:CycleIntent){
 if(!uuid(owner)||!uuid(key)||!['prepare','post','status','resolve'].includes(mode)||(mode==='prepare'?intent===null:intent!==null))return fail();if(intent)cycleIntent(intent);
 const r=await c.rpc('fn_hato_cycle_web',{p_action:mode,p_request_key:key,p_intent:intent,p_expected_owner:owner});if(r.error)throw Error('Resultado desconocido. Verifique el intento original antes de continuar.');return validateCycleResult(r.data,owner,key,expected??intent??undefined);
}
