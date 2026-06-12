import { useState, useEffect, useRef } from 'react';
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

export function ProduccionDashboard() {
  const [filtros, setFiltros] = useState<FiltrosType>(FILTROS_PRODUCCION_DEFAULT);
  const [activeTab, setActiveTab] = useState('rendimiento');
  const [dialogOpen, setDialogOpen] = useState(false);
  // Incrementar para forzar recarga tras guardar sin cambiar filtros
  const [refreshKey, setRefreshKey] = useState(0);

  const [kpis, setKpis] = useState<KPIProduccion | null>(null);
  const [tendencias, setTendencias] = useState<TendenciaHistoricaData[]>([]);
  const [sublotesData, setSublotesData] = useState<RendimientoSubloteData[]>([]);
  const [topSublotes, setTopSublotes] = useState<TopSubloteData[]>([]);
  const [lotes, setLotes] = useState<LoteProduccion[]>([]);
  const [calidadData, setCalidadData] = useState<
    { cosecha: string; cosecha_label: string; kg_exportacion: number; kg_nacional: number; kg_sin_desglose: number }[]
  >([]);
  const [datosCosto, setDatosCosto] = useState<DatosCostoKg | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [loadingCostoKPI, setLoadingCostoKPI] = useState(false);
  const [errorData, setErrorData] = useState<string | null>(null);

  // Usamos refs para obtener siempre la versión actual de las funciones del hook
  // sin incluirlas como deps (se recrean en cada render pero su lógica es estable).
  const {
    getKPIs,
    getTendenciasHistoricas,
    getRendimientoSublotes,
    getTopSublotes,
    getLotes,
    getProduccionCalidad,
  } = useProduccionData();

  const { calcular } = useCostoKg();

  const getKPIsRef = useRef(getKPIs);
  const getTendenciasRef = useRef(getTendenciasHistoricas);
  const getRendimientoRef = useRef(getRendimientoSublotes);
  const getTopRef = useRef(getTopSublotes);
  const getLotesRef = useRef(getLotes);
  const getCalidadRef = useRef(getProduccionCalidad);
  const calcularRef = useRef(calcular);

  // Mantener refs actualizadas sin disparar efectos
  getKPIsRef.current = getKPIs;
  getTendenciasRef.current = getTendenciasHistoricas;
  getRendimientoRef.current = getRendimientoSublotes;
  getTopRef.current = getTopSublotes;
  getLotesRef.current = getLotes;
  getCalidadRef.current = getProduccionCalidad;
  calcularRef.current = calcular;

  // Cargar lotes solo al montar
  useEffect(() => {
    let cancelled = false;
    getLotesRef.current()
      .then((data) => { if (!cancelled) setLotes(data); })
      .catch(console.error);
    return () => { cancelled = true; };
  }, []);

  // Cargar datos cuando cambien filtros o refreshKey
  useEffect(() => {
    let cancelled = false;
    setLoadingData(true);
    setErrorData(null);

    Promise.all([
      getKPIsRef.current(filtros),
      getTendenciasRef.current(filtros),
      getRendimientoRef.current(filtros),
      getTopRef.current(filtros, 10),
      getCalidadRef.current(filtros),
    ])
      .then(([kpisData, tendenciasData, sublotesResult, topResult, calidadResult]) => {
        if (cancelled) return;
        setKpis(kpisData);
        setTendencias(tendenciasData);
        setSublotesData(sublotesResult);
        setTopSublotes(topResult);
        setCalidadData(calidadResult);
      })
      .catch((err) => {
        if (!cancelled) setErrorData(err?.message ?? 'Error cargando datos');
      })
      .finally(() => { if (!cancelled) setLoadingData(false); });

    return () => { cancelled = true; };
  }, [filtros, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cargar costo/kg para KPI cuando cambien los años
  useEffect(() => {
    const anoRef = [...filtros.anos].sort().at(-1);
    if (!anoRef) { setDatosCosto(null); return; }

    let cancelled = false;
    setLoadingCostoKPI(true);

    calcularRef.current({ ano: anoRef })
      .then((datos) => { if (!cancelled) setDatosCosto(datos); })
      .catch(() => { if (!cancelled) setDatosCosto(null); })
      .finally(() => { if (!cancelled) setLoadingCostoKPI(false); });

    return () => { cancelled = true; };
  }, [filtros.anos, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFiltrosChange = (nuevosFiltros: FiltrosType) => {
    setFiltros(nuevosFiltros);
  };

  const handleProduccionCreated = () => {
    setDialogOpen(false);
    setRefreshKey((k) => k + 1);
  };

  const lotesEnDatos = Array.from(
    new Set(
      tendencias.flatMap((t) =>
        Object.keys(t).filter(
          (k) => k !== 'cosecha' && k !== 'cosecha_label' && k !== 'ano' && k !== 'tipo'
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

        {/* KPI Cards */}
        <KPICardsProduccion
          kpis={kpis}
          loading={loadingData}
          datosCosto={datosCosto}
          loadingCosto={loadingCostoKPI}
          anosSeleccionados={filtros.anos}
        />

        {/* Tabs */}
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

          <TabsContent value="rendimiento" className="mt-6 space-y-6">
            <GraficoTendenciasHistorico
              data={tendencias}
              metrica={filtros.metrica}
              lotes={lotesEnDatos}
              loading={loadingData}
            />
            <GraficoCalidadCosecha data={calidadData} loading={loadingData} />
            <GraficoRendimientoSublotes
              scatterData={sublotesData}
              topData={topSublotes}
              metrica={filtros.metrica}
              loading={loadingData}
            />
          </TabsContent>

          <TabsContent value="rentabilidad" className="mt-6">
            <RentabilidadTab filtros={filtros} />
          </TabsContent>
        </Tabs>

        {errorData && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-center gap-2">
              <span className="text-red-600">Error</span>
              <p className="text-red-800 text-sm">Error al cargar los datos: {errorData}</p>
            </div>
          </div>
        )}

        <CapturaCosechaGrid
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSuccess={handleProduccionCreated}
        />
      </div>
    </RoleGuard>
  );
}
