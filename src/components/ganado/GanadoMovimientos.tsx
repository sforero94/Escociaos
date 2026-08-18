import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useGanadoInventario } from './hooks/useGanadoInventario';
import { GanadoSubNav } from './GanadoSubNav';
import { MovimientoFormDialog } from './components/MovimientoFormDialog';
import { ConfirmarPendienteDialog } from './components/ConfirmarPendienteDialog';
import { MovimientosTabla } from './components/MovimientosTabla';
import { BannerPendientes } from './components/BannerPendientes';
import type { PendienteConValor } from './components/BannerPendientes';
import { ContadorBrechaFinanzas } from './components/ContadorBrechaFinanzas';
import { ErrorCargaGanado } from './components/ErrorCargaGanado';
import { calcularSaldosPorPotrero, agruparMovimientos } from '@/utils/calculosGanado';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import type {
  GanFinca,
  GanLote,
  GanPotrero,
  GanMovimiento,
  MovimientoConContexto,
  MovimientoAgrupado,
  InventarioPotreroRow,
} from '@/types/ganado';

const selectClass =
  'px-2 py-1.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary min-w-0';

const TIPO_FILTRO_OPCIONES: { value: string; label: string }[] = [
  { value: '', label: 'Todos los tipos' },
  { value: 'compra', label: 'Compra' },
  { value: 'venta', label: 'Venta' },
  { value: 'muerte', label: 'Muerte' },
  { value: 'traslado', label: 'Traslado' },
  { value: 'ajuste', label: 'Ajuste' },
];

function tipoDeGrupo(a: MovimientoAgrupado): string {
  switch (a.clase) {
    case 'simple':
      return a.movimiento.tipo === 'traslado_entrada' || a.movimiento.tipo === 'traslado_salida'
        ? 'traslado'
        : a.movimiento.tipo;
    case 'traslado':
      return 'traslado';
    case 'compra_venta':
      return a.tipo;
    case 'conteo_fisico':
      return 'ajuste';
    default:
      return '';
  }
}

function fechaDeGrupo(a: MovimientoAgrupado): string {
  return a.clase === 'simple' ? a.movimiento.fecha : a.fecha;
}

function fincasDeGrupo(a: MovimientoAgrupado): string[] {
  switch (a.clase) {
    case 'simple':
      return [a.movimiento.finca_origen, a.movimiento.finca_destino].filter((x): x is string => !!x);
    case 'traslado':
      return [...a.origenes, ...a.destinos].map((p) => p.finca);
    case 'compra_venta':
    case 'conteo_fisico':
      return a.puntas.map((p) => p.finca);
    default:
      return [];
  }
}

function lotesDeGrupo(a: MovimientoAgrupado): string[] {
  switch (a.clase) {
    case 'simple':
      return [a.movimiento.lote_origen, a.movimiento.lote_destino].filter((x): x is string => !!x);
    case 'traslado':
      return [...a.origenes, ...a.destinos].map((p) => p.lote).filter((x): x is string => !!x);
    case 'compra_venta':
    case 'conteo_fisico':
      return a.puntas.map((p) => p.lote).filter((x): x is string => !!x);
    default:
      return [];
  }
}

