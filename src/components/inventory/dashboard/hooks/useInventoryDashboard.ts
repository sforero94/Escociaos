import { useState } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { calcularRangoFechasPorPeriodo } from '@/utils/fechas';
import type { DashboardPeriodo, KPIConVariacion } from '@/types/finanzas';

export interface TreemapCategoriaItem {
  name: string;
  valor: number;
}

export interface PivotTrimestreRow {
  categoria: string;
  trimestres: { label: string; cop: number; qty: number }[];
  productos?: PivotTrimestreRow[];
}

export interface ConsumoAplicacion {
  aplicacion_id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  estado: string;
  fecha_inicio: string | null;
  productos_count: number;
  costo_total: number;
  productos: { nombre: string; categoria: string; cantidad: number; unidad: string; valor: number }[];
}

export interface AlertaVencimiento {
  compra_id: string;
  producto_nombre: string;
  categoria: string;
  fecha_vencimiento: string;
  dias_restantes: number;
  cantidad: number;
  unidad: string;
  valor: number;
  proveedor: string;
  vencido: boolean;
}

export interface InversionLoteCategoria {
  categoria: string;
  costo: number;
  cantidad: number;
  unidad: string;
}

export interface InversionLote {
  lote: string;
  lote_id: string;
  costo_total: number;
  hectareas: number;
  arboles: number;
  costo_por_ha: number;
  costo_por_arbol: number;
  categorias: InversionLoteCategoria[];
}

function resolveFechas(periodo: DashboardPeriodo, fechasCustom?: { desde: string; hasta: string }) {
  if (periodo === 'rango_personalizado' && fechasCustom) {
    return { fecha_desde: fechasCustom.desde, fecha_hasta: fechasCustom.hasta };
  }
  return calcularRangoFechasPorPeriodo(periodo);
}

function variacion(actual: number, anterior: number): number {
  if (anterior === 0 && actual === 0) return 0;
  if (anterior === 0) return 100;
  return ((actual - anterior) / anterior) * 100;
}

