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
/** Select presentation clauses, not source selectors or facts. A newly named
 * operation stops inheritance: dates of purchases cannot become application
 * dates merely because the same USER message also mentions an application.
 * Unqualified metric continuations inherit only an active application clause;
 * standalone metric wording remains available to a caller that already bound
 * the application domain. Strong boundaries preserve negation inside a clause.
 */
export function textoPartesAplicacion(question:string):string {
 const clauses=question.split(/[;\n]+|(?<=[.!?])\s+|\s+y\s+(?=(?:muestra(?:me)?|consulta|dime|dame|incluye|explica|compara)\b)|,\s*(?=(?:por separado|por otro lado|adem[aá]s|tambi[eé]n)\b)/i);
 const inspect=(clause:string)=>{
  const clean=clause.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/"[^"]*"|'[^']*'|«[^»]*»|“[^”]*”/g,' selector ');
  const quotedExample=/^\s*(?:ejemplo|cita|antes dijiste|respuesta anterior)\b/.test(clean.replace(/^\s*(?:consulta de solo lectura:\s*)?[¿¡]?\s*/,''));
  // Same closed domain nouns as the USER reference grammar. Keep this small
  // predicate dependency-free: importing that module here creates a cycle via
  // escoAlcance -> escoConsultas -> this closed operation registry.
  const applicationCue=!quotedExample&&/\b(?:aplicacion(?:es)?|fumigacion(?:es)?|fertilizacion(?:es)?|drench)\b/.test(clean)&&!/\baplicacion(?:es)? (?:(?:de|para) )?(?:movil|web|empleo|software|visa)\b/.test(clean);
  const labor=/\b(?:labores?|jornales?|trabajos?|mano de obra)\b/.test(clean);
  const generalLabor=labor&&/\b(?:general(?:es)?|global(?:es)?|todas las labores|todos los trabajos)\b/.test(clean);
  const otherDomain=/\b(?:compras?|despachos?|ventas?|lluvia|clima|radiacion|conductividad|monitoreos?|cosechas?|inventario|movimientos?|tareas?|ganado|hato|animales?|partos?|leche|pesajes?|finanzas|ingresos?|gastos?)\b/.test(clean);
  const application=applicationCue&&(!otherDomain||/\baplicacion(?:es)?\b/.test(clean));
  return {application,other:!quotedExample&&!application&&(generalLabor||otherDomain),quotedExample};
 };
 const kinds=clauses.map(inspect),hasApplication=kinds.some(k=>k.application),hasOther=kinds.some(k=>k.other);
 // Leading metric-only clauses (including exclusions) can share the only
 // explicitly named domain. Never forward-bind them across another domain.
 let activeApplication=hasApplication&&!hasOther;
 return clauses.filter((_,i)=>{
  const kind=kinds[i];
  if(kind.quotedExample)return false;
  if(kind.application){activeApplication=true;return true;}
  if(kind.other){activeApplication=false;return false;}
  return activeApplication||!hasApplication&&!hasOther;
 }).join('; ');
}
/** Bounded current-USER presentation intent; no selectors, dates or source authority.
 * The planner may propose metrics, but a valid proposal does not establish that
 * the requested task was answered. Quoted examples never grant an output part.
 */
