import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useGanadoInventario } from './hooks/useGanadoInventario';
import { GanadoSubNav } from './GanadoSubNav';
import { MovimientoFormDialog } from './components/MovimientoFormDialog';
import { ConfirmarPendienteDialog } from './components/ConfirmarPendienteDialog';
import { cabezasDePendiente } from '@/utils/calculosGanado';
import { formatNumber } from '@/utils/format';
import { formatearFecha } from '@/utils/fechas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Loader2, AlertTriangle, X } from 'lucide-react';
import { toast } from 'sonner';
import type { GanFinca, GanPotrero, GanMovimiento, MovimientoConContexto } from '@/types/ganado';

const selectClass = 'px-2 py-1.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary min-w-0';

const TIPO_LABELS: Record<string, string> = {
  compra: 'Compra',
  venta: 'Venta',
  muerte: 'Muerte',
  traslado_entrada: 'Traslado (entrada)',
  traslado_salida: 'Traslado (salida)',
  ajuste: 'Ajuste',
};

const TIPO_BADGE: Record<string, string> = {
  compra: 'bg-green-100 text-green-800',
  venta: 'bg-blue-100 text-blue-800',
  muerte: 'bg-red-100 text-red-700',
  traslado_entrada: 'bg-purple-100 text-purple-700',
  traslado_salida: 'bg-purple-100 text-purple-700',
  ajuste: 'bg-gray-100 text-gray-700',
};

export function GanadoMovimientos() {
  const { profile } = useAuth();
  const canWrite = profile?.rol === 'Administrador' || profile?.rol === 'Gerencia';

  const { fetchEstructura, fetchMovimientos, fetchPendientes, descartarPendiente, loading } = useGanadoInventario();

  const [movimientos, setMovimientos] = useState<MovimientoConContexto[]>([]);
  const [pendientes, setPendientes] = useState<GanMovimiento[]>([]);
  const [fincas, setFincas] = useState<GanFinca[]>([]);
  const [potreros, setPotreros] = useState<GanPotrero[]>([]);
  const [tipoFilter, setTipoFilter] = useState('');
  const [fincaFilter, setFincaFilter] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [pendienteSeleccionado, setPendienteSeleccionado] = useState<GanMovimiento | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [movs, pend, estructura] = await Promise.all([
        fetchMovimientos({
          tipo: tipoFilter || undefined,
          fincaId: fincaFilter || undefined,
          fechaDesde: fechaDesde || undefined,
          fechaHasta: fechaHasta || undefined,
        }),
        fetchPendientes(),
        fetchEstructura(),
      ]);
      setMovimientos(movs.filter((m) => m.estado === 'confirmado'));
      setPendientes(pend);
      setFincas(estructura.fincas);
      setPotreros(estructura.potreros);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      toast.error('Error cargando movimientos: ' + message);
    }
  }, [fetchMovimientos, fetchPendientes, fetchEstructura, tipoFilter, fincaFilter, fechaDesde, fechaHasta]);

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

  const potreroDe = (m: MovimientoConContexto) => {
    if (m.tipo === 'traslado_salida' || m.tipo === 'venta' || m.tipo === 'muerte') {
      return m.potrero_origen ? `${m.potrero_origen} (${m.finca_origen})` : '-';
    }
    return m.potrero_destino ? `${m.potrero_destino} (${m.finca_destino})` : '-';
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-gradient-to-br from-background via-white to-secondary/10 p-4 lg:p-8">
      <div className="max-w-7xl mx-auto w-full">
        <GanadoSubNav />

        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-foreground mb-1">Movimientos de Ganado</h1>
            <p className="text-sm text-brand-brown/70">Log cronológico de eventos del inventario</p>
          </div>
          {canWrite && (
            <Button onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Registrar movimiento
            </Button>
          )}
        </div>

        {/* Pendientes de confirmar */}
        {pendientes.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <h3 className="text-sm font-semibold text-amber-800">
                Pendientes de confirmar ({pendientes.length})
              </h3>
            </div>
            <div className="space-y-2">
              {pendientes.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white border border-amber-200 px-3 py-2">
                  <div className="text-sm">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mr-2 ${TIPO_BADGE[p.tipo] || 'bg-gray-100 text-gray-700'}`}>
                      {TIPO_LABELS[p.tipo] || p.tipo}
                    </span>
                    <strong>{formatNumber(cabezasDePendiente(p))}</strong> cabezas · {formatearFecha(p.fecha)}
                    {p.notas && <span className="text-brand-brown/60 ml-2 hidden sm:inline">{p.notas}</span>}
                  </div>
                  {canWrite && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => setPendienteSeleccionado(p)}>Confirmar</Button>
                      <Button size="sm" variant="outline" onClick={() => handleDescartar(p)} title="Descartar (ya registrado manualmente)">
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <select value={tipoFilter} onChange={(e) => setTipoFilter(e.target.value)} className={selectClass}>
            <option value="">Todos los tipos</option>
            {Object.entries(TIPO_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select value={fincaFilter} onChange={(e) => setFincaFilter(e.target.value)} className={selectClass}>
            <option value="">Todas las fincas</option>
            {fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <Input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className="w-auto" />
            <span className="text-sm text-gray-500">a</span>
            <Input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className="w-auto" />
          </div>
        </div>

        {/* Log de movimientos */}
        <div className="rounded-xl border border-primary/10 bg-white overflow-hidden">
          <div className="overflow-auto" style={{ maxHeight: '36rem' }}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-green-600 text-white">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap">Fecha</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap">Tipo</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap">Potrero</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide whitespace-nowrap">Novillos</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide whitespace-nowrap">Toros</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap">Notas</th>
                </tr>
              </thead>
              <tbody>
                {loading && movimientos.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center">
                      <Loader2 className="w-5 h-5 animate-spin text-primary inline" />
                    </td>
                  </tr>
                ) : movimientos.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-brand-brown/50">
                      Sin movimientos registrados
                    </td>
                  </tr>
                ) : (
                  movimientos.map((m, i) => (
                    <tr key={m.id} className={`border-t border-primary/5 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <td className="px-3 py-2.5 whitespace-nowrap">{formatearFecha(m.fecha)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${TIPO_BADGE[m.tipo] || 'bg-gray-100 text-gray-700'}`}>
                          {TIPO_LABELS[m.tipo] || m.tipo}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{potreroDe(m)}</td>
                      <td className={`px-3 py-2.5 text-right whitespace-nowrap ${m.novillos_delta < 0 ? 'text-red-600' : m.novillos_delta > 0 ? 'text-green-700' : ''}`}>
                        {m.novillos_delta > 0 ? '+' : ''}{formatNumber(m.novillos_delta)}
                      </td>
                      <td className={`px-3 py-2.5 text-right whitespace-nowrap ${m.toros_delta < 0 ? 'text-red-600' : m.toros_delta > 0 ? 'text-green-700' : ''}`}>
                        {m.toros_delta > 0 ? '+' : ''}{formatNumber(m.toros_delta)}
                      </td>
                      <td className="px-3 py-2.5 text-brand-brown/70 max-w-xs truncate" title={m.notas || undefined}>{m.notas || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <MovimientoFormDialog
          open={showForm}
          onOpenChange={setShowForm}
          fincas={fincas}
          potreros={potreros}
          onSuccess={loadData}
        />

        <ConfirmarPendienteDialog
          open={!!pendienteSeleccionado}
          onOpenChange={(open) => { if (!open) setPendienteSeleccionado(null); }}
          movimiento={pendienteSeleccionado}
          fincas={fincas}
          potreros={potreros}
          onSuccess={loadData}
        />
      </div>
    </div>
  );
}
