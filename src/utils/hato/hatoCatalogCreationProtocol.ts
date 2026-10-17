import {sameAlertResponse,type JsonRow,type AlertResponseClient} from './alertResponseProtocol';
export const sameCatalogCreation=sameAlertResponse;
export type CatalogCreationIntent={version:1;kind:'lot';input:{toro_id:string;cantidad_inicial:number}}|{version:1;kind:'toro';input:{nombre:string;tipo:'monta'|'inseminacion'|null;raza:string|null;activo:boolean}};
export interface CatalogCreationPlan {table:'hato_pajillas'|'hato_toros';row:JsonRow}
export interface CatalogCreationSnapshot {toros:JsonRow[];lots:JsonRow[];uses:JsonRow[]}
export interface CatalogCreationReceipt {version:1;requestKey:string;owner:string;intent:CatalogCreationIntent;original:CatalogCreationSnapshot;plan:CatalogCreationPlan;effectiveDate:string;actor:{origin:'web';profileId:string};recordedAt:string;before:null;after:JsonRow;footprints:{before:string;after:string}}
export interface CatalogCreationResult {version:1;requestKey:string;owner:string;state:'unknown'|'pending'|'committed'|'canceled';intent:CatalogCreationIntent|null;original:CatalogCreationSnapshot|null;plan:CatalogCreationPlan|null;effectiveDate:string|null;receipt:CatalogCreationReceipt|null;acknowledged:boolean}
export type CatalogCreationClient=AlertResponseClient;
const record=(x:unknown):x is JsonRow=>!!x&&typeof x==='object'&&!Array.isArray(x);
const keys=(x:unknown,k:string[]):x is JsonRow=>record(x)&&Object.keys(x).sort().join('|')===[...k].sort().join('|');
const uuid=(x:unknown):x is string=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x);
const text=(v:unknown):v is string=>typeof v==='string'&&!!v.trim()&&v.trim()===v&&v.length<=4000;
const time=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&Number.isFinite(Date.parse(v));
const date=(x:unknown):x is string=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString()===x+'T00:00:00.000Z';
const integer=(v:unknown):v is number=>Number.isInteger(v)&&Number(v)>=0&&Number(v)<=2147483647;
const fail=():never=>{throw Error('No pude verificar la creación original. Conserve y verifique el mismo intento.');};
export function catalogCreationIntent(x:unknown):CatalogCreationIntent{
 if(!keys(x,['version','kind','input'])||x.version!==1)return fail();const v=x.input;
 if(x.kind==='lot'){if(!keys(v,['toro_id','cantidad_inicial'])||!uuid(v.toro_id)||!integer(v.cantidad_inicial))return fail();}
 else if(x.kind==='toro'){if(!keys(v,['nombre','tipo','raza','activo'])||!text(v.nombre)||(v.tipo!==null&&!['monta','inseminacion'].includes(String(v.tipo)))||(v.raza!==null&&!text(v.raza))||typeof v.activo!=='boolean')return fail();}
 else return fail();return x as unknown as CatalogCreationIntent;
}
export function expectedCatalogCreation(p:CatalogCreationIntent,owner:string,id:string):CatalogCreationPlan{
 catalogCreationIntent(p);if(!uuid(owner)||!uuid(id))return fail();return {table:p.kind==='lot'?'hato_pajillas':'hato_toros',row:{id,...p.input,...(p.kind==='lot'?{activa:true}:{}),created_at:null,created_by:owner}};
}
function rows(x:unknown,p:(r:unknown)=>boolean):x is JsonRow[]{return Array.isArray(x)&&x.every(p)&&new Set(x.map(r=>r.id)).size===x.length&&sameCatalogCreation(x,[...x].sort((a,b)=>String(a.id).localeCompare(String(b.id))));}
const toro=(x:unknown)=>keys(x,['id','nombre','tipo','raza','activo','created_at','created_by'])&&uuid(x.id)&&typeof x.nombre==='string'&&(x.tipo===null||['monta','inseminacion'].includes(String(x.tipo)))&&(x.raza===null||typeof x.raza==='string')&&typeof x.activo==='boolean'&&(x.created_by===null||uuid(x.created_by))&&(x.created_at===null||time(x.created_at));
const lot=(x:unknown)=>keys(x,['id','toro_id','cantidad_inicial','activa','created_at','created_by'])&&uuid(x.id)&&uuid(x.toro_id)&&integer(x.cantidad_inicial)&&typeof x.activa==='boolean'&&(x.created_by===null||uuid(x.created_by))&&(x.created_at===null||time(x.created_at));
const use=(x:unknown)=>keys(x,['id','pajilla_id','animal_id','fecha_uso','created_at','created_by'])&&uuid(x.id)&&uuid(x.pajilla_id)&&(x.animal_id===null||uuid(x.animal_id))&&date(x.fecha_uso)&&(x.created_by===null||uuid(x.created_by))&&(x.created_at===null||time(x.created_at));
function snapshot(x:unknown):x is CatalogCreationSnapshot{
 if(!keys(x,['toros','lots','uses'])||!rows(x.toros,toro)||!rows(x.lots,lot)||!rows(x.uses,use))return false;
 const s=x as unknown as CatalogCreationSnapshot;return s.lots.every(l=>s.toros.some(t=>t.id===l.toro_id))&&s.uses.every(u=>s.lots.some(l=>l.id===u.pajilla_id));
}
export function validateCatalogCreationResult(x:unknown,owner:string,key:string,intent?:CatalogCreationIntent):CatalogCreationResult{
 if(!uuid(owner)||!uuid(key)||!keys(x,['version','requestKey','owner','state','intent','original','plan','effectiveDate','receipt','acknowledged'])||x.version!==1||x.owner!==owner||x.requestKey!==key||!['unknown','pending','committed','canceled'].includes(String(x.state))||typeof x.acknowledged!=='boolean'||(x.acknowledged&&!['committed','canceled'].includes(String(x.state))))return fail();
 if(x.intent===null||x.original===null||x.plan===null||x.effectiveDate===null){if(x.intent!==null||x.original!==null||x.plan!==null||x.effectiveDate!==null||!['unknown','canceled'].includes(String(x.state))||x.receipt!==null)return fail();return x as unknown as CatalogCreationResult;}
 const p=catalogCreationIntent(x.intent),plan=x.plan;
 if((intent&&!sameCatalogCreation(p,intent))||!date(x.effectiveDate)||x.state==='unknown'||!snapshot(x.original)||!keys(plan,['table','row'])||!record(plan.row)||!uuid(plan.row.id)||!sameCatalogCreation(plan,expectedCatalogCreation(p,owner,plan.row.id)))return fail();
 if(p.kind==='lot'&&!x.original.toros.some(t=>t.id===p.input.toro_id&&t.activo===true))return fail();
 const reserved=plan.row as JsonRow;
 if([...x.original.toros,...x.original.lots].some(r=>r.id===reserved.id))return fail();
 const r=x as unknown as CatalogCreationResult;if(r.state!=='committed'){if(r.receipt!==null)return fail();return r;}
 const q=r.receipt;if(!keys(q,['version','requestKey','owner','intent','original','plan','effectiveDate','actor','recordedAt','before','after','footprints'])||q.version!==1||q.requestKey!==key||q.owner!==owner||!sameCatalogCreation(q.intent,p)||!sameCatalogCreation(q.original,r.original)||!sameCatalogCreation(q.plan,r.plan)||q.effectiveDate!==r.effectiveDate||!sameCatalogCreation(q.actor,{origin:'web',profileId:owner})||q.before!==null||!time(q.recordedAt)||!sameCatalogCreation(q.after,{...r.plan!.row,created_at:q.recordedAt})||!keys(q.footprints,['before','after'])||![q.footprints.before,q.footprints.after].every(s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s)))return fail();return r;
}
export async function catalogCreationWeb(c:CatalogCreationClient,owner:string,key:string,mode:'prepare'|'post'|'status'|'resolve'|'acknowledge',intent:CatalogCreationIntent|null=null,expected?:CatalogCreationResult){
 if(!uuid(owner)||!uuid(key)||!['prepare','post','status','resolve','acknowledge'].includes(mode)||(mode==='prepare'?intent===null:intent!==null))return fail();if(intent)catalogCreationIntent(intent);
 const r=await c.rpc('fn_hato_catalog_creation_web',{p_action:mode,p_request_key:key,p_intent:intent,p_expected_owner:owner});if(r.error)throw Error('Resultado desconocido. Verifique la creación original antes de continuar.');const result=validateCatalogCreationResult(r.data,owner,key,expected?.intent??intent??undefined);
 if(expected&&expected.state!=='unknown'&&(!sameCatalogCreation(result.original,expected.original)||!sameCatalogCreation(result.plan,expected.plan)||result.effectiveDate!==expected.effectiveDate||(['committed','canceled'].includes(expected.state)&&!sameCatalogCreation({...result,acknowledged:expected.acknowledged},expected))||(expected.acknowledged&&!result.acknowledged)))return fail();return result;
}
export async function recoverCatalogCreationWeb(c:CatalogCreationClient,owner:string):Promise<CatalogCreationResult|null>{if(!uuid(owner))return fail();const r=await c.rpc('fn_hato_catalog_creation_recover_web',{p_expected_owner:owner});if(r.error)throw Error('Verifique la creación original antes de continuar.');if(r.data===null)return null;if(!record(r.data)||!uuid(r.data.requestKey))return fail();const result=validateCatalogCreationResult(r.data,owner,r.data.requestKey);if(result.acknowledged||!['pending','committed'].includes(result.state))return fail();return result;}
