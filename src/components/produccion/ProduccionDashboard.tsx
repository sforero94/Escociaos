import { useState, useEffect, useCallback } from 'react';
import { RoleGuard } from '../auth/RoleGuard';
import { FiltrosProduccion } from './components/FiltrosProduccion';
import { KPICardsProduccion } from './components/KPICardsProduccion';
import { GraficoTendenciasHistorico } from './components/GraficoTendenciasHistorico';
import { GraficoRendimientoSublotes } from './components/GraficoRendimientoSublotes';
import { GraficoCalidadCosecha } from './components/GraficoCalidadCosecha';
import { RentabilidadTab } from './components/RentabilidadTab';
import { CapturaCosechaGrid } from './components/CapturaCosechaGrid';
import { useProduccionData } from './hooks/useProduccionData';
import { useCostoKg } from './hooks/useCostoKg';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Button } from '../ui/button';
import { Plus, TrendingUp, DollarSign } from 'lucide-react';
import type {
  FiltrosProduccion as FiltrosType,
  KPIProduccion,
  TendenciaHistoricaData,
  RendimientoSubloteData,
  TopSubloteData,
  LoteProduccion,
} from '../../types/produccion';
import { FILTROS_PRODUCCION_DEFAULT } from '../../types/produccion';
import type { DatosCostoKg } from './hooks/useCostoKg';

/**
 * Dashboard Principal de Produccion
 *
 * Estructura:
 *   KPIs (3): kg totales, kg/árbol ponderado, costo/kg
 *   Tab 1 — Rendimiento: gráfico tendencia histórica + sublotes + calidad exportación
 *   Tab 2 — Rentabilidad: costo/kg por lote vs precio de venta
 */
