import { useState, useEffect } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { calcularRangoFechasPorPeriodo } from '@/utils/fechas';
import { useDashboardData } from '../hooks/useDashboardData';
import { PeriodoFilter } from './components/PeriodoFilter';
import { KPINegocioSection } from './components/KPINegocioSection';
import { DonutTipoVenta } from './components/DonutTipoVenta';
import { GastosPorCategoriaChart } from './components/GastosPorCategoriaChart';
import { IngresosTrimestreChart } from './components/IngresosTrimestreChart';
import { GastosTrimestreLine } from './components/GastosTrimestreLine';
import { DataTable } from './components/DataTable';
import { GastosDetalleDialog } from './components/GastosDetalleDialog';
import type {
  DashboardPeriodo,
  FiltrosFinanzas,
  KPIConVariacion,
  DatoTrimestral,
  NegocioDashboardConfig,
  ColumnDef,
} from '@/types/finanzas';

const PERIODO_LABELS: Record<string, string> = {
  mes_actual: 'mes actual',
  trimestre: 'trimestre actual',
  ytd: 'ano a la fecha',
  ano_anterior: 'ano anterior',
};

interface DashboardNegocioProps {
  config: NegocioDashboardConfig;
}

const GASTOS_COLUMNS: ColumnDef[] = [
  { key: 'fecha', label: 'Fecha', format: 'date' },
  { key: 'categoria', label: 'Categoria' },
  { key: 'concepto', label: 'Concepto' },
  { key: 'valor', label: 'Valor', format: 'currency' },
];

export function DashboardNegocio({ config }: DashboardNegocioProps) {
  const [periodo, setPeriodo] = useState<DashboardPeriodo>('ytd');
  const [negocioId, setNegocioId] = useState<string | null>(null);
  const [kpis, setKpis] = useState<{
    ingresosActual: KPIConVariacion; ingresosYtdAnterior: KPIConVariacion; ingresosN1: KPIConVariacion; ingresosN2: KPIConVariacion;
    gastosActual: KPIConVariacion; gastosYtdAnterior: KPIConVariacion; gastosN1: KPIConVariacion; gastosN2: KPIConVariacion;
  } | null>(null);
  const [donutData, setDonutData] = useState<{ name: string; value: number; porcentaje: number }[]>([]);
  const [gastosCategoria, setGastosCategoria] = useState<{ name: string; value: number }[]>([]);
  const [ingresosTrimestre, setIngresosTrimestre] = useState<DatoTrimestral[]>([]);
  const [gastosTrimestre, setGastosTrimestre] = useState<DatoTrimestral[]>([]);
  const [detalleIngresos, setDetalleIngresos] = useState<Record<string, unknown>[]>([]);
  const [detalleGastos, setDetalleGastos] = useState<Record<string, unknown>[]>([]);
  const [dialogCategoria, setDialogCategoria] = useState<string | null>(null);

  const {
    loading,
    getKPIsNegocio,
    getIngresosTrimestralesNegocio,
    getGastosTrimestralesNegocio,
    getDetalleIngresos,
    getDetalleGastos,
    getDistribucionIngresosNegocio,
    getDistribucionGastosNegocio,
  } = useDashboardData();

  // Resolve negocio_id from name
  useEffect(() => {
    const resolve = async () => {
      const { data } = await (getSupabase()
        .from('fin_negocios')
        .select('id')
        .eq('nombre', config.negocio_nombre)
        .eq('activo', true)
        .single() as any);
      if (data) setNegocioId((data as any).id);
    };
    resolve();
  }, [config.negocio_nombre]);

  const filtros: FiltrosFinanzas = { periodo };

  useEffect(() => {
    if (negocioId) loadData();
  }, [negocioId, periodo]);

  const loadData = async () => {
    if (!negocioId) return;
    try {
      const [kpiResult, donut, gastosCat, ingTri, gasTri, detIng, detGas] = await Promise.all([
        getKPIsNegocio(negocioId),
        getDistribucionIngresosNegocio(negocioId, filtros),
        getDistribucionGastosNegocio(negocioId, filtros),
        getIngresosTrimestralesNegocio(negocioId, filtros),
        getGastosTrimestralesNegocio(negocioId, filtros),
        getDetalleIngresos(negocioId, filtros),
        getDetalleGastos(negocioId, filtros),
      ]);
      setKpis(kpiResult);
      setDonutData(donut);
      setGastosCategoria(gastosCat);
      setIngresosTrimestre(ingTri);
      setGastosTrimestre(gasTri);
      setDetalleIngresos(detIng);
      setDetalleGastos(detGas);
    } catch {
      // Error handled by hook
    }
  };

  if (!negocioId) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-brand-brown/50">Cargando {config.nombre}...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {kpis && (
        <KPINegocioSection
          ingresosActual={kpis.ingresosActual}
          ingresosYtdAnterior={kpis.ingresosYtdAnterior}
          ingresosN1={kpis.ingresosN1}
          ingresosN2={kpis.ingresosN2}
          gastosActual={kpis.gastosActual}
          gastosYtdAnterior={kpis.gastosYtdAnterior}
          gastosN1={kpis.gastosN1}
          gastosN2={kpis.gastosN2}
        />
      )}

      <PeriodoFilter value={periodo} onChange={(p) => setPeriodo(p)} />

      {/* Donut + Gastos by category */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DonutTipoVenta data={donutData} title={config.donut_label} />
        <GastosPorCategoriaChart
          data={gastosCategoria.map((d) => ({ ...d }))}
          horizontal
          title="Gastos por Categoria"
          onBarClick={(cat) => setDialogCategoria(cat)}
        />
      </div>

      {/* Quarterly charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <IngresosTrimestreChart data={ingresosTrimestre} />
        <GastosTrimestreLine data={gastosTrimestre} />
      </div>

      {/* Detail tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-semibold text-green-700 mb-2">Detalle Ingresos</h3>
          <DataTable
            data={detalleIngresos}
            columns={config.ingresos_columns}
            headerColor="green"
            emptyMessage="Sin ingresos registrados"
          />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-red-700 mb-2">Detalle Gastos</h3>
          <DataTable
            data={detalleGastos}
            columns={GASTOS_COLUMNS}
            headerColor="red"
            emptyMessage="Sin gastos registrados"
          />
        </div>
      </div>

      {negocioId && dialogCategoria && (
        <GastosDetalleDialog
          open={!!dialogCategoria}
          onOpenChange={(open) => { if (!open) setDialogCategoria(null); }}
          negocioId={negocioId}
          negocioNombre={config.nombre}
          categoriaNombre={dialogCategoria}
          periodoLabel={PERIODO_LABELS[periodo] || periodo}
          fechaDesde={calcularRangoFechasPorPeriodo(periodo).fecha_desde}
          fechaHasta={calcularRangoFechasPorPeriodo(periodo).fecha_hasta}
        />
      )}
    </div>
  );
}
