import { useState } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { calcularRangoFechasPorPeriodo } from '@/utils/fechas';
import type { FiltrosFinanzas, KPIConVariacion, TransaccionGanado } from '@/types/finanzas';

function getYTDRange(year: number) {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return { desde: `${year}-01-01`, hasta: `${year}-${month}-${day}` };
}

function getYearRange(year: number) {
  return { desde: `${year}-01-01`, hasta: `${year}-12-31` };
}

function getQuarterLabel(fecha: string) {
  const month = parseInt(fecha.substring(5, 7));
  const year = fecha.substring(0, 4);
  const q = Math.ceil(month / 3);
  return `Q${q} ${year}`;
}

function compareQuarters(a: string, b: string) {
  const [qA, yA] = [parseInt(a[1]), parseInt(a.substring(3))];
  const [qB, yB] = [parseInt(b[1]), parseInt(b.substring(3))];
  if (yA !== yB) return yA - yB;
  return qA - qB;
}

function resolveFechas(filtros: FiltrosFinanzas) {
  if (filtros.periodo && filtros.periodo !== 'rango_personalizado') {
    return calcularRangoFechasPorPeriodo(filtros.periodo);
  }
  return { fecha_desde: filtros.fecha_desde || '', fecha_hasta: filtros.fecha_hasta || '' };
}

function variacion(actual: number, anterior: number) {
  if (anterior === 0) return actual > 0 ? 100 : 0;
  return ((actual - anterior) / anterior) * 100;
}

