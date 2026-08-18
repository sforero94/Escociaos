import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useGanadoInventario } from './hooks/useGanadoInventario';
import { GanadoSubNav } from './GanadoSubNav';
import { AjusteMasivoDialog } from './components/AjusteMasivoDialog';
import { InventarioInicialDialog } from './components/InventarioInicialDialog';
import { InventarioArbol } from './components/InventarioArbol';
import { ChipsEtapa, BarraEtapa } from './components/ChipsEtapa';
import { AvisoDatosGanado } from './components/AvisoDatosGanado';
import { ErrorCargaGanado } from './components/ErrorCargaGanado';
import {
  calcularKPIsInventario,
  calcularVariacion,
  construirArbolInventario,
  cabezasFueraDeFincaActiva,
} from '@/utils/calculosGanado';
import { formatNumber } from '@/utils/format';
import { fechaAISODate } from '@/utils/fechas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertTriangle, SlidersHorizontal, TrendingUp, TrendingDown, ClipboardPlus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { ORDEN_ETAPAS, ETIQUETA_ETAPA } from '@/types/ganado';
import type {
  InventarioPotreroRow,
  GanUbicacion,
  GanFinca,
  GanLote,
  VariacionInventario,
  EtapaBucket,
  EtapaProductiva,
} from '@/types/ganado';

const selectClass =
  'px-2 py-1.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary min-w-0';

function KPICard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-primary/10 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-brand-brown/60 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-brand-brown/60 mt-1">{sub}</p>}
    </div>
  );
}

