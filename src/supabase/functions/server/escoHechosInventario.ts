import {
  decimalValido, validarCobertura, validarEvidencia, validarScope,
  type Coverage, type Evidence, type Fact, type PopulationProof, type Scope,
} from './escoEvidencia.ts';

/** Contrato del colector externo: ordenar por id, conservar todas las páginas y
 * atestar conteo/identidades/estabilidad en PopulationProof.
 * Conteos estables entre páginas no equivalen a un snapshot transaccional. Este módulo no lee
 * datos ni fabrica pruebas a partir del tamaño de una página (incluida la última).
 * La unidad ya existe en productos.unidad_medida; no se deduce de presentación.
 * No autoriza acceso ni acredita existencias físicas, entrega, recepción o cobro.
 */
export const INVENTARIO_PROYECCION = [
  'id', 'nombre', 'activo', 'unidad_medida', 'cantidad_actual', 'stock_minimo',
] as const;
export const INVENTARIO_LIMITES = { filas: 20000, productosConHechos: 199 } as const;
export interface EntradaHechosInventario {
  scope: Scope;
  rows: readonly Record<string, unknown>[];
  populations: readonly PopulationProof[];
  populationId: string;
}
export interface EvidenciaInventario extends Evidence {
  /** Etiquetas literales de negocio; el renderizador debe escaparlas, no interpretarlas. */
  productos: Array<{ id: string; nombre: string | null }>;
}
const herramienta = 'get_inventory_status';
const unidades = new Set(['Kilos', 'Litros', 'Unidades']);
const sinControles = (v: string): boolean => [...v].every(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127);
const identidad = (v: unknown): v is string => typeof v === 'string' && v.length > 0
  && v.length <= 128 && v.trim() === v && sinControles(v);
function nombreNormalizado(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 128 || !sinControles(v)) return null;
  const nombre = v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').replace(/\s+/g, ' ').trim();
  return nombre.length > 0 ? nombre : null;
}
/** Comparación compartida con el read port: substring literal, no patrón SQL,
 * con tildes/caso/espacios normalizados y entradas acotadas. No crea pruebas. */
export function coincidenciaNombreProducto(nombre: unknown, criterio: unknown): boolean {
  const producto = nombreNormalizado(nombre), filtro = nombreNormalizado(criterio);
  return producto !== null && filtro !== null && producto.includes(filtro);
}
function decimal(v: unknown): string | null {
  if (typeof v === 'string') return decimalValido(v) ? v : null;
  // Un número JS grande ya perdió precisión antes de llegar al adaptador.
  if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > Number.MAX_SAFE_INTEGER) return null;
  return decimalValido(String(v)) ? String(v) : null;
}

/** Construye únicamente hechos registrados de productos canónicos. Los filtros
 * categoria/grupo son igualdades exactas (o listas OR); nombre_contiene es
 * substring de negocio normalizado declarado en el alcance, nunca patrón NL.
 * El universo activo siempre debe constar explícitamente en el Scope confiable.
 * rows son TODAS las filas del read port para esta prueba; nunca JSON resumen.
 * No agrega cantidades entre productos, aunque compartan unidad o nombre.
 * Los saldos conocidos siguen siendo útiles con población parcial. El conteo
 * parcial se etiqueta verified_subtotal; un conteo desconocido no se vuelve 0.
 */
