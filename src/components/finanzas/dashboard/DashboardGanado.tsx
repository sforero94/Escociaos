import { useState, useEffect } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { calcularRangoFechasPorPeriodo } from '@/utils/fechas';
import { useGanadoData } from '../hooks/useGanadoData';
import { useDashboardData } from '../hooks/useDashboardData';
import { PeriodoFilter } from './components/PeriodoFilter';
import { RegionFilter } from './components/RegionFilter';
import { KPIGanadoSection } from './components/KPIGanadoSection';
import { FincaCompraVentaChart } from './components/FincaCompraVentaChart';
import { GastosPorCategoriaChart } from './components/GastosPorCategoriaChart';
import { TransaccionesGanadoChart } from './components/TransaccionesGanadoChart';
import { GastosTrimestreLine } from './components/GastosTrimestreLine';
import { DataTable } from './components/DataTable';
import { GastosDetalleDialog } from './components/GastosDetalleDialog';
import type { DashboardPeriodo, FiltrosFinanzas, KPIConVariacion, DatoTrimestral, ColumnDef } from '@/types/finanzas';

const PERIODO_LABELS: Record<string, string> = {
  mes_actual: 'mes actual',
  trimestre: 'trimestre actual',
  ytd: 'ano a la fecha',
  ano_anterior: 'ano anterior',
};

const TRANSACCIONES_COLUMNS: ColumnDef[] = [
  { key: 'fecha', label: 'Fecha', format: 'date' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'finca', label: 'Finca' },
  { key: 'cliente_proveedor', label: 'Cliente/Proveedor' },
  { key: 'cantidad_cabezas', label: 'Cabezas', format: 'number' },
  { key: 'kilos_pagados', label: 'Kilos', format: 'number' },
  { key: 'valor_total', label: 'Valor Total', format: 'currency' },
];

const GASTOS_COLUMNS: ColumnDef[] = [
  { key: 'fecha', label: 'Fecha', format: 'date' },
  { key: 'categoria', label: 'Categoria' },
  { key: 'concepto', label: 'Concepto' },
  { key: 'valor', label: 'Valor', format: 'currency' },
];

