import {
  DEFINITIONS, decimalValido, fechaValida, validarCobertura, validarEvidencia, validarScope,
  type Coverage, type Evidence, type Fact, type Metric, type PopulationProof, type Scope,
} from '@/utils/escoEvidencia';

/** Columnas existentes; num_pesajes/promedio_litros son alias DERIVADOS que el
 * puerto confiable atesta en proof.fields, nunca columnas nuevas para consultar.
 * No recibe DTO redondeado, notas, identidades personales o JSON de resúmenes.
 */
export const PROYECCION_REGISTROS_LECHE = ['animal_id', 'fecha', 'litros_total'] as const;
export const PROYECCION_REGISTROS_FINANZAS = ['id', 'fecha', 'valor'] as const;
const escala = 10n ** 18n;
const idValido = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 128
  && v.trim() === v && [...v].every(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127);
function decimalExacto(v: unknown): bigint | null {
  if (typeof v === 'number' && (!Number.isFinite(v) || Math.abs(v) > Number.MAX_SAFE_INTEGER)) return null;
  const s = typeof v === 'number' ? String(v) : v;
  if (!decimalValido(s)) return null;
  const negativo = s.startsWith('-'), [entero, fraccion = ''] = (negativo ? s.slice(1) : s).split('.');
  const n = BigInt(entero) * escala + BigInt(fraccion.padEnd(18, '0'));
  return negativo ? -n : n;
}
function representar(n: bigint): string | null {
  const signo = n < 0n ? '-' : '', absoluto = n < 0n ? -n : n;
  const fraccion = String(absoluto % escala).padStart(18, '0').replace(/0+$/, '');
  const s = `${signo}${absoluto / escala}${fraccion ? `.${fraccion}` : ''}`;
  return decimalValido(s) ? s : null;
}

/** Solo registros de una lectura actual externa. No hace I/O ni crea pruebas.
 * Leche: población de observaciones (UUID+fecha), no días esperados ni animales.
 * Finanzas: ledger gasto/ingreso obligatorio; los montos COP son registrados y
 * nunca acreditan cobro, pago, entrega, recepción ni resultado contable.
 * Los filtros adicionales exigen columna existente seleccionada y comprobada.
 * Vacío sin prueba completa no es cero. Medias no representables exactamente
 * en 18 decimales quedan desconocidas, sin inventar precisión o redondeo.
 */
