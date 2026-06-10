import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useGanadoInventario } from './hooks/useGanadoInventario';
import { GanadoSubNav } from './GanadoSubNav';
import { AjusteMasivoDialog } from './components/AjusteMasivoDialog';
import { calcularKPIsInventario, calcularVariacion, cabezasPorHaFinca } from '@/utils/calculosGanado';
import { formatNumber } from '@/utils/format';
import { Button } from '@/components/ui/button';
import { AlertTriangle, SlidersHorizontal, Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';
import type { InventarioPotreroRow, GanUbicacion, GanFinca, VariacionInventario } from '@/types/ganado';

const selectClass = 'px-2 py-1.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary min-w-0';

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

  const { fetchEstructura, fetchInventario, fetchMovimientos, countPendientes, loading } = useGanadoInventario();

  const [rows, setRows] = useState<InventarioPotreroRow[]>([]);
  const [ubicaciones, setUbicaciones] = useState<GanUbicacion[]>([]);
  const [fincas, setFincas] = useState<GanFinca[]>([]);
  const [pendientes, setPendientes] = useState(0);
  const [variacion, setVariacion] = useState<VariacionInventario | null>(null);
  const [ubicacionFilter, setUbicacionFilter] = useState('');
  const [fincaFilter, setFincaFilter] = useState('');
  const [potreroFilter, setPotreroFilter] = useState('');
  const [showAjusteMasivo, setShowAjusteMasivo] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const hace30 = new Date();
      hace30.setDate(hace30.getDate() - 30);
      const fechaDesde = hace30.toISOString().split('T')[0];

      const [inv, estructura, pend, movs] = await Promise.all([
        fetchInventario(),
        fetchEstructura(),
        countPendientes(),
        fetchMovimientos({ fechaDesde }),
      ]);
      setRows(inv);
      setUbicaciones(estructura.ubicaciones);
      setFincas(estructura.fincas);
      setPendientes(pend);
      setVariacion(calcularVariacion(movs, fechaDesde));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      toast.error('Error cargando inventario: ' + message);
    }
  }, [fetchInventario, fetchEstructura, countPendientes, fetchMovimientos]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const fincasFiltradas = useMemo(
    () => fincas.filter((f) => !ubicacionFilter || f.ubicacion_id === ubicacionFilter),
    [fincas, ubicacionFilter]
  );

  const rowsFiltradas = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!ubicacionFilter || r.ubicacion_id === ubicacionFilter) &&
          (!fincaFilter || r.finca_id === fincaFilter) &&
          (!potreroFilter || r.potrero_id === potreroFilter)
      ),
    [rows, ubicacionFilter, fincaFilter, potreroFilter]
  );

  const kpis = useMemo(() => calcularKPIsInventario(rowsFiltradas), [rowsFiltradas]);

  return (
    <div className="min-h-screen min-h-[100dvh] bg-gradient-to-br from-background via-white to-secondary/10 p-4 lg:p-8">
      <div className="max-w-7xl mx-auto w-full">
        <GanadoSubNav />

        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-foreground mb-1">Inventario de Ganado</h1>
            <p className="text-sm text-brand-brown/70">Cabezas por ubicación, finca y potrero</p>
          </div>
          {canWrite && (
            <Button variant="outline" onClick={() => setShowAjusteMasivo(true)}>
              <SlidersHorizontal className="w-4 h-4 mr-2" />
              Ajuste masivo
            </Button>
          )}
        </div>

        {pendientes > 0 && (
          <Link
            to="/ganado/movimientos"
            className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 mb-6 hover:bg-amber-100 transition-colors"
          >
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <span className="text-sm text-amber-800">
              Hay <strong>{pendientes}</strong> {pendientes === 1 ? 'movimiento pendiente' : 'movimientos pendientes'} de confirmar en inventario
            </span>
          </Link>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KPICard
            label="Total Cabezas"
            value={formatNumber(kpis.totalCabezas)}
            sub={kpis.cabezasPorHa != null ? `${formatNumber(kpis.cabezasPorHa, 1)} cabezas/ha` : 'Configura hectáreas en fincas'}
          />
          <KPICard label="Novillos" value={formatNumber(kpis.totalNovillos)} />
          <KPICard label="Toros" value={formatNumber(kpis.totalToros)} />
          <div className="rounded-xl border border-primary/10 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-brand-brown/60 uppercase tracking-wide mb-1">Variación 30 días</p>
            {variacion ? (
              <>
                <p className={`text-2xl font-bold ${variacion.neto >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {variacion.neto >= 0 ? '+' : ''}{formatNumber(variacion.neto)}
                </p>
                <div className="flex items-center gap-3 mt-1 text-xs text-brand-brown/60">
                  <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3 text-green-600" />{formatNumber(variacion.entradas)} entradas</span>
                  <span className="flex items-center gap-1"><TrendingDown className="w-3 h-3 text-red-500" />{formatNumber(variacion.salidas)} salidas</span>
                </div>
              </>
            ) : (
              <p className="text-2xl font-bold text-foreground">-</p>
            )}
          </div>
        </div>

        {/* Cabezas/ha por ubicación */}
        {kpis.porUbicacion.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {kpis.porUbicacion.map((u) => (
              <KPICard
                key={u.ubicacion}
                label={u.ubicacion}
                value={`${formatNumber(u.cabezas)} cabezas`}
                sub={u.cabezasPorHa != null ? `${formatNumber(u.cabezasPorHa, 1)} cabezas/ha · ${formatNumber(u.hectareas, 1)} ha` : `${formatNumber(u.hectareas, 1)} ha`}
              />
            ))}
          </div>
        )}

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <select
            value={ubicacionFilter}
            onChange={(e) => { setUbicacionFilter(e.target.value); setFincaFilter(''); setPotreroFilter(''); }}
            className={selectClass}
          >
            <option value="">Todas las ubicaciones</option>
            {ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
          <select
            value={fincaFilter}
            onChange={(e) => { setFincaFilter(e.target.value); setPotreroFilter(''); }}
            className={selectClass}
          >
            <option value="">Todas las fincas</option>
            {fincasFiltradas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
          </select>
          <select value={potreroFilter} onChange={(e) => setPotreroFilter(e.target.value)} className={selectClass}>
            <option value="">Todos los potreros</option>
            {rowsFiltradas.map((r) => <option key={r.potrero_id} value={r.potrero_id}>{r.potrero}</option>)}
          </select>
        </div>

        {/* Tabla de inventario */}
        <div className="rounded-xl border border-primary/10 bg-white overflow-hidden">
          <div className="overflow-auto" style={{ maxHeight: '32rem' }}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-green-600 text-white">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap">Potrero</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap">Finca</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap">Ubicación</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide whitespace-nowrap">Novillos</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide whitespace-nowrap">Toros</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide whitespace-nowrap">Total</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide whitespace-nowrap">Cabezas/Ha</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide whitespace-nowrap">Peso Prom.</th>
                </tr>
              </thead>
              <tbody>
                {loading && rowsFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center">
                      <Loader2 className="w-5 h-5 animate-spin text-primary inline" />
                    </td>
                  </tr>
                ) : rowsFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-sm text-brand-brown/50">
                      Sin potreros configurados. Crea ubicaciones, fincas y potreros desde Configuración.
                    </td>
                  </tr>
                ) : (
                  rowsFiltradas.map((r, i) => {
                    const porHa = cabezasPorHaFinca(rows, r.finca_id);
                    return (
                      <tr key={r.potrero_id} className={`border-t border-primary/5 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                        <td className="px-3 py-2.5 whitespace-nowrap font-medium">{r.potrero}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">{r.finca}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">{r.ubicacion}</td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">{formatNumber(r.novillos)}</td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">{formatNumber(r.toros)}</td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap font-medium">{formatNumber(r.novillos + r.toros)}</td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">{porHa != null ? formatNumber(porHa, 1) : '-'}</td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">{r.peso_promedio_kg != null ? `${formatNumber(r.peso_promedio_kg)} kg` : '-'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <AjusteMasivoDialog
          open={showAjusteMasivo}
          onOpenChange={setShowAjusteMasivo}
          rows={rows}
          onSuccess={loadData}
        />
      </div>
    </div>
  );
}
