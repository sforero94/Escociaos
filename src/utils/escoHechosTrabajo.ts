/** Pure, minimized registered labor evidence. The read port owns access and population proofs. */
import { DEFINITIONS, decimalValido, fechaValida, validarScope, validarEvidencia,
  type Evidence, type Fact, type PopulationProof, type Scope } from './escoEvidencia';

export const PROYECCION_HECHOS_TRABAJO = 'id,fecha_trabajo,lote_id,lote:lotes(nombre),fraccion_jornal,costo_jornal' as const;
export interface FilaHechosTrabajo {
  id: unknown; fecha_trabajo: unknown; lote_id: unknown;
  lote?: { nombre?: unknown } | null; fraccion_jornal: unknown; costo_jornal: unknown;
}
export interface LecturaHechosTrabajo { rows: readonly FilaHechosTrabajo[]; proof: PopulationProof }
export interface PuertoLecturaHechosTrabajo {
  /** Return only this exact scope; never expand to workers, salaries or observations. */
  read(request: { scope: Scope; table: 'registros_trabajo'; projection: typeof PROYECCION_HECHOS_TRABAJO }): Promise<LecturaHechosTrabajo>;
}
const identity = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 128 && v.trim() === v && ![...v].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);
const error = (scope: Scope, code: string): Evidence => ({ version: 1, state: 'error', scopes: validarScope(scope) ? [scope] : [], facts: [], issues: [{ partId: identity(scope?.id) ? scope.id : 'labor', code }] });
function number(v: unknown): bigint | null {
  if (typeof v === 'number' && (!Number.isFinite(v) || Math.abs(v) > Number.MAX_SAFE_INTEGER)) return null;
  const s = typeof v === 'number' ? String(v) : v;
  if (!decimalValido(s) || s.startsWith('-')) return null;
  const [whole, fraction = ''] = s.split('.');
  return BigInt(whole + fraction.padEnd(18, '0'));
}
function decimal(n: bigint): string {
  const digits = n.toString().padStart(19, '0');
  return (digits.slice(0, -18) + '.' + digits.slice(-18)).replace(/\.?0+$/, '');
}
/** One population per scope: pass independently attested lot scopes for a by-lot breakdown. */
function alcanceTrabajo(scope: Scope): 'unsupported_operation' | 'scope_ambiguous' | null {
  if (!validarScope(scope) || scope.operation !== 'labor.by_lot' || !scope.period ||
      scope.entities.some(e => e.kind !== 'lot') || Object.keys(scope.filters).some(k => k !== 'lote_id')) return 'unsupported_operation';
  const filter = scope.filters.lote_id, lots = scope.entities.map(e => e.id);
  const filtered = filter === undefined ? lots : typeof filter === 'string' ? [filter] : filter;
  return filter !== undefined && (new Set(filtered).size !== filtered.length || !lots.length || filtered.length !== lots.length || filtered.some(l => !lots.includes(l))) ? 'scope_ambiguous' : null;
}
export function evidenciaTrabajoRegistrado(scope: Scope, reading: LecturaHechosTrabajo): Evidence {
  const invalidScope = alcanceTrabajo(scope);
  if (invalidScope) return error(scope, invalidScope);
  const filtered = scope.entities.map(e => e.id);
  const { rows, proof } = reading;
  if (!Array.isArray(rows) || rows.length > 20000 || !proof || rows.length !== proof.rowsRead || proof.scopeId !== scope.id) return error(scope, 'source_error');
  const counts = new Map<string, number>();
  for (const row of rows) if (row && identity(row.id)) counts.set(row.id, (counts.get(row.id) ?? 0) + 1);
  const unique = rows.every(row => row && identity(row.id) && counts.get(row.id) === 1);
  // A contradictory trusted proof cannot be repaired by inventing a new population.
  if (proof.identityUnique && !unique) return error(scope, 'duplicate_identity');
  const belongs = (r: FilaHechosTrabajo) => !!r && identity(r.id) && counts.get(r.id) === 1 && identity(r.lote_id) &&
    fechaValida(r.fecha_trabajo) && r.fecha_trabajo >= scope.period!.from && r.fecha_trabajo <= scope.period!.to &&
    (!filtered.length || filtered.includes(r.lote_id));
  const validRows = rows.map(belongs);
  const facts: Fact[] = [];
  for (const metric of ['labor.cost', 'labor.journals', 'labor.count'] as const) {
    const definition = DEFINITIONS[metric];
    let missing = 0, sum = 0n;
    rows.forEach((row, index) => {
      const value = validRows[index] ? metric === 'labor.count' ? 10n ** 18n : number(row[definition.field as 'costo_jornal' | 'fraccion_jornal']) : null;
      if (value === null) missing++; else sum += value;
    });
    const closed = proof.population === 'complete' && missing === 0;
    const known = metric === 'labor.count' ? closed : closed || rows.length > missing;
    const reasons = [...(proof.population !== 'complete' ? ['incomplete_population'] : []), ...(missing ? [validRows.some(v => !v) ? 'outside_scope' : 'missing_value'] : [])];
    const count = metric === 'labor.count';
    facts.push({ id: scope.id + ':' + metric, scopeId: scope.id, metric, definitionId: metric + '.v1',
      entities: scope.entities.map(({ kind, id }) => ({ kind, id })),
      value: known ? { kind: 'decimal', value: decimal(sum), unit: definition.unit } : { kind: 'unknown', reason: reasons[0] ?? 'not_observed' },
      origin: count ? 'recorded' : 'derived',
      coverage: { populationId: proof.populationId, population: proof.population, rowsRead: proof.rowsRead, expectedRows: proof.expectedRows,
        identityUnique: proof.identityUnique, consistency: proof.consistency, values: missing ? 'partial' : 'complete', missingValues: missing, reasons },
      source: { tool: proof.tool, field: definition.field, capturedAt: proof.capturedAt },
      assertion: count ? closed ? rows.length ? 'record_count' : 'bounded_empty' : 'record_count' : closed ? 'scoped_total' : 'verified_subtotal',
      derivation: { operation: count ? 'count' : 'sum', inputs: [{ populationId: proof.populationId, field: definition.field }] },
    });
  }
  // A proven empty population has zero registered sums, without claiming physical absence.
  const evidence: Evidence = { version: 1, state: facts.every(f => f.value.kind !== 'unknown' && f.coverage.population === 'complete' && f.coverage.values === 'complete') ? 'ok' : 'partial', scopes: [scope], facts,
    issues: facts.filter(f => f.value.kind === 'unknown' || f.coverage.population !== 'complete' || f.coverage.values !== 'complete').map(f => ({ partId: f.id, code: f.value.kind === 'unknown' ? f.value.reason : f.coverage.reasons[0] ?? 'incomplete_population' })) };
  return validarEvidencia(evidence, [scope], [proof]) ? evidence : error(scope, 'source_error');
}
/** Collector contract for the real loop. Output contains no work rows or personal data. */
export async function recolectarHechosTrabajo(scopes: readonly Scope[], port: PuertoLecturaHechosTrabajo): Promise<Evidence> {
  if (!scopes.length || scopes.length > 20 || new Set(scopes.map(s => s.id)).size !== scopes.length) return { version: 1, state: 'error', scopes: [], facts: [], issues: [{ partId: 'labor', code: 'scope_ambiguous' }] };
  const parts: Evidence[] = [];
  for (const scope of scopes) {
    // Validate before invoking the read port, including supported filters and entities.
    const invalidScope = alcanceTrabajo(scope);
    if (invalidScope) { parts.push(error(scope, invalidScope)); continue; }
    try { parts.push(evidenciaTrabajoRegistrado(scope, await port.read({ scope, table: 'registros_trabajo', projection: PROYECCION_HECHOS_TRABAJO }))); }
    catch { parts.push(error(scope, 'source_error')); }
  }
  return { version: 1, state: parts.every(p => p.state === 'ok') ? 'ok' : parts.every(p => p.state === 'error') ? 'error' : 'partial',
    scopes: parts.flatMap(p => p.scopes), facts: parts.flatMap(p => p.facts), issues: parts.flatMap(p => p.issues).slice(0, 40) };
}
