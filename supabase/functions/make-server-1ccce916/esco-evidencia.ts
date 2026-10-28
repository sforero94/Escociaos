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
