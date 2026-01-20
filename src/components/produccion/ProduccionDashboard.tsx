import { useState, useEffect } from 'react';
import { RoleGuard } from '../auth/RoleGuard';
import { FiltrosProduccion } from './components/FiltrosProduccion';
import { KPICardsProduccion } from './components/KPICardsProduccion';
import { GraficoTendenciasHistorico } from './components/GraficoTendenciasHistorico';
import { GraficoRendimientoSublotes } from './components/GraficoRendimientoSublotes';
import { GraficoEdadRendimiento } from './components/GraficoEdadRendimiento';
import { RegistrarProduccionDialog } from './components/RegistrarProduccionDialog';
import { useProduccionData } from './hooks/useProduccionData';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Button } from '../ui/button';
import { Plus, TrendingUp, Grid3X3, Calendar } from 'lucide-react';
import type {
  FiltrosProduccion as FiltrosType,
  KPIProduccion,
  TendenciaHistoricaData,
  RendimientoSubloteData,
  TopSubloteData,
  EdadRendimientoData,
  LoteProduccion,
} from '../../types/produccion';
import { FILTROS_PRODUCCION_DEFAULT, LOT_COLORS } from '../../types/produccion';

/**
 * Dashboard Principal de Produccion
 * Muestra historico de cosechas, rendimiento por sublote y analisis de edad
 */
export function ProduccionDashboard() {
  const [filtros, setFiltros] = useState<FiltrosType>(FILTROS_PRODUCCION_DEFAULT);
  const [activeTab, setActiveTab] = useState('historico');
  const [dialogOpen, setDialogOpen] = useState(false);

  // Data states
  const [kpis, setKpis] = useState<KPIProduccion | null>(null);
  const [tendencias, setTendencias] = useState<TendenciaHistoricaData[]>([]);
  const [sublotesData, setSublotesData] = useState<RendimientoSubloteData[]>([]);
  const [topSublotes, setTopSublotes] = useState<TopSubloteData[]>([]);
  const [edadData, setEdadData] = useState<EdadRendimientoData[]>([]);
  const [lotes, setLotes] = useState<LoteProduccion[]>([]);

  const {
    loading,
    error,
    getKPIs,
    getTendenciasHistoricas,
    getRendimientoSublotes,
    getTopSublotes,
    getEdadRendimiento,
    getLotes,
  } = useProduccionData();

  // Cargar lotes al inicio
  useEffect(() => {
    cargarLotes();
  }, []);

  // Cargar datos cuando cambien los filtros
  useEffect(() => {
    cargarDatos();
  }, [filtros]);

  const cargarLotes = async () => {
    try {
      const lotesData = await getLotes();
      setLotes(lotesData);
    } catch (err) {
      console.error('Error loading lotes:', err);
    }
  };

  const cargarDatos = async () => {
    try {
      const [kpisData, tendenciasData, sublotesResult, topResult, edadResult] =
        await Promise.all([
          getKPIs(filtros),
          getTendenciasHistoricas(filtros),
          getRendimientoSublotes(filtros),
          getTopSublotes(filtros, 10),
          getEdadRendimiento(filtros),
        ]);

      setKpis(kpisData);
      setTendencias(tendenciasData);
      setSublotesData(sublotesResult);
      setTopSublotes(topResult);
      setEdadData(edadResult);
    } catch (err) {
      console.error('Error loading production data:', err);
    }
  };

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
          <div className="absolute -top-4 -left-4 w-32 h-32 bg-[#73991C]/5 rounded-full blur-2xl"></div>
          <div className="relative flex items-start justify-between">
            <div>
              <h1 className="text-[#172E08] mb-2">Produccion</h1>
              <p className="text-[#4D240F]/70">
                Historico de cosechas y rendimiento - Escocia Hass
              </p>
            </div>
            <Button
              onClick={() => setDialogOpen(true)}
              className="bg-gradient-to-br from-[#73991C] to-[#5c7a16] hover:from-[#5c7a16] hover:to-[#4a6112]"
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

        {/* KPI Cards */}
        <KPICardsProduccion kpis={kpis} loading={loading} />

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-white border border-gray-200 p-1 rounded-lg">
            <TabsTrigger
              value="historico"
              className="flex items-center gap-2 data-[state=active]:bg-[#73991C]/10 data-[state=active]:text-[#73991C]"
            >
              <TrendingUp className="w-4 h-4" />
              Historico
            </TabsTrigger>
            <TabsTrigger
              value="sublotes"
              className="flex items-center gap-2 data-[state=active]:bg-[#73991C]/10 data-[state=active]:text-[#73991C]"
            >
              <Grid3X3 className="w-4 h-4" />
              Sublotes
            </TabsTrigger>
            <TabsTrigger
              value="edad"
              className="flex items-center gap-2 data-[state=active]:bg-[#73991C]/10 data-[state=active]:text-[#73991C]"
            >
              <Calendar className="w-4 h-4" />
              Edad vs Rendimiento
            </TabsTrigger>
          </TabsList>

          <TabsContent value="historico" className="mt-6">
            <GraficoTendenciasHistorico
              data={tendencias}
              metrica={filtros.metrica}
              lotes={lotesEnDatos}
              loading={loading}
            />
          </TabsContent>

          <TabsContent value="sublotes" className="mt-6">
            <GraficoRendimientoSublotes
              scatterData={sublotesData}
              topData={topSublotes}
              metrica={filtros.metrica}
              loading={loading}
            />
          </TabsContent>

          <TabsContent value="edad" className="mt-6">
            <GraficoEdadRendimiento
              data={edadData}
              metrica={filtros.metrica}
              loading={loading}
            />
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

        {/* Dialog para registrar produccion */}
        <RegistrarProduccionDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          lotes={lotes}
          onSuccess={handleProduccionCreated}
        />
      </div>
    </RoleGuard>
  );
}
