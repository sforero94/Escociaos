/** Shared calendar identifier for server queries and their evidence metadata. */
export const ZONA_EVIDENCIA_ESCO = 'America/Bogota';

/** Evidence metadata only. This adapter grants no access and creates no row references. */
export interface EvidenciaEscoV1 {
  version: 1;
  outcome: 'success' | 'complete-empty' | 'partial' | 'unavailable' | 'stale' | 'unknown';
  complete: boolean | null;
  retrieval_complete: boolean | null;
  detail_complete: boolean | null;
  tool: string | null;
  scope: { entity_ids: string[] | null };
  period: { from: string | null; to: string | null; timezone: string | null };
  coverage: Record<string, number> | null;
  retrieved_at: string | null;
  retrieved_on: string | null;
  observed_at: string | null;
  units: Record<string, string> | null;
  source_refs: Array<{ table: string; id: string }> | null;
  total_facts: number | null;
  truncation: { context: boolean; detail: boolean | null };
}
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const flag = (value: unknown): boolean | null => typeof value === 'boolean' ? value : null;
const count = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
const date = (value: unknown): string | null => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.getUTCFullYear() === Number(value.slice(0, 4)) && parsed.getUTCMonth() + 1 === Number(value.slice(5, 7)) && parsed.getUTCDate() === Number(value.slice(8, 10)) ? value : null;
};

/**
 * Legacy metadata cannot prove freshness, row authorization, units or entity scope.
 * Keep those unknown. A successful query and a complete delivered result differ.
 * `stale` is explicit caller knowledge, never inferred from a historical period.
 */
export function adaptarEvidenciaLegada(value: unknown, options: { contextTruncated?: boolean; stale?: boolean } = {}): EvidenciaEscoV1 {
  const result = record(value);
  const legacy = record(result?._evidencia);
  const context = options.contextTruncated === true || result?.contexto_recortado === true;
  const unavailable = !result || Object.prototype.hasOwnProperty.call(result, 'error');
  const retrieval = unavailable ? false : flag(legacy?.consulta_completa);
  const detail = unavailable ? false : flag(legacy?.detalle_completo);
  const total = count(legacy?.total_hechos);
  const detailTruncated = detail === null ? null : !detail;
  const complete = unavailable || context || retrieval === false || detail === false ? false
    : retrieval === true && detail === true ? true : null;
  const range = record(legacy?.rango);
  const coverage = record(legacy?.cobertura_registros);
  // Project only known numeric coverage; never copy headers, args or raw error text.
  const counts: Record<string, number> | null = coverage ? {} : null;
  if (coverage && counts) for (const [key, value] of Object.entries(coverage)) {
    const total = count(value);
    if (/^[a-z][a-z0-9_]*$/.test(key) && total !== null) counts[key] = total;
  }
  return {
    version: 1,
    outcome: unavailable ? 'unavailable' : options.stale ? 'stale' : complete === false ? 'partial'
      : complete === true ? total === 0 ? 'complete-empty' : 'success' : 'unknown',
    complete: options.stale ? false : complete,
    retrieval_complete: retrieval,
    detail_complete: context ? false : detail,
    tool: typeof legacy?.herramienta === 'string' && /^(get_[a-z0-9_]+)$/.test(legacy.herramienta) ? legacy.herramienta : null,
    scope: { entity_ids: null },
    period: { from: date(range?.desde), to: date(range?.hasta), timezone: null },
    coverage: counts,
    retrieved_at: null, retrieved_on: date(legacy?.consultado_en), observed_at: null,
    units: null, source_refs: null, total_facts: total,
    truncation: { context, detail: detailTruncated },
  };
}

