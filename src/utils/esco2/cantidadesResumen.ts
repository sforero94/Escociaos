import type { BloqueResumenCantidades, EstadoResumenCantidad, ProductoResumenCantidad, RecipienteGuardado, ResumenCantidadesAplicacion, ResultadoCantidadesAplicacion, TotalResumenCantidad, UnidadCantidad, UnidadResumenCantidad } from './cantidadesTipos.ts';

const valido = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const suma = (xs: number[]): number | null => { const n = xs.reduce((a, b) => a + b, 0); return Number.isFinite(n) ? Number(n.toPrecision(12)) : null; };
const unicos = (xs: string[]) => [...new Set(xs)];
interface Aporte { unidad: UnidadResumenCantidad; cantidad: number | null; estado: EstadoResumenCantidad; motivos: string[]; fuentes: string[] }
function total(rows: Aporte[], incomplete = false): TotalResumenCantidad {
  const known = rows.filter(r => r.estado === 'conocido' && r.unidad !== null && valido(r.cantidad));
  const subtotal = known.length ? suma(known.map(r => r.cantidad!)) : null;
  const complete = !incomplete && known.length === rows.length && subtotal !== null;
  const motivos = unicos(rows.flatMap(r => r.motivos));
  if (incomplete) motivos.push('aporte_sin_unidad_o_base');
  if (known.length && subtotal === null) motivos.push('suma:invalida');
  const absentState: EstadoResumenCantidad = rows.some(r => r.estado === 'no_leido' || r.estado === 'conocido' && (!valido(r.cantidad) || r.unidad === null)) ? 'no_leido' : rows.some(r => r.estado === 'incompatible') ? 'incompatible' : rows.some(r => r.estado === 'no_concilia') ? 'no_concilia' : 'sin_dato';
  return { unidad: rows[0]?.unidad ?? null, cantidad: complete ? subtotal : null, subtotal_conocido: subtotal, estado: complete ? 'conocido' : known.length ? 'parcial' : absentState, motivos, fuentes: unicos(rows.flatMap(r => r.fuentes)) };
}
function porUnidad(rows: Aporte[]): TotalResumenCantidad[] {
  const groups = new Map<UnidadResumenCantidad, Aporte[]>();
  for (const row of rows) groups.set(row.unidad, [...(groups.get(row.unidad) ?? []), row]);
  return [...groups.values()].map(group => total(group, group[0].unidad !== null && groups.has(null)));
}
export function resumirRecipientes(rows: RecipienteGuardado[]): Pick<BloqueResumenCantidades, 'recipientes' | 'mezcla'> {
  const recipientes = porUnidad(rows);
  // Execution containers carry no stored mass/volume. Their capacity never licenses a derived amount.
  const anyMixture = rows.some(r => r.mezcla_litros_kilos !== undefined);
  const mezcla = !anyMixture ? [] : porUnidad(rows.map(row => ({ unidad: row.mezcla_litros_kilos?.unidad ?? null, cantidad: row.mezcla_litros_kilos?.cantidad ?? null, estado: row.mezcla_litros_kilos?.estado ?? 'no_leido', motivos: row.mezcla_litros_kilos ? [] : ['mezcla:no_leido'], fuentes: row.fuentes })));
  return { recipientes, mezcla };
}
interface AporteProducto extends Aporte { producto_id: string; producto_nombre?: string | null; unidad: UnidadCantidad | null }
function productos(rows: AporteProducto[]): ProductoResumenCantidad[] {
  const groups = new Map<string, AporteProducto[]>();
  for (const row of rows) { const key = JSON.stringify([row.producto_id, row.unidad]); groups.set(key, [...(groups.get(key) ?? []), row]); }
  const out = [...groups.values()].map(group => ({ ...total(group), producto_id: group[0].producto_id, producto_nombre: group[0].producto_nombre, unidad: group[0].unidad }));
  for (const item of out) if (new Set(out.filter(other => other.producto_id === item.producto_id).map(other => other.unidad)).size > 1) {
    item.cantidad = null; item.subtotal_conocido = null; item.estado = 'incompatible'; item.motivos.push('unidad_incompatible_entre_fuentes');
  }
  return out;
}
function bloque(estado: BloqueResumenCantidades['estado'], ps: ProductoResumenCantidad[], recipientes: RecipienteGuardado[]): BloqueResumenCantidades {
  const rs = resumirRecipientes(recipientes);
  const incomplete = [...ps, ...rs.recipientes, ...rs.mezcla].some(row => row.estado !== 'conocido');
  return { estado: estado === 'conocido' && incomplete ? 'parcial' : estado, productos: ps, ...rs };
}
/** Saved product totals are aggregated before any lot reconstruction. Execution is already ID-deduplicated by its reader/executor. */
export function resumirCantidadesAplicacion(r: ResultadoCantidadesAplicacion): ResumenCantidadesAplicacion {
  const plan = r.plan.estado === 'no_leido' ? [] : productos(r.plan.totales_guardados.map(row => ({ ...row, fuentes: [row.mezcla_id] })));
  for (const row of plan) if (r.plan.conciliacion.some(c => c.producto_id === row.producto_id && c.unidad === row.unidad && c.estado === 'discrepancia')) {
    // This quantity is still the stored plan, never the rejected reconstructed amount.
    if (row.cantidad !== null) row.estado = 'no_concilia';
    row.motivos = unicos([...row.motivos, 'conciliacion:no_coincide']);
  }
  return {
    plan: bloque(r.plan.estado, plan, r.plan.recipientes),
    ejecucion: bloque(r.ejecucion.estado, r.ejecucion.estado === 'no_leido' ? [] : productos(r.ejecucion.filas), r.ejecucion.recipientes),
  };
}
