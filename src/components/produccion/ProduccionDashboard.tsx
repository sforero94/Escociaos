import { useState, useEffect, useRef } from 'react';
import { RoleGuard } from '../auth/RoleGuard';
import { FiltrosProduccion } from './components/FiltrosProduccion';
import { PanelEtapasProduccion } from './components/PanelEtapasProduccion';
import { ComparacionLotesCosecha } from './components/ComparacionLotesCosecha';
import { RendimientoComparable } from './components/RendimientoComparable';
import { EvolucionSemanalGap } from './components/EvolucionSemanalGap';
import { ConciliacionEtapasGap } from './components/ConciliacionEtapasGap';
import { DetalleProduccionLotes } from './components/DetalleProduccionLotes';
import { GraficoCalidadCosecha } from './components/GraficoCalidadCosecha';
import { RentabilidadTab } from './components/RentabilidadTab';
import { CapturaCosechaGrid } from './components/CapturaCosechaGrid';
import { useProduccionData } from './hooks/useProduccionData';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Button } from '../ui/button';
import { Plus, TrendingUp, DollarSign } from 'lucide-react';
import type {
  FiltrosProduccion as FiltrosType,
  LoteProduccion,
  CosechaIdentidad,
} from '../../types/produccion';
import { FILTROS_PRODUCCION_DEFAULT } from '../../types/produccion';
import type {
  ComparacionLoteCosecha,
  ResumenProduccionCosecha,
} from '@/utils/calculosProduccionAnalisis';
import { proyectarInicial } from './utils/proyectarFiltrosInicial';
import { GAPS_PRODUCCION_ANALISIS } from '@/utils/calculosProduccionAnalisis';