function getQuarterRange(quarter: number, year: number) {
  const startMonth = (quarter - 1) * 3;
  const desde = `${year}-${String(startMonth + 1).padStart(2, '0')}-01`;
  const endMonth = startMonth + 3;
  const hasta = endMonth > 12
    ? `${year + 1}-01-01`
    : `${year}-${String(endMonth + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(new Date(hasta).getTime() - 86400000);
  const hastaStr = `${year}-${String(startMonth + 3).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
  return { desde, hasta: hastaStr };
}

function getQuarterLabel(quarter: number, year: number) {
  return `Q${quarter} ${year}`;
}

export function useInventoryDashboard() {
  const [loading, setLoading] = useState(false);
  const supabase = getSupabase();

  async function getKPIsInventario(periodo: DashboardPeriodo, fechasCustom?: { desde: string; hasta: string }) {
    setLoading(true);
    try {
      const { fecha_desde, fecha_hasta } = resolveFechas(periodo, fechasCustom);
      const currentYear = new Date().getFullYear();

      const prevDesde = fecha_desde.replace(String(currentYear), String(currentYear - 1));
      const prevHasta = fecha_hasta.replace(String(currentYear), String(currentYear - 1));

      // Valoracion total (current snapshot) — only active products with stock > 0
      const { data: productos } = await supabase
        .from('productos')
        .select('cantidad_actual, precio_unitario, activo') as { data: any[] | null };

      const productosActivos = productos?.filter(p => p.activo) || [];
      const valoracionTotal = productosActivos
        .reduce((acc: number, p: any) => acc + (Math.max(0, p.cantidad_actual || 0) * (p.precio_unitario || 0)), 0);

      // Valoracion del mes anterior para variacion
      const now = new Date();
      const mesAnteriorFin = new Date(now.getFullYear(), now.getMonth(), 0); // ultimo dia mes anterior
      const mesAnteriorInicio = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const mesAnteriorFinStr = mesAnteriorFin.toISOString().split('T')[0];

      // Calculate approximate previous month valuation by subtracting this month's movements
      const { data: movEsteMes } = await supabase
        .from('movimientos_inventario')
        .select('tipo_movimiento, valor_movimiento')
        .gte('fecha_movimiento', `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`)
        .lte('fecha_movimiento', now.toISOString().split('T')[0]);

      let deltaEsteMes = 0;
      (movEsteMes as any[])?.forEach((m: any) => {
        const tipo = m.tipo_movimiento?.toLowerCase()?.trim();
        const val = Math.abs(m.valor_movimiento || 0);
        if (tipo === 'entrada') deltaEsteMes += val;
        else if (tipo?.includes('salida')) deltaEsteMes -= val;
      });
      const valoracionMesAnterior = valoracionTotal - deltaEsteMes;
      const varValoracion = variacion(valoracionTotal, valoracionMesAnterior);

      // Movements in period
      const { data: movActual } = await supabase
        .from('movimientos_inventario')
        .select('tipo_movimiento, cantidad, valor_movimiento')
        .gte('fecha_movimiento', fecha_desde)
        .lte('fecha_movimiento', fecha_hasta);

      const { data: movAnterior } = await supabase
        .from('movimientos_inventario')
        .select('tipo_movimiento, cantidad, valor_movimiento')
        .gte('fecha_movimiento', prevDesde)
        .lte('fecha_movimiento', prevHasta);

      const calcMovimientos = (movs: typeof movActual) => {
        let entradasCop = 0, salidasCop = 0;
        movs?.forEach((m: any) => {
          const tipo = m.tipo_movimiento?.toLowerCase()?.trim();
          const valor = Math.abs(m.valor_movimiento || 0);
          if (tipo === 'entrada') entradasCop += valor;
          else if (tipo?.includes('salida')) salidasCop += valor;
        });
        return { entradasCop, salidasCop };
      };

      const actual = calcMovimientos(movActual);
      const anterior = calcMovimientos(movAnterior);

      const valoracion: KPIConVariacion = {
        valor: valoracionTotal,
        variacion_porcentaje: varValoracion,
        periodo_label: 'Valoracion Inventario',
      };

      const entradas: KPIConVariacion = {
        valor: actual.entradasCop,
        variacion_porcentaje: variacion(actual.entradasCop, anterior.entradasCop),
        periodo_label: 'Entradas (COP)',
      };

      const salidas: KPIConVariacion = {
        valor: actual.salidasCop,
        variacion_porcentaje: variacion(actual.salidasCop, anterior.salidasCop),
        periodo_label: 'Salidas (COP)',
      };

      return { valoracion, entradas, salidas };
    } finally {
      setLoading(false);
    }
  }

  async function getValoracionPorCategoria(): Promise<{ items: TreemapCategoriaItem[]; total: number }> {
    const { data } = await supabase
      .from('productos')
      .select('nombre, categoria, cantidad_actual, precio_unitario, activo')
      .eq('activo', true);

    if (!data) return { items: [], total: 0 };

    const catMap = new Map<string, number>();
    let total = 0;
    (data as any[]).forEach(p => {
      const valor = Math.max(0, p.cantidad_actual || 0) * (p.precio_unitario || 0);
      if (valor <= 0) return;
      const cat = p.categoria || 'Otros';
      catMap.set(cat, (catMap.get(cat) || 0) + valor);
      total += valor;
    });

    const items = Array.from(catMap.entries())
      .map(([name, valor]) => ({ name, valor }))
      .sort((a, b) => b.valor - a.valor);

    return { items, total };
  }

  async function getAlertasVencimiento(): Promise<AlertaVencimiento[]> {
    const hoy = new Date();
    const limite = new Date();
    limite.setDate(limite.getDate() + 60);
    const limiteStr = limite.toISOString().split('T')[0];
    const hoyStr = hoy.toISOString().split('T')[0];

    const { data } = await supabase
      .from('compras')
      .select('id, producto_id, cantidad, unidad, proveedor, fecha_vencimiento, costo_unitario, producto:productos(nombre, categoria)')
      .not('fecha_vencimiento', 'is', null)
      .lte('fecha_vencimiento', limiteStr)
      .order('fecha_vencimiento', { ascending: true });

    if (!data) return [];

    return (data as any[]).map((c: any) => {
      const fv = c.fecha_vencimiento;
      const diasRestantes = Math.ceil((new Date(fv).getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
      return {
        compra_id: c.id,
        producto_nombre: c.producto?.nombre || 'Desconocido',
        categoria: c.producto?.categoria || 'Otros',
        fecha_vencimiento: fv,
        dias_restantes: diasRestantes,
        cantidad: c.cantidad,
        unidad: c.unidad,
        valor: (c.cantidad || 0) * (c.costo_unitario || 0),
        proveedor: c.proveedor,
        vencido: fv <= hoyStr,
      };
    });
  }

  async function getPivotPorTrimestre(): Promise<{ rows: PivotTrimestreRow[]; labels: string[] }> {
    const now = new Date();
    const currentQ = Math.ceil((now.getMonth() + 1) / 3);
    const currentYear = now.getFullYear();

    // Generate last 4 quarters
    const quarters: { q: number; y: number; label: string; desde: string; hasta: string }[] = [];
    let q = currentQ;
    let y = currentYear;
    for (let i = 0; i < 4; i++) {
      const startMonth = (q - 1) * 3 + 1;
      const endMonth = q * 3;
      const desde = `${y}-${String(startMonth).padStart(2, '0')}-01`;
      const lastDay = new Date(y, endMonth, 0).getDate();
      const hasta = `${y}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      quarters.unshift({ q, y, label: `Q${q} ${y}`, desde, hasta });
      q--;
      if (q === 0) { q = 4; y--; }
    }

    const fetchMovimientos = async (desde: string, hasta: string) => {
      const { data } = await supabase
        .from('movimientos_inventario')
        .select('producto_id, cantidad, valor_movimiento, producto:productos(nombre, categoria, unidad_medida)')
        .gte('fecha_movimiento', desde)
        .lte('fecha_movimiento', hasta);
      return (data || []) as any[];
    };

    const allData = await Promise.all(quarters.map(qr => fetchMovimientos(qr.desde, qr.hasta)));

    // Build aggregation per quarter
    type CatAgg = Map<string, { cop: number; qty: number; porProducto: Map<string, { cop: number; qty: number; unidad: string }> }>;

    const quarterAggs: CatAgg[] = allData.map(movs => {
      const map: CatAgg = new Map();
      movs.forEach((m: any) => {
        const cat = m.producto?.categoria || 'Otros';
        const prod = m.producto?.nombre || 'Desconocido';
        const unidad = m.producto?.unidad_medida || '';
        const valor = Math.abs(m.valor_movimiento || 0);
        const qty = Math.abs(m.cantidad || 0);

        if (!map.has(cat)) map.set(cat, { cop: 0, qty: 0, porProducto: new Map() });
        const agg = map.get(cat)!;
        agg.cop += valor;
        agg.qty += qty;

        if (!agg.porProducto.has(prod)) agg.porProducto.set(prod, { cop: 0, qty: 0, unidad });
        const pAgg = agg.porProducto.get(prod)!;
        pAgg.cop += valor;
        pAgg.qty += qty;
      });
      return map;
    });

    const allCats = new Set<string>();
    quarterAggs.forEach(agg => agg.forEach((_, cat) => allCats.add(cat)));

    const labels = quarters.map(qr => qr.label);

    const rows: PivotTrimestreRow[] = Array.from(allCats).sort().map(cat => {
      const trimestres = quarterAggs.map(agg => {
        const d = agg.get(cat);
        return { label: '', cop: d?.cop || 0, qty: d?.qty || 0 };
      });

      // Build product sub-rows
      const allProds = new Set<string>();
      quarterAggs.forEach(agg => {
        const catAgg = agg.get(cat);
        catAgg?.porProducto.forEach((_, prod) => allProds.add(prod));
      });

      const productos: PivotTrimestreRow[] = Array.from(allProds).sort().map(prod => ({
        categoria: prod,
        trimestres: quarterAggs.map(agg => {
          const pAgg = agg.get(cat)?.porProducto.get(prod);
          return { label: '', cop: pAgg?.cop || 0, qty: pAgg?.qty || 0 };
        }),
      }));

      return { categoria: cat, trimestres, productos };
    });

    return { rows, labels };
  }

  async function getConsumoAplicaciones(periodo: DashboardPeriodo, fechasCustom?: { desde: string; hasta: string }): Promise<ConsumoAplicacion[]> {
    const { fecha_desde, fecha_hasta } = resolveFechas(periodo, fechasCustom);

    // Get movements with product details
    const { data: movimientos } = await supabase
      .from('movimientos_inventario')
      .select('aplicacion_id, valor_movimiento, producto_id, cantidad, unidad, producto:productos(nombre, categoria)')
      .not('aplicacion_id', 'is', null)
      .gte('fecha_movimiento', fecha_desde)
      .lte('fecha_movimiento', fecha_hasta);

    if (!movimientos || movimientos.length === 0) return [];

    interface AppEntry {
      productos: Map<string, { nombre: string; categoria: string; cantidad: number; unidad: string; valor: number }>;
      costo: number;
    }

    const appMap = new Map<string, AppEntry>();
    (movimientos as any[]).forEach((m: any) => {
      if (!m.aplicacion_id) return;
      if (!appMap.has(m.aplicacion_id)) appMap.set(m.aplicacion_id, { productos: new Map(), costo: 0 });
      const entry = appMap.get(m.aplicacion_id)!;
      const val = Math.abs(m.valor_movimiento || 0);
      entry.costo += val;

      const prodId = m.producto_id;
      if (!entry.productos.has(prodId)) {
        entry.productos.set(prodId, {
          nombre: m.producto?.nombre || 'Desconocido',
          categoria: m.producto?.categoria || 'Otros',
          cantidad: 0,
          unidad: m.unidad || '',
          valor: 0,
        });
      }
      const p = entry.productos.get(prodId)!;
      p.cantidad += Math.abs(m.cantidad || 0);
      p.valor += val;
    });

    const appIds = Array.from(appMap.keys());
    const { data: apps } = await supabase
      .from('aplicaciones')
      .select('id, codigo_aplicacion, nombre_aplicacion, tipo_aplicacion, estado, fecha_inicio_ejecucion')
      .in('id', appIds);

    if (!apps) return [];

    return (apps as any[])
      .map((app: any) => {
        const entry = appMap.get(app.id);
        const productos = entry ? Array.from(entry.productos.values()).sort((a, b) => b.valor - a.valor) : [];
        return {
          aplicacion_id: app.id,
          codigo: app.codigo_aplicacion || '',
          nombre: app.nombre_aplicacion || app.codigo_aplicacion || '',
          tipo: app.tipo_aplicacion || '',
          estado: app.estado || '',
          fecha_inicio: app.fecha_inicio_ejecucion,
          productos_count: productos.length,
          costo_total: entry?.costo || 0,
          productos,
        };
      })
      .sort((a, b) => {
        // Most recent first
        const dateA = a.fecha_inicio || '';
        const dateB = b.fecha_inicio || '';
        return dateB.localeCompare(dateA);
      });
  }

  async function getInversionPorLote(periodo: DashboardPeriodo, fechasCustom?: { desde: string; hasta: string }): Promise<{ lotes: InversionLote[]; totales: { costo_total: number; hectareas: number; arboles: number; costo_por_ha: number; costo_por_arbol: number } }> {
    const { fecha_desde, fecha_hasta } = resolveFechas(periodo, fechasCustom);

    // Use movimientos_diarios (has proper lote_id) + movimientos_diarios_productos
    const { data: movDiarios } = await supabase
      .from('movimientos_diarios')
      .select('id, lote_id, lote_nombre, aplicacion_id')
      .gte('fecha_movimiento', fecha_desde)
      .lte('fecha_movimiento', fecha_hasta) as { data: any[] | null };

    if (!movDiarios || movDiarios.length === 0) {
      return { lotes: [], totales: { costo_total: 0, hectareas: 0, arboles: 0, costo_por_ha: 0, costo_por_arbol: 0 } };
    }

    const movIds = movDiarios.map((m: any) => m.id);

    const { data: movProductos } = await supabase
      .from('movimientos_diarios_productos')
      .select('movimiento_diario_id, producto_id, producto_nombre, producto_categoria, cantidad_utilizada, unidad')
      .in('movimiento_diario_id', movIds) as { data: any[] | null };

    // Get product prices for cost calculation
    const prodIds = [...new Set((movProductos || []).map((mp: any) => mp.producto_id))];
    const { data: prodPrices } = await supabase
      .from('productos')
      .select('id, precio_unitario, unidad_medida')
      .in('id', prodIds) as { data: any[] | null };

    const priceMap = new Map<string, { precio: number; unidad_base: string }>();
    (prodPrices || []).forEach((p: any) => priceMap.set(p.id, { precio: p.precio_unitario || 0, unidad_base: p.unidad_medida || '' }));

    // Build lote_id -> movimiento_diario_id mapping
    const movToLote = new Map<string, { lote_id: string; lote_nombre: string }>();
    movDiarios.forEach((m: any) => {
      movToLote.set(m.id, { lote_id: m.lote_id, lote_nombre: m.lote_nombre || '' });
    });

    // Get lotes for hectareas/arboles
    const { data: lotesData } = await supabase
      .from('lotes')
      .select('id, nombre, area_hectareas, total_arboles')
      .eq('activo', true) as { data: any[] | null };

    const lotesInfoMap = new Map<string, { nombre: string; hectareas: number; arboles: number }>();
    (lotesData || []).forEach((l: any) => {
      lotesInfoMap.set(l.id, { nombre: l.nombre, hectareas: l.area_hectareas || 0, arboles: l.total_arboles || 0 });
    });

    // Unit conversion to base units (kg/L) for cost calculation
    const convertToBase = (cantidad: number, unidad: string): number => {
      const u = unidad?.toLowerCase()?.trim();
      if (u === 'g') return cantidad / 1000;
      if (u === 'cc' || u === 'ml') return cantidad / 1000;
      return cantidad; // Already kg or L
    };

    // Aggregate by lote -> categoria
    interface LoteAgg {
      lote_id: string;
      lote_nombre: string;
      categorias: Map<string, { costo: number; cantidad: number; unidad: string }>;
      costo_total: number;
    }

    const loteAggMap = new Map<string, LoteAgg>();

    (movProductos || []).forEach((mp: any) => {
      const movInfo = movToLote.get(mp.movimiento_diario_id);
      if (!movInfo) return;

      const { lote_id, lote_nombre } = movInfo;
      if (!loteAggMap.has(lote_id)) {
        loteAggMap.set(lote_id, { lote_id, lote_nombre, categorias: new Map(), costo_total: 0 });
      }
      const agg = loteAggMap.get(lote_id)!;

      const cat = mp.producto_categoria || 'Otros';
      const cantBase = convertToBase(mp.cantidad_utilizada || 0, mp.unidad || '');
      const price = priceMap.get(mp.producto_id);
      const costo = cantBase * (price?.precio || 0);

      if (!agg.categorias.has(cat)) agg.categorias.set(cat, { costo: 0, cantidad: 0, unidad: price?.unidad_base || mp.unidad || '' });
      const catAgg = agg.categorias.get(cat)!;
      catAgg.costo += costo;
      catAgg.cantidad += cantBase;
      agg.costo_total += costo;
    });

    let totalCosto = 0;
    let totalHa = 0;
    let totalArboles = 0;
    const usedLoteIds = new Set<string>();

    const lotes: InversionLote[] = Array.from(loteAggMap.values())
      .map(agg => {
        const info = lotesInfoMap.get(agg.lote_id) || { nombre: agg.lote_nombre, hectareas: 0, arboles: 0 };
        totalCosto += agg.costo_total;
        if (!usedLoteIds.has(agg.lote_id)) {
          totalHa += info.hectareas;
          totalArboles += info.arboles;
          usedLoteIds.add(agg.lote_id);
        }

        const categorias: InversionLoteCategoria[] = Array.from(agg.categorias.entries())
          .map(([cat, d]) => ({ categoria: cat, costo: d.costo, cantidad: d.cantidad, unidad: d.unidad }))
          .sort((a, b) => b.costo - a.costo);

        return {
          lote: info.nombre || agg.lote_nombre,
          lote_id: agg.lote_id,
          costo_total: agg.costo_total,
          hectareas: info.hectareas,
          arboles: info.arboles,
          costo_por_ha: info.hectareas > 0 ? agg.costo_total / info.hectareas : 0,
          costo_por_arbol: info.arboles > 0 ? agg.costo_total / info.arboles : 0,
          categorias,
        };
      })
      .sort((a, b) => b.costo_total - a.costo_total);

    return {
      lotes,
      totales: {
        costo_total: totalCosto,
        hectareas: totalHa,
        arboles: totalArboles,
        costo_por_ha: totalHa > 0 ? totalCosto / totalHa : 0,
        costo_por_arbol: totalArboles > 0 ? totalCosto / totalArboles : 0,
      },
    };
  }

  return {
    loading,
    getKPIsInventario,
    getValoracionPorCategoria,
    getAlertasVencimiento,
    getPivotPorTrimestre,
    getConsumoAplicaciones,
    getInversionPorLote,
  };
}
