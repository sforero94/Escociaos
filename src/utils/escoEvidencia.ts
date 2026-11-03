import {NUCLEO_DEFINITIONS,NUCLEO_DERIVATIONS,NUCLEO_STATUSES,NUCLEO_PLANNED_METRICS,NUCLEO_SCOPE_RULES,NUCLEO_FIELDS,NUCLEO_REF_METRICS,type NucleoOperation} from './escoNucleoDefiniciones';
/** Internal factual contract. Validation grants no access and attests no physical truth. */
export const CLOCK_ESCO = 'America/Bogota' as const;
export type CoverageState = 'complete' | 'partial' | 'unknown';
export type Origin = 'recorded' | 'planned' | 'derived';
export type Operation = 'labor.by_lot' | 'inventory.status' | 'climate.rainfall' | 'application.execution' | 'milk.production' | 'finance.records' | NucleoOperation;
export const ENTITY_KINDS=['lot','application','product','animal','station','record','location','farm','paddock','sublot','pest','client','supplier','purchase','movement','task','harvest','shipment'] as const;
export type Entity = {kind:typeof ENTITY_KINDS[number];id:string;label:string};
export interface Scope {
 id:string; operation:Operation; entities:Entity[];
 period:null|{from:string;to:string;referenceDay:string;clock:typeof CLOCK_ESCO;basis:'actual'|'planned'|'observation'|'recorded_at';fieldMeaning:string};
 filters:Record<string,string|string[]>;
}
export interface Coverage {
 populationId:string; population:CoverageState; values:CoverageState; rowsRead:number; expectedRows:number|null;
 missingValues:number; identityUnique:boolean; consistency:'single_read'|'stable_count_pages'|'not_attested'; reasons:string[];
}
/** Created by the trusted read port, never parsed from a model or the envelope. */
export interface PopulationProof {
 populationId:string;scopeId:string;tool:string;fields:readonly string[];capturedAt:string;
 population:CoverageState;rowsRead:number;expectedRows:number|null;identityUnique:boolean;
 consistency:Coverage['consistency'];
}
export type Value = {kind:'decimal';value:string;unit:string;denominator?:string}|{kind:'date';value:string}|{kind:'status';value:string}|{kind:'unknown';reason:string};
export type Assertion = 'record_value'|'scoped_total'|'verified_subtotal'|'record_count'|'bounded_empty'|'derived_measure';
export interface Fact {
 id:string;scopeId:string;metric:Metric;definitionId:string;entities:Array<Pick<Entity,'kind'|'id'>>;value:Value;origin:Origin;coverage:Coverage;
 source:{tool:string;field:string;capturedAt:string};assertion:Assertion;
 derivation?:{operation:'sum'|'mean'|'count'|'calendar_gaps'|'compare_dates'|'ratio'|'latest'|'group_events'|'min'|'max'|'difference'|'dedupe_max_sum'|'configured_band';inputs:Array<{factId:string}|{populationId:string;field:string}>};
}
export interface Evidence {version:1;state:'ok'|'partial'|'error';scopes:Scope[];facts:Fact[];issues:Array<{partId:string;code:string}>}
export interface AnswerPart {partId:string;state:'answered'|'partial'|'clarify'|'unavailable'|'unsupported';factIds:string[];issueCode?:string}
export const DEFINITIONS = {
 ...NUCLEO_DEFINITIONS,
 'labor.cost':{operation:'labor.by_lot',field:'costo_jornal',unit:'COP',label:'Costo registrado',tool:'get_labor_summary'},
 'labor.journals':{operation:'labor.by_lot',field:'fraccion_jornal',unit:'jornal',label:'Jornales registrados',tool:'get_labor_summary'},
 'labor.count':{operation:'labor.by_lot',field:'id',unit:'registro',label:'Registros de trabajo',tool:'get_labor_summary'},
 'inventory.stock':{operation:'inventory.status',field:'cantidad_actual',unit:'catalog',label:'Saldo registrado',tool:'get_inventory_status'},
 'inventory.minimum':{operation:'inventory.status',field:'stock_minimo',unit:'catalog',label:'Mínimo registrado',tool:'get_inventory_status'},
 'inventory.count':{operation:'inventory.status',field:'id',unit:'registro',label:'Productos consultados',tool:'get_inventory_status'},
 'climate.rain':{operation:'climate.rainfall',field:'lluvia_total_mm',unit:'mm',label:'Lluvia medida',tool:'get_climate_data'},
 'climate.missing_days':{operation:'climate.rainfall',field:'fecha',unit:'dia',label:'Días sin dato verificable',tool:'get_climate_data'},
 'application.cost':{operation:'application.execution',field:'costo_jornal',unit:'COP',label:'Costo registrado',tool:'get_aplicaciones_ejecucion'},
 'application.quantity':{operation:'application.execution',field:'cantidad_utilizada',unit:'catalog',label:'Consumo registrado',tool:'get_aplicaciones_ejecucion'},
 'application.status':{operation:'application.execution',field:'estado',unit:'status',label:'Estado registrado',tool:'get_aplicaciones_ejecucion'},
 'application.count':{operation:'application.execution',field:'id',unit:'registro',label:'Aplicaciones coincidentes en registros',tool:'get_aplicaciones_ejecucion'},
 'application.actual_start':{operation:'application.execution',field:'fecha_inicio_ejecucion',unit:'date',label:'Inicio real registrado',tool:'get_aplicaciones_ejecucion'},
 'application.actual_end':{operation:'application.execution',field:'fecha_fin_ejecucion',unit:'date',label:'Fin real registrado',tool:'get_aplicaciones_ejecucion'},
 'application.planned_start':{operation:'application.execution',field:'fecha_inicio_planeada',unit:'date',label:'Inicio planeado registrado',tool:'get_aplicaciones_ejecucion'},
 'application.planned_end':{operation:'application.execution',field:'fecha_fin_planeada',unit:'date',label:'Fin planeado registrado',tool:'get_aplicaciones_ejecucion'},
 'application.start_comparison':{operation:'application.execution',field:'fecha_inicio_ejecucion',unit:'status',label:'Comparación de inicios registrados',tool:'get_aplicaciones_ejecucion'},
 'application.end_comparison':{operation:'application.execution',field:'fecha_fin_ejecucion',unit:'status',label:'Comparación de finales registrados',tool:'get_aplicaciones_ejecucion'},
 'milk.mean':{operation:'milk.production',field:'promedio_litros',unit:'L/pesaje',label:'Promedio por pesaje observado',tool:'get_hato_produccion'},
 'milk.count':{operation:'milk.production',field:'num_pesajes',unit:'registro',label:'Pesajes observados',tool:'get_hato_produccion'},
 'milk.volume':{operation:'milk.production',field:'litros_total',unit:'L',label:'Litros de pesajes observados',tool:'get_hato_produccion'},
 'finance.recorded':{operation:'finance.records',field:'valor',unit:'COP',label:'Valor registrado (no acredita cobro)',tool:'get_financial_summary'},
} as const;
export type Metric = keyof typeof DEFINITIONS;
export const REASONS=['missing_value','unknown_unit','incomplete_population','duplicate_identity','invalid_value','outside_scope','unsupported_operation','scope_ambiguous','missing_count','unstable_count','context_unavailable','source_error','calendar_missing','budget_exceeded','not_observed','no_direct_evidence'] as const;
const reason=(v:unknown)=>typeof v==='string'&&(REASONS as readonly string[]).includes(v);
const OPERATIONS:Record<Metric,readonly string[]>={
 ...NUCLEO_DERIVATIONS,
 'labor.cost':['sum'],'labor.journals':['sum'],'labor.count':['count'],
 'inventory.stock':[],'inventory.minimum':[],'inventory.count':['count'],
 'climate.rain':['sum'],'climate.missing_days':['calendar_gaps'],
 'application.cost':['sum'],'application.quantity':['sum'],'application.status':[],'application.count':['count'],
 'application.actual_start':[],'application.actual_end':[],'application.planned_start':[],'application.planned_end':[],
 'application.start_comparison':['compare_dates'],'application.end_comparison':['compare_dates'],
 'milk.mean':['mean'],'milk.count':['count'],'milk.volume':['sum'],'finance.recorded':['sum'],
};
export const FIELDS:Record<Operation,readonly string[]> = {
 ...NUCLEO_FIELDS,
 'labor.by_lot':['fecha_trabajo'],'inventory.status':[],'climate.rainfall':['fecha'],
 'application.execution':['fecha_inicio_ejecucion','fecha_inicio_planeada','fecha_movimiento'],
 'milk.production':['fecha'],'finance.records':['fecha'],
};
const states=['complete','partial','unknown'];
const id=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=128&&v.trim()===v&&[...v].every(ch=>ch.charCodeAt(0)>=32&&ch.charCodeAt(0)!==127);
export function fechaValida(v:unknown):v is string {
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
 const d=new Date(v+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.getUTCFullYear()===Number(v.slice(0,4))&&d.getUTCMonth()+1===Number(v.slice(5,7))&&d.getUTCDate()===Number(v.slice(8,10));
}
export function decimalValido(v:unknown):v is string {return typeof v==='string'&&/^-?\d{1,24}(?:\.\d{1,18})?$/.test(v);}
function scopeInterno(s:Scope):boolean {
 if(!s||!id(s.id)||!Object.prototype.hasOwnProperty.call(FIELDS,s.operation)||!Array.isArray(s.entities)||s.entities.length>200||!s.entities.every(e=>e&&id(e.id)&&(ENTITY_KINDS as readonly string[]).includes(e.kind)&&typeof e.label==='string'&&e.label.length<=128)||new Set(s.entities.map(e=>e.kind+':'+e.id)).size!==s.entities.length||!s.filters||typeof s.filters!=='object'||Array.isArray(s.filters)||Object.entries(s.filters).length>12||!Object.entries(s.filters).every(([k,v])=>id(k)&&(id(v)||(Array.isArray(v)&&v.length<=200&&v.every(id)))))return false;
 const rule=(NUCLEO_SCOPE_RULES as Partial<Record<Operation,{nullable:boolean;bases:readonly string[]}>>)[s.operation];
 if(s.period===null)return !!rule?.nullable||['inventory.status','application.execution'].includes(s.operation);
 const p=s.period;if(!p||!fechaValida(p.from)||!fechaValida(p.to)||!fechaValida(p.referenceDay)||p.from>p.to||p.clock!==CLOCK_ESCO||!FIELDS[s.operation].includes(p.fieldMeaning))return false;
 if(rule)return rule.bases.includes(p.basis);
 return s.operation==='labor.by_lot'?p.basis==='actual':s.operation==='inventory.status'?false:s.operation==='climate.rainfall'||s.operation==='milk.production'?p.basis==='observation':s.operation==='finance.records'?p.basis==='recorded_at':p.fieldMeaning==='fecha_inicio_planeada'?p.basis==='planned':p.basis==='actual';
}
function coberturaInterna(c:Coverage):boolean {
 return !!c&&id(c.populationId)&&states.includes(c.population)&&states.includes(c.values)&&Number.isSafeInteger(c.rowsRead)&&c.rowsRead>=0&&c.rowsRead<=20000&&(c.expectedRows===null||(Number.isSafeInteger(c.expectedRows)&&c.expectedRows>=c.rowsRead))&&Number.isSafeInteger(c.missingValues)&&c.missingValues>=0&&c.missingValues<=c.rowsRead&&typeof c.identityUnique==='boolean'&&['single_read','stable_count_pages','not_attested'].includes(c.consistency)&&Array.isArray(c.reasons)&&c.reasons.length<=20&&c.reasons.every(reason)
 &&(c.population!=='complete'||(c.identityUnique&&c.expectedRows===c.rowsRead&&c.consistency!=='not_attested'))&&(c.values!=='complete'||c.missingValues===0);
}
function hechoInterno(f:Fact,s:Scope,populations:readonly PopulationProof[]):boolean {
 if(!f||!validarScope(s)||f.scopeId!==s.id||!id(f.id)||!Object.prototype.hasOwnProperty.call(DEFINITIONS,f.metric)||!validarCobertura(f.coverage))return false;
 const d=DEFINITIONS[f.metric];if(d.operation!==s.operation||f.definitionId!==f.metric+'.v1'||!f.source||f.source.tool!==d.tool||f.source.field!==d.field||typeof f.source.capturedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(f.source.capturedAt)||!Number.isFinite(Date.parse(f.source.capturedAt))||!['recorded','planned','derived'].includes(f.origin))return false;
 const proof=populations.find(p=>p.populationId===f.coverage.populationId&&p.scopeId===s.id);
 if(!proof||proof.tool!==f.source.tool||!proof.fields.includes(f.source.field)||proof.capturedAt!==f.source.capturedAt||proof.population!==f.coverage.population||proof.rowsRead!==f.coverage.rowsRead||proof.expectedRows!==f.coverage.expectedRows||proof.identityUnique!==f.coverage.identityUnique||proof.consistency!==f.coverage.consistency)return false;
 if(!Array.isArray(f.entities)||f.entities.length>200||f.entities.some(e=>!e||!id(e.id)||!(ENTITY_KINDS as readonly string[]).includes(e.kind))||new Set(f.entities.map(e=>e.kind+':'+e.id)).size!==f.entities.length)return false;
 if(s.entities.some(e=>!f.entities.some(x=>x.kind===e.kind))||f.entities.some(e=>s.entities.some(x=>x.kind===e.kind)&&!s.entities.some(x=>x.kind===e.kind&&x.id===e.id)))return false;
 if(!['record_value','scoped_total','verified_subtotal','record_count','bounded_empty','derived_measure'].includes(f.assertion)||!f.value)return false;
 if(f.value.kind==='unknown'){if(!reason(f.value.reason))return false;}
 else if(f.value.kind!==(d.unit==='status'?'status':d.unit==='date'?'date':'decimal'))return false;
 if(f.value.kind==='decimal'){
  if(!decimalValido(f.value.value)||(d.unit==='catalog'?!id(f.value.unit):d.unit==='catalog_price'?!(f.value.unit.startsWith('COP/')&&id(f.value.unit.slice(4))):f.value.unit!==d.unit))return false;
  if(f.metric==='milk.mean'&&f.value.denominator!=='pesaje_observado')return false;
 }else if(f.value.kind==='date'){if(d.unit!=='date'||!fechaValida(f.value.value))return false;}
 else if(f.value.kind==='status'){if(d.unit!=='status'||!((NUCLEO_STATUSES as Partial<Record<Metric,readonly string[]>>)[f.metric]??(f.metric.endsWith('_comparison')?['Iguales','Diferentes']:['Calculada','En ejecución','Cerrada'])).includes(f.value.value))return false;}
 else if(f.value.kind!=='unknown')return false;
 const planned=f.metric==='application.planned_start'||f.metric==='application.planned_end'||(NUCLEO_PLANNED_METRICS as readonly string[]).includes(f.metric);
 if(planned?f.origin!=='planned':f.origin==='planned')return false;
 if(f.value.kind!=='unknown'&&f.assertion==='scoped_total'&&(f.coverage.population!=='complete'||f.coverage.values!=='complete'))return false;
 if(f.value.kind!=='unknown'&&f.assertion==='verified_subtotal'&&(f.coverage.rowsRead===0||f.coverage.missingValues>=f.coverage.rowsRead||f.coverage.values==='unknown'))return false;
 if(f.value.kind!=='unknown'&&['record_count','bounded_empty'].includes(f.assertion)&&(f.coverage.population!=='complete'||f.value.kind!=='decimal'||!(f.value.unit==='registro'||f.metric==='ganado.movement.count'&&f.value.unit==='evento')||f.value.value!==String(f.coverage.expectedRows)))return false;
 if(f.value.kind!=='unknown'&&f.assertion==='bounded_empty'&&f.coverage.expectedRows!==0)return false;
 if(f.value.kind!=='unknown'&&f.assertion==='record_value'&&f.coverage.values!=='complete')return false;
 if((f.origin==='derived'||f.assertion==='derived_measure'||f.assertion==='scoped_total')&&!f.derivation)return false;
 if(f.derivation&&(!OPERATIONS[f.metric].includes(f.derivation.operation)||!Array.isArray(f.derivation.inputs)||!f.derivation.inputs.length||f.derivation.inputs.length>200||f.derivation.inputs.some(x=>!x||typeof x!=='object'||('factId'in x?!id(x.factId):!id(x.populationId)||!id(x.field)))))return false;
 if(f.derivation&&new Set(f.derivation.inputs.map(x=>JSON.stringify(x))).size!==f.derivation.inputs.length)return false;
 return true;
}
/** Structural/semantic checking; supplied expected scopes must come from trusted request resolution. */
function evidenciaInterna(e:Evidence,expected:Scope[],populations:readonly PopulationProof[]):boolean {
 if(!e||e.version!==1||!['ok','partial','error'].includes(e.state)||!Array.isArray(e.scopes)||e.scopes.length>20||!e.scopes.every(validarScope)||new Set(e.scopes.map(s=>s.id)).size!==e.scopes.length||!Array.isArray(e.facts)||e.facts.length>400||!Array.isArray(e.issues)||e.issues.length>40||e.issues.some(i=>!i||!id(i.partId)||!reason(i.code)))return false;
 if(e.scopes.some(s=>!expected.some(x=>JSON.stringify(x)===JSON.stringify(s))))return false;
 const ids=new Map(e.facts.map(f=>[f.id,f]));if(ids.size!==e.facts.length)return false;
 for(const f of e.facts){const s=e.scopes.find(s=>s.id===f.scopeId);if(!s||!hechoElegible(f,s,populations))return false;
  for(const input of f.derivation?.inputs??[]){if('factId'in input){const x=ids.get(input.factId);if(!x||x.id===f.id||x.scopeId!==f.scopeId||x.value.kind==='unknown'||x.origin==='planned'&&f.origin==='recorded')return false;
    if(JSON.stringify(x.entities)!==JSON.stringify(f.entities))return false;
    if(f.derivation?.operation==='compare_dates'){const prefix=f.metric==='application.start_comparison'?'application.actual_start':f.metric==='application.end_comparison'?'application.actual_end':null;if(!prefix||![prefix,prefix.replace('actual','planned')].includes(x.metric)||x.value.kind!=='date')return false;}
    else if(f.derivation?.operation==='mean'&&f.metric==='milk.mean'){if(!['milk.volume','milk.count'].includes(x.metric)||x.coverage.population!=='complete'||x.coverage.values!=='complete')return false;}
    else if(Object.prototype.hasOwnProperty.call(NUCLEO_DEFINITIONS,f.metric)){const refs=(NUCLEO_REF_METRICS as Partial<Record<Metric,readonly Metric[]>>)[f.metric];if(!refs?.includes(x.metric)||x.coverage.population!=='complete'||x.coverage.values!=='complete'||x.value.kind!=='decimal'||f.value.kind==='unknown')return false;}
    else if(x.metric!==f.metric||x.definitionId!==f.definitionId||x.value.kind!=='decimal'||f.value.kind!=='decimal'||x.value.unit!==f.value.unit||x.coverage.values!=='complete'||(f.assertion==='scoped_total'&&x.coverage.population!=='complete'))return false;}
   else if(input.populationId!==f.coverage.populationId||input.field!==f.source.field)return false;}
  if(f.derivation?.operation==='compare_dates'){
   const inputs=f.derivation.inputs.filter((i):i is {factId:string}=>'factId'in i).map(i=>ids.get(i.factId)!);
   if(inputs.length!==2||new Set(inputs.map(x=>x.metric)).size!==2||inputs.some(x=>x.coverage.values!=='complete')||f.value.kind!=='status'||f.value.value!==(inputs[0].value.kind==='date'&&inputs[1].value.kind==='date'&&inputs[0].value.value===inputs[1].value.value?'Iguales':'Diferentes'))return false;
  }
  if(Object.prototype.hasOwnProperty.call(NUCLEO_DEFINITIONS,f.metric)&&f.derivation?.inputs.some(i=>'factId'in i)){
   const expected=(NUCLEO_REF_METRICS as Partial<Record<Metric,readonly Metric[]>>)[f.metric];
   const inputs=f.derivation.inputs.filter((i):i is {factId:string}=>'factId'in i).map(i=>ids.get(i.factId)!);
   if(!expected||inputs.length!==expected.length||!expected.every(m=>inputs.some(x=>x.metric===m)))return false;
   if(f.derivation.operation==='ratio'){const den=inputs.find(x=>x.metric===expected[1]);if(!den||den.value.kind!=='decimal'||Number(den.value.value)<=0)return false;}
  }
  if(f.metric==='milk.mean'&&f.derivation?.operation==='mean'&&f.derivation.inputs.some(i=>'factId'in i)){
   const inputs=f.derivation.inputs.filter((i):i is {factId:string}=>'factId'in i).map(i=>ids.get(i.factId)!);
   const volume=inputs.find(x=>x.metric==='milk.volume'),count=inputs.find(x=>x.metric==='milk.count');
   if(inputs.length!==2||!volume||!count||count.value.kind!=='decimal'||!/^[1-9]\d*$/.test(count.value.value)||volume.coverage.populationId!==count.coverage.populationId)return false;
  }
 }
 // No cyclic derivation can attest itself.
 const visit=(f:Fact,path:Set<string>):boolean=>{if(path.has(f.id))return false;const next=new Set(path).add(f.id);return (f.derivation?.inputs??[]).every(i=>!('factId'in i)||visit(ids.get(i.factId)!,next));};
 return e.facts.every(f=>visit(f,new Set()));
}

export function validarScope(s:unknown):s is Scope {try{return scopeInterno(s as Scope);}catch{return false;}}
export function validarCobertura(c:unknown):c is Coverage {try{return coberturaInterna(c as Coverage);}catch{return false;}}
export function hechoElegible(f:Fact,s:Scope,populations:readonly PopulationProof[]):boolean {try{return hechoInterno(f,s,populations);}catch{return false;}}
export function validarEvidencia(e:unknown,expected:Scope[],populations:readonly PopulationProof[]):e is Evidence {try{return evidenciaInterna(e as Evidence,expected,populations);}catch{return false;}}