export function ProduccionDashboard() {
  const [filtros, setFiltros] = useState<FiltrosType>(FILTROS_PRODUCCION_DEFAULT);
  const [activeTab, setActiveTab] = useState('rendimiento');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [lotes, setLotes] = useState<LoteProduccion[]>([]);
  const [calidadData, setCalidadData] = useState<
    {
      cosecha: string;
      cosecha_label: string;
      kg_exportacion: number;
      kg_nacional: number;
      kg_sin_desglose: number;
      kg_con_desglose: number;
      pct_exportacion: number | null;
      pct_nacional: number | null;
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
  const [loadingData, setLoadingData] = useState(false);
  const [errorData, setErrorData] = useState<string | null>(null);

  const {
    getLotes,
    getProduccionCalidad,
    getCatalogoCosechas,
    getComparacionLotes,
    getResumenesCosecha,
  } = useProduccionData();

  const getLotesRef = useRef(getLotes);
  const getCalidadRef = useRef(getProduccionCalidad);
  const getCatalogoRef = useRef(getCatalogoCosechas);
  const getComparacionRef = useRef(getComparacionLotes);
  const getResumenesRef = useRef(getResumenesCosecha);

  useEffect(() => {
    getLotesRef.current = getLotes;
    getCalidadRef.current = getProduccionCalidad;
    getCatalogoRef.current = getCatalogoCosechas;
    getComparacionRef.current = getComparacionLotes;
    getResumenesRef.current = getResumenesCosecha;
  });

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
      getCalidadRef.current(filtros),
      getComparacionRef.current(filtros),
      getResumenesRef.current(filtros),
    ])
      .then(([calidadResult, comparacionResult, resumenesResult]) => {
        if (cancelled) return;
        setCalidadData(calidadResult);
        setComparacion({
          filas: comparacionResult.filas,
          cosechas: comparacionResult.cosechas,
        });
        setResumenes(resumenesResult.resumenes);
      })
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

  const verCosecha = (key: string) => {
    const cosecha = cosechasDisponibles.find((c) => c.key === key);
    setFiltros((prev) => ({
      ...prev,
      vista: 'una',
      cosecha_keys: [key],
      anos: cosecha ? [cosecha.ano] : prev.anos,
      cosecha_tipo: cosecha?.tipo ?? 'Ambas',
    }));
  };

  const periodoLabel =
    comparacion.cosechas.length > 0
      ? comparacion.cosechas.map((c) => c.label).join(' · ')
      : '';

  return (
    <RoleGuard allowedRoles={['Gerencia']}>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-primary/80 mb-2">
              Escocia OS / Producción
            </p>
            <h1 className="text-2xl text-foreground mb-2">Análisis de producción</h1>
            <p className="text-base sm:text-sm text-brand-brown/80 max-w-xl">
              De la entrada al despacho, una lectura clara de cada cosecha.
            </p>
          </div>
          <Button
            onClick={() => setDialogOpen(true)}
            variant="outline"
            className="shrink-0 min-h-11 border-primary/20"
          >
            <Plus className="w-4 h-4 mr-2" />
            Registrar cosecha
          </Button>
        </div>

        <FiltrosProduccion
          filtros={filtros}
          lotes={lotes}
          anosDisponibles={anosDisponibles}
          cosechasDisponibles={cosechasDisponibles}
          corteLabel="Total registrado"
          corteDetalle="Sin fecha de movimiento: el corte es el total de la cosecha, no un día."
          onFiltrosChange={setFiltros}
        />

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-white border border-primary/10 p-1 rounded-lg">
            <TabsTrigger
              value="rendimiento"
              className="flex items-center gap-2 min-h-11 data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
            >
              <TrendingUp className="w-4 h-4" />
              Análisis
            </TabsTrigger>
            <TabsTrigger
              value="rentabilidad"
              className="flex items-center gap-2 min-h-11 data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
            >
              <DollarSign className="w-4 h-4" />
              Rentabilidad
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rendimiento" className="mt-6 space-y-6">
            <PanelEtapasProduccion
              resumenes={resumenes}
              vista={filtros.vista}
              loading={loadingData}
            />

            {filtros.vista === 'varias' && (
              <p className="text-sm text-brand-brown/80 bg-white border border-primary/10 rounded-xl px-4 py-3 leading-relaxed">
                Cada serie es una campaña. El total registrado de una no se compara con el de
                otra como si estuvieran al mismo avance: no hay fecha para cortarlas en la misma
                semana, y abierta o cerrada no está en el registro.
              </p>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] gap-4">
              <ComparacionLotesCosecha
                filas={comparacion.filas}
                cosechas={comparacion.cosechas}
                metrica={filtros.metrica}
                loading={loadingData}
                notaCorte={
                  filtros.vista === 'varias'
                    ? 'Barras por campaña. Un lote sin registro queda en blanco.'
                    : 'Barras de la cosecha elegida. Un lote sin registro queda en blanco.'
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
              registros={[]}
              onVerCosecha={verCosecha}
            />

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <GraficoCalidadCosecha data={calidadData} loading={loadingData} />
              <ConciliacionEtapasGap
                entradas={resumenes.map((r) => ({
                  label: r.cosecha.label,
                  kg: r.tiene_registros ? r.produccion_kg : null,
                }))}
                periodo={periodoLabel}
              />
            </div>

            <DetalleProduccionLotes
              filas={comparacion.filas}
              cosechas={comparacion.cosechas}
              loading={loadingData}
              onVerCosecha={verCosecha}
            />

            <p className="text-xs text-brand-brown/60 leading-relaxed">{GAPS_PRODUCCION_ANALISIS.principal_2027}</p>
          </TabsContent>

          <TabsContent value="rentabilidad" className="mt-6">
            <RentabilidadTab filtros={filtros} />
          </TabsContent>
        </Tabs>

        {errorData && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
            Error al cargar los datos: {errorData}
          </div>
        )}

        <CapturaCosechaGrid
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSuccess={() => {
            setDialogOpen(false);
            setRefreshKey((k) => k + 1);
          }}
        />
      </div>
    </RoleGuard>
  );
}
