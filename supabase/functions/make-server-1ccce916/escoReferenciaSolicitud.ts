/** USER request grammar only. No assistant/tool text, model arguments, IDs, receipts or I/O.
 * Resolved text is a proposal for a fresh source query; it is not model-ready private context,
 * an authorization, or an attestation that referenced records/cohorts exist.
 */
import { separarPeriodoUsuario, type PropuestaPeriodoUsuario } from './escoAlcance.ts';
import { fechaValida } from './escoEvidencia.ts';

const normal = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const quotes = /"[^"]*"|'[^']*'|«[^»]*»|“[^”]*”/g;
const ENTITY = 'aplicacion(?:es)?|lotes?|productos?|fincas?|ubicacion(?:es)?|estacion(?:es)?|tareas?|clientes?|proveedor(?:es)?|animal(?:es)?|compras?|despachos?|cosechas?|registros?|movimientos?';
const DEICTIC = '(?:es[aeo]s?|est[aeo]s?|aquell[ao]s?|mism[ao]s?)';
const referencePattern = new RegExp(`\\b${DEICTIC}\\s+(${ENTITY})\\b`, 'g');
const FAMILY = [
  ['application', /\b(?:aplicacion(?:es)?|fumigacion(?:es)?|fertilizacion(?:es)?|drench)\b/],
  ['labor', /\b(?:labores?|jornales?|jornal|trabajos?)\b/],
  ['purchase', /\bcompras?\b/], ['shipment', /\b(?:despachos?|ventas?)\b/],
  ['climate', /\b(?:lluvia|clima|radiacion)\b/], ['conductivity', /\bconductividad\b/],
  ['monitoring', /\bmonitoreos?\b/], ['harvest', /\bcosechas?\b/],
  ['inventory', /\b(?:inventario|movimientos?)\b/], ['task', /\btareas?\b/],
] as const;
const families = (q: string) => {
  const text = normal(q).replace(quotes, ' selector ');
  const found = FAMILY.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
  // Labor can be a metric of one application, rather than a second population.
  return found.length === 2 && found.includes('application') && found.includes('labor') &&
    !/[;\n]/.test(text) && !/\b(?:labores por lote|resumen (?:de )?labores)\b/.test(text)
    ? found.filter(name => name !== 'labor') : found;
};
const kind = (noun: string) => /^(?:aplicaciones|ubicaciones|estaciones|proveedores|animales)$/.test(noun) ? noun.slice(0, -2) : noun.replace(/s$/, '');
const STOP = new Set(('de del en desde hasta con por sin para y o al el la los las esta este ese esa esas esos mismo misma mismos mismas estado estados fecha fechas costo costos cantidad cantidades actual real planeada planeadas real reales registrada registradas calculada calculadas cerrada cerradas ejecucion planificada planificadas resumen total todos todas periodo semana mes ano hoy ayer ultimos ultima anterior pasado pasada').split(' '));
interface Selector { kind: string; value: string; start: number; end: number }
function selectors(text: string): Selector[] {
  const pattern = new RegExp(`\\b(${ENTITY})\\b`, 'g');
  const q = normal(text), result: Selector[] = [];
  for (const m of q.matchAll(pattern)) {
    const label = /^[ \t]+(?:(?:llamad[ao]|denominad[ao]|con nombre)[ \t]+)?("[^"\n]+"|'[^'\n]+'|«[^»\n]+»|“[^”\n]+”|[a-z0-9][a-z0-9_-]*(?:[ \t]+[a-z0-9][a-z0-9_-]*){0,5})/.exec(q.slice(m.index! + m[0].length));
    if (!label) continue;
    const quoted = /^["'«“]/.test(label[1]);
    const value = quoted ? label[1].slice(1, -1).trim() : label[1].split(/\s+/).filter((word, i, words) => !words.slice(0, i + 1).some(w => STOP.has(w) || /^\d{4}-\d/.test(w))).join(' ');
    const start = m.index! + m[0].length + label[0].length - label[1].length;
    const prefix = quoted ? label[1] : label[1].split(new RegExp(`\\b(?:${[...STOP].join('|')})\\b|\\d{4}-\\d`))[0].trimEnd();
    if (value && value.length <= 128 && !STOP.has(value)) result.push({ kind: kind(m[1]), value, start, end: start + prefix.length });
  }
  return result;
}
/** Protect explicit business labels such as Aplicación Mayo from temporal interpretation.
 * Labels are syntactic USER selectors only; a fresh catalog must still establish identity.
 * Quoting multiword labels containing date/preposition words preserves the entire label.
 */
function separarPeriodoSolicitud(question: string, now: Date) {
  const canonical = question.normalize('NFC');
  return separarPeriodoUsuario(canonical, now, selectors(canonical));
}
export function proponerPeriodoSolicitudUsuario(question: string, now: Date): PropuestaPeriodoUsuario {
  return separarPeriodoSolicitud(question, now).period;
}
function references(q: string): Array<{ kind: string; plural: boolean }> {
  return [...normal(q).replace(quotes, ' selector ').matchAll(referencePattern)].map(m => ({ kind: kind(m[1]), plural: m[1].endsWith('s') }));
}
/** A conjunction plus a named operation/period is a new query, not a missing lot selector. */
export function tieneReferenciaSolicitud(question: string): boolean {
  const q = normal(question).replace(quotes, ' selector ');
  if (references(q).length || /\b(?:lo mismo|lo anterior|las anteriores|los anteriores)\b/.test(q)) return true;
  if (!/^\s*(?:consulta de solo lectura:\s*)?[¿]?\s*y\b/.test(q)) return false;
  if (selectors(q).length) return false;
  return !families(q).length || !/\b(?:resumen|total general|todos los|todas las|global)\b/.test(q);
}
export interface EntradaReferenciaSolicitud { question: string; previousUserText?: string; previousUserAt?: string; now: Date }
export interface ReferenciaSolicitud {
  state: 'none' | 'resolved' | 'orphan' | 'ambiguous';
  effectiveQuestion: string;
  previousUserText?: string;
  independentQuestion?: string;
}

/** Only strong clause separators. No implicit split at a conjunction/comma and no prior
 * text in the remainder. The integrator must still validate every operation and selector.
 */
function independentQuestion(question: string, now: Date): string | undefined {
  const clauses = question.split(/[;\n]+/);
  if (clauses.length < 2) return undefined;
  const independent = clauses.map(clause => clause.trim().replace(/^(?:adem[aá]s|tambi[eé]n|por otro lado)\s*[:,]?\s*/i, '')).filter(clause => {
    const q = normal(clause);
    if (!q || tieneReferenciaSolicitud(clause) || /\b(?:es[aeo]s?|aquell[ao]s?|mism[ao]s?|anteriores?|all[ií]|su|sus)\b/.test(q)) return false;
    if (!families(clause).length && !selectors(clause).length) return false;
    const period = separarPeriodoSolicitud(clause, now).period;
    return period.state === 'absent' || period.state === 'resolved';
  });
  return independent.length ? independent.join('; ') : undefined;
}

export function resolverReferenciaSolicitud(input: EntradaReferenciaSolicitud): ReferenciaSolicitud {
  const { question, previousUserText, previousUserAt, now } = input;
  const result = (state: ReferenciaSolicitud['state'], effectiveQuestion = question): ReferenciaSolicitud => {
    const independent = (state === 'orphan' || state === 'ambiguous') && typeof question === 'string' && now instanceof Date && Number.isFinite(now.getTime()) ? independentQuestion(question, now) : undefined;
    return { state, effectiveQuestion, ...(independent ? { independentQuestion: independent } : {}) };
  };
  if (typeof question !== 'string' || !question.trim() || question.length > 16000 || !(now instanceof Date) || !Number.isFinite(now.getTime())) return result('ambiguous');
  const refs = references(question), selected = selectors(question);
  // A current explicit selector for the referenced kind wins; prior labels never join it.
  if (refs.length && refs.every(r => selected.some(s => s.kind === r.kind))) return result('none');
  if (!tieneReferenciaSolicitud(question)) return result('none');
  if (!previousUserText?.trim() || previousUserText.length > 16000 || !previousUserAt ||
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(previousUserAt) || !fechaValida(previousUserAt.slice(0, 10))) return result('orphan');
  const previousAt = new Date(previousUserAt);
  if (!Number.isFinite(previousAt.getTime()) || previousAt.getTime() > now.getTime()) return result('orphan');
  if (tieneReferenciaSolicitud(previousUserText)) return result('ambiguous');
  const priorKinds = families(previousUserText), priorSelectors = selectors(previousUserText), prior = normal(previousUserText);
  if (priorKinds.length > 1 || /\b(?:emplead[ao]s?|contratistas?|trabajador(?:es)?|salarios?|remuneracion)\b/.test(prior)) return result('ambiguous');
  if (!priorKinds.length && !priorSelectors.length) return result('orphan');
  const seen = new Map<string, Set<string>>();
  for (const s of priorSelectors) { if (!seen.has(s.kind)) seen.set(s.kind, new Set()); seen.get(s.kind)!.add(s.value); }
  if ([...seen.values()].some(values => values.size > 1)) return result('ambiguous');
  for (const r of refs) {
    const matching = priorSelectors.filter(s => s.kind === r.kind);
    const noun = new RegExp(`\\b${ENTITY}\\b`, 'g');
    const mentions = [...prior.matchAll(noun)].filter(m => kind(m[0]) === r.kind);
    if (!matching.length && !mentions.length) return result('orphan');
    if (!r.plural && !matching.length && mentions.some(m => m[0].endsWith('s'))) return result('ambiguous');
  }
  const alternativeLabel = new RegExp(`\\b(?:aplicacion|lote|producto|tarea)\\b[^.;!?]*\\s[yo]\\s(?!(?:${ENTITY}|costo|costos|cantidad|jornales|estado|fechas|consumo|muestra|consulta|dime|resumen)\\b)(?:["'«“]|[a-z])`);
  if (/\b(?:o bien|una de|cualquiera|alternativamente)\b/.test(prior) || alternativeLabel.test(prior)) return result('ambiguous');
  const currentTime = separarPeriodoSolicitud(question, now), priorTime = separarPeriodoSolicitud(previousUserText, previousAt);
  if (currentTime.period.state === 'ambiguous' || currentTime.period.state === 'invalid' || priorTime.period.state === 'ambiguous' || priorTime.period.state === 'invalid') return result('ambiguous');
  const chosen = currentTime.period.state === 'resolved' ? currentTime.period : priorTime.period;
  const previousScope = priorTime.period.state === 'resolved' ? priorTime.remainder : previousUserText;
  const current = currentTime.remainder.replace(new RegExp(`\\b${DEICTIC}\\s+(${ENTITY.replace(/cion/g, 'ci[oó]n')})\\b`, 'gi'), '')
    .replace(/\b(?:lo mismo|lo anterior|las anteriores|los anteriores)\b/gi, '').replace(/^\s*[¿]?\s*y\b/i, '');
  // Keep a grammatical boundary: adjacent fragments must not become a new lot/app label.
  const effectiveQuestion = `${previousScope} y ${current}${chosen.state === 'resolved' ? ` del ${chosen.from} al ${chosen.to}` : ''}`.replace(/\s+/g, ' ').trim();
  return { state: 'resolved', effectiveQuestion, previousUserText };
}

export type IntencionSolicitud = 'definition' | 'state_query' | 'capability' | 'data_query';
export type EstadoDefinicionSolicitud = 'Calculada' | 'En ejecución' | 'Cerrada';
export interface PropositoSolicitudUsuario {
  intents: IntencionSolicitud[];
  definitions: Array<{ domain: 'application'; states: EstadoDefinicionSolicitud[] }>;
}
/** Grammar components are cues, objects and negation, never a prompt/case catalogue.
 * Quoted text cannot introduce a purpose; quoted state objects are allowed after a real cue.
 * Matching a capability intent does not bind a tool/operation: the integrator must still
 * establish relevance and its closed registry. This function grants no factual authority.
 */
export function analizarPropositoUsuario(question: string): PropositoSolicitudUsuario {
  const intents = new Set<IntencionSolicitud>(), definitions: PropositoSolicitudUsuario['definitions'] = [];
  const clauses = normal(question).split(/[,;.!?\n]|\s+y\s+(?=(?:dime|muestra|consulta|cuant[oa]s?|que|cual(?:es)?|puedes|explica|define)\b)/);
  for (const raw of clauses) {
    const clause = raw.replace(quotes, ' objeto ');
    if (!clause.trim() || /\b(?:ejemplo|cita|dijiste|dije|texto anterior|mensaje anterior|respuesta anterior)\b/.test(clause)) continue;
    const deniedDefinition = /\b(?:no|nunca|sin)\s+(?:(?:quiero|deseo|necesito)\s+)?(?:expli\w*|defin\w*|signific\w*)\b/.test(clause);
    const definition = !deniedDefinition && /\b(?:que (?:significa[n]?|quiere[n]? decir|representa[n]?|es|son)|como se define[n]?|definicion(?:es)? de|significado de|diferencia[s]? entre|define|explica (?:el |la )?(?:significado|definicion))\b/.test(clause);
    const states: EstadoDefinicionSolicitud[] = [];
    if (/\b(?:calculada|planificada)s?\b/.test(raw)) states.push('Calculada');
    if (/\ben ejecucion\b/.test(raw)) states.push('En ejecución');
    if (/\bcerradas?\b/.test(raw)) states.push('Cerrada');
    const app = /\baplicacion(?:es)?\b/.test(clause);
    const otherObject = /\b(?:tareas?|productos?|proveedor(?:es)?|clientes?|lotes?|animales?|compras?|despachos?)\b/.test(clause);
    if (definition) intents.add('definition');
    if (definition && (!otherObject || app) && (states.length || app && /\bestados?\b/.test(clause))) {
      definitions.push({ domain: 'application', states });
    }
    const operationLimit = /\b(?:expli\w*|describ\w*|cual es|cuales son|dime)\b[^;.!?]*\b(?:limites?|alcance)\s+(?:de(?:l)?\s+)?(?:(?:la|las|el|los)\s+)?(?:conciliacion|exportacion|importacion|pronostico|prediccion|generacion|consulta|analisis|operacion|herramienta|funcion)\b/.test(clause)
      && !/\b(?:no|sin|nunca)\s+(?:(?:quiero|necesito|deseo)\s+)?(?:expli\w*|conocer|saber|describ\w*|detall\w*|mostrar|muestres)\b/.test(clause);
    const capability = operationLimit || /\b(?:que (?:no )?puedes hacer|que (?:consultas|herramientas|funciones|capacidades) (?:tienes|hay|ofreces)|puedes (?:consultar|hacer|pronosticar|generar|calcular)|es posible (?:consultar|hacer|generar)|(?:limite|alcance) de (?:tus|las) (?:funciones|herramientas))\b/.test(clause)
      && (!/\b(?:no|nunca)\s+puedes\b/.test(clause) || /\bque no puedes hacer\b/.test(clause));
    if (capability) intents.add('capability');
    const stateQuery = !definition && /\b(?:estado(?:s)?\b.*\b(?:aplicacion|registrad)|(?:aplicacion(?:es)?|cuales|cuantas)\b.*\b(?:cerrad|calculad|planificad|en ejecucion)|(?:esta|estan)\s+(?:cerrad|calculad|planificad)|en que estado)\w*\b/.test(clause);
    if (stateQuery) intents.add('state_query');
    if (stateQuery || !definition && !capability && /\b(?:cuanto|cuanta|cuantos|cuantas|consulta|muestra|dime|resumen|costo|jornales|cantidad|fechas?|compras?|despachos?|labores|lluvia|conductividad|aplicacion(?:es)?)\b/.test(clause)) intents.add('data_query');
  }
  return { intents: [...intents], definitions };
}