export function construirHechosRegistros(scope: Scope, rows: readonly Record<string, unknown>[], proof: PopulationProof): Evidence {
  const fallo = (code: string): Evidence => ({ version: 1, state: 'error', scopes: validarScope(scope) ? [scope] : [], facts: [], issues: [{ partId: 'records', code }] });
  if (!validarScope(scope) || !scope.period || !['milk.production', 'finance.records'].includes(scope.operation)) return fallo('outside_scope');
  const leche = scope.operation === 'milk.production';
  const filtros = leche ? ['animal_id'] : ['ledger', 'estado', 'negocio_id', 'categoria_id'];
  if (Object.keys(scope.filters).some(k => !filtros.includes(k))
    || scope.entities.some(e => e.kind !== (leche ? 'animal' : 'record'))
    || (!leche && !['gasto', 'ingreso'].includes(scope.filters.ledger as string))) return fallo('outside_scope');
  if (!Array.isArray(rows) || rows.length > 20000) return fallo('budget_exceeded');
  if (!proof || typeof proof !== 'object' || !Array.isArray(proof.fields)) return fallo('not_observed');
  const tool = leche ? 'get_hato_produccion' : 'get_financial_summary';
  const campos = leche ? [...PROYECCION_REGISTROS_LECHE, 'num_pesajes', 'promedio_litros'] : [...PROYECCION_REGISTROS_FINANZAS];
  const base: Coverage = {
    populationId: proof.populationId, population: proof.population, values: 'complete', rowsRead: proof.rowsRead,
    expectedRows: proof.expectedRows, missingValues: 0, identityUnique: proof.identityUnique,
    consistency: proof.consistency, reasons: [],
  };
  if (proof.scopeId !== scope.id || proof.tool !== tool || proof.rowsRead !== rows.length || !validarCobertura(base)
    || !campos.every(c => proof.fields.includes(c))
    || Object.keys(scope.filters).some(c => c !== 'ledger' && !proof.fields.includes(c))) return fallo('not_observed');
  if (!proof.identityUnique) return fallo('duplicate_identity');
  const identidades = new Set<string>(), idsOpcionales = new Set<string>();
  let suma = 0n, faltantes = 0;
  const razones = new Set<string>();
  for (const row of rows) {
    if (!row || !fechaValida(row.fecha)) return fallo('invalid_value');
    if (row.fecha < scope.period.from || row.fecha > scope.period.to) return fallo('outside_scope');
    const entidadId = leche ? row.animal_id : row.id;
    if (!idValido(entidadId)) return fallo('invalid_value');
    const clave = leche ? JSON.stringify([entidadId, row.fecha]) : entidadId;
    if (identidades.has(clave)) return fallo('duplicate_identity');
    identidades.add(clave);
    if (leche && row.id !== undefined) {
      if (!idValido(row.id)) return fallo('invalid_value');
      if (idsOpcionales.has(row.id)) return fallo('duplicate_identity');
      idsOpcionales.add(row.id);
    }
    if (scope.entities.length && !scope.entities.some(e => e.id === entidadId)) return fallo('outside_scope');
    for (const [campo, filtro] of Object.entries(scope.filters)) {
      if (campo === 'ledger') continue;
      if (!(Array.isArray(filtro) ? filtro : [filtro]).includes(row[campo] as string)) return fallo('outside_scope');
    }
    if (['unit', 'unidad', 'unidad_medida'].some(c => row[c] !== undefined && row[c] !== (leche ? 'L' : 'COP'))) return fallo('unknown_unit');
    const valor = row[leche ? 'litros_total' : 'valor'];
    const n = decimalExacto(valor);
    // Constraint existente hato_pesajes_leche_litros_total_no_negativo (061).
    if (n === null || (leche && n < 0n)) { faltantes += 1; razones.add(valor === null || valor === undefined ? 'missing_value' : 'invalid_value'); }
    else suma += n;
  }
  if (proof.population !== 'complete') razones.add(proof.expectedRows === null ? 'missing_count' : 'incomplete_population');
  if (proof.consistency === 'not_attested') razones.add('unstable_count');
  const hechos: Fact[] = [];
  const entidades = scope.entities.map(({ kind, id }) => ({ kind, id }));
  const hecho = (metric: Metric, value: Fact['value'], coverage: Coverage, assertion: Fact['assertion'], operation: 'sum' | 'count' | 'mean'): Fact => ({
    id: `records:${metric}`, scopeId: scope.id, metric, definitionId: `${metric}.v1`, entities: entidades,
    value, origin: 'derived', coverage, source: { tool, field: DEFINITIONS[metric].field, capturedAt: proof.capturedAt },
    assertion, derivation: { operation, inputs: [{ populationId: proof.populationId, field: DEFINITIONS[metric].field }] },
  });
  if (leche) hechos.push(hecho('milk.count', proof.population === 'complete' || rows.length > 0
    ? { kind: 'decimal', value: String(rows.length), unit: 'registro' }
    : { kind: 'unknown', reason: proof.expectedRows === null ? 'missing_count' : 'incomplete_population' },
  { ...base, reasons: [...razones].filter(r => r !== 'missing_value' && r !== 'invalid_value') },
  proof.population === 'complete' ? (rows.length ? 'record_count' : 'bounded_empty') : 'verified_subtotal', 'count'));
  const sumaTexto = representar(suma), conocidos = rows.length - faltantes;
  const vacioVerificadoFinanzas = !leche && rows.length === 0 && proof.population === 'complete';
  const sumaConocida = sumaTexto !== null && (conocidos > 0 || vacioVerificadoFinanzas);
  if (sumaTexto === null) razones.add('invalid_value');
  const coberturaValor: Coverage = { ...base, values: faltantes === 0 ? 'complete' : conocidos ? 'partial' : 'unknown', missingValues: faltantes, reasons: [...razones] };
  const volumen = hecho(leche ? 'milk.volume' : 'finance.recorded', sumaConocida
    ? { kind: 'decimal', value: sumaTexto!, unit: leche ? 'L' : 'COP' }
    : { kind: 'unknown', reason: sumaTexto === null ? 'invalid_value' : [...razones][0] ?? 'not_observed' },
  coberturaValor, proof.population === 'complete' && faltantes === 0 ? 'scoped_total' : 'verified_subtotal', 'sum');
  hechos.push(volumen);
  if (leche) {
    const apta = proof.population === 'complete' && faltantes === 0 && rows.length > 0 && sumaConocida;
    const media = apta && suma % BigInt(rows.length) === 0n ? representar(suma / BigInt(rows.length)) : null;
    if (apta && media === null) razones.add('invalid_value');
    const promedio = hecho('milk.mean', media === null
      ? { kind: 'unknown', reason: [...razones][0] ?? 'not_observed' }
      : { kind: 'decimal', value: media, unit: 'L/pesaje', denominator: 'pesaje_observado' },
    { ...coberturaValor, reasons: [...razones] }, 'derived_measure', 'mean');
    if (media !== null) promedio.derivation = { operation: 'mean', inputs: [{ factId: volumen.id }, { factId: hechos[0].id }] };
    hechos.push(promedio);
  }
  if (leche && rows.length === 0) razones.add('not_observed');
  const evidencia: Evidence = { version: 1, state: razones.size ? 'partial' : 'ok', scopes: [scope], facts: hechos,
    issues: [...razones].map(code => ({ partId: 'records', code })) };
  return validarEvidencia(evidencia, [scope], [proof]) ? evidencia : fallo('not_observed');
}
