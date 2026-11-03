/** Closed operation metadata. It never grants access or supplies source selectors. */
export const APPLICATION_METRICS = ['status','dates','date_comparison','quantity','labor','theoretical'] as const;
export type ApplicationMetric = typeof APPLICATION_METRICS[number];
export type OperationFailureCode = 'invalid_arguments'|'scope_ambiguous'|'outside_scope'|'unsupported_operation'|'incomplete_population'|'budget_exceeded'|'source_error';
export type OperationFailureStage = 'arguments'|'scope'|'source'|'coverage'|'budget';
export class OperationFailure extends Error {
 constructor(readonly code:OperationFailureCode,readonly stage:OperationFailureStage){super(code);this.name='OperationFailure';}
}
export function applicationMetrics(value:unknown):ApplicationMetric[] {
 const values=value===undefined?['status','dates']:Array.isArray(value)?value:[value];
 if(!values.length||values.length>APPLICATION_METRICS.length||values.some(v=>typeof v!=='string'||!(APPLICATION_METRICS as readonly string[]).includes(v)))throw new OperationFailure('invalid_arguments','arguments');
 return [...new Set(values)] as ApplicationMetric[];
}
/** Presentation metrics/type are consumed by dispatch; never forward them as reader filters. */
export function applicationReaderArguments(args:Record<string,unknown>):Record<string,unknown> {
 applicationMetrics(args.metric);
 const selectors=['date_from','date_to','date_basis','application_name','application_id','estado','lote_name','alcance','detalle_offset','selection_basis'];
 if(Object.keys(args).some(k=>![...selectors,'metric','reference_day','type'].includes(k)))throw new OperationFailure('invalid_arguments','arguments');
 return Object.fromEntries(Object.entries(args).filter(([k])=>selectors.includes(k)));
}
export function operationFailure(error:unknown):{code:OperationFailureCode;stage:OperationFailureStage} {
 if(error instanceof OperationFailure)return {code:error.code,stage:error.stage};
 const known:Record<string,OperationFailureStage>={scope_ambiguous:'scope',outside_scope:'scope',unsupported_operation:'arguments',invalid_arguments:'arguments',incomplete_population:'coverage',budget_exceeded:'budget',source_error:'source'};
 const code=error instanceof Error&&Object.prototype.hasOwnProperty.call(known,error.message)?error.message as OperationFailureCode:'source_error';
 return {code,stage:known[code]??'source'};
}
/** Bounded current-USER presentation intent; no selectors, dates or source authority.
 * Used only when a tool omitted its optional metric and the full request parser
 * could not classify the wording. Quoted examples never grant an output part.
 */
export function requestedApplicationMetrics(question:string):ApplicationMetric[] {
 const q=question.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().split(/[;\n]/).filter(c=>!/^\s*(?:ejemplo|cita|antes dijiste|respuesta anterior)\b/.test(c)).join('; ').replace(/"[^"]*"|'[^']*'|«[^»]*»|“[^”]*”/g,' selector ');
 const result:ApplicationMetric[]=[];
 const positive=(terms:RegExp,requestStart=false)=>{
  for(const m of q.matchAll(new RegExp(terms.source,'g'))){
   // Negation governs the rest of its clause, including synonymous metric words.
   // Explicit contrast/new request cues reset it; examples/quotes were removed above.
   const prefix=q.slice(0,m.index).split(/[;,.!?]|\b(?:pero|solo|solamente|unicamente)\b|\by\s+(?=(?:dame|muestra|incluye|consulta|calcula|estima)\b)/).at(-1)??'';
   if(requestStart&&!/^\s*[¿¡]?\s*(?:consulta de solo lectura:\s*)?(?:(?:por favor|puedes|podrias|quiero|necesito|dame|muestrame|haz)\s+)*(?:un[ao]?\s+)?$/.test(prefix))continue;
   if(!/\b(?:sin|omite|excluye|no|nunca)\b/.test(prefix))return true;
  }
  return false;
 };
 if(positive(/\b(?:jornales?|mano de obra|costo laboral|trabajo registrado)\b/))result.push('labor');
 if(positive(/\b(?:consumo(?:s)? registrado(?:s)?|consumid[oa]s?|cantidad(?:es)? (?:usada|registrada)s?|que productos (?:se )?(?:usaron|usamos)|cuanto (?:se )?(?:ha |han )?(?:usado|utilizado))\b/))result.push('quantity');
 if(positive(/\b(?:estima(?:r|me)?|calcula(?:r|me)?)\s+(?:el |la |los |las |una |un )?(?:dosis|(?:cantidad|consumo|volumen|total)\s+teoric[oa]s?|(?:estimacion|calculo)\s+teoric[oa])\b|\b(?:calculo|estimacion) teoric[oa] (?:(?:de|segun|con) )?(?:dosis|canecas|cantidad|consumo|volumen)\b/,true))result.push('theoretical');
 if(positive(/\bfechas?\b/))result.push(/\b(?:compar|diferenc)/.test(q)&&/\bplanead/.test(q)&&/\b(?:real|reales)\b/.test(q)?'date_comparison':'dates');
 if(positive(/\b(?:estado|sigue abierta|sigue cerrado|sigue cerrada|como va)\b/))result.push('status');
 return [...new Set(result)];
}
