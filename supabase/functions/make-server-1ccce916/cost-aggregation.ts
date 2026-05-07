/**
 * Pure cost-aggregation helpers used by Esco's per-lote cost tools.
 *
 * No Deno, no fetch, no Supabase imports — this file must be importable from
 * both the Deno edge runtime (chat.tsx) and Node-based tests (Vitest).
 *
 * Mirrors the logic in `src/utils/aplicacionesReales.ts` (frontend equivalent).
 * Keep the two in sync if the underlying schema changes — the frontend uses
 * `getSupabase()` directly while this module operates on already-fetched rows.
 */

export type UnidadBase = 'Litros' | 'Kilos' | 'Unidad';

export interface ProductoAplicado {
  productoId: string;
  productoNombre: string;
  unidadBase: UnidadBase;
  cantidadBase: number;
  precioUnitario: number;
  costoTotal: number;
}

export interface InsumosPorLoteEntry {
  cantidadTotal: number;
  costoTotal: number;
  productos: ProductoAplicado[];
}

export interface JornalesPorLoteEntry {
  jornales: number;
  costo: number;
}

export interface MovimientoRow {
  id: string;
  lote_id: string | null;
}

export interface MovimientoProductoRow {
  movimiento_diario_id: string;
  producto_id: string;
  producto_nombre?: string;
  cantidad_utilizada: number | string;
  unidad?: string | null;
}

export interface RegistroTrabajoRow {
  lote_id: string | null;
  fraccion_jornal: number | string;
  costo_jornal: number | string;
}

export interface LoteInfo {
  id: string;
  nombre: string;
  total_arboles: number;
}

export interface CostoPorLoteRow {
  lote_id: string;
  lote_nombre: string;
  arboles_total: number;
  costo_insumos: number;
  costo_mano_obra: number;
  costo_total: number;
  costo_por_arbol: number;
  jornales: number;
}

export function convertirUnidadBase(
  cantidad: number,
  unidad: string | null | undefined,
): { cantidadBase: number; unidadBase: UnidadBase } {
  const u = (unidad || '').trim().toLowerCase();
  if (u === 'cc') return { cantidadBase: cantidad / 1000, unidadBase: 'Litros' };
  if (u === 'l' || u === 'litro' || u === 'litros') return { cantidadBase: cantidad, unidadBase: 'Litros' };
  if (u === 'g') return { cantidadBase: cantidad / 1000, unidadBase: 'Kilos' };
  if (u === 'kg' || u === 'kilo' || u === 'kilos') return { cantidadBase: cantidad, unidadBase: 'Kilos' };
  return { cantidadBase: cantidad, unidadBase: 'Unidad' };
}

export function aggregateInsumosPorLote(
  movimientos: MovimientoRow[],
  movimientosProductos: MovimientoProductoRow[],
  precios: Map<string, number>,
): Map<string, InsumosPorLoteEntry> {
  const movLoteMap = new Map<string, string>();
  for (const m of movimientos) {
    if (m.id && m.lote_id) movLoteMap.set(m.id, m.lote_id);
  }

  const productoLoteAgg = new Map<string, ProductoAplicado & { loteId: string }>();
  for (const p of movimientosProductos) {
    const loteId = movLoteMap.get(p.movimiento_diario_id);
    if (!loteId || !p.producto_id) continue;

    const cantidad = Number(p.cantidad_utilizada) || 0;
    const { cantidadBase, unidadBase } = convertirUnidadBase(cantidad, p.unidad);
    const precioUnitario = precios.get(p.producto_id) || 0;
    const key = `${loteId}::${p.producto_id}`;

    let cur = productoLoteAgg.get(key);
    if (!cur) {
      cur = {
        loteId,
        productoId: p.producto_id,
        productoNombre: p.producto_nombre || 'Producto',
        unidadBase,
        cantidadBase: 0,
        precioUnitario,
        costoTotal: 0,
      };
      productoLoteAgg.set(key, cur);
    }
    cur.cantidadBase += cantidadBase;
    cur.costoTotal = cur.cantidadBase * cur.precioUnitario;
  }

  const result = new Map<string, InsumosPorLoteEntry>();
  for (const item of productoLoteAgg.values()) {
    let entry = result.get(item.loteId);
    if (!entry) {
      entry = { cantidadTotal: 0, costoTotal: 0, productos: [] };
      result.set(item.loteId, entry);
    }
    entry.productos.push({
      productoId: item.productoId,
      productoNombre: item.productoNombre,
      unidadBase: item.unidadBase,
      cantidadBase: item.cantidadBase,
      precioUnitario: item.precioUnitario,
      costoTotal: item.costoTotal,
    });
    entry.cantidadTotal += item.cantidadBase;
    entry.costoTotal += item.costoTotal;
  }
  return result;
}