const has = (value: Record<string, unknown>, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(v => typeof v === 'string');
const timestamp = (value: unknown): boolean => value === null || typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

/** Reject incompatible/contradictory metadata; never downgrade it to legacy success. */
export function leerEvidencia(value: unknown): EvidenciaEscoV1 {
  const result = record(value);
  if (!result || has(result, 'error')) return adaptarEvidenciaLegada(value);
  if (!has(result, '_evidencia_v1')) return adaptarEvidenciaLegada(value);
  const e = record(result._evidencia_v1);
  const scope = record(e?.scope), period = record(e?.period), truncation = record(e?.truncation);
  const coverage = e?.coverage === null ? null : record(e?.coverage);
  const units = e?.units === null ? null : record(e?.units);
  const refs = e?.source_refs;
  const invalid = () => adaptarEvidenciaLegada({ error: 'Invalid evidence metadata' });
  if (!e || e.version !== 1 || !scope || !period || !truncation
    || !['success', 'complete-empty', 'partial', 'unavailable', 'stale', 'unknown'].includes(String(e.outcome))
    || ![true, false, null].includes(e.complete as boolean | null)
    || ![true, false, null].includes(e.retrieval_complete as boolean | null)
    || ![true, false, null].includes(e.detail_complete as boolean | null)
    || typeof truncation.context !== 'boolean' || ![true, false, null].includes(truncation.detail as boolean | null)
    || !(e.tool === null || typeof e.tool === 'string' && /^get_[a-z0-9_]+$/.test(e.tool))
    || !(scope.entity_ids === null || strings(scope.entity_ids))
    || !(period.from === null || date(period.from)) || !(period.to === null || date(period.to))
    || !(period.timezone === null || period.timezone === ZONA_EVIDENCIA_ESCO)
    || !(e.retrieved_on === null || date(e.retrieved_on))
    || !timestamp(e.retrieved_at) || !timestamp(e.observed_at)
    || !(e.total_facts === null || count(e.total_facts) !== null)
    || !(e.coverage === null || coverage && Object.entries(coverage).every(([k, v]) => /^[a-z][a-z0-9_]*$/.test(k) && count(v) !== null))
    || !(e.units === null || units && Object.entries(units).every(([k, v]) => /^[a-z][a-z0-9_.]*$/.test(k) && typeof v === 'string' && /^[a-z_]+$/.test(v)))
    || !(refs === null || Array.isArray(refs) && refs.every(ref => {
      const r = record(ref);
      return r && typeof r.table === 'string' && /^[a-z][a-z0-9_]*$/.test(r.table) && typeof r.id === 'string' && /^[a-zA-Z0-9_-]+$/.test(r.id);
    }))) return invalid();
  const mustBeIncomplete = truncation.context || truncation.detail === true || result.contexto_recortado === true
    || e.retrieval_complete === false || e.detail_complete === false;
  if (period.from && period.to && String(period.from) > String(period.to)
    || e.outcome === 'unknown' && e.complete !== null
    || e.complete === true && (mustBeIncomplete || e.retrieval_complete !== true || e.detail_complete !== true)
    || ['partial', 'unavailable', 'stale'].includes(String(e.outcome)) && e.complete !== false
    || ['success', 'complete-empty'].includes(String(e.outcome)) && e.complete !== true
    || e.outcome === 'complete-empty' && e.total_facts !== 0
    || e.outcome === 'success' && e.total_facts === 0) return invalid();
  // Project known fields. Extra keys, headers and raw payload never enter the envelope.
  return {
    version: 1, outcome: e.outcome as EvidenciaEscoV1['outcome'], complete: e.complete as boolean | null,
    retrieval_complete: e.retrieval_complete as boolean | null, detail_complete: e.detail_complete as boolean | null,
    tool: e.tool as string | null, scope: { entity_ids: scope.entity_ids as string[] | null },
    period: { from: period.from as string | null, to: period.to as string | null, timezone: period.timezone as string | null },
    coverage: coverage as Record<string, number> | null,
    retrieved_at: e.retrieved_at as string | null, retrieved_on: e.retrieved_on as string | null,
    observed_at: e.observed_at as string | null, units: units as Record<string, string> | null,
    source_refs: refs === null ? null : (refs as Array<{ table: string; id: string }>).map(r => ({ table: r.table, id: r.id })),
    total_facts: e.total_facts as number | null,
    truncation: { context: truncation.context, detail: truncation.detail as boolean | null },
  };
}

/** Preserve producer metadata while making removal of detail explicit. */
export function recortarEvidencia(value: unknown): EvidenciaEscoV1 {
  const evidence = leerEvidencia(value);
  return { ...evidence, complete: false, detail_complete: false,
    outcome: ['unavailable', 'stale'].includes(evidence.outcome) ? evidence.outcome : 'partial',
    truncation: { ...evidence.truncation, context: true } };
}

/** Add metadata to legacy JSON reads, including errors; action tools remain unchanged. */
export function adjuntarEvidencia(resultado: string, herramienta: string): string {
  try {
    const parsed: unknown = JSON.parse(resultado);
    const result = record(parsed);
    if (!result) throw new Error('Expected a tool result object');
    const evidence = leerEvidencia(result);
    return JSON.stringify({ ...result, _evidencia_v1: { ...evidence,
      tool: evidence.tool ?? (/^get_[a-z0-9_]+$/.test(herramienta) ? herramienta : null) } });
  } catch {
    return JSON.stringify({ error: 'Resultado de consulta inválido.',
      _evidencia_v1: adaptarEvidenciaLegada({ error: true }) });
  }
}
