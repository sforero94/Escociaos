import { esCotaInferior, lluviaConfiableDeResumen } from '@/utils/escoClimaCalidad';
import { diasDelRango } from '@/utils/escoAlcance';
import { coberturaDesdePrueba } from '@/utils/escoCobertura';
import { fechaValida, hechoElegible, validarScope, type Evidence, type Fact, type PopulationProof, type Scope } from '@/utils/escoEvidencia';

export interface ObservacionLluvia {
  /** Canonical identity from the trusted reader, not a row label. */
  id: string;
  stationId: string;
  fecha: string;
  lluvia_total_mm: number | null;
  lluvia_confianza?: string | null;
}

/** Same daily gate as execClimateData: a partial zero is unknown; positive partial
 * observations remain measured lower bounds. No dry-spell/physical inference. */
export function lluviaMedidaVerificable(fila: Pick<ObservacionLluvia, 'lluvia_total_mm' | 'lluvia_confianza'>): number | null {
  const mm = lluviaConfiableDeResumen(fila);
  if (mm === null || !Number.isFinite(mm) || mm < 0 || (esCotaInferior(fila) && mm === 0)) return null;
  return mm;
}

/** Exact sum of decimal representations, avoiding binary 0.1 + 0.2 artifacts. */
function sumarMedidas(valores: number[]): string {
  const decimales = valores.map(v => {
    const [mantisa, exp = '0'] = String(v).toLowerCase().split('e');
    const [entero, fraccion = ''] = mantisa.split('.');
    const escala = fraccion.length - Number(exp);
    return { n: BigInt(entero + fraccion) * 10n ** BigInt(Math.max(0, -escala)), escala: Math.max(0, escala) };
  });
  const escala = Math.max(0, ...decimales.map(d => d.escala));
  if (escala > 18) throw new Error('invalid_value');
  const suma = decimales.reduce((n, d) => n + d.n * 10n ** BigInt(escala - d.escala), 0n).toString().padStart(escala + 1, '0');
  if (suma.length - escala > 24) throw new Error('invalid_value');
  return escala ? `${suma.substring(0, suma.length - escala)}.${suma.substring(suma.length - escala)}`.replace(/\.?0+$/, '') : suma;
}

/** Exact one-station population per invocation. Resolve multiple stations as separate
 * scopes/proofs in the integrator; never add stations together. Source rows must be
 * read under this exact scope. This adapter cannot attest counts or access itself.
 * Historical daily summaries only; current-day raw counter freshness remains owned
 * by the existing reader and must not be reconstructed from stale summaries here.
 */
