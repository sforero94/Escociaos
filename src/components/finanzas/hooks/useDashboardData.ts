import { useState } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { calcularRangoFechasPorPeriodo } from '@/utils/fechas';
import type {
  FiltrosFinanzas,
  KPIConVariacion,
  PivotRow,
  DatoTrimestral,
  DatoTrimestralMultiSerie,
  DistribucionData,
} from '@/types/finanzas';

function getYearRange(year: number) {
  return { desde: `${year}-01-01`, hasta: `${year}-12-31` };
}

function getYTDRange(year: number) {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return { desde: `${year}-01-01`, hasta: `${year}-${month}-${day}` };
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

export function useDashboardData() {
  const [loading, setLoading] = useState(false);
  const supabase = getSupabase();

  const applyFilters = (query: ReturnType<typeof supabase.from>, filtros: FiltrosFinanzas, fechaDesde?: string, fechaHasta?: string) => {
    const desde = fechaDesde || filtros.fecha_desde;
    const hasta = fechaHasta || filtros.fecha_hasta;
    if (desde) query = query.gte('fecha', desde);
    if (hasta) query = query.lte('fecha', hasta);
    if (filtros.negocio_id) {
      if (Array.isArray(filtros.negocio_id)) {
        query = query.in('negocio_id', filtros.negocio_id);
      } else {
        query = query.eq('negocio_id', filtros.negocio_id);
      }
    }
    if (filtros.region_id) {
      if (Array.isArray(filtros.region_id)) {
        query = query.in('region_id', filtros.region_id);
      } else {
        query = query.eq('region_id', filtros.region_id);
      }
    }
    return query;
  };

  async function sumGastos(desde: string, hasta: string, negocioId?: string) {
    let q: any = supabase.from('fin_gastos').select('valor').eq('estado', 'Confirmado').gte('fecha', desde).lte('fecha', hasta);
    if (negocioId) q = q.eq('negocio_id', negocioId);
    const { data } = await q;
    return (data as any[])?.reduce((s: number, r: any) => s + (r.valor || 0), 0) || 0;
  }

  async function sumIngresos(desde: string, hasta: string, negocioId?: string) {
    let q: any = supabase.from('fin_ingresos').select('valor').gte('fecha', desde).lte('fecha', hasta);
    if (negocioId) q = q.eq('negocio_id', negocioId);
    const { data } = await q;
    return (data as any[])?.reduce((s: number, r: any) => s + (r.valor || 0), 0) || 0;
  }

  function variacion(actual: number, anterior: number) {
    if (anterior === 0) return actual > 0 ? 100 : 0;
    return ((actual - anterior) / anterior) * 100;
  }

  const getKPIsGastosGeneral = async (_filtros: FiltrosFinanzas): Promise<{
    ytdActual: KPIConVariacion;
    ytdAnterior: KPIConVariacion;
    totalAnterior: KPIConVariacion;
  }> => {
    setLoading(true);
    try {
      const year = new Date().getFullYear();
      const ytdCurrent = getYTDRange(year);
      const ytdPrev = getYTDRange(year - 1);
      const fullPrev = getYearRange(year - 1);
      const fullPrev2 = getYearRange(year - 2);

      const [ytdAct, ytdAnt, totalAnt, totalN2] = await Promise.all([
        sumGastos(ytdCurrent.desde, ytdCurrent.hasta),
        sumGastos(ytdPrev.desde, ytdPrev.hasta),
        sumGastos(fullPrev.desde, fullPrev.hasta),
        sumGastos(fullPrev2.desde, fullPrev2.hasta),
      ]);

      return {
        ytdActual: { valor: ytdAct, variacion_porcentaje: variacion(ytdAct, ytdAnt), periodo_label: `Gastos YTD ${year}` },
        ytdAnterior: { valor: ytdAnt, variacion_porcentaje: variacion(ytdAnt, totalN2), periodo_label: `Gastos YTD ${year - 1}` },
        totalAnterior: { valor: totalAnt, variacion_porcentaje: variacion(totalAnt, totalN2), periodo_label: `Total ${year - 1}` },
      };
    } finally {
      setLoading(false);
    }
  };

  const getGastosAcumuladosPivot = async (_filtros: FiltrosFinanzas): Promise<PivotRow[]> => {
    setLoading(true);
    try {
      const year = new Date().getFullYear();
      const ytdCurrent = getYTDRange(year);
      const ytdPrev = getYTDRange(year - 1);
      const fullPrev = getYearRange(year - 1);
      const fullPrev2 = getYearRange(year - 2);

      const { data: negocios } = await supabase.from('fin_negocios').select('id, nombre').eq('activo', true).order('nombre') as { data: any[] | null };
      if (!negocios) return [];

      const rows: PivotRow[] = await Promise.all(
        negocios.map(async (neg: any) => {
          const [ytdAct, ytdAnt, totalAnt, totalN2] = await Promise.all([
            sumGastos(ytdCurrent.desde, ytdCurrent.hasta, neg.id),
            sumGastos(ytdPrev.desde, ytdPrev.hasta, neg.id),
            sumGastos(fullPrev.desde, fullPrev.hasta, neg.id),
            sumGastos(fullPrev2.desde, fullPrev2.hasta, neg.id),
          ]);

          // Get categories for this negocio
          const { data: catData } = await (supabase
            .from('fin_gastos')
            .select('categoria_id, valor, fecha, fin_categorias_gastos(nombre)')
            .eq('estado', 'Confirmado')
            .eq('negocio_id', neg.id)
            .gte('fecha', fullPrev2.desde)
            .lte('fecha', ytdCurrent.hasta) as any);

          const catMap = new Map<string, { nombre: string; ytd_actual: number; ytd_anterior: number; total_anterior: number; total_n2: number }>();

          catData?.forEach((g: any) => {
            const catId = g.categoria_id || 'sin_cat';
            const catNombre = g.fin_categorias_gastos?.nombre || 'Sin categoria';
            if (!catMap.has(catId)) {
              catMap.set(catId, { nombre: catNombre, ytd_actual: 0, ytd_anterior: 0, total_anterior: 0, total_n2: 0 });
            }
            const entry = catMap.get(catId)!;
            const fecha = g.fecha;
            const val = g.valor || 0;
            if (fecha >= ytdCurrent.desde && fecha <= ytdCurrent.hasta) entry.ytd_actual += val;
            if (fecha >= ytdPrev.desde && fecha <= ytdPrev.hasta) entry.ytd_anterior += val;
            if (fecha >= fullPrev.desde && fecha <= fullPrev.hasta) entry.total_anterior += val;
            if (fecha >= fullPrev2.desde && fecha <= fullPrev2.hasta) entry.total_n2 += val;
          });

          const categorias: PivotRow[] = Array.from(catMap.entries()).map(([catId, c]) => ({
            negocio: c.nombre,
            negocio_id: catId,
            ytd_actual: c.ytd_actual,
            ytd_anterior: c.ytd_anterior,
            total_anterior: c.total_anterior,
            total_n2: c.total_n2,
          })).sort((a, b) => b.ytd_actual - a.ytd_actual);

          return {
            negocio: neg.nombre,
            negocio_id: neg.id,
            ytd_actual: ytdAct,
            ytd_anterior: ytdAnt,
            total_anterior: totalAnt,
            total_n2: totalN2,
            categorias,
          };
        })
      );

      return rows.sort((a, b) => b.ytd_actual - a.ytd_actual);
    } finally {
      setLoading(false);
    }
  };

  const getGastosPorTrimestreMultiSerie = async (_filtros: FiltrosFinanzas): Promise<{ data: DatoTrimestralMultiSerie[]; negocios: string[] }> => {
    setLoading(true);
    try {
      const year = new Date().getFullYear();
      const { data: gastos } = await (supabase
        .from('fin_gastos')
        .select('fecha, valor, negocio_id, fin_negocios(nombre)')
        .eq('estado', 'Confirmado')
        .gte('fecha', `${year - 1}-01-01`)
        .lte('fecha', `${year}-12-31`) as any);

      if (!gastos || gastos.length === 0) return { data: [], negocios: [] };

      const negocioNames = new Set<string>();
      const quarterMap = new Map<string, Record<string, number>>();

      (gastos as any[]).forEach((g: any) => {
        const qLabel = getQuarterLabel(g.fecha);
        const negNombre = g.fin_negocios?.nombre || 'Otro';
        negocioNames.add(negNombre);
        if (!quarterMap.has(qLabel)) quarterMap.set(qLabel, {});
        const entry = quarterMap.get(qLabel)!;
        entry[negNombre] = (entry[negNombre] || 0) + (g.valor || 0);
      });

      const negocios = Array.from(negocioNames).sort();
      const result: DatoTrimestralMultiSerie[] = Array.from(quarterMap.entries())
        .sort(([a], [b]) => compareQuarters(a, b))
        .map(([trimestre, values]) => ({ trimestre, ...values }));

      return { data: result, negocios };
    } finally {
      setLoading(false);
    }
  };

  const getGastosPorCategoriaStacked = async (_filtros: FiltrosFinanzas): Promise<{ data: { name: string; value: number; [key: string]: number | string }[]; negocios: string[] }> => {
    setLoading(true);
    try {
      const { fecha_desde, fecha_hasta } = resolveFechas(_filtros);
      let q: any = supabase
        .from('fin_gastos')
        .select('valor, fin_categorias_gastos(nombre), fin_negocios(nombre)')
        .eq('estado', 'Confirmado');
      if (fecha_desde) q = q.gte('fecha', fecha_desde);
      if (fecha_hasta) q = q.lte('fecha', fecha_hasta);

      const { data: gastos } = await q;
      if (!gastos || gastos.length === 0) return { data: [], negocios: [] };

      const negocioNames = new Set<string>();
      const catMap = new Map<string, Record<string, number>>();

      gastos.forEach((g: any) => {
        const catNombre = g.fin_categorias_gastos?.nombre || 'Sin categoria';
        const negNombre = g.fin_negocios?.nombre || 'Otro';
        negocioNames.add(negNombre);
        if (!catMap.has(catNombre)) catMap.set(catNombre, {});
        const entry = catMap.get(catNombre)!;
        entry[negNombre] = (entry[negNombre] || 0) + (g.valor || 0);
      });

      const negocios = Array.from(negocioNames).sort();
      const result = Array.from(catMap.entries())
        .map(([name, values]) => {
          const total = Object.values(values).reduce((s, v) => s + v, 0);
          return { name, ...values, value: total };
        })
        .sort((a, b) => (b.value as number) - (a.value as number));

      return { data: result, negocios };
    } finally {
      setLoading(false);
    }
  };

  const getKPIsNegocio = async (negocioId: string): Promise<{
    ingresosActual: KPIConVariacion;
    ingresosYtdAnterior: KPIConVariacion;
    ingresosN1: KPIConVariacion;
    ingresosN2: KPIConVariacion;
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

      const [iAct, iYtd1, i1, i2, gAct, gYtd1, g1, g2] = await Promise.all([
        sumIngresos(ytd0.desde, ytd0.hasta, negocioId),
        sumIngresos(ytd1.desde, ytd1.hasta, negocioId),
        sumIngresos(full1.desde, full1.hasta, negocioId),
        sumIngresos(full2.desde, full2.hasta, negocioId),
        sumGastos(ytd0.desde, ytd0.hasta, negocioId),
        sumGastos(ytd1.desde, ytd1.hasta, negocioId),
        sumGastos(full1.desde, full1.hasta, negocioId),
        sumGastos(full2.desde, full2.hasta, negocioId),
      ]);

      return {
        ingresosActual: { valor: iAct, variacion_porcentaje: variacion(iAct, iYtd1), periodo_label: `YTD ${year}` },
        ingresosYtdAnterior: { valor: iYtd1, variacion_porcentaje: 0, periodo_label: `YTD ${year - 1}` },
        ingresosN1: { valor: i1, variacion_porcentaje: variacion(i1, i2), periodo_label: `Total ${year - 1}` },
        ingresosN2: { valor: i2, variacion_porcentaje: 0, periodo_label: `Total ${year - 2}` },
        gastosActual: { valor: gAct, variacion_porcentaje: variacion(gAct, gYtd1), periodo_label: `YTD ${year}` },
        gastosYtdAnterior: { valor: gYtd1, variacion_porcentaje: 0, periodo_label: `YTD ${year - 1}` },
        gastosN1: { valor: g1, variacion_porcentaje: variacion(g1, g2), periodo_label: `Total ${year - 1}` },
        gastosN2: { valor: g2, variacion_porcentaje: 0, periodo_label: `Total ${year - 2}` },
      };
    } finally {
      setLoading(false);
    }
  };

  const getIngresosTrimestralesNegocio = async (negocioId: string, _filtros: FiltrosFinanzas): Promise<DatoTrimestral[]> => {
    setLoading(true);
    try {
      const year = new Date().getFullYear();
      const { data: ingresos } = await (supabase
        .from('fin_ingresos')
        .select('fecha, valor')
        .eq('negocio_id', negocioId)
        .gte('fecha', `${year - 1}-01-01`)
        .lte('fecha', `${year}-12-31`) as any);

      if (!ingresos) return [];

      const qMap = new Map<string, number>();
      (ingresos as any[]).forEach((i: any) => {
        const q = getQuarterLabel(i.fecha);
        qMap.set(q, (qMap.get(q) || 0) + (i.valor || 0));
      });

      return Array.from(qMap.entries())
        .sort(([a], [b]) => compareQuarters(a, b))
        .map(([trimestre, valor]) => ({ trimestre, valor }));
    } finally {
      setLoading(false);
    }
  };

  const getGastosTrimestralesNegocio = async (negocioId: string, _filtros: FiltrosFinanzas): Promise<DatoTrimestral[]> => {
    setLoading(true);
    try {
      const year = new Date().getFullYear();
      const regionId = typeof _filtros.region_id === 'string' ? _filtros.region_id : undefined;
      let q: any = supabase
        .from('fin_gastos')
        .select('fecha, valor')
        .eq('estado', 'Confirmado')
        .eq('negocio_id', negocioId)
        .gte('fecha', `${year - 1}-01-01`)
        .lte('fecha', `${year}-12-31`);
      if (regionId) q = q.eq('region_id', regionId);
      const { data: gastos } = await q;

      if (!gastos) return [];

      const qMap = new Map<string, number>();
      (gastos as any[]).forEach((g: any) => {
        const q = getQuarterLabel(g.fecha);
        qMap.set(q, (qMap.get(q) || 0) + (g.valor || 0));
      });

      return Array.from(qMap.entries())
        .sort(([a], [b]) => compareQuarters(a, b))
        .map(([trimestre, valor]) => ({ trimestre, valor }));
    } finally {
      setLoading(false);
    }
  };

  const getDetalleIngresos = async (negocioId: string, _filtros: FiltrosFinanzas): Promise<Record<string, unknown>[]> => {
    setLoading(true);
    try {
      const { fecha_desde, fecha_hasta } = resolveFechas(_filtros);
      let q: any = supabase
        .from('fin_ingresos')
        .select('fecha, nombre, valor, cantidad, precio_unitario, cosecha, alianza, cliente, finca, fin_categorias_ingresos(nombre)')
        .eq('negocio_id', negocioId)
        .order('fecha', { ascending: false });
      if (fecha_desde) q = q.gte('fecha', fecha_desde);
      if (fecha_hasta) q = q.lte('fecha', fecha_hasta);

      const { data } = await q;
      return (data || []).map((d: any) => ({
        fecha: d.fecha,
        tipo_ingreso: d.fin_categorias_ingresos?.nombre || d.nombre,
        cantidad: d.cantidad,
        precio_unitario: d.precio_unitario,
        valor: d.valor,
        cosecha: d.cosecha,
        alianza: d.alianza,
        cliente: d.cliente,
        finca: d.finca,
      }));
    } finally {
      setLoading(false);
    }
  };

  const getDetalleGastos = async (negocioId: string, _filtros: FiltrosFinanzas): Promise<Record<string, unknown>[]> => {
    setLoading(true);
    try {
      const { fecha_desde, fecha_hasta } = resolveFechas(_filtros);
      const regionId = typeof _filtros.region_id === 'string' ? _filtros.region_id : undefined;
      let q: any = supabase
        .from('fin_gastos')
        .select('fecha, nombre, valor, fin_categorias_gastos(nombre), fin_conceptos_gastos(nombre)')
        .eq('estado', 'Confirmado')
        .eq('negocio_id', negocioId)
        .order('fecha', { ascending: false });
      if (regionId) q = q.eq('region_id', regionId);
      if (fecha_desde) q = q.gte('fecha', fecha_desde);
      if (fecha_hasta) q = q.lte('fecha', fecha_hasta);

      const { data } = await q;
      return (data || []).map((d: any) => ({
        fecha: d.fecha,
        categoria: d.fin_categorias_gastos?.nombre || '',
        concepto: d.fin_conceptos_gastos?.nombre || d.nombre,
        valor: d.valor,
      }));
    } finally {
      setLoading(false);
    }
  };

  const getDistribucionIngresosNegocio = async (negocioId: string, _filtros: FiltrosFinanzas): Promise<{ name: string; value: number; porcentaje: number }[]> => {
    setLoading(true);
    try {
      const { fecha_desde, fecha_hasta } = resolveFechas(_filtros);
      let q: any = supabase
        .from('fin_ingresos')
        .select('valor, fin_categorias_ingresos(nombre)')
        .eq('negocio_id', negocioId);
      if (fecha_desde) q = q.gte('fecha', fecha_desde);
      if (fecha_hasta) q = q.lte('fecha', fecha_hasta);

      const { data } = await q;
      if (!data || data.length === 0) return [];

      const catMap = new Map<string, number>();
      (data as any[]).forEach((d: any) => {
        const name = d.fin_categorias_ingresos?.nombre || 'Sin categoria';
        catMap.set(name, (catMap.get(name) || 0) + (d.valor || 0));
      });

      const total = Array.from(catMap.values()).reduce((s, v) => s + v, 0);
      return Array.from(catMap.entries())
        .map(([name, value]) => ({ name, value, porcentaje: total > 0 ? (value / total) * 100 : 0 }))
        .sort((a, b) => b.value - a.value);
    } finally {
      setLoading(false);
    }
  };

  const getDistribucionGastosNegocio = async (negocioId: string, _filtros: FiltrosFinanzas): Promise<{ name: string; value: number }[]> => {
    setLoading(true);
    try {
      const { fecha_desde, fecha_hasta } = resolveFechas(_filtros);
      const regionId = typeof _filtros.region_id === 'string' ? _filtros.region_id : undefined;
      let q: any = supabase
        .from('fin_gastos')
        .select('valor, fin_categorias_gastos(nombre)')
        .eq('estado', 'Confirmado')
        .eq('negocio_id', negocioId);
      if (regionId) q = q.eq('region_id', regionId);
      if (fecha_desde) q = q.gte('fecha', fecha_desde);
      if (fecha_hasta) q = q.lte('fecha', fecha_hasta);

      const { data } = await q;
      if (!data || data.length === 0) return [];

      const catMap = new Map<string, number>();
      (data as any[]).forEach((d: any) => {
        const name = d.fin_categorias_gastos?.nombre || 'Sin categoria';
        catMap.set(name, (catMap.get(name) || 0) + (d.valor || 0));
      });

      return Array.from(catMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    getKPIsGastosGeneral,
    getGastosAcumuladosPivot,
    getGastosPorTrimestreMultiSerie,
    getGastosPorCategoriaStacked,
    getKPIsNegocio,
    getIngresosTrimestralesNegocio,
    getGastosTrimestralesNegocio,
    getDetalleIngresos,
    getDetalleGastos,
    getDistribucionIngresosNegocio,
    getDistribucionGastosNegocio,
  };
}