export function construirHechosInventario(entrada: EntradaHechosInventario): EvidenciaInventario {
  const { scope, rows, populations, populationId } = entrada;
  const fallo = (code: string): EvidenciaInventario => ({ productos: [], version: 1, state: 'error', scopes: validarScope(scope) ? [scope] : [], facts: [], issues: [{ partId: 'inventory', code }] });
  if (!validarScope(scope) || scope.operation !== 'inventory.status' || scope.period !== null
    || scope.entities.some(e => e.kind !== 'product') || scope.filters.activo !== 'true'
    || Object.keys(scope.filters).some(k => !['activo', 'categoria', 'grupo', 'nombre_contiene'].includes(k))
    || (scope.filters.nombre_contiene !== undefined && nombreNormalizado(scope.filters.nombre_contiene) === null)) return fallo('outside_scope');
  if (!Array.isArray(rows) || rows.length > INVENTARIO_LIMITES.filas) return fallo('budget_exceeded');
  const pruebas = populations.filter(p => p.populationId === populationId && p.scopeId === scope.id);
  if (pruebas.length !== 1) return fallo('not_observed');
  const prueba = pruebas[0];
  const base: Coverage = {
    populationId, population: prueba.population, values: 'complete', rowsRead: prueba.rowsRead,
    expectedRows: prueba.expectedRows, missingValues: 0, identityUnique: prueba.identityUnique,
    consistency: prueba.consistency, reasons: [],
  };
  if (prueba.tool !== herramienta || prueba.rowsRead !== rows.length || !validarCobertura(base)
    || !INVENTARIO_PROYECCION.every(c => prueba.fields.includes(c))
    || Object.keys(scope.filters).some(c => !prueba.fields.includes(c === 'nombre_contiene' ? 'nombre' : c))) return fallo('not_observed');
  const ids = new Set<string>();
  for (const fila of rows) {
    if (!fila || !identidad(fila.id)) return fallo('invalid_value');
    if (ids.has(fila.id)) return fallo('duplicate_identity');
    ids.add(fila.id);
    if (fila.activo !== true || (scope.entities.length > 0 && !scope.entities.some(e => e.id === fila.id))) return fallo('outside_scope');
    if (scope.filters.nombre_contiene !== undefined && !coincidenciaNombreProducto(fila.nombre, scope.filters.nombre_contiene)) return fallo('outside_scope');
    for (const campo of ['categoria', 'grupo']) {
      const filtro = scope.filters[campo];
      if (filtro !== undefined && !(Array.isArray(filtro) ? filtro : [filtro]).includes(fila[campo] as string)) return fallo('outside_scope');
    }
  }
  if (!prueba.identityUnique) return fallo('duplicate_identity');
  const issues: Evidence['issues'] = [];
  const advertir = (code: string) => { if (!issues.some(i => i.code === code)) issues.push({ partId: 'inventory', code }); };
  if (prueba.population !== 'complete') advertir(prueba.expectedRows === null ? 'missing_count' : 'incomplete_population');
  if (prueba.consistency === 'not_attested') advertir('unstable_count');
  const count: Fact = {
    id: 'inventory:count', scopeId: scope.id, metric: 'inventory.count', definitionId: 'inventory.count.v1',
    entities: scope.entities.map(({ kind, id }) => ({ kind, id })),
    value: prueba.population === 'complete' || rows.length > 0
      ? { kind: 'decimal', value: String(rows.length), unit: 'registro' }
      : { kind: 'unknown', reason: prueba.expectedRows === null ? 'missing_count' : 'incomplete_population' },
    origin: 'derived', coverage: { ...base, reasons: issues.map(i => i.code) },
    source: { tool: herramienta, field: 'id', capturedAt: prueba.capturedAt },
    assertion: prueba.population === 'complete' ? (rows.length === 0 ? 'bounded_empty' : 'record_count') : 'verified_subtotal',
    derivation: { operation: 'count', inputs: [{ populationId, field: 'id' }] },
  };
  const facts: Fact[] = [count];
  const productos: EvidenciaInventario['productos'] = [];
  // Validar todas las filas antes del límite evita ocultar duplicados, filtros o
  // valores desconocidos observados en una página posterior al presupuesto.
  rows.forEach((fila, indice) => {
    const nombre = typeof fila.nombre === 'string' && fila.nombre.trim().length > 0
      && fila.nombre.length <= 128 && sinControles(fila.nombre) ? fila.nombre : null;
    if (nombre === null) advertir(fila.nombre === null || fila.nombre === undefined ? 'missing_value' : 'invalid_value');
    if (indice < INVENTARIO_LIMITES.productosConHechos) productos.push({ id: fila.id as string, nombre });
    for (const [metric, campo] of [['inventory.stock', 'cantidad_actual'], ['inventory.minimum', 'stock_minimo']] as const) {
      const valor = decimal(fila[campo]);
      const razon = !unidades.has(fila.unidad_medida as string) ? 'unknown_unit'
        : fila[campo] === null || fila[campo] === undefined ? 'missing_value'
        : valor === null ? 'invalid_value' : null;
      if (razon) advertir(razon);
      if (indice >= INVENTARIO_LIMITES.productosConHechos) continue;
      facts.push({
        id: `inventory:${indice}:${campo}`, scopeId: scope.id, metric, definitionId: `${metric}.v1`,
        entities: [{ kind: 'product', id: fila.id as string }],
        value: razon ? { kind: 'unknown', reason: razon } : { kind: 'decimal', value: valor!, unit: fila.unidad_medida as string },
        origin: 'recorded',
        // values describe el valor de ESTE hecho, no los de otros productos.
        coverage: { ...base, values: razon ? 'unknown' : 'complete', missingValues: razon ? 1 : 0, reasons: razon ? [razon] : [] },
        source: { tool: herramienta, field: campo, capturedAt: prueba.capturedAt }, assertion: 'record_value',
      });
    }
  });
  if (rows.length > INVENTARIO_LIMITES.productosConHechos) advertir('budget_exceeded');
  const evidencia: EvidenciaInventario = { productos, version: 1, state: issues.length ? 'partial' : 'ok', scopes: [scope], facts, issues };
  return validarEvidencia(evidencia, [scope], populations) ? evidencia : fallo('not_observed');
}
