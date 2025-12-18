import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RoleGuard } from '../auth/RoleGuard';
import { KPICards } from './components/KPICards';
import { FiltrosGlobales } from './components/FiltrosGlobales';
import { GraficoTendencias } from './components/GraficoTendencias';
import { GraficoDistribucion } from './components/GraficoDistribucion';
import { GraficoDistribucionIngresos } from './components/GraficoDistribucionIngresos';
import { GraficoDistribucionConceptos } from './components/GraficoDistribucionConceptos';
import { FinanzasSubNav } from './components/FinanzasSubNav';
import { useFinanzasData } from './hooks/useFinanzasData';
import { getSupabase } from '../../utils/supabase/client';
import { calcularRangoFechasPorPeriodo } from '../../utils/fechas';
import { Button } from '../ui/button';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import type { FiltrosFinanzas, KPIData, TendenciaData, DistribucionData } from '../../types/finanzas';

/**
 * Dashboard Principal de Finanzas
 * Acceso exclusivo para rol Gerencia
 */
export function FinanzasDashboard() {
  const navigate = useNavigate();

  const [filtros, setFiltros] = useState<FiltrosFinanzas>({
    periodo: 'mes_actual'
  });

  const [kpis, setKpis] = useState<KPIData | null>(null);
  const [tendencias, setTendencias] = useState<TendenciaData[]>([]);
  const [distribucion, setDistribucion] = useState<DistribucionData[]>([]);
  const [distribucionIngresos, setDistribucionIngresos] = useState<DistribucionData[]>([]);
  const [distribucionConceptos, setDistribucionConceptos] = useState<DistribucionData[]>([]);
  const [categoriaConceptos, setCategoriaConceptos] = useState<string | undefined>(undefined);
  const [gastosPendientes, setGastosPendientes] = useState<number>(0);

  const { loading, error, getKPIs, getTendencias, getDistribucion, getDistribucionIngresos, getDistribucionConceptos } = useFinanzasData();

  // Cargar datos iniciales y cuando cambien los filtros
  useEffect(() => {
    cargarDatos();
  }, [filtros, filtros.periodo, filtros.negocio_id, filtros.region_id, filtros.fecha_desde, filtros.fecha_hasta]);

  // Cargar datos de conceptos cuando cambie la categoría local
  useEffect(() => {
    cargarDistribucionConceptos();
  }, [categoriaConceptos]);

  const cargarDatos = async () => {
    try {
      // Calcular fechas reales basadas en el período seleccionado
      let filtrosConFechas = { ...filtros };

      if (filtros.periodo && filtros.periodo !== 'rango_personalizado') {
        // Calcular el rango de fechas según el período
        const { fecha_desde, fecha_hasta } = calcularRangoFechasPorPeriodo(filtros.periodo);
        filtrosConFechas = {
          ...filtros,
          fecha_desde,
          fecha_hasta
        };
      }

      const [kpisData, tendenciasData, distribucionData, distribucionIngresosData] = await Promise.all([
        getKPIs(filtrosConFechas),
        getTendencias(filtrosConFechas),
        getDistribucion(filtrosConFechas),
        getDistribucionIngresos(filtrosConFechas),
        cargarGastosPendientes()
      ]);

      setKpis(kpisData);
      setTendencias(tendenciasData);
      setDistribucion(distribucionData);
      setDistribucionIngresos(distribucionIngresosData);

      // Cargar también la distribución de conceptos con los filtros globales
      await cargarDistribucionConceptos(filtrosConFechas);
    } catch (err) {
    }
  };

  const cargarDistribucionConceptos = async (filtrosBase?: FiltrosFinanzas) => {
    try {
      // Usar filtros base o calcular desde filtros actuales
      let filtrosConFechas = filtrosBase || { ...filtros };

      if (!filtrosBase && filtros.periodo && filtros.periodo !== 'rango_personalizado') {
        const { fecha_desde, fecha_hasta } = calcularRangoFechasPorPeriodo(filtros.periodo);
        filtrosConFechas = {
          ...filtros,
          fecha_desde,
          fecha_hasta
        };
      }

      // Llamar a getDistribucionConceptos con filtros globales + categoría local
      const conceptosData = await getDistribucionConceptos(filtrosConFechas, categoriaConceptos);
      setDistribucionConceptos(conceptosData);
    } catch (err) {
    }
  };

  const cargarGastosPendientes = async () => {
    try {
      const supabase = getSupabase();

      // Fallback: If view doesn't exist, query directly from fin_gastos
      const { count, error } = await supabase
        .from('fin_gastos')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'Pendiente')
        .not('compra_id', 'is', null);

      if (error) throw error;
      setGastosPendientes(count || 0);
    } catch (err) {
      setGastosPendientes(0);
    }
  };

  const handleFiltrosChange = (nuevosFiltros: FiltrosFinanzas) => {
    setFiltros(nuevosFiltros);
  };

  const handleAplicarFiltros = () => {
    cargarDatos();
  };

  return (
    <RoleGuard allowedRoles={['Gerencia']}>
      <div className="space-y-6">
        {/* Navigation */}
        <FinanzasSubNav />

        {/* Header */}
        <div className="relative">
          <div className="absolute -top-4 -left-4 w-32 h-32 bg-[#73991C]/5 rounded-full blur-2xl"></div>
          <div className="relative">
            <h1 className="text-[#172E08] mb-2">Finanzas</h1>
            <p className="text-[#4D240F]/70">
              Gestión financiera de Escocia Hass - Control de ingresos y gastos
            </p>
          </div>
        </div>

        {/* Filtros Globales */}
        <FiltrosGlobales
          filtros={filtros}
          onFiltrosChange={handleFiltrosChange}
          onAplicarFiltros={handleAplicarFiltros}
        />

        {/* KPIs */}
        {kpis && (
          <KPICards
            kpis={kpis}
            loading={loading}
          />
        )}

        {/* Notificación de gastos pendientes */}
        {gastosPendientes > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-orange-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-orange-900 mb-2">
                  Gastos Pendientes por Confirmar
                </h3>
                <p className="text-orange-800 mb-4">
                  Hay <strong>{gastosPendientes}</strong> gasto(s) generado(s) automáticamente desde compras
                  que requieren confirmación manual para completar la información financiera.
                </p>
                <Button
                  onClick={() => navigate('/finanzas/gastos')}
                  className="bg-orange-600 hover:bg-orange-700 text-white"
                >
                  Revisar Gastos Pendientes
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Gráfico de Tendencias - Ancho completo */}
        <GraficoTendencias
          data={tendencias}
          loading={loading}
        />

        {/* Gráficos de Distribución */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <GraficoDistribucionIngresos
            data={distribucionIngresos}
            loading={loading}
            filtrosActivos={filtros}
          />
          <GraficoDistribucion
            data={distribucion}
            loading={loading}
            filtrosActivos={filtros}
          />
        </div>

        {/* Gráfico de Distribución por Conceptos - Ancho completo */}
        <GraficoDistribucionConceptos
          data={distribucionConceptos}
          loading={loading}
          filtrosActivos={filtros}
          onCategoriaChange={setCategoriaConceptos}
        />

        {/* Mensaje de error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-center gap-2">
              <span className="text-red-600">⚠️</span>
              <p className="text-red-800 text-sm">
                Error al cargar los datos: {error}
              </p>
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}