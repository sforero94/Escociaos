/** Closed task/radiation/conductivity adapters. The server port owns reads and access. */
import {aggregateRadiation,getRadiationStatus,buildRadiationPeriodContext,TEXTO_ENERGIA_SOLAR,TEXTO_COBERTURA_PARCIAL} from './calculosRadiacion';
import {diasDelRango,desplazarDia} from './escoAlcance';
import {CLOCK_ESCO,DEFINITIONS,decimalValido,fechaValida,validarEvidencia,type Scope,type Fact,type Metric,type PopulationProof,type Value} from './escoEvidencia';
import {coberturaNucleo,periodoNucleo,pruebaNucleo,pruebaDerivadaNucleo,textoNucleo,unirNucleo,validarLecturaNucleo,type ContextoNucleo,type LecturaNucleo,type PuertoNucleo,type ResultadoNucleo} from './escoNucleoComun';

export const TAREAS_PROYECCION='id,codigo_tarea,nombre,estado,prioridad,lote_id,lote_ids,tipo_tarea_id,fecha_estimada_inicio,fecha_estimada_fin,fecha_inicio_real,fecha_fin_real,jornales_estimados,lote:lotes(id,nombre),tipo:tipos_tareas(id,nombre,categoria)';
export const RADIACION_PROYECCION='station_id,fecha,radiacion_wm2_avg,horas_sol_duracion,lluvia_confianza';
export const CONDUCTIVIDAD_PROYECCION='id,lote_id,fecha_monitoreo,valor_ce,ph,num_arboles,lote:lotes(id,nombre)';
const ESTADOS=['Banco','Programada','En Proceso','Completada','Cancelada'] as const;
const PRIORIDADES=['Alta','Media','Baja'] as const;
const TASK_METRICS:Metric[]=['task.status','task.priority','task.planned_start','task.planned_end','task.actual_start','task.actual_end','task.estimated_journals'];
const RAD_METRICS:Metric[]=['radiation.energy_mean','radiation.sunshine_mean','radiation.count','radiation.missing_days','radiation.band','radiation.optimal_days','radiation.low_days','radiation.high_days','radiation.partial_days'];
const CE_METRICS:Metric[]=['conductivity.mean','conductivity.min','conductivity.max','conductivity.ph_mean','conductivity.count','conductivity.band'];
const ident=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=128&&v.trim()===v&&[...v].every(c=>c.charCodeAt(0)>=32&&c.charCodeAt(0)!==127);
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const number=(v:unknown):number|null=>{if(typeof v!=='number'&&typeof v!=='string'||v===''||typeof v==='string'&&(!decimalValido(v)||v.trim()!==v))return null;const n=Number(v);return Number.isFinite(n)&&Math.abs(n)<=Number.MAX_SAFE_INTEGER?n:null;};
const decimal=(v:number):string|null=>{const text=String(Object.is(v,-0)?0:v);return decimalValido(text)?text:null;};
const unknown=(reason='missing_value'):Value=>({kind:'unknown',reason});
const val=(n:number|null,unit:string,denominator?:string):Value=>n===null||decimal(n)===null?unknown():{kind:'decimal',value:decimal(n)!,unit,...(denominator?{denominator}:{})};
const round=(n:number,places=2)=>Math.round(n*10**places)/10**places;
const label=(v:unknown,fallback:string)=>ident(v)?v:fallback;
const phrase=(text:string,selector:string)=>(' '+textoNucleo(text)+' ').includes(' '+textoNucleo(selector)+' ');
function failure(operation:Scope['operation'],metrics:Metric[],title:string,code='scope_ambiguous',suffix='unavailable'):ResultadoNucleo {
 return {scopes:[],populations:[],labels:{},parts:[{id:operation+':'+suffix,operation,scopeIds:[],metrics,label:title}],evidence:[{version:1,state:'error',scopes:[],facts:[],issues:[{partId:operation+':'+suffix,code}]}]};
}
function context(ctx:ContextoNucleo){
 if(ctx.referencePending)throw Error('scope_ambiguous');
 if(!fechaValida(ctx.referenceDay)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(ctx.startedAt)||!Number.isFinite(Date.parse(ctx.startedAt))||!['resolved','absent','open'].includes(ctx.dateState))throw Error('scope_ambiguous');
 if(ctx.period&&(!fechaValida(ctx.period.from)||!fechaValida(ctx.period.to)||ctx.period.from>ctx.period.to))throw Error('scope_ambiguous');
 if(ctx.dateState==='resolved'&&!ctx.period)throw Error('scope_ambiguous');
 if(ctx.dateState==='open'&&(!ctx.bounds||!ctx.bounds.from&&!ctx.bounds.to))throw Error('scope_ambiguous');
 for(const value of Object.values(ctx.bounds??{}))if(value!==undefined&&!fechaValida(value))throw Error('scope_ambiguous');
 if(ctx.bounds?.from&&ctx.bounds?.to&&ctx.bounds.from>ctx.bounds.to)throw Error('scope_ambiguous');
}
function argumentsClosed(args:Record<string,unknown>,allowed:readonly string[]){
 if(Object.entries(args).some(([k,v])=>!allowed.includes(k)||v!==undefined&&v!==null&&(typeof v!=='string'||!ident(v))))throw Error('outside_scope');
}
async function read(port:PuertoNucleo,ctx:ContextoNucleo,table:string,query:string,keys:readonly string[]=['id']){
 const r=await port.read(table,query,keys);
 if(!validarLecturaNucleo(r)||Date.parse(r.capturedAt)<Date.parse(ctx.startedAt)||r.identityKeys.join('|')!==keys.join('|')||r.rows.some(row=>keys.some(k=>!ident(row[k]))))throw Error('source_error');
 return r;
}
function timeFilters(ctx:ContextoNucleo,field:string){
 const bounds=ctx.period??(ctx.dateState==='open'?ctx.bounds:null);let query='';const filters:Scope['filters']={};
 if(bounds?.from){query+=`&${field}=gte.${encodeURIComponent(bounds.from)}`;if(!ctx.period)filters.date_from=bounds.from;}
 if(bounds?.to){query+=`&${field}=lte.${encodeURIComponent(bounds.to)}`;if(!ctx.period)filters.date_to=bounds.to;}
 return {query,filters,bounds};
}
function datesInRows(rows:readonly Record<string,unknown>[],field:string,ctx:ContextoNucleo){
 const bounds=ctx.period??(ctx.dateState==='open'?ctx.bounds:null);
 if(rows.some(r=>!fechaValida(r[field])||bounds?.from&&String(r[field])<bounds.from||bounds?.to&&String(r[field])>bounds.to))throw Error('outside_scope');
}
function makeFact(scope:Scope,proof:PopulationProof,metric:Metric,value:Value,missing=0,derivation?:NonNullable<Fact['derivation']>['operation'],partial=false):Fact {
 const d=DEFINITIONS[metric];const planned=['task.planned_start','task.planned_end','task.estimated_journals'].includes(metric);
 const coverage=coberturaNucleo(proof,missing,[...(missing?['missing_value']:[]),...(partial?['not_observed']:[])]);
 if(partial&&coverage.values==='complete')coverage.values='partial';
 return {id:'f:'+metric,scopeId:scope.id,metric,definitionId:metric+'.v1',entities:scope.entities.map(({kind,id})=>({kind,id})),value,
  origin:planned?'planned':derivation?'derived':'recorded',coverage,source:{tool:proof.tool,field:d.field,capturedAt:proof.capturedAt},
  assertion:metric.endsWith('.count')?'record_count':derivation==='sum'&&value.kind!=='unknown'?(missing?'verified_subtotal':'scoped_total'):derivation?'derived_measure':'record_value',
  ...(derivation?{derivation:{operation:derivation,inputs:[{populationId:proof.populationId,field:d.field}]}}:{})};
}
function frame(scope:Scope,proof:PopulationProof,facts:Fact[],title:string,labels:Record<string,string>={},issues:string[]=[]):ResultadoNucleo {
 const partial=issues.length>0||facts.some(f=>f.value.kind==='unknown'||f.coverage.values!=='complete');
 const evidence={version:1 as const,state:partial?'partial' as const:'ok' as const,scopes:[scope],facts,issues:[...new Set(issues)].map(code=>({partId:scope.id,code}))};
 if(!validarEvidencia(evidence,[scope],[proof]))throw Error('source_error');
 return {scopes:[scope],populations:[proof],evidence:[evidence],parts:[{id:scope.id,operation:scope.operation,scopeIds:[scope.id],metrics:facts.map(f=>f.metric),label:title}],labels};
}
async function lotSelector(args:Record<string,unknown>,ctx:ContextoNucleo,port:PuertoNucleo){
 if(!args.lote_name&&!/\blotes?\b/.test(textoNucleo(ctx.currentUserText)))return null;
 const catalog=await read(port,ctx,'lotes','select=id,nombre');
 if(catalog.rows.some(r=>!ident(r.nombre)))throw Error('source_error');
 const arg=args.lote_name?String(args.lote_name):'';
 const named=catalog.rows.filter(r=>phrase(ctx.currentUserText,String(r.nombre)));
 const hits=arg?catalog.rows.filter(r=>textoNucleo(r.nombre).includes(textoNucleo(arg))):named;
 if(arg&&!phrase(ctx.currentUserText,arg)&&!hits.some(r=>phrase(ctx.currentUserText,String(r.nombre))))throw Error('scope_ambiguous');
 if(hits.length>1||arg&&hits.length!==1)throw Error('scope_ambiguous');
 if(!hits.length&&/\blote\s+(?!(?:del?|en|esta|este|la|el|por|y|al)\b)[a-z0-9]/.test(textoNucleo(ctx.currentUserText)))throw Error('scope_ambiguous');
 return hits.length?{id:String(hits[0].id),label:String(hits[0].nombre)}:null;
}
function exactSum(values:readonly unknown[]):{value:string|null;missing:number}{
 let sum=0n,missing=0;
 for(const value of values){const text=typeof value==='number'?String(value):value;if(typeof value==='number'&&(!Number.isFinite(value)||Math.abs(value)>Number.MAX_SAFE_INTEGER)||!decimalValido(text)){missing++;continue;}const negative=text.startsWith('-');const [whole,fraction='']=(negative?text.substring(1):text).split('.');sum+=(negative?-1n:1n)*BigInt(whole+fraction.padEnd(18,'0'));}
 if(missing===values.length&&missing>0)return {value:null,missing};
 const sign=sum<0n?'-':'';const digits=(sum<0n?-sum:sum).toString().padStart(19,'0');const result=(sign+digits.slice(0,-18)+'.'+digits.slice(-18)).replace(/\.?0+$/,'');
 return {value:decimalValido(result)?result:null,missing};
}
async function tasks(args:Record<string,unknown>,ctx:ContextoNucleo,port:PuertoNucleo):Promise<ResultadoNucleo>{
 argumentsClosed(args,['estado','lote_name','categoria','date_from','date_to']);
 const aliases:Record<string,string[]>={Banco:['banco'],Programada:['programada','programadas','programado','programados'],'En Proceso':['en proceso','en curso','en ejecucion'],Completada:['completada','completadas','completados'],Cancelada:['cancelada','canceladas','cancelados']};
 // A negated enum is not a positive selector. Complement sets need an explicit
 // contract; clarify this part before any catalog or task read instead of guessing.
 const normalized=textoNucleo(ctx.currentUserText);
 const negated=Object.values(aliases).flat().some(alias=>new RegExp('(?:^| )(?:no|sin|excepto|excluye|omite) (?:(?:las?|los?|tareas?|labores?|que|estan|esten|sean|con|estado|incluyas|muestres|quiero|ver) )*'+alias+'(?: |$)').test(normalized));
 if(negated)throw Error('scope_ambiguous');
 const priorities=PRIORIDADES.filter(p=>phrase(normalized,'prioridad '+p)||phrase(normalized,p+' prioridad'));
 const priorityNegated=/(?:^| )(?:no|sin|excepto|excluye|omite) (?:(?:las?|los?|tareas?|labores?|que|tengan|con|de|la|incluyas|muestres|quiero|ver) )*(?:prioridad (?:alta|media|baja)|(?:alta|media|baja) prioridad)(?: |$)/.test(normalized);
 const priorityList=/\bprioridad (?:alta|media|baja) (?:y|o|ni) (?:alta|media|baja)\b/.test(normalized);
 if(priorityNegated||priorityList||priorities.length>1||/\bprioridad\b/.test(normalized)&&priorities.length!==1)throw Error('scope_ambiguous');
 const priority=priorities[0];
 const asked=ESTADOS.filter(state=>aliases[state].some(word=>phrase(ctx.currentUserText,word)));
 if(asked.length>1)throw Error('scope_ambiguous');
 if(args.estado&&!ESTADOS.includes(args.estado as typeof ESTADOS[number]))throw Error('scope_ambiguous');
 if(args.estado&&!asked.length)throw Error('scope_ambiguous');
 const state=asked[0];
 const lot=await lotSelector(args,ctx,port);
 let category:string|undefined;
 if(args.categoria){
  const selector=String(args.categoria);if(!phrase(ctx.currentUserText,selector))throw Error('scope_ambiguous');
  const catalog=await read(port,ctx,'tipos_tareas','select=id,categoria');
  const matches=[...new Set(catalog.rows.map(r=>r.categoria).filter(ident))].filter(v=>textoNucleo(v).includes(textoNucleo(selector)));
  if(matches.length!==1)throw Error('scope_ambiguous');category=matches[0];
 }
 const time=timeFilters(ctx,'fecha_estimada_inicio');
 let query='select='+TAREAS_PROYECCION+time.query;
 if(state)query+='&estado=eq.'+encodeURIComponent(state);
 if(priority)query+='&prioridad=eq.'+encodeURIComponent(priority);
 if(lot)query+='&lote_id=eq.'+encodeURIComponent(lot.id);
 const source=await read(port,ctx,'tareas',query);
 if(source.rows.some(r=>state&&r.estado!==state||priority&&r.prioridad!==priority||lot&&r.lote_id!==lot.id))throw Error('outside_scope');
 if(source.rows.some(r=>obj(r.lote).id!==undefined&&obj(r.lote).id!==r.lote_id))throw Error('source_error');
 if(ctx.period||ctx.dateState==='open')datesInRows(source.rows,'fecha_estimada_inicio',ctx);
 let selected=source.rows;
 if(category)selected=selected.filter(r=>obj(r.tipo).categoria===category);
 const filters:Scope['filters']={...time.filters,...(state?{estado:state}:{}),...(priority?{prioridad:priority}:{}),...(lot?{lote_id:lot.id}:{}),...(category?{categoria:category}:{})};
 const base:Scope={id:'tasks:all',operation:'task.status',period:periodoNucleo(ctx,'fecha_estimada_inicio','planned'),entities:[],filters};
 const summaries=(scope:Scope,rows:Record<string,unknown>[],title:string,withJournals=true)=>{
  const proof=pruebaNucleo(source,scope,'get_tareas',['id','jornales_estimados'],rows);
  const facts=[makeFact(scope,proof,'task.count',val(rows.length,'registro'),0,'count')];
  if(withJournals){const total=exactSum(rows.map(r=>r.jornales_estimados));facts.push(makeFact(scope,proof,'task.estimated_journals',total.value===null?unknown():{kind:'decimal',value:total.value,unit:'jornal'},total.missing,'sum'));}
  return frame(scope,proof,facts,title,{},selected.length>40?['budget_exceeded']:[]);
 };
 const frames=[summaries(base,selected,'Tareas registradas; jornales estimados, no ejecutados')];
 for(const status of ESTADOS){const rows=selected.filter(r=>r.estado===status);if(rows.length)frames.push(summaries({...base,id:'tasks:state:'+ESTADOS.indexOf(status),filters:{...filters,estado:status}},rows,'Estado registrado: '+status));}
 const categories=[...new Set(selected.map(r=>label(obj(r.tipo).categoria,'Sin categoría')))];
 for(const [index,category]of categories.slice(0,40).entries())frames.push(summaries({...base,id:'tasks:category:'+index,filters:{...filters,categoria:category}},selected.filter(r=>label(obj(r.tipo).categoria,'Sin categoría')===category),'Categoría registrada: '+category,false));
 for(const [index,row]of selected.slice(0,40).entries()){
  const name=label(row.nombre,String(row.id)),code=ident(row.codigo_tarea)?row.codigo_tarea:'';
  const entity={kind:'task' as const,id:String(row.id),label:label(code?code+' · '+name:name,name)};
  const scope:Scope={...base,id:'tasks:record:'+index,entities:[entity,...(ident(row.lote_id)?[{kind:'lot' as const,id:row.lote_id,label:label(obj(row.lote).nombre,row.lote_id)}]:[])]};
  const proof=pruebaNucleo(source,scope,'get_tareas',['estado','prioridad','fecha_estimada_inicio','fecha_estimada_fin','fecha_inicio_real','fecha_fin_real','jornales_estimados'],[row]);
  const facts=TASK_METRICS.map(metric=>{
   const field=DEFINITIONS[metric].field;const raw=row[field];let value:Value=unknown();
   if(metric==='task.status'&&ESTADOS.includes(raw as typeof ESTADOS[number]))value={kind:'status',value:String(raw)};
   else if(metric==='task.priority'&&PRIORIDADES.includes(raw as typeof PRIORIDADES[number]))value={kind:'status',value:String(raw)};
   else if(metric==='task.estimated_journals')value=val(number(raw),'jornal');
   else if(metric!=='task.status'&&metric!=='task.priority'&&fechaValida(raw))value={kind:'date',value:raw};
   return makeFact(scope,proof,metric,value,value.kind==='unknown'?1:0,metric==='task.estimated_journals'?'sum':undefined);
  });
  frames.push(frame(scope,proof,facts,'Tarea: '+entity.label,Object.fromEntries(scope.entities.map(e=>[e.kind+':'+e.id,e.label]))));
 }
 return unirNucleo(frames);
}