export function hechosLluvia(scope: Scope, filas: readonly ObservacionLluvia[], proof: PopulationProof): Evidence {
  const error = (code: string): Evidence => ({ version: 1, state: 'error', scopes: validarScope(scope) ? [scope] : [], facts: [], issues: [{ partId: validarScope(scope) ? scope.id : 'climate', code }] });
  if (!validarScope(scope) || scope.operation !== 'climate.rainfall' || !scope.period) return error('outside_scope');
  const estaciones = scope.entities.filter(e => e.kind === 'station');
  if (estaciones.length !== 1 || scope.entities.length !== 1) return error('scope_ambiguous');
  if (!proof.identityUnique) return error('duplicate_identity');
  for (const [key, value] of Object.entries(scope.filters)) {
    if (!['station_id', 'station_ids', 'finca_id', 'finca_ids'].includes(key)) return error('outside_scope');
    if (key === 'station_id' || key === 'station_ids') {
      const ids = Array.isArray(value) ? value : [value];
      if (ids.length !== 1 || ids[0] !== estaciones[0].id) return error('outside_scope');
    }
  }
  if (proof.scopeId !== scope.id || proof.tool !== 'get_climate_data' || !['fecha', 'lluvia_total_mm', 'lluvia_confianza'].every(f => proof.fields.includes(f)) || proof.rowsRead !== filas.length) return error('incomplete_population');
  let dias: string[];
  try { dias = diasDelRango(scope.period.from, scope.period.to); } catch { return error('budget_exceeded'); }
  const calendario = new Set(dias);
  const observadas = new Map<string, ObservacionLluvia>();
  const ids = new Set<string>();
  for (const fila of filas) {
    if (typeof fila.id !== 'string' || !fila.id || fila.id.length > 128 || fila.id.trim() !== fila.id ||
      Array.from(fila.id).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) return error('invalid_value');
    if (ids.has(fila.id) || observadas.has(fila.fecha)) return error('duplicate_identity');
    if (fila.stationId !== estaciones[0].id || !fechaValida(fila.fecha) || !calendario.has(fila.fecha)) return error('outside_scope');
    ids.add(fila.id); observadas.set(fila.fecha, fila);
  }
  const ausentes = dias.filter(d => !observadas.has(d));
  // Today's raw counter needs its own freshness proof, outside this historical adapter.
  // Preserve verified historical parts when a requested range also includes today.
  const mm = filas.map(f => f.fecha < scope.period!.referenceDay ? lluviaMedidaVerificable(f) : null);
  const faltantes = mm.filter(m => m === null).length;
  const parciales = filas.some(f => f.fecha < scope.period!.referenceDay && esCotaInferior(f) && lluviaMedidaVerificable(f) !== null);
  const valores = mm.filter((m): m is number => m !== null);
  const reasons = [...(ausentes.length ? ['calendar_missing'] : []), ...(faltantes ? ['missing_value'] : []), ...(parciales || scope.period.to >= scope.period.referenceDay ? ['not_observed'] : [])];
  const facts: Fact[] = [];
  try {
    const lluviaCoverage = coberturaDesdePrueba(proof, faltantes, reasons, ausentes.length > 0 || parciales);
    const huecosCoverage = coberturaDesdePrueba(proof, 0, ausentes.length ? ['calendar_missing'] : []);
    const base = { scopeId: scope.id, entities: [{ kind: 'station' as const, id: estaciones[0].id }], origin: 'derived' as const };
    facts.push({ ...base, id: `${scope.id}:rain`, metric: 'climate.rain', definitionId: 'climate.rain.v1',
      value: valores.length ? { kind: 'decimal', value: sumarMedidas(valores), unit: 'mm' } : { kind: 'unknown', reason: 'not_observed' },
      coverage: lluviaCoverage, assertion: lluviaCoverage.population === 'complete' && lluviaCoverage.values === 'complete' ? 'scoped_total' : 'verified_subtotal',
      source: { tool: proof.tool, field: 'lluvia_total_mm', capturedAt: proof.capturedAt }, derivation: { operation: 'sum', inputs: [{ populationId: proof.populationId, field: 'lluvia_total_mm' }] } });
    facts.push({ ...base, id: `${scope.id}:missing`, metric: 'climate.missing_days', definitionId: 'climate.missing_days.v1',
      value: proof.population === 'complete' && proof.identityUnique ? { kind: 'decimal', value: String(ausentes.length + faltantes), unit: 'dia' } : { kind: 'unknown', reason: 'incomplete_population' },
      coverage: huecosCoverage, assertion: 'derived_measure', source: { tool: proof.tool, field: 'fecha', capturedAt: proof.capturedAt },
      derivation: { operation: 'calendar_gaps', inputs: [{ populationId: proof.populationId, field: 'fecha' }] } });
  } catch { return error('invalid_value'); }
  if (!facts.every(f => hechoElegible(f, scope, [proof]))) return error('invalid_value');
  const partial = reasons.length > 0 || proof.population !== 'complete' || facts.some(f => f.value.kind === 'unknown');
  return { version: 1, state: partial ? 'partial' : 'ok', scopes: [scope], facts,
    issues: [...new Set([...reasons, ...(proof.population !== 'complete' ? ['incomplete_population'] : [])])].map(code => ({ partId: scope.id, code })) };
}
