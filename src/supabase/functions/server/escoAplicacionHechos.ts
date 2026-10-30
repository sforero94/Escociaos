/** Application-only registered facts. No plan inputs, conversions or model prose. */
type Fila = Record<string, unknown>;
type Decimal = { n: bigint; scale: number };
const id = (v: unknown): string | null => typeof v === 'string' && v.trim() && v.length <= 128 ? v : null;
function decimal(v: unknown): Decimal | null {
  if (typeof v !== 'string' && (typeof v !== 'number' || !Number.isFinite(v))) return null;
  if (typeof v === 'number' && Math.abs(v) > Number.MAX_SAFE_INTEGER) return null;
  const s = String(v).trim();
  const m = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(s);
  if (!m || s.length > 64) return null;
  const exponent = Number(m[4] ?? 0), fraction = m[3] ?? '';
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 18 || m[2].length + fraction.length > 40) return null;
  let n = BigInt(m[2] + fraction) * (m[1] === '-' ? -1n : 1n);
  let scale = fraction.length - exponent;
  if (scale < 0) { n *= 10n ** BigInt(-scale); scale = 0; }
  return scale <= 18 ? { n, scale } : null;
}
function add(a: Decimal, b: Decimal): Decimal {
  const scale = Math.max(a.scale, b.scale);
  return { n: a.n * 10n ** BigInt(scale - a.scale) + b.n * 10n ** BigInt(scale - b.scale), scale };
}
function format(a: Decimal): string {
  const sign = a.n < 0 ? '-' : '', digits = (a.n < 0 ? -a.n : a.n).toString().padStart(a.scale + 1, '0');
  if (!a.scale) return sign + digits;
  return (sign + digits.slice(0, -a.scale) + '.' + digits.slice(-a.scale)).replace(/\.?0+$/, '');
}
/** A labelled theoretical calculation only; never registered consumption. */
export function estimacionDosisCanecas(dosis: unknown, canecas: unknown): string | null {
  const a = decimal(dosis), b = decimal(canecas);
  if (!a || !b || a.n < 0n || b.n < 0n) return null;
  return format({ n: a.n * b.n, scale: a.scale + b.scale });
}
class Cantidad {
  suma: Decimal = { n: 0n, scale: 0 }; validos = 0; invalidos = 0;
  registrar(value: unknown, identityKnown = true) {
    const d = identityKnown ? decimal(value) : null;
    if (!d) this.invalidos++;
    else { this.suma = add(this.suma, d); this.validos++; }
  }
  verificada() { return this.validos ? format(this.suma) : null; }
  total(complete: boolean) { return complete && this.invalidos === 0 ? this.verificada() : null; }
}
const rows = (v: unknown): Fila[] => Array.isArray(v) ? v.filter(r => r && typeof r === 'object' && !Array.isArray(r)) : [];
const counts = (rs: Fila[]) => rs.reduce((map, r) => { const k = id(r.id); if (k) map.set(k, (map.get(k) ?? 0) + 1); return map; }, new Map<string, number>());
function date(v: unknown): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(v + 'T00:00:00Z');
  const [year, month, day] = v.split('-').map(Number);
  return Number.isFinite(d.getTime()) && d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month && d.getUTCDate() === day ? v : null;
}
export interface AlcanceHechosAplicacion {
  aplicacionId: string; tareaId: string | null; tareaExclusiva: boolean;
  desde: string | null; hasta: string | null; loteIds: string[] | null;
  consultaCompleta: boolean; baseSeleccion: 'actual' | 'planned';
}
export function hechosEjecucionAplicacion(movimientos: Fila[], trabajo: Fila[], scope: AlcanceHechosAplicacion) {
  if (movimientos.length > 20_000 || trabajo.length > 20_000) throw Error('Hechos de aplicación exceden el límite de lectura; reduce el alcance.');
  if (!id(scope.aplicacionId) || (scope.desde && !date(scope.desde)) || (scope.hasta && !date(scope.hasta)) ||
    (scope.desde && scope.hasta && scope.desde > scope.hasta)) throw Error('Alcance de hechos inválido.');
  const inScope = (r: Fila, dateKey: string): 'in' | 'out' | 'unknown' => {
    const when = date(r[dateKey]);
    if ((scope.desde || scope.hasta) && !when) return 'unknown';
    if (when && ((scope.desde && when < scope.desde) || (scope.hasta && when > scope.hasta))) return 'out';
    if (scope.loteIds) {
      const lote = id(r.lote_id);
      if (!lote) return 'unknown';
      if (!scope.loteIds.includes(lote)) return 'out';
    }
    return 'in';
  };
  let movementUnknown = 0, movementOutside = 0, movementNoDetail = 0;
  const movementCounts = counts(movimientos);
  const selected = movimientos.filter(m => {
    if (!id(m.aplicacion_id)) { movementUnknown++; return false; }
    if (m.aplicacion_id !== scope.aplicacionId) { movementOutside++; return false; }
    const state = inScope(m, 'fecha_movimiento');
    if (state === 'out') { movementOutside++; return false; }
    if (state === 'unknown' || !id(m.id) || movementCounts.get(id(m.id)!) !== 1) { movementUnknown++; return false; }
    if (!Array.isArray(m.consumos) || !m.consumos.length || rows(m.consumos).length !== m.consumos.length) movementNoDetail++;
    return true;
  });
  const allConsumptions = selected.flatMap(m => rows(m.consumos));
  if (allConsumptions.length > 20_000) throw Error('Consumos de aplicación exceden el límite de lectura; reduce el alcance.');
  const consumptionCounts = counts(allConsumptions);
  const groups = new Map<string, { producto_id: string; unidad: string; nombre: string | null; nombreRecortado: boolean; cantidad: Cantidad }>();
  let withoutProduct = 0, unitMissingRows = 0, duplicateConsumption = 0;
  const unitsMissing = new Set<string>();
  for (const c of allConsumptions) {
    const product = id(c.producto_id), unit = typeof c.unidad === 'string' && c.unidad.trim() && c.unidad.length <= 32 ? c.unidad.trim() : null;
    if (!product) { withoutProduct++; continue; }
    if (!unit) { unitsMissing.add(product); unitMissingRows++; continue; }
    const key = JSON.stringify([product, unit]);
    if (!groups.has(key)) groups.set(key, { producto_id: product, unidad: unit,
      nombre: typeof c.producto_nombre === 'string' ? [...c.producto_nombre].slice(0, 80).join('') : null,
      nombreRecortado: typeof c.producto_nombre === 'string' && [...c.producto_nombre].length > 80, cantidad: new Cantidad() });
    const identityKnown = !!id(c.id) && consumptionCounts.get(id(c.id)!) === 1;
    if (!identityKnown) duplicateConsumption++;
    groups.get(key)!.cantidad.registrar(c.cantidad_utilizada, identityKnown);
  }
  const sourceComplete = scope.consultaCompleta && movementUnknown === 0 && movementNoDetail === 0 && withoutProduct === 0 && duplicateConsumption === 0;
  const products = [...groups.values()].sort((a,b) => {
    const x = JSON.stringify([a.producto_id,a.unidad]), y = JSON.stringify([b.producto_id,b.unidad]);
    return x < y ? -1 : x > y ? 1 : 0;
  }).map(g => ({ producto_id: g.producto_id, unidad: g.unidad, producto_nombre: g.nombre, nombre_recortado: g.nombreRecortado,
    cantidad_total: g.cantidad.total(sourceComplete && !unitsMissing.has(g.producto_id)), cantidad_verificada: g.cantidad.verificada(),
    registros_verificados: g.cantidad.validos, registros_invalidos: g.cantidad.invalidos }));
  const journals = new Cantidad(), costs = new Cantidad();
  const workCounts = counts(trabajo);
  let workUnknown = 0, workOutside = 0, workSelected = 0;
  for (const r of trabajo) {
    if (!scope.tareaId || !id(r.tarea_id)) { workUnknown++; continue; }
    if (r.tarea_id !== scope.tareaId) { workOutside++; continue; }
    const state = inScope(r, 'fecha_trabajo');
    if (state === 'out') { workOutside++; continue; }
    if (state === 'unknown' || !id(r.id) || workCounts.get(id(r.id)!) !== 1) { workUnknown++; continue; }
    workSelected++;
    journals.registrar(r.fraccion_jornal); costs.registrar(r.costo_jornal);
  }
  const workComplete = scope.consultaCompleta && workUnknown === 0 && !!scope.tareaId && scope.tareaExclusiva;
  return {
    contrato: 'aplicaciones_hechos_v1', aplicacion_id: scope.aplicacionId,
    alcance: { desde: scope.desde, hasta: scope.hasta, lote_ids: scope.loteIds, base_seleccion_aplicacion: scope.baseSeleccion,
      fecha_consumos: 'fecha_movimiento', fecha_trabajo: 'fecha_trabajo', universo: 'registros_consultados' },
    consumos: { productos: products.slice(0, 100), grupos_total: products.length, grupos_omitidos: Math.max(0, products.length - 100),
      detalle_productos_completo: products.length <= 100, movimientos_en_alcance: selected.length,
      movimientos_fuera_alcance: movementOutside, movimientos_no_atribuibles: movementUnknown, movimientos_sin_detalle: movementNoDetail,
      filas_sin_producto: withoutProduct, filas_sin_unidad: unitMissingRows, productos_sin_unidad: unitsMissing.size, filas_sin_identidad_unica: duplicateConsumption,
      cobertura_cerrada: sourceComplete && unitsMissing.size === 0 && products.every(p => p.registros_invalidos === 0) },
    trabajo: { tarea_id: scope.tareaId, atribucion: !scope.tareaId ? 'sin_tarea' : scope.tareaExclusiva ? 'tarea_exclusiva' : 'tarea_compartida',
      jornales_total: journals.total(workComplete), jornales_verificados: journals.verificada(),
      costo_total_cop: costs.total(workComplete), costo_verificado_cop: costs.verificada(),
      registros_en_alcance: workSelected, registros_fuera_alcance: workOutside, registros_no_atribuibles: workUnknown,
      registros_jornales_invalidos: journals.invalidos, registros_costos_invalidos: costs.invalidos,
      cobertura_cerrada: workComplete && journals.invalidos === 0 && costs.invalidos === 0 },
    limites: ['Son cantidades y costos registrados, no prueba de ejecución física completa.',
      'Null no equivale a cero; los subtotales verificados no sustituyen totales incompletos.',
      'Unidades distintas y productos con distinto ID permanecen separados; no hay conversión ni sustitución por plan.',
      'Costo jornal ya es el costo de la fracción registrada: no se multiplica de nuevo. Valores decimales son cadenas exactas.'],
  };
}
