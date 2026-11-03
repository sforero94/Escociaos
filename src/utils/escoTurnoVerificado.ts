import {limiteNucleo} from './escoNucleoCatalogo';
import {HERRAMIENTAS_NUCLEO} from './escoNucleoComun';
import {ejecutarFuenteVerificada,type PuertoFuente,type ResultadoFuente} from './escoDispatcherVerificado';
import {componerRespuestaVerificada} from './escoRespuesta';
import {contextoParaPersistir,type ServerRequestPolicy,permitirLlamadaHerramienta} from './escoPoliticaDatos';
import {definicionEstadoRegistrado} from './escoProyeccionLegada';
import {applicationMetrics,reconciliarSolicitudAplicacion,operationFailure,type ApplicationMetric} from './escoOperacionContrato';
import {normalizarArgumentosLabor} from './escoContratoLabor';
import {analizarPropositoUsuario} from './escoReferenciaSolicitud';
import type {Evidence} from './escoEvidencia';
export interface LlamadaFuente {id?:string;function?:{name?:string;arguments?:string}}
const aliases=new Set([...HERRAMIENTAS_NUCLEO,'get_labor_summary','get_inventory_status','get_climate_data','get_aplicaciones_ejecucion','get_application_summary','get_recorded_state_definition','get_hato_produccion','get_financial_summary']);
export interface SalidaTurnoFuente {text:string;interactions:Array<{tool:string;args:Record<string,unknown>;result_summary:string}>;parts:Array<{id:string;state:string}>;retryable?:boolean;completedText?:string}
/** Distinct reads never share scope/population/fact IDs merely because they use the same tool. */
function namespace(r:ResultadoFuente,prefix:string):ResultadoFuente {
 const scope=(id:string)=>prefix+id,pop=(id:string)=>prefix+id;
 return {...r,...(r.errors?{errors:r.errors.map(error=>({...error,partId:prefix+error.partId}))}:{}),scopes:r.scopes.map(s=>({...s,id:scope(s.id)})),populations:r.populations.map(p=>({...p,populationId:pop(p.populationId),scopeId:scope(p.scopeId)})),
  parts:r.parts.map(p=>({...p,id:prefix+p.id,scopeIds:p.scopeIds.map(scope)})),
  evidence:r.evidence.map((e,ei)=>{
   // Local opaque fact keys avoid collisions without duplicating long canonical entity IDs.
   const ids=new Map(e.facts.map((f,fi)=>[f.id,prefix+'e'+ei+'f'+fi]));
   return {...e,scopes:e.scopes.map(s=>({...s,id:scope(s.id)})),facts:e.facts.map(f=>({...f,id:ids.get(f.id)!,scopeId:scope(f.scopeId),coverage:{...f.coverage,populationId:pop(f.coverage.populationId)},...(f.derivation?{derivation:{...f.derivation,inputs:f.derivation.inputs.map(i=>'factId'in i?{factId:ids.get(i.factId)!}:{populationId:pop(i.populationId),field:i.field})}}:{})})),issues:e.issues.map(i=>({...i,partId:prefix+i.partId}))};
  })};
}
export async function ejecutarLlamadasVerificadas(input:{calls:readonly LlamadaFuente[];policy:ServerRequestPolicy;port:PuertoFuente;referenceDay:string;turnStartedAt:string;excludeTools?:readonly string[];modelText?:string;requiredApplication?:{metrics:ApplicationMetric[];exclusive:boolean};laborScope?:{currentUserText:string;currentRequestText:string}}):Promise<SalidaTurnoFuente|null>{
 if(!input.requiredApplication&&!input.calls.some(c=>aliases.has(c.function?.name??'')&&!input.excludeTools?.includes(c.function?.name??'')))return null;
 const definitions:string[]=[],frames:ResultadoFuente[]=[],interactions:SalidaTurnoFuente['interactions']=[],failures:string[]=[];
 for(const [index,call]of input.calls.entries()){
  const tool=call.function?.name??'unknown';let args:Record<string,unknown>={};
  try{const parsed=JSON.parse(call.function?.arguments??'{}');if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error();args=parsed;}
  catch{failures.push('Una parte tenía argumentos no verificables.');interactions.push({tool,args:{},result_summary:JSON.stringify({error:'invalid_arguments',stage:'arguments'})});continue;}
  if(input.requiredApplication?.exclusive&&!['get_aplicaciones_ejecucion','get_application_summary','get_recorded_state_definition'].includes(tool)){
   const mutation=['propose_memory_save','commit_memory_save','forget_memory'].includes(tool);
   failures.push('Esta parte requiere registros de la aplicación solicitada, no una población de otra operación.');interactions.push({tool,args:{},result_summary:JSON.stringify({error:mutation?'unsupported_operation':'invalid_arguments',stage:mutation?'scope':'arguments',reason:mutation?'unauthorized_mutation':'operation_mismatch',expected_tool:'get_aplicaciones_ejecucion',expected_metrics:input.requiredApplication.metrics})});continue;
  }
  if(args.__unresolved_request_scope===true){failures.push('Necesito precisar un período inequívoco para esta parte; no consulté un rango más amplio ni usé el propuesto por el modelo.');interactions.push({tool,args:{},result_summary:JSON.stringify({error:'scope_ambiguous',stage:'scope',consulta_completa:false})});continue;}
  if(args.__unrequested_application_parts===true){failures.push('No consulté partes de aplicaciones que la solicitud excluye; precisa qué dato deseas consultar.');interactions.push({tool,args:{},result_summary:JSON.stringify({error:'unsupported_operation',stage:'scope',reason:'no_requested_parts'})});continue;}
  if(tool==='get_labor_summary'){try{args=normalizarArgumentosLabor(args);}catch{failures.push('Los filtros de trabajo agregado no cumplen su contrato; no consulté datos individuales ni otra población.');interactions.push({tool,args:{},result_summary:JSON.stringify({error:'invalid_arguments',stage:'arguments'})});continue;}}
  if(['get_aplicaciones_ejecucion','get_application_summary'].includes(tool)){try{
   applicationMetrics(args.metric);
   // Only a server-declared request plan can supersede a valid model proposal.
   // Direct low-level callers retain their explicitly supplied operation contract.
   if(input.requiredApplication){const request=reconciliarSolicitudAplicacion(input.port.currentRequestText??input.port.currentUserText??'',args.metric);if(!request.metricsToExecute.length)throw Error();args={...args,metric:request.metricsToExecute};}
  }catch{failures.push('Los argumentos de métricas de esta parte no son válidos.');interactions.push({tool,args:{},result_summary:JSON.stringify({error:'invalid_arguments',stage:'arguments'})});continue;}}
  if(!aliases.has(tool)||input.excludeTools?.includes(tool)||!permitirLlamadaHerramienta(input.policy,tool,args)){
   failures.push(limiteNucleo(tool)??'Una parte requiere otra operación o un alcance autorizado explícito.');interactions.push({tool,args:{},result_summary:JSON.stringify({error:'unsupported_operation',stage:'arguments'})});continue;
  }
  if(tool==='get_recorded_state_definition'){
   const purpose=analizarPropositoUsuario(input.port.currentRequestText??input.port.currentUserText??'');
   const definition=purpose.definitions.some(d=>d.domain===args.domain&&(!d.states.length||d.states.includes(args.state as 'Calculada'|'En ejecución'|'Cerrada')));
   const q=(input.port.currentRequestText??input.port.currentUserText??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
   const key=String(args.state??'').replace(/^get_/,'').split('_').filter(x=>!['data','summary','details'].includes(x));
   const capability=args.domain==='capability'&&key.length>0&&q.split(/[;.!?\n]/).some(raw=>{
    if(/\b(?:ejemplo|cita|dijiste|dije|texto anterior|respuesta anterior)\b/.test(raw))return false;
    const clause=raw.replace(/"[^"]*"|'[^']*'|«[^»]*»|“[^”]*”/g,' objeto ');
    const positive=clause.replace(/\bque no puedes hacer\b/g,'que puedes hacer');
    return analizarPropositoUsuario(clause).intents.includes('capability')&&!/\b(?:no|sin|nunca|omite|excluye|excepto)\b/.test(positive)&&key.every(token=>(' '+clause.replace(/[^a-z0-9]+/g,' ').trim()+' ').includes(' '+token+' '));
   });
   const text=(args.domain==='application'&&purpose.intents.includes('definition')&&definition||capability)?definicionEstadoRegistrado(args):null;
   if(text){definitions.push(text);interactions.push({tool,args:{domain:args.domain,state:args.state},result_summary:JSON.stringify({definition:true,domain:args.domain,state:args.state})});}
   else {failures.push('Necesito consultar la fuente o precisar la identidad solicitada; una definición de otra operación no responde esta pregunta.');interactions.push({tool,args:{},result_summary:JSON.stringify({error:'unsupported_operation',stage:'arguments',reason:'irrelevant_definition'})});}
   continue;
  }
  try{
   const sourcePort=tool==='get_labor_summary'&&input.laborScope?{...input.port,...input.laborScope}:input.port;
   const result=await ejecutarFuenteVerificada(tool,{...args,reference_day:input.referenceDay},sourcePort);
   if(!result)throw Error();const framed=namespace(result,'call'+index+':');frames.push(framed);
   // Rebuild only whitelisted typed context. Never persist raw source objects.
   const merged:Evidence={version:1,state:framed.evidence.some(e=>e.state!=='ok')?'partial':'ok',scopes:framed.scopes,facts:framed.evidence.flatMap(e=>e.facts),issues:framed.evidence.flatMap(e=>e.issues)};
   const context=contextoParaPersistir({evidence:merged,expected:framed.scopes,populations:framed.populations,maxBytes:24000});
   const safeArgs:Record<string,unknown>={};for(const key of ['date_from','date_to','date_basis','metric'])if(typeof args[key]==='string')safeArgs[key]=args[key];
   interactions.push({tool,args:safeArgs,result_summary:JSON.stringify({...context,...(framed.errors?.length?{errors:framed.errors,...(!merged.facts.some(f=>f.value.kind!=='unknown')?{error:framed.errors[0].code,stage:framed.errors[0].stage}:{})}:{})})});
  }catch(err){const {code,stage}=operationFailure(err);
   const message=code==='scope_ambiguous'?'Precisa el período o la identidad inequívoca (nombre/número/UUID) para esta parte; no amplié el alcance.':code==='outside_scope'?'Los filtros o el período de esta parte no corresponden al alcance solicitado; no amplié la consulta.':code==='invalid_arguments'?'Los argumentos de esta parte no cumplen el contrato declarado; no consulté otra población.':code==='unsupported_operation'?'Esta parte está fuera de las operaciones verificadas de la fuente; no la sustituí con otra serie.':code==='incomplete_population'?'La fuente no acredita cobertura completa para esta parte; no convertí el detalle disponible en un total.':code==='budget_exceeded'?'Esta parte excede el límite de lectura; precisa un rango o subconjunto menor.':'No pude verificar una parte con la fuente; no sustituí sus valores con estimaciones o historial.';
   failures.push(message);interactions.push({tool,args:{},result_summary:JSON.stringify({error:code,stage,consulta_completa:false})});
  }
 }
 const missingApplication=!!input.requiredApplication&&!input.calls.some(call=>['get_aplicaciones_ejecucion','get_application_summary','propose_memory_save','commit_memory_save','forget_memory'].includes(call.function?.name??''));
 if(missingApplication){failures.push('Queda pendiente la consulta de la aplicación solicitada; una definición o los hechos de otra operación no responden esa parte.');interactions.push({tool:'get_aplicaciones_ejecucion',args:{},result_summary:JSON.stringify({error:'invalid_arguments',stage:'arguments',reason:'missing_requested_part',expected_tool:'get_aplicaciones_ejecucion',expected_metrics:input.requiredApplication!.metrics})});}
 if(!frames.length)return {text:[...definitions,...failures].join('\n')||'No recibí hechos verificables.',interactions,parts:failures.map((_,i)=>({id:'unavailable'+i,state:'unavailable'})),...(definitions.length?{completedText:definitions.join('\n\n')}:{}),retryable:missingApplication||interactions.length>0&&interactions.every(h=>{const r=JSON.parse(h.result_summary);return r.stage==='arguments';})};
 const result=componerRespuestaVerificada({parts:frames.flatMap(r=>r.parts),evidence:frames.flatMap(r=>r.evidence),scopes:frames.flatMap(r=>r.scopes),populations:frames.flatMap(r=>r.populations),labels:Object.assign({},...frames.map(r=>r.labels)),turnStartedAt:input.turnStartedAt,modelText:input.modelText});
 const completedText=[...definitions,result.text].filter(Boolean).join('\n\n');
 return {text:completedText+(failures.length?'\n\nPartes pendientes:\n'+failures.join('\n'):''),interactions,parts:[...result.parts,...failures.map((_,i)=>({id:'unavailable'+i,state:'unavailable'}))],...(missingApplication?{retryable:true,completedText}:{})};
}