export function DashboardGanado() {
  const [periodo, setPeriodo] = useState<DashboardPeriodo>('ytd');
  const [regionId, setRegionId] = useState('');
  const [ganadoNegocioId, setGanadoNegocioId] = useState<string | null>(null);
  const [kpis, setKpis] = useState<{
    ventas: KPIConVariacion; compras: KPIConVariacion;
    kilosVendidos: KPIConVariacion; kilosComprados: KPIConVariacion;
    gastosActual: KPIConVariacion; gastosYtdAnterior: KPIConVariacion;
    gastosN1: KPIConVariacion; gastosN2: KPIConVariacion;
  } | null>(null);
  const [fincaData, setFincaData] = useState<{ finca: string; compra_dinero: number; venta_dinero: number; compra_kilos: number; venta_kilos: number }[]>([]);
  const [trimestreData, setTrimestreData] = useState<{ trimestre: string; compra: number; venta: number }[]>([]);
  const [gastosCategoria, setGastosCategoria] = useState<{ name: string; value: number }[]>([]);
  const [gastosTrimestre, setGastosTrimestre] = useState<DatoTrimestral[]>([]);
  const [detalleTransacciones, setDetalleTransacciones] = useState<Record<string, unknown>[]>([]);
  const [detalleGastos, setDetalleGastos] = useState<Record<string, unknown>[]>([]);
  const [dialogCategoria, setDialogCategoria] = useState<string | null>(null);

  const { getKPIsGanado, getTransaccionesPorFinca, getTransaccionesPorTrimestre, getDetalleTransacciones, loading: loadingGanado } = useGanadoData();
  const { getGastosTrimestralesNegocio, getDistribucionGastosNegocio, getDetalleGastos, loading: loadingDashboard } = useDashboardData();

  const filtros: FiltrosFinanzas = { periodo, region_id: regionId || undefined };

  // Resolve Ganado negocio ID
  useEffect(() => {
    const resolve = async () => {
      const { data } = await (getSupabase()
        .from('fin_negocios')
        .select('id')
        .eq('nombre', 'Ganado')
        .eq('activo', true)
        .single() as any);
      if (data) setGanadoNegocioId((data as any).id);
    };
    resolve();
  }, []);

  useEffect(() => {
    if (ganadoNegocioId) loadData();
  }, [ganadoNegocioId, periodo, regionId]);

  const loadData = async () => {
    if (!ganadoNegocioId) return;
    try {
      const [kpiResult, finca, trimestre, gasCat, gasTri, detTx, detGas] = await Promise.all([
        getKPIsGanado(filtros, ganadoNegocioId),
        getTransaccionesPorFinca(filtros),
        getTransaccionesPorTrimestre(filtros),
        getDistribucionGastosNegocio(ganadoNegocioId, filtros),
        getGastosTrimestralesNegocio(ganadoNegocioId, filtros),
        getDetalleTransacciones(filtros),
        getDetalleGastos(ganadoNegocioId, filtros),
      ]);
      setKpis(kpiResult);
      setFincaData(finca);
      setTrimestreData(trimestre);
      setGastosCategoria(gasCat);
      setGastosTrimestre(gasTri);
      setDetalleTransacciones(detTx);
      setDetalleGastos(detGas);
    } catch {
      // Errors handled by hooks
    }
  };

  if (!ganadoNegocioId) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-brand-brown/50">Cargando Ganado...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {kpis && (
        <KPIGanadoSection
          ventas={kpis.ventas}
          compras={kpis.compras}
          kilosVendidos={kpis.kilosVendidos}
          kilosComprados={kpis.kilosComprados}
          gastosActual={kpis.gastosActual}
          gastosYtdAnterior={kpis.gastosYtdAnterior}
          gastosN1={kpis.gastosN1}
          gastosN2={kpis.gastosN2}
        />
      )}

      <div className="flex flex-wrap items-center gap-4">
        <PeriodoFilter value={periodo} onChange={(p) => setPeriodo(p)} />
        <RegionFilter value={regionId} onChange={setRegionId} />
      </div>

      {/* Finca chart + Gastos by category */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FincaCompraVentaChart data={fincaData} />
        <GastosPorCategoriaChart
          data={gastosCategoria.map((d) => ({ ...d }))}
          horizontal
          title="Gastos por Categoria"
          onBarClick={(cat) => setDialogCategoria(cat)}
        />
      </div>

      {/* Transaction + Gastos quarterly charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TransaccionesGanadoChart data={trimestreData} />
        <GastosTrimestreLine data={gastosTrimestre} />
      </div>

      {/* Detail tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-semibold text-green-700 mb-2">Transacciones Ganado</h3>
          <DataTable
            data={detalleTransacciones}
            columns={TRANSACCIONES_COLUMNS}
            headerColor="green"
            emptyMessage="Sin transacciones registradas"
          />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-red-700 mb-2">Gastos Ganado</h3>
          <DataTable
            data={detalleGastos}
            columns={GASTOS_COLUMNS}
            headerColor="red"
            emptyMessage="Sin gastos registrados"
          />
        </div>
      </div>

      {ganadoNegocioId && dialogCategoria && (
        <GastosDetalleDialog
          open={!!dialogCategoria}
          onOpenChange={(open) => { if (!open) setDialogCategoria(null); }}
          negocioId={ganadoNegocioId}
          negocioNombre="Ganado"
          categoriaNombre={dialogCategoria}
          periodoLabel={PERIODO_LABELS[periodo] || periodo}
          fechaDesde={calcularRangoFechasPorPeriodo(periodo).fecha_desde}
          fechaHasta={calcularRangoFechasPorPeriodo(periodo).fecha_hasta}
        />
      )}
    </div>
  );
}