function ceFrame(source:LecturaNucleo,scope:Scope,rows:Record<string,unknown>[],title:string):ResultadoNucleo{
 const proof=pruebaNucleo(source,scope,'get_conductivity_data',['id','valor_ce','ph'],rows);
 const ce=rows.map(r=>number(r.valor_ce)),ph=rows.map(r=>number(r.ph));
 const knownCe=ce.filter((n):n is number=>n!==null),knownPh=ph.filter((n):n is number=>n!==null);
 const mean=knownCe.length?round(knownCe.reduce((a,b)=>a+b,0)/knownCe.length):null;
 const facts:Fact[]=[makeFact(scope,proof,'conductivity.count',val(rows.length,'registro'),0,'count')];
 for(const [metric,value,missing,operation]of [
  ['conductivity.mean',mean,ce.length-knownCe.length,'mean'],['conductivity.min',knownCe.length?round(Math.min(...knownCe)):null,ce.length-knownCe.length,'min'],
  ['conductivity.max',knownCe.length?round(Math.max(...knownCe)):null,ce.length-knownCe.length,'max'],['conductivity.ph_mean',knownPh.length?round(knownPh.reduce((a,b)=>a+b,0)/knownPh.length):null,ph.length-knownPh.length,'mean'],
 ]as const)facts.push(makeFact(scope,proof,metric,val(value,metric==='conductivity.ph_mean'?'pH':'dS/m','registro lote-fecha observado'),missing,operation));
 const band:Value=mean===null?unknown():{kind:'status',value:mean<0.5?'verde':mean<=1.5?'amarillo':'rojo'};
 facts.push(makeFact(scope,proof,'conductivity.band',band,ce.length-knownCe.length,'configured_band'));
 return frame(scope,proof,facts,title,Object.fromEntries(scope.entities.map(e=>[e.kind+':'+e.id,e.label])));
}
async function conductivity(args:Record<string,unknown>,ctx:ContextoNucleo,port:PuertoNucleo):Promise<ResultadoNucleo>{
 argumentsClosed(args,['lote_name','date_from','date_to']);const lot=await lotSelector(args,ctx,port);
 const time=timeFilters(ctx,'fecha_monitoreo');let query='select='+CONDUCTIVIDAD_PROYECCION+time.query;
 if(lot)query+='&lote_id=eq.'+encodeURIComponent(lot.id);
 const source=await read(port,ctx,'mon_conductividad',query);datesInRows(source.rows,'fecha_monitoreo',ctx);
 if(source.rows.some(r=>!ident(r.lote_id)||lot&&r.lote_id!==lot.id))throw Error('outside_scope');
 if(source.rows.some(r=>obj(r.lote).id!==undefined&&obj(r.lote).id!==r.lote_id))throw Error('source_error');
 const base:Scope={id:'ce:all',operation:'monitoring.conductivity',period:periodoNucleo(ctx,'fecha_monitoreo','observation'),entities:[],filters:{...time.filters,...(lot?{lote_id:lot.id}:{})}};
 const frames=[ceFrame(source,base,source.rows,'Conductividad: registros lote-fecha; clasificación configurada, no causa')];
 const globalMonths=[...new Set(source.rows.map(r=>String(r.fecha_monitoreo).substring(0,7)))].sort();
 for(const [index,month]of globalMonths.slice(0,120).entries())frames.push(ceFrame(source,{...base,id:'ce:month:'+index,filters:{...base.filters,month}},source.rows.filter(r=>String(r.fecha_monitoreo).startsWith(month)),'Tendencia mensual global de registros CE: '+month));
 const lots=[...new Set(source.rows.map(r=>String(r.lote_id)))];
 for(const [index,id]of lots.slice(0,100).entries()){
  const rows=source.rows.filter(r=>r.lote_id===id),entity={kind:'lot' as const,id,label:label(obj(rows[0].lote).nombre,id)};
  const scope={...base,id:'ce:lot:'+index,entities:[entity],filters:{...base.filters,lote_id:id}};
  frames.push(ceFrame(source,scope,rows,'Conductividad del lote; media de registros, no sensores'));
  const months=[...new Set(rows.map(r=>String(r.fecha_monitoreo).substring(0,7)))].sort();
  for(const [monthIndex,month]of months.slice(0,120).entries())frames.push(ceFrame(source,{...scope,id:`ce:lot:${index}:month:${monthIndex}`,filters:{...scope.filters,month}},rows.filter(r=>String(r.fecha_monitoreo).startsWith(month)),'Tendencia mensual CE del lote: '+month));
 }
 if(lots.length>100||globalMonths.length>120){frames[0].evidence[0].state='partial';frames[0].evidence[0].issues.push({partId:base.id,code:'budget_exceeded'});}
 return unirNucleo(frames);
}