export function aggregateJornalesPorLote(
  registros: RegistroTrabajoRow[],
): Map<string, JornalesPorLoteEntry> {
  const result = new Map<string, JornalesPorLoteEntry>();
  for (const r of registros) {
    if (!r.lote_id) continue;
    const cur = result.get(r.lote_id) ?? { jornales: 0, costo: 0 };
    cur.jornales += Number(r.fraccion_jornal) || 0;
    cur.costo += Number(r.costo_jornal) || 0;
    result.set(r.lote_id, cur);
  }
  return result;
}

export function combineCostosPorLote(
  insumosByLote: Map<string, InsumosPorLoteEntry>,
  jornalesByLote: Map<string, JornalesPorLoteEntry>,
  lotesInfo: LoteInfo[],
): CostoPorLoteRow[] {
  const lotesMap = new Map(lotesInfo.map((l) => [l.id, l]));
  const allLoteIds = new Set<string>([
    ...insumosByLote.keys(),
    ...jornalesByLote.keys(),
    ...lotesInfo.map((l) => l.id),
  ]);

  const rows: CostoPorLoteRow[] = [];
  for (const loteId of allLoteIds) {
    const lote = lotesMap.get(loteId);
    const insumos = insumosByLote.get(loteId);
    const jornales = jornalesByLote.get(loteId);
    const arboles = lote?.total_arboles ?? 0;
    const costoInsumos = insumos?.costoTotal ?? 0;
    const costoManoObra = jornales?.costo ?? 0;
    const costoTotal = costoInsumos + costoManoObra;
    rows.push({
      lote_id: loteId,
      lote_nombre: lote?.nombre ?? loteId,
      arboles_total: arboles,
      costo_insumos: Math.round(costoInsumos),
      costo_mano_obra: Math.round(costoManoObra),
      costo_total: Math.round(costoTotal),
      costo_por_arbol: arboles > 0 ? Math.round(costoTotal / arboles) : 0,
      jornales: jornales?.jornales ?? 0,
    });
  }
  return rows;
}

export interface AggregatedSummary {
  costo_insumos: number;
  costo_mano_obra: number;
  costo_total: number;
  jornales: number;
  arboles_total: number;
  costo_por_arbol: number;
}

export function summariseCostos(rows: CostoPorLoteRow[]): AggregatedSummary {
  const summary = rows.reduce(
    (acc, r) => {
      acc.costo_insumos += r.costo_insumos;
      acc.costo_mano_obra += r.costo_mano_obra;
      acc.costo_total += r.costo_total;
      acc.jornales += r.jornales;
      acc.arboles_total += r.arboles_total;
      return acc;
    },
    { costo_insumos: 0, costo_mano_obra: 0, costo_total: 0, jornales: 0, arboles_total: 0, costo_por_arbol: 0 },
  );
  summary.costo_por_arbol = summary.arboles_total > 0 ? Math.round(summary.costo_total / summary.arboles_total) : 0;
  return summary;
}