export function ProduccionDashboard() {
  const [filtros, setFiltros] = useState<FiltrosType>(FILTROS_PRODUCCION_DEFAULT);
  const [activeTab, setActiveTab] = useState('rendimiento');
  const [dialogOpen, setDialogOpen] = useState(false);

  // Data states
  const [kpis, setKpis] = useState<KPIProduccion | null>(null);
  const [tendencias, setTendencias] = useState<TendenciaHistoricaData[]>([]);
  const [sublotesData, setSublotesData] = useState<RendimientoSubloteData[]>([]);
  const [topSublotes, setTopSublotes] = useState<TopSubloteData[]>([]);
  const [lotes, setLotes] = useState<LoteProduccion[]>([]);
  const [calidadData, setCalidadData] = useState<
    { cosecha: string; cosecha_label: string; kg_exportacion: number; kg_nacional: number; kg_sin_desglose: number }[]
  >([]);

  // Costo/kg para KPI card (se calcula para el año más alto seleccionado)
  const [datosCosto, setDatosCosto] = useState<DatosCostoKg | null>(null);

  const {
    loading,
    error,
    getKPIs,
    getTendenciasHistoricas,
    getRendimientoSublotes,
    getTopSublotes,
    getLotes,
    getProduccionCalidad,
  } = useProduccionData();

  const { calcular, loading: loadingCosto } = useCostoKg();

  const cargarLotes = useCallback(async () => {
    try {
      const lotesData = await getLotes();
      setLotes(lotesData);
    } catch (err) {
      console.error('Error loading lotes:', err);
    }
  }, [getLotes]);

  const cargarCostoKgKPI = useCallback(async (anos: number[]) => {
    // Solo calcular para el año más alto seleccionado (evitar N llamadas)
    const anoRef = [...anos].sort().at(-1);
    if (!anoRef) {
      setDatosCosto(null);
      return;
    }
    try {
      const datos = await calcular({ ano: anoRef });
      setDatosCosto(datos);
    } catch (err) {
      console.warn('Error cargando costo/kg para KPI:', err);
      setDatosCosto(null);
    }
  }, [calcular]);

  const cargarDatos = useCallback(async () => {
    try {
      const [kpisData, tendenciasData, sublotesResult, topResult, calidadResult] =
        await Promise.all([
          getKPIs(filtros),
          getTendenciasHistoricas(filtros),
          getRendimientoSublotes(filtros),
          getTopSublotes(filtros, 10),
          getProduccionCalidad(filtros),
        ]);

      setKpis(kpisData);
      setTendencias(tendenciasData);
      setSublotesData(sublotesResult);
      setTopSublotes(topResult);
      setCalidadData(calidadResult);
    } catch (err) {
      console.error('Error loading production data:', err);
    }
  }, [filtros, getKPIs, getTendenciasHistoricas, getRendimientoSublotes, getTopSublotes, getProduccionCalidad]);

  // Cargar lotes al inicio
  useEffect(() => {
    cargarLotes();
  }, [cargarLotes]);

  // Cargar datos cuando cambien los filtros
  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // Cargar costo/kg para KPI cuando cambien los años seleccionados
  useEffect(() => {
    cargarCostoKgKPI(filtros.anos);
  }, [filtros.anos, cargarCostoKgKPI]);

  const handleFiltrosChange = (nuevosFiltros: FiltrosType) => {
    setFiltros(nuevosFiltros);
  };

  const handleProduccionCreated = () => {
    setDialogOpen(false);
    cargarDatos();
  };

  // Obtener lotes unicos de los datos para el grafico
  const lotesEnDatos = Array.from(
    new Set(
      tendencias.flatMap((t) =>
        Object.keys(t).filter(
          (k) =>
            k !== 'cosecha' &&
            k !== 'cosecha_label' &&
            k !== 'ano' &&
            k !== 'tipo'
        )
      )
    )
  );

  return (
    <RoleGuard allowedRoles={['Gerencia']}>
      <div className="space-y-6">
        {/* Header */}
        <div className="relative">
          <div className="absolute -top-4 -left-4 w-32 h-32 bg-primary/5 rounded-full blur-2xl" />
          <div className="relative flex items-start justify-between">
            <div>
              <h1 className="text-foreground mb-2">Produccion</h1>
              <p className="text-brand-brown/70">
                Historico de cosechas y rendimiento — Escocia Hass
              </p>
            </div>
            <Button
              onClick={() => setDialogOpen(true)}
              className="bg-gradient-to-br from-primary to-primary-dark hover:from-primary-dark hover:to-primary-dark"
            >
              <Plus className="w-4 h-4 mr-2" />
              Registrar Cosecha
            </Button>
          </div>
        </div>

        {/* Filtros Globales */}
        <FiltrosProduccion
          filtros={filtros}
          lotes={lotes}
          onFiltrosChange={handleFiltrosChange}
        />

        {/* KPI Cards — 3 tarjetas */}
        <KPICardsProduccion
          kpis={kpis}
          loading={loading}
          datosCosto={datosCosto}
          loadingCosto={loadingCosto}
          anosSeleccionados={filtros.anos}
        />

        {/* Tabs — 2 pestañas */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-white border border-gray-200 p-1 rounded-lg">
            <TabsTrigger
              value="rendimiento"
              className="flex items-center gap-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
            >
              <TrendingUp className="w-4 h-4" />
              Rendimiento
            </TabsTrigger>
            <TabsTrigger
              value="rentabilidad"
              className="flex items-center gap-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
            >
              <DollarSign className="w-4 h-4" />
              Rentabilidad
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Rendimiento — tendencia histórica + sublotes + calidad */}
          <TabsContent value="rendimiento" className="mt-6 space-y-6">
            {/* Gráfico de tendencias (lead chart) */}
            <GraficoTendenciasHistorico
              data={tendencias}
              metrica={filtros.metrica}
              lotes={lotesEnDatos}
              loading={loading}
            />

            {/* Distribución exportación/nacional (solo si hay datos con desglose) */}
            <GraficoCalidadCosecha data={calidadData} loading={loading} />

            {/* Sublotes — scatter + top 10 */}
            <GraficoRendimientoSublotes
              scatterData={sublotesData}
              topData={topSublotes}
              metrica={filtros.metrica}
              loading={loading}
            />
          </TabsContent>

          {/* Tab 2: Rentabilidad — costo/kg por lote vs precio de venta */}
          <TabsContent value="rentabilidad" className="mt-6">
            <RentabilidadTab filtros={filtros} />
          </TabsContent>
        </Tabs>

        {/* Mensaje de error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-center gap-2">
              <span className="text-red-600">Error</span>
              <p className="text-red-800 text-sm">
                Error al cargar los datos: {error}
              </p>
            </div>
          </div>
        )}

        {/* Grilla de captura masiva de cosechas */}
        <CapturaCosechaGrid
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSuccess={handleProduccionCreated}
        />
      </div>
    </RoleGuard>
  );
}