function applicationMetricIntent(question:string):{requested:ApplicationMetric[];negated:ApplicationMetric[]} {
 const q=textoPartesAplicacion(question).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/"[^"]*"|'[^']*'|«[^»]*»|“[^”]*”/g,' selector ');
 const result:ApplicationMetric[]=[],negated:ApplicationMetric[]=[];
 const polarity=(terms:RegExp,requestStart=false):'positive'|'negative'|'absent'=>{
  let negative=false;
  for(const m of q.matchAll(new RegExp(terms.source,'g'))){
   // Negation governs the rest of its clause, including synonymous metric words.
   // Explicit contrast/new request cues reset it; examples/quotes were removed above.
   const prefix=q.slice(0,m.index).split(/[;,.!?]|\b(?:pero|solo|solamente|unicamente)\b|\by\s+(?=(?:dame|muestra|incluye|consulta|calcula|estima)\b)/).at(-1)??'';
   if(requestStart&&!/^\s*[¿¡]?\s*(?:consulta de solo lectura:\s*)?(?:(?:por favor|puedes|podrias|quiero|necesito|dame|muestrame|haz)\s+)*(?:un[ao]?\s+)?$/.test(prefix))continue;
   if(!/\b(?:sin|omite|excluye|no|nunca)\b/.test(prefix))return 'positive';
   negative=true;
  }
  return negative?'negative':'absent';
 };
 const record=(metric:ApplicationMetric,terms:RegExp,requestStart=false)=>{const p=polarity(terms,requestStart);if(p==='positive')result.push(metric);else if(p==='negative')negated.push(metric);};
 record('labor',/\b(?:jornales?|mano de obra|costo laboral|trabajo registrado)\b/);
 record('quantity',/\b(?:consumos?\b(?!\s+(?:teoric[oa]s?|estimad[oa]s?|planead[oa]s?|previst[oa]s?|planificad[oa]s?)\b)|consumid[oa]s?|cantidad(?:es)? (?:usada|registrada|utilizada)s?|que (?:productos|insumos) (?:se )?(?:usaron|usamos|utilizaron|utilizamos)|(?:productos|insumos) (?:usados|utilizados)|(?:productos|insumos) y (?:sus |las )?cantidades|cuanto (?:se )?(?:ha |han )?(?:usado|utilizado))\b/);
 record('theoretical',/\b(?:estima(?:r|me)?|calcula(?:r|me)?)\s+(?:el |la |los |las |una |un )?(?:dosis|(?:cantidad|consumo|volumen|total)\s+teoric[oa]s?|(?:estimacion|calculo)\s+teoric[oa])\b|\b(?:calculo|estimacion) teoric[oa] (?:(?:de|segun|con) )?(?:dosis|canecas|cantidad|consumo|volumen)\b/,true);
 record(/\b(?:compar|diferenc)/.test(q)&&/\bplanead/.test(q)&&/\b(?:real|reales)\b/.test(q)?'date_comparison':'dates',/\bfechas?\b/);
 record('status',/\b(?:estado|sigue abierta|sigue cerrado|sigue cerrada)\b/);
 // The existing progress operation is a real-record overview, not just status.
 // Restore its complete declared task even if a model proposes a narrow metric;
 // explicit exclusions still remove their own part, and no estimate is implied.
 if(polarity(/\b(?:como va(?:n)?|avance|progreso)\b/)==='positive'){
  for(const metric of ['status','dates','quantity','labor'] as const)if(!result.includes(metric)&&!negated.includes(metric)&&!(metric==='dates'&&negated.includes('date_comparison')))result.push(metric);
 }
 return {requested:[...new Set(result)],negated:[...new Set(negated)]};
}
export function requestedApplicationMetrics(question:string):ApplicationMetric[] {return applicationMetricIntent(question).requested;}

export interface ApplicationRequestReconciliation {
 /** Expected presentation parts, not proof that source facts exist. */
 requestedMetrics:ApplicationMetric[];
 expectedMetrics:ApplicationMetric[];
 /** Empty only when the optional proposal was absent; invalid values throw. */
 validatedProposedMetrics:ApplicationMetric[];
 metricsToExecute:ApplicationMetric[];
 missingRequestedMetrics:ApplicationMetric[];
 discardedProposedMetrics:ApplicationMetric[];
 intent:'explicit_user'|'conservative_default'|'unresolved';
}
/** Reconcile presentation only. Never accepts source selectors, prior text or a
 * model-created purpose. Callers must still bind identity/period/access and check
 * per-part source coverage after execution. An inferred default is not a claim
 * that every part of an unclassified question has been understood or answered.
 */
export function reconciliarSolicitudAplicacion(currentUserText:string,proposedMetric:unknown):ApplicationRequestReconciliation {
 const validated=applicationMetrics(proposedMetric);
 const proposed=proposedMetric===undefined?[]:validated;
 const {requested,negated}=applicationMetricIntent(currentUserText);
 const expected:ApplicationMetric[]=requested.length?[...requested]:(['status','dates'] as const).filter(m=>!negated.includes(m)&&!(m==='dates'&&negated.includes('date_comparison')));
 const intent=requested.length?'explicit_user':expected.length?'conservative_default':'unresolved';
 const covered=(metric:ApplicationMetric,offered:readonly ApplicationMetric[])=>offered.includes(metric)||metric==='dates'&&offered.includes('date_comparison');
 return {requestedMetrics:[...requested],expectedMetrics:[...expected],validatedProposedMetrics:[...proposed],metricsToExecute:[...expected],missingRequestedMetrics:requested.filter(m=>!covered(m,proposed)),discardedProposedMetrics:proposed.filter(m=>!covered(m,expected)),intent};
}