export function GanadoDashboard() {
  const { profile } = useAuth();
  const canWrite = profile?.rol === 'Administrador' || profile?.rol === 'Gerencia';

  const {
    fetchEstructura,
    fetchInventario,
    fetchInventarioFincasInactivas,
    fetchMovimientos,
    countPendientes,
    actualizarEtapaPotrero,
  } = useGanadoInventario();

  const [rows, setRows] = useState<InventarioPotreroRow[]>([]);
  const [rowsFincasInactivas, setRowsFincasInactivas] = useState<InventarioPotreroRow[]>([]);
  const [ubicaciones, setUbicaciones] = useState<GanUbicacion[]>([]);
  const [fincas, setFincas] = useState<GanFinca[]>([]);
  const [lotes, setLotes] = useState<GanLote[]>([]);
  const [pendientes, setPendientes] = useState(0);
  const [variacion, setVariacion] = useState<VariacionInventario | null>(null);

  const [ubicacionFilter, setUbicacionFilter] = useState('');
  const [fincaFilter, setFincaFilter] = useState('');
  const [loteFilter, setLoteFilter] = useState('');
  const [etapaFilter, setEtapaFilter] = useState<EtapaBucket | ''>('');
  const [busquedaPotrero, setBusquedaPotrero] = useState('');

  const [showAjusteMasivo, setShowAjusteMasivo] = useState(false);
  const [showInventarioInicial, setShowInventarioInicial] = useState(false);

  // Estado de carga propio de la página, separado del `loading` compartido
  // del hook — necesitamos saber si la carga COMPLETA de esta pantalla
  // terminó bien o mal, no si "algo" está en vuelo. Una lectura fallida
  // (p.ej. columnas nuevas que la base todavía no tiene) nunca puede
  // colapsar en el mismo render que "el inventario está genuinamente
  // vacío": lo primero es un error a resolver, lo segundo habilita un
  // botón que duplicaría cabezas reales si el usuario le hace caso.
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setCargando(true);
    try {
      const hace30 = new Date();
      hace30.setDate(hace30.getDate() - 30);
      const fechaDesde = fechaAISODate(hace30);

      const [inv, inactivas, estructura, pend, movs] = await Promise.all([
        fetchInventario(),
        fetchInventarioFincasInactivas(),
        fetchEstructura(),
        countPendientes(),
        fetchMovimientos({ fechaDesde }),
      ]);
      setRows(inv);
      setRowsFincasInactivas(inactivas);
      setUbicaciones(estructura.ubicaciones);
      setFincas(estructura.fincas);
      setLotes(estructura.lotes);
      setPendientes(pend);
      // calcularVariacion excluye traslados: un movimiento interno no es
      // entrada ni salida de la empresa (B-γ).
      setVariacion(calcularVariacion(movs, fechaDesde));
      setErrorCarga(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      setErrorCarga(message);
      toast.error('Error cargando inventario: ' + message);
    } finally {
      setCargando(false);
    }
  }, [fetchInventario, fetchInventarioFincasInactivas, fetchEstructura, countPendientes, fetchMovimientos]);

  /**
   * Edición en línea de la etapa desde el árbol. Optimista para que el
   * chip cambie al instante, pero **si la escritura falla se revierte**:
   * dejar la pantalla mostrando una etapa que la base no tiene es la
   * misma clase de mentira que mostrar 0 cuando no se pudo leer.
   */
  const cambiarEtapaPotrero = useCallback(
    async (potreroId: string, etapa: EtapaProductiva | null) => {
      const anterior = rows.find((r) => r.potrero_id === potreroId)?.etapa ?? null;
      setRows((prev) => prev.map((r) => (r.potrero_id === potreroId ? { ...r, etapa } : r)));
      try {
        await actualizarEtapaPotrero(potreroId, etapa);
      } catch (error: unknown) {
        setRows((prev) => prev.map((r) => (r.potrero_id === potreroId ? { ...r, etapa: anterior } : r)));
        const message = error instanceof Error ? error.message : 'Error desconocido';
        toast.error('No se pudo cambiar la etapa: ' + message);
      }
    },
    [rows, actualizarEtapaPotrero]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  const fincasFiltradas = useMemo(
    () => fincas.filter((f) => !ubicacionFilter || f.ubicacion_id === ubicacionFilter),
    [fincas, ubicacionFilter]
  );

  const lotesFiltrados = useMemo(
    () => lotes.filter((l) => !fincaFilter || l.finca_id === fincaFilter),
    [lotes, fincaFilter]
  );

  const rowsFiltradas = useMemo(
    () =>
      rows.filter((r) => {
        if (ubicacionFilter && r.ubicacion_id !== ubicacionFilter) return false;
        if (fincaFilter && r.finca_id !== fincaFilter) return false;
        if (loteFilter && r.lote_id !== loteFilter) return false;
        if (etapaFilter) {
          const bucket: EtapaBucket = r.etapa ?? 'sin_clasificar';
          if (bucket !== etapaFilter) return false;
        }
        if (busquedaPotrero.trim() && !r.potrero.toLowerCase().includes(busquedaPotrero.trim().toLowerCase())) {
          return false;
        }
        return true;
      }),
    [rows, ubicacionFilter, fincaFilter, loteFilter, etapaFilter, busquedaPotrero]
  );

  const kpis = useMemo(
    () => calcularKPIsInventario(rowsFiltradas, rowsFincasInactivas),
    [rowsFiltradas, rowsFincasInactivas]
  );
  const arbol = useMemo(() => construirArbolInventario(rowsFiltradas, {}), [rowsFiltradas]);
  const fueraDeFincaActiva = useMemo(
    () => cabezasFueraDeFincaActiva(rowsFincasInactivas),
    [rowsFincasInactivas]
  );

  // Total global (sin filtros) para decidir si mostrar la carga inicial.
  // "Vacío de verdad" exige que la carga haya sido EXITOSA y devuelto 0
  // filas — nunca se infiere de un `rows` que sigue en su valor inicial
  // porque la lectura falló (ver `errorCarga`).
  const totalGlobal = useMemo(() => rows.reduce((s, r) => s + r.novillos + r.toros, 0), [rows]);
  const sinInventario = !cargando && !errorCarga && totalGlobal === 0;

  const fincasActivasCount = fincas.filter((f) => f.activa).length;
  const lotesActivosCount = lotes.filter((l) => l.activo).length;

  return (
    <div className="min-h-screen min-h-[100dvh] bg-gradient-to-br from-background via-white to-secondary/10 p-4 lg:p-8">
      <div className="max-w-7xl mx-auto w-full">
        <GanadoSubNav />

        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-foreground mb-1">Inventario de Ganado</h1>
            <p className="text-sm text-brand-brown/70">
              Cabezas por ubicación, finca, lote y potrero
              {!cargando && !errorCarga && (
                <>
                  {' '}
                  · {formatNumber(fincasActivasCount)} {fincasActivasCount === 1 ? 'finca activa' : 'fincas activas'} ·{' '}
                  {formatNumber(lotesActivosCount)} {lotesActivosCount === 1 ? 'lote' : 'lotes'}
                </>
              )}
            </p>
          </div>
          {canWrite && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowInventarioInicial(true)}
                disabled={!!errorCarga}
                title={errorCarga ? 'No disponible mientras el inventario no se pueda leer' : undefined}
              >
                <ClipboardPlus className="w-4 h-4 mr-2" />
                Inventario inicial
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowAjusteMasivo(true)}
                disabled={!!errorCarga}
                title={errorCarga ? 'No disponible mientras el inventario no se pueda leer' : undefined}
              >
                <SlidersHorizontal className="w-4 h-4 mr-2" />
                Ajuste masivo
              </Button>
            </div>
          )}
        </div>

        {errorCarga ? (
          <div className="mb-6">
            <ErrorCargaGanado
              titulo="No se pudo leer el inventario"
              mensaje={errorCarga}
              onReintentar={loadData}
            />
          </div>
        ) : (
        <>
        {sinInventario && canWrite && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium text-foreground mb-1">Aún no hay inventario registrado</p>
              <p className="text-sm text-brand-brown/70">
                Carga el conteo inicial digitando las cabezas por finca — no necesitas tener potreros configurados.
              </p>
            </div>
            <Button onClick={() => setShowInventarioInicial(true)}>
              <ClipboardPlus className="w-4 h-4 mr-2" />
              Cargar inventario inicial
            </Button>
          </div>
        )}

        <div className="mb-6 space-y-2">
          <AvisoDatosGanado potrerosSinEtapa={kpis.potrerosSinEtapa} fueraDeFincaActiva={fueraDeFincaActiva} />

          {pendientes > 0 && (
            <Link
              to="/ganado/movimientos"
              className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 hover:bg-amber-100 transition-colors"
            >
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <span className="text-sm text-amber-800">
                Hay <strong>{pendientes}</strong> {pendientes === 1 ? 'movimiento pendiente' : 'movimientos pendientes'}{' '}
                de confirmar en inventario
              </span>
            </Link>
          )}
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <KPICard
            label="Total Cabezas"
            value={formatNumber(kpis.totalCabezas)}
            sub={`${formatNumber(kpis.totalNovillos)} novillos · ${formatNumber(kpis.totalToros)} toros`}
          />
          <KPICard
            label="Carga animal"
            value={kpis.cabezasPorHa != null ? `${formatNumber(kpis.cabezasPorHa, 1)}` : '—'}
            sub={kpis.cabezasPorHa != null ? 'cabezas/ha' : 'Configura hectáreas en fincas'}
          />
          <KPICard
            label="Sin clasificar"
            value={formatNumber(kpis.potrerosSinEtapa.cabezas)}
            sub={`${formatNumber(kpis.potrerosSinEtapa.potreros)} ${kpis.potrerosSinEtapa.potreros === 1 ? 'potrero' : 'potreros'}`}
          />
          <div className="rounded-xl border border-primary/10 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-brand-brown/60 uppercase tracking-wide mb-1">Variación 30 días</p>
            {variacion ? (
              <>
                <p className={`text-2xl font-bold ${variacion.neto >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {variacion.neto >= 0 ? '+' : ''}
                  {formatNumber(variacion.neto)}
                </p>
                <div className="flex items-center gap-3 mt-1 text-xs text-brand-brown/60">
                  <span className="flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-green-600" />
                    {formatNumber(variacion.entradas)} entradas
                  </span>
                  <span className="flex items-center gap-1">
                    <TrendingDown className="w-3 h-3 text-red-500" />
                    {formatNumber(variacion.salidas)} salidas
                  </span>
                </div>
              </>
            ) : (
              <p className="text-2xl font-bold text-foreground">—</p>
            )}
          </div>
        </div>

        {/* Distribución por etapa */}
        <div className="rounded-xl border border-primary/10 bg-white p-4 shadow-sm mb-6">
          <p className="text-xs font-medium text-brand-brown/60 uppercase tracking-wide mb-3">
            Distribución por etapa productiva
          </p>
          <BarraEtapa porEtapa={kpis.porEtapa} total={kpis.totalCabezas} className="mb-3" />
          <ChipsEtapa porEtapa={kpis.porEtapa} />
        </div>

        {/* Cabezas/ha por ubicación */}
        {kpis.porUbicacion.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {kpis.porUbicacion.map((u) => (
              <KPICard
                key={u.ubicacion}
                label={u.ubicacion}
                value={`${formatNumber(u.cabezas)} cabezas`}
                sub={
                  u.cabezasPorHa != null
                    ? `${formatNumber(u.cabezasPorHa, 1)} cabezas/ha · ${formatNumber(u.hectareas, 1)} ha`
                    // Sin hectáreas cargadas no se dice "0,0 ha": 0 es un área,
                    // y acá el dato no existe. Misma regla que el KPI de carga.
                    : 'Sin hectáreas registradas'
                }
              />
            ))}
          </div>
        )}

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <select
            value={ubicacionFilter}
            onChange={(e) => {
              setUbicacionFilter(e.target.value);
              setFincaFilter('');
              setLoteFilter('');
            }}
            className={selectClass}
            aria-label="Ubicación"
          >
            <option value="">Todas las ubicaciones</option>
            {ubicaciones.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </select>
          <select
            value={fincaFilter}
            onChange={(e) => {
              setFincaFilter(e.target.value);
              setLoteFilter('');
            }}
            className={selectClass}
            aria-label="Finca"
          >
            <option value="">Todas las fincas</option>
            {fincasFiltradas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nombre}
              </option>
            ))}
          </select>
          <select value={loteFilter} onChange={(e) => setLoteFilter(e.target.value)} className={selectClass} aria-label="Lote">
            <option value="">Todos los lotes</option>
            {lotesFiltrados.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nombre}
              </option>
            ))}
          </select>
          <select
            value={etapaFilter}
            onChange={(e) => setEtapaFilter(e.target.value as EtapaBucket | '')}
            className={selectClass}
            aria-label="Etapa"
          >
            <option value="">Todas las etapas</option>
            {ORDEN_ETAPAS.map((etapa) => (
              <option key={etapa} value={etapa}>
                {ETIQUETA_ETAPA[etapa]}
              </option>
            ))}
          </select>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-brand-brown/40 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              type="search"
              value={busquedaPotrero}
              onChange={(e) => setBusquedaPotrero(e.target.value)}
              placeholder="Buscar potrero…"
              aria-label="Buscar potrero"
              className="pl-8 h-9 w-44"
            />
          </div>
        </div>

        {/* Árbol de inventario */}
        <InventarioArbol
          ubicaciones={arbol}
          loading={cargando}
          onCambiarEtapa={canWrite ? cambiarEtapaPotrero : undefined}
        />
        </>
        )}

        <AjusteMasivoDialog open={showAjusteMasivo} onOpenChange={setShowAjusteMasivo} rows={rows} onSuccess={loadData} />

        <InventarioInicialDialog
          open={showInventarioInicial}
          onOpenChange={setShowInventarioInicial}
          fincas={fincas}
          ubicaciones={ubicaciones}
          rows={rows}
          onSuccess={loadData}
        />
      </div>
    </div>
  );
}
