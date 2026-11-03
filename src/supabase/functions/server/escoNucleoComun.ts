/** Additive source interface for the selected core. No access grants, environment or network. */
import {CLOCK_ESCO,validarCobertura,validarScope,type Scope,type Evidence,type PopulationProof,type Metric} from './escoEvidencia.ts';
import type {ParteSolicitada} from './escoRespuesta.ts';
export type HerramientaNucleo='get_ganado_movimientos_detalle'|'get_ganado_inventory'|'get_produccion_calidad'|'get_monitoring_data'|'get_production_data'|'get_harvest_shipments'|'get_purchase_history'|'get_inventory_movements'|'get_tareas'|'get_radiation_context'|'get_conductivity_data';
export const HERRAMIENTAS_NUCLEO:readonly HerramientaNucleo[]=['get_ganado_movimientos_detalle','get_ganado_inventory','get_produccion_calidad','get_monitoring_data','get_production_data','get_harvest_shipments','get_purchase_history','get_inventory_movements','get_tareas','get_radiation_context','get_conductivity_data'];
export interface ContextoNucleo {
 currentUserText:string;previousUserText?:string;referencePending?:boolean;referenceDay:string;startedAt:string;channel?:'web'|'telegram';
 period:{from:string;to:string}|null;
 dateState:'resolved'|'absent'|'open'|'ambiguous'|'invalid';bounds?:{from?:string;to?:string};
 identities:{client:boolean;supplier:boolean};
 identityLabels?:{client:boolean;supplier:boolean};
}
export interface LecturaNucleo {
 rows:Record<string,unknown>[];total:number;capturedAt:string;identityKeys:readonly string[];
 complete:true;identityUnique:true;consistency:'stable_count_pages';
}
export interface PuertoNucleo {
 /** The server reads the entire registered query using exact stable counts and unique identities.
  * Query projection/order/filters come from the closed adapter, never from a model SQL argument. */
 read(table:string,queryBase:string,identityKeys?:readonly string[]):Promise<LecturaNucleo>;
 now():string;
}
export interface ResultadoNucleo {evidence:Evidence[];scopes:Scope[];populations:PopulationProof[];parts:ParteSolicitada[];labels:Record<string,string>}
export const nucleoVacio=():ResultadoNucleo=>({evidence:[],scopes:[],populations:[],parts:[],labels:{}});
export function validarLecturaNucleo(r:LecturaNucleo):boolean {
 if(!r||!Array.isArray(r.rows)||!Array.isArray(r.identityKeys)||!r.identityKeys.length||r.identityKeys.some(k=>typeof k!=='string'||!/^[_a-zA-Z][_a-zA-Z0-9]*$/.test(k)))return false;
 const keys=r.rows.map(row=>JSON.stringify(r.identityKeys.map(k=>row?.[k])));
 if(new Set(keys).size!==keys.length||r.rows.some(row=>!row||r.identityKeys.some(k=>!(typeof row[k]==='string'&&String(row[k]).length>0||typeof row[k]==='number'&&Number.isFinite(row[k])))))return false;
 return !!r&&r.complete===true&&r.identityUnique===true&&r.consistency==='stable_count_pages'&&Array.isArray(r.rows)&&r.rows.length<=20000&&r.total===r.rows.length&&Number.isSafeInteger(r.total)&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(r.capturedAt)&&Number.isFinite(Date.parse(r.capturedAt))&&Array.isArray(r.identityKeys)&&r.identityKeys.length>0;
}
/** A trusted complete read can be partitioned, but foreign or altered rows cannot inherit its coverage. */
export function pruebaNucleo(read:LecturaNucleo,scope:Scope,tool:string,fields:readonly string[],subset:readonly Record<string,unknown>[]=read.rows):PopulationProof {
 if(!validarLecturaNucleo(read)||!validarScope(scope))throw Error('source_error');
 const key=(r:Record<string,unknown>)=>JSON.stringify(read.identityKeys.map(k=>r[k]));
 const source=new Map(read.rows.map(r=>[key(r),r]));if(source.size!==read.rows.length||new Set(subset.map(key)).size!==subset.length||subset.some(r=>!source.has(key(r))||JSON.stringify(source.get(key(r)))!==JSON.stringify(r)))throw Error('source_error');
 return {populationId:scope.id+':rows',scopeId:scope.id,tool,fields,capturedAt:read.capturedAt,population:'complete',rowsRead:subset.length,expectedRows:subset.length,identityUnique:true,consistency:read.consistency};
}
/** Only domain code may call this after proving joins/group closure. A model cannot submit this shape.
 * Keeps raw source consistency separate from the number of derived logical records. */
export function pruebaDerivadaNucleo(reads:readonly LecturaNucleo[],scope:Scope,tool:string,fields:readonly string[],logicalCount:number):PopulationProof {
 if(!reads.length||!reads.every(validarLecturaNucleo)||!validarScope(scope)||!Number.isSafeInteger(logicalCount)||logicalCount<0||logicalCount>20000)throw Error('source_error');
 return {populationId:scope.id+':derived',scopeId:scope.id,tool,fields,capturedAt:reads.map(r=>r.capturedAt).sort((a,b)=>Date.parse(a)-Date.parse(b))[0],population:'complete',rowsRead:logicalCount,expectedRows:logicalCount,identityUnique:true,consistency:'stable_count_pages'};
}
export function coberturaNucleo(p:PopulationProof,missingValues=0,reasons:string[]=[]){
 const c={populationId:p.populationId,population:p.population,values:missingValues===0?'complete' as const:missingValues===p.rowsRead?'unknown' as const:'partial' as const,rowsRead:p.rowsRead,expectedRows:p.expectedRows,missingValues,identityUnique:p.identityUnique,consistency:p.consistency,reasons};
 if(!validarCobertura(c))throw Error('source_error');return c;
}
export function parteNoVerificable(scope:Scope,metrics:Metric[],label:string,code='not_observed'):ResultadoNucleo {
 return {scopes:[scope],populations:[],parts:[{id:scope.id,operation:scope.operation,scopeIds:[scope.id],metrics,label}],evidence:[{version:1,state:'error',scopes:[scope],facts:[],issues:[{partId:scope.id,code}]}],labels:{}};
}
export const unirNucleo=(frames:readonly ResultadoNucleo[]):ResultadoNucleo=>({scopes:frames.flatMap(f=>f.scopes),populations:frames.flatMap(f=>f.populations),evidence:frames.flatMap(f=>f.evidence),parts:frames.flatMap(f=>f.parts),labels:Object.assign({},...frames.map(f=>f.labels))});
export const periodoNucleo=(ctx:ContextoNucleo,fieldMeaning:string,basis:NonNullable<Scope['period']>['basis']):Scope['period']=>ctx.period?{...ctx.period,referenceDay:ctx.referenceDay,clock:CLOCK_ESCO,basis,fieldMeaning}:null;
export const textoNucleo=(s:unknown):string=>typeof s==='string'?s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim():'';