export function useGanadoData() {
  const [loading, setLoading] = useState(false);
  const supabase = getSupabase();

  async function sumTransacciones(desde: string, hasta: string, tipo: 'compra' | 'venta', field: 'valor_total' | 'kilos_pagados' = 'valor_total', finca?: string) {
    let q: any = supabase
      .from('fin_transacciones_ganado')
      .select(field)
      .eq('tipo', tipo)
      .gte('fecha', desde)
      .lte('fecha', hasta);
    if (finca) q = q.ilike('finca', finca);
    const { data } = await q;
    return (data as any[])?.reduce((s: number, r: any) => s + (r[field] || 0), 0) || 0;
  }

  const getKPIsGanado = async (filtros: FiltrosFinanzas, ganadoNegocioId?: string, finca?: string): Promise<{
    ventas: KPIConVariacion;
    compras: KPIConVariacion;
    kilosVendidos: KPIConVariacion;
    kilosComprados: KPIConVariacion;
    gastosActual: KPIConVariacion;
    gastosYtdAnterior: KPIConVariacion;
    gastosN1: KPIConVariacion;
    gastosN2: KPIConVariacion;
  }> => {
    setLoading(true);
    try {
      const year = new Date().getFullYear();
      const ytd0 = getYTDRange(year);
      const ytd1 = getYTDRange(year - 1);
      const full1 = getYearRange(year - 1);
      const full2 = getYearRange(year - 2);

      const [ventasAct, ventasAnt, comprasAct, comprasAnt, kVendAct, kVendAnt, kCompAct, kCompAnt] = await Promise.all([
        sumTransacciones(ytd0.desde, ytd0.hasta, 'venta', 'valor_total', finca),
        sumTransacciones(ytd1.desde, ytd1.hasta, 'venta', 'valor_total', finca),
        sumTransacciones(ytd0.desde, ytd0.hasta, 'compra', 'valor_total', finca),
        sumTransacciones(ytd1.desde, ytd1.hasta, 'compra', 'valor_total', finca),
        sumTransacciones(ytd0.desde, ytd0.hasta, 'venta', 'kilos_pagados', finca),
        sumTransacciones(ytd1.desde, ytd1.hasta, 'venta', 'kilos_pagados', finca),
        sumTransacciones(ytd0.desde, ytd0.hasta, 'compra', 'kilos_pagados', finca),
        sumTransacciones(ytd1.desde, ytd1.hasta, 'compra', 'kilos_pagados', finca),
      ]);

      // Gastos for Ganado negocio — 4 periods
      const regionId = typeof filtros.region_id === 'string' ? filtros.region_id : undefined;
      let gAct = 0, gYtd1 = 0, gFull1 = 0, gFull2 = 0;
      if (ganadoNegocioId) {
        const sumG = async (desde: string, hasta: string) => {
          let q: any = supabase.from('fin_gastos').select('valor').eq('estado', 'Confirmado').eq('negocio_id', ganadoNegocioId).gte('fecha', desde).lte('fecha', hasta);
          if (regionId) q = q.eq('region_id', regionId);
          const { data } = await q;
          return (data as any[])?.reduce((s: number, r: any) => s + (r.valor || 0), 0) || 0;
        };
        [gAct, gYtd1, gFull1, gFull2] = await Promise.all([
          sumG(ytd0.desde, ytd0.hasta),
          sumG(ytd1.desde, ytd1.hasta),
          sumG(full1.desde, full1.hasta),
          sumG(full2.desde, full2.hasta),
        ]);
      }

      return {
        ventas: { valor: ventasAct, variacion_porcentaje: variacion(ventasAct, ventasAnt), periodo_label: `Ventas YTD ${year}` },
        compras: { valor: comprasAct, variacion_porcentaje: variacion(comprasAct, comprasAnt), periodo_label: `Compras YTD ${year}` },
        kilosVendidos: { valor: kVendAct, variacion_porcentaje: variacion(kVendAct, kVendAnt), periodo_label: `Kilos vendidos` },
        kilosComprados: { valor: kCompAct, variacion_porcentaje: variacion(kCompAct, kCompAnt), periodo_label: `Kilos comprados` },
        gastosActual: { valor: gAct, variacion_porcentaje: variacion(gAct, gYtd1), periodo_label: `YTD ${year}` },
        gastosYtdAnterior: { valor: gYtd1, variacion_porcentaje: 0, periodo_label: `YTD ${year - 1}` },
        gastosN1: { valor: gFull1, variacion_porcentaje: variacion(gFull1, gFull2), periodo_label: `Total ${year - 1}` },
        gastosN2: { valor: gFull2, variacion_porcentaje: 0, periodo_label: `Total ${year - 2}` },
      };
    } finally {
      setLoading(false);
    }
  };

  const getTransaccionesPorFinca = async (filtros: FiltrosFinanzas, finca?: string): Promise<{
    finca: string;
    compra_dinero: number;
    venta_dinero: number;
    compra_kilos: number;
    venta_kilos: number;
  }[]> => {
    setLoading(true);
    try {
      const { fecha_desde, fecha_hasta } = resolveFechas(filtros);
      let q: any = supabase.from('fin_transacciones_ganado').select('tipo, finca, valor_total, kilos_pagados');
      if (fecha_desde) q = q.gte('fecha', fecha_desde);
      if (fecha_hasta) q = q.lte('fecha', fecha_hasta);
      if (finca) q = q.ilike('finca', finca);

      const { data } = await q;
      if (!data) return [];

      const fincaMap = new Map<string, { compra_dinero: number; venta_dinero: number; compra_kilos: number; venta_kilos: number }>();

      (data as any[]).forEach((t: any) => {
        const finca = t.finca || 'Sin finca';
        if (!fincaMap.has(finca)) fincaMap.set(finca, { compra_dinero: 0, venta_dinero: 0, compra_kilos: 0, venta_kilos: 0 });
        const entry = fincaMap.get(finca)!;
        if (t.tipo === 'compra') {
          entry.compra_dinero += t.valor_total || 0;
          entry.compra_kilos += t.kilos_pagados || 0;
        } else {
          entry.venta_dinero += t.valor_total || 0;
          entry.venta_kilos += t.kilos_pagados || 0;
        }
      });

      return Array.from(fincaMap.entries()).map(([finca, values]) => ({ finca, ...values }));
    } finally {
      setLoading(false);
    }
  };

  const getTransaccionesPorTrimestre = async (filtros: FiltrosFinanzas, finca?: string): Promise<{ trimestre: string; compra: number; venta: number }[]> => {
    setLoading(true);
    try {
      const year = new Date().getFullYear();
      let q: any = supabase
        .from('fin_transacciones_ganado')
        .select('fecha, tipo, cantidad_cabezas')
        .gte('fecha', `${year - 1}-01-01`)
        .lte('fecha', `${year}-12-31`);
      if (finca) q = q.ilike('finca', finca);
      const { data } = await q;

      if (!data) return [];

      const qMap = new Map<string, { compra: number; venta: number }>();
      (data as any[]).forEach((t: any) => {
        const q = getQuarterLabel(t.fecha);
        if (!qMap.has(q)) qMap.set(q, { compra: 0, venta: 0 });
        const entry = qMap.get(q)!;
        if (t.tipo === 'compra') entry.compra += t.cantidad_cabezas;
        else entry.venta += t.cantidad_cabezas;
      });

      return Array.from(qMap.entries())
        .sort(([a], [b]) => compareQuarters(a, b))
        .map(([trimestre, values]) => ({ trimestre, ...values }));
    } finally {
      setLoading(false);
    }
  };

  const getDetalleTransacciones = async (filtros: FiltrosFinanzas, tipo?: 'compra' | 'venta', finca?: string): Promise<Record<string, unknown>[]> => {
    setLoading(true);
    try {
      const { fecha_desde, fecha_hasta } = resolveFechas(filtros);
      let q: any = supabase
        .from('fin_transacciones_ganado')
        .select('*')
        .order('fecha', { ascending: false });
      if (tipo) q = q.eq('tipo', tipo);
      if (finca) q = q.ilike('finca', finca);
      if (fecha_desde) q = q.gte('fecha', fecha_desde);
      if (fecha_hasta) q = q.lte('fecha', fecha_hasta);

      const { data } = await q;
      return ((data || []) as any[]).map((t: any) => ({
        fecha: t.fecha,
        tipo: t.tipo,
        finca: t.finca,
        cliente_proveedor: t.cliente_proveedor,
        cantidad_cabezas: t.cantidad_cabezas,
        kilos_pagados: t.kilos_pagados,
        precio_kilo: t.precio_kilo,
        valor_total: t.valor_total,
      }));
    } finally {
      setLoading(false);
    }
  };

  const getFincas = async (): Promise<string[]> => {
    const { data } = await (supabase
      .from('fin_transacciones_ganado')
      .select('finca') as any);
    if (!data) return [];
    // Deduplicate case-insensitively, keeping the first occurrence
    const seen = new Map<string, string>();
    (data as any[]).forEach((r: any) => {
      if (r.finca && !seen.has(r.finca.toLowerCase())) {
        seen.set(r.finca.toLowerCase(), r.finca);
      }
    });
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  };

  return {
    loading,
    getKPIsGanado,
    getTransaccionesPorFinca,
    getTransaccionesPorTrimestre,
    getDetalleTransacciones,
    getFincas,
  };
}
