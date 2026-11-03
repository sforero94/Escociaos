import { DEFINITIONS, decimalValido, fechaValida, validarEvidencia, validarScope, type Evidence, type Fact, type Metric, type PopulationProof, type Scope, type Value } from './escoEvidencia.ts';
import { evidenciaFechasAplicacion, estimacionDosisCanecas, hechosEjecucionAplicacion } from './escoAplicacionHechos.ts';
import { applicationMetrics, OperationFailure, type ApplicationMetric } from './escoOperacionContrato.ts';
type Row=Record<string,unknown>;
export interface ParticionMetricaAplicacion {
 kind:'application'|'quantity'|'labor'|'theoretical';scope:Scope;rows:readonly Row[];fields:readonly string[];complete:boolean;issues:string[];metrics?:readonly ApplicationMetric[];
}
const identity=(v:unknown):v is string=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=128&&![...v].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127);
const records=(v:unknown):Row[]=>Array.isArray(v)?v.filter(r=>r&&typeof r==='object'&&!Array.isArray(r)):[];
const pick=(row:Row,fields:readonly string[]):Row=>Object.fromEntries(fields.map(k=>[k,row[k]]));
const duplicate=(rows:readonly Row[],field='id')=>new Set(rows.map(r=>r[field])).size!==rows.length||rows.some(r=>!identity(r[field]));
const error=(scope:Scope,code:string):Evidence=>({version:1,state:'error',scopes:validarScope(scope)?[scope]:[],facts:[],issues:[{partId:identity(scope?.id)?scope.id:'application',code}]});
const dateFields=['id','estado','fecha_inicio_ejecucion','fecha_fin_ejecucion','fecha_inicio_planeada','fecha_fin_planeada'];
const workFields=['id','tarea_id','lote_id','fecha_trabajo','fraccion_jornal','costo_jornal'];
const nonnegative=(v:unknown)=>{const n=estimacionDosisCanecas(v,1);return decimalValido(n)?n:null;};
const permittedUnit=(v:unknown):v is string=>identity(v)&&v.length<=32;
const atomicTheoryUnits=new Set(['cc','gramos','kg','g','l','ml','mg','kilogramos','litros','unidad','unidades']);
const theoreticalUnit=(v:unknown):v is string=>permittedUnit(v)&&atomicTheoryUnits.has(v.toLowerCase());
function windowContains(scope:Scope,row:Row,field:string):boolean {
 const from=scope.period?.from??scope.filters.date_from,to=scope.period?.to??scope.filters.date_to;
 if(from===undefined&&to===undefined)return true;
 return fechaValida(row[field])&&(from===undefined||typeof from==='string'&&row[field]>=from)&&(to===undefined||typeof to==='string'&&row[field]<=to);
}
function activityScope(scope:Scope,field:'fecha_movimiento'|'fecha_trabajo',suffix:string,extra:Scope['filters'],entities:Scope['entities']):Scope {
 const filters={...scope.filters,...extra};
 if(scope.period&&['fecha_inicio_ejecucion','fecha_inicio_planeada'].includes(scope.period.fieldMeaning)){
  filters.cohort_start_from=scope.period.from;filters.cohort_start_to=scope.period.to;filters.cohort_start_basis=scope.period.basis;
 }
 return {...scope,id:scope.id.slice(0,70)+':'+suffix,entities,filters,period:scope.period?{...scope.period,fieldMeaning:field,basis:'actual'}:null};
}
function appRecordScope(scope:Scope,row:Row):Scope {
 const membership=row.membership as Row|undefined;
 if(membership?.selection_basis!=='activity')return {...scope,entities:scope.entities.filter(e=>e.kind==='application'),filters:{aplicacion_id:String(row.id)}};
 return {...scope,entities:scope.entities.filter(e=>e.kind==='application'),period:null,filters:{aplicacion_id:String(row.id),selection_basis:'activity',...(scope.period?{date_from:scope.period.from,date_to:scope.period.to}:{})}};
}
/** Propose exact source partitions. These descriptors are not proofs or access grants.
 * The caller must attest the full fresh read and every join before constructing a proof.
 * No field from a cached facts DTO or model proposal supplies a numeric result.
 */
