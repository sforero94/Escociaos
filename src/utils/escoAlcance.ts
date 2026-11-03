import { fechaBogota } from '@/utils/escoConsultas';
import { fechaValida, validarEvidencia, validarScope, type Evidence, type PopulationProof, type Scope } from '@/utils/escoEvidencia';

/** Calendar arithmetic only; the business clock remains fechaBogota. */
export function desplazarDia(fecha: string, dias: number): string {
  if (!fechaValida(fecha) || !Number.isSafeInteger(dias)) throw new Error('invalid_value');
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  const resultado = `${String(d.getUTCFullYear()).padStart(4, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  if (!fechaValida(resultado)) throw new Error('invalid_value');
  return resultado;
}

export function diasDelRango(from: string, to: string, maxDias = 20000): string[] {
  if (!fechaValida(from) || !fechaValida(to) || from > to) throw new Error('outside_scope');
  if (!Number.isSafeInteger(maxDias) || maxDias < 1 || maxDias > 20000) throw new Error('budget_exceeded');
  const dias: string[] = [];
  for (let dia = from; ; dia = desplazarDia(dia, 1)) {
    if (dias.length >= maxDias) throw new Error('budget_exceeded');
    dias.push(dia);
    if (dia === to) return dias;
  }
}

export type PeriodoCalendario = { kind: 'explicit'; from: string; to: string }
  | { kind: 'day' | 'week_to_date' | 'month_to_date' | 'year_to_date' };

/** Receives a structured, server-resolved period, never prompt text. Weeks start Monday. */
export function resolverPeriodoCalendario(p: PeriodoCalendario, ahora?: Date): Pick<NonNullable<Scope['period']>, 'from' | 'to' | 'referenceDay'> {
  const referenceDay = fechaBogota(ahora);
  if (p.kind === 'explicit') {
    if (!fechaValida(p.from) || !fechaValida(p.to) || p.from > p.to) throw new Error('outside_scope');
    return { from: p.from, to: p.to, referenceDay };
  }
  let from = referenceDay;
  if (p.kind === 'week_to_date') from = desplazarDia(referenceDay, -((new Date(`${referenceDay}T12:00:00Z`).getUTCDay() + 6) % 7));
  else if (p.kind === 'month_to_date') from = `${referenceDay.substring(0, 7)}-01`;
  else if (p.kind === 'year_to_date') from = `${referenceDay.substring(0, 4)}-01-01`;
  else if (p.kind !== 'day') throw new Error('unsupported_operation');
  return { from, to: referenceDay, referenceDay };
}

export type PropuestaPeriodoUsuario = { state: 'resolved'; from: string; to: string; referenceDay: string }
  | { state: 'absent' | 'ambiguous' | 'invalid' };

const MESES_USUARIO: Record<string, number> = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
const NOMBRES_MESES = Object.keys(MESES_USUARIO).join('|');
const FECHA_USUARIO = '(?:\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}[/-]\\d{1,2}[/-]\\d{4})';
const ANIO_USUARIO = '(?:\\s+(?:de(?:l)?\\s+)?(?:ano\\s+)?(\\d+))?';
const UNION_RANGO = '(?:\\s+(?:a|al|hasta|y)\\s+|\\s*[-–]\\s*)';
const PREFIJO_RANGO = '(?:(?:del?|desde|entre)\\s+(?:el\\s+)?)?';

function fechaDeUsuario(texto: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
  const europea = /^(\d{1,2})([/-])(\d{1,2})\2(\d{4})$/.exec(texto);
  return europea ? `${europea[4]}-${europea[3].padStart(2, '0')}-${europea[1].padStart(2, '0')}` : '';
}

function fechaNombrada(dia: string, mes: string, anio: string): string {
  return `${anio}-${String(MESES_USUARIO[mes]).padStart(2, '0')}-${dia.padStart(2, '0')}`;
}

function mesCompleto(anio: string, mes: number): { from: string; to: string } {
  const from = `${anio}-${String(mes).padStart(2, '0')}-01`;
  const ultimo = new Date(`${from}T12:00:00Z`);
  ultimo.setUTCMonth(mes, 0);
  return { from, to: `${anio}-${String(mes).padStart(2, '0')}-${String(ultimo.getUTCDate()).padStart(2, '0')}` };
}

/** Bounded temporal proposal only: no operation routing, history restoration, or acceptance.
 * Root supplies current USER text, or a separately fetched prior USER request with its own
 * server timestamp. A missing/invalid reference never falls back to today's clock.
 * This week/month are to-date; previous week/month are full calendar periods. Last N days
 * includes referenceDay. Named months without a year use the reference year, never a guessed
 * prior year. More specific textual spans consume their contained month/date tokens.
 * Unsupported forms remain absent; distinct recognized periods require clarification.
 */
type SpanPeriodo = { start: number; end: number; from: string; to: string };
function analizarPeriodoUsuario(question: string, referenceInstant: Date, spans: SpanPeriodo[] = []): PropuestaPeriodoUsuario {
  if (typeof question !== 'string' || !(referenceInstant instanceof Date) || !Number.isFinite(referenceInstant.getTime())) return { state: 'invalid' };
  const referenceDay = fechaBogota(referenceInstant);
  if (!fechaValida(referenceDay)) return { state: 'invalid' };
  const anio = referenceDay.substring(0, 4);
  const texto = question.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let invalid = false;
  let unresolved = false;
  const overlaps = (start: number, end: number) => spans.some(s => start < s.end && end > s.start);
  const scan = (patron: RegExp, fechas: (m: RegExpExecArray) => { from: string; to: string } | null) => {
    for (let m = patron.exec(texto); m; m = patron.exec(texto)) {
      const end = m.index + m[0].length;
      if (overlaps(m.index, end)) continue;
      try {
        const p = fechas(m);
        if (p === null) continue;
        if (!fechaValida(p.from) || !fechaValida(p.to) || p.from > p.to) invalid = true;
        spans.push({ start: m.index, end, ...p });
      } catch { invalid = true; }
    }
  };
  const conjunctionWithoutBetween = (m: RegExpExecArray) => {
    if (/\sy\s/.test(m[0]) && !/^entre\b/.test(m[0])) { unresolved = true; return true; }
    return false;
  };
  // Longer explicit ranges precede standalone dates/months. Never repair a reversed range.
  scan(new RegExp(`\\b${PREFIJO_RANGO}(${FECHA_USUARIO})${UNION_RANGO}(${FECHA_USUARIO})\\b`, 'g'), m => conjunctionWithoutBetween(m) ? null : ({ from: fechaDeUsuario(m[1]), to: fechaDeUsuario(m[2]) }));
  scan(new RegExp(`\\b${PREFIJO_RANGO}(\\d{1,2})\\s+de\\s+(${NOMBRES_MESES})${ANIO_USUARIO}${UNION_RANGO}(?:el\\s+)?(\\d{1,2})\\s+de\\s+(${NOMBRES_MESES})${ANIO_USUARIO}\\b`, 'g'), m => conjunctionWithoutBetween(m) ? null : ({
    from: fechaNombrada(m[1], m[2], m[3] ?? m[6] ?? anio), to: fechaNombrada(m[4], m[5], m[6] ?? m[3] ?? anio),
  }));
  scan(new RegExp(`\\b${PREFIJO_RANGO}(\\d{1,2})${UNION_RANGO}(?:el\\s+)?(\\d{1,2})\\s+de\\s+(${NOMBRES_MESES})${ANIO_USUARIO}\\b`, 'g'), m => conjunctionWithoutBetween(m) ? null : ({
    from: fechaNombrada(m[1], m[3], m[4] ?? anio), to: fechaNombrada(m[2], m[3], m[4] ?? anio),
  }));
  scan(new RegExp(`\\b(${FECHA_USUARIO})\\b`, 'g'), m => { const dia = fechaDeUsuario(m[1]); return { from: dia, to: dia }; });
  scan(new RegExp(`\\b(\\d{1,2})\\s+de\\s+(${NOMBRES_MESES})${ANIO_USUARIO}\\b`, 'g'), m => {
    const dia = fechaNombrada(m[1], m[2], m[3] ?? anio); return { from: dia, to: dia };
  });
  scan(/\b(?:ultimos|last)\s+(\d+)\s+(?:dias|days)\b/g, m => {
    const n = Number(m[1]);
    if (!Number.isSafeInteger(n) || n < 1 || n > 20000) throw new Error('invalid_value');
    return { from: desplazarDia(referenceDay, 1 - n), to: referenceDay };
  });
  scan(/\b(?:esta semana|semana actual|this week)\b/g, () => resolverPeriodoCalendario({ kind: 'week_to_date' }, referenceInstant));
  scan(/\b(?:semana pasada|semana anterior|last week)\b/g, () => {
    const lunes = resolverPeriodoCalendario({ kind: 'week_to_date' }, referenceInstant).from;
    return { from: desplazarDia(lunes, -7), to: desplazarDia(lunes, -1) };
  });
  scan(/\b(?:este mes|mes actual|this month)\b/g, () => resolverPeriodoCalendario({ kind: 'month_to_date' }, referenceInstant));
  scan(/\b(?:mes pasado|mes anterior|last month)\b/g, () => {
    const ultimo = desplazarDia(`${referenceDay.substring(0, 7)}-01`, -1);
    return { from: `${ultimo.substring(0, 7)}-01`, to: ultimo };
  });
  scan(/\b(?:hoy|today)\b/g, () => ({ from: referenceDay, to: referenceDay }));
  scan(/\b(?:ayer|yesterday)\b/g, () => { const dia = desplazarDia(referenceDay, -1); return { from: dia, to: dia }; });
  scan(new RegExp(`\\b(${NOMBRES_MESES})${ANIO_USUARIO}\\b`, 'g'), m => {
    if (/^\s*(?:[-–]|(?:y|o|a|al|hasta)\b)\s*\d{4}\b/.test(texto.substring(m.index + m[0].length))) unresolved = true;
    return mesCompleto(m[2] ?? anio, MESES_USUARIO[m[1]]);
  });
  if (invalid) return { state: 'invalid' };
  // Incomplete/approximate forms must not silently widen a month or collapse an open range.
  const openBounds = [...texto.matchAll(/\b(?:desde|hasta)\b/g)].some(m => !overlaps(m.index!, m.index! + m[0].length));
  const approximate = /\b(?:(?:primera|segunda|tercera|cuarta|ultima)\s+(?:semana|quincena)|(?:principios|mediados|finales|fines)\s+de|a partir de(?:l)?)\b/.test(texto);
  const relativeYear = new RegExp(`\\b(?:${NOMBRES_MESES})\\s+(?:de(?:l)?\\s+)?(?:ano\\s+)?(?:pasado|anterior|proximo|siguiente|hace)\\b`).test(texto);
  if (unresolved || openBounds || approximate || relativeYear) return { state: spans.length ? 'ambiguous' : 'absent' };
  const periods = [...new Map(spans.map(s => [`${s.from}/${s.to}`, s])).values()];
  if (!periods.length) return { state: 'absent' };
  if (periods.length > 1) return { state: 'ambiguous' };
  return { state: 'resolved', from: periods[0].from, to: periods[0].to, referenceDay };
}

export function proponerPeriodoUsuario(question: string, referenceInstant: Date): PropuestaPeriodoUsuario {
  return analizarPeriodoUsuario(question, referenceInstant);
}

/** Temporal text only. A caller must keep business labels separate from date phrases.
 * Ambiguous/invalid proposals leave the input intact; they never authorize a merged scope.
 * Uses the same parser/spans as proponerPeriodoUsuario, including specific range precedence.
 */
export function separarPeriodoUsuario(question: string, referenceInstant: Date, protectedSpans: readonly { start: number; end: number }[] = []): { period: PropuestaPeriodoUsuario; remainder: string } {
  const spans: SpanPeriodo[] = [];
  if (protectedSpans.some(s => !Number.isSafeInteger(s.start) || !Number.isSafeInteger(s.end) || s.start < 0 || s.start > s.end || s.end > question.length)) return { period: { state: 'invalid' }, remainder: question };
  let temporalText = question;
  for (const span of [...protectedSpans].sort((a, b) => b.start - a.start)) temporalText = temporalText.slice(0, span.start) + ' '.repeat(span.end - span.start) + temporalText.slice(span.end);
  const period = analizarPeriodoUsuario(temporalText, referenceInstant, spans);
  let remainder = question;
  if (period.state === 'resolved') for (const span of spans.sort((a, b) => b.start - a.start)) {
    remainder = remainder.slice(0, span.start) + ' ' + remainder.slice(span.end);
  }
  return { period, remainder };
}

export type RelacionPeriodo = 'inside' | 'outside' | 'unknown' | 'invalid';
/** Membership by this one date field. Null is unknown, never a fallback to another field. */
export function relacionFechaPeriodo(value: unknown, range: { from: string; to: string }): RelacionPeriodo {
  if (!fechaValida(range.from) || !fechaValida(range.to) || range.from > range.to) return 'invalid';
  if (value === null || value === undefined) return 'unknown';
  if (!fechaValida(value)) return 'invalid';
  return value >= range.from && value <= range.to ? 'inside' : 'outside';
}

/** Inclusive interval overlap, separate from membership by actual/planned start or activity.
 * A missing endpoint cannot certify overlap; a reversed interval is never swapped/clamped.
 */
export function relacionSolapamientoPeriodo(start: unknown, end: unknown, range: { from: string; to: string }): RelacionPeriodo {
  if (!fechaValida(range.from) || !fechaValida(range.to) || range.from > range.to) return 'invalid';
  if (start !== null && start !== undefined && !fechaValida(start) || end !== null && end !== undefined && !fechaValida(end)) return 'invalid';
  if (start === null || start === undefined || end === null || end === undefined) return 'unknown';
  if (!fechaValida(start) || !fechaValida(end) || start > end) return 'invalid';
  return start <= range.to && end >= range.from ? 'inside' : 'outside';
}

export function mismoAlcance(a: Scope, b: Scope): boolean {
  if (!validarScope(a) || !validarScope(b)) return false;
  const clave = (s: Scope) => JSON.stringify({ operation: s.operation, period: s.period && {
    from: s.period.from, to: s.period.to, referenceDay: s.period.referenceDay, clock: s.period.clock,
    basis: s.period.basis, fieldMeaning: s.period.fieldMeaning,
  },
    entities: s.entities.map(e => `${e.kind}:${e.id}`).sort(),
    filters: Object.entries(s.filters).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, Array.isArray(v) ? [...v].sort() : v]),
  });
  return clave(a) === clave(b);
}

export interface ContextoAgregadoSeguro {
  version: 1;
  requiresRequery: boolean;
  scopes: Array<{ id: string; operation: Scope['operation']; period: Scope['period'] }>;
  facts: Array<{ scopeId: string; metric: string; value: string; unit: string; assertion: string;
    population: string; values: string; capturedAt: string }>;
}

/** Advisory minimization before ANY model call or persistence. This grants no eligibility.
 * Historical assistant/tool prose is deliberately not accepted. Requery first; the existing
 * secure application receipt flow remains integrator-owned. No names, entity IDs, labels,
 * filters, raw rows, free text, observations or personal remuneration enter this projection.
 * expected/proofs must be supplied by the current-turn trusted resolver/read port.
 */
export function proyectarContextoAgregado(e: unknown, expected: Scope[], proofs: readonly PopulationProof[], maxCaracteres = 12000): ContextoAgregadoSeguro {
  const vacio = (): ContextoAgregadoSeguro => ({ version: 1, requiresRequery: true, scopes: [], facts: [] });
  if (!Number.isSafeInteger(maxCaracteres) || maxCaracteres < 100 || maxCaracteres > 24000 || !validarEvidencia(e, expected, proofs)) return vacio();
  const out: ContextoAgregadoSeguro = { version: 1, requiresRequery: false, scopes: [], facts: [] };
  // Finance selectors need an integrator-audited aggregate allowlist before reuse.
  const permitidas = new Set(['labor.cost', 'labor.journals', 'labor.count', 'inventory.count', 'climate.rain', 'climate.missing_days', 'milk.mean', 'milk.count', 'milk.volume']);
  for (const s of (e as Evidence).scopes) {
    // Aggregate labor cannot turn a person-selected cost into reusable remuneration context.
    if (s.operation === 'labor.by_lot' && (s.entities.some(e => e.kind !== 'lot') ||
      Object.keys(s.filters).some(k => !['finca_id', 'finca_ids', 'lote_id', 'lote_ids'].includes(k)))) {
      out.requiresRequery = true; continue;
    }
    const scopeId = `s${out.scopes.length + 1}`;
    // Rebuild each property: even a structurally valid input can have contaminated extras.
    const p = s.period;
    const period = p ? { from: p.from, to: p.to, referenceDay: p.referenceDay, clock: p.clock, basis: p.basis, fieldMeaning: p.fieldMeaning } : null;
    const facts = e.facts.filter(f => f.scopeId === s.id && permitidas.has(f.metric) &&
      ['scoped_total', 'verified_subtotal', 'record_count', 'bounded_empty', 'derived_measure'].includes(f.assertion) &&
      f.value.kind === 'decimal' && ['COP', 'jornal', 'registro', 'mm', 'dia', 'L/pesaje', 'L'].includes(f.value.unit));
    if (!facts.length) { out.requiresRequery = true; continue; }
    out.scopes.push({ id: scopeId, operation: s.operation, period });
    for (const f of facts) if (f.value.kind === 'decimal') out.facts.push({ scopeId, metric: f.metric,
      value: f.value.value, unit: f.value.unit, assertion: f.assertion, population: f.coverage.population,
      values: f.coverage.values, capturedAt: f.source.capturedAt });
    if (facts.length !== e.facts.filter(f => f.scopeId === s.id).length) out.requiresRequery = true;
  }
  if (e.state !== 'ok' || e.issues.length || !out.facts.length) out.requiresRequery = true;
  return JSON.stringify(out).length <= maxCaracteres ? out : vacio();
}

/** Old context, including JSON-shaped assistant/tool history, is never an attestation. */
export function descartarContextoHistorico(_historia: unknown): ContextoAgregadoSeguro {
  return { version: 1, requiresRequery: true, scopes: [], facts: [] };
}
