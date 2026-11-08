import { useState, useEffect, useRef } from 'react';
import { RoleGuard } from '../auth/RoleGuard';
import { FiltrosProduccion } from './components/FiltrosProduccion';
import { KPICardsProduccion } from './components/KPICardsProduccion';
import { PanelEtapasProduccion } from './components/PanelEtapasProduccion';
import { ComparacionLotesCosecha } from './components/ComparacionLotesCosecha';
import { RendimientoComparable } from './components/RendimientoComparable';
import { EvolucionSemanalGap } from './components/EvolucionSemanalGap';
import { ConciliacionEtapasGap } from './components/ConciliacionEtapasGap';
import { DetalleProduccionLotes } from './components/DetalleProduccionLotes';
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
  CosechaIdentidad,
} from '../../types/produccion';
import { FILTROS_PRODUCCION_DEFAULT } from '../../types/produccion';
import type { DatosCostoKg } from './hooks/useCostoKg';
import type {
  ComparacionLoteCosecha,
  ResumenProduccionCosecha,
} from '@/utils/calculosProduccionAnalisis';
import {
  anosCampanaDeCosechas,
  proyectarInicial,
} from './utils/proyectarFiltrosInicial';

export function ProduccionDashboard() {
  const [filtros, setFiltros] = useState<FiltrosType>(FILTROS_PRODUCCION_DEFAULT);
  const [activeTab, setActiveTab] = useState('rendimiento');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [kpis, setKpis] = useState<KPIProduccion | null>(null);
  const [tendencias, setTendencias] = useState<TendenciaHistoricaData[]>([]);
  const [sublotesData, setSublotesData] = useState<RendimientoSubloteData[]>([]);
  const [topSublotes, setTopSublotes] = useState<TopSubloteData[]>([]);
  const [lotes, setLotes] = useState<LoteProduccion[]>([]);
  const [calidadData, setCalidadData] = useState<
    {
      cosecha: string;
      cosecha_label: string;
      kg_exportacion: number;
      kg_nacional: number;
      kg_sin_desglose: number;
    }[]
  >([]);
  const [comparacion, setComparacion] = useState<{
    filas: ComparacionLoteCosecha[];
    cosechas: CosechaIdentidad[];
  }>({ filas: [], cosechas: [] });
  const [resumenes, setResumenes] = useState<ResumenProduccionCosecha[]>([]);
  const [anosDisponibles, setAnosDisponibles] = useState<number[]>([]);
  const [cosechasDisponibles, setCosechasDisponibles] = useState<CosechaIdentidad[]>([]);
  const [catalogoListo, setCatalogoListo] = useState(false);
  const [datosCosto, setDatosCosto] = useState<DatosCostoKg | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [loadingCostoKPI, setLoadingCostoKPI] = useState(false);
  const [errorData, setErrorData] = useState<string | null>(null);

  const {
    getKPIs,
    getTendenciasHistoricas,
    getRendimientoSublotes,
    getTopSublotes,
    getLotes,
    getProduccionCalidad,
    getCatalogoCosechas,
    getComparacionLotes,
    getResumenesCosecha,
  } = useProduccionData();

  const { calcular } = useCostoKg();

  const getKPIsRef = useRef(getKPIs);
  const getTendenciasRef = useRef(getTendenciasHistoricas);
  const getRendimientoRef = useRef(getRendimientoSublotes);
  const getTopRef = useRef(getTopSublotes);
  const getLotesRef = useRef(getLotes);
  const getCalidadRef = useRef(getProduccionCalidad);
  const getCatalogoRef = useRef(getCatalogoCosechas);
  const getComparacionRef = useRef(getComparacionLotes);
  const getResumenesRef = useRef(getResumenesCosecha);
  const calcularRef = useRef(calcular);

  getKPIsRef.current = getKPIs;
  getTendenciasRef.current = getTendenciasHistoricas;
  getRendimientoRef.current = getRendimientoSublotes;
  getTopRef.current = getTopSublotes;
  getLotesRef.current = getLotes;
  getCalidadRef.current = getProduccionCalidad;
  getCatalogoRef.current = getCatalogoCosechas;
  getComparacionRef.current = getComparacionLotes;
  getResumenesRef.current = getResumenesCosecha;
  calcularRef.current = calcular;

  // Catálogo dinámico + lotes al montar / refresh
  useEffect(() => {
    let cancelled = false;
    Promise.all([getLotesRef.current(), getCatalogoRef.current()])
      .then(([lotesData, catalogo]) => {
        if (cancelled) return;
        setLotes(lotesData);
        setAnosDisponibles(catalogo.anos_movimiento);
        setCosechasDisponibles(catalogo.cosechas);
        setCatalogoListo(true);
        setFiltros((prev) => {
          if (prev.anos.length > 0 || prev.cosecha_keys.length > 0 || prev.anos_movimiento.length > 0) {
            return prev;
          }
          return proyectarInicial(prev, catalogo);
        });
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  useEffect(() => {
    if (!catalogoListo) return;
    let cancelled = false;
    setLoadingData(true);
    setErrorData(null);

    Promise.all([
      getKPIsRef.current(filtros),
      getTendenciasRef.current(filtros),
      getRendimientoRef.current(filtros),
      getTopRef.current(filtros, 10),
      getCalidadRef.current(filtros),
      getComparacionRef.current(filtros),
      getResumenesRef.current(filtros),
    ])
      .then(
        ([
          kpisData,
          tendenciasData,
          sublotesResult,
          topResult,
          calidadResult,
          comparacionResult,
          resumenesResult,
        ]) => {
          if (cancelled) return;
          setKpis(kpisData);
          setTendencias(tendenciasData);
          setSublotesData(sublotesResult);
          setTopSublotes(topResult);
          setCalidadData(calidadResult);
          setComparacion({
            filas: comparacionResult.filas,
            cosechas: comparacionResult.cosechas,
          });
          setResumenes(resumenesResult.resumenes);
        },
      )
      .catch((err) => {
        if (!cancelled) setErrorData(err?.message ?? 'Error cargando datos');
      })
      .finally(() => {
        if (!cancelled) setLoadingData(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filtros, refreshKey, catalogoListo]);

  useEffect(() => {
    const anosCampana =
      filtros.anos.length > 0
        ? filtros.anos
        : anosCampanaDeCosechas(comparacion.cosechas);
    const anoRef = [...anosCampana].sort().at(-1);
    if (!anoRef) {
      setDatosCosto(null);
      return;
    }

    let cancelled = false;
    setLoadingCostoKPI(true);
    calcularRef
      .current({ ano: anoRef })
      .then((datos) => {
        if (!cancelled) setDatosCosto(datos);
      })
      .catch(() => {
        if (!cancelled) setDatosCosto(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingCostoKPI(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filtros.anos, comparacion.cosechas, refreshKey]);

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
          (k) => k !== 'cosecha' && k !== 'cosecha_label' && k !== 'ano' && k !== 'tipo',
        ),
      ),
    ),
  );

  const resumenActivo = resumenes[resumenes.length - 1];
  const rendimientoSinDato = resumenActivo ? resumenActivo.kg_por_arbol == null : false;
  const tonHaSinDato = resumenActivo ? resumenActivo.ton_por_ha == null : false;
  const periodoLabel =
    comparacion.cosechas.length > 0
      ? comparacion.cosechas.map((c) => c.label).join(' · ')
      : kpis?.periodo ?? '';

  return (
    <RoleGuard allowedRoles={['Gerencia']}>
      <div className="space-y-6">
        <div className="relative">
          <div className="absolute -top-4 -left-4 w-32 h-32 bg-primary/5 rounded-full blur-2xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-brand-brown/60 mb-2">
                Escocia OS / Producción
              </p>
              <h1 className="text-foreground mb-2">Análisis de producción</h1>
              <p className="text-brand-brown/70 max-w-xl">
                La unidad de análisis es la cosecha (Principal 2027, Traviesa
                2026…). El año del movimiento solo acota la lista; no agrupa.
              </p>
            </div>
            <Button
              onClick={() => setDialogOpen(true)}
              className="bg-gradient-to-br from-primary to-primary-dark hover:from-primary-dark hover:to-primary-dark shrink-0"
            >
              <Plus className="w-4 h-4 mr-2" />
              Registrar Cosecha
            </Button>
          </div>
        </div>

        <FiltrosProduccion
          filtros={filtros}
          lotes={lotes}
          anosDisponibles={anosDisponibles}
          cosechasDisponibles={cosechasDisponibles}
          onFiltrosChange={handleFiltrosChange}
        />

        <PanelEtapasProduccion
          produccionKg={kpis?.produccion_total_kg ?? null}
          periodo={periodoLabel}
          loading={loadingData}
        />

        <KPICardsProduccion
          kpis={kpis}
          loading={loadingData}
          datosCosto={datosCosto}
          loadingCosto={loadingCostoKPI}
          anosSeleccionados={filtros.anos}
          rendimientoSinDato={rendimientoSinDato}
          tonHaSinDato={tonHaSinDato}
        />

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-white border border-gray-200 p-1 rounded-lg">
            <TabsTrigger
              value="rendimiento"
              className="flex items-center gap-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
            >
              <TrendingUp className="w-4 h-4" />
              Análisis
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
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)] gap-6">
              <ComparacionLotesCosecha
                filas={comparacion.filas}
                cosechas={comparacion.cosechas}
                metrica={filtros.metrica}
                loading={loadingData}
                notaCorte={
                  filtros.vista === 'varias'
                    ? 'Comparación entre campañas seleccionadas. Sin dato no se rellena con cero.'
                    : 'Vista de una cosecha: barras por lote sobre kg_totales registrados.'
                }
              />
              <RendimientoComparable
                resumenes={resumenes}
                cosechas={comparacion.cosechas}
                loading={loadingData}
              />
            </div>

            <EvolucionSemanalGap
              cosechas={comparacion.cosechas}
              modo={filtros.vista}
            />

            {filtros.vista === 'varias' && (
              <GraficoTendenciasHistorico
                data={tendencias}
                metrica={filtros.metrica}
                lotes={lotesEnDatos}
                loading={loadingData}
              />
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <GraficoCalidadCosecha data={calidadData} loading={loadingData} />
              <ConciliacionEtapasGap
                produccionKg={kpis?.produccion_total_kg ?? null}
                periodo={periodoLabel}
              />
            </div>

            <DetalleProduccionLotes
              filas={comparacion.filas}
              cosechas={comparacion.cosechas}
              loading={loadingData}
            />

            {filtros.vista === 'una' && (
              <GraficoRendimientoSublotes
                scatterData={sublotesData}
                topData={topSublotes}
                metrica={filtros.metrica}
                loading={loadingData}
              />
            )}
          </TabsContent>

          <TabsContent value="rentabilidad" className="mt-6">
            <RentabilidadTab filtros={filtros} />
          </TabsContent>
        </Tabs>

        {errorData && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-center gap-2">
              <span className="text-red-600">Error</span>
              <p className="text-red-800 text-sm">
                Error al cargar los datos: {errorData}
              </p>
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