export function GanadoMovimientos() {
  const { profile } = useAuth();
  const canWrite = profile?.rol === 'Administrador' || profile?.rol === 'Gerencia';
  // Fail closed: durante la ventana en que AuthContext no tiene perfil aún,
  // no se muestra plata (R-4) — mismo criterio que la finca de columna en
  // /finanzas/reportes.
  const canVerPlata = profile?.rol === 'Gerencia' || profile?.rol === 'Administrador';

  const {
    fetchEstructura,
    fetchMovimientos,
    fetchPendientes,
    fetchInventario,
    descartarPendiente,
  } = useGanadoInventario();

  const [movimientos, setMovimientos] = useState<MovimientoConContexto[]>([]);
  const [pendientes, setPendientes] = useState<PendienteConValor[]>([]);
  const [fincas, setFincas] = useState<GanFinca[]>([]);
  const [lotes, setLotes] = useState<GanLote[]>([]);
  const [potreros, setPotreros] = useState<GanPotrero[]>([]);
  const [inventario, setInventario] = useState<InventarioPotreroRow[]>([]);

  const [tipoFilter, setTipoFilter] = useState('');
  const [fincaFilter, setFincaFilter] = useState('');
  const [loteFilter, setLoteFilter] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [pendienteSeleccionado, setPendienteSeleccionado] = useState<GanMovimiento | null>(null);

  // Estado de carga propio de la página — igual que en GanadoDashboard.tsx,
  // separado del `loading` compartido del hook. Una lectura fallida (p.ej.
  // columnas nuevas sin migrar) no puede renderizar "Sin movimientos que
  // coincidan con los filtros": eso dice "no hay nada que mostrar", cuando
  // lo real es "no sabemos qué hay".
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setCargando(true);
    try {
      // Historia confirmada COMPLETA, sin filtros de fecha/tipo/finca en la
      // consulta: el saldo por potrero (R-6) se calcula sobre el total y
      // los filtros de la pantalla solo deciden qué filas se ven, nunca qué
      // dice la columna Saldo.
      const [movs, pend, estructura, inv] = await Promise.all([
        fetchMovimientos({}),
        fetchPendientes(),
        fetchEstructura(),
        fetchInventario(),
      ]);
      setMovimientos((movs as MovimientoConContexto[]).filter((m) => m.estado === 'confirmado'));
      setPendientes(pend as PendienteConValor[]);
      setFincas(estructura.fincas);
      setLotes(estructura.lotes);
      setPotreros(estructura.potreros);
      setInventario(inv);
      setErrorCarga(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      setErrorCarga(message);
      toast.error('Error cargando movimientos: ' + message);
    } finally {
      setCargando(false);
    }
  }, [fetchMovimientos, fetchPendientes, fetchEstructura, fetchInventario]);

  // Cabezas disponibles por potrero: los diálogos las usan para avisar antes
  // de que el CHECK de gan_inventario rechace una salida sin existencias.
  const existencias = useMemo(() => {
    const map: Record<string, { novillos: number; toros: number }> = {};
    inventario.forEach((r) => {
      map[r.potrero_id] = { novillos: r.novillos, toros: r.toros };
    });
    return map;
  }, [inventario]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDescartar = async (m: GanMovimiento) => {
    try {
      await descartarPendiente(m.id);
      toast.success('Movimiento pendiente descartado');
      loadData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      toast.error('Error descartando: ' + message);
    }
  };

  // Saldo por potrero sobre la historia COMPLETA (R-6) — se calcula una sola
  // vez por carga de datos, antes de aplicar cualquier filtro de pantalla.
  const agrupadosCompletos = useMemo(() => {
    const snapshot: Record<string, number> = {};
    inventario.forEach((r) => {
      snapshot[r.potrero_id] = r.novillos + r.toros;
    });
    const saldos = calcularSaldosPorPotrero(movimientos, snapshot);
    return agruparMovimientos(movimientos, saldos);
  }, [movimientos, inventario]);

  const lotesFiltrados = useMemo(
    () => lotes.filter((l) => !fincaFilter || fincas.find((f) => f.nombre === fincaFilter)?.id === l.finca_id),
    [lotes, fincas, fincaFilter]
  );

  const agrupadosFiltrados = useMemo(
    () =>
      agrupadosCompletos.filter((a) => {
        const fecha = fechaDeGrupo(a);
        if (fechaDesde && fecha < fechaDesde) return false;
        if (fechaHasta && fecha > fechaHasta) return false;
        if (tipoFilter && tipoDeGrupo(a) !== tipoFilter) return false;
        if (fincaFilter && !fincasDeGrupo(a).includes(fincaFilter)) return false;
        if (loteFilter && !lotesDeGrupo(a).includes(loteFilter)) return false;
        return true;
      }),
    [agrupadosCompletos, fechaDesde, fechaHasta, tipoFilter, fincaFilter, loteFilter]
  );

  return (
    <div className="min-h-screen min-h-[100dvh] bg-gradient-to-br from-background via-white to-secondary/10 p-4 lg:p-8">
      <div className="max-w-7xl mx-auto w-full">
        <GanadoSubNav />

        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-foreground mb-1">Movimientos de Ganado</h1>
            <p className="text-sm text-brand-brown/70">Compras, ventas, traslados y ajustes</p>
          </div>
          {canWrite && (
            <Button
              onClick={() => setShowForm(true)}
              disabled={!!errorCarga}
              title={errorCarga ? 'No disponible mientras los movimientos no se puedan leer' : undefined}
            >
              <Plus className="w-4 h-4 mr-2" />
              Registrar movimiento
            </Button>
          )}
        </div>

        {errorCarga ? (
          <ErrorCargaGanado
            titulo="No se pudo leer los movimientos"
            mensaje={errorCarga}
            onReintentar={loadData}
          />
        ) : (
        <>
        <div className="mb-6 space-y-2">
          <BannerPendientes
            pendientes={pendientes}
            canWrite={canWrite}
            canVerPlata={canVerPlata}
            onConfirmar={(m) => setPendienteSeleccionado(m)}
            onDescartar={handleDescartar}
          />
          <ContadorBrechaFinanzas />
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <select value={tipoFilter} onChange={(e) => setTipoFilter(e.target.value)} className={selectClass} aria-label="Tipo">
            {TIPO_FILTRO_OPCIONES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
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
            {fincas.map((f) => (
              <option key={f.id} value={f.nombre}>
                {f.nombre}
              </option>
            ))}
          </select>
          <select value={loteFilter} onChange={(e) => setLoteFilter(e.target.value)} className={selectClass} aria-label="Lote">
            <option value="">Todos los lotes</option>
            {lotesFiltrados.map((l) => (
              <option key={l.id} value={l.nombre}>
                {l.nombre}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1.5">
            <label htmlFor="ganado-fecha-desde" className="text-sm text-gray-500">
              Desde
            </label>
            <Input id="ganado-fecha-desde" type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className="w-auto" />
          </div>
          <div className="flex items-center gap-1.5">
            <label htmlFor="ganado-fecha-hasta" className="text-sm text-gray-500">
              Hasta
            </label>
            <Input id="ganado-fecha-hasta" type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className="w-auto" />
          </div>
        </div>

        <MovimientosTabla agrupados={agrupadosFiltrados} canVerPlata={canVerPlata} loading={cargando} />
        </>
        )}

        <MovimientoFormDialog
          open={showForm}
          onOpenChange={setShowForm}
          fincas={fincas}
          lotes={lotes}
          potreros={potreros}
          existencias={existencias}
          onSuccess={loadData}
        />

        <ConfirmarPendienteDialog
          open={!!pendienteSeleccionado}
          onOpenChange={(open) => {
            if (!open) setPendienteSeleccionado(null);
          }}
          movimiento={pendienteSeleccionado}
          fincas={fincas}
          lotes={lotes}
          potreros={potreros}
          existencias={existencias}
          onSuccess={loadData}
        />
      </div>
    </div>
  );
}
