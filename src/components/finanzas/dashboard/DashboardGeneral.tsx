import { useState, useEffect } from 'react';
import { useDashboardData } from '../hooks/useDashboardData';
import { KPIGastosRow } from './components/KPIGastosRow';
import { PivotTableGastos } from './components/PivotTableGastos';
import { DetalleGastosExpandible } from './components/DetalleGastosExpandible';
import { GastosPorTrimestreChart } from './components/GastosPorTrimestreChart';
import { GastosPorCategoriaChart } from './components/GastosPorCategoriaChart';
import type { FiltrosFinanzas, KPIConVariacion, PivotRow, DatoTrimestralMultiSerie } from '@/types/finanzas';

export function DashboardGeneral() {
  const [kpis, setKpis] = useState<{ ytdActual: KPIConVariacion; ytdAnterior: KPIConVariacion; totalAnterior: KPIConVariacion } | null>(null);
  const [pivotData, setPivotData] = useState<PivotRow[]>([]);
  const [trimestreData, setTrimestreData] = useState<{ data: DatoTrimestralMultiSerie[]; negocios: string[] }>({ data: [], negocios: [] });
  const [categoriaData, setCategoriaData] = useState<{ data: { name: string; value: number; [key: string]: number | string }[]; negocios: string[] }>({ data: [], negocios: [] });

  const { loading, getKPIsGastosGeneral, getGastosAcumuladosPivot, getGastosPorTrimestreMultiSerie, getGastosPorCategoriaStacked } = useDashboardData();

  const filtros: FiltrosFinanzas = { periodo: 'ytd' };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [kpiResult, pivotResult, trimestreResult, catResult] = await Promise.all([
        getKPIsGastosGeneral(filtros),
        getGastosAcumuladosPivot(filtros),
        getGastosPorTrimestreMultiSerie(filtros),
        getGastosPorCategoriaStacked(filtros),
      ]);
      setKpis(kpiResult);
      setPivotData(pivotResult);
      setTrimestreData(trimestreResult);
      setCategoriaData(catResult);
    } catch {
      // Error handled by hook
    }
  };

  return (
    <div className="space-y-6">

      {/* KPIs */}
      {kpis && (
        <KPIGastosRow
          ytdActual={kpis.ytdActual}
          ytdAnterior={kpis.ytdAnterior}
          totalAnterior={kpis.totalAnterior}
        />
      )}

      {/* Pivot + Trimestre chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PivotTableGastos data={pivotData} loading={loading} />
        <GastosPorTrimestreChart
          data={trimestreData.data}
          negocios={trimestreData.negocios}
        />
      </div>

      {/* Expandable detail */}
      <DetalleGastosExpandible data={pivotData} loading={loading} />

      {/* Stacked category chart */}
      <GastosPorCategoriaChart
        data={categoriaData.data}
        negocios={categoriaData.negocios}
        stacked
        title="Gastos por Categoria (por Negocio)"
      />
    </div>
  );
}
