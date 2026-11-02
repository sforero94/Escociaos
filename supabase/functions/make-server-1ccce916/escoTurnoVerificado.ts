import {limiteNucleo} from './escoNucleoCatalogo.ts';
import {HERRAMIENTAS_NUCLEO} from './escoNucleoComun.ts';
import {ejecutarFuenteVerificada,type PuertoFuente,type ResultadoFuente} from './escoDispatcherVerificado.ts';
import {componerRespuestaVerificada} from './escoRespuesta.ts';
import {contextoParaPersistir,type ServerRequestPolicy,permitirLlamadaHerramienta} from './escoPoliticaDatos.ts';
import {definicionEstadoRegistrado} from './escoProyeccionLegada.ts';
import type {Evidence} from './escoEvidencia.ts';
export interface LlamadaFuente {id?:string;function?:{name?:string;arguments?:string}}
const aliases=new Set([...HERRAMIENTAS_NUCLEO,'get_labor_summary','get_inventory_status','get_climate_data','get_aplicaciones_ejecucion','get_application_summary','get_recorded_state_definition','get_hato_produccion','get_financial_summary']);
export interface SalidaTurnoFuente {text:string;interactions:Array<{tool:string;args:Record<string,unknown>;result_summary:string}>;parts:Array<{id:string;state:string}>}
/** Distinct reads never share scope/population/fact IDs merely because they use the same tool. */
function namespace(r:ResultadoFuente,prefix:string):ResultadoFuente {
 const scope=(id:string)=>prefix+id,pop=(id:string)=>prefix+id;
 return {...r,scopes:r.scopes.map(s=>({...s,id:scope(s.id)})),populations:r.populations.map(p=>({...p,populationId:pop(p.populationId),scopeId:scope(p.scopeId)})),
  parts:r.parts.map(p=>({...p,id:prefix+p.id,scopeIds:p.scopeIds.map(scope)})),
  evidence:r.evidence.map((e,ei)=>{
   // Local opaque fact keys avoid collisions without duplicating long canonical entity IDs.
   const ids=new Map(e.facts.map((f,fi)=>[f.id,prefix+'e'+ei+'f'+fi]));
   return {...e,scopes:e.scopes.map(s=>({...s,id:scope(s.id)})),facts:e.facts.map(f=>({...f,id:ids.get(f.id)!,scopeId:scope(f.scopeId),coverage:{...f.coverage,populationId:pop(f.coverage.populationId)},...(f.derivation?{derivation:{...f.derivation,inputs:f.derivation.inputs.map(i=>'factId'in i?{factId:ids.get(i.factId)!}:{populationId:pop(i.populationId),field:i.field})}}:{})})),issues:e.issues.map(i=>({...i,partId:prefix+i.partId}))};
  })};
}
export async function ejecutarLlamadasVerificadas(input:{calls:readonly LlamadaFuente[];policy:ServerRequestPolicy;port:PuertoFuente;referenceDay:string;turnStartedAt:string;excludeTools?:readonly string[];modelText?:string}):Promise<SalidaTurnoFuente|null>{
 if(!input.calls.some(c=>aliases.has(c.function?.name??'')&&!input.excludeTools?.includes(c.function?.name??'')))return null;
 const definitions:string[]=[],frames:ResultadoFuente[]=[],interactions:SalidaTurnoFuente['interactions']=[],failures:string[]=[];
 for(const [index,call]of input.calls.entries()){
  const tool=call.function?.name??'unknown';let args:Record<string,unknown>={};
  try{const parsed=JSON.parse(call.function?.arguments??'{}');if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error();args=parsed;}
  catch{failures.push('Una parte tenía argumentos no verificables.');interactions.push({tool,args:{},result_summary:JSON.stringify({error:'invalid_value'})});continue;}
  if(args.__unresolved_request_scope===true){failures.push('Necesito precisar un período inequívoco para esta parte; no consulté un rango más amplio ni usé el propuesto por el modelo.');interactions.push({tool,args:{},result_summary:JSON.stringify({error:'scope_ambiguous',consulta_completa:false})});continue;}
  if(!aliases.has(tool)||input.excludeTools?.includes(tool)||!permitirLlamadaHerramienta(input.policy,tool,args)){
   failures.push(limiteNucleo(tool)??'Una parte requiere otra operación o un alcance autorizado explícito.');interactions.push({tool,args:{},result_summary:JSON.stringify({error:'unsupported_operation'})});continue;
  }
  if(tool==='get_recorded_state_definition'){const text=definicionEstadoRegistrado(args);if(text){definitions.push(text);interactions.push({tool,args:{domain:args.domain,state:args.state},result_summary:JSON.stringify({definition:true,domain:args.domain,state:args.state})});}else failures.push('La definición solicitada no está registrada.');continue;}
  try{
   const result=await ejecutarFuenteVerificada(tool,{...args,reference_day:input.referenceDay},input.port);
   if(!result)throw Error();const framed=namespace(result,'call'+index+':');frames.push(framed);
   // Rebuild only whitelisted typed context. Never persist raw source objects.
   const merged:Evidence={version:1,state:framed.evidence.some(e=>e.state!=='ok')?'partial':'ok',scopes:framed.scopes,facts:framed.evidence.flatMap(e=>e.facts),issues:framed.evidence.flatMap(e=>e.issues)};
   const context=contextoParaPersistir({evidence:merged,expected:framed.scopes,populations:framed.populations,maxBytes:24000});
   const safeArgs:Record<string,unknown>={};for(const key of ['date_from','date_to','date_basis','metric'])if(typeof args[key]==='string')safeArgs[key]=args[key];
   interactions.push({tool,args:safeArgs,result_summary:JSON.stringify(context)});
  }catch(err){const code=err instanceof Error&&['scope_ambiguous','outside_scope','unsupported_operation','budget_exceeded'].includes(err.message)?err.message:'source_error';failures.push(code==='scope_ambiguous'?'Precisa el período o la identidad inequívoca (nombre/número/UUID) para esta parte; no amplié el alcance.':code==='unsupported_operation'?'Esta parte está fuera de las operaciones verificadas de la fuente; no la sustituí con otra serie.':'No pude verificar una parte de la consulta; no completé sus valores con estimaciones o historial.');interactions.push({tool,args:{},result_summary:JSON.stringify({error:code,consulta_completa:false})});}
 }
 if(!frames.length)return {text:[...definitions,...failures].join('\n')||'No recibí hechos verificables.',interactions,parts:failures.map((_,i)=>({id:'unavailable'+i,state:'unavailable'}))};
 const result=componerRespuestaVerificada({parts:frames.flatMap(r=>r.parts),evidence:frames.flatMap(r=>r.evidence),scopes:frames.flatMap(r=>r.scopes),populations:frames.flatMap(r=>r.populations),labels:Object.assign({},...frames.map(r=>r.labels)),turnStartedAt:input.turnStartedAt,modelText:input.modelText});
 return {text:[...definitions,result.text].join('\n\n')+(failures.length?'\n\nPartes pendientes:\n'+failures.join('\n'):''),interactions,parts:[...result.parts,...failures.map((_,i)=>({id:'unavailable'+i,state:'unavailable'}))]};
}