export function particionesMetricasAplicacion(scope:Scope,row:Row,metrics?:unknown):ParticionMetricaAplicacion[]{
 const requested=applicationMetrics(metrics);
 if(scope&&['date_from','date_to'].some(key=>scope.filters?.[key]!==undefined&&!fechaValida(scope.filters[key])))throw new OperationFailure('scope_ambiguous','scope');
 if(typeof scope?.filters?.date_from==='string'&&typeof scope.filters.date_to==='string'&&scope.filters.date_from>scope.filters.date_to)throw new OperationFailure('scope_ambiguous','scope');
 if(!validarScope(scope)||scope.operation!=='application.execution'||!row||!identity(row.id)||scope.entities.filter(e=>e.kind==='application').length!==1||scope.entities.find(e=>e.kind==='application')?.id!==row.id)throw new OperationFailure('scope_ambiguous','scope');
 if(scope.filters.aplicacion_id!==undefined&&scope.filters.aplicacion_id!==row.id)throw new OperationFailure('outside_scope','scope');
 const result:ParticionMetricaAplicacion[]=[],appEntity=scope.entities.filter(e=>e.kind==='application');
 if(requested.some(m=>['status','dates','date_comparison'].includes(m))){
  const s=appRecordScope(scope,row);
  result.push({kind:'application',scope:s,metrics:requested.filter(m=>['status','dates','date_comparison'].includes(m)),rows:[pick(row,dateFields)],fields:dateFields,complete:true,issues:[]});
 }
 const lots=scope.entities.filter(e=>e.kind==='lot').map(e=>e.id);
 const lotFilter=scope.filters.lote_id,byLot=lots.length>0||lotFilter!==undefined||scope.filters.group_by==='lot',lotIds=lots.length?lots:typeof lotFilter==='string'?[lotFilter]:Array.isArray(lotFilter)?lotFilter:null;
 const movements=records(row.movimientos),work=records(row.registros_trabajo);
 if(movements.length>20000||work.length>20000)throw new OperationFailure('budget_exceeded','budget');
 if(requested.includes('quantity')){
  const groups=new Map<string,{product:string;unit:string;lot:string;rows:Row[]}>();let incomplete=!Array.isArray(row.movimientos)||records(row.movimientos).length!==(row.movimientos as unknown[]).length||duplicate(movements);
  const consumptionIds=movements.flatMap(m=>records(m.consumos)).map(c=>c.id),seenConsumption=new Set<unknown>(),duplicateIds=new Set<unknown>();
  for(const id of consumptionIds){if(seenConsumption.has(id))duplicateIds.add(id);seenConsumption.add(id);}
  if(consumptionIds.length>20000)throw new OperationFailure('budget_exceeded','budget');
  if(duplicateIds.size)incomplete=true;
  for(const m of movements){
   if(m.aplicacion_id!==row.id||!identity(m.id)||!identity(m.lote_id)||(scope.period||scope.filters.date_from||scope.filters.date_to)&&!fechaValida(m.fecha_movimiento)){incomplete=true;continue;}
   if(!windowContains(scope,m,'fecha_movimiento')||lotIds&&!lotIds.includes(m.lote_id))continue;
   const cs=records(m.consumos);
   if(!Array.isArray(m.consumos)||!cs.length||cs.length!==(m.consumos as unknown[]).length)incomplete=true;
   for(const c of cs){
    if(c.movimiento_diario_id!==m.id||!identity(c.producto_id)||!permittedUnit(c.unidad)){incomplete=true;continue;}
    const key=JSON.stringify([c.producto_id,c.unidad,...(byLot?[m.lote_id]:[])]);
    if(!groups.has(key))groups.set(key,{product:c.producto_id,unit:c.unidad,lot:m.lote_id,rows:[]});
    groups.get(key)!.rows.push({...pick(c,['id','producto_id','unidad','cantidad_utilizada']),movimiento_id:m.id,aplicacion_id:row.id,lote_id:m.lote_id,fecha_movimiento:m.fecha_movimiento,...(duplicateIds.has(c.id)?{identity_invalid:true}:{})});
   }
  }
  if(!groups.size)result.push({kind:'quantity',scope:activityScope(scope,'fecha_movimiento','quantity:empty',{},appEntity),rows:[],fields:['cantidad_utilizada'],complete:!incomplete,issues:[incomplete?'incomplete_population':'not_observed']});
  let index=0;for(const g of groups.values())result.push({kind:'quantity',scope:activityScope(scope,'fecha_movimiento','quantity:'+index++,{producto_id:g.product,unidad:g.unit,...(byLot?{lote_id:g.lot}:{})},[...appEntity,{kind:'product',id:g.product,label:g.product},...(byLot?[{kind:'lot' as const,id:g.lot,label:g.lot}]:[])]),rows:g.rows,fields:['cantidad_utilizada'],complete:!incomplete,issues:incomplete?['incomplete_population']:[]});
 }
 if(requested.includes('labor')){
  const facts=row.hechos_ejecucion as {trabajo?:{atribucion?:unknown;tarea_id?:unknown}}|undefined;
  const exclusive=identity(row.tarea_id)&&facts?.trabajo?.atribucion==='tarea_exclusiva'&&facts.trabajo.tarea_id===row.tarea_id;
  let incomplete=!Array.isArray(row.registros_trabajo)||duplicate(work)||!identity(row.tarea_id)||(row.membership as Row|undefined)?.membership_complete===false;
  const selected=work.filter(r=>{
   if(!identity(r.id)||!identity(r.tarea_id)||r.tarea_id!==row.tarea_id||(scope.period||scope.filters.date_from||scope.filters.date_to)&&!fechaValida(r.fecha_trabajo)||lotIds&&!identity(r.lote_id)){incomplete=true;return false;}
   return windowContains(scope,r,'fecha_trabajo')&&(!lotIds||lotIds.includes(String(r.lote_id)));
  });
  const issues=[...(!exclusive?['no_direct_evidence']:[]),...(incomplete?['incomplete_population']:[])];
  result.push({kind:'labor',scope:activityScope(scope,'fecha_trabajo','labor',{tarea_id:identity(row.tarea_id)?row.tarea_id:'sin_tarea',tarea_exclusiva:exclusive?'true':'false'},[...appEntity,...scope.entities.filter(e=>e.kind==='lot')]),rows:selected.map(r=>pick(r,workFields)),fields:['fraccion_jornal','costo_jornal'],complete:!incomplete,issues});
 }
 if(requested.includes('theoretical')){
  const plans=records(row.plan_por_lote),recipes=records(row.productos_planeados);let linked=0;
  if(plans.length>20000||recipes.length>20000)throw new OperationFailure('budget_exceeded','budget');
  const badPlans=duplicate(plans),badRecipes=duplicate(recipes);
  const recipesByMix=new Map<unknown,Row[]>();for(const recipe of recipes){if(!recipesByMix.has(recipe.mezcla_id))recipesByMix.set(recipe.mezcla_id,[]);recipesByMix.get(recipe.mezcla_id)!.push(recipe);}
  const planMixes=new Set(plans.filter(p=>p.aplicacion_id===row.id&&identity(p.mezcla_id)).map(p=>p.mezcla_id));
  for(const plan of plans)for(const recipe of recipesByMix.get(plan.mezcla_id)??[]){
   if(result.length>=100)throw new OperationFailure('budget_exceeded','budget');
   if(plan.aplicacion_id!==row.id||!identity(plan.mezcla_id)||recipe.mezcla_id!==plan.mezcla_id)continue;
   if(lotIds&&!lotIds.includes(String(plan.lote_id)))continue;
   if(!identity(plan.lote_id)||!identity(recipe.producto_id))continue;
   const unique=!badPlans&&!badRecipes&&plans.filter(p=>p.mezcla_id===plan.mezcla_id&&p.lote_id===plan.lote_id).length===1&&recipes.filter(r=>r.mezcla_id===recipe.mezcla_id&&r.producto_id===recipe.producto_id).length===1;
   const entities=[...appEntity,{kind:'product' as const,id:recipe.producto_id,label:recipe.producto_id},{kind:'lot' as const,id:plan.lote_id,label:plan.lote_id}];
   result.push({kind:'theoretical',scope:{...scope,id:scope.id.slice(0,70)+':theory:'+linked++,entities,filters:{...scope.filters,producto_id:recipe.producto_id,lote_id:plan.lote_id,recipe_id:String(recipe.id),calculo_id:String(plan.id)}},rows:[{id:String(plan.id)+':'+String(recipe.id),aplicacion_id:row.id,producto_id:recipe.producto_id,lote_id:plan.lote_id,plan_id:plan.id,recipe_id:recipe.id,mezcla_id:plan.mezcla_id,unidad_dosis:recipe.unidad_dosis,dosis_por_caneca:recipe.dosis_por_caneca,numero_canecas:plan.numero_canecas}],fields:['dosis_por_caneca','numero_canecas'],complete:unique,issues:unique?[]:['incomplete_population']});
  }
  if(!linked||plans.some(p=>p.aplicacion_id!==row.id||!identity(p.mezcla_id)||!recipesByMix.has(p.mezcla_id))||recipes.some(r=>!identity(r.mezcla_id)||!planMixes.has(r.mezcla_id)))result.push({kind:'theoretical',scope:{...scope,id:scope.id.slice(0,70)+':theory:unattributed',entities:appEntity},rows:[],fields:['dosis_por_caneca','numero_canecas'],complete:false,issues:['no_direct_evidence']});
 }
 if(result.length>100)throw new OperationFailure('budget_exceeded','budget');
 return result;
}
function baseFact(part:ParticionMetricaAplicacion,proof:PopulationProof,metric:Metric,value:Value,missing:number,origin:Fact['origin'],assertion:Fact['assertion'],derivation?:Fact['derivation']):Fact {
 const reasons=[...new Set([...part.issues,...(proof.population!=='complete'?['incomplete_population']:[]),...(value.kind==='unknown'?[value.reason]:missing?['missing_value']:[])])];
 return {id:part.scope.id+':'+metric,scopeId:part.scope.id,metric,definitionId:metric+'.v1',entities:part.scope.entities.map(({kind,id})=>({kind,id})),value,origin,assertion,source:{tool:proof.tool,field:DEFINITIONS[metric].field,capturedAt:proof.capturedAt},coverage:{populationId:proof.populationId,population:proof.population,rowsRead:proof.rowsRead,expectedRows:proof.expectedRows,identityUnique:proof.identityUnique,consistency:proof.consistency,values:value.kind==='unknown'?'unknown':missing?'partial':'complete',missingValues:Math.min(proof.rowsRead,missing),reasons},...(derivation?{derivation}:{})};
}
/** Bind computed facts to an external source proof. No population is created here. */
export function evidenciaMetricaParticion(part:ParticionMetricaAplicacion,proof:PopulationProof):Evidence {
 const {scope}=part;
 if(!['application','quantity','labor','theoretical'].includes(part.kind)||!validarScope(scope)||scope.operation!=='application.execution'||scope.entities.filter(e=>e.kind==='application').length!==1||scope.filters.aplicacion_id!==undefined&&scope.filters.aplicacion_id!==scope.entities.find(e=>e.kind==='application')?.id||!proof||proof.scopeId!==scope.id||proof.rowsRead!==part.rows.length||proof.tool!=='get_aplicaciones_ejecucion'||part.complete===false&&proof.population==='complete'||proof.identityUnique&&duplicate(part.rows)||part.fields.some(f=>!proof.fields.includes(f)))return error(scope,'source_error');
 if(part.kind==='application'){
  const requested=applicationMetrics(part.metrics);
  const e=evidenciaFechasAplicacion(scope,{rows:part.rows,proof});
  const selected=(metric:string)=>metric==='application.status'?requested.includes('status'):metric.endsWith('_comparison')?requested.includes('date_comparison'):requested.includes('dates')||requested.includes('date_comparison');
  const facts=e.facts.filter(f=>selected(f.metric));
  if(e.state==='error')return {...e,scopes:[scope]};
  facts.push(baseFact(part,proof,'application.count',proof.population==='complete'?{kind:'decimal',value:String(part.rows.length),unit:'registro'}:{kind:'unknown',reason:'incomplete_population'},0,'recorded','record_count'));
  return finish(part,proof,facts);
 }
 if(part.kind==='theoretical'){
  if(part.rows.length>1||part.rows.some(r=>r.aplicacion_id!==scope.entities.find(e=>e.kind==='application')?.id||r.producto_id!==scope.entities.find(e=>e.kind==='product')?.id||r.lote_id!==scope.entities.find(e=>e.kind==='lot')?.id||r.recipe_id!==scope.filters.recipe_id||r.plan_id!==scope.filters.calculo_id))return error(scope,'outside_scope');
  const row=part.rows[0],unit=row&&theoreticalUnit(row.unidad_dosis)?row.unidad_dosis:null,dose=row?nonnegative(row.dosis_por_caneca):null,drums=row?nonnegative(row.numero_canecas):null;
  const safe=part.complete&&proof.population==='complete'&&unit!==null&&dose!==null&&drums!==null;
  const inputs=[baseFact(part,proof,'application.planned_dose',unit&&dose!==null?{kind:'decimal',value:dose,unit:unit+'/caneca'}:{kind:'unknown',reason:row&&unit===null?'unknown_unit':'missing_value'},unit===null||dose===null?part.rows.length:0,'planned','record_value'),baseFact(part,proof,'application.planned_drums',drums!==null?{kind:'decimal',value:drums,unit:'caneca'}:{kind:'unknown',reason:'missing_value'},drums===null?part.rows.length:0,'planned','record_value')];
  const computed=safe?estimacionDosisCanecas(dose,drums):null,product=decimalValido(computed)?computed:null;
  const output=baseFact(part,proof,'application.theoretical_quantity',product!==null?{kind:'decimal',value:product,unit:unit!}:{kind:'unknown',reason:safe?'invalid_value':row&&unit===null?'unknown_unit':'no_direct_evidence'},product===null?part.rows.length:0,product===null?'recorded':'derived',product===null?'record_value':'derived_measure',product===null?undefined:{operation:'multiply',inputs:inputs.map(f=>({factId:f.id}))});
  return finish(part,proof,[...inputs,output]);
 }
 const app=scope.entities.find(e=>e.kind==='application')?.id,task=scope.filters.tarea_id;
 if(!app||scope.filters.aplicacion_id!==undefined&&scope.filters.aplicacion_id!==app)return error(scope,'outside_scope');
 const declaredLots=scope.entities.filter(e=>e.kind==='lot').map(e=>e.id),filterLots=typeof scope.filters.lote_id==='string'?[scope.filters.lote_id]:scope.filters.lote_id;
 if(declaredLots.length&&filterLots&&JSON.stringify([...declaredLots].sort())!==JSON.stringify([...filterLots].sort()))return error(scope,'outside_scope');
 const exactLots=declaredLots.length?declaredLots:filterLots??[];
 if(part.kind==='quantity'&&part.rows.length&&scope.filters.producto_id!==scope.entities.find(e=>e.kind==='product')?.id)return error(scope,'outside_scope');
 if(part.kind==='quantity'&&part.rows.some(r=>r.aplicacion_id!==app||r.producto_id!==scope.entities.find(e=>e.kind==='product')?.id||r.unidad!==scope.filters.unidad||!identity(r.lote_id)||exactLots.length>0&&!exactLots.includes(String(r.lote_id))||!windowContains(scope,r,'fecha_movimiento')))return error(scope,'outside_scope');
 if(part.kind==='labor'&&part.rows.some(r=>r.tarea_id!==task||!windowContains(scope,r,'fecha_trabajo')||exactLots.length>0&&!exactLots.includes(String(r.lote_id))))return error(scope,'outside_scope');
 const aggregateScope:{aplicacionId:string;tareaId:string|null;tareaExclusiva:boolean;desde:string|null;hasta:string|null;loteIds:string[]|null;consultaCompleta:boolean;baseSeleccion:'actual'}={aplicacionId:app,tareaId:typeof task==='string'&&task!=='sin_tarea'?task:null,tareaExclusiva:scope.filters.tarea_exclusiva==='true',desde:scope.period?.from??null,hasta:scope.period?.to??null,loteIds:exactLots,consultaCompleta:part.complete&&proof.population==='complete',baseSeleccion:'actual' as const};
 if(!aggregateScope.loteIds?.length)aggregateScope.loteIds=null;
 const movements=part.kind==='quantity'?Array.from(new Set(part.rows.map(r=>r.movimiento_id))).map(id=>{const rows=part.rows.filter(r=>r.movimiento_id===id),r=rows[0];return{id,aplicacion_id:app,lote_id:r.lote_id,fecha_movimiento:r.fecha_movimiento,consumos:rows.map(c=>({...pick(c,['producto_id','unidad','cantidad_utilizada']),id:c.identity_invalid?null:c.id}))};}):[];
 const calculated=hechosEjecucionAplicacion(movements,part.kind==='labor'?[...part.rows]:[],aggregateScope);
 const metrics:Metric[]=part.kind==='quantity'?['application.quantity']:['application.journals','application.cost'];
 const facts=metrics.map(metric=>{
  const product=calculated.consumos.productos[0],work=calculated.trabajo,attribute=part.kind!=='labor'||aggregateScope.tareaExclusiva;
  const value=!attribute?null:metric==='application.quantity'?product?.cantidad_total??product?.cantidad_verificada??null:metric==='application.cost'?work.costo_total_cop??work.costo_verificado_cop:work.jornales_total??work.jornales_verificados;
  const missing=metric==='application.quantity'?(product?.registros_invalidos??part.rows.length):metric==='application.cost'?work.registros_costos_invalidos:work.registros_jornales_invalidos;
  const closed=part.complete&&proof.population==='complete'&&missing===0&&attribute;
  const unit=metric==='application.quantity'?scope.filters.unidad:DEFINITIONS[metric].unit;
  const numeric=decimalValido(value)&&typeof unit==='string';
  return baseFact(part,proof,metric,numeric?{kind:'decimal',value,unit}:{kind:'unknown',reason:!attribute?'no_direct_evidence':value!==null&&!decimalValido(value)?'invalid_value':'missing_value'},numeric?missing:part.rows.length,numeric?'derived':'recorded',numeric?closed?'scoped_total':'verified_subtotal':'record_value',numeric?{operation:'sum',inputs:[{populationId:proof.populationId,field:DEFINITIONS[metric].field}]}:undefined);
 });
 return finish(part,proof,facts);
}
function finish(part:ParticionMetricaAplicacion,proof:PopulationProof,facts:Fact[]):Evidence {
 const issues=[...new Set([...part.issues,...facts.flatMap(f=>f.coverage.reasons)])].map(code=>({partId:part.scope.id,code}));
 const e:Evidence={version:1,state:issues.length||proof.population!=='complete'?'partial':'ok',scopes:[part.scope],facts,issues};
 return validarEvidencia(e,[part.scope],[proof])?e:error(part.scope,'source_error');
}