function radiationWindow(args:Record<string,unknown>,ctx:ContextoNucleo){
 if(ctx.dateState==='open')throw Error('scope_ambiguous');
 let current=ctx.period;
 let selector=args.period===undefined?'7d':String(args.period);
 if(!['today','7d','30d','90d','ytd'].includes(selector))throw Error('scope_ambiguous');
 if(current&&!(selector==='ytd'&&['ytd','ano a la fecha','ano corrido'].some(x=>phrase(ctx.currentUserText,x))))selector='explicit';
 if(!current){
  if(selector!=='7d'&&!phrase(ctx.currentUserText,selector)&&!(selector==='ytd'&&['ano a la fecha','ano corrido'].some(x=>phrase(ctx.currentUserText,x))))throw Error('scope_ambiguous');
  // Explicitly preserve the legacy default API bounds, including both endpoint dates.
  current={from:selector==='ytd'?ctx.referenceDay.substring(0,4)+'-01-01':selector==='today'?ctx.referenceDay:desplazarDia(ctx.referenceDay,-Number(selector.slice(0,-1))),to:ctx.referenceDay};
 }
 const dates=diasDelRango(current.from,current.to);
 let previous:{from:string;to:string}|null;
 if(selector==='ytd'){
  const year=String(Number(current.from.substring(0,4))-1).padStart(4,'0');
  const from=year+current.from.substring(4),to=year+current.to.substring(4);
  previous=fechaValida(from)&&fechaValida(to)?{from,to}:null;
 }else{
  const priorDays=ctx.period?dates.length:selector==='today'?1:Number(selector.slice(0,-1));
  previous={from:desplazarDia(current.from,-priorDays),to:desplazarDia(current.from,-1)};
 }
 return {current,previous,selector};
}
function normalizedRadiation(rows:readonly Record<string,unknown>[]){
 return rows.map(r=>({fecha:String(r.fecha),radiacion_wm2_avg:number(r.radiacion_wm2_avg),horas_sol_duracion:number(r.horas_sol_duracion),lluvia_confianza:typeof r.lluvia_confianza==='string'?r.lluvia_confianza:null}));
}
function radiationFrame(source:LecturaNucleo,scope:Scope,rows:Record<string,unknown>[],title:string):ResultadoNucleo{
 const proof=pruebaNucleo(source,scope,'get_radiation_context',['fecha','radiacion_wm2_avg','horas_sol_duracion','lluvia_confianza'],rows);
 const normalized=normalizedRadiation(rows),summary=aggregateRadiation(normalized);
 const missingEnergy=normalized.filter(r=>r.radiacion_wm2_avg===null).length,missingDuration=normalized.filter(r=>r.horas_sol_duracion===null).length;
 const dates=diasDelRango(scope.period!.from,scope.period!.to);
 const observedDays=new Set(rows.map(r=>r.fecha));const gaps=dates.filter(d=>!observedDays.has(d)).length;
 const partial=summary.daysCoberturaParcial>0||gaps>0;
 const fact=(metric:Metric,value:Value,missing:number,operation:NonNullable<Fact['derivation']>['operation'],lowerBound=false)=>makeFact(scope,proof,metric,value,missing,operation,lowerBound);
 const facts:Fact[]=[
  fact('radiation.energy_mean',val(summary.avgEnergiaKwhM2,'kWh/m²/día','día observado'),missingEnergy,'mean',partial),
  fact('radiation.sunshine_mean',val(summary.avgTiempoSolHoras,'h/día','día con duración observada'),missingDuration,'mean',partial),
  fact('radiation.count',val(rows.length,'registro'),0,'count'),
  fact('radiation.missing_days',scope.entities.length?val(gaps+missingEnergy,'dia'):unknown('scope_ambiguous'),0,'calendar_gaps'),
  fact('radiation.band',summary.avgEnergiaKwhM2===null?unknown():{kind:'status',value:getRadiationStatus(summary.avgEnergiaKwhM2).band},missingEnergy,'configured_band',partial),
 ];
 for(const [metric,count]of [['radiation.optimal_days',summary.daysInOptimal],['radiation.low_days',summary.daysBelowOptimal],['radiation.high_days',summary.daysAboveOptimal]]as const){
  facts.push(fact(metric,normalized.length&&!normalized.some(r=>r.radiacion_wm2_avg!==null)?unknown():val(count,'dia'),missingEnergy,'count',partial));
 }
 facts.push(fact('radiation.partial_days',val(summary.daysCoberturaParcial,'dia'),0,'count'));
 const issues=[...(gaps?['calendar_missing']:[]),...(summary.daysCoberturaParcial?['not_observed']:[]),...(!scope.entities.length?['scope_ambiguous']:[])];
 const out=frame(scope,proof,facts,title,Object.fromEntries(scope.entities.map(e=>[e.kind+':'+e.id,e.label])),issues);
 if(summary.daysCoberturaParcial){
  out.parts[0].metrics=out.parts[0].metrics.filter(m=>m!=='radiation.partial_days');
  out.parts.push({id:scope.id+':partial',operation:scope.operation,scopeIds:[scope.id],metrics:['radiation.partial_days'],label:TEXTO_COBERTURA_PARCIAL.split('. ')[1]});
 }
 return out;
}
async function radiation(args:Record<string,unknown>,ctx:ContextoNucleo,port:PuertoNucleo):Promise<ResultadoNucleo>{
 argumentsClosed(args,['period','date_from','date_to']);
 const window=radiationWindow(args,ctx);
 const query=(p:{from:string;to:string})=>'select='+RADIACION_PROYECCION+'&fecha=gte.'+encodeURIComponent(p.from)+'&fecha=lte.'+encodeURIComponent(p.to);
 const activeCtx={...ctx,period:window.current};
 const current=await read(port,ctx,'clima_resumen_diario',query(window.current),['station_id','fecha']);
 datesInRows(current.rows,'fecha',activeCtx);
 let previous:LecturaNucleo|null=null;
 if(window.previous)try{
  previous=await read(port,ctx,'clima_resumen_diario',query(window.previous),['station_id','fecha']);
  datesInRows(previous.rows,'fecha',{...ctx,period:window.previous});
 }catch{/* The current measured part remains available; no raw error enters context. */}
 const stations=[...new Set([...current.rows,...(previous?.rows??[])].map(r=>String(r.station_id)))];
 const frames:ResultadoNucleo[]=[];
 const p=(range:{from:string;to:string},meaning='fecha'):NonNullable<Scope['period']>=>({...range,referenceDay:ctx.referenceDay,clock:CLOCK_ESCO,basis:'observation',fieldMeaning:meaning});
 if(!stations.length){
  const scope:Scope={id:'radiation:no-station',operation:'climate.radiation',period:p(window.current),entities:[],filters:{period:window.selector}};
  frames.push(radiationFrame(current,scope,[],'Radiación: lectura vacía; estación no identificada'));
 }
 for(const [index,station]of stations.slice(0,10).entries()){
  const entities=[{kind:'station' as const,id:station,label:station}];
  const scope:Scope={id:'radiation:current:'+index,operation:'climate.radiation',period:p(window.current),entities,filters:{station_id:station,period:window.selector}};
  const currentRows=current.rows.filter(r=>r.station_id===station);
  frames.push(radiationFrame(current,scope,currentRows,`Actual ${window.current.from}–${window.current.to}, ${currentRows.length} registros. ${TEXTO_ENERGIA_SOLAR.split('. ')[0]}`));
  if(!previous||!window.previous){frames.push(failure('climate.radiation',['radiation.energy_change'],'Comparación energética de '+station+': falta período previo verificable','not_observed','previous:'+index));continue;}
  const previousRows=previous.rows.filter(r=>r.station_id===station);
  const previousScope:Scope={...scope,id:'radiation:previous:'+index,period:p(window.previous),filters:{station_id:station,period:'previous'}};
  frames.push(radiationFrame(previous,previousScope,previousRows,'Radiación observada del período previo explícito'));
  const comparison:Scope={...scope,id:'radiation:comparison:'+index,period:p({from:window.previous.from,to:window.current.to},'comparison_period'),
   filters:{station_id:station,current_from:window.current.from,current_to:window.current.to,previous_from:window.previous.from,previous_to:window.previous.to}};
  const a=normalizedRadiation(currentRows),b=normalizedRadiation(previousRows);
  const delta=buildRadiationPeriodContext(a,b).delta;
  // Both full reads are validated before attesting a single derived comparison record.
  const proof=pruebaDerivadaNucleo([current,previous],comparison,'get_radiation_context',['energy_delta_kwh_m2'],1);
  const partial=[...a,...b].some(r=>r.radiacion_wm2_avg===null||r.lluvia_confianza==='cobertura_parcial')||a.length!==diasDelRango(window.current.from,window.current.to).length||b.length!==diasDelRango(window.previous.from,window.previous.to).length;
  const fact=makeFact(comparison,proof,'radiation.energy_change',val(delta,'kWh/m²/día'),delta===null?1:0,'difference',partial);
  frames.push(frame(comparison,proof,[fact],`Cambio absoluto ${window.current.from}–${window.current.to} menos ${window.previous.from}–${window.previous.to}`,{},partial?['not_observed']:[]));
 }
 if(stations.length>10)frames.push(failure('climate.radiation',RAD_METRICS,'Estaciones adicionales omitidas por presupuesto; acota la estación o el período','budget_exceeded'));
 return unirNucleo(frames);
}

