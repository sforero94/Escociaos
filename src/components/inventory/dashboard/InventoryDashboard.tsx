import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { PeriodoFilter } from '@/components/finanzas/dashboard/components/PeriodoFilter';
import { InventorySubNav } from '../InventorySubNav';
import { KPIInventarioSection } from './components/KPIInventarioSection';
import { TreemapValoracion } from './components/TreemapValoracion';
import { PivotCategoriaTable } from './components/PivotCategoriaTable';
import { ConsumoAplicacionesTable } from './components/ConsumoAplicacionesTable';
import { InversionPorLoteSection } from './components/InversionPorLoteSection';
import { useInventoryDashboard } from './hooks/useInventoryDashboard';
import type { KPIConVariacion, DashboardPeriodo } from '@/types/finanzas';
import type {
  TreemapCategoriaItem,
  AlertaVencimiento,
  PivotTrimestreRow,
  ConsumoAplicacion,
  InversionLote,
} from './hooks/useInventoryDashboard';

export function InventoryDashboard() {
  const [periodo, setPeriodo] = useState<DashboardPeriodo>('ytd');
  const [lotePeriodo, setLotePeriodo] = useState<DashboardPeriodo>('ytd');
  const [fechasCustom, setFechasCustom] = useState<{ desde: string; hasta: string } | undefined>();
  const [loteFechasCustom, setLoteFechasCustom] = useState<{ desde: string; hasta: string } | undefined>();

  const [kpis, setKpis] = useState<{
    valoracion: KPIConVariacion;
    entradas: KPIConVariacion;
    salidas: KPIConVariacion;
  } | null>(null);
  const [treemapData, setTreemapData] = useState<{ items: TreemapCategoriaItem[]; total: number }>({ items: [], total: 0 });
  const [alertas, setAlertas] = useState<AlertaVencimiento[]>([]);
  const [pivotData, setPivotData] = useState<{ rows: PivotTrimestreRow[]; labels: string[] }>({ rows: [], labels: [] });
  const [consumoData, setConsumoData] = useState<ConsumoAplicacion[]>([]);
  const [loteData, setLoteData] = useState<{ lotes: InversionLote[]; totales: { costo_total: number; hectareas: number; arboles: number; costo_por_ha: number; costo_por_arbol: number } }>({
    lotes: [],
    totales: { costo_total: 0, hectareas: 0, arboles: 0, costo_por_ha: 0, costo_por_arbol: 0 },
  });

  const [initialLoading, setInitialLoading] = useState(true);

  const {
    loading,
    getKPIsInventario,
    getValoracionPorCategoria,
    getAlertasVencimiento,
    getPivotPorTrimestre,
    getConsumoAplicaciones,
    getInversionPorLote,
  } = useInventoryDashboard();

  useEffect(() => {
    loadMainData();
  }, [periodo, fechasCustom]);

  useEffect(() => {
    loadLoteData();
  }, [lotePeriodo, loteFechasCustom]);

  const loadMainData = async () => {
    try {
      const [kpiResult, treemap, alertasResult, pivot, consumo] = await Promise.all([
        getKPIsInventario(periodo, fechasCustom),
        getValoracionPorCategoria(),
        getAlertasVencimiento(),
        getPivotPorTrimestre(),
        getConsumoAplicaciones(periodo, fechasCustom),
      ]);
      setKpis(kpiResult);
      setTreemapData(treemap);
      setAlertas(alertasResult);
      setPivotData(pivot);
      setConsumoData(consumo);
    } catch {
      // Errors handled by hook
    } finally {
      setInitialLoading(false);
    }
  };

  const loadLoteData = async () => {
    try {
      const result = await getInversionPorLote(lotePeriodo, loteFechasCustom);
      setLoteData(result);
    } catch {
      // Errors handled by hook
    }
  };

  const handlePeriodoChange = (p: DashboardPeriodo, fechas?: { desde: string; hasta: string }) => {
    setPeriodo(p);
    setFechasCustom(fechas);
  };

  const handleLotePeriodoChange = (p: DashboardPeriodo, fechas?: { desde: string; hasta: string }) => {
    setLotePeriodo(p);
    setLoteFechasCustom(fechas);
  };

  if (initialLoading) {
    return (
      <div className="space-y-6">
        <InventorySubNav />
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-12 h-12 text-primary animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <InventorySubNav />

      {/* KPIs + Alertas */}
      {kpis && (
        <KPIInventarioSection
          valoracion={kpis.valoracion}
          entradas={kpis.entradas}
          salidas={kpis.salidas}
          alertas={alertas}
        />
      )}

      {/* Periodo filter */}
      <PeriodoFilter value={periodo} onChange={handlePeriodoChange} />

      {/* Treemap por categoria */}
      <TreemapValoracion data={treemapData.items} total={treemapData.total} />

      {/* Pivot trimestral por categoria */}
      <PivotCategoriaTable data={pivotData.rows} labels={pivotData.labels} loading={loading} />

      {/* Consumo por aplicaciones */}
      <ConsumoAplicacionesTable data={consumoData} loading={loading} />

      {/* Inversion por lote (periodo independiente) */}
      <InversionPorLoteSection
        lotes={loteData.lotes}
        totales={loteData.totales}
        loading={loading}
        periodo={lotePeriodo}
        onPeriodoChange={handleLotePeriodoChange}
      />
    </div>
  );
}
