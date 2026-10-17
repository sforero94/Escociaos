import {sameAlertResponse,type JsonRow,type AlertResponseClient} from './alertResponseProtocol';
export const sameCatalogEdit=sameAlertResponse;
export interface CatalogEditIntent {version:1;bullId:string;observedBull:{id:string;nombre:string;tipo:'monta'|'inseminacion'|null;raza:string|null;activo:boolean};changes:{nombre:string;tipo:'monta'|'inseminacion'|null;raza:string|null;activo:boolean}};
export interface CatalogEditPlan {table:'hato_toros';row:JsonRow}
export interface CatalogEditSnapshot {toros:JsonRow[];lots:JsonRow[];uses:JsonRow[]}
export interface CatalogEditReceipt {version:1;requestKey:string;owner:string;intent:CatalogEditIntent;original:CatalogEditSnapshot;plan:CatalogEditPlan;effectiveDate:string;actor:{origin:'web';profileId:string};recordedAt:string;before:JsonRow;after:JsonRow;footprints:{before:string;after:string}}
export interface CatalogEditResult {version:1;requestKey:string;owner:string;state:'unknown'|'pending'|'committed'|'canceled';intent:CatalogEditIntent|null;original:CatalogEditSnapshot|null;plan:CatalogEditPlan|null;effectiveDate:string|null;receipt:CatalogEditReceipt|null;acknowledged:boolean}
export type CatalogEditClient=AlertResponseClient;
const record=(x:unknown):x is JsonRow=>!!x&&typeof x==='object'&&!Array.isArray(x);
const keys=(x:unknown,k:string[]):x is JsonRow=>record(x)&&Object.keys(x).sort().join('|')===[...k].sort().join('|');
const uuid=(x:unknown):x is string=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x);
const text=(v:unknown):v is string=>typeof v==='string'&&!!v.trim()&&v.trim()===v&&v.length<=4000;
const time=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&Number.isFinite(Date.parse(v));
const date=(x:unknown):x is string=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString()===x+'T00:00:00.000Z';
const integer=(v:unknown):v is number=>Number.isInteger(v)&&Number(v)>=0&&Number(v)<=2147483647;
const fail=():never=>{throw Error('No pude verificar la edición original. Conserve y verifique el mismo intento.');};
export function catalogEditIntent(x:unknown):CatalogEditIntent{
 if(!keys(x,['version','bullId','observedBull','changes'])||x.version!==1||!uuid(x.bullId)||!keys(x.observedBull,['id','nombre','tipo','raza','activo'])||x.observedBull.id!==x.bullId)return fail();
 const o=x.observedBull,v=x.changes;
 if(typeof o.nombre!=='string'||typeof o.activo!=='boolean'||(o.tipo!==null&&!['monta','inseminacion'].includes(String(o.tipo)))||(o.raza!==null&&typeof o.raza!=='string')||!keys(v,['nombre','tipo','raza','activo'])||!text(v.nombre)||(v.tipo!==null&&!['monta','inseminacion'].includes(String(v.tipo)))||(v.raza!==null&&!text(v.raza))||typeof v.activo!=='boolean')return fail();
 return x as unknown as CatalogEditIntent;
}
export function expectedCatalogEdit(p:CatalogEditIntent,original:CatalogEditSnapshot):CatalogEditPlan{
 catalogEditIntent(p);const row=original.toros.find(t=>t.id===p.bullId);if(!row||!sameCatalogEdit({id:row.id,nombre:row.nombre,tipo:row.tipo,raza:row.raza,activo:row.activo},p.observedBull))return fail();return {table:'hato_toros',row:{...row,...p.changes}};
}
function rows(x:unknown,p:(r:unknown)=>boolean):x is JsonRow[]{return Array.isArray(x)&&x.every(p)&&new Set(x.map(r=>r.id)).size===x.length&&sameCatalogEdit(x,[...x].sort((a,b)=>String(a.id).localeCompare(String(b.id))));}
const toro=(x:unknown)=>keys(x,['id','nombre','tipo','raza','activo','created_at','created_by'])&&uuid(x.id)&&typeof x.nombre==='string'&&(x.tipo===null||['monta','inseminacion'].includes(String(x.tipo)))&&(x.raza===null||typeof x.raza==='string')&&typeof x.activo==='boolean'&&(x.created_by===null||uuid(x.created_by))&&(x.created_at===null||time(x.created_at));
const lot=(x:unknown)=>keys(x,['id','toro_id','cantidad_inicial','activa','created_at','created_by'])&&uuid(x.id)&&uuid(x.toro_id)&&integer(x.cantidad_inicial)&&typeof x.activa==='boolean'&&(x.created_by===null||uuid(x.created_by))&&(x.created_at===null||time(x.created_at));
const use=(x:unknown)=>keys(x,['id','pajilla_id','animal_id','fecha_uso','created_at','created_by'])&&uuid(x.id)&&uuid(x.pajilla_id)&&(x.animal_id===null||uuid(x.animal_id))&&date(x.fecha_uso)&&(x.created_by===null||uuid(x.created_by))&&(x.created_at===null||time(x.created_at));
function snapshot(x:unknown):x is CatalogEditSnapshot{
 if(!keys(x,['toros','lots','uses'])||!rows(x.toros,toro)||!rows(x.lots,lot)||!rows(x.uses,use))return false;
 const s=x as unknown as CatalogEditSnapshot;return s.lots.every(l=>s.toros.some(t=>t.id===l.toro_id))&&s.uses.every(u=>s.lots.some(l=>l.id===u.pajilla_id));
}
export function validateCatalogEditResult(x:unknown,owner:string,key:string,intent?:CatalogEditIntent):CatalogEditResult{
 if(!uuid(owner)||!uuid(key)||!keys(x,['version','requestKey','owner','state','intent','original','plan','effectiveDate','receipt','acknowledged'])||x.version!==1||x.owner!==owner||x.requestKey!==key||!['unknown','pending','committed','canceled'].includes(String(x.state))||typeof x.acknowledged!=='boolean'||(x.acknowledged&&!['committed','canceled'].includes(String(x.state))))return fail();
 if(x.intent===null||x.original===null||x.plan===null||x.effectiveDate===null){if(x.intent!==null||x.original!==null||x.plan!==null||x.effectiveDate!==null||!['unknown','canceled'].includes(String(x.state))||x.receipt!==null)return fail();return x as unknown as CatalogEditResult;}
 const p=catalogEditIntent(x.intent),plan=x.plan;
 if((intent&&!sameCatalogEdit(p,intent))||!date(x.effectiveDate)||x.state==='unknown'||!snapshot(x.original)||!keys(plan,['table','row'])||!record(plan.row)||!uuid(plan.row.id)||!sameCatalogEdit(plan,expectedCatalogEdit(p,x.original)))return fail();
 const r=x as unknown as CatalogEditResult;if(r.state!=='committed'){if(r.receipt!==null)return fail();return r;}
 const q=r.receipt;if(!keys(q,['version','requestKey','owner','intent','original','plan','effectiveDate','actor','recordedAt','before','after','footprints'])||q.version!==1||q.requestKey!==key||q.owner!==owner||!sameCatalogEdit(q.intent,p)||!sameCatalogEdit(q.original,r.original)||!sameCatalogEdit(q.plan,r.plan)||q.effectiveDate!==r.effectiveDate||!sameCatalogEdit(q.actor,{origin:'web',profileId:owner})||!sameCatalogEdit(q.before,r.original!.toros.find(t=>t.id===p.bullId))||!time(q.recordedAt)||!sameCatalogEdit(q.after,r.plan!.row)||!keys(q.footprints,['before','after'])||![q.footprints.before,q.footprints.after].every(s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s)))return fail();return r;
}
export async function catalogEditWeb(c:CatalogEditClient,owner:string,key:string,mode:'prepare'|'post'|'status'|'resolve'|'acknowledge',intent:CatalogEditIntent|null=null,expected?:CatalogEditResult){
 if(!uuid(owner)||!uuid(key)||!['prepare','post','status','resolve','acknowledge'].includes(mode)||(mode==='prepare'?intent===null:intent!==null))return fail();if(intent)catalogEditIntent(intent);
 const r=await c.rpc('fn_hato_catalog_edit_web',{p_action:mode,p_request_key:key,p_intent:intent,p_expected_owner:owner});if(r.error)throw Error('Resultado desconocido. Verifique la edición original antes de continuar.');const result=validateCatalogEditResult(r.data,owner,key,expected?.intent??intent??undefined);
 if(expected&&expected.state!=='unknown'&&(!sameCatalogEdit(result.original,expected.original)||!sameCatalogEdit(result.plan,expected.plan)||result.effectiveDate!==expected.effectiveDate||(['committed','canceled'].includes(expected.state)&&!sameCatalogEdit({...result,acknowledged:expected.acknowledged},expected))||(expected.acknowledged&&!result.acknowledged)))return fail();return result;
}
export async function recoverCatalogEditWeb(c:CatalogEditClient,owner:string):Promise<CatalogEditResult|null>{if(!uuid(owner))return fail();const r=await c.rpc('fn_hato_catalog_edit_recover_web',{p_expected_owner:owner});if(r.error)throw Error('Verifique la edición original antes de continuar.');if(r.data===null)return null;if(!record(r.data)||!uuid(r.data.requestKey))return fail();const result=validateCatalogEditResult(r.data,owner,r.data.requestKey);if(result.acknowledged||!['pending','committed'].includes(result.state))return fail();return result;}