/** No provider calls, external services, personnel fields or arbitrary query arguments. */
export async function ejecutarNucleoOperaciones(tool:string,args:Record<string,unknown>,ctx:ContextoNucleo,port:PuertoNucleo):Promise<ResultadoNucleo>{
 if(!['get_tareas','get_radiation_context','get_conductivity_data'].includes(tool))return failure('task.status',[],'Operación no registrada','unsupported_operation');
 const operation:Scope['operation']=tool==='get_tareas'?'task.status':tool==='get_radiation_context'?'climate.radiation':'monitoring.conductivity';
 const metrics=tool==='get_tareas'?['task.count',...TASK_METRICS]as Metric[]:tool==='get_radiation_context'?RAD_METRICS:CE_METRICS;
 try{
  context(ctx);
  if(tool==='get_tareas')return await tasks(args,ctx,port);
  if(tool==='get_radiation_context')return await radiation(args,ctx,port);
  if(tool==='get_conductivity_data')return await conductivity(args,ctx,port);
  return failure(operation,metrics,'Operación no registrada','unsupported_operation');
 }catch(error){
  const code=error instanceof Error&&['scope_ambiguous','outside_scope','budget_exceeded'].includes(error.message)?error.message:'source_error';
  return failure(operation,metrics,'Parte pendiente de verificar: '+tool,code);
 }
}
