/** Conservative privacy binding, not a factual router or authorization/access grant.
 * Only the current user message can request individual scope. Unknown phrasing
 * requires clarification of that part; aggregate answers remain independently usable.
 */
export type FuenteTrabajador = 'empleados' | 'contratistas';
export type PropositoIndividual = 'activity' | 'history' | 'salary';
export interface CandidatoTrabajador { id: string; nombre: string; sourceTable: FuenteTrabajador }
export interface VinculoTrabajador { kind: 'employee'; id: string; workerName: string; sourceTable: FuenteTrabajador }
type NoVinculado = { state: 'clarificar'; reason: 'invalid_input' | 'explicit_individual_scope_required' | 'literal_selector_required' | 'individual_scope_negated' | 'ambiguous_identity' | 'identity_not_found' | 'invalid_source_identity' }
  | { state: 'solo_agregado'; reason: 'aggregate_scope' | 'individual_scope_excluded' };
export type ResultadoSelectorIndividual = NoVinculado | { state: 'selector_explicito'; workerName: string; sourceTable: FuenteTrabajador; purpose: PropositoIndividual };
export type ResultadoVinculoIndividual = NoVinculado | { state: 'vinculado'; binding: VinculoTrabajador; purpose: PropositoIndividual };
const normalizar = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
const sinControles = (s: string) => ![...s].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);
const identidad = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 128 && v.trim() === v && sinControles(v);
const nombreSeguro = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 128 && sinControles(v) && /^[\p{L}\p{M}]+(?:[ '\u2019-][\p{L}\p{M}]+)*$/u.test(v.trim());
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const tipoPersona = '(emplead[oa]|contratista)';
const persona = /\b(?:emplead[oa]|trabajadora?|contratista)\b/;
const agregado = /\b(?:por (?:lote|lotes|finca|fincas)|agregad[oa]s?|totales? generales?|conciliacion (?:agregada|por lote))\b/;
const exclusion = /\b(?:sin|no(?: quiero| incluyas| muestres| reveles| mostrar)?) (?:salarios?|sueldos?|remuneraciones?|datos individuales?|datos personales?|detalle individual|nombres?|identidades?)\b/;
const negacion = /\b(?:no|nunca|jamas|tampoco|evita|omite|excluye|sin)\b/;
/** Split only outside quotations, so quoted history/instructions cannot become a request. */
function clausulas(question: string): string[] {
  const out: string[] = []; let part = '', cierre = '';
  for (let i = 0; i < question.length; i++) {
    const c = question[i], anterior = question[i - 1] ?? '';
    if (cierre) { part += c; if (c === cierre) cierre = ''; continue; }
    const contraste = /^(?:pero|sino)\b/i.exec(question.slice(i));
    if (contraste && !/\p{L}/u.test(anterior)) {
      if (part.trim()) out.push(part.trim()); part = ''; i += contraste[0].length - 1; continue;
    }
    if (c === '"' || c === '“' || c === '«' || c === "'" && !/\p{L}/u.test(anterior)) {
      cierre = c === '“' ? '”' : c === '«' ? '»' : c; part += c; continue;
    }
    if (';.!?\n,'.includes(c)) { if (part.trim()) out.push(part.trim()); part = ''; }
    else part += c;
  }
  if (part.trim()) out.push(part.trim());
  return out.map(s => s.replace(/^¿/, '').trim()).filter(Boolean);
}
const prefijo = '(?:por favor )?(?:(?:puedes|podrias) )?(?:(?:muestrame|mostrarme|muestra|mostrar|dame|darme|dime|decirme|consulta|consultar|ver|quiero ver|necesito ver|quiero saber|necesito saber) )?(?:cual es )?';
const objeto = '(?:la |el |los |las )?(actividad|actividades|historial|historia laboral|registros de trabajo|trabajo|trabajos|salario|sueldo|remuneracion|tarifa(?: de jornal)?|jornales)(?: completo| registrada| registrados| laboral)?';
const periodo = '(?: (?:hoy|ayer|esta semana|la semana pasada|este mes|el mes pasado|este ano|el ano pasado|desde \\d{4}-\\d{2}-\\d{2}(?: hasta \\d{4}-\\d{2}-\\d{2})?|del \\d{4}-\\d{2}-\\d{2} al \\d{4}-\\d{2}-\\d{2}|entre \\d{4}-\\d{2}-\\d{2} y \\d{4}-\\d{2}-\\d{2}|en (?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?: de \\d{4})?))?';
function solicitud(clause: string, name?: string): { sourceTable: FuenteTrabajador; purpose: PropositoIndividual; workerName: string } | null {
  const n = name === undefined ? null : escapar(name);
  const selector = n === null ? `(?<selector>"[^"]+"|'[^']+'|“[^”]+”|«[^»]+»|[\\p{L}\\p{M}]+(?:[ '’-][\\p{L}\\p{M}]+)*?)` : `(?:${n}|"${n}"|'${n}'|“${n}”|«${n}»)`;
  const directo = new RegExp(`^${prefijo}${objeto} (?:de|del) (?:el |la )?${tipoPersona} ${selector}${periodo}$`, 'u').exec(clause);
  const pregunta = new RegExp(`^${prefijo}(que hizo|que trabajo hizo|que trabajos hizo|cuanto gana) (?:el |la )?${tipoPersona} ${selector}${periodo}$`, 'u').exec(clause);
  if (!directo && !pregunta) return null;
  const noun = directo?.[2] ?? pregunta![2], object = directo?.[1] ?? pregunta![1];
  const selectedName = name ?? (directo ?? pregunta)!.groups!.selector.replace(/^["'“«]|["'”»]$/g, '');
  if (!nombreSeguro(selectedName)) return null;
  return { workerName: selectedName, sourceTable: noun === 'contratista' ? 'contratistas' : 'empleados',
    purpose: /salario|sueldo|remuneracion|tarifa|cuanto gana/.test(object) ? 'salary' : /historial|historia/.test(object) ? 'history' : 'activity' };
}
/** Call BEFORE candidate lookup. A proposed name is never itself permission. */
export function prevalidarSolicitudIndividual(currentQuestion: string, proposedWorkerName: string): ResultadoSelectorIndividual {
  if (typeof currentQuestion !== 'string' || !currentQuestion.trim() || currentQuestion.length > 4000 || !nombreSeguro(proposedWorkerName)) return { state: 'clarificar', reason: 'invalid_input' };
  const question = normalizar(currentQuestion), name = normalizar(proposedWorkerName);
  const parts = clausulas(currentQuestion).map(normalizar);
  if (parts.length > 20) return { state: 'clarificar', reason: 'invalid_input' };
  const aggregate = parts.some(p => agregado.test(p) && !negacion.test(p));
  const excluded = parts.some(p => exclusion.test(p) && !(agregado.test(p) && negacion.test(p) && !/individual|personal/.test(p) && !persona.test(p)));
  if (aggregate || excluded) return { state: 'solo_agregado', reason: excluded ? 'individual_scope_excluded' : 'aggregate_scope' };
  if (parts.some(p => negacion.test(p) && !(agregado.test(p) && !persona.test(p)))) return { state: 'clarificar', reason: 'individual_scope_negated' };
  const selections = parts.map(p => solicitud(p, name)).filter((p): p is NonNullable<typeof p> => p !== null);
  if (!selections.length) {
    const literal = new RegExp(`(?:^|[^\\p{L}\\p{M}])${escapar(name)}(?=$|[^\\p{L}\\p{M}])`, 'u').test(question);
    return { state: 'clarificar', reason: literal ? 'explicit_individual_scope_required' : 'literal_selector_required' };
  }
  if (parts.some(p => !solicitud(p, name) && !(agregado.test(p) && negacion.test(p) && !persona.test(p)) && !/^(?:hola|por favor|buenos dias|buenas tardes|buenas noches|gracias)$/.test(p))) return { state: 'clarificar', reason: 'explicit_individual_scope_required' };
  if (new Set(selections.map(s => s.sourceTable)).size !== 1) return { state: 'clarificar', reason: 'ambiguous_identity' };
  // Multiple explicitly requested purposes require the integrator to minimize their union.
  // This compact binding accepts one purpose; clarify rather than silently widening it.
  if (new Set(selections.map(s => s.purpose)).size !== 1) return { state: 'clarificar', reason: 'explicit_individual_scope_required' };
  return { state: 'selector_explicito', ...selections[0], workerName: proposedWorkerName.trim().replace(/\s+/g, ' ') };
}
/** Candidate rows are only id/name/table from an existing gated exact-name read.
 * No partial-name match, fallback across tables, HTTP call or historical context.
 */
export function vincularSolicitudIndividual(input: { currentQuestion: string; proposedWorkerName: string; candidates: readonly CandidatoTrabajador[] }): ResultadoVinculoIndividual {
  const precheck = prevalidarSolicitudIndividual(input.currentQuestion, input.proposedWorkerName);
  if (precheck.state !== 'selector_explicito') return precheck;
  if (!Array.isArray(input.candidates) || input.candidates.length > 20) return { state: 'clarificar', reason: 'invalid_source_identity' };
  if (input.candidates.some(c => !c || !['empleados', 'contratistas'].includes(c.sourceTable) || !identidad(c.id) || !nombreSeguro(c.nombre))) return { state: 'clarificar', reason: 'invalid_source_identity' };
  const matches = input.candidates.filter(c => c.sourceTable === precheck.sourceTable && normalizar(c.nombre) === normalizar(precheck.workerName));
  if (matches.length !== 1) return { state: 'clarificar', reason: matches.length ? 'ambiguous_identity' : 'identity_not_found' };
  return { state: 'vinculado', binding: { kind: 'employee', id: matches[0].id, workerName: matches[0].nombre, sourceTable: matches[0].sourceTable }, purpose: precheck.purpose };
}

/** Current-message literal extraction only. This grants no rights: run the precheck,
 * then the gated minimal source lookup, then exact canonical binding. Never feed
 * assistant/tool/history text here. Unknown or multiple selectors return null.
 */
export function detectarPropuestaIndividual(currentQuestion: string): { workerName: string; sourceTable: FuenteTrabajador } | null {
  if (typeof currentQuestion !== 'string' || !currentQuestion.trim() || currentQuestion.length > 4000) return null;
  const parts = clausulas(currentQuestion);
  if (parts.length > 20) return null;
  const candidates = parts.map(raw => ({ raw, selected: solicitud(normalizar(raw)) })).filter(p => p.selected !== null);
  if (!candidates.length || new Set(candidates.map(p => p.selected!.sourceTable + ':' + p.selected!.workerName)).size !== 1) return null;
  const { raw, selected } = candidates[0];
  const tokens = [...raw.matchAll(/[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*/gu)];
  let workerName: string | null = null;
  for (let i = 0; i < tokens.length && workerName === null; i++) {
    for (let j = i; j < tokens.length; j++) {
      const literal = raw.slice(tokens[i].index!, tokens[j].index! + tokens[j][0].length);
      if (literal.length > 128) break;
      if (normalizar(literal) === selected!.workerName && nombreSeguro(literal)) { workerName = literal; break; }
    }
  }
  if (!workerName) return null;
  const precheck = prevalidarSolicitudIndividual(currentQuestion, workerName);
  return precheck.state === 'selector_explicito' ? { workerName, sourceTable: precheck.sourceTable } : null;
}
