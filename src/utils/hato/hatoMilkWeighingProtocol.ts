import {sameAlertResponse,type JsonRow,type AlertResponseClient} from './alertResponseProtocol';
export const sameMilkWeighing=sameAlertResponse;
export interface MilkWeighingCell {animalId:string;date:string;am:number|null;pm:number|null;observed:JsonRow|null}
export interface MilkWeighingIntent {version:1;year:number;month:number;cells:MilkWeighingCell[];captureId:string|null}
export interface MilkWeighingSnapshot {rows:JsonRow[];animals:JsonRow[];config:JsonRow[]}
export interface MilkWeighingPlan {weekday:number;accepted:{cell:MilkWeighingCell;before:JsonRow|null;after:JsonRow}[];rejected:{cell:MilkWeighingCell;reason:'current_roster_or_weekday'}[];capture:JsonRow|null}
export type MilkWeighingActor={origin:'web';profileId:string}|{origin:'telegram';profileId:string;registrationId:string;sender:number;displayName:string|null};
export interface MilkWeighingReceipt {version:1;requestKey:string;owner:string;intent:MilkWeighingIntent;original:MilkWeighingSnapshot;plan:MilkWeighingPlan;effectiveDate:string;actor:MilkWeighingActor;recordedAt:string;before:JsonRow[];after:JsonRow[];corrections:JsonRow[];capture:{before:JsonRow|null;after:JsonRow|null};footprints:{before:string;after:string}}
export interface MilkWeighingResult {version:1;requestKey:string;owner:string;state:'unknown'|'pending'|'committed'|'canceled';intent:MilkWeighingIntent|null;original:MilkWeighingSnapshot|null;plan:MilkWeighingPlan|null;effectiveDate:string|null;receipt:MilkWeighingReceipt|null;acknowledged:boolean}
export type MilkWeighingClient=AlertResponseClient;
const record=(x:unknown):x is JsonRow=>!!x&&typeof x==='object'&&!Array.isArray(x);
const keys=(x:unknown,k:string[]):x is JsonRow=>record(x)&&Object.keys(x).sort().join('|')===[...k].sort().join('|');
const uuid=(x:unknown):x is string=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x);
const num=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const time=(x:unknown):x is string=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(x)&&Number.isFinite(Date.parse(x));
const date=(x:unknown):x is string=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString()===x+'T00:00:00.000Z';
const nullable=(x:unknown,p:(v:unknown)=>boolean)=>x===null||p(x);
const fail=():never=>{throw Error('No pude verificar el pesaje original. Consérvelo y recupérelo antes de continuar.');};
const milkRow=(r:unknown):r is JsonRow=>keys(r,['id','animal_id','fecha','litros_am','litros_pm','litros_total','fuente','created_at','created_by'])&&uuid(r.id)&&uuid(r.animal_id)&&date(r.fecha)&&nullable(r.litros_am,num)&&nullable(r.litros_pm,num)&&num(r.litros_total)&&r.litros_total>=0&&nullable(r.fuente,v=>typeof v==='string')&&nullable(r.created_at,time)&&nullable(r.created_by,uuid);
const animalKeys=['id','numero','nombre','sexo','etapa','raza','estado','fecha_estado','fecha_nacimiento','fecha_nacimiento_confianza','madre_id','padre_toro_id','padre_id','finca_id','origen','confianza','import_meta','notas','created_at','created_by','etapa_forzada'];
function uniqueRows(x:unknown,p:(v:unknown)=>boolean):x is JsonRow[]{return Array.isArray(x)&&x.every(p)&&new Set(x.map(v=>v.id)).size===x.length;}
export function validateMilkWeighingSnapshot(x:unknown):MilkWeighingSnapshot{
 if(!keys(x,['rows','animals','config'])||!uniqueRows(x.rows,milkRow)||!uniqueRows(x.animals,r=>keys(r,animalKeys)&&uuid(r.id)&&nullable(r.nombre,v=>typeof v==='string')&&typeof r.estado==='string'&&typeof r.etapa==='string')||!Array.isArray(x.config)||!x.config.every(r=>keys(r,['id','clave','valor','descripcion','created_at','updated_at','updated_by'])&&uuid(r.id)&&typeof r.clave==='string')||new Set(x.config.map(r=>r.clave)).size!==x.config.length)return fail();
 const s=x as unknown as MilkWeighingSnapshot;if(new Set(s.rows.map(r=>r.animal_id+'|'+r.fecha)).size!==s.rows.length||!s.rows.every(r=>s.animals.some(a=>a.id===r.animal_id)))return fail();return s;
}
/** Match PostgreSQL decimal addition of the exact JSON numeric literals. */
export function milkWeighingTotal(a:number|null,b:number|null):number{
 const decimal=(n:number)=>{const [m,e='0']=String(n).toLowerCase().split('e'),parts=m.split('.');return {value:BigInt(parts.join('')),scale:(parts[1]?.length??0)-Number(e)};};
 const x=decimal(a??0),y=decimal(b??0),scale=Math.max(x.scale,y.scale,0),v=x.value*10n**BigInt(scale-x.scale)+y.value*10n**BigInt(scale-y.scale);const digits=v.toString().padStart(scale+1,'0'),result=Number(scale?digits.slice(0,-scale)+'.'+digits.slice(-scale):digits);if(!Number.isFinite(result))return fail();return result;
}
export function milkWeighingIntent(x:unknown):MilkWeighingIntent{
 if(!keys(x,['version','year','month','cells','captureId'])||x.version!==1||!Number.isInteger(x.year)||Number(x.year)<2020||Number(x.year)>2100||!Number.isInteger(x.month)||Number(x.month)<1||Number(x.month)>12||!nullable(x.captureId,uuid)||!Array.isArray(x.cells)||!x.cells.length||x.cells.length>2000||new TextEncoder().encode(JSON.stringify(x)).length>2097152)return fail();
 for(const c of x.cells){if(!keys(c,['animalId','date','am','pm','observed'])||!uuid(c.animalId)||!date(c.date)||Number(c.date.slice(0,4))!==x.year||Number(c.date.slice(5,7))!==x.month||!nullable(c.am,v=>num(v)&&v>=0)||!nullable(c.pm,v=>num(v)&&v>=0)||(c.am===null&&c.pm===null)||!nullable(c.observed,milkRow))return fail();milkWeighingTotal(c.am as number|null,c.pm as number|null);}
 if(new Set(x.cells.map(c=>c.animalId+'|'+c.date)).size!==x.cells.length)return fail();return x as unknown as MilkWeighingIntent;
}
const captureKeys=['id','creado_en','actualizado_en','tipo','origen','desenlace','anio','mes','fecha','storage_bucket','storage_prefijo','storage_rutas','storage_ok','fotos_recibidas','modelo','celdas_leidas_ocr','celdas_confirmadas','filas_escritas','detalle','created_by'];
function validatePlan(p:MilkWeighingIntent,s:MilkWeighingSnapshot,x:unknown,owner:string,origin:'web'|'telegram'):MilkWeighingPlan{
 if(!keys(x,['weekday','accepted','rejected','capture'])||!Array.isArray(x.accepted)||!Array.isArray(x.rejected)||!x.accepted.length)return fail();
 const config=s.config.find(c=>c.clave==='dia_pesaje_semanal')?.valor;if(!record(config)||!Number.isInteger(config.iso)||Number(config.iso)<1||Number(config.iso)>7||x.weekday!==config.iso)return fail();
 const accepted:MilkWeighingPlan['accepted']=[],rejected:MilkWeighingPlan['rejected']=[];let index=0;const reserved=new Set(s.rows.map(r=>r.id));
 for(const cell of p.cells){const old=s.rows.find(r=>r.animal_id===cell.animalId&&r.fecha===cell.date)??null;if(!sameMilkWeighing(old,cell.observed))return fail();const animal=s.animals.find(a=>a.id===cell.animalId),dow=new Date(cell.date+'T00:00:00Z').getUTCDay()||7;
  if(dow!==config.iso||!animal||animal.estado!=='activa'||!['vaca','novilla'].includes(String(animal.etapa))){rejected.push({cell,reason:'current_roster_or_weekday'});continue;}
  const supplied=x.accepted[index++];if(!keys(supplied,['cell','before','after'])||!milkRow(supplied.after))return fail();let row:JsonRow;
  if(old)row={...old};else{if(reserved.has(supplied.after.id))return fail();reserved.add(supplied.after.id);row={id:supplied.after.id,animal_id:cell.animalId,fecha:cell.date,created_by:owner,created_at:null};}
  row={...row,litros_am:cell.am,litros_pm:cell.pm,litros_total:milkWeighingTotal(cell.am,cell.pm),fuente:origin};accepted.push({cell,before:old,after:row});
 }
 if(p.captureId===null){if(x.capture!==null)return fail();}else if(!keys(x.capture,captureKeys)||x.capture.id!==p.captureId||x.capture.created_by!==owner||x.capture.tipo!=='pesaje'||x.capture.origen!==origin||x.capture.desenlace!=='pendiente'||x.capture.anio!==p.year||x.capture.mes!==p.month||!time(x.capture.creado_en)||!time(x.capture.actualizado_en))return fail();
 const expected={weekday:Number(config.iso),accepted,rejected,capture:x.capture as JsonRow|null};if(!sameMilkWeighing(expected,x))return fail();return expected;
}
export function validateMilkWeighingResult(x:unknown,owner:string,key:string,intent?:MilkWeighingIntent,actor:MilkWeighingActor={origin:'web',profileId:owner}):MilkWeighingResult{
 if(!uuid(owner)||!uuid(key)||!keys(x,['version','requestKey','owner','state','intent','original','plan','effectiveDate','receipt','acknowledged'])||x.version!==1||x.owner!==owner||x.requestKey!==key||!['unknown','pending','committed','canceled'].includes(String(x.state))||typeof x.acknowledged!=='boolean'||(x.acknowledged&&!['committed','canceled'].includes(String(x.state))))return fail();
 if(x.intent===null||x.original===null||x.plan===null||x.effectiveDate===null){if(x.intent!==null||x.original!==null||x.plan!==null||x.effectiveDate!==null||!['unknown','canceled'].includes(String(x.state))||x.receipt!==null)return fail();return x as unknown as MilkWeighingResult;}
 const p=milkWeighingIntent(x.intent),s=validateMilkWeighingSnapshot(x.original);if((intent&&!sameMilkWeighing(p,intent))||!date(x.effectiveDate)||x.state==='unknown')return fail();const plan=validatePlan(p,s,x.plan,owner,actor.origin),r=x as unknown as MilkWeighingResult;
 if(r.state!=='committed'){if(r.receipt!==null)return fail();return r;}
 const q=r.receipt;if(!keys(q,['version','requestKey','owner','intent','original','plan','effectiveDate','actor','recordedAt','before','after','corrections','capture','footprints'])||q.version!==1||q.requestKey!==key||q.owner!==owner||!sameMilkWeighing(q.intent,p)||!sameMilkWeighing(q.original,s)||!sameMilkWeighing(q.plan,plan)||q.effectiveDate!==r.effectiveDate||!sameMilkWeighing(q.actor,actor)||!time(q.recordedAt)||!Array.isArray(q.corrections)||!keys(q.capture,['before','after'])||!sameMilkWeighing(q.capture.before,plan.capture)||!sameMilkWeighing(q.capture.after,plan.capture===null?null:{...plan.capture,desenlace:'ok',actualizado_en:q.recordedAt,celdas_confirmadas:p.cells.length,filas_escritas:plan.accepted.length,detalle:null})||!keys(q.footprints,['before','after'])||![q.footprints.before,q.footprints.after].every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)))return fail();
 const after=plan.accepted.map(a=>a.before?a.after:{...a.after,created_at:q.recordedAt}),before=plan.accepted.flatMap(a=>a.before?[a.before]:[]);if(!sameMilkWeighing(q.after,after)||!sameMilkWeighing(q.before,before))return fail();
 const changes=plan.accepted.filter(a=>a.before&&!sameMilkWeighing(a.before,a.after));if(q.corrections.length!==changes.length||new Set(q.corrections.map(t=>t.id)).size!==q.corrections.length)return fail();
 for(const a of changes){if(q.corrections.filter(t=>keys(t,['id','tabla','fila_id','animal_id','operacion','datos_anteriores','datos_nuevos','corregido_por','corregido_en','motivo'])&&uuid(t.id)&&t.tabla==='hato_pesajes_leche'&&t.fila_id===a.before!.id&&t.animal_id===a.cell.animalId&&t.operacion==='update'&&sameMilkWeighing(t.datos_anteriores,a.before)&&sameMilkWeighing(t.datos_nuevos,a.after)&&t.corregido_por===owner&&t.corregido_en===q.recordedAt&&t.motivo===null).length!==1)return fail();}
 return r;
}
export async function milkWeighingWeb(c:MilkWeighingClient,owner:string,key:string,mode:'prepare'|'post'|'status'|'resolve'|'acknowledge',intent:MilkWeighingIntent|null=null,expected?:MilkWeighingResult){
 if(!uuid(owner)||!uuid(key)||!['prepare','post','status','resolve','acknowledge'].includes(mode)||(mode==='prepare'?intent===null:intent!==null))return fail();if(intent)milkWeighingIntent(intent);const r=await c.rpc('fn_hato_milk_weighing_web',{p_action:mode,p_request_key:key,p_intent:intent,p_expected_owner:owner});if(r.error)throw Error('Resultado desconocido. Verifique el pesaje original antes de continuar.');const result=validateMilkWeighingResult(r.data,owner,key,expected?.intent??intent??undefined);
 if(expected&&expected.state!=='unknown'&&(!sameMilkWeighing(result.original,expected.original)||!sameMilkWeighing(result.plan,expected.plan)||result.effectiveDate!==expected.effectiveDate||(['committed','canceled'].includes(expected.state)&&!sameMilkWeighing({...result,acknowledged:expected.acknowledged},expected))||(expected.acknowledged&&!result.acknowledged)))return fail();return result;
}
export async function recoverMilkWeighingWeb(c:MilkWeighingClient,owner:string):Promise<MilkWeighingResult|null>{if(!uuid(owner))return fail();const r=await c.rpc('fn_hato_milk_weighing_recover_web',{p_expected_owner:owner});if(r.error)throw Error('Verifique el pesaje original antes de continuar.');if(r.data===null)return null;if(!record(r.data)||!uuid(r.data.requestKey))return fail();const result=validateMilkWeighingResult(r.data,owner,r.data.requestKey);if(result.acknowledged||!['pending','committed'].includes(result.state))return fail();return result;}
export async function milkWeighingSource(c:MilkWeighingClient,owner:string):Promise<MilkWeighingSnapshot>{if(!uuid(owner))return fail();const r=await c.rpc('fn_hato_milk_weighing_source_web',{p_expected_owner:owner});if(r.error)return fail();return validateMilkWeighingSnapshot(r.data);}
